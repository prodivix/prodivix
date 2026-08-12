package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func evaluationArchiveTestDigest(t *testing.T, label string) string {
	t.Helper()
	digest, err := canonicaljson.Digest(map[string]any{"label": label})
	if err != nil {
		t.Fatal(err)
	}
	return digest
}

func evaluationArchiveTestObject(t *testing.T, value any) map[string]any {
	t.Helper()
	canonical, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := decodeCanonicalEvaluationJSON(canonical)
	if err != nil {
		t.Fatal(err)
	}
	object, ok := decoded.(map[string]any)
	if !ok {
		t.Fatal("archive test value is not an object")
	}
	return object
}

func evaluationArchiveTestAuthorityRoots(t *testing.T) map[string]any {
	t.Helper()
	fields := []string{
		"capabilityProbeAdmissionSetDigest", "capabilityProbeReferenceReceiptSetDigest",
		"runtimeFactSourceOwnerRegistrationSetDigest", "capabilityProbeProviderResourceCleanupSetDigest",
		"hostedRetrievalRuntimeResourceLifecycleJournalSetDigest",
		"hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest",
		"hostedRetrievalRuntimeResourceCleanupSetDigest", "capabilityEffectProviderRuntimeJournalSetDigest",
		"optionalCapabilityFactSourceSetDigest",
		"optionalCapabilityFactAuthoritySetDigest",
		"endpointSmokeSetDigest", "endpointSmokeDispatchIntentSetDigest", "endpointSmokeTransportReceiptSetDigest",
		"endpointSmokeResultSpoolReceiptSetDigest", "endpointSmokeResultSpoolDispositionReceiptSetDigest",
		"endpointSmokeValidationFailureReceiptSetDigest", "preDispatchFailureReceiptSetDigest",
		"transportDispatchIntentSetDigest", "transportReceiptSetDigest", "providerResultSpoolReceiptSetDigest",
		"providerResultSpoolDispositionReceiptSetDigest", "invocationTurnReceiptSetDigest",
		"invocationTurnSetReceiptSetDigest", "resultSubmissionReceiptSetDigest", "attemptAuthorityOwnerReceiptSetDigest",
		"controlledRuntimeReceiptSetDigest", "capabilityExecutionReceiptSetDigest", "capabilitySpecificReceiptSetDigest",
		"providerCapabilityObservationReceiptSetDigest",
		"verificationAttemptGrantReceiptSetDigest", "validatedHumanReviewArtifactSetDigest",
		"validatedHumanMetricObservationSetDigest", "reviewRasterScanReceiptSetDigest", "reviewCandidateRefSetDigest",
		"blindReviewMappingSetDigest", "sourceReceiptSetDigest", "executionReceiptSetDigest",
		"holdoutExecutionReceiptDigest", "secretCanarySetDigest", "protectedHoldoutCanarySetDigest",
	}
	result := make(map[string]any, len(fields))
	for _, field := range fields {
		result[field] = evaluationArchiveTestDigest(t, field)
	}
	return result
}

