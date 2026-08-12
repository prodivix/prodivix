package agent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationOptionalFactAuthorityRequestFormat      = "prodivix.agent-evaluation-optional-capability-fact-authority-request"
	evaluationOptionalFactAuthorityStageFormat        = "prodivix.agent-evaluation-optional-capability-fact-authority-stage"
	evaluationOptionalFactAuthorityAckFormat          = "prodivix.agent-evaluation-optional-capability-fact-authority-dispatch-ack"
	evaluationOptionalFactAuthorityResponseFormat     = "prodivix.agent-evaluation-optional-capability-fact-authority-response"
	evaluationOptionalFactSourceReceiptFormat         = "prodivix.agent-evaluation-optional-capability-fact-source-seal-receipt"
	evaluationOptionalFactAuthorityStageRequestFormat = "prodivix.agent-evaluation-optional-capability-fact-authority-stage-request"

	evaluationOptionalFactRuntimeEnvelopeFormat = "prodivix.agent-evaluation-provider-capability-runtime-fact-envelope"
	evaluationOptionalFactAuthorityFormat       = "prodivix.agent-evaluation-provider-capability-fact-authority"

	maximumEvaluationOptionalFactAuthorityWireBytes       = 65_536
	maximumEvaluationOptionalFactAuthorityRequestBytes    = 65_536
	maximumEvaluationOptionalFactAuthorityResponseBytes   = 65_536
	maximumEvaluationOptionalFactAuthorityEnvelopeBytes   = 16_384
	maximumEvaluationOptionalFactAuthorityTurns           = 7
	maximumEvaluationOptionalFactAuthorityRecords         = 5_880
	maximumEvaluationOptionalFactArchiveRecordOverhead    = 4_096
	maximumEvaluationOptionalFactSourceArchiveRecordBytes = maximumEvaluationOptionalFactAuthorityResponseBytes +
		2*maximumEvaluationNativeOptionalBootstrapBytes + 2*maximumEvaluationNativeOptionalSourceBytes +
		maximumEvaluationOptionalFactArchiveRecordOverhead
	maximumEvaluationOptionalFactAuthorityArchiveRecordBytes = maximumEvaluationOptionalFactAuthorityRequestBytes +
		3*maximumEvaluationOptionalFactAuthorityEnvelopeBytes + maximumEvaluationOptionalFactAuthorityResponseBytes +
		maximumEvaluationOptionalFactArchiveRecordOverhead
	maximumEvaluationOptionalFactSourceArchiveBytes = int64(maximumEvaluationOptionalFactAuthorityRecords) *
		maximumEvaluationOptionalFactSourceArchiveRecordBytes
	maximumEvaluationOptionalFactAuthorityArchiveBytes = int64(maximumEvaluationOptionalFactAuthorityRecords) *
		maximumEvaluationOptionalFactAuthorityArchiveRecordBytes
	maximumEvaluationOptionalFactCombinedArchiveBytes = maximumEvaluationOptionalFactSourceArchiveBytes + maximumEvaluationOptionalFactAuthorityArchiveBytes
)

type evaluationOptionalFactAuthoritySource struct {
	Kind                               string
	OwnerRequestDigest                 string
	OwnerReceiptDigest                 string
	EffectSourceReceiptDigest          string
	NativeBootstrapSourceRequestDigest string
}

type evaluationOptionalFactAuthorityRequest struct {
	AttemptID                  string
	DescriptorDigest           string
	TargetID                   string
	TargetDigest               string
	CapabilityProfileID        string
	CapabilityProfileDigest    string
	CapabilityDescriptorDigest string
	CapabilityID               string
	SupportExpectation         string
	TurnIndex                  int64
	InvocationID               string
	ProtocolFamily             string
	ProviderConfigurationID    string
	ModelID                    string
	ModelLineageDigest         string
	AdapterDigest              string
	ProviderRequestDigest      string
	ResponseDigest             string
	DispatchIntentDigest       string
	TransportReceiptDigest     string
	ResultSpoolReceiptDigest   string
	NormalizedEventSetDigest   string
	Source                     evaluationOptionalFactAuthoritySource
	AuthorityRequestDigest     string
	RequestBytes               []byte
	Value                      map[string]any
}

// EvaluationOptionalFactTargetAuthority is derived from the frozen plan. A
// caller cannot choose the shared-durable source identity or implementation.
type EvaluationOptionalFactTargetAuthority struct {
	TargetID                                      string
	TargetDigest                                  string
	CapabilityProfileID                           string
	CapabilityProfileDigest                       string
	CapabilityDescriptorDigest                    string
	CapabilityID                                  string
	SupportExpectation                            string
	ProtocolFamily                                string
	ProviderConfigurationID                       string
	ModelID                                       string
	ModelLineageDigest                            string
	AdapterDigest                                 string
	SourceKind                                    string
	SourceAuthorityID                             string
	SourceAuthorityImplementationDigest           string
	SourceAuthorityRouteBinding                   string
	RegistrationAuthorityIssuerID                 string
	RegistrationReceiptDigest                     string
	HostedRuntimeResourceRegistrationIntentDigest string
	TargetAuthorityDigest                         string
}

// EvaluationOptionalFactSourceEvidence is constructed only after repository
// joins the outer turn's three sealed transport rows, the shared-effect journal
// response, and its immutable capability-runtime owner receipt. Request,
// response, and dispatch remain outer-turn bindings; transport, spool, and
// normalized roots come from the sealed effect receipt. Fact is nil when the
// sealed effect source reports unavailable or failed.
type EvaluationOptionalFactSourceEvidence struct {
	Target                                   EvaluationOptionalFactTargetAuthority
	Kind                                     string
	SourceDigest                             string
	OwnerRequestDigest                       string
	OwnerReceiptDigest                       string
	OwnerStageDigest                         string
	OwnerDispatchAckDigest                   string
	PreEffectIntentDigest                    string
	EffectSourceReceiptDigest                string
	ProviderRuntimeJournalResultRecordDigest string
	ProviderRuntimeResultSealReceiptDigest   string
	EffectSourceFactDigest                   string
	NativeBootstrapSourceRequestDigest       string
	NativeBootstrapSourceReceiptDigest       string
	NativeProviderSourceReceiptDigest        string
	NativeProviderSourceDigest               string
	PreEffectIntentBytes                     []byte
	EffectSourceReceiptBytes                 []byte
	NativeBootstrapSourceRequestBytes        []byte
	NativeProviderSourceReceiptBytes         []byte
	BusinessResultDigest                     string
	Outcome                                  string
	FactKind                                 string
	FactDigest                               string
	Fact                                     map[string]any
	ObservedAt                               time.Time
	NativeBootstrapSealedAt                  time.Time
}

// EvaluationOptionalFactSourceRecord is the one-per-turn sealed source. It
// retains the bounded explicit effect fact plus canonical intent/receipt
// commitments; the full business result remains in the sealed owner journal.
type EvaluationOptionalFactSourceRecord struct {
	NamespaceID                              string
	PlanDigest                               string
	RepositoryCommit                         string
	AttemptID                                string
	DescriptorDigest                         string
	TargetID                                 string
	TargetDigest                             string
	CapabilityProfileID                      string
	CapabilityProfileDigest                  string
	CapabilityDescriptorDigest               string
	CapabilityID                             string
	SupportExpectation                       string
	TurnIndex                                int64
	InvocationID                             string
	ProtocolFamily                           string
	ProviderConfigurationID                  string
	ModelID                                  string
	ModelLineageDigest                       string
	AdapterDigest                            string
	ProviderRequestDigest                    string
	ResponseDigest                           string
	DispatchIntentDigest                     string
	TransportReceiptDigest                   string
	ResultSpoolReceiptDigest                 string
	NormalizedEventSetDigest                 string
	TargetAuthorityDigest                    string
	SourceAuthorityID                        string
	SourceAuthorityImplementationDigest      string
	SourceAuthorityRouteBinding              string
	RegistrationAuthorityIssuerID            string
	RegistrationReceiptDigest                string
	SourceKind                               string
	SourceDigest                             string
	OwnerRequestDigest                       string
	OwnerReceiptDigest                       string
	OwnerStageDigest                         string
	OwnerDispatchAckDigest                   string
	PreEffectIntentDigest                    string
	EffectSourceReceiptDigest                string
	ProviderRuntimeJournalResultRecordDigest string
	ProviderRuntimeResultSealReceiptDigest   string
	EffectSourceFactDigest                   string
	BusinessResultDigest                     string
	NativeBootstrapSourceRequestDigest       string
	NativeBootstrapSourceReceiptDigest       string
	NativeProviderSourceReceiptDigest        string
	NativeProviderSourceDigest               string
	Outcome                                  string
	FactKind                                 string
	FactDigest                               string
	SourceRequestDigest                      string
	SourceSealDigest                         string
	V46Eligible                              bool
	RequestBytes                             []byte
	PreEffectIntentBytes                     []byte
	EffectSourceReceiptBytes                 []byte
	NativeBootstrapSourceRequestBytes        []byte
	NativeProviderSourceReceiptBytes         []byte
	FactBytes                                []byte
	ReceiptBytes                             []byte
	ObservedAt                               time.Time
	SealedAt                                 time.Time
}

type evaluationOptionalFactAuthorityStageRequest struct {
	PlanDigest             string
	RepositoryCommit       string
	AttemptID              string
	DescriptorDigest       string
	TurnIndex              int64
	SourceSealDigest       string
	AuthorityRequestDigest string
	RequestBytes           []byte
}

