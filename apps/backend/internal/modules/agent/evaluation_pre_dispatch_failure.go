package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

const (
	evaluationPreDispatchFailureReceiptFormat = "prodivix.agent-evaluation-pre-dispatch-failure-receipt"
	maximumEvaluationPreDispatchFailureBytes  = 65_536
	maximumEvaluationPreDispatchTurnIndex     = 64
)

type EvaluationPreDispatchFailureReceiptRecord struct {
	NamespaceID      string
	PlanDigest       string
	RepositoryCommit string
	FailureReceiptID string
	AttemptID        string
	DescriptorDigest string
	TurnIndex        int64
	InvocationID     string
	Stage            string
	ReasonCode       string
	PolicyDigest     string
	InputDigest      string
	FindingDigest    string
	OccurredAt       time.Time
	ReceiptDigest    string
	ReceiptBytes     []byte
}

type evaluationPreDispatchFailureReceipt struct {
	EvaluationPreDispatchFailureReceiptRecord
	Value map[string]any
}

func evaluationPreDispatchStageForReason(reason string) string {
	switch reason {
	case "protected-material-unavailable", "protected-material-integrity-failed",
		"protected-material-policy-rejected", "protected-material-leak-blocked":
		return "protected-material-resolution"
	case "invocation-payload-invalid":
		return "invocation-payload-encoding"
	case "budget-admission-rejected":
		return "budget-admission"
	case "cancelled-before-dispatch":
		return "dispatch-admission"
	default:
		return ""
	}
}

func decodeEvaluationPreDispatchFailureReceipt(source []byte) (evaluationPreDispatchFailureReceipt, error) {
	if len(source) == 0 || len(source) > maximumEvaluationPreDispatchFailureBytes {
		return evaluationPreDispatchFailureReceipt{}, invalid("evaluation pre-dispatch failure receipt exceeds its byte limit")
	}
	value, canonical, err := decodeEvaluationAuthenticityObject(source)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "failureReceiptId", "planDigest", "repositoryCommit", "attemptId",
		"descriptorDigest", "turnIndex", "invocationId", "stage", "reasonCode", "policyDigest",
		"inputDigest", "findingDigest", "occurredAt", "receiptDigest",
	}) || value["format"] != evaluationPreDispatchFailureReceiptFormat {
		return evaluationPreDispatchFailureReceipt{}, invalid("evaluation pre-dispatch failure receipt shape is invalid")
	}
	version, versionOK := integerMember(value, "version")
	turnIndex, turnErr := evaluationCount(value["turnIndex"], "evaluation pre-dispatch failure turn")
	if !versionOK || version != 1 || turnErr != nil || turnIndex > maximumEvaluationPreDispatchTurnIndex ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) {
		return evaluationPreDispatchFailureReceipt{}, invalid("evaluation pre-dispatch failure partition is invalid")
	}
	for _, field := range []string{"failureReceiptId", "attemptId", "invocationId"} {
		if _, err := evaluationAuthenticityIdentity(value[field], field); err != nil {
			return evaluationPreDispatchFailureReceipt{}, err
		}
	}
	for _, field := range []string{"planDigest", "descriptorDigest", "policyDigest", "inputDigest", "findingDigest"} {
		if _, err := evaluationAuthenticityDigest(value[field], field); err != nil {
			return evaluationPreDispatchFailureReceipt{}, err
		}
	}
	reason, stage := stringMember(value, "reasonCode"), stringMember(value, "stage")
	if evaluationPreDispatchStageForReason(reason) != stage {
		return evaluationPreDispatchFailureReceipt{}, invalid("evaluation pre-dispatch failure stage/reason binding is invalid")
	}
	occurredAt, err := evaluationInstant(value["occurredAt"], "evaluation pre-dispatch failure occurrence")
	if err != nil {
		return evaluationPreDispatchFailureReceipt{}, err
	}
	receiptDigest, err := verifyEvaluationAuthenticityDigest(value, "receiptDigest")
	if err != nil {
		return evaluationPreDispatchFailureReceipt{}, err
	}
	return evaluationPreDispatchFailureReceipt{
		EvaluationPreDispatchFailureReceiptRecord: EvaluationPreDispatchFailureReceiptRecord{
			FailureReceiptID: stringMember(value, "failureReceiptId"), PlanDigest: stringMember(value, "planDigest"),
			RepositoryCommit: stringMember(value, "repositoryCommit"), AttemptID: stringMember(value, "attemptId"),
			DescriptorDigest: stringMember(value, "descriptorDigest"), TurnIndex: turnIndex,
			InvocationID: stringMember(value, "invocationId"), Stage: stage, ReasonCode: reason,
			PolicyDigest: stringMember(value, "policyDigest"), InputDigest: stringMember(value, "inputDigest"),
			FindingDigest: stringMember(value, "findingDigest"), OccurredAt: occurredAt,
			ReceiptDigest: receiptDigest, ReceiptBytes: canonical,
		},
		Value: value,
	}, nil
}

