package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationRepositoryVector struct {
	Facts struct {
		Plan       json.RawMessage `json:"plan"`
		Attempt    json.RawMessage `json:"attempt"`
		Checkpoint json.RawMessage `json:"checkpoint"`
		Holdout    json.RawMessage `json:"holdout"`
	} `json:"facts"`
}

func readEvaluationRepositoryVector(t *testing.T) evaluationRepositoryVector {
	t.Helper()
	source, err := os.ReadFile(filepath.Join("..", "..", "platform", "agentcontract", "testdata", "agent-evaluation-vector.json"))
	if err != nil {
		t.Fatal(err)
	}
	var vector evaluationRepositoryVector
	if err := json.Unmarshal(source, &vector); err != nil {
		t.Fatal(err)
	}
	return vector
}

func evaluationBudgetFixtures(t *testing.T, modelInvocations int64) ([]byte, []byte) {
	t.Helper()
	amounts := []any{map[string]any{
		"unit": "text-token-input", "logicalAmount": "1", "billableAmount": "1", "confidence": "estimated",
	}}
	vectorDigest, err := canonicaljson.Digest(amounts)
	if err != nil {
		t.Fatal(err)
	}
	demand := map[string]any{
		"usage":            map[string]any{"amounts": amounts, "vectorDigest": vectorDigest},
		"cost":             []any{map[string]any{"currency": "USD", "amount": "0.01", "confidence": "estimated"}},
		"modelInvocations": modelInvocations, "toolCalls": int64(0), "repairRounds": int64(0),
		"transactions": int64(0), "artifactBytes": int64(0), "elapsedMs": int64(1_000),
	}
	demandBytes, err := canonicaljson.Bytes(demand)
	if err != nil {
		t.Fatal(err)
	}
	settlementBase := map[string]any{
		"actual": demand, "charged": demand, "requiresReconciliation": false,
		"settledAt": "2026-08-02T03:20:00.000Z",
	}
	settlementDigest, err := canonicaljson.Digest(settlementBase)
	if err != nil {
		t.Fatal(err)
	}
	settlement := map[string]any{}
	for key, value := range settlementBase {
		settlement[key] = value
	}
	settlement["settlementDigest"] = settlementDigest
	settlementBytes, err := canonicaljson.Bytes(settlement)
	if err != nil {
		t.Fatal(err)
	}
	return demandBytes, settlementBytes
}

func evaluationAttemptOutsidePlan(t *testing.T, source json.RawMessage) []byte {
	t.Helper()
	var envelope map[string]any
	if err := json.Unmarshal(source, &envelope); err != nil {
		t.Fatal(err)
	}
	value := envelope["value"].(map[string]any)
	descriptor := value["descriptor"].(map[string]any)
	descriptor["contextTier"] = "representative"
	samplingBase := map[string]any{
		"planDigest": descriptor["planDigest"], "caseId": descriptor["caseId"],
		"capabilityDescriptorDigest": descriptor["capabilityDescriptorDigest"],
		"targetId":                   descriptor["targetId"], "targetDigest": descriptor["targetDigest"],
		"riskClass": descriptor["riskClass"], "contextTier": descriptor["contextTier"],
		"repetitionIndex": descriptor["repetitionIndex"],
	}
	samplingDigest, err := canonicaljson.Digest(samplingBase)
	if err != nil {
		t.Fatal(err)
	}
	descriptor["samplingIdentityDigest"] = samplingDigest
	descriptor["attemptId"] = "evaluation-attempt:" + samplingDigest[len("sha256-"):]
	descriptorBase := map[string]any{}
	for key, entry := range descriptor {
		if key != "descriptorDigest" {
			descriptorBase[key] = entry
		}
	}
	descriptor["descriptorDigest"], err = canonicaljson.Digest(descriptorBase)
	if err != nil {
		t.Fatal(err)
	}
	attemptBase := map[string]any{}
	for key, entry := range value {
		if key != "attemptDigest" {
			attemptBase[key] = entry
		}
	}
	value["attemptDigest"], err = canonicaljson.Digest(attemptBase)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

type evaluationAuthenticityFixtures struct {
	Attempt            evaluationAttemptFact
	Invocation         []byte
	Execution          []byte
	InvocationTurn     EvaluationInvocationTurnReceiptRecord
	Capability         []byte
	PreDispatchFailure []byte
	InvocationSources  [][]byte
	EndpointSmoke      []byte
	EndpointSources    [][]byte
}

func evaluationPostgresPreDispatchCapabilityFixtures(
	t *testing.T,
	plan evaluationPlanFact,
	fixtures evaluationAuthenticityFixtures,
) evaluationAuthenticityFixtures {
	t.Helper()
	invocation, err := decodeEvaluationInvocationReceipt(fixtures.Invocation)
	if err != nil {
		t.Fatal(err)
	}
	nested := invocation.Value["invocationReceipt"].(map[string]any)
	preDispatch := map[string]any{
		"format": evaluationPreDispatchFailureReceiptFormat, "version": int64(1),
		"failureReceiptId": "pre-dispatch." + fixtures.Attempt.AttemptID,
		"planDigest":       plan.PlanDigest, "repositoryCommit": plan.RepositoryCommit,
		"attemptId": fixtures.Attempt.AttemptID, "descriptorDigest": fixtures.Attempt.DescriptorDigest,
		"turnIndex": int64(0), "invocationId": nested["invocationId"],
		"stage": "dispatch-admission", "reasonCode": "cancelled-before-dispatch",
		"policyDigest":  evaluationFixtureDigest(t, "pre-dispatch-policy"),
		"inputDigest":   evaluationFixtureDigest(t, "pre-dispatch-input"),
		"findingDigest": evaluationFixtureDigest(t, "pre-dispatch-finding"),
		"occurredAt":    fixtures.Attempt.Value["startedAt"],
	}
	preDispatch["receiptDigest"], err = canonicaljson.Digest(preDispatch)
	if err != nil {
		t.Fatal(err)
	}
	preDispatchBytes, err := canonicaljson.Bytes(preDispatch)
	if err != nil {
		t.Fatal(err)
	}
	turnValue := map[string]any{
		"format": evaluationInvocationTurnReceiptFormat, "version": int64(1),
		"planDigest": plan.PlanDigest, "repositoryCommit": plan.RepositoryCommit,
		"attemptId": fixtures.Attempt.AttemptID, "descriptorDigest": fixtures.Attempt.DescriptorDigest,
		"turnIndex": int64(0), "invocationId": nested["invocationId"],
		"status": "infrastructure-error", "dispatchState": "not-created", "terminal": true,
		"caseDefinitionDigest": invocation.CaseDefinitionDigest, "contextPackDigest": invocation.ContextPackDigest,
		"executionFailureAuthorityReceiptDigest": preDispatch["receiptDigest"],
	}
	turnValue["evidenceDigest"], err = canonicaljson.Digest(turnValue)
	if err != nil {
		t.Fatal(err)
	}
	turnBytes, err := canonicaljson.Bytes(turnValue)
	if err != nil {
		t.Fatal(err)
	}
	turn, err := decodeEvaluationInvocationTurnReceipt(turnBytes)
	if err != nil {
		t.Fatal(err)
	}
	evaluationCase := evaluationPlanObjectByIdentity(plan.Value["concreteCases"], "caseId", fixtures.Attempt.CaseID)
	target := evaluationPlanObjectByIdentity(plan.Value["capabilityQualificationTargets"], "targetId", fixtures.Attempt.TargetID)
	capabilityDescriptor := evaluationCase["capabilityDescriptor"].(map[string]any)
	capability := map[string]any{
		"format": evaluationCapabilityExecutionReceiptFormat, "version": int64(1),
		"capabilityExecutionReceiptId": "capability-execution." + fixtures.Attempt.AttemptID,
		"planDigest":                   plan.PlanDigest, "repositoryCommit": plan.RepositoryCommit,
		"attemptId": fixtures.Attempt.AttemptID, "descriptorDigest": fixtures.Attempt.DescriptorDigest,
		"turnIndex": int64(0), "invocationId": nested["invocationId"],
		"caseId": fixtures.Attempt.CaseID, "caseDigest": evaluationCase["caseDigest"],
		"targetId": fixtures.Attempt.TargetID, "targetDigest": target["targetDigest"],
		"capabilityProfileId":        evaluationCase["capabilityProfileId"],
		"capabilityId":               capabilityDescriptor["capabilityId"],
		"supportExpectation":         capabilityDescriptor["supportExpectation"],
		"expectedToolIds":            capabilityDescriptor["expectedToolIds"],
		"expectedReceiptKinds":       capabilityDescriptor["expectedReceiptKinds"],
		"capabilityDescriptorDigest": evaluationCase["capabilityDescriptorDigest"],
		"toolBindings":               []any{}, "outcome": "failed", "verdict": "failed",
		"specificReceiptDigests": []any{}, "attemptAuthorityOwnerReceiptDigests": []any{},
		"policyDigest":       plan.Value["policyDigest"],
		"toolRegistryDigest": plan.Value["toolRegistryDigest"], "observedAt": fixtures.Attempt.Value["completedAt"],
	}
	capability["receiptDigest"], err = canonicaljson.Digest(capability)
	if err != nil {
		t.Fatal(err)
	}
	fixtures.Capability, err = canonicaljson.Bytes(capability)
	if err != nil {
		t.Fatal(err)
	}
	capabilitySetDigest, err := canonicaljson.Digest([]any{capability["receiptDigest"]})
	if err != nil {
		t.Fatal(err)
	}
	fixtures.Attempt.Value["capabilityExecutionReceiptSetDigest"] = capabilitySetDigest
	fixtures.Attempt.Value["outcome"] = "inconclusive"
	fixtures.Attempt.Value["attemptDigest"], err = canonicaljson.Digest(
		mapWithoutEvaluationDigest(fixtures.Attempt.Value, "attemptDigest"),
	)
	if err != nil {
		t.Fatal(err)
	}
	attemptBytes, err := canonicaljson.Bytes(map[string]any{
		"wireVersion": int64(1), "factType": "evaluation-attempt", "value": fixtures.Attempt.Value,
	})
	if err != nil {
		t.Fatal(err)
	}
	fixtures.Attempt, err = decodeEvaluationAttempt(attemptBytes)
	if err != nil {
		t.Fatal(err)
	}
	var execution map[string]any
	decoder := json.NewDecoder(bytes.NewReader(fixtures.Execution))
	decoder.UseNumber()
	if err := decoder.Decode(&execution); err != nil {
		t.Fatal(err)
	}
	execution["capabilityExecutionReceiptSetDigest"] = capabilitySetDigest
	execution["receiptDigest"], err = canonicaljson.Digest(mapWithoutEvaluationDigest(execution, "receiptDigest"))
	if err != nil {
		t.Fatal(err)
	}
	fixtures.Execution, err = canonicaljson.Bytes(execution)
	if err != nil {
		t.Fatal(err)
	}
	fixtures.InvocationTurn = turn.EvaluationInvocationTurnReceiptRecord
	fixtures.PreDispatchFailure = preDispatchBytes
	return fixtures
}

func evaluationFixtureDigest(t *testing.T, label string) string {
	t.Helper()
	digest, err := canonicaljson.Digest(map[string]any{"fixture": label})
	if err != nil {
		t.Fatal(err)
	}
	return digest
}

func evaluationSourceReceiptFixture(t *testing.T, value map[string]any) []byte {
	t.Helper()
	receiptDigest, err := canonicaljson.Digest(value)
	if err != nil {
		t.Fatal(err)
	}
	value["receiptDigest"] = receiptDigest
	canonical, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	return canonical
}

func storeEvaluationReviewCandidateTurnJournal(
	t *testing.T,
	database *sql.DB,
	repository *Repository,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	plan evaluationPlanFact,
	fixtures evaluationAuthenticityFixtures,
) {
	t.Helper()
	invocation, err := decodeEvaluationInvocationReceipt(fixtures.Invocation)
	if err != nil {
		t.Fatal(err)
	}
	turn, err := decodeEvaluationInvocationTurnReceipt(fixtures.InvocationTurn.ReceiptBytes)
	if err != nil {
		t.Fatal(err)
	}
	demandBytes, _ := evaluationBudgetFixtures(t, 1)
	reservation, replayed, err := repository.ReserveEvaluationBudget(
		context.Background(), authority, partition.PlanDigest,
		"evaluation-reservation.review-candidate", 0, demandBytes, fixtures.Attempt.StartedAt,
	)
	if err != nil || replayed {
		t.Fatalf("reserve review-candidate turn budget replay=%v err=%v", replayed, err)
	}
	descriptor := fixtures.Attempt.Value["descriptor"].(map[string]any)
	descriptorBytes, err := canonicaljson.Bytes(descriptor)
	if err != nil {
		t.Fatal(err)
	}
	nestedInvocation := invocation.Value["invocationReceipt"].(map[string]any)
	provider := nestedInvocation["provider"].(map[string]any)
	model := nestedInvocation["model"].(map[string]any)
	journal, err := database.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = journal.Rollback() }()
	if _, err := journal.Exec(`INSERT INTO agent_evaluation_transport_dispatch_intents (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,descriptor_json,descriptor_bytes,
		turn_index,budget_reservation_id,intent_id,invocation_id,protocol_family,provider_configuration_id,
		model_lineage_digest,inference_configuration_digest,demand_digest,request_digest,endpoint_id,
		endpoint_class,request_body_digest,request_bytes,intent_digest,intent_json,intent_bytes,created_at
	) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'{}'::jsonb,$23,$24)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, fixtures.Attempt.AttemptID,
		fixtures.Attempt.DescriptorDigest, string(descriptorBytes), descriptorBytes, int64(0), reservation.ReservationID,
		"dispatch-intent.review-candidate", turn.InvocationID, "openai-responses",
		stringMember(provider, "providerConfigurationId"), stringMember(model, "lineageDigest"),
		stringMember(nestedInvocation, "inferenceConfigurationDigest"), reservation.DemandDigest,
		invocation.RequestArtifactDigest, "endpoint.review-candidate", "first-party-hosted",
		invocation.RequestArtifactDigest, int64(0), turn.DispatchIntentDigest, []byte(`{}`), fixtures.Attempt.StartedAt,
	); err != nil {
		t.Fatalf("store review-candidate dispatch intent: %v", err)
	}
	if _, err := journal.Exec(`INSERT INTO agent_evaluation_transport_receipts (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,turn_index,intent_digest,
		receipt_id,invocation_id,provider_configuration_id,provider_request_id,dispatch_state,outcome,
		response_body_digest,receipt_digest,receipt_json,receipt_bytes,started_at,completed_at,closed_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,'dispatched','completed',$11,$12,'{}'::jsonb,$13,$14,$15,$15)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, fixtures.Attempt.AttemptID,
		fixtures.Attempt.DescriptorDigest, int64(0), turn.DispatchIntentDigest,
		"transport-receipt.review-candidate", turn.InvocationID, stringMember(provider, "providerConfigurationId"),
		invocation.ResponseArtifactDigest, turn.TransportReceiptDigest, []byte(`{}`),
		fixtures.Attempt.StartedAt, fixtures.Attempt.CompletedAt,
	); err != nil {
		t.Fatalf("store review-candidate transport receipt: %v", err)
	}
	digest := evaluationFixtureDigest(t, "review-candidate-spool")
	envelopeDigest := evaluationFixtureDigest(t, "review-candidate-envelope")
	spoolCreatedAt, spoolExpiresAt := fixtures.Attempt.StartedAt, fixtures.Attempt.CompletedAt.Add(time.Hour)
	if _, err := journal.Exec(`INSERT INTO agent_evaluation_provider_result_spool_receipts (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,turn_index,invocation_id,
		spool_ref,dispatch_intent_digest,transport_receipt_digest,algorithm,encryption_profile_digest,
		key_ref_digest,key_id,key_version,aad_digest,envelope_digest,ciphertext_digest,ciphertext_size_bytes,
		response_body_digest,normalized_event_set_digest,response_digest,opaque_continuation_digest,
		retention_class,retention_policy_digest,receipt_digest,receipt_json,receipt_bytes,created_at,expires_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'aes-256-gcm',$11,$11,$12,1,$11,$13,$11,1,$14,$11,$14,NULL,
		'attempt-resume-only',$11,$15,'{}'::jsonb,$16,$17,$18)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, fixtures.Attempt.AttemptID,
		fixtures.Attempt.DescriptorDigest, int64(0), turn.InvocationID, "spool.review-candidate",
		turn.DispatchIntentDigest, turn.TransportReceiptDigest, digest, "key.review-candidate",
		envelopeDigest, invocation.ResponseArtifactDigest,
		turn.ProviderResultSpoolReceiptDigest, []byte(`{}`), spoolCreatedAt, spoolExpiresAt,
	); err != nil {
		t.Fatalf("store review-candidate spool receipt: %v", err)
	}
	if _, err := journal.Exec(`INSERT INTO agent_evaluation_provider_result_spool_payloads (
		namespace_id,plan_digest,repository_commit,attempt_id,turn_index,spool_ref,key_id,key_version,
		nonce_bytes,authentication_tag_bytes,ciphertext_bytes,ciphertext_digest,ciphertext_size_bytes,
		aad_json,aad_bytes,envelope_json,envelope_bytes,envelope_digest,created_at,expires_at
	) VALUES ($1,$2,$3,$4,0,$5,$6,1,$7,$8,$9,$10,1,'{}'::jsonb,$11,'{}'::jsonb,$11,$12,$13,$14)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, fixtures.Attempt.AttemptID,
		"spool.review-candidate", "key.review-candidate", make([]byte, 12), make([]byte, 16), []byte{1},
		digest, []byte(`{}`), envelopeDigest, spoolCreatedAt, spoolExpiresAt,
	); err != nil {
		t.Fatalf("store review-candidate spool payload: %v", err)
	}
	if err := insertEvaluationInvocationTurnV3(
		context.Background(), journal, authority.NamespaceID, partition, turn,
	); err != nil {
		t.Fatalf("store review-candidate invocation turn: %v", err)
	}
	if err := journal.Commit(); err != nil {
		t.Fatalf("commit review-candidate turn journal: %v", err)
	}
}

