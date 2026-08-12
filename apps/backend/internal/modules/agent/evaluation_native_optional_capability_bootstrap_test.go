package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationNativeOptionalBootstrapReadTestRepository struct {
	result EvaluationNativeOptionalBootstrapSourceReadRecord
	err    error
	calls  int
}

type evaluationNativeOptionalBootstrapScanTestRepository struct {
	*evaluationServiceFakeRepository
	closeCalls int
}

func (repository *evaluationNativeOptionalBootstrapScanTestRepository) StoreEvaluationTransportDispatchIntent(
	context.Context,
	EvaluationAuthority,
	EvaluationPlanPartition,
	[]byte,
	int64,
	string,
	[]byte,
) (EvaluationAttemptTurnRecord, bool, error) {
	return EvaluationAttemptTurnRecord{}, false, ErrInvalid
}

func (repository *evaluationNativeOptionalBootstrapScanTestRepository) CloseEvaluationTransport(
	context.Context,
	EvaluationAuthority,
	EvaluationPlanPartition,
	string,
	int64,
	string,
	string,
	string,
	[]byte,
	*EvaluationEncryptedResultSpool,
	[]byte,
	time.Time,
) (EvaluationAttemptTurnRecord, bool, error) {
	repository.closeCalls++
	return EvaluationAttemptTurnRecord{}, false, ErrInvalid
}

type evaluationNativeOptionalBootstrapIngressTestScanner struct {
	reject    bool
	calls     int
	operation string
	digest    string
	payload   []byte
}

func (scanner *evaluationNativeOptionalBootstrapIngressTestScanner) ScanAttemptAuthorityPublicResponse(
	_ context.Context,
	operation string,
	digest string,
	payload []byte,
) error {
	scanner.calls++
	scanner.operation, scanner.digest = operation, digest
	scanner.payload = append([]byte(nil), payload...)
	if scanner.reject {
		return ErrUnauthorized
	}
	return nil
}

func (repository *evaluationNativeOptionalBootstrapReadTestRepository) GetEvaluationNativeOptionalBootstrapSource(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	_ string,
	_ int64,
) (EvaluationNativeOptionalBootstrapSourceReadRecord, error) {
	repository.calls++
	return repository.result, repository.err
}

type evaluationNativeOptionalBootstrapFixture struct {
	Authority  EvaluationAuthority
	Partition  EvaluationPlanPartition
	Plan       evaluationPlanFact
	Descriptor evaluationAttemptDescriptor
	Intent     EvaluationTransportDispatchIntentRecord
	Receipt    EvaluationTransportReceiptRecord
	Spool      EvaluationProviderResultSpoolReceiptRecord
	AAD        evaluationProviderResultSpoolAAD
	Envelope   evaluationProviderResultSpoolEnvelope
	Ingress    evaluationNativeOptionalBootstrapCloseIngress
	Record     EvaluationNativeOptionalBootstrapSourceRecord
}

func evaluationNativeOptionalTestProfileDigest(t *testing.T, profileID string) string {
	t.Helper()
	digest, err := canonicaljson.Digest(map[string]any{"profileId": profileID})
	if err != nil {
		t.Fatal(err)
	}
	return digest
}

func evaluationNativeOptionalTestSourceReceipt(
	t *testing.T,
	program evaluationCapabilityProbeProgram,
	binding evaluationNativeOptionalReceiptBinding,
	source map[string]any,
) map[string]any {
	t.Helper()
	taskID, runID, generation := "task/native/cache/1", "run/native/cache/1", int64(1)
	if stringMember(source, "taskId") != "" {
		taskID = stringMember(source, "taskId")
	}
	if stringMember(source, "runId") != "" {
		runID = stringMember(source, "runId")
	}
	if sourceGeneration, ok := integerMember(source, "generation"); ok {
		generation = sourceGeneration
	}
	executionIdentityBase := map[string]any{
		"format": evaluationNativeProviderExecutionIdentityFormat, "version": int64(1),
		"invocationId": binding.InvocationID, "taskId": taskID, "runId": runID,
		"generation": json.Number(fmt.Sprintf("%d", generation)),
	}
	executionIdentityDigest, err := canonicaljson.Digest(executionIdentityBase)
	if err != nil {
		t.Fatal(err)
	}
	executionIdentity := cloneEvaluationObject(executionIdentityBase)
	executionIdentity["authorityDigest"] = executionIdentityDigest
	factKind, factValue, err := evaluationNativeOptionalFactFromSource(program, binding, source)
	if err != nil {
		t.Fatalf("build native optional fact: %v", err)
	}
	sourceDigest, err := canonicaljson.Digest(source)
	if err != nil {
		t.Fatal(err)
	}
	base := map[string]any{
		"format": evaluationNativeProviderOptionalSourceReceiptFormat, "version": int64(1),
		"protocolFamily": binding.ProtocolFamily, "capabilityProfileId": binding.CapabilityProfileID,
		"capabilityProfileDigest": binding.CapabilityProfileDigest, "invocationId": binding.InvocationID,
		"requestDigest": binding.RequestDigest, "responseDigest": binding.ResponseDigest,
		"providerConfigurationId": binding.ProviderConfigurationID, "modelLineageDigest": binding.ModelLineageDigest,
		"adapterDigest": binding.AdapterDigest, "executionIdentityAuthority": executionIdentity,
		"source": source, "sourceDigest": sourceDigest,
		"fact":       map[string]any{"factType": factKind, "value": factValue},
		"observedAt": evaluationExportInstant(binding.ObservedAt),
	}
	receiptDigest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	receipt := cloneEvaluationObject(base)
	receipt["receiptDigest"] = receiptDigest
	encoded, err := canonicaljson.Bytes(receipt)
	if err != nil {
		t.Fatal(err)
	}
	canonical, err := decodeCanonicalEvaluationObject(encoded, maximumEvaluationNativeOptionalSourceBytes)
	if err != nil {
		t.Fatal(err)
	}
	return canonical
}

func evaluationNativeOptionalTestCacheSource(
	t *testing.T,
	program evaluationCapabilityProbeProgram,
) map[string]any {
	t.Helper()
	providerIntent, ok := objectMember(program.Value, "providerRequestIntent")
	cachePrefix, prefixOK := objectMember(providerIntent, "cachePrefixResource")
	if !ok || !prefixOK {
		t.Fatal("cache probe program has no canonical prefix resource")
	}
	amounts := []any{map[string]any{
		"unit": "cache-read-token", "cachedAmount": "17", "confidence": "reported",
	}}
	vectorDigest, err := canonicaljson.Digest(amounts)
	if err != nil {
		t.Fatal(err)
	}
	return map[string]any{
		"sourceKind":                    "provider-cache-usage",
		"cacheIsolationAuthorityDigest": evaluationOptionalFactTestDigest(t, "native-cache-isolation-authority"),
		"cacheKeyDigest":                evaluationOptionalFactTestDigest(t, "native-cache-key"),
		"prefixDescriptorDigest":        stringMember(cachePrefix, "descriptorDigest"),
		"usageVector":                   map[string]any{"amounts": amounts, "vectorDigest": vectorDigest},
		"cachedTokenCount":              json.Number("17"), "cacheScope": "task", "provenIsolation": "task", "providerRegion": nil,
	}
}

