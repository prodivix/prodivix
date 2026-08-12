package agent

import (
	"context"
	"encoding/json"
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationCapabilityProbeProviderResourceCleanupAuthorityRequestFormat = "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-authority-request"
	evaluationCapabilityProbeProviderResourceCleanupResourceResultFormat   = "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-resource-result"
	evaluationCapabilityProbeProviderResourceCleanupReceiptFormat          = "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-receipt"
	evaluationCapabilityProbeProviderResourceCleanupStageFormat            = "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-stage"
	evaluationCapabilityProbeProviderResourceCleanupDispatchAckFormat      = "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-dispatch-ack"
	evaluationCapabilityProbeProviderResourceCleanupAuthorityStageFormat   = "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-authority-stage"
	evaluationCapabilityProbeProviderResourceCleanupOwnerAdmissionFormat   = "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-owner-admission"
	evaluationCapabilityProbeProviderResourceCleanupAuthorityAckFormat     = "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-authority-dispatch-ack"
	evaluationCapabilityProbeProviderResourceCleanupResultIngressFormat    = "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-result-ingress"
	evaluationCapabilityProbeProviderResourceCleanupIngressEnvelopeFormat  = "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-result-ingress-envelope"
	evaluationCapabilityProbeProviderResourceCleanupIngressReceiptFormat   = "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-result-ingress-receipt"
	evaluationCapabilityProbeProviderResourceCleanupIngressResponseFormat  = "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-result-ingress-response"
	evaluationCapabilityProbeProviderResourceCleanupResponseFormat         = "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-response"
	evaluationCapabilityProbeProviderResourceCleanupListFormat             = "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-list"
	evaluationCapabilityProbeProviderResourceCleanupListRecordFormat       = "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-registration"
	evaluationCapabilityProbeProviderResourceCleanupArchiveRecordFormat    = "prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-archive-record"
	evaluationCapabilityProbeProviderResourceCleanupOperation              = "provider-resource.cleanup"
	evaluationCapabilityProbeProviderResourceCleanupRouteBinding           = "capability-probe-provider-resource-cleanup"
	evaluationCapabilityProbeProviderResourceCleanupVersion                = int64(1)
	maximumEvaluationCapabilityProbeProviderResourceCleanupReceiptBytes    = 65_536
	maximumEvaluationCapabilityProbeProviderResourceCleanupResponseBytes   = 131_072
	maximumEvaluationCapabilityProbeProviderResourceCleanupIngressBytes    = 196_608
	maximumEvaluationCapabilityProbeProviderResourceCleanupListBytes       = 3_145_728
	maximumEvaluationCapabilityProbeProviderResourceCleanupArchiveBytes    = 196_608
	maximumEvaluationCapabilityProbeProviderResourceCleanupArchiveFamily   = 786_432
)

type evaluationCapabilityProbeProviderResourceCleanupRequest struct {
	RepositoryCommit                  string
	ResourceRegistrationRequestDigest string
	DeletionAuthorityReceiptDigest    string
	CleanupRequestDigest              string
	Value                             map[string]any
	Bytes                             []byte
}

type evaluationCapabilityProbeProviderResourceCleanupReceipt struct {
	Value                    map[string]any
	Bytes                    []byte
	RequestDigest            string
	DeletionReceiptDigest    string
	DeletionProjectionDigest string
	ProtocolFamily           string
	ProviderResourceKind     string
	ProviderResourceID       string
	AuxiliaryResourceIDs     []string
	CleanupStageDigest       string
	CleanupDispatchAckDigest string
	ResourceResultSetDigest  string
	CompletedAt              time.Time
	CleanupReceiptDigest     string
}

type EvaluationCapabilityProbeProviderResourceCleanupAuthorityRequest struct {
	NamespaceID                          string
	RepositoryCommit                     string
	CleanupRequestDigest                 string
	OwnerImplementationDigest            string
	StageDigest                          string
	DispatchAckDigest                    string
	ResultIngressDigest                  string
	ResultIngressReceiptDigest           string
	ClaimGeneration                      int64
	Request                              json.RawMessage
	DeletionAuthorityReceipt             json.RawMessage
	SealedProviderResourceCleanupReceipt json.RawMessage
}

type EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult struct {
	CleanupReceiptDigest       string
	OwnerAdmissionDigest       string
	ResultIngressReceiptDigest string
}

type EvaluationCapabilityProbeProviderResourceCleanupAuthority interface {
	CapabilityProbeProviderResourceCleanupImplementationDigest() (string, bool)
	StageCapabilityProbeProviderResourceCleanup(
		context.Context,
		EvaluationCapabilityProbeProviderResourceCleanupAuthorityRequest,
	) (string, error)
	ExecuteCapabilityProbeProviderResourceCleanup(
		context.Context,
		EvaluationCapabilityProbeProviderResourceCleanupAuthorityRequest,
	) (EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult, error)
	ReconcileCapabilityProbeProviderResourceCleanup(
		context.Context,
		EvaluationCapabilityProbeProviderResourceCleanupAuthorityRequest,
	) (EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult, bool, error)
}

type EvaluationCapabilityProbeProviderResourceCleanupRecord struct {
	NamespaceID                       string
	RepositoryCommit                  string
	CleanupRequestDigest              string
	ResourceRegistrationRequestDigest string
	DeletionAuthorityReceiptDigest    string
	State                             string
	ClaimGeneration                   int64
	OwnerImplementationDigest         string
	AuthorityIssuerID                 string
	StageDigest                       string
	CleanupReceiptDigest              string
	OwnerAdmissionDigest              string
	DispatchAckDigest                 string
	ResultIngressDigest               string
	ResultIngressReceiptDigest        string
	ResponseDigest                    string
	RequestBytes                      []byte
	DeletionAuthorityReceiptBytes     []byte
	CleanupReceiptBytes               []byte
	ResponseBytes                     []byte
	V46Eligible                       bool
	ClaimedAt                         time.Time
	DispatchedAt                      time.Time
	CompletedAt                       time.Time
	SealedAt                          time.Time
}

type evaluationCapabilityProbeProviderResourceCleanupListRecord struct {
	ResourceRegistrationRequestBytes []byte
	ProviderResourceResultBytes      []byte
	RegistrationResponseBytes        []byte
	CleanupRequestBytes              []byte
	DeletionAuthorityReceiptBytes    []byte
	CleanupResponseBytes             []byte
	ClaimedAt                        time.Time
	SealedAt                         time.Time
}

type evaluationCapabilityProbeProviderResourceCleanupRepository interface {
	ListEvaluationCapabilityProbeProviderResourceCleanups(
		context.Context,
		EvaluationAuthority,
		string,
	) ([]evaluationCapabilityProbeProviderResourceCleanupListRecord, error)
	ClaimEvaluationCapabilityProbeProviderResourceCleanup(
		context.Context,
		EvaluationAuthority,
		evaluationCapabilityProbeProviderResourceCleanupRequest,
		string,
		time.Time,
	) (EvaluationCapabilityProbeProviderResourceCleanupRecord, bool, error)
	MarkEvaluationCapabilityProbeProviderResourceCleanupDispatched(
		context.Context,
		EvaluationAuthority,
		evaluationCapabilityProbeProviderResourceCleanupRequest,
		string,
		time.Time,
	) (EvaluationCapabilityProbeProviderResourceCleanupRecord, bool, error)
	GetEvaluationCapabilityProbeProviderResourceCleanup(
		context.Context,
		EvaluationAuthority,
		evaluationCapabilityProbeProviderResourceCleanupRequest,
	) (EvaluationCapabilityProbeProviderResourceCleanupRecord, error)
	StoreEvaluationCapabilityProbeProviderResourceCleanupResult(
		context.Context,
		EvaluationAuthority,
		evaluationCapabilityProbeProviderResourceCleanupRequest,
		string,
		evaluationCapabilityProbeProviderResourceCleanupReceipt,
		string,
		string,
		time.Time,
	) (EvaluationCapabilityProbeProviderResourceCleanupRecord, bool, error)
	SealEvaluationCapabilityProbeProviderResourceCleanup(
		context.Context,
		EvaluationAuthority,
		evaluationCapabilityProbeProviderResourceCleanupRequest,
		string,
		[]byte,
		time.Time,
	) (EvaluationCapabilityProbeProviderResourceCleanupRecord, bool, error)
}

