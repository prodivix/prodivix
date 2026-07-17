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
INNER JOIN github_repository_bindings b ON b.installation_id = i.installation_id
WHERE b.user_id = $1 AND b.status = 'active'
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
