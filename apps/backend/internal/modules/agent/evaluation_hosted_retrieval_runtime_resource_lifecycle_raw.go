package agent

import (
	"bytes"
	"context"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationHostedRetrievalRuntimeResourceLifecycleStageRequestFormat = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-stage-request"
	evaluationHostedRetrievalRuntimeResourceLifecycleStageReceiptFormat = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-stage-receipt"
	evaluationHostedRetrievalRuntimeResourceLifecycleStagePurpose       = "hosted-retrieval-runtime-resource.lifecycle-journal.dispatch"

	maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes = 524_288
)

var evaluationHostedRetrievalRuntimeResourceLifecycleStageRequestKeys = []string{
	"format", "version", "purpose", "dispatchIntent", "dispatchStageClaimRequest", "requestDigest",
}

type evaluationHostedRetrievalRuntimeResourceLifecycleStageRequest struct {
	DispatchIntent            evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent
	DispatchStageClaimRequest evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequest
	RequestDigest             string
	Value                     map[string]any
	Canonical                 []byte
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleStageRequest(
	source []byte,
) (evaluationHostedRetrievalRuntimeResourceLifecycleStageRequest, error) {
	value, err := decodeCanonicalEvaluationObject(
		source, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes,
	)
	if err != nil ||
		!exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleStageRequestKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleStageRequestFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		stringMember(value, "purpose") != evaluationHostedRetrievalRuntimeResourceLifecycleStagePurpose ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "requestDigest") {
		return evaluationHostedRetrievalRuntimeResourceLifecycleStageRequest{}, ErrInvalid
	}
	intentValue, intentOK := objectMember(value, "dispatchIntent")
	claimValue, claimOK := objectMember(value, "dispatchStageClaimRequest")
	if !intentOK || !claimOK {
		return evaluationHostedRetrievalRuntimeResourceLifecycleStageRequest{}, ErrInvalid
	}
	intentBytes, intentErr := canonicaljson.Bytes(intentValue)
	claimBytes, claimErr := canonicaljson.Bytes(claimValue)
	if intentErr != nil || claimErr != nil {
		return evaluationHostedRetrievalRuntimeResourceLifecycleStageRequest{}, ErrInvalid
	}
	intent, intentErr := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent(intentBytes)
	claim, claimErr := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequest(claimBytes)
	if intentErr != nil || claimErr != nil || claim.DispatchIntentDigest != intent.IntentDigest {
		return evaluationHostedRetrievalRuntimeResourceLifecycleStageRequest{}, ErrInvalid
	}
	return evaluationHostedRetrievalRuntimeResourceLifecycleStageRequest{
		DispatchIntent: intent, DispatchStageClaimRequest: claim,
		RequestDigest: stringMember(value, "requestDigest"), Value: value,
		Canonical: append([]byte(nil), source...),
	}, nil
}

func createEvaluationHostedRetrievalRuntimeResourceLifecycleStageReceipt(
	request evaluationHostedRetrievalRuntimeResourceLifecycleStageRequest,
	claimReceiptBytes []byte,
) ([]byte, error) {
	claimReceipt, err := decodeCanonicalEvaluationObject(
		claimReceiptBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes,
	)
	if err != nil || stringMember(claimReceipt, "dispatchIntentDigest") != request.DispatchIntent.IntentDigest ||
		stringMember(claimReceipt, "claimRequestDigest") != request.DispatchStageClaimRequest.RequestDigest {
		return nil, ErrConflict
	}
	claimDigest := stringMember(claimReceipt, "receiptDigest")
	if !evaluationDigestPattern.MatchString(claimDigest) {
		return nil, ErrConflict
	}
	base := map[string]any{
		"format":                          evaluationHostedRetrievalRuntimeResourceLifecycleStageReceiptFormat,
		"version":                         int64(1),
		"requestDigest":                   request.RequestDigest,
		"dispatchIntentDigest":            request.DispatchIntent.IntentDigest,
		"dispatchStageClaimReceipt":       claimReceipt,
		"dispatchStageClaimReceiptDigest": claimDigest,
	}
	receiptDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, err
	}
	base["receiptDigest"] = receiptDigest
	receiptBytes, err := canonicaljson.Bytes(base)
	if err != nil || len(receiptBytes) > maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes {
		return nil, ErrConflict
	}
	return receiptBytes, nil
}

// StageLifecycleDispatch applies the public stage envelope around the durable
// first-delivery CAS. The raw acknowledgement is deterministic, so an HTTP ACK
// loss replays byte-for-byte without reopening Provider delivery.
func (owner *EvaluationHostedRetrievalRuntimeResource) StageLifecycleDispatch(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationHostedRetrievalRuntimeResourceLifecycleStageRequest,
	requiredOperation string,
	reconcileOnly bool,
) ([]byte, bool, error) {
	if reconcileOnly && request.DispatchStageClaimRequest.ExpectedDispatchGeneration < 1 {
		return nil, false, ErrConflict
	}
	claimReceipt, replay, err := owner.StageAndClaimLifecycleDispatch(
		ctx, authority, request.DispatchIntent, request.DispatchStageClaimRequest, requiredOperation,
	)
	if err != nil {
		return nil, false, err
	}
	receipt, err := createEvaluationHostedRetrievalRuntimeResourceLifecycleStageReceipt(request, claimReceipt)
	if err != nil {
		return nil, false, err
	}
	// A deterministic receipt must retain the exact embedded claim bytes. This
	// guards accidental canonicalization drift at the raw boundary.
	decoded, err := decodeCanonicalEvaluationObject(receipt, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes)
	if err != nil {
		return nil, false, ErrConflict
	}
	embedded, ok := objectMember(decoded, "dispatchStageClaimReceipt")
	if !ok {
		return nil, false, ErrConflict
	}
	embeddedBytes, err := canonicaljson.Bytes(embedded)
	if err != nil || !bytes.Equal(embeddedBytes, claimReceipt) {
		return nil, false, ErrConflict
	}
	return receipt, replay, nil
}
