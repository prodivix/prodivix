package agent

import (
	"database/sql"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func evaluationHostedRecoveryScanTestDigest(t *testing.T, label string) string {
	t.Helper()
	digest, err := canonicaljson.Digest(map[string]any{"label": label})
	if err != nil {
		t.Fatal(err)
	}
	return digest
}

func evaluationHostedRecoveryScanTestRequest(
	t *testing.T,
	requestedAt time.Time,
	pageSize int64,
	cursor *evaluationHostedRetrievalRuntimeResourceRecoveryCursor,
) evaluationHostedRetrievalRuntimeResourceRecoveryScanRequest {
	t.Helper()
	base := map[string]any{
		"format":      evaluationHostedRetrievalRuntimeResourceRecoveryScanRequestFormat,
		"version":     evaluationHostedRetrievalRuntimeResourceVersion,
		"namespaceId": evaluationServiceTestNamespace,
		"purpose":     evaluationHostedRetrievalRuntimeResourceRecoveryListPurpose,
		"pageSize":    pageSize,
		"cursor":      nil,
		"requestedAt": evaluationExportInstant(requestedAt),
	}
	if cursor != nil {
		base["cursor"] = cursor.Value
	}
	value, encoded, err := createEvaluationHostedRetrievalRuntimeResourceSelfDigestValue(base, "requestDigest")
	if err != nil {
		t.Fatal(err)
	}
	request, err := decodeEvaluationHostedRetrievalRuntimeResourceRecoveryScanRequest(encoded)
	if err != nil {
		t.Fatal(err)
	}
	if stringMember(value, "requestDigest") != request.RequestDigest {
		t.Fatal("request digest drifted")
	}
	return request
}

func evaluationHostedRecoveryScanTestCandidate(
	t *testing.T,
	label string,
	eligibleAt time.Time,
) evaluationHostedRetrievalRuntimeResourceRecoveryCandidate {
	t.Helper()
	digest := func(member string) string { return evaluationHostedRecoveryScanTestDigest(t, label+"-"+member) }
	base := map[string]any{
		"format":                         evaluationHostedRetrievalRuntimeResourceRecoveryCandidateFormat,
		"version":                        evaluationHostedRetrievalRuntimeResourceVersion,
		"namespaceId":                    evaluationServiceTestNamespace,
		"repositoryCommit":               strings.Repeat("a", 40),
		"planDigest":                     digest("plan"),
		"frozenRunDigest":                digest("run"),
		"runConfigArtifactBindingDigest": digest("binding"),
		"runtimeResourceSetId":           "hosted-resource-set-" + label,
		"authorityDigest":                digest("authority"),
		"resourceSetCommitmentDigest":    digest("commitment"),
		"activeStateDigest":              digest("state"),
		"readLeaseLedgerRootDigest":      digest("root"),
		"storedRunTerminalFenceDigest":   digest("fence"),
		"resourceExpiresAt":              evaluationExportInstant(eligibleAt.Add(time.Hour)),
		"eligibleAt":                     evaluationExportInstant(eligibleAt),
		"disposition":                    "run-terminal",
	}
	_, encoded, err := createEvaluationHostedRetrievalRuntimeResourceSelfDigestValue(base, "candidateDigest")
	if err != nil {
		t.Fatal(err)
	}
	value, err := decodeCanonicalEvaluationObject(encoded, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil {
		t.Fatal(err)
	}
	candidate, err := decodeEvaluationHostedRetrievalRuntimeResourceRecoveryCandidateValue(value)
	if err != nil {
		resourceAt, resourceErr := evaluationInstant(value["resourceExpiresAt"], "resourceExpiresAt")
		eligibleAt, eligibleErr := evaluationInstant(value["eligibleAt"], "eligibleAt")
		t.Fatalf("candidate decode: %v (exact=%v format=%v version=%v namespace=%v set=%v commit=%v disposition=%v digests=%v self=%v resourceAt=%s/%v eligibleAt=%s/%v)", err,
			exactEvaluationKeys(value, []string{
				"format", "version", "namespaceId", "repositoryCommit", "planDigest", "frozenRunDigest", "runConfigArtifactBindingDigest",
				"runtimeResourceSetId", "authorityDigest", "resourceSetCommitmentDigest", "activeStateDigest", "readLeaseLedgerRootDigest",
				"storedRunTerminalFenceDigest", "resourceExpiresAt", "eligibleAt", "disposition", "candidateDigest",
			}),
			stringMember(value, "format") == evaluationHostedRetrievalRuntimeResourceRecoveryCandidateFormat,
			evaluationHostedRetrievalRuntimeResourceVersionOne(value),
			validEvaluationAgentControlIdentity(stringMember(value, "namespaceId")),
			validEvaluationAgentControlIdentity(stringMember(value, "runtimeResourceSetId")),
			evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")),
			oneOfString(stringMember(value, "disposition"), "cleanup-incomplete", "resource-expired", "run-terminal"),
			evaluationHostedArchiveDigestMembers(value, "planDigest", "frozenRunDigest", "runConfigArtifactBindingDigest", "authorityDigest",
				"resourceSetCommitmentDigest", "activeStateDigest", "readLeaseLedgerRootDigest", "storedRunTerminalFenceDigest", "candidateDigest"),
			evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "candidateDigest"), resourceAt, resourceErr, eligibleAt, eligibleErr)
	}
	return candidate
}

func TestHostedRetrievalRuntimeResourceReadLeaseRootSealsAtLastExpiry(t *testing.T) {
	checkedAt := time.Date(2026, 8, 12, 2, 3, 4, 0, time.UTC)
	expiresAt := checkedAt.Add(155 * time.Second)
	planDigest := evaluationHostedRecoveryScanTestDigest(t, "plan")
	bindingDigest := evaluationHostedRecoveryScanTestDigest(t, "binding")
	authorityDigest := evaluationHostedRecoveryScanTestDigest(t, "authority")
	commitmentDigest := evaluationHostedRecoveryScanTestDigest(t, "commitment")
	requestBase := map[string]any{
		"format":                         "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-read-request",
		"version":                        evaluationHostedRetrievalRuntimeResourceVersion,
		"namespaceId":                    evaluationServiceTestNamespace,
		"repositoryCommit":               strings.Repeat("b", 40),
		"planDigest":                     planDigest,
		"runConfigArtifactBindingDigest": bindingDigest,
		"runtimeResourceSetId":           "hosted-resource-set-root",
		"authorityDigest":                authorityDigest,
		"resourceSetCommitmentDigest":    commitmentDigest,
		"readerOwnerInstanceId":          "hosted-reader-root",
		"readLeaseId":                    "hosted-read-lease-root",
		"minimumExpiresAt":               evaluationExportInstant(expiresAt),
	}
	_, requestBytes, err := createEvaluationHostedRetrievalRuntimeResourceSelfDigestValue(requestBase, "requestDigest")
	if err != nil {
		t.Fatal(err)
	}
	request, err := decodeEvaluationHostedRetrievalRuntimeResourceReadRequest(requestBytes)
	if err != nil {
		t.Fatal(err)
	}
	activeState, _, err := createEvaluationHostedRetrievalRuntimeResourceActiveState(
		authorityDigest, commitmentDigest, request.ReaderOwnerInstanceID, 1, &expiresAt, checkedAt,
	)
	if err != nil {
		t.Fatal(err)
	}
	receiptBase := map[string]any{
		"format":                         "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-read-receipt",
		"version":                        evaluationHostedRetrievalRuntimeResourceVersion,
		"readRequestDigest":              request.RequestDigest,
		"planDigest":                     planDigest,
		"runConfigArtifactBindingDigest": bindingDigest,
		"runtimeResourceSetId":           request.RuntimeResourceSetID,
		"authorityDigest":                authorityDigest,
		"resourceSetCommitmentDigest":    commitmentDigest,
		"readLeaseId":                    request.ReadLeaseID,
		"activeOwnerInstanceId":          request.ReaderOwnerInstanceID,
		"claimGeneration":                int64(1),
		"activeState":                    activeState,
		"activeStateDigest":              stringMember(activeState, "stateDigest"),
		"lifecycle":                      "active",
		"checkedAt":                      evaluationExportInstant(checkedAt),
		"expiresAt":                      evaluationExportInstant(expiresAt),
	}
	_, receiptBytes, err := createEvaluationHostedRetrievalRuntimeResourceSelfDigestValue(receiptBase, "receiptDigest")
	if err != nil {
		t.Fatal(err)
	}
	entry, err := decodeEvaluationHostedRetrievalRuntimeResourceReadLedgerEntry(1, requestBytes, receiptBytes)
	if err != nil {
		t.Fatal(err)
	}
	_, _, err = createEvaluationHostedRetrievalRuntimeResourceReadLeaseRootValue(
		[]evaluationHostedRetrievalRuntimeResourceReadLedgerEntry{entry}, planDigest, bindingDigest,
		request.RuntimeResourceSetID, authorityDigest, commitmentDigest, expiresAt.Add(-time.Millisecond),
	)
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("early seal error=%v, want conflict", err)
	}
	root, rootBytes, err := createEvaluationHostedRetrievalRuntimeResourceReadLeaseRootValue(
		[]evaluationHostedRetrievalRuntimeResourceReadLedgerEntry{entry}, planDigest, bindingDigest,
		request.RuntimeResourceSetID, authorityDigest, commitmentDigest, expiresAt,
	)
	if err != nil {
		t.Fatal(err)
	}
	if stringMember(root, "lastExpiresAt") != evaluationExportInstant(expiresAt) ||
		stringMember(root, "sealedAt") != evaluationExportInstant(expiresAt) {
		t.Fatalf("root timing=%s", rootBytes)
	}
}

