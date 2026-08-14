package agent

import (
	"context"
	"sort"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecordFormat               = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-journal-record"
	evaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecordFormat        = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-journal-archive-record"
	maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecords      = int64(88)
	minimumEvaluationHostedRetrievalRuntimeResourceLifecycleReleaseArchiveRecords      = int64(8)
	maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalRecordBytes         = 139_264
	maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecordBytes  = 155_648
	maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveFamilyBytes  = int64(13_697_024)
	maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalPhysicalRecordBytes = int64(163_840)
	maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalPhysicalFamilyBytes = int64(14_417_920)
)

var evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecordKeys = []string{
	"format", "version", "operation", "registrationRequestDigest", "authorityDigest",
	"lifecycleClaimReceiptDigest", "dispatchIntentSet", "dispatchIntentSetDigest",
	"dispatchStageClaimReceiptSet", "dispatchStageClaimReceiptSetDigest",
	"dispatchStageClaimHistorySet", "dispatchStageClaimHistorySetDigest",
	"transportReceiptSet", "transportReceiptSetDigest", "businessResult", "businessResultDigest",
	"resultSpoolReceipt", "resultSpoolReceiptDigest", "resultSpoolDispositionReceipt",
	"resultSpoolDispositionReceiptDigest", "recordDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecordKeys = []string{
	"format", "version", "journalRecord", "journalRecordDigest", "budgetClosureProjection",
	"budgetClosureProjectionDigest", "archiveRecordDigest",
}

// EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord is the
// bounded public wrapper retained after encrypted lifecycle spool destruction.
// Provider response bodies and encryption keys never enter this projection.
type EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord struct {
	NamespaceID                    string
	RepositoryCommit               string
	PlanDigest                     string
	FrozenRunDigest                string
	RunConfigArtifactBindingDigest string
	RuntimeResourceSetID           string
	Operation                      string
	RegistrationRequestDigest      string
	RegistrationIntentDigest       string
	LifecycleAuthorityKey          string
	JournalRecordDigest            string
	BudgetClosureProjectionDigest  string
	HasBudgetClosureProjection     bool
	ProviderResourceID             string
	AuxiliaryResourceIDs           []string
	ResourceID                     string
	ResourceRole                   string
	Outcome                        string
	ArchiveRecordDigest            string
	RecordBytes                    []byte
	Value                          map[string]any
}

func evaluationHostedRetrievalRuntimeResourceLifecycleArchiveObject(
	parent map[string]any,
	key string,
) (map[string]any, error) {
	value, ok := objectMember(parent, key)
	if !ok {
		return nil, ErrConflict
	}
	return value, nil
}

func evaluationHostedRetrievalRuntimeResourceLifecycleNullableDigest(value map[string]any, key string) bool {
	entry, exists := value[key]
	return exists && (entry == nil || evaluationDigestPattern.MatchString(stringMember(value, key)))
}