func evaluationArchiveTestClosure(
	t *testing.T,
	planDigest string,
	repositoryCommit string,
	createdAt time.Time,
) []byte {
	t.Helper()
	authorityRoots := evaluationArchiveTestAuthorityRoots(t)
	families := make([]any, len(evaluationEvidenceExportFamilies))
	shards := make([]any, 0, 8)
	descriptorDigests := make([]string, 0, 8)
	var totalShardBytes int64
	var totalRecordCount int64
	for index, family := range evaluationEvidenceExportFamilies {
		recordCount, shardCount := int64(0), int64(0)
		var firstOrderKey, lastOrderKey any
		recordDigests := make([]string, 0, 4)
		if evaluationArchiveSingletonFamily(family) {
			recordCount, shardCount = 1, 1
			recordDigests = append(recordDigests, evaluationArchiveTestDigest(t, family+".record"))
			orderKey := `["` + family + `"]`
			firstOrderKey, lastOrderKey = orderKey, orderKey
		} else if family == "hostedRetrievalRuntimeResourceLifecycleJournals" {
			recordCount, shardCount = 4, 1
			for recordIndex := int64(0); recordIndex < recordCount; recordIndex++ {
				recordDigests = append(recordDigests, evaluationArchiveTestDigest(t, family+evaluationExportInteger(recordIndex)))
			}
			firstOrderKey = `["create","sha256-0000000000000000000000000000000000000000000000000000000000000000"]`
			lastOrderKey = `["delete","sha256-ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"]`
		} else if family == "hostedRetrievalRuntimeResourceCleanups" {
			recordCount, shardCount = maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords, 1
			for recordIndex := int64(0); recordIndex < recordCount; recordIndex++ {
				recordDigests = append(recordDigests, evaluationArchiveTestDigest(t, family+evaluationExportInteger(recordIndex)))
			}
			firstOrderKey = `["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","resource-set.0000001","sha256-0000000000000000000000000000000000000000000000000000000000000000"]`
			lastOrderKey = `["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","resource-set.0000004","sha256-ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"]`
		}
		recordSetDigest, err := canonicaljson.Digest(recordDigests)
		if err != nil {
			t.Fatal(err)
		}
		semanticDigest := recordSetDigest
		if spec, exists := evaluationExportFamilySpecFor(family); exists && spec.SemanticEnvelopeKey != "" {
			semanticRecordDigests := append([]string(nil), recordDigests...)
			if spec.SemanticSortByDigest {
				sort.Strings(semanticRecordDigests)
			}
			semanticDigest, err = canonicaljson.Digest(map[string]any{spec.SemanticEnvelopeKey: semanticRecordDigests})
			if err != nil {
				t.Fatal(err)
			}
		}
		if evaluationArchiveSingletonFamily(family) {
			semanticDigest = recordDigests[0]
		}
		if recordCount > 0 {
			bytesDigest := evaluationArchiveTestDigest(t, family+".bytes")
			shardBase := map[string]any{
				"sequence": int64(len(shards)), "family": family, "familyShardIndex": int64(0),
				"fileName": strings.Repeat("0", 6-len(evaluationExportInteger(int64(len(shards))))) +
					evaluationExportInteger(int64(len(shards))) + "-" + bytesDigest + ".ndjson",
				"firstRecordIndex": int64(0), "lastRecordIndex": recordCount - 1,
				"firstOrderKey": firstOrderKey, "lastOrderKey": lastOrderKey, "recordCount": recordCount,
				"byteSize": recordCount * 2, "bytesDigest": bytesDigest, "recordSetDigest": recordSetDigest,
			}
			descriptorDigest, err := canonicaljson.Digest(shardBase)
			if err != nil {
				t.Fatal(err)
			}
			shard := make(map[string]any, len(shardBase)+1)
			for key, value := range shardBase {
				shard[key] = value
			}
			shard["descriptorDigest"] = descriptorDigest
			shards = append(shards, shard)
			descriptorDigests = append(descriptorDigests, descriptorDigest)
			totalShardBytes += recordCount * 2
			totalRecordCount += recordCount
		}
		families[index] = map[string]any{
			"family": family, "familyIndex": int64(index), "recordCount": recordCount,
			"semanticDigest": semanticDigest, "recordSetDigest": recordSetDigest, "shardCount": shardCount,
			"firstOrderKey": firstOrderKey, "lastOrderKey": lastOrderKey,
		}
	}
	for field, family := range map[string]string{
		"capabilityProbeAdmissionSetDigest":                       "capabilityProbeAdmissions",
		"capabilityProbeReferenceReceiptSetDigest":                "capabilityProbeReferenceReceipts",
		"runtimeFactSourceOwnerRegistrationSetDigest":             "runtimeFactSourceOwnerRegistrations",
		"capabilityProbeProviderResourceCleanupSetDigest":         "capabilityProbeProviderResourceCleanups",
		"hostedRetrievalRuntimeResourceLifecycleJournalSetDigest": "hostedRetrievalRuntimeResourceLifecycleJournals",
		"hostedRetrievalRuntimeResourceCleanupSetDigest":          "hostedRetrievalRuntimeResourceCleanups",
		"capabilityEffectProviderRuntimeJournalSetDigest":         "capabilityEffectProviderRuntimeJournals",
		"optionalCapabilityFactSourceSetDigest":                   "optionalCapabilityFactSources",
		"optionalCapabilityFactAuthoritySetDigest":                "optionalCapabilityFactAuthorities",
		"attemptAuthorityOwnerReceiptSetDigest":                   "attemptAuthorityOwnerReceipts",
		"capabilitySpecificReceiptSetDigest":                      "capabilitySpecificReceipts",
		"providerCapabilityObservationReceiptSetDigest":           "providerCapabilityObservationReceipts",
		"validatedHumanMetricObservationSetDigest":                "validatedHumanMetricObservations",
	} {
		familyIndex, exists := evaluationExportFamilyIndex(family)
		if !exists {
			t.Fatalf("archive authority family %s is missing", family)
		}
		authorityRoots[field] = families[familyIndex].(map[string]any)["semanticDigest"]
	}
	shardSetDigest, err := canonicaljson.Digest(descriptorDigests)
	if err != nil {
		t.Fatal(err)
	}
	familySemanticRoots := make([]any, len(families))
	for index, raw := range families {
		family := raw.(map[string]any)
		familySemanticRoots[index] = map[string]any{
			"family": family["family"], "recordCount": family["recordCount"], "semanticDigest": family["semanticDigest"],
		}
	}
	evidenceSetDigest := evaluationArchiveTestDigest(t, "evidence-set")
	bundleDigest, err := canonicaljson.Digest(map[string]any{
		"evidenceFormat": "prodivix.agent-model-evaluation-evidence", "evidenceVersion": int64(3),
		"planDigest": planDigest, "repositoryCommit": repositoryCommit, "evidenceSetDigest": evidenceSetDigest,
		"authorityRoots": authorityRoots, "familySemanticRoots": familySemanticRoots,
	})
	if err != nil {
		t.Fatal(err)
	}
	exportLeaseID := "evaluation-export:test-archive-closure"
	exportLeaseDigest := evaluationArchiveTestDigest(t, "export-lease")
	sourceConfigDigest := evaluationArchiveTestDigest(t, "source-config")
	frozenRunDigest := evaluationArchiveTestDigest(t, "frozen-run")
	runConfigArtifactBinding := evaluationTestRunConfigArtifactBinding(
		t, planDigest, repositoryCommit, sourceConfigDigest, frozenRunDigest,
	)
	authorityPayloadDigest := evaluationArchiveTestDigest(t, "authority-payload")
	authorityAttestationDigest := evaluationArchiveTestDigest(t, "semantic-attestation")
	manifestDigest := evaluationArchiveTestDigest(t, "manifest")
	indexBase := map[string]any{
		"format": "prodivix.agent-model-evaluation-evidence-index", "version": int64(1),
		"indexId":        "evaluation-evidence-index:" + strings.TrimPrefix(planDigest, "sha256-"),
		"evidenceFormat": "prodivix.agent-model-evaluation-evidence", "evidenceVersion": int64(3),
		"exportLeaseId": exportLeaseID, "exportLeaseDigest": exportLeaseDigest,
		"runConfigArtifactBinding": runConfigArtifactBinding, "sourceConfigDigest": sourceConfigDigest,
		"frozenRunDigest": frozenRunDigest, "planDigest": planDigest, "repositoryCommit": repositoryCommit,
		"evidenceSetDigest": evidenceSetDigest, "bundleDigest": bundleDigest,
		"authorityPayloadDigest": authorityPayloadDigest, "authorityAttestationDigest": authorityAttestationDigest,
		"authorityRoots": authorityRoots, "evaluationManifestDigest": manifestDigest,
		"families": families, "shards": shards, "shardSetDigest": shardSetDigest,
		"totalShardBytes": totalShardBytes, "totalRecordCount": totalRecordCount,
		"createdAt": evaluationExportInstant(createdAt),
	}
	indexDigest, err := canonicaljson.Digest(indexBase)
	if err != nil {
		t.Fatal(err)
	}
	index := make(map[string]any, len(indexBase)+1)
	for key, value := range indexBase {
		index[key] = value
	}
	index["indexDigest"] = indexDigest
	indexBytes, err := canonicaljson.Bytes(index)
	if err != nil {
		t.Fatal(err)
	}
	attestationPayload := map[string]any{
		"format": "prodivix.agent-model-evaluation-evidence-archive-attestation", "version": int64(1),
		"authorityId": "archive-authority.test", "keyId": "archive-key.test",
		"exportLeaseId": exportLeaseID, "exportLeaseDigest": exportLeaseDigest,
		"runConfigArtifactBinding": runConfigArtifactBinding, "sourceConfigDigest": sourceConfigDigest,
		"frozenRunDigest": frozenRunDigest, "planDigest": planDigest, "repositoryCommit": repositoryCommit,
		"evidenceSetDigest": evidenceSetDigest, "bundleDigest": bundleDigest,
		"authorityPayloadDigest": authorityPayloadDigest, "authorityAttestationDigest": authorityAttestationDigest,
		"authorityRoots": authorityRoots, "evaluationManifestDigest": manifestDigest, "indexDigest": indexDigest,
		"evidenceIndexArtifactDigest": evaluationArchiveCanonicalBytesDigest(indexBytes),
		"evidenceIndexArtifactSize":   int64(len(indexBytes)), "shardSetDigest": shardSetDigest,
		"totalShardBytes": totalShardBytes, "totalRecordCount": totalRecordCount,
		"issuedAt": evaluationExportInstant(createdAt.Add(time.Minute)),
	}
	attestedPayloadDigest, err := canonicaljson.Digest(attestationPayload)
	if err != nil {
		t.Fatal(err)
	}
	attestationBase := make(map[string]any, len(attestationPayload)+3)
	for key, value := range attestationPayload {
		attestationBase[key] = value
	}
	attestationBase["algorithm"] = "ed25519"
	attestationBase["attestedPayloadDigest"] = attestedPayloadDigest
	attestationBase["signature"] = strings.Repeat("A", 86)
	attestationDigest, err := canonicaljson.Digest(attestationBase)
	if err != nil {
		t.Fatal(err)
	}
	attestation := make(map[string]any, len(attestationBase)+1)
	for key, value := range attestationBase {
		attestation[key] = value
	}
	attestation["attestationDigest"] = attestationDigest
	rootBase := map[string]any{
		"format": "prodivix.agent-model-evaluation-evidence-root", "version": int64(2),
		"rootId":        "evaluation-evidence-root:" + strings.TrimPrefix(planDigest, "sha256-"),
		"exportLeaseId": exportLeaseID, "exportLeaseDigest": exportLeaseDigest,
		"runConfigArtifactBinding": runConfigArtifactBinding, "sourceConfigDigest": sourceConfigDigest,
		"frozenRunDigest": frozenRunDigest, "planDigest": planDigest, "repositoryCommit": repositoryCommit,
		"evidenceSetDigest": evidenceSetDigest, "bundleDigest": bundleDigest,
		"authorityPayloadDigest": authorityPayloadDigest, "authorityAttestationDigest": authorityAttestationDigest,
		"authorityRoots": authorityRoots, "evaluationManifestDigest": manifestDigest, "indexDigest": indexDigest,
		"evidenceIndexArtifactDigest": evaluationArchiveCanonicalBytesDigest(indexBytes),
		"evidenceIndexArtifactSize":   int64(len(indexBytes)), "shardSetDigest": shardSetDigest,
		"totalShardBytes": totalShardBytes, "totalRecordCount": totalRecordCount,
		"archiveAttestation": attestation, "archiveAttestationDigest": attestationDigest,
		"recordedAt": evaluationExportInstant(createdAt.Add(time.Minute)),
	}
	rootDigest, err := canonicaljson.Digest(rootBase)
	if err != nil {
		t.Fatal(err)
	}
	root := make(map[string]any, len(rootBase)+1)
	for key, value := range rootBase {
		root[key] = value
	}
	root["rootDigest"] = rootDigest
	closure := map[string]any{
		"exportLeaseId": exportLeaseID, "exportLeaseDigest": exportLeaseDigest,
		"evidenceIndex": index, "archiveAttestation": attestation, "evidenceRoot": root,
	}
	canonical, err := canonicaljson.Bytes(closure)
	if err != nil {
		t.Fatal(err)
	}
	return canonical
}