// EvaluationOptionalFactAuthorityRecord is the bounded raw authority family
// exported by the archive. RequestBytes, response bytes, the selected fact,
// runtime envelope, and fact authority are canonical bytes.
type EvaluationOptionalFactAuthorityRecord struct {
	NamespaceID                         string
	PlanDigest                          string
	RepositoryCommit                    string
	AttemptID                           string
	DescriptorDigest                    string
	TargetID                            string
	TargetDigest                        string
	CapabilityProfileID                 string
	CapabilityProfileDigest             string
	CapabilityDescriptorDigest          string
	CapabilityID                        string
	SupportExpectation                  string
	TurnIndex                           int64
	InvocationID                        string
	ProtocolFamily                      string
	ProviderConfigurationID             string
	ModelID                             string
	ModelLineageDigest                  string
	AdapterDigest                       string
	ProviderRequestDigest               string
	ResponseDigest                      string
	DispatchIntentDigest                string
	TransportReceiptDigest              string
	ResultSpoolReceiptDigest            string
	NormalizedEventSetDigest            string
	TargetAuthorityDigest               string
	SourceAuthorityID                   string
	SourceAuthorityImplementationDigest string
	SourceAuthorityRouteBinding         string
	SourceRegistrationAuthorityIssuerID string
	SourceRegistrationReceiptDigest     string
	SourceKind                          string
	SourceDigest                        string
	SourceSealDigest                    string
	SourceOwnerRequestDigest            string
	SourceOwnerReceiptDigest            string
	SourceOwnerStageDigest              string
	SourceOwnerDispatchAckDigest        string
	SourcePreEffectIntentDigest         string
	SourceEffectReceiptDigest           string
	SourceEffectFactDigest              string
	SourceBusinessResultDigest          string
	AuthorityRequestDigest              string
	State                               string
	ClaimGeneration                     int64
	V46Eligible                         bool
	StageDigest                         string
	Outcome                             string
	FactKind                            string
	FactDigest                          string
	DispatchAckDigest                   string
	RuntimeFactEnvelopeDigest           string
	FactAuthorityDigest                 string
	ResultDigest                        string
	RequestBytes                        []byte
	FactBytes                           []byte
	RuntimeFactEnvelopeBytes            []byte
	FactAuthorityBytes                  []byte
	ResponseBytes                       []byte
	StagedAt                            time.Time
	SealedAt                            time.Time
}

func evaluationOptionalFactNullableDigest(value map[string]any, field string) (string, error) {
	raw, exists := value[field]
	if !exists {
		return "", ErrInvalid
	}
	if raw == nil {
		return "", nil
	}
	digest, ok := raw.(string)
	if !ok || !evaluationDigestPattern.MatchString(digest) {
		return "", ErrInvalid
	}
	return digest, nil
}

func evaluationOptionalFactNullableDigestValue(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func evaluationOptionalFactKind(capabilityID string) string {
	switch capabilityID {
	case "provider.background-job":
		return "provider-job-receipt"
	case "provider.hosted-retrieval":
		return "retrieval-query-receipt"
	case "provider.isolated-cache":
		return "provider-cache-receipt"
	case "provider.reasoning-continuation":
		return "opaque-continuation"
	default:
		return ""
	}
}

func evaluationOptionalFactAuthorityRequestProjection(
	value map[string]any,
	source evaluationOptionalFactAuthoritySource,
) (map[string]any, error) {
	projection := cloneEvaluationObject(value)
	switch source.Kind {
	case "sealed-provider-response-metadata":
		if source.NativeBootstrapSourceRequestDigest != "" && source.OwnerRequestDigest == "" &&
			source.OwnerReceiptDigest == "" && source.EffectSourceReceiptDigest == "" {
			projection["source"] = map[string]any{
				"kind": source.Kind, "nativeBootstrapSourceRequestDigest": source.NativeBootstrapSourceRequestDigest,
			}
			break
		}
		fallthrough
	case "sealed-hosted-owner-result":
		projection["source"] = map[string]any{
			"kind": source.Kind, "ownerRequestDigest": source.OwnerRequestDigest,
			"ownerReceiptDigest":        source.OwnerReceiptDigest,
			"effectSourceReceiptDigest": source.EffectSourceReceiptDigest,
		}
	default:
		return nil, ErrInvalid
	}
	return projection, nil
}

func decodeEvaluationOptionalFactAuthorityRequest(source []byte) (evaluationOptionalFactAuthorityRequest, error) {
	value, _, err := decodeEvaluationJSONObject(source, maximumEvaluationOptionalFactAuthorityWireBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "attemptId", "descriptorDigest", "targetId", "targetDigest",
		"capabilityProfileId", "capabilityProfileDigest", "capabilityDescriptorDigest",
		"capabilityId", "supportExpectation", "turnIndex", "invocationId", "protocolFamily",
		"providerConfigurationId", "modelId", "modelLineageDigest", "adapterDigest",
		"providerRequestDigest", "responseDigest", "dispatchIntentDigest", "transportReceiptDigest",
		"resultSpoolReceiptDigest", "normalizedEventSetDigest", "source",
	}) || stringMember(value, "format") != evaluationOptionalFactAuthorityRequestFormat {
		return evaluationOptionalFactAuthorityRequest{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	turn, turnOK := integerMember(value, "turnIndex")
	resultSpoolReceiptDigest, resultSpoolErr := evaluationOptionalFactNullableDigest(value, "resultSpoolReceiptDigest")
	if !versionOK || version != 1 || !turnOK || turn < 0 || turn >= maximumEvaluationOptionalFactAuthorityTurns ||
		resultSpoolErr != nil {
		return evaluationOptionalFactAuthorityRequest{}, ErrInvalid
	}
	for _, field := range []string{
		"attemptId", "targetId", "capabilityProfileId", "capabilityId", "invocationId",
		"providerConfigurationId", "modelId",
	} {
		if !validEvaluationAgentControlIdentity(stringMember(value, field)) {
			return evaluationOptionalFactAuthorityRequest{}, ErrInvalid
		}
	}
	for _, field := range []string{
		"descriptorDigest", "targetDigest", "capabilityProfileDigest", "capabilityDescriptorDigest",
		"modelLineageDigest", "adapterDigest", "providerRequestDigest", "responseDigest",
		"dispatchIntentDigest", "transportReceiptDigest", "normalizedEventSetDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return evaluationOptionalFactAuthorityRequest{}, ErrInvalid
		}
	}
	if !oneOfString(stringMember(value, "supportExpectation"), "required", "expected-blocked") ||
		!oneOfString(stringMember(value, "protocolFamily"), "openai-responses", "anthropic-messages", "gemini-interactions") ||
		evaluationOptionalFactKind(stringMember(value, "capabilityId")) == "" {
		return evaluationOptionalFactAuthorityRequest{}, ErrInvalid
	}
	sourceValue, ok := objectMember(value, "source")
	if !ok {
		return evaluationOptionalFactAuthorityRequest{}, ErrInvalid
	}
	decodedSource := evaluationOptionalFactAuthoritySource{Kind: stringMember(sourceValue, "kind")}
	switch decodedSource.Kind {
	case "sealed-provider-response-metadata":
		if exactEvaluationKeys(sourceValue, []string{"kind", "nativeBootstrapSourceRequestDigest"}) {
			if turn != 0 || !evaluationDigestPattern.MatchString(stringMember(sourceValue, "nativeBootstrapSourceRequestDigest")) {
				return evaluationOptionalFactAuthorityRequest{}, ErrInvalid
			}
			decodedSource.NativeBootstrapSourceRequestDigest = stringMember(sourceValue, "nativeBootstrapSourceRequestDigest")
			break
		}
		fallthrough
	case "sealed-hosted-owner-result":
		if !exactEvaluationKeys(sourceValue, []string{
			"kind", "ownerRequestDigest", "ownerReceiptDigest", "effectSourceReceiptDigest",
		}) ||
			!evaluationDigestPattern.MatchString(stringMember(sourceValue, "ownerRequestDigest")) ||
			!evaluationDigestPattern.MatchString(stringMember(sourceValue, "ownerReceiptDigest")) ||
			!evaluationDigestPattern.MatchString(stringMember(sourceValue, "effectSourceReceiptDigest")) {
			return evaluationOptionalFactAuthorityRequest{}, ErrInvalid
		}
		decodedSource.OwnerRequestDigest = stringMember(sourceValue, "ownerRequestDigest")
		decodedSource.OwnerReceiptDigest = stringMember(sourceValue, "ownerReceiptDigest")
		decodedSource.EffectSourceReceiptDigest = stringMember(sourceValue, "effectSourceReceiptDigest")
	default:
		return evaluationOptionalFactAuthorityRequest{}, ErrInvalid
	}
	projection, err := evaluationOptionalFactAuthorityRequestProjection(value, decodedSource)
	if err != nil {
		return evaluationOptionalFactAuthorityRequest{}, err
	}
	requestBytes, err := canonicaljson.Bytes(projection)
	if err != nil || len(requestBytes) > maximumEvaluationOptionalFactAuthorityRequestBytes {
		return evaluationOptionalFactAuthorityRequest{}, ErrInvalid
	}
	requestDigest, err := canonicaljson.Digest(projection)
	if err != nil {
		return evaluationOptionalFactAuthorityRequest{}, err
	}
	return evaluationOptionalFactAuthorityRequest{
		AttemptID: stringMember(value, "attemptId"), DescriptorDigest: stringMember(value, "descriptorDigest"),
		TargetID: stringMember(value, "targetId"), TargetDigest: stringMember(value, "targetDigest"),
		CapabilityProfileID: stringMember(value, "capabilityProfileId"), CapabilityProfileDigest: stringMember(value, "capabilityProfileDigest"),
		CapabilityDescriptorDigest: stringMember(value, "capabilityDescriptorDigest"), CapabilityID: stringMember(value, "capabilityId"),
		SupportExpectation: stringMember(value, "supportExpectation"), TurnIndex: turn,
		InvocationID: stringMember(value, "invocationId"), ProtocolFamily: stringMember(value, "protocolFamily"),
		ProviderConfigurationID: stringMember(value, "providerConfigurationId"), ModelID: stringMember(value, "modelId"),
		ModelLineageDigest: stringMember(value, "modelLineageDigest"), AdapterDigest: stringMember(value, "adapterDigest"),
		ProviderRequestDigest: stringMember(value, "providerRequestDigest"), ResponseDigest: stringMember(value, "responseDigest"),
		DispatchIntentDigest: stringMember(value, "dispatchIntentDigest"), TransportReceiptDigest: stringMember(value, "transportReceiptDigest"),
		ResultSpoolReceiptDigest: resultSpoolReceiptDigest, NormalizedEventSetDigest: stringMember(value, "normalizedEventSetDigest"),
		Source: decodedSource, AuthorityRequestDigest: requestDigest, RequestBytes: requestBytes, Value: projection,
	}, nil
}

func decodeEvaluationOptionalFactAuthorityStageRequest(
	source []byte,
) (evaluationOptionalFactAuthorityStageRequest, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationOptionalFactAuthorityRequestBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest",
		"turnIndex", "sourceSealDigest",
	}) || stringMember(value, "format") != evaluationOptionalFactAuthorityStageRequestFormat ||
		!evaluationDigestPattern.MatchString(stringMember(value, "planDigest")) ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "attemptId")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "descriptorDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "sourceSealDigest")) {
		return evaluationOptionalFactAuthorityStageRequest{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	turn, turnOK := integerMember(value, "turnIndex")
	if !versionOK || version != 1 || !turnOK || turn < 0 || turn >= maximumEvaluationOptionalFactAuthorityTurns {
		return evaluationOptionalFactAuthorityStageRequest{}, ErrInvalid
	}
	digest, err := canonicaljson.Digest(value)
	if err != nil {
		return evaluationOptionalFactAuthorityStageRequest{}, err
	}
	return evaluationOptionalFactAuthorityStageRequest{
		PlanDigest: stringMember(value, "planDigest"), RepositoryCommit: stringMember(value, "repositoryCommit"),
		AttemptID: stringMember(value, "attemptId"), DescriptorDigest: stringMember(value, "descriptorDigest"),
		TurnIndex: turn, SourceSealDigest: stringMember(value, "sourceSealDigest"),
		AuthorityRequestDigest: digest, RequestBytes: canonical,
	}, nil
}

