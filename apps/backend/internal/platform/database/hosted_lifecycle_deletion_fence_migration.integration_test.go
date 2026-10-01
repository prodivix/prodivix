package database

import (
	"context"
	"testing"
	"time"
)

func TestHostedLifecycleDeletionFencePostgreSQLGate(t *testing.T) {
	db := openAgentEvaluationMigrationPostgreSQLAtVersion(t, 48)
	ctx := context.Background()
	for _, table := range []string{"ae_hrrr_lifecycle_dispatch_claim_receipts", "ae_hrrr_lifecycle_transport_receipts", "ae_hrrr_lifecycle_dispatch_intents", "ae_hrrr_cleanup_claim_receipts", "ae_hrrr_cleanup_requests", "ae_hrrr_lifecycle_partial_cleanup_claim_history"} {
		if _, err := db.ExecContext(ctx, "DROP TABLE "+table+" CASCADE"); err != nil {
			t.Fatal(err)
		}
	}
	for _, statement := range []string{
		`CREATE TABLE ae_hrrr_cleanup_claim_receipts(namespace_id TEXT,authority_digest TEXT,receipt_digest TEXT,cleanup_request_digest TEXT)`,
		`CREATE TABLE ae_hrrr_cleanup_requests(namespace_id TEXT,authority_digest TEXT,request_digest TEXT,deletion_not_before TIMESTAMPTZ)`,
		`CREATE TABLE ae_hrrr_lifecycle_partial_cleanup_claim_history(namespace_id TEXT,partial_cleanup_authority_digest TEXT,claim_receipt_digest TEXT,claimed_at TIMESTAMPTZ)`,
		`CREATE TABLE ae_hrrr_lifecycle_dispatch_intents(namespace_id TEXT,intent_digest TEXT,operation TEXT,authority_digest TEXT,lifecycle_claim_receipt_digest TEXT,created_at TIMESTAMPTZ)`,
		`CREATE TABLE ae_hrrr_lifecycle_dispatch_claim_receipts(namespace_id TEXT,intent_digest TEXT,delivery_disposition TEXT,claimed_at TIMESTAMPTZ)`,
		`CREATE TABLE ae_hrrr_lifecycle_transport_receipts(namespace_id TEXT,intent_digest TEXT,started_at TIMESTAMPTZ)`,
		`INSERT INTO ae_hrrr_cleanup_claim_receipts VALUES ('namespace','authority','claim','request')`,
	} {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	if err := runMigrations(ctx, db, []migration{hostedLifecycleDeletionFenceMigration()}, time.Minute); err != nil {
		t.Fatal(err)
	}
	future := time.Now().UTC().Add(time.Hour)
	if _, err := db.ExecContext(ctx, `INSERT INTO ae_hrrr_cleanup_requests VALUES ('namespace','authority','request',$1)`, future); err != nil {
		t.Fatal(err)
	}
	intentInsert := `INSERT INTO ae_hrrr_lifecycle_dispatch_intents VALUES ('namespace','intent','delete','authority','claim',$1)`
	if _, err := db.ExecContext(ctx, intentInsert, future); err == nil {
		t.Fatal("future payload bypassed server wall clock fence")
	}
	fence := time.Now().UTC().Add(-time.Minute).Truncate(time.Millisecond)
	if _, err := db.ExecContext(ctx, `UPDATE ae_hrrr_cleanup_requests SET deletion_not_before=$1`, fence); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, intentInsert, fence.Add(-time.Millisecond)); err == nil {
		t.Fatal("intent created before read lease fence")
	}
	if _, err := db.ExecContext(ctx, intentInsert, fence); err != nil {
		t.Fatalf("equal-fence intent rejected: %v", err)
	}
	firstClaim := `INSERT INTO ae_hrrr_lifecycle_dispatch_claim_receipts VALUES ('namespace','intent','dispatch-authorized-first-delivery',$1)`
	if _, err := db.ExecContext(ctx, firstClaim, fence.Add(-time.Millisecond)); err == nil {
		t.Fatal("first delivery authorized before fence")
	}
	if _, err := db.ExecContext(ctx, firstClaim, fence); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO ae_hrrr_lifecycle_dispatch_claim_receipts VALUES ('namespace','intent','sealed-read-only',$1)`, fence.Add(-time.Millisecond)); err != nil {
		t.Fatalf("historical read-only claim rejected: %v", err)
	}
	transportInsert := `INSERT INTO ae_hrrr_lifecycle_transport_receipts VALUES ('namespace','intent',$1)`
	if _, err := db.ExecContext(ctx, transportInsert, fence.Add(-time.Millisecond)); err == nil {
		t.Fatal("transport started before fence")
	}
	if _, err := db.ExecContext(ctx, transportInsert, fence); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO ae_hrrr_lifecycle_partial_cleanup_claim_history VALUES ('namespace','partial-authority','partial-claim',$1)`, fence); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO ae_hrrr_lifecycle_dispatch_intents VALUES ('namespace','partial','delete','partial-authority','partial-claim',$1)`, fence); err != nil {
		t.Fatalf("partial cleanup claim time rejected: %v", err)
	}
}
