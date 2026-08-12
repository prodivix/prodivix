package agent

import (
	"bytes"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationHostedLifecycleUnfinishedFixture struct {
	Request             evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest
	Page                []byte
	PageDigest          string
	SnapshotID          string
	SnapshotAt          time.Time
	ExpiresAt           time.Time
	Candidate           map[string]any
	RegistrationRequest map[string]any
	IntentSet           map[string]any
	HistorySet          map[string]any
}

func evaluationHostedLifecycleUnfinishedCandidateFixture(
	t *testing.T,
	startedAt time.Time,
) (map[string]any, map[string]any, map[string]any) {
	t.Helper()
	digest := func(label string) string { return evaluationHostedLifecycleDispatchTestDigest(t, label) }
	baseIntent := evaluationHostedLifecycleDispatchIntentFixture(t, startedAt)
	registrationIntent := evaluationHostedArchiveTestSelfDigest(t,
		evaluationHostedRetrievalRuntimeResourceRegistrationIntentFormat, "intentDigest", map[string]any{
			"providerConfigurationId":        baseIntent.ProviderConfigurationID,
			"providerConfigurationDigest":    baseIntent.ProviderConfigurationDigest,
			"protocolFamily":                 baseIntent.ProtocolFamily,
			"modelId":                        "gpt-5.4-mini",
			"modelLineageDigest":             digest("unfinished.model-lineage"),
			"adapterDigest":                  digest("unfinished.adapter"),
			"capabilityProfileId":            baseIntent.CapabilityProfileID,
			"capabilityProfileDigest":        digest("unfinished.capability-profile"),
			"probeProgramDigest":             digest("unfinished.probe-program"),
			"publicResourceDescriptorDigest": digest("unfinished.public-resource"),
			"maximumResourceLifetimeMs":      int64(691_200_000),
			"minimumQueryReadLeaseMs":        int64(155_000),
			"requiredOperations":             []any{"create", "delete", "query", "upload"},
		})
	budgetAuthority := evaluationHostedArchiveTestSelfDigest(t,
		evaluationHostedRetrievalRuntimeResourceBudgetAuthorityFormat, "authorityDigest", map[string]any{
			"namespaceId": baseIntent.NamespaceID, "planDigest": baseIntent.PlanDigest,
			"reservePolicyDigest": digest("unfinished.reserve-policy"),
			"budgetDigest":        digest("unfinished.budget"),
			"reservationId":       baseIntent.BudgetReservationID, "ledgerRevision": int64(7),
			"demandDigest":      digest("unfinished.demand"),
			"demandBytesDigest": digest("unfinished.demand-bytes"),
			"reservedAt":        evaluationExportInstant(startedAt.Add(-time.Minute)),
		})
	networkAuthority := evaluationHostedArchiveTestSelfDigest(t,
		evaluationHostedRetrievalRuntimeResourceNetworkAuthorityFormat, "authorityDigest", map[string]any{
			"namespaceId": baseIntent.NamespaceID, "repositoryCommit": baseIntent.RepositoryCommit,
			"planDigest": baseIntent.PlanDigest, "frozenRunDigest": baseIntent.FrozenRunDigest,
			"runConfigArtifactBindingDigest": baseIntent.RunConfigArtifactBindingDigest,
			"providerConfigurationId":        baseIntent.ProviderConfigurationID,
			"providerConfigurationDigest":    baseIntent.ProviderConfigurationDigest,
			"protocolFamily":                 baseIntent.ProtocolFamily,
			"purpose":                        "hosted-retrieval-runtime-resource-lifecycle",
			"endpointClass":                  "first-party-hosted",
			"allowedOperations":              []any{"create", "delete", "query", "upload"},
		})
	registrationRequest := evaluationHostedArchiveTestSelfDigest(t,
		evaluationHostedRetrievalRuntimeResourceRegistrationRequestFormat, "requestDigest", map[string]any{
			"namespaceId": baseIntent.NamespaceID, "repositoryCommit": baseIntent.RepositoryCommit,
			"planDigest": baseIntent.PlanDigest, "frozenRunDigest": baseIntent.FrozenRunDigest,
			"runConfigArtifactBindingDigest":   baseIntent.RunConfigArtifactBindingDigest,
			"runtimeResourceSetId":             baseIntent.RuntimeResourceSetID,
			"registrationIntent":               registrationIntent,
			"registrationIntentDigest":         stringMember(registrationIntent, "intentDigest"),
			"providerConfigurationId":          baseIntent.ProviderConfigurationID,
			"providerConfigurationDigest":      baseIntent.ProviderConfigurationDigest,
			"protocolFamily":                   baseIntent.ProtocolFamily,
			"modelId":                          stringMember(registrationIntent, "modelId"),
			"modelLineageDigest":               stringMember(registrationIntent, "modelLineageDigest"),
			"adapterDigest":                    stringMember(registrationIntent, "adapterDigest"),
			"capabilityProfileId":              baseIntent.CapabilityProfileID,
			"capabilityProfileDigest":          stringMember(registrationIntent, "capabilityProfileDigest"),
			"probeProgramDigest":               stringMember(registrationIntent, "probeProgramDigest"),
			"publicResourceDescriptorDigest":   stringMember(registrationIntent, "publicResourceDescriptorDigest"),
			"budgetReservationAuthority":       budgetAuthority,
			"budgetReservationAuthorityDigest": stringMember(budgetAuthority, "authorityDigest"),
			"networkPolicyAuthority":           networkAuthority,
			"networkPolicyAuthorityDigest":     stringMember(networkAuthority, "authorityDigest"),
			"minimumExpiresAt":                 evaluationExportInstant(startedAt.Add(24 * time.Hour)),
		})
	intentValue := cloneEvaluationObject(baseIntent.Value)
	delete(intentValue, "intentDigest")
	intentValue["registrationIntentDigest"] = stringMember(registrationRequest, "registrationIntentDigest")
	intentValue["registrationRequestDigest"] = stringMember(registrationRequest, "requestDigest")
	intentValue["budgetReservationAuthorityDigest"] = stringMember(registrationRequest, "budgetReservationAuthorityDigest")
	intentBytes := evaluationHostedLifecycleDispatchTestCanonical(t, intentValue, "intentDigest")
	intent, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent(intentBytes)
	if err != nil {
		t.Fatal(err)
	}
	intentSetBase := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSetFormat, "version": int64(1),
		"operation": "create", "registrationRequestDigest": intent.RegistrationRequestDigest,
		"lifecycleClaimReceiptDigest": nil, "intents": []any{intent.Value}, "intentDigests": []any{intent.IntentDigest},
	}
	intentSetBytes := evaluationHostedLifecycleDispatchTestCanonical(t, intentSetBase, "setDigest")
	intentSet, err := decodeCanonicalEvaluationObject(intentSetBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil {
		t.Fatal(err)
	}
	claim := evaluationHostedLifecycleDispatchClaimRequestFixture(
		t, intent.IntentDigest, "hosted-lifecycle-owner.test", 0, 0, nil, nil, startedAt,
	)
	claimReceiptBytes, claimReceiptDigest := evaluationHostedLifecycleDispatchClaimReceiptFixture(
		t, claim, "initial-first-delivery", "dispatch-authorized-first-delivery", 1, 1, startedAt, nil, nil,
	)
	claimReceipt, err := decodeCanonicalEvaluationObject(
		claimReceiptBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes,
	)
	if err != nil {
		t.Fatal(err)
	}
	claimSetBase := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSetFormat, "version": int64(1),
		"operation": "create", "registrationRequestDigest": intent.RegistrationRequestDigest,
		"lifecycleClaimReceiptDigest": nil, "dispatchIntentSetDigest": stringMember(intentSet, "setDigest"),
		"receipts": []any{claimReceipt}, "receiptDigests": []any{claimReceiptDigest},
	}
	claimSetBytes := evaluationHostedLifecycleDispatchTestCanonical(t, claimSetBase, "setDigest")
	claimSet, err := decodeCanonicalEvaluationObject(claimSetBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil {
		t.Fatal(err)
	}
	historySetBase := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySetFormat, "version": int64(1),
		"operation": "create", "registrationRequestDigest": intent.RegistrationRequestDigest,
		"dispatchIntentSetDigest": stringMember(intentSet, "setDigest"),
		"initialClaimReceiptSet":  claimSet, "initialClaimReceiptSetDigest": stringMember(claimSet, "setDigest"),
		"receipts": []any{claimReceipt}, "receiptDigests": []any{claimReceiptDigest},
	}
	historySetBytes := evaluationHostedLifecycleDispatchTestCanonical(t, historySetBase, "setDigest")
	historySet, err := decodeCanonicalEvaluationObject(
		historySetBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes,
	)
	if err != nil {
		t.Fatal(err)
	}
	return registrationRequest, intentSet, historySet
}

