package database

import (
	"context"
	"regexp"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

func TestMigratePersistedNodeGraphDocumentsUsesContentRevisionCAS(
	t *testing.T,
) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	legacy := `{"version":1,"nodes":[{"id":"start","data":{"kind":"start"}},{"id":"end","data":{"kind":"end"}}],"edges":[{"id":"edge","source":"start","target":"end"}]}`
	current := `{"version":2,"nodes":[],"edges":[]}`

	mock.ExpectBegin()
	mock.ExpectExec(
		regexp.QuoteMeta(lockPersistedNodeGraphDocuments),
	).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery(regexp.QuoteMeta(selectPersistedNodeGraphDocuments)).
		WithArgs(true, "", "", nodeGraphWireMigrationBatchSize).
		WillReturnRows(
			sqlmock.NewRows(
				[]string{"workspace_id", "id", "content_rev", "content_json"},
			).
				AddRow("workspace-1", "current", int64(4), []byte(current)).
				AddRow("workspace-1", "legacy", int64(7), []byte(legacy)),
		)
	mock.ExpectExec(regexp.QuoteMeta(updatePersistedNodeGraphDocument)).
		WithArgs(sqlmock.AnyArg(), "workspace-1", "legacy", int64(7), legacy).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(regexp.QuoteMeta(selectPersistedNodeGraphDocuments)).
		WithArgs(
			false,
			"workspace-1",
			"legacy",
			nodeGraphWireMigrationBatchSize,
		).
		WillReturnRows(
			sqlmock.NewRows(
				[]string{"workspace_id", "id", "content_rev", "content_json"},
			),
		)
	mock.ExpectExec(
		regexp.QuoteMeta(enforceNodeGraphWireV2),
	).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(
		regexp.QuoteMeta(validateNodeGraphWireV2),
	).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectCommit()

	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := migratePersistedNodeGraphDocuments(
		context.Background(),
		tx,
	); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestMigratePersistedNodeGraphDocumentsFailsClosed(
	t *testing.T,
) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	mock.ExpectBegin()
	mock.ExpectExec(
		regexp.QuoteMeta(lockPersistedNodeGraphDocuments),
	).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery(regexp.QuoteMeta(selectPersistedNodeGraphDocuments)).
		WithArgs(true, "", "", nodeGraphWireMigrationBatchSize).
		WillReturnRows(
			sqlmock.NewRows(
				[]string{"workspace_id", "id", "content_rev", "content_json"},
			).AddRow(
				"workspace-1",
				"unsupported",
				int64(3),
				[]byte(`{"version":3,"nodes":[],"edges":[]}`),
			),
		)
	mock.ExpectRollback()

	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := migratePersistedNodeGraphDocuments(
		context.Background(),
		tx,
	); err == nil {
		t.Fatal("expected unsupported persisted wire to fail migration")
	}
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
