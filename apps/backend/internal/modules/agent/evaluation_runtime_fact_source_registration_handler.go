package agent

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func (handler *EvaluationServiceHandler) evaluationRuntimeFactSourceOwnerRegistrationRoute(request *http.Request) bool {
	if request.URL == nil || strings.Contains(strings.ToLower(request.URL.EscapedPath()), "%2f") ||
		strings.HasSuffix(request.URL.Path, "/") {
		return false
	}
	segments := strings.Split(strings.TrimPrefix(request.URL.Path, "/"), "/")
	return len(segments) == 4 && segments[0] == "v1" && segments[1] == "evaluations" &&
		segments[2] == handler.authority.NamespaceID && validEvaluationServiceIdentity(segments[2]) &&
		segments[3] == "runtime-fact-source-owner-registrations"
}

func validateEvaluationRuntimeFactSourceRegistrationReceipt(
	source []byte,
	request evaluationRuntimeFactSourceRegistrationRequest,
	record EvaluationRuntimeFactSourceRegistrationRecord,
) error {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationRuntimeFactSourceRegistrationResponseBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "repositoryCommit", "requestDigest", "sourceAuthorityKind",
		"sourceKind", "sourceAuthorityId", "sourceAuthorityImplementationDigest", "routeBinding",
		"capabilityProfileId", "capabilityProfileDigest", "capabilityId", "protocolFamily",
		"providerConfigurationId", "modelId", "modelLineageDigest", "adapterDigest",
		"registrationAuthorityIssuerId", "ownerHealthDigest", "ownerAdmissionDigest", "stageDigest",
		"dispatchAckDigest", "registeredAt", "expiresAt", "registrationReceiptDigest",
	}) || stringMember(value, "format") != evaluationRuntimeFactSourceRegistrationReceiptFormat ||
		stringMember(value, "namespaceId") != request.NamespaceID ||
		stringMember(value, "repositoryCommit") != request.RepositoryCommit ||
		stringMember(value, "requestDigest") != request.RequestDigest ||
		stringMember(value, "sourceAuthorityKind") != request.SourceAuthorityKind ||
		stringMember(value, "sourceKind") != request.SourceKind ||
		stringMember(value, "sourceAuthorityId") != request.SourceAuthorityID ||
		stringMember(value, "sourceAuthorityImplementationDigest") != request.SourceAuthorityImplementationDigest ||
		stringMember(value, "routeBinding") != request.RouteBinding ||
		stringMember(value, "capabilityProfileId") != request.CapabilityProfileID ||
		stringMember(value, "capabilityProfileDigest") != request.CapabilityProfileDigest ||
		stringMember(value, "capabilityId") != request.CapabilityID ||
		stringMember(value, "protocolFamily") != request.ProtocolFamily ||
		stringMember(value, "providerConfigurationId") != request.ProviderConfigurationID ||
		stringMember(value, "modelId") != request.ModelID ||
		stringMember(value, "modelLineageDigest") != request.ModelLineageDigest ||
		stringMember(value, "adapterDigest") != request.AdapterDigest ||
		stringMember(value, "registrationAuthorityIssuerId") != record.RegistrationAuthorityIssuerID ||
		stringMember(value, "ownerHealthDigest") != record.OwnerHealthDigest ||
		stringMember(value, "ownerAdmissionDigest") != record.OwnerAdmissionDigest ||
		stringMember(value, "stageDigest") != record.StageDigest ||
		stringMember(value, "dispatchAckDigest") != record.DispatchAckDigest ||
		stringMember(value, "registrationReceiptDigest") != record.RegistrationReceiptDigest {
		return ErrConflict
	}
	version, versionOK := integerMember(value, "version")
	base := cloneEvaluationObject(value)
	delete(base, "registrationReceiptDigest")
	digest, digestErr := canonicaljson.Digest(base)
	if !versionOK || version != evaluationRuntimeFactSourceRegistrationVersion || digestErr != nil ||
		digest != record.RegistrationReceiptDigest {
		return ErrConflict
	}
	return nil
}