func evaluationNativeOptionalTestIngress(
	t *testing.T,
	attemptID string,
	descriptorDigest string,
	turnIndex int64,
	invocationID string,
	providerRequestDigest string,
	providerResponseDigest string,
	dispatchIntentDigest string,
	transportReceiptDigest string,
	aadDigest string,
	envelopeDigest string,
	normalizedEventSetDigest string,
	outcome string,
	nativeReceipt any,
) evaluationNativeOptionalBootstrapCloseIngress {
	t.Helper()
	base := map[string]any{
		"format": evaluationNativeOptionalBootstrapCloseIngressFormat, "version": int64(1),
		"attemptId": attemptID, "descriptorDigest": descriptorDigest, "turnIndex": turnIndex,
		"invocationId": invocationID, "providerRequestDigest": providerRequestDigest,
		"providerResponseDigest": providerResponseDigest, "dispatchIntentDigest": dispatchIntentDigest,
		"transportReceiptDigest": transportReceiptDigest, "resultSpoolAADigest": aadDigest,
		"resultSpoolEnvelopeDigest": envelopeDigest, "normalizedEventSetDigest": normalizedEventSetDigest,
		"outcome": outcome, "nativeSourceReceipt": nativeReceipt,
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	value := cloneEvaluationObject(base)
	value["ingressDigest"] = digest
	encoded, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	ingress, err := decodeEvaluationNativeOptionalBootstrapCloseIngress(encoded)
	if err != nil {
		t.Fatalf("decode native optional bootstrap ingress: %v", err)
	}
	return ingress
}

func evaluationNativeOptionalTestBootstrapFixture(
	t *testing.T,
	outcome string,
) evaluationNativeOptionalBootstrapFixture {
	t.Helper()
	plan, err := decodeEvaluationPlan(readEvaluationRepositoryVector(t).Facts.Plan)
	if err != nil {
		t.Fatalf("decode plan: %v", err)
	}
	attempts, err := evaluationStatusPlannedAttempts(plan)
	if err != nil {
		t.Fatalf("derive attempts: %v", err)
	}
	var selected evaluationStatusPlannedAttempt
	for _, candidate := range attempts {
		target := evaluationPlanObjectByIdentity(
			plan.Value["capabilityQualificationTargets"], "targetId", stringMember(candidate.Descriptor, "targetId"),
		)
		if stringMember(target, "capabilityProfileId") == "g4-provider-isolated-cache" &&
			stringMember(target, "protocolFamily") == "anthropic-messages" {
			selected = candidate
			break
		}
	}
	if selected.AttemptID == "" {
		t.Fatal("plan has no native cache bootstrap attempt")
	}
	descriptorBytes, err := canonicaljson.Bytes(selected.Descriptor)
	if err != nil {
		t.Fatal(err)
	}
	descriptor, err := decodeEvaluationAttemptDescriptor(descriptorBytes)
	if err != nil {
		t.Fatal(err)
	}
	target := evaluationPlanObjectByIdentity(plan.Value["capabilityQualificationTargets"], "targetId", descriptor.TargetID)
	completedAt := time.Date(2026, 8, 3, 5, 0, 0, 0, time.UTC)
	authority := EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: "namespace/native/bootstrap/1",
	}
	partition := EvaluationPlanPartition{PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit}
	intent := EvaluationTransportDispatchIntentRecord{
		NamespaceID: authority.NamespaceID, PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit,
		AttemptID: descriptor.AttemptID, DescriptorDigest: descriptor.DescriptorDigest, DescriptorBytes: descriptor.Canonical,
		TurnIndex: 0, InvocationID: "invocation/native/bootstrap/1",
		ProtocolFamily:          stringMember(target, "protocolFamily"),
		ProviderConfigurationID: stringMember(target, "providerConfigurationId"),
		ModelLineageDigest:      stringMember(target, "modelLineageDigest"),
		RequestDigest:           evaluationOptionalFactTestDigest(t, "native-provider-request"),
		IntentDigest:            evaluationOptionalFactTestDigest(t, "native-dispatch-intent"),
	}
	receipt := EvaluationTransportReceiptRecord{
		NamespaceID: authority.NamespaceID, PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit,
		AttemptID: descriptor.AttemptID, DescriptorDigest: descriptor.DescriptorDigest, TurnIndex: 0,
		IntentDigest: intent.IntentDigest, InvocationID: intent.InvocationID,
		ProviderConfigurationID: intent.ProviderConfigurationID, DispatchState: "dispatched", Outcome: "completed",
		ResponseBodyDigest: evaluationOptionalFactTestDigest(t, "native-response-body"),
		ReceiptDigest:      evaluationOptionalFactTestDigest(t, "native-transport-receipt"), CompletedAt: completedAt,
	}
	spool := EvaluationProviderResultSpoolReceiptRecord{
		NamespaceID: authority.NamespaceID, PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit,
		AttemptID: descriptor.AttemptID, DescriptorDigest: descriptor.DescriptorDigest, TurnIndex: 0,
		InvocationID: intent.InvocationID, DispatchIntentDigest: intent.IntentDigest,
		TransportReceiptDigest: receipt.ReceiptDigest, ResponseBodyDigest: receipt.ResponseBodyDigest,
		NormalizedEventSetDigest: evaluationOptionalFactTestDigest(t, "native-normalized-events"),
		ResponseDigest:           evaluationOptionalFactTestDigest(t, "native-provider-response"),
		ReceiptDigest:            evaluationOptionalFactTestDigest(t, "native-result-spool-receipt"),
	}
	aad := evaluationProviderResultSpoolAAD{Digest: evaluationOptionalFactTestDigest(t, "native-spool-aad")}
	envelope := evaluationProviderResultSpoolEnvelope{EnvelopeDigest: evaluationOptionalFactTestDigest(t, "native-spool-envelope")}
	profileID, profileDigest := stringMember(target, "capabilityProfileId"), stringMember(target, "capabilityProfileDigest")
	program, err := expectedEvaluationCapabilityProbeProgram(profileID, profileDigest)
	if err != nil {
		t.Fatal(err)
	}
	provider := evaluationPlanObjectByIdentity(
		plan.Value["providerConfigurations"], "providerConfigurationId", intent.ProviderConfigurationID,
	)
	adapter, ok := objectMember(provider, "adapter")
	if !ok {
		t.Fatal("provider adapter is missing")
	}
	var nativeReceipt any
	if outcome == "observed" {
		binding := evaluationNativeOptionalReceiptBinding{
			ProtocolFamily: intent.ProtocolFamily, CapabilityProfileID: profileID,
			CapabilityProfileDigest: profileDigest, InvocationID: intent.InvocationID,
			RequestDigest: intent.RequestDigest, ResponseDigest: spool.ResponseDigest,
			ProviderConfigurationID: intent.ProviderConfigurationID, ModelLineageDigest: intent.ModelLineageDigest,
			AdapterDigest: stringMember(adapter, "adapterDigest"), ObservedAt: completedAt,
		}
		nativeReceipt = evaluationNativeOptionalTestSourceReceipt(
			t, program, binding, evaluationNativeOptionalTestCacheSource(t, program),
		)
	}
	ingress := evaluationNativeOptionalTestIngress(
		t, descriptor.AttemptID, descriptor.DescriptorDigest, 0, intent.InvocationID,
		intent.RequestDigest, spool.ResponseDigest, intent.IntentDigest, receipt.ReceiptDigest,
		aad.Digest, envelope.EnvelopeDigest, spool.NormalizedEventSetDigest, outcome, nativeReceipt,
	)
	sealedAt := completedAt.Add(time.Second)
	record, err := evaluationNativeOptionalBootstrapSourceRecord(
		authority, partition, plan, descriptor, intent, receipt, spool, aad, envelope, ingress, sealedAt,
	)
	if err != nil {
		t.Fatalf("seal native optional bootstrap source: %v", err)
	}
	return evaluationNativeOptionalBootstrapFixture{
		Authority: authority, Partition: partition, Plan: plan, Descriptor: descriptor,
		Intent: intent, Receipt: receipt, Spool: spool, AAD: aad, Envelope: envelope,
		Ingress: ingress, Record: record,
	}
}

