package agent

import (
	"bytes"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func canonicalEvaluationAuthenticityMutation(t *testing.T, value map[string]any, digestField string) []byte {
	t.Helper()
	var err error
	value[digestField], err = canonicaljson.Digest(mapWithoutEvaluationDigest(value, digestField))
	if err != nil {
		t.Fatal(err)
	}
	result, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func TestEvaluationAuthorityCompletionWindowFailsClosed(t *testing.T) {
	manifest := EvaluationArtifactRecord{EvaluationFactRecord: EvaluationFactRecord{
		RecordedAt: mustAgentTime(t, "2026-08-02T04:00:00.000Z"),
	}}
	if err := validateEvaluationAuthorityCompletionWindow(
		mustAgentTime(t, "2026-08-02T04:00:01.000Z"),
		manifest,
		[]EvaluationSourceReceiptRecord{{ObservedAt: mustAgentTime(t, "2026-08-02T03:59:59.000Z")}},
	); err != nil {
		t.Fatalf("valid authority completion window was rejected: %v", err)
	}
	for name, instants := range map[string][2]string{
		"attestation-before-manifest": {"2026-08-02T03:59:59.000Z", "2026-08-02T03:59:59.000Z"},
		"source-after-manifest":       {"2026-08-02T04:00:01.000Z", "2026-08-02T04:00:01.000Z"},
	} {
		t.Run(name, func(t *testing.T) {
			err := validateEvaluationAuthorityCompletionWindow(
				mustAgentTime(t, instants[0]),
				manifest,
				[]EvaluationSourceReceiptRecord{{ObservedAt: mustAgentTime(t, instants[1])}},
			)
			if !errors.Is(err, ErrConflict) {
				t.Fatalf("completion window error = %v, want ErrConflict", err)
			}
		})
	}
}

func TestEvaluationCanonicalBase64URLRejectsNonCanonicalAlias(t *testing.T) {
	canonical := "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
	if len(canonical) != 86 || !evaluationCanonicalBase64URL(canonical, 64) {
		t.Fatal("canonical 64-byte base64url value was rejected")
	}
	alias := canonical[:len(canonical)-1] + "B"
	if evaluationCanonicalBase64URL(alias, 64) {
		t.Fatal("base64url alias with non-zero unused bits must fail closed")
	}
}

func TestDecodeEvaluationInvocationReceiptSupportsAuthorizedPreTransportFailure(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	_, plan := evaluationReadPartition(t, vector)
	fixtures := evaluationAuthenticityFixturesForPlan(t, plan, vector.Facts.Attempt)
	var value map[string]any
	decoder := json.NewDecoder(bytesReader(fixtures.Invocation))
	decoder.UseNumber()
	if err := decoder.Decode(&value); err != nil {
		t.Fatal(err)
	}
	delete(value, "providerRequestId")
	value["executionFailureAuthorityReceiptDigest"] = evaluationFixtureDigest(t, "pre-transport-failure-authority")
	delete(value, "responseArtifactDigest")
	receipt := value["invocationReceipt"].(map[string]any)
	receipt["outcome"] = "provider-error"
	delete(receipt, "responseDigest")
	receipt["receiptDigest"] = evaluationFixtureDigest(t, "temporary")
	receipt["receiptDigest"], _ = canonicaljson.Digest(mapWithoutEvaluationDigest(receipt, "receiptDigest"))
	failedBytes := canonicalEvaluationAuthenticityMutation(t, value, "evidenceDigest")
	decoded, err := decodeEvaluationInvocationReceipt(failedBytes)
	if err != nil {
		t.Fatalf("authorized pre-transport failure was rejected: %v", err)
	}
	if decoded.ProviderRequestID != "" || decoded.ResponseArtifactDigest != "" || decoded.ExecutionFailureAuthorityReceiptDigest == "" {
		t.Fatalf("pre-transport failure binding = %#v", decoded.EvaluationInvocationReceiptRecord)
	}
}

func TestDecodeEvaluationInvocationReceiptRequiresCompletedResponse(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	_, plan := evaluationReadPartition(t, vector)
	fixtures := evaluationAuthenticityFixturesForPlan(t, plan, vector.Facts.Attempt)
	var value map[string]any
	decoder := json.NewDecoder(bytesReader(fixtures.Invocation))
	decoder.UseNumber()
	if err := decoder.Decode(&value); err != nil {
		t.Fatal(err)
	}
	delete(value, "responseArtifactDigest")
	receipt := value["invocationReceipt"].(map[string]any)
	delete(receipt, "responseDigest")
	receipt["receiptDigest"], _ = canonicaljson.Digest(mapWithoutEvaluationDigest(receipt, "receiptDigest"))
	completedBytes := canonicalEvaluationAuthenticityMutation(t, value, "evidenceDigest")
	if _, err := decodeEvaluationInvocationReceipt(completedBytes); err == nil {
		t.Fatal("completed invocation without a response artifact must fail closed")
	}
}

func TestDecodeEvaluationSourceReceiptAcceptsBoundedSourceURI(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	_, plan := evaluationReadPartition(t, vector)
	fixtures := evaluationAuthenticityFixturesForPlan(t, plan, vector.Facts.Attempt)
	var value map[string]any
	decoder := json.NewDecoder(bytesReader(fixtures.EndpointSources[0]))
	decoder.UseNumber()
	if err := decoder.Decode(&value); err != nil {
		t.Fatal(err)
	}
	delete(value, "providerRequestId")
	value["executionFailureAuthorityReceiptDigest"] = evaluationFixtureDigest(t, "source-failure-authority")
	value["sourceUri"] = "https://provider.example/evaluation/usage-receipt"
	sourceBytes := canonicalEvaluationAuthenticityMutation(t, value, "receiptDigest")
	decoded, err := decodeEvaluationSourceReceipt(sourceBytes)
	if err != nil {
		t.Fatalf("bounded source URI receipt was rejected: %v", err)
	}
	if decoded.ProviderRequestID != "" || decoded.ExecutionFailureAuthorityReceiptDigest == "" || decoded.SourceURI == "" {
		t.Fatalf("source URI binding = %#v", decoded.EvaluationSourceReceiptRecord)
	}
}

func TestDecodeEvaluationSourceReceiptRejectsAmbiguousFailureAuthority(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	_, plan := evaluationReadPartition(t, vector)
	fixtures := evaluationAuthenticityFixturesForPlan(t, plan, vector.Facts.Attempt)
	var providerBound map[string]any
	decoder := json.NewDecoder(bytesReader(fixtures.EndpointSources[0]))
	decoder.UseNumber()
	if err := decoder.Decode(&providerBound); err != nil {
		t.Fatal(err)
	}
	providerBound["executionFailureAuthorityReceiptDigest"] = evaluationFixtureDigest(t, "ambiguous-failure-authority")
	if _, err := decodeEvaluationSourceReceipt(canonicalEvaluationAuthenticityMutation(t, providerBound, "receiptDigest")); err == nil {
		t.Fatal("source receipt with provider request and failure authority must fail closed")
	}

	var failureBound map[string]any
	decoder = json.NewDecoder(bytesReader(fixtures.EndpointSources[0]))
	decoder.UseNumber()
	if err := decoder.Decode(&failureBound); err != nil {
		t.Fatal(err)
	}
	delete(failureBound, "providerRequestId")
	failureBound["executionFailureAuthorityReceiptDigest"] = evaluationFixtureDigest(t, "missing-uri-failure-authority")
	if _, err := decodeEvaluationSourceReceipt(canonicalEvaluationAuthenticityMutation(t, failureBound, "receiptDigest")); err == nil {
		t.Fatal("failure-authority source receipt without an auditable URI must fail closed")
	}
}

func TestEvaluationSourceBindingAllowsFrozenPricingAuthorityBeforePlan(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	_, plan := evaluationReadPartition(t, vector)
	fixtures := evaluationAuthenticityFixturesForPlan(t, plan, vector.Facts.Attempt)
	source, err := decodeEvaluationSourceReceipt(fixtures.EndpointSources[0])
	if err != nil {
		t.Fatal(err)
	}
	source.ObservedAt = plan.PlannedAt.Add(-24 * time.Hour)
	source.SourceKind = "pricing-snapshot"
	if err := validateEvaluationSourceBinding(plan, source); err != nil {
		t.Fatalf("frozen pricing authority before plan was rejected: %v", err)
	}
	source.SourceKind = "provider-reported-usage"
	if err := validateEvaluationSourceBinding(plan, source); err == nil {
		t.Fatal("provider-reported usage before the frozen plan window was accepted")
	}
	source.SourceKind = "pricing-snapshot"
	source.ObservedAt = plan.ExpiresAt.Add(time.Millisecond)
	if err := validateEvaluationSourceBinding(plan, source); err == nil {
		t.Fatal("pricing authority after plan expiry was accepted")
	}
}

func TestEvaluationAuthenticityCompletenessBindsEveryReceiptSet(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	_, plan := evaluationReadPartition(t, vector)
	fixtures := evaluationAuthenticityFixturesForPlan(t, plan, vector.Facts.Attempt)
	plan.PlannedJourneyCount = 1
	plan.Value["plannedJourneyCount"] = json.Number("1")
	plan.Value["endpointSmokeTargets"] = plan.Value["endpointSmokeTargets"].([]any)[:1]
	endpoint, err := decodeEvaluationEndpointSmokeReceipt(fixtures.EndpointSmoke)
	if err != nil {
		t.Fatal(err)
	}
	invocation, err := decodeEvaluationInvocationReceipt(fixtures.Invocation)
	if err != nil {
		t.Fatal(err)
	}
	execution, err := decodeEvaluationExecutionReceipt(fixtures.Execution)
	if err != nil {
		t.Fatal(err)
	}
	sources := append(append([][]byte(nil), fixtures.EndpointSources...), fixtures.InvocationSources...)
	sourceRecords := make([]EvaluationSourceReceiptRecord, 0, len(sources))
	for _, sourceBytes := range sources {
		source, err := decodeEvaluationSourceReceipt(sourceBytes)
		if err != nil {
			t.Fatal(err)
		}
		sourceRecords = append(sourceRecords, source.EvaluationSourceReceiptRecord)
	}
	sort.Slice(sourceRecords, func(left, right int) bool {
		return sourceRecords[left].SourceReceiptID < sourceRecords[right].SourceReceiptID
	})
	sets, err := validateEvaluationAuthenticityCompleteness(
		plan,
		[]EvaluationAttemptRecord{{EvaluationFactRecord: EvaluationFactRecord{FactBytes: fixtures.Attempt.Canonical}}},
		[]EvaluationEndpointSmokeReceiptRecord{endpoint.EvaluationEndpointSmokeReceiptRecord},
		[]EvaluationInvocationReceiptRecord{invocation.EvaluationInvocationReceiptRecord},
		sourceRecords,
		[]EvaluationExecutionReceiptRecord{execution.EvaluationExecutionReceiptRecord},
	)
	if err != nil {
		t.Fatalf("complete authenticity set was rejected: %v", err)
	}
	for name, digest := range map[string]string{
		"endpoint": sets.EndpointSmoke, "invocation": sets.Invocation,
		"source": sets.Source, "execution": sets.Execution,
	} {
		if !evaluationDigestPattern.MatchString(digest) {
			t.Fatalf("%s set digest = %q", name, digest)
		}
	}
}

func TestEvaluationExportSemanticFinalizationBindsHostedCleanupAndProviderRuntimeJournalRoots(t *testing.T) {
	digest := evaluationBoundedExportTestDigest(t, "semantic-finalization")
	attestation := EvaluationAuthorityAttestationRecord{
		PlanDigest: digest, RepositoryCommit: strings.Repeat("a", 40), EvidenceSetDigest: digest,
		HostedRetrievalRuntimeResourceLifecycleJournalSetDigest: digest,
		HostedRetrievalRuntimeResourceCleanupSetDigest:          digest,
		CapabilityEffectProviderRuntimeJournalSetDigest:         digest,
		AttestationDigest: digest,
	}
	root := EvaluationEvidenceRootRecord{
		PlanDigest: attestation.PlanDigest, RepositoryCommit: attestation.RepositoryCommit,
		EvidenceSetDigest: attestation.EvidenceSetDigest,
		HostedRetrievalRuntimeResourceLifecycleJournalSetDigest: attestation.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest,
		HostedRetrievalRuntimeResourceCleanupSetDigest:          attestation.HostedRetrievalRuntimeResourceCleanupSetDigest,
		CapabilityEffectProviderRuntimeJournalSetDigest:         attestation.CapabilityEffectProviderRuntimeJournalSetDigest,
		AuthorityAttestationDigest:                              attestation.AttestationDigest,
		EvaluationManifestDigest:                                digest,
	}
	manifest := EvaluationArtifactRecord{EvaluationFactRecord: EvaluationFactRecord{
		FactType: "evaluation-manifest", FactDigest: digest,
	}}
	if !evaluationExportSemanticFinalizationMatches(attestation, root, manifest) {
		t.Fatal("matching hosted cleanup and Provider-runtime journal roots were rejected")
	}
	root.CapabilityEffectProviderRuntimeJournalSetDigest = evaluationBoundedExportTestDigest(t, "swapped-journal-root")
	if evaluationExportSemanticFinalizationMatches(attestation, root, manifest) {
		t.Fatal("semantic finalization accepted a swapped Provider-runtime journal root")
	}
}

// bytesReader keeps the tests' JSON-number decoding aligned with production.
func bytesReader(value []byte) *bytes.Reader {
	return bytes.NewReader(value)
}