func evaluationCapabilityProbeProviderResourceCleanupRequestValue(
	repositoryCommit string,
	resourceRegistrationRequestDigest string,
	deletionAuthorityReceiptDigest string,
) (map[string]any, string, []byte, error) {
	base := map[string]any{
		"format":                            evaluationCapabilityProbeProviderResourceCleanupAuthorityRequestFormat,
		"version":                           evaluationCapabilityProbeProviderResourceCleanupVersion,
		"repositoryCommit":                  repositoryCommit,
		"resourceRegistrationRequestDigest": resourceRegistrationRequestDigest,
		"deletionAuthorityReceiptDigest":    deletionAuthorityReceiptDigest,
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, "", nil, err
	}
	value := cloneEvaluationObject(base)
	value["cleanupRequestDigest"] = digest
	encoded, err := canonicaljson.Bytes(value)
	return value, digest, encoded, err
}

func decodeEvaluationCapabilityProbeProviderResourceCleanupRequest(
	source []byte,
) (evaluationCapabilityProbeProviderResourceCleanupRequest, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, 16_384)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "repositoryCommit", "resourceRegistrationRequestDigest",
		"deletionAuthorityReceiptDigest", "cleanupRequestDigest",
	}) || stringMember(value, "format") != evaluationCapabilityProbeProviderResourceCleanupAuthorityRequestFormat {
		return evaluationCapabilityProbeProviderResourceCleanupRequest{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	repositoryCommit := stringMember(value, "repositoryCommit")
	registrationDigest := stringMember(value, "resourceRegistrationRequestDigest")
	deletionDigest := stringMember(value, "deletionAuthorityReceiptDigest")
	_, expected, expectedBytes, expectedErr := evaluationCapabilityProbeProviderResourceCleanupRequestValue(
		repositoryCommit, registrationDigest, deletionDigest,
	)
	if !versionOK || version != evaluationCapabilityProbeProviderResourceCleanupVersion ||
		!evaluationRepositoryCommitPattern.MatchString(repositoryCommit) ||
		!evaluationDigestPattern.MatchString(registrationDigest) ||
		!evaluationDigestPattern.MatchString(deletionDigest) || expectedErr != nil ||
		expected != stringMember(value, "cleanupRequestDigest") || string(canonical) != string(expectedBytes) {
		return evaluationCapabilityProbeProviderResourceCleanupRequest{}, ErrConflict
	}
	return evaluationCapabilityProbeProviderResourceCleanupRequest{
		RepositoryCommit: repositoryCommit, ResourceRegistrationRequestDigest: registrationDigest,
		DeletionAuthorityReceiptDigest: deletionDigest, CleanupRequestDigest: expected,
		Value: value, Bytes: canonical,
	}, nil
}

func decodeEvaluationCapabilityProbeProviderResourceDeletionAuthorityReceipt(
	raw any,
) (map[string]any, []byte, error) {
	receipt, receiptBytes, err := evaluationCapabilityProbeProviderResourceCanonicalComponent(
		raw, []string{
			"format", "version", "requestDigest", "resourceManifestDigest", "providerResourceKind",
			"providerResourceId", "deletionRouteBinding", "deletionRequestProjection",
			"deletionRequestProjectionDigest", "registeredAt", "expiresAt", "deletionAuthorityReceiptDigest",
		}, evaluationCapabilityProbeProviderResourceDeletionReceiptFormat, "deletionAuthorityReceiptDigest",
		maximumEvaluationCapabilityProbeProviderResourceComponentBytes,
	)
	if err != nil {
		return nil, nil, err
	}
	projection, ok := receipt["deletionRequestProjection"].(map[string]any)
	if !ok || !exactEvaluationKeys(projection, []string{
		"format", "version", "requestDigest", "protocolFamily", "providerResourceKind",
		"providerResourceId", "auxiliaryResourceIds",
	}) || stringMember(projection, "format") != evaluationCapabilityProbeProviderResourceDeletionProjectionFormat {
		return nil, nil, ErrInvalid
	}
	projectionVersion, projectionVersionOK := integerMember(projection, "version")
	protocol := stringMember(projection, "protocolFamily")
	expectedKind, protocolOK := evaluationCapabilityProbeProviderResourceKindByProtocol[protocol]
	primaryID := stringMember(projection, "providerResourceId")
	auxiliary, auxiliaryOK := arrayMember(projection, "auxiliaryResourceIds")
	projectionBytes, projectionBytesErr := canonicaljson.Bytes(projection)
	projectionDigest, projectionDigestErr := canonicaljson.Digest(projection)
	registeredAt, registeredErr := parseEvaluationServiceInstant(stringMember(receipt, "registeredAt"))
	expiresAt, expiresErr := parseEvaluationServiceInstant(stringMember(receipt, "expiresAt"))
	if !projectionVersionOK || projectionVersion != evaluationCapabilityProbeProviderResourceVersion || !protocolOK ||
		!validEvaluationAgentControlIdentity(primaryID) || !auxiliaryOK ||
		len(auxiliary) > maximumEvaluationCapabilityProbeProviderResourceAuxiliaryIDs ||
		projectionBytesErr != nil || len(projectionBytes) > maximumEvaluationCapabilityProbeProviderResourceComponentBytes ||
		projectionDigestErr != nil || projectionDigest != stringMember(receipt, "deletionRequestProjectionDigest") ||
		stringMember(receipt, "requestDigest") != stringMember(projection, "requestDigest") ||
		stringMember(receipt, "providerResourceKind") != expectedKind ||
		stringMember(receipt, "providerResourceKind") != stringMember(projection, "providerResourceKind") ||
		stringMember(receipt, "providerResourceId") != primaryID ||
		stringMember(receipt, "deletionRouteBinding") != "provider-resource.delete" ||
		!evaluationDigestPattern.MatchString(stringMember(receipt, "resourceManifestDigest")) ||
		registeredErr != nil || expiresErr != nil || !expiresAt.After(registeredAt) ||
		expiresAt.Sub(registeredAt) > maximumEvaluationCapabilityProbeProviderResourceLifetime ||
		agentcontract.ValidateSanitizedAgentPayload(projection) != nil {
		return nil, nil, ErrConflict
	}
	previous := ""
	for index, rawID := range auxiliary {
		resourceID, ok := rawID.(string)
		if !ok || !validEvaluationAgentControlIdentity(resourceID) || resourceID == primaryID ||
			index > 0 && previous >= resourceID {
			return nil, nil, ErrConflict
		}
		previous = resourceID
	}
	return receipt, receiptBytes, nil
}

func evaluationCapabilityProbeProviderResourceCleanupInnerStageDigest(
	deletionReceipt map[string]any,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":                          evaluationCapabilityProbeProviderResourceCleanupStageFormat,
		"version":                         evaluationCapabilityProbeProviderResourceCleanupVersion,
		"requestDigest":                   stringMember(deletionReceipt, "requestDigest"),
		"deletionAuthorityReceiptDigest":  stringMember(deletionReceipt, "deletionAuthorityReceiptDigest"),
		"deletionRequestProjectionDigest": stringMember(deletionReceipt, "deletionRequestProjectionDigest"),
	})
}