func evaluationAuthenticityFixturesForPlan(t *testing.T, plan evaluationPlanFact, source json.RawMessage) evaluationAuthenticityFixtures {
	t.Helper()
	attempt := evaluationAttemptWithRepetition(t, source, 1)
	usageContentDigest := evaluationFixtureDigest(t, "invocation-usage-source")
	costContentDigest := evaluationFixtureDigest(t, "invocation-cost-source")
	usage := attempt.Value["usage"].(map[string]any)
	for _, raw := range usage["amounts"].([]any) {
		raw.(map[string]any)["sourceDigest"] = usageContentDigest
	}
	var err error
	usage["vectorDigest"], err = canonicaljson.Digest(usage["amounts"])
	if err != nil {
		t.Fatal(err)
	}
	for _, raw := range attempt.Value["cost"].([]any) {
		raw.(map[string]any)["sourceDigest"] = costContentDigest
	}
	requestDigest := evaluationFixtureDigest(t, "invocation-request")
	attemptBase := make(map[string]any, len(attempt.Value)-1)
	for key, value := range attempt.Value {
		if key != "attemptDigest" {
			attemptBase[key] = value
		}
	}
	attempt.Value["attemptDigest"], err = canonicaljson.Digest(attemptBase)
	if err != nil {
		t.Fatal(err)
	}
	attemptEnvelope := map[string]any{"wireVersion": int64(1), "factType": "evaluation-attempt", "value": attempt.Value}
	attemptBytes, err := canonicaljson.Bytes(attemptEnvelope)
	if err != nil {
		t.Fatal(err)
	}
	attempt, err = decodeEvaluationAttempt(attemptBytes)
	if err != nil {
		t.Fatal(err)
	}

	target := evaluationPlanObjectByIdentity(plan.Value["capabilityQualificationTargets"], "targetId", attempt.TargetID)
	evaluationCase := evaluationPlanObjectByIdentity(plan.Value["concreteCases"], "caseId", attempt.CaseID)
	provider := evaluationPlanObjectByIdentity(plan.Value["providerConfigurations"], "providerConfigurationId", stringMember(target, "providerConfigurationId"))
	model := evaluationPlanObjectByIdentity(plan.Value["modelConfigurations"], "lineageDigest", stringMember(target, "modelLineageDigest"))
	providerRequestID := "provider-request.invocation.pg"
	usageSource := map[string]any{
		"sourceReceiptId": "source.invocation.usage.pg", "planDigest": plan.PlanDigest,
		"repositoryCommit": plan.RepositoryCommit, "sourceKind": "provider-reported-usage",
		"providerConfigurationId": stringMember(provider, "providerConfigurationId"),
		"modelLineageDigest":      stringMember(model, "lineageDigest"), "providerRequestId": providerRequestID,
		"sourceContentDigest": usageContentDigest, "inputUsageDigest": stringMember(usage, "vectorDigest"),
		"observedAt": attempt.Value["completedAt"],
	}
	costValueDigest, err := evaluationCanonicalCostValueDigest(attempt.Value["cost"])
	if err != nil {
		t.Fatal(err)
	}
	costSource := map[string]any{
		"sourceReceiptId": "source.invocation.cost.pg", "planDigest": plan.PlanDigest,
		"repositoryCommit": plan.RepositoryCommit, "sourceKind": "provider-reported-cost",
		"providerConfigurationId": stringMember(provider, "providerConfigurationId"),
		"modelLineageDigest":      stringMember(model, "lineageDigest"), "providerRequestId": providerRequestID,
		"sourceContentDigest": costContentDigest, "outputCostDigest": costValueDigest,
		"observedAt": attempt.Value["completedAt"],
	}
	usageSourceBytes := evaluationSourceReceiptFixture(t, usageSource)
	costSourceBytes := evaluationSourceReceiptFixture(t, costSource)
	decodedUsageSource, err := decodeEvaluationSourceReceipt(usageSourceBytes)
	if err != nil {
		t.Fatal(err)
	}
	decodedCostSource, err := decodeEvaluationSourceReceipt(costSourceBytes)
	if err != nil {
		t.Fatal(err)
	}
	contextPackDigest := evaluationFixtureDigest(t, "invocation-context-pack")
	invocationReceipt := map[string]any{
		"invocationId": "invocation.pg", "taskId": "task.evaluation.pg", "runId": attempt.IndependentRunID,
		"generation": int64(0), "attempt": int64(0), "provider": provider, "model": model,
		"capabilityQualificationDigest": stringMember(target, "qualificationSliceDigest"),
		"inferenceConfigurationDigest":  stringMember(target, "inferenceConfigurationDigest"),
		"contextPackDigest":             contextPackDigest, "requestDigest": requestDigest,
		"responseDigest": attempt.Value["responseDigest"], "outcome": "completed",
		"usage": attempt.Value["usage"], "costStatus": "priced", "cost": attempt.Value["cost"],
		"startedAt": attempt.Value["startedAt"], "completedAt": attempt.Value["completedAt"],
	}
	invocationReceipt["receiptDigest"], err = canonicaljson.Digest(invocationReceipt)
	if err != nil {
		t.Fatal(err)
	}
	usageSourceDigest, err := evaluationAuthenticityUsageSourceDigest(invocationReceipt["usage"], false)
	if err != nil {
		t.Fatal(err)
	}
	costSourceDigest, err := evaluationAuthenticityCostSourceDigest(invocationReceipt["cost"], true)
	if err != nil {
		t.Fatal(err)
	}
	invocation := map[string]any{
		"planDigest": plan.PlanDigest, "repositoryCommit": plan.RepositoryCommit,
		"attemptId": attempt.AttemptID, "descriptorDigest": attempt.DescriptorDigest,
		"providerRequestId": providerRequestID, "responseHeaderDigest": evaluationFixtureDigest(t, "invocation-response-headers"),
		"caseDefinitionDigest": stringMember(evaluationCase, "caseDefinitionDigest"), "contextPackDigest": contextPackDigest,
		"requestArtifactDigest": requestDigest, "responseArtifactDigest": attempt.Value["responseDigest"],
		"usageSourceDigest": usageSourceDigest, "costSourceDigest": costSourceDigest,
		"usageSourceReceiptDigest": decodedUsageSource.ReceiptDigest,
		"costSourceReceiptDigest":  decodedCostSource.ReceiptDigest, "invocationReceipt": invocationReceipt,
	}
	transportReceiptDigest := evaluationFixtureDigest(t, "invocation-transport-receipt")
	invocation["transportReceiptDigest"] = transportReceiptDigest
	resolvedIdentity := map[string]any{
		"protocolFamily":         stringMember(provider, "protocolFamily"),
		"transportReceiptDigest": transportReceiptDigest,
		"frozenModelId":          stringMember(model, "modelId"),
		"resolvedModelId":        stringMember(model, "modelId"),
	}
	invocation["resolvedModelId"] = stringMember(model, "modelId")
	if immutableVersion := stringMember(model, "immutableVersion"); immutableVersion != "" {
		resolvedIdentity["frozenImmutableModelVersion"] = immutableVersion
		resolvedIdentity["resolvedModelVersion"] = immutableVersion
		invocation["resolvedModelVersion"] = immutableVersion
	}
	invocation["resolvedModelIdentityDigest"], err = canonicaljson.Digest(resolvedIdentity)
	if err != nil {
		t.Fatal(err)
	}
	invocation["evidenceDigest"], err = canonicaljson.Digest(invocation)
	if err != nil {
		t.Fatal(err)
	}
	invocationBytes, err := canonicaljson.Bytes(invocation)
	if err != nil {
		t.Fatal(err)
	}
	decodedInvocation, err := decodeEvaluationInvocationReceipt(invocationBytes)
	if err != nil {
		t.Fatal(err)
	}
	invocationTurn := evaluationInvocationTurnFixtureFromLegacy(
		t, "evaluation.fixture", plan, attempt, decodedInvocation,
	)
	capabilityDescriptor := evaluationCase["capabilityDescriptor"].(map[string]any)
	expectedToolIDs := capabilityDescriptor["expectedToolIds"].([]any)
	expectedReceiptKinds := capabilityDescriptor["expectedReceiptKinds"].([]any)
	toolBindings := make([]any, len(expectedToolIDs))
	for index, rawToolID := range expectedToolIDs {
		toolBindings[index] = map[string]any{
			"toolId": rawToolID, "definitionDigest": evaluationFixtureDigest(t, fmt.Sprintf("capability-tool-%d", index)),
		}
	}
	linkedDigests := []string{
		invocationTurn.EvidenceDigest, invocationTurn.TransportReceiptDigest,
		decodedInvocation.ResponseHeaderDigest, decodedInvocation.RequestArtifactDigest,
		decodedInvocation.ResponseArtifactDigest, decodedInvocation.UsageSourceReceiptDigest,
		decodedInvocation.CostSourceReceiptDigest,
	}
	specificReceipts := make([]any, len(expectedReceiptKinds))
	for index, rawKind := range expectedReceiptKinds {
		specificReceipts[index] = map[string]any{
			"receiptKind": rawKind, "receiptDigest": linkedDigests[index%len(linkedDigests)],
		}
	}
	supportExpectation := stringMember(capabilityDescriptor, "supportExpectation")
	capabilityOutcome := "supported"
	if supportExpectation == "expected-blocked" {
		capabilityOutcome = "unsupported"
		toolBindings = []any{}
	}
	capability := map[string]any{
		"format": evaluationCapabilityExecutionReceiptFormat, "version": int64(1),
		"capabilityExecutionReceiptId": "capability-execution." + attempt.AttemptID,
		"planDigest":                   plan.PlanDigest, "repositoryCommit": plan.RepositoryCommit,
		"attemptId": attempt.AttemptID, "descriptorDigest": attempt.DescriptorDigest,
		"turnIndex": int64(0), "invocationId": decodedInvocation.Value["invocationReceipt"].(map[string]any)["invocationId"],
		"caseId": attempt.CaseID, "caseDigest": evaluationCase["caseDigest"],
		"targetId": attempt.TargetID, "targetDigest": target["targetDigest"],
		"capabilityProfileId": evaluationCase["capabilityProfileId"],
		"capabilityId":        capabilityDescriptor["capabilityId"], "supportExpectation": supportExpectation,
		"expectedToolIds": expectedToolIDs, "expectedReceiptKinds": expectedReceiptKinds,
		"capabilityDescriptorDigest": evaluationCase["capabilityDescriptorDigest"],
		"toolBindings":               toolBindings, "outcome": capabilityOutcome, "verdict": "passed",
		"specificReceiptDigests": specificReceipts, "policyDigest": plan.Value["policyDigest"],
		"toolRegistryDigest": plan.Value["toolRegistryDigest"], "observedAt": attempt.Value["completedAt"],
	}
	capability["receiptDigest"], err = canonicaljson.Digest(capability)
	if err != nil {
		t.Fatal(err)
	}
	capabilityBytes, err := canonicaljson.Bytes(capability)
	if err != nil {
		t.Fatal(err)
	}
	capabilitySetDigest, err := canonicaljson.Digest([]any{capability["receiptDigest"]})
	if err != nil {
		t.Fatal(err)
	}
	attempt.Value["capabilityExecutionReceiptSetDigest"] = capabilitySetDigest
	attempt.Value["attemptDigest"], err = canonicaljson.Digest(mapWithoutEvaluationDigest(attempt.Value, "attemptDigest"))
	if err != nil {
		t.Fatal(err)
	}
	attemptBytes, err = canonicaljson.Bytes(map[string]any{
		"wireVersion": int64(1), "factType": "evaluation-attempt", "value": attempt.Value,
	})
	if err != nil {
		t.Fatal(err)
	}
	attempt, err = decodeEvaluationAttempt(attemptBytes)
	if err != nil {
		t.Fatal(err)
	}
	execution := map[string]any{
		"executionReceiptId": "execution.pg", "planDigest": plan.PlanDigest, "repositoryCommit": plan.RepositoryCommit,
		"attemptId": attempt.AttemptID, "descriptorDigest": attempt.DescriptorDigest,
		"modelInvocations": int64(1), "toolCalls": int64(0), "repairRounds": int64(0),
		"transactions": int64(0), "artifactBytes": int64(0), "elapsedMs": attempt.CompletedAt.Sub(attempt.StartedAt).Milliseconds(),
		"capabilityExecutionReceiptSetDigest":      attempt.Value["capabilityExecutionReceiptSetDigest"],
		"verificationAttemptGrantReceiptSetDigest": attempt.Value["verificationAttemptGrantReceiptSetDigest"],
	}
	execution["receiptDigest"], err = canonicaljson.Digest(execution)
	if err != nil {
		t.Fatal(err)
	}
	executionBytes, err := canonicaljson.Bytes(execution)
	if err != nil {
		t.Fatal(err)
	}

	smokeTargetValues := plan.Value["endpointSmokeTargets"].([]any)
	smokeTarget := smokeTargetValues[0].(map[string]any)
	smokeUsageContentDigest := evaluationFixtureDigest(t, "smoke-usage-source")
	smokeCostContentDigest := evaluationFixtureDigest(t, "smoke-cost-source")
	smokeAmounts := []any{map[string]any{
		"unit": "text-token-input", "logicalAmount": "1", "billableAmount": "1", "confidence": "reported",
		"sourceDigest": smokeUsageContentDigest,
	}}
	smokeUsageVectorDigest, err := canonicaljson.Digest(smokeAmounts)
	if err != nil {
		t.Fatal(err)
	}
	smokeUsage := map[string]any{"amounts": smokeAmounts, "vectorDigest": smokeUsageVectorDigest}
	smokeCost := []any{map[string]any{
		"currency": "USD", "amount": "0.000001", "confidence": "measured", "sourceDigest": smokeCostContentDigest,
	}}
	smokeCostValueDigest, err := evaluationCanonicalCostValueDigest(smokeCost)
	if err != nil {
		t.Fatal(err)
	}
	smokeProviderRequestID := "provider-request.smoke.pg"
	smokeUsageSource := map[string]any{
		"sourceReceiptId": "source.smoke.usage.pg", "planDigest": plan.PlanDigest,
		"repositoryCommit": plan.RepositoryCommit, "sourceKind": "provider-reported-usage",
		"providerConfigurationId": smokeTarget["providerConfigurationId"], "providerRequestId": smokeProviderRequestID,
		"sourceContentDigest": smokeUsageContentDigest, "inputUsageDigest": smokeUsageVectorDigest,
		"observedAt": "2026-08-02T00:02:00.000Z",
	}
	smokeCostSource := map[string]any{
		"sourceReceiptId": "source.smoke.cost.pg", "planDigest": plan.PlanDigest,
		"repositoryCommit": plan.RepositoryCommit, "sourceKind": "provider-reported-cost",
		"providerConfigurationId": smokeTarget["providerConfigurationId"], "providerRequestId": smokeProviderRequestID,
		"sourceContentDigest": smokeCostContentDigest, "outputCostDigest": smokeCostValueDigest,
		"observedAt": "2026-08-02T00:02:00.000Z",
	}
	smokeUsageSourceBytes := evaluationSourceReceiptFixture(t, smokeUsageSource)
	smokeCostSourceBytes := evaluationSourceReceiptFixture(t, smokeCostSource)
	decodedSmokeUsageSource, err := decodeEvaluationSourceReceipt(smokeUsageSourceBytes)
	if err != nil {
		t.Fatal(err)
	}
	decodedSmokeCostSource, err := decodeEvaluationSourceReceipt(smokeCostSourceBytes)
	if err != nil {
		t.Fatal(err)
	}
	smokeUsageSourceDigest, err := evaluationAuthenticityUsageSourceDigest(smokeUsage, true)
	if err != nil {
		t.Fatal(err)
	}
	smokeCostSourceDigest, err := evaluationAuthenticityCostSourceDigest(smokeCost, true)
	if err != nil {
		t.Fatal(err)
	}
	endpointSmoke := map[string]any{
		"receiptId": "smoke-receipt.pg", "planDigest": plan.PlanDigest, "repositoryCommit": plan.RepositoryCommit,
		"smokeTargetId": smokeTarget["smokeTargetId"], "smokeTargetDigest": smokeTarget["targetDigest"],
		"endpointClass": smokeTarget["endpointClass"], "protocolFamily": smokeTarget["protocolFamily"],
		"providerConfigurationId": smokeTarget["providerConfigurationId"], "adapterDigest": smokeTarget["adapterDigest"],
		"smokeProfileDigest": smokeTarget["smokeProfileDigest"], "providerRequestId": smokeProviderRequestID,
		"responseHeaderDigest": evaluationFixtureDigest(t, "smoke-response-headers"),
		"requestDigest":        evaluationFixtureDigest(t, "smoke-request"), "responseDigest": evaluationFixtureDigest(t, "smoke-response"),
		"usage": smokeUsage, "cost": smokeCost, "usageSourceDigest": smokeUsageSourceDigest, "costSourceDigest": smokeCostSourceDigest,
		"usageSourceReceiptDigest": decodedSmokeUsageSource.ReceiptDigest,
		"costSourceReceiptDigest":  decodedSmokeCostSource.ReceiptDigest,
		"outcome":                  "passed", "startedAt": "2026-08-02T00:01:00.000Z", "completedAt": "2026-08-02T00:02:00.000Z",
	}
	endpointSmoke["receiptDigest"], err = canonicaljson.Digest(endpointSmoke)
	if err != nil {
		t.Fatal(err)
	}
	endpointSmokeBytes, err := canonicaljson.Bytes(endpointSmoke)
	if err != nil {
		t.Fatal(err)
	}
	return evaluationAuthenticityFixtures{
		Attempt: attempt, Invocation: invocationBytes, Execution: executionBytes,
		InvocationTurn: invocationTurn, Capability: capabilityBytes,
		InvocationSources: [][]byte{usageSourceBytes, costSourceBytes},
		EndpointSmoke:     endpointSmokeBytes, EndpointSources: [][]byte{smokeUsageSourceBytes, smokeCostSourceBytes},
	}
}