func TestHostedRetrievalRuntimeResourceRecoveryPageUsesExactCursorSnapshot(t *testing.T) {
	requestedAt := time.Date(2026, 8, 12, 3, 4, 5, 0, time.UTC)
	request := evaluationHostedRecoveryScanTestRequest(t, requestedAt, 1, nil)
	candidates := []evaluationHostedRetrievalRuntimeResourceRecoveryCandidate{
		evaluationHostedRecoveryScanTestCandidate(t, "a", requestedAt.Add(-2*time.Minute)),
		evaluationHostedRecoveryScanTestCandidate(t, "b", requestedAt.Add(-time.Minute)),
	}
	page, pageBytes, err := createEvaluationHostedRetrievalRuntimeResourceRecoveryPage(request, 17, candidates)
	if err != nil {
		t.Fatal(err)
	}
	pageCandidates, _ := arrayMember(page, "candidates")
	if len(pageCandidates) != 1 || page["nextCursor"] == nil {
		t.Fatalf("first page=%s", pageBytes)
	}
	cursorValue, ok := page["nextCursor"].(map[string]any)
	if !ok {
		t.Fatal("next cursor is absent")
	}
	cursor, err := decodeEvaluationHostedRetrievalRuntimeResourceRecoveryCursorValue(cursorValue)
	if err != nil {
		t.Fatal(err)
	}
	continuation := evaluationHostedRecoveryScanTestRequest(t, requestedAt, 1, &cursor)
	continuedPage, _, err := createEvaluationHostedRetrievalRuntimeResourceRecoveryPage(continuation, 17, candidates)
	if err != nil {
		t.Fatal(err)
	}
	continuedCandidates, _ := arrayMember(continuedPage, "candidates")
	if len(continuedCandidates) != 1 || stringMember(continuedCandidates[0].(map[string]any), "candidateDigest") != candidates[1].CandidateDigest ||
		continuedPage["nextCursor"] != nil {
		t.Fatalf("continuation=%v", continuedPage)
	}
}