func TestEvaluationArchiveClosureExactDecode(t *testing.T) {
	planDigest := evaluationArchiveTestDigest(t, "plan")
	source := evaluationArchiveTestClosure(t, planDigest, strings.Repeat("a", 40), time.Date(2026, 8, 8, 9, 0, 0, 0, time.UTC))
	closure, err := decodeEvaluationArchiveClosure(source)
	if err != nil {
		t.Fatal(err)
	}
	if closure.Index.PlanDigest != planDigest ||
		closure.Index.TotalRecordCount != 12+maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords ||
		closure.Root.RootDigest == "" || closure.Attestation.AttestedPayloadDigest == "" {
		t.Fatalf("unexpected archive closure decode: %#v", closure.EvaluationArchiveClosureRecord)
	}

	var value map[string]any
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	if err := decoder.Decode(&value); err != nil {
		t.Fatal(err)
	}
	value["unexpected"] = true
	drifted, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeEvaluationArchiveClosure(drifted); err == nil {
		t.Fatal("archive closure accepted an extra top-level field")
	}
}

func TestEvaluationArchivePhysicalCapacityIncludesExactIndexAndRootBytes(t *testing.T) {
	indexBytes := int64(maximumEvaluationArchiveIndexBytes)
	rootBytes := int64(maximumEvaluationArchiveRootBytes)
	shardBytesAtCeiling := maximumEvaluationExportArchiveBytes - indexBytes - rootBytes
	if err := validateEvaluationArchivePhysicalCapacity(
		shardBytesAtCeiling, indexBytes, indexBytes, rootBytes,
	); err != nil {
		t.Fatalf("exact physical archive ceiling was rejected: %v", err)
	}
	if err := validateEvaluationArchivePhysicalCapacity(
		shardBytesAtCeiling+1, indexBytes, indexBytes, rootBytes,
	); err == nil {
		t.Fatal("physical archive capacity accepted one byte above the combined ceiling")
	}
	if err := validateEvaluationArchivePhysicalCapacity(
		shardBytesAtCeiling, indexBytes-1, indexBytes, rootBytes,
	); err == nil {
		t.Fatal("physical archive capacity accepted a drifted index artifact size")
	}
}

