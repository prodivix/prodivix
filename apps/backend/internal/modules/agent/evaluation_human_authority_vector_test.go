package agent

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationHumanAuthoritySignatureVector struct {
	ID                 string `json:"id"`
	PublicKeyBase64URL string `json:"publicKeyBase64Url"`
	CanonicalJSON      string `json:"canonicalJson"`
	SignatureBase64URL string `json:"signatureBase64Url"`
}

type evaluationHumanAuthorityCanonicalVector struct {
	Format                           string           `json:"format"`
	Version                          json.Number      `json:"version"`
	Plan                             map[string]any   `json:"plan"`
	Attempts                         []map[string]any `json:"attempts"`
	HumanReviewReport                map[string]any   `json:"humanReviewReport"`
	ValidatedHumanReviewArtifact     map[string]any   `json:"validatedHumanReviewArtifact"`
	ValidatedHumanMetricObservations []map[string]any `json:"validatedHumanMetricObservations"`
	SignatureMessages                struct {
		Ratings      []evaluationHumanAuthoritySignatureVector `json:"ratings"`
		Independence []evaluationHumanAuthoritySignatureVector `json:"independence"`
		Decisions    []evaluationHumanAuthoritySignatureVector `json:"decisions"`
		Wrapper      evaluationHumanAuthoritySignatureVector   `json:"wrapper"`
	} `json:"signatureMessages"`
	Expected struct {
		CompletedAt                              string         `json:"completedAt"`
		ValidatedHumanMetricObservationSetDigest string         `json:"validatedHumanMetricObservationSetDigest"`
		MetricReport                             map[string]any `json:"metricReport"`
		GraderReport                             map[string]any `json:"graderReport"`
		AttemptGradingAuthority                  struct {
			AttemptID          string         `json:"attemptId"`
			Preimage           map[string]any `json:"preimage"`
			Response           map[string]any `json:"response"`
			ResponseProjection map[string]any `json:"responseProjection"`
			OwnerReceipt       map[string]any `json:"ownerReceipt"`
			CommitLink         map[string]any `json:"commitLink"`
		} `json:"attemptGradingAuthority"`
	} `json:"expected"`
}