func TestEvaluationNativeOptionalCapabilitySourceReceiptCodecs(t *testing.T) {
	observedAt := time.Date(2026, 8, 3, 5, 0, 0, 0, time.UTC)
	tests := []struct {
		name, profileID, protocolFamily string
		source                          func(*testing.T, evaluationCapabilityProbeProgram) map[string]any
	}{
		{
			name: "background-job-active", profileID: "g4-provider-background-job", protocolFamily: "openai-responses",
			source: func(t *testing.T, _ evaluationCapabilityProbeProgram) map[string]any {
				return map[string]any{
					"sourceKind":                   "provider-job-active-status",
					"providerStateReferenceDigest": evaluationOptionalFactTestDigest(t, "native-active-job-state"),
					"opaqueProviderStateRef":       "opaque/provider/active-state/1",
					"stateVaultAuthorityDigest":    evaluationOptionalFactTestDigest(t, "native-active-job-vault-authority"),
					"stateVaultSealRequestDigest":  evaluationOptionalFactTestDigest(t, "native-active-job-vault-seal-request"),
					"stateVaultSealReceiptDigest":  evaluationOptionalFactTestDigest(t, "native-active-job-vault-seal-receipt"),
					"taskId":                       "task/native/active-job/1",
					"runId":                        "run/native/active-job/1", "generation": json.Number("1"), "providerStatus": "in-progress",
				}
			},
		},
		{
			name: "background-job", profileID: "g4-provider-background-job", protocolFamily: "openai-responses",
			source: func(t *testing.T, _ evaluationCapabilityProbeProgram) map[string]any {
				return map[string]any{
					"sourceKind":                   "provider-job-terminal-status",
					"providerStateReferenceDigest": evaluationOptionalFactTestDigest(t, "native-job-state"),
					"opaqueProviderStateRef":       "opaque/provider/state/1",
					"stateVaultAuthorityDigest":    evaluationOptionalFactTestDigest(t, "native-job-vault-authority"),
					"stateVaultSealRequestDigest":  evaluationOptionalFactTestDigest(t, "native-job-vault-seal-request"),
					"stateVaultSealReceiptDigest":  evaluationOptionalFactTestDigest(t, "native-job-vault-seal-receipt"),
					"taskId":                       "task/native/job/1",
					"runId":                        "run/native/job/1", "generation": json.Number("1"), "providerStatus": "completed",
				}
			},
		},
		{
			name: "isolated-cache", profileID: "g4-provider-isolated-cache", protocolFamily: "anthropic-messages",
			source: evaluationNativeOptionalTestCacheSource,
		},
		{
			name: "continuation", profileID: "g4-provider-reasoning-continuation", protocolFamily: "gemini-interactions",
			source: func(t *testing.T, _ evaluationCapabilityProbeProgram) map[string]any {
				return map[string]any{
					"sourceKind":                   "provider-stored-continuation",
					"providerStateReferenceDigest": evaluationOptionalFactTestDigest(t, "native-continuation-state"),
					"opaqueProviderStateRef":       "opaque/provider/continuation/1",
					"stateVaultAuthorityDigest":    evaluationOptionalFactTestDigest(t, "native-continuation-vault-authority"),
					"stateVaultSealRequestDigest":  evaluationOptionalFactTestDigest(t, "native-continuation-vault-seal-request"),
					"stateVaultSealReceiptDigest":  evaluationOptionalFactTestDigest(t, "native-continuation-vault-seal-receipt"),
					"taskId":                       "task/native/continuation/1",
					"runId":                        "run/native/continuation/1", "generation": json.Number("2"),
					"expiresAt": evaluationExportInstant(observedAt.Add(time.Minute)),
				}
			},
		},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			profileDigest := evaluationNativeOptionalTestProfileDigest(t, testCase.profileID)
			program, err := expectedEvaluationCapabilityProbeProgram(testCase.profileID, profileDigest)
			if err != nil {
				t.Fatal(err)
			}
			binding := evaluationNativeOptionalReceiptBinding{
				ProtocolFamily: testCase.protocolFamily, CapabilityProfileID: testCase.profileID,
				CapabilityProfileDigest: profileDigest, InvocationID: "invocation/native/codec/1",
				RequestDigest:           evaluationOptionalFactTestDigest(t, "codec-request"),
				ResponseDigest:          evaluationOptionalFactTestDigest(t, "codec-response"),
				ProviderConfigurationID: "provider/native/codec/1",
				ModelLineageDigest:      evaluationOptionalFactTestDigest(t, "codec-model-lineage"),
				AdapterDigest:           evaluationOptionalFactTestDigest(t, "codec-adapter"), ObservedAt: observedAt,
			}
			receipt := evaluationNativeOptionalTestSourceReceipt(t, program, binding, testCase.source(t, program))
			decoded, err := decodeEvaluationNativeProviderOptionalSourceReceipt(receipt, program, binding)
			if err != nil || decoded.ReceiptDigest != stringMember(receipt, "receiptDigest") || decoded.FactDigest == "" {
				t.Fatalf("native source receipt drifted: %#v %v", decoded, err)
			}
			if testCase.name == "background-job-active" &&
				(stringMember(decoded.FactValue, "phase") != "running" ||
					stringMember(decoded.FactValue, "callbackAuthority") != "active" || decoded.FactValue["outcome"] != nil) {
				t.Fatalf("active Provider job fact drifted: %#v", decoded.FactValue)
			}
			swapped := cloneEvaluationObject(receipt)
			executionIdentity, _ := objectMember(swapped, "executionIdentityAuthority")
			executionIdentity["invocationId"] = "invocation/native/codec/swapped"
			delete(executionIdentity, "authorityDigest")
			executionIdentity["authorityDigest"], _ = canonicaljson.Digest(executionIdentity)
			swapped["executionIdentityAuthority"] = executionIdentity
			delete(swapped, "receiptDigest")
			swapped["receiptDigest"], _ = canonicaljson.Digest(swapped)
			if _, err := decodeEvaluationNativeProviderOptionalSourceReceipt(swapped, program, binding); !errors.Is(err, ErrConflict) {
				t.Fatalf("recommitted execution identity swap was accepted: %v", err)
			}
		})
	}
}

