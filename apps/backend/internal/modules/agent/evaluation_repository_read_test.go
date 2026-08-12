package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const evaluationReadNamespace = "evaluation.g4-read-test"

func evaluationReadPartition(t *testing.T, vector evaluationRepositoryVector) (EvaluationPlanPartition, evaluationPlanFact) {
	t.Helper()
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	return EvaluationPlanPartition{
		PlanDigest: plan.PlanDigest, RepositoryCommit: plan.RepositoryCommit,
	}, plan
}

func expectEvaluationPlanRead(
	t *testing.T,
	mock sqlmock.Sqlmock,
	partition EvaluationPlanPartition,
	plan evaluationPlanFact,
) {
	t.Helper()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT evaluation_plan_id, plan_digest, repository_commit,")).
		WithArgs(evaluationReadNamespace, partition.PlanDigest, partition.RepositoryCommit).
		WillReturnRows(sqlmock.NewRows([]string{
			"evaluation_plan_id", "plan_digest", "repository_commit", "planned_journey_count",
			"plan_bytes", "planned_at", "expires_at",
		}).AddRow(plan.PlanID, plan.PlanDigest, plan.RepositoryCommit, plan.PlannedJourneyCount,
			plan.Canonical, plan.PlannedAt, plan.ExpiresAt))
}

func expectEvaluationPlanWrite(
	t *testing.T,
	mock sqlmock.Sqlmock,
	partition EvaluationPlanPartition,
	plan evaluationPlanFact,
) {
	t.Helper()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT evaluation_plan_id, plan_digest, repository_commit,")).
		WithArgs(evaluationReadNamespace, partition.PlanDigest, partition.RepositoryCommit).
		WillReturnRows(sqlmock.NewRows([]string{
			"evaluation_plan_id", "plan_digest", "repository_commit", "planned_journey_count",
			"plan_bytes", "planned_at", "expires_at",
		}).AddRow(plan.PlanID, plan.PlanDigest, plan.RepositoryCommit, plan.PlannedJourneyCount,
			plan.Canonical, plan.PlannedAt, plan.ExpiresAt))
}

func evaluationAttemptWithRepetition(t *testing.T, source json.RawMessage, repetition int64) evaluationAttemptFact {
	t.Helper()
	var envelope map[string]any
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	if err := decoder.Decode(&envelope); err != nil {
		t.Fatal(err)
	}
	value := envelope["value"].(map[string]any)
	descriptor := value["descriptor"].(map[string]any)
	descriptor["repetitionIndex"] = repetition
	samplingBase := map[string]any{
		"planDigest": descriptor["planDigest"], "caseId": descriptor["caseId"],
		"capabilityDescriptorDigest": descriptor["capabilityDescriptorDigest"],
		"targetId":                   descriptor["targetId"], "targetDigest": descriptor["targetDigest"],
		"riskClass": descriptor["riskClass"], "repetitionIndex": descriptor["repetitionIndex"],
	}
	if contextTier, exists := descriptor["contextTier"]; exists {
		samplingBase["contextTier"] = contextTier
	}
	if mediaTier, exists := descriptor["mediaRepresentationTier"]; exists {
		samplingBase["mediaRepresentationTier"] = mediaTier
	}
	samplingDigest, err := canonicaljson.Digest(samplingBase)
	if err != nil {
		t.Fatal(err)
	}
	descriptor["samplingIdentityDigest"] = samplingDigest
	descriptor["attemptId"] = "evaluation-attempt:" + samplingDigest[len("sha256-"):]
	descriptorBase := make(map[string]any, len(descriptor)-1)
	for key, entry := range descriptor {
		if key != "descriptorDigest" {
			descriptorBase[key] = entry
		}
	}
	descriptor["descriptorDigest"], err = canonicaljson.Digest(descriptorBase)
	if err != nil {
		t.Fatal(err)
	}
	value["independentRunId"] = "run." + samplingDigest[len("sha256-"):]
	attemptBase := make(map[string]any, len(value)-1)
	for key, entry := range value {
		if key != "attemptDigest" {
			attemptBase[key] = entry
		}
	}
	value["attemptDigest"], err = canonicaljson.Digest(attemptBase)
	if err != nil {
		t.Fatal(err)
	}
	canonical, err := canonicaljson.Bytes(envelope)
	if err != nil {
		t.Fatal(err)
	}
	attempt, err := decodeEvaluationAttempt(canonical)
	if err != nil {
		t.Fatal(err)
	}
	return attempt
}