func evaluationHostedRetrievalRuntimeResourceLifecycleArchiveScope(
	journal map[string]any,
) (map[string]any, error) {
	intentSet, err := evaluationHostedRetrievalRuntimeResourceLifecycleArchiveObject(journal, "dispatchIntentSet")
	if err != nil || stringMember(journal, "dispatchIntentSetDigest") != stringMember(intentSet, "setDigest") {
		return nil, ErrConflict
	}
	intents, ok := intentSet["intents"].([]any)
	if !ok || len(intents) < 1 || len(intents) > 4 {
		return nil, ErrConflict
	}
	first, ok := intents[0].(map[string]any)
	if !ok || !validEvaluationAgentControlIdentity(stringMember(first, "namespaceId")) ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(first, "repositoryCommit")) ||
		!validEvaluationAgentControlIdentity(stringMember(first, "runtimeResourceSetId")) ||
		!evaluationHostedArchiveDigestMembers(first,
			"planDigest", "frozenRunDigest", "runConfigArtifactBindingDigest", "registrationRequestDigest", "intentDigest") {
		return nil, ErrConflict
	}
	return first, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord(
	recordBytes []byte,
) (EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord, error) {
	if validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecordCapacity(int64(len(recordBytes))) != nil {
		return EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord{}, ErrConflict
	}
	value, err := decodeCanonicalEvaluationObject(
		recordBytes, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecordBytes,
	)
	if err != nil || validateEvaluationHostedArchiveSelfDigest(
		value,
		evaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecordKeys,
		evaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecordFormat,
		"archiveRecordDigest",
	) != nil || !evaluationHostedArchiveSafe(
		value, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecordBytes,
	) {
		return EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord{}, ErrConflict
	}
	journal, err := evaluationHostedRetrievalRuntimeResourceLifecycleArchiveObject(value, "journalRecord")
	if err != nil || validateEvaluationHostedArchiveSelfDigest(
		journal,
		evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecordKeys,
		evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecordFormat,
		"recordDigest",
	) != nil || !evaluationHostedArchiveSafe(
		journal, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalRecordBytes,
	) || stringMember(value, "journalRecordDigest") != stringMember(journal, "recordDigest") {
		return EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord{}, ErrConflict
	}
	operation := stringMember(journal, "operation")
	registrationRequestDigest := stringMember(journal, "registrationRequestDigest")
	if (operation != "create" && operation != "delete") ||
		!evaluationDigestPattern.MatchString(registrationRequestDigest) ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableDigest(journal, "authorityDigest") ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableDigest(journal, "lifecycleClaimReceiptDigest") {
		return EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord{}, ErrConflict
	}
	firstIntent, err := evaluationHostedRetrievalRuntimeResourceLifecycleArchiveScope(journal)
	if err != nil || stringMember(firstIntent, "operation") != operation ||
		stringMember(firstIntent, "registrationRequestDigest") != registrationRequestDigest ||
		!evaluationDigestPattern.MatchString(stringMember(firstIntent, "registrationIntentDigest")) ||
		!validEvaluationAgentControlIdentity(stringMember(firstIntent, "protocolFamily")) ||
		!validEvaluationAgentControlIdentity(stringMember(firstIntent, "capabilityProfileId")) {
		return EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord{}, ErrConflict
	}
	businessResult, err := evaluationHostedRetrievalRuntimeResourceLifecycleArchiveObject(journal, "businessResult")
	if err != nil || stringMember(journal, "businessResultDigest") != stringMember(businessResult, "resultDigest") ||
		stringMember(businessResult, "operation") != operation ||
		!evaluationDigestPattern.MatchString(stringMember(businessResult, "resultDigest")) {
		return EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord{}, ErrConflict
	}
	providerResourceID := stringMember(businessResult, "providerResourceId")
	if businessResult["providerResourceId"] == nil {
		providerResourceID = ""
	}
	resourceID := stringMember(businessResult, "resourceId")
	if businessResult["resourceId"] == nil {
		resourceID = ""
	}
	resourceRole := stringMember(businessResult, "resourceRole")
	if businessResult["resourceRole"] == nil {
		resourceRole = ""
	}
	auxiliaryResourceIDs, ok := evaluationHostedArchiveStringArray(businessResult["auxiliaryResourceIds"])
	if !ok || !evaluationHostedArchiveCanonicalAuxiliaryIDs(businessResult["auxiliaryResourceIds"], providerResourceID) {
		return EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord{}, ErrConflict
	}
	budgetClosureProjectionDigest := stringMember(value, "budgetClosureProjectionDigest")
	if !evaluationDigestPattern.MatchString(budgetClosureProjectionDigest) {
		return EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord{}, ErrConflict
	}
	hasBudgetClosure := value["budgetClosureProjection"] != nil
	if operation == "create" {
		projection, projectionErr := evaluationHostedRetrievalRuntimeResourceLifecycleArchiveObject(value, "budgetClosureProjection")
		if projectionErr != nil || stringMember(projection, "projectionDigest") != budgetClosureProjectionDigest {
			return EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord{}, ErrConflict
		}
	} else if hasBudgetClosure {
		return EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord{}, ErrConflict
	}
	if operation == "create" {
		if resourceID != "" || resourceRole != "" ||
			!oneOfString(stringMember(businessResult, "outcome"), "abandoned-before-provider-effect", "created-and-uploaded", "partial-create-requires-cleanup") {
			return EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord{}, ErrConflict
		}
	} else if providerResourceID != "" || len(auxiliaryResourceIDs) != 0 ||
		!validEvaluationAgentControlIdentity(resourceID) || !oneOfString(resourceRole, "auxiliary", "primary") ||
		!oneOfString(stringMember(businessResult, "outcome"), "already-absent", "deleted") {
		return EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord{}, ErrConflict
	}
	return EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord{
		NamespaceID:                    stringMember(firstIntent, "namespaceId"),
		RepositoryCommit:               stringMember(firstIntent, "repositoryCommit"),
		PlanDigest:                     stringMember(firstIntent, "planDigest"),
		FrozenRunDigest:                stringMember(firstIntent, "frozenRunDigest"),
		RunConfigArtifactBindingDigest: stringMember(firstIntent, "runConfigArtifactBindingDigest"),
		RuntimeResourceSetID:           stringMember(firstIntent, "runtimeResourceSetId"),
		Operation:                      operation,
		RegistrationRequestDigest:      registrationRequestDigest,
		RegistrationIntentDigest:       stringMember(firstIntent, "registrationIntentDigest"),
		LifecycleAuthorityKey:          stringMember(firstIntent, "protocolFamily") + "\x00" + stringMember(firstIntent, "capabilityProfileId"),
		JournalRecordDigest:            stringMember(journal, "recordDigest"),
		BudgetClosureProjectionDigest:  budgetClosureProjectionDigest,
		HasBudgetClosureProjection:     hasBudgetClosure,
		ProviderResourceID:             providerResourceID,
		AuxiliaryResourceIDs:           append([]string(nil), auxiliaryResourceIDs...),
		ResourceID:                     resourceID,
		ResourceRole:                   resourceRole,
		Outcome:                        stringMember(businessResult, "outcome"),
		ArchiveRecordDigest:            stringMember(value, "archiveRecordDigest"),
		RecordBytes:                    append([]byte(nil), recordBytes...),
		Value:                          value,
	}, nil
}

