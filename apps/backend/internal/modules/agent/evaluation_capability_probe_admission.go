package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationCapabilityProbeAdmissionRequestFormat       = "prodivix.agent-evaluation-capability-probe-admission-request"
	evaluationCapabilityProbeAdmissionResponseFormat      = "prodivix.agent-evaluation-capability-probe-admission-response"
	evaluationCapabilityProbeAdmissionStageFormat         = "prodivix.agent-evaluation-capability-probe-admission-stage"
	evaluationCapabilityProbeOwnerAdmissionFormat         = "prodivix.agent-evaluation-capability-probe-owner-admission"
	evaluationCapabilityProbeDispatchAckFormat            = "prodivix.agent-evaluation-capability-probe-dispatch-ack"
	evaluationCapabilityProbeAdmissionVersion             = int64(1)
	evaluationCapabilityProbeOperation                    = "capability.probe"
	evaluationCapabilityProbeRouteBinding                 = "capability-probe-admission"
	maximumEvaluationCapabilityProbeRequestBytes          = 1_048_576
	maximumEvaluationCapabilityProbeReferenceBytes        = 1_048_576
	maximumEvaluationCapabilityProbeResponseBytes         = 262_144
	maximumEvaluationCapabilityProbeAdmissions            = int64(18)
	maximumEvaluationCapabilityProbeReferences            = maximumEvaluationCapabilityProbeAdmissions * int64(len(evaluationCapabilityProbeReferenceKinds))
	maximumEvaluationCapabilityProbeAdmissionArchiveBytes = maximumEvaluationCapabilityProbeAdmissions *
		int64(maximumEvaluationCapabilityProbeRequestBytes+maximumEvaluationCapabilityProbeReferenceBytes+maximumEvaluationCapabilityProbeResponseBytes)
	maximumEvaluationCapabilityProbeReferenceArchiveBytes = maximumEvaluationCapabilityProbeAdmissions *
		int64(maximumEvaluationCapabilityProbeReferenceBytes)
)

var evaluationCapabilityProbeProfileCapability = map[string]string{
	"g4-provider-background-job":            "provider.background-job",
	"g4-provider-hosted-retrieval-core":     "provider.hosted-retrieval",
	"g4-provider-hosted-retrieval-document": "provider.hosted-retrieval",
	"g4-provider-parallel-tool":             "provider.parallel-tool",
	"g4-provider-isolated-cache":            "provider.isolated-cache",
	"g4-provider-reasoning-continuation":    "provider.reasoning-continuation",
}

var evaluationCapabilityProbeReferenceKinds = [...]string{
	"probe-request",
	"probe-response",
	"dispatch",
	"transport",
	"encrypted-response-spool",
	"normalized-event-set",
}

var evaluationCapabilityProbeReferenceFormats = [...]string{
	"prodivix.agent-evaluation-capability-probe-request",
	"prodivix.agent-evaluation-capability-probe-response",
	"prodivix.agent-evaluation-capability-probe-dispatch-receipt",
	"prodivix.agent-evaluation-capability-probe-transport-receipt",
	"prodivix.agent-evaluation-capability-probe-encrypted-response-spool-receipt",
	"prodivix.agent-evaluation-capability-probe-normalized-event-set-receipt",
}

func validateEvaluationCapabilityProbeArchiveFamilyBounds(
	admissionCount int64,
	admissionBytes int64,
	referenceCount int64,
	referenceBytes int64,
) error {
	if admissionCount < 0 || admissionCount > maximumEvaluationCapabilityProbeAdmissions ||
		admissionBytes < 0 || admissionBytes > maximumEvaluationCapabilityProbeAdmissionArchiveBytes ||
		referenceCount < 0 || referenceCount > maximumEvaluationCapabilityProbeReferences ||
		referenceBytes < 0 || referenceBytes > maximumEvaluationCapabilityProbeReferenceArchiveBytes {
		return conflict("evaluation capability probe raw archive family exceeds its frozen count or byte bound")
	}
	return nil
}

type evaluationCapabilityProbeAdmissionRequest struct {
	NamespaceID                          string
	RepositoryCommit                     string
	ProviderConfigurationID              string
	ProviderConfigurationDigest          string
	ProtocolFamily                       string
	ModelID                              string
	ModelLineageDigest                   string
	QualificationCapabilityProfileID     string
	QualificationCapabilityProfileDigest string
	CapabilityID                         string
	DeclaredCapabilityProfileDigests     []string
	DeclaredCapabilityProfileSetDigest   string
	ProbeProgram                         map[string]any
	ProbeProviderResourceAuthority       map[string]any
	Program                              evaluationCapabilityProbeProgram
	ProbeProgramDigest                   string
	ProfileProjectionDigest              string
	MinimumExpiresAt                     time.Time
	AdapterDigest                        string
	RequestDigest                        string
	ProviderConfiguration                map[string]any
	ModelLineage                         map[string]any
	Value                                map[string]any
	Bytes                                []byte
}

type EvaluationCapabilityProbeAdmissionAuthorityRequest struct {
	NamespaceID                  string
	RepositoryCommit             string
	RequestDigest                string
	OwnerImplementationDigest    string
	StageDigest                  string
	DispatchAckDigest            string
	SealedProbeObservation       json.RawMessage
	SealedProbeObservationDigest string
	ClaimGeneration              int64
	Request                      json.RawMessage
}

type EvaluationCapabilityProbeAdmissionAuthorityResult struct {
	ProbeEvidence        json.RawMessage
	OwnerAdmissionDigest string
}