func evaluationOptionalFactSourceSeal(
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	request evaluationOptionalFactAuthorityRequest,
	evidence EvaluationOptionalFactSourceEvidence,
	sealedAt time.Time,
) (EvaluationOptionalFactSourceRecord, error) {
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationOptionalFactSourceRecord{}, err
	}
	if err := validateEvaluationPartition(partition); err != nil {
		return EvaluationOptionalFactSourceRecord{}, err
	}
	if !evaluationOptionalFactTargetMatchesRequest(request, evidence.Target) ||
		request.Source.Kind != evidence.Kind || !evaluationDigestPattern.MatchString(evidence.SourceDigest) ||
		evidence.ObservedAt.IsZero() || sealedAt.IsZero() || sealedAt.Before(evidence.ObservedAt) {
		return EvaluationOptionalFactSourceRecord{}, ErrConflict
	}
	if evidence.NativeBootstrapSourceRequestDigest != "" {
		return evaluationOptionalFactNativeSourceSeal(authority, partition, request, evidence, sealedAt)
	}
	if request.Source.OwnerRequestDigest != evidence.OwnerRequestDigest ||
		request.Source.OwnerReceiptDigest != evidence.OwnerReceiptDigest ||
		request.Source.EffectSourceReceiptDigest != evidence.EffectSourceReceiptDigest {
		return EvaluationOptionalFactSourceRecord{}, ErrConflict
	}
	for _, digest := range []string{
		evidence.OwnerRequestDigest, evidence.OwnerReceiptDigest, evidence.OwnerStageDigest,
		evidence.OwnerDispatchAckDigest, evidence.PreEffectIntentDigest,
		evidence.EffectSourceReceiptDigest, evidence.ProviderRuntimeJournalResultRecordDigest,
		evidence.ProviderRuntimeResultSealReceiptDigest, evidence.BusinessResultDigest,
	} {
		if !evaluationDigestPattern.MatchString(digest) {
			return EvaluationOptionalFactSourceRecord{}, ErrConflict
		}
	}
	preEffectIntent, err := decodeCanonicalEvaluationObject(
		evidence.PreEffectIntentBytes, maximumEvaluationOptionalFactAuthorityEnvelopeBytes,
	)
	effectReceipt, effectReceiptErr := decodeCanonicalEvaluationObject(
		evidence.EffectSourceReceiptBytes, maximumEvaluationOptionalFactAuthorityEnvelopeBytes,
	)
	if err != nil || effectReceiptErr != nil ||
		stringMember(preEffectIntent, "intentDigest") != evidence.PreEffectIntentDigest ||
		stringMember(effectReceipt, "receiptDigest") != evidence.EffectSourceReceiptDigest ||
		stringMember(effectReceipt, "providerRuntimeJournalResultRecordDigest") != evidence.ProviderRuntimeJournalResultRecordDigest ||
		stringMember(effectReceipt, "providerRuntimeResultSealReceiptDigest") != evidence.ProviderRuntimeResultSealReceiptDigest {
		return EvaluationOptionalFactSourceRecord{}, ErrConflict
	}
	outcome := evidence.Outcome
	if outcome == "" {
		outcome = "unavailable"
	}
	if !oneOfString(outcome, "observed", "unavailable", "failed") ||
		outcome == "observed" && (evidence.Fact == nil || evidence.FactKind != evaluationOptionalFactKind(request.CapabilityID)) ||
		outcome == "observed" && evidence.EffectSourceFactDigest != evidence.FactDigest ||
		outcome != "observed" && (evidence.Fact != nil || evidence.EffectSourceFactDigest != "") {
		return EvaluationOptionalFactSourceRecord{}, ErrConflict
	}
	var fact map[string]any
	var factBytes []byte
	var factKind, factDigest string
	if outcome == "observed" {
		var err error
		fact, factDigest, err = evaluationOptionalFactObservedValue(evidence.FactKind, evidence.Fact)
		if err != nil || factDigest != evidence.FactDigest {
			return EvaluationOptionalFactSourceRecord{}, ErrConflict
		}
		factKind = evidence.FactKind
		factBytes, err = canonicaljson.Bytes(fact)
		if err != nil || len(factBytes) > maximumEvaluationOptionalFactAuthorityEnvelopeBytes {
			return EvaluationOptionalFactSourceRecord{}, ErrInvalid
		}
	}
	observedAt := evidence.ObservedAt.UTC().Truncate(time.Millisecond)
	sealedAt = sealedAt.UTC().Truncate(time.Millisecond)
	receiptBase := map[string]any{
		"format": evaluationOptionalFactSourceReceiptFormat, "version": int64(1),
		"namespaceId": authority.NamespaceID, "planDigest": partition.PlanDigest,
		"repositoryCommit": partition.RepositoryCommit, "attemptId": request.AttemptID,
		"descriptorDigest": request.DescriptorDigest, "targetId": request.TargetID,
		"targetDigest": request.TargetDigest, "capabilityProfileId": request.CapabilityProfileID,
		"capabilityProfileDigest":    request.CapabilityProfileDigest,
		"capabilityDescriptorDigest": request.CapabilityDescriptorDigest,
		"capabilityId":               request.CapabilityID, "supportExpectation": request.SupportExpectation,
		"turnIndex": json.Number(fmt.Sprintf("%d", request.TurnIndex)), "invocationId": request.InvocationID,
		"protocolFamily": request.ProtocolFamily, "providerConfigurationId": request.ProviderConfigurationID,
		"modelId": request.ModelID, "modelLineageDigest": request.ModelLineageDigest,
		"adapterDigest": request.AdapterDigest, "providerRequestDigest": request.ProviderRequestDigest,
		"responseDigest": request.ResponseDigest, "dispatchIntentDigest": request.DispatchIntentDigest,
		"transportReceiptDigest":              request.TransportReceiptDigest,
		"resultSpoolReceiptDigest":            evaluationOptionalFactNullableDigestValue(request.ResultSpoolReceiptDigest),
		"normalizedEventSetDigest":            request.NormalizedEventSetDigest,
		"targetAuthorityDigest":               evidence.Target.TargetAuthorityDigest,
		"sourceAuthorityId":                   evidence.Target.SourceAuthorityID,
		"sourceAuthorityImplementationDigest": evidence.Target.SourceAuthorityImplementationDigest,
		"sourceAuthorityRouteBinding":         evidence.Target.SourceAuthorityRouteBinding,
		"registrationAuthorityIssuerId":       evidence.Target.RegistrationAuthorityIssuerID,
		"registrationReceiptDigest":           evidence.Target.RegistrationReceiptDigest,
		"sourceKind":                          evidence.Kind, "sourceDigest": evidence.SourceDigest,
		"sourceRequestDigest": request.AuthorityRequestDigest,
		"outcome":             outcome, "observedAt": observedAt.Format("2006-01-02T15:04:05.000Z"),
		"sealedAt": sealedAt.Format("2006-01-02T15:04:05.000Z"),
	}
	receiptBase["ownerRequestDigest"], receiptBase["ownerReceiptDigest"] = evidence.OwnerRequestDigest, evidence.OwnerReceiptDigest
	receiptBase["ownerStageDigest"], receiptBase["ownerDispatchAckDigest"] = evidence.OwnerStageDigest, evidence.OwnerDispatchAckDigest
	receiptBase["preEffectIntentDigest"] = evidence.PreEffectIntentDigest
	receiptBase["effectSourceReceiptDigest"] = evidence.EffectSourceReceiptDigest
	receiptBase["providerRuntimeJournalResultRecordDigest"] = evidence.ProviderRuntimeJournalResultRecordDigest
	receiptBase["providerRuntimeResultSealReceiptDigest"] = evidence.ProviderRuntimeResultSealReceiptDigest
	receiptBase["effectSourceFactDigest"] = nil
	receiptBase["businessResultDigest"] = evidence.BusinessResultDigest
	if outcome == "observed" {
		if request.ResultSpoolReceiptDigest == "" {
			return EvaluationOptionalFactSourceRecord{}, ErrConflict
		}
		receiptBase["fact"] = fact
		receiptBase["effectSourceFactDigest"] = evidence.EffectSourceFactDigest
	}
	sourceSealDigest, err := canonicaljson.Digest(receiptBase)
	if err != nil {
		return EvaluationOptionalFactSourceRecord{}, err
	}
	receipt := cloneEvaluationObject(receiptBase)
	receipt["sourceSealDigest"] = sourceSealDigest
	receiptBytes, err := canonicaljson.Bytes(receipt)
	if err != nil || len(receiptBytes) > maximumEvaluationOptionalFactAuthorityResponseBytes {
		return EvaluationOptionalFactSourceRecord{}, ErrInvalid
	}
	return EvaluationOptionalFactSourceRecord{
		NamespaceID: authority.NamespaceID, PlanDigest: partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit,
		AttemptID: request.AttemptID, DescriptorDigest: request.DescriptorDigest, TargetID: request.TargetID,
		TargetDigest: request.TargetDigest, CapabilityProfileID: request.CapabilityProfileID,
		CapabilityProfileDigest: request.CapabilityProfileDigest, CapabilityDescriptorDigest: request.CapabilityDescriptorDigest,
		CapabilityID: request.CapabilityID, SupportExpectation: request.SupportExpectation,
		TurnIndex: request.TurnIndex, InvocationID: request.InvocationID, ProtocolFamily: request.ProtocolFamily,
		ProviderConfigurationID: request.ProviderConfigurationID, ModelID: request.ModelID,
		ModelLineageDigest: request.ModelLineageDigest, AdapterDigest: request.AdapterDigest,
		ProviderRequestDigest: request.ProviderRequestDigest, ResponseDigest: request.ResponseDigest,
		DispatchIntentDigest: request.DispatchIntentDigest, TransportReceiptDigest: request.TransportReceiptDigest,
		ResultSpoolReceiptDigest: request.ResultSpoolReceiptDigest, NormalizedEventSetDigest: request.NormalizedEventSetDigest,
		TargetAuthorityDigest: evidence.Target.TargetAuthorityDigest, SourceAuthorityID: evidence.Target.SourceAuthorityID,
		SourceAuthorityImplementationDigest: evidence.Target.SourceAuthorityImplementationDigest,
		SourceAuthorityRouteBinding:         evidence.Target.SourceAuthorityRouteBinding,
		RegistrationAuthorityIssuerID:       evidence.Target.RegistrationAuthorityIssuerID,
		RegistrationReceiptDigest:           evidence.Target.RegistrationReceiptDigest,
		SourceKind:                          evidence.Kind, SourceDigest: evidence.SourceDigest,
		OwnerRequestDigest: evidence.OwnerRequestDigest, OwnerReceiptDigest: evidence.OwnerReceiptDigest,
		OwnerStageDigest: evidence.OwnerStageDigest, OwnerDispatchAckDigest: evidence.OwnerDispatchAckDigest,
		PreEffectIntentDigest: evidence.PreEffectIntentDigest, EffectSourceReceiptDigest: evidence.EffectSourceReceiptDigest,
		ProviderRuntimeJournalResultRecordDigest: evidence.ProviderRuntimeJournalResultRecordDigest,
		ProviderRuntimeResultSealReceiptDigest:   evidence.ProviderRuntimeResultSealReceiptDigest,
		EffectSourceFactDigest:                   evidence.EffectSourceFactDigest, BusinessResultDigest: evidence.BusinessResultDigest,
		Outcome: outcome, FactKind: factKind, FactDigest: factDigest,
		SourceRequestDigest: request.AuthorityRequestDigest, SourceSealDigest: sourceSealDigest,
		V46Eligible: true, RequestBytes: append([]byte(nil), request.RequestBytes...), FactBytes: factBytes,
		PreEffectIntentBytes:     append([]byte(nil), evidence.PreEffectIntentBytes...),
		EffectSourceReceiptBytes: append([]byte(nil), evidence.EffectSourceReceiptBytes...),
		ReceiptBytes:             receiptBytes, ObservedAt: observedAt, SealedAt: sealedAt,
	}, nil
}

