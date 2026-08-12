package agent

import (
	"bytes"
	"context"
	"fmt"
	"sort"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationCapabilityProbeAdmissionArchiveRecordFormat = "prodivix.agent-evaluation-capability-probe-admission-archive-record"
	evaluationCapabilityProbeReferenceArchiveRecordFormat = "prodivix.agent-evaluation-capability-probe-reference-receipt-archive-record"
	evaluationCapabilityProbeArchiveRecordVersion         = 1

	maximumEvaluationCapabilityProbeAdmissionArchiveRecordBytes = maximumEvaluationCapabilityProbeRequestBytes + maximumEvaluationCapabilityProbeReferenceBytes +
		maximumEvaluationCapabilityProbeResponseBytes + 8_192
	maximumEvaluationCapabilityProbeReferenceArchiveRecordBytes  = maximumEvaluationCapabilityProbeReferenceReceiptBytes + 2_048
	maximumEvaluationCapabilityProbeAdmissionWrapperArchiveBytes = maximumEvaluationCapabilityProbeAdmissions * int64(maximumEvaluationCapabilityProbeAdmissionArchiveRecordBytes)
	maximumEvaluationCapabilityProbeReferenceWrapperArchiveBytes = maximumEvaluationCapabilityProbeAdmissions *
		(int64(maximumEvaluationCapabilityProbeReferenceBytes) + int64(len(evaluationCapabilityProbeReferenceKinds))*2_048)
)

type EvaluationCapabilityProbeAdmissionArchiveRecord struct {
	RequestDigest          string
	StageDigest            string
	DispatchAckDigest      string
	AdmissionReceiptDigest string
	RecordDigest           string
	RecordBytes            []byte
}

type EvaluationCapabilityProbeReferenceArchiveRecord struct {
	AdmissionRequestDigest string
	Ordinal                int64
	Kind                   string
	ReceiptDigest          string
	RecordDigest           string
	RecordBytes            []byte
}

func evaluationCapabilityProbeArchiveCanonicalRecord(
	base map[string]any,
	maximumBytes int,
) (string, []byte, error) {
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return "", nil, err
	}
	value := cloneEvaluationObject(base)
	value["recordDigest"] = digest
	encoded, err := canonicaljson.Bytes(value)
	if err != nil || len(encoded) < 1 || len(encoded) > maximumBytes {
		return "", nil, conflict("evaluation capability probe archive record exceeds its exact byte bound")
	}
	return digest, encoded, nil
}