func evaluationCapabilityProbeProviderResourceCleanupInnerDispatchAckDigest(
	deletionReceipt map[string]any,
	resourceResultSetDigest string,
) (string, error) {
	stageDigest, err := evaluationCapabilityProbeProviderResourceCleanupInnerStageDigest(deletionReceipt)
	if err != nil {
		return "", err
	}
	return canonicaljson.Digest(map[string]any{
		"format":                         evaluationCapabilityProbeProviderResourceCleanupDispatchAckFormat,
		"version":                        evaluationCapabilityProbeProviderResourceCleanupVersion,
		"requestDigest":                  stringMember(deletionReceipt, "requestDigest"),
		"deletionAuthorityReceiptDigest": stringMember(deletionReceipt, "deletionAuthorityReceiptDigest"),
		"cleanupStageDigest":             stageDigest,
		"resourceResultSetDigest":        resourceResultSetDigest,
	})
}

func decodeEvaluationCapabilityProbeProviderResourceCleanupReceipt(
	raw any,
	deletionReceipt map[string]any,
) (evaluationCapabilityProbeProviderResourceCleanupReceipt, error) {
	receipt, receiptBytes, err := evaluationCapabilityProbeProviderResourceCanonicalComponent(
		raw, []string{
			"format", "version", "requestDigest", "deletionAuthorityReceiptDigest",
			"deletionRequestProjectionDigest", "protocolFamily", "providerResourceKind", "providerResourceId",
			"auxiliaryResourceIds", "cleanupStageDigest", "cleanupDispatchAckDigest", "resourceResults",
			"resourceResultSetDigest", "completedAt", "cleanupReceiptDigest",
		}, evaluationCapabilityProbeProviderResourceCleanupReceiptFormat, "cleanupReceiptDigest",
		maximumEvaluationCapabilityProbeProviderResourceCleanupReceiptBytes,
	)
	if err != nil {
		return evaluationCapabilityProbeProviderResourceCleanupReceipt{}, err
	}
	projection, _ := objectMember(deletionReceipt, "deletionRequestProjection")
	auxiliary, auxiliaryOK := arrayMember(receipt, "auxiliaryResourceIds")
	expectedAuxiliary, expectedAuxiliaryOK := arrayMember(projection, "auxiliaryResourceIds")
	results, resultsOK := arrayMember(receipt, "resourceResults")
	if !auxiliaryOK || !expectedAuxiliaryOK || !resultsOK || len(results) < 1 ||
		len(results) > maximumEvaluationCapabilityProbeProviderResourceAuxiliaryIDs+1 ||
		!sameEvaluationCanonicalValue(auxiliary, expectedAuxiliary) ||
		stringMember(receipt, "requestDigest") != stringMember(deletionReceipt, "requestDigest") ||
		stringMember(receipt, "deletionAuthorityReceiptDigest") != stringMember(deletionReceipt, "deletionAuthorityReceiptDigest") ||
		stringMember(receipt, "deletionRequestProjectionDigest") != stringMember(deletionReceipt, "deletionRequestProjectionDigest") ||
		stringMember(receipt, "protocolFamily") != stringMember(projection, "protocolFamily") ||
		stringMember(receipt, "providerResourceKind") != stringMember(deletionReceipt, "providerResourceKind") ||
		stringMember(receipt, "providerResourceId") != stringMember(deletionReceipt, "providerResourceId") {
		return evaluationCapabilityProbeProviderResourceCleanupReceipt{}, ErrConflict
	}
	registeredAt, registeredErr := parseEvaluationServiceInstant(stringMember(deletionReceipt, "registeredAt"))
	resourceIDs := make(map[string]struct{}, len(results))
	expectedIDs := make(map[string]struct{}, len(expectedAuxiliary)+1)
	expectedIDs[stringMember(deletionReceipt, "providerResourceId")] = struct{}{}
	for _, rawID := range expectedAuxiliary {
		expectedIDs[rawID.(string)] = struct{}{}
	}
	resultLeaves := make([]any, 0, len(results))
	latest := time.Time{}
	previousRole, previousID := "", ""
	for index, rawResult := range results {
		result, ok := rawResult.(map[string]any)
		if !ok || !exactEvaluationKeys(result, []string{
			"format", "version", "resourceId", "resourceRole", "outcome", "dispatchIntentDigest",
			"transportReceiptDigest", "completedAt", "resultDigest",
		}) || stringMember(result, "format") != evaluationCapabilityProbeProviderResourceCleanupResourceResultFormat {
			return evaluationCapabilityProbeProviderResourceCleanupReceipt{}, ErrInvalid
		}
		version, versionOK := integerMember(result, "version")
		base := cloneEvaluationObject(result)
		delete(base, "resultDigest")
		resultDigest, digestErr := canonicaljson.Digest(base)
		completedAt, completedErr := parseEvaluationServiceInstant(stringMember(result, "completedAt"))
		resourceID := stringMember(result, "resourceId")
		role := stringMember(result, "resourceRole")
		_, expected := expectedIDs[resourceID]
		_, duplicate := resourceIDs[resourceID]
		ordered := index == 0 || previousRole == role && previousID < resourceID || previousRole == "primary" && role == "auxiliary"
		if !versionOK || version != evaluationCapabilityProbeProviderResourceCleanupVersion || digestErr != nil ||
			resultDigest != stringMember(result, "resultDigest") || !validEvaluationAgentControlIdentity(resourceID) ||
			!expected || duplicate || !oneOfString(role, "primary", "auxiliary") ||
			!oneOfString(stringMember(result, "outcome"), "already-absent", "deleted") ||
			!evaluationDigestPattern.MatchString(stringMember(result, "dispatchIntentDigest")) ||
			!evaluationDigestPattern.MatchString(stringMember(result, "transportReceiptDigest")) ||
			completedErr != nil || registeredErr != nil || completedAt.Before(registeredAt) || !ordered ||
			(resourceID == stringMember(deletionReceipt, "providerResourceId")) != (role == "primary") {
			return evaluationCapabilityProbeProviderResourceCleanupReceipt{}, ErrConflict
		}
		resourceIDs[resourceID] = struct{}{}
		previousRole, previousID = role, resourceID
		if latest.IsZero() || completedAt.After(latest) {
			latest = completedAt
		}
		resultLeaves = append(resultLeaves, map[string]any{"resourceId": resourceID, "resultDigest": resultDigest})
	}
	if len(resourceIDs) != len(expectedIDs) {
		return evaluationCapabilityProbeProviderResourceCleanupReceipt{}, ErrConflict
	}
	resourceResultSetDigest, setErr := canonicaljson.Digest(map[string]any{"resourceResults": resultLeaves})
	innerStageDigest, stageErr := evaluationCapabilityProbeProviderResourceCleanupInnerStageDigest(deletionReceipt)
	innerAckDigest, ackErr := evaluationCapabilityProbeProviderResourceCleanupInnerDispatchAckDigest(
		deletionReceipt, resourceResultSetDigest,
	)
	completedAt, completedErr := parseEvaluationServiceInstant(stringMember(receipt, "completedAt"))
	if setErr != nil || stageErr != nil || ackErr != nil || completedErr != nil || !completedAt.Equal(latest) ||
		resourceResultSetDigest != stringMember(receipt, "resourceResultSetDigest") ||
		innerStageDigest != stringMember(receipt, "cleanupStageDigest") ||
		innerAckDigest != stringMember(receipt, "cleanupDispatchAckDigest") {
		return evaluationCapabilityProbeProviderResourceCleanupReceipt{}, ErrConflict
	}
	auxiliaryIDs := make([]string, len(auxiliary))
	for index, rawID := range auxiliary {
		auxiliaryIDs[index] = rawID.(string)
	}
	return evaluationCapabilityProbeProviderResourceCleanupReceipt{
		Value: receipt, Bytes: receiptBytes, RequestDigest: stringMember(receipt, "requestDigest"),
		DeletionReceiptDigest:    stringMember(receipt, "deletionAuthorityReceiptDigest"),
		DeletionProjectionDigest: stringMember(receipt, "deletionRequestProjectionDigest"),
		ProtocolFamily:           stringMember(receipt, "protocolFamily"), ProviderResourceKind: stringMember(receipt, "providerResourceKind"),
		ProviderResourceID: stringMember(receipt, "providerResourceId"), AuxiliaryResourceIDs: auxiliaryIDs,
		CleanupStageDigest: innerStageDigest, CleanupDispatchAckDigest: innerAckDigest,
		ResourceResultSetDigest: resourceResultSetDigest, CompletedAt: completedAt,
		CleanupReceiptDigest: stringMember(receipt, "cleanupReceiptDigest"),
	}, nil
}