func TestEvaluationNativeOptionalCapabilityBootstrapSealsSharedDurableFact(t *testing.T) {
	fixture := evaluationNativeOptionalTestBootstrapFixture(t, "observed")
	if err := validateEvaluationNativeOptionalBootstrapSourceRecord(fixture.Record); err != nil {
		t.Fatal(err)
	}
	request, err := decodeEvaluationOptionalFactAuthorityRequest(fixture.Record.OptionalAuthorityRequestBytes)
	if err != nil {
		t.Fatal(err)
	}
	target := evaluationNativeOptionalBootstrapRecordTarget(fixture.Record)
	transport := evaluationOptionalFactTransportSource{Intent: fixture.Intent, Receipt: fixture.Receipt, Spool: fixture.Spool}
	evidence, err := evaluationOptionalFactEvidenceFromNativeBootstrap(fixture.Record, request, target, transport)
	if err != nil {
		t.Fatal(err)
	}
	source, err := evaluationOptionalFactSourceSeal(
		fixture.Authority, fixture.Partition, request, evidence, fixture.Record.SealedAt.Add(time.Second),
	)
	if err != nil {
		t.Fatal(err)
	}
	if source.SourceSealDigest == fixture.Record.SourceReceiptDigest ||
		source.OwnerStageDigest != fixture.Record.SourceOwnerStageDigest ||
		source.OwnerDispatchAckDigest != fixture.Record.SourceOwnerDispatchAckDigest ||
		source.NativeProviderSourceReceiptDigest != fixture.Record.NativeProviderSourceReceiptDigest ||
		source.Outcome != "observed" || source.FactKind != "provider-cache-receipt" {
		t.Fatalf("native bootstrap collapsed into outer source seal: %#v", source)
	}
	receipt, err := decodeCanonicalEvaluationObject(source.ReceiptBytes, maximumEvaluationOptionalFactAuthorityResponseBytes)
	if err != nil || !exactEvaluationKeys(receipt, []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest",
		"targetId", "targetDigest", "capabilityProfileId", "capabilityProfileDigest", "capabilityDescriptorDigest",
		"capabilityId", "supportExpectation", "turnIndex", "invocationId", "protocolFamily",
		"providerConfigurationId", "modelId", "modelLineageDigest", "adapterDigest", "providerRequestDigest",
		"responseDigest", "dispatchIntentDigest", "transportReceiptDigest", "resultSpoolReceiptDigest",
		"normalizedEventSetDigest", "targetAuthorityDigest", "sourceAuthorityId",
		"sourceAuthorityImplementationDigest", "sourceAuthorityRouteBinding", "registrationAuthorityIssuerId",
		"registrationReceiptDigest", "sourceKind", "sourceDigest", "sourceRequestDigest", "ownerStageDigest",
		"ownerDispatchAckDigest", "nativeBootstrapSourceRequestDigest", "nativeBootstrapSourceReceiptDigest",
		"nativeProviderSourceReceiptDigest", "nativeProviderSourceDigest", "nativeProviderSourceFactDigest",
		"outcome", "observedAt", "sealedAt", "fact", "sourceSealDigest",
	}) {
		t.Fatalf("native outer source receipt shape drifted: %#v %v", receipt, err)
	}
	stageValue := map[string]any{
		"format": evaluationOptionalFactAuthorityStageRequestFormat, "version": int64(1),
		"planDigest": fixture.Partition.PlanDigest, "repositoryCommit": fixture.Partition.RepositoryCommit,
		"attemptId": request.AttemptID, "descriptorDigest": request.DescriptorDigest,
		"turnIndex": request.TurnIndex, "sourceSealDigest": source.SourceSealDigest,
	}
	stageBytes, _ := canonicaljson.Bytes(stageValue)
	stageRequest, err := decodeEvaluationOptionalFactAuthorityStageRequest(stageBytes)
	if err != nil {
		t.Fatal(err)
	}
	staged, err := evaluationOptionalFactAuthorityStage(
		fixture.Authority, fixture.Partition, stageRequest, source, source.SealedAt.Add(time.Second),
	)
	if err != nil {
		t.Fatal(err)
	}
	sealed, err := evaluationOptionalFactAuthoritySealFromSource(
		fixture.Authority, fixture.Partition, staged, source, staged.StagedAt.Add(time.Second),
	)
	if err != nil {
		t.Fatal(err)
	}
	envelope, err := decodeCanonicalEvaluationObject(
		sealed.RuntimeFactEnvelopeBytes, maximumEvaluationOptionalFactAuthorityEnvelopeBytes,
	)
	if err != nil || stringMember(envelope, "sourceAuthorityKind") != "shared-durable-capability" ||
		stringMember(envelope, "stageDigest") != fixture.Record.SourceOwnerStageDigest ||
		stringMember(envelope, "dispatchAckDigest") != fixture.Record.SourceOwnerDispatchAckDigest ||
		stringMember(envelope, "transportReceiptDigest") != fixture.Receipt.ReceiptDigest ||
		stringMember(envelope, "resultSpoolReceiptDigest") != fixture.Spool.ReceiptDigest ||
		stringMember(envelope, "normalizedEventSetDigest") != fixture.Spool.NormalizedEventSetDigest ||
		staged.StageDigest == fixture.Record.SourceOwnerStageDigest ||
		sealed.DispatchAckDigest == fixture.Record.SourceOwnerDispatchAckDigest {
		t.Fatalf("shared native runtime authority drifted: envelope=%#v staged=%#v sealed=%#v err=%v", envelope, staged, sealed, err)
	}
	archive := EvaluationOptionalFactSourceArchiveRecord{
		AttemptID: source.AttemptID, TurnIndex: source.TurnIndex, SourceSealDigest: source.SourceSealDigest,
		ReceiptBytes: source.ReceiptBytes, FactBytes: source.FactBytes,
		BootstrapSourceRequestBytes: fixture.Record.SourceRequestBytes,
		BootstrapSourceReceiptBytes: fixture.Record.SourceReceiptBytes,
		NativeSourceReceiptBytes:    fixture.Record.NativeProviderSourceReceiptBytes,
		BootstrapFactBytes:          fixture.Record.FactBytes,
	}
	if err := evaluationOptionalFactSourceArchiveCanonicalRecord(&archive); err != nil {
		t.Fatal(err)
	}
	archiveValue, err := decodeCanonicalEvaluationObject(
		archive.RecordBytes, maximumEvaluationOptionalFactSourceArchiveRecordBytes,
	)
	if err != nil || !exactEvaluationKeys(archiveValue, []string{
		"format", "version", "attemptId", "turnIndex", "sourceSealDigest", "sourceReceipt",
		"bootstrapSourceRequest", "bootstrapSourceReceipt", "nativeSourceReceipt", "bootstrapFact",
		"stateVaultSealRequest", "stateVaultSealReceipt", "stateVaultResolveRequest", "stateVaultResolveReceipt",
		"stateVaultRetireRequest", "stateVaultRetirementReceipt", "recordDigest",
	}) || stringMember(archiveValue, "recordDigest") != archive.RecordDigest ||
		archiveValue["stateVaultSealRequest"] != nil || archiveValue["stateVaultSealReceipt"] != nil ||
		archiveValue["stateVaultResolveRequest"] != nil || archiveValue["stateVaultResolveReceipt"] != nil ||
		archiveValue["stateVaultRetireRequest"] != nil || archiveValue["stateVaultRetirementReceipt"] != nil {
		t.Fatalf("native source archive wrapper drifted: %#v %v", archiveValue, err)
	}
	tamperedArchive := archive
	bootstrapReceipt, _ := decodeCanonicalEvaluationObject(
		tamperedArchive.BootstrapSourceReceiptBytes, maximumEvaluationNativeOptionalBootstrapBytes,
	)
	bootstrapReceipt["sourceOwnerDispatchAckDigest"] = evaluationOptionalFactTestDigest(t, "archive-ack-swap")
	delete(bootstrapReceipt, "receiptDigest")
	bootstrapReceipt["receiptDigest"], _ = canonicaljson.Digest(bootstrapReceipt)
	tamperedArchive.BootstrapSourceReceiptBytes, _ = canonicaljson.Bytes(bootstrapReceipt)
	if err := evaluationOptionalFactSourceArchiveCanonicalRecord(&tamperedArchive); !errors.Is(err, ErrConflict) {
		t.Fatalf("recommitted native source ACK archive swap was accepted: %v", err)
	}
	// This golden anchors the Go canonical cross-owner chain to the generated
	// human-authority vector; the relational checks above remain the semantic owner.
	if fixture.Record.SourceRequestDigest != "sha256-8ab3901b58b17118363d0de4857b67317e8f583a37ac4baeb3eef5bb3c48e863" ||
		fixture.Record.SourceOwnerStageDigest != "sha256-3afc6992a70eaaf555f6ee5e1449de6893a3587bc3e9bc0b4598f3ffe1872b34" ||
		fixture.Record.SourceOwnerDispatchAckDigest != "sha256-d22cbf0e02b35e17ad365fe9e815d9218047bea04c4a2135307f3575c5997f6b" ||
		fixture.Record.SourceReceiptDigest != "sha256-209e52907aa1e50bdd1b0974dd94ec281df65b96e1df3476ce423a7f59af3282" ||
		source.SourceSealDigest != "sha256-ada917f8adcd603bfc379c942e895e58a27ed0dd290b410e3b187e45915a4349" ||
		sealed.RuntimeFactEnvelopeDigest != "sha256-d02765ea4609531f28d0a6c4d6a27535d1d2613202bfb0d17f1682911e90376b" ||
		sealed.FactAuthorityDigest != "sha256-c361e1c9f582cc156194cebccd0991ea2dca5b4fabf4a9d0d02adb8158cd02a5" {
		t.Fatalf("native bootstrap cross-owner vector drifted: sourceRequest=%s stage=%s ack=%s sourceReceipt=%s outerSource=%s envelope=%s authority=%s",
			fixture.Record.SourceRequestDigest, fixture.Record.SourceOwnerStageDigest,
			fixture.Record.SourceOwnerDispatchAckDigest, fixture.Record.SourceReceiptDigest,
			source.SourceSealDigest, sealed.RuntimeFactEnvelopeDigest, sealed.FactAuthorityDigest)
	}
}