func readEvaluationHumanAuthorityCanonicalVector(t *testing.T) evaluationHumanAuthorityCanonicalVector {
	t.Helper()
	source, err := os.ReadFile(filepath.Join(
		"..", "..", "platform", "agentcontract", "testdata",
		"agent-evaluation-human-authority-vector.json",
	))
	if err != nil {
		t.Fatal(err)
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var vector evaluationHumanAuthorityCanonicalVector
	if err := decoder.Decode(&vector); err != nil {
		t.Fatal(err)
	}
	if vector.Format != "prodivix.agent-evaluation-human-authority-vector" || vector.Version != json.Number("1") {
		t.Fatalf("unexpected human authority vector header: %q %q", vector.Format, vector.Version)
	}
	return vector
}

func evaluationVectorFactBytes(t *testing.T, factType string, value map[string]any) []byte {
	t.Helper()
	encoded, err := canonicaljson.Bytes(map[string]any{
		"wireVersion": int64(1), "factType": factType, "value": value,
	})
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func verifyEvaluationHumanAuthoritySignatureVector(t *testing.T, vector evaluationHumanAuthoritySignatureVector) {
	t.Helper()
	publicKey, err := base64.RawURLEncoding.DecodeString(vector.PublicKeyBase64URL)
	if err != nil || len(publicKey) != ed25519.PublicKeySize {
		t.Fatalf("decode public key for %s: %v", vector.ID, err)
	}
	signature, err := base64.RawURLEncoding.DecodeString(vector.SignatureBase64URL)
	if err != nil || len(signature) != ed25519.SignatureSize {
		t.Fatalf("decode signature for %s: %v", vector.ID, err)
	}
	if !ed25519.Verify(ed25519.PublicKey(publicKey), []byte(vector.CanonicalJSON), signature) {
		t.Fatalf("signature %s did not verify", vector.ID)
	}
}

func evaluationHumanAuthorityVectorRubrics(t *testing.T, artifact evaluationValidatedHumanReviewArtifact) []map[string]any {
	t.Helper()
	raw, ok := artifact.Value["publicRubrics"].([]any)
	if !ok {
		t.Fatal("vector public rubrics are unavailable")
	}
	result := make([]map[string]any, len(raw))
	for index, entry := range raw {
		result[index], ok = entry.(map[string]any)
		if !ok {
			t.Fatal("vector public rubric is malformed")
		}
	}
	return result
}

func TestEvaluationHumanAuthorityTypeScriptGoCanonicalVector(t *testing.T) {
	vector := readEvaluationHumanAuthorityCanonicalVector(t)
	plan, err := decodeEvaluationPlan(evaluationVectorFactBytes(t, "evaluation-plan", vector.Plan))
	if err != nil {
		t.Fatal(err)
	}
	attempts := make([]evaluationAttemptFact, len(vector.Attempts))
	for index, value := range vector.Attempts {
		attempts[index], err = decodeEvaluationAttempt(evaluationVectorFactBytes(t, "evaluation-attempt", value))
		if err != nil {
			t.Fatal(err)
		}
	}
	humanReport, err := decodeEvaluationArtifact(
		evaluationVectorFactBytes(t, "evaluation-human-review-report", vector.HumanReviewReport),
		"evaluation-human-review-report",
	)
	if err != nil {
		t.Fatal(err)
	}
	artifactBytes, err := canonicaljson.Bytes(vector.ValidatedHumanReviewArtifact)
	if err != nil {
		t.Fatal(err)
	}
	artifact, err := decodeEvaluationValidatedHumanReviewArtifact(artifactBytes)
	if err != nil {
		t.Fatal(err)
	}
	frozenAuthority := EvaluationHumanReviewFrozenAuthority{
		PublicRubrics:      evaluationHumanAuthorityVectorRubrics(t, artifact),
		TrustRegistry:      artifact.Value["trustRegistry"].(map[string]any),
		AdjudicationPolicy: artifact.Value["adjudicationPolicy"].(map[string]any),
	}
	if err := validateEvaluationHumanReviewCryptographicAuthority(
		plan, frozenAuthority, artifact, humanReport,
	); err != nil {
		t.Fatalf("TS-signed human authority failed Go verification: %v", err)
	}

	for _, signature := range vector.SignatureMessages.Ratings {
		verifyEvaluationHumanAuthoritySignatureVector(t, signature)
	}
	for _, signature := range vector.SignatureMessages.Independence {
		verifyEvaluationHumanAuthoritySignatureVector(t, signature)
	}
	for _, signature := range vector.SignatureMessages.Decisions {
		verifyEvaluationHumanAuthoritySignatureVector(t, signature)
	}
	verifyEvaluationHumanAuthoritySignatureVector(t, vector.SignatureMessages.Wrapper)

	projected, err := createEvaluationValidatedHumanMetricObservations(
		plan, attempts, artifact, humanReport,
	)
	if err != nil {
		t.Fatal(err)
	}
	projectedBytes, err := canonicaljson.Bytes(projected)
	if err != nil {
		t.Fatal(err)
	}
	wantObservationBytes, err := canonicaljson.Bytes(vector.ValidatedHumanMetricObservations)
	if err != nil || !bytes.Equal(projectedBytes, wantObservationBytes) {
		t.Fatalf("validated human metric observation bytes drifted: %v", err)
	}
	setDigest, err := evaluationValidatedHumanMetricObservationSetDigest(projected)
	if err != nil || setDigest != vector.Expected.ValidatedHumanMetricObservationSetDigest {
		t.Fatalf("observation set digest = %q err=%v", setDigest, err)
	}

	planned, err := evaluationStatusPlannedAttempts(plan)
	if err != nil {
		t.Fatal(err)
	}
	snapshot := evaluationFinalizationSnapshot{
		Plan: plan, Planned: planned, Decoded: attempts, HumanObservations: projected,
	}
	completedAt, err := time.Parse(time.RFC3339Nano, vector.Expected.CompletedAt)
	if err != nil {
		t.Fatal(err)
	}
	metric, err := buildEvaluationMetricReport(snapshot, completedAt)
	if err != nil {
		t.Fatal(err)
	}
	grader, err := buildEvaluationGraderReport(snapshot, completedAt)
	if err != nil {
		t.Fatal(err)
	}
	metricBytes, metricBytesErr := canonicaljson.Bytes(metric.Value)
	wantMetric, err := canonicaljson.Bytes(vector.Expected.MetricReport)
	if err != nil || metricBytesErr != nil || !bytes.Equal(metricBytes, wantMetric) {
		gotSlices, _ := metric.Value["slices"].([]any)
		wantSlices, _ := vector.Expected.MetricReport["slices"].([]any)
		detail := ""
		for index := 0; index < len(gotSlices) && index < len(wantSlices); index++ {
			got, gotErr := canonicaljson.Bytes(gotSlices[index])
			want, wantErr := canonicaljson.Bytes(wantSlices[index])
			if gotErr != nil || wantErr != nil || !bytes.Equal(got, want) {
				detail = " first-slice=" + string(got) + " want=" + string(want)
				break
			}
		}
		t.Fatalf("metric report canonical bytes drifted: got=%s want=%s slices=%d/%d%s err=%v", metric.FactDigest, stringMember(vector.Expected.MetricReport, "reportDigest"), len(gotSlices), len(wantSlices), detail, err)
	}
	graderBytes, graderBytesErr := canonicaljson.Bytes(grader.Value)
	wantGrader, err := canonicaljson.Bytes(vector.Expected.GraderReport)
	if err != nil || graderBytesErr != nil || !bytes.Equal(graderBytes, wantGrader) {
		t.Fatalf("grader report canonical bytes drifted: got=%s want=%s err=%v", grader.FactDigest, stringMember(vector.Expected.GraderReport, "reportDigest"), err)
	}

	grading := vector.Expected.AttemptGradingAuthority
	gradingDigest, err := canonicaljson.Digest(grading.Preimage)
	if err != nil || gradingDigest != stringMember(grading.Response, "gradingDigest") {
		t.Fatalf("attempt grading preimage digest drifted: %q err=%v", gradingDigest, err)
	}
	var gradingAttempt evaluationAttemptFact
	for _, attempt := range attempts {
		if attempt.AttemptID == grading.AttemptID {
			gradingAttempt = attempt
			break
		}
	}
	if gradingAttempt.AttemptID == "" {
		t.Fatal("attempt grading vector attempt is unavailable")
	}
	descriptor, _ := objectMember(gradingAttempt.Value, "descriptor")
	payload := map[string]any{
		"plan":       plan.Value,
		"status":     gradingAttempt.Status,
		"descriptor": descriptor,
		"invocationTurnSetReceipt": map[string]any{
			"receiptDigest": stringMember(grading.Preimage, "invocationTurnSetReceiptDigest"),
		},
		"terminalTurnReceipt": map[string]any{
			"evidenceDigest": stringMember(grading.Preimage, "terminalTurnReceiptDigest"),
		},
		"capabilityExecutionReceipt": map[string]any{
			"receiptDigest": stringMember(grading.Preimage, "capabilityExecutionReceiptDigest"),
		},
		"execution": grading.Preimage["execution"],
	}
	if err := validateEvaluationAttemptAuthorityGrading(payload, grading.Response); err != nil {
		t.Fatalf("TS attempt grading vector failed Go validation: %v", err)
	}
	ownerBytes, err := canonicaljson.Bytes(grading.OwnerReceipt)
	if err != nil {
		t.Fatal(err)
	}
	owner, err := decodeEvaluationAttemptAuthorityOwnerReceipt(ownerBytes)
	if err != nil {
		t.Fatalf("TS grading-owner receipt failed Go decoding: %v", err)
	}
	if !sameEvaluationCanonicalValue(owner.ResponseProjection, grading.ResponseProjection) ||
		owner.ReceiptDigest != stringMember(grading.CommitLink, "receiptDigest") ||
		owner.AttemptID != stringMember(grading.CommitLink, "attemptId") ||
		gradingAttempt.AttemptDigest != stringMember(grading.CommitLink, "attemptDigest") ||
		stringMember(grading.CommitLink, "namespaceId") != owner.NamespaceID ||
		stringMember(grading.CommitLink, "planDigest") != owner.PlanDigest ||
		stringMember(grading.CommitLink, "repositoryCommit") != owner.RepositoryCommit ||
		stringMember(grading.CommitLink, "committedAt") != evaluationExportInstant(gradingAttempt.CompletedAt) {
		t.Fatal("attempt grading owner/commit-link vector drifted")
	}
}

func TestEvaluationHumanAuthorityVectorRejectsCriterionTamper(t *testing.T) {
	vector := readEvaluationHumanAuthorityCanonicalVector(t)
	artifactBytes, err := canonicaljson.Bytes(vector.ValidatedHumanReviewArtifact)
	if err != nil {
		t.Fatal(err)
	}
	artifact, err := decodeEvaluationValidatedHumanReviewArtifact(artifactBytes)
	if err != nil {
		t.Fatal(err)
	}
	review := artifact.ReviewArtifact
	rating := review["signedRatings"].([]any)[0].(map[string]any)
	criteria := rating["criterionVerdicts"].([]any)
	criteria[0].(map[string]any)["verdict"] = "failed"
	plan, err := decodeEvaluationPlan(evaluationVectorFactBytes(t, "evaluation-plan", vector.Plan))
	if err != nil {
		t.Fatal(err)
	}
	humanReport, err := decodeEvaluationArtifact(
		evaluationVectorFactBytes(t, "evaluation-human-review-report", vector.HumanReviewReport),
		"evaluation-human-review-report",
	)
	if err != nil {
		t.Fatal(err)
	}
	frozenAuthority := EvaluationHumanReviewFrozenAuthority{
		PublicRubrics:      evaluationHumanAuthorityVectorRubrics(t, artifact),
		TrustRegistry:      artifact.Value["trustRegistry"].(map[string]any),
		AdjudicationPolicy: artifact.Value["adjudicationPolicy"].(map[string]any),
	}
	if err := validateEvaluationHumanReviewCryptographicAuthority(
		plan, frozenAuthority, artifact, humanReport,
	); err == nil {
		t.Fatal("criterion tamper unexpectedly retained authority")
	}
}
