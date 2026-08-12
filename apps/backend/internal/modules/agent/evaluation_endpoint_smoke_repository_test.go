package agent

import (
	"bytes"
	"context"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func TestEvaluationEndpointSmokeActualDemandReconstructsExactUnknownFacts(t *testing.T) {
	startedAt := time.Date(2026, 8, 8, 1, 2, 3, 0, time.UTC)
	actual, err := evaluationEndpointSmokeActualDemand(evaluationEndpointSmokeEvidenceCommit{
		TerminalReceipts: []evaluationEndpointSmokeTerminalReceipt{{
			EvaluationEndpointSmokeTerminalReceiptRecord: EvaluationEndpointSmokeTerminalReceiptRecord{InvocationID: "endpoint-smoke.fixture"},
		}},
		TransportReceipts: []evaluationTransportReceipt{{
			EvaluationTransportReceiptRecord: EvaluationTransportReceiptRecord{
				InvocationID: "endpoint-smoke.fixture", DispatchState: "dispatched",
				StartedAt: startedAt, CompletedAt: startedAt.Add(1250 * time.Millisecond),
			},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	unknownAmounts := []any{
		map[string]any{"unit": "text-token-input", "confidence": "unknown"},
		map[string]any{"unit": "text-token-output", "confidence": "unknown"},
	}
	usageDigest, err := canonicaljson.Digest(unknownAmounts)
	if err != nil {
		t.Fatal(err)
	}
	expected, err := canonicaljson.Bytes(map[string]any{
		"usage":            map[string]any{"amounts": unknownAmounts, "vectorDigest": usageDigest},
		"cost":             []any{map[string]any{"currency": "USD", "confidence": "unknown"}},
		"modelInvocations": int64(1), "toolCalls": int64(0), "repairRounds": int64(0),
		"transactions": int64(0), "artifactBytes": int64(0), "elapsedMs": int64(1250),
	})
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(actual.Canonical, expected) {
		t.Fatalf("actual demand drifted\n got: %s\nwant: %s", actual.Canonical, expected)
	}
}

func TestEvaluationEndpointSmokeActualDemandMergesCanonicalUsageAndCosts(t *testing.T) {
	startedAt := time.Date(2026, 8, 8, 1, 2, 3, 0, time.UTC)
	sourceA := "sha256-1111111111111111111111111111111111111111111111111111111111111111"
	sourceB := "sha256-2222222222222222222222222222222222222222222222222222222222222222"
	usageFor := func(amount, confidence, source string) map[string]any {
		amounts := []any{map[string]any{
			"unit": "text-token-input", "logicalAmount": amount, "confidence": confidence, "sourceDigest": source,
		}}
		digest, err := canonicaljson.Digest(amounts)
		if err != nil {
			t.Fatal(err)
		}
		return map[string]any{"amounts": amounts, "vectorDigest": digest}
	}
	actual, err := evaluationEndpointSmokeActualDemand(evaluationEndpointSmokeEvidenceCommit{
		TerminalReceipts: []evaluationEndpointSmokeTerminalReceipt{
			{EvaluationEndpointSmokeTerminalReceiptRecord: EvaluationEndpointSmokeTerminalReceiptRecord{InvocationID: "endpoint-smoke.a"}, Usage: usageFor("1", "reported", sourceA), Cost: []any{map[string]any{"currency": "USD", "amount": "0.1", "confidence": "reported", "sourceDigest": sourceA}}},
			{EvaluationEndpointSmokeTerminalReceiptRecord: EvaluationEndpointSmokeTerminalReceiptRecord{InvocationID: "endpoint-smoke.b"}, Usage: usageFor("2", "measured", sourceB), Cost: []any{map[string]any{"currency": "USD", "amount": "0.2", "confidence": "estimated", "sourceDigest": sourceB}}},
		},
		TransportReceipts: []evaluationTransportReceipt{
			{EvaluationTransportReceiptRecord: EvaluationTransportReceiptRecord{InvocationID: "endpoint-smoke.a", DispatchState: "dispatched", StartedAt: startedAt, CompletedAt: startedAt.Add(time.Second)}},
			{EvaluationTransportReceiptRecord: EvaluationTransportReceiptRecord{InvocationID: "endpoint-smoke.b", DispatchState: "dispatched", StartedAt: startedAt, CompletedAt: startedAt.Add(2 * time.Second)}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	mergedSource, err := canonicaljson.Digest([]string{sourceA, sourceB})
	if err != nil {
		t.Fatal(err)
	}
	mergedAmounts := []any{map[string]any{
		"unit": "text-token-input", "logicalAmount": "3", "confidence": "measured", "sourceDigest": mergedSource,
	}}
	usageDigest, err := canonicaljson.Digest(mergedAmounts)
	if err != nil {
		t.Fatal(err)
	}
	expected, err := canonicaljson.Bytes(map[string]any{
		"usage":            map[string]any{"amounts": mergedAmounts, "vectorDigest": usageDigest},
		"cost":             []any{map[string]any{"currency": "USD", "amount": "0.3", "confidence": "estimated", "sourceDigest": mergedSource}},
		"modelInvocations": int64(2), "toolCalls": int64(0), "repairRounds": int64(0),
		"transactions": int64(0), "artifactBytes": int64(0), "elapsedMs": int64(3000),
	})
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(actual.Canonical, expected) {
		t.Fatalf("merged actual demand drifted\n got: %s\nwant: %s", actual.Canonical, expected)
	}
}

func TestEvaluationEndpointSmokePricingSourceReceiptIDMatchesFrozenContract(t *testing.T) {
	id, err := evaluationEndpointSmokePricingSourceReceiptID(
		"sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		map[string]any{
			"providerConfigurationId": "provider.fixture",
			"modelLineageDigest":      "sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			"pricingAuthorityDigest":  "sha256-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		},
		"sha256-dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
	)
	if err != nil {
		t.Fatal(err)
	}
	const expected = "evaluation-source.pricing.dbc3f4c2ec33786196da7cd79309b47671156fd6e7b2b5b711bc5925c17878e7"
	if id != expected {
		t.Fatalf("pricing source singleton id = %s, want %s", id, expected)
	}
}

func endpointSmokeValidationFailureFixture(t *testing.T, targetID, receiptID, findingDigest string) []byte {
	t.Helper()
	base := map[string]any{
		"format":                 evaluationEndpointSmokeValidationFailureFormat,
		"version":                int64(1),
		"receiptId":              receiptID,
		"planDigest":             "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"repositoryCommit":       "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		"smokeTargetId":          targetID,
		"smokeTargetDigest":      "sha256-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		"invocationId":           "endpoint-smoke-invocation.fixture",
		"dispatchIntentDigest":   "sha256-dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
		"transportReceiptDigest": "sha256-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		"spoolReceiptDigest":     "sha256-ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
		"validatorPolicyDigest":  evaluationEndpointSmokeValidatorPolicyDigest,
		"validationCategory":     "expected-output-mismatch",
		"findingDigest":          findingDigest,
		"observedAt":             "2026-08-08T01:02:03.004Z",
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	base["receiptDigest"] = digest
	encoded, err := canonicaljson.Bytes(base)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func TestQueryEvaluationEndpointSmokeValidationFailuresAndSetDigest(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	partition := EvaluationPlanPartition{
		PlanDigest:       "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		RepositoryCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	}
	first := endpointSmokeValidationFailureFixture(
		t,
		"smoke.release.a",
		"endpoint-smoke-validation-failure.a",
		"sha256-1111111111111111111111111111111111111111111111111111111111111111",
	)
	second := endpointSmokeValidationFailureFixture(
		t,
		"smoke.release.b",
		"endpoint-smoke-validation-failure.b",
		"sha256-2222222222222222222222222222222222222222222222222222222222222222",
	)
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT receipt_bytes
		FROM agent_evaluation_endpoint_smoke_validation_failure_receipts`)).
		WithArgs("namespace.fixture", partition.PlanDigest, partition.RepositoryCommit).
		WillReturnRows(sqlmock.NewRows([]string{"receipt_bytes"}).AddRow(first).AddRow(second))
	records, err := queryEvaluationEndpointSmokeValidationFailures(
		context.Background(), db, "namespace.fixture", partition,
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 2 || records[0].NamespaceID != "namespace.fixture" ||
		records[0].ValidationCategory != "expected-output-mismatch" {
		t.Fatalf("unexpected validation-failure records: %#v", records)
	}
	digest, err := evaluationEndpointSmokeValidationFailureSetDigest(records)
	if err != nil {
		t.Fatal(err)
	}
	reversed := []EvaluationEndpointSmokeValidationFailureRecord{records[1], records[0]}
	reversedDigest, err := evaluationEndpointSmokeValidationFailureSetDigest(reversed)
	if err != nil {
		t.Fatal(err)
	}
	if digest != reversedDigest {
		t.Fatal("validation-failure set digest must use canonical target/receipt identity order")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestInsertEvaluationEndpointSmokeSourceExactReplay(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	partition := EvaluationPlanPartition{
		PlanDigest:       "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		RepositoryCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	}
	source := evaluationSourceReceipt{EvaluationSourceReceiptRecord: EvaluationSourceReceiptRecord{
		PlanDigest: partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit,
		SourceReceiptID: "plan-pricing-source.fixture", SourceKind: "pricing-snapshot",
		ProviderConfigurationID: "provider.fixture",
		ModelLineageDigest:      "sha256-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		SourceContentDigest:     "sha256-dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
		ReceiptDigest:           "sha256-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		ReceiptBytes:            []byte(`{"fixture":"exact"}`),
		ObservedAt:              time.Date(2026, 8, 8, 1, 2, 3, 4_000_000, time.UTC),
	}}
	mock.ExpectBegin()
	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	mock.ExpectExec("INSERT INTO agent_evaluation_source_receipts").WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT receipt_bytes").
		WithArgs("namespace.fixture", partition.PlanDigest, source.SourceReceiptID, source.SourceContentDigest, source.ReceiptDigest).
		WillReturnRows(sqlmock.NewRows([]string{"receipt_bytes"}).AddRow(source.ReceiptBytes))
	mock.ExpectExec("INSERT INTO agent_evaluation_endpoint_smoke_source_receipt_refs").WillReturnResult(sqlmock.NewResult(1, 1))
	if err := insertEvaluationEndpointSmokeSource(context.Background(), tx, "namespace.fixture", partition, source); err != nil {
		t.Fatal(err)
	}
	mock.ExpectCommit()
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestInsertEvaluationEndpointSmokeSourceRejectsContentCollision(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	partition := EvaluationPlanPartition{
		PlanDigest:       "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		RepositoryCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	}
	source := evaluationSourceReceipt{EvaluationSourceReceiptRecord: EvaluationSourceReceiptRecord{
		PlanDigest: partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit,
		SourceReceiptID: "plan-pricing-source.fixture", SourceKind: "pricing-snapshot",
		ProviderConfigurationID: "provider.fixture",
		ModelLineageDigest:      "sha256-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		SourceContentDigest:     "sha256-dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
		ReceiptDigest:           "sha256-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		ReceiptBytes:            []byte(`{"fixture":"candidate"}`),
		ObservedAt:              time.Date(2026, 8, 8, 1, 2, 3, 4_000_000, time.UTC),
	}}
	mock.ExpectBegin()
	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	mock.ExpectExec("INSERT INTO agent_evaluation_source_receipts").WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT receipt_bytes").
		WithArgs("namespace.fixture", partition.PlanDigest, source.SourceReceiptID, source.SourceContentDigest, source.ReceiptDigest).
		WillReturnRows(sqlmock.NewRows([]string{"receipt_bytes"}).AddRow([]byte(`{"fixture":"stored"}`)))
	if err := insertEvaluationEndpointSmokeSource(context.Background(), tx, "namespace.fixture", partition, source); err == nil {
		t.Fatal("different bytes under the same global source identity/content must conflict")
	}
	mock.ExpectRollback()
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