func evaluationHostedRetrievalRuntimeResourceLifecycleJournalOrderKey(
	record EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord,
) string {
	return record.Operation + "\x00" + record.RegistrationRequestDigest + "\x00" + record.ResourceRole + "\x00" + record.ResourceID
}

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveCapacity(
	recordCount int64,
	totalBytes int64,
) error {
	if recordCount < 0 || recordCount > maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecords ||
		totalBytes < 0 || totalBytes > maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveFamilyBytes {
		return conflict("evaluation hosted lifecycle journal archive exceeds its frozen count or byte bound")
	}
	return nil
}

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecordCapacity(
	byteLength int64,
) error {
	if byteLength < 1 || byteLength > maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecordBytes {
		return conflict("evaluation hosted lifecycle journal semantic record exceeds its frozen byte bound")
	}
	return nil
}

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalPhysicalArchiveCapacity(
	recordCount int64,
	totalBytes int64,
) error {
	if recordCount < 0 || recordCount > maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecords ||
		totalBytes < 0 || totalBytes > maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalPhysicalFamilyBytes {
		return conflict("evaluation hosted lifecycle journal physical archive exceeds its frozen count or byte bound")
	}
	return nil
}

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalPhysicalRecordCapacity(
	byteLength int64,
) error {
	if byteLength < 1 || byteLength > maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalPhysicalRecordBytes {
		return conflict("evaluation hosted lifecycle journal physical record exceeds its frozen byte bound")
	}
	return nil
}

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchivePlan(
	plan evaluationPlanFact,
	records []EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord,
) error {
	expectedCreateCount, err := evaluationHostedRetrievalRuntimeResourceCleanupArchivePlanCount(plan)
	if err != nil || expectedCreateCount != 4 {
		return ErrConflict
	}
	if validateEvaluationHostedRetrievalRuntimeResourceLifecycleReleaseRecordCount(int64(len(records))) != nil {
		return ErrConflict
	}
	createBudget := make(map[string]string, expectedCreateCount)
	expectedResources := make(map[string]struct{})
	actualResources := make(map[string]struct{})
	seenDigests := make(map[string]struct{}, len(records))
	var namespaceID, frozenRunDigest, runConfigArtifactBindingDigest, runtimeResourceSetID string
	var totalBytes int64
	for index, record := range records {
		if record.PlanDigest != plan.PlanDigest || record.RepositoryCommit != plan.RepositoryCommit ||
			!evaluationDigestPattern.MatchString(record.ArchiveRecordDigest) ||
			validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecordCapacity(int64(len(record.RecordBytes))) != nil {
			return ErrConflict
		}
		if index > 0 && evaluationHostedRetrievalRuntimeResourceLifecycleJournalOrderKey(records[index-1]) >=
			evaluationHostedRetrievalRuntimeResourceLifecycleJournalOrderKey(record) {
			return conflict("evaluation hosted lifecycle journal archive order is invalid")
		}
		if _, duplicate := seenDigests[record.ArchiveRecordDigest]; duplicate {
			return conflict("evaluation hosted lifecycle journal archive digest is duplicated")
		}
		seenDigests[record.ArchiveRecordDigest] = struct{}{}
		if index == 0 {
			namespaceID, frozenRunDigest = record.NamespaceID, record.FrozenRunDigest
			runConfigArtifactBindingDigest, runtimeResourceSetID = record.RunConfigArtifactBindingDigest, record.RuntimeResourceSetID
		} else if record.NamespaceID != namespaceID || record.FrozenRunDigest != frozenRunDigest ||
			record.RunConfigArtifactBindingDigest != runConfigArtifactBindingDigest || record.RuntimeResourceSetID != runtimeResourceSetID {
			return conflict("evaluation hosted lifecycle journal archive scope drifted")
		}
		if record.Operation == "create" {
			if _, duplicate := createBudget[record.RegistrationRequestDigest]; duplicate || !record.HasBudgetClosureProjection ||
				record.Outcome != "created-and-uploaded" || !validEvaluationAgentControlIdentity(record.ProviderResourceID) {
				return conflict("evaluation hosted lifecycle journal creation set is incomplete")
			}
			createBudget[record.RegistrationRequestDigest] = record.BudgetClosureProjectionDigest
			expectedResources[record.RegistrationRequestDigest+"\x00primary\x00"+record.ProviderResourceID] = struct{}{}
			for _, resourceID := range record.AuxiliaryResourceIDs {
				expectedResources[record.RegistrationRequestDigest+"\x00auxiliary\x00"+resourceID] = struct{}{}
			}
		} else {
			closureDigest, exists := createBudget[record.RegistrationRequestDigest]
			if !exists || record.HasBudgetClosureProjection || closureDigest != record.BudgetClosureProjectionDigest {
				return conflict("evaluation hosted lifecycle journal cleanup budget reference drifted")
			}
			resourceKey := record.RegistrationRequestDigest + "\x00" + record.ResourceRole + "\x00" + record.ResourceID
			if _, duplicate := actualResources[resourceKey]; duplicate {
				return conflict("evaluation hosted lifecycle journal cleanup resource is duplicated")
			}
			actualResources[resourceKey] = struct{}{}
		}
		totalBytes += int64(len(record.RecordBytes))
	}
	if int64(len(createBudget)) != expectedCreateCount || len(actualResources) != len(expectedResources) {
		return conflict("evaluation hosted lifecycle journal archive closure is incomplete")
	}
	for key := range expectedResources {
		if _, exists := actualResources[key]; !exists {
			return conflict("evaluation hosted lifecycle journal archive is not zeroed")
		}
	}
	return validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveCapacity(int64(len(records)), totalBytes)
}

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleReleaseRecordCount(count int64) error {
	if count < minimumEvaluationHostedRetrievalRuntimeResourceLifecycleReleaseArchiveRecords ||
		count > maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecords {
		return ErrConflict
	}
	return nil
}

func evaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRoot(
	records []EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord,
) (string, error) {
	digests := make([]string, len(records))
	var totalBytes int64
	for index, record := range records {
		if !evaluationDigestPattern.MatchString(record.ArchiveRecordDigest) ||
			validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecordCapacity(int64(len(record.RecordBytes))) != nil {
			return "", ErrConflict
		}
		digests[index] = record.ArchiveRecordDigest
		totalBytes += int64(len(record.RecordBytes))
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveCapacity(int64(len(records)), totalBytes); err != nil {
		return "", err
	}
	sort.Strings(digests)
	for index := 1; index < len(digests); index++ {
		if digests[index-1] == digests[index] {
			return "", conflict("evaluation hosted lifecycle journal archive root contains a duplicate digest")
		}
	}
	return canonicaljson.Digest(map[string]any{"recordDigests": digests})
}

func evaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingRoot(
	records []EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord,
) (string, error) {
	type binding struct {
		AuthorityKey               string
		RegistrationRequestDigest  string
		RegistrationIntentDigest   string
		ArchiveRecordDigest        string
		BudgetClosureProjectionDig string
	}
	bindings := make([]binding, 0, 4)
	for _, record := range records {
		if record.Operation != "create" {
			continue
		}
		if !record.HasBudgetClosureProjection ||
			!evaluationDigestPattern.MatchString(record.RegistrationRequestDigest) ||
			!evaluationDigestPattern.MatchString(record.RegistrationIntentDigest) ||
			!evaluationDigestPattern.MatchString(record.ArchiveRecordDigest) ||
			!evaluationDigestPattern.MatchString(record.BudgetClosureProjectionDigest) ||
			record.LifecycleAuthorityKey == "" {
			return "", conflict("evaluation hosted lifecycle budget closure binding is incomplete")
		}
		bindings = append(bindings, binding{
			AuthorityKey: record.LifecycleAuthorityKey, RegistrationRequestDigest: record.RegistrationRequestDigest,
			RegistrationIntentDigest: record.RegistrationIntentDigest, ArchiveRecordDigest: record.ArchiveRecordDigest,
			BudgetClosureProjectionDig: record.BudgetClosureProjectionDigest,
		})
	}
	if len(bindings) != 4 {
		return "", conflict("evaluation hosted lifecycle budget closure binding set is incomplete")
	}
	sort.Slice(bindings, func(left, right int) bool { return bindings[left].AuthorityKey < bindings[right].AuthorityKey })
	canonicalBindings := make([]any, len(bindings))
	seenAuthority := make(map[string]struct{}, len(bindings))
	seenRequest := make(map[string]struct{}, len(bindings))
	seenIntent := make(map[string]struct{}, len(bindings))
	seenArchive := make(map[string]struct{}, len(bindings))
	for index, entry := range bindings {
		if _, duplicate := seenAuthority[entry.AuthorityKey]; duplicate {
			return "", conflict("evaluation hosted lifecycle budget closure authority is duplicated")
		}
		if _, duplicate := seenRequest[entry.RegistrationRequestDigest]; duplicate {
			return "", conflict("evaluation hosted lifecycle budget closure request is duplicated")
		}
		if _, duplicate := seenIntent[entry.RegistrationIntentDigest]; duplicate {
			return "", conflict("evaluation hosted lifecycle budget closure intent is duplicated")
		}
		if _, duplicate := seenArchive[entry.ArchiveRecordDigest]; duplicate {
			return "", conflict("evaluation hosted lifecycle budget closure archive is duplicated")
		}
		seenAuthority[entry.AuthorityKey] = struct{}{}
		seenRequest[entry.RegistrationRequestDigest] = struct{}{}
		seenIntent[entry.RegistrationIntentDigest] = struct{}{}
		seenArchive[entry.ArchiveRecordDigest] = struct{}{}
		canonicalBindings[index] = map[string]any{
			"registrationRequestDigest":        entry.RegistrationRequestDigest,
			"registrationIntentDigest":         entry.RegistrationIntentDigest,
			"createJournalArchiveRecordDigest": entry.ArchiveRecordDigest,
			"projectionDigest":                 entry.BudgetClosureProjectionDig,
		}
	}
	return canonicaljson.Digest(map[string]any{"bindings": canonicalBindings})
}

func queryEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecords(
	ctx context.Context,
	queryer evaluationReadQueryer,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT runtime_resource_set_id,operation,registration_request_digest,
		journal_record_digest,budget_closure_projection_digest,archive_record_digest,record_bytes
		FROM ae_hrrr_lifecycle_journal_archives
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND v46_eligible`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord, 0, 16)
	var totalBytes int64
	for rows.Next() {
		var runtimeResourceSetID, operation, registrationRequestDigest string
		var journalRecordDigest, budgetClosureProjectionDigest, archiveRecordDigest string
		var recordBytes []byte
		if err := rows.Scan(&runtimeResourceSetID, &operation, &registrationRequestDigest,
			&journalRecordDigest, &budgetClosureProjectionDigest, &archiveRecordDigest, &recordBytes); err != nil {
			return nil, err
		}
		record, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord(recordBytes)
		if err != nil || record.NamespaceID != authority.NamespaceID || record.PlanDigest != partition.PlanDigest ||
			record.RepositoryCommit != partition.RepositoryCommit || record.RuntimeResourceSetID != runtimeResourceSetID ||
			record.Operation != operation || record.RegistrationRequestDigest != registrationRequestDigest ||
			record.JournalRecordDigest != journalRecordDigest ||
			record.BudgetClosureProjectionDigest != budgetClosureProjectionDigest || record.ArchiveRecordDigest != archiveRecordDigest {
			return nil, conflict("evaluation hosted lifecycle journal archive stored columns drifted")
		}
		totalBytes += int64(len(recordBytes))
		if len(records) >= int(maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecords) ||
			totalBytes > maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveFamilyBytes {
			return nil, conflict("evaluation hosted lifecycle journal archive query exceeded capacity")
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Slice(records, func(left, right int) bool {
		return evaluationHostedRetrievalRuntimeResourceLifecycleJournalOrderKey(records[left]) <
			evaluationHostedRetrievalRuntimeResourceLifecycleJournalOrderKey(records[right])
	})
	return records, nil
}