func evaluationOptionalFactNativeSourceSeal(
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	request evaluationOptionalFactAuthorityRequest,
	evidence EvaluationOptionalFactSourceEvidence,
	sealedAt time.Time,
) (EvaluationOptionalFactSourceRecord, error) {
	if !evaluationOptionalFactSourceReferenceMatches(request, evidence) ||
		!evaluationOptionalFactSourceAuthorityDigestsValid(evidence) ||
		evidence.NativeBootstrapSealedAt.IsZero() || sealedAt.Before(evidence.NativeBootstrapSealedAt) {
		return EvaluationOptionalFactSourceRecord{}, ErrConflict
	}
	if len(evidence.NativeBootstrapSourceRequestBytes) != 0 {
		requestValue, err := decodeCanonicalEvaluationObject(
			evidence.NativeBootstrapSourceRequestBytes, maximumEvaluationNativeOptionalBootstrapBytes,
		)
		if err != nil || stringMember(requestValue, "requestDigest") != evidence.NativeBootstrapSourceRequestDigest {
			return EvaluationOptionalFactSourceRecord{}, ErrConflict
		}
	}
	outcome := evidence.Outcome
	if !oneOfString(outcome, "observed", "unavailable", "failed") {
		return EvaluationOptionalFactSourceRecord{}, ErrInvalid
	}
	var fact map[string]any
	var factBytes []byte
	var factKind, factDigest string
	if outcome == "observed" {
		var err error
		fact, factDigest, err = evaluationOptionalFactObservedValue(evidence.FactKind, evidence.Fact)
		if err != nil || factDigest != evidence.FactDigest || evidence.NativeProviderSourceReceiptDigest == "" {
			return EvaluationOptionalFactSourceRecord{}, ErrConflict
		}
		factKind = evidence.FactKind
		factBytes, err = canonicaljson.Bytes(fact)
		if err != nil || len(factBytes) > maximumEvaluationOptionalFactAuthorityEnvelopeBytes {
			return EvaluationOptionalFactSourceRecord{}, ErrInvalid
		}
		if len(evidence.NativeProviderSourceReceiptBytes) != 0 {
			nativeValue, err := decodeCanonicalEvaluationObject(
				evidence.NativeProviderSourceReceiptBytes, maximumEvaluationNativeOptionalSourceBytes,
			)
			if err != nil || stringMember(nativeValue, "receiptDigest") != evidence.NativeProviderSourceReceiptDigest {
				return EvaluationOptionalFactSourceRecord{}, ErrConflict
			}
		}
	} else if evidence.Fact != nil || evidence.FactDigest != "" || evidence.FactKind != "" ||
		evidence.NativeProviderSourceReceiptDigest != "" || evidence.NativeProviderSourceDigest != "" {
		return EvaluationOptionalFactSourceRecord{}, ErrConflict
	}
	sourceBase := map[string]any{
		"kind": evidence.Kind, "planDigest": partition.PlanDigest, "repositoryCommit": partition.RepositoryCommit,
		"attemptId": request.AttemptID, "descriptorDigest": request.DescriptorDigest,
		"turnIndex": request.Value["turnIndex"], "invocationId": request.InvocationID,
		"providerRequestDigest": request.ProviderRequestDigest, "responseDigest": request.ResponseDigest,
		"dispatchIntentDigest": request.DispatchIntentDigest, "transportReceiptDigest": request.TransportReceiptDigest,
		"resultSpoolReceiptDigest":           evaluationOptionalFactNullableDigestValue(request.ResultSpoolReceiptDigest),
		"normalizedEventSetDigest":           request.NormalizedEventSetDigest,
		"nativeBootstrapSourceRequestDigest": evidence.NativeBootstrapSourceRequestDigest,
		"nativeBootstrapSourceReceiptDigest": evidence.NativeBootstrapSourceReceiptDigest,
		"ownerStageDigest":                   evidence.OwnerStageDigest, "ownerDispatchAckDigest": evidence.OwnerDispatchAckDigest,
		"nativeProviderSourceReceiptDigest": nil, "nativeProviderSourceDigest": nil,
		"nativeProviderSourceFactDigest": nil, "outcome": outcome,
	}
	if outcome == "observed" {
		sourceBase["nativeProviderSourceReceiptDigest"] = evidence.NativeProviderSourceReceiptDigest
		sourceBase["nativeProviderSourceDigest"] = evidence.NativeProviderSourceDigest
		sourceBase["nativeProviderSourceFactDigest"] = factDigest
	}
	sourceDigest, err := canonicaljson.Digest(sourceBase)
	if err != nil || sourceDigest != evidence.SourceDigest {
		return EvaluationOptionalFactSourceRecord{}, ErrConflict
	}
	observedAt := evidence.ObservedAt.UTC().Truncate(time.Millisecond)
	sealedAt = sealedAt.UTC().Truncate(time.Millisecond)
	receiptBase := map[string]any{
		"format": evaluationOptionalFactSourceReceiptFormat, "version": int64(1),
		"namespaceId": authority.NamespaceID, "planDigest": partition.PlanDigest,
		"repositoryCommit": partition.RepositoryCommit, "attemptId": request.AttemptID,
		"descriptorDigest": request.DescriptorDigest, "targetId": request.TargetID,
		"targetDigest": request.TargetDigest, "capabilityProfileId": request.CapabilityProfileID,
		"capabilityProfileDigest":    request.CapabilityProfileDigest,
		"capabilityDescriptorDigest": request.CapabilityDescriptorDigest,
		"capabilityId":               request.CapabilityID, "supportExpectation": request.SupportExpectation,
		"turnIndex": json.Number(fmt.Sprintf("%d", request.TurnIndex)), "invocationId": request.InvocationID,
		"protocolFamily": request.ProtocolFamily, "providerConfigurationId": request.ProviderConfigurationID,
		"modelId": request.ModelID, "modelLineageDigest": request.ModelLineageDigest,
		"adapterDigest": request.AdapterDigest, "providerRequestDigest": request.ProviderRequestDigest,
		"responseDigest": request.ResponseDigest, "dispatchIntentDigest": request.DispatchIntentDigest,
		"transportReceiptDigest":              request.TransportReceiptDigest,
		"resultSpoolReceiptDigest":            evaluationOptionalFactNullableDigestValue(request.ResultSpoolReceiptDigest),
		"normalizedEventSetDigest":            request.NormalizedEventSetDigest,
		"targetAuthorityDigest":               evidence.Target.TargetAuthorityDigest,
		"sourceAuthorityId":                   evidence.Target.SourceAuthorityID,
		"sourceAuthorityImplementationDigest": evidence.Target.SourceAuthorityImplementationDigest,
		"sourceAuthorityRouteBinding":         evidence.Target.SourceAuthorityRouteBinding,
		"registrationAuthorityIssuerId":       evidence.Target.RegistrationAuthorityIssuerID,
		"registrationReceiptDigest":           evidence.Target.RegistrationReceiptDigest,
		"sourceKind":                          evidence.Kind, "sourceDigest": sourceDigest,
		"sourceRequestDigest": request.AuthorityRequestDigest,
		"ownerStageDigest":    evidence.OwnerStageDigest, "ownerDispatchAckDigest": evidence.OwnerDispatchAckDigest,
		"nativeBootstrapSourceRequestDigest": evidence.NativeBootstrapSourceRequestDigest,
		"nativeBootstrapSourceReceiptDigest": evidence.NativeBootstrapSourceReceiptDigest,
		"nativeProviderSourceReceiptDigest":  nil, "nativeProviderSourceDigest": nil,
		"nativeProviderSourceFactDigest": nil, "outcome": outcome,
		"observedAt": evaluationExportInstant(observedAt), "sealedAt": evaluationExportInstant(sealedAt),
	}
	if outcome == "observed" {
		if request.ResultSpoolReceiptDigest == "" {
			return EvaluationOptionalFactSourceRecord{}, ErrConflict
		}
		receiptBase["nativeProviderSourceReceiptDigest"] = evidence.NativeProviderSourceReceiptDigest
		receiptBase["nativeProviderSourceDigest"] = evidence.NativeProviderSourceDigest
		receiptBase["nativeProviderSourceFactDigest"] = factDigest
		receiptBase["fact"] = fact
	}
	sourceSealDigest, err := canonicaljson.Digest(receiptBase)
	if err != nil {
		return EvaluationOptionalFactSourceRecord{}, err
	}
	receipt := cloneEvaluationObject(receiptBase)
	receipt["sourceSealDigest"] = sourceSealDigest
	receiptBytes, err := canonicaljson.Bytes(receipt)
	if err != nil || len(receiptBytes) > maximumEvaluationOptionalFactAuthorityResponseBytes {
		return EvaluationOptionalFactSourceRecord{}, ErrInvalid
	}
	return EvaluationOptionalFactSourceRecord{
		NamespaceID: authority.NamespaceID, PlanDigest: partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit,
		AttemptID: request.AttemptID, DescriptorDigest: request.DescriptorDigest, TargetID: request.TargetID,
		TargetDigest: request.TargetDigest, CapabilityProfileID: request.CapabilityProfileID,
		CapabilityProfileDigest:    request.CapabilityProfileDigest,
		CapabilityDescriptorDigest: request.CapabilityDescriptorDigest, CapabilityID: request.CapabilityID,
		SupportExpectation: request.SupportExpectation, TurnIndex: request.TurnIndex, InvocationID: request.InvocationID,
		ProtocolFamily: request.ProtocolFamily, ProviderConfigurationID: request.ProviderConfigurationID,
		ModelID: request.ModelID, ModelLineageDigest: request.ModelLineageDigest, AdapterDigest: request.AdapterDigest,
		ProviderRequestDigest: request.ProviderRequestDigest, ResponseDigest: request.ResponseDigest,
		DispatchIntentDigest: request.DispatchIntentDigest, TransportReceiptDigest: request.TransportReceiptDigest,
		ResultSpoolReceiptDigest: request.ResultSpoolReceiptDigest,
		NormalizedEventSetDigest: request.NormalizedEventSetDigest,
		TargetAuthorityDigest:    evidence.Target.TargetAuthorityDigest, SourceAuthorityID: evidence.Target.SourceAuthorityID,
		SourceAuthorityImplementationDigest: evidence.Target.SourceAuthorityImplementationDigest,
		SourceAuthorityRouteBinding:         evidence.Target.SourceAuthorityRouteBinding,
		RegistrationAuthorityIssuerID:       evidence.Target.RegistrationAuthorityIssuerID,
		RegistrationReceiptDigest:           evidence.Target.RegistrationReceiptDigest, SourceKind: evidence.Kind,
		SourceDigest: sourceDigest, OwnerStageDigest: evidence.OwnerStageDigest,
		OwnerDispatchAckDigest:             evidence.OwnerDispatchAckDigest,
		NativeBootstrapSourceRequestDigest: evidence.NativeBootstrapSourceRequestDigest,
		NativeBootstrapSourceReceiptDigest: evidence.NativeBootstrapSourceReceiptDigest,
		NativeProviderSourceReceiptDigest:  evidence.NativeProviderSourceReceiptDigest,
		NativeProviderSourceDigest:         evidence.NativeProviderSourceDigest,
		Outcome:                            outcome, FactKind: factKind, FactDigest: factDigest,
		SourceRequestDigest: request.AuthorityRequestDigest, SourceSealDigest: sourceSealDigest, V46Eligible: true,
		RequestBytes:                      append([]byte(nil), request.RequestBytes...),
		NativeBootstrapSourceRequestBytes: append([]byte(nil), evidence.NativeBootstrapSourceRequestBytes...),
		NativeProviderSourceReceiptBytes:  append([]byte(nil), evidence.NativeProviderSourceReceiptBytes...),
		FactBytes:                         factBytes, ReceiptBytes: receiptBytes, ObservedAt: observedAt, SealedAt: sealedAt,
	}, nil
}

