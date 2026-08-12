package agent

import (
	"context"
	"encoding/json"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationCapabilityProbeProviderResourceRegistrationRequestFormat  = "prodivix.agent-evaluation-capability-probe-provider-resource-registration-request"
	evaluationCapabilityProbeProviderResourceRegistrationResponseFormat = "prodivix.agent-evaluation-capability-probe-provider-resource-registration-response"
	evaluationCapabilityProbeProviderResourceStageFormat                = "prodivix.agent-evaluation-capability-probe-provider-resource-stage"
	evaluationCapabilityProbeProviderResourceOwnerAdmissionFormat       = "prodivix.agent-evaluation-capability-probe-provider-resource-owner-admission"
	evaluationCapabilityProbeProviderResourceDispatchAckFormat          = "prodivix.agent-evaluation-capability-probe-provider-resource-dispatch-ack"
	evaluationCapabilityProbeProviderResourceResultFormat               = "prodivix.agent-evaluation-capability-probe-provider-resource-result"
	evaluationCapabilityProbeProviderResourceManifestFormat             = "prodivix.agent-evaluation-capability-probe-provider-resource-manifest"
	evaluationCapabilityProbeProviderResourceUploadReceiptFormat        = "prodivix.agent-evaluation-capability-probe-provider-resource-content-upload-receipt"
	evaluationCapabilityProbeProviderResourceDeletionReceiptFormat      = "prodivix.agent-evaluation-capability-probe-provider-resource-deletion-authority-receipt"
	evaluationCapabilityProbeProviderResourceDeletionProjectionFormat   = "prodivix.agent-evaluation-capability-probe-provider-resource-deletion-request-projection"
	evaluationCapabilityProbeProviderResourceIngressFormat              = "prodivix.agent-evaluation-capability-probe-provider-resource-result-ingress"
	evaluationCapabilityProbeProviderResourceIngressResponseFormat      = "prodivix.agent-evaluation-capability-probe-provider-resource-result-ingress-response"
	evaluationCapabilityProbeProviderResourceIngressReceiptFormat       = "prodivix.agent-evaluation-capability-probe-provider-resource-result-ingress-receipt"
	evaluationCapabilityProbeProviderResourceAuthorityFormat            = "prodivix.agent-capability-probe-provider-resource-authority"
	evaluationCapabilityProbeProviderResourceVersion                    = int64(1)
	evaluationCapabilityProbeProviderResourceOperation                  = "capability-probe-resource.register"
	evaluationCapabilityProbeProviderResourceRouteBinding               = "capability-probe-provider-resource-registration"
	maximumEvaluationCapabilityProbeProviderResourceRequestBytes        = 262_144
	maximumEvaluationCapabilityProbeProviderResourceResultBytes         = 262_144
	maximumEvaluationCapabilityProbeProviderResourceResponseBytes       = 65_536
	maximumEvaluationCapabilityProbeProviderResourceComponentBytes      = 16_384
	maximumEvaluationCapabilityProbeProviderResourceAuxiliaryIDs        = 32
	maximumEvaluationCapabilityProbeProviderResourceRegistrations       = int64(4)
	maximumEvaluationCapabilityProbeProviderResourceLifetime            = 8 * 24 * time.Hour
)

var evaluationCapabilityProbeProviderResourceKindByProtocol = map[string]string{
	"gemini-interactions": "gemini-file-search-store-name",
	"openai-responses":    "openai-vector-store-id",
}

type evaluationCapabilityProbeProviderResourceRegistrationRequest struct {
	NamespaceID                 string
	RepositoryCommit            string
	ProviderConfigurationID     string
	ProviderConfigurationDigest string
	ProtocolFamily              string
	ModelID                     string
	ModelLineageDigest          string
	AdapterDigest               string
	CapabilityProfileID         string
	ProbeProgramDigest          string
	PublicResourceDigest        string
	MinimumExpiresAt            time.Time
	RequestDigest               string
	ProviderConfiguration       map[string]any
	ModelLineage                map[string]any
	ProbeProgram                map[string]any
	Program                     evaluationCapabilityProbeProgram
	Value                       map[string]any
	Bytes                       []byte
}