func mapWithoutEvaluationDigest(value map[string]any, digestField string) map[string]any {
	base := make(map[string]any, len(value)-1)
	for key, entry := range value {
		if key != digestField {
			base[key] = entry
		}
	}
	return base
}

func TestEvaluationReviewCandidatePostgreSQLRoundTrip(t *testing.T) {
	databaseA, databaseB := openAgentPostgreSQL(t)
	repositoryA, repositoryB := NewRepository(databaseA), NewRepository(databaseB)
	vector := readEvaluationRepositoryVector(t)
	ctx := context.Background()
	authority := EvaluationAuthority{
		Kind: "service", PrincipalID: "evaluation.review-runner", NamespaceID: "evaluation.g4-review-candidate-pg",
	}
	planRecord, replayed, err := repositoryA.StoreEvaluationPlan(ctx, authority, vector.Facts.Plan)
	if err != nil || replayed {
		t.Fatalf("store review-candidate plan = %#v replay=%v err=%v", planRecord, replayed, err)
	}
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	partition := EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit}
	subjectiveSource := evaluationSubjectiveAttemptSource(t, plan, vector.Facts.Attempt)
	fixtures := evaluationAuthenticityFixturesForPlan(t, plan, subjectiveSource)
	for _, source := range fixtures.InvocationSources {
		if _, replayed, err := repositoryA.StoreEvaluationSourceReceipt(ctx, authority, partition, source); err != nil || replayed {
			t.Fatalf("store review-candidate source replay=%v err=%v", replayed, err)
		}
	}
	invocation, replayed, err := repositoryA.StoreEvaluationInvocationReceipt(ctx, authority, partition, fixtures.Invocation)
	if err != nil || replayed {
		t.Fatalf("store review-candidate invocation = %#v replay=%v err=%v", invocation, replayed, err)
	}
	execution, replayed, err := repositoryA.StoreEvaluationExecutionReceipt(ctx, authority, partition, fixtures.Execution)
	if err != nil || replayed {
		t.Fatalf("store review-candidate execution = %#v replay=%v err=%v", execution, replayed, err)
	}
	if _, replayed, err := repositoryA.StoreEvaluationAttempt(ctx, authority, fixtures.Attempt.Canonical); err != nil || replayed {
		t.Fatalf("store review-candidate attempt replay=%v err=%v", replayed, err)
	}
	storeEvaluationReviewCandidateTurnJournal(
		t, databaseA, repositoryA, authority, partition, plan, fixtures,
	)
	projectionAuthorityDigest := evaluationFixtureDigest(t, "subjective-projection-authority")
	scanFixture := evaluationReviewRasterScanFixture(
		t, authority.NamespaceID, plan, fixtures.Attempt, projectionAuthorityDigest,
	)
	scan, replayed, err := repositoryA.StoreEvaluationReviewRasterScanReceipt(
		ctx, authority, partition, scanFixture.ReceiptBytes,
	)
	if err != nil || replayed {
		t.Fatalf("store evaluation review raster scan receipt = %#v replay=%v err=%v", scan, replayed, err)
	}
	replayedScan, replayed, err := repositoryB.StoreEvaluationReviewRasterScanReceipt(
		ctx, authority, partition, scanFixture.ReceiptBytes,
	)
	if err != nil || !replayed || replayedScan.ReceiptDigest != scan.ReceiptDigest {
		t.Fatalf("replay evaluation review raster scan receipt = %#v replay=%v err=%v", replayedScan, replayed, err)
	}
	loadedScan, err := repositoryB.GetEvaluationReviewRasterScanReceipt(ctx, authority, partition, scan.ReceiptDigest)
	if err != nil || loadedScan.DecodedPixelDigest != scan.DecodedPixelDigest {
		t.Fatalf("load evaluation review raster scan receipt = %#v err=%v", loadedScan, err)
	}
	listedScans, err := repositoryB.ListEvaluationReviewRasterScanReceipts(ctx, authority, partition)
	if err != nil || len(listedScans) != 1 || listedScans[0].ReceiptDigest != scan.ReceiptDigest {
		t.Fatalf("list evaluation review raster scan receipts = %#v err=%v", listedScans, err)
	}
	candidate := evaluationReviewCandidateFixture(t, plan, fixtures.Attempt, invocation.ResponseArtifactDigest, execution, scan)
	stored, replayed, err := repositoryA.StoreEvaluationReviewCandidate(ctx, authority, partition, candidate.Canonical)
	if err != nil || replayed {
		t.Fatalf("store evaluation review candidate = %#v replay=%v err=%v", stored, replayed, err)
	}
	replayedRecord, replayed, err := repositoryB.StoreEvaluationReviewCandidate(ctx, authority, partition, candidate.Canonical)
	if err != nil || !replayed || replayedRecord.CandidateDigest != stored.CandidateDigest {
		t.Fatalf("replay evaluation review candidate = %#v replay=%v err=%v", replayedRecord, replayed, err)
	}
	loaded, err := repositoryB.GetEvaluationReviewCandidate(ctx, authority, partition, fixtures.Attempt.AttemptID)
	if err != nil || loaded.CandidateDigest != stored.CandidateDigest || !bytes.Equal(loaded.CandidateBytes, candidate.Canonical) {
		t.Fatalf("load evaluation review candidate = %#v err=%v", loaded, err)
	}
	references, err := repositoryB.ListEvaluationReviewCandidateRefs(ctx, authority, partition)
	if err != nil || len(references) != 1 || references[0].ExecutionReceiptDigest != execution.ReceiptDigest {
		t.Fatalf("list evaluation review candidate refs = %#v err=%v", references, err)
	}
	export, err := repositoryB.ExportEvaluationSnapshot(ctx, authority, partition, EvaluationSnapshotRequirements{
		RequireCompleteReviewCandidateSet: true,
	})
	if err != nil {
		t.Fatalf("export evaluation review candidate refs: %v", err)
	}
	if len(export.Snapshot.ReviewCandidateRefs) != 1 || bytes.Contains(export.Bytes, []byte("bytesBase64")) ||
		bytes.Contains(export.Bytes, []byte(evaluationReviewCandidateRasterBase64)) {
		t.Fatalf("review candidate snapshot leaked raster body: %s", export.Bytes)
	}
}