func evaluationOptionalFactAuthorityRequestFromSource(
	stage evaluationOptionalFactAuthorityStageRequest,
	source EvaluationOptionalFactSourceRecord,
) (evaluationOptionalFactAuthorityRequest, error) {
	if stage.PlanDigest != source.PlanDigest || stage.RepositoryCommit != source.RepositoryCommit ||
		stage.AttemptID != source.AttemptID || stage.DescriptorDigest != source.DescriptorDigest ||
		stage.TurnIndex != source.TurnIndex || stage.SourceSealDigest != source.SourceSealDigest ||
		source.SourceSealDigest == "" || !source.V46Eligible {
		return evaluationOptionalFactAuthorityRequest{}, ErrConflict
	}
	return evaluationOptionalFactAuthorityRequest{
		AttemptID: source.AttemptID, DescriptorDigest: source.DescriptorDigest, TargetID: source.TargetID,
		TargetDigest: source.TargetDigest, CapabilityProfileID: source.CapabilityProfileID,
		CapabilityProfileDigest: source.CapabilityProfileDigest, CapabilityDescriptorDigest: source.CapabilityDescriptorDigest,
		CapabilityID: source.CapabilityID, SupportExpectation: source.SupportExpectation, TurnIndex: source.TurnIndex,
		InvocationID: source.InvocationID, ProtocolFamily: source.ProtocolFamily,
		ProviderConfigurationID: source.ProviderConfigurationID, ModelID: source.ModelID,
		ModelLineageDigest: source.ModelLineageDigest, AdapterDigest: source.AdapterDigest,
		ProviderRequestDigest: source.ProviderRequestDigest, ResponseDigest: source.ResponseDigest,
		DispatchIntentDigest: source.DispatchIntentDigest, TransportReceiptDigest: source.TransportReceiptDigest,
		ResultSpoolReceiptDigest: source.ResultSpoolReceiptDigest, NormalizedEventSetDigest: source.NormalizedEventSetDigest,
		Source: evaluationOptionalFactAuthoritySource{
			Kind: source.SourceKind, OwnerRequestDigest: source.OwnerRequestDigest,
			OwnerReceiptDigest: source.OwnerReceiptDigest, EffectSourceReceiptDigest: source.EffectSourceReceiptDigest,
			NativeBootstrapSourceRequestDigest: source.NativeBootstrapSourceRequestDigest,
		},
		AuthorityRequestDigest: stage.AuthorityRequestDigest, RequestBytes: append([]byte(nil), stage.RequestBytes...),
	}, nil
}

func evaluationOptionalFactEvidenceFromSource(source EvaluationOptionalFactSourceRecord) (EvaluationOptionalFactSourceEvidence, error) {
	var fact map[string]any
	if source.Outcome == "observed" {
		value, err := decodeCanonicalEvaluationObject(source.FactBytes, maximumEvaluationOptionalFactAuthorityEnvelopeBytes)
		if err != nil || stringMember(value, "factKind") != source.FactKind || stringMember(value, "factDigest") != source.FactDigest {
			return EvaluationOptionalFactSourceEvidence{}, ErrConflict
		}
		fact, _ = objectMember(value, "value")
	}
	return EvaluationOptionalFactSourceEvidence{
		Target: EvaluationOptionalFactTargetAuthority{
			TargetID: source.TargetID, TargetDigest: source.TargetDigest,
			CapabilityProfileID: source.CapabilityProfileID, CapabilityProfileDigest: source.CapabilityProfileDigest,
			CapabilityDescriptorDigest: source.CapabilityDescriptorDigest, CapabilityID: source.CapabilityID,
			SupportExpectation: source.SupportExpectation, ProtocolFamily: source.ProtocolFamily,
			ProviderConfigurationID: source.ProviderConfigurationID, ModelID: source.ModelID,
			ModelLineageDigest: source.ModelLineageDigest, AdapterDigest: source.AdapterDigest,
			SourceAuthorityID:                   source.SourceAuthorityID,
			SourceAuthorityImplementationDigest: source.SourceAuthorityImplementationDigest,
			SourceKind:                          source.SourceKind,
			SourceAuthorityRouteBinding:         source.SourceAuthorityRouteBinding,
			RegistrationAuthorityIssuerID:       source.RegistrationAuthorityIssuerID,
			RegistrationReceiptDigest:           source.RegistrationReceiptDigest,
			TargetAuthorityDigest:               source.TargetAuthorityDigest,
		},
		Kind: source.SourceKind, SourceDigest: source.SourceDigest,
		OwnerRequestDigest: source.OwnerRequestDigest, OwnerReceiptDigest: source.OwnerReceiptDigest,
		OwnerStageDigest: source.OwnerStageDigest, OwnerDispatchAckDigest: source.OwnerDispatchAckDigest,
		PreEffectIntentDigest: source.PreEffectIntentDigest, EffectSourceReceiptDigest: source.EffectSourceReceiptDigest,
		ProviderRuntimeJournalResultRecordDigest: source.ProviderRuntimeJournalResultRecordDigest,
		ProviderRuntimeResultSealReceiptDigest:   source.ProviderRuntimeResultSealReceiptDigest,
		EffectSourceFactDigest:                   source.EffectSourceFactDigest, BusinessResultDigest: source.BusinessResultDigest,
		PreEffectIntentBytes: source.PreEffectIntentBytes, EffectSourceReceiptBytes: source.EffectSourceReceiptBytes,
		NativeBootstrapSourceRequestDigest: source.NativeBootstrapSourceRequestDigest,
		NativeBootstrapSourceReceiptDigest: source.NativeBootstrapSourceReceiptDigest,
		NativeProviderSourceReceiptDigest:  source.NativeProviderSourceReceiptDigest,
		NativeProviderSourceDigest:         source.NativeProviderSourceDigest,
		NativeBootstrapSourceRequestBytes:  source.NativeBootstrapSourceRequestBytes,
		NativeProviderSourceReceiptBytes:   source.NativeProviderSourceReceiptBytes,
		Outcome:                            source.Outcome, FactKind: source.FactKind, FactDigest: source.FactDigest, Fact: fact,
		ObservedAt: source.ObservedAt,
	}, nil
}