type EvaluationCapabilityProbeAdmissionAuthority interface {
	CapabilityProbeAdmissionImplementationDigest() (string, bool)
	StageCapabilityProbeAdmission(context.Context, EvaluationCapabilityProbeAdmissionAuthorityRequest) (string, error)
	ExecuteCapabilityProbeAdmission(context.Context, EvaluationCapabilityProbeAdmissionAuthorityRequest) (EvaluationCapabilityProbeAdmissionAuthorityResult, error)
	ReconcileCapabilityProbeAdmission(context.Context, EvaluationCapabilityProbeAdmissionAuthorityRequest) (EvaluationCapabilityProbeAdmissionAuthorityResult, bool, error)
}

type EvaluationCapabilityProbeAdmissionRecord struct {
	NamespaceID                          string
	RepositoryCommit                     string
	RequestDigest                        string
	State                                string
	ClaimGeneration                      int64
	ProviderConfigurationID              string
	ProviderConfigurationDigest          string
	ProtocolFamily                       string
	ModelID                              string
	ModelLineageDigest                   string
	QualificationCapabilityProfileID     string
	QualificationCapabilityProfileDigest string
	CapabilityID                         string
	DeclaredCapabilityProfileSetDigest   string
	MinimumExpiresAt                     time.Time
	AdapterDigest                        string
	OwnerImplementationDigest            string
	StageDigest                          string
	DispatchAckDigest                    string
	AuthorityIssuerID                    string
	OwnerAdmissionDigest                 string
	ReferenceReceiptSetDigest            string
	EvidenceDigest                       string
	ProbeReceiptDigest                   string
	ProbeStatus                          string
	ObservedProfileDigest                string
	ProbedAt                             time.Time
	ExpiresAt                            time.Time
	AdmissionReceiptDigest               string
	ResponseDigest                       string
	RequestBytes                         []byte
	ReferenceBundleBytes                 []byte
	ResponseBytes                        []byte
	ClaimedAt                            time.Time
	DispatchedAt                         time.Time
	SealedAt                             time.Time
}

type evaluationCapabilityProbeAdmissionRepository interface {
	ClaimEvaluationCapabilityProbeAdmission(
		context.Context,
		EvaluationAuthority,
		evaluationCapabilityProbeAdmissionRequest,
		string,
		time.Time,
	) (EvaluationCapabilityProbeAdmissionRecord, bool, error)
	MarkEvaluationCapabilityProbeAdmissionDispatched(
		context.Context,
		EvaluationAuthority,
		evaluationCapabilityProbeAdmissionRequest,
		string,
		time.Time,
	) (EvaluationCapabilityProbeAdmissionRecord, bool, error)
	LoadEvaluationCapabilityProbeReferenceBundle(
		context.Context,
		EvaluationAuthority,
		evaluationCapabilityProbeAdmissionRequest,
		string,
		json.RawMessage,
	) ([]byte, error)
	AcknowledgeEvaluationCapabilityProbeAdmission(
		context.Context,
		EvaluationAuthority,
		evaluationCapabilityProbeAdmissionRequest,
		evaluationCapabilityProbeAdmissionSealedValue,
		time.Time,
	) (EvaluationCapabilityProbeAdmissionRecord, bool, error)
	SealEvaluationCapabilityProbeAdmission(
		context.Context,
		EvaluationAuthority,
		evaluationCapabilityProbeAdmissionRequest,
		string,
		string,
		time.Time,
	) (EvaluationCapabilityProbeAdmissionRecord, bool, error)
}

type evaluationCapabilityProbeAdmissionSealedValue struct {
	AuthorityIssuerID         string
	OwnerAdmissionDigest      string
	ReferenceReceiptSetDigest string
	EvidenceDigest            string
	ProbeReceiptDigest        string
	ProbeStatus               string
	ObservedProfileDigest     string
	ProbedAt                  time.Time
	ExpiresAt                 time.Time
	AdmissionReceiptDigest    string
	ResponseDigest            string
	DispatchAckDigest         string
	ReferenceBundleBytes      []byte
	ResponseBytes             []byte
}

func evaluationCapabilityProbeCanonicalObject(value any, maximum int) (map[string]any, error) {
	object, ok := value.(map[string]any)
	if !ok {
		return nil, ErrInvalid
	}
	encoded, err := canonicaljson.Bytes(object)
	if err != nil || len(encoded) == 0 || len(encoded) > maximum {
		return nil, ErrInvalid
	}
	return object, nil
}

func evaluationCapabilityProbeProvider(
	value any,
) (map[string]any, string, string, string, string, error) {
	provider, err := evaluationCapabilityProbeCanonicalObject(value, 65_536)
	if err != nil || !exactEvaluationKeys(provider, []string{
		"providerConfigurationId", "providerOperatorId", "endpointClass", "endpointProfileDigest",
		"adapter", "dataPolicyDigest",
	}, "providerRegion", "apiRevision") ||
		!validEvaluationAgentControlIdentity(stringMember(provider, "providerConfigurationId")) ||
		!validEvaluationAgentControlIdentity(stringMember(provider, "providerOperatorId")) ||
		!oneOfString(stringMember(provider, "endpointClass"), "first-party-hosted", "aggregator", "self-hosted", "local") {
		return nil, "", "", "", "", ErrInvalid
	}
	for _, field := range []string{"endpointProfileDigest", "dataPolicyDigest"} {
		if !evaluationDigestPattern.MatchString(stringMember(provider, field)) {
			return nil, "", "", "", "", ErrInvalid
		}
	}
	for _, field := range []string{"providerRegion", "apiRevision"} {
		if raw, exists := provider[field]; exists {
			text, ok := raw.(string)
			if !ok || !validEvaluationAgentControlIdentity(text) {
				return nil, "", "", "", "", ErrInvalid
			}
		}
	}
	adapter, ok := objectMember(provider, "adapter")
	if !ok || !exactEvaluationKeys(adapter, []string{
		"adapterId", "adapterVersion", "adapterDigest", "protocolFamily",
		"transportSchemaDigest", "eventNormalizationDigest",
	}) || !validEvaluationAgentControlIdentity(stringMember(adapter, "adapterId")) ||
		!validEvaluationAgentControlIdentity(stringMember(adapter, "adapterVersion")) ||
		!oneOfString(stringMember(adapter, "protocolFamily"),
			"openai-responses", "anthropic-messages", "gemini-interactions", "openai-compatible") {
		return nil, "", "", "", "", ErrInvalid
	}
	for _, field := range []string{"adapterDigest", "transportSchemaDigest", "eventNormalizationDigest"} {
		if !evaluationDigestPattern.MatchString(stringMember(adapter, field)) {
			return nil, "", "", "", "", ErrInvalid
		}
	}
	adapterBase := cloneEvaluationObject(adapter)
	delete(adapterBase, "adapterDigest")
	adapterDigest, digestErr := canonicaljson.Digest(adapterBase)
	providerDigest, providerErr := canonicaljson.Digest(provider)
	if digestErr != nil || providerErr != nil || adapterDigest != stringMember(adapter, "adapterDigest") {
		return nil, "", "", "", "", ErrConflict
	}
	return provider, stringMember(provider, "providerConfigurationId"), providerDigest,
		stringMember(adapter, "protocolFamily"), adapterDigest, nil
}

