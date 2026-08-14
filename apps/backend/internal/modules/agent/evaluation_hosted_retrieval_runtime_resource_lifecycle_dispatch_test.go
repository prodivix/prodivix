package agent

import (
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
	"github.com/jackc/pgx/v5/pgconn"
)

func evaluationHostedLifecycleDispatchTestDigest(t *testing.T, label string) string {
	t.Helper()
	digest, err := canonicaljson.Digest(map[string]any{"label": label})
	if err != nil {
		t.Fatal(err)
	}
	return digest
}

func evaluationHostedLifecycleDispatchTestCanonical(t *testing.T, base map[string]any, digestKey string) []byte {
	t.Helper()
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	value := cloneEvaluationObject(base)
	value[digestKey] = digest
	encoded, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func evaluationHostedLifecycleDispatchIntentFixture(
	t *testing.T,
	createdAt time.Time,
) evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent {
	t.Helper()
	digest := func(label string) string { return evaluationHostedLifecycleDispatchTestDigest(t, label) }
	dispatchImplementationDigest, err := evaluationHostedRetrievalRuntimeResourceLifecycleDispatchImplementationDigest()
	if err != nil {
		t.Fatal(err)
	}
	base := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentFormat, "version": int64(1),
		"intentId": "hosted-lifecycle-intent.test", "lifecycleOwnerAuthorityIssuerId": evaluationHostedRetrievalRuntimeResourceLifecycleDispatchAuthorityIssuerID,
		"lifecycleOwnerImplementationDigest": dispatchImplementationDigest,
		"namespaceId":                        evaluationServiceTestNamespace, "repositoryCommit": "0123456789abcdef0123456789abcdef01234567",
		"planDigest": digest("plan"), "frozenRunDigest": digest("frozen-run"),
		"runConfigArtifactBindingDigest": digest("run-config-binding"), "runtimeResourceSetId": "hosted-resource-set.test",
		"registrationIntentDigest": digest("registration-intent"), "registrationRequestDigest": digest("registration-request"),
		"authorityDigest": nil, "lifecycleClaimReceiptDigest": nil,
		"protocolFamily": "openai-responses", "capabilityProfileId": "g4-provider-hosted-retrieval-core",
		"providerConfigurationId": "provider.openai.test", "providerConfigurationDigest": digest("provider-config"),
		"budgetReservationId":              "budget-reservation.hosted.test",
		"budgetReservationAuthorityDigest": digest("budget-authority"),
		"operation":                        "create", "mutationKind": "upload-content", "mutationSequence": int64(0),
		"resourceId": nil, "resourceRole": nil, "endpointId": "endpoint.hosted.test",
		"endpointClass": "provider-hosted-retrieval-resource", "method": "POST",
		"requestProjectionDigest": digest("request-projection"), "requestBodyDigest": digest("request-body"),
		"requestBytes": int64(310), "providerIdempotencyKeyBinding": "dispatch-intent-digest",
		"createdAt": evaluationExportInstant(createdAt),
	}
	encoded := evaluationHostedLifecycleDispatchTestCanonical(t, base, "intentDigest")
	intent, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent(encoded)
	if err != nil {
		t.Fatalf("dispatch intent fixture is invalid: %v", err)
	}
	return intent
}

func evaluationHostedLifecycleDispatchClaimRequestFixture(
	t *testing.T,
	intentDigest string,
	ownerInstanceID string,
	expectedLedgerRevision int64,
	expectedGeneration int64,
	expectedPriorReceipt any,
	expectedPriorExpiresAt any,
	requestedAt time.Time,
) evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequest {
	t.Helper()
	base := map[string]any{
		"format":  evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequestFormat,
		"version": int64(1), "purpose": evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimPurpose,
		"dispatchIntentDigest": intentDigest, "lifecycleOwnerInstanceId": ownerInstanceID,
		"expectedDispatchLedgerRevision":       expectedLedgerRevision,
		"expectedDispatchGeneration":           expectedGeneration,
		"expectedPriorStageClaimReceiptDigest": expectedPriorReceipt,
		"expectedPriorClaimExpiresAt":          expectedPriorExpiresAt,
		"requestedAt":                          evaluationExportInstant(requestedAt),
		"minimumClaimExpiresAt":                evaluationExportInstant(requestedAt.Add(time.Minute)),
	}
	encoded := evaluationHostedLifecycleDispatchTestCanonical(t, base, "requestDigest")
	request, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequest(encoded)
	if err != nil {
		t.Fatalf("dispatch claim request fixture is invalid: %v", err)
	}
	return request
}

