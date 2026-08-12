package verification

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestAgentEvaluationOwnerManifestReadRequiresCanonicalFullPreimage(t *testing.T) {
	manifest := agentEvaluationOwnerTestManifest(t)
	encoded, err := canonicalBytes(manifest)
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name    string
		stored  []byte
		wantErr bool
	}{
		{name: "canonical", stored: encoded},
		{name: "recommitted whitespace", stored: append(append([]byte(nil), encoded...), '\n'), wantErr: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			database, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()
			mock.ExpectQuery(`SELECT manifest_bytes`).
				WithArgs("workspace-vector", manifest.Evidence.ID).
				WillReturnRows(sqlmock.NewRows([]string{"manifest_bytes"}).AddRow(test.stored))
			loaded, err := NewRepository(database).GetEvidenceManifest(
				context.Background(), "workspace-vector", manifest.Evidence.ID,
			)
			if test.wantErr {
				if err == nil {
					t.Fatal("recommitted manifest bytes were accepted")
				}
			} else if err != nil || loaded.ManifestDigest != manifest.ManifestDigest {
				t.Fatalf("canonical manifest read failed: loaded=%#v err=%v", loaded, err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestAgentEvaluationOwnerExactViewRejectsUnsortedOrDuplicateIdentityBeforeSnapshot(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	repository := NewRepository(database)
	for _, ids := range [][]string{
		{"evidence-b", "evidence-a"},
		{"evidence-a", "evidence-a"},
		{},
	} {
		if _, err := repository.AgentEvaluationExactVerifiedView(
			context.Background(), "workspace-vector", ids, mustVectorTime(t, vectorNowText),
		); err == nil {
			t.Fatalf("invalid exact Evidence identity set was accepted: %v", ids)
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