func evaluationOptionalFactSourceReferenceMatches(
	request evaluationOptionalFactAuthorityRequest,
	evidence EvaluationOptionalFactSourceEvidence,
) bool {
	if evidence.NativeBootstrapSourceRequestDigest != "" {
		return request.Source.Kind == "sealed-provider-response-metadata" &&
			request.Source.NativeBootstrapSourceRequestDigest == evidence.NativeBootstrapSourceRequestDigest &&
			request.Source.OwnerRequestDigest == "" && request.Source.OwnerReceiptDigest == "" &&
			request.Source.EffectSourceReceiptDigest == ""
	}
	return request.Source.NativeBootstrapSourceRequestDigest == "" &&
		request.Source.OwnerRequestDigest == evidence.OwnerRequestDigest &&
		request.Source.OwnerReceiptDigest == evidence.OwnerReceiptDigest &&
		request.Source.EffectSourceReceiptDigest == evidence.EffectSourceReceiptDigest
}

func evaluationOptionalFactSourceAuthorityDigestsValid(evidence EvaluationOptionalFactSourceEvidence) bool {
	if !evaluationDigestPattern.MatchString(evidence.OwnerStageDigest) ||
		!evaluationDigestPattern.MatchString(evidence.OwnerDispatchAckDigest) {
		return false
	}
	if evidence.NativeBootstrapSourceRequestDigest != "" {
		if !evaluationDigestPattern.MatchString(evidence.NativeBootstrapSourceRequestDigest) ||
			!evaluationDigestPattern.MatchString(evidence.NativeBootstrapSourceReceiptDigest) ||
			evidence.OwnerRequestDigest != "" || evidence.OwnerReceiptDigest != "" ||
			evidence.PreEffectIntentDigest != "" || evidence.EffectSourceReceiptDigest != "" ||
			evidence.ProviderRuntimeJournalResultRecordDigest != "" ||
			evidence.ProviderRuntimeResultSealReceiptDigest != "" ||
			evidence.EffectSourceFactDigest != "" || evidence.BusinessResultDigest != "" {
			return false
		}
		if evidence.Outcome == "observed" {
			return evaluationDigestPattern.MatchString(evidence.NativeProviderSourceReceiptDigest) &&
				evaluationDigestPattern.MatchString(evidence.NativeProviderSourceDigest)
		}
		return evidence.NativeProviderSourceReceiptDigest == "" && evidence.NativeProviderSourceDigest == "" &&
			len(evidence.NativeProviderSourceReceiptBytes) == 0
	}
	for _, digest := range []string{
		evidence.OwnerRequestDigest, evidence.OwnerReceiptDigest, evidence.PreEffectIntentDigest,
		evidence.EffectSourceReceiptDigest, evidence.ProviderRuntimeJournalResultRecordDigest,
		evidence.ProviderRuntimeResultSealReceiptDigest, evidence.BusinessResultDigest,
	} {
		if !evaluationDigestPattern.MatchString(digest) {
			return false
		}
	}
	return evidence.NativeBootstrapSourceReceiptDigest == "" && evidence.NativeProviderSourceReceiptDigest == "" &&
		evidence.NativeProviderSourceDigest == "" &&
		len(evidence.NativeBootstrapSourceRequestBytes) == 0 && len(evidence.NativeProviderSourceReceiptBytes) == 0
}

func evaluationOptionalFactTargetMatchesRequest(
	request evaluationOptionalFactAuthorityRequest,
	target EvaluationOptionalFactTargetAuthority,
) bool {
	return request.TargetID == target.TargetID && request.TargetDigest == target.TargetDigest &&
		request.CapabilityProfileID == target.CapabilityProfileID && request.CapabilityProfileDigest == target.CapabilityProfileDigest &&
		request.CapabilityDescriptorDigest == target.CapabilityDescriptorDigest && request.CapabilityID == target.CapabilityID &&
		request.SupportExpectation == target.SupportExpectation && request.ProtocolFamily == target.ProtocolFamily &&
		request.ProviderConfigurationID == target.ProviderConfigurationID && request.ModelID == target.ModelID &&
		request.ModelLineageDigest == target.ModelLineageDigest && request.AdapterDigest == target.AdapterDigest &&
		request.Source.Kind == target.SourceKind &&
		validEvaluationAgentControlIdentity(target.SourceAuthorityID) &&
		evaluationDigestPattern.MatchString(target.SourceAuthorityImplementationDigest) &&
		validEvaluationAgentControlIdentity(target.SourceAuthorityRouteBinding) &&
		validEvaluationAgentControlIdentity(target.RegistrationAuthorityIssuerID) &&
		evaluationDigestPattern.MatchString(target.RegistrationReceiptDigest) &&
		evaluationDigestPattern.MatchString(target.TargetAuthorityDigest)
}

func evaluationOptionalFactStageDigest(
	request evaluationOptionalFactAuthorityRequest,
	evidence EvaluationOptionalFactSourceEvidence,
) (string, error) {
	if !evaluationOptionalFactTargetMatchesRequest(request, evidence.Target) ||
		request.Source.Kind != evidence.Kind || !evaluationDigestPattern.MatchString(evidence.SourceDigest) {
		return "", ErrConflict
	}
	return canonicaljson.Digest(map[string]any{
		"format": evaluationOptionalFactAuthorityStageFormat, "version": int64(1),
		"authorityRequestDigest":              request.AuthorityRequestDigest,
		"targetAuthorityDigest":               evidence.Target.TargetAuthorityDigest,
		"sourceAuthorityId":                   evidence.Target.SourceAuthorityID,
		"sourceAuthorityImplementationDigest": evidence.Target.SourceAuthorityImplementationDigest,
		"sourceAuthorityRouteBinding":         evidence.Target.SourceAuthorityRouteBinding,
		"registrationAuthorityIssuerId":       evidence.Target.RegistrationAuthorityIssuerID,
		"registrationReceiptDigest":           evidence.Target.RegistrationReceiptDigest,
		"sourceKind":                          evidence.Kind, "sourceDigest": evidence.SourceDigest,
	})
}

func evaluationOptionalFactDispatchAckDigest(
	request evaluationOptionalFactAuthorityRequest,
	evidence EvaluationOptionalFactSourceEvidence,
	stageDigest, outcome string,
	observedAt time.Time,
) (string, error) {
	ackBase := map[string]any{
		"format": evaluationOptionalFactAuthorityAckFormat, "version": int64(1),
		"authorityRequestDigest": request.AuthorityRequestDigest, "stageDigest": stageDigest,
		"targetAuthorityDigest":               evidence.Target.TargetAuthorityDigest,
		"sourceAuthorityId":                   evidence.Target.SourceAuthorityID,
		"sourceAuthorityImplementationDigest": evidence.Target.SourceAuthorityImplementationDigest,
		"sourceAuthorityRouteBinding":         evidence.Target.SourceAuthorityRouteBinding,
		"registrationAuthorityIssuerId":       evidence.Target.RegistrationAuthorityIssuerID,
		"registrationReceiptDigest":           evidence.Target.RegistrationReceiptDigest,
		"sourceKind":                          evidence.Kind, "sourceDigest": evidence.SourceDigest,
		"outcome": outcome, "observedAt": observedAt.UTC().Truncate(time.Millisecond).Format("2006-01-02T15:04:05.000Z"),
	}
	if outcome == "observed" {
		ackBase["factKind"], ackBase["factDigest"] = evidence.FactKind, evidence.FactDigest
	}
	return canonicaljson.Digest(ackBase)
}

func evaluationOptionalFactAuthorityStage(
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	stage evaluationOptionalFactAuthorityStageRequest,
	source EvaluationOptionalFactSourceRecord,
	stagedAt time.Time,
) (EvaluationOptionalFactAuthorityRecord, error) {
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, err
	}
	if err := validateEvaluationPartition(partition); err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, err
	}
	if stage.PlanDigest != partition.PlanDigest || stage.RepositoryCommit != partition.RepositoryCommit ||
		source.NamespaceID != authority.NamespaceID || source.PlanDigest != partition.PlanDigest ||
		source.RepositoryCommit != partition.RepositoryCommit || stagedAt.IsZero() || stagedAt.Before(source.SealedAt) {
		return EvaluationOptionalFactAuthorityRecord{}, ErrConflict
	}
	request, err := evaluationOptionalFactAuthorityRequestFromSource(stage, source)
	if err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, err
	}
	evidence, err := evaluationOptionalFactEvidenceFromSource(source)
	if err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, err
	}
	stageDigest, err := evaluationOptionalFactStageDigest(request, evidence)
	if err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, err
	}
	return EvaluationOptionalFactAuthorityRecord{
		NamespaceID: authority.NamespaceID, PlanDigest: partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit,
		AttemptID: source.AttemptID, DescriptorDigest: source.DescriptorDigest, TargetID: source.TargetID,
		TargetDigest: source.TargetDigest, CapabilityProfileID: source.CapabilityProfileID,
		CapabilityProfileDigest: source.CapabilityProfileDigest, CapabilityDescriptorDigest: source.CapabilityDescriptorDigest,
		CapabilityID: source.CapabilityID, SupportExpectation: source.SupportExpectation,
		TurnIndex: source.TurnIndex, InvocationID: source.InvocationID, ProtocolFamily: source.ProtocolFamily,
		ProviderConfigurationID: source.ProviderConfigurationID, ModelID: source.ModelID,
		ModelLineageDigest: source.ModelLineageDigest, AdapterDigest: source.AdapterDigest,
		ProviderRequestDigest: source.ProviderRequestDigest, ResponseDigest: source.ResponseDigest,
		DispatchIntentDigest: source.DispatchIntentDigest, TransportReceiptDigest: source.TransportReceiptDigest,
		ResultSpoolReceiptDigest: source.ResultSpoolReceiptDigest, NormalizedEventSetDigest: source.NormalizedEventSetDigest,
		TargetAuthorityDigest: source.TargetAuthorityDigest, SourceAuthorityID: source.SourceAuthorityID,
		SourceAuthorityImplementationDigest: source.SourceAuthorityImplementationDigest,
		SourceAuthorityRouteBinding:         source.SourceAuthorityRouteBinding,
		SourceRegistrationAuthorityIssuerID: source.RegistrationAuthorityIssuerID,
		SourceRegistrationReceiptDigest:     source.RegistrationReceiptDigest,
		SourceKind:                          source.SourceKind, SourceDigest: source.SourceDigest, SourceSealDigest: source.SourceSealDigest,
		SourceOwnerRequestDigest: source.OwnerRequestDigest, SourceOwnerReceiptDigest: source.OwnerReceiptDigest,
		SourceOwnerStageDigest: source.OwnerStageDigest, SourceOwnerDispatchAckDigest: source.OwnerDispatchAckDigest,
		SourcePreEffectIntentDigest: source.PreEffectIntentDigest,
		SourceEffectReceiptDigest:   source.EffectSourceReceiptDigest,
		SourceEffectFactDigest:      source.EffectSourceFactDigest,
		SourceBusinessResultDigest:  source.BusinessResultDigest,
		AuthorityRequestDigest:      stage.AuthorityRequestDigest, State: "staged", ClaimGeneration: 1,
		V46Eligible: true, StageDigest: stageDigest, RequestBytes: append([]byte(nil), stage.RequestBytes...),
		StagedAt: stagedAt.UTC().Truncate(time.Millisecond),
	}, nil
}