func TestEvaluationNativeOptionalCapabilityBootstrapUnavailableProducesNoFact(t *testing.T) {
	fixture := evaluationNativeOptionalTestBootstrapFixture(t, "unavailable")
	request, err := decodeEvaluationOptionalFactAuthorityRequest(fixture.Record.OptionalAuthorityRequestBytes)
	if err != nil {
		t.Fatal(err)
	}
	target := evaluationNativeOptionalBootstrapRecordTarget(fixture.Record)
	evidence, err := evaluationOptionalFactEvidenceFromNativeBootstrap(
		fixture.Record, request, target,
		evaluationOptionalFactTransportSource{Intent: fixture.Intent, Receipt: fixture.Receipt, Spool: fixture.Spool},
	)
	if err != nil {
		t.Fatal(err)
	}
	source, err := evaluationOptionalFactSourceSeal(
		fixture.Authority, fixture.Partition, request, evidence, fixture.Record.SealedAt.Add(time.Second),
	)
	if err != nil || source.Outcome != "unavailable" || source.FactDigest != "" || len(source.FactBytes) != 0 {
		t.Fatalf("unavailable bootstrap created a fact: %#v %v", source, err)
	}
	archive := EvaluationOptionalFactSourceArchiveRecord{
		AttemptID: source.AttemptID, TurnIndex: source.TurnIndex, SourceSealDigest: source.SourceSealDigest,
		ReceiptBytes: source.ReceiptBytes, BootstrapSourceRequestBytes: fixture.Record.SourceRequestBytes,
		BootstrapSourceReceiptBytes: fixture.Record.SourceReceiptBytes,
	}
	if err := evaluationOptionalFactSourceArchiveCanonicalRecord(&archive); err != nil {
		t.Fatalf("archive unavailable bootstrap: %v", err)
	}
	archiveValue, _ := decodeCanonicalEvaluationObject(archive.RecordBytes, maximumEvaluationOptionalFactSourceArchiveRecordBytes)
	if archiveValue["nativeSourceReceipt"] != nil || archiveValue["bootstrapFact"] != nil {
		t.Fatalf("unavailable archive synthesized native source evidence: %#v", archiveValue)
	}
	stageValue := map[string]any{
		"format": evaluationOptionalFactAuthorityStageRequestFormat, "version": int64(1),
		"planDigest": fixture.Partition.PlanDigest, "repositoryCommit": fixture.Partition.RepositoryCommit,
		"attemptId": request.AttemptID, "descriptorDigest": request.DescriptorDigest,
		"turnIndex": request.TurnIndex, "sourceSealDigest": source.SourceSealDigest,
	}
	stageBytes, _ := canonicaljson.Bytes(stageValue)
	stageRequest, _ := decodeEvaluationOptionalFactAuthorityStageRequest(stageBytes)
	staged, err := evaluationOptionalFactAuthorityStage(
		fixture.Authority, fixture.Partition, stageRequest, source, source.SealedAt.Add(time.Second),
	)
	if err != nil {
		t.Fatal(err)
	}
	sealed, err := evaluationOptionalFactAuthoritySealFromSource(
		fixture.Authority, fixture.Partition, staged, source, staged.StagedAt.Add(time.Second),
	)
	if err != nil || sealed.Outcome != "unavailable" || len(sealed.RuntimeFactEnvelopeBytes) != 0 ||
		len(sealed.FactAuthorityBytes) != 0 {
		t.Fatalf("unavailable bootstrap synthesized shared support: %#v %v", sealed, err)
	}
}

