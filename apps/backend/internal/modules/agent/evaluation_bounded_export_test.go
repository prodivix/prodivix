package agent

import (
	"encoding/json"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func TestEvaluationEvidenceExportMaterializesEveryEndpointSmokeAuthorityFamily(t *testing.T) {
	expectedTables := map[string]string{
		"endpointSmokeDispatchIntents":                "agent_evaluation_endpoint_smoke_dispatch_intents",
		"endpointSmokeTransportReceipts":              "agent_evaluation_endpoint_smoke_transport_receipts",
		"endpointSmokeResultSpoolReceipts":            "agent_evaluation_endpoint_smoke_result_spool_receipts",
		"endpointSmokeResultSpoolDispositionReceipts": "agent_evaluation_endpoint_smoke_spool_disposition_receipts",
		"endpointSmokeValidationFailureReceipts":      "agent_evaluation_endpoint_smoke_validation_failure_receipts",
		"endpointSmokeReceipts":                       "agent_evaluation_endpoint_smoke_terminal_receipts",
	}
	seen := make(map[string]bool, len(expectedTables))
	for _, spec := range evaluationExportFamilySpecs() {
		expected, exists := expectedTables[spec.Family]
		if !exists {
			continue
		}
		if spec.Inline || spec.SourceTable != expected || spec.SourceBytesColumn == "" || spec.OrderExpression == "" {
			t.Fatalf("endpoint smoke export family %s is not materialized from %s: %#v", spec.Family, expected, spec)
		}
		seen[spec.Family] = true
	}
	if len(seen) != len(expectedTables) {
		t.Fatalf("endpoint smoke export materializers are incomplete: %#v", seen)
	}
}

func evaluationBoundedExportTestDigest(t *testing.T, label string) string {
	t.Helper()
	digest, err := canonicaljson.Digest(map[string]any{"label": label})
	if err != nil {
		t.Fatal(err)
	}
	return digest
}

func evaluationBoundedExportTestRoots(digest string) EvaluationEvidenceArchiveAuthorityRoots {
	return EvaluationEvidenceArchiveAuthorityRoots{
		CapabilityProbeAdmissionSetDigest:                                    digest,
		CapabilityProbeReferenceReceiptSetDigest:                             digest,
		RuntimeFactSourceOwnerRegistrationSetDigest:                          digest,
		CapabilityProbeProviderResourceCleanupSetDigest:                      digest,
		HostedRetrievalRuntimeResourceLifecycleJournalSetDigest:              digest,
		HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest: digest,
		HostedRetrievalRuntimeResourceCleanupSetDigest:                       digest,
		CapabilityEffectProviderRuntimeJournalSetDigest:                      digest,
		OptionalCapabilityFactSourceSetDigest:                                digest,
		OptionalCapabilityFactAuthoritySetDigest:                             digest,
		EndpointSmokeSetDigest:                                               digest, EndpointSmokeDispatchIntentSetDigest: digest,
		EndpointSmokeTransportReceiptSetDigest: digest, EndpointSmokeResultSpoolReceiptSetDigest: digest,
		EndpointSmokeResultSpoolDispositionReceiptSetDigest: digest,
		EndpointSmokeValidationFailureReceiptSetDigest:      digest,
		PreDispatchFailureReceiptSetDigest:                  digest, TransportDispatchIntentSetDigest: digest,
		TransportReceiptSetDigest: digest, ProviderResultSpoolReceiptSetDigest: digest,
		ProviderResultSpoolDispositionReceiptSetDigest: digest, InvocationTurnReceiptSetDigest: digest,
		InvocationTurnSetReceiptSetDigest: digest, ResultSubmissionReceiptSetDigest: digest,
		AttemptAuthorityOwnerReceiptSetDigest: digest,
		ControlledRuntimeReceiptSetDigest:     digest, CapabilityExecutionReceiptSetDigest: digest,
		CapabilitySpecificReceiptSetDigest:            digest,
		ProviderCapabilityObservationReceiptSetDigest: digest,
		VerificationAttemptGrantReceiptSetDigest:      digest, ValidatedHumanReviewArtifactSetDigest: digest,
		ValidatedHumanMetricObservationSetDigest: digest,
		ReviewRasterScanReceiptSetDigest:         digest, ReviewCandidateRefSetDigest: digest,
		BlindReviewMappingSetDigest: digest, SourceReceiptSetDigest: digest,
		ExecutionReceiptSetDigest: digest, HoldoutExecutionReceiptDigest: digest,
		SecretCanarySetDigest: digest, ProtectedHoldoutCanarySetDigest: digest,
	}
}

func TestEvaluationEvidenceExportUsesExactV46AuthorityFamilyOrder(t *testing.T) {
	if len(evaluationEvidenceExportFamilies) != 46 {
		t.Fatalf("export family count=%d, want 46", len(evaluationEvidenceExportFamilies))
	}
	cleanupIndex, cleanupOK := evaluationExportFamilyIndex("capabilityProbeProviderResourceCleanups")
	lifecycleIndex, lifecycleOK := evaluationExportFamilyIndex("hostedRetrievalRuntimeResourceLifecycleJournals")
	hostedIndex, hostedOK := evaluationExportFamilyIndex("hostedRetrievalRuntimeResourceCleanups")
	journalIndex, journalOK := evaluationExportFamilyIndex("capabilityEffectProviderRuntimeJournals")
	sourceIndex, sourceOK := evaluationExportFamilyIndex("optionalCapabilityFactSources")
	if !cleanupOK || !lifecycleOK || !hostedOK || !journalOK || !sourceOK ||
		lifecycleIndex != cleanupIndex+1 || hostedIndex != lifecycleIndex+1 || journalIndex != hostedIndex+1 || sourceIndex != journalIndex+1 {
		t.Fatalf("v46 authority family order drifted: cleanup=%d lifecycle=%d hosted=%d journal=%d source=%d", cleanupIndex, lifecycleIndex, hostedIndex, journalIndex, sourceIndex)
	}
}

func TestEvaluationEvidenceArchiveCapacityCoversFrozenDenominator(t *testing.T) {
	if maximumEvaluationPlannedAttempts != 14_040 || maximumEvaluationObservationRecords != 98_280 {
		t.Fatalf("capacity attempts=%d observations=%d", maximumEvaluationPlannedAttempts, maximumEvaluationObservationRecords)
	}
	if err := validateEvaluationProviderCapabilityObservationCapacity(
		maximumEvaluationObservationRecords, maximumEvaluationObservationBytes,
	); err != nil {
		t.Fatalf("maximum observation family was rejected: %v", err)
	}
	for _, input := range []struct {
		count int64
		bytes int64
	}{
		{maximumEvaluationObservationRecords + 1, maximumEvaluationObservationBytes},
		{maximumEvaluationObservationRecords, maximumEvaluationObservationBytes + 1},
	} {
		if err := validateEvaluationProviderCapabilityObservationCapacity(input.count, input.bytes); err == nil {
			t.Fatalf("over-capacity observation family was accepted: %#v", input)
		}
	}
	threeAuthorityFamiliesBytes := maximumEvaluationPlannedAttempts * (maximumEvaluationAttemptAuthorityOwnersPerAttempt*maximumEvaluationAttemptAuthorityOwnerReceiptBytes +
		maximumEvaluationCapabilitySpecificPerAttempt*maximumEvaluationCapabilitySpecificReceiptBytes +
		maximumEvaluationProviderCapabilityObservationTurns*maximumEvaluationProviderCapabilityObservationBytes)
	qualificationAuthorityArchiveBytes := maximumEvaluationCapabilityProbeAdmissionWrapperArchiveBytes +
		maximumEvaluationCapabilityProbeReferenceWrapperArchiveBytes +
		maximumEvaluationRuntimeFactSourceRegistrationArchiveBytes +
		maximumEvaluationCapabilityProbeProviderResourceCleanupArchiveFamily +
		maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveFamilyBytes +
		maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamilyBytes +
		maximumEvaluationCapabilityEffectProviderRuntimeArchiveFamilyBytes +
		maximumEvaluationOptionalFactCombinedArchiveBytes
	allAuthorityArchiveBytes := threeAuthorityFamiliesBytes + qualificationAuthorityArchiveBytes
	if allAuthorityArchiveBytes != 8_137_969_664 || allAuthorityArchiveBytes >= maximumEvaluationExportArchiveBytes {
		t.Fatalf("authority family capacity=%d archive=%d", allAuthorityArchiveBytes, maximumEvaluationExportArchiveBytes)
	}
	if err := validateEvaluationExportArchiveCapacity(1, allAuthorityArchiveBytes); err != nil {
		t.Fatalf("frozen authority aggregate was rejected: %v", err)
	}
	if err := validateEvaluationExportArchiveCapacity(1, maximumEvaluationExportArchiveBytes+1); err == nil {
		t.Fatal("8 GiB archive capacity accepted one extra byte")
	}
	if err := validateEvaluationCapabilityProbeArchiveFamilyBounds(
		maximumEvaluationCapabilityProbeAdmissions, maximumEvaluationCapabilityProbeAdmissionArchiveBytes,
		maximumEvaluationCapabilityProbeReferences, maximumEvaluationCapabilityProbeReferenceArchiveBytes,
	); err != nil {
		t.Fatalf("maximum probe raw families were rejected: %v", err)
	}
	for _, input := range []struct {
		admissions, admissionBytes, references, referenceBytes int64
	}{
		{maximumEvaluationCapabilityProbeAdmissions + 1, 0, 0, 0},
		{0, maximumEvaluationCapabilityProbeAdmissionArchiveBytes + 1, 0, 0},
		{0, 0, maximumEvaluationCapabilityProbeReferences + 1, 0},
		{0, 0, 0, maximumEvaluationCapabilityProbeReferenceArchiveBytes + 1},
	} {
		if err := validateEvaluationCapabilityProbeArchiveFamilyBounds(
			input.admissions, input.admissionBytes, input.references, input.referenceBytes,
		); err == nil {
			t.Fatalf("over-capacity probe raw family was accepted: %#v", input)
		}
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveCapacity(
		maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords,
		maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamilyBytes,
	); err != nil {
		t.Fatalf("maximum hosted retrieval runtime resource cleanup family was rejected: %v", err)
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveCapacity(
		maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecords,
		maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveFamilyBytes,
	); err != nil {
		t.Fatalf("maximum hosted lifecycle journal semantic family was rejected: %v", err)
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalPhysicalArchiveCapacity(
		maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecords,
		maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalPhysicalFamilyBytes,
	); err != nil {
		t.Fatalf("maximum hosted lifecycle journal physical family was rejected: %v", err)
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveCapacity(0, 0); err != nil {
		t.Fatalf("absent hosted lifecycle journal semantic family was rejected: %v", err)
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalPhysicalArchiveCapacity(0, 0); err != nil {
		t.Fatalf("absent hosted lifecycle journal physical family was rejected: %v", err)
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalPhysicalRecordCapacity(
		maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalPhysicalRecordBytes,
	); err != nil {
		t.Fatalf("maximum hosted lifecycle journal physical record was rejected: %v", err)
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalPhysicalRecordCapacity(
		maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalPhysicalRecordBytes + 1,
	); err == nil {
		t.Fatal("hosted lifecycle journal physical record accepted one extra byte")
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecordCapacity(
		maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecordBytes,
	); err != nil {
		t.Fatalf("maximum hosted lifecycle journal semantic record was rejected: %v", err)
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecordCapacity(
		maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecordBytes + 1,
	); err == nil {
		t.Fatal("hosted lifecycle journal semantic record accepted one extra byte")
	}
	for _, invalid := range []struct{ count, bytes int64 }{
		{-1, 0},
		{maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecords + 1, 0},
		{maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecords, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveFamilyBytes + 1},
	} {
		if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveCapacity(invalid.count, invalid.bytes); err == nil {
			t.Fatalf("invalid hosted lifecycle journal semantic family was accepted: %#v", invalid)
		}
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalPhysicalArchiveCapacity(
		maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecords,
		maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalPhysicalFamilyBytes+1,
	); err == nil {
		t.Fatal("hosted lifecycle journal physical family accepted one extra byte")
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveCapacity(0, 0); err != nil {
		t.Fatalf("absent hosted retrieval runtime resource cleanup family was rejected: %v", err)
	}
	for _, input := range []struct {
		count int64
		bytes int64
	}{
		{1, 0},
		{3, 0},
		{5, 0},
		{maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords, maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamilyBytes + 1},
	} {
		if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveCapacity(input.count, input.bytes); err == nil {
			t.Fatalf("invalid hosted retrieval runtime resource cleanup family was accepted: %#v", input)
		}
	}
	if err := validateEvaluationCapabilityEffectProviderRuntimeArchiveCapacity(
		maximumEvaluationCapabilityEffectProviderRuntimeArchiveRecords,
		maximumEvaluationCapabilityEffectProviderRuntimeArchiveFamilyBytes,
	); err != nil {
		t.Fatalf("maximum capability effect Provider-runtime journal family was rejected: %v", err)
	}
	for _, input := range []struct {
		count int64
		bytes int64
	}{
		{maximumEvaluationCapabilityEffectProviderRuntimeArchiveRecords + 1, 0},
		{maximumEvaluationCapabilityEffectProviderRuntimeArchiveRecords, maximumEvaluationCapabilityEffectProviderRuntimeArchiveFamilyBytes + 1},
	} {
		if err := validateEvaluationCapabilityEffectProviderRuntimeArchiveCapacity(input.count, input.bytes); err == nil {
			t.Fatalf("over-capacity capability effect Provider-runtime journal family was accepted: %#v", input)
		}
	}
}

func TestEvaluationHostedLifecycleJournalArchiveRootUsesSortedUniqueRecordDigests(t *testing.T) {
	digests := []string{
		evaluationBoundedExportTestDigest(t, "hosted-lifecycle-record-d"),
		evaluationBoundedExportTestDigest(t, "hosted-lifecycle-record-b"),
		evaluationBoundedExportTestDigest(t, "hosted-lifecycle-record-a"),
		evaluationBoundedExportTestDigest(t, "hosted-lifecycle-record-c"),
	}
	records := make([]EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord, len(digests))
	for index, digest := range digests {
		records[index] = EvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord{
			ArchiveRecordDigest: digest,
			RecordBytes:         []byte(`{}`),
		}
	}
	root, err := evaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRoot(records)
	if err != nil {
		t.Fatalf("hosted lifecycle semantic root was rejected: %v", err)
	}
	sorted := append([]string(nil), digests...)
	sort.Strings(sorted)
	expected, err := canonicaljson.Digest(map[string]any{"recordDigests": sorted})
	if err != nil {
		t.Fatal(err)
	}
	if root != expected {
		t.Fatalf("hosted lifecycle semantic root=%q want=%q", root, expected)
	}
	records[3].ArchiveRecordDigest = records[0].ArchiveRecordDigest
	if _, err := evaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRoot(records); err == nil {
		t.Fatal("hosted lifecycle semantic root accepted a duplicate archiveRecordDigest")
	}
}

func TestEvaluationHostedLifecycleReleaseArchiveRequiresEightToEightyEightRecords(t *testing.T) {
	for _, count := range []int64{
		minimumEvaluationHostedRetrievalRuntimeResourceLifecycleReleaseArchiveRecords,
		maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecords,
	} {
		if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleReleaseRecordCount(count); err != nil {
			t.Fatalf("release record count %d was rejected: %v", count, err)
		}
	}
	for _, count := range []int64{
		minimumEvaluationHostedRetrievalRuntimeResourceLifecycleReleaseArchiveRecords - 1,
		maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecords + 1,
	} {
		if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleReleaseRecordCount(count); err == nil {
			t.Fatalf("release record count %d was accepted", count)
		}
	}
}

func evaluationHostedCleanupArchivePlanFixture(t *testing.T, intentCount int) evaluationPlanFact {
	t.Helper()
	identities := [][2]string{
		{"openai-responses", "g4-provider-hosted-retrieval-core"},
		{"openai-responses", "g4-provider-hosted-retrieval-document"},
		{"gemini-interactions", "g4-provider-hosted-retrieval-core"},
		{"gemini-interactions", "g4-provider-hosted-retrieval-document"},
	}
	targets := make([]any, intentCount)
	for index := 0; index < intentCount; index++ {
		identity := identities[index%len(identities)]
		protocol, profileID := identity[0], identity[1]
		targets[index] = map[string]any{
			"protocolFamily": protocol, "capabilityProfileId": profileID,
			"optionalCapabilitySupportAuthority": map[string]any{
				"capabilityId": "provider.hosted-retrieval",
				"runtimeFactSourceAuthority": map[string]any{
					"capabilityId": "provider.hosted-retrieval", "protocolFamily": protocol, "capabilityProfileId": profileID,
					"hostedRetrievalRuntimeResourceRegistrationIntentDigest": evaluationBoundedExportTestDigest(t, profileID),
				},
			},
		}
	}
	return evaluationPlanFact{Value: map[string]any{"capabilityQualificationTargets": targets}}
}

func TestEvaluationHostedCleanupArchivePlanCompletenessIsZeroOrExactFour(t *testing.T) {
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchivePlan(
		evaluationHostedCleanupArchivePlanFixture(t, 0), nil,
	); err != nil {
		t.Fatalf("plan without hosted intents rejected an absent cleanup archive: %v", err)
	}
	records := make([]EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord,
		maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords)
	for index := range records {
		records[index].RecordBytes = []byte(`{}`)
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchivePlan(
		evaluationHostedCleanupArchivePlanFixture(t, 4), records,
	); err != nil {
		t.Fatalf("plan with exact four hosted intents rejected its cleanup archive: %v", err)
	}
	for _, intentCount := range []int{1, 3, 5} {
		if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchivePlan(
			evaluationHostedCleanupArchivePlanFixture(t, intentCount), nil,
		); err == nil {
			t.Fatalf("plan with %d hosted intents was accepted", intentCount)
		}
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchivePlan(
		evaluationHostedCleanupArchivePlanFixture(t, 4), nil,
	); err == nil {
		t.Fatal("plan with hosted intents accepted an absent cleanup archive")
	}
	foreign := evaluationHostedCleanupArchivePlanFixture(t, 4)
	foreignTarget := foreign.Value["capabilityQualificationTargets"].([]any)[0].(map[string]any)
	foreignTarget["capabilityProfileId"] = "g4-provider-hosted-retrieval-foreign"
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchivePlan(foreign, records); err == nil {
		t.Fatal("hosted cleanup archive accepted a foreign protocol/profile identity")
	}
	nestedDrift := evaluationHostedCleanupArchivePlanFixture(t, 4)
	nestedTarget := nestedDrift.Value["capabilityQualificationTargets"].([]any)[0].(map[string]any)
	nestedAuthority := nestedTarget["optionalCapabilitySupportAuthority"].(map[string]any)["runtimeFactSourceAuthority"].(map[string]any)
	nestedAuthority["capabilityProfileId"] = "g4-provider-hosted-retrieval-document"
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchivePlan(nestedDrift, records); err == nil {
		t.Fatal("hosted cleanup archive accepted a nested runtime authority profile drift")
	}
}

func evaluationHostedCleanupArchiveRecordsFixture(
	t *testing.T,
	count int,
) []EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord {
	t.Helper()
	records := make([]EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord, count)
	for index := range records {
		label := "hosted-cleanup-archive-" + evaluationExportInteger(int64(index))
		records[index] = EvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecord{
			RepositoryCommit: strings.Repeat("a", 40), RuntimeResourceSetID: "runtime-resource-set." + evaluationExportInteger(int64(index)),
			AuthorityDigest: evaluationBoundedExportTestDigest(t, label+".authority"),
			RecordDigest:    evaluationBoundedExportTestDigest(t, label+".record"), RecordBytes: []byte(`{}`),
		}
	}
	return records
}

func TestEvaluationHostedCleanupArchiveRootAcceptsZeroOrExactFour(t *testing.T) {
	emptyRoot, err := evaluationHostedRetrievalRuntimeResourceCleanupArchiveRoot(nil)
	if err != nil {
		t.Fatalf("empty hosted cleanup archive root was rejected: %v", err)
	}
	emptyWant, err := canonicaljson.Digest(map[string]any{"recordDigests": []string{}})
	if err != nil || emptyRoot != emptyWant {
		t.Fatalf("empty hosted cleanup root=%s want=%s err=%v", emptyRoot, emptyWant, err)
	}
	records := evaluationHostedCleanupArchiveRecordsFixture(t, 4)
	root, err := evaluationHostedRetrievalRuntimeResourceCleanupArchiveRoot(records)
	if err != nil {
		t.Fatalf("exact-four hosted cleanup archive root was rejected: %v", err)
	}
	digests := make([]string, len(records))
	for index, record := range records {
		digests[index] = record.RecordDigest
	}
	sort.Strings(digests)
	want, err := canonicaljson.Digest(map[string]any{"recordDigests": digests})
	if err != nil || root != want {
		t.Fatalf("hosted cleanup root=%s want=%s err=%v", root, want, err)
	}
	for _, count := range []int{1, 3, 5} {
		if _, err := evaluationHostedRetrievalRuntimeResourceCleanupArchiveRoot(
			evaluationHostedCleanupArchiveRecordsFixture(t, count),
		); err == nil {
			t.Fatalf("hosted cleanup archive root accepted %d records", count)
		}
	}
	overCapacity := evaluationHostedCleanupArchiveRecordsFixture(t, 4)
	overCapacity[0].RecordBytes = make([]byte, maximumEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecordBytes+1)
	if _, err := evaluationHostedRetrievalRuntimeResourceCleanupArchiveRoot(overCapacity); err == nil {
		t.Fatal("hosted cleanup archive root accepted a record one byte above its limit")
	}
}

func TestEvaluationOptionalFactCapacityIsDerivedFromFrozenPlan(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	plannedTurns, err := evaluationOptionalFactPlannedTurnDenominator(plan)
	if err != nil {
		t.Fatal(err)
	}
	if plannedTurns != 5_880 {
		t.Fatalf("optional planned turns=%d, want frozen 5,880", plannedTurns)
	}
	if maximumEvaluationOptionalFactAuthorityRecords != 5_880 {
		t.Fatalf("optional fact hard capacity=%d, want frozen 5,880", maximumEvaluationOptionalFactAuthorityRecords)
	}
}

func evaluationProviderRuntimeJournalBridgeFixture(t *testing.T) (
	EvaluationCapabilityEffectProviderRuntimeArchiveRecord,
	EvaluationOptionalFactSourceArchiveRecord,
) {
	t.Helper()
	attemptID := "evaluation-attempt:test-provider-runtime-journal"
	turnIndex := int64(2)
	innerOwnerRequestDigest := evaluationBoundedExportTestDigest(t, "inner-provider-runtime-owner-request")
	journalResultRecordDigest := evaluationBoundedExportTestDigest(t, "provider-runtime-journal-result")
	resultSealReceiptDigest := evaluationBoundedExportTestDigest(t, "provider-runtime-result-seal")
	intentBase := map[string]any{
		"attemptId": attemptID, "turnIndex": turnIndex, "ownerRequestDigest": innerOwnerRequestDigest,
	}
	preEffectIntentDigest, err := canonicaljson.Digest(intentBase)
	if err != nil {
		t.Fatal(err)
	}
	intent := cloneEvaluationObject(intentBase)
	intent["intentDigest"] = preEffectIntentDigest
	intentBytes, err := canonicaljson.Bytes(intent)
	if err != nil {
		t.Fatal(err)
	}
	effectReceiptBase := map[string]any{
		"intentDigest": preEffectIntentDigest, "ownerRequestDigest": innerOwnerRequestDigest,
		"providerRuntimeJournalResultRecordDigest": journalResultRecordDigest,
		"providerRuntimeResultSealReceiptDigest":   resultSealReceiptDigest,
	}
	effectSourceReceiptDigest, err := canonicaljson.Digest(effectReceiptBase)
	if err != nil {
		t.Fatal(err)
	}
	effectReceipt := cloneEvaluationObject(effectReceiptBase)
	effectReceipt["receiptDigest"] = effectSourceReceiptDigest
	effectReceiptBytes, err := canonicaljson.Bytes(effectReceipt)
	if err != nil {
		t.Fatal(err)
	}
	outerControlledOwnerRequestDigest := evaluationBoundedExportTestDigest(t, "outer-controlled-owner-request")
	sourceReceiptBytes, err := canonicaljson.Bytes(map[string]any{
		"ownerRequestDigest":                       outerControlledOwnerRequestDigest,
		"preEffectIntentDigest":                    preEffectIntentDigest,
		"effectSourceReceiptDigest":                effectSourceReceiptDigest,
		"providerRuntimeJournalResultRecordDigest": journalResultRecordDigest,
		"providerRuntimeResultSealReceiptDigest":   resultSealReceiptDigest,
	})
	if err != nil {
		t.Fatal(err)
	}
	recordDigest := evaluationBoundedExportTestDigest(t, "provider-runtime-journal-archive-record")
	return EvaluationCapabilityEffectProviderRuntimeArchiveRecord{
			AttemptID: attemptID, TurnIndex: turnIndex, OwnerRequestDigest: innerOwnerRequestDigest,
			PreEffectIntentDigest: preEffectIntentDigest, EffectSourceReceiptDigest: effectSourceReceiptDigest,
			ProviderRuntimeJournalResultRecordDigest: journalResultRecordDigest,
			ProviderRuntimeResultSealReceiptDigest:   resultSealReceiptDigest,
			RecordDigest:                             recordDigest, RecordBytes: []byte(`{}`),
		}, EvaluationOptionalFactSourceArchiveRecord{
			AttemptID: attemptID, TurnIndex: turnIndex, ReceiptBytes: sourceReceiptBytes,
			PreEffectIntentBytes: intentBytes, EffectSourceReceiptBytes: effectReceiptBytes,
			RecordDigest: evaluationBoundedExportTestDigest(t, "shared-effect-source-archive-record"),
			RecordBytes:  []byte(`{}`),
		}
}

func TestEvaluationProviderRuntimeJournalArchiveRequiresExactSharedEffectSourceBijection(t *testing.T) {
	journal, source := evaluationProviderRuntimeJournalBridgeFixture(t)
	if err := validateEvaluationCapabilityEffectProviderRuntimeArchiveSources(
		[]EvaluationCapabilityEffectProviderRuntimeArchiveRecord{journal},
		[]EvaluationOptionalFactSourceArchiveRecord{source},
	); err != nil {
		t.Fatalf("exact Provider-runtime journal source bridge was rejected: %v", err)
	}

	driftedJournal := journal
	driftedJournal.ProviderRuntimeResultSealReceiptDigest = evaluationBoundedExportTestDigest(t, "swapped-result-seal")
	if err := validateEvaluationCapabilityEffectProviderRuntimeArchiveSources(
		[]EvaluationCapabilityEffectProviderRuntimeArchiveRecord{driftedJournal},
		[]EvaluationOptionalFactSourceArchiveRecord{source},
	); err == nil {
		t.Fatal("Provider-runtime journal accepted a swapped shared-effect terminal seal")
	}
	if err := validateEvaluationCapabilityEffectProviderRuntimeArchiveSources(
		nil, []EvaluationOptionalFactSourceArchiveRecord{source},
	); err == nil {
		t.Fatal("Provider-runtime journal accepted an unmatched shared-effect source")
	}
	halfPresentSource := source
	halfPresentSource.EffectSourceReceiptBytes = nil
	if err := validateEvaluationCapabilityEffectProviderRuntimeArchiveSources(
		[]EvaluationCapabilityEffectProviderRuntimeArchiveRecord{journal},
		[]EvaluationOptionalFactSourceArchiveRecord{halfPresentSource},
	); err == nil {
		t.Fatal("Provider-runtime journal accepted a half-present shared-effect owner preimage")
	}
}

func TestEvaluationProviderRuntimeJournalArchiveRootUsesSortedUniqueRecordDigests(t *testing.T) {
	first := evaluationBoundedExportTestDigest(t, "journal-root-first")
	second := evaluationBoundedExportTestDigest(t, "journal-root-second")
	records := []EvaluationCapabilityEffectProviderRuntimeArchiveRecord{
		{RecordDigest: second, RecordBytes: []byte(`{}`)},
		{RecordDigest: first, RecordBytes: []byte(`{}`)},
	}
	root, err := evaluationCapabilityEffectProviderRuntimeArchiveRoot(records)
	if err != nil {
		t.Fatalf("valid Provider-runtime journal archive root was rejected: %v", err)
	}
	digests := []string{first, second}
	sort.Strings(digests)
	want, err := canonicaljson.Digest(map[string]any{"recordDigests": digests})
	if err != nil {
		t.Fatal(err)
	}
	if root != want {
		t.Fatalf("Provider-runtime journal root=%s, want %s", root, want)
	}
	records[1].RecordDigest = records[0].RecordDigest
	if _, err := evaluationCapabilityEffectProviderRuntimeArchiveRoot(records); err == nil {
		t.Fatal("Provider-runtime journal archive root accepted a duplicate record digest")
	}
}

func TestEvaluationEvidenceExportSourceBindingIsCanonicalAndIdentityBound(t *testing.T) {
	digest := evaluationBoundedExportTestDigest(t, "binding")
	partition := EvaluationPlanPartition{PlanDigest: digest, RepositoryCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
	valid := EvaluationEvidenceExportSourceBinding{
		RunConfigArtifactBinding: evaluationTestRunConfigArtifactBinding(
			t, partition.PlanDigest, partition.RepositoryCommit, digest, digest,
		),
		SourceConfigDigest: digest, FrozenRunDigest: digest,
	}
	if err := validateEvaluationEvidenceExportSourceBinding(valid); err != nil {
		t.Fatalf("valid source binding was rejected: %v", err)
	}
	driftedSource := valid
	driftedSource.SourceConfigDigest = evaluationBoundedExportTestDigest(t, "source-drift")
	if err := validateEvaluationEvidenceExportSourceBinding(driftedSource); err == nil {
		t.Fatal("source binding accepted a digest outside its artifact binding")
	}
	first, err := evaluationExportLeaseIdentity("namespace.test", partition, evaluationEvidenceExportLeaseKind,
		digest, valid, digest, digest)
	if err != nil {
		t.Fatal(err)
	}
	drifted := valid
	drifted.RunConfigArtifactBinding.SourcePlanArtifactName = "g4-plan-1234567-2"
	drifted.RunConfigArtifactBinding.BindingDigest, _ = canonicaljson.Digest(
		evaluationProductionRunConfigArtifactBindingBase(drifted.RunConfigArtifactBinding),
	)
	second, err := evaluationExportLeaseIdentity("namespace.test", partition, evaluationEvidenceExportLeaseKind,
		digest, drifted, digest, digest)
	if err != nil {
		t.Fatal(err)
	}
	if first == second {
		t.Fatal("export lease identity omitted the frozen run binding")
	}
}

func TestEvaluationEvidenceExportCommitmentsRequireExactReviewLeasePresence(t *testing.T) {
	digest := evaluationBoundedExportTestDigest(t, "commitments")
	families := make([]EvaluationExportFamilySummary, len(evaluationEvidenceExportFamilies))
	for index, family := range evaluationEvidenceExportFamilies {
		families[index] = EvaluationExportFamilySummary{
			Family: family, FamilyIndex: int64(index), ExpectedSemanticDigest: digest,
			ExpectedRecordSetDigest: digest,
		}
	}
	commitments := EvaluationEvidenceArchiveCommitments{
		RunConfigArtifactBinding: evaluationTestRunConfigArtifactBinding(
			t, digest, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", digest, digest,
		),
		SourceConfigDigest: digest, FrozenRunDigest: digest,
		PlanDigest: digest, RepositoryCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		EvidenceSetDigest: digest, AuthorityPayloadDigest: digest, AuthorityAttestationDigest: digest,
		AuthorityRoots: evaluationBoundedExportTestRoots(digest), EvaluationManifestDigest: digest,
		CreatedAt: evaluationExportInstant(time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)),
	}
	if err := validateEvaluationArchiveCommitmentsAgainstFamilies(commitments, families); err != nil {
		t.Fatalf("no-review commitments were rejected: %v", err)
	}
	reviewIndex, ok := evaluationExportFamilyIndex("validatedHumanReviewArtifacts")
	if !ok {
		t.Fatal("validated human review family is missing")
	}
	families[reviewIndex].ExpectedRecordCount = 1
	if err := validateEvaluationArchiveCommitmentsAgainstFamilies(commitments, families); err == nil {
		t.Fatal("review artifact without a review lease digest was accepted")
	}
	commitments.ReviewLeaseDigest = digest
	commitments.AuthorityRoots.ReviewLeaseDigest = digest
	if err := validateEvaluationArchiveCommitmentsAgainstFamilies(commitments, families); err != nil {
		t.Fatalf("review commitments were rejected: %v", err)
	}
	canonical, err := canonicaljson.Bytes(commitments)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := decodeEvaluationExportCommitments(canonical)
	if err != nil || decoded.ReviewLeaseDigest != digest {
		t.Fatalf("canonical commitments did not round trip: decoded=%#v err=%v", decoded, err)
	}
	var withExtra map[string]any
	if err := json.Unmarshal(canonical, &withExtra); err != nil {
		t.Fatal(err)
	}
	withExtra["extra"] = true
	extraBytes, err := canonicaljson.Bytes(withExtra)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeEvaluationExportCommitments(extraBytes); err == nil {
		t.Fatal("persisted export commitments accepted an extra field")
	}
}