func evaluationOptionalFactAuthoritySealFromSource(
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	staged EvaluationOptionalFactAuthorityRecord,
	source EvaluationOptionalFactSourceRecord,
	sealedAt time.Time,
) (EvaluationOptionalFactAuthorityRecord, error) {
	stage, err := decodeEvaluationOptionalFactAuthorityStageRequest(staged.RequestBytes)
	if err != nil || staged.State != "staged" || staged.ClaimGeneration != 1 || !staged.V46Eligible ||
		staged.AuthorityRequestDigest != stage.AuthorityRequestDigest || staged.StageDigest == "" ||
		staged.SourceSealDigest != source.SourceSealDigest || sealedAt.IsZero() || sealedAt.Before(staged.StagedAt) {
		return EvaluationOptionalFactAuthorityRecord{}, ErrConflict
	}
	request, err := evaluationOptionalFactAuthorityRequestFromSource(stage, source)
	if err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, err
	}
	evidence, err := evaluationOptionalFactEvidenceFromSource(source)
	if err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, err
	}
	result, err := evaluationOptionalFactAuthorityResponse(authority, partition, request, evidence, staged.StageDigest)
	if err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, err
	}
	result.SourceSealDigest = source.SourceSealDigest
	result.StagedAt = staged.StagedAt
	result.SealedAt = sealedAt.UTC().Truncate(time.Millisecond)
	return result, nil
}

func evaluationOptionalFactObservedValue(kind string, fact map[string]any) (map[string]any, string, error) {
	var authorityKind, digest string
	var err error
	switch kind {
	case "provider-job-receipt":
		authorityKind = "provider-job"
		digest, err = validateEvaluationProviderCapabilityFact(authorityKind, fact)
	case "provider-cache-receipt":
		authorityKind = "provider-cache"
		digest, err = validateEvaluationProviderCapabilityFact(authorityKind, fact)
	case "retrieval-query-receipt":
		authorityKind = "retrieval-query"
		digest, err = validateEvaluationProviderCapabilityFact(authorityKind, fact)
	case "opaque-continuation":
		digest, err = validateEvaluationOptionalOpaqueContinuation(fact)
	default:
		return nil, "", ErrInvalid
	}
	if err != nil {
		return nil, "", err
	}
	observed := map[string]any{"factKind": kind, "factDigest": digest, "value": cloneEvaluationObject(fact)}
	encoded, bytesErr := canonicaljson.Bytes(observed)
	if bytesErr != nil || len(encoded) > maximumEvaluationOptionalFactAuthorityEnvelopeBytes {
		return nil, "", ErrInvalid
	}
	return observed, digest, nil
}

func validateEvaluationOptionalOpaqueContinuation(fact map[string]any) (string, error) {
	if !exactEvaluationKeys(fact, []string{
		"continuationId", "encryptedBlobRef", "providerConfigurationId", "modelLineageDigest",
		"taskId", "runId", "generation", "parentInvocationId", "purpose", "createdAt", "expiresAt",
		"continuationDigest",
	}) || !evaluationCapabilityObjectWithin(fact, maximumEvaluationOptionalFactAuthorityEnvelopeBytes) ||
		!validEvaluationAgentControlIdentity(stringMember(fact, "continuationId")) ||
		!evaluationCapabilityNonBlankString(fact["encryptedBlobRef"]) ||
		!validEvaluationAgentControlIdentity(stringMember(fact, "providerConfigurationId")) ||
		!validEvaluationAgentControlIdentity(stringMember(fact, "taskId")) ||
		!validEvaluationAgentControlIdentity(stringMember(fact, "runId")) ||
		!validEvaluationAgentControlIdentity(stringMember(fact, "parentInvocationId")) ||
		stringMember(fact, "purpose") != "provider-tool-loop-continuation" ||
		!evaluationDigestPattern.MatchString(stringMember(fact, "modelLineageDigest")) {
		return "", ErrInvalid
	}
	generation, generationOK := integerMember(fact, "generation")
	createdAt, createdErr := parseEvaluationServiceInstant(stringMember(fact, "createdAt"))
	expiresAt, expiresErr := parseEvaluationServiceInstant(stringMember(fact, "expiresAt"))
	if !generationOK || generation < 0 || createdErr != nil || expiresErr != nil || !expiresAt.After(createdAt) {
		return "", ErrInvalid
	}
	return evaluationCapabilityFactDigest(fact, "continuationDigest")
}

