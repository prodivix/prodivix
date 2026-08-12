package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationRuntimeFactSourceRegistrationRequestFormat = "prodivix.agent-evaluation-runtime-fact-source-owner-registration-request"
	evaluationRuntimeFactSourceRegistrationStageFormat   = "prodivix.agent-evaluation-runtime-fact-source-owner-registration-stage"
	evaluationRuntimeFactSourceOwnerHealthFormat         = "prodivix.agent-evaluation-runtime-fact-source-owner-health"
	evaluationRuntimeFactSourceOwnerAdmissionFormat      = "prodivix.agent-evaluation-runtime-fact-source-owner-admission"
	evaluationRuntimeFactSourceRegistrationAckFormat     = "prodivix.agent-evaluation-runtime-fact-source-owner-registration-dispatch-ack"
	evaluationRuntimeFactSourceRegistrationReceiptFormat = "prodivix.agent-evaluation-runtime-fact-source-owner-registration-receipt"
	evaluationRuntimeFactSourceRegistrationVersion       = int64(1)
	evaluationRuntimeFactSourceRegistrationOperation     = "runtime-fact-source.register"
	evaluationRuntimeFactSourceRegistrationRouteBinding  = "runtime-fact-source-owner-registration"

	maximumEvaluationRuntimeFactSourceRegistrationRequestBytes  = 65_536
	maximumEvaluationRuntimeFactSourceRegistrationResponseBytes = 65_536
	maximumEvaluationRuntimeFactSourceRegistrations             = 15
	maximumEvaluationRuntimeFactSourceRegistrationLifetime      = 8 * 24 * time.Hour
)

type evaluationRuntimeFactSourceRegistrationRequest struct {
	NamespaceID                         string
	RepositoryCommit                    string
	SourceAuthorityKind                 string
	SourceKind                          string
	SourceAuthorityID                   string
	SourceAuthorityImplementationDigest string
	RouteBinding                        string
	CapabilityProfileID                 string
	CapabilityProfileDigest             string
	CapabilityID                        string
	ProtocolFamily                      string
	ProviderConfigurationID             string
	ModelID                             string
	ModelLineageDigest                  string
	AdapterDigest                       string
	MinimumExpiresAt                    time.Time
	RequestDigest                       string
	Value                               map[string]any
	Bytes                               []byte
}

// EvaluationRuntimeFactSourceRegistrationAuthorityRequest is sent only to the
// configured production owner authority after the ledger has durably claimed
// the exact registration request. The owner may health-check its own route; it
// cannot choose a different identity, implementation, or target scope.
type EvaluationRuntimeFactSourceRegistrationAuthorityRequest struct {
	NamespaceID                   string
	RepositoryCommit              string
	RequestDigest                 string
	RegistrationAuthorityIssuerID string
	OwnerImplementationDigest     string
	StageDigest                   string
	DispatchAckDigest             string
	ClaimGeneration               int64
	Request                       json.RawMessage
	SealedOwnerHealth             json.RawMessage
}

type EvaluationRuntimeFactSourceRegistrationAuthorityResult struct {
	OwnerHealth          json.RawMessage
	OwnerAdmissionDigest string
}

type EvaluationRuntimeFactSourceRegistrationAuthority interface {
	RuntimeFactSourceRegistrationImplementationDigest() (string, bool)
	StageRuntimeFactSourceRegistration(
		context.Context,
		EvaluationRuntimeFactSourceRegistrationAuthorityRequest,
	) (string, error)
	ExecuteRuntimeFactSourceRegistration(
		context.Context,
		EvaluationRuntimeFactSourceRegistrationAuthorityRequest,
	) (EvaluationRuntimeFactSourceRegistrationAuthorityResult, error)
	ReconcileRuntimeFactSourceRegistration(
		context.Context,
		EvaluationRuntimeFactSourceRegistrationAuthorityRequest,
	) (EvaluationRuntimeFactSourceRegistrationAuthorityResult, bool, error)
}

