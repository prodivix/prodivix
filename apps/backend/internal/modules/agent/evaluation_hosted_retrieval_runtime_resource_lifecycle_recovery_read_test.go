package agent

import (
	"bytes"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationHostedLifecycleRecoveryReadFixture struct {
	StoreRequest   evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest
	StoreReceipt   map[string]any
	StoreHistory   map[string]any
	CurrentHistory map[string]any
	Request        evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest
	ReadAt         time.Time
	ExpiresAt      time.Time
}

func evaluationHostedLifecycleRecoveryReadRequestFixture(t *testing.T) evaluationHostedLifecycleRecoveryReadFixture {
	t.Helper()
	storeBytes := evaluationHostedLifecycleTransportStoreRequestFixture(t, []byte{1, 2, 3})
	store, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest(storeBytes)
	if err != nil {
		t.Fatal(err)
	}
	initial := store.DispatchClaimSet.Receipts[0]
	initialExpires := stringMember(initial.Value, "claimExpiresAt")
	initialClaimedAt, err := evaluationInstant(initial.Value["claimedAt"], "claimedAt")
	if err != nil {
		t.Fatal(err)
	}
	retainedAt := initialClaimedAt.Add(30 * time.Second)
	retainedRequest := evaluationHostedLifecycleDispatchClaimRequestFixture(
		t, initial.DispatchIntentDigest, stringMember(initial.Value, "lifecycleOwnerInstanceId"),
		1, 1, initial.ReceiptDigest, initialExpires, retainedAt,
	)
	priorTransportDigest := store.TransportReceiptSet.Receipts[0].ReceiptDigest
	retainedBytes, retainedDigest := evaluationHostedLifecycleDispatchClaimReceiptFixture(
		t, retainedRequest, "generation-retained", "reconcile-only-replay", 1, 1,
		retainedAt, priorTransportDigest, nil,
	)
	retained, err := decodeCanonicalEvaluationObject(
		retainedBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes,
	)
	if err != nil {
		t.Fatal(err)
	}
	currentReceipts := []any{
		store.DispatchClaimHistorySet.Receipts[0].Value,
		retained,
		store.DispatchClaimHistorySet.Receipts[1].Value,
	}
	currentDigests := []any{
		store.DispatchClaimHistorySet.Receipts[0].ReceiptDigest,
		retainedDigest,
		store.DispatchClaimHistorySet.Receipts[1].ReceiptDigest,
	}
	currentHistoryBase := map[string]any{
		"format":  evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySetFormat,
		"version": int64(1), "operation": store.DispatchIntentSet.Operation,
		"registrationRequestDigest":    store.DispatchIntentSet.RegistrationRequestDigest,
		"dispatchIntentSetDigest":      store.DispatchIntentSet.SetDigest,
		"initialClaimReceiptSet":       store.DispatchClaimSet.Value,
		"initialClaimReceiptSetDigest": store.DispatchClaimSet.SetDigest,
		"receipts":                     currentReceipts, "receiptDigests": currentDigests,
	}
	currentHistoryBytes := evaluationHostedLifecycleDispatchTestCanonical(t, currentHistoryBase, "setDigest")
	currentHistory, err := decodeCanonicalEvaluationObject(
		currentHistoryBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes,
	)
	if err != nil {
		t.Fatal(err)
	}
	requestedAt := retainedAt.Add(time.Second)
	requestBase := map[string]any{
		"format":  evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequestFormat,
		"version": int64(1), "purpose": evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadPurpose,
		"namespaceId":                         store.DispatchIntentSet.Intents[0].NamespaceID,
		"dispatchIntentDigest":                store.DispatchIntentSet.Intents[0].IntentDigest,
		"dispatchStageClaimReceiptDigest":     retainedDigest,
		"expectedPriorTransportReceiptDigest": priorTransportDigest,
		"spoolRef":                            stringMember(store.SpoolReceipt, "spoolRef"),
		"lifecycleOwnerInstanceId":            stringMember(retained, "lifecycleOwnerInstanceId"),
		"requestedAt":                         evaluationExportInstant(requestedAt),
		"minimumReceiptExpiresAt":             evaluationExportInstant(requestedAt.Add(time.Minute)),
	}
	requestBytes := evaluationHostedLifecycleDispatchTestCanonical(t, requestBase, "requestDigest")
	request, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest(requestBytes)
	if err != nil {
		t.Fatal(err)
	}
	storeReceiptBytes, _ := evaluationHostedLifecycleTransportStoreReceiptFixture(
		t, store, initialClaimedAt.Add(4*time.Second), 1,
	)
	storeReceipt, err := decodeCanonicalEvaluationObject(
		storeReceiptBytes, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes,
	)
	if err != nil {
		t.Fatal(err)
	}
	storeHistoryBytes, _ := evaluationHostedLifecycleTransportStoreHistoryFixture(t, store, storeReceiptBytes)
	storeHistory, err := decodeCanonicalEvaluationObject(
		storeHistoryBytes, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleClaimHistorySetBytes,
	)
	if err != nil {
		t.Fatal(err)
	}
	readAt := requestedAt
	claimExpiresAt, err := evaluationInstant(retained["claimExpiresAt"], "claimExpiresAt")
	if err != nil {
		t.Fatal(err)
	}
	return evaluationHostedLifecycleRecoveryReadFixture{
		StoreRequest: store, StoreReceipt: storeReceipt, StoreHistory: storeHistory, CurrentHistory: currentHistory,
		Request: request, ReadAt: readAt, ExpiresAt: claimExpiresAt,
	}
}

func evaluationHostedLifecycleRecoveryReadReceiptFixture(
	t *testing.T,
	fixture evaluationHostedLifecycleRecoveryReadFixture,
) ([]byte, string) {
	t.Helper()
	implementationDigest, err := evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryImplementationDigest()
	if err != nil {
		t.Fatal(err)
	}
	base := map[string]any{
		"format":  evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceiptFormat,
		"version": int64(1), "request": fixture.Request.Value, "requestDigest": fixture.Request.RequestDigest,
		"recoveryAuthorityIssuerId":             evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryAuthorityIssuerID,
		"recoveryAuthorityImplementationDigest": implementationDigest,
		"storedDispatchStageClaimHistorySet":    fixture.StoreRequest.DispatchClaimHistorySet.Value,
		"currentDispatchStageClaimHistorySet":   fixture.CurrentHistory,
		"dispatchIntentSet":                     fixture.StoreRequest.DispatchIntentSet.Value,
		"dispatchStageClaimReceiptSet":          fixture.StoreRequest.DispatchClaimSet.Value,
		"transportReceiptSet":                   fixture.StoreRequest.TransportReceiptSet.Value,
		"spoolAad":                              fixture.StoreRequest.SpoolAAD,
		"spoolWriteEnvelope":                    fixture.StoreRequest.SpoolWriteEnvelope,
		"spoolEnvelopeAuthority":                fixture.StoreRequest.SpoolEnvelopeAuthority,
		"spoolReceipt":                          fixture.StoreRequest.SpoolReceipt,
		"transportStoreReceiptHistory":          fixture.StoreHistory,
		"transportStoreReceipt":                 fixture.StoreReceipt,
		"readAt":                                evaluationExportInstant(fixture.ReadAt),
		"expiresAt":                             evaluationExportInstant(fixture.ExpiresAt),
	}
	encoded := evaluationHostedLifecycleDispatchTestCanonical(t, base, "receiptDigest")
	value, err := decodeCanonicalEvaluationObject(
		encoded, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes,
	)
	if err != nil {
		t.Fatal(err)
	}
	return encoded, stringMember(value, "receiptDigest")
}

func TestHostedLifecycleTransportRecoveryReadBindsStoredAndCurrentClaimHistories(t *testing.T) {
	fixture := evaluationHostedLifecycleRecoveryReadRequestFixture(t)
	receipt, _ := evaluationHostedLifecycleRecoveryReadReceiptFixture(t, fixture)
	if err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceipt(
		receipt, fixture.Request,
	); err != nil {
		t.Fatalf("valid recovery read receipt was rejected: %v", err)
	}
	value, err := decodeCanonicalEvaluationObject(receipt, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes)
	if err != nil {
		t.Fatal(err)
	}
	current, _ := objectMember(value, "currentDispatchStageClaimHistorySet")
	current["receipts"] = current["receipts"].([]any)[1:]
	delete(value, "receiptDigest")
	tampered, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	if err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceipt(
		tampered, fixture.Request,
	); err == nil {
		t.Fatal("recovery read accepted current history that removed its stored canonical prefix")
	}
}

func TestReadLifecycleTransportRecoveryReturnsExactDurableCiphertextReceipt(t *testing.T) {
	fixture := evaluationHostedLifecycleRecoveryReadRequestFixture(t)
	receipt, receiptDigest := evaluationHostedLifecycleRecoveryReadReceiptFixture(t, fixture)
	owner, mock, authority := newEvaluationHostedLifecycleDispatchOwnerTest(
		t, fixture.ReadAt, fixture.Request.LifecycleOwnerInstanceID,
	)
	mock.ExpectBegin()
	mock.ExpectQuery("FROM ae_hrrr_lifecycle_transport_recovery_reads").
		WithArgs(authority.NamespaceID, fixture.Request.RequestDigest).
		WillReturnRows(sqlmock.NewRows([]string{"request_bytes", "receipt_bytes"}))
	mock.ExpectQuery(`SELECT LEAST\(claim.claim_expires_at,spool.expires_at\)`).
		WillReturnRows(sqlmock.NewRows([]string{"least"}).AddRow(fixture.ExpiresAt))
	mock.ExpectQuery("read_agent_evaluation_hosted_runtime_lifecycle_transport_recovery").
		WillReturnRows(sqlmock.NewRows([]string{
			"receipt_json", "receipt_bytes", "receipt_digest", "owner_ledger_revision",
		}).AddRow(receipt, receipt, receiptDigest, int64(9)))
	mock.ExpectCommit()
	stored, replay, err := owner.ReadLifecycleTransportRecovery(t.Context(), authority, fixture.Request)
	if err != nil || replay || !bytes.Equal(stored, receipt) {
		t.Fatalf("recovery read failed: replay=%v err=%v", replay, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
