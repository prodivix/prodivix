package agent

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	maximumEvaluationAuthenticityFactBytes = 8_388_608
	maximumEvaluationBundleArtifactBytes   = 536_870_912
)

var evaluationAuthenticityIdentityPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$`)
var evaluationAuthenticityCredentialPattern = regexp.MustCompile(`(?i)(?:\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\bsk-[A-Za-z0-9_-]{8,})`)
var evaluationAuthenticityBase64URLPattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

func validEvaluationAgentControlIdentity(value string) bool {
	return evaluationAuthenticityIdentityPattern.MatchString(value) &&
		!evaluationAuthenticityCredentialPattern.MatchString(value)
}

type EvaluationEndpointSmokeReceiptRecord struct {
	NamespaceID             string
	PlanDigest              string
	RepositoryCommit        string
	ReceiptID               string
	SmokeTargetID           string
	SmokeTargetDigest       string
	ProtocolFamily          string
	ProviderConfigurationID string
	ProviderRequestID       string
	AdapterDigest           string
	ReceiptDigest           string
	ReceiptBytes            []byte
	StartedAt               time.Time
	CompletedAt             time.Time
}

type EvaluationInvocationReceiptRecord struct {
	NamespaceID                            string
	PlanDigest                             string
	RepositoryCommit                       string
	AttemptID                              string
	DescriptorDigest                       string
	TargetID                               string
	ProviderConfigurationID                string
	ModelLineageDigest                     string
	ProviderRequestID                      string
	ExecutionFailureAuthorityReceiptDigest string
	TransportReceiptDigest                 string
	ResolvedModelID                        string
	ResolvedModelVersion                   string
	ResolvedModelIdentityDigest            string
	InvocationOutcome                      string
	InvocationReceiptDigest                string
	ResponseArtifactDigest                 string
	EvidenceDigest                         string
	EvidenceBytes                          []byte
	StartedAt                              time.Time
	CompletedAt                            time.Time
}

type EvaluationExecutionReceiptRecord struct {
	NamespaceID                              string
	PlanDigest                               string
	RepositoryCommit                         string
	ExecutionReceiptID                       string
	AttemptID                                string
	DescriptorDigest                         string
	ModelInvocations                         int64
	ToolCalls                                int64
	RepairRounds                             int64
	Transactions                             int64
	ArtifactBytes                            int64
	ElapsedMS                                int64
	CapabilityExecutionReceiptSetDigest      string
	VerificationAttemptGrantReceiptSetDigest string
	ToolReceiptSetDigest                     string
	TransactionReceiptSetDigest              string
	VerificationClosureDigest                string
	ReceiptDigest                            string
	ReceiptBytes                             []byte
}

type EvaluationSourceReceiptRecord struct {
	NamespaceID                            string
	PlanDigest                             string
	RepositoryCommit                       string
	SourceReceiptID                        string
	SourceKind                             string
	ProviderConfigurationID                string
	ModelLineageDigest                     string
	ProviderRequestID                      string
	ExecutionFailureAuthorityReceiptDigest string
	SourceURI                              string
	SourceContentDigest                    string
	ReceiptDigest                          string
	ReceiptBytes                           []byte
	ObservedAt                             time.Time
}

type EvaluationAuthorityAttestationRecord struct {
	NamespaceID                                                          string
	PlanDigest                                                           string
	RepositoryCommit                                                     string
	AuthorityID                                                          string
	KeyID                                                                string
	EvidenceSetDigest                                                    string
	CapabilityProbeAdmissionSetDigest                                    string
	CapabilityProbeReferenceReceiptSetDigest                             string
	RuntimeFactSourceOwnerRegistrationSetDigest                          string
	CapabilityProbeProviderResourceCleanupSetDigest                      string
	HostedRetrievalRuntimeResourceLifecycleJournalSetDigest              string
	HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest string
	HostedRetrievalRuntimeResourceCleanupSetDigest                       string
	CapabilityEffectProviderRuntimeJournalSetDigest                      string
	OptionalCapabilityFactSourceSetDigest                                string
	OptionalCapabilityFactAuthoritySetDigest                             string
	EndpointSmokeDispatchIntentSetDigest                                 string
	EndpointSmokeTransportReceiptSetDigest                               string
	EndpointSmokeResultSpoolReceiptSetDigest                             string
	EndpointSmokeResultSpoolDispositionReceiptSetDigest                  string
	EndpointSmokeValidationFailureReceiptSetDigest                       string
	EndpointSmokeSetDigest                                               string
	PreDispatchFailureReceiptSetDigest                                   string
	TransportDispatchIntentSetDigest                                     string
	TransportReceiptSetDigest                                            string
	ProviderResultSpoolReceiptSetDigest                                  string
	ProviderResultSpoolDispositionReceiptSetDigest                       string
	InvocationTurnReceiptSetDigest                                       string
	InvocationTurnSetReceiptSetDigest                                    string
	ResultSubmissionReceiptSetDigest                                     string
	AttemptAuthorityOwnerReceiptSetDigest                                string
	ControlledRuntimeReceiptSetDigest                                    string
	CapabilityExecutionReceiptSetDigest                                  string
	CapabilitySpecificReceiptSetDigest                                   string
	ProviderCapabilityObservationReceiptSetDigest                        string
	VerificationAttemptGrantReceiptSetDigest                             string
	ValidatedHumanReviewArtifactSetDigest                                string
	ValidatedHumanMetricObservationSetDigest                             string
	ReviewLeaseDigest                                                    string
	ReviewRasterScanReceiptSetDigest                                     string
	ReviewCandidateRefSetDigest                                          string
	BlindReviewMappingSetDigest                                          string
	SourceReceiptSetDigest                                               string
	ExecutionReceiptSetDigest                                            string
	HoldoutExecutionReceiptDigest                                        string
	SecretCanarySetDigest                                                string
	ProtectedHoldoutCanarySetDigest                                      string
	AttestationDigest                                                    string
	AttestationBytes                                                     []byte
	IssuedAt                                                             time.Time
}

type EvaluationEvidenceRootRecord struct {
	NamespaceID                                                          string
	PlanDigest                                                           string
	RepositoryCommit                                                     string
	RootID                                                               string
	EvidenceSetDigest                                                    string
	CapabilityProbeAdmissionSetDigest                                    string
	CapabilityProbeReferenceReceiptSetDigest                             string
	RuntimeFactSourceOwnerRegistrationSetDigest                          string
	CapabilityProbeProviderResourceCleanupSetDigest                      string
	HostedRetrievalRuntimeResourceLifecycleJournalSetDigest              string
	HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest string
	HostedRetrievalRuntimeResourceCleanupSetDigest                       string
	CapabilityEffectProviderRuntimeJournalSetDigest                      string
	OptionalCapabilityFactSourceSetDigest                                string
	OptionalCapabilityFactAuthoritySetDigest                             string
	EndpointSmokeDispatchIntentSetDigest                                 string
	EndpointSmokeTransportReceiptSetDigest                               string
	EndpointSmokeResultSpoolReceiptSetDigest                             string
	EndpointSmokeResultSpoolDispositionReceiptSetDigest                  string
	EndpointSmokeValidationFailureReceiptSetDigest                       string
	EndpointSmokeSetDigest                                               string
	PreDispatchFailureReceiptSetDigest                                   string
	TransportDispatchIntentSetDigest                                     string
	TransportReceiptSetDigest                                            string
	ProviderResultSpoolReceiptSetDigest                                  string
	ProviderResultSpoolDispositionReceiptSetDigest                       string
	InvocationTurnReceiptSetDigest                                       string
	InvocationTurnSetReceiptSetDigest                                    string
	ResultSubmissionReceiptSetDigest                                     string
	AttemptAuthorityOwnerReceiptSetDigest                                string
	ControlledRuntimeReceiptSetDigest                                    string
	CapabilityExecutionReceiptSetDigest                                  string
	CapabilitySpecificReceiptSetDigest                                   string
	ProviderCapabilityObservationReceiptSetDigest                        string
	VerificationAttemptGrantReceiptSetDigest                             string
	ValidatedHumanReviewArtifactSetDigest                                string
	ValidatedHumanMetricObservationSetDigest                             string
	ReviewLeaseDigest                                                    string
	ReviewRasterScanReceiptSetDigest                                     string
	ReviewCandidateRefSetDigest                                          string
	BlindReviewMappingSetDigest                                          string
	SourceReceiptSetDigest                                               string
	ExecutionReceiptSetDigest                                            string
	HoldoutExecutionReceiptDigest                                        string
	SecretCanarySetDigest                                                string
	ProtectedHoldoutCanarySetDigest                                      string
	AuthorityAttestationDigest                                           string
	EvaluationManifestDigest                                             string
	BundleDigest                                                         string
	BundleArtifactDigest                                                 string
	BundleArtifactSize                                                   int64
	RootDigest                                                           string
	RootBytes                                                            []byte
	RecordedAt                                                           time.Time
}

type evaluationEndpointSmokeReceipt struct {
	EvaluationEndpointSmokeReceiptRecord
	EndpointClass            string
	SmokeProfileDigest       string
	ResponseHeaderDigest     string
	RequestDigest            string
	ResponseDigest           string
	UsageSourceDigest        string
	CostSourceDigest         string
	UsageSourceReceiptDigest string
	CostSourceReceiptDigest  string
	PricingSnapshotRef       string
	Outcome                  string
	Value                    map[string]any
}

type evaluationInvocationReceipt struct {
	EvaluationInvocationReceiptRecord
	ResponseHeaderDigest              string
	CaseDefinitionDigest              string
	ContextPackDigest                 string
	MediaRepresentationManifestDigest string
	MultimodalContextManifestDigest   string
	ProviderMediaBlockManifestDigest  string
	RequestArtifactDigest             string
	UsageSourceDigest                 string
	CostSourceDigest                  string
	UsageSourceReceiptDigest          string
	CostSourceReceiptDigest           string
	CapabilityQualificationDigest     string
	InferenceConfigurationDigest      string
	PricingSnapshotRef                string
	IndependentRunID                  string
	Usage                             any
	Cost                              any
	Provider                          map[string]any
	Model                             map[string]any
	Value                             map[string]any
}

type evaluationExecutionReceipt struct {
	EvaluationExecutionReceiptRecord
	Value map[string]any
}

type evaluationSourceReceipt struct {
	EvaluationSourceReceiptRecord
	PricingSnapshot  map[string]any
	InputUsageDigest string
	OutputCostDigest string
	Value            map[string]any
}

type evaluationAuthorityAttestation struct {
	EvaluationAuthorityAttestationRecord
	HoldoutExecutionReceiptDigest   string
	SecretCanarySetDigest           string
	ProtectedHoldoutCanarySetDigest string
	WorkflowName                    string
	WorkflowRunID                   string
	WorkflowRunAttempt              int64
	JobID                           string
	EnvironmentDigest               string
	AttestedPayloadDigest           string
	AttestedPayloadBytes            []byte
	Signature                       string
	Value                           map[string]any
}

type evaluationEvidenceRoot struct {
	EvaluationEvidenceRootRecord
	Value map[string]any
}

func decodeEvaluationAuthenticityObject(source []byte) (map[string]any, []byte, error) {
	if err := canonicaljson.ValidateRawEnvelope(source, maximumEvaluationAuthenticityFactBytes); err != nil {
		return nil, nil, invalid("evaluation authenticity JSON is invalid")
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var value map[string]any
	if err := decoder.Decode(&value); err != nil {
		return nil, nil, invalid("evaluation authenticity JSON is malformed")
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return nil, nil, invalid("evaluation authenticity JSON has trailing data")
	}
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || !bytes.Equal(source, canonical) {
		return nil, nil, invalid("evaluation authenticity JSON is not canonical")
	}
	return value, canonical, nil
}

func evaluationAuthenticityIdentity(value any, field string) (string, error) {
	text, ok := value.(string)
	if !ok || !evaluationAuthenticityIdentityPattern.MatchString(text) || evaluationAuthenticityCredentialPattern.MatchString(text) {
		return "", invalid("evaluation authenticity " + field + " is not a bounded identity")
	}
	return text, nil
}

func evaluationAuthenticityDigest(value any, field string) (string, error) {
	text, ok := value.(string)
	if !ok || !evaluationDigestPattern.MatchString(text) {
		return "", invalid("evaluation authenticity " + field + " is not a canonical digest")
	}
	return text, nil
}

func evaluationCanonicalBase64URL(value string, expectedBytes int) bool {
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	return err == nil && len(decoded) == expectedBytes && base64.RawURLEncoding.EncodeToString(decoded) == value
}

func optionalEvaluationAuthenticityIdentity(value map[string]any, field string) (string, error) {
	raw, exists := value[field]
	if !exists {
		return "", nil
	}
	return evaluationAuthenticityIdentity(raw, field)
}

func optionalEvaluationAuthenticityDigest(value map[string]any, field string) (string, error) {
	raw, exists := value[field]
	if !exists {
		return "", nil
	}
	return evaluationAuthenticityDigest(raw, field)
}

func verifyEvaluationAuthenticityDigest(value map[string]any, field string) (string, error) {
	digest, err := evaluationAuthenticityDigest(value[field], field)
	if err != nil {
		return "", err
	}
	base := make(map[string]any, len(value)-1)
	for key, entry := range value {
		if key != field {
			base[key] = entry
		}
	}
	computed, err := canonicaljson.Digest(base)
	if err != nil || computed != digest {
		return "", invalid("evaluation authenticity " + field + " drifted")
	}
	return digest, nil
}

func evaluationAuthenticityUsageSourceDigest(value any, requireKnown bool) (string, error) {
	usage, ok := value.(map[string]any)
	if !ok || !exactEvaluationKeys(usage, []string{"amounts", "vectorDigest"}) {
		return "", invalid("evaluation authenticity usage is invalid")
	}
	amounts, ok := usage["amounts"].([]any)
	if !ok || len(amounts) > 256 {
		return "", invalid("evaluation authenticity usage amounts are invalid")
	}
	vectorDigest, err := canonicaljson.Digest(amounts)
	if err != nil || usage["vectorDigest"] != vectorDigest {
		return "", invalid("evaluation authenticity usage vector digest drifted")
	}
	sources := make([]any, 0, len(amounts))
	previous := ""
	for index, raw := range amounts {
		amount, ok := raw.(map[string]any)
		if !ok || !exactEvaluationKeys(amount, []string{"unit", "confidence"},
			"logicalAmount", "billableAmount", "cachedAmount", "sourceDigest") {
			return "", invalid("evaluation authenticity usage source is invalid")
		}
		unit, unitOK := amount["unit"].(string)
		confidence, confidenceOK := amount["confidence"].(string)
		if !unitOK || strings.TrimSpace(unit) == "" || (index > 0 && unit <= previous) ||
			!confidenceOK || !oneOfString(confidence, "reported", "measured", "estimated", "unknown") ||
			(requireKnown && confidence == "unknown") {
			return "", invalid("evaluation authenticity usage amount identity is invalid")
		}
		knownAmounts := 0
		for _, field := range []string{"logicalAmount", "billableAmount", "cachedAmount"} {
			if rawValue, exists := amount[field]; exists {
				if _, err := evaluationDecimal(rawValue, "evaluation authenticity usage "+field); err != nil {
					return "", err
				}
				knownAmounts++
			}
		}
		if confidence != "unknown" && knownAmounts == 0 {
			return "", invalid("evaluation authenticity usage amount has no known value")
		}
		sourceDigest, err := evaluationAuthenticityDigest(amount["sourceDigest"], "usage source digest")
		if err != nil {
			return "", err
		}
		sources = append(sources, map[string]any{"unit": unit, "sourceDigest": sourceDigest})
		previous = unit
	}
	return canonicaljson.Digest(sources)
}

func evaluationAuthenticityCostSourceDigest(value any, requireKnown bool) (string, error) {
	if _, _, err := decodeEvaluationCosts(value, requireKnown); err != nil {
		return "", err
	}
	costs, _ := value.([]any)
	sources := make([]any, 0, len(costs))
	for _, raw := range costs {
		cost, ok := raw.(map[string]any)
		if !ok {
			return "", invalid("evaluation authenticity cost source is invalid")
		}
		currency, _ := cost["currency"].(string)
		sourceDigest, err := evaluationAuthenticityDigest(cost["sourceDigest"], "cost source digest")
		if err != nil {
			return "", err
		}
		sources = append(sources, map[string]any{"currency": currency, "sourceDigest": sourceDigest})
	}
	return canonicaljson.Digest(sources)
}

func decodeEvaluationEndpointSmokeReceipt(source []byte) (evaluationEndpointSmokeReceipt, error) {
	value, canonical, err := decodeEvaluationAuthenticityObject(source)
	if err != nil {
		return evaluationEndpointSmokeReceipt{}, err
	}
	if !exactEvaluationKeys(value, []string{
		"receiptId", "planDigest", "repositoryCommit", "smokeTargetId", "smokeTargetDigest",
		"endpointClass", "protocolFamily", "providerConfigurationId", "adapterDigest", "smokeProfileDigest",
		"providerRequestId", "responseHeaderDigest", "requestDigest", "responseDigest", "usage", "cost",
		"usageSourceDigest", "costSourceDigest", "usageSourceReceiptDigest", "costSourceReceiptDigest",
		"outcome", "startedAt", "completedAt", "receiptDigest",
	}, "pricingSnapshotRef") {
		return evaluationEndpointSmokeReceipt{}, invalid("evaluation endpoint smoke receipt shape is invalid")
	}
	receiptID, err := evaluationAuthenticityIdentity(value["receiptId"], "receipt id")
	if err != nil {
		return evaluationEndpointSmokeReceipt{}, err
	}
	smokeTargetID, err := evaluationAuthenticityIdentity(value["smokeTargetId"], "smoke target id")
	if err != nil {
		return evaluationEndpointSmokeReceipt{}, err
	}
	providerConfigurationID, err := evaluationAuthenticityIdentity(value["providerConfigurationId"], "provider configuration id")
	if err != nil {
		return evaluationEndpointSmokeReceipt{}, err
	}
	providerRequestID, err := evaluationAuthenticityIdentity(value["providerRequestId"], "provider request id")
	if err != nil {
		return evaluationEndpointSmokeReceipt{}, err
	}
	pricingSnapshotRef, err := optionalEvaluationAuthenticityIdentity(value, "pricingSnapshotRef")
	if err != nil {
		return evaluationEndpointSmokeReceipt{}, err
	}
	planDigest, err := evaluationAuthenticityDigest(value["planDigest"], "plan digest")
	if err != nil {
		return evaluationEndpointSmokeReceipt{}, err
	}
	repositoryCommit, ok := value["repositoryCommit"].(string)
	if !ok || !evaluationRepositoryCommitPattern.MatchString(repositoryCommit) {
		return evaluationEndpointSmokeReceipt{}, invalid("evaluation endpoint smoke repository commit is invalid")
	}
	digestFields := []string{
		"smokeTargetDigest", "adapterDigest", "smokeProfileDigest", "responseHeaderDigest", "requestDigest",
		"responseDigest", "usageSourceDigest", "costSourceDigest", "usageSourceReceiptDigest", "costSourceReceiptDigest",
	}
	digests := make(map[string]string, len(digestFields))
	for _, field := range digestFields {
		digests[field], err = evaluationAuthenticityDigest(value[field], field)
		if err != nil {
			return evaluationEndpointSmokeReceipt{}, err
		}
	}
	usageSourceDigest, err := evaluationAuthenticityUsageSourceDigest(value["usage"], true)
	if err != nil || usageSourceDigest != digests["usageSourceDigest"] {
		return evaluationEndpointSmokeReceipt{}, invalid("evaluation endpoint smoke usage source digest drifted")
	}
	costSourceDigest, err := evaluationAuthenticityCostSourceDigest(value["cost"], true)
	if err != nil || costSourceDigest != digests["costSourceDigest"] {
		return evaluationEndpointSmokeReceipt{}, invalid("evaluation endpoint smoke cost source digest drifted")
	}
	usageValue, _ := value["usage"].(map[string]any)
	usageAmounts, _ := usageValue["amounts"].([]any)
	costEntries, _ := value["cost"].([]any)
	if len(usageAmounts) == 0 || len(costEntries) == 0 {
		return evaluationEndpointSmokeReceipt{}, invalid("evaluation endpoint smoke requires authoritative usage and cost")
	}
	startedAt, err := evaluationInstant(value["startedAt"], "evaluation endpoint smoke start")
	if err != nil {
		return evaluationEndpointSmokeReceipt{}, err
	}
	completedAt, err := evaluationInstant(value["completedAt"], "evaluation endpoint smoke completion")
	if err != nil || completedAt.Before(startedAt) {
		return evaluationEndpointSmokeReceipt{}, invalid("evaluation endpoint smoke time range is invalid")
	}
	endpointClass, _ := value["endpointClass"].(string)
	protocolFamily, _ := value["protocolFamily"].(string)
	outcome, _ := value["outcome"].(string)
	if !oneOfString(endpointClass, "first-party-hosted", "aggregator", "self-hosted", "local") ||
		!oneOfString(protocolFamily, "openai-responses", "anthropic-messages", "gemini-interactions", "openai-compatible") ||
		!oneOfString(outcome, "passed", "failed") {
		return evaluationEndpointSmokeReceipt{}, invalid("evaluation endpoint smoke classification is invalid")
	}
	receiptDigest, err := verifyEvaluationAuthenticityDigest(value, "receiptDigest")
	if err != nil {
		return evaluationEndpointSmokeReceipt{}, err
	}
	return evaluationEndpointSmokeReceipt{
		EvaluationEndpointSmokeReceiptRecord: EvaluationEndpointSmokeReceiptRecord{
			PlanDigest: planDigest, RepositoryCommit: repositoryCommit, ReceiptID: receiptID,
			SmokeTargetID: smokeTargetID, SmokeTargetDigest: digests["smokeTargetDigest"],
			ProtocolFamily: protocolFamily, ProviderConfigurationID: providerConfigurationID,
			ProviderRequestID: providerRequestID, AdapterDigest: digests["adapterDigest"],
			ReceiptDigest: receiptDigest, ReceiptBytes: canonical, StartedAt: startedAt, CompletedAt: completedAt,
		},
		EndpointClass: endpointClass, SmokeProfileDigest: digests["smokeProfileDigest"],
		ResponseHeaderDigest: digests["responseHeaderDigest"], RequestDigest: digests["requestDigest"],
		ResponseDigest: digests["responseDigest"], UsageSourceDigest: digests["usageSourceDigest"],
		CostSourceDigest: digests["costSourceDigest"], UsageSourceReceiptDigest: digests["usageSourceReceiptDigest"],
		CostSourceReceiptDigest: digests["costSourceReceiptDigest"], PricingSnapshotRef: pricingSnapshotRef,
		Outcome: outcome, Value: value,
	}, nil
}

func decodeEvaluationInvocationReceipt(source []byte) (evaluationInvocationReceipt, error) {
	value, canonical, err := decodeEvaluationAuthenticityObject(source)
	if err != nil {
		return evaluationInvocationReceipt{}, err
	}
	if !exactEvaluationKeys(value, []string{
		"planDigest", "repositoryCommit", "attemptId", "descriptorDigest",
		"responseHeaderDigest", "caseDefinitionDigest", "contextPackDigest", "requestArtifactDigest",
		"usageSourceDigest", "costSourceDigest", "usageSourceReceiptDigest",
		"costSourceReceiptDigest", "transportReceiptDigest", "resolvedModelIdentityDigest",
		"invocationReceipt", "evidenceDigest",
	}, "providerRequestId", "executionFailureAuthorityReceiptDigest", "mediaRepresentationManifestDigest",
		"responseArtifactDigest", "resolvedModelId", "resolvedModelVersion") {
		return evaluationInvocationReceipt{}, invalid("evaluation invocation evidence shape is invalid")
	}
	planDigest, err := evaluationAuthenticityDigest(value["planDigest"], "plan digest")
	if err != nil {
		return evaluationInvocationReceipt{}, err
	}
	repositoryCommit, ok := value["repositoryCommit"].(string)
	if !ok || !evaluationRepositoryCommitPattern.MatchString(repositoryCommit) {
		return evaluationInvocationReceipt{}, invalid("evaluation invocation repository commit is invalid")
	}
	attemptID, err := evaluationAuthenticityIdentity(value["attemptId"], "attempt id")
	if err != nil {
		return evaluationInvocationReceipt{}, err
	}
	providerRequestID, err := optionalEvaluationAuthenticityIdentity(value, "providerRequestId")
	if err != nil {
		return evaluationInvocationReceipt{}, err
	}
	executionFailureAuthorityReceiptDigest, err := optionalEvaluationAuthenticityDigest(value, "executionFailureAuthorityReceiptDigest")
	if err != nil {
		return evaluationInvocationReceipt{}, err
	}
	if (providerRequestID == "") == (executionFailureAuthorityReceiptDigest == "") {
		return evaluationInvocationReceipt{}, invalid("evaluation invocation requires exactly one provider request or execution-failure authority")
	}
	digestFields := []string{
		"descriptorDigest", "responseHeaderDigest", "caseDefinitionDigest", "contextPackDigest",
		"requestArtifactDigest", "usageSourceDigest", "costSourceDigest",
		"usageSourceReceiptDigest", "costSourceReceiptDigest", "transportReceiptDigest", "resolvedModelIdentityDigest",
	}
	digests := make(map[string]string, len(digestFields)+1)
	for _, field := range digestFields {
		digests[field], err = evaluationAuthenticityDigest(value[field], field)
		if err != nil {
			return evaluationInvocationReceipt{}, err
		}
	}
	mediaDigest, err := optionalEvaluationAuthenticityDigest(value, "mediaRepresentationManifestDigest")
	if err != nil {
		return evaluationInvocationReceipt{}, err
	}
	responseArtifactDigest, err := optionalEvaluationAuthenticityDigest(value, "responseArtifactDigest")
	if err != nil {
		return evaluationInvocationReceipt{}, err
	}
	receipt, ok := value["invocationReceipt"].(map[string]any)
	if !ok || !exactEvaluationKeys(receipt, []string{
		"invocationId", "taskId", "runId", "generation", "attempt", "provider", "model",
		"capabilityQualificationDigest", "inferenceConfigurationDigest", "contextPackDigest", "requestDigest",
		"outcome", "usage", "costStatus", "cost", "startedAt", "completedAt", "receiptDigest",
	}, "multimodalContextManifestDigest", "providerMediaBlockManifestDigest", "contextTransformReceiptRef",
		"cacheReceiptRef", "providerStateReceiptRef", "providerJobReceiptRef", "responseDigest", "pricingSnapshotRef") {
		return evaluationInvocationReceipt{}, invalid("evaluation nested invocation receipt shape is invalid")
	}
	for _, field := range []string{"invocationId", "taskId", "runId"} {
		if _, err := evaluationAuthenticityIdentity(receipt[field], field); err != nil {
			return evaluationInvocationReceipt{}, err
		}
	}
	for _, field := range []string{"contextTransformReceiptRef", "cacheReceiptRef", "providerStateReceiptRef", "providerJobReceiptRef", "pricingSnapshotRef"} {
		if _, err := optionalEvaluationAuthenticityIdentity(receipt, field); err != nil {
			return evaluationInvocationReceipt{}, err
		}
	}
	pricingSnapshotRef, err := optionalEvaluationAuthenticityIdentity(receipt, "pricingSnapshotRef")
	if err != nil {
		return evaluationInvocationReceipt{}, err
	}
	nestedDigests := make(map[string]string, 5)
	for _, field := range []string{
		"capabilityQualificationDigest", "inferenceConfigurationDigest", "contextPackDigest", "requestDigest",
	} {
		if nestedDigests[field], err = evaluationAuthenticityDigest(receipt[field], field); err != nil {
			return evaluationInvocationReceipt{}, err
		}
	}
	nestedResponseDigest, err := optionalEvaluationAuthenticityDigest(receipt, "responseDigest")
	if err != nil {
		return evaluationInvocationReceipt{}, err
	}
	nestedOptionalDigests := make(map[string]string, 2)
	for _, field := range []string{"multimodalContextManifestDigest", "providerMediaBlockManifestDigest"} {
		if nestedOptionalDigests[field], err = optionalEvaluationAuthenticityDigest(receipt, field); err != nil {
			return evaluationInvocationReceipt{}, err
		}
	}
	generation, err := evaluationCount(receipt["generation"], "evaluation invocation generation")
	if err != nil {
		return evaluationInvocationReceipt{}, err
	}
	attemptNumber, err := evaluationCount(receipt["attempt"], "evaluation invocation attempt")
	if err != nil {
		return evaluationInvocationReceipt{}, err
	}
	_ = generation
	_ = attemptNumber
	provider, providerOK := receipt["provider"].(map[string]any)
	model, modelOK := receipt["model"].(map[string]any)
	providerConfigurationID, err := evaluationAuthenticityIdentity(provider["providerConfigurationId"], "provider configuration id")
	if !providerOK || err != nil {
		return evaluationInvocationReceipt{}, invalid("evaluation invocation provider identity is invalid")
	}
	modelLineageDigest, err := evaluationAuthenticityDigest(model["lineageDigest"], "model lineage digest")
	if !modelOK || err != nil {
		return evaluationInvocationReceipt{}, invalid("evaluation invocation model lineage is invalid")
	}
	resolvedModelID, err := optionalEvaluationAuthenticityIdentity(value, "resolvedModelId")
	if err != nil {
		return evaluationInvocationReceipt{}, err
	}
	resolvedModelVersion, err := optionalEvaluationAuthenticityIdentity(value, "resolvedModelVersion")
	if err != nil {
		return evaluationInvocationReceipt{}, err
	}
	resolvedIdentityBase := map[string]any{
		"protocolFamily":         stringMember(provider, "protocolFamily"),
		"transportReceiptDigest": digests["transportReceiptDigest"],
		"frozenModelId":          stringMember(model, "modelId"),
	}
	if immutableVersion := stringMember(model, "immutableVersion"); immutableVersion != "" {
		resolvedIdentityBase["frozenImmutableModelVersion"] = immutableVersion
	}
	if resolvedModelID != "" {
		resolvedIdentityBase["resolvedModelId"] = resolvedModelID
	}
	if resolvedModelVersion != "" {
		resolvedIdentityBase["resolvedModelVersion"] = resolvedModelVersion
	}
	resolvedIdentityDigest, err := canonicaljson.Digest(resolvedIdentityBase)
	if err != nil || resolvedIdentityDigest != digests["resolvedModelIdentityDigest"] {
		return evaluationInvocationReceipt{}, invalid("evaluation resolved model identity digest drifted")
	}
	usageSourceDigest, err := evaluationAuthenticityUsageSourceDigest(receipt["usage"], false)
	if err != nil || usageSourceDigest != digests["usageSourceDigest"] {
		return evaluationInvocationReceipt{}, invalid("evaluation invocation usage source digest drifted")
	}
	costStatus, _ := receipt["costStatus"].(string)
	if !oneOfString(costStatus, "priced", "not-applicable", "unknown") {
		return evaluationInvocationReceipt{}, invalid("evaluation invocation cost status is invalid")
	}
	costSourceDigest, err := evaluationAuthenticityCostSourceDigest(receipt["cost"], costStatus == "priced")
	if err != nil || costSourceDigest != digests["costSourceDigest"] {
		return evaluationInvocationReceipt{}, invalid("evaluation invocation cost source digest drifted")
	}
	costEntries, _ := receipt["cost"].([]any)
	if (costStatus == "priced" && len(costEntries) == 0) || (costStatus == "not-applicable" && len(costEntries) != 0) {
		return evaluationInvocationReceipt{}, invalid("evaluation invocation cost status drifted from cost entries")
	}
	if costStatus == "priced" {
		immutableVersion := stringMember(model, "immutableVersion")
		protocolFamily := stringMember(provider, "protocolFamily")
		if resolvedModelID != stringMember(model, "modelId") ||
			(protocolFamily == "gemini-interactions" && (immutableVersion == "" || resolvedModelVersion != immutableVersion)) ||
			(resolvedModelVersion != "" && resolvedModelVersion != immutableVersion) {
			return evaluationInvocationReceipt{}, conflict("evaluation priced invocation resolved model drifted from the frozen model")
		}
	}
	startedAt, err := evaluationInstant(receipt["startedAt"], "evaluation invocation start")
	if err != nil {
		return evaluationInvocationReceipt{}, err
	}
	completedAt, err := evaluationInstant(receipt["completedAt"], "evaluation invocation completion")
	invocationOutcome, _ := receipt["outcome"].(string)
	if err != nil || completedAt.Before(startedAt) || !oneOfString(invocationOutcome,
		"completed", "refused", "safety-blocked", "truncated", "schema-failed", "provider-error", "cancelled", "timed-out", "partial") {
		return evaluationInvocationReceipt{}, invalid("evaluation invocation outcome or time range is invalid")
	}
	if digests["contextPackDigest"] != nestedDigests["contextPackDigest"] ||
		digests["requestArtifactDigest"] != nestedDigests["requestDigest"] ||
		responseArtifactDigest != nestedResponseDigest ||
		(invocationOutcome == "completed" && (providerRequestID == "" || responseArtifactDigest == "")) {
		return evaluationInvocationReceipt{}, invalid("evaluation invocation request/response binding drifted")
	}
	invocationReceiptDigest, err := verifyEvaluationAuthenticityDigest(receipt, "receiptDigest")
	if err != nil {
		return evaluationInvocationReceipt{}, err
	}
	evidenceDigest, err := verifyEvaluationAuthenticityDigest(value, "evidenceDigest")
	if err != nil {
		return evaluationInvocationReceipt{}, err
	}
	return evaluationInvocationReceipt{
		EvaluationInvocationReceiptRecord: EvaluationInvocationReceiptRecord{
			PlanDigest: planDigest, RepositoryCommit: repositoryCommit, AttemptID: attemptID,
			DescriptorDigest: digests["descriptorDigest"], ProviderConfigurationID: providerConfigurationID,
			ModelLineageDigest: modelLineageDigest, ProviderRequestID: providerRequestID,
			ExecutionFailureAuthorityReceiptDigest: executionFailureAuthorityReceiptDigest,
			TransportReceiptDigest:                 digests["transportReceiptDigest"],
			ResolvedModelID:                        resolvedModelID,
			ResolvedModelVersion:                   resolvedModelVersion,
			ResolvedModelIdentityDigest:            digests["resolvedModelIdentityDigest"],
			InvocationOutcome:                      invocationOutcome,
			InvocationReceiptDigest:                invocationReceiptDigest, ResponseArtifactDigest: responseArtifactDigest,
			EvidenceDigest: evidenceDigest, EvidenceBytes: canonical, StartedAt: startedAt, CompletedAt: completedAt,
		},
		ResponseHeaderDigest: digests["responseHeaderDigest"], CaseDefinitionDigest: digests["caseDefinitionDigest"],
		ContextPackDigest: digests["contextPackDigest"], MediaRepresentationManifestDigest: mediaDigest,
		MultimodalContextManifestDigest:  nestedOptionalDigests["multimodalContextManifestDigest"],
		ProviderMediaBlockManifestDigest: nestedOptionalDigests["providerMediaBlockManifestDigest"],
		RequestArtifactDigest:            digests["requestArtifactDigest"], UsageSourceDigest: digests["usageSourceDigest"],
		CostSourceDigest: digests["costSourceDigest"], UsageSourceReceiptDigest: digests["usageSourceReceiptDigest"],
		CostSourceReceiptDigest:       digests["costSourceReceiptDigest"],
		CapabilityQualificationDigest: nestedDigests["capabilityQualificationDigest"],
		InferenceConfigurationDigest:  nestedDigests["inferenceConfigurationDigest"],
		PricingSnapshotRef:            pricingSnapshotRef,
		IndependentRunID:              stringMember(receipt, "runId"), Usage: receipt["usage"], Cost: receipt["cost"],
		Provider: provider, Model: model, Value: value,
	}, nil
}

func decodeEvaluationPricingSnapshot(value any) (map[string]any, error) {
	snapshot, ok := value.(map[string]any)
	if !ok || !exactEvaluationKeys(snapshot, []string{
		"pricingSnapshotId", "providerConfigurationId", "effectiveAt", "rates", "sourceDigest", "snapshotDigest",
	}, "serviceTier", "region") {
		return nil, invalid("evaluation pricing snapshot shape is invalid")
	}
	for _, field := range []string{"pricingSnapshotId", "providerConfigurationId"} {
		if _, err := evaluationAuthenticityIdentity(snapshot[field], field); err != nil {
			return nil, err
		}
	}
	if _, err := evaluationInstant(snapshot["effectiveAt"], "evaluation pricing effective time"); err != nil {
		return nil, err
	}
	if _, err := evaluationAuthenticityDigest(snapshot["sourceDigest"], "pricing source digest"); err != nil {
		return nil, err
	}
	rates, ok := snapshot["rates"].([]any)
	if !ok || len(rates) == 0 {
		return nil, invalid("evaluation pricing rates are invalid")
	}
	for _, raw := range rates {
		rate, ok := raw.(map[string]any)
		if !ok || !exactEvaluationKeys(rate, []string{"unit", "currency", "unitPrice"}) {
			return nil, invalid("evaluation pricing rate shape is invalid")
		}
		unit, unitOK := rate["unit"].(string)
		currency, currencyOK := rate["currency"].(string)
		if !unitOK || strings.TrimSpace(unit) == "" || !currencyOK || !evaluationCurrencyPattern.MatchString(currency) {
			return nil, invalid("evaluation pricing rate identity is invalid")
		}
		if _, err := evaluationDecimal(rate["unitPrice"], "evaluation pricing unit price"); err != nil {
			return nil, err
		}
	}
	if _, err := verifyEvaluationAuthenticityDigest(snapshot, "snapshotDigest"); err != nil {
		return nil, err
	}
	return snapshot, nil
}

func decodeEvaluationSourceReceipt(source []byte) (evaluationSourceReceipt, error) {
	value, canonical, err := decodeEvaluationAuthenticityObject(source)
	if err != nil {
		return evaluationSourceReceipt{}, err
	}
	if !exactEvaluationKeys(value, []string{
		"sourceReceiptId", "planDigest", "repositoryCommit", "sourceKind", "providerConfigurationId",
		"sourceContentDigest", "observedAt", "receiptDigest",
	}, "modelLineageDigest", "providerRequestId", "executionFailureAuthorityReceiptDigest", "sourceUri", "pricingSnapshot", "inputUsageDigest", "outputCostDigest") {
		return evaluationSourceReceipt{}, invalid("evaluation source receipt shape is invalid")
	}
	sourceReceiptID, err := evaluationAuthenticityIdentity(value["sourceReceiptId"], "source receipt id")
	if err != nil {
		return evaluationSourceReceipt{}, err
	}
	providerConfigurationID, err := evaluationAuthenticityIdentity(value["providerConfigurationId"], "provider configuration id")
	if err != nil {
		return evaluationSourceReceipt{}, err
	}
	modelLineageDigest, err := optionalEvaluationAuthenticityDigest(value, "modelLineageDigest")
	if err != nil {
		return evaluationSourceReceipt{}, err
	}
	providerRequestID, err := optionalEvaluationAuthenticityIdentity(value, "providerRequestId")
	if err != nil {
		return evaluationSourceReceipt{}, err
	}
	executionFailureAuthorityReceiptDigest, err := optionalEvaluationAuthenticityDigest(value, "executionFailureAuthorityReceiptDigest")
	if err != nil {
		return evaluationSourceReceipt{}, err
	}
	planDigest, err := evaluationAuthenticityDigest(value["planDigest"], "plan digest")
	if err != nil {
		return evaluationSourceReceipt{}, err
	}
	sourceContentDigest, err := evaluationAuthenticityDigest(value["sourceContentDigest"], "source content digest")
	if err != nil {
		return evaluationSourceReceipt{}, err
	}
	inputUsageDigest, err := optionalEvaluationAuthenticityDigest(value, "inputUsageDigest")
	if err != nil {
		return evaluationSourceReceipt{}, err
	}
	outputCostDigest, err := optionalEvaluationAuthenticityDigest(value, "outputCostDigest")
	if err != nil {
		return evaluationSourceReceipt{}, err
	}
	repositoryCommit, ok := value["repositoryCommit"].(string)
	if !ok || !evaluationRepositoryCommitPattern.MatchString(repositoryCommit) {
		return evaluationSourceReceipt{}, invalid("evaluation source receipt repository commit is invalid")
	}
	sourceURI := ""
	if raw, exists := value["sourceUri"]; exists {
		sourceURI, ok = raw.(string)
		if !ok || strings.TrimSpace(sourceURI) != sourceURI || sourceURI == "" || len(sourceURI) > 2_048 || evaluationAuthenticityCredentialPattern.MatchString(sourceURI) {
			return evaluationSourceReceipt{}, invalid("evaluation source URI is invalid")
		}
	}
	observedAt, err := evaluationInstant(value["observedAt"], "evaluation source observation")
	if err != nil {
		return evaluationSourceReceipt{}, err
	}
	sourceKind, _ := value["sourceKind"].(string)
	var pricingSnapshot map[string]any
	switch sourceKind {
	case "provider-reported-usage":
		if (providerRequestID == "") == (executionFailureAuthorityReceiptDigest == "") ||
			(executionFailureAuthorityReceiptDigest != "" && sourceURI == "") ||
			inputUsageDigest == "" || outputCostDigest != "" || value["pricingSnapshot"] != nil {
			return evaluationSourceReceipt{}, invalid("provider usage source receipt binding is invalid")
		}
	case "provider-reported-cost":
		if (providerRequestID == "") == (executionFailureAuthorityReceiptDigest == "") ||
			(executionFailureAuthorityReceiptDigest != "" && sourceURI == "") ||
			outputCostDigest == "" || inputUsageDigest != "" || value["pricingSnapshot"] != nil {
			return evaluationSourceReceipt{}, invalid("provider cost source receipt binding is invalid")
		}
	case "pricing-snapshot":
		pricingSnapshot, err = decodeEvaluationPricingSnapshot(value["pricingSnapshot"])
		if err != nil || sourceContentDigest != stringMember(pricingSnapshot, "snapshotDigest") ||
			providerConfigurationID != stringMember(pricingSnapshot, "providerConfigurationId") ||
			providerRequestID != "" || executionFailureAuthorityReceiptDigest != "" || inputUsageDigest != "" || outputCostDigest != "" {
			return evaluationSourceReceipt{}, invalid("pricing source receipt binding is invalid")
		}
	case "cost-calculation":
		pricingSnapshot, err = decodeEvaluationPricingSnapshot(value["pricingSnapshot"])
		if err != nil || inputUsageDigest == "" || outputCostDigest == "" ||
			providerConfigurationID != stringMember(pricingSnapshot, "providerConfigurationId") ||
			(providerRequestID == "") == (executionFailureAuthorityReceiptDigest == "") ||
			(executionFailureAuthorityReceiptDigest != "" && sourceURI == "") {
			return evaluationSourceReceipt{}, invalid("cost calculation source receipt binding is invalid")
		}
		base := map[string]any{
			"sourceKind": "cost-calculation", "providerConfigurationId": providerConfigurationID,
			"pricingSnapshotDigest": stringMember(pricingSnapshot, "snapshotDigest"),
			"inputUsageDigest":      inputUsageDigest, "outputCostDigest": outputCostDigest,
		}
		if modelLineageDigest != "" {
			base["modelLineageDigest"] = modelLineageDigest
		}
		if providerRequestID != "" {
			base["providerRequestId"] = providerRequestID
		}
		if executionFailureAuthorityReceiptDigest != "" {
			base["executionFailureAuthorityReceiptDigest"] = executionFailureAuthorityReceiptDigest
		}
		computed, digestErr := canonicaljson.Digest(base)
		if digestErr != nil || computed != sourceContentDigest {
			return evaluationSourceReceipt{}, invalid("cost calculation source content digest drifted")
		}
	default:
		return evaluationSourceReceipt{}, invalid("evaluation source kind is invalid")
	}
	receiptDigest, err := verifyEvaluationAuthenticityDigest(value, "receiptDigest")
	if err != nil {
		return evaluationSourceReceipt{}, err
	}
	return evaluationSourceReceipt{
		EvaluationSourceReceiptRecord: EvaluationSourceReceiptRecord{
			PlanDigest: planDigest, RepositoryCommit: repositoryCommit, SourceReceiptID: sourceReceiptID,
			SourceKind: sourceKind, ProviderConfigurationID: providerConfigurationID,
			ModelLineageDigest: modelLineageDigest, ProviderRequestID: providerRequestID,
			ExecutionFailureAuthorityReceiptDigest: executionFailureAuthorityReceiptDigest, SourceURI: sourceURI,
			SourceContentDigest: sourceContentDigest, ReceiptDigest: receiptDigest,
			ReceiptBytes: canonical, ObservedAt: observedAt,
		},
		PricingSnapshot: pricingSnapshot, InputUsageDigest: inputUsageDigest,
		OutputCostDigest: outputCostDigest, Value: value,
	}, nil
}

func decodeEvaluationExecutionReceipt(source []byte) (evaluationExecutionReceipt, error) {
	value, canonical, err := decodeEvaluationAuthenticityObject(source)
	if err != nil {
		return evaluationExecutionReceipt{}, err
	}
	if !exactEvaluationKeys(value, []string{
		"executionReceiptId", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest",
		"modelInvocations", "toolCalls", "repairRounds", "transactions", "artifactBytes", "elapsedMs",
		"capabilityExecutionReceiptSetDigest", "verificationAttemptGrantReceiptSetDigest",
		"receiptDigest",
	}, "toolReceiptSetDigest", "transactionReceiptSetDigest", "verificationClosureDigest") {
		return evaluationExecutionReceipt{}, invalid("evaluation execution receipt shape is invalid")
	}
	executionReceiptID, err := evaluationAuthenticityIdentity(value["executionReceiptId"], "execution receipt id")
	if err != nil {
		return evaluationExecutionReceipt{}, err
	}
	attemptID, err := evaluationAuthenticityIdentity(value["attemptId"], "attempt id")
	if err != nil {
		return evaluationExecutionReceipt{}, err
	}
	planDigest, err := evaluationAuthenticityDigest(value["planDigest"], "plan digest")
	if err != nil {
		return evaluationExecutionReceipt{}, err
	}
	descriptorDigest, err := evaluationAuthenticityDigest(value["descriptorDigest"], "descriptor digest")
	if err != nil {
		return evaluationExecutionReceipt{}, err
	}
	repositoryCommit, ok := value["repositoryCommit"].(string)
	if !ok || !evaluationRepositoryCommitPattern.MatchString(repositoryCommit) {
		return evaluationExecutionReceipt{}, invalid("evaluation execution repository commit is invalid")
	}
	counts := make([]int64, 6)
	for index, field := range []string{"modelInvocations", "toolCalls", "repairRounds", "transactions", "artifactBytes", "elapsedMs"} {
		counts[index], err = evaluationCount(value[field], "evaluation execution "+field)
		if err != nil {
			return evaluationExecutionReceipt{}, err
		}
	}
	toolReceiptSetDigest, err := optionalEvaluationAuthenticityDigest(value, "toolReceiptSetDigest")
	if err != nil {
		return evaluationExecutionReceipt{}, err
	}
	transactionReceiptSetDigest, err := optionalEvaluationAuthenticityDigest(value, "transactionReceiptSetDigest")
	if err != nil {
		return evaluationExecutionReceipt{}, err
	}
	verificationClosureDigest, err := optionalEvaluationAuthenticityDigest(value, "verificationClosureDigest")
	if err != nil {
		return evaluationExecutionReceipt{}, err
	}
	if (counts[1] > 0) != (toolReceiptSetDigest != "") ||
		(counts[3] > 0) != (transactionReceiptSetDigest != "") {
		return evaluationExecutionReceipt{}, invalid("evaluation execution receipt-set binding is invalid")
	}
	capabilityExecutionReceiptSetDigest, err := evaluationAuthenticityDigest(
		value["capabilityExecutionReceiptSetDigest"], "capability execution receipt set digest",
	)
	if err != nil {
		return evaluationExecutionReceipt{}, err
	}
	verificationAttemptGrantReceiptSetDigest, err := evaluationAuthenticityDigest(
		value["verificationAttemptGrantReceiptSetDigest"], "verification AttemptGrant receipt set digest",
	)
	if err != nil {
		return evaluationExecutionReceipt{}, err
	}
	receiptDigest, err := verifyEvaluationAuthenticityDigest(value, "receiptDigest")
	if err != nil {
		return evaluationExecutionReceipt{}, err
	}
	return evaluationExecutionReceipt{
		EvaluationExecutionReceiptRecord: EvaluationExecutionReceiptRecord{
			PlanDigest: planDigest, RepositoryCommit: repositoryCommit,
			ExecutionReceiptID: executionReceiptID, AttemptID: attemptID, DescriptorDigest: descriptorDigest,
			ModelInvocations: counts[0], ToolCalls: counts[1], RepairRounds: counts[2],
			Transactions: counts[3], ArtifactBytes: counts[4], ElapsedMS: counts[5],
			CapabilityExecutionReceiptSetDigest:      capabilityExecutionReceiptSetDigest,
			VerificationAttemptGrantReceiptSetDigest: verificationAttemptGrantReceiptSetDigest,
			ToolReceiptSetDigest:                     toolReceiptSetDigest, TransactionReceiptSetDigest: transactionReceiptSetDigest,
			VerificationClosureDigest: verificationClosureDigest, ReceiptDigest: receiptDigest, ReceiptBytes: canonical,
		},
		Value: value,
	}, nil
}

func decodeEvaluationAuthorityAttestation(source []byte) (evaluationAuthorityAttestation, error) {
	value, canonical, err := decodeEvaluationAuthenticityObject(source)
	if err != nil {
		return evaluationAuthorityAttestation{}, err
	}
	if !exactEvaluationKeys(value, []string{
		"format", "version", "authorityId", "keyId", "evidenceSetDigest", "planDigest",
		"capabilityProbeAdmissionSetDigest", "capabilityProbeReferenceReceiptSetDigest",
		"runtimeFactSourceOwnerRegistrationSetDigest", "capabilityProbeProviderResourceCleanupSetDigest",
		"hostedRetrievalRuntimeResourceLifecycleJournalSetDigest",
		"hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest",
		"hostedRetrievalRuntimeResourceCleanupSetDigest", "capabilityEffectProviderRuntimeJournalSetDigest",
		"optionalCapabilityFactSourceSetDigest",
		"optionalCapabilityFactAuthoritySetDigest",
		"endpointSmokeDispatchIntentSetDigest", "endpointSmokeTransportReceiptSetDigest",
		"endpointSmokeResultSpoolReceiptSetDigest", "endpointSmokeResultSpoolDispositionReceiptSetDigest",
		"endpointSmokeValidationFailureReceiptSetDigest",
		"endpointSmokeSetDigest", "preDispatchFailureReceiptSetDigest", "transportDispatchIntentSetDigest", "transportReceiptSetDigest",
		"providerResultSpoolReceiptSetDigest", "providerResultSpoolDispositionReceiptSetDigest",
		"invocationTurnReceiptSetDigest", "invocationTurnSetReceiptSetDigest", "resultSubmissionReceiptSetDigest",
		"attemptAuthorityOwnerReceiptSetDigest", "controlledRuntimeReceiptSetDigest", "capabilityExecutionReceiptSetDigest",
		"capabilitySpecificReceiptSetDigest", "providerCapabilityObservationReceiptSetDigest",
		"verificationAttemptGrantReceiptSetDigest", "validatedHumanReviewArtifactSetDigest",
		"validatedHumanMetricObservationSetDigest",
		"reviewRasterScanReceiptSetDigest", "reviewCandidateRefSetDigest", "blindReviewMappingSetDigest", "sourceReceiptSetDigest", "executionReceiptSetDigest",
		"holdoutExecutionReceiptDigest", "secretCanarySetDigest", "protectedHoldoutCanarySetDigest",
		"workflowName", "workflowRunId", "workflowRunAttempt", "jobId", "environmentDigest",
		"repositoryCommit", "issuedAt", "algorithm", "attestedPayloadDigest", "signature", "attestationDigest",
	}, "reviewLeaseDigest") {
		return evaluationAuthorityAttestation{}, invalid("evaluation authority attestation shape is invalid")
	}
	if value["format"] != "prodivix.agent-model-evaluation-evidence" || value["version"] != json.Number("3") || value["algorithm"] != "ed25519" {
		return evaluationAuthorityAttestation{}, invalid("evaluation authority attestation format is invalid")
	}
	authorityID, err := evaluationAuthenticityIdentity(value["authorityId"], "authority id")
	if err != nil {
		return evaluationAuthorityAttestation{}, err
	}
	keyID, err := evaluationAuthenticityIdentity(value["keyId"], "key id")
	if err != nil {
		return evaluationAuthorityAttestation{}, err
	}
	workflowName, err := evaluationAuthenticityIdentity(value["workflowName"], "workflow name")
	if err != nil {
		return evaluationAuthorityAttestation{}, err
	}
	workflowRunID, err := evaluationAuthenticityIdentity(value["workflowRunId"], "workflow run id")
	if err != nil {
		return evaluationAuthorityAttestation{}, err
	}
	jobID, err := evaluationAuthenticityIdentity(value["jobId"], "job id")
	if err != nil {
		return evaluationAuthorityAttestation{}, err
	}
	workflowRunAttempt, err := evaluationCount(value["workflowRunAttempt"], "evaluation workflow run attempt")
	if err != nil || workflowRunAttempt < 1 {
		return evaluationAuthorityAttestation{}, invalid("evaluation workflow run attempt is invalid")
	}
	repositoryCommit, ok := value["repositoryCommit"].(string)
	if !ok || !evaluationRepositoryCommitPattern.MatchString(repositoryCommit) {
		return evaluationAuthorityAttestation{}, invalid("evaluation authority repository commit is invalid")
	}
	digestFields := []string{
		"evidenceSetDigest", "planDigest", "capabilityProbeAdmissionSetDigest",
		"capabilityProbeReferenceReceiptSetDigest", "runtimeFactSourceOwnerRegistrationSetDigest",
		"capabilityProbeProviderResourceCleanupSetDigest",
		"hostedRetrievalRuntimeResourceLifecycleJournalSetDigest",
		"hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest",
		"hostedRetrievalRuntimeResourceCleanupSetDigest", "capabilityEffectProviderRuntimeJournalSetDigest",
		"optionalCapabilityFactSourceSetDigest", "optionalCapabilityFactAuthoritySetDigest",
		"endpointSmokeDispatchIntentSetDigest", "endpointSmokeTransportReceiptSetDigest",
		"endpointSmokeResultSpoolReceiptSetDigest", "endpointSmokeResultSpoolDispositionReceiptSetDigest",
		"endpointSmokeValidationFailureReceiptSetDigest", "endpointSmokeSetDigest",
		"preDispatchFailureReceiptSetDigest", "transportDispatchIntentSetDigest", "transportReceiptSetDigest",
		"providerResultSpoolReceiptSetDigest", "providerResultSpoolDispositionReceiptSetDigest",
		"invocationTurnReceiptSetDigest", "invocationTurnSetReceiptSetDigest", "resultSubmissionReceiptSetDigest",
		"attemptAuthorityOwnerReceiptSetDigest", "controlledRuntimeReceiptSetDigest", "capabilityExecutionReceiptSetDigest",
		"capabilitySpecificReceiptSetDigest", "providerCapabilityObservationReceiptSetDigest",
		"verificationAttemptGrantReceiptSetDigest", "validatedHumanReviewArtifactSetDigest",
		"validatedHumanMetricObservationSetDigest",
		"reviewRasterScanReceiptSetDigest", "reviewCandidateRefSetDigest", "blindReviewMappingSetDigest",
		"sourceReceiptSetDigest", "executionReceiptSetDigest", "holdoutExecutionReceiptDigest", "secretCanarySetDigest",
		"protectedHoldoutCanarySetDigest", "environmentDigest", "attestedPayloadDigest",
	}
	digests := make(map[string]string, len(digestFields))
	for _, field := range digestFields {
		digests[field], err = evaluationAuthenticityDigest(value[field], field)
		if err != nil {
			return evaluationAuthorityAttestation{}, err
		}
	}
	reviewLeaseDigest, err := optionalEvaluationAuthenticityDigest(value, "reviewLeaseDigest")
	if err != nil {
		return evaluationAuthorityAttestation{}, err
	}
	issuedAt, err := evaluationInstant(value["issuedAt"], "evaluation authority issuance")
	if err != nil {
		return evaluationAuthorityAttestation{}, err
	}
	signature, ok := value["signature"].(string)
	if !ok || len(signature) != 86 || !evaluationAuthenticityBase64URLPattern.MatchString(signature) ||
		!evaluationCanonicalBase64URL(signature, 64) {
		return evaluationAuthorityAttestation{}, invalid("evaluation authority signature is invalid")
	}
	payload := make(map[string]any, len(value)-4)
	for key, entry := range value {
		if key != "algorithm" && key != "attestedPayloadDigest" && key != "signature" && key != "attestationDigest" {
			payload[key] = entry
		}
	}
	payloadDigest, err := canonicaljson.Digest(payload)
	if err != nil || payloadDigest != digests["attestedPayloadDigest"] {
		return evaluationAuthorityAttestation{}, invalid("evaluation authority payload digest drifted")
	}
	attestationDigest, err := verifyEvaluationAuthenticityDigest(value, "attestationDigest")
	if err != nil {
		return evaluationAuthorityAttestation{}, err
	}
	payloadBytes, err := canonicaljson.Bytes(payload)
	if err != nil {
		return evaluationAuthorityAttestation{}, err
	}
	return evaluationAuthorityAttestation{
		EvaluationAuthorityAttestationRecord: EvaluationAuthorityAttestationRecord{
			PlanDigest: digests["planDigest"], RepositoryCommit: repositoryCommit,
			AuthorityID: authorityID, KeyID: keyID, EvidenceSetDigest: digests["evidenceSetDigest"],
			CapabilityProbeAdmissionSetDigest:                                    digests["capabilityProbeAdmissionSetDigest"],
			CapabilityProbeReferenceReceiptSetDigest:                             digests["capabilityProbeReferenceReceiptSetDigest"],
			RuntimeFactSourceOwnerRegistrationSetDigest:                          digests["runtimeFactSourceOwnerRegistrationSetDigest"],
			CapabilityProbeProviderResourceCleanupSetDigest:                      digests["capabilityProbeProviderResourceCleanupSetDigest"],
			HostedRetrievalRuntimeResourceLifecycleJournalSetDigest:              digests["hostedRetrievalRuntimeResourceLifecycleJournalSetDigest"],
			HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest: digests["hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest"],
			HostedRetrievalRuntimeResourceCleanupSetDigest:                       digests["hostedRetrievalRuntimeResourceCleanupSetDigest"],
			CapabilityEffectProviderRuntimeJournalSetDigest:                      digests["capabilityEffectProviderRuntimeJournalSetDigest"],
			OptionalCapabilityFactSourceSetDigest:                                digests["optionalCapabilityFactSourceSetDigest"],
			OptionalCapabilityFactAuthoritySetDigest:                             digests["optionalCapabilityFactAuthoritySetDigest"],
			EndpointSmokeDispatchIntentSetDigest:                                 digests["endpointSmokeDispatchIntentSetDigest"],
			EndpointSmokeTransportReceiptSetDigest:                               digests["endpointSmokeTransportReceiptSetDigest"],
			EndpointSmokeResultSpoolReceiptSetDigest:                             digests["endpointSmokeResultSpoolReceiptSetDigest"],
			EndpointSmokeResultSpoolDispositionReceiptSetDigest:                  digests["endpointSmokeResultSpoolDispositionReceiptSetDigest"],
			EndpointSmokeValidationFailureReceiptSetDigest:                       digests["endpointSmokeValidationFailureReceiptSetDigest"],
			EndpointSmokeSetDigest:                                               digests["endpointSmokeSetDigest"],
			PreDispatchFailureReceiptSetDigest:                                   digests["preDispatchFailureReceiptSetDigest"],
			TransportDispatchIntentSetDigest:                                     digests["transportDispatchIntentSetDigest"],
			TransportReceiptSetDigest:                                            digests["transportReceiptSetDigest"],
			ProviderResultSpoolReceiptSetDigest:                                  digests["providerResultSpoolReceiptSetDigest"],
			ProviderResultSpoolDispositionReceiptSetDigest:                       digests["providerResultSpoolDispositionReceiptSetDigest"],
			InvocationTurnReceiptSetDigest:                                       digests["invocationTurnReceiptSetDigest"],
			InvocationTurnSetReceiptSetDigest:                                    digests["invocationTurnSetReceiptSetDigest"],
			ResultSubmissionReceiptSetDigest:                                     digests["resultSubmissionReceiptSetDigest"],
			AttemptAuthorityOwnerReceiptSetDigest:                                digests["attemptAuthorityOwnerReceiptSetDigest"],
			ControlledRuntimeReceiptSetDigest:                                    digests["controlledRuntimeReceiptSetDigest"],
			CapabilityExecutionReceiptSetDigest:                                  digests["capabilityExecutionReceiptSetDigest"],
			CapabilitySpecificReceiptSetDigest:                                   digests["capabilitySpecificReceiptSetDigest"],
			ProviderCapabilityObservationReceiptSetDigest:                        digests["providerCapabilityObservationReceiptSetDigest"],
			VerificationAttemptGrantReceiptSetDigest:                             digests["verificationAttemptGrantReceiptSetDigest"],
			ValidatedHumanReviewArtifactSetDigest:                                digests["validatedHumanReviewArtifactSetDigest"],
			ValidatedHumanMetricObservationSetDigest:                             digests["validatedHumanMetricObservationSetDigest"],
			ReviewLeaseDigest:                                                    reviewLeaseDigest,
			ReviewRasterScanReceiptSetDigest:                                     digests["reviewRasterScanReceiptSetDigest"],
			ReviewCandidateRefSetDigest:                                          digests["reviewCandidateRefSetDigest"],
			BlindReviewMappingSetDigest:                                          digests["blindReviewMappingSetDigest"],
			SourceReceiptSetDigest:                                               digests["sourceReceiptSetDigest"], ExecutionReceiptSetDigest: digests["executionReceiptSetDigest"],
			HoldoutExecutionReceiptDigest: digests["holdoutExecutionReceiptDigest"], SecretCanarySetDigest: digests["secretCanarySetDigest"],
			ProtectedHoldoutCanarySetDigest: digests["protectedHoldoutCanarySetDigest"], AttestationDigest: attestationDigest,
			AttestationBytes: canonical, IssuedAt: issuedAt,
		},
		HoldoutExecutionReceiptDigest:   digests["holdoutExecutionReceiptDigest"],
		SecretCanarySetDigest:           digests["secretCanarySetDigest"],
		ProtectedHoldoutCanarySetDigest: digests["protectedHoldoutCanarySetDigest"],
		WorkflowName:                    workflowName, WorkflowRunID: workflowRunID, WorkflowRunAttempt: workflowRunAttempt,
		JobID: jobID, EnvironmentDigest: digests["environmentDigest"],
		AttestedPayloadDigest: digests["attestedPayloadDigest"], AttestedPayloadBytes: payloadBytes,
		Signature: signature, Value: value,
	}, nil
}

func decodeEvaluationEvidenceRoot(source []byte) (evaluationEvidenceRoot, error) {
	value, canonical, err := decodeEvaluationAuthenticityObject(source)
	if err != nil {
		return evaluationEvidenceRoot{}, err
	}
	if !exactEvaluationKeys(value, []string{
		"format", "version", "rootId", "planDigest", "repositoryCommit", "evidenceSetDigest",
		"capabilityProbeAdmissionSetDigest", "capabilityProbeReferenceReceiptSetDigest",
		"runtimeFactSourceOwnerRegistrationSetDigest", "capabilityProbeProviderResourceCleanupSetDigest",
		"hostedRetrievalRuntimeResourceLifecycleJournalSetDigest",
		"hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest",
		"hostedRetrievalRuntimeResourceCleanupSetDigest", "capabilityEffectProviderRuntimeJournalSetDigest",
		"optionalCapabilityFactSourceSetDigest",
		"optionalCapabilityFactAuthoritySetDigest",
		"endpointSmokeDispatchIntentSetDigest", "endpointSmokeTransportReceiptSetDigest",
		"endpointSmokeResultSpoolReceiptSetDigest", "endpointSmokeResultSpoolDispositionReceiptSetDigest",
		"endpointSmokeValidationFailureReceiptSetDigest",
		"endpointSmokeSetDigest", "preDispatchFailureReceiptSetDigest", "transportDispatchIntentSetDigest", "transportReceiptSetDigest",
		"providerResultSpoolReceiptSetDigest", "providerResultSpoolDispositionReceiptSetDigest",
		"invocationTurnReceiptSetDigest", "invocationTurnSetReceiptSetDigest", "resultSubmissionReceiptSetDigest",
		"attemptAuthorityOwnerReceiptSetDigest", "controlledRuntimeReceiptSetDigest", "capabilityExecutionReceiptSetDigest",
		"capabilitySpecificReceiptSetDigest", "providerCapabilityObservationReceiptSetDigest",
		"verificationAttemptGrantReceiptSetDigest", "validatedHumanReviewArtifactSetDigest",
		"validatedHumanMetricObservationSetDigest",
		"reviewRasterScanReceiptSetDigest", "reviewCandidateRefSetDigest", "blindReviewMappingSetDigest", "sourceReceiptSetDigest", "executionReceiptSetDigest",
		"holdoutExecutionReceiptDigest", "secretCanarySetDigest", "protectedHoldoutCanarySetDigest",
		"authorityAttestationDigest", "evaluationManifestDigest", "bundleDigest", "bundleArtifactDigest",
		"bundleArtifactSize", "recordedAt", "rootDigest",
	}, "reviewLeaseDigest") || value["format"] != "prodivix.agent-model-evaluation-evidence-root" || value["version"] != json.Number("1") {
		return evaluationEvidenceRoot{}, invalid("evaluation evidence root shape or format is invalid")
	}
	rootID, err := evaluationAuthenticityIdentity(value["rootId"], "root id")
	if err != nil {
		return evaluationEvidenceRoot{}, err
	}
	repositoryCommit, ok := value["repositoryCommit"].(string)
	if !ok || !evaluationRepositoryCommitPattern.MatchString(repositoryCommit) {
		return evaluationEvidenceRoot{}, invalid("evaluation evidence root repository commit is invalid")
	}
	digestFields := []string{
		"planDigest", "evidenceSetDigest", "capabilityProbeAdmissionSetDigest",
		"capabilityProbeReferenceReceiptSetDigest", "runtimeFactSourceOwnerRegistrationSetDigest",
		"capabilityProbeProviderResourceCleanupSetDigest",
		"hostedRetrievalRuntimeResourceLifecycleJournalSetDigest",
		"hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest",
		"hostedRetrievalRuntimeResourceCleanupSetDigest", "capabilityEffectProviderRuntimeJournalSetDigest",
		"optionalCapabilityFactSourceSetDigest", "optionalCapabilityFactAuthoritySetDigest",
		"endpointSmokeDispatchIntentSetDigest", "endpointSmokeTransportReceiptSetDigest",
		"endpointSmokeResultSpoolReceiptSetDigest", "endpointSmokeResultSpoolDispositionReceiptSetDigest",
		"endpointSmokeValidationFailureReceiptSetDigest", "endpointSmokeSetDigest",
		"preDispatchFailureReceiptSetDigest", "transportDispatchIntentSetDigest", "transportReceiptSetDigest",
		"providerResultSpoolReceiptSetDigest", "providerResultSpoolDispositionReceiptSetDigest",
		"invocationTurnReceiptSetDigest", "invocationTurnSetReceiptSetDigest", "resultSubmissionReceiptSetDigest",
		"attemptAuthorityOwnerReceiptSetDigest", "controlledRuntimeReceiptSetDigest", "capabilityExecutionReceiptSetDigest",
		"capabilitySpecificReceiptSetDigest", "providerCapabilityObservationReceiptSetDigest",
		"verificationAttemptGrantReceiptSetDigest", "validatedHumanReviewArtifactSetDigest",
		"validatedHumanMetricObservationSetDigest",
		"reviewRasterScanReceiptSetDigest", "reviewCandidateRefSetDigest", "blindReviewMappingSetDigest",
		"sourceReceiptSetDigest", "executionReceiptSetDigest", "authorityAttestationDigest", "evaluationManifestDigest",
		"holdoutExecutionReceiptDigest", "secretCanarySetDigest", "protectedHoldoutCanarySetDigest", "bundleDigest", "bundleArtifactDigest",
	}
	digests := make(map[string]string, len(digestFields))
	for _, field := range digestFields {
		digests[field], err = evaluationAuthenticityDigest(value[field], field)
		if err != nil {
			return evaluationEvidenceRoot{}, err
		}
	}
	reviewLeaseDigest, err := optionalEvaluationAuthenticityDigest(value, "reviewLeaseDigest")
	if err != nil {
		return evaluationEvidenceRoot{}, err
	}
	bundleArtifactSize, err := evaluationCount(value["bundleArtifactSize"], "evaluation bundle artifact size")
	if err != nil || bundleArtifactSize < 1 || bundleArtifactSize > maximumEvaluationBundleArtifactBytes {
		return evaluationEvidenceRoot{}, invalid("evaluation bundle artifact size is invalid")
	}
	recordedAt, err := evaluationInstant(value["recordedAt"], "evaluation evidence root time")
	if err != nil {
		return evaluationEvidenceRoot{}, err
	}
	rootDigest, err := verifyEvaluationAuthenticityDigest(value, "rootDigest")
	if err != nil {
		return evaluationEvidenceRoot{}, err
	}
	return evaluationEvidenceRoot{
		EvaluationEvidenceRootRecord: EvaluationEvidenceRootRecord{
			PlanDigest: digests["planDigest"], RepositoryCommit: repositoryCommit, RootID: rootID,
			CapabilityProbeAdmissionSetDigest:                                    digests["capabilityProbeAdmissionSetDigest"],
			CapabilityProbeReferenceReceiptSetDigest:                             digests["capabilityProbeReferenceReceiptSetDigest"],
			RuntimeFactSourceOwnerRegistrationSetDigest:                          digests["runtimeFactSourceOwnerRegistrationSetDigest"],
			CapabilityProbeProviderResourceCleanupSetDigest:                      digests["capabilityProbeProviderResourceCleanupSetDigest"],
			HostedRetrievalRuntimeResourceLifecycleJournalSetDigest:              digests["hostedRetrievalRuntimeResourceLifecycleJournalSetDigest"],
			HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest: digests["hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest"],
			HostedRetrievalRuntimeResourceCleanupSetDigest:                       digests["hostedRetrievalRuntimeResourceCleanupSetDigest"],
			CapabilityEffectProviderRuntimeJournalSetDigest:                      digests["capabilityEffectProviderRuntimeJournalSetDigest"],
			OptionalCapabilityFactSourceSetDigest:                                digests["optionalCapabilityFactSourceSetDigest"],
			OptionalCapabilityFactAuthoritySetDigest:                             digests["optionalCapabilityFactAuthoritySetDigest"],
			EndpointSmokeDispatchIntentSetDigest:                                 digests["endpointSmokeDispatchIntentSetDigest"],
			EndpointSmokeTransportReceiptSetDigest:                               digests["endpointSmokeTransportReceiptSetDigest"],
			EndpointSmokeResultSpoolReceiptSetDigest:                             digests["endpointSmokeResultSpoolReceiptSetDigest"],
			EndpointSmokeResultSpoolDispositionReceiptSetDigest:                  digests["endpointSmokeResultSpoolDispositionReceiptSetDigest"],
			EndpointSmokeValidationFailureReceiptSetDigest:                       digests["endpointSmokeValidationFailureReceiptSetDigest"],
			EvidenceSetDigest: digests["evidenceSetDigest"], EndpointSmokeSetDigest: digests["endpointSmokeSetDigest"],
			PreDispatchFailureReceiptSetDigest: digests["preDispatchFailureReceiptSetDigest"],
			TransportDispatchIntentSetDigest:   digests["transportDispatchIntentSetDigest"], TransportReceiptSetDigest: digests["transportReceiptSetDigest"],
			ProviderResultSpoolReceiptSetDigest:            digests["providerResultSpoolReceiptSetDigest"],
			ProviderResultSpoolDispositionReceiptSetDigest: digests["providerResultSpoolDispositionReceiptSetDigest"],
			InvocationTurnReceiptSetDigest:                 digests["invocationTurnReceiptSetDigest"], InvocationTurnSetReceiptSetDigest: digests["invocationTurnSetReceiptSetDigest"],
			ResultSubmissionReceiptSetDigest: digests["resultSubmissionReceiptSetDigest"], ControlledRuntimeReceiptSetDigest: digests["controlledRuntimeReceiptSetDigest"],
			AttemptAuthorityOwnerReceiptSetDigest:         digests["attemptAuthorityOwnerReceiptSetDigest"],
			CapabilityExecutionReceiptSetDigest:           digests["capabilityExecutionReceiptSetDigest"],
			CapabilitySpecificReceiptSetDigest:            digests["capabilitySpecificReceiptSetDigest"],
			ProviderCapabilityObservationReceiptSetDigest: digests["providerCapabilityObservationReceiptSetDigest"],
			VerificationAttemptGrantReceiptSetDigest:      digests["verificationAttemptGrantReceiptSetDigest"],
			ValidatedHumanReviewArtifactSetDigest:         digests["validatedHumanReviewArtifactSetDigest"],
			ValidatedHumanMetricObservationSetDigest:      digests["validatedHumanMetricObservationSetDigest"],
			ReviewLeaseDigest:                             reviewLeaseDigest,
			ReviewRasterScanReceiptSetDigest:              digests["reviewRasterScanReceiptSetDigest"],
			ReviewCandidateRefSetDigest:                   digests["reviewCandidateRefSetDigest"], SourceReceiptSetDigest: digests["sourceReceiptSetDigest"],
			BlindReviewMappingSetDigest: digests["blindReviewMappingSetDigest"],
			ExecutionReceiptSetDigest:   digests["executionReceiptSetDigest"], HoldoutExecutionReceiptDigest: digests["holdoutExecutionReceiptDigest"],
			SecretCanarySetDigest: digests["secretCanarySetDigest"], ProtectedHoldoutCanarySetDigest: digests["protectedHoldoutCanarySetDigest"],
			AuthorityAttestationDigest: digests["authorityAttestationDigest"], EvaluationManifestDigest: digests["evaluationManifestDigest"],
			BundleDigest: digests["bundleDigest"], BundleArtifactDigest: digests["bundleArtifactDigest"],
			BundleArtifactSize: bundleArtifactSize, RootDigest: rootDigest, RootBytes: canonical, RecordedAt: recordedAt,
		},
		Value: value,
	}, nil
}

func oneOfString(value string, allowed ...string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}

func sameEvaluationCanonicalValue(left, right any) bool {
	leftBytes, leftErr := canonicaljson.Bytes(left)
	rightBytes, rightErr := canonicaljson.Bytes(right)
	return leftErr == nil && rightErr == nil && bytes.Equal(leftBytes, rightBytes)
}

func evaluationAuthenticityError(scope string, err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%s: %w", scope, err)
}