func evaluationHostedLifecycleUnfinishedReadFixture(t *testing.T) evaluationHostedLifecycleUnfinishedFixture {
	t.Helper()
	registrationRequest, intentSet, historySet := evaluationHostedLifecycleUnfinishedCandidateFixture(
		t, time.Date(2026, 8, 12, 12, 0, 0, 0, time.UTC),
	)
	intentSetDecoded, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet(intentSet)
	if err != nil {
		t.Fatal(err)
	}
	first := intentSetDecoded.Intents[0]
	requestedAt := time.Date(2026, 8, 12, 12, 5, 0, 0, time.UTC)
	requestBase := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequestFormat, "version": int64(1),
		"purpose":     evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadPurpose,
		"namespaceId": first.NamespaceID, "repositoryCommit": first.RepositoryCommit,
		"planDigest": first.PlanDigest, "frozenRunDigest": first.FrozenRunDigest,
		"runConfigArtifactBindingDigest": first.RunConfigArtifactBindingDigest,
		"runtimeResourceSetId":           first.RuntimeResourceSetID,
		"lifecycleOwnerInstanceId":       "hosted-lifecycle-owner.test", "pageSize": int64(8), "cursor": nil,
		"requestedAt":              evaluationExportInstant(requestedAt),
		"minimumSnapshotExpiresAt": evaluationExportInstant(requestedAt.Add(time.Minute)),
	}
	requestBytes := evaluationHostedLifecycleDispatchTestCanonical(t, requestBase, "requestDigest")
	request, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest(requestBytes)
	if err != nil {
		t.Fatal(err)
	}
	candidateBase := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidateFormat, "version": int64(1),
		"registrationRequest": registrationRequest, "registrationRequestDigest": stringMember(registrationRequest, "requestDigest"),
		"dispatchIntentSet": intentSet, "dispatchIntentSetDigest": stringMember(intentSet, "setDigest"),
		"dispatchStageClaimHistorySet":       historySet,
		"dispatchStageClaimHistorySetDigest": stringMember(historySet, "setDigest"),
		"unfinishedState":                    "staged-before-transport", "durableTransportReceiptSetDigest": nil,
		"spoolRef": nil, "transportStoreReceiptDigest": nil,
	}
	candidateBytes := evaluationHostedLifecycleDispatchTestCanonical(t, candidateBase, "candidateDigest")
	candidate, err := decodeCanonicalEvaluationObject(candidateBytes, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes)
	if err != nil {
		t.Fatal(err)
	}
	implementationDigest, err := evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryImplementationDigest()
	if err != nil {
		t.Fatal(err)
	}
	snapshotAt := requestedAt
	expiresAt := snapshotAt.Add(evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimLifetime)
	snapshotID := "hosted-lifecycle-unfinished-snapshot." + request.RequestDigest[len("sha256-"):]
	pageBase := map[string]any{
		"format": evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPageFormat, "version": int64(1),
		"request": request.Value, "requestDigest": request.RequestDigest,
		"recoveryAuthorityIssuerId":             evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryAuthorityIssuerID,
		"recoveryAuthorityImplementationDigest": implementationDigest,
		"snapshotId":                            snapshotID, "snapshotRevision": int64(9),
		"snapshotAt": evaluationExportInstant(snapshotAt), "expiresAt": evaluationExportInstant(expiresAt),
		"candidates": []any{candidate}, "candidateDigests": []any{stringMember(candidate, "candidateDigest")},
		"nextCursor": nil,
	}
	page := evaluationHostedLifecycleDispatchTestCanonical(t, pageBase, "pageDigest")
	pageValue, err := decodeCanonicalEvaluationObject(page, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes)
	if err != nil {
		t.Fatal(err)
	}
	return evaluationHostedLifecycleUnfinishedFixture{
		Request: request, Page: page, PageDigest: stringMember(pageValue, "pageDigest"), SnapshotID: snapshotID,
		SnapshotAt: snapshotAt, ExpiresAt: expiresAt, Candidate: candidate, RegistrationRequest: registrationRequest,
		IntentSet: intentSet, HistorySet: historySet,
	}
}