func evaluationCapabilityProbeModel(value any) (map[string]any, string, string, error) {
	model, err := evaluationCapabilityProbeCanonicalObject(value, 65_536)
	if err != nil || !exactEvaluationKeys(model, []string{
		"modelId", "modelFamilyId", "modelFamilyOwnerId", "lineageDigest",
	}, "immutableVersion", "baseModelRef", "fineTuneRef", "tokenizerDigest", "chatTemplateDigest",
		"quantizationDigest", "runtimeBackendDigest") {
		return nil, "", "", ErrInvalid
	}
	for _, field := range []string{"modelId", "modelFamilyId", "modelFamilyOwnerId"} {
		if !validEvaluationAgentControlIdentity(stringMember(model, field)) {
			return nil, "", "", ErrInvalid
		}
	}
	if raw, exists := model["immutableVersion"]; exists {
		text, ok := raw.(string)
		if !ok || !validEvaluationAgentControlIdentity(text) {
			return nil, "", "", ErrInvalid
		}
	}
	for _, field := range []string{"tokenizerDigest", "chatTemplateDigest", "quantizationDigest", "runtimeBackendDigest"} {
		if raw, exists := model[field]; exists {
			text, ok := raw.(string)
			if !ok || !evaluationDigestPattern.MatchString(text) {
				return nil, "", "", ErrInvalid
			}
		}
	}
	if raw, exists := model["baseModelRef"]; exists {
		base, ok := raw.(map[string]any)
		if !ok || !exactEvaluationKeys(base, []string{"modelId", "lineageDigest"}) ||
			!validEvaluationAgentControlIdentity(stringMember(base, "modelId")) ||
			!evaluationDigestPattern.MatchString(stringMember(base, "lineageDigest")) {
			return nil, "", "", ErrInvalid
		}
	}
	if raw, exists := model["fineTuneRef"]; exists {
		fineTune, ok := raw.(map[string]any)
		if !ok || !exactEvaluationKeys(fineTune, []string{
			"fineTuneId", "jobId", "deploymentId", "baseModelLineageDigest",
			"trainingPolicyDigest", "disclosedDataLineageDigest",
		}) {
			return nil, "", "", ErrInvalid
		}
		for _, field := range []string{"fineTuneId", "jobId", "deploymentId"} {
			if !validEvaluationAgentControlIdentity(stringMember(fineTune, field)) {
				return nil, "", "", ErrInvalid
			}
		}
		for _, field := range []string{"baseModelLineageDigest", "trainingPolicyDigest", "disclosedDataLineageDigest"} {
			if !evaluationDigestPattern.MatchString(stringMember(fineTune, field)) {
				return nil, "", "", ErrInvalid
			}
		}
	}
	lineageBase := cloneEvaluationObject(model)
	delete(lineageBase, "lineageDigest")
	lineageDigest, digestErr := canonicaljson.Digest(lineageBase)
	if digestErr != nil || lineageDigest != stringMember(model, "lineageDigest") {
		return nil, "", "", ErrConflict
	}
	return model, stringMember(model, "modelId"), lineageDigest, nil
}

