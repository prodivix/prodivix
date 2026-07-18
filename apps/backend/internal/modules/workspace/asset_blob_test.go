package workspace

import (
	"context"
	"database/sql"
	"errors"
	"regexp"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

func TestWorkspaceAssetBlobStoreVerifiesAndDeduplicatesPerWorkspace(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	store := NewWorkspaceStore(db)
	contents := []byte{1, 2, 3}
	digest := computeWorkspaceAssetDigest(contents)

	mock.ExpectQuery("SELECT 1").WithArgs("workspace-1", "owner-1").WillReturnRows(
		sqlmock.NewRows([]string{"marker"}).AddRow(1),
	)
	mock.ExpectExec("INSERT INTO workspace_asset_blobs").
		WithArgs("workspace-1", digest, "image/png", int64(3), contents).
		WillReturnResult(sqlmock.NewResult(0, 1))
	stored, err := store.PutWorkspaceAssetBlob(
		context.Background(),
		"owner-1",
		"workspace-1",
		digest,
		"image/png",
		contents,
	)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Kind != "stored" || stored.Reference.Digest != digest {
		t.Fatalf("unexpected stored result: %#v", stored)
	}

	mock.ExpectQuery("SELECT 1").WithArgs("workspace-1", "owner-1").WillReturnRows(
		sqlmock.NewRows([]string{"marker"}).AddRow(1),
	)
	mock.ExpectExec("INSERT INTO workspace_asset_blobs").
		WithArgs("workspace-1", digest, "image/png", int64(3), contents).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("UPDATE workspace_asset_blobs").
		WithArgs("workspace-1", digest, "image/png", int64(3), contents).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT media_type, byte_length, contents
FROM workspace_asset_blobs
WHERE workspace_id = $1 AND digest = $2`)).
		WithArgs("workspace-1", digest).
		WillReturnRows(sqlmock.NewRows([]string{"media_type", "byte_length", "contents"}).AddRow("image/png", 3, contents))
	existing, err := store.PutWorkspaceAssetBlob(
		context.Background(),
		"owner-1",
		"workspace-1",
		digest,
		"image/png",
		contents,
	)
	if err != nil {
		t.Fatal(err)
	}
	if existing.Kind != "existing" {
		t.Fatalf("expected existing, got %#v", existing)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestWorkspaceAssetBlobStoreReadsOnlyAfterOwnerAuthorization(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	store := NewWorkspaceStore(db)
	contents := []byte{8, 9}
	digest := computeWorkspaceAssetDigest(contents)
	createdAt := time.Date(2026, 7, 18, 1, 0, 0, 0, time.UTC)

	mock.ExpectQuery("SELECT 1").WithArgs("workspace-1", "owner-1").WillReturnRows(
		sqlmock.NewRows([]string{"marker"}).AddRow(1),
	)
	mock.ExpectQuery("SELECT media_type, byte_length, contents, created_at").
		WithArgs("workspace-1", digest).
		WillReturnRows(sqlmock.NewRows([]string{"media_type", "byte_length", "contents", "created_at"}).AddRow("image/png", 2, contents, createdAt))
	blob, err := store.GetWorkspaceAssetBlobForOwner(
		context.Background(),
		"owner-1",
		"workspace-1",
		digest,
	)
	if err != nil {
		t.Fatal(err)
	}
	if blob.Reference.ByteLength != 2 || string(blob.Contents) != string(contents) {
		t.Fatalf("unexpected blob: %#v", blob)
	}

	mock.ExpectQuery("SELECT 1").WithArgs("workspace-1", "other-owner").WillReturnError(sql.ErrNoRows)
	if _, err := store.GetWorkspaceAssetBlobForOwner(
		context.Background(),
		"other-owner",
		"workspace-1",
		digest,
	); !errors.Is(err, ErrWorkspaceNotFound) {
		t.Fatalf("expected owner-scoped not found, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestWorkspaceAssetBlobStoreRejectsDigestAndMediaDriftBeforePersistence(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	store := NewWorkspaceStore(db)
	contents := []byte{1}
	for _, test := range []struct {
		digest    string
		mediaType string
	}{
		{digest: "sha256-" + regexp.QuoteMeta("0"), mediaType: "image/png"},
		{digest: computeWorkspaceAssetDigest(contents), mediaType: "Image/PNG; charset=utf-8"},
		{digest: computeWorkspaceAssetDigest(contents), mediaType: "application/vnd.example~json"},
	} {
		if _, err := store.PutWorkspaceAssetBlob(
			context.Background(),
			"owner-1",
			"workspace-1",
			test.digest,
			test.mediaType,
			contents,
		); err != ErrWorkspaceAssetBlobInvalid {
			t.Fatalf("expected invalid asset for %q, got %v", test.mediaType, err)
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