type EvaluationCapabilityProbeProviderResourceAuthorityRequest struct {
	NamespaceID                  string
	RepositoryCommit             string
	RequestDigest                string
	OwnerImplementationDigest    string
	StageDigest                  string
	DispatchAckDigest            string
	ResultIngressDigest          string
	ResultIngressReceiptDigest   string
	ClaimGeneration              int64
	Request                      json.RawMessage
	SealedProviderResourceResult json.RawMessage
}

type EvaluationCapabilityProbeProviderResourceAuthorityResult struct {
	ResourceResultDigest       string
	OwnerAdmissionDigest       string
	ResultIngressReceiptDigest string
}

type EvaluationCapabilityProbeProviderResourceAuthority interface {
	CapabilityProbeProviderResourceImplementationDigest() (string, bool)
	StageCapabilityProbeProviderResource(
		context.Context,
		EvaluationCapabilityProbeProviderResourceAuthorityRequest,
	) (string, error)
	ExecuteCapabilityProbeProviderResource(
		context.Context,
		EvaluationCapabilityProbeProviderResourceAuthorityRequest,
	) (EvaluationCapabilityProbeProviderResourceAuthorityResult, error)
	ReconcileCapabilityProbeProviderResource(
		context.Context,
		EvaluationCapabilityProbeProviderResourceAuthorityRequest,
	) (EvaluationCapabilityProbeProviderResourceAuthorityResult, bool, error)
}

type EvaluationCapabilityProbeProviderResourceRegistrationRecord struct {
	NamespaceID                     string
	RepositoryCommit                string
	RequestDigest                   string
	State                           string
	ClaimGeneration                 int64
	ProviderConfigurationID         string
	ProviderConfigurationDigest     string
	ProtocolFamily                  string
	ModelID                         string
	ModelLineageDigest              string
	AdapterDigest                   string
	CapabilityProfileID             string
	ProbeProgramDigest              string
	PublicResourceDescriptorDigest  string
	MinimumExpiresAt                time.Time
	OwnerImplementationDigest       string
	AuthorityIssuerID               string
	StageDigest                     string
	ResourceResultDigest            string
	OwnerAdmissionDigest            string
	DispatchAckDigest               string
	ResultIngressDigest             string
	ResultIngressReceiptDigest      string
	ResourceManifestDigest          string
	ContentUploadReceiptDigest      string
	DeletionAuthorityReceiptDigest  string
	ProviderResourceAuthorityDigest string
	RegistrationReceiptDigest       string
	RegisteredAt                    time.Time
	ExpiresAt                       time.Time
	RequestBytes                    []byte
	ResultBytes                     []byte
	ResponseBytes                   []byte
	ClaimedAt                       time.Time
	DispatchedAt                    time.Time
	SealedAt                        time.Time
	V46Eligible                     bool
}

type evaluationCapabilityProbeProviderResourceResult struct {
	Value                           map[string]any
	Bytes                           []byte
	ResourceManifest                map[string]any
	ResourceManifestBytes           []byte
	ResourceManifestDigest          string
	ContentUploadReceipt            map[string]any
	ContentUploadReceiptBytes       []byte
	ContentUploadReceiptDigest      string
	DeletionAuthorityReceipt        map[string]any
	DeletionAuthorityReceiptBytes   []byte
	DeletionAuthorityReceiptDigest  string
	ProviderResourceAuthority       map[string]any
	ProviderResourceAuthorityDigest string
	ProviderResourceID              string
	RegisteredAt                    time.Time
	ExpiresAt                       time.Time
	ResultDigest                    string
}