func decodeEvaluationCapabilityProbeAdmissionRequest(
	source []byte,
	authority EvaluationAuthority,
) (evaluationCapabilityProbeAdmissionRequest, error) {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationCapabilityProbeRequestBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "repositoryCommit", "providerConfiguration", "modelLineage",
		"qualificationCapabilityProfileId", "qualificationCapabilityProfileDigest", "capabilityId",
		"declaredCapabilityProfileDigests", "probeProgram", "probeProviderResourceAuthority", "minimumExpiresAt", "requestDigest",
	}) || stringMember(value, "format") != evaluationCapabilityProbeAdmissionRequestFormat ||
		stringMember(value, "namespaceId") != authority.NamespaceID ||
		!validEvaluationAgentControlIdentity(stringMember(value, "namespaceId")) ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "qualificationCapabilityProfileId")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "capabilityId")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "qualificationCapabilityProfileDigest")) {
		return evaluationCapabilityProbeAdmissionRequest{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	if !versionOK || version != evaluationCapabilityProbeAdmissionVersion ||
		evaluationCapabilityProbeProfileCapability[stringMember(value, "qualificationCapabilityProfileId")] != stringMember(value, "capabilityId") {
		return evaluationCapabilityProbeAdmissionRequest{}, ErrInvalid
	}
	provider, providerID, providerDigest, protocol, adapterDigest, err :=
		evaluationCapabilityProbeProvider(value["providerConfiguration"])
	if err != nil {
		return evaluationCapabilityProbeAdmissionRequest{}, err
	}
	model, modelID, lineageDigest, err := evaluationCapabilityProbeModel(value["modelLineage"])
	if err != nil {
		return evaluationCapabilityProbeAdmissionRequest{}, err
	}
	rawDeclared, ok := value["declaredCapabilityProfileDigests"].([]any)
	if !ok || len(rawDeclared) == 0 || len(rawDeclared) > 128 {
		return evaluationCapabilityProbeAdmissionRequest{}, ErrInvalid
	}
	declared := make([]string, len(rawDeclared))
	for index, raw := range rawDeclared {
		digest, ok := raw.(string)
		if !ok || !evaluationDigestPattern.MatchString(digest) || index > 0 && declared[index-1] >= digest {
			return evaluationCapabilityProbeAdmissionRequest{}, ErrInvalid
		}
		declared[index] = digest
	}
	if sort.StringsAreSorted(declared) == false {
		return evaluationCapabilityProbeAdmissionRequest{}, ErrInvalid
	}
	program, err := decodeEvaluationCapabilityProbeProgram(
		value["probeProgram"], stringMember(value, "qualificationCapabilityProfileId"),
		stringMember(value, "qualificationCapabilityProfileDigest"), stringMember(value, "capabilityId"),
	)
	if err != nil {
		return evaluationCapabilityProbeAdmissionRequest{}, err
	}
	minimumExpiresAt, timeErr := parseEvaluationServiceInstant(stringMember(value, "minimumExpiresAt"))
	resourceRequired := stringMember(value, "capabilityId") == "provider.hosted-retrieval" &&
		oneOfString(protocol, "gemini-interactions", "openai-responses")
	resourceAuthority, hasResourceAuthority := value["probeProviderResourceAuthority"].(map[string]any)
	if resourceRequired != hasResourceAuthority {
		return evaluationCapabilityProbeAdmissionRequest{}, ErrConflict
	}
	if hasResourceAuthority {
		resourceAuthority, err = decodeEvaluationCapabilityProbeProviderResourceAuthority(
			resourceAuthority, program, protocol, providerID, modelID, lineageDigest, adapterDigest, minimumExpiresAt,
		)
		if err != nil {
			return evaluationCapabilityProbeAdmissionRequest{}, err
		}
	}
	base := cloneEvaluationObject(value)
	delete(base, "requestDigest")
	requestDigest, digestErr := canonicaljson.Digest(base)
	declaredDigest, declaredErr := canonicaljson.Digest(rawDeclared)
	if timeErr != nil || digestErr != nil || declaredErr != nil ||
		requestDigest != stringMember(value, "requestDigest") ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return evaluationCapabilityProbeAdmissionRequest{}, ErrConflict
	}
	return evaluationCapabilityProbeAdmissionRequest{
		NamespaceID: authority.NamespaceID, RepositoryCommit: stringMember(value, "repositoryCommit"),
		ProviderConfigurationID: providerID, ProviderConfigurationDigest: providerDigest,
		ProtocolFamily: protocol, ModelID: modelID, ModelLineageDigest: lineageDigest,
		QualificationCapabilityProfileID:     stringMember(value, "qualificationCapabilityProfileId"),
		QualificationCapabilityProfileDigest: stringMember(value, "qualificationCapabilityProfileDigest"),
		CapabilityID:                         stringMember(value, "capabilityId"), DeclaredCapabilityProfileDigests: declared,
		DeclaredCapabilityProfileSetDigest: declaredDigest, ProbeProgram: program.Value, Program: program,
		ProbeProviderResourceAuthority: resourceAuthority,
		ProbeProgramDigest:             program.ProgramDigest, ProfileProjectionDigest: program.ProfileProjectionDigest,
		MinimumExpiresAt: minimumExpiresAt,
		AdapterDigest:    adapterDigest, RequestDigest: requestDigest,
		ProviderConfiguration: provider, ModelLineage: model, Value: value, Bytes: append([]byte(nil), source...),
	}, nil
}

func evaluationCapabilityProbeStageDigest(
	request evaluationCapabilityProbeAdmissionRequest,
	ownerImplementationDigest string,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format": evaluationCapabilityProbeAdmissionStageFormat, "version": evaluationCapabilityProbeAdmissionVersion,
		"requestDigest": request.RequestDigest, "ownerImplementationDigest": ownerImplementationDigest,
	})
}

func evaluationCapabilityProbeOwnerAdmissionDigest(
	requestDigest string,
	evidenceDigest string,
	ownerImplementationDigest string,
	stageDigest string,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format": evaluationCapabilityProbeOwnerAdmissionFormat, "version": evaluationCapabilityProbeAdmissionVersion,
		"requestDigest": requestDigest, "evidenceDigest": evidenceDigest,
		"ownerImplementationDigest": ownerImplementationDigest, "stageDigest": stageDigest,
	})
}

func evaluationCapabilityProbeDispatchAckDigest(
	requestDigest string,
	evidenceDigest string,
	ownerImplementationDigest string,
	ownerAdmissionDigest string,
	stageDigest string,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format": evaluationCapabilityProbeDispatchAckFormat, "version": evaluationCapabilityProbeAdmissionVersion,
		"requestDigest": requestDigest, "evidenceDigest": evidenceDigest,
		"ownerImplementationDigest": ownerImplementationDigest, "ownerAdmissionDigest": ownerAdmissionDigest,
		"stageDigest": stageDigest,
	})
}