type EvaluationRuntimeFactSourceRegistrationRecord struct {
	NamespaceID                         string
	RepositoryCommit                    string
	RequestDigest                       string
	SourceAuthorityKind                 string
	SourceKind                          string
	SourceAuthorityID                   string
	SourceAuthorityImplementationDigest string
	RouteBinding                        string
	CapabilityProfileID                 string
	CapabilityProfileDigest             string
	CapabilityID                        string
	ProtocolFamily                      string
	ProviderConfigurationID             string
	ModelID                             string
	ModelLineageDigest                  string
	AdapterDigest                       string
	MinimumExpiresAt                    time.Time
	RegistrationAuthorityIssuerID       string
	State                               string
	ClaimGeneration                     int64
	StageDigest                         string
	OwnerHealthDigest                   string
	OwnerAdmissionDigest                string
	DispatchAckDigest                   string
	RegisteredAt                        time.Time
	ExpiresAt                           time.Time
	RegistrationReceiptDigest           string
	RequestBytes                        []byte
	OwnerHealthBytes                    []byte
	ReceiptBytes                        []byte
	V46Eligible                         bool
	ClaimedAt                           time.Time
	DispatchedAt                        time.Time
	SealedAt                            time.Time
}

type evaluationRuntimeFactSourceRegistrationSealedValue struct {
	OwnerHealthDigest         string
	OwnerAdmissionDigest      string
	DispatchAckDigest         string
	RegisteredAt              time.Time
	ExpiresAt                 time.Time
	RegistrationReceiptDigest string
	OwnerHealthBytes          []byte
	ReceiptBytes              []byte
}

type evaluationRuntimeFactSourceRegistrationRepository interface {
	ClaimEvaluationRuntimeFactSourceRegistration(
		context.Context,
		EvaluationAuthority,
		evaluationRuntimeFactSourceRegistrationRequest,
		time.Time,
	) (EvaluationRuntimeFactSourceRegistrationRecord, bool, error)
	MarkEvaluationRuntimeFactSourceRegistrationDispatched(
		context.Context,
		EvaluationAuthority,
		evaluationRuntimeFactSourceRegistrationRequest,
		string,
		time.Time,
	) (EvaluationRuntimeFactSourceRegistrationRecord, bool, error)
	AcknowledgeEvaluationRuntimeFactSourceRegistration(
		context.Context,
		EvaluationAuthority,
		evaluationRuntimeFactSourceRegistrationRequest,
		evaluationRuntimeFactSourceRegistrationSealedValue,
		time.Time,
	) (EvaluationRuntimeFactSourceRegistrationRecord, bool, error)
	SealEvaluationRuntimeFactSourceRegistration(
		context.Context,
		EvaluationAuthority,
		evaluationRuntimeFactSourceRegistrationRequest,
		string,
		string,
		time.Time,
	) (EvaluationRuntimeFactSourceRegistrationRecord, bool, error)
}

func evaluationRuntimeFactSourceExpectedKind(capabilityID string) string {
	if capabilityID == "provider.hosted-retrieval" {
		return "sealed-hosted-owner-result"
	}
	if evaluationOptionalFactKind(capabilityID) != "" {
		return "sealed-provider-response-metadata"
	}
	return ""
}