func TestHostedRetrievalRuntimeResourceRecoveryEligibilityUsesStrictExpiry(t *testing.T) {
	expiresAt := time.Date(2026, 8, 12, 3, 30, 0, 0, time.UTC)
	candidate := evaluationHostedRecoveryScanTestCandidate(t, "strict-expiry", expiresAt)
	candidate.Disposition = "resource-expired"
	candidate.ResourceExpiresAt = expiresAt
	candidate.EligibleAt = expiresAt
	state := evaluationHostedRetrievalRuntimeResourceRecoveryCandidateState{
		Lifecycle:          "active",
		ResourceExpiresAt:  expiresAt,
		CurrentStateDigest: candidate.ActiveStateDigest,
		FenceSealedAt:      expiresAt.Add(-time.Minute),
	}
	if evaluationHostedRetrievalRuntimeResourceRecoveryDispositionMatches(candidate, state, expiresAt) {
		t.Fatal("exact resource expiry was treated as recovery-eligible")
	}
	if !evaluationHostedRetrievalRuntimeResourceRecoveryDispositionMatches(candidate, state, expiresAt.Add(time.Millisecond)) {
		t.Fatal("resource was not eligible one millisecond after expiry")
	}
	candidate.Disposition = "cleanup-incomplete"
	candidate.EligibleAt = expiresAt
	state = evaluationHostedRetrievalRuntimeResourceRecoveryCandidateState{
		Lifecycle:              "cleanup-in-progress",
		ClaimExpiresAt:         sql.NullTime{Time: expiresAt, Valid: true},
		PriorActiveStateDigest: sql.NullString{String: candidate.ActiveStateDigest, Valid: true},
		CleanupReadRootDigest:  sql.NullString{String: candidate.ReadLeaseLedgerRootDigest, Valid: true},
	}
	if evaluationHostedRetrievalRuntimeResourceRecoveryDispositionMatches(candidate, state, expiresAt) {
		t.Fatal("exact cleanup claim expiry was treated as recovery-eligible")
	}
	if !evaluationHostedRetrievalRuntimeResourceRecoveryDispositionMatches(candidate, state, expiresAt.Add(time.Millisecond)) {
		t.Fatal("cleanup claim was not eligible one millisecond after expiry")
	}
}