func scanEvaluationPreDispatchFailureReceipt(
	scanner interface{ Scan(...any) error },
	namespaceID string,
	partition EvaluationPlanPartition,
) (EvaluationPreDispatchFailureReceiptRecord, error) {
	var record EvaluationPreDispatchFailureReceiptRecord
	var source []byte
	if err := scanner.Scan(&record.FailureReceiptID, &record.AttemptID, &record.DescriptorDigest, &record.TurnIndex,
		&record.InvocationID, &record.Stage, &record.ReasonCode, &record.PolicyDigest, &record.InputDigest,
		&record.FindingDigest, &record.OccurredAt, &record.ReceiptDigest, &source); err != nil {
		return record, err
	}
	decoded, err := decodeEvaluationPreDispatchFailureReceipt(source)
	if err != nil {
		return record, fmt.Errorf("decode persisted evaluation pre-dispatch failure receipt: %w", err)
	}
	actual := decoded.EvaluationPreDispatchFailureReceiptRecord
	if record.FailureReceiptID != actual.FailureReceiptID || record.AttemptID != actual.AttemptID ||
		record.DescriptorDigest != actual.DescriptorDigest || record.TurnIndex != actual.TurnIndex ||
		record.InvocationID != actual.InvocationID || record.Stage != actual.Stage || record.ReasonCode != actual.ReasonCode ||
		record.PolicyDigest != actual.PolicyDigest || record.InputDigest != actual.InputDigest ||
		record.FindingDigest != actual.FindingDigest || !record.OccurredAt.Equal(actual.OccurredAt) ||
		record.ReceiptDigest != actual.ReceiptDigest || !bytes.Equal(source, actual.ReceiptBytes) ||
		actual.PlanDigest != partition.PlanDigest || actual.RepositoryCommit != partition.RepositoryCommit {
		return record, conflict("persisted evaluation pre-dispatch failure metadata drifted")
	}
	record.NamespaceID, record.PlanDigest, record.RepositoryCommit = namespaceID, partition.PlanDigest, partition.RepositoryCommit
	record.ReceiptBytes = append([]byte(nil), source...)
	return record, nil
}

func queryEvaluationPreDispatchFailureReceipts(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	attemptID string,
) ([]EvaluationPreDispatchFailureReceiptRecord, error) {
	query := `SELECT failure_receipt_id, attempt_id, descriptor_digest, turn_index, invocation_id,
		stage, reason_code, policy_digest, input_digest, finding_digest, occurred_at, receipt_digest, receipt_bytes
	FROM agent_evaluation_pre_dispatch_failure_receipts
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3`
	args := []any{namespaceID, partition.PlanDigest, partition.RepositoryCommit}
	if attemptID != "" {
		query += ` AND attempt_id = $4`
		args = append(args, attemptID)
	}
	query += ` ORDER BY attempt_id COLLATE "C", turn_index, failure_receipt_id COLLATE "C"`
	rows, err := queryer.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationPreDispatchFailureReceiptRecord, 0)
	for rows.Next() {
		record, err := scanEvaluationPreDispatchFailureReceipt(rows, namespaceID, partition)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return records, nil
}