func evaluationCapabilityProbeReferenceBundle(
	source json.RawMessage,
	evidence map[string]any,
	request evaluationCapabilityProbeAdmissionRequest,
	ownerImplementationDigest string,
) ([]byte, string, error) {
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var raw any
	if err := decoder.Decode(&raw); err != nil || decoder.Decode(&struct{}{}) == nil {
		return nil, "", ErrInvalid
	}
	entries, ok := raw.([]any)
	if !ok || len(entries) != len(evaluationCapabilityProbeReferenceKinds) {
		return nil, "", ErrInvalid
	}
	rootEntries := make([]any, len(entries))
	evidenceFields := [...]string{
		"probeRequestDigest", "probeResponseDigest", "dispatchReceiptDigest", "transportReceiptDigest",
		"responseSpoolDigest", "normalizedEventSetDigest",
	}
	for index, rawEntry := range entries {
		entry, ok := rawEntry.(map[string]any)
		if !ok || !exactEvaluationKeys(entry, []string{"kind", "receipt", "receiptDigest"}) ||
			stringMember(entry, "kind") != evaluationCapabilityProbeReferenceKinds[index] ||
			!evaluationDigestPattern.MatchString(stringMember(entry, "receiptDigest")) ||
			stringMember(entry, "receiptDigest") != stringMember(evidence, evidenceFields[index]) ||
			agentcontract.ValidateSanitizedAgentPayload(entry["receipt"]) != nil {
			return nil, "", ErrConflict
		}
		receipt, ok := entry["receipt"].(map[string]any)
		if !ok || !exactEvaluationKeys(receipt, []string{
			"format", "version", "admissionRequestDigest", "providerConfigurationDigest",
			"modelLineageDigest", "qualificationCapabilityProfileDigest", "capabilityId",
			"probeProgramDigest", "profileProjectionDigest",
			"adapterDigest", "ownerImplementationDigest", "authorityIssuerId",
			"previousReceiptDigest", "observedAt", "sourceReceipt", "sourceReceiptDigest",
		}) || stringMember(receipt, "format") != evaluationCapabilityProbeReferenceFormats[index] ||
			stringMember(receipt, "admissionRequestDigest") != request.RequestDigest ||
			stringMember(receipt, "providerConfigurationDigest") != request.ProviderConfigurationDigest ||
			stringMember(receipt, "modelLineageDigest") != request.ModelLineageDigest ||
			stringMember(receipt, "qualificationCapabilityProfileDigest") != request.QualificationCapabilityProfileDigest ||
			stringMember(receipt, "capabilityId") != request.CapabilityID ||
			stringMember(receipt, "probeProgramDigest") != request.ProbeProgramDigest ||
			stringMember(receipt, "profileProjectionDigest") != request.ProfileProjectionDigest ||
			stringMember(receipt, "adapterDigest") != request.AdapterDigest ||
			stringMember(receipt, "ownerImplementationDigest") != ownerImplementationDigest ||
			stringMember(receipt, "authorityIssuerId") != stringMember(evidence, "authorityIssuerId") ||
			!validEvaluationAgentControlIdentity(stringMember(receipt, "authorityIssuerId")) {
			return nil, "", ErrConflict
		}
		version, versionOK := integerMember(receipt, "version")
		_, observedErr := parseEvaluationServiceInstant(stringMember(receipt, "observedAt"))
		previous, previousExists := receipt["previousReceiptDigest"]
		if !versionOK || version != evaluationCapabilityProbeAdmissionVersion || observedErr != nil ||
			(index == 0 && (previousExists == false || previous != nil)) ||
			(index > 0 && stringMember(receipt, "previousReceiptDigest") != stringMember(entries[index-1].(map[string]any), "receiptDigest")) ||
			!evaluationDigestPattern.MatchString(stringMember(receipt, "sourceReceiptDigest")) ||
			agentcontract.ValidateSanitizedAgentPayload(receipt["sourceReceipt"]) != nil {
			return nil, "", ErrConflict
		}
		sourceReceiptDigest, sourceErr := canonicaljson.Digest(receipt["sourceReceipt"])
		if sourceErr != nil || sourceReceiptDigest != stringMember(receipt, "sourceReceiptDigest") {
			return nil, "", ErrConflict
		}
		receiptDigest, err := canonicaljson.Digest(entry["receipt"])
		if err != nil || receiptDigest != stringMember(entry, "receiptDigest") {
			return nil, "", ErrConflict
		}
		rootEntries[index] = map[string]any{"kind": stringMember(entry, "kind"), "receiptDigest": receiptDigest}
	}
	if err := validateEvaluationCapabilityProbeTypedReferenceBundle(
		entries, evidence, request, ownerImplementationDigest,
	); err != nil {
		return nil, "", err
	}
	canonical, err := canonicaljson.Bytes(entries)
	if err != nil || len(canonical) == 0 || len(canonical) > maximumEvaluationCapabilityProbeReferenceBytes ||
		!bytes.Equal(canonical, source) {
		return nil, "", ErrInvalid
	}
	root, err := canonicaljson.Digest(map[string]any{"references": rootEntries})
	return canonical, root, err
}

