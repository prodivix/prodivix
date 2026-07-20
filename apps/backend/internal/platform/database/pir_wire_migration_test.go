package database

import (
	"context"
	"regexp"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

func TestMigratePersistedPIRDocumentsUsesContentRevisionCAS(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	legacy := `{"version":"1.4","ui":{"graph":{"version":1,"rootId":"root","nodesById":{"root":{"id":"root","kind":"element","type":"container"}},"childIdsById":{"root":[]}}}}`
	current := `{"version":"1.6","ui":{"graph":{"version":1,"rootId":"root","nodesById":{"root":{"id":"root","kind":"element","type":"container"}},"childIdsById":{"root":[]}}}}`

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(lockPersistedPIRDocuments)).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery(regexp.QuoteMeta(selectPersistedPIRDocuments)).
		WithArgs(true, "", "", pirWireMigrationBatchSize).
		WillReturnRows(
			sqlmock.NewRows([]string{"workspace_id", "id", "content_rev", "content_json"}).
				AddRow("workspace-1", "current", int64(4), []byte(current)).
				AddRow("workspace-1", "legacy", int64(7), []byte(legacy)),
		)
	mock.ExpectExec(regexp.QuoteMeta(updatePersistedPIRDocument)).
		WithArgs(sqlmock.AnyArg(), "workspace-1", "legacy", int64(7), legacy).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(regexp.QuoteMeta(selectPersistedPIRDocuments)).
		WithArgs(false, "workspace-1", "legacy", pirWireMigrationBatchSize).
		WillReturnRows(sqlmock.NewRows([]string{"workspace_id", "id", "content_rev", "content_json"}))
	mock.ExpectExec(regexp.QuoteMeta(enforcePIRWireV16)).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(regexp.QuoteMeta(validatePIRWireV16)).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectCommit()

	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := migratePersistedPIRDocuments(context.Background(), tx); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestMigratePersistedPIRDocumentsFailsClosedOnUnknownVersion(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(lockPersistedPIRDocuments)).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery(regexp.QuoteMeta(selectPersistedPIRDocuments)).
		WithArgs(true, "", "", pirWireMigrationBatchSize).
		WillReturnRows(
			sqlmock.NewRows([]string{"workspace_id", "id", "content_rev", "content_json"}).
				AddRow("workspace-1", "unsupported", int64(3), []byte(`{"version":"1.2","ui":{}}`)),
		)
	mock.ExpectRollback()

	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := migratePersistedPIRDocuments(context.Background(), tx); err == nil {
		t.Fatal("expected unsupported persisted wire to fail migration")
	}
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
