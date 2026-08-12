package agent

import (
	"bytes"
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func TestLoadEvaluationCapabilityProbeReferenceBundleRequiresAndReturnsExactPreexistingRawRows(t *testing.T) {
	request, _, ownerImplementationDigest, result, referenceBundle, _ := evaluationCapabilityProbeTestFixture(
		t, "evaluation.probe-reference-positive",
	)
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	authority := EvaluationAuthority{
		Kind: "service", PrincipalID: "probe.reference.test", NamespaceID: request.NamespaceID,
	}
	stageDigest, err := evaluationCapabilityProbeStageDigest(request, ownerImplementationDigest)
	if err != nil {
		t.Fatal(err)
	}
	referenceValues, err := decodeEvaluationCapabilityProbeReferenceValues(referenceBundle)
	if err != nil {
		t.Fatal(err)
	}
	rows := sqlmock.NewRows([]string{"ordinal", "kind", "receipt_digest", "receipt_bytes"})
	for ordinal, rawEntry := range referenceValues {
		entry := rawEntry.(map[string]any)
		receiptBytes, err := canonicaljson.Bytes(entry["receipt"])
		if err != nil {
			t.Fatal(err)
		}
		rows.AddRow(ordinal, stringMember(entry, "kind"), stringMember(entry, "receiptDigest"), receiptBytes)
	}
	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT state,owner_implementation_digest,stage_digest,dispatch_ack_digest`).
		WithArgs(authority.NamespaceID, request.RepositoryCommit, request.RequestDigest).
		WillReturnRows(sqlmock.NewRows([]string{
			"state", "owner_implementation_digest", "stage_digest", "dispatch_ack_digest",
		}).AddRow("dispatched", ownerImplementationDigest, stageDigest, nil))
	mock.ExpectQuery(`SELECT ordinal,kind,receipt_digest,receipt_bytes`).
		WithArgs(authority.NamespaceID, request.RepositoryCommit, request.RequestDigest).
		WillReturnRows(rows)
	mock.ExpectCommit()

	actual, err := NewRepository(database).LoadEvaluationCapabilityProbeReferenceBundle(
		context.Background(), authority, request, ownerImplementationDigest, result.ProbeEvidence,
	)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(actual, referenceBundle) {
		t.Fatal("repository returned a different raw reference bundle")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestLoadEvaluationCapabilityProbeReferenceBundleRejectsFullyRecomputedEvidenceWithoutPreexistingRawRows(t *testing.T) {
	request, _, ownerImplementationDigest, result, _, _ := evaluationCapabilityProbeTestFixture(
		t, "evaluation.probe-reference-existence",
	)
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	authority := EvaluationAuthority{
		Kind: "service", PrincipalID: "probe.reference.test", NamespaceID: request.NamespaceID,
	}
	stageDigest, err := evaluationCapabilityProbeStageDigest(request, ownerImplementationDigest)
	if err != nil {
		t.Fatal(err)
	}
	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT state,owner_implementation_digest,stage_digest,dispatch_ack_digest`).
		WithArgs(authority.NamespaceID, request.RepositoryCommit, request.RequestDigest).
		WillReturnRows(sqlmock.NewRows([]string{
			"state", "owner_implementation_digest", "stage_digest", "dispatch_ack_digest",
		}).AddRow("dispatched", ownerImplementationDigest, stageDigest, nil))
	mock.ExpectQuery(`SELECT ordinal,kind,receipt_digest,receipt_bytes`).
		WithArgs(authority.NamespaceID, request.RepositoryCommit, request.RequestDigest).
		WillReturnRows(sqlmock.NewRows([]string{"ordinal", "kind", "receipt_digest", "receipt_bytes"}))
	mock.ExpectRollback()

	_, err = NewRepository(database).LoadEvaluationCapabilityProbeReferenceBundle(
		context.Background(), authority, request, ownerImplementationDigest, result.ProbeEvidence,
	)
	if err == nil {
		t.Fatal("fully recomputed supported evidence without independently persisted raw references was accepted")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
