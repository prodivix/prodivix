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
	evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequestFormat = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-recovery-read-request"
	evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceiptFormat = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-recovery-read-receipt"
	evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryAuthorityIssuerID          = "authority.prodivix.hosted-retrieval-runtime-resource-lifecycle-recovery"
	evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryImplementationFormat       = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-recovery-implementation"
)

var evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequestKeys = []string{
	"format", "version", "purpose", "namespaceId", "dispatchIntentDigest",
	"dispatchStageClaimReceiptDigest", "expectedPriorTransportReceiptDigest", "spoolRef",
	"lifecycleOwnerInstanceId", "requestedAt", "minimumReceiptExpiresAt", "requestDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceiptKeys = []string{
	"format", "version", "request", "requestDigest", "recoveryAuthorityIssuerId",
	"recoveryAuthorityImplementationDigest", "storedDispatchStageClaimHistorySet",
	"currentDispatchStageClaimHistorySet", "dispatchIntentSet", "dispatchStageClaimReceiptSet",
	"transportReceiptSet", "spoolAad", "spoolWriteEnvelope", "spoolEnvelopeAuthority",
	"spoolReceipt", "transportStoreReceiptHistory", "transportStoreReceipt", "readAt", "expiresAt", "receiptDigest",
}

type evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest struct {
	NamespaceID                         string
	DispatchIntentDigest                string
	DispatchStageClaimReceiptDigest     string
	ExpectedPriorTransportReceiptDigest string
	SpoolRef                            string
	LifecycleOwnerInstanceID            string
	RequestedAt                         time.Time
	MinimumReceiptExpiresAt             time.Time
	RequestDigest                       string
	Value                               map[string]any
	Canonical                           []byte
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest(
	source []byte,
) (evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest, error) {
	value, err := decodeCanonicalEvaluationObject(
		source, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes,
	)
	if err != nil || evaluationAuthenticityCredentialPattern.Match(source) ||
		!exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequestKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequestFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		stringMember(value, "purpose") != evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadPurpose ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "requestDigest") ||
		!validEvaluationAgentControlIdentity(stringMember(value, "namespaceId")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "spoolRef")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "lifecycleOwnerInstanceId")) {
		return evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest{}, ErrInvalid
	}
	for _, key := range []string{
		"dispatchIntentDigest", "dispatchStageClaimReceiptDigest", "expectedPriorTransportReceiptDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, key)) {
			return evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest{}, ErrInvalid
		}
	}
	requestedAt, requestedAtErr := evaluationInstant(value["requestedAt"], "requestedAt")
	minimumExpiresAt, expiresErr := evaluationInstant(value["minimumReceiptExpiresAt"], "minimumReceiptExpiresAt")
	if requestedAtErr != nil || expiresErr != nil || !minimumExpiresAt.After(requestedAt) ||
		minimumExpiresAt.Sub(requestedAt) > evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimLifetime {
		return evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest{}, ErrInvalid
	}
	return evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest{
		NamespaceID:                         stringMember(value, "namespaceId"),
		DispatchIntentDigest:                stringMember(value, "dispatchIntentDigest"),
		DispatchStageClaimReceiptDigest:     stringMember(value, "dispatchStageClaimReceiptDigest"),
		ExpectedPriorTransportReceiptDigest: stringMember(value, "expectedPriorTransportReceiptDigest"),
		SpoolRef:                            stringMember(value, "spoolRef"), LifecycleOwnerInstanceID: stringMember(value, "lifecycleOwnerInstanceId"),
		RequestedAt: requestedAt, MinimumReceiptExpiresAt: minimumExpiresAt,
		RequestDigest: stringMember(value, "requestDigest"), Value: value, Canonical: append([]byte(nil), source...),
	}, nil
}

func evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryImplementationDigest() (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":                    evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryImplementationFormat,
		"version":                   int64(1),
		"recoveryAuthorityIssuerId": evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryAuthorityIssuerID,
	})
}