func (handler *EvaluationServiceHandler) handleEvaluationRuntimeFactSourceOwnerRegistration(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if request.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodPost)
		return
	}
	if !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if handler.runtimeFactSourceRegistrationAuthority == nil {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	repository, ok := handler.repository.(evaluationRuntimeFactSourceRegistrationRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationRuntimeFactSourceRegistrationRequestBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	registration, err := decodeEvaluationRuntimeFactSourceRegistrationRequest(source, handler.authority)
	if err != nil || !exactEvaluationIdempotencyHeader(request, registration.RequestDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	now := handler.clock().UTC().Truncate(time.Millisecond)
	record, _, err := repository.ClaimEvaluationRuntimeFactSourceRegistration(
		request.Context(), handler.authority, registration, now,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeResponse := func() error {
		if err := validateEvaluationRuntimeFactSourceRegistrationReceipt(record.ReceiptBytes, registration, record); err != nil {
			return err
		}
		if handler.attemptAuthorityResponseScanner != nil {
			if err := handler.attemptAuthorityResponseScanner.ScanAttemptAuthorityPublicResponse(
				request.Context(), evaluationRuntimeFactSourceRegistrationOperation, registration.RequestDigest, record.ReceiptBytes,
			); err != nil {
				return ErrUnauthorized
			}
		}
		writeEvaluationServiceRaw(writer, http.StatusOK, record.ReceiptBytes)
		return nil
	}
	if record.State == "sealed" {
		if err := writeResponse(); err != nil {
			respondEvaluationServiceError(writer, err)
		}
		return
	}
	ownerImplementationDigest, ready := handler.runtimeFactSourceRegistrationAuthority.
		RuntimeFactSourceRegistrationImplementationDigest()
	if !ready || !evaluationDigestPattern.MatchString(ownerImplementationDigest) {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	authorityRequest := EvaluationRuntimeFactSourceRegistrationAuthorityRequest{
		NamespaceID: handler.authority.NamespaceID, RepositoryCommit: registration.RepositoryCommit,
		RequestDigest:                 registration.RequestDigest,
		RegistrationAuthorityIssuerID: handler.authority.PrincipalID,
		OwnerImplementationDigest:     ownerImplementationDigest,
		StageDigest:                   record.StageDigest,
		DispatchAckDigest:             record.DispatchAckDigest, ClaimGeneration: record.ClaimGeneration,
		Request: append(json.RawMessage(nil), registration.Bytes...),
	}
	var sealed evaluationRuntimeFactSourceRegistrationSealedValue
	if record.State == "claimed" {
		stageDigest, stageErr := handler.runtimeFactSourceRegistrationAuthority.StageRuntimeFactSourceRegistration(
			request.Context(), authorityRequest,
		)
		expectedStage, expectedErr := evaluationRuntimeFactSourceRegistrationStageDigest(registration, handler.authority.PrincipalID)
		if stageErr != nil || expectedErr != nil || stageDigest != expectedStage {
			if stageErr == nil {
				stageErr = ErrConflict
			}
			respondEvaluationServiceError(writer, stageErr)
			return
		}
		record, _, err = repository.MarkEvaluationRuntimeFactSourceRegistrationDispatched(
			request.Context(), handler.authority, registration, stageDigest, handler.clock(),
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		authorityRequest.StageDigest = record.StageDigest
		result, executeErr := handler.runtimeFactSourceRegistrationAuthority.ExecuteRuntimeFactSourceRegistration(
			request.Context(), authorityRequest,
		)
		if executeErr != nil {
			respondEvaluationServiceError(writer, executeErr)
			return
		}
		sealed, err = evaluationRuntimeFactSourceRegistrationSealed(
			registration, handler.authority.PrincipalID, record.StageDigest, result,
			record.ClaimedAt, handler.clock().UTC().Truncate(time.Millisecond),
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		record, _, err = repository.AcknowledgeEvaluationRuntimeFactSourceRegistration(
			request.Context(), handler.authority, registration, sealed, handler.clock(),
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
	} else {
		if record.State != "dispatched" || !evaluationDigestPattern.MatchString(record.StageDigest) {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		authorityRequest.StageDigest, authorityRequest.DispatchAckDigest = record.StageDigest, record.DispatchAckDigest
		if len(record.OwnerHealthBytes) != 0 {
			authorityRequest.SealedOwnerHealth, err = evaluationRuntimeFactSourceRegistrationSealedOwnerHealth(record)
			if err != nil {
				respondEvaluationServiceError(writer, err)
				return
			}
		}
		result, reconciled, reconcileErr := handler.runtimeFactSourceRegistrationAuthority.ReconcileRuntimeFactSourceRegistration(
			request.Context(), authorityRequest,
		)
		if reconcileErr != nil || !reconciled {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		sealed, err = evaluationRuntimeFactSourceRegistrationSealed(
			registration, handler.authority.PrincipalID, record.StageDigest, result,
			record.ClaimedAt, handler.clock().UTC().Truncate(time.Millisecond),
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		if record.DispatchAckDigest == "" {
			record, _, err = repository.AcknowledgeEvaluationRuntimeFactSourceRegistration(
				request.Context(), handler.authority, registration, sealed, handler.clock(),
			)
			if err != nil {
				respondEvaluationServiceError(writer, err)
				return
			}
		} else if record.DispatchAckDigest != sealed.DispatchAckDigest ||
			record.RegistrationReceiptDigest != sealed.RegistrationReceiptDigest ||
			!bytes.Equal(record.OwnerHealthBytes, sealed.OwnerHealthBytes) || !bytes.Equal(record.ReceiptBytes, sealed.ReceiptBytes) {
			respondEvaluationServiceError(writer, ErrConflict)
			return
		}
	}
	record, _, err = repository.SealEvaluationRuntimeFactSourceRegistration(
		request.Context(), handler.authority, registration, sealed.RegistrationReceiptDigest,
		sealed.DispatchAckDigest, handler.clock(),
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if err := writeResponse(); err != nil {
		respondEvaluationServiceError(writer, err)
	}
}
