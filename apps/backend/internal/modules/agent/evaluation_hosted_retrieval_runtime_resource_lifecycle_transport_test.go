package agent

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func evaluationHostedLifecycleTransportStoreReceiptFixture(
	t *testing.T,
	request evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest,
	storedAt time.Time,
	ledgerRevision int64,
) ([]byte, string) {
	t.Helper()
	implementationDigest, err := evaluationHostedRetrievalRuntimeResourceLifecycleTransportImplementationDigest()
	if err != nil {
		t.Fatal(err)
	}
	base := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptFormat, "version": int64(1),
		"requestDigest":             request.RequestDigest,
		"operation":                 request.DispatchIntentSet.Operation,
		"registrationRequestDigest": request.DispatchIntentSet.RegistrationRequestDigest,
		"expectedPriorTransportStoreReceiptDigest": request.ExpectedPriorTransportStoreReceiptDigest,
		"transportAuthorityIssuerId":               evaluationHostedRetrievalRuntimeResourceLifecycleTransportAuthorityIssuerID,
		"transportAuthorityImplementationDigest":   implementationDigest,
		"transportLedgerRevision":                  ledgerRevision,
		"dispatchIntentSetDigest":                  request.DispatchIntentSet.SetDigest,
		"dispatchStageClaimReceiptSetDigest":       request.DispatchClaimSet.SetDigest,
		"dispatchStageClaimHistorySetDigest":       request.DispatchClaimHistorySet.SetDigest,
		"transportReceiptSetDigest":                request.TransportReceiptSet.SetDigest,
		"spoolAadDigest":                           request.SpoolAADDigest,
		"spoolEnvelopeDigest":                      stringMember(request.SpoolEnvelopeAuthority, "envelopeDigest"),
		"spoolReceiptDigest":                       stringMember(request.SpoolReceipt, "receiptDigest"),
		"supersededSpoolReceiptDigest":             nil,
		"supersededSpoolDestroyedAt":               nil,
		"storedAt":                                 evaluationExportInstant(storedAt),
	}
	encoded := evaluationHostedLifecycleDispatchTestCanonical(t, base, "receiptDigest")
	value, err := decodeCanonicalEvaluationObject(encoded, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes)
	if err != nil {
		t.Fatal(err)
	}
	return encoded, stringMember(value, "receiptDigest")
}

func evaluationHostedLifecycleTransportStoreHistoryFixture(
	t *testing.T,
	request evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest,
	receiptBytes []byte,
) ([]byte, string) {
	t.Helper()
	receipt, err := decodeCanonicalEvaluationObject(
		receiptBytes, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes,
	)
	if err != nil {
		t.Fatal(err)
	}
	base := map[string]any{
		"format":  evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreHistoryFormat,
		"version": int64(1), "operation": request.DispatchIntentSet.Operation,
		"registrationRequestDigest": request.DispatchIntentSet.RegistrationRequestDigest,
		"receipts":                  []any{receipt}, "receiptDigests": []any{stringMember(receipt, "receiptDigest")},
	}
	encoded := evaluationHostedLifecycleDispatchTestCanonical(t, base, "historyDigest")
	value, err := decodeCanonicalEvaluationObject(
		encoded, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleClaimHistorySetBytes,
	)
	if err != nil {
		t.Fatal(err)
	}
	return encoded, stringMember(value, "historyDigest")
}

func evaluationHostedLifecycleTransportIntentFixture(
	t *testing.T,
	base evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
	intentID string,
	mutationKind string,
	mutationSequence int64,
) evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent {
	t.Helper()
	value := cloneEvaluationObject(base.Value)
	delete(value, "intentDigest")
	value["intentId"] = intentID
	value["mutationKind"] = mutationKind
	value["mutationSequence"] = mutationSequence
	value["requestProjectionDigest"] = evaluationHostedLifecycleDispatchTestDigest(t, intentID+".projection")
	value["requestBodyDigest"] = evaluationHostedLifecycleDispatchTestDigest(t, intentID+".body")
	encoded := evaluationHostedLifecycleDispatchTestCanonical(t, value, "intentDigest")
	intent, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent(encoded)
	if err != nil {
		t.Fatal(err)
	}
	return intent
}

