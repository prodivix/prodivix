package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreRequestFormat = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-reconciliation-observation-store-request"
	evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationProjectionFormat   = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-reconciliation-observation-projection"
	evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationAuthorityIssuerID  = "authority.prodivix.hosted-retrieval-runtime-resource-lifecycle-reconciliation"
	evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationImplementation     = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-reconciliation-implementation"
)

var evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreRequestKeys = []string{
	"format", "version", "purpose", "authorizationRequest", "authorizationRequestDigest",
	"observationProjection", "observationProjectionDigest", "requestDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreAuthorizationKeys = []string{
	"format", "version", "purpose", "dispatchIntentDigest", "dispatchStageClaimReceiptDigest",
	"transportReceiptDigest", "mutationKind", "mutationSequence", "providerConfigurationId",
	"endpointId", "method", "requestedAt", "requestDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreProjectionKeys = []string{
	"format", "version", "dispatchIntentDigest", "dispatchStageClaimReceiptDigest", "transportReceiptDigest",
	"mutationKind", "mutationSequence", "providerConfigurationId", "endpointId", "method", "observationOutcome",
	"resourceId", "resourceRole", "resourceManifestDigest", "httpStatus", "providerRequestId",
	"requestProjectionDigest", "responseProjectionDigest", "responseBodyDigest", "responseBytes", "observedAt",
	"projectionDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreReceiptKeys = []string{
	"format", "version", "request", "requestDigest", "observationAuthorityIssuerId",
	"observationAuthorityImplementationDigest", "dispatchIntentDigest", "dispatchStageClaimReceiptDigest",
	"transportReceiptDigest", "mutationKind", "mutationSequence", "observationOutcome", "resourceId",
	"resourceRole", "resourceManifestDigest", "httpStatus", "providerRequestId", "observedAt", "receiptDigest",
}

type evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreRequest struct {
	AuthorizationRequest           map[string]any
	AuthorizationRequestCanonical  []byte
	ObservationProjection          map[string]any
	ObservationProjectionCanonical []byte
	RequestedAt                    time.Time
	ObservedAt                     time.Time
	RequestDigest                  string
	Value                          map[string]any
	Canonical                      []byte
}

func evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationOutcomeValid(
	mutationKind string,
	outcome string,
	httpStatus int64,
) bool {
	if mutationKind == "delete-resource" {
		return (outcome == "already-absent" && httpStatus == 404) ||
			(outcome == "deleted" && httpStatus >= 200 && httpStatus <= 299)
	}
	return oneOfString(outcome, "accepted", "created", "uploaded") && httpStatus >= 200 && httpStatus <= 299
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreRequest(
	source []byte,
) (evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreRequest, error) {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes)
	if err != nil || evaluationAuthenticityCredentialPattern.Match(source) ||
		!exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreRequestKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreRequestFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		stringMember(value, "purpose") != evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStorePurpose ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "requestDigest") {
		return evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreRequest{}, ErrInvalid
	}
	authorization, authorizationOK := objectMember(value, "authorizationRequest")
	projection, projectionOK := objectMember(value, "observationProjection")
	if !authorizationOK || !projectionOK ||
		!exactEvaluationKeys(authorization, evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreAuthorizationKeys) ||
		stringMember(authorization, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationRequestFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(authorization) ||
		stringMember(authorization, "purpose") != evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationReadPurpose ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(authorization, "requestDigest") ||
		stringMember(value, "authorizationRequestDigest") != stringMember(authorization, "requestDigest") ||
		!exactEvaluationKeys(projection, evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreProjectionKeys) ||
		stringMember(projection, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationProjectionFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(projection) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(projection, "projectionDigest") ||
		stringMember(value, "observationProjectionDigest") != stringMember(projection, "projectionDigest") {
		return evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreRequest{}, ErrInvalid
	}
	for _, key := range []string{"dispatchIntentDigest", "dispatchStageClaimReceiptDigest", "transportReceiptDigest"} {
		if !evaluationDigestPattern.MatchString(stringMember(authorization, key)) ||
			stringMember(projection, key) != stringMember(authorization, key) {
			return evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreRequest{}, ErrInvalid
		}
	}
	for _, key := range []string{"requestProjectionDigest", "responseProjectionDigest", "responseBodyDigest"} {
		if !evaluationDigestPattern.MatchString(stringMember(projection, key)) {
			return evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreRequest{}, ErrInvalid
		}
	}
	mutationKind := stringMember(authorization, "mutationKind")
	sequence, sequenceOK := integerMember(authorization, "mutationSequence")
	projectionSequence, projectionSequenceOK := integerMember(projection, "mutationSequence")
	httpStatus, statusOK := integerMember(projection, "httpStatus")
	responseBytes, responseBytesOK := integerMember(projection, "responseBytes")
	requestedAt, requestedErr := evaluationInstant(authorization["requestedAt"], "requestedAt")
	observedAt, observedErr := evaluationInstant(projection["observedAt"], "observedAt")
	if !oneOfString(mutationKind, "create-primary", "delete-resource", "upload-content", "upload-content-finalize", "upload-content-start") ||
		!sequenceOK || sequence < 0 || sequence >= 4 || !projectionSequenceOK || projectionSequence != sequence ||
		stringMember(projection, "mutationKind") != mutationKind ||
		!validEvaluationAgentControlIdentity(stringMember(authorization, "providerConfigurationId")) ||
		!validEvaluationAgentControlIdentity(stringMember(authorization, "endpointId")) ||
		stringMember(projection, "providerConfigurationId") != stringMember(authorization, "providerConfigurationId") ||
		stringMember(projection, "endpointId") != stringMember(authorization, "endpointId") ||
		stringMember(authorization, "method") != "GET" || stringMember(projection, "method") != "GET" ||
		!statusOK || !evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationOutcomeValid(
		mutationKind, stringMember(projection, "observationOutcome"), httpStatus,
	) || !responseBytesOK || responseBytes < 0 || responseBytes > 16_777_216 ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableIdentity(projection, "resourceId") ||
		!oneOfString(stringMember(projection, "resourceRole"), "", "auxiliary", "primary") ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableDigest(projection, "resourceManifestDigest") ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableIdentity(projection, "providerRequestId") ||
		requestedErr != nil || observedErr != nil || observedAt.Before(requestedAt) {
		return evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreRequest{}, ErrInvalid
	}
	authorizationCanonical, err := canonicaljson.Bytes(authorization)
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreRequest{}, ErrInvalid
	}
	projectionCanonical, err := canonicaljson.Bytes(projection)
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreRequest{}, ErrInvalid
	}
	return evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreRequest{
		AuthorizationRequest: authorization, AuthorizationRequestCanonical: authorizationCanonical,
		ObservationProjection: projection, ObservationProjectionCanonical: projectionCanonical,
		RequestedAt: requestedAt, ObservedAt: observedAt, RequestDigest: stringMember(value, "requestDigest"),
		Value: value, Canonical: append([]byte(nil), source...),
	}, nil
}

func evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationImplementationDigest() (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":                       evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationImplementation,
		"version":                      int64(1),
		"observationAuthorityIssuerId": evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationAuthorityIssuerID,
	})
}

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleReconciliationReceipt(
	source []byte,
	request evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreRequest,
	receiptDigest string,
) error {
	value, err := decodeCanonicalEvaluationObject(source, 65_536)
	implementationDigest, implementationErr := evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationImplementationDigest()
	embeddedRequest, requestOK := objectMember(value, "request")
	embeddedBytes, embeddedErr := canonicaljson.Bytes(embeddedRequest)
	if err != nil || implementationErr != nil || !requestOK || embeddedErr != nil ||
		!exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreReceiptKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationReceiptFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "receiptDigest") ||
		stringMember(value, "receiptDigest") != receiptDigest ||
		!bytes.Equal(embeddedBytes, request.AuthorizationRequestCanonical) ||
		stringMember(value, "requestDigest") != stringMember(request.AuthorizationRequest, "requestDigest") ||
		stringMember(value, "observationAuthorityIssuerId") != evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationAuthorityIssuerID ||
		stringMember(value, "observationAuthorityImplementationDigest") != implementationDigest {
		return ErrConflict
	}
	for _, key := range []string{"dispatchIntentDigest", "dispatchStageClaimReceiptDigest", "transportReceiptDigest", "mutationKind", "mutationSequence"} {
		if !evaluationHostedRetrievalRuntimeResourceLifecycleNullableEqual(value[key], request.AuthorizationRequest[key]) {
			return ErrConflict
		}
	}
	for _, key := range []string{"observationOutcome", "resourceId", "resourceRole", "resourceManifestDigest", "httpStatus", "providerRequestId", "observedAt"} {
		if !evaluationHostedRetrievalRuntimeResourceLifecycleNullableEqual(value[key], request.ObservationProjection[key]) {
			return ErrConflict
		}
	}
	return nil
}

func (owner *EvaluationHostedRetrievalRuntimeResource) StoreLifecycleReconciliationObservation(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStoreRequest,
) ([]byte, bool, error) {
	if owner == nil || owner.repository == nil || owner.repository.available() != nil ||
		validateEvaluationAuthority(authority) != nil || owner.lifecycleOwnerInstanceID == "" {
		return nil, false, errEvaluationServiceUnavailable
	}
	implementationDigest, err := evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationImplementationDigest()
	if err != nil {
		return nil, false, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := owner.repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, false, err
	}
	defer func() { _ = tx.Rollback() }()
	var existingRequest, existingReceipt []byte
	err = tx.QueryRowContext(ctx, `SELECT observation_store_request_bytes,receipt_bytes
		FROM ae_hrrr_lifecycle_reconciliation_observations
		WHERE namespace_id=$1 AND observation_store_request_digest=$2 FOR SHARE`,
		authority.NamespaceID, request.RequestDigest).Scan(&existingRequest, &existingReceipt)
	if err == nil {
		if !bytes.Equal(existingRequest, request.Canonical) {
			return nil, false, ErrConflict
		}
		if err := tx.Commit(); err != nil {
			return nil, false, err
		}
		return existingReceipt, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}
	var receiptJSON, receiptBytes []byte
	var receiptDigest string
	var ownerLedgerRevision int64
	err = tx.QueryRowContext(ctx, `SELECT receipt_json,receipt_bytes,receipt_digest,owner_ledger_revision
		FROM store_agent_evaluation_hosted_runtime_lifecycle_reconciliation_observation($1,$2::jsonb,$3,$4,$5)`,
		authority.NamespaceID, string(request.Canonical), request.Canonical,
		evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationAuthorityIssuerID, implementationDigest,
	).Scan(&receiptJSON, &receiptBytes, &receiptDigest, &ownerLedgerRevision)
	if err != nil {
		return nil, false, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchDatabaseError(err)
	}
	receiptValue, err := decodeCanonicalEvaluationObject(receiptJSON, 65_536)
	canonicalReceipt, canonicalErr := canonicaljson.Bytes(receiptValue)
	if err != nil || canonicalErr != nil || !bytes.Equal(canonicalReceipt, receiptBytes) || ownerLedgerRevision < 1 ||
		validateEvaluationHostedRetrievalRuntimeResourceLifecycleReconciliationReceipt(receiptBytes, request, receiptDigest) != nil {
		return nil, false, ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return nil, false, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchDatabaseError(err)
	}
	return receiptBytes, false, nil
}