type evaluationCapabilityProbeProviderResourceRepository interface {
	ClaimEvaluationCapabilityProbeProviderResource(
		context.Context,
		EvaluationAuthority,
		evaluationCapabilityProbeProviderResourceRegistrationRequest,
		string,
		time.Time,
	) (EvaluationCapabilityProbeProviderResourceRegistrationRecord, bool, error)
	MarkEvaluationCapabilityProbeProviderResourceDispatched(
		context.Context,
		EvaluationAuthority,
		evaluationCapabilityProbeProviderResourceRegistrationRequest,
		string,
		time.Time,
	) (EvaluationCapabilityProbeProviderResourceRegistrationRecord, bool, error)
	GetEvaluationCapabilityProbeProviderResource(
		context.Context,
		EvaluationAuthority,
		evaluationCapabilityProbeProviderResourceRegistrationRequest,
	) (EvaluationCapabilityProbeProviderResourceRegistrationRecord, error)
	StoreEvaluationCapabilityProbeProviderResourceResult(
		context.Context,
		EvaluationAuthority,
		evaluationCapabilityProbeProviderResourceRegistrationRequest,
		string,
		string,
		evaluationCapabilityProbeProviderResourceResult,
		string,
		string,
		time.Time,
	) (EvaluationCapabilityProbeProviderResourceRegistrationRecord, bool, error)
	SealEvaluationCapabilityProbeProviderResource(
		context.Context,
		EvaluationAuthority,
		evaluationCapabilityProbeProviderResourceRegistrationRequest,
		string,
		[]byte,
		time.Time,
	) (EvaluationCapabilityProbeProviderResourceRegistrationRecord, bool, error)
}

func decodeEvaluationCapabilityProbeProviderResourceRegistrationRequest(
	source []byte,
	authority EvaluationAuthority,
) (evaluationCapabilityProbeProviderResourceRegistrationRequest, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationCapabilityProbeProviderResourceRequestBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "repositoryCommit", "providerConfiguration", "modelLineage",
		"probeProgram", "minimumExpiresAt", "requestDigest",
	}) || stringMember(value, "format") != evaluationCapabilityProbeProviderResourceRegistrationRequestFormat ||
		stringMember(value, "namespaceId") != authority.NamespaceID ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) {
		return evaluationCapabilityProbeProviderResourceRegistrationRequest{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	provider, providerID, providerDigest, protocol, adapterDigest, providerErr :=
		evaluationCapabilityProbeProvider(value["providerConfiguration"])
	model, modelID, modelDigest, modelErr := evaluationCapabilityProbeModel(value["modelLineage"])
	programObject, programErr := evaluationCapabilityProbeCanonicalObject(value["probeProgram"], maximumEvaluationCapabilityProbeProgramBytes)
	profile, profileOK := objectMember(programObject, "profileProjection")
	profileID := stringMember(profile, "capabilityProfileId")
	profileDigest := stringMember(profile, "capabilityProfileDigest")
	program, expectedErr := expectedEvaluationCapabilityProbeProgram(profileID, profileDigest)
	intent, intentOK := objectMember(programObject, "providerRequestIntent")
	publicResource, resourceOK := objectMember(intent, "publicProbeResource")
	minimumExpiresAt, expiresErr := parseEvaluationServiceInstant(stringMember(value, "minimumExpiresAt"))
	base := cloneEvaluationObject(value)
	delete(base, "requestDigest")
	requestDigest, digestErr := canonicaljson.Digest(base)
	_, protocolOK := evaluationCapabilityProbeProviderResourceKindByProtocol[protocol]
	if !versionOK || version != evaluationCapabilityProbeProviderResourceVersion || providerErr != nil || modelErr != nil ||
		programErr != nil || !profileOK || expectedErr != nil || !intentOK || !resourceOK ||
		!oneOfString(profileID, "g4-provider-hosted-retrieval-core", "g4-provider-hosted-retrieval-document") ||
		stringMember(profile, "capabilityId") != "provider.hosted-retrieval" || !protocolOK ||
		!sameEvaluationCanonicalValue(programObject, program.Value) || expiresErr != nil ||
		digestErr != nil || requestDigest != stringMember(value, "requestDigest") ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return evaluationCapabilityProbeProviderResourceRegistrationRequest{}, ErrConflict
	}
	return evaluationCapabilityProbeProviderResourceRegistrationRequest{
		NamespaceID: authority.NamespaceID, RepositoryCommit: stringMember(value, "repositoryCommit"),
		ProviderConfigurationID: providerID, ProviderConfigurationDigest: providerDigest, ProtocolFamily: protocol,
		ModelID: modelID, ModelLineageDigest: modelDigest, AdapterDigest: adapterDigest,
		CapabilityProfileID: profileID, ProbeProgramDigest: program.ProgramDigest,
		PublicResourceDigest: stringMember(publicResource, "descriptorDigest"), MinimumExpiresAt: minimumExpiresAt,
		RequestDigest: requestDigest, ProviderConfiguration: provider, ModelLineage: model,
		ProbeProgram: programObject, Program: program, Value: value, Bytes: append([]byte(nil), canonical...),
	}, nil
}