func queryEvaluationCapabilityProbeAdmissionArchiveRecords(
	ctx context.Context,
	queryer evaluationReadQueryer,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationCapabilityProbeAdmissionArchiveRecord, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT admission.state,admission.request_digest,
		admission.owner_implementation_digest,admission.stage_digest,admission.dispatch_ack_digest,
		admission.reference_receipt_set_digest,admission.admission_receipt_digest,admission.response_digest,
		admission.request_bytes,admission.reference_bundle_bytes,admission.response_bytes
		FROM agent_evaluation_plan_capability_probe_admission_links link
		JOIN agent_evaluation_capability_probe_admissions admission
			ON admission.namespace_id=link.namespace_id
			AND admission.repository_commit=link.repository_commit
			AND admission.request_digest=link.request_digest
		WHERE link.namespace_id=$1 AND link.plan_digest=$2 AND link.repository_commit=$3
		ORDER BY admission.request_digest COLLATE "C" ASC`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationCapabilityProbeAdmissionArchiveRecord, 0, maximumEvaluationCapabilityProbeAdmissions)
	seen := make(map[string]struct{}, maximumEvaluationCapabilityProbeAdmissions)
	var totalBytes int64
	for rows.Next() {
		var state, ownerImplementationDigest, referenceReceiptSetDigest, responseDigest string
		var requestBytes, referenceBundleBytes, responseBytes []byte
		var record EvaluationCapabilityProbeAdmissionArchiveRecord
		if err := rows.Scan(&state, &record.RequestDigest, &ownerImplementationDigest,
			&record.StageDigest, &record.DispatchAckDigest, &referenceReceiptSetDigest,
			&record.AdmissionReceiptDigest, &responseDigest, &requestBytes, &referenceBundleBytes,
			&responseBytes); err != nil {
			return nil, err
		}
		if state != "sealed" || !evaluationDigestPattern.MatchString(record.RequestDigest) ||
			!evaluationDigestPattern.MatchString(ownerImplementationDigest) ||
			!evaluationDigestPattern.MatchString(record.StageDigest) ||
			!evaluationDigestPattern.MatchString(record.DispatchAckDigest) ||
			!evaluationDigestPattern.MatchString(referenceReceiptSetDigest) ||
			!evaluationDigestPattern.MatchString(record.AdmissionReceiptDigest) ||
			!evaluationDigestPattern.MatchString(responseDigest) {
			return nil, ErrConflict
		}
		if _, exists := seen[record.RequestDigest]; exists {
			return nil, conflict("evaluation capability probe admission archive contains a duplicate request")
		}
		request, err := decodeEvaluationCapabilityProbeAdmissionRequest(requestBytes, authority)
		response, responseErr := decodeCanonicalEvaluationObject(responseBytes, maximumEvaluationCapabilityProbeResponseBytes)
		referenceValues, referenceErr := decodeEvaluationCapabilityProbeReferenceValues(referenceBundleBytes)
		evidence, evidenceOK := objectMember(response, "probeEvidence")
		if err != nil || responseErr != nil || referenceErr != nil || !evidenceOK ||
			request.RepositoryCommit != partition.RepositoryCommit || request.RequestDigest != record.RequestDigest ||
			validateEvaluationCapabilityProbeAdmissionResponse(
				responseBytes, request, ownerImplementationDigest, record.StageDigest, record.DispatchAckDigest,
			) != nil || stringMember(response, "admissionReceiptDigest") != record.AdmissionReceiptDigest {
			return nil, ErrConflict
		}
		computedResponseDigest, err := canonicaljson.Digest(response)
		if err != nil || computedResponseDigest != responseDigest {
			return nil, ErrConflict
		}
		computedBundleBytes, computedReferenceRoot, err := evaluationCapabilityProbeReferenceBundle(
			referenceBundleBytes, evidence, request, ownerImplementationDigest,
		)
		if err != nil || !bytes.Equal(computedBundleBytes, referenceBundleBytes) ||
			computedReferenceRoot != referenceReceiptSetDigest {
			return nil, ErrConflict
		}
		base := map[string]any{
			"format":        evaluationCapabilityProbeAdmissionArchiveRecordFormat,
			"version":       int64(evaluationCapabilityProbeArchiveRecordVersion),
			"requestDigest": record.RequestDigest, "stageDigest": record.StageDigest,
			"dispatchAckDigest":      record.DispatchAckDigest,
			"admissionReceiptDigest": record.AdmissionReceiptDigest,
			"request":                request.Value, "referenceBundle": referenceValues, "response": response,
		}
		record.RecordDigest, record.RecordBytes, err = evaluationCapabilityProbeArchiveCanonicalRecord(
			base, maximumEvaluationCapabilityProbeAdmissionArchiveRecordBytes,
		)
		if err != nil {
			return nil, err
		}
		totalBytes += int64(len(record.RecordBytes))
		if len(records) >= int(maximumEvaluationCapabilityProbeAdmissions) ||
			totalBytes > maximumEvaluationCapabilityProbeAdmissionWrapperArchiveBytes {
			return nil, conflict("evaluation capability probe admission archive exceeds its exact bound")
		}
		seen[record.RequestDigest] = struct{}{}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if int64(len(records)) != maximumEvaluationCapabilityProbeAdmissions {
		return nil, conflict("evaluation capability probe admission archive denominator is incomplete")
	}
	return records, nil
}

func queryEvaluationCapabilityProbeReferenceArchiveRecords(
	ctx context.Context,
	queryer evaluationReadQueryer,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationCapabilityProbeReferenceArchiveRecord, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT reference.request_digest,reference.ordinal,
		reference.kind,reference.receipt_digest,reference.receipt_bytes
		FROM agent_evaluation_plan_capability_probe_admission_links link
		JOIN agent_evaluation_capability_probe_reference_receipts reference
			ON reference.namespace_id=link.namespace_id
			AND reference.repository_commit=link.repository_commit
			AND reference.request_digest=link.request_digest
		WHERE link.namespace_id=$1 AND link.plan_digest=$2 AND link.repository_commit=$3
		ORDER BY reference.request_digest COLLATE "C" ASC,reference.ordinal ASC`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationCapabilityProbeReferenceArchiveRecord, 0, maximumEvaluationCapabilityProbeReferences)
	seenOrdinals := make(map[string]int)
	var totalBytes int64
	for rows.Next() {
		var receiptBytes []byte
		var record EvaluationCapabilityProbeReferenceArchiveRecord
		if err := rows.Scan(&record.AdmissionRequestDigest, &record.Ordinal, &record.Kind,
			&record.ReceiptDigest, &receiptBytes); err != nil {
			return nil, err
		}
		expectedOrdinal := seenOrdinals[record.AdmissionRequestDigest]
		if !evaluationDigestPattern.MatchString(record.AdmissionRequestDigest) ||
			record.Ordinal != int64(expectedOrdinal) || expectedOrdinal >= len(evaluationCapabilityProbeReferenceKinds) ||
			record.Kind != evaluationCapabilityProbeReferenceKinds[expectedOrdinal] ||
			!evaluationDigestPattern.MatchString(record.ReceiptDigest) {
			return nil, ErrConflict
		}
		receipt, err := decodeCanonicalEvaluationObject(
			receiptBytes, maximumEvaluationCapabilityProbeReferenceReceiptBytes,
		)
		computedDigest, digestErr := canonicaljson.Digest(receipt)
		if err != nil || digestErr != nil || computedDigest != record.ReceiptDigest ||
			stringMember(receipt, "admissionRequestDigest") != record.AdmissionRequestDigest {
			return nil, ErrConflict
		}
		base := map[string]any{
			"format":                 evaluationCapabilityProbeReferenceArchiveRecordFormat,
			"version":                int64(evaluationCapabilityProbeArchiveRecordVersion),
			"admissionRequestDigest": record.AdmissionRequestDigest,
			"ordinal":                record.Ordinal, "kind": record.Kind,
			"receiptDigest": record.ReceiptDigest, "receipt": receipt,
		}
		record.RecordDigest, record.RecordBytes, err = evaluationCapabilityProbeArchiveCanonicalRecord(
			base, maximumEvaluationCapabilityProbeReferenceArchiveRecordBytes,
		)
		if err != nil {
			return nil, err
		}
		totalBytes += int64(len(record.RecordBytes))
		if len(records) >= int(maximumEvaluationCapabilityProbeReferences) ||
			totalBytes > maximumEvaluationCapabilityProbeReferenceWrapperArchiveBytes {
			return nil, conflict("evaluation capability probe reference archive exceeds its exact bound")
		}
		seenOrdinals[record.AdmissionRequestDigest] = expectedOrdinal + 1
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if int64(len(records)) != maximumEvaluationCapabilityProbeReferences ||
		len(seenOrdinals) != int(maximumEvaluationCapabilityProbeAdmissions) {
		return nil, conflict("evaluation capability probe reference archive denominator is incomplete")
	}
	for requestDigest, count := range seenOrdinals {
		if !evaluationDigestPattern.MatchString(requestDigest) || count != len(evaluationCapabilityProbeReferenceKinds) {
			return nil, conflict("evaluation capability probe reference archive is incomplete")
		}
	}
	return records, nil
}

