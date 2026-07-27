package database

import (
	"context"
	"regexp"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

func TestMigratePersistedAnimationDocumentsUsesContentRevisionCAS(
	t *testing.T,
) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	legacy := `{"version":1,"target":{"kind":"pir-document","documentId":"page"},"timelines":[]}`
	current := `{"version":2,"target":{"kind":"pir-document","documentId":"page"},"timelines":[],"compositions":[]}`

	mock.ExpectBegin()
	mock.ExpectExec(
		regexp.QuoteMeta(lockPersistedAnimationDocuments),
	).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery(regexp.QuoteMeta(selectPersistedAnimationDocuments)).
		WithArgs(true, "", "", animationWireMigrationBatchSize).
		WillReturnRows(
			sqlmock.NewRows(
				[]string{"workspace_id", "id", "content_rev", "content_json"},
			).
				AddRow("workspace-1", "current", int64(4), []byte(current)).
				AddRow("workspace-1", "legacy", int64(7), []byte(legacy)),
		)
	mock.ExpectExec(regexp.QuoteMeta(updatePersistedAnimationDocument)).
		WithArgs(sqlmock.AnyArg(), "workspace-1", "legacy", int64(7), legacy).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(regexp.QuoteMeta(selectPersistedAnimationDocuments)).
		WithArgs(
			false,
			"workspace-1",
			"legacy",
			animationWireMigrationBatchSize,
		).
		WillReturnRows(
			sqlmock.NewRows(
				[]string{"workspace_id", "id", "content_rev", "content_json"},
			),
		)
	mock.ExpectExec(
		regexp.QuoteMeta(enforceAnimationWireV2),
	).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(
		regexp.QuoteMeta(validateAnimationWireV2),
	).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectCommit()

	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := migratePersistedAnimationDocuments(
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

func TestMigratePersistedAnimationDocumentsFailsClosed(
	t *testing.T,
) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	mock.ExpectBegin()
	mock.ExpectExec(
		regexp.QuoteMeta(lockPersistedAnimationDocuments),
	).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery(regexp.QuoteMeta(selectPersistedAnimationDocuments)).
		WithArgs(true, "", "", animationWireMigrationBatchSize).
		WillReturnRows(
			sqlmock.NewRows(
				[]string{"workspace_id", "id", "content_rev", "content_json"},
			).AddRow(
				"workspace-1",
				"unsupported",
				int64(3),
				[]byte(`{"version":3,"target":{"kind":"pir-document","documentId":"page"},"timelines":[]}`),
			),
		)
	mock.ExpectRollback()

	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := migratePersistedAnimationDocuments(
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