func decodeEvaluationRuntimeFactSourceRegistrationRequest(
	source []byte,
	authority EvaluationAuthority,
) (evaluationRuntimeFactSourceRegistrationRequest, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationRuntimeFactSourceRegistrationRequestBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "repositoryCommit", "sourceAuthorityKind", "sourceKind",
		"sourceAuthorityId", "sourceAuthorityImplementationDigest", "routeBinding", "capabilityProfileId",
		"capabilityProfileDigest", "capabilityId", "protocolFamily", "providerConfigurationId", "modelId",
		"modelLineageDigest", "adapterDigest", "minimumExpiresAt", "requestDigest",
	}) || stringMember(value, "format") != evaluationRuntimeFactSourceRegistrationRequestFormat ||
		stringMember(value, "namespaceId") != authority.NamespaceID ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		stringMember(value, "sourceAuthorityKind") != "shared-durable-capability" ||
		stringMember(value, "sourceKind") != evaluationRuntimeFactSourceExpectedKind(stringMember(value, "capabilityId")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "sourceAuthorityId")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "routeBinding")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "capabilityProfileId")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "providerConfigurationId")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "modelId")) ||
		!oneOfString(stringMember(value, "protocolFamily"), "openai-responses", "anthropic-messages", "gemini-interactions") {
		return evaluationRuntimeFactSourceRegistrationRequest{}, ErrInvalid
	}
	for _, field := range []string{
		"sourceAuthorityImplementationDigest", "capabilityProfileDigest", "modelLineageDigest", "adapterDigest", "requestDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return evaluationRuntimeFactSourceRegistrationRequest{}, ErrInvalid
		}
	}
	version, versionOK := integerMember(value, "version")
	minimumExpiresAt, timeErr := parseEvaluationServiceInstant(stringMember(value, "minimumExpiresAt"))
	profileID := stringMember(value, "capabilityProfileId")
	profileDigest := stringMember(value, "capabilityProfileDigest")
	profileSpec, profileOK := evaluationCapabilityProbeProgramSpecs[profileID]
	_, profileErr := expectedEvaluationCapabilityProbeProgram(profileID, profileDigest)
	base := cloneEvaluationObject(value)
	delete(base, "requestDigest")
	computed, digestErr := canonicaljson.Digest(base)
	if !versionOK || version != evaluationRuntimeFactSourceRegistrationVersion || timeErr != nil ||
		computed != stringMember(value, "requestDigest") || digestErr != nil ||
		!profileOK || profileErr != nil || profileSpec.capabilityID != stringMember(value, "capabilityId") ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return evaluationRuntimeFactSourceRegistrationRequest{}, ErrConflict
	}
	return evaluationRuntimeFactSourceRegistrationRequest{
		NamespaceID: authority.NamespaceID, RepositoryCommit: stringMember(value, "repositoryCommit"),
		SourceAuthorityKind: stringMember(value, "sourceAuthorityKind"), SourceKind: stringMember(value, "sourceKind"),
		SourceAuthorityID:                   stringMember(value, "sourceAuthorityId"),
		SourceAuthorityImplementationDigest: stringMember(value, "sourceAuthorityImplementationDigest"),
		RouteBinding:                        stringMember(value, "routeBinding"), CapabilityProfileID: stringMember(value, "capabilityProfileId"),
		CapabilityProfileDigest: stringMember(value, "capabilityProfileDigest"), CapabilityID: stringMember(value, "capabilityId"),
		ProtocolFamily: stringMember(value, "protocolFamily"), ProviderConfigurationID: stringMember(value, "providerConfigurationId"),
		ModelID: stringMember(value, "modelId"), ModelLineageDigest: stringMember(value, "modelLineageDigest"),
		AdapterDigest: stringMember(value, "adapterDigest"), MinimumExpiresAt: minimumExpiresAt,
		RequestDigest: stringMember(value, "requestDigest"), Value: value, Bytes: append([]byte(nil), canonical...),
	}, nil
}

func evaluationRuntimeFactSourceRegistrationStageDigest(
	request evaluationRuntimeFactSourceRegistrationRequest,
	registrationAuthorityIssuerID string,
) (string, error) {
	if !validEvaluationAgentControlIdentity(registrationAuthorityIssuerID) {
		return "", ErrInvalid
	}
	return canonicaljson.Digest(map[string]any{
		"format":                        evaluationRuntimeFactSourceRegistrationStageFormat,
		"version":                       evaluationRuntimeFactSourceRegistrationVersion,
		"requestDigest":                 request.RequestDigest,
		"registrationAuthorityIssuerId": registrationAuthorityIssuerID,
	})
}

func evaluationRuntimeFactSourceOwnerAdmissionDigest(
	requestDigest, ownerHealthDigest, stageDigest string,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":            evaluationRuntimeFactSourceOwnerAdmissionFormat,
		"version":           evaluationRuntimeFactSourceRegistrationVersion,
		"requestDigest":     requestDigest,
		"ownerHealthDigest": ownerHealthDigest,
		"stageDigest":       stageDigest,
	})
}

func evaluationRuntimeFactSourceRegistrationDispatchAckDigest(
	requestDigest, ownerHealthDigest, ownerAdmissionDigest, stageDigest, registrationAuthorityIssuerID string,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":                        evaluationRuntimeFactSourceRegistrationAckFormat,
		"version":                       evaluationRuntimeFactSourceRegistrationVersion,
		"requestDigest":                 requestDigest,
		"ownerHealthDigest":             ownerHealthDigest,
		"ownerAdmissionDigest":          ownerAdmissionDigest,
		"stageDigest":                   stageDigest,
		"registrationAuthorityIssuerId": registrationAuthorityIssuerID,
	})
}