func evaluationHostedLifecycleTransportStoreRequestFixture(
	t *testing.T,
	ciphertext []byte,
) []byte {
	t.Helper()
	startedAt := time.Date(2026, 8, 12, 12, 0, 0, 0, time.UTC)
	ownerID := "hosted-lifecycle-owner.test"
	first := evaluationHostedLifecycleDispatchIntentFixture(t, startedAt)
	first = evaluationHostedLifecycleTransportIntentFixture(t, first, "hosted-lifecycle-intent.upload", "upload-content", 0)
	second := evaluationHostedLifecycleTransportIntentFixture(t, first, "hosted-lifecycle-intent.create", "create-primary", 1)
	intents := []evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent{first, second}
	intentValues := []any{first.Value, second.Value}
	intentDigests := []any{first.IntentDigest, second.IntentDigest}
	intentSetBase := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSetFormat, "version": int64(1),
		"operation": "create", "registrationRequestDigest": first.RegistrationRequestDigest,
		"lifecycleClaimReceiptDigest": nil, "intents": intentValues, "intentDigests": intentDigests,
	}
	intentSetBytes := evaluationHostedLifecycleDispatchTestCanonical(t, intentSetBase, "setDigest")
	intentSet, err := decodeCanonicalEvaluationObject(intentSetBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil {
		t.Fatal(err)
	}
	claims := make([]evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequest, 2)
	claimReceiptValues := make([]any, 2)
	claimReceiptDigests := make([]any, 2)
	for index, intent := range intents {
		claims[index] = evaluationHostedLifecycleDispatchClaimRequestFixture(
			t, intent.IntentDigest, ownerID, 0, 0, nil, nil, startedAt,
		)
		receiptBytes, digest := evaluationHostedLifecycleDispatchClaimReceiptFixture(
			t, claims[index], "initial-first-delivery", "dispatch-authorized-first-delivery", 1, 1,
			startedAt, nil, nil,
		)
		receipt, err := decodeCanonicalEvaluationObject(receiptBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
		if err != nil {
			t.Fatal(err)
		}
		claimReceiptValues[index], claimReceiptDigests[index] = receipt, digest
	}
	claimSetBase := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSetFormat, "version": int64(1),
		"operation": "create", "registrationRequestDigest": first.RegistrationRequestDigest,
		"lifecycleClaimReceiptDigest": nil, "dispatchIntentSetDigest": stringMember(intentSet, "setDigest"),
		"receipts": claimReceiptValues, "receiptDigests": claimReceiptDigests,
	}
	claimSetBytes := evaluationHostedLifecycleDispatchTestCanonical(t, claimSetBase, "setDigest")
	claimSet, err := decodeCanonicalEvaluationObject(claimSetBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil {
		t.Fatal(err)
	}
	claimHistorySetBase := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySetFormat, "version": int64(1),
		"operation": "create", "registrationRequestDigest": first.RegistrationRequestDigest,
		"dispatchIntentSetDigest": stringMember(intentSet, "setDigest"),
		"initialClaimReceiptSet":  claimSet, "initialClaimReceiptSetDigest": stringMember(claimSet, "setDigest"),
		"receipts": claimReceiptValues, "receiptDigests": claimReceiptDigests,
	}
	claimHistorySetBytes := evaluationHostedLifecycleDispatchTestCanonical(t, claimHistorySetBase, "setDigest")
	claimHistorySet, err := decodeCanonicalEvaluationObject(
		claimHistorySetBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes,
	)
	if err != nil {
		t.Fatal(err)
	}
	transportReceiptValues := make([]any, 2)
	transportReceiptDigests := make([]any, 2)
	for index, intent := range intents {
		resourceID, resourceRole, outcome, manifest := "provider-resource.primary", "primary", "created", any(nil)
		if index == 0 {
			resourceID, resourceRole, outcome, manifest = "provider-resource.auxiliary", "auxiliary", "uploaded", evaluationHostedLifecycleDispatchTestDigest(t, "manifest")
		}
		projectionBase := map[string]any{
			"format": evaluationHostedRetrievalRuntimeResourceLifecycleResponseProjectionFormat, "version": int64(1),
			"mutationKind": intent.MutationKind, "resourceId": resourceID, "resourceRole": resourceRole,
			"outcome": outcome, "resourceManifestDigest": manifest, "httpStatus": int64(200),
		}
		projectionBytes := evaluationHostedLifecycleDispatchTestCanonical(t, projectionBase, "projectionDigest")
		projection, err := decodeCanonicalEvaluationObject(projectionBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
		if err != nil {
			t.Fatal(err)
		}
		transportBase := map[string]any{
			"format": evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptFormat, "version": int64(1),
			"receiptId":                          fmt.Sprintf("hosted-lifecycle-transport.%d", index),
			"lifecycleOwnerAuthorityIssuerId":    stringMember(intent.Value, "lifecycleOwnerAuthorityIssuerId"),
			"lifecycleOwnerImplementationDigest": stringMember(intent.Value, "lifecycleOwnerImplementationDigest"),
			"dispatchIntentDigest":               intent.IntentDigest,
			"dispatchStageClaimReceiptDigest":    claimReceiptDigests[index],
			"protocolFamily":                     intent.ProtocolFamily, "providerConfigurationId": intent.ProviderConfigurationID,
			"endpointId": intent.EndpointID, "endpointClass": "provider-hosted-retrieval-resource",
			"method": "POST", "requestProjectionDigest": stringMember(intent.Value, "requestProjectionDigest"),
			"requestBodyDigest": stringMember(intent.Value, "requestBodyDigest"), "requestBytes": int64(310),
			"responseProjection": projection, "responseProjectionDigest": stringMember(projection, "projectionDigest"),
			"responseBodyDigest": evaluationHostedLifecycleDispatchTestDigest(t, fmt.Sprintf("response.%d", index)),
			"responseBytes":      int64(32), "httpStatus": int64(200),
			"providerRequestId": fmt.Sprintf("provider-request.%d", index),
			"dispatchState":     "dispatched", "outcome": "completed", "errorCategory": nil,
			"startedAt":   evaluationExportInstant(startedAt.Add(time.Second)),
			"completedAt": evaluationExportInstant(startedAt.Add(2 * time.Second)),
		}
		transportBytes := evaluationHostedLifecycleDispatchTestCanonical(t, transportBase, "receiptDigest")
		transportReceipt, err := decodeCanonicalEvaluationObject(transportBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
		if err != nil {
			t.Fatal(err)
		}
		transportReceiptValues[index] = transportReceipt
		transportReceiptDigests[index] = stringMember(transportReceipt, "receiptDigest")
	}
	transportSetBase := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptSetFormat, "version": int64(1),
		"operation": "create", "registrationRequestDigest": first.RegistrationRequestDigest,
		"lifecycleClaimReceiptDigest": nil, "dispatchIntentSetDigest": stringMember(intentSet, "setDigest"),
		"dispatchStageClaimReceiptSetDigest": stringMember(claimSet, "setDigest"),
		"receipts":                           transportReceiptValues, "receiptDigests": transportReceiptDigests,
	}
	transportSetBytes := evaluationHostedLifecycleDispatchTestCanonical(t, transportSetBase, "setDigest")
	transportSet, err := decodeCanonicalEvaluationObject(transportSetBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil {
		t.Fatal(err)
	}
	lifecycleExpiresAt := startedAt.Add(maximumEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolLifetime)
	aad := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceLifecycleSpoolAADFormat, "version": int64(1),
		"namespaceId": first.NamespaceID, "repositoryCommit": first.RepositoryCommit, "planDigest": first.PlanDigest,
		"frozenRunDigest": first.FrozenRunDigest, "runConfigArtifactBindingDigest": first.RunConfigArtifactBindingDigest,
		"runtimeResourceSetId": first.RuntimeResourceSetID, "lifecycleExpiresAt": evaluationExportInstant(lifecycleExpiresAt),
		"registrationRequestDigest": first.RegistrationRequestDigest, "authorityDigest": nil,
		"lifecycleClaimReceiptDigest": nil, "operation": "create", "resourceId": nil, "resourceRole": nil,
		"dispatchIntentSetDigest":            stringMember(intentSet, "setDigest"),
		"dispatchStageClaimReceiptSetDigest": stringMember(claimSet, "setDigest"),
		"dispatchStageClaimHistorySetDigest": stringMember(claimHistorySet, "setDigest"),
		"transportReceiptSetDigest":          stringMember(transportSet, "setDigest"),
		"businessResultDigest":               evaluationHostedLifecycleDispatchTestDigest(t, "business-result"),
		"plaintextDigest":                    evaluationHostedLifecycleDispatchTestDigest(t, "plaintext"),
	}
	aadDigest, err := canonicaljson.Digest(aad)
	if err != nil {
		t.Fatal(err)
	}
	keyRefDigest, encryptionProfileDigest, retentionPolicyDigest, err :=
		evaluationHostedRetrievalRuntimeResourceLifecycleSpoolAuthorityDigests()
	if err != nil {
		t.Fatal(err)
	}
	spoolRef := "hosted-lifecycle-spool." + aadDigest[len("sha256-"):]
	nonce := base64.RawURLEncoding.EncodeToString(make([]byte, 12))
	tag := base64.RawURLEncoding.EncodeToString(make([]byte, 16))
	ciphertextBase64URL := base64.RawURLEncoding.EncodeToString(ciphertext)
	ciphertextDigest := fmt.Sprintf("sha256-%x", sha256.Sum256(ciphertext))
	envelopeDigest, err := canonicaljson.Digest(map[string]any{
		"algorithm": "aes-256-gcm", "keyId": evaluationHostedRetrievalRuntimeResourceLifecycleSpoolKeyID,
		"keyVersion": int64(1), "keyRefDigest": keyRefDigest, "encryptionProfileDigest": encryptionProfileDigest,
		"nonceBase64Url": nonce, "authenticationTagBase64Url": tag, "ciphertextDigest": ciphertextDigest,
		"ciphertextSizeBytes": int64(len(ciphertext)), "aadDigest": aadDigest,
	})
	if err != nil {
		t.Fatal(err)
	}
	writeEnvelope := map[string]any{
		"format": evaluationProviderResultSpoolEnvelopeFormat, "version": int64(1), "spoolId": spoolRef,
		"algorithm": "aes-256-gcm", "keyId": evaluationHostedRetrievalRuntimeResourceLifecycleSpoolKeyID,
		"keyVersion": int64(1), "keyRefDigest": keyRefDigest, "encryptionProfileDigest": encryptionProfileDigest,
		"nonceBase64Url": nonce, "authenticationTagBase64Url": tag, "ciphertextBase64Url": ciphertextBase64URL,
		"ciphertextDigest": ciphertextDigest, "ciphertextSizeBytes": int64(len(ciphertext)),
		"aadDigest": aadDigest, "envelopeDigest": envelopeDigest,
	}
	envelope := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthorityFormat, "version": int64(1),
		"spoolRef": spoolRef, "algorithm": "aes-256-gcm", "keyId": evaluationHostedRetrievalRuntimeResourceLifecycleSpoolKeyID,
		"keyVersion": int64(1), "keyRefDigest": keyRefDigest, "encryptionProfileDigest": encryptionProfileDigest,
		"nonceBase64Url": nonce, "authenticationTagBase64Url": tag, "ciphertextDigest": ciphertextDigest,
		"ciphertextSizeBytes": int64(len(ciphertext)), "aadDigest": aadDigest,
		"plaintextDigest": stringMember(aad, "plaintextDigest"), "envelopeDigest": envelopeDigest,
	}
	spoolReceiptBase := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceLifecycleSpoolReceiptFormat, "version": int64(1),
		"spoolRef": spoolRef, "namespaceId": first.NamespaceID, "repositoryCommit": first.RepositoryCommit,
		"planDigest": first.PlanDigest, "frozenRunDigest": first.FrozenRunDigest,
		"runConfigArtifactBindingDigest": first.RunConfigArtifactBindingDigest, "runtimeResourceSetId": first.RuntimeResourceSetID,
		"lifecycleExpiresAt": evaluationExportInstant(lifecycleExpiresAt), "registrationRequestDigest": first.RegistrationRequestDigest,
		"authorityDigest": nil, "lifecycleClaimReceiptDigest": nil, "operation": "create", "resourceId": nil, "resourceRole": nil,
		"dispatchIntentSetDigest":            stringMember(intentSet, "setDigest"),
		"dispatchStageClaimReceiptSetDigest": stringMember(claimSet, "setDigest"),
		"dispatchStageClaimHistorySetDigest": stringMember(claimHistorySet, "setDigest"),
		"transportReceiptSetDigest":          stringMember(transportSet, "setDigest"),
		"businessResultDigest":               stringMember(aad, "businessResultDigest"), "algorithm": "aes-256-gcm",
		"keyId": evaluationHostedRetrievalRuntimeResourceLifecycleSpoolKeyID, "keyVersion": int64(1),
		"keyRefDigest": keyRefDigest, "encryptionProfileDigest": encryptionProfileDigest, "aadDigest": aadDigest,
		"envelopeDigest": envelopeDigest, "ciphertextDigest": ciphertextDigest, "ciphertextSizeBytes": int64(len(ciphertext)),
		"plaintextDigest":       stringMember(aad, "plaintextDigest"),
		"retentionClass":        evaluationHostedRetrievalRuntimeResourceLifecycleSpoolRetentionClass,
		"retentionPolicyDigest": retentionPolicyDigest, "createdAt": evaluationExportInstant(startedAt.Add(3 * time.Second)),
		"expiresAt": evaluationExportInstant(lifecycleExpiresAt),
	}
	spoolReceiptBytes := evaluationHostedLifecycleDispatchTestCanonical(t, spoolReceiptBase, "receiptDigest")
	spoolReceipt, err := decodeCanonicalEvaluationObject(spoolReceiptBytes, 65_536)
	if err != nil {
		t.Fatal(err)
	}
	requestBase := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequestFormat, "version": int64(1),
		"purpose": evaluationHostedRetrievalRuntimeResourceLifecycleTransportPurpose,
		"expectedPriorTransportStoreReceiptDigest": nil,
		"dispatchIntentSet":                        intentSet, "dispatchStageClaimReceiptSet": claimSet,
		"dispatchStageClaimHistorySet": claimHistorySet, "transportReceiptSet": transportSet,
		"spoolAad": aad, "spoolWriteEnvelope": writeEnvelope, "spoolEnvelopeAuthority": envelope,
		"spoolReceipt": spoolReceipt,
	}
	return evaluationHostedLifecycleDispatchTestCanonical(t, requestBase, "requestDigest")
}