func (repository *Repository) ListEvaluationCapabilityProbeAdmissionArchiveRecords(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationCapabilityProbeAdmissionArchiveRecord, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return nil, err
	}
	readContext, cancel := evaluationReadContext(ctx)
	defer cancel()
	return queryEvaluationCapabilityProbeAdmissionArchiveRecords(readContext, repository.db, authority, partition)
}

func (repository *Repository) ListEvaluationCapabilityProbeReferenceArchiveRecords(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationCapabilityProbeReferenceArchiveRecord, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return nil, err
	}
	readContext, cancel := evaluationReadContext(ctx)
	defer cancel()
	return queryEvaluationCapabilityProbeReferenceArchiveRecords(readContext, repository.db, authority, partition)
}

func validateEvaluationCapabilityProbeArchiveProjection(
	admissions []EvaluationCapabilityProbeAdmissionArchiveRecord,
	references []EvaluationCapabilityProbeReferenceArchiveRecord,
) error {
	if int64(len(admissions)) != maximumEvaluationCapabilityProbeAdmissions ||
		int64(len(references)) != maximumEvaluationCapabilityProbeReferences {
		return ErrConflict
	}
	admissionRequests := make(map[string]struct{}, len(admissions))
	var admissionBytes, referenceBytes int64
	for _, record := range admissions {
		value, err := decodeCanonicalEvaluationObject(record.RecordBytes, maximumEvaluationCapabilityProbeAdmissionArchiveRecordBytes)
		base := cloneEvaluationObject(value)
		delete(base, "recordDigest")
		digest, digestErr := canonicaljson.Digest(base)
		if err != nil || digestErr != nil || digest != record.RecordDigest ||
			stringMember(value, "recordDigest") != record.RecordDigest ||
			stringMember(value, "requestDigest") != record.RequestDigest {
			return ErrConflict
		}
		if _, exists := admissionRequests[record.RequestDigest]; exists {
			return ErrConflict
		}
		admissionRequests[record.RequestDigest] = struct{}{}
		admissionBytes += int64(len(record.RecordBytes))
	}
	counts := make(map[string]int, len(admissionRequests))
	for _, record := range references {
		value, err := decodeCanonicalEvaluationObject(record.RecordBytes, maximumEvaluationCapabilityProbeReferenceArchiveRecordBytes)
		base := cloneEvaluationObject(value)
		delete(base, "recordDigest")
		digest, digestErr := canonicaljson.Digest(base)
		if err != nil || digestErr != nil || digest != record.RecordDigest ||
			stringMember(value, "recordDigest") != record.RecordDigest ||
			stringMember(value, "admissionRequestDigest") != record.AdmissionRequestDigest {
			return ErrConflict
		}
		if _, exists := admissionRequests[record.AdmissionRequestDigest]; !exists ||
			counts[record.AdmissionRequestDigest] != int(record.Ordinal) {
			return ErrConflict
		}
		counts[record.AdmissionRequestDigest]++
		referenceBytes += int64(len(record.RecordBytes))
	}
	if admissionBytes > maximumEvaluationCapabilityProbeAdmissionWrapperArchiveBytes ||
		referenceBytes > maximumEvaluationCapabilityProbeReferenceWrapperArchiveBytes {
		return ErrConflict
	}
	for requestDigest := range admissionRequests {
		if counts[requestDigest] != len(evaluationCapabilityProbeReferenceKinds) {
			return fmt.Errorf("%w: capability probe reference denominator is incomplete", ErrConflict)
		}
	}
	return nil
}

func validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveCapacity(
	recordCount int64,
	totalBytes int64,
) error {
	if (recordCount != 0 && recordCount != maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords) ||
		totalBytes < 0 || totalBytes > maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamilyBytes {
		return conflict("evaluation hosted retrieval runtime resource cleanup archive cardinality or capacity is invalid")
	}
	return nil
}

func evaluationHostedRetrievalRuntimeResourceCleanupArchivePlanCount(plan evaluationPlanFact) (int64, error) {
	rawTargets, ok := plan.Value["capabilityQualificationTargets"].([]any)
	if !ok {
		return 0, conflict("evaluation hosted retrieval runtime resource cleanup archive plan has no qualification targets")
	}
	expectedIdentities := map[string]struct{}{
		"openai-responses\x00g4-provider-hosted-retrieval-core":        {},
		"openai-responses\x00g4-provider-hosted-retrieval-document":    {},
		"gemini-interactions\x00g4-provider-hosted-retrieval-core":     {},
		"gemini-interactions\x00g4-provider-hosted-retrieval-document": {},
	}
	identities := make(map[string]struct{}, maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords)
	for _, rawTarget := range rawTargets {
		target, targetOK := rawTarget.(map[string]any)
		authority, authorityOK := objectMember(target, "optionalCapabilitySupportAuthority")
		runtimeAuthority, runtimeOK := objectMember(authority, "runtimeFactSourceAuthority")
		if !targetOK || !authorityOK || !runtimeOK {
			continue
		}
		intentDigest := stringMember(runtimeAuthority, "hostedRetrievalRuntimeResourceRegistrationIntentDigest")
		if intentDigest == "" {
			continue
		}
		protocolFamily := stringMember(target, "protocolFamily")
		profileID := stringMember(target, "capabilityProfileId")
		if stringMember(authority, "capabilityId") != "provider.hosted-retrieval" ||
			stringMember(runtimeAuthority, "capabilityId") != "provider.hosted-retrieval" ||
			stringMember(runtimeAuthority, "protocolFamily") != protocolFamily ||
			stringMember(runtimeAuthority, "capabilityProfileId") != profileID ||
			!oneOfString(protocolFamily, "openai-responses", "gemini-interactions") ||
			!oneOfString(profileID, "g4-provider-hosted-retrieval-core", "g4-provider-hosted-retrieval-document") ||
			!evaluationDigestPattern.MatchString(intentDigest) {
			return 0, conflict("evaluation hosted retrieval runtime resource registration intent drifted from the frozen plan")
		}
		identity := protocolFamily + "\x00" + profileID
		if _, expected := expectedIdentities[identity]; !expected {
			return 0, conflict("evaluation hosted retrieval runtime resource registration intent identity is foreign")
		}
		if _, duplicate := identities[identity]; duplicate {
			return 0, conflict("evaluation hosted retrieval runtime resource registration intent is duplicated")
		}
		identities[identity] = struct{}{}
	}
	count := int64(len(identities))
	if count != 0 && count != maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords {
		return 0, conflict("evaluation hosted retrieval runtime resource registration intent set is incomplete")
	}
	if count == maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords {
		for identity := range expectedIdentities {
			if _, exists := identities[identity]; !exists {
				return 0, conflict("evaluation hosted retrieval runtime resource registration intent set is not canonical")
			}
		}
	}
	return count, nil
}

