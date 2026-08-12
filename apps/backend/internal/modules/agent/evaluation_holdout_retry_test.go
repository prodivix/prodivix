package agent

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationHoldoutRetryRepository struct {
	*evaluationServiceFakeRepository
	result EvaluationHoldoutClosureResult
	calls  int
}

func (repository *evaluationHoldoutRetryRepository) GetEvaluationHoldoutClosure(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
) (EvaluationHoldoutClosureResult, error) {
	repository.calls++
	return repository.result, nil
}

type evaluationHoldoutRetryAuthority struct{ calls int }

func (authority *evaluationHoldoutRetryAuthority) Resolve(
	context.Context,
	EvaluationPlanRecord,
) (EvaluationHoldoutSealAuthorityEvidence, EvaluationHoldoutCanarySets, error) {
	authority.calls++
	return EvaluationHoldoutSealAuthorityEvidence{}, EvaluationHoldoutCanarySets{}, ErrInvalid
}

func evaluationFrozenConfigRetryVector(t *testing.T) []byte {
	t.Helper()
	digest := func(label string) string { return evaluationServiceTestDigest(t, label) }
	base := evaluationFrozenConfigCommitmentBase{
		Format:                           evaluationFrozenConfigCommitmentFormat,
		Version:                          1,
		SourceConfigDigest:               digest("source-config"),
		FrozenRunDigest:                  digest("frozen-run"),
		PlanDigest:                       digest("plan"),
		RepositoryCommit:                 "0123456789abcdef0123456789abcdef01234567",
		ProtectedHoldoutManifestDigest:   digest("manifest"),
		RestrictedMaterialManifestDigest: digest("manifest"),
		AccessPolicyDigest:               digest("access-policy"),
		ProtectedEnvelopeAllowlist: []EvaluationFrozenConfigProtectedEnvelope{{
			CaseID: "case.a", FixtureRef: "holdout://case.a", CaseDigest: digest("case"),
			Access: "protected-holdout", CapabilityDescriptorDigest: digest("capability"),
			CaseDefinitionDigest: digest("definition"), ExpectedAuthorityDigest: digest("authority"),
			GradingPolicyDigest: digest("grading"), ResolverRef: "resolver.case.a", RelativePath: "case-a.json",
			EncryptedMaterialDigest: digest("encrypted"), EncryptionPolicyDigest: digest("encryption-policy"),
			LocatorDigest: digest("locator"),
		}},
		CommittedAt: "2026-08-08T00:00:00.000Z", WorkflowName: "g4-real-model-evaluation",
		WorkflowRunID: "123456789", JobID: "full_shards", EnvironmentDigest: digest("environment"),
		AuthorityID: "authority.prodivix.g4-model-evaluation", KeyID: "key.prodivix.g4-model-evaluation.v1",
		Algorithm: "Ed25519",
	}
	base.RunConfigArtifactBinding = evaluationTestRunConfigArtifactBinding(
		t, base.PlanDigest, base.RepositoryCommit, base.SourceConfigDigest, base.FrozenRunDigest,
	)
	commitmentDigest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	value := evaluationFrozenConfigCommitment{
		evaluationFrozenConfigCommitmentBase: base,
		CommitmentDigest:                     commitmentDigest,
		SignatureBase64URL:                   base64.RawURLEncoding.EncodeToString(make([]byte, 64)),
	}
	source, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	return source
}

func TestEvaluationFrozenConfigCommitmentHasWorkflowRunStableSchema(t *testing.T) {
	source := evaluationFrozenConfigRetryVector(t)
	first, err := decodeEvaluationFrozenConfigCommitment(source)
	if err != nil {
		t.Fatal(err)
	}
	second, err := decodeEvaluationFrozenConfigCommitment(append([]byte(nil), source...))
	if err != nil {
		t.Fatal(err)
	}
	if first.CommitmentDigest != second.CommitmentDigest || !bytes.Equal(source, evaluationFrozenConfigRetryVector(t)) {
		t.Fatal("workflow-run commitment did not replay byte-for-byte")
	}
	if bytes.Contains(source, []byte("workflowRunAttempt")) {
		t.Fatal("retry-varying workflow attempt leaked into frozen config commitment")
	}

	var legacy map[string]any
	if err := json.Unmarshal(source, &legacy); err != nil {
		t.Fatal(err)
	}
	legacy["workflowRunAttempt"] = float64(2)
	legacyBytes, err := canonicaljson.Bytes(legacy)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeEvaluationFrozenConfigCommitment(legacyBytes); err == nil {
		t.Fatal("legacy retry-varying commitment field was accepted")
	}
}

func TestEvaluationHoldoutRetryReusesSealedClosureWithoutResolvingAuthority(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	repository := &evaluationHoldoutRetryRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
		result: EvaluationHoldoutClosureResult{
			Status:  "sealed",
			Receipt: json.RawMessage(`{"receiptDigest":"` + evaluationServiceTestDigest(t, "receipt") + `"}`),
		},
	}
	sealAuthority := &evaluationHoldoutRetryAuthority{}
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: evaluationServiceTestNamespace, ServiceToken: evaluationServiceTestToken,
		HoldoutSealAuthority: sealAuthority,
	})
	if err != nil {
		t.Fatal(err)
	}
	body, err := canonicaljson.Bytes(map[string]any{"plan": plan.Value})
	if err != nil {
		t.Fatal(err)
	}
	request := authorizedEvaluationServiceRequest(
		http.MethodPut, evaluationServiceTestURL(plan, "holdout-closure"), bytes.NewReader(body),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK || repository.calls != 1 || sealAuthority.calls != 0 {
		t.Fatalf("retry did not reuse sealed closure: status=%d reads=%d resolves=%d body=%s",
			response.Code, repository.calls, sealAuthority.calls, response.Body.String())
	}
}