func evaluationCapabilityProbeProviderResourceStageDigest(
	request evaluationCapabilityProbeProviderResourceRegistrationRequest,
	ownerImplementationDigest string,
) (string, error) {
	if !evaluationDigestPattern.MatchString(ownerImplementationDigest) {
		return "", ErrInvalid
	}
	return canonicaljson.Digest(map[string]any{
		"format":                    evaluationCapabilityProbeProviderResourceStageFormat,
		"version":                   evaluationCapabilityProbeProviderResourceVersion,
		"requestDigest":             request.RequestDigest,
		"ownerImplementationDigest": ownerImplementationDigest,
	})
}

func evaluationCapabilityProbeProviderResourceOwnerAdmissionDigest(
	requestDigest, resultDigest, ownerImplementationDigest, stageDigest string,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":        evaluationCapabilityProbeProviderResourceOwnerAdmissionFormat,
		"version":       evaluationCapabilityProbeProviderResourceVersion,
		"requestDigest": requestDigest, "resourceResultDigest": resultDigest,
		"ownerImplementationDigest": ownerImplementationDigest, "stageDigest": stageDigest,
	})
}

func evaluationCapabilityProbeProviderResourceDispatchAckDigest(
	requestDigest, resultDigest, ownerAdmissionDigest, ownerImplementationDigest, stageDigest string,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":        evaluationCapabilityProbeProviderResourceDispatchAckFormat,
		"version":       evaluationCapabilityProbeProviderResourceVersion,
		"requestDigest": requestDigest, "resourceResultDigest": resultDigest,
		"ownerAdmissionDigest": ownerAdmissionDigest, "ownerImplementationDigest": ownerImplementationDigest,
		"stageDigest": stageDigest,
	})
}

func evaluationCapabilityProbeProviderResourceIngressReceiptDigest(
	requestDigest, ingressDigest, resultDigest, dispatchAckDigest string,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":        evaluationCapabilityProbeProviderResourceIngressReceiptFormat,
		"version":       evaluationCapabilityProbeProviderResourceVersion,
		"requestDigest": requestDigest, "ingressDigest": ingressDigest,
		"resourceResultDigest": resultDigest, "dispatchAckDigest": dispatchAckDigest,
	})
}

func evaluationCapabilityProbeProviderResourceCanonicalComponent(
	raw any,
	exactKeys []string,
	format string,
	digestField string,
	maximum int,
) (map[string]any, []byte, error) {
	value, ok := raw.(map[string]any)
	if !ok || !exactEvaluationKeys(value, exactKeys) || stringMember(value, "format") != format {
		return nil, nil, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	base := cloneEvaluationObject(value)
	delete(base, digestField)
	digest, digestErr := canonicaljson.Digest(base)
	bytes, bytesErr := canonicaljson.Bytes(value)
	if !versionOK || version != evaluationCapabilityProbeProviderResourceVersion ||
		digestErr != nil || digest != stringMember(value, digestField) ||
		bytesErr != nil || len(bytes) == 0 || len(bytes) > maximum ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return nil, nil, ErrConflict
	}
	return value, bytes, nil
}