func evaluationRuntimeFactSourceRegistrationSealed(
	request evaluationRuntimeFactSourceRegistrationRequest,
	registrationAuthorityIssuerID, stageDigest string,
	result EvaluationRuntimeFactSourceRegistrationAuthorityResult,
	claimedAt, now time.Time,
) (evaluationRuntimeFactSourceRegistrationSealedValue, error) {
	health, healthBytes, err := decodeEvaluationJSONObject(result.OwnerHealth, maximumEvaluationRuntimeFactSourceRegistrationResponseBytes)
	if err != nil || !exactEvaluationKeys(health, []string{
		"format", "version", "requestDigest", "sourceAuthorityId", "sourceAuthorityImplementationDigest",
		"sourceKind", "routeBinding", "status", "checkedAt", "expiresAt", "healthDigest",
	}) || stringMember(health, "format") != evaluationRuntimeFactSourceOwnerHealthFormat ||
		stringMember(health, "requestDigest") != request.RequestDigest ||
		stringMember(health, "sourceAuthorityId") != request.SourceAuthorityID ||
		stringMember(health, "sourceAuthorityImplementationDigest") != request.SourceAuthorityImplementationDigest ||
		stringMember(health, "sourceKind") != request.SourceKind ||
		stringMember(health, "routeBinding") != request.RouteBinding || stringMember(health, "status") != "ready" {
		return evaluationRuntimeFactSourceRegistrationSealedValue{}, ErrConflict
	}
	version, versionOK := integerMember(health, "version")
	checkedAt, checkedErr := parseEvaluationServiceInstant(stringMember(health, "checkedAt"))
	expiresAt, expiresErr := parseEvaluationServiceInstant(stringMember(health, "expiresAt"))
	healthBase := cloneEvaluationObject(health)
	delete(healthBase, "healthDigest")
	healthDigest, digestErr := canonicaljson.Digest(healthBase)
	claimedAt = claimedAt.UTC().Truncate(time.Millisecond)
	now = now.UTC().Truncate(time.Millisecond)
	if claimedAt.IsZero() || !versionOK || version != evaluationRuntimeFactSourceRegistrationVersion ||
		checkedErr != nil || expiresErr != nil || checkedAt.Before(claimedAt) ||
		digestErr != nil || healthDigest != stringMember(health, "healthDigest") || checkedAt.After(now) ||
		now.Sub(checkedAt) > time.Minute || expiresAt.Before(request.MinimumExpiresAt) || !expiresAt.After(now) ||
		expiresAt.After(checkedAt.Add(maximumEvaluationRuntimeFactSourceRegistrationLifetime)) {
		return evaluationRuntimeFactSourceRegistrationSealedValue{}, ErrConflict
	}
	expectedOwnerAdmission, err := evaluationRuntimeFactSourceOwnerAdmissionDigest(request.RequestDigest, healthDigest, stageDigest)
	if err != nil || result.OwnerAdmissionDigest != expectedOwnerAdmission {
		return evaluationRuntimeFactSourceRegistrationSealedValue{}, ErrConflict
	}
	dispatchAckDigest, err := evaluationRuntimeFactSourceRegistrationDispatchAckDigest(
		request.RequestDigest, healthDigest, expectedOwnerAdmission, stageDigest, registrationAuthorityIssuerID,
	)
	if err != nil {
		return evaluationRuntimeFactSourceRegistrationSealedValue{}, err
	}
	receiptBase := map[string]any{
		"format":                              evaluationRuntimeFactSourceRegistrationReceiptFormat,
		"version":                             evaluationRuntimeFactSourceRegistrationVersion,
		"namespaceId":                         request.NamespaceID,
		"repositoryCommit":                    request.RepositoryCommit,
		"requestDigest":                       request.RequestDigest,
		"sourceAuthorityKind":                 request.SourceAuthorityKind,
		"sourceKind":                          request.SourceKind,
		"sourceAuthorityId":                   request.SourceAuthorityID,
		"sourceAuthorityImplementationDigest": request.SourceAuthorityImplementationDigest,
		"routeBinding":                        request.RouteBinding,
		"capabilityProfileId":                 request.CapabilityProfileID,
		"capabilityProfileDigest":             request.CapabilityProfileDigest,
		"capabilityId":                        request.CapabilityID,
		"protocolFamily":                      request.ProtocolFamily,
		"providerConfigurationId":             request.ProviderConfigurationID,
		"modelId":                             request.ModelID,
		"modelLineageDigest":                  request.ModelLineageDigest,
		"adapterDigest":                       request.AdapterDigest,
		"registrationAuthorityIssuerId":       registrationAuthorityIssuerID,
		"ownerHealthDigest":                   healthDigest,
		"ownerAdmissionDigest":                expectedOwnerAdmission,
		"stageDigest":                         stageDigest,
		"dispatchAckDigest":                   dispatchAckDigest,
		"registeredAt":                        checkedAt.Format("2006-01-02T15:04:05.000Z"),
		"expiresAt":                           expiresAt.Format("2006-01-02T15:04:05.000Z"),
	}
	receiptDigest, err := canonicaljson.Digest(receiptBase)
	if err != nil {
		return evaluationRuntimeFactSourceRegistrationSealedValue{}, err
	}
	receipt := cloneEvaluationObject(receiptBase)
	receipt["registrationReceiptDigest"] = receiptDigest
	receiptBytes, err := canonicaljson.Bytes(receipt)
	if err != nil || len(receiptBytes) > maximumEvaluationRuntimeFactSourceRegistrationResponseBytes {
		return evaluationRuntimeFactSourceRegistrationSealedValue{}, ErrInvalid
	}
	return evaluationRuntimeFactSourceRegistrationSealedValue{
		OwnerHealthDigest: healthDigest, OwnerAdmissionDigest: expectedOwnerAdmission,
		DispatchAckDigest: dispatchAckDigest, RegisteredAt: checkedAt, ExpiresAt: expiresAt,
		RegistrationReceiptDigest: receiptDigest,
		OwnerHealthBytes:          append([]byte(nil), healthBytes...), ReceiptBytes: receiptBytes,
	}, nil
}

