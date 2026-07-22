package github

import (
	"context"
	"regexp"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

func TestRecordWebhookEventRetriesOnlyUnprocessedDeliveries(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	query := regexp.QuoteMeta(`INSERT INTO github_events (
	delivery_id, event_type, installation_id, action, payload_json, processed, created_at
) VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())
ON CONFLICT (delivery_id) DO UPDATE SET delivery_id = EXCLUDED.delivery_id
RETURNING processed`)
	record := WebhookEventRecord{DeliveryID: "delivery-1", EventType: "installation", Payload: []byte(`{}`)}

	mock.ExpectQuery(query).
		WithArgs("delivery-1", "installation", nil, "", `{}`, false).
		WillReturnRows(sqlmock.NewRows([]string{"processed"}).AddRow(false))
	retry, err := NewStore(db).RecordWebhookEvent(context.Background(), record)
	if err != nil || !retry {
		t.Fatalf("expected unprocessed delivery to retry: retry=%v err=%v", retry, err)
	}

	mock.ExpectQuery(query).
		WithArgs("delivery-1", "installation", nil, "", `{}`, false).
		WillReturnRows(sqlmock.NewRows([]string{"processed"}).AddRow(true))
	retry, err = NewStore(db).RecordWebhookEvent(context.Background(), record)
	if err != nil || retry {
		t.Fatalf("expected processed delivery to remain idempotent: retry=%v err=%v", retry, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestListInstallationsIsScopedToUserBindings(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	query := regexp.QuoteMeta(`SELECT DISTINCT i.installation_id, i.account_login, i.account_type, i.account_id, i.status, i.raw_json, i.created_at, i.updated_at
FROM github_installations i
INNER JOIN github_installation_user_access a ON a.installation_id = i.installation_id
WHERE a.user_id = $1 AND a.status = 'active' AND i.status = 'active'
ORDER BY i.updated_at DESC`)
	mock.ExpectQuery(query).WithArgs("usr_1").WillReturnRows(sqlmock.NewRows([]string{
		"installation_id", "account_login", "account_type", "account_id", "status", "raw_json", "created_at", "updated_at",
	}))
	if _, err := NewStore(db).ListInstallationsForUser(context.Background(), "usr_1"); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestUserHasInstallationAccessUsesExplicitInstallationGrant(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	query := regexp.QuoteMeta(`SELECT EXISTS (
		SELECT 1
		FROM github_installation_user_access a
		INNER JOIN github_installations i ON i.installation_id = a.installation_id
		WHERE a.user_id = $1 AND a.installation_id = $2 AND a.status = 'active' AND i.status = 'active'
	)`)
	mock.ExpectQuery(query).WithArgs("usr_1", int64(42)).WillReturnRows(
		sqlmock.NewRows([]string{"exists"}).AddRow(true),
	)
	allowed, err := NewStore(db).UserHasInstallationAccess(context.Background(), "usr_1", 42)
	if err != nil || !allowed {
		t.Fatalf("expected explicit installation access: allowed=%v err=%v", allowed, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestRemoveInstallationRepositoriesRevokesMatchingBindings(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	query := regexp.QuoteMeta(`WITH removed AS (
	DELETE FROM github_installation_repositories
	WHERE installation_id = $1 AND repository_id = $2
	RETURNING owner, name
)
UPDATE github_repository_bindings AS binding
SET status = 'revoked', updated_at = NOW()
FROM removed
WHERE binding.installation_id = $1
  AND binding.status = 'active'
  AND LOWER(binding.owner) = LOWER(removed.owner)
  AND LOWER(binding.repo) = LOWER(removed.name)`)
	mock.ExpectBegin()
	mock.ExpectExec(query).WithArgs(int64(42), int64(1001)).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	err = NewStore(db).RemoveInstallationRepositories(context.Background(), 42, []InstallationRepositoryRecord{{RepositoryID: 1001}})
	if err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestConsumeInstallationSetupStateCreatesFirstInstallationGrant(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	tokenHash := installationSetupTokenHash("setup-state")
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT user_id
		FROM github_installation_setup_states
		WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > NOW()
		FOR UPDATE`)).WithArgs(tokenHash).WillReturnRows(
		sqlmock.NewRows([]string{"user_id"}).AddRow("usr_1"),
	)
	mock.ExpectExec(regexp.QuoteMeta(`INSERT INTO github_installation_user_access (
		user_id, installation_id, status, created_at, updated_at
	)
	SELECT $1, installation_id, 'active', NOW(), NOW()
	FROM github_installations
	WHERE installation_id = $2 AND status = 'active'
	ON CONFLICT (user_id, installation_id) DO UPDATE
	SET status = 'active', updated_at = NOW()`)).WithArgs("usr_1", int64(42)).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE github_installation_setup_states
		SET consumed_at = NOW()
		WHERE token_hash = $1`)).WithArgs(tokenHash).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	userID, err := NewStore(db).ConsumeInstallationSetupState(context.Background(), "setup-state", 42)
	if err != nil || userID != "usr_1" {
		t.Fatalf("expected first installation grant: userID=%q err=%v", userID, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