func decodeEvaluationCapabilityProbeProviderResourceDeletionProjection(
	raw any,
	request evaluationCapabilityProbeProviderResourceRegistrationRequest,
	providerResourceID string,
) (map[string]any, string, error) {
	projection, ok := raw.(map[string]any)
	if !ok || !exactEvaluationKeys(projection, []string{
		"format", "version", "requestDigest", "protocolFamily", "providerResourceKind",
		"providerResourceId", "auxiliaryResourceIds",
	}) || stringMember(projection, "format") != evaluationCapabilityProbeProviderResourceDeletionProjectionFormat {
		return nil, "", ErrInvalid
	}
	version, versionOK := integerMember(projection, "version")
	auxiliaryResourceIDs, auxiliaryOK := arrayMember(projection, "auxiliaryResourceIds")
	expectedKind, protocolOK := evaluationCapabilityProbeProviderResourceKindByProtocol[request.ProtocolFamily]
	projectionBytes, bytesErr := canonicaljson.Bytes(projection)
	if !versionOK || version != evaluationCapabilityProbeProviderResourceVersion || !auxiliaryOK ||
		len(auxiliaryResourceIDs) > maximumEvaluationCapabilityProbeProviderResourceAuxiliaryIDs || !protocolOK ||
		stringMember(projection, "requestDigest") != request.RequestDigest ||
		stringMember(projection, "protocolFamily") != request.ProtocolFamily ||
		stringMember(projection, "providerResourceKind") != expectedKind ||
		stringMember(projection, "providerResourceId") != providerResourceID ||
		bytesErr != nil || len(projectionBytes) == 0 ||
		len(projectionBytes) > maximumEvaluationCapabilityProbeProviderResourceComponentBytes ||
		agentcontract.ValidateSanitizedAgentPayload(projection) != nil {
		return nil, "", ErrConflict
	}
	previous := ""
	for index, rawID := range auxiliaryResourceIDs {
		resourceID, ok := rawID.(string)
		if !ok || !validEvaluationAgentControlIdentity(resourceID) || resourceID == providerResourceID ||
			index > 0 && previous >= resourceID {
			return nil, "", ErrConflict
		}
		previous = resourceID
	}
	digest, err := canonicaljson.Digest(projection)
	if err != nil {
		return nil, "", ErrConflict
	}
	return projection, digest, nil
}

func decodeEvaluationCapabilityProbeProviderResourceAuthority(
	raw any,
	program evaluationCapabilityProbeProgram,
	protocolFamily, providerConfigurationID, modelID, modelLineageDigest, adapterDigest string,
	minimumExpiresAt time.Time,
) (map[string]any, error) {
	authority, authorityBytes, err := evaluationCapabilityProbeProviderResourceCanonicalComponent(
		raw, []string{
			"format", "version", "capabilityProfileId", "probeProgramDigest", "publicResourceDescriptorDigest",
			"protocolFamily", "providerConfigurationId", "modelId", "modelLineageDigest", "adapterDigest",
			"providerResourceKind", "providerResourceId", "resourceManifestDigest", "contentUploadReceiptDigest",
			"deletionAuthorityReceiptDigest", "registeredAt", "expiresAt", "authorityDigest",
		}, evaluationCapabilityProbeProviderResourceAuthorityFormat, "authorityDigest", 16_384,
	)
	registeredAt, registeredErr := parseEvaluationServiceInstant(stringMember(authority, "registeredAt"))
	expiresAt, expiresErr := parseEvaluationServiceInstant(stringMember(authority, "expiresAt"))
	expectedKind, protocolOK := evaluationCapabilityProbeProviderResourceKindByProtocol[protocolFamily]
	if err != nil || len(authorityBytes) == 0 || registeredErr != nil || expiresErr != nil || !protocolOK ||
		!expiresAt.After(registeredAt) || expiresAt.Sub(registeredAt) > maximumEvaluationCapabilityProbeProviderResourceLifetime ||
		expiresAt.Before(minimumExpiresAt) || !validEvaluationAgentControlIdentity(stringMember(authority, "providerResourceId")) ||
		stringMember(authority, "capabilityProfileId") != program.ProfileID ||
		stringMember(authority, "probeProgramDigest") != program.ProgramDigest ||
		stringMember(authority, "publicResourceDescriptorDigest") != stringMember(program.PublicProbeResource, "descriptorDigest") ||
		stringMember(authority, "protocolFamily") != protocolFamily ||
		stringMember(authority, "providerConfigurationId") != providerConfigurationID ||
		stringMember(authority, "modelId") != modelID ||
		stringMember(authority, "modelLineageDigest") != modelLineageDigest ||
		stringMember(authority, "adapterDigest") != adapterDigest ||
		stringMember(authority, "providerResourceKind") != expectedKind {
		return nil, ErrConflict
	}
	for _, field := range []string{
		"resourceManifestDigest", "contentUploadReceiptDigest", "deletionAuthorityReceiptDigest", "authorityDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(authority, field)) {
			return nil, ErrInvalid
		}
	}
	return authority, nil
}