func evaluationCapabilityProbeEvidence(
	request evaluationCapabilityProbeAdmissionRequest,
	ownerImplementationDigest string,
	stageDigest string,
	result EvaluationCapabilityProbeAdmissionAuthorityResult,
	referenceBundle json.RawMessage,
	now time.Time,
) (evaluationCapabilityProbeAdmissionSealedValue, error) {
	evidence, err := decodeCanonicalEvaluationObject(result.ProbeEvidence, 65_536)
	if err != nil || !exactEvaluationKeys(evidence, []string{
		"authorityKind", "authorityIssuerId", "ownerImplementationDigest", "adapterDigest",
		"probeRequestDigest", "probeResponseDigest", "dispatchReceiptDigest", "transportReceiptDigest",
		"responseSpoolDigest", "normalizedEventSetDigest", "probeProgram", "normalizedObservation",
		"receipt", "evidenceDigest",
	}) || stringMember(evidence, "authorityKind") != "sealed-provider-capability-probe" ||
		!validEvaluationAgentControlIdentity(stringMember(evidence, "authorityIssuerId")) ||
		stringMember(evidence, "ownerImplementationDigest") != ownerImplementationDigest ||
		stringMember(evidence, "adapterDigest") != request.AdapterDigest ||
		agentcontract.ValidateSanitizedAgentPayload(evidence) != nil {
		return evaluationCapabilityProbeAdmissionSealedValue{}, conflict("evaluation capability probe evidence shape or owner binding drifted")
	}
	for _, field := range []string{
		"ownerImplementationDigest", "adapterDigest", "probeRequestDigest", "probeResponseDigest",
		"dispatchReceiptDigest", "transportReceiptDigest", "responseSpoolDigest", "normalizedEventSetDigest",
		"evidenceDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(evidence, field)) {
			return evaluationCapabilityProbeAdmissionSealedValue{}, ErrInvalid
		}
	}
	evidenceBase := cloneEvaluationObject(evidence)
	delete(evidenceBase, "evidenceDigest")
	evidenceDigest, digestErr := canonicaljson.Digest(evidenceBase)
	if digestErr != nil || evidenceDigest != stringMember(evidence, "evidenceDigest") {
		return evaluationCapabilityProbeAdmissionSealedValue{}, conflict("evaluation capability probe evidence digest drifted")
	}
	program, err := decodeEvaluationCapabilityProbeProgram(
		evidence["probeProgram"], request.QualificationCapabilityProfileID,
		request.QualificationCapabilityProfileDigest, request.CapabilityID,
	)
	if err != nil || !sameEvaluationCanonicalValue(program.Value, request.ProbeProgram) {
		return evaluationCapabilityProbeAdmissionSealedValue{}, conflict("evaluation capability probe program drifted")
	}
	observation, observedAt, err := decodeEvaluationCapabilityProbeObservation(
		evidence["normalizedObservation"], program, request,
	)
	if err != nil || stringMember(observation, "probeRequestDigest") != stringMember(evidence, "probeRequestDigest") ||
		stringMember(observation, "providerResponseDigest") != stringMember(evidence, "probeResponseDigest") ||
		stringMember(observation, "normalizedEventSetDigest") != stringMember(evidence, "normalizedEventSetDigest") {
		return evaluationCapabilityProbeAdmissionSealedValue{}, conflict("evaluation capability probe normalized observation drifted")
	}
	receipt, ok := objectMember(evidence, "receipt")
	if !ok || !exactEvaluationKeys(receipt, []string{
		"probeId", "providerConfigurationDigest", "modelLineageDigest", "requestedProfileDigest",
		"declaredCapabilityDigest", "probedCapabilityDigest", "status", "observedLimitDigest",
		"probeProgramDigest", "profileProjectionDigest", "normalizedObservationDigest",
		"probedAt", "expiresAt", "receiptDigest",
	}, "observedProfileDigest") || !validEvaluationAgentControlIdentity(stringMember(receipt, "probeId")) ||
		!oneOfString(stringMember(receipt, "status"), "supported", "unsupported") {
		return evaluationCapabilityProbeAdmissionSealedValue{}, conflict("evaluation capability probe receipt shape drifted")
	}
	for _, field := range []string{
		"providerConfigurationDigest", "modelLineageDigest", "requestedProfileDigest", "declaredCapabilityDigest",
		"probedCapabilityDigest", "observedLimitDigest", "probeProgramDigest", "profileProjectionDigest",
		"normalizedObservationDigest", "receiptDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(receipt, field)) {
			return evaluationCapabilityProbeAdmissionSealedValue{}, ErrInvalid
		}
	}
	probedAt, firstErr := parseEvaluationServiceInstant(stringMember(receipt, "probedAt"))
	expiresAt, secondErr := parseEvaluationServiceInstant(stringMember(receipt, "expiresAt"))
	observedProfile, observed := receipt["observedProfileDigest"]
	status := stringMember(receipt, "status")
	if firstErr != nil || secondErr != nil || !expiresAt.After(probedAt) || probedAt.After(now) ||
		!probedAt.Equal(observedAt) ||
		expiresAt.Before(request.MinimumExpiresAt) ||
		stringMember(receipt, "providerConfigurationDigest") != request.ProviderConfigurationDigest ||
		stringMember(receipt, "modelLineageDigest") != request.ModelLineageDigest ||
		stringMember(receipt, "requestedProfileDigest") != request.QualificationCapabilityProfileDigest ||
		stringMember(receipt, "declaredCapabilityDigest") != request.DeclaredCapabilityProfileSetDigest ||
		stringMember(receipt, "probeProgramDigest") != program.ProgramDigest ||
		stringMember(receipt, "profileProjectionDigest") != program.ProfileProjectionDigest ||
		stringMember(receipt, "normalizedObservationDigest") != stringMember(observation, "observationDigest") ||
		stringMember(receipt, "status") != stringMember(observation, "status") ||
		stringMember(receipt, "observedLimitDigest") != stringMember(observation, "observedLimitDigest") ||
		(observed && !evaluationDigestPattern.MatchString(stringMember(receipt, "observedProfileDigest"))) ||
		(status == "supported" && (!observed || stringMember(receipt, "observedProfileDigest") != request.QualificationCapabilityProfileDigest)) ||
		(status == "unsupported" && observed) {
		return evaluationCapabilityProbeAdmissionSealedValue{}, conflict("evaluation capability probe receipt binding drifted")
	}
	probedCapabilityDigest, thirdErr := canonicaljson.Digest(map[string]any{
		"normalizedObservationDigest": receipt["normalizedObservationDigest"],
		"observedLimitDigest":         receipt["observedLimitDigest"],
		"observedProfileDigest": func() any {
			if observed {
				return observedProfile
			}
			return nil
		}(),
		"probeProgramDigest":      receipt["probeProgramDigest"],
		"profileProjectionDigest": receipt["profileProjectionDigest"], "status": status,
	})
	receiptBase := cloneEvaluationObject(receipt)
	delete(receiptBase, "receiptDigest")
	receiptDigest, fourthErr := canonicaljson.Digest(receiptBase)
	if thirdErr != nil || fourthErr != nil || probedCapabilityDigest != stringMember(receipt, "probedCapabilityDigest") ||
		receiptDigest != stringMember(receipt, "receiptDigest") {
		return evaluationCapabilityProbeAdmissionSealedValue{}, conflict("evaluation capability probe receipt digest drifted")
	}
	referenceBytes, referenceRoot, err := evaluationCapabilityProbeReferenceBundle(
		referenceBundle, evidence, request, ownerImplementationDigest,
	)
	if err != nil {
		return evaluationCapabilityProbeAdmissionSealedValue{}, err
	}
	expectedOwner, err := evaluationCapabilityProbeOwnerAdmissionDigest(
		request.RequestDigest, evidenceDigest, ownerImplementationDigest, stageDigest,
	)
	if err != nil || result.OwnerAdmissionDigest != expectedOwner {
		return evaluationCapabilityProbeAdmissionSealedValue{}, conflict("evaluation capability probe owner admission drifted")
	}
	dispatchAckDigest, err := evaluationCapabilityProbeDispatchAckDigest(
		request.RequestDigest, evidenceDigest, ownerImplementationDigest, expectedOwner, stageDigest,
	)
	if err != nil {
		return evaluationCapabilityProbeAdmissionSealedValue{}, err
	}
	base := map[string]any{
		"format": evaluationCapabilityProbeAdmissionResponseFormat, "version": evaluationCapabilityProbeAdmissionVersion,
		"requestDigest": request.RequestDigest, "probeEvidence": evidence,
		"ownerImplementationDigest": ownerImplementationDigest, "ownerAdmissionDigest": expectedOwner,
		"stageDigest": stageDigest, "dispatchAckDigest": dispatchAckDigest,
	}
	admissionReceiptDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return evaluationCapabilityProbeAdmissionSealedValue{}, err
	}
	base["admissionReceiptDigest"] = admissionReceiptDigest
	responseBytes, err := canonicaljson.Bytes(base)
	if err != nil || len(responseBytes) > maximumEvaluationCapabilityProbeResponseBytes {
		return evaluationCapabilityProbeAdmissionSealedValue{}, ErrInvalid
	}
	responseDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return evaluationCapabilityProbeAdmissionSealedValue{}, err
	}
	return evaluationCapabilityProbeAdmissionSealedValue{
		AuthorityIssuerID: stringMember(evidence, "authorityIssuerId"), OwnerAdmissionDigest: expectedOwner,
		ReferenceReceiptSetDigest: referenceRoot, EvidenceDigest: evidenceDigest,
		ProbeReceiptDigest: receiptDigest, ProbeStatus: status,
		ObservedProfileDigest: stringMember(receipt, "observedProfileDigest"), ProbedAt: probedAt, ExpiresAt: expiresAt,
		AdmissionReceiptDigest: admissionReceiptDigest, ResponseDigest: responseDigest,
		DispatchAckDigest: dispatchAckDigest, ReferenceBundleBytes: referenceBytes, ResponseBytes: responseBytes,
	}, nil
}