func addEvaluationAttemptRow(rows *sqlmock.Rows, attempt evaluationAttemptFact) *sqlmock.Rows {
	return rows.AddRow(
		attempt.AttemptID, attempt.DescriptorDigest, attempt.SamplingIdentityDigest,
		attempt.IndependentRunID, attempt.ShardID, attempt.CaseID, attempt.TargetID,
		attempt.Status, attempt.Outcome, attempt.AttemptDigest, attempt.Canonical,
		attempt.StartedAt, attempt.CompletedAt,
	)
}

func TestListEvaluationAttemptsUsesExactPartitionAndCanonicalOrder(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	vector := readEvaluationRepositoryVector(t)
	partition, plan := evaluationReadPartition(t, vector)
	first, err := decodeEvaluationAttempt(vector.Facts.Attempt)
	if err != nil {
		t.Fatal(err)
	}
	second := evaluationAttemptWithRepetition(t, vector.Facts.Attempt, 1)
	rows := sqlmock.NewRows([]string{
		"attempt_id", "descriptor_digest", "sampling_identity_digest", "independent_run_id",
		"shard_id", "case_id", "target_id", "status", "outcome", "attempt_digest",
		"attempt_bytes", "started_at", "completed_at",
	})
	if first.DescriptorDigest < second.DescriptorDigest {
		addEvaluationAttemptRow(addEvaluationAttemptRow(rows, second), first)
	} else {
		addEvaluationAttemptRow(addEvaluationAttemptRow(rows, first), second)
	}
	mock.ExpectBegin()
	expectEvaluationPlanRead(t, mock, partition, plan)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT attempt_id, descriptor_digest, sampling_identity_digest,")).
		WithArgs(evaluationReadNamespace, partition.PlanDigest, partition.RepositoryCommit).
		WillReturnRows(rows)
	mock.ExpectCommit()
	records, err := NewRepository(database).ListEvaluationAttempts(context.Background(), EvaluationAuthority{
		Kind: "service", PrincipalID: "evaluation.runner", NamespaceID: evaluationReadNamespace,
	}, partition)
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 2 || records[0].DescriptorDigest > records[1].DescriptorDigest {
		t.Fatalf("attempts are not in canonical descriptor order: %#v", records)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestGetEvaluationAttemptFailsClosedOnDuplicateDescriptor(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	vector := readEvaluationRepositoryVector(t)
	partition, plan := evaluationReadPartition(t, vector)
	attempt, err := decodeEvaluationAttempt(vector.Facts.Attempt)
	if err != nil {
		t.Fatal(err)
	}
	rows := sqlmock.NewRows([]string{
		"attempt_id", "descriptor_digest", "sampling_identity_digest", "independent_run_id",
		"shard_id", "case_id", "target_id", "status", "outcome", "attempt_digest",
		"attempt_bytes", "started_at", "completed_at",
	})
	addEvaluationAttemptRow(addEvaluationAttemptRow(rows, attempt), attempt)
	mock.ExpectBegin()
	expectEvaluationPlanRead(t, mock, partition, plan)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT attempt_id, descriptor_digest, sampling_identity_digest,")).
		WithArgs(evaluationReadNamespace, partition.PlanDigest, partition.RepositoryCommit, attempt.DescriptorDigest).
		WillReturnRows(rows)
	mock.ExpectRollback()
	_, err = NewRepository(database).GetEvaluationAttempt(context.Background(), EvaluationAuthority{
		Kind: "service", PrincipalID: "evaluation.runner", NamespaceID: evaluationReadNamespace,
	}, partition, EvaluationAttemptSelector{DescriptorDigest: attempt.DescriptorDigest})
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("duplicate descriptor error = %v, want ErrConflict", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestExportEvaluationSnapshotRequiresDeclaredArtifacts(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	vector := readEvaluationRepositoryVector(t)
	partition, plan := evaluationReadPartition(t, vector)
	mock.ExpectBegin()
	expectEvaluationPlanRead(t, mock, partition, plan)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT attempt_id, descriptor_digest, sampling_identity_digest,")).
		WithArgs(evaluationReadNamespace, partition.PlanDigest, partition.RepositoryCommit).
		WillReturnRows(sqlmock.NewRows([]string{
			"attempt_id", "descriptor_digest", "sampling_identity_digest", "independent_run_id",
			"shard_id", "case_id", "target_id", "status", "outcome", "attempt_digest",
			"attempt_bytes", "started_at", "completed_at",
		}))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT shard_id, revision, lease_owner_id, lease_generation,")).
		WithArgs(evaluationReadNamespace, partition.PlanDigest, partition.RepositoryCommit).
		WillReturnRows(sqlmock.NewRows([]string{
			"shard_id", "revision", "lease_owner_id", "lease_generation", "state",
			"checkpoint_digest", "checkpoint_bytes", "updated_at",
		}))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT revision, updated_at")).
		WithArgs(evaluationReadNamespace, partition.PlanDigest, partition.RepositoryCommit).
		WillReturnRows(sqlmock.NewRows([]string{"revision", "updated_at"}).AddRow(int64(0), plan.PlannedAt))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT reservation_id, ledger_revision, demand_digest, demand_bytes, reserved_at")).
		WithArgs(evaluationReadNamespace, partition.PlanDigest).
		WillReturnRows(sqlmock.NewRows([]string{
			"reservation_id", "ledger_revision", "demand_digest", "demand_bytes", "reserved_at",
		}))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT reservation_id, ledger_revision, settlement_digest, settlement_bytes, settled_at")).
		WithArgs(evaluationReadNamespace, partition.PlanDigest).
		WillReturnRows(sqlmock.NewRows([]string{
			"reservation_id", "ledger_revision", "settlement_digest", "settlement_bytes", "settled_at",
		}))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT fact_type, fact_id, fact_digest, outcome, fact_bytes, recorded_at")).
		WithArgs(evaluationReadNamespace, partition.PlanDigest, partition.RepositoryCommit).
		WillReturnRows(sqlmock.NewRows([]string{
			"fact_type", "fact_id", "fact_digest", "outcome", "fact_bytes", "recorded_at",
		}))
	mock.ExpectRollback()
	_, err = NewRepository(database).ExportEvaluationSnapshot(context.Background(), EvaluationAuthority{
		Kind: "service", PrincipalID: "evaluation.runner", NamespaceID: evaluationReadNamespace,
	}, partition, EvaluationSnapshotRequirements{
		RequiredArtifactTypes: []string{"evaluation-manifest"},
	})
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("missing required artifact error = %v, want ErrConflict", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestStoreEvaluationSourceReceiptUsesExactImmutablePartition(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	vector := readEvaluationRepositoryVector(t)
	partition, plan := evaluationReadPartition(t, vector)
	fixtures := evaluationAuthenticityFixturesForPlan(t, plan, vector.Facts.Attempt)
	source, err := decodeEvaluationSourceReceipt(fixtures.EndpointSources[0])
	if err != nil {
		t.Fatal(err)
	}
	mock.ExpectBegin()
	expectEvaluationPlanWrite(t, mock, partition, plan)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT EXISTS (")).
		WithArgs(evaluationReadNamespace, partition.PlanDigest).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT repository_commit")).
		WithArgs(evaluationReadNamespace, partition.PlanDigest, source.ProviderConfigurationID, source.ProviderRequestID).
		WillReturnRows(sqlmock.NewRows([]string{"repository_commit"}))
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO agent_evaluation_source_receipts (")).
		WithArgs(
			evaluationReadNamespace, partition.PlanDigest, partition.RepositoryCommit,
			source.SourceReceiptID, source.SourceKind, source.ProviderConfigurationID,
			nil, source.ProviderRequestID, nil, nil, source.SourceContentDigest, source.ReceiptDigest,
			string(source.ReceiptBytes), source.ReceiptBytes, source.ObservedAt,
		).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()
	record, replayed, err := NewRepository(database).StoreEvaluationSourceReceipt(context.Background(), EvaluationAuthority{
		Kind: "service", PrincipalID: "evaluation.runner", NamespaceID: evaluationReadNamespace,
	}, partition, fixtures.EndpointSources[0])
	if err != nil || replayed || record.ReceiptDigest != source.ReceiptDigest || record.RepositoryCommit != partition.RepositoryCommit {
		t.Fatalf("store source receipt = %#v replay=%v err=%v", record, replayed, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestStoreEvaluationInvocationReceiptStagesBeforeAttempt(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	vector := readEvaluationRepositoryVector(t)
	partition, plan := evaluationReadPartition(t, vector)
	fixtures := evaluationAuthenticityFixturesForPlan(t, plan, vector.Facts.Attempt)
	receipt, err := decodeEvaluationInvocationReceipt(fixtures.Invocation)
	if err != nil {
		t.Fatal(err)
	}
	targetID, _, err := resolveEvaluationInvocationPlanBinding(plan, receipt)
	if err != nil {
		t.Fatal(err)
	}
	mock.ExpectBegin()
	expectEvaluationPlanWrite(t, mock, partition, plan)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT EXISTS (")).
		WithArgs(evaluationReadNamespace, partition.PlanDigest).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT attempt_bytes")).
		WithArgs(evaluationReadNamespace, partition.PlanDigest, receipt.AttemptID, partition.RepositoryCommit).
		WillReturnRows(sqlmock.NewRows([]string{"attempt_bytes"}))
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO agent_evaluation_provider_requests (")).
		WithArgs(
			evaluationReadNamespace, partition.PlanDigest, partition.RepositoryCommit,
			receipt.ProviderConfigurationID, receipt.ProviderRequestID, "invocation", receipt.AttemptID,
			receipt.CompletedAt,
		).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO agent_evaluation_invocation_receipts (")).
		WithArgs(
			evaluationReadNamespace, partition.PlanDigest, partition.RepositoryCommit,
			receipt.AttemptID, receipt.DescriptorDigest, targetID, receipt.ProviderConfigurationID,
			receipt.ModelLineageDigest, receipt.ProviderRequestID, nil, receipt.TransportReceiptDigest,
			receipt.ResolvedModelID, nullableEvaluationAuthenticityString(receipt.ResolvedModelVersion),
			receipt.ResolvedModelIdentityDigest, receipt.InvocationOutcome,
			receipt.InvocationReceiptDigest, receipt.ResponseArtifactDigest, receipt.EvidenceDigest,
			string(receipt.EvidenceBytes), receipt.EvidenceBytes, receipt.StartedAt, receipt.CompletedAt,
		).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()
	record, replayed, err := NewRepository(database).StoreEvaluationInvocationReceipt(
		context.Background(),
		EvaluationAuthority{Kind: "service", PrincipalID: "evaluation.runner", NamespaceID: evaluationReadNamespace},
		partition,
		fixtures.Invocation,
	)
	if err != nil || replayed || record.TargetID != targetID || record.AttemptID != receipt.AttemptID {
		t.Fatalf("stage invocation receipt = %#v replay=%v err=%v", record, replayed, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestListEvaluationSourceReceiptsUsesCanonicalIdentityOrder(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	vector := readEvaluationRepositoryVector(t)
	partition, plan := evaluationReadPartition(t, vector)
	fixtures := evaluationAuthenticityFixturesForPlan(t, plan, vector.Facts.Attempt)
	first, err := decodeEvaluationSourceReceipt(fixtures.EndpointSources[0])
	if err != nil {
		t.Fatal(err)
	}
	second, err := decodeEvaluationSourceReceipt(fixtures.EndpointSources[1])
	if err != nil {
		t.Fatal(err)
	}
	rows := sqlmock.NewRows([]string{
		"source_receipt_id", "source_kind", "provider_configuration_id", "model_lineage_digest",
		"provider_request_id", "execution_failure_authority_receipt_digest", "source_uri",
		"source_content_digest", "receipt_digest", "receipt_bytes", "observed_at",
	})
	addSourceRow := func(receipt evaluationSourceReceipt) {
		rows.AddRow(
			receipt.SourceReceiptID, receipt.SourceKind, receipt.ProviderConfigurationID, nil,
			receipt.ProviderRequestID, nil, nil, receipt.SourceContentDigest, receipt.ReceiptDigest,
			receipt.ReceiptBytes, receipt.ObservedAt,
		)
	}
	if first.SourceReceiptID < second.SourceReceiptID {
		addSourceRow(second)
		addSourceRow(first)
	} else {
		addSourceRow(first)
		addSourceRow(second)
	}
	mock.ExpectBegin()
	expectEvaluationPlanRead(t, mock, partition, plan)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT source_receipt_id, source_kind, provider_configuration_id,")).
		WithArgs(evaluationReadNamespace, partition.PlanDigest, partition.RepositoryCommit).
		WillReturnRows(rows)
	mock.ExpectCommit()
	records, err := NewRepository(database).ListEvaluationSourceReceipts(context.Background(), EvaluationAuthority{
		Kind: "service", PrincipalID: "evaluation.runner", NamespaceID: evaluationReadNamespace,
	}, partition)
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 2 || records[0].SourceReceiptID > records[1].SourceReceiptID {
		t.Fatalf("source receipts are not in canonical identity order: %#v", records)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