func evaluationCapabilityProbeProviderResourceCleanupAuthorityStageDigest(
	request evaluationCapabilityProbeProviderResourceCleanupRequest,
	ownerImplementationDigest string,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":                    evaluationCapabilityProbeProviderResourceCleanupAuthorityStageFormat,
		"version":                   evaluationCapabilityProbeProviderResourceCleanupVersion,
		"cleanupRequestDigest":      request.CleanupRequestDigest,
		"ownerImplementationDigest": ownerImplementationDigest,
	})
}

func evaluationCapabilityProbeProviderResourceCleanupOwnerAdmissionDigest(
	requestDigest, stageDigest, ownerImplementationDigest string,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":                    evaluationCapabilityProbeProviderResourceCleanupOwnerAdmissionFormat,
		"version":                   evaluationCapabilityProbeProviderResourceCleanupVersion,
		"cleanupRequestDigest":      requestDigest,
		"stageDigest":               stageDigest,
		"ownerImplementationDigest": ownerImplementationDigest,
	})
}

func evaluationCapabilityProbeProviderResourceCleanupAuthorityAckDigest(
	requestDigest, stageDigest, ownerAdmissionDigest, cleanupReceiptDigest string,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":               evaluationCapabilityProbeProviderResourceCleanupAuthorityAckFormat,
		"version":              evaluationCapabilityProbeProviderResourceCleanupVersion,
		"cleanupRequestDigest": requestDigest,
		"stageDigest":          stageDigest,
		"ownerAdmissionDigest": ownerAdmissionDigest,
		"cleanupReceiptDigest": cleanupReceiptDigest,
	})
}