func evaluationOptionalFactAuthorityResponse(
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	request evaluationOptionalFactAuthorityRequest,
	evidence EvaluationOptionalFactSourceEvidence,
	stageDigest string,
) (EvaluationOptionalFactAuthorityRecord, error) {
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, err
	}
	if err := validateEvaluationPartition(partition); err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, err
	}
	expectedStage, err := evaluationOptionalFactStageDigest(request, evidence)
	if err != nil || expectedStage != stageDigest || evidence.ObservedAt.IsZero() {
		return EvaluationOptionalFactAuthorityRecord{}, ErrConflict
	}
	if !evaluationOptionalFactSourceReferenceMatches(request, evidence) ||
		!evaluationOptionalFactSourceAuthorityDigestsValid(evidence) {
		return EvaluationOptionalFactAuthorityRecord{}, ErrConflict
	}
	outcome := evidence.Outcome
	if outcome == "" {
		outcome = "unavailable"
	}
	if !oneOfString(outcome, "observed", "unavailable", "failed") {
		return EvaluationOptionalFactAuthorityRecord{}, ErrInvalid
	}
	if outcome == "observed" && (evidence.Fact == nil || evidence.FactKind != evaluationOptionalFactKind(request.CapabilityID)) ||
		outcome == "observed" && evidence.NativeBootstrapSourceRequestDigest == "" && evidence.EffectSourceFactDigest != evidence.FactDigest ||
		outcome != "observed" && (evidence.Fact != nil || evidence.EffectSourceFactDigest != "" || evidence.NativeProviderSourceReceiptDigest != "") {
		return EvaluationOptionalFactAuthorityRecord{}, ErrConflict
	}
	observedAt := evidence.ObservedAt.UTC().Truncate(time.Millisecond)
	dispatchAckDigest, err := evaluationOptionalFactDispatchAckDigest(request, evidence, stageDigest, outcome, observedAt)
	if err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, err
	}
	responseBase := map[string]any{
		"format": evaluationOptionalFactAuthorityResponseFormat, "version": int64(1),
		"outcome": outcome, "authorityRequestDigest": request.AuthorityRequestDigest,
		"sourceAuthorityId":                   evidence.Target.SourceAuthorityID,
		"sourceAuthorityImplementationDigest": evidence.Target.SourceAuthorityImplementationDigest,
		"stageDigest":                         stageDigest, "dispatchAckDigest": dispatchAckDigest,
		"runtimeFactEnvelopes": []any{}, "factAuthorities": []any{},
	}
	var factBytes, runtimeEnvelopeBytes, factAuthorityBytes []byte
	var runtimeEnvelopeDigest, factAuthorityDigest, factKind, factDigest string
	if outcome == "observed" {
		fact, computedFactDigest, err := evaluationOptionalFactObservedValue(evidence.FactKind, evidence.Fact)
		if err != nil || evidence.FactDigest != computedFactDigest {
			return EvaluationOptionalFactAuthorityRecord{}, ErrConflict
		}
		factKind, factDigest = evidence.FactKind, computedFactDigest
		runtimeBase := map[string]any{
			"format": evaluationOptionalFactRuntimeEnvelopeFormat, "version": int64(1),
			"sourceAuthorityKind":                 "shared-durable-capability",
			"sourceAuthorityId":                   evidence.Target.SourceAuthorityID,
			"sourceAuthorityImplementationDigest": evidence.Target.SourceAuthorityImplementationDigest,
			"sourceKind":                          evidence.Target.SourceKind,
			"routeBinding":                        evidence.Target.SourceAuthorityRouteBinding,
			"registrationAuthorityIssuerId":       evidence.Target.RegistrationAuthorityIssuerID,
			"registrationReceiptDigest":           evidence.Target.RegistrationReceiptDigest,
			"runtimeFactSourceAuthorityDigest":    evidence.Target.TargetAuthorityDigest,
			"stageDigest":                         evidence.OwnerStageDigest,
			"dispatchAckDigest":                   evidence.OwnerDispatchAckDigest,
			"planDigest":                          partition.PlanDigest, "repositoryCommit": partition.RepositoryCommit,
			"attemptId": request.AttemptID, "descriptorDigest": request.DescriptorDigest,
			"turnIndex": json.Number(fmt.Sprintf("%d", request.TurnIndex)), "invocationId": request.InvocationID,
			"requestDigest": request.ProviderRequestDigest, "responseDigest": request.ResponseDigest,
			"protocolFamily": request.ProtocolFamily, "providerConfigurationId": request.ProviderConfigurationID,
			"modelLineageDigest": request.ModelLineageDigest, "adapterDigest": request.AdapterDigest,
			"dispatchIntentDigest": request.DispatchIntentDigest, "transportReceiptDigest": request.TransportReceiptDigest,
			"resultSpoolReceiptDigest": request.ResultSpoolReceiptDigest,
			"normalizedEventSetDigest": request.NormalizedEventSetDigest,
			"observedAt":               observedAt.Format("2006-01-02T15:04:05.000Z"), "fact": fact,
		}
		runtimeEnvelopeDigest, err = canonicaljson.Digest(runtimeBase)
		if err != nil {
			return EvaluationOptionalFactAuthorityRecord{}, err
		}
		runtimeEnvelope := cloneEvaluationObject(runtimeBase)
		runtimeEnvelope["envelopeDigest"] = runtimeEnvelopeDigest
		runtimeEnvelopeBytes, err = canonicaljson.Bytes(runtimeEnvelope)
		if err != nil || len(runtimeEnvelopeBytes) > maximumEvaluationOptionalFactAuthorityEnvelopeBytes {
			return EvaluationOptionalFactAuthorityRecord{}, ErrInvalid
		}
		factAuthorityBase := map[string]any{
			"format": evaluationOptionalFactAuthorityFormat, "version": int64(1),
			"factKind": factKind, "factDigest": factDigest,
			"sourceAuthorityKind":                 "shared-durable-capability",
			"sourceAuthorityId":                   evidence.Target.SourceAuthorityID,
			"sourceAuthorityImplementationDigest": evidence.Target.SourceAuthorityImplementationDigest,
			"sourceKind":                          evidence.Target.SourceKind,
			"routeBinding":                        evidence.Target.SourceAuthorityRouteBinding,
			"registrationAuthorityIssuerId":       evidence.Target.RegistrationAuthorityIssuerID,
			"registrationReceiptDigest":           evidence.Target.RegistrationReceiptDigest,
			"runtimeFactSourceAuthorityDigest":    evidence.Target.TargetAuthorityDigest,
			"stageDigest":                         evidence.OwnerStageDigest,
			"dispatchAckDigest":                   evidence.OwnerDispatchAckDigest,
			"transportReceiptDigest":              request.TransportReceiptDigest,
			"resultSpoolReceiptDigest":            request.ResultSpoolReceiptDigest,
			"normalizedEventSetDigest":            request.NormalizedEventSetDigest,
			"runtimeFactEnvelopeDigest":           runtimeEnvelopeDigest,
		}
		factAuthorityDigest, err = canonicaljson.Digest(factAuthorityBase)
		if err != nil {
			return EvaluationOptionalFactAuthorityRecord{}, err
		}
		factAuthority := cloneEvaluationObject(factAuthorityBase)
		factAuthority["authorityDigest"] = factAuthorityDigest
		factAuthorityBytes, err = canonicaljson.Bytes(factAuthority)
		if err != nil || len(factAuthorityBytes) > maximumEvaluationOptionalFactAuthorityEnvelopeBytes {
			return EvaluationOptionalFactAuthorityRecord{}, ErrInvalid
		}
		factBytes, err = canonicaljson.Bytes(fact)
		if err != nil || len(factBytes) > maximumEvaluationOptionalFactAuthorityEnvelopeBytes {
			return EvaluationOptionalFactAuthorityRecord{}, ErrInvalid
		}
		responseBase["runtimeFactEnvelopes"] = []any{runtimeEnvelope}
		responseBase["factAuthorities"] = []any{factAuthority}
	}
	resultDigest, err := canonicaljson.Digest(responseBase)
	if err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, err
	}
	response := cloneEvaluationObject(responseBase)
	response["resultDigest"] = resultDigest
	responseBytes, err := canonicaljson.Bytes(response)
	if err != nil || len(responseBytes) > maximumEvaluationOptionalFactAuthorityResponseBytes {
		return EvaluationOptionalFactAuthorityRecord{}, ErrInvalid
	}
	return EvaluationOptionalFactAuthorityRecord{
		NamespaceID: authority.NamespaceID, PlanDigest: partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit,
		AttemptID: request.AttemptID, DescriptorDigest: request.DescriptorDigest, TargetID: request.TargetID,
		TargetDigest: request.TargetDigest, CapabilityProfileID: request.CapabilityProfileID,
		CapabilityProfileDigest: request.CapabilityProfileDigest, CapabilityDescriptorDigest: request.CapabilityDescriptorDigest,
		CapabilityID: request.CapabilityID, SupportExpectation: request.SupportExpectation, TurnIndex: request.TurnIndex,
		InvocationID: request.InvocationID, ProtocolFamily: request.ProtocolFamily,
		ProviderConfigurationID: request.ProviderConfigurationID, ModelID: request.ModelID,
		ModelLineageDigest: request.ModelLineageDigest, AdapterDigest: request.AdapterDigest,
		ProviderRequestDigest: request.ProviderRequestDigest, ResponseDigest: request.ResponseDigest,
		DispatchIntentDigest: request.DispatchIntentDigest, TransportReceiptDigest: request.TransportReceiptDigest,
		ResultSpoolReceiptDigest: request.ResultSpoolReceiptDigest, NormalizedEventSetDigest: request.NormalizedEventSetDigest,
		TargetAuthorityDigest:               evidence.Target.TargetAuthorityDigest,
		SourceAuthorityID:                   evidence.Target.SourceAuthorityID,
		SourceAuthorityImplementationDigest: evidence.Target.SourceAuthorityImplementationDigest,
		SourceAuthorityRouteBinding:         evidence.Target.SourceAuthorityRouteBinding,
		SourceRegistrationAuthorityIssuerID: evidence.Target.RegistrationAuthorityIssuerID,
		SourceRegistrationReceiptDigest:     evidence.Target.RegistrationReceiptDigest,
		SourceKind:                          evidence.Kind, SourceDigest: evidence.SourceDigest,
		SourceOwnerRequestDigest: evidence.OwnerRequestDigest, SourceOwnerReceiptDigest: evidence.OwnerReceiptDigest,
		SourceOwnerStageDigest: evidence.OwnerStageDigest, SourceOwnerDispatchAckDigest: evidence.OwnerDispatchAckDigest,
		SourcePreEffectIntentDigest: evidence.PreEffectIntentDigest,
		SourceEffectReceiptDigest:   evidence.EffectSourceReceiptDigest,
		SourceEffectFactDigest:      evidence.EffectSourceFactDigest,
		SourceBusinessResultDigest:  evidence.BusinessResultDigest,
		AuthorityRequestDigest:      request.AuthorityRequestDigest, State: "sealed", ClaimGeneration: 1, V46Eligible: true,
		StageDigest: stageDigest, Outcome: outcome, FactKind: factKind, FactDigest: factDigest,
		DispatchAckDigest: dispatchAckDigest, RuntimeFactEnvelopeDigest: runtimeEnvelopeDigest,
		FactAuthorityDigest: factAuthorityDigest, ResultDigest: resultDigest,
		RequestBytes: append([]byte(nil), request.RequestBytes...), FactBytes: factBytes,
		RuntimeFactEnvelopeBytes: runtimeEnvelopeBytes, FactAuthorityBytes: factAuthorityBytes,
		ResponseBytes: responseBytes, SealedAt: observedAt,
	}, nil
}

func evaluationOptionalFactAuthorityResponseValue(record EvaluationOptionalFactAuthorityRecord) (map[string]any, error) {
	value, err := decodeCanonicalEvaluationObject(record.ResponseBytes, maximumEvaluationOptionalFactAuthorityResponseBytes)
	if err != nil || stringMember(value, "resultDigest") != record.ResultDigest {
		return nil, ErrConflict
	}
	return value, nil
}

func evaluationOptionalFactAuthorityEnvelopeSetDigest(records []EvaluationOptionalFactAuthorityRecord) (string, error) {
	digests := make([]string, 0, len(records))
	for _, record := range records {
		if record.Outcome == "observed" {
			if !evaluationDigestPattern.MatchString(record.RuntimeFactEnvelopeDigest) {
				return "", ErrConflict
			}
			digests = append(digests, record.RuntimeFactEnvelopeDigest)
		}
	}
	sort.Strings(digests)
	return canonicaljson.Digest(map[string]any{"runtimeFactEnvelopeDigests": digests})
}

func evaluationOptionalFactPlannedTurnDenominator(plan evaluationPlanFact) (int64, error) {
	rawTargets, ok := plan.Value["capabilityQualificationTargets"].([]any)
	if !ok {
		return 0, ErrInvalid
	}
	optionalTargets := make(map[string]struct{})
	for _, raw := range rawTargets {
		target, ok := raw.(map[string]any)
		if !ok {
			return 0, ErrInvalid
		}
		if _, optional := target["optionalCapabilitySupportAuthority"]; optional {
			optionalTargets[stringMember(target, "targetId")] = struct{}{}
		}
	}
	planned, err := evaluationStatusPlannedAttempts(plan)
	if err != nil {
		return 0, err
	}
	var attempts int64
	for _, attempt := range planned {
		if _, optional := optionalTargets[stringMember(attempt.Descriptor, "targetId")]; optional {
			attempts++
		}
	}
	turns := attempts * maximumEvaluationOptionalFactAuthorityTurns
	if turns < 0 || turns > maximumEvaluationOptionalFactAuthorityRecords {
		return 0, conflict("optional fact planned turn denominator exceeds the frozen G4 authority bound")
	}
	return turns, nil
}

func validateEvaluationOptionalFactArchiveFamilyBounds(
	plannedTurns int64,
	sourceCount int64,
	sourceBytes int64,
	authorityCount int64,
	authorityBytes int64,
) error {
	if plannedTurns < 0 || plannedTurns > maximumEvaluationOptionalFactAuthorityRecords ||
		sourceCount < 0 || sourceCount > plannedTurns || authorityCount < 0 || authorityCount > plannedTurns ||
		sourceBytes < 0 || sourceBytes > maximumEvaluationOptionalFactSourceArchiveBytes ||
		authorityBytes < 0 || authorityBytes > maximumEvaluationOptionalFactAuthorityArchiveBytes ||
		sourceBytes+authorityBytes > maximumEvaluationOptionalFactCombinedArchiveBytes {
		return conflict("optional fact raw archive family exceeds its frozen count or byte bound")
	}
	return nil
}

func equalEvaluationOptionalFactAuthorityRecordBytes(left, right EvaluationOptionalFactAuthorityRecord) bool {
	return bytes.Equal(left.RequestBytes, right.RequestBytes) && bytes.Equal(left.FactBytes, right.FactBytes) &&
		bytes.Equal(left.RuntimeFactEnvelopeBytes, right.RuntimeFactEnvelopeBytes) &&
		bytes.Equal(left.FactAuthorityBytes, right.FactAuthorityBytes) && bytes.Equal(left.ResponseBytes, right.ResponseBytes)
}