func TestHostedLifecycleUnfinishedDispatchPageBindsScopeHistoryAndPagination(t *testing.T) {
	fixture := evaluationHostedLifecycleUnfinishedReadFixture(t)
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage(
		fixture.Page, fixture.Request,
	); err != nil {
		t.Fatalf("valid unfinished dispatch page was rejected: %v", err)
	}
	page, err := decodeCanonicalEvaluationObject(fixture.Page, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes)
	if err != nil {
		t.Fatal(err)
	}
	candidates := page["candidates"].([]any)
	candidate := cloneEvaluationObject(candidates[0].(map[string]any))
	candidate["spoolRef"] = "foreign-spool"
	delete(candidate, "candidateDigest")
	candidateBytes := evaluationHostedLifecycleDispatchTestCanonical(t, candidate, "candidateDigest")
	candidate, err = decodeCanonicalEvaluationObject(candidateBytes, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes)
	if err != nil {
		t.Fatal(err)
	}
	page["candidates"] = []any{candidate}
	page["candidateDigests"] = []any{stringMember(candidate, "candidateDigest")}
	delete(page, "pageDigest")
	tampered := evaluationHostedLifecycleDispatchTestCanonical(t, page, "pageDigest")
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage(
		tampered, fixture.Request,
	); err == nil {
		t.Fatal("staged unfinished candidate accepted a foreign active spool reference")
	}
}