func evaluationCapabilityProbeProviderResourceCleanupResultIngressDigest(
	requestDigest, dispatchAckDigest, cleanupReceiptDigest string,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":               evaluationCapabilityProbeProviderResourceCleanupResultIngressFormat,
		"version":              evaluationCapabilityProbeProviderResourceCleanupVersion,
		"cleanupRequestDigest": requestDigest,
		"dispatchAckDigest":    dispatchAckDigest,
		"cleanupReceiptDigest": cleanupReceiptDigest,
	})
}

func evaluationCapabilityProbeProviderResourceCleanupIngressReceiptDigest(
	resultIngressDigest, cleanupReceiptDigest string,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":               evaluationCapabilityProbeProviderResourceCleanupIngressReceiptFormat,
		"version":              evaluationCapabilityProbeProviderResourceCleanupVersion,
		"resultIngressDigest":  resultIngressDigest,
		"cleanupReceiptDigest": cleanupReceiptDigest,
	})
}

func evaluationCapabilityProbeProviderResourceCleanupResponse(
	request evaluationCapabilityProbeProviderResourceCleanupRequest,
	ownerImplementationDigest string,
	receipt evaluationCapabilityProbeProviderResourceCleanupReceipt,
) ([]byte, string, error) {
	stageDigest, err := evaluationCapabilityProbeProviderResourceCleanupAuthorityStageDigest(request, ownerImplementationDigest)
	ownerAdmissionDigest, admissionErr := evaluationCapabilityProbeProviderResourceCleanupOwnerAdmissionDigest(
		request.CleanupRequestDigest, stageDigest, ownerImplementationDigest,
	)
	dispatchAckDigest, ackErr := evaluationCapabilityProbeProviderResourceCleanupAuthorityAckDigest(
		request.CleanupRequestDigest, stageDigest, ownerAdmissionDigest, receipt.CleanupReceiptDigest,
	)
	resultIngressDigest, ingressErr := evaluationCapabilityProbeProviderResourceCleanupResultIngressDigest(
		request.CleanupRequestDigest, dispatchAckDigest, receipt.CleanupReceiptDigest,
	)
	ingressReceiptDigest, receiptErr := evaluationCapabilityProbeProviderResourceCleanupIngressReceiptDigest(
		resultIngressDigest, receipt.CleanupReceiptDigest,
	)
	if err != nil || admissionErr != nil || ackErr != nil || ingressErr != nil || receiptErr != nil {
		return nil, "", ErrConflict
	}
	base := map[string]any{
		"format":                            evaluationCapabilityProbeProviderResourceCleanupResponseFormat,
		"version":                           evaluationCapabilityProbeProviderResourceCleanupVersion,
		"repositoryCommit":                  request.RepositoryCommit,
		"resourceRegistrationRequestDigest": request.ResourceRegistrationRequestDigest,
		"cleanupRequestDigest":              request.CleanupRequestDigest,
		"deletionAuthorityReceiptDigest":    request.DeletionAuthorityReceiptDigest,
		"ownerImplementationDigest":         ownerImplementationDigest,
		"stageDigest":                       stageDigest,
		"ownerAdmissionDigest":              ownerAdmissionDigest,
		"dispatchAckDigest":                 dispatchAckDigest,
		"resultIngressDigest":               resultIngressDigest,
		"resultIngressReceiptDigest":        ingressReceiptDigest,
		"cleanupReceipt":                    receipt.Value,
	}
	responseDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, "", err
	}
	value := cloneEvaluationObject(base)
	value["responseDigest"] = responseDigest
	encoded, err := canonicaljson.Bytes(value)
	if err != nil || len(encoded) > maximumEvaluationCapabilityProbeProviderResourceCleanupResponseBytes ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return nil, "", ErrConflict
	}
	return encoded, responseDigest, nil
}

