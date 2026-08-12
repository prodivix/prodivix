package agent

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const evaluationReviewCandidateRasterBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

func evaluationSubjectiveAttemptSource(t *testing.T, plan evaluationPlanFact, source json.RawMessage) []byte {
	t.Helper()
	var envelope map[string]any
	decoder := json.NewDecoder(bytesReader(source))
	decoder.UseNumber()
	if err := decoder.Decode(&envelope); err != nil {
		t.Fatal(err)
	}
	value := envelope["value"].(map[string]any)
	descriptor := value["descriptor"].(map[string]any)
	var evaluationCase map[string]any
	for _, raw := range plan.Value["concreteCases"].([]any) {
		candidate := raw.(map[string]any)
		if subjective, _ := candidate["subjectiveVisualQuality"].(bool); subjective &&
			stringMember(candidate, "access") == "public" {
			evaluationCase = candidate
			break
		}
	}
	if evaluationCase == nil {
		t.Fatal("evaluation plan has no subjective case")
	}
	var target map[string]any
	for _, raw := range plan.Value["capabilityQualificationTargets"].([]any) {
		candidate := raw.(map[string]any)
		if stringMember(candidate, "capabilityProfileId") == stringMember(evaluationCase, "capabilityProfileId") {
			target = candidate
			break
		}
	}
	if target == nil {
		t.Fatal("subjective case has no qualification target")
	}
	descriptor["planDigest"] = plan.PlanDigest
	descriptor["caseId"] = evaluationCase["caseId"]
	descriptor["capabilityDescriptorDigest"] = evaluationCase["capabilityDescriptorDigest"]
	descriptor["targetId"] = target["targetId"]
	descriptor["targetDigest"] = target["targetDigest"]
	descriptor["riskClass"] = evaluationCase["riskClass"]
	descriptor["repetitionIndex"] = json.Number("0")
	shardDigest, err := canonicaljson.Digest(map[string]any{"targetId": descriptor["targetId"]})
	if err != nil {
		t.Fatal(err)
	}
	descriptor["shardId"] = "evaluation-shard:" + shardDigest[len("sha256-"):]
	delete(descriptor, "contextTier")
	delete(descriptor, "mediaRepresentationTier")
	contextSentinel, _ := evaluationCase["contextSentinel"].(bool)
	mediaSentinel, _ := evaluationCase["mediaSentinel"].(bool)
	if contextSentinel {
		descriptor["contextTier"] = "representative"
	}
	if mediaSentinel {
		descriptor["mediaRepresentationTier"] = "source-faithful"
	}
	samplingBase := map[string]any{
		"planDigest": descriptor["planDigest"], "caseId": descriptor["caseId"],
		"capabilityDescriptorDigest": descriptor["capabilityDescriptorDigest"],
		"targetId":                   descriptor["targetId"], "targetDigest": descriptor["targetDigest"],
		"riskClass": descriptor["riskClass"], "repetitionIndex": descriptor["repetitionIndex"],
	}
	if tier, exists := descriptor["contextTier"]; exists {
		samplingBase["contextTier"] = tier
	}
	if tier, exists := descriptor["mediaRepresentationTier"]; exists {
		samplingBase["mediaRepresentationTier"] = tier
	}
	samplingDigest, err := canonicaljson.Digest(samplingBase)
	if err != nil {
		t.Fatal(err)
	}
	descriptor["samplingIdentityDigest"] = samplingDigest
	descriptor["attemptId"] = "evaluation-attempt:" + samplingDigest[len("sha256-"):]
	descriptor["descriptorDigest"], err = canonicaljson.Digest(mapWithoutEvaluationDigest(descriptor, "descriptorDigest"))
	if err != nil {
		t.Fatal(err)
	}
	value["independentRunId"] = "run.subjective.1"
	value["attemptDigest"], err = canonicaljson.Digest(mapWithoutEvaluationDigest(value, "attemptDigest"))
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := canonicaljson.Bytes(envelope)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func evaluationReviewRasterScanFixture(
	t *testing.T,
	namespaceID string,
	plan evaluationPlanFact,
	attempt evaluationAttemptFact,
	projectionAuthorityDigest string,
) EvaluationReviewRasterScanReceiptRecord {
	t.Helper()
	inspection, err := agentcontract.InspectEvaluationReviewRaster(
		evaluationReviewCandidateRasterBase64, "image/png",
	)
	if err != nil {
		t.Fatal(err)
	}
	value := map[string]any{
		"format": "prodivix.agent-evaluation-review-raster-scan-receipt", "version": int64(1),
		"scanReceiptId": "review-raster-scan.subjective.1", "planDigest": plan.PlanDigest,
		"repositoryCommit": plan.RepositoryCommit, "attemptId": attempt.AttemptID,
		"descriptorDigest": attempt.DescriptorDigest, "projectionAuthorityDigest": projectionAuthorityDigest,
		"mediaType": "image/png", "width": inspection.Width, "height": inspection.Height,
		"byteLength": inspection.ByteLength, "policyDigest": evaluationFixtureDigest(t, "raster-scan-policy"),
		"bytesDigest": inspection.BytesDigest, "decodedPixelDigest": inspection.DecodedPixelDigest,
		"metadataProfileDigest": evaluationFixtureDigest(t, "raster-metadata-profile"),
		"canarySetDigest":       evaluationFixtureDigest(t, "raster-canary-set"),
		"fingerprintSetDigest":  evaluationFixtureDigest(t, "raster-fingerprint-set"),
		"findingDigests":        []any{}, "verdict": "safe",
		"scannedAt": attempt.CompletedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	value["receiptDigest"], err = canonicaljson.Digest(value)
	if err != nil {
		t.Fatal(err)
	}
	receiptBytes, err := canonicaljson.Bytes(map[string]any{
		"wireVersion": int64(1), "factType": evaluationReviewRasterScanReceiptFactType, "value": value,
	})
	if err != nil {
		t.Fatal(err)
	}
	return EvaluationReviewRasterScanReceiptRecord{
		NamespaceID: namespaceID, PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit,
		ScanReceiptID: stringMember(value, "scanReceiptId"), AttemptID: attempt.AttemptID,
		DescriptorDigest: attempt.DescriptorDigest, ProjectionAuthorityDigest: projectionAuthorityDigest,
		MediaType: "image/png", Width: inspection.Width, Height: inspection.Height,
		ByteLength: inspection.ByteLength, PolicyDigest: stringMember(value, "policyDigest"),
		BytesDigest: inspection.BytesDigest, DecodedPixelDigest: inspection.DecodedPixelDigest,
		MetadataProfileDigest: stringMember(value, "metadataProfileDigest"),
		CanarySetDigest:       stringMember(value, "canarySetDigest"),
		FingerprintSetDigest:  stringMember(value, "fingerprintSetDigest"), FindingDigests: []string{},
		Verdict: "safe", ReceiptDigest: stringMember(value, "receiptDigest"), ReceiptBytes: receiptBytes,
		ScannedAt: attempt.CompletedAt,
	}
}

func evaluationReviewCandidateFixture(
	t *testing.T,
	plan evaluationPlanFact,
	attempt evaluationAttemptFact,
	responseDigest string,
	execution EvaluationExecutionReceiptRecord,
	scan EvaluationReviewRasterScanReceiptRecord,
) evaluationArtifactFact {
	t.Helper()
	raster, err := base64.StdEncoding.DecodeString(evaluationReviewCandidateRasterBase64)
	if err != nil {
		t.Fatal(err)
	}
	value := map[string]any{
		"format": "prodivix.agent-evaluation-review-candidate", "version": int64(2),
		"candidateId": "review-candidate.subjective.1", "attemptId": attempt.AttemptID,
		"planDigest": plan.PlanDigest, "repositoryCommit": plan.RepositoryCommit,
		"descriptorDigest": attempt.DescriptorDigest, "responseDigest": responseDigest,
		"executionReceiptDigest":    execution.ReceiptDigest,
		"graderArtifactDigest":      evaluationFixtureDigest(t, "subjective-grader-artifact"),
		"projectionAuthorityDigest": scan.ProjectionAuthorityDigest,
		"mediaType":                 "image/png", "width": int64(1), "height": int64(1),
		"bytesBase64": base64.StdEncoding.EncodeToString(raster),
		"bytesDigest": fmt.Sprintf("sha256-%x", sha256.Sum256(raster)), "byteLength": int64(len(raster)),
		"publicArtifactScanDigest": scan.ReceiptDigest,
		"generatedAt":              scan.ScannedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	value["candidateDigest"], err = canonicaljson.Digest(value)
	if err != nil {
		t.Fatal(err)
	}
	envelope, err := canonicaljson.Bytes(map[string]any{
		"wireVersion": int64(1), "factType": evaluationReviewCandidateFactType, "value": value,
	})
	if err != nil {
		t.Fatal(err)
	}
	candidate, err := decodeEvaluationArtifact(envelope, evaluationReviewCandidateFactType)
	if err != nil {
		t.Fatal(err)
	}
	return candidate
}

func evaluationReviewBindingFixtures(t *testing.T) (
	EvaluationPlanRecord,
	EvaluationAttemptRecord,
	EvaluationInvocationTurnReceiptRecord,
	EvaluationExecutionReceiptRecord,
	EvaluationReviewRasterScanReceiptRecord,
	EvaluationReviewCandidateRef,
	evaluationArtifactFact,
) {
	t.Helper()
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	subjectiveSource := evaluationSubjectiveAttemptSource(t, plan, vector.Facts.Attempt)
	fixtures := evaluationAuthenticityFixturesForPlan(t, plan, subjectiveSource)
	invocation, err := decodeEvaluationInvocationReceipt(fixtures.Invocation)
	if err != nil {
		t.Fatal(err)
	}
	execution, err := decodeEvaluationExecutionReceipt(fixtures.Execution)
	if err != nil {
		t.Fatal(err)
	}
	const namespaceID = "evaluation.g4-review-candidate-test"
	planRecord := EvaluationPlanRecord{
		EvaluationFactRecord: EvaluationFactRecord{
			NamespaceID: namespaceID, PlanDigest: plan.PlanDigest, FactType: "evaluation-plan",
			FactID: plan.PlanID, FactDigest: plan.PlanDigest, FactBytes: plan.Canonical, RecordedAt: plan.PlannedAt,
		},
		PlanID: plan.PlanID, RepositoryCommit: plan.RepositoryCommit,
		PlannedJourneyCount: plan.PlannedJourneyCount, PlannedAt: plan.PlannedAt, ExpiresAt: plan.ExpiresAt,
	}
	attemptRecord := EvaluationAttemptRecord{EvaluationFactRecord: EvaluationFactRecord{
		NamespaceID: namespaceID, PlanDigest: plan.PlanDigest, FactType: "evaluation-attempt",
		FactID: fixtures.Attempt.AttemptID, FactDigest: fixtures.Attempt.AttemptDigest,
		FactBytes: fixtures.Attempt.Canonical, RecordedAt: fixtures.Attempt.CompletedAt,
	}}
	invocationRecord := evaluationInvocationTurnFixtureFromLegacy(t, namespaceID, plan, fixtures.Attempt, invocation)
	executionRecord := execution.EvaluationExecutionReceiptRecord
	executionRecord.NamespaceID = namespaceID
	projectionAuthorityDigest := evaluationFixtureDigest(t, "subjective-projection-authority")
	scan := evaluationReviewRasterScanFixture(t, namespaceID, plan, fixtures.Attempt, projectionAuthorityDigest)
	candidate := evaluationReviewCandidateFixture(t, plan, fixtures.Attempt, invocationRecord.ResponseArtifactDigest, executionRecord, scan)
	reference, err := evaluationReviewCandidateRef(namespaceID, candidate)
	if err != nil {
		t.Fatal(err)
	}
	return planRecord, attemptRecord, invocationRecord, executionRecord, scan, reference, candidate
}

func evaluationInvocationTurnFixtureFromLegacy(
	t *testing.T,
	namespaceID string,
	plan evaluationPlanFact,
	attempt evaluationAttemptFact,
	invocation evaluationInvocationReceipt,
) EvaluationInvocationTurnReceiptRecord {
	t.Helper()
	var err error
	nested := invocation.Value["invocationReceipt"].(map[string]any)
	nested["provider"].(map[string]any)["protocolFamily"] = "openai-responses"
	nested["receiptDigest"], err = canonicaljson.Digest(mapWithoutEvaluationDigest(nested, "receiptDigest"))
	if err != nil {
		t.Fatal(err)
	}
	retryAttempt := map[string]any{
		"sequence": int64(1), "requestDigest": invocation.RequestArtifactDigest,
		"status": "completed", "retryable": false,
		"invocationReceiptDigest": nested["receiptDigest"], "responseDigest": invocation.ResponseArtifactDigest,
		"startedAt": nested["startedAt"], "completedAt": nested["completedAt"],
	}
	retryAttempt["receiptDigest"], err = canonicaljson.Digest(retryAttempt)
	if err != nil {
		t.Fatal(err)
	}
	retry := map[string]any{
		"policyDigest": evaluationFixtureDigest(t, "turn-retry-policy"), "maximumAttempts": int64(1),
		"attempts": []any{retryAttempt}, "exhausted": false,
	}
	retry["receiptDigest"], err = canonicaljson.Digest(retry)
	if err != nil {
		t.Fatal(err)
	}
	value := map[string]any{
		"format": evaluationInvocationTurnReceiptFormat, "version": int64(1),
		"planDigest": plan.PlanDigest, "repositoryCommit": plan.RepositoryCommit,
		"attemptId": attempt.AttemptID, "descriptorDigest": attempt.DescriptorDigest, "turnIndex": int64(0),
		"invocationId": nested["invocationId"], "status": "completed", "dispatchState": "dispatched", "terminal": true,
		"caseDefinitionDigest": invocation.CaseDefinitionDigest, "contextPackDigest": invocation.ContextPackDigest,
		"requestArtifactDigest": invocation.RequestArtifactDigest, "dispatchIntentDigest": evaluationFixtureDigest(t, "turn-intent"),
		"transportReceiptDigest": invocation.TransportReceiptDigest, "transportRetryReceipt": retry,
		"invocationReceipt": nested, "providerRequestId": invocation.ProviderRequestID,
		"resolvedModelIdentityDigest": invocation.ResolvedModelIdentityDigest,
		"responseHeaderDigest":        invocation.ResponseHeaderDigest, "responseArtifactDigest": invocation.ResponseArtifactDigest,
		"providerResultSpoolReceiptDigest": evaluationFixtureDigest(t, "turn-spool"),
		"usageSourceDigest":                invocation.UsageSourceDigest, "costSourceDigest": invocation.CostSourceDigest,
		"usageSourceReceiptDigest": invocation.UsageSourceReceiptDigest, "costSourceReceiptDigest": invocation.CostSourceReceiptDigest,
		"resultSubmissionReceiptDigest":  evaluationFixtureDigest(t, "turn-submission"),
		"controlledRuntimeReceiptDigest": evaluationFixtureDigest(t, "turn-runtime"),
	}
	for key, optional := range map[string]string{
		"mediaRepresentationManifestDigest": invocation.MediaRepresentationManifestDigest,
		"resolvedModelId":                   invocation.ResolvedModelID, "resolvedModelVersion": invocation.ResolvedModelVersion,
	} {
		if optional != "" {
			value[key] = optional
		}
	}
	value["evidenceDigest"], err = canonicaljson.Digest(value)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	turn, err := decodeEvaluationInvocationTurnReceipt(encoded)
	if err != nil {
		t.Fatal(err)
	}
	record := turn.EvaluationInvocationTurnReceiptRecord
	record.NamespaceID = namespaceID
	return record
}

func TestEvaluationReviewCandidateBindsAttemptResponseAndExecutionReceipt(t *testing.T) {
	plan, attempt, invocation, execution, scan, reference, _ := evaluationReviewBindingFixtures(t)
	if err := validateEvaluationReviewCandidateBindings(
		plan, []EvaluationAttemptRecord{attempt}, []EvaluationInvocationTurnReceiptRecord{invocation},
		[]EvaluationExecutionReceiptRecord{execution}, []EvaluationReviewRasterScanReceiptRecord{scan},
		[]EvaluationReviewCandidateRef{reference}, true,
	); err != nil {
		t.Fatalf("exact review candidate binding was rejected: %v", err)
	}
	for name, mutate := range map[string]func(*EvaluationReviewCandidateRef){
		"descriptor": func(value *EvaluationReviewCandidateRef) {
			value.DescriptorDigest = evaluationFixtureDigest(t, "drifted-descriptor")
		},
		"response": func(value *EvaluationReviewCandidateRef) {
			value.ResponseDigest = evaluationFixtureDigest(t, "drifted-response")
		},
		"execution": func(value *EvaluationReviewCandidateRef) {
			value.ExecutionReceiptDigest = evaluationFixtureDigest(t, "drifted-execution")
		},
		"scan": func(value *EvaluationReviewCandidateRef) {
			value.PublicArtifactScanDigest = evaluationFixtureDigest(t, "drifted-scan")
		},
	} {
		t.Run(name, func(t *testing.T) {
			drifted := reference
			mutate(&drifted)
			err := validateEvaluationReviewCandidateBindings(
				plan, []EvaluationAttemptRecord{attempt}, []EvaluationInvocationTurnReceiptRecord{invocation},
				[]EvaluationExecutionReceiptRecord{execution}, []EvaluationReviewRasterScanReceiptRecord{scan},
				[]EvaluationReviewCandidateRef{drifted}, true,
			)
			if !errors.Is(err, ErrConflict) {
				t.Fatalf("%s binding error = %v, want ErrConflict", name, err)
			}
		})
	}
	if err := validateEvaluationReviewCandidateBindings(
		plan, []EvaluationAttemptRecord{attempt}, []EvaluationInvocationTurnReceiptRecord{invocation},
		[]EvaluationExecutionReceiptRecord{execution}, []EvaluationReviewRasterScanReceiptRecord{scan}, nil, true,
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("missing complete candidate set error = %v, want ErrConflict", err)
	}
}

func TestEvaluationReviewCandidateRejectsRasterScanBindingDrift(t *testing.T) {
	plan, attempt, invocation, execution, scan, reference, _ := evaluationReviewBindingFixtures(t)
	for name, mutate := range map[string]func(*EvaluationReviewRasterScanReceiptRecord){
		"decoded-pixels": func(value *EvaluationReviewRasterScanReceiptRecord) {
			value.DecodedPixelDigest = evaluationFixtureDigest(t, "drifted-decoded-pixels")
		},
		"dimensions": func(value *EvaluationReviewRasterScanReceiptRecord) {
			value.Width++
		},
		"blocked-verdict": func(value *EvaluationReviewRasterScanReceiptRecord) {
			value.Verdict = "blocked"
			value.FindingDigests = []string{evaluationFixtureDigest(t, "protected-fingerprint-finding")}
		},
		"scan-before-attempt": func(value *EvaluationReviewRasterScanReceiptRecord) {
			value.ScannedAt = attempt.RecordedAt.Add(-1)
		},
	} {
		t.Run(name, func(t *testing.T) {
			drifted := scan
			mutate(&drifted)
			err := validateEvaluationReviewCandidateBindings(
				plan, []EvaluationAttemptRecord{attempt}, []EvaluationInvocationTurnReceiptRecord{invocation},
				[]EvaluationExecutionReceiptRecord{execution}, []EvaluationReviewRasterScanReceiptRecord{drifted},
				[]EvaluationReviewCandidateRef{reference}, true,
			)
			if !errors.Is(err, ErrConflict) {
				t.Fatalf("%s scan binding error = %v, want ErrConflict", name, err)
			}
		})
	}
}

func TestLoadEvaluationReviewCandidateFailsClosedOnPersistedBindingDrift(t *testing.T) {
	plan, _, _, _, _, reference, candidate := evaluationReviewBindingFixtures(t)
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	partition := EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit}
	columns := []string{
		"attempt_id", "candidate_id", "descriptor_digest", "response_digest", "execution_receipt_digest",
		"grader_artifact_digest", "projection_authority_digest", "media_type", "width", "height", "bytes_digest",
		"byte_length", "public_artifact_scan_digest", "candidate_digest", "candidate_bytes", "generated_at",
	}
	driftedExecutionDigest := evaluationFixtureDigest(t, "persisted-execution-drift")
	mock.ExpectQuery(regexp.QuoteMeta("SELECT attempt_id, candidate_id, descriptor_digest,")).
		WithArgs(plan.NamespaceID, plan.PlanDigest, plan.RepositoryCommit, reference.AttemptID).
		WillReturnRows(sqlmock.NewRows(columns).AddRow(
			reference.AttemptID, reference.CandidateID, reference.DescriptorDigest, reference.ResponseDigest,
			driftedExecutionDigest, reference.GraderArtifactDigest, reference.ProjectionAuthorityDigest,
			reference.MediaType, reference.Width, reference.Height, reference.BytesDigest, reference.ByteLength,
			reference.PublicArtifactScanDigest, reference.CandidateDigest, candidate.Canonical, reference.GeneratedAt,
		))
	_, err = loadEvaluationReviewCandidate(context.Background(), database, plan.NamespaceID, partition, reference.AttemptID)
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("persisted execution binding drift error = %v, want ErrConflict", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestCanonicalEvaluationReviewCandidateRefOmitsRasterBody(t *testing.T) {
	_, _, _, _, _, reference, _ := evaluationReviewBindingFixtures(t)
	value := canonicalEvaluationReviewCandidateRef(reference)
	if len(value) != 17 || value["candidateDigest"] != reference.CandidateDigest ||
		value["executionReceiptDigest"] != reference.ExecutionReceiptDigest {
		t.Fatalf("review candidate ref = %#v", value)
	}
	for _, forbidden := range []string{"format", "version", "bytesBase64"} {
		if _, exists := value[forbidden]; exists {
			t.Fatalf("review candidate ref exposes %q", forbidden)
		}
	}
}