func TestHostedLifecycleUnfinishedDispatchCandidateBindsDurableRegistrationRequest(t *testing.T) {
	fixture := evaluationHostedLifecycleUnfinishedReadFixture(t)
	candidate := cloneEvaluationObject(fixture.Candidate)
	registration := cloneEvaluationObject(fixture.RegistrationRequest)
	registration["providerConfigurationId"] = "provider.foreign.test"
	evaluationHostedArchiveTestRecomputeSelfDigest(t, registration, "requestDigest")
	candidate["registrationRequest"] = registration
	candidate["registrationRequestDigest"] = stringMember(registration, "requestDigest")
	evaluationHostedArchiveTestRecomputeSelfDigest(t, candidate, "candidateDigest")
	if _, _, err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidate(
		candidate, fixture.Request,
	); err == nil {
		t.Fatal("unfinished dispatch candidate accepted a registration request detached from its durable intent")
	}
	delete(candidate, "registrationRequestDigest")
	evaluationHostedArchiveTestRecomputeSelfDigest(t, candidate, "candidateDigest")
	if _, _, err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidate(
		candidate, fixture.Request,
	); err == nil {
		t.Fatal("unfinished dispatch candidate accepted the pre-FINAL2 key set")
	}
}

func TestReadLifecycleUnfinishedDispatchesReturnsCanonicalBoundedSnapshot(t *testing.T) {
	fixture := evaluationHostedLifecycleUnfinishedReadFixture(t)
	owner, mock, authority := newEvaluationHostedLifecycleDispatchOwnerTest(
		t, fixture.SnapshotAt, fixture.Request.LifecycleOwnerInstanceID,
	)
	implementationDigest, err := evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryImplementationDigest()
	if err != nil {
		t.Fatal(err)
	}
	mock.ExpectBegin()
	mock.ExpectQuery("read_agent_evaluation_hosted_runtime_lifecycle_unfinished_dispatches").
		WithArgs(authority.NamespaceID, string(fixture.Request.Canonical), fixture.Request.Canonical,
			evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryAuthorityIssuerID,
			implementationDigest, fixture.SnapshotAt, fixture.ExpiresAt).
		WillReturnRows(sqlmock.NewRows([]string{
			"page_json", "page_bytes", "page_digest", "snapshot_id", "snapshot_revision",
		}).AddRow(fixture.Page, fixture.Page, fixture.PageDigest, fixture.SnapshotID, int64(9)))
	mock.ExpectCommit()
	page, err := owner.ReadLifecycleUnfinishedDispatches(t.Context(), authority, fixture.Request)
	if err != nil || !bytes.Equal(page, fixture.Page) {
		t.Fatalf("unfinished dispatch snapshot read failed: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestHostedLifecycleUnfinishedDispatchReadRejectsExpiredAndNonCanonicalCursor(t *testing.T) {
	fixture := evaluationHostedLifecycleUnfinishedReadFixture(t)
	request := cloneEvaluationObject(fixture.Request.Value)
	request["cursor"] = "hosted-lifecycle-unfinished-cursor.invalid.8"
	delete(request, "requestDigest")
	invalidCursor := evaluationHostedLifecycleDispatchTestCanonical(t, request, "requestDigest")
	if _, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest(invalidCursor); err == nil {
		t.Fatal("unfinished dispatch read accepted a noncanonical cursor")
	}
	request = cloneEvaluationObject(fixture.Request.Value)
	request["minimumSnapshotExpiresAt"] = evaluationExportInstant(fixture.Request.RequestedAt.Add(126 * time.Second))
	delete(request, "requestDigest")
	expired := evaluationHostedLifecycleDispatchTestCanonical(t, request, "requestDigest")
	if _, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest(expired); err == nil {
		t.Fatal("unfinished dispatch read accepted a snapshot lifetime over 125 seconds")
	}
	if _, err := canonicaljson.Bytes(fixture.Candidate); err != nil {
		t.Fatal(err)
	}
}