func TestHostedLifecycleTransportStoreRawBindsCiphertextAndAllAuthorities(t *testing.T) {
	source := evaluationHostedLifecycleTransportStoreRequestFixture(t, []byte{1, 2, 3})
	request, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest(source)
	if err != nil {
		outer, outerErr := decodeCanonicalEvaluationObject(source, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes)
		intentValue, _ := objectMember(outer, "dispatchIntentSet")
		intentSet, intentErr := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet(intentValue)
		claimValue, _ := objectMember(outer, "dispatchStageClaimReceiptSet")
		claimSet, claimErr := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSet(claimValue, intentSet)
		claimHistoryValue, _ := objectMember(outer, "dispatchStageClaimHistorySet")
		_, claimHistoryErr := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet(claimHistoryValue, intentSet, claimSet)
		transportValue, _ := objectMember(outer, "transportReceiptSet")
		_, transportErr := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet(transportValue, intentSet, claimSet)
		aadValue, _ := objectMember(outer, "spoolAad")
		_, aadDigest, lifecycleExpiresAt, aadErr := validateEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolAAD(aadValue)
		writeValue, _ := objectMember(outer, "spoolWriteEnvelope")
		envelopeValue, _ := objectMember(outer, "spoolEnvelopeAuthority")
		_, _, _, _, envelopeErr := validateEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopes(writeValue, envelopeValue, aadDigest, stringMember(aadValue, "plaintextDigest"))
		spoolValue, _ := objectMember(outer, "spoolReceipt")
		_, _, _, spoolErr := validateEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolReceipt(spoolValue, aadValue, aadDigest, envelopeValue, lifecycleExpiresAt)
		t.Logf("outer=%v intent=%v claim=%v history=%v transport=%v aad=%v envelope=%v spool=%v", outerErr, intentErr, claimErr, claimHistoryErr, transportErr, aadErr, envelopeErr, spoolErr)
	}
	if err != nil || len(request.Ciphertext) != 3 || len(request.Nonce) != 12 || len(request.AuthenticationTag) != 16 {
		t.Fatalf("valid lifecycle transport store request was rejected: err=%v", err)
	}
	value := cloneEvaluationObject(request.Value)
	writeEnvelope, ok := objectMember(value, "spoolWriteEnvelope")
	if !ok {
		t.Fatal("fixture lost write envelope")
	}
	writeEnvelope["ciphertextBase64Url"] = "AQIE"
	delete(value, "requestDigest")
	tampered := evaluationHostedLifecycleDispatchTestCanonical(t, value, "requestDigest")
	if _, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest(tampered); err == nil {
		t.Fatal("transport store accepted ciphertext bytes that drifted from digest and size authority")
	}
}