func evaluationHostedRetrievalRuntimeResourceLifecycleClaimHistoryPrefix(
	stored evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet,
	current evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet,
	intentSet evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet,
) bool {
	if stored.InitialClaimSet.SetDigest != current.InitialClaimSet.SetDigest ||
		stored.InitialClaimSet.SetDigest == "" || len(stored.Receipts) > len(current.Receipts) {
		return false
	}
	for _, intent := range intentSet.Intents {
		storedChain := make([]evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt, 0, 2)
		currentChain := make([]evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt, 0, 2)
		for _, receipt := range stored.Receipts {
			if receipt.DispatchIntentDigest == intent.IntentDigest {
				storedChain = append(storedChain, receipt)
			}
		}
		for _, receipt := range current.Receipts {
			if receipt.DispatchIntentDigest == intent.IntentDigest {
				currentChain = append(currentChain, receipt)
			}
		}
		if len(storedChain) > len(currentChain) {
			return false
		}
		for index := range storedChain {
			if !bytes.Equal(storedChain[index].Canonical, currentChain[index].Canonical) {
				return false
			}
		}
	}
	return true
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceipt(
	source []byte,
	request evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest,
) error {
	value, err := decodeCanonicalEvaluationObject(
		source, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes,
	)
	implementationDigest, implementationErr := evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryImplementationDigest()
	if err != nil || implementationErr != nil ||
		!exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceiptKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceiptFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "receiptDigest") ||
		stringMember(value, "requestDigest") != request.RequestDigest ||
		stringMember(value, "recoveryAuthorityIssuerId") != evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryAuthorityIssuerID ||
		stringMember(value, "recoveryAuthorityImplementationDigest") != implementationDigest {
		return ErrConflict
	}
	embeddedRequest, requestOK := objectMember(value, "request")
	embeddedRequestBytes, embeddedErr := canonicaljson.Bytes(embeddedRequest)
	if !requestOK || embeddedErr != nil || !bytes.Equal(embeddedRequestBytes, request.Canonical) {
		return ErrConflict
	}
	intentSetValue, intentSetOK := objectMember(value, "dispatchIntentSet")
	claimSetValue, claimSetOK := objectMember(value, "dispatchStageClaimReceiptSet")
	storedHistoryValue, storedHistoryOK := objectMember(value, "storedDispatchStageClaimHistorySet")
	currentHistoryValue, currentHistoryOK := objectMember(value, "currentDispatchStageClaimHistorySet")
	transportSetValue, transportSetOK := objectMember(value, "transportReceiptSet")
	spoolAAD, aadOK := objectMember(value, "spoolAad")
	spoolWriteEnvelope, writeOK := objectMember(value, "spoolWriteEnvelope")
	spoolEnvelopeAuthority, envelopeOK := objectMember(value, "spoolEnvelopeAuthority")
	spoolReceipt, spoolOK := objectMember(value, "spoolReceipt")
	transportStoreHistory, storeHistoryOK := objectMember(value, "transportStoreReceiptHistory")
	storeReceipt, storeReceiptOK := objectMember(value, "transportStoreReceipt")
	if !intentSetOK || !claimSetOK || !storedHistoryOK || !currentHistoryOK || !transportSetOK ||
		!aadOK || !writeOK || !envelopeOK || !spoolOK || !storeHistoryOK || !storeReceiptOK {
		return ErrConflict
	}
	intentSet, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet(intentSetValue)
	if err != nil {
		return ErrConflict
	}
	claimSet, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSet(claimSetValue, intentSet)
	if err != nil {
		return ErrConflict
	}
	storedHistory, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet(
		storedHistoryValue, intentSet, claimSet,
	)
	if err != nil {
		return ErrConflict
	}
	currentHistory, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet(
		currentHistoryValue, intentSet, claimSet,
	)
	if err != nil || !evaluationHostedRetrievalRuntimeResourceLifecycleClaimHistoryPrefix(storedHistory, currentHistory, intentSet) {
		return ErrConflict
	}
	storedRequestBase := map[string]any{
		"format":  evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequestFormat,
		"version": int64(1), "purpose": evaluationHostedRetrievalRuntimeResourceLifecycleTransportPurpose,
		"expectedPriorTransportStoreReceiptDigest": storeReceipt["expectedPriorTransportStoreReceiptDigest"],
		"dispatchIntentSet":                        intentSetValue, "dispatchStageClaimReceiptSet": claimSetValue,
		"dispatchStageClaimHistorySet": storedHistoryValue, "transportReceiptSet": transportSetValue,
		"spoolAad": spoolAAD, "spoolWriteEnvelope": spoolWriteEnvelope,
		"spoolEnvelopeAuthority": spoolEnvelopeAuthority, "spoolReceipt": spoolReceipt,
	}
	storedRequestBytes := evaluationHostedRetrievalRuntimeResourceLifecycleCanonicalWithDigest(storedRequestBase, "requestDigest")
	if storedRequestBytes == nil {
		return ErrConflict
	}
	storedRequest, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest(storedRequestBytes)
	if err != nil {
		return ErrConflict
	}
	storeReceiptBytes, err := canonicaljson.Bytes(storeReceipt)
	storeHistoryBytes, storeHistoryErr := canonicaljson.Bytes(transportStoreHistory)
	storeRevision, revisionOK := integerMember(storeReceipt, "transportLedgerRevision")
	if err != nil || storeHistoryErr != nil || !revisionOK || validateEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt(
		storeReceiptBytes, storedRequest, stringMember(storeReceipt, "receiptDigest"), storeRevision,
	) != nil || validateEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreHistory(
		storeHistoryBytes, stringMember(transportStoreHistory, "historyDigest"), storedRequest, storeReceiptBytes,
	) != nil {
		return ErrConflict
	}
	var selectedIntent *evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent
	for index := range intentSet.Intents {
		if intentSet.Intents[index].IntentDigest == request.DispatchIntentDigest {
			selectedIntent = &intentSet.Intents[index]
			break
		}
	}
	var selectedClaim *evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt
	for index := range currentHistory.Receipts {
		if currentHistory.Receipts[index].DispatchIntentDigest == request.DispatchIntentDigest {
			selectedClaim = &currentHistory.Receipts[index]
		}
	}
	if selectedIntent == nil || selectedClaim == nil {
		return ErrConflict
	}
	readAt, readAtErr := evaluationInstant(value["readAt"], "readAt")
	expiresAt, expiresErr := evaluationInstant(value["expiresAt"], "expiresAt")
	claimAt, claimAtErr := evaluationInstant(selectedClaim.Value["claimedAt"], "claimedAt")
	claimExpiresAt, claimExpiresErr := evaluationInstant(selectedClaim.Value["claimExpiresAt"], "claimExpiresAt")
	storeAt, storeAtErr := evaluationInstant(storeReceipt["storedAt"], "storedAt")
	spoolExpiresAt, spoolExpiresErr := evaluationInstant(spoolReceipt["expiresAt"], "expiresAt")
	priorPresent := false
	for _, receipt := range storedRequest.TransportReceiptSet.Receipts {
		if receipt.ReceiptDigest == request.ExpectedPriorTransportReceiptDigest {
			priorPresent = true
			break
		}
	}
	if readAtErr != nil || expiresErr != nil ||
		claimAtErr != nil || claimExpiresErr != nil || storeAtErr != nil || spoolExpiresErr != nil ||
		selectedIntent.NamespaceID != request.NamespaceID ||
		selectedClaim.ReceiptDigest != request.DispatchStageClaimReceiptDigest ||
		stringMember(selectedClaim.Value, "lifecycleOwnerInstanceId") != request.LifecycleOwnerInstanceID ||
		stringMember(selectedClaim.Value, "deliveryDisposition") != "reconcile-only-replay" ||
		stringMember(selectedClaim.Value, "priorTransportReceiptDigest") != request.ExpectedPriorTransportReceiptDigest ||
		!priorPresent || stringMember(spoolReceipt, "spoolRef") != request.SpoolRef ||
		readAt.Before(request.RequestedAt) || readAt.Before(storeAt) || readAt.Before(claimAt) ||
		!readAt.Before(claimExpiresAt) || !readAt.Before(spoolExpiresAt) || !expiresAt.After(readAt) ||
		expiresAt.Before(request.MinimumReceiptExpiresAt) ||
		expiresAt.Sub(readAt) > evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimLifetime ||
		expiresAt.After(claimExpiresAt) || expiresAt.After(spoolExpiresAt) {
		return ErrConflict
	}
	return nil
}