func validateEvaluationHostedRetrievalRuntimeResourceCleanupArchivePlan(
	plan evaluationPlanFact,
	records []EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord,
) error {
	expectedCount, err := evaluationHostedRetrievalRuntimeResourceCleanupArchivePlanCount(plan)
	if err != nil {
		return err
	}
	if int64(len(records)) != expectedCount {
		return conflict("evaluation hosted retrieval runtime resource cleanup archive drifted from the frozen plan")
	}
	var totalBytes int64
	for _, record := range records {
		totalBytes += int64(len(record.RecordBytes))
	}
	return validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveCapacity(int64(len(records)), totalBytes)
}

func evaluationHostedRetrievalRuntimeResourceCleanupArchiveRoot(
	records []EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord,
) (string, error) {
	digests := make([]string, len(records))
	var totalBytes int64
	seen := make(map[string]struct{}, len(records))
	for index, record := range records {
		if !evaluationRepositoryCommitPattern.MatchString(record.RepositoryCommit) ||
			!validEvaluationAgentControlIdentity(record.RuntimeResourceSetID) ||
			!evaluationDigestPattern.MatchString(record.AuthorityDigest) ||
			!evaluationDigestPattern.MatchString(record.RecordDigest) ||
			len(record.RecordBytes) < 1 || len(record.RecordBytes) > maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordBytes {
			return "", ErrConflict
		}
		if _, duplicate := seen[record.RecordDigest]; duplicate {
			return "", conflict("evaluation hosted retrieval runtime resource cleanup archive contains a duplicate record")
		}
		seen[record.RecordDigest] = struct{}{}
		digests[index] = record.RecordDigest
		totalBytes += int64(len(record.RecordBytes))
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveCapacity(int64(len(records)), totalBytes); err != nil {
		return "", err
	}
	sort.Strings(digests)
	return canonicaljson.Digest(map[string]any{"recordDigests": digests})
}

func validateEvaluationCapabilityEffectProviderRuntimeArchiveCapacity(
	recordCount int64,
	totalBytes int64,
) error {
	if recordCount < 0 || recordCount > maximumEvaluationCapabilityEffectProviderRuntimeArchiveRecords ||
		totalBytes < 0 || totalBytes > maximumEvaluationCapabilityEffectProviderRuntimeArchiveFamilyBytes {
		return conflict("evaluation capability effect Provider runtime journal archive exceeds its capacity")
	}
	return nil
}

type evaluationCapabilityEffectProviderRuntimeArchiveSourceBinding struct {
	AttemptID                       string
	TurnIndex                       int64
	OwnerRequestDigest              string
	PreEffectIntentDigest           string
	EffectSourceReceiptDigest       string
	JournalResultRecordDigest       string
	ProviderResultSealReceiptDigest string
}

func decodeEvaluationCapabilityEffectProviderRuntimeArchiveSourceBinding(
	record EvaluationOptionalFactSourceArchiveRecord,
) (evaluationCapabilityEffectProviderRuntimeArchiveSourceBinding, bool, error) {
	empty := evaluationCapabilityEffectProviderRuntimeArchiveSourceBinding{}
	hasIntent := len(record.PreEffectIntentBytes) != 0
	hasReceipt := len(record.EffectSourceReceiptBytes) != 0
	if !hasIntent && !hasReceipt {
		return empty, false, nil
	}
	if !hasIntent || !hasReceipt {
		return empty, false, conflict("evaluation shared-effect source archive is missing an owner preimage")
	}
	intent, err := decodeCanonicalEvaluationObject(
		record.PreEffectIntentBytes, maximumEvaluationOptionalFactAuthorityEnvelopeBytes,
	)
	if err != nil {
		return empty, false, err
	}
	effectReceipt, err := decodeCanonicalEvaluationObject(
		record.EffectSourceReceiptBytes, maximumEvaluationOptionalFactAuthorityEnvelopeBytes,
	)
	if err != nil {
		return empty, false, err
	}
	sourceReceipt, err := decodeCanonicalEvaluationObject(
		record.ReceiptBytes, maximumEvaluationOptionalFactAuthorityResponseBytes,
	)
	if err != nil {
		return empty, false, err
	}
	turnIndex, turnOK := integerMember(intent, "turnIndex")
	ownerRequestDigest := stringMember(intent, "ownerRequestDigest")
	preEffectIntentDigest := stringMember(intent, "intentDigest")
	effectSourceReceiptDigest := stringMember(effectReceipt, "receiptDigest")
	journalResultRecordDigest := stringMember(effectReceipt, "providerRuntimeJournalResultRecordDigest")
	resultSealReceiptDigest := stringMember(effectReceipt, "providerRuntimeResultSealReceiptDigest")
	if !turnOK || stringMember(intent, "attemptId") != record.AttemptID || turnIndex != record.TurnIndex ||
		!evaluationDigestPattern.MatchString(ownerRequestDigest) ||
		!evaluationDigestPattern.MatchString(preEffectIntentDigest) ||
		!evaluationDigestPattern.MatchString(effectSourceReceiptDigest) ||
		!evaluationDigestPattern.MatchString(journalResultRecordDigest) ||
		!evaluationDigestPattern.MatchString(resultSealReceiptDigest) ||
		stringMember(effectReceipt, "intentDigest") != preEffectIntentDigest ||
		stringMember(effectReceipt, "ownerRequestDigest") != ownerRequestDigest ||
		stringMember(sourceReceipt, "preEffectIntentDigest") != preEffectIntentDigest ||
		stringMember(sourceReceipt, "effectSourceReceiptDigest") != effectSourceReceiptDigest ||
		stringMember(sourceReceipt, "providerRuntimeJournalResultRecordDigest") != journalResultRecordDigest ||
		stringMember(sourceReceipt, "providerRuntimeResultSealReceiptDigest") != resultSealReceiptDigest {
		return empty, false, conflict("evaluation shared-effect source archive drifted from its Provider runtime journal bridge")
	}
	return evaluationCapabilityEffectProviderRuntimeArchiveSourceBinding{
		AttemptID: record.AttemptID, TurnIndex: record.TurnIndex, OwnerRequestDigest: ownerRequestDigest,
		PreEffectIntentDigest: preEffectIntentDigest, EffectSourceReceiptDigest: effectSourceReceiptDigest,
		JournalResultRecordDigest:       journalResultRecordDigest,
		ProviderResultSealReceiptDigest: resultSealReceiptDigest,
	}, true, nil
}

func evaluationCapabilityEffectProviderRuntimeArchiveIdentity(
	attemptID string,
	turnIndex int64,
	ownerRequestDigest string,
) string {
	return fmt.Sprintf("%s\x00%012d\x00%s", attemptID, turnIndex, ownerRequestDigest)
}

func validateEvaluationCapabilityEffectProviderRuntimeArchiveSources(
	records []EvaluationCapabilityEffectProviderRuntimeArchiveRecord,
	sources []EvaluationOptionalFactSourceArchiveRecord,
) error {
	bindings := make(map[string]evaluationCapabilityEffectProviderRuntimeArchiveSourceBinding)
	for _, source := range sources {
		binding, sharedEffect, err := decodeEvaluationCapabilityEffectProviderRuntimeArchiveSourceBinding(source)
		if err != nil {
			return err
		}
		if !sharedEffect {
			continue
		}
		identity := evaluationCapabilityEffectProviderRuntimeArchiveIdentity(
			binding.AttemptID, binding.TurnIndex, binding.OwnerRequestDigest,
		)
		if _, duplicate := bindings[identity]; duplicate {
			return conflict("evaluation Provider runtime journal source bridge is duplicated")
		}
		bindings[identity] = binding
	}
	if len(records) != len(bindings) {
		return conflict("evaluation Provider runtime journal archive and shared-effect sources are not bijective")
	}
	seenRecords := make(map[string]struct{}, len(records))
	var totalBytes int64
	for _, record := range records {
		if !validEvaluationAgentControlIdentity(record.AttemptID) || record.TurnIndex < 0 ||
			record.TurnIndex >= maximumEvaluationOptionalFactAuthorityTurns ||
			!evaluationDigestPattern.MatchString(record.OwnerRequestDigest) ||
			!evaluationDigestPattern.MatchString(record.PreEffectIntentDigest) ||
			!evaluationDigestPattern.MatchString(record.EffectSourceReceiptDigest) ||
			!evaluationDigestPattern.MatchString(record.ProviderRuntimeJournalResultRecordDigest) ||
			!evaluationDigestPattern.MatchString(record.ProviderRuntimeResultSealReceiptDigest) ||
			!evaluationDigestPattern.MatchString(record.RecordDigest) || len(record.RecordBytes) < 1 ||
			len(record.RecordBytes) > maximumEvaluationCapabilityEffectProviderRuntimeArchiveRecordBytes {
			return ErrConflict
		}
		identity := evaluationCapabilityEffectProviderRuntimeArchiveIdentity(
			record.AttemptID, record.TurnIndex, record.OwnerRequestDigest,
		)
		binding, exists := bindings[identity]
		if !exists || binding.PreEffectIntentDigest != record.PreEffectIntentDigest ||
			binding.EffectSourceReceiptDigest != record.EffectSourceReceiptDigest ||
			binding.JournalResultRecordDigest != record.ProviderRuntimeJournalResultRecordDigest ||
			binding.ProviderResultSealReceiptDigest != record.ProviderRuntimeResultSealReceiptDigest {
			return conflict("evaluation Provider runtime journal archive drifted from its shared-effect source")
		}
		if _, duplicate := seenRecords[identity]; duplicate {
			return conflict("evaluation Provider runtime journal archive identity is duplicated")
		}
		seenRecords[identity] = struct{}{}
		totalBytes += int64(len(record.RecordBytes))
	}
	return validateEvaluationCapabilityEffectProviderRuntimeArchiveCapacity(int64(len(records)), totalBytes)
}

func evaluationCapabilityEffectProviderRuntimeArchiveRoot(
	records []EvaluationCapabilityEffectProviderRuntimeArchiveRecord,
) (string, error) {
	digests := make([]string, len(records))
	var totalBytes int64
	for index, record := range records {
		if !evaluationDigestPattern.MatchString(record.RecordDigest) || len(record.RecordBytes) < 1 ||
			len(record.RecordBytes) > maximumEvaluationCapabilityEffectProviderRuntimeArchiveRecordBytes {
			return "", ErrConflict
		}
		digests[index] = record.RecordDigest
		totalBytes += int64(len(record.RecordBytes))
	}
	if err := validateEvaluationCapabilityEffectProviderRuntimeArchiveCapacity(int64(len(records)), totalBytes); err != nil {
		return "", err
	}
	sort.Strings(digests)
	for index := 1; index < len(digests); index++ {
		if digests[index-1] == digests[index] {
			return "", conflict("evaluation Provider runtime journal archive contains a duplicate record digest")
		}
	}
	return canonicaljson.Digest(map[string]any{"recordDigests": digests})
}

func evaluationQualificationAuthorityArchiveSetDigests(
	ctx context.Context,
	queryer evaluationReadQueryer,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	plan evaluationPlanFact,
) (evaluationAuthenticitySetDigests, error) {
	admissions, err := queryEvaluationCapabilityProbeAdmissionArchiveRecords(ctx, queryer, authority, partition)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	references, err := queryEvaluationCapabilityProbeReferenceArchiveRecords(ctx, queryer, authority, partition)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	if err := validateEvaluationCapabilityProbeArchiveProjection(admissions, references); err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	cleanups, err := queryEvaluationCapabilityProbeProviderResourceCleanupArchiveRecords(
		ctx, queryer, authority, partition,
	)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	if err := validateEvaluationCapabilityProbeProviderResourceCleanupArchivePlan(plan, cleanups); err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	hostedLifecycleJournals, err := queryEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecords(
		ctx, queryer, authority, partition,
	)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchivePlan(plan, hostedLifecycleJournals); err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	hostedCleanups, err := queryEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords(
		ctx, queryer, authority, partition,
	)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchivePlan(plan, hostedCleanups); err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	providerRuntimeJournals, err := queryEvaluationCapabilityEffectProviderRuntimeArchiveRecords(
		ctx, queryer, authority, partition,
	)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	registrations, err := queryEvaluationRuntimeFactSourceRegistrationArchiveRecords(
		ctx, queryer, authority, plan,
	)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	sources, err := queryEvaluationOptionalFactSourceArchiveRecords(ctx, queryer, authority, partition)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	if err := validateEvaluationCapabilityEffectProviderRuntimeArchiveSources(providerRuntimeJournals, sources); err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	authorities, err := queryEvaluationOptionalFactAuthorityArchiveRecords(ctx, queryer, authority, partition)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	plannedTurns, err := evaluationOptionalFactPlannedTurnDenominator(plan)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	plannedRegistrations, err := evaluationRuntimeFactSourceRegistrationDenominator(plan)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	optionalProjection, err := evaluationOptionalFactArchiveFamilyProjection(
		plannedTurns, plannedRegistrations, registrations, sources, authorities,
	)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	admissionDigests := make([]string, len(admissions))
	for index, record := range admissions {
		admissionDigests[index] = record.RecordDigest
	}
	referenceDigests := make([]string, len(references))
	for index, record := range references {
		referenceDigests[index] = record.RecordDigest
	}
	sort.Strings(admissionDigests)
	sort.Strings(referenceDigests)
	admissionRoot, err := canonicaljson.Digest(map[string]any{"recordDigests": admissionDigests})
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	referenceRoot, err := canonicaljson.Digest(map[string]any{"recordDigests": referenceDigests})
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	cleanupRoot, err := evaluationCapabilityProbeProviderResourceCleanupArchiveRoot(cleanups)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	hostedCleanupRoot, err := evaluationHostedRetrievalRuntimeResourceCleanupArchiveRoot(hostedCleanups)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	hostedLifecycleJournalRoot, err := evaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRoot(hostedLifecycleJournals)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	hostedLifecycleBudgetClosureBindingRoot, err := evaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingRoot(hostedLifecycleJournals)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	providerRuntimeJournalRoot, err := evaluationCapabilityEffectProviderRuntimeArchiveRoot(providerRuntimeJournals)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	return evaluationAuthenticitySetDigests{
		CapabilityProbeAdmission:                                    admissionRoot,
		CapabilityProbeReference:                                    referenceRoot,
		RuntimeFactSourceOwnerRegistration:                          optionalProjection.RegistrationSetDigest,
		CapabilityProbeProviderResourceCleanup:                      cleanupRoot,
		HostedRetrievalRuntimeResourceLifecycleJournal:              hostedLifecycleJournalRoot,
		HostedRetrievalRuntimeResourceLifecycleBudgetClosureBinding: hostedLifecycleBudgetClosureBindingRoot,
		HostedRetrievalRuntimeResourceCleanup:                       hostedCleanupRoot,
		CapabilityEffectProviderRuntimeJournal:                      providerRuntimeJournalRoot,
		OptionalCapabilityFactSource:                                optionalProjection.SourceSetDigest,
		OptionalCapabilityFactAuthority:                             optionalProjection.AuthoritySetDigest,
	}, nil
}