func decodeEvaluationCapabilityProbeProviderResourceResult(
	raw any,
	request evaluationCapabilityProbeProviderResourceRegistrationRequest,
	claimedAt time.Time,
	now time.Time,
) (evaluationCapabilityProbeProviderResourceResult, error) {
	result, ok := raw.(map[string]any)
	if !ok || !exactEvaluationKeys(result, []string{
		"format", "version", "requestDigest", "resourceManifest", "contentUploadReceipt",
		"deletionAuthorityReceipt", "providerResourceAuthority", "resultDigest",
	}) || stringMember(result, "format") != evaluationCapabilityProbeProviderResourceResultFormat ||
		stringMember(result, "requestDigest") != request.RequestDigest {
		return evaluationCapabilityProbeProviderResourceResult{}, ErrInvalid
	}
	version, versionOK := integerMember(result, "version")
	manifest, manifestBytes, manifestErr := evaluationCapabilityProbeProviderResourceCanonicalComponent(
		result["resourceManifest"], []string{
			"format", "version", "requestDigest", "probeProgramDigest", "publicResourceDescriptorDigest",
			"protocolFamily", "providerConfigurationId", "modelId", "modelLineageDigest", "adapterDigest",
			"providerResourceKind", "providerResourceId", "contentDigest", "documentBytesDigest",
			"registeredAt", "expiresAt", "manifestDigest",
		}, evaluationCapabilityProbeProviderResourceManifestFormat, "manifestDigest", 65_536,
	)
	upload, uploadBytes, uploadErr := evaluationCapabilityProbeProviderResourceCanonicalComponent(
		result["contentUploadReceipt"], []string{
			"format", "version", "requestDigest", "resourceManifestDigest", "publicResourceDescriptorDigest",
			"providerResourceKind", "providerResourceId", "contentDigest", "documentBytesDigest",
			"dispatchIntentDigest", "transportReceiptDigest", "responseSpoolDigest", "uploadedAt",
			"contentUploadReceiptDigest",
		}, evaluationCapabilityProbeProviderResourceUploadReceiptFormat, "contentUploadReceiptDigest", 65_536,
	)
	deletion, deletionBytes, deletionErr := evaluationCapabilityProbeProviderResourceCanonicalComponent(
		result["deletionAuthorityReceipt"], []string{
			"format", "version", "requestDigest", "resourceManifestDigest", "providerResourceKind",
			"providerResourceId", "deletionRouteBinding", "deletionRequestProjection", "deletionRequestProjectionDigest",
			"registeredAt", "expiresAt", "deletionAuthorityReceiptDigest",
		}, evaluationCapabilityProbeProviderResourceDeletionReceiptFormat, "deletionAuthorityReceiptDigest",
		maximumEvaluationCapabilityProbeProviderResourceComponentBytes,
	)
	authority, authorityBytes, authorityErr := evaluationCapabilityProbeProviderResourceCanonicalComponent(
		result["providerResourceAuthority"], []string{
			"format", "version", "capabilityProfileId", "probeProgramDigest", "publicResourceDescriptorDigest",
			"protocolFamily", "providerConfigurationId", "modelId", "modelLineageDigest", "adapterDigest",
			"providerResourceKind", "providerResourceId", "resourceManifestDigest", "contentUploadReceiptDigest",
			"deletionAuthorityReceiptDigest", "registeredAt", "expiresAt", "authorityDigest",
		}, evaluationCapabilityProbeProviderResourceAuthorityFormat, "authorityDigest", 16_384,
	)
	base := cloneEvaluationObject(result)
	delete(base, "resultDigest")
	resultDigest, resultDigestErr := canonicaljson.Digest(base)
	resultBytes, resultBytesErr := canonicaljson.Bytes(result)
	if !versionOK || version != evaluationCapabilityProbeProviderResourceVersion ||
		manifestErr != nil || uploadErr != nil || deletionErr != nil || authorityErr != nil ||
		resultDigestErr != nil || resultDigest != stringMember(result, "resultDigest") ||
		resultBytesErr != nil || len(resultBytes) > maximumEvaluationCapabilityProbeProviderResourceResultBytes ||
		agentcontract.ValidateSanitizedAgentPayload(result) != nil {
		return evaluationCapabilityProbeProviderResourceResult{}, ErrConflict
	}
	publicResource, _ := objectMember(request.ProbeProgram["providerRequestIntent"].(map[string]any), "publicProbeResource")
	registeredAt, registeredErr := parseEvaluationServiceInstant(stringMember(authority, "registeredAt"))
	expiresAt, expiresErr := parseEvaluationServiceInstant(stringMember(authority, "expiresAt"))
	uploadedAt, uploadedErr := parseEvaluationServiceInstant(stringMember(upload, "uploadedAt"))
	manifestRegisteredAt, manifestRegisteredErr := parseEvaluationServiceInstant(stringMember(manifest, "registeredAt"))
	manifestExpiresAt, manifestExpiresErr := parseEvaluationServiceInstant(stringMember(manifest, "expiresAt"))
	deletionRegisteredAt, deletionRegisteredErr := parseEvaluationServiceInstant(stringMember(deletion, "registeredAt"))
	deletionExpiresAt, deletionExpiresErr := parseEvaluationServiceInstant(stringMember(deletion, "expiresAt"))
	expectedKind := evaluationCapabilityProbeProviderResourceKindByProtocol[request.ProtocolFamily]
	_, deletionProjectionDigest, deletionProjectionErr :=
		decodeEvaluationCapabilityProbeProviderResourceDeletionProjection(
			deletion["deletionRequestProjection"], request, stringMember(deletion, "providerResourceId"),
		)
	for _, field := range []string{"dispatchIntentDigest", "transportReceiptDigest", "responseSpoolDigest"} {
		if !evaluationDigestPattern.MatchString(stringMember(upload, field)) {
			return evaluationCapabilityProbeProviderResourceResult{}, ErrInvalid
		}
	}
	if registeredErr != nil || expiresErr != nil || uploadedErr != nil || manifestRegisteredErr != nil ||
		manifestExpiresErr != nil || deletionRegisteredErr != nil || deletionExpiresErr != nil || deletionProjectionErr != nil ||
		claimedAt.IsZero() || now.IsZero() || registeredAt.Before(claimedAt.UTC().Truncate(time.Millisecond)) ||
		registeredAt.After(now.UTC().Truncate(time.Millisecond)) || uploadedAt.Before(claimedAt.UTC().Truncate(time.Millisecond)) ||
		uploadedAt.After(registeredAt) || !expiresAt.After(registeredAt) ||
		expiresAt.Sub(registeredAt) > maximumEvaluationCapabilityProbeProviderResourceLifetime ||
		expiresAt.Before(request.MinimumExpiresAt) || !manifestRegisteredAt.Equal(registeredAt) ||
		!manifestExpiresAt.Equal(expiresAt) || !deletionRegisteredAt.Equal(registeredAt) ||
		!deletionExpiresAt.Equal(expiresAt) || stringMember(deletion, "deletionRouteBinding") != "provider-resource.delete" ||
		stringMember(deletion, "deletionRequestProjectionDigest") != deletionProjectionDigest {
		return evaluationCapabilityProbeProviderResourceResult{}, ErrConflict
	}
	manifestDigest := stringMember(manifest, "manifestDigest")
	uploadDigest := stringMember(upload, "contentUploadReceiptDigest")
	deletionDigest := stringMember(deletion, "deletionAuthorityReceiptDigest")
	providerResourceID := stringMember(authority, "providerResourceId")
	if !validEvaluationAgentControlIdentity(providerResourceID) ||
		stringMember(manifest, "requestDigest") != request.RequestDigest ||
		stringMember(manifest, "probeProgramDigest") != request.ProbeProgramDigest ||
		stringMember(manifest, "publicResourceDescriptorDigest") != request.PublicResourceDigest ||
		stringMember(manifest, "protocolFamily") != request.ProtocolFamily ||
		stringMember(manifest, "providerConfigurationId") != request.ProviderConfigurationID ||
		stringMember(manifest, "modelId") != request.ModelID ||
		stringMember(manifest, "modelLineageDigest") != request.ModelLineageDigest ||
		stringMember(manifest, "adapterDigest") != request.AdapterDigest ||
		stringMember(manifest, "providerResourceKind") != expectedKind ||
		stringMember(manifest, "providerResourceId") != providerResourceID ||
		stringMember(manifest, "contentDigest") != stringMember(publicResource, "contentDigest") ||
		!sameEvaluationCanonicalValue(manifest["documentBytesDigest"], publicResource["documentBytesDigest"]) ||
		stringMember(upload, "requestDigest") != request.RequestDigest ||
		stringMember(upload, "resourceManifestDigest") != manifestDigest ||
		stringMember(upload, "publicResourceDescriptorDigest") != request.PublicResourceDigest ||
		stringMember(upload, "providerResourceKind") != expectedKind ||
		stringMember(upload, "providerResourceId") != providerResourceID ||
		stringMember(upload, "contentDigest") != stringMember(publicResource, "contentDigest") ||
		!sameEvaluationCanonicalValue(upload["documentBytesDigest"], publicResource["documentBytesDigest"]) ||
		stringMember(deletion, "requestDigest") != request.RequestDigest ||
		stringMember(deletion, "resourceManifestDigest") != manifestDigest ||
		stringMember(deletion, "providerResourceKind") != expectedKind ||
		stringMember(deletion, "providerResourceId") != providerResourceID ||
		stringMember(authority, "capabilityProfileId") != request.CapabilityProfileID ||
		stringMember(authority, "probeProgramDigest") != request.ProbeProgramDigest ||
		stringMember(authority, "publicResourceDescriptorDigest") != request.PublicResourceDigest ||
		stringMember(authority, "protocolFamily") != request.ProtocolFamily ||
		stringMember(authority, "providerConfigurationId") != request.ProviderConfigurationID ||
		stringMember(authority, "modelId") != request.ModelID ||
		stringMember(authority, "modelLineageDigest") != request.ModelLineageDigest ||
		stringMember(authority, "adapterDigest") != request.AdapterDigest ||
		stringMember(authority, "providerResourceKind") != expectedKind ||
		stringMember(authority, "resourceManifestDigest") != manifestDigest ||
		stringMember(authority, "contentUploadReceiptDigest") != uploadDigest ||
		stringMember(authority, "deletionAuthorityReceiptDigest") != deletionDigest {
		return evaluationCapabilityProbeProviderResourceResult{}, ErrConflict
	}
	_ = authorityBytes
	return evaluationCapabilityProbeProviderResourceResult{
		Value: result, Bytes: resultBytes, ResourceManifest: manifest, ResourceManifestBytes: manifestBytes,
		ResourceManifestDigest: manifestDigest, ContentUploadReceipt: upload,
		ContentUploadReceiptBytes: uploadBytes, ContentUploadReceiptDigest: uploadDigest,
		DeletionAuthorityReceipt: deletion, DeletionAuthorityReceiptBytes: deletionBytes,
		DeletionAuthorityReceiptDigest: deletionDigest, ProviderResourceAuthority: authority,
		ProviderResourceAuthorityDigest: stringMember(authority, "authorityDigest"), ProviderResourceID: providerResourceID,
		RegisteredAt: registeredAt, ExpiresAt: expiresAt, ResultDigest: resultDigest,
	}, nil
}

func evaluationCapabilityProbeProviderResourceRegistrationResponse(
	request evaluationCapabilityProbeProviderResourceRegistrationRequest,
	ownerImplementationDigest, stageDigest, dispatchAckDigest string,
	result evaluationCapabilityProbeProviderResourceResult,
) ([]byte, string, error) {
	base := map[string]any{
		"format":        evaluationCapabilityProbeProviderResourceRegistrationResponseFormat,
		"version":       evaluationCapabilityProbeProviderResourceVersion,
		"requestDigest": request.RequestDigest, "providerResourceAuthority": result.ProviderResourceAuthority,
		"resourceResultDigest": result.ResultDigest, "ownerImplementationDigest": ownerImplementationDigest,
		"stageDigest": stageDigest, "dispatchAckDigest": dispatchAckDigest,
	}
	receiptDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, "", err
	}
	response := cloneEvaluationObject(base)
	response["registrationReceiptDigest"] = receiptDigest
	bytes, err := canonicaljson.Bytes(response)
	if err != nil || len(bytes) > maximumEvaluationCapabilityProbeProviderResourceResponseBytes {
		return nil, "", ErrInvalid
	}
	return bytes, receiptDigest, nil
}