func evaluationHostedLifecycleDispatchClaimReceiptFixture(
	t *testing.T,
	request evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequest,
	transition string,
	disposition string,
	generation int64,
	ledgerRevision int64,
	claimedAt time.Time,
	priorTransportReceiptDigest any,
	sealedJournalRecordDigest any,
) ([]byte, string) {
	t.Helper()
	implementationDigest, err := evaluationHostedRetrievalRuntimeResourceLifecycleDispatchImplementationDigest()
	if err != nil {
		t.Fatal(err)
	}
	base := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceiptFormat, "version": int64(1),
		"claimRequest": request.Value, "claimRequestDigest": request.RequestDigest,
		"dispatchIntentDigest":                  request.DispatchIntentDigest,
		"dispatchAuthorityIssuerId":             evaluationHostedRetrievalRuntimeResourceLifecycleDispatchAuthorityIssuerID,
		"dispatchAuthorityImplementationDigest": implementationDigest,
		"dispatchLedgerRevision":                ledgerRevision, "lifecycleOwnerInstanceId": request.LifecycleOwnerInstanceID,
		"dispatchGeneration": generation, "generationTransition": transition, "deliveryDisposition": disposition,
		"claimedAt":                   evaluationExportInstant(claimedAt),
		"claimExpiresAt":              evaluationExportInstant(claimedAt.Add(evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimLifetime)),
		"priorTransportReceiptDigest": priorTransportReceiptDigest,
		"sealedJournalRecordDigest":   sealedJournalRecordDigest,
	}
	encoded := evaluationHostedLifecycleDispatchTestCanonical(t, base, "receiptDigest")
	value, err := decodeCanonicalEvaluationObject(encoded, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil {
		t.Fatal(err)
	}
	return encoded, stringMember(value, "receiptDigest")
}

func evaluationHostedLifecycleStageRequestFixture(
	t *testing.T,
	intent evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
	claim evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequest,
) evaluationHostedRetrievalRuntimeResourceLifecycleStageRequest {
	t.Helper()
	base := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceLifecycleStageRequestFormat, "version": int64(1),
		"purpose":        evaluationHostedRetrievalRuntimeResourceLifecycleStagePurpose,
		"dispatchIntent": intent.Value, "dispatchStageClaimRequest": claim.Value,
	}
	encoded := evaluationHostedLifecycleDispatchTestCanonical(t, base, "requestDigest")
	stage, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleStageRequest(encoded)
	if err != nil {
		t.Fatalf("lifecycle stage request fixture is invalid: %v", err)
	}
	return stage
}

func TestHostedLifecycleStageRawExactDecodeAndUnknownKeyRejection(t *testing.T) {
	requestedAt := time.Date(2026, 8, 12, 7, 0, 0, 0, time.UTC)
	intent := evaluationHostedLifecycleDispatchIntentFixture(t, requestedAt)
	claim := evaluationHostedLifecycleDispatchClaimRequestFixture(
		t, intent.IntentDigest, "hosted-lifecycle-owner.test", 0, 0, nil, nil, requestedAt,
	)
	stage := evaluationHostedLifecycleStageRequestFixture(t, intent, claim)
	if stage.DispatchIntent.IntentDigest != intent.IntentDigest ||
		stage.DispatchStageClaimRequest.RequestDigest != claim.RequestDigest {
		t.Fatal("lifecycle stage request lost its exact nested bindings")
	}
	withUnknown := cloneEvaluationObject(stage.Value)
	withUnknown["unexpected"] = true
	encoded, err := canonicaljson.Bytes(withUnknown)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleStageRequest(encoded); err == nil {
		t.Fatal("lifecycle stage request accepted an unknown raw key")
	}
}