func validateEvaluationCapabilityProbeAdmissionResponse(
	source []byte,
	request evaluationCapabilityProbeAdmissionRequest,
	ownerImplementationDigest string,
	stageDigest string,
	dispatchAckDigest string,
) error {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationCapabilityProbeResponseBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "requestDigest", "probeEvidence", "ownerImplementationDigest",
		"ownerAdmissionDigest", "stageDigest", "dispatchAckDigest", "admissionReceiptDigest",
	}) || stringMember(value, "format") != evaluationCapabilityProbeAdmissionResponseFormat ||
		stringMember(value, "requestDigest") != request.RequestDigest ||
		stringMember(value, "ownerImplementationDigest") != ownerImplementationDigest ||
		stringMember(value, "stageDigest") != stageDigest ||
		stringMember(value, "dispatchAckDigest") != dispatchAckDigest {
		return ErrConflict
	}
	version, versionOK := integerMember(value, "version")
	base := cloneEvaluationObject(value)
	delete(base, "admissionReceiptDigest")
	digest, digestErr := canonicaljson.Digest(base)
	if !versionOK || version != evaluationCapabilityProbeAdmissionVersion || digestErr != nil ||
		digest != stringMember(value, "admissionReceiptDigest") ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return ErrConflict
	}
	return nil
}

func evaluationCapabilityProbeSealedObservation(
	record EvaluationCapabilityProbeAdmissionRecord,
) (json.RawMessage, string, error) {
	response, err := decodeCanonicalEvaluationObject(record.ResponseBytes, maximumEvaluationCapabilityProbeResponseBytes)
	if err != nil || !evaluationDigestPattern.MatchString(stringMember(response, "ownerAdmissionDigest")) {
		return nil, "", ErrConflict
	}
	decoder := json.NewDecoder(bytes.NewReader(record.ReferenceBundleBytes))
	decoder.UseNumber()
	var references any
	if err := decoder.Decode(&references); err != nil || decoder.Decode(&struct{}{}) == nil {
		return nil, "", ErrConflict
	}
	value := map[string]any{
		"probeEvidence": response["probeEvidence"], "referenceBundle": references,
		"ownerAdmissionDigest": stringMember(response, "ownerAdmissionDigest"),
	}
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || len(canonical) > maximumEvaluationCapabilityProbeReferenceBytes+65_536 {
		return nil, "", ErrInvalid
	}
	digest, err := canonicaljson.Digest(value)
	return canonical, digest, err
}

