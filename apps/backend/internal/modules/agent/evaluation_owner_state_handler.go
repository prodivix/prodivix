package agent

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func (handler *EvaluationServiceHandler) scanEvaluationOwnerStateBytes(
	request *http.Request,
	serviceKind, operation, requestDigest string,
	source []byte,
) error {
	if evaluationAuthenticityCredentialPattern.Match(source) {
		return ErrUnauthorized
	}
	switch serviceKind {
	case "controlled-workspace":
		if handler.controlledWorkspaceResponseScanner == nil {
			return errEvaluationServiceUnavailable
		}
		return handler.controlledWorkspaceResponseScanner.ScanControlledWorkspacePublicResponse(
			request.Context(), operation, requestDigest, source,
		)
	case "verification-evidence":
		if handler.verificationEvidenceResponseScanner == nil {
			return errEvaluationServiceUnavailable
		}
		return handler.verificationEvidenceResponseScanner.ScanVerificationEvidencePublicResponse(
			request.Context(), operation, requestDigest, source,
		)
	default:
		return ErrInvalid
	}
}

func (handler *EvaluationServiceHandler) handleEvaluationOwnerStateCASIngress(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if request.Method == http.MethodGet {
		handler.handleEvaluationOwnerStateCASRead(writer, request, partition, tail)
		return
	}
	if request.Method != http.MethodPost || len(tail) != 1 || tail[0] != "owner-state-cas" ||
		!evaluationServiceQueryIsExact(request) {
		if request.Method != http.MethodPost {
			methodNotAllowed(writer, http.MethodPost)
			return
		}
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	repository, ok := handler.repository.(evaluationOwnerStateRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationOwnerStateOuterBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationOwnerStateOuterBytes)
	if err != nil || agentcontract.ValidateSanitizedAgentPayload(value) != nil ||
		!exactEvaluationKeys(value, []string{
			"format", "version", "serviceKind", "requestDigest", "ownerImplementationDigest",
			"stageDigest", "ownerStateId", "artifactRef", "artifactKind", "mediaType",
			"artifactDigest", "byteLength", "contentBase64", "artifactIdentityDigest", "uploadDigest",
		}) || stringMember(value, "format") != evaluationOwnerStateCASIngressFormat ||
		!oneOfString(stringMember(value, "serviceKind"), "controlled-workspace", "verification-evidence") {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	version, versionOK := integerMember(value, "version")
	byteLength, lengthOK := integerMember(value, "byteLength")
	uploadBase := cloneEvaluationObject(value)
	delete(uploadBase, "uploadDigest")
	uploadDigest, digestErr := canonicaljson.Digest(uploadBase)
	content, decodeErr := base64.StdEncoding.Strict().DecodeString(stringMember(value, "contentBase64"))
	if !versionOK || version != evaluationOwnerStateVersion || !lengthOK ||
		byteLength < 1 || byteLength > maximumEvaluationOwnerStateCASArtifactBytes ||
		decodeErr != nil || int64(len(content)) != byteLength || digestErr != nil ||
		uploadDigest != stringMember(value, "uploadDigest") ||
		!exactEvaluationIdempotencyHeader(request, uploadDigest) {
		clear(content)
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	defer clear(content)
	if err := handler.requirePartition(request.Context(), partition); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if err := handler.scanEvaluationOwnerStateBytes(
		request, stringMember(value, "serviceKind"), "owner-state-cas", stringMember(value, "requestDigest"), content,
	); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	record := EvaluationOwnerStateCASRecord{
		NamespaceID: handler.authority.NamespaceID, PlanDigest: partition.PlanDigest,
		RepositoryCommit: partition.RepositoryCommit, ServiceKind: stringMember(value, "serviceKind"),
		RequestDigest:             stringMember(value, "requestDigest"),
		OwnerImplementationDigest: stringMember(value, "ownerImplementationDigest"),
		StageDigest:               stringMember(value, "stageDigest"), OwnerStateID: stringMember(value, "ownerStateId"),
		ArtifactRef: stringMember(value, "artifactRef"), ArtifactKind: stringMember(value, "artifactKind"),
		MediaType: stringMember(value, "mediaType"), ArtifactDigest: stringMember(value, "artifactDigest"),
		ByteLength: byteLength, ContentBytes: append([]byte(nil), content...),
		ArtifactIdentityDigest: stringMember(value, "artifactIdentityDigest"), UploadDigest: uploadDigest,
	}
	record.CASReceiptDigest, err = evaluationOwnerStateCASReceiptDigest(record)
	if err != nil {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	descriptor, err := evaluationOwnerStateCASDescriptor(record)
	if err != nil {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	record.DescriptorDigest = stringMember(descriptor, "descriptorDigest")
	stored, replayed, err := repository.StoreEvaluationOwnerStateCASArtifact(
		request.Context(), handler.authority, partition, record, handler.clock().UTC(),
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	descriptor, err = evaluationOwnerStateCASDescriptor(stored)
	if err != nil {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	response := map[string]any{
		"format": evaluationOwnerStateCASResponseFormat, "version": evaluationOwnerStateVersion,
		"uploadDigest": uploadDigest, "descriptor": descriptor, "replayed": replayed,
	}
	writeEvaluationServiceJSON(writer, http.StatusOK, response)
}

func validateEvaluationOwnerStateCASReadRecord(
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	serviceKind string,
	ownerStateID string,
	record EvaluationOwnerStateCASRecord,
) (map[string]any, error) {
	contentDigest := fmt.Sprintf("sha256-%x", sha256.Sum256(record.ContentBytes))
	identityDigest, identityErr := evaluationOwnerStateCASArtifactIdentityDigest(record)
	receiptDigest, receiptErr := evaluationOwnerStateCASReceiptDigest(record)
	descriptor, descriptorErr := evaluationOwnerStateCASDescriptor(record)
	if record.NamespaceID != authority.NamespaceID || record.PlanDigest != partition.PlanDigest ||
		record.RepositoryCommit != partition.RepositoryCommit || record.ServiceKind != serviceKind ||
		record.OwnerStateID != ownerStateID || !validEvaluationAgentControlIdentity(record.ArtifactRef) ||
		!validEvaluationAgentControlIdentity(record.ArtifactKind) ||
		!validVerificationEvidenceMediaType(record.MediaType) || record.ByteLength < 1 ||
		record.ByteLength > maximumEvaluationOwnerStateCASArtifactBytes ||
		int64(len(record.ContentBytes)) != record.ByteLength || contentDigest != record.ArtifactDigest ||
		identityErr != nil || receiptErr != nil || descriptorErr != nil ||
		identityDigest != record.ArtifactIdentityDigest || receiptDigest != record.CASReceiptDigest ||
		stringMember(descriptor, "descriptorDigest") != record.DescriptorDigest {
		return nil, ErrConflict
	}
	return descriptor, nil
}

func evaluationOwnerStateBundleReferencesCASDescriptor(bundle map[string]any, descriptor map[string]any) bool {
	entries, ok := bundle["casArtifacts"].([]any)
	if !ok {
		return false
	}
	for _, raw := range entries {
		entry, ok := raw.(map[string]any)
		if ok && stringMember(entry, "artifactRef") == stringMember(descriptor, "artifactRef") &&
			stringMember(entry, "descriptorDigest") == stringMember(descriptor, "descriptorDigest") {
			return true
		}
	}
	return false
}

func (handler *EvaluationServiceHandler) handleEvaluationOwnerStateCASRead(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if len(tail) != 2 || tail[0] != "owner-state-cas" || request.ContentLength != 0 ||
		len(request.TransferEncoding) != 0 {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	repository, ok := handler.repository.(evaluationOwnerStateRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	query, err := evaluationServiceQuery(request, "serviceKind", "operation", "artifactRef", "descriptorDigest")
	serviceKind, operation := query.Get("serviceKind"), query.Get("operation")
	ownerStateID, artifactRef := tail[1], query.Get("artifactRef")
	if err != nil || !evaluationOwnerStateReadPurpose(serviceKind, operation) ||
		!evaluationDigestPattern.MatchString(ownerStateID) ||
		!validEvaluationAgentControlIdentity(artifactRef) ||
		!evaluationDigestPattern.MatchString(query.Get("descriptorDigest")) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if err := handler.requirePartition(request.Context(), partition); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	state, err := repository.GetEvaluationOwnerState(
		request.Context(), handler.authority, partition, serviceKind, ownerStateID,
	)
	if err != nil || validateEvaluationOwnerStateReadRecord(handler.authority, partition, serviceKind, state) != nil {
		if err == nil {
			err = ErrConflict
		}
		respondEvaluationServiceError(writer, err)
		return
	}
	bundle, root, err := decodeEvaluationOwnerStateBundle(
		state.BundleBytes, serviceKind, handler.authority.NamespaceID, partition, ownerStateID,
		state.Revision, evaluationOwnerStatePreviousRoot(state.BundleBytes),
	)
	if err != nil || root != state.RootDigest {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	record, err := repository.GetEvaluationOwnerStateCASArtifact(
		request.Context(), handler.authority, partition, serviceKind, ownerStateID, artifactRef,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	descriptor, err := validateEvaluationOwnerStateCASReadRecord(
		handler.authority, partition, serviceKind, ownerStateID, record,
	)
	if err != nil || stringMember(descriptor, "descriptorDigest") != query.Get("descriptorDigest") ||
		!evaluationOwnerStateBundleReferencesCASDescriptor(bundle, descriptor) {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	if err := handler.scanEvaluationOwnerStateBytes(
		request, serviceKind, operation, stringMember(descriptor, "descriptorDigest"), record.ContentBytes,
	); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	response := map[string]any{
		"format": evaluationOwnerStateCASReadResponseFormat, "version": evaluationOwnerStateVersion,
		"serviceKind": serviceKind, "operation": operation, "ownerStateId": ownerStateID,
		"ownerStateRevision": state.Revision, "ownerStateRootDigest": state.RootDigest,
		"descriptor": descriptor, "contentBase64": base64.StdEncoding.EncodeToString(record.ContentBytes),
	}
	responseDigest, err := evaluationOwnerStateResponseDigest(response)
	if err != nil {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	response["responseDigest"] = responseDigest
	writeEvaluationServiceJSON(writer, http.StatusOK, response)
}

func (handler *EvaluationServiceHandler) handleEvaluationOwnerStateResultIngress(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if request.Method != http.MethodPost || len(tail) != 1 || tail[0] != "owner-state-results" ||
		!evaluationServiceQueryIsExact(request) {
		if request.Method != http.MethodPost {
			methodNotAllowed(writer, http.MethodPost)
			return
		}
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	repository, ok := handler.repository.(evaluationOwnerStateRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationOwnerStateOuterBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationOwnerStateOuterBytes)
	if err != nil || agentcontract.ValidateSanitizedAgentPayload(value) != nil ||
		!exactEvaluationKeys(value, []string{
			"format", "version", "serviceKind", "operation", "routeBinding", "requestDigest",
			"ownerImplementationDigest", "stageDigest", "ownerStateId", "priorOwnerStateRevision",
			"priorOwnerStateRootDigest", "publicResult", "responseDigest", "ownerStateRevision",
			"ownerStateBundle", "ownerStateRootDigest", "dispatchAckDigest", "ingressDigest",
		}) || stringMember(value, "format") != evaluationOwnerStateResultIngressFormat ||
		!evaluationOwnerStatefulOperation(
			stringMember(value, "serviceKind"), stringMember(value, "operation"), stringMember(value, "routeBinding"),
		) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	version, versionOK := integerMember(value, "version")
	priorRevision, priorOK := integerMember(value, "priorOwnerStateRevision")
	revision, revisionOK := integerMember(value, "ownerStateRevision")
	ingressBase := cloneEvaluationObject(value)
	delete(ingressBase, "ingressDigest")
	ingressDigest, digestErr := canonicaljson.Digest(ingressBase)
	publicResult, resultErr := canonicaljson.Bytes(value["publicResult"])
	responseDigest, responseDigestErr := canonicaljson.Digest(value["publicResult"])
	bundle, bundleErr := canonicaljson.Bytes(value["ownerStateBundle"])
	priorRoot := ""
	if value["priorOwnerStateRootDigest"] != nil {
		priorRoot = stringMember(value, "priorOwnerStateRootDigest")
	}
	if !versionOK || version != evaluationOwnerStateVersion || !priorOK || !revisionOK ||
		revision != priorRevision+1 || digestErr != nil || ingressDigest != stringMember(value, "ingressDigest") ||
		resultErr != nil || responseDigestErr != nil || responseDigest != stringMember(value, "responseDigest") ||
		bundleErr != nil || len(bundle) > evaluationOwnerStateMaximumBytes(stringMember(value, "serviceKind")) ||
		!exactEvaluationIdempotencyHeader(request, ingressDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if err := handler.requirePartition(request.Context(), partition); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	for _, guarded := range [][]byte{publicResult, bundle} {
		if err := handler.scanEvaluationOwnerStateBytes(
			request, stringMember(value, "serviceKind"), stringMember(value, "operation"),
			stringMember(value, "requestDigest"), guarded,
		); err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
	}
	transition := EvaluationOwnerStateTransition{
		PublicResult: publicResult, ResponseDigest: responseDigest,
		OwnerImplementationDigest: stringMember(value, "ownerImplementationDigest"),
		OwnerStateID:              stringMember(value, "ownerStateId"), PriorRevision: priorRevision,
		PriorRootDigest: priorRoot, StageDigest: stringMember(value, "stageDigest"),
		DispatchAckDigest: stringMember(value, "dispatchAckDigest"), OwnerStateRevision: revision,
		OwnerStateBundle: bundle, OwnerStateRootDigest: stringMember(value, "ownerStateRootDigest"),
	}
	sealed, err := evaluationOwnerStateSealedOperationValue(
		transition, stringMember(value, "serviceKind"), stringMember(value, "operation"),
		stringMember(value, "routeBinding"), stringMember(value, "requestDigest"),
	)
	if err != nil {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	transition.ResultReceiptDigest = stringMember(sealed, "resultReceiptDigest")
	stored, replayed, err := repository.StoreEvaluationOwnerStateResult(
		request.Context(), handler.authority, partition, transition,
		stringMember(value, "serviceKind"), stringMember(value, "operation"),
		stringMember(value, "routeBinding"), stringMember(value, "requestDigest"), handler.clock().UTC(),
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if stored.ResultReceiptDigest != transition.ResultReceiptDigest {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	response := map[string]any{
		"format": evaluationOwnerStateResultResponseFormat, "version": evaluationOwnerStateVersion,
		"ingressDigest": ingressDigest, "resultReceiptDigest": stored.ResultReceiptDigest,
		"ownerStateRevision": stored.OwnerStateRevision, "ownerStateRootDigest": stored.OwnerStateRootDigest,
		"replayed": replayed,
	}
	writeEvaluationServiceJSON(writer, http.StatusOK, response)
}