func TestEvaluationNativeOptionalCapabilityBootstrapReadRecoversACKLoss(t *testing.T) {
	fixture := evaluationNativeOptionalTestBootstrapFixture(t, "observed")
	read, err := evaluationNativeOptionalBootstrapSourceReadRecord(fixture.Record)
	if err != nil {
		t.Fatal(err)
	}
	value, err := decodeCanonicalEvaluationObject(read.ResponseBytes, maximumEvaluationNativeOptionalBootstrapReadBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "attemptId", "turnIndex", "sourceRequestDigest",
		"sourceReceiptDigest", "sourceReceipt", "readDigest",
	}) || stringMember(value, "format") != evaluationNativeOptionalBootstrapSourceReadFormat ||
		stringMember(value, "sourceRequestDigest") != fixture.Record.SourceRequestDigest ||
		stringMember(value, "sourceReceiptDigest") != fixture.Record.SourceReceiptDigest ||
		stringMember(value, "readDigest") != read.ReadDigest {
		t.Fatalf("native bootstrap ACK recovery read drifted: %#v %v", value, err)
	}
	base := cloneEvaluationObject(value)
	delete(base, "readDigest")
	readDigest, _ := canonicaljson.Digest(base)
	if readDigest != read.ReadDigest || len(read.ResponseBytes) > maximumEvaluationNativeOptionalBootstrapReadBytes {
		t.Fatalf("native bootstrap ACK recovery read is not bounded or self-digested: %#v", read)
	}

	repository := &evaluationNativeOptionalBootstrapReadTestRepository{result: read}
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: "namespace.native.bootstrap.read", ServiceToken: strings.Repeat("r", 32),
	})
	if err != nil {
		t.Fatal(err)
	}
	path := "/v1/evaluations/namespace.native.bootstrap.read/" + fixture.Partition.PlanDigest + "/" +
		fixture.Partition.RepositoryCommit + "/attempt-turns/" + fixture.Record.AttemptID +
		"/0/native-optional-capability-bootstrap-source"
	request := httptest.NewRequest(http.MethodGet, path, nil)
	request.Header.Set("Authorization", "Bearer "+strings.Repeat("r", 32))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || response.Body.String() != string(read.ResponseBytes) || repository.calls != 1 {
		t.Fatalf("native bootstrap ACK recovery route drifted: status=%d body=%s calls=%d",
			response.Code, response.Body.String(), repository.calls)
	}

	queryRequest := httptest.NewRequest(http.MethodGet, path+"?source=self", nil)
	queryRequest.Header.Set("Authorization", "Bearer "+strings.Repeat("r", 32))
	queryResponse := httptest.NewRecorder()
	handler.ServeHTTP(queryResponse, queryRequest)
	if queryResponse.Code != http.StatusBadRequest || repository.calls != 1 {
		t.Fatalf("query-bearing bootstrap recovery reached the repository: status=%d calls=%d",
			queryResponse.Code, repository.calls)
	}

	tampered := fixture.Record
	receipt, _ := decodeCanonicalEvaluationObject(tampered.SourceReceiptBytes, maximumEvaluationNativeOptionalBootstrapBytes)
	receipt["sourceOwnerDispatchAckDigest"] = evaluationOptionalFactTestDigest(t, "read-ack-swap")
	delete(receipt, "receiptDigest")
	receipt["receiptDigest"], _ = canonicaljson.Digest(receipt)
	tampered.SourceReceiptBytes, _ = canonicaljson.Bytes(receipt)
	if _, err := evaluationNativeOptionalBootstrapSourceReadRecord(tampered); !errors.Is(err, ErrConflict) {
		t.Fatalf("recommitted bootstrap ACK recovery swap was accepted: %v", err)
	}
}

func TestEvaluationNativeOptionalCapabilityBootstrapIngressRequiresDynamicScanner(t *testing.T) {
	fixture := evaluationNativeOptionalTestBootstrapFixture(t, "observed")
	handler := &EvaluationServiceHandler{}
	if _, err := handler.scanEvaluationNativeOptionalBootstrapCloseIngress(
		context.Background(), fixture.Ingress.IngressBytes,
	); !errors.Is(err, errEvaluationServiceUnavailable) {
		t.Fatalf("native bootstrap ingress without a dynamic scanner was accepted: %v", err)
	}
	scanner := &evaluationNativeOptionalBootstrapIngressTestScanner{}
	handler.attemptAuthorityResponseScanner = scanner
	canonical, err := handler.scanEvaluationNativeOptionalBootstrapCloseIngress(
		context.Background(), fixture.Ingress.IngressBytes,
	)
	if err != nil || scanner.calls != 1 ||
		scanner.operation != "native-optional-capability-bootstrap.close-ingress" ||
		scanner.digest != fixture.Ingress.IngressDigest ||
		!bytes.Equal(canonical, fixture.Ingress.IngressBytes) ||
		!bytes.Equal(scanner.payload, fixture.Ingress.IngressBytes) {
		t.Fatalf("native bootstrap dynamic scan drifted: calls=%d operation=%s digest=%s err=%v",
			scanner.calls, scanner.operation, scanner.digest, err)
	}
	scanner.reject = true
	if _, err := handler.scanEvaluationNativeOptionalBootstrapCloseIngress(
		context.Background(), fixture.Ingress.IngressBytes,
	); !errors.Is(err, ErrUnauthorized) || scanner.calls != 2 {
		t.Fatalf("dynamic canary rejection did not stop native bootstrap ingress: calls=%d err=%v", scanner.calls, err)
	}

	plan, err := decodeEvaluationPlan(readEvaluationRepositoryVector(t).Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	repository := &evaluationNativeOptionalBootstrapScanTestRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
	}
	requestBody, err := json.Marshal(map[string]any{
		"descriptorDigest": fixture.Descriptor.DescriptorDigest, "budgetReservationId": "budget.native.bootstrap.scan",
		"expectedIntentDigest": fixture.Intent.IntentDigest, "transportReceipt": map[string]any{},
		"nativeOptionalCapabilityBootstrapIngress": json.RawMessage(fixture.Ingress.IngressBytes),
		"closedAt": evaluationExportInstant(fixture.Record.SealedAt),
	})
	if err != nil {
		t.Fatal(err)
	}
	path := evaluationServiceTestURL(plan, "attempt-turns/attempt.native.bootstrap.scan/0/close")
	rejectingScanner := &evaluationNativeOptionalBootstrapIngressTestScanner{reject: true}
	service, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: evaluationServiceTestNamespace, ServiceToken: evaluationServiceTestToken,
		AttemptAuthorityResponseScanner: rejectingScanner,
	})
	if err != nil {
		t.Fatal(err)
	}
	request := authorizedEvaluationServiceRequest(http.MethodPut, path, bytes.NewReader(requestBody))
	response := httptest.NewRecorder()
	service.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden || repository.closeCalls != 0 || rejectingScanner.calls != 1 {
		t.Fatalf("dynamic canary reached transport close: status=%d close=%d scans=%d",
			response.Code, repository.closeCalls, rejectingScanner.calls)
	}

	serviceWithoutScanner, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: evaluationServiceTestNamespace, ServiceToken: evaluationServiceTestToken,
	})
	if err != nil {
		t.Fatal(err)
	}
	request = authorizedEvaluationServiceRequest(http.MethodPut, path, bytes.NewReader(requestBody))
	response = httptest.NewRecorder()
	serviceWithoutScanner.ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable || repository.closeCalls != 0 {
		t.Fatalf("native ingress without scanner reached transport close: status=%d close=%d",
			response.Code, repository.closeCalls)
	}
}

