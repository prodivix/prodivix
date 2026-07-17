package remoteexecution

import (
	"database/sql"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestRecordExecutionPersistsExactEnvironmentAuthority(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	store := NewStore(database)
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO remote_execution_grants")).WithArgs("execution-1", "workspace-1", "principal-1", "session-1", "snapshot-1", []byte(`{"document:data-1:content":"3","workspace":"7"}`), "environment-1", "revision-7", "live").WillReturnResult(sqlmock.NewResult(1, 1))
	err = store.RecordExecution(t.Context(), ExecutionAuthority{
		ExecutionID: "execution-1", WorkspaceID: "workspace-1", OwnerID: "principal-1", SessionID: "session-1",
		SnapshotID: "snapshot-1", PartitionRevisions: map[string]string{"workspace": "7", "document:data-1:content": "3"},
		Environment: &EnvironmentReference{EnvironmentID: "environment-1", Revision: "revision-7", Mode: "live"},
	})
	if err != nil {
		t.Fatalf("record authority: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func storedMutationResult() DataGatewayResult {
	return DataGatewayResult{
		Value: map[string]any{"id": "item-1"},
		Network: dataGatewayNetworkTrace{
			Format: "prodivix.execution-network-trace.v1", RequestID: "mutation-1:1", Phase: "runtime", RuntimeZone: "server", Mode: "live", Adapter: "core.http", Method: "POST",
			SanitizedURL: "https://api.example.test/", Protocol: "https", Outcome: "allowed", Status: 201, Redacted: true,
			Correlation: dataGatewayCorrelation{Kind: "data-operation", DocumentID: "data-1", OperationID: "create", InvocationID: "mutation-1", Sequence: 4, Attempt: 1},
		},
	}
}

func TestDataGatewayMutationReplayStoreClaimsCompletesAndReturnsStoredResult(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	store := NewStore(database)
	key := DataGatewayMutationReplayKey{ExecutionID: "execution-1", DocumentID: "data-1", OperationID: "create", InvocationID: "mutation-1", Sequence: 4}
	hash := strings.Repeat("a", 64)
	policy := DataGatewayMutationReplayPolicy{Attempt: 1, MaximumAttempts: 1}
	insert := regexp.QuoteMeta("INSERT INTO remote_data_mutation_replays")
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")).WithArgs("execution-1").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT request_hash, status, result_json")).WithArgs("execution-1", "data-1", "create", "mutation-1").WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT COUNT(*) FROM remote_data_mutation_replays WHERE execution_id = $1")).WithArgs("execution-1").WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectExec(insert).WithArgs("execution-1", "data-1", "create", "mutation-1", hash, int64(1), int64(1)).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	claim, err := store.ClaimDataGatewayMutation(t.Context(), key, hash, policy)
	if err != nil || !claim.Acquired || claim.Result != nil {
		t.Fatalf("claim mutation: claim=%#v err=%v", claim, err)
	}
	result := storedMutationResult()
	encoded, _ := json.Marshal(result)
	mock.ExpectExec(regexp.QuoteMeta("UPDATE remote_data_mutation_replays")).WithArgs("execution-1", "data-1", "create", "mutation-1", hash, encoded, int64(1)).WillReturnResult(sqlmock.NewResult(0, 1))
	if err := store.CompleteDataGatewayMutation(t.Context(), key, hash, 1, result); err != nil {
		t.Fatalf("complete mutation: %v", err)
	}
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")).WithArgs("execution-1").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT request_hash, status, result_json")).WithArgs("execution-1", "data-1", "create", "mutation-1").WillReturnRows(sqlmock.NewRows([]string{"request_hash", "status", "result_json", "attempt", "maximum_attempts"}).AddRow(hash, "succeeded", encoded, int64(1), int64(1)))
	mock.ExpectRollback()
	replayed, err := store.ClaimDataGatewayMutation(t.Context(), key, hash, policy)
	if err != nil || replayed.Acquired || replayed.Result == nil || replayed.Result.Network.Correlation.InvocationID != "mutation-1" {
		t.Fatalf("replay mutation result: claim=%#v err=%v", replayed, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestDataGatewayMutationReplayStoreClaimsExactlyNextReleasedAttempt(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	store := NewStore(database)
	key := DataGatewayMutationReplayKey{ExecutionID: "execution-1", DocumentID: "data-1", OperationID: "create", InvocationID: "mutation-1", Sequence: 4}
	hash := strings.Repeat("f", 64)

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")).WithArgs("execution-1").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT request_hash, status, result_json")).WithArgs("execution-1", "data-1", "create", "mutation-1").WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT COUNT(*) FROM remote_data_mutation_replays WHERE execution_id = $1")).WithArgs("execution-1").WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO remote_data_mutation_replays")).WithArgs("execution-1", "data-1", "create", "mutation-1", hash, int64(1), int64(2)).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	if claim, err := store.ClaimDataGatewayMutation(t.Context(), key, hash, DataGatewayMutationReplayPolicy{Attempt: 1, MaximumAttempts: 2}); err != nil || claim == nil || !claim.Acquired {
		t.Fatalf("claim first attempt: claim=%#v err=%v", claim, err)
	}

	mock.ExpectExec(regexp.QuoteMeta("UPDATE remote_data_mutation_replays")).WithArgs("execution-1", "data-1", "create", "mutation-1", hash, int64(1)).WillReturnResult(sqlmock.NewResult(0, 1))
	if err := store.ReleaseDataGatewayMutationRetry(t.Context(), key, hash, 1); err != nil {
		t.Fatalf("release retry: %v", err)
	}

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")).WithArgs("execution-1").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT request_hash, status, result_json")).WithArgs("execution-1", "data-1", "create", "mutation-1").WillReturnRows(sqlmock.NewRows([]string{"request_hash", "status", "result_json", "attempt", "maximum_attempts"}).AddRow(hash, "retryable", nil, int64(1), int64(2)))
	mock.ExpectExec(regexp.QuoteMeta("UPDATE remote_data_mutation_replays")).WithArgs("execution-1", "data-1", "create", "mutation-1", hash, int64(2), int64(1), int64(2)).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	if claim, err := store.ClaimDataGatewayMutation(t.Context(), key, hash, DataGatewayMutationReplayPolicy{Attempt: 2, MaximumAttempts: 2}); err != nil || claim == nil || !claim.Acquired {
		t.Fatalf("claim second attempt: claim=%#v err=%v", claim, err)
	}

	result := storedMutationResult()
	result.Network.RequestID = "mutation-1:2"
	result.Network.Correlation.Attempt = 2
	encoded, _ := json.Marshal(result)
	mock.ExpectExec(regexp.QuoteMeta("UPDATE remote_data_mutation_replays")).WithArgs("execution-1", "data-1", "create", "mutation-1", hash, encoded, int64(2)).WillReturnResult(sqlmock.NewResult(0, 1))
	if err := store.CompleteDataGatewayMutation(t.Context(), key, hash, 2, result); err != nil {
		t.Fatalf("complete second attempt: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestDataGatewayMutationReplayStoreRejectsDriftAndFencesUnknownOutcome(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	store := NewStore(database)
	key := DataGatewayMutationReplayKey{ExecutionID: "execution-1", DocumentID: "data-1", OperationID: "create", InvocationID: "mutation-1", Sequence: 4}
	hash := strings.Repeat("b", 64)
	policy := DataGatewayMutationReplayPolicy{Attempt: 1, MaximumAttempts: 1}
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")).WithArgs("execution-1").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT request_hash, status, result_json")).WithArgs("execution-1", "data-1", "create", "mutation-1").WillReturnRows(sqlmock.NewRows([]string{"request_hash", "status", "result_json", "attempt", "maximum_attempts"}).AddRow(strings.Repeat("c", 64), "pending", nil, int64(1), int64(1)))
	mock.ExpectRollback()
	if _, err := store.ClaimDataGatewayMutation(t.Context(), key, hash, policy); !errors.Is(err, ErrDataGatewayReplayConflict) {
		t.Fatalf("expected replay drift conflict, got %v", err)
	}
	mock.ExpectExec(regexp.QuoteMeta("UPDATE remote_data_mutation_replays")).WithArgs("execution-1", "data-1", "create", "mutation-1", hash, int64(1)).WillReturnResult(sqlmock.NewResult(0, 1))
	if err := store.FenceDataGatewayMutation(t.Context(), key, hash, 1); err != nil {
		t.Fatalf("fence mutation: %v", err)
	}
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")).WithArgs("execution-1").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT request_hash, status, result_json")).WithArgs("execution-1", "data-1", "create", "mutation-1").WillReturnRows(sqlmock.NewRows([]string{"request_hash", "status", "result_json", "attempt", "maximum_attempts"}).AddRow(hash, "indeterminate", nil, int64(1), int64(1)))
	mock.ExpectRollback()
	if _, err := store.ClaimDataGatewayMutation(t.Context(), key, hash, policy); !errors.Is(err, ErrDataGatewayReplayUnsafe) {
		t.Fatalf("expected indeterminate replay denial, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestDataGatewayMutationReplayStoreRejectsCapacityBeforeClaim(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	store := NewStore(database)
	key := DataGatewayMutationReplayKey{ExecutionID: "execution-full", DocumentID: "data-1", OperationID: "create", InvocationID: "mutation-new", Sequence: 1}
	hash := strings.Repeat("d", 64)
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")).WithArgs("execution-full").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT request_hash, status, result_json")).WithArgs("execution-full", "data-1", "create", "mutation-new").WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT COUNT(*) FROM remote_data_mutation_replays WHERE execution_id = $1")).WithArgs("execution-full").WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(maximumDataGatewayReplays))
	mock.ExpectRollback()
	if _, err := store.ClaimDataGatewayMutation(t.Context(), key, hash, DataGatewayMutationReplayPolicy{Attempt: 1, MaximumAttempts: 1}); !errors.Is(err, ErrDataGatewayReplayCapacity) {
		t.Fatalf("expected replay capacity denial, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestRecordExecutionRejectsIdempotencyAuthorityDriftWithoutMutation(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	store := NewStore(database)
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO remote_execution_grants")).WithArgs("execution-1", "workspace-1", "principal-1", "session-2", "snapshot-2", []byte(`{"workspace":"8"}`), "environment-1", "revision-8", "live").WillReturnResult(sqlmock.NewResult(0, 0))
	err = store.RecordExecution(t.Context(), ExecutionAuthority{
		ExecutionID: "execution-1", WorkspaceID: "workspace-1", OwnerID: "principal-1", SessionID: "session-2",
		SnapshotID: "snapshot-2", PartitionRevisions: map[string]string{"workspace": "8"},
		Environment: &EnvironmentReference{EnvironmentID: "environment-1", Revision: "revision-8", Mode: "live"},
	})
	if !errors.Is(err, ErrExecutionAuthorityConflict) {
		t.Fatalf("expected authority conflict, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestVerifyExecutionOwnerPartitionsEnvironmentExecutionBySession(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	store := NewStore(database)
	query := regexp.QuoteMeta("SELECT 1 FROM remote_execution_grants WHERE execution_id = $1 AND owner_id = $2 AND (session_id IS NULL OR session_id = $3)")
	mock.ExpectQuery(query).WithArgs("execution-1", "principal-1", "session-1").WillReturnRows(sqlmock.NewRows([]string{"marker"}).AddRow(1))
	if err := store.VerifyExecutionOwner(t.Context(), "principal-1", "session-1", "execution-1"); err != nil {
		t.Fatalf("verify exact session: %v", err)
	}
	mock.ExpectQuery(query).WithArgs("execution-1", "principal-1", "session-2").WillReturnError(sql.ErrNoRows)
	if err := store.VerifyExecutionOwner(t.Context(), "principal-1", "session-2", "execution-1"); !errors.Is(err, ErrExecutionNotFound) {
		t.Fatalf("expected cross-session denial, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestGetExecutionAuthorityAndDataDocumentRequireExactSnapshotPartitions(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	store := NewStore(database)
	authorityQuery := regexp.QuoteMeta("SELECT execution_id, workspace_id, owner_id, session_id, snapshot_id, partition_revisions_json, environment_id, environment_revision, environment_mode")
	mock.ExpectQuery(authorityQuery).
		WithArgs("execution-1", "principal-1", "session-1").
		WillReturnRows(sqlmock.NewRows([]string{"execution_id", "workspace_id", "owner_id", "session_id", "snapshot_id", "partition_revisions_json", "environment_id", "environment_revision", "environment_mode"}).
			AddRow("execution-1", "workspace-1", "principal-1", "session-1", "snapshot-1", []byte(`{"workspace":"7","document:data-1:content":"3"}`), "environment-1", "revision-7", "live"))
	authority, err := store.GetExecutionAuthority(t.Context(), "principal-1", "session-1", "execution-1")
	if err != nil || authority.SnapshotID != "snapshot-1" || authority.PartitionRevisions["document:data-1:content"] != "3" || authority.Environment == nil || authority.Environment.Revision != "revision-7" {
		t.Fatalf("load exact authority: authority=%#v err=%v", authority, err)
	}
	documentQuery := regexp.QuoteMeta("SELECT content_json\nFROM workspace_documents\nWHERE workspace_id = $1 AND id = $2 AND doc_type = 'data-source' AND content_rev::text = $3")
	mock.ExpectQuery(documentQuery).WithArgs("workspace-1", "data-1", "3").WillReturnRows(sqlmock.NewRows([]string{"content_json"}).AddRow([]byte(`{"wireVersion":1}`)))
	contents, err := store.GetDataSourceDocument(t.Context(), *authority, "data-1")
	if err != nil || string(contents) != `{"wireVersion":1}` {
		t.Fatalf("load exact Data document: contents=%s err=%v", contents, err)
	}

	drifted := *authority
	drifted.PartitionRevisions = map[string]string{"workspace": "7"}
	if _, err := store.GetDataSourceDocument(t.Context(), drifted, "data-1"); !errors.Is(err, ErrExecutionAuthorityConflict) {
		t.Fatalf("expected missing document partition conflict, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