func TestHostedLifecycleTransportStoreAcceptsExactMaximumCiphertextAndRejectsPlusOne(t *testing.T) {
	maximum := make([]byte, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleCiphertextBytes)
	if _, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest(
		evaluationHostedLifecycleTransportStoreRequestFixture(t, maximum),
	); err != nil {
		t.Fatalf("exact-maximum lifecycle ciphertext was rejected: %v", err)
	}
	plusOne := make([]byte, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleCiphertextBytes+1)
	if _, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest(
		evaluationHostedLifecycleTransportStoreRequestFixture(t, plusOne),
	); err == nil {
		t.Fatal("maximum lifecycle ciphertext plus one byte was accepted")
	}
}

func TestStoreLifecycleTransportCommitsEncryptedSpoolAndReplaysExactACK(t *testing.T) {
	storedAt := time.Date(2026, 8, 12, 12, 0, 4, 0, time.UTC)
	ownerID := "hosted-lifecycle-owner.test"
	owner, mock, authority := newEvaluationHostedLifecycleDispatchOwnerTest(t, storedAt, ownerID)
	requestBytes := evaluationHostedLifecycleTransportStoreRequestFixture(t, []byte{1, 2, 3})
	request, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest(requestBytes)
	if err != nil {
		t.Fatal(err)
	}
	receiptBytes, receiptDigest := evaluationHostedLifecycleTransportStoreReceiptFixture(t, request, storedAt, 1)
	historyBytes, historyDigest := evaluationHostedLifecycleTransportStoreHistoryFixture(t, request, receiptBytes)
	mock.ExpectBegin()
	mock.ExpectQuery("FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools").
		WithArgs(authority.NamespaceID, request.RequestDigest).
		WillReturnRows(sqlmock.NewRows([]string{"transport_store_request_bytes", "transport_store_receipt_bytes"}))
	for _, claim := range request.DispatchClaimHistorySet.Receipts {
		mock.ExpectQuery("FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts").
			WithArgs(authority.NamespaceID, claim.ReceiptDigest).
			WillReturnRows(sqlmock.NewRows([]string{"receipt_bytes"}).AddRow(claim.Canonical))
	}
	for _, initial := range request.DispatchClaimSet.Receipts {
		mock.ExpectQuery("FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_current").
			WithArgs(authority.NamespaceID, initial.DispatchIntentDigest).
			WillReturnRows(sqlmock.NewRows([]string{
				"current_claim_receipt_digest", "lifecycle_owner_instance_id",
				"prior_transport_receipt_digest", "sealed_journal_record_digest",
			}).AddRow(initial.ReceiptDigest, ownerID, nil, nil))
	}
	for _, transport := range request.TransportReceiptSet.Receipts {
		mock.ExpectQuery("FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_transport_receipts").
			WithArgs(authority.NamespaceID, transport.ReceiptDigest).
			WillReturnRows(sqlmock.NewRows([]string{"receipt_bytes"}))
		mock.ExpectExec("INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_transport_receipts").
			WillReturnResult(sqlmock.NewResult(1, 1))
	}
	mock.ExpectQuery("store_agent_evaluation_hosted_runtime_lifecycle_transport").
		WillReturnRows(sqlmock.NewRows([]string{
			"receipt_json", "receipt_bytes", "receipt_digest", "receipt_history_json",
			"receipt_history_bytes", "receipt_history_digest", "transport_ledger_revision",
		}).AddRow(receiptBytes, receiptBytes, receiptDigest, historyBytes, historyBytes, historyDigest, int64(1)))
	mock.ExpectCommit()
	stored, replay, err := owner.StoreLifecycleTransport(t.Context(), authority, request, false)
	if err != nil || replay || !bytes.Equal(stored, receiptBytes) {
		t.Fatalf("transport store failed: replay=%v err=%v", replay, err)
	}

	mock.ExpectBegin()
	mock.ExpectQuery("FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_result_spools").
		WithArgs(authority.NamespaceID, request.RequestDigest).
		WillReturnRows(sqlmock.NewRows([]string{"transport_store_request_bytes", "transport_store_receipt_bytes"}).
			AddRow(request.Canonical, receiptBytes))
	mock.ExpectCommit()
	replayed, replay, err := owner.StoreLifecycleTransport(t.Context(), authority, request, false)
	if err != nil || !replay || !bytes.Equal(replayed, receiptBytes) {
		t.Fatalf("transport ACK replay failed: replay=%v err=%v", replay, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
