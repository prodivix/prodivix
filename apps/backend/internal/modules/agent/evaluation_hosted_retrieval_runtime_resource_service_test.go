package agent

import (
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestHostedRetrievalRuntimeResourceStorageSummaryUsesTheCanonicalDatabaseOwner(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	owner, err := NewEvaluationHostedRetrievalRuntimeResource(EvaluationHostedRetrievalRuntimeResourceConfig{
		Repository: NewRepository(database),
	})
	if err != nil {
		t.Fatal(err)
	}
	checkedAt := time.Date(2026, 8, 12, 3, 4, 5, 0, time.UTC)
	mock.ExpectQuery(`agent_evaluation_hosted_runtime_resource_owner_storage_summary\(\$1,\$2\)`).
		WithArgs(evaluationServiceTestNamespace, checkedAt).
		WillReturnRows(sqlmock.NewRows([]string{
			"ledger_revision", "registration_count", "active_resource_count",
			"active_read_lease_count", "unfinished_cleanup_count", "overdue_count",
		}).AddRow(int64(17), int64(4), int64(2), int64(1), int64(1), int64(1)))
	summary, err := owner.loadStorageSummary(t.Context(), evaluationServiceTestNamespace, checkedAt)
	if err != nil {
		t.Fatal(err)
	}
	if summary.LedgerRevision != 17 || summary.RegistrationCount != 4 ||
		summary.ActiveResourceCount != 2 || summary.ActiveReadLeaseCount != 1 ||
		summary.UnfinishedCleanupCount != 1 || summary.OverdueCount != 1 {
		t.Fatalf("unexpected hosted owner storage summary: %#v", summary)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestHostedRetrievalRuntimeResourceStorageSummaryFailsClosed(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	owner, err := NewEvaluationHostedRetrievalRuntimeResource(EvaluationHostedRetrievalRuntimeResourceConfig{
		Repository: NewRepository(database),
	})
	if err != nil {
		t.Fatal(err)
	}
	checkedAt := time.Date(2026, 8, 12, 3, 4, 5, 0, time.UTC)
	databaseError := errors.New("hosted storage summary unavailable")
	mock.ExpectQuery(`agent_evaluation_hosted_runtime_resource_owner_storage_summary\(\$1,\$2\)`).
		WithArgs(evaluationServiceTestNamespace, checkedAt).
		WillReturnError(databaseError)
	if _, err := owner.loadStorageSummary(t.Context(), evaluationServiceTestNamespace, checkedAt); !errors.Is(err, databaseError) {
		t.Fatalf("storage summary error=%v, want database failure", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