func TestEvaluationArchiveAuthorityRootsRequireSmokeValidationAndExactReviewBinding(t *testing.T) {
	roots := evaluationArchiveTestAuthorityRoots(t)
	if _, _, err := decodeEvaluationArchiveAuthorityRoots(roots); err != nil {
		t.Fatalf("complete archive authority roots were rejected: %v", err)
	}
	delete(roots, "endpointSmokeValidationFailureReceiptSetDigest")
	if _, _, err := decodeEvaluationArchiveAuthorityRoots(roots); err == nil {
		t.Fatal("archive authority roots accepted a missing endpoint-smoke validation-failure root")
	}
	roots = evaluationArchiveTestAuthorityRoots(t)
	roots["reviewLeaseDigest"] = "sha256-invalid"
	if _, _, err := decodeEvaluationArchiveAuthorityRoots(roots); err == nil {
		t.Fatal("archive authority roots accepted an invalid optional review lease digest")
	}
}

type evaluationArchiveClosureFakeRepository struct {
	*evaluationServiceFakeRepository
	record    EvaluationArchiveClosureRecord
	storeCall int
	getCall   int
	replayed  bool
}

func (repository *evaluationArchiveClosureFakeRepository) StoreEvaluationArchiveClosure(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	source []byte,
	_ string,
	verifier EvaluationAuthorityAttestationVerifier,
) (EvaluationArchiveClosureRecord, bool, error) {
	repository.storeCall++
	closure, err := decodeEvaluationArchiveClosure(source)
	if err != nil {
		return EvaluationArchiveClosureRecord{}, false, err
	}
	if err := verifier(ctx, EvaluationAuthorityAttestationVerification{
		AuthorityID: closure.Attestation.AuthorityID, KeyID: closure.Attestation.KeyID, Algorithm: "ed25519",
		AttestedPayloadDigest: closure.Attestation.AttestedPayloadDigest,
		AttestedPayloadBytes:  closure.Attestation.AttestedPayloadBytes,
		SignatureBase64URL:    closure.Attestation.Signature,
	}); err != nil {
		return EvaluationArchiveClosureRecord{}, false, err
	}
	record := closure.EvaluationArchiveClosureRecord
	record.NamespaceID, record.Partition = authority.NamespaceID, partition
	repository.record = record
	return record, repository.replayed, nil
}