func (handler *EvaluationServiceHandler) handleEvaluationCapabilityProbeAdmission(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	if !evaluationServiceQueryIsExact(request) || handler.capabilityProbeAdmissionAuthority == nil {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	repository, ok := handler.repository.(evaluationCapabilityProbeAdmissionRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationCapabilityProbeRequestBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	admission, err := decodeEvaluationCapabilityProbeAdmissionRequest(source, handler.authority)
	if err != nil || !exactEvaluationIdempotencyHeader(request, admission.RequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	ownerImplementationDigest, ready := handler.capabilityProbeAdmissionAuthority.CapabilityProbeAdmissionImplementationDigest()
	if !ready || !evaluationDigestPattern.MatchString(ownerImplementationDigest) {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	now := handler.clock().UTC().Truncate(time.Millisecond)
	record, _, err := repository.ClaimEvaluationCapabilityProbeAdmission(
		request.Context(), handler.authority, admission, ownerImplementationDigest, now,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeResponse := func(bytes []byte) error {
		if err := validateEvaluationCapabilityProbeAdmissionResponse(
			bytes, admission, ownerImplementationDigest, record.StageDigest, record.DispatchAckDigest,
		); err != nil {
			return err
		}
		if handler.attemptAuthorityResponseScanner != nil {
			if err := handler.attemptAuthorityResponseScanner.ScanAttemptAuthorityPublicResponse(
				request.Context(), evaluationCapabilityProbeOperation, admission.RequestDigest, bytes,
			); err != nil {
				return ErrUnauthorized
			}
		}
		writeEvaluationServiceRaw(writer, http.StatusOK, bytes)
		return nil
	}
	if record.State == "sealed" {
		if err := writeResponse(record.ResponseBytes); err != nil {
			respondEvaluationServiceError(writer, err)
		}
		return
	}
	authorityRequest := EvaluationCapabilityProbeAdmissionAuthorityRequest{
		NamespaceID: handler.authority.NamespaceID, RepositoryCommit: admission.RepositoryCommit,
		RequestDigest: admission.RequestDigest, OwnerImplementationDigest: ownerImplementationDigest,
		StageDigest: record.StageDigest, DispatchAckDigest: record.DispatchAckDigest,
		ClaimGeneration: record.ClaimGeneration, Request: append(json.RawMessage(nil), admission.Bytes...),
	}
	var sealed evaluationCapabilityProbeAdmissionSealedValue
	if record.State == "claimed" {
		stageDigest, stageErr := handler.capabilityProbeAdmissionAuthority.StageCapabilityProbeAdmission(
			request.Context(), authorityRequest,
		)
		expectedStage, expectedErr := evaluationCapabilityProbeStageDigest(admission, ownerImplementationDigest)
		if stageErr != nil || expectedErr != nil || stageDigest != expectedStage {
			if stageErr == nil {
				stageErr = ErrConflict
			}
			respondEvaluationServiceError(writer, stageErr)
			return
		}
		record, _, err = repository.MarkEvaluationCapabilityProbeAdmissionDispatched(
			request.Context(), handler.authority, admission, stageDigest, now,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		authorityRequest.StageDigest = record.StageDigest
		result, executeErr := handler.capabilityProbeAdmissionAuthority.ExecuteCapabilityProbeAdmission(
			request.Context(), authorityRequest,
		)
		if executeErr != nil {
			respondEvaluationServiceError(writer, executeErr)
			return
		}
		referenceBundle, referenceErr := repository.LoadEvaluationCapabilityProbeReferenceBundle(
			request.Context(), handler.authority, admission, ownerImplementationDigest, result.ProbeEvidence,
		)
		if referenceErr != nil {
			respondEvaluationServiceError(writer, referenceErr)
			return
		}
		sealed, err = evaluationCapabilityProbeEvidence(
			admission, ownerImplementationDigest, record.StageDigest, result, referenceBundle, now,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		record, _, err = repository.AcknowledgeEvaluationCapabilityProbeAdmission(
			request.Context(), handler.authority, admission, sealed, now,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
	} else {
		if record.State != "dispatched" || !evaluationDigestPattern.MatchString(record.StageDigest) ||
			!evaluationDigestPattern.MatchString(record.DispatchAckDigest) || len(record.ResponseBytes) == 0 ||
			len(record.ReferenceBundleBytes) == 0 {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		authorityRequest.StageDigest, authorityRequest.DispatchAckDigest = record.StageDigest, record.DispatchAckDigest
		authorityRequest.SealedProbeObservation, authorityRequest.SealedProbeObservationDigest, err =
			evaluationCapabilityProbeSealedObservation(record)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		result, reconciled, reconcileErr := handler.capabilityProbeAdmissionAuthority.ReconcileCapabilityProbeAdmission(
			request.Context(), authorityRequest,
		)
		if reconcileErr != nil || !reconciled {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		sealed, err = evaluationCapabilityProbeEvidence(
			admission, ownerImplementationDigest, record.StageDigest, result, record.ReferenceBundleBytes, now,
		)
		if err != nil || !bytes.Equal(sealed.ResponseBytes, record.ResponseBytes) ||
			!bytes.Equal(sealed.ReferenceBundleBytes, record.ReferenceBundleBytes) ||
			sealed.DispatchAckDigest != record.DispatchAckDigest {
			respondEvaluationServiceError(writer, ErrConflict)
			return
		}
	}
	record, _, err = repository.SealEvaluationCapabilityProbeAdmission(
		request.Context(), handler.authority, admission, sealed.ResponseDigest, sealed.DispatchAckDigest, now,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if err := writeResponse(record.ResponseBytes); err != nil {
		respondEvaluationServiceError(writer, err)
	}
}