func TestHostedLifecycleDispatchClaimFirstDeliveryReplayTakeoverAndSealedReadOnly(t *testing.T) {
	startedAt := time.Date(2026, 8, 12, 8, 0, 0, 0, time.UTC)
	intent := evaluationHostedLifecycleDispatchIntentFixture(t, startedAt)
	owner := "hosted-lifecycle-owner.test"
	initial := evaluationHostedLifecycleDispatchClaimRequestFixture(
		t, intent.IntentDigest, owner, 0, 0, nil, nil, startedAt,
	)
	initialReceipt, initialDigest := evaluationHostedLifecycleDispatchClaimReceiptFixture(
		t, initial, "initial-first-delivery", "dispatch-authorized-first-delivery", 1, 1,
		startedAt, nil, nil,
	)
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt(
		initialReceipt, initial, initialDigest, "dispatch-authorized-first-delivery",
		"initial-first-delivery", 1, 1,
	); err != nil {
		t.Fatalf("initial first-delivery receipt was rejected: %v", err)
	}

	initialExpiresAt := evaluationExportInstant(startedAt.Add(evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimLifetime))
	retainedAt := startedAt.Add(30 * time.Second)
	retained := evaluationHostedLifecycleDispatchClaimRequestFixture(
		t, intent.IntentDigest, owner, 1, 1, initialDigest, initialExpiresAt, retainedAt,
	)
	retainedReceipt, retainedDigest := evaluationHostedLifecycleDispatchClaimReceiptFixture(
		t, retained, "generation-retained", "reconcile-only-replay", 1, 1, retainedAt, nil, nil,
	)
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt(
		retainedReceipt, retained, retainedDigest, "reconcile-only-replay", "generation-retained", 1, 1,
	); err != nil {
		t.Fatalf("ACK-loss reconcile-only replay was rejected: %v", err)
	}

	expiredAt := retainedAt.Add(evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimLifetime)
	expired := evaluationHostedLifecycleDispatchClaimRequestFixture(
		t, intent.IntentDigest, owner, 1, 1, retainedDigest,
		evaluationExportInstant(expiredAt), expiredAt,
	)
	expiredReceipt, expiredDigest := evaluationHostedLifecycleDispatchClaimReceiptFixture(
		t, expired, "expired-owner-takeover", "reconcile-only-replay", 2, 2, expiredAt, nil, nil,
	)
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt(
		expiredReceipt, expired, expiredDigest, "reconcile-only-replay", "expired-owner-takeover", 2, 2,
	); err != nil {
		t.Fatalf("expired owner reconcile-only takeover was rejected: %v", err)
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt(
		expiredReceipt, expired, expiredDigest, "dispatch-authorized-first-delivery", "expired-owner-takeover", 2, 2,
	); err == nil {
		t.Fatal("expired claim reopened first delivery")
	}

	sealedAt := expiredAt.Add(30 * time.Second)
	sealed := evaluationHostedLifecycleDispatchClaimRequestFixture(
		t, intent.IntentDigest, owner, 2, 2, expiredDigest,
		evaluationExportInstant(expiredAt.Add(evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimLifetime)), sealedAt,
	)
	transportDigest := evaluationHostedLifecycleDispatchTestDigest(t, "transport")
	journalDigest := evaluationHostedLifecycleDispatchTestDigest(t, "journal")
	sealedReceipt, sealedDigest := evaluationHostedLifecycleDispatchClaimReceiptFixture(
		t, sealed, "generation-retained", "sealed-read-only", 2, 2, sealedAt, transportDigest, journalDigest,
	)
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt(
		sealedReceipt, sealed, sealedDigest, "sealed-read-only", "generation-retained", 2, 2,
	); err != nil {
		t.Fatalf("sealed read-only claim was rejected: %v", err)
	}
}

func TestHostedLifecycleDispatchClaimRejectsIncompletePriorCAS(t *testing.T) {
	startedAt := time.Date(2026, 8, 12, 8, 0, 0, 0, time.UTC)
	intent := evaluationHostedLifecycleDispatchIntentFixture(t, startedAt)
	base := map[string]any{
		"format":  evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequestFormat,
		"version": int64(1), "purpose": evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimPurpose,
		"dispatchIntentDigest": intent.IntentDigest, "lifecycleOwnerInstanceId": "hosted-lifecycle-owner.test",
		"expectedDispatchLedgerRevision": int64(1), "expectedDispatchGeneration": int64(1),
		"expectedPriorStageClaimReceiptDigest": nil, "expectedPriorClaimExpiresAt": nil,
		"requestedAt":           evaluationExportInstant(startedAt),
		"minimumClaimExpiresAt": evaluationExportInstant(startedAt.Add(time.Minute)),
	}
	encoded := evaluationHostedLifecycleDispatchTestCanonical(t, base, "requestDigest")
	if _, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequest(encoded); err == nil {
		t.Fatal("noninitial dispatch claim accepted an incomplete prior CAS")
	}
}

func newEvaluationHostedLifecycleDispatchOwnerTest(
	t *testing.T,
	clock time.Time,
	ownerInstanceID string,
) (*EvaluationHostedRetrievalRuntimeResource, sqlmock.Sqlmock, EvaluationAuthority) {
	t.Helper()
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	owner, err := NewEvaluationHostedRetrievalRuntimeResource(EvaluationHostedRetrievalRuntimeResourceConfig{
		Repository: NewRepository(database), LifecycleOwnerInstanceID: ownerInstanceID,
		Clock: func() time.Time { return clock },
	})
	if err != nil {
		t.Fatal(err)
	}
	return owner, mock, EvaluationAuthority{
		Kind: "service", PrincipalID: "hosted-lifecycle-dispatch-test", NamespaceID: evaluationServiceTestNamespace,
	}
}

func TestStageAndClaimLifecycleDispatchCommitsFirstDeliveryAndACKReplayWithoutSecondAuthorization(t *testing.T) {
	claimedAt := time.Date(2026, 8, 12, 10, 0, 0, 0, time.UTC)
	ownerInstanceID := "hosted-lifecycle-owner.test"
	owner, mock, authority := newEvaluationHostedLifecycleDispatchOwnerTest(t, claimedAt, ownerInstanceID)
	intent := evaluationHostedLifecycleDispatchIntentFixture(t, claimedAt)
	request := evaluationHostedLifecycleDispatchClaimRequestFixture(
		t, intent.IntentDigest, ownerInstanceID, 0, 0, nil, nil, claimedAt,
	)
	receipt, receiptDigest := evaluationHostedLifecycleDispatchClaimReceiptFixture(
		t, request, "initial-first-delivery", "dispatch-authorized-first-delivery", 1, 1,
		claimedAt, nil, nil,
	)
	mock.ExpectBegin()
	mock.ExpectQuery("FROM ae_hrrr_lifecycle_dispatch_claim_requests request").
		WithArgs(authority.NamespaceID, request.RequestDigest).
		WillReturnRows(sqlmock.NewRows([]string{"intent_bytes", "request_bytes", "receipt_bytes"}))
	mock.ExpectQuery("FROM ae_hrrr_lifecycle_dispatch_intents").
		WithArgs(authority.NamespaceID, intent.IntentDigest).
		WillReturnRows(sqlmock.NewRows([]string{"intent_bytes"}))
	mock.ExpectExec("INSERT INTO ae_hrrr_lifecycle_dispatch_intents").
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectQuery("FROM ae_hrrr_lifecycle_dispatch_claim_current").
		WithArgs(authority.NamespaceID, intent.IntentDigest).
		WillReturnRows(sqlmock.NewRows([]string{
			"dispatch_ledger_revision", "dispatch_generation", "current_claim_receipt_digest",
			"lifecycle_owner_instance_id", "claim_expires_at", "ever_dispatch_authorized",
		}))
	mock.ExpectQuery("claim_agent_evaluation_hosted_runtime_lifecycle_dispatch").
		WillReturnRows(sqlmock.NewRows([]string{
			"receipt_json", "receipt_bytes", "receipt_digest", "delivery_disposition",
			"generation_transition", "dispatch_generation", "dispatch_ledger_revision",
		}).AddRow(receipt, receipt, receiptDigest, "dispatch-authorized-first-delivery",
			"initial-first-delivery", int64(1), int64(1)))
	mock.ExpectCommit()
	stored, replayed, err := owner.StageAndClaimLifecycleDispatch(
		t.Context(), authority, intent, request, "create",
	)
	if err != nil || replayed || string(stored) != string(receipt) {
		t.Fatalf("first delivery stage drifted: replayed=%v err=%v", replayed, err)
	}

	mock.ExpectBegin()
	mock.ExpectQuery("FROM ae_hrrr_lifecycle_dispatch_claim_requests request").
		WithArgs(authority.NamespaceID, request.RequestDigest).
		WillReturnRows(sqlmock.NewRows([]string{"intent_bytes", "request_bytes", "receipt_bytes"}).
			AddRow(intent.Canonical, request.Canonical, receipt))
	mock.ExpectCommit()
	replayedReceipt, replayed, err := owner.StageAndClaimLifecycleDispatch(
		t.Context(), authority, intent, request, "create",
	)
	if err != nil || !replayed || string(replayedReceipt) != string(receipt) {
		t.Fatalf("ACK replay drifted: replayed=%v err=%v", replayed, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestStageLifecycleDispatchReturnsExactRawReceipt(t *testing.T) {
	claimedAt := time.Date(2026, 8, 12, 10, 30, 0, 0, time.UTC)
	ownerInstanceID := "hosted-lifecycle-owner.test"
	owner, mock, authority := newEvaluationHostedLifecycleDispatchOwnerTest(t, claimedAt, ownerInstanceID)
	intent := evaluationHostedLifecycleDispatchIntentFixture(t, claimedAt)
	claim := evaluationHostedLifecycleDispatchClaimRequestFixture(
		t, intent.IntentDigest, ownerInstanceID, 0, 0, nil, nil, claimedAt,
	)
	stage := evaluationHostedLifecycleStageRequestFixture(t, intent, claim)
	claimReceipt, claimReceiptDigest := evaluationHostedLifecycleDispatchClaimReceiptFixture(
		t, claim, "initial-first-delivery", "dispatch-authorized-first-delivery", 1, 1,
		claimedAt, nil, nil,
	)
	mock.ExpectBegin()
	mock.ExpectQuery("FROM ae_hrrr_lifecycle_dispatch_claim_requests request").
		WithArgs(authority.NamespaceID, claim.RequestDigest).
		WillReturnRows(sqlmock.NewRows([]string{"intent_bytes", "request_bytes", "receipt_bytes"}))
	mock.ExpectQuery("FROM ae_hrrr_lifecycle_dispatch_intents").
		WithArgs(authority.NamespaceID, intent.IntentDigest).
		WillReturnRows(sqlmock.NewRows([]string{"intent_bytes"}))
	mock.ExpectExec("INSERT INTO ae_hrrr_lifecycle_dispatch_intents").
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectQuery("FROM ae_hrrr_lifecycle_dispatch_claim_current").
		WithArgs(authority.NamespaceID, intent.IntentDigest).
		WillReturnRows(sqlmock.NewRows([]string{
			"dispatch_ledger_revision", "dispatch_generation", "current_claim_receipt_digest",
			"lifecycle_owner_instance_id", "claim_expires_at", "ever_dispatch_authorized",
		}))
	mock.ExpectQuery("claim_agent_evaluation_hosted_runtime_lifecycle_dispatch").
		WillReturnRows(sqlmock.NewRows([]string{
			"receipt_json", "receipt_bytes", "receipt_digest", "delivery_disposition",
			"generation_transition", "dispatch_generation", "dispatch_ledger_revision",
		}).AddRow(claimReceipt, claimReceipt, claimReceiptDigest, "dispatch-authorized-first-delivery",
			"initial-first-delivery", int64(1), int64(1)))
	mock.ExpectCommit()
	receiptBytes, replay, err := owner.StageLifecycleDispatch(
		t.Context(), authority, stage, "create", false,
	)
	if err != nil || replay {
		t.Fatalf("raw lifecycle stage failed: replay=%v err=%v", replay, err)
	}
	receipt, err := decodeCanonicalEvaluationObject(
		receiptBytes, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes,
	)
	if err != nil || !exactEvaluationKeys(receipt, []string{
		"format", "version", "requestDigest", "dispatchIntentDigest", "dispatchStageClaimReceipt",
		"dispatchStageClaimReceiptDigest", "receiptDigest",
	}) || stringMember(receipt, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleStageReceiptFormat ||
		stringMember(receipt, "requestDigest") != stage.RequestDigest ||
		stringMember(receipt, "dispatchIntentDigest") != intent.IntentDigest ||
		stringMember(receipt, "dispatchStageClaimReceiptDigest") != claimReceiptDigest ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(receipt, "receiptDigest") {
		t.Fatalf("raw lifecycle stage receipt drifted: %#v err=%v", receipt, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestStageAndClaimLifecycleDispatchRejectsForeignOwnerAndStalePriorCAS(t *testing.T) {
	claimedAt := time.Date(2026, 8, 12, 11, 0, 0, 0, time.UTC)
	ownerInstanceID := "hosted-lifecycle-owner.test"
	owner, mock, authority := newEvaluationHostedLifecycleDispatchOwnerTest(t, claimedAt, ownerInstanceID)
	intent := evaluationHostedLifecycleDispatchIntentFixture(t, claimedAt)
	foreign := evaluationHostedLifecycleDispatchClaimRequestFixture(
		t, intent.IntentDigest, "foreign-lifecycle-owner.test", 0, 0, nil, nil, claimedAt,
	)
	if _, _, err := owner.StageAndClaimLifecycleDispatch(
		t.Context(), authority, intent, foreign, "create",
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("foreign lifecycle owner error=%v", err)
	}

	priorDigest := evaluationHostedLifecycleDispatchTestDigest(t, "stale-prior")
	priorExpiresAt := claimedAt.Add(-time.Second)
	stale := evaluationHostedLifecycleDispatchClaimRequestFixture(
		t, intent.IntentDigest, ownerInstanceID, 1, 1, priorDigest,
		evaluationExportInstant(priorExpiresAt), claimedAt,
	)
	mock.ExpectBegin()
	mock.ExpectQuery("FROM ae_hrrr_lifecycle_dispatch_claim_requests request").
		WithArgs(authority.NamespaceID, stale.RequestDigest).
		WillReturnRows(sqlmock.NewRows([]string{"intent_bytes", "request_bytes", "receipt_bytes"}))
	mock.ExpectQuery("FROM ae_hrrr_lifecycle_dispatch_intents").
		WithArgs(authority.NamespaceID, intent.IntentDigest).
		WillReturnRows(sqlmock.NewRows([]string{"intent_bytes"}).AddRow(intent.Canonical))
	mock.ExpectQuery("FROM ae_hrrr_lifecycle_dispatch_claim_current").
		WithArgs(authority.NamespaceID, intent.IntentDigest).
		WillReturnRows(sqlmock.NewRows([]string{
			"dispatch_ledger_revision", "dispatch_generation", "current_claim_receipt_digest",
			"lifecycle_owner_instance_id", "claim_expires_at", "ever_dispatch_authorized",
		}).AddRow(int64(1), int64(1), priorDigest, ownerInstanceID, priorExpiresAt, true))
	mock.ExpectQuery("claim_agent_evaluation_hosted_runtime_lifecycle_dispatch").
		WillReturnError(&pgconn.PgError{Code: "40001", Message: "stale lifecycle claim CAS"})
	mock.ExpectRollback()
	if _, _, err := owner.StageAndClaimLifecycleDispatch(
		t.Context(), authority, intent, stale, "create",
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale prior CAS error=%v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestStageAndClaimLifecycleDispatchRejectsForeignOwnerBeforePriorClaimExpiry(t *testing.T) {
	claimedAt := time.Date(2026, 8, 12, 11, 30, 0, 0, time.UTC)
	currentOwner := "hosted-lifecycle-owner.current"
	replacementOwner := "hosted-lifecycle-owner.replacement"
	owner, mock, authority := newEvaluationHostedLifecycleDispatchOwnerTest(t, claimedAt, replacementOwner)
	intent := evaluationHostedLifecycleDispatchIntentFixture(t, claimedAt.Add(-time.Minute))
	priorDigest := evaluationHostedLifecycleDispatchTestDigest(t, "unexpired-prior")
	priorExpiresAt := claimedAt.Add(time.Minute)
	request := evaluationHostedLifecycleDispatchClaimRequestFixture(
		t, intent.IntentDigest, replacementOwner, 1, 1, priorDigest,
		evaluationExportInstant(priorExpiresAt), claimedAt,
	)
	mock.ExpectBegin()
	mock.ExpectQuery("FROM ae_hrrr_lifecycle_dispatch_claim_requests request").
		WithArgs(authority.NamespaceID, request.RequestDigest).
		WillReturnRows(sqlmock.NewRows([]string{"intent_bytes", "request_bytes", "receipt_bytes"}))
	mock.ExpectQuery("FROM ae_hrrr_lifecycle_dispatch_intents").
		WithArgs(authority.NamespaceID, intent.IntentDigest).
		WillReturnRows(sqlmock.NewRows([]string{"intent_bytes"}).AddRow(intent.Canonical))
	mock.ExpectQuery("FROM ae_hrrr_lifecycle_dispatch_claim_current").
		WithArgs(authority.NamespaceID, intent.IntentDigest).
		WillReturnRows(sqlmock.NewRows([]string{
			"dispatch_ledger_revision", "dispatch_generation", "current_claim_receipt_digest",
			"lifecycle_owner_instance_id", "claim_expires_at", "ever_dispatch_authorized",
		}).AddRow(int64(1), int64(1), priorDigest, currentOwner, priorExpiresAt, true))
	mock.ExpectRollback()
	if _, _, err := owner.StageAndClaimLifecycleDispatch(
		t.Context(), authority, intent, request, "create",
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("unexpired foreign owner claim error=%v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
