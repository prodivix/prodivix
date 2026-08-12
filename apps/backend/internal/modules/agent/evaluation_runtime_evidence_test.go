package agent

import (
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func evaluationRuntimeEvidenceFixture(
	t *testing.T,
	plan evaluationPlanFact,
	fixtures evaluationAuthenticityFixtures,
) (evaluationAttemptFact, evaluationInvocationReceipt, evaluationExecutionReceipt, []byte, []byte) {
	t.Helper()
	attempt := fixtures.Attempt
	invocation, err := decodeEvaluationInvocationReceipt(fixtures.Invocation)
	if err != nil {
		t.Fatal(err)
	}
	executionValue := decodeEvaluationTestObject(t, fixtures.Execution)
	closureDigest := evaluationFixtureDigest(t, "runtime-g3-closure")
	executionValue["verificationClosureDigest"] = closureDigest
	executionValue["receiptDigest"], err = canonicaljson.Digest(mapWithoutEvaluationDigest(executionValue, "receiptDigest"))
	if err != nil {
		t.Fatal(err)
	}
	executionBytes, err := canonicaljson.Bytes(executionValue)
	if err != nil {
		t.Fatal(err)
	}
	execution, err := decodeEvaluationExecutionReceipt(executionBytes)
	if err != nil {
		t.Fatal(err)
	}
	evaluationCase := evaluationPlanObjectByIdentity(plan.Value["concreteCases"], "caseId", attempt.CaseID)
	materialDigest := evaluationFixtureDigest(t, "runtime-material")
	ownerAuthorityReceiptDigests := []any{evaluationFixtureDigest(t, "runtime-owner-authority")}
	ownerAuthoritySetDigest, err := canonicaljson.Digest(map[string]any{
		"ownerAuthorityReceiptDigests": ownerAuthorityReceiptDigests,
	})
	if err != nil {
		t.Fatal(err)
	}
	submission := map[string]any{
		"format": "prodivix.agent-evaluation-result-submission-receipt", "version": int64(1),
		"attemptId": attempt.AttemptID, "invocationId": evaluationInvocationID(invocation),
		"descriptorDigest": attempt.DescriptorDigest, "caseId": attempt.CaseID,
		"caseDigest": evaluationCase["caseDigest"], "materialDigest": materialDigest,
		"caseDefinitionDigest": evaluationCase["caseDefinitionDigest"],
		"toolId":               "evaluation.result.submit", "nativeToolName": "evaluation_result_submit", "toolVersion": "v1",
		"schemaDigest":         evaluationFixtureDigest(t, "runtime-schema"),
		"inputSchemaDigest":    evaluationFixtureDigest(t, "runtime-input-schema"),
		"toolDefinitionDigest": evaluationFixtureDigest(t, "runtime-tool-definition"),
		"providerToolCallId":   "provider-tool-call.runtime", "toolArgumentsDigest": evaluationFixtureDigest(t, "runtime-tool-arguments"),
		"toolEventSequence": int64(3), "toolEventDigest": evaluationFixtureDigest(t, "runtime-tool-event"),
		"terminalEventSequence": int64(4), "terminalEventDigest": evaluationFixtureDigest(t, "runtime-terminal-event"),
		"submissionDigest": evaluationFixtureDigest(t, "runtime-submission"),
	}
	submission["receiptDigest"], err = canonicaljson.Digest(submission)
	if err != nil {
		t.Fatal(err)
	}
	submissionBytes, err := canonicaljson.Bytes(submission)
	if err != nil {
		t.Fatal(err)
	}
	runtime := map[string]any{
		"format": "prodivix.agent-evaluation-controlled-runtime-receipt", "version": int64(1),
		"planDigest": plan.PlanDigest, "repositoryCommit": plan.RepositoryCommit,
		"attemptId": attempt.AttemptID, "descriptorDigest": attempt.DescriptorDigest,
		"caseId": attempt.CaseID, "caseDigest": evaluationCase["caseDigest"], "materialDigest": materialDigest,
		"submissionReceiptDigest": submission["receiptDigest"], "runtimeAuthorityId": "runtime.authority.pg",
		"runtimeImplementationDigest":                 evaluationFixtureDigest(t, "runtime-implementation"),
		"artifactResolutionPolicyDigest":              evaluationFixtureDigest(t, "runtime-artifact-policy"),
		"proposalValidationPolicyDigest":              evaluationFixtureDigest(t, "runtime-proposal-policy"),
		"isolationPolicyDigest":                       evaluationFixtureDigest(t, "runtime-isolation-policy"),
		"g3VerificationPolicyDigest":                  evaluationFixtureDigest(t, "runtime-g3-policy"),
		"controlledRenderPolicyDigest":                evaluationFixtureDigest(t, "runtime-render-policy"),
		"loopPolicyDigest":                            evaluationFixtureDigest(t, "runtime-loop-policy"),
		"maximumTurnsPerAttempt":                      int64(4),
		"maximumToolCallsPerAttempt":                  int64(2),
		"maximumRepairRoundsPerAttempt":               int64(1),
		"maximumAggregateArtifactBytes":               int64(8 * 1_024 * 1_024),
		"grantDigest":                                 evaluationFixtureDigest(t, "runtime-grant"),
		"grantGeneration":                             int64(1),
		"toolRegistryDigest":                          plan.Value["toolRegistryDigest"],
		"actionRegistryDigest":                        evaluationFixtureDigest(t, "runtime-action-registry"),
		"operationSealReceiptDigests":                 []any{},
		"ownerAuthorityReceiptDigests":                ownerAuthorityReceiptDigests,
		"verificationAttemptGrantReceiptDigests":      []any{},
		"producedCapabilityExecutionReceiptSetDigest": attempt.Value["capabilityExecutionReceiptSetDigest"],
		"baseSnapshotDigest":                          evaluationFixtureDigest(t, "runtime-base-snapshot"),
		"finalSnapshotDigest":                         evaluationFixtureDigest(t, "runtime-final-snapshot"),
		"cleanupReceiptDigest":                        evaluationFixtureDigest(t, "runtime-cleanup"),
		"sourceReferencesRevoked":                     true,
		"sandboxDestroyed":                            true,
		"ownerAuthoritySetDigest":                     ownerAuthoritySetDigest,
		"artifactResolution": map[string]any{
			"resolvedArtifactCount": int64(0), "resolvedArtifactBytes": execution.ArtifactBytes,
			"artifactResolutionReceiptSetDigest": evaluationFixtureDigest(t, "runtime-artifact-set"),
		},
		"proposalValidation": map[string]any{
			"verdict": "passed", "typedProposalValidationReceiptDigest": evaluationFixtureDigest(t, "runtime-proposal"),
		},
		"isolatedExecution": map[string]any{
			"isolationPolicyDigest": evaluationFixtureDigest(t, "runtime-isolation-policy"),
			"toolCallCount":         execution.ToolCalls, "repairRoundCount": execution.RepairRounds,
			"commandCount": int64(0), "commandReceiptSetDigest": evaluationFixtureDigest(t, "runtime-command-set"),
			"transactionCount": execution.Transactions,
		},
		"g3Verification": map[string]any{
			"verificationPlanReceiptDigest": evaluationFixtureDigest(t, "runtime-g3-plan"),
			"verificationClosureDigest":     closureDigest, "verdict": "passed",
		},
	}
	if execution.ToolReceiptSetDigest != "" {
		runtime["isolatedExecution"].(map[string]any)["toolReceiptSetDigest"] = execution.ToolReceiptSetDigest
	}
	if execution.TransactionReceiptSetDigest != "" {
		runtime["isolatedExecution"].(map[string]any)["transactionReceiptSetDigest"] = execution.TransactionReceiptSetDigest
	}
	subjective, _ := evaluationCase["subjectiveVisualQuality"].(bool)
	if subjective && attempt.Outcome == "passed" {
		runtime["controlledPreview"] = map[string]any{
			"artifactRef": "preview.runtime.pg", "artifactDigest": evaluationFixtureDigest(t, "runtime-preview"),
			"mediaType": "image/png", "width": int64(1), "height": int64(1), "byteLength": int64(67),
			"renderPolicyDigest": evaluationFixtureDigest(t, "runtime-render-policy"),
		}
	}
	runtime["receiptDigest"], err = canonicaljson.Digest(runtime)
	if err != nil {
		t.Fatal(err)
	}
	runtimeBytes, err := canonicaljson.Bytes(runtime)
	if err != nil {
		t.Fatal(err)
	}
	return attempt, invocation, execution, submissionBytes, runtimeBytes
}

func decodeEvaluationTestObject(t *testing.T, source []byte) map[string]any {
	t.Helper()
	value, _, err := decodeEvaluationAuthenticityObject(source)
	if err != nil {
		t.Fatal(err)
	}
	return value
}

func TestEvaluationRuntimeEvidenceExactBinding(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	_, plan := evaluationReadPartition(t, vector)
	fixtures := evaluationAuthenticityFixturesForPlan(t, plan, vector.Facts.Attempt)
	attempt, invocation, execution, submissionBytes, runtimeBytes := evaluationRuntimeEvidenceFixture(t, plan, fixtures)
	submission, err := decodeEvaluationResultSubmissionReceipt(submissionBytes)
	if err != nil {
		t.Fatal(err)
	}
	runtime, err := decodeEvaluationControlledRuntimeReceipt(runtimeBytes)
	if err != nil {
		t.Fatal(err)
	}
	if err := validateEvaluationRuntimeEvidenceBinding(plan, attempt, invocation, execution, submission, runtime); err != nil {
		t.Fatal(err)
	}
}

func TestEvaluationRuntimeEvidenceRejectsExtraOrDriftedAuthority(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	_, plan := evaluationReadPartition(t, vector)
	fixtures := evaluationAuthenticityFixturesForPlan(t, plan, vector.Facts.Attempt)
	attempt, invocation, execution, submissionBytes, runtimeBytes := evaluationRuntimeEvidenceFixture(t, plan, fixtures)
	submission := decodeEvaluationTestObject(t, submissionBytes)
	submission["rawSubmission"] = "must never persist"
	mutated, err := canonicaljson.Bytes(submission)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeEvaluationResultSubmissionReceipt(mutated); err == nil {
		t.Fatal("result submission receipt accepted an extra raw submission field")
	}
	runtime := decodeEvaluationTestObject(t, runtimeBytes)
	runtime["repositoryCommit"] = "0000000000000000000000000000000000000000"
	runtime["receiptDigest"], err = canonicaljson.Digest(mapWithoutEvaluationDigest(runtime, "receiptDigest"))
	if err != nil {
		t.Fatal(err)
	}
	mutated, err = canonicaljson.Bytes(runtime)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := decodeEvaluationControlledRuntimeReceipt(mutated)
	if err != nil {
		t.Fatal(err)
	}
	validSubmission, err := decodeEvaluationResultSubmissionReceipt(submissionBytes)
	if err != nil {
		t.Fatal(err)
	}
	if err := validateEvaluationRuntimeEvidenceBinding(plan, attempt, invocation, execution, validSubmission, decoded); err == nil {
		t.Fatal("controlled runtime receipt accepted repository commit drift")
	}
}