func (repository *evaluationArchiveClosureFakeRepository) GetEvaluationArchiveClosure(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	_ string,
) (EvaluationArchiveClosureRecord, error) {
	repository.getCall++
	if len(repository.record.ClosureBytes) == 0 {
		return EvaluationArchiveClosureRecord{}, ErrNotFound
	}
	return repository.record, nil
}

func TestEvaluationServiceArchiveClosurePutAndGetExactReplay(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	source := evaluationArchiveTestClosure(t, plan.PlanDigest, plan.RepositoryCommit, plan.PlannedAt.Add(time.Minute))
	repository := &evaluationArchiveClosureFakeRepository{evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan}}
	verificationCalls := 0
	handler := newEvaluationServiceTestHandler(t, repository, func(_ context.Context, input EvaluationAuthorityAttestationVerification) error {
		verificationCalls++
		if input.Algorithm != "ed25519" || input.AttestedPayloadDigest == "" || len(input.AttestedPayloadBytes) == 0 {
			return ErrUnauthorized
		}
		return nil
	})
	request := authorizedEvaluationServiceRequest(http.MethodPut, evaluationServiceTestURL(plan, "archive-closure"), bytes.NewReader(source))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated || repository.storeCall != 1 || verificationCalls != 1 {
		t.Fatalf("unexpected archive closure PUT: status=%d body=%s", response.Code, response.Body.String())
	}
	var acknowledgement map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &acknowledgement); err != nil || acknowledgement["replayed"] != false {
		t.Fatalf("unexpected archive closure acknowledgement: %s", response.Body.String())
	}

	getRequest := authorizedEvaluationServiceRequest(http.MethodGet, evaluationServiceTestURL(plan, "archive-closure"), bytes.NewReader(nil))
	getRequest.Header.Del("Content-Type")
	getResponse := httptest.NewRecorder()
	handler.ServeHTTP(getResponse, getRequest)
	if getResponse.Code != http.StatusOK || repository.getCall != 1 || strings.Contains(getResponse.Body.String(), "replayed") {
		t.Fatalf("unexpected archive closure GET: status=%d body=%s", getResponse.Code, getResponse.Body.String())
	}
}