func TestEvaluationNativeOptionalCapabilityBootstrapRejectsRecomputedAndFenceSwaps(t *testing.T) {
	fixture := evaluationNativeOptionalTestBootstrapFixture(t, "observed")
	t.Run("exact-ingress", func(t *testing.T) {
		value, _ := decodeCanonicalEvaluationObject(fixture.Ingress.IngressBytes, maximumEvaluationNativeOptionalBootstrapBytes)
		value["extra"] = "rejected"
		delete(value, "ingressDigest")
		value["ingressDigest"], _ = canonicaljson.Digest(value)
		encoded, _ := canonicaljson.Bytes(value)
		if _, err := decodeEvaluationNativeOptionalBootstrapCloseIngress(encoded); !errors.Is(err, ErrInvalid) {
			t.Fatalf("extra ingress key was accepted: %v", err)
		}
	})
	t.Run("turn-one", func(t *testing.T) {
		value, _ := decodeCanonicalEvaluationObject(fixture.Ingress.IngressBytes, maximumEvaluationNativeOptionalBootstrapBytes)
		value["turnIndex"] = int64(1)
		delete(value, "ingressDigest")
		value["ingressDigest"], _ = canonicaljson.Digest(value)
		encoded, _ := canonicaljson.Bytes(value)
		if _, err := decodeEvaluationNativeOptionalBootstrapCloseIngress(encoded); !errors.Is(err, ErrInvalid) {
			t.Fatalf("non-bootstrap turn was accepted: %v", err)
		}
	})
	t.Run("source-request-turn-one", func(t *testing.T) {
		value, _ := decodeCanonicalEvaluationObject(
			fixture.Record.OptionalAuthorityRequestBytes, maximumEvaluationOptionalFactAuthorityRequestBytes,
		)
		value["turnIndex"] = int64(1)
		encoded, _ := canonicaljson.Bytes(value)
		if _, err := decodeEvaluationOptionalFactAuthorityRequest(encoded); !errors.Is(err, ErrInvalid) {
			t.Fatalf("native bootstrap source reference after turn zero was accepted: %v", err)
		}
	})
	t.Run("delayed-provider-observation", func(t *testing.T) {
		value, _ := decodeCanonicalEvaluationObject(fixture.Ingress.IngressBytes, maximumEvaluationNativeOptionalBootstrapBytes)
		receipt, _ := objectMember(value, "nativeSourceReceipt")
		delayedObservedAt := fixture.Receipt.CompletedAt.Add(500 * time.Millisecond)
		receipt["observedAt"] = evaluationExportInstant(delayedObservedAt)
		delete(receipt, "receiptDigest")
		receipt["receiptDigest"], _ = canonicaljson.Digest(receipt)
		value["nativeSourceReceipt"] = receipt
		delete(value, "ingressDigest")
		value["ingressDigest"], _ = canonicaljson.Digest(value)
		encoded, _ := canonicaljson.Bytes(value)
		ingress, err := decodeEvaluationNativeOptionalBootstrapCloseIngress(encoded)
		if err != nil {
			t.Fatal(err)
		}
		record, err := evaluationNativeOptionalBootstrapSourceRecord(
			fixture.Authority, fixture.Partition, fixture.Plan, fixture.Descriptor, fixture.Intent,
			fixture.Receipt, fixture.Spool, fixture.AAD, fixture.Envelope, ingress, fixture.Record.SealedAt,
		)
		if err != nil || !record.ObservedAt.Equal(delayedObservedAt) {
			t.Fatalf("bounded delayed provider observation was rejected: %#v %v", record, err)
		}
		sourceRequest, _ := decodeCanonicalEvaluationObject(
			record.SourceRequestBytes, maximumEvaluationNativeOptionalBootstrapBytes,
		)
		if stringMember(sourceRequest, "transportCompletedAt") != evaluationExportInstant(fixture.Receipt.CompletedAt) ||
			stringMember(sourceRequest, "observedAt") != evaluationExportInstant(delayedObservedAt) {
			t.Fatalf("transport and observation times collapsed: %#v", sourceRequest)
		}
		optionalRequest, err := decodeEvaluationOptionalFactAuthorityRequest(record.OptionalAuthorityRequestBytes)
		if err != nil {
			t.Fatal(err)
		}
		target := evaluationNativeOptionalBootstrapRecordTarget(record)
		evidence, err := evaluationOptionalFactEvidenceFromNativeBootstrap(
			record, optionalRequest, target,
			evaluationOptionalFactTransportSource{Intent: fixture.Intent, Receipt: fixture.Receipt, Spool: fixture.Spool},
		)
		if err != nil {
			t.Fatal(err)
		}
		outerSource, err := evaluationOptionalFactSourceSeal(
			fixture.Authority, fixture.Partition, optionalRequest, evidence, record.SealedAt.Add(time.Millisecond),
		)
		if err != nil {
			t.Fatal(err)
		}
		archive := EvaluationOptionalFactSourceArchiveRecord{
			AttemptID: outerSource.AttemptID, TurnIndex: outerSource.TurnIndex,
			SourceSealDigest: outerSource.SourceSealDigest, ReceiptBytes: outerSource.ReceiptBytes,
			FactBytes: outerSource.FactBytes, BootstrapSourceRequestBytes: record.SourceRequestBytes,
			BootstrapSourceReceiptBytes: record.SourceReceiptBytes,
			NativeSourceReceiptBytes:    record.NativeProviderSourceReceiptBytes, BootstrapFactBytes: record.FactBytes,
		}
		if err := evaluationOptionalFactSourceArchiveCanonicalRecord(&archive); err != nil {
			t.Fatalf("archive rejected bounded delayed provider observation: %v", err)
		}
	})
	t.Run("observation-before-transport", func(t *testing.T) {
		value, _ := decodeCanonicalEvaluationObject(fixture.Ingress.IngressBytes, maximumEvaluationNativeOptionalBootstrapBytes)
		receipt, _ := objectMember(value, "nativeSourceReceipt")
		receipt["observedAt"] = evaluationExportInstant(fixture.Receipt.CompletedAt.Add(-time.Millisecond))
		delete(receipt, "receiptDigest")
		receipt["receiptDigest"], _ = canonicaljson.Digest(receipt)
		value["nativeSourceReceipt"] = receipt
		delete(value, "ingressDigest")
		value["ingressDigest"], _ = canonicaljson.Digest(value)
		encoded, _ := canonicaljson.Bytes(value)
		ingress, err := decodeEvaluationNativeOptionalBootstrapCloseIngress(encoded)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := evaluationNativeOptionalBootstrapSourceRecord(
			fixture.Authority, fixture.Partition, fixture.Plan, fixture.Descriptor, fixture.Intent,
			fixture.Receipt, fixture.Spool, fixture.AAD, fixture.Envelope, ingress, fixture.Record.SealedAt,
		); !errors.Is(err, ErrConflict) {
			t.Fatalf("provider observation before transport completion was accepted: %v", err)
		}
	})
	t.Run("provider-binding", func(t *testing.T) {
		value, _ := decodeCanonicalEvaluationObject(fixture.Ingress.IngressBytes, maximumEvaluationNativeOptionalBootstrapBytes)
		receipt, _ := objectMember(value, "nativeSourceReceipt")
		receipt["providerConfigurationId"] = "provider/native/swapped"
		delete(receipt, "receiptDigest")
		receipt["receiptDigest"], _ = canonicaljson.Digest(receipt)
		value["nativeSourceReceipt"] = receipt
		delete(value, "ingressDigest")
		value["ingressDigest"], _ = canonicaljson.Digest(value)
		encoded, _ := canonicaljson.Bytes(value)
		ingress, err := decodeEvaluationNativeOptionalBootstrapCloseIngress(encoded)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := evaluationNativeOptionalBootstrapSourceRecord(
			fixture.Authority, fixture.Partition, fixture.Plan, fixture.Descriptor, fixture.Intent,
			fixture.Receipt, fixture.Spool, fixture.AAD, fixture.Envelope, ingress, fixture.Record.SealedAt,
		); !errors.Is(err, ErrConflict) {
			t.Fatalf("recomputed provider swap was accepted: %v", err)
		}
	})
	t.Run("source-fact", func(t *testing.T) {
		value, _ := decodeCanonicalEvaluationObject(fixture.Ingress.IngressBytes, maximumEvaluationNativeOptionalBootstrapBytes)
		receipt, _ := objectMember(value, "nativeSourceReceipt")
		source, _ := objectMember(receipt, "source")
		source["cacheKeyDigest"] = evaluationOptionalFactTestDigest(t, "swapped-cache-key")
		receipt["source"] = source
		receipt["sourceDigest"], _ = canonicaljson.Digest(source)
		delete(receipt, "receiptDigest")
		receipt["receiptDigest"], _ = canonicaljson.Digest(receipt)
		value["nativeSourceReceipt"] = receipt
		delete(value, "ingressDigest")
		value["ingressDigest"], _ = canonicaljson.Digest(value)
		encoded, _ := canonicaljson.Bytes(value)
		ingress, err := decodeEvaluationNativeOptionalBootstrapCloseIngress(encoded)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := evaluationNativeOptionalBootstrapSourceRecord(
			fixture.Authority, fixture.Partition, fixture.Plan, fixture.Descriptor, fixture.Intent,
			fixture.Receipt, fixture.Spool, fixture.AAD, fixture.Envelope, ingress, fixture.Record.SealedAt,
		); !errors.Is(err, ErrConflict) {
			t.Fatalf("recomputed source/fact swap was accepted: %v", err)
		}
	})
	t.Run("stage-and-ack", func(t *testing.T) {
		stageSwap := fixture.Record
		stageSwap.SourceOwnerStageDigest = evaluationOptionalFactTestDigest(t, "swapped-native-stage")
		if err := validateEvaluationNativeOptionalBootstrapSourceRecord(stageSwap); !errors.Is(err, ErrConflict) {
			t.Fatalf("source-owner stage swap was accepted: %v", err)
		}
		ackSwap := fixture.Record
		ackSwap.SourceOwnerDispatchAckDigest = evaluationOptionalFactTestDigest(t, "swapped-native-ack")
		if err := validateEvaluationNativeOptionalBootstrapSourceRecord(ackSwap); !errors.Is(err, ErrConflict) {
			t.Fatalf("source-owner ACK swap was accepted: %v", err)
		}
	})
	t.Run("cache-confidence", func(t *testing.T) {
		profileDigest := evaluationNativeOptionalTestProfileDigest(t, "g4-provider-isolated-cache")
		program, _ := expectedEvaluationCapabilityProbeProgram("g4-provider-isolated-cache", profileDigest)
		source := evaluationNativeOptionalTestCacheSource(t, program)
		usage, _ := objectMember(source, "usageVector")
		amounts := usage["amounts"].([]any)
		amounts[0].(map[string]any)["confidence"] = "measured"
		usage["amounts"] = amounts
		usage["vectorDigest"], _ = canonicaljson.Digest(amounts)
		source["usageVector"] = usage
		binding := evaluationNativeOptionalReceiptBinding{
			ProtocolFamily: "anthropic-messages", CapabilityProfileID: "g4-provider-isolated-cache",
			CapabilityProfileDigest: profileDigest, InvocationID: "invocation/native/cache/1",
			RequestDigest:           evaluationOptionalFactTestDigest(t, "cache-request"),
			ResponseDigest:          evaluationOptionalFactTestDigest(t, "cache-response"),
			ProviderConfigurationID: "provider/native/cache/1",
			ModelLineageDigest:      evaluationOptionalFactTestDigest(t, "cache-lineage"),
			AdapterDigest:           evaluationOptionalFactTestDigest(t, "cache-adapter"), ObservedAt: fixture.Record.ObservedAt,
		}
		if _, _, err := evaluationNativeOptionalFactFromSource(program, binding, source); !errors.Is(err, ErrInvalid) {
			t.Fatalf("non-reported cache usage was accepted: %v", err)
		}
		delete(source, "cacheIsolationAuthorityDigest")
		if _, _, err := evaluationNativeOptionalFactFromSource(program, binding, source); !errors.Is(err, ErrInvalid) {
			t.Fatalf("cache source without isolation authority was accepted: %v", err)
		}
	})
}