func TestHostedRetrievalRuntimeResourceRecoveryScanACKReplayReturnsStoredPage(t *testing.T) {
	requestedAt := time.Date(2026, 8, 12, 4, 5, 6, 0, time.UTC)
	request := evaluationHostedRecoveryScanTestRequest(t, requestedAt, 1, nil)
	candidate := evaluationHostedRecoveryScanTestCandidate(t, "ack", requestedAt.Add(-time.Minute))
	_, pageBytes, err := createEvaluationHostedRetrievalRuntimeResourceRecoveryPage(
		request, 23, []evaluationHostedRetrievalRuntimeResourceRecoveryCandidate{candidate},
	)
	if err != nil {
		t.Fatal(err)
	}
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	owner, err := NewEvaluationHostedRetrievalRuntimeResource(EvaluationHostedRetrievalRuntimeResourceConfig{
		Repository: NewRepository(database), Clock: func() time.Time { return requestedAt.Add(time.Second) },
	})
	if err != nil {
		t.Fatal(err)
	}
	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT request.request_bytes,request.scan_ledger_revision,page.page_bytes`).
		WithArgs(request.NamespaceID, request.RequestDigest).
		WillReturnRows(sqlmock.NewRows([]string{"request_bytes", "scan_ledger_revision", "page_bytes"}).
			AddRow(request.Canonical, int64(23), pageBytes))
	mock.ExpectCommit()
	stored, replay, err := owner.ListRecoveryCandidates(t.Context(), EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: request.NamespaceID,
	}, request)
	if err != nil {
		t.Fatal(err)
	}
	if !replay || string(stored) != string(pageBytes) {
		t.Fatalf("replay=%v stored=%s", replay, stored)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestHostedRetrievalRuntimeResourceRecoveryScanRejectsBodyDrift(t *testing.T) {
	requestedAt := time.Date(2026, 8, 12, 5, 6, 7, 0, time.UTC)
	request := evaluationHostedRecoveryScanTestRequest(t, requestedAt, 1, nil)
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	owner, err := NewEvaluationHostedRetrievalRuntimeResource(EvaluationHostedRetrievalRuntimeResourceConfig{
		Repository: NewRepository(database), Clock: func() time.Time { return requestedAt },
	})
	if err != nil {
		t.Fatal(err)
	}
	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT request.request_bytes,request.scan_ledger_revision,page.page_bytes`).
		WithArgs(request.NamespaceID, request.RequestDigest).
		WillReturnRows(sqlmock.NewRows([]string{"request_bytes", "scan_ledger_revision", "page_bytes"}).
			AddRow([]byte(`{"different":true}`), int64(23), nil))
	mock.ExpectRollback()
	_, _, err = owner.ListRecoveryCandidates(t.Context(), EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: request.NamespaceID,
	}, request)
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("body drift error=%v, want conflict", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