func evaluationHostedRetrievalRuntimeResourceLifecycleCanonicalWithDigest(
	base map[string]any,
	digestKey string,
) []byte {
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil
	}
	value := cloneEvaluationObject(base)
	value[digestKey] = digest
	encoded, err := canonicaljson.Bytes(value)
	if err != nil {
		return nil
	}
	return encoded
}

func (owner *EvaluationHostedRetrievalRuntimeResource) ReadLifecycleTransportRecovery(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest,
) ([]byte, bool, error) {
	if owner == nil || owner.repository == nil || owner.repository.available() != nil ||
		validateEvaluationAuthority(authority) != nil || owner.lifecycleOwnerInstanceID == "" ||
		request.NamespaceID != authority.NamespaceID || request.LifecycleOwnerInstanceID != owner.lifecycleOwnerInstanceID {
		return nil, false, errEvaluationServiceUnavailable
	}
	readAt := owner.clock().UTC().Truncate(time.Millisecond)
	if readAt.IsZero() || readAt.Before(request.RequestedAt) {
		return nil, false, ErrConflict
	}
	implementationDigest, err := evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryImplementationDigest()
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
	err = tx.QueryRowContext(ctx, `SELECT request_bytes,receipt_bytes
		FROM ae_hrrr_lifecycle_transport_recovery_reads
		WHERE namespace_id=$1 AND request_digest=$2 FOR SHARE`, authority.NamespaceID, request.RequestDigest).Scan(
		&existingRequest, &existingReceipt,
	)
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
	var authorityExpiresAt time.Time
	err = tx.QueryRowContext(ctx, `SELECT LEAST(claim.claim_expires_at,spool.expires_at)
		FROM ae_hrrr_lifecycle_dispatch_claim_receipts claim
		JOIN ae_hrrr_lifecycle_dispatch_claim_current current
		  ON current.namespace_id=claim.namespace_id AND current.current_claim_receipt_digest=claim.receipt_digest
		JOIN ae_hrrr_lifecycle_result_spools spool
		  ON spool.namespace_id=claim.namespace_id AND spool.spool_ref=$4
		WHERE claim.namespace_id=$1 AND claim.intent_digest=$2 AND claim.receipt_digest=$3
		  AND current.lifecycle_owner_instance_id=$5 AND current.prior_transport_receipt_digest=$6
		  AND claim.delivery_disposition='reconcile-only-replay' AND spool.state IN ('active','retained-encrypted')
		FOR SHARE`, authority.NamespaceID, request.DispatchIntentDigest, request.DispatchStageClaimReceiptDigest,
		request.SpoolRef, owner.lifecycleOwnerInstanceID, request.ExpectedPriorTransportReceiptDigest).Scan(&authorityExpiresAt)
	if err != nil {
		return nil, false, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchDatabaseError(err)
	}
	expiresAt := readAt.Add(evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimLifetime)
	if authorityExpiresAt.Before(expiresAt) {
		expiresAt = authorityExpiresAt
	}
	if expiresAt.Before(request.MinimumReceiptExpiresAt) {
		return nil, false, ErrConflict
	}
	var receiptJSON, receiptBytes []byte
	var receiptDigest string
	var ownerLedgerRevision int64
	err = tx.QueryRowContext(ctx, `SELECT receipt_json,receipt_bytes,receipt_digest,owner_ledger_revision
		FROM read_agent_evaluation_hosted_runtime_lifecycle_transport_recovery($1,$2::jsonb,$3,$4,$5,$6,$7)`,
		authority.NamespaceID, string(request.Canonical), request.Canonical,
		evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryAuthorityIssuerID,
		implementationDigest, readAt, expiresAt).Scan(
		&receiptJSON, &receiptBytes, &receiptDigest, &ownerLedgerRevision,
	)
	if err != nil {
		return nil, false, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchDatabaseError(err)
	}
	receiptValue, err := decodeCanonicalEvaluationObject(
		receiptJSON, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes,
	)
	if err != nil {
		return nil, false, ErrConflict
	}
	canonicalReceipt, err := canonicaljson.Bytes(receiptValue)
	if err != nil || !bytes.Equal(canonicalReceipt, receiptBytes) ||
		stringMember(receiptValue, "receiptDigest") != receiptDigest || ownerLedgerRevision < 1 ||
		decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceipt(receiptBytes, request) != nil {
		return nil, false, ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return nil, false, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchDatabaseError(err)
	}
	return receiptBytes, false, nil
}