func TestEvaluationNativeOptionalCapabilityBootstrapIngressAcceptsSlashIdentities(t *testing.T) {
	native := evaluationNativeOptionalTestIngress(
		t, "attempt/native/bootstrap/1", evaluationOptionalFactTestDigest(t, "slash-descriptor"), 0,
		"invocation/native/bootstrap/1", evaluationOptionalFactTestDigest(t, "slash-request"),
		evaluationOptionalFactTestDigest(t, "slash-response"), evaluationOptionalFactTestDigest(t, "slash-dispatch"),
		evaluationOptionalFactTestDigest(t, "slash-transport"), evaluationOptionalFactTestDigest(t, "slash-aad"),
		evaluationOptionalFactTestDigest(t, "slash-envelope"), evaluationOptionalFactTestDigest(t, "slash-normalized"),
		"unavailable", nil,
	)
	if native.AttemptID != "attempt/native/bootstrap/1" || native.InvocationID != "invocation/native/bootstrap/1" {
		t.Fatalf("slash-capable identities drifted: %#v", native)
	}
}

func TestEvaluationNativeOptionalCapabilityBootstrapRecordCapacityIsExact(t *testing.T) {
	if maximumEvaluationNativeOptionalBootstrapRecords != 840 ||
		maximumEvaluationOptionalFactAuthorityRecords != 5_880 ||
		maximumEvaluationOptionalFactSourceArchiveRecordBytes != 167_936 {
		t.Fatalf("native bootstrap capacity drifted: rows=%d archiveRows=%d archiveBytes=%d",
			maximumEvaluationNativeOptionalBootstrapRecords,
			maximumEvaluationOptionalFactAuthorityRecords,
			maximumEvaluationOptionalFactSourceArchiveRecordBytes)
	}
	if strings.TrimSpace(evaluationNativeOptionalBootstrapSourceSelectColumns) == "" {
		t.Fatal("native bootstrap repository projection is missing")
	}
}
