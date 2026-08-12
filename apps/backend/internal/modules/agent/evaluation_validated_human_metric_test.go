package agent

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func TestEvaluationValidatedHumanMetricSnapshotUsesCanonicalEmptyPreReviewRoot(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	partition := EvaluationPlanPartition{
		PlanDigest:       evaluationServiceTestDigest(t, "pre-review-human-metric-plan"),
		RepositoryCommit: "0123456789abcdef0123456789abcdef01234567",
	}
	mock.ExpectQuery("SELECT validated_human_review_artifact_digest, human_review_report_digest").
		WithArgs("evaluation.pre-review", partition.PlanDigest, partition.RepositoryCommit).
		WillReturnRows(sqlmock.NewRows([]string{
			"validated_human_review_artifact_digest", "human_review_report_digest",
		}))

	observations, digest, err := queryEvaluationValidatedHumanMetricObservationSnapshot(
		context.Background(), database, "evaluation.pre-review", partition,
	)
	if err != nil {
		t.Fatal(err)
	}
	want, err := canonicaljson.Digest(map[string]any{
		"validatedHumanMetricObservationDigests": []string{},
	})
	if err != nil {
		t.Fatal(err)
	}
	if observations == nil || len(observations) != 0 || digest != want {
		t.Fatalf("pre-review human metric root = observations %#v digest %q, want canonical empty root %q", observations, digest, want)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