func insertEvaluationPreDispatchFailureReceipt(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	receipt evaluationPreDispatchFailureReceipt,
) error {
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_pre_dispatch_failure_receipts (
		namespace_id, plan_digest, repository_commit, failure_receipt_id, attempt_id, descriptor_digest,
		turn_index, invocation_id, stage, reason_code, policy_digest, input_digest, finding_digest,
		receipt_digest, receipt_json, receipt_bytes, occurred_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17)
	ON CONFLICT DO NOTHING`, namespaceID, partition.PlanDigest, partition.RepositoryCommit,
		receipt.FailureReceiptID, receipt.AttemptID, receipt.DescriptorDigest, receipt.TurnIndex, receipt.InvocationID,
		receipt.Stage, receipt.ReasonCode, receipt.PolicyDigest, receipt.InputDigest, receipt.FindingDigest,
		receipt.ReceiptDigest, string(receipt.ReceiptBytes), receipt.ReceiptBytes, receipt.OccurredAt)
	if err != nil {
		return err
	}
	inserted, err := result.RowsAffected()
	if err != nil || inserted == 1 {
		return err
	}
	var existing []byte
	if err := tx.QueryRowContext(ctx, `SELECT receipt_bytes FROM agent_evaluation_pre_dispatch_failure_receipts
		WHERE namespace_id=$1 AND plan_digest=$2 AND attempt_id=$3 AND turn_index=$4 FOR SHARE`,
		namespaceID, partition.PlanDigest, receipt.AttemptID, receipt.TurnIndex).Scan(&existing); err != nil {
		return err
	}
	if !bytes.Equal(existing, receipt.ReceiptBytes) {
		return conflict("evaluation pre-dispatch failure identity was reused")
	}
	return nil
}

func validateEvaluationPreDispatchFailureJoin(
	receipts []EvaluationPreDispatchFailureReceiptRecord,
	turns []EvaluationInvocationTurnReceiptRecord,
) error {
	byDigest := make(map[string]EvaluationPreDispatchFailureReceiptRecord, len(receipts))
	for _, receipt := range receipts {
		if _, duplicate := byDigest[receipt.ReceiptDigest]; duplicate {
			return conflict("evaluation pre-dispatch failure receipt digest is duplicated")
		}
		byDigest[receipt.ReceiptDigest] = receipt
	}
	used := make(map[string]struct{}, len(receipts))
	for _, turnRecord := range turns {
		turn, err := decodeEvaluationInvocationTurnReceipt(turnRecord.ReceiptBytes)
		if err != nil {
			return err
		}
		receipt, matched := byDigest[turn.ExecutionFailureAuthorityReceiptDigest]
		if turn.DispatchState == "not-created" {
			if !matched || receipt.PlanDigest != turn.PlanDigest || receipt.RepositoryCommit != turn.RepositoryCommit ||
				receipt.AttemptID != turn.AttemptID || receipt.DescriptorDigest != turn.DescriptorDigest ||
				receipt.TurnIndex != turn.TurnIndex || receipt.InvocationID != turn.InvocationID {
				return conflict("evaluation not-created turn lacks its exact pre-dispatch failure authority")
			}
			used[receipt.ReceiptDigest] = struct{}{}
		} else if matched {
			return conflict("evaluation dispatched turn references pre-dispatch failure authority")
		}
	}
	if len(used) != len(receipts) {
		return conflict("evaluation pre-dispatch failure receipts contain orphan authority")
	}
	return nil
}

func (repository *Repository) StoreEvaluationPreDispatchFailureReceipt(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	receiptBytes []byte,
) (EvaluationPreDispatchFailureReceiptRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationPreDispatchFailureReceiptRecord{}, false, err
	}
	receipt, err := decodeEvaluationPreDispatchFailureReceipt(receiptBytes)
	if err != nil || receipt.PlanDigest != partition.PlanDigest || receipt.RepositoryCommit != partition.RepositoryCommit {
		return EvaluationPreDispatchFailureReceiptRecord{}, false, ErrInvalid
	}
	writeContext, cancel, tx, _, plan, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationPreDispatchFailureReceiptRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if receipt.OccurredAt.Before(plan.PlannedAt) || receipt.OccurredAt.After(plan.ExpiresAt) {
		return EvaluationPreDispatchFailureReceiptRecord{}, false, conflict("evaluation pre-dispatch failure time is outside the frozen plan")
	}
	var existing []byte
	err = tx.QueryRowContext(writeContext, `SELECT receipt_bytes FROM agent_evaluation_pre_dispatch_failure_receipts
		WHERE namespace_id=$1 AND plan_digest=$2 AND attempt_id=$3 AND turn_index=$4 FOR SHARE`, authority.NamespaceID,
		partition.PlanDigest, receipt.AttemptID, receipt.TurnIndex).Scan(&existing)
	replayed := err == nil
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return EvaluationPreDispatchFailureReceiptRecord{}, false, err
	}
	if replayed && !bytes.Equal(existing, receipt.ReceiptBytes) {
		return EvaluationPreDispatchFailureReceiptRecord{}, false, conflict("evaluation pre-dispatch failure replay drifted")
	}
	if !replayed {
		if err := insertEvaluationPreDispatchFailureReceipt(writeContext, tx, authority.NamespaceID, partition, receipt); err != nil {
			return EvaluationPreDispatchFailureReceiptRecord{}, false, err
		}
	}
	if err := tx.Commit(); err != nil {
		return EvaluationPreDispatchFailureReceiptRecord{}, false, err
	}
	record := receipt.EvaluationPreDispatchFailureReceiptRecord
	record.NamespaceID = authority.NamespaceID
	return record, replayed, nil
}

func (repository *Repository) ListEvaluationPreDispatchFailureReceipts(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationPreDispatchFailureReceiptRecord, error) {
	readContext, cancel, tx, _, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return nil, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	records, err := queryEvaluationPreDispatchFailureReceipts(readContext, tx, authority.NamespaceID, partition, "")
	if err != nil {
		return nil, err
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return nil, err
	}
	return records, nil
}

func (repository *Repository) GetEvaluationPreDispatchFailureReceipt(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	attemptID string,
	turnIndex int64,
) (EvaluationPreDispatchFailureReceiptRecord, error) {
	if turnIndex < 0 || turnIndex > maximumEvaluationPreDispatchTurnIndex {
		return EvaluationPreDispatchFailureReceiptRecord{}, ErrInvalid
	}
	records, err := repository.ListEvaluationPreDispatchFailureReceipts(ctx, authority, partition)
	if err != nil {
		return EvaluationPreDispatchFailureReceiptRecord{}, err
	}
	for _, record := range records {
		if record.AttemptID == attemptID && record.TurnIndex == turnIndex {
			return record, nil
		}
	}
	return EvaluationPreDispatchFailureReceiptRecord{}, ErrNotFound
}