func evaluationRuntimeFactSourceRegistrationSealedOwnerHealth(
	record EvaluationRuntimeFactSourceRegistrationRecord,
) (json.RawMessage, error) {
	health, err := decodeCanonicalEvaluationObject(record.OwnerHealthBytes, maximumEvaluationRuntimeFactSourceRegistrationResponseBytes)
	if err != nil || stringMember(health, "healthDigest") != record.OwnerHealthDigest {
		return nil, ErrConflict
	}
	return append(json.RawMessage(nil), record.OwnerHealthBytes...), nil
}

func sameEvaluationRuntimeFactSourceRegistration(
	left, right EvaluationRuntimeFactSourceRegistrationRecord,
) bool {
	return left.NamespaceID == right.NamespaceID && left.RepositoryCommit == right.RepositoryCommit &&
		left.RequestDigest == right.RequestDigest && left.State == right.State &&
		left.ClaimGeneration == right.ClaimGeneration && left.SourceAuthorityKind == right.SourceAuthorityKind &&
		left.SourceKind == right.SourceKind && left.SourceAuthorityID == right.SourceAuthorityID &&
		left.SourceAuthorityImplementationDigest == right.SourceAuthorityImplementationDigest &&
		left.RouteBinding == right.RouteBinding && left.CapabilityProfileID == right.CapabilityProfileID &&
		left.CapabilityProfileDigest == right.CapabilityProfileDigest && left.CapabilityID == right.CapabilityID &&
		left.ProtocolFamily == right.ProtocolFamily && left.ProviderConfigurationID == right.ProviderConfigurationID &&
		left.ModelID == right.ModelID && left.ModelLineageDigest == right.ModelLineageDigest &&
		left.AdapterDigest == right.AdapterDigest && left.MinimumExpiresAt.Equal(right.MinimumExpiresAt) &&
		left.RegistrationAuthorityIssuerID == right.RegistrationAuthorityIssuerID &&
		left.StageDigest == right.StageDigest && left.OwnerHealthDigest == right.OwnerHealthDigest &&
		left.OwnerAdmissionDigest == right.OwnerAdmissionDigest && left.DispatchAckDigest == right.DispatchAckDigest &&
		left.RegistrationReceiptDigest == right.RegistrationReceiptDigest &&
		bytes.Equal(left.RequestBytes, right.RequestBytes) && bytes.Equal(left.OwnerHealthBytes, right.OwnerHealthBytes) &&
		bytes.Equal(left.ReceiptBytes, right.ReceiptBytes)
}