func validateEvaluationCapabilityProbeProviderResourceCleanupResponse(
	source []byte,
	request evaluationCapabilityProbeProviderResourceCleanupRequest,
	record EvaluationCapabilityProbeProviderResourceCleanupRecord,
	deletionReceipt map[string]any,
) error {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationCapabilityProbeProviderResourceCleanupResponseBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "repositoryCommit", "resourceRegistrationRequestDigest", "cleanupRequestDigest",
		"deletionAuthorityReceiptDigest", "ownerImplementationDigest", "stageDigest", "ownerAdmissionDigest",
		"dispatchAckDigest", "resultIngressDigest", "resultIngressReceiptDigest", "cleanupReceipt", "responseDigest",
	}) || stringMember(value, "format") != evaluationCapabilityProbeProviderResourceCleanupResponseFormat {
		return ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	receipt, receiptErr := decodeEvaluationCapabilityProbeProviderResourceCleanupReceipt(value["cleanupReceipt"], deletionReceipt)
	base := cloneEvaluationObject(value)
	delete(base, "responseDigest")
	digest, digestErr := canonicaljson.Digest(base)
	if !versionOK || version != evaluationCapabilityProbeProviderResourceCleanupVersion || receiptErr != nil ||
		stringMember(value, "repositoryCommit") != request.RepositoryCommit ||
		stringMember(value, "resourceRegistrationRequestDigest") != request.ResourceRegistrationRequestDigest ||
		stringMember(value, "cleanupRequestDigest") != request.CleanupRequestDigest ||
		stringMember(value, "deletionAuthorityReceiptDigest") != request.DeletionAuthorityReceiptDigest ||
		stringMember(value, "ownerImplementationDigest") != record.OwnerImplementationDigest ||
		stringMember(value, "stageDigest") != record.StageDigest ||
		stringMember(value, "ownerAdmissionDigest") != record.OwnerAdmissionDigest ||
		stringMember(value, "dispatchAckDigest") != record.DispatchAckDigest ||
		stringMember(value, "resultIngressDigest") != record.ResultIngressDigest ||
		stringMember(value, "resultIngressReceiptDigest") != record.ResultIngressReceiptDigest ||
		receipt.CleanupReceiptDigest != record.CleanupReceiptDigest || digestErr != nil ||
		digest != stringMember(value, "responseDigest") || digest != record.ResponseDigest {
		return ErrConflict
	}
	return nil
}

func evaluationCapabilityProbeProviderResourceCleanupArchiveSetDigest(records [][]byte) (string, error) {
	digests := make([]string, 0, len(records))
	for _, source := range records {
		value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationCapabilityProbeProviderResourceCleanupArchiveBytes)
		if err != nil {
			return "", err
		}
		digests = append(digests, stringMember(value, "recordDigest"))
	}
	sort.Strings(digests)
	values := make([]any, len(digests))
	for index, digest := range digests {
		values[index] = digest
	}
	return canonicaljson.Digest(map[string]any{"recordDigests": values})
}