func TestAgentModelEvaluationPostgreSQLGate(t *testing.T) {
	databaseA, databaseB := openAgentPostgreSQL(t)
	repositoryA, repositoryB := NewRepository(databaseA), NewRepository(databaseB)
	vector := readEvaluationRepositoryVector(t)
	ctx := context.Background()
	authority := EvaluationAuthority{Kind: "service", PrincipalID: "evaluation.runner", NamespaceID: "evaluation.g4-v8"}

	if _, _, err := repositoryA.StoreEvaluationPlan(ctx, EvaluationAuthority{
		Kind: "user", PrincipalID: "user.test", NamespaceID: authority.NamespaceID,
	}, vector.Facts.Plan); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("user evaluation authority error = %v, want ErrUnauthorized", err)
	}
	plan, replayed, err := repositoryA.StoreEvaluationPlan(ctx, authority, vector.Facts.Plan)
	if err != nil || replayed {
		t.Fatalf("store evaluation plan = %#v replay=%v err=%v", plan, replayed, err)
	}
	replayedPlan, replayed, err := repositoryB.StoreEvaluationPlan(ctx, authority, vector.Facts.Plan)
	if err != nil || !replayed || replayedPlan.FactDigest != plan.FactDigest {
		t.Fatalf("replay evaluation plan = %#v replay=%v err=%v", replayedPlan, replayed, err)
	}
	decodedPlan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	authenticityFixtures := evaluationPostgresPreDispatchCapabilityFixtures(
		t, decodedPlan, evaluationAuthenticityFixturesForPlan(t, decodedPlan, vector.Facts.Attempt),
	)
	demandBytes, settlementBytes := evaluationBudgetFixtures(t, 1)
	if _, _, err := repositoryA.ReserveEvaluationBudget(
		ctx, authority, plan.FactDigest, "evaluation-reservation.expired", 0, demandBytes,
		mustAgentTime(t, "2026-08-09T00:00:00.000Z"),
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("expired evaluation budget reservation error = %v, want ErrConflict", err)
	}
	reservation, replayed, err := repositoryA.ReserveEvaluationBudget(
		ctx, authority, plan.FactDigest, "evaluation-reservation.vector", 0, demandBytes,
		mustAgentTime(t, "2026-08-02T03:10:00.000Z"),
	)
	if err != nil || replayed || reservation.LedgerRevision != 1 {
		t.Fatalf("reserve evaluation budget = %#v replay=%v err=%v", reservation, replayed, err)
	}
	if _, replayed, err := repositoryB.ReserveEvaluationBudget(
		ctx, authority, plan.FactDigest, reservation.ReservationID, 0, demandBytes,
		mustAgentTime(t, "2026-08-02T03:10:00.000Z"),
	); err != nil || !replayed {
		t.Fatalf("replay evaluation budget reservation replay=%v err=%v", replayed, err)
	}
	if _, _, err := repositoryB.ReserveEvaluationBudget(
		ctx, authority, plan.FactDigest, "evaluation-reservation.stale", 0, demandBytes,
		mustAgentTime(t, "2026-08-02T03:11:00.000Z"),
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale evaluation budget reservation error = %v, want ErrConflict", err)
	}
	overBudget, _ := evaluationBudgetFixtures(t, 1_000_001)
	if _, _, err := repositoryB.ReserveEvaluationBudget(
		ctx, authority, plan.FactDigest, "evaluation-reservation.over-budget", 1, overBudget,
		mustAgentTime(t, "2026-08-02T03:11:00.000Z"),
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("over-budget evaluation reservation error = %v, want ErrConflict", err)
	}
	settlement, replayed, err := repositoryA.SettleEvaluationBudget(
		ctx, authority, plan.FactDigest, reservation.ReservationID, 1, settlementBytes,
	)
	if err != nil || replayed || settlement.LedgerRevision != 2 {
		t.Fatalf("settle evaluation budget = %#v replay=%v err=%v", settlement, replayed, err)
	}
	if _, replayed, err := repositoryB.SettleEvaluationBudget(
		ctx, authority, plan.FactDigest, reservation.ReservationID, 1, settlementBytes,
	); err != nil || !replayed {
		t.Fatalf("replay evaluation budget settlement replay=%v err=%v", replayed, err)
	}
	if _, _, err := repositoryA.StoreEvaluationAttempt(ctx, EvaluationAuthority{
		Kind: "service", PrincipalID: authority.PrincipalID, NamespaceID: "evaluation.foreign",
	}, vector.Facts.Attempt); !errors.Is(err, ErrNotFound) {
		t.Fatalf("cross-namespace attempt error = %v, want ErrNotFound", err)
	}
	if _, _, err := repositoryA.StoreEvaluationAttempt(
		ctx, authority, evaluationAttemptOutsidePlan(t, vector.Facts.Attempt),
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("out-of-plan evaluation attempt error = %v, want ErrConflict", err)
	}
	attempt, replayed, err := repositoryA.StoreEvaluationAttempt(ctx, authority, vector.Facts.Attempt)
	if err != nil || replayed {
		t.Fatalf("store evaluation attempt = %#v replay=%v err=%v", attempt, replayed, err)
	}
	if _, replayed, err := repositoryB.StoreEvaluationAttempt(ctx, authority, vector.Facts.Attempt); err != nil || !replayed {
		t.Fatalf("replay evaluation attempt replay=%v err=%v", replayed, err)
	}
	partition := EvaluationPlanPartition{PlanDigest: plan.FactDigest, RepositoryCommit: decodedPlan.RepositoryCommit}
	// The real runner durably stages source, invocation, and execution receipts
	// before returning the attempt. A restart replays the immutable receipts,
	// then publishes the attempt that closes their exact descriptor binding.
	for _, sourceBytes := range append(append([][]byte(nil), authenticityFixtures.EndpointSources...), authenticityFixtures.InvocationSources...) {
		if _, replayed, err := repositoryA.StoreEvaluationSourceReceipt(ctx, authority, partition, sourceBytes); err != nil || replayed {
			t.Fatalf("store source receipt replay=%v err=%v", replayed, err)
		}
		if _, replayed, err := repositoryB.StoreEvaluationSourceReceipt(ctx, authority, partition, sourceBytes); err != nil || !replayed {
			t.Fatalf("replay source receipt replay=%v err=%v", replayed, err)
		}
	}
	smokeRecord, replayed, err := repositoryA.StoreEvaluationEndpointSmokeReceipt(ctx, authority, partition, authenticityFixtures.EndpointSmoke)
	if err != nil || replayed {
		t.Fatalf("store endpoint smoke receipt = %#v replay=%v err=%v", smokeRecord, replayed, err)
	}
	if _, replayed, err := repositoryB.StoreEvaluationEndpointSmokeReceipt(ctx, authority, partition, authenticityFixtures.EndpointSmoke); err != nil || !replayed {
		t.Fatalf("replay endpoint smoke receipt replay=%v err=%v", replayed, err)
	}
	invocationRecord, replayed, err := repositoryA.StoreEvaluationInvocationReceipt(ctx, authority, partition, authenticityFixtures.Invocation)
	if err != nil || replayed {
		t.Fatalf("store invocation receipt = %#v replay=%v err=%v", invocationRecord, replayed, err)
	}
	if _, replayed, err := repositoryB.StoreEvaluationInvocationReceipt(ctx, authority, partition, authenticityFixtures.Invocation); err != nil || !replayed {
		t.Fatalf("replay invocation receipt replay=%v err=%v", replayed, err)
	}
	var conflictingSource map[string]any
	if err := json.Unmarshal(authenticityFixtures.EndpointSources[0], &conflictingSource); err != nil {
		t.Fatal(err)
	}
	conflictingSource["sourceContentDigest"] = evaluationFixtureDigest(t, "conflicting-source-content")
	conflictingSource["receiptDigest"], err = canonicaljson.Digest(mapWithoutEvaluationDigest(conflictingSource, "receiptDigest"))
	if err != nil {
		t.Fatal(err)
	}
	conflictingSourceBytes, err := canonicaljson.Bytes(conflictingSource)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := repositoryA.StoreEvaluationSourceReceipt(ctx, authority, partition, conflictingSourceBytes); !errors.Is(err, ErrConflict) {
		t.Fatalf("conflicting source receipt error = %v, want ErrConflict", err)
	}
	executionRecord, replayed, err := repositoryA.StoreEvaluationExecutionReceipt(ctx, authority, partition, authenticityFixtures.Execution)
	if err != nil || replayed {
		t.Fatalf("store execution receipt = %#v replay=%v err=%v", executionRecord, replayed, err)
	}
	if _, replayed, err := repositoryB.StoreEvaluationExecutionReceipt(ctx, authority, partition, authenticityFixtures.Execution); err != nil || !replayed {
		t.Fatalf("replay execution receipt replay=%v err=%v", replayed, err)
	}
	if _, err := repositoryB.GetEvaluationInvocationReceipt(ctx, authority, partition, authenticityFixtures.Attempt.AttemptID); !errors.Is(err, ErrConflict) {
		t.Fatalf("orphan invocation read error = %v, want ErrConflict", err)
	}
	if _, err := repositoryB.GetEvaluationExecutionReceipt(ctx, authority, partition, authenticityFixtures.Attempt.AttemptID); !errors.Is(err, ErrConflict) {
		t.Fatalf("orphan execution read error = %v, want ErrConflict", err)
	}
	if _, err := repositoryB.ExportEvaluationSnapshot(ctx, authority, partition, EvaluationSnapshotRequirements{}); !errors.Is(err, ErrConflict) {
		t.Fatalf("orphan authenticity export error = %v, want ErrConflict", err)
	}
	authenticityAttempt, replayed, err := repositoryA.StoreEvaluationAttempt(ctx, authority, authenticityFixtures.Attempt.Canonical)
	if err != nil || replayed {
		t.Fatalf("resume authenticity evaluation attempt = %#v replay=%v err=%v", authenticityAttempt, replayed, err)
	}
	if _, replayed, err := repositoryB.StoreEvaluationAttempt(ctx, authority, authenticityFixtures.Attempt.Canonical); err != nil || !replayed {
		t.Fatalf("replay resumed authenticity evaluation attempt replay=%v err=%v", replayed, err)
	}
	invocationTurn, err := decodeEvaluationInvocationTurnReceipt(authenticityFixtures.InvocationTurn.ReceiptBytes)
	if err != nil {
		t.Fatal(err)
	}
	if _, replayed, err := repositoryA.StoreEvaluationPreDispatchFailureReceipt(
		ctx, authority, partition, authenticityFixtures.PreDispatchFailure,
	); err != nil || replayed {
		t.Fatalf("store pre-dispatch failure receipt replay=%v err=%v", replayed, err)
	}
	turnTransaction, err := databaseA.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := insertEvaluationInvocationTurnV3(ctx, turnTransaction, authority.NamespaceID, partition, invocationTurn); err != nil {
		_ = turnTransaction.Rollback()
		t.Fatalf("store evaluation invocation turn: %v", err)
	}
	if err := turnTransaction.Commit(); err != nil {
		t.Fatalf("commit evaluation invocation turn: %v", err)
	}
	capabilityRecord, replayed, err := repositoryA.StoreEvaluationCapabilityExecutionReceipt(
		ctx, authority, partition, authenticityFixtures.Capability,
	)
	if err != nil || replayed {
		t.Fatalf("store capability execution receipt = %#v replay=%v err=%v", capabilityRecord, replayed, err)
	}
	if _, replayed, err := repositoryB.StoreEvaluationCapabilityExecutionReceipt(
		ctx, authority, partition, authenticityFixtures.Capability,
	); err != nil || !replayed {
		t.Fatalf("replay capability execution receipt replay=%v err=%v", replayed, err)
	}
	var checkpointIdentity struct {
		Value struct {
			ShardID string `json:"shardId"`
		} `json:"value"`
	}
	if err := json.Unmarshal(vector.Facts.Checkpoint, &checkpointIdentity); err != nil {
		t.Fatal(err)
	}
	if _, _, err := repositoryA.ClaimEvaluationShard(
		ctx, authority, plan.FactDigest, checkpointIdentity.Value.ShardID, "evaluation-worker.expired",
		mustAgentTime(t, "2026-08-02T03:00:00.000Z"), mustAgentTime(t, "2026-08-10T00:00:00.000Z"),
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("out-of-window evaluation lease error = %v, want ErrConflict", err)
	}
	lease, replayed, err := repositoryA.ClaimEvaluationShard(
		ctx, authority, plan.FactDigest, checkpointIdentity.Value.ShardID, "evaluation-worker.vector",
		mustAgentTime(t, "2026-08-02T02:59:00.000Z"), mustAgentTime(t, "2026-08-02T04:00:00.000Z"),
	)
	if err != nil || replayed || lease.Generation != 1 {
		t.Fatalf("claim evaluation shard = %#v replay=%v err=%v", lease, replayed, err)
	}
	renewedLease, err := repositoryA.RenewEvaluationShard(
		ctx, authority, plan.FactDigest, lease.ShardID, lease.OwnerID, lease.Generation,
		mustAgentTime(t, "2026-08-02T03:01:00.000Z"), mustAgentTime(t, "2026-08-02T04:30:00.000Z"),
	)
	if err != nil || !renewedLease.ExpiresAt.After(lease.ExpiresAt) || renewedLease.Generation != lease.Generation {
		t.Fatalf("renew evaluation shard = %#v err=%v", renewedLease, err)
	}
	if _, _, err := repositoryB.ClaimEvaluationShard(
		ctx, authority, plan.FactDigest, lease.ShardID, "evaluation-worker.foreign",
		mustAgentTime(t, "2026-08-02T03:01:00.000Z"), mustAgentTime(t, "2026-08-02T04:00:00.000Z"),
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("competing evaluation lease error = %v, want ErrConflict", err)
	}
	checkpoint, replayed, err := repositoryA.StoreEvaluationCheckpoint(ctx, authority, -1, vector.Facts.Checkpoint)
	if err != nil || replayed {
		t.Fatalf("store evaluation checkpoint = %#v replay=%v err=%v", checkpoint, replayed, err)
	}
	if _, replayed, err := repositoryB.StoreEvaluationCheckpoint(ctx, authority, -1, vector.Facts.Checkpoint); err != nil || !replayed {
		t.Fatalf("replay evaluation checkpoint replay=%v err=%v", replayed, err)
	}
	type holdoutWrite struct {
		record   EvaluationFactRecord
		replayed bool
		err      error
	}
	writes := make(chan holdoutWrite, 2)
	var holdoutWriters sync.WaitGroup
	for _, candidateRepository := range []*Repository{repositoryA, repositoryB} {
		holdoutWriters.Add(1)
		go func(repository *Repository) {
			defer holdoutWriters.Done()
			record, replayed, err := repository.StoreEvaluationArtifact(
				ctx, authority, "evaluation-holdout-receipt", vector.Facts.Holdout,
			)
			writes <- holdoutWrite{record: record, replayed: replayed, err: err}
		}(candidateRepository)
	}
	holdoutWriters.Wait()
	close(writes)
	var holdout EvaluationFactRecord
	inserted, replayedWrites := 0, 0
	for write := range writes {
		if write.err != nil {
			t.Fatalf("concurrent holdout artifact write: %v", write.err)
		}
		holdout = write.record
		if write.replayed {
			replayedWrites++
		} else {
			inserted++
		}
	}
	if inserted != 1 || replayedWrites != 1 {
		t.Fatalf("concurrent holdout CAS inserted=%d replayed=%d", inserted, replayedWrites)
	}
	validatedHumanReviewBytes, humanReviewReportFactBytes := evaluationValidatedHumanReviewFixture(t, decodedPlan)
	emptyHumanMetricObservations := []byte("[]")
	emptyHumanMetricObservationSetDigest, err := canonicaljson.Digest(map[string]any{
		"validatedHumanMetricObservationDigests": []string{},
	})
	if err != nil {
		t.Fatal(err)
	}
	_, _, err = repositoryA.StoreEvaluationValidatedHumanReviewArtifact(
		ctx, authority, partition, validatedHumanReviewBytes, humanReviewReportFactBytes,
		emptyHumanMetricObservations, emptyHumanMetricObservationSetDigest, nil,
	)
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("store validated human review without frozen authority error = %v, want ErrConflict", err)
	}
	if _, err := repositoryB.GetEvaluationValidatedHumanReviewArtifact(ctx, authority, partition); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unverified validated human review lookup error = %v, want ErrNotFound", err)
	}
	loadedPlan, err := repositoryB.GetEvaluationPlan(ctx, authority, partition)
	if err != nil || loadedPlan.FactDigest != plan.FactDigest ||
		loadedPlan.RepositoryCommit != decodedPlan.RepositoryCommit {
		t.Fatalf("get evaluation plan = %#v err=%v", loadedPlan, err)
	}
	wrongCommit := partition
	wrongCommit.RepositoryCommit = "ffffffffffffffffffffffffffffffffffffffff"
	if _, err := repositoryB.GetEvaluationPlan(ctx, authority, wrongCommit); !errors.Is(err, ErrNotFound) {
		t.Fatalf("cross-commit evaluation plan error = %v, want ErrNotFound", err)
	}
	decodedAttempt, err := decodeEvaluationAttempt(vector.Facts.Attempt)
	if err != nil {
		t.Fatal(err)
	}
	loadedAttempt, err := repositoryB.GetEvaluationAttempt(ctx, authority, partition, EvaluationAttemptSelector{
		DescriptorDigest: decodedAttempt.DescriptorDigest,
	})
	if err != nil || loadedAttempt.FactID != attempt.FactID || loadedAttempt.DescriptorDigest != decodedAttempt.DescriptorDigest {
		t.Fatalf("get evaluation attempt = %#v err=%v", loadedAttempt, err)
	}
	attempts, err := repositoryB.ListEvaluationAttempts(ctx, authority, partition)
	attemptIDs := map[string]bool{}
	for _, record := range attempts {
		attemptIDs[record.FactID] = true
	}
	if err != nil || len(attempts) != 2 || !attemptIDs[attempt.FactID] || !attemptIDs[authenticityAttempt.FactID] {
		t.Fatalf("list evaluation attempts = %#v err=%v", attempts, err)
	}
	loadedSmoke, err := repositoryB.GetEvaluationEndpointSmokeReceipt(ctx, authority, partition, smokeRecord.SmokeTargetID)
	if err != nil || loadedSmoke.ReceiptDigest != smokeRecord.ReceiptDigest {
		t.Fatalf("get endpoint smoke receipt = %#v err=%v", loadedSmoke, err)
	}
	loadedInvocation, err := repositoryB.GetEvaluationInvocationReceipt(ctx, authority, partition, authenticityFixtures.Attempt.AttemptID)
	if err != nil || loadedInvocation.EvidenceDigest != invocationRecord.EvidenceDigest {
		t.Fatalf("get invocation receipt = %#v err=%v", loadedInvocation, err)
	}
	loadedExecution, err := repositoryB.GetEvaluationExecutionReceipt(ctx, authority, partition, authenticityFixtures.Attempt.AttemptID)
	if err != nil || loadedExecution.ReceiptDigest != executionRecord.ReceiptDigest {
		t.Fatalf("get execution receipt = %#v err=%v", loadedExecution, err)
	}
	sourceReceipts, err := repositoryB.ListEvaluationSourceReceipts(ctx, authority, partition)
	if err != nil || len(sourceReceipts) != 4 {
		t.Fatalf("list source receipts = %#v err=%v", sourceReceipts, err)
	}
	loadedSource, err := repositoryB.GetEvaluationSourceReceipt(ctx, authority, partition, EvaluationSourceReceiptSelector{
		ReceiptDigest: sourceReceipts[0].ReceiptDigest,
	})
	if err != nil || loadedSource.SourceReceiptID != sourceReceipts[0].SourceReceiptID {
		t.Fatalf("get source receipt = %#v err=%v", loadedSource, err)
	}
	smokeReceipts, err := repositoryB.ListEvaluationEndpointSmokeReceipts(ctx, authority, partition)
	if err != nil || len(smokeReceipts) != 1 || smokeReceipts[0].SmokeTargetID != smokeRecord.SmokeTargetID {
		t.Fatalf("list endpoint smoke receipts = %#v err=%v", smokeReceipts, err)
	}
	invocationReceipts, err := repositoryB.ListEvaluationInvocationReceipts(ctx, authority, partition)
	if err != nil || len(invocationReceipts) != 1 || invocationReceipts[0].AttemptID != authenticityFixtures.Attempt.AttemptID {
		t.Fatalf("list invocation receipts = %#v err=%v", invocationReceipts, err)
	}
	executionReceipts, err := repositoryB.ListEvaluationExecutionReceipts(ctx, authority, partition)
	if err != nil || len(executionReceipts) != 1 || executionReceipts[0].AttemptID != authenticityFixtures.Attempt.AttemptID {
		t.Fatalf("list execution receipts = %#v err=%v", executionReceipts, err)
	}
	if _, err := repositoryB.GetEvaluationAuthorityAttestation(ctx, authority, partition); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing authority attestation error = %v, want ErrNotFound", err)
	}
	if _, err := repositoryB.GetEvaluationEvidenceRoot(ctx, authority, partition); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing evidence root error = %v, want ErrNotFound", err)
	}
	latestCheckpoint, err := repositoryB.GetLatestEvaluationCheckpoint(ctx, authority, partition, lease.ShardID)
	if err != nil || latestCheckpoint.FactDigest != checkpoint.FactDigest || latestCheckpoint.Revision != 0 {
		t.Fatalf("get latest evaluation checkpoint = %#v err=%v", latestCheckpoint, err)
	}
	checkpoints, err := repositoryB.ListEvaluationCheckpoints(ctx, authority, partition)
	if err != nil || len(checkpoints) != 1 || checkpoints[0].FactDigest != checkpoint.FactDigest {
		t.Fatalf("list evaluation checkpoints = %#v err=%v", checkpoints, err)
	}
	budget, err := repositoryB.GetEvaluationBudgetSnapshot(ctx, authority, partition)
	if err != nil || budget.Revision != 2 || len(budget.Reservations) != 1 ||
		len(budget.Settlements) != 1 || len(budget.UnsettledReservationIDs) != 0 {
		t.Fatalf("get evaluation budget snapshot = %#v err=%v", budget, err)
	}
	loadedHoldout, err := repositoryB.GetEvaluationArtifact(ctx, authority, partition, EvaluationArtifactSelector{
		FactType: holdout.FactType, FactID: holdout.FactID,
	})
	if err != nil || loadedHoldout.FactDigest != holdout.FactDigest {
		t.Fatalf("get evaluation artifact = %#v err=%v", loadedHoldout, err)
	}
	artifacts, err := repositoryB.ListEvaluationArtifacts(ctx, authority, partition, holdout.FactType)
	if err != nil || len(artifacts) != 1 || artifacts[0].FactDigest != holdout.FactDigest {
		t.Fatalf("list evaluation artifacts = %#v err=%v", artifacts, err)
	}
	requirements := EvaluationSnapshotRequirements{
		RequireSettledBudget: true, RequiredArtifactTypes: []string{"evaluation-holdout-receipt"},
	}
	exportA, err := repositoryA.ExportEvaluationSnapshot(ctx, authority, partition, requirements)
	if err != nil {
		t.Fatalf("export evaluation snapshot A: %v", err)
	}
	exportB, err := repositoryB.ExportEvaluationSnapshot(ctx, authority, partition, requirements)
	if err != nil || exportA.Digest != exportB.Digest || !bytes.Equal(exportA.Bytes, exportB.Bytes) {
		t.Fatalf("evaluation snapshot export drifted: A=%s B=%s err=%v", exportA.Digest, exportB.Digest, err)
	}
	if len(exportB.Snapshot.Attempts) != 2 || len(exportB.Snapshot.LatestCheckpointByShard) != 1 ||
		len(exportB.Snapshot.EndpointSmokeReceipts) != 1 ||
		len(exportB.Snapshot.SourceReceipts) != 4 || len(exportB.Snapshot.ExecutionReceipts) != 1 ||
		exportB.Snapshot.Partition != partition {
		t.Fatalf("evaluation snapshot export is incomplete: %#v", exportB.Snapshot)
	}
	if _, err := repositoryB.ExportEvaluationSnapshot(ctx, authority, partition, EvaluationSnapshotRequirements{
		RequireAuthenticityEvidence: true,
	}); !errors.Is(err, ErrConflict) {
		t.Fatalf("incomplete authority evidence export error = %v, want ErrConflict", err)
	}
	if _, _, err := repositoryB.StoreEvaluationAuthorityAttestation(ctx, authority, partition, []byte(`{}`), nil); !errors.Is(err, ErrInvalid) {
		t.Fatalf("missing authority verifier error = %v, want ErrInvalid", err)
	}
	if _, err := databaseA.Exec(`UPDATE agent_evaluation_attempts SET outcome = 'failed'
		WHERE namespace_id = $1 AND attempt_id = $2`, authority.NamespaceID, attempt.FactID); err == nil {
		t.Fatal("immutable evaluation attempt accepted UPDATE")
	}
	if _, err := databaseA.Exec(`DELETE FROM agent_evaluation_artifacts
		WHERE namespace_id = $1 AND fact_id = $2`, authority.NamespaceID, holdout.FactID); err == nil {
		t.Fatal("immutable evaluation artifact accepted DELETE")
	}
	if _, err := databaseA.Exec(`UPDATE agent_evaluation_budget_reservations SET demand_digest = $1
		WHERE namespace_id = $2 AND reservation_id = $3`, plan.FactDigest, authority.NamespaceID, reservation.ReservationID); err == nil {
		t.Fatal("immutable evaluation budget reservation accepted UPDATE")
	}
	if _, err := databaseA.Exec(`DELETE FROM agent_evaluation_budget_settlements
		WHERE namespace_id = $1 AND reservation_id = $2`, authority.NamespaceID, settlement.ReservationID); err == nil {
		t.Fatal("immutable evaluation budget settlement accepted DELETE")
	}
	if _, err := databaseA.Exec(`UPDATE agent_evaluation_invocation_receipts SET evidence_digest = $1
		WHERE namespace_id = $2 AND attempt_id = $3`, plan.FactDigest, authority.NamespaceID, authenticityFixtures.Attempt.AttemptID); err == nil {
		t.Fatal("immutable evaluation invocation receipt accepted UPDATE")
	}
	if _, err := databaseA.Exec(`DELETE FROM agent_evaluation_execution_receipts
		WHERE namespace_id = $1 AND attempt_id = $2`, authority.NamespaceID, authenticityFixtures.Attempt.AttemptID); err == nil {
		t.Fatal("immutable evaluation execution receipt accepted DELETE")
	}
	finalization, err := databaseA.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	finalizedDigest := evaluationFixtureDigest(t, "database-finalization-guard")
	if _, err := finalization.Exec(`INSERT INTO agent_evaluation_authority_attestations (
		namespace_id, plan_digest, repository_commit, authority_id, key_id, evidence_set_digest,
		endpoint_smoke_dispatch_intent_set_digest, endpoint_smoke_transport_receipt_set_digest,
		endpoint_smoke_result_spool_receipt_set_digest, endpoint_smoke_result_spool_disposition_receipt_set_digest,
		endpoint_smoke_validation_failure_receipt_set_digest,
		endpoint_smoke_set_digest, pre_dispatch_failure_receipt_set_digest,
		transport_dispatch_intent_set_digest, transport_receipt_set_digest,
		provider_result_spool_receipt_set_digest, provider_result_spool_disposition_receipt_set_digest,
		invocation_turn_receipt_set_digest, invocation_turn_set_receipt_set_digest,
		result_submission_receipt_set_digest,
		controlled_runtime_receipt_set_digest, capability_execution_receipt_set_digest,
		verification_attempt_grant_receipt_set_digest,
		validated_human_review_artifact_set_digest,
		review_raster_scan_receipt_set_digest, review_candidate_ref_set_digest,
		blind_review_mapping_set_digest, source_receipt_set_digest, execution_receipt_set_digest,
		holdout_execution_receipt_digest, secret_canary_set_digest, protected_holdout_canary_set_digest,
		attestation_digest, attestation_json, attestation_bytes, issued_at
	) VALUES (
		$1, $2, $3, $4, $5, $6,
		$6, $6, $6, $6, $6, $6,
		$6, $6, $6, $6, $6, $6, $6, $6, $6, $6, $6, $6, $6, $6, $6, $6, $6, $6, $6, $6,
		$6, '{}'::jsonb, $7, $8
	)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		"authority.pg-finalization", "key.pg-finalization", finalizedDigest, []byte(`{}`), decodedPlan.PlannedAt,
	); err != nil {
		t.Fatalf("seed authority finalization guard: %v", err)
	}
	if _, err := finalization.Exec(`INSERT INTO agent_evaluation_authority_attestation_v45_roots (
		namespace_id,plan_digest,attestation_digest,attempt_authority_owner_receipt_set_digest,
		provider_capability_observation_receipt_set_digest,capability_specific_receipt_set_digest,
		validated_human_metric_observation_set_digest,created_at
	) VALUES ($1,$2,$3,$3,$3,$3,$3,$4)`, authority.NamespaceID, partition.PlanDigest,
		finalizedDigest, decodedPlan.PlannedAt); err != nil {
		t.Fatalf("seed authority finalization guard v45 roots: %v", err)
	}
	if err := finalization.Commit(); err != nil {
		t.Fatalf("commit authority finalization guard: %v", err)
	}
	if _, err := databaseA.Exec(`UPDATE agent_evaluation_budget_ledgers SET revision = revision
		WHERE namespace_id = $1 AND plan_digest = $2`, authority.NamespaceID, partition.PlanDigest); err == nil {
		t.Fatal("authority-attested evaluation partition accepted a later budget mutation")
	}

	planValue, planValueBytes, err := evaluationExportFactValue(plan.FactBytes)
	if err != nil || stringMember(planValue, "planDigest") != partition.PlanDigest {
		t.Fatalf("project bounded export plan: value=%#v err=%v", planValue, err)
	}
	planOrderKey, err := evaluationExportOrderKey("plan")
	if err != nil {
		t.Fatal(err)
	}
	emptySetDigest, err := canonicaljson.Digest([]string{})
	if err != nil {
		t.Fatal(err)
	}
	emptyReceiptEnvelopeDigest, err := canonicaljson.Digest(map[string]any{"receiptDigests": []string{}})
	if err != nil {
		t.Fatal(err)
	}
	emptyHumanObservationEnvelopeDigest, err := canonicaljson.Digest(map[string]any{
		"validatedHumanMetricObservationDigests": []string{},
	})
	if err != nil {
		t.Fatal(err)
	}
	planRecordSetDigest, err := canonicaljson.Digest([]string{partition.PlanDigest})
	if err != nil {
		t.Fatal(err)
	}
	families := make([]EvaluationExportFamilySummary, len(evaluationEvidenceExportFamilies))
	for index, family := range evaluationEvidenceExportFamilies {
		families[index] = EvaluationExportFamilySummary{
			Family: family, FamilyIndex: int64(index), ExpectedRecordSetDigest: emptySetDigest,
			ExpectedSemanticDigest: emptySetDigest,
		}
	}
	for family, digest := range map[string]string{
		"attemptAuthorityOwnerReceipts":    emptyReceiptEnvelopeDigest,
		"capabilitySpecificReceipts":       emptyReceiptEnvelopeDigest,
		"validatedHumanMetricObservations": emptyHumanObservationEnvelopeDigest,
	} {
		index, exists := evaluationExportFamilyIndex(family)
		if !exists {
			t.Fatalf("bounded export family %s is missing", family)
		}
		families[index].ExpectedSemanticDigest = digest
	}
	families[0].ExpectedRecordCount = 1
	families[0].ExpectedRecordSetDigest = planRecordSetDigest
	families[0].ExpectedSemanticDigest = partition.PlanDigest
	families[0].ExpectedTotalBytes = int64(len(planValueBytes))
	families[0].FirstOrderKey = &planOrderKey
	families[0].LastOrderKey = &planOrderKey
	createdAt := decodedPlan.PlannedAt.UTC().Truncate(time.Millisecond)
	expiresAt := createdAt.Add(evaluationExportLeaseDuration)
	emptyAuthorityRoots := EvaluationEvidenceArchiveAuthorityRoots{
		EndpointSmokeSetDigest: emptySetDigest, EndpointSmokeDispatchIntentSetDigest: emptySetDigest,
		EndpointSmokeTransportReceiptSetDigest: emptySetDigest, EndpointSmokeResultSpoolReceiptSetDigest: emptySetDigest,
		EndpointSmokeResultSpoolDispositionReceiptSetDigest: emptySetDigest,
		EndpointSmokeValidationFailureReceiptSetDigest:      emptySetDigest,
		PreDispatchFailureReceiptSetDigest:                  emptySetDigest, TransportDispatchIntentSetDigest: emptySetDigest,
		TransportReceiptSetDigest: emptySetDigest, ProviderResultSpoolReceiptSetDigest: emptySetDigest,
		ProviderResultSpoolDispositionReceiptSetDigest: emptySetDigest, InvocationTurnReceiptSetDigest: emptySetDigest,
		InvocationTurnSetReceiptSetDigest: emptySetDigest, ResultSubmissionReceiptSetDigest: emptySetDigest,
		AttemptAuthorityOwnerReceiptSetDigest: emptyReceiptEnvelopeDigest,
		ControlledRuntimeReceiptSetDigest:     emptySetDigest, CapabilityExecutionReceiptSetDigest: emptySetDigest,
		CapabilitySpecificReceiptSetDigest:       emptyReceiptEnvelopeDigest,
		VerificationAttemptGrantReceiptSetDigest: emptySetDigest, ValidatedHumanReviewArtifactSetDigest: emptySetDigest,
		ValidatedHumanMetricObservationSetDigest: emptyHumanObservationEnvelopeDigest,
		ReviewRasterScanReceiptSetDigest:         emptySetDigest, ReviewCandidateRefSetDigest: emptySetDigest,
		BlindReviewMappingSetDigest: emptySetDigest, SourceReceiptSetDigest: emptySetDigest,
		ExecutionReceiptSetDigest: emptySetDigest, HoldoutExecutionReceiptDigest: emptySetDigest,
		SecretCanarySetDigest: emptySetDigest, ProtectedHoldoutCanarySetDigest: emptySetDigest,
	}
	commitments := EvaluationEvidenceArchiveCommitments{
		SourceConfigDigest: evaluationFixtureDigest(t, "bounded-export-source-config"),
		FrozenRunDigest:    evaluationFixtureDigest(t, "bounded-export-frozen-run"),
		PlanDigest:         partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit,
		EvidenceSetDigest: finalizedDigest, AuthorityPayloadDigest: finalizedDigest,
		AuthorityAttestationDigest: finalizedDigest, AuthorityRoots: emptyAuthorityRoots,
		EvaluationManifestDigest: finalizedDigest,
		CreatedAt:                evaluationExportInstant(createdAt),
	}
	commitments.RunConfigArtifactBinding = evaluationTestRunConfigArtifactBinding(
		t, partition.PlanDigest, partition.RepositoryCommit,
		commitments.SourceConfigDigest, commitments.FrozenRunDigest,
	)
	commitmentsBytes, err := canonicaljson.Bytes(commitments)
	if err != nil {
		t.Fatal(err)
	}
	commitmentsDigest, err := canonicaljson.Digest(commitments)
	if err != nil {
		t.Fatal(err)
	}
	cursorKeyBindingDigest := evaluationFixtureDigest(t, "bounded-export-cursor-key")
	leaseID := "evaluation-export:postgres-page"
	leaseBase := evaluationExportLeaseBase(leaseID, evaluationEvidenceExportLeaseKind, cursorKeyBindingDigest,
		commitmentsDigest, families, 1, int64(len(planValueBytes)), createdAt, expiresAt)
	leaseDigest, err := canonicaljson.Digest(leaseBase)
	if err != nil {
		t.Fatal(err)
	}
	boundedExport, err := databaseA.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = boundedExport.Rollback() }()
	if _, err := boundedExport.Exec(`INSERT INTO agent_evaluation_export_leases (
		namespace_id, plan_digest, repository_commit, lease_kind, lease_id, lease_digest,
		cursor_key_binding_digest, evidence_set_digest, authority_payload_digest,
		authority_attestation_digest, evaluation_manifest_digest, semantic_root_digest,
		commitments_digest, commitments_bytes, family_count, total_record_count,
		total_record_bytes, created_at, expires_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, evaluationEvidenceExportLeaseKind,
		leaseID, leaseDigest, cursorKeyBindingDigest, finalizedDigest, finalizedDigest, finalizedDigest,
		finalizedDigest, finalizedDigest, commitmentsDigest, commitmentsBytes, int64(len(families)), int64(1),
		int64(len(planValueBytes)), createdAt, expiresAt); err != nil {
		t.Fatalf("seed bounded export lease: %v", err)
	}
	for _, family := range families {
		if _, err := boundedExport.Exec(`INSERT INTO agent_evaluation_export_lease_families (
			namespace_id, lease_id, family, family_index, record_count, total_bytes,
			semantic_digest, record_set_digest, first_order_key, last_order_key
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, authority.NamespaceID, leaseID,
			family.Family, family.FamilyIndex, family.ExpectedRecordCount, family.ExpectedTotalBytes,
			family.ExpectedSemanticDigest, family.ExpectedRecordSetDigest, family.FirstOrderKey, family.LastOrderKey); err != nil {
			t.Fatalf("seed bounded export family %s: %v", family.Family, err)
		}
	}
	if _, err := boundedExport.Exec(`INSERT INTO agent_evaluation_export_lease_records (
		namespace_id, lease_id, family, record_ordinal, order_key, record_digest, byte_length
	) VALUES ($1,$2,'plan',0,$3,$4,$5)`, authority.NamespaceID, leaseID, planOrderKey,
		partition.PlanDigest, int64(len(planValueBytes))); err != nil {
		t.Fatalf("seed bounded export plan reference: %v", err)
	}
	if err := boundedExport.Commit(); err != nil {
		t.Fatalf("commit bounded export fixture: %v", err)
	}
	loadedLease, err := repositoryB.GetEvaluationEvidenceExportLease(
		ctx, authority, partition, leaseID, cursorKeyBindingDigest,
	)
	if err != nil || loadedLease.LeaseDigest != leaseDigest || len(loadedLease.Families) != len(families) {
		t.Fatalf("get bounded export lease = %#v err=%v", loadedLease, err)
	}
	page, err := repositoryB.ReadEvaluationEvidenceExportPage(
		ctx, authority, partition, leaseID, cursorKeyBindingDigest, "plan", 0, 1,
		maximumEvaluationExportRecordBytes, createdAt.Add(time.Minute),
	)
	if err != nil || len(page.Records) != 1 || page.Records[0].RecordDigest != partition.PlanDigest ||
		!bytes.Equal(page.Records[0].Value, planValueBytes) {
		t.Fatalf("read bounded export plan page = %#v err=%v", page, err)
	}
	if _, err := repositoryB.ReadEvaluationEvidenceExportPage(
		ctx, authority, partition, leaseID, cursorKeyBindingDigest, "plan", 0, 1,
		maximumEvaluationExportRecordBytes, expiresAt,
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("expired bounded export page error=%v, want ErrConflict", err)
	}
	if _, err := databaseA.Exec(`UPDATE agent_evaluation_export_leases SET total_record_count = 2
		WHERE namespace_id = $1 AND lease_id = $2`, authority.NamespaceID, leaseID); err == nil {
		t.Fatal("immutable bounded export lease accepted UPDATE")
	}

	_, reviewAttemptBytes, err := evaluationExportFactValue(attempt.FactBytes)
	if err != nil {
		t.Fatal(err)
	}
	reviewAttemptOrderKey, err := evaluationExportOrderKey(attempt.FactID)
	if err != nil {
		t.Fatal(err)
	}
	reviewAttemptSetDigest, err := canonicaljson.Digest([]string{attempt.FactDigest})
	if err != nil {
		t.Fatal(err)
	}
	reviewFamilies := make([]EvaluationExportFamilySummary, len(evaluationReviewLeaseFamilies))
	for index, family := range evaluationReviewLeaseFamilies {
		reviewFamilies[index] = EvaluationExportFamilySummary{
			Family: family, FamilyIndex: int64(index), ExpectedRecordSetDigest: emptySetDigest,
			ExpectedSemanticDigest: emptySetDigest,
		}
	}
	reviewFamilies[0].ExpectedRecordCount = 1
	reviewFamilies[0].ExpectedRecordSetDigest = reviewAttemptSetDigest
	reviewFamilies[0].ExpectedSemanticDigest = reviewAttemptSetDigest
	reviewFamilies[0].ExpectedTotalBytes = int64(len(reviewAttemptBytes))
	reviewFamilies[0].FirstOrderKey = &reviewAttemptOrderKey
	reviewFamilies[0].LastOrderKey = &reviewAttemptOrderKey
	reviewCommitments := EvaluationReviewLeaseCommitments{
		Format: evaluationReviewLeaseFormat, Version: 1, PlanDigest: partition.PlanDigest,
		RepositoryCommit: partition.RepositoryCommit, MachinePhaseDigest: finalizedDigest,
		EligibleAttemptSetDigest:       reviewAttemptSetDigest,
		InvocationTurnReceiptSetDigest: emptySetDigest, InvocationTurnSetReceiptSetDigest: emptySetDigest,
		ExecutionReceiptSetDigest: emptySetDigest, ReviewRasterScanReceiptSetDigest: emptySetDigest,
		ReviewCandidateRefSetDigest: emptySetDigest, BlindReviewMappingSetDigest: emptySetDigest,
		RandomizedPresentationPolicyDigest: finalizedDigest,
		CreatedAt:                          evaluationExportInstant(createdAt), ExpiresAt: evaluationExportInstant(expiresAt),
	}
	reviewCommitmentBytes, err := canonicaljson.Bytes(reviewCommitments)
	if err != nil {
		t.Fatal(err)
	}
	reviewLeaseDigest, err := canonicaljson.Digest(reviewCommitments)
	if err != nil {
		t.Fatal(err)
	}
	reviewLeaseID := "evaluation-review-lease:postgres-page"
	reviewLeaseTx, err := databaseA.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = reviewLeaseTx.Rollback() }()
	if _, err := reviewLeaseTx.Exec(`INSERT INTO agent_evaluation_export_leases (
		namespace_id, plan_digest, repository_commit, lease_kind, lease_id, lease_digest,
		cursor_key_binding_digest, evidence_set_digest, authority_payload_digest,
		authority_attestation_digest, evaluation_manifest_digest, semantic_root_digest,
		commitments_digest, commitments_bytes, family_count, total_record_count,
		total_record_bytes, created_at, expires_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,NULL,NULL,NULL,$8,$9,$10,$11,$12,$13,$14,$15)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, evaluationHumanReviewExportLeaseKind,
		reviewLeaseID, reviewLeaseDigest, cursorKeyBindingDigest, finalizedDigest, reviewLeaseDigest,
		reviewCommitmentBytes, int64(len(reviewFamilies)), int64(1), int64(len(reviewAttemptBytes)), createdAt, expiresAt); err != nil {
		t.Fatalf("seed bounded review lease: %v", err)
	}
	for _, family := range reviewFamilies {
		if _, err := reviewLeaseTx.Exec(`INSERT INTO agent_evaluation_export_lease_families (
			namespace_id, lease_id, family, family_index, record_count, total_bytes,
			semantic_digest, record_set_digest, first_order_key, last_order_key
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, authority.NamespaceID, reviewLeaseID,
			family.Family, family.FamilyIndex, family.ExpectedRecordCount, family.ExpectedTotalBytes,
			family.ExpectedSemanticDigest, family.ExpectedRecordSetDigest, family.FirstOrderKey, family.LastOrderKey); err != nil {
			t.Fatalf("seed bounded review family %s: %v", family.Family, err)
		}
	}
	if _, err := reviewLeaseTx.Exec(`INSERT INTO agent_evaluation_export_lease_records (
		namespace_id, lease_id, family, record_ordinal, order_key, record_digest, byte_length
	) VALUES ($1,$2,'attempts',0,$3,$4,$5)`, authority.NamespaceID, reviewLeaseID,
		reviewAttemptOrderKey, attempt.FactDigest, int64(len(reviewAttemptBytes))); err != nil {
		t.Fatalf("seed bounded review attempt reference: %v", err)
	}
	if err := reviewLeaseTx.Commit(); err != nil {
		t.Fatalf("commit bounded review lease fixture: %v", err)
	}
	loadedReviewLease, err := repositoryB.GetEvaluationReviewLease(
		ctx, authority, partition, reviewLeaseID, cursorKeyBindingDigest,
	)
	if err != nil || loadedReviewLease.ReviewLeaseDigest != reviewLeaseDigest ||
		len(loadedReviewLease.Families) != len(reviewFamilies) {
		t.Fatalf("get bounded review lease = %#v err=%v", loadedReviewLease, err)
	}
	reviewPage, err := repositoryB.ReadEvaluationReviewLeasePage(
		ctx, authority, partition, reviewLeaseID, cursorKeyBindingDigest, "attempts", 0, 1,
		maximumEvaluationExportRecordBytes, createdAt.Add(time.Minute),
	)
	if err != nil || len(reviewPage.Records) != 1 || reviewPage.Records[0].RecordDigest != attempt.FactDigest ||
		!bytes.Equal(reviewPage.Records[0].Value, reviewAttemptBytes) {
		t.Fatalf("read bounded review attempt page = %#v err=%v", reviewPage, err)
	}
}
