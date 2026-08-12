package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const maximumEvaluationAttemptCommitSourceReceipts = 3

// EvaluationAttemptBudgetSettlement joins one previously durable reservation
// to the exact attempt evidence produced while that reservation was active.
type EvaluationAttemptBudgetSettlement struct {
	ReservationID    string
	ExpectedRevision int64
	SettlementBytes  []byte
}

// EvaluationAttemptEvidenceCommit is the single durable boundary after a
// stochastic provider invocation. Every member is canonical immutable input.
type EvaluationAttemptEvidenceCommit struct {
	SourceReceipts           [][]byte
	InvocationReceipt        []byte
	ExecutionReceipt         []byte
	ResultSubmissionReceipt  []byte
	ControlledRuntimeReceipt []byte
	AttemptFact              []byte
	BudgetSettlement         EvaluationAttemptBudgetSettlement
}

type EvaluationAttemptEvidenceCommitResult struct {
	SourceReceipts           []EvaluationSourceReceiptRecord
	InvocationReceipt        EvaluationInvocationReceiptRecord
	ExecutionReceipt         EvaluationExecutionReceiptRecord
	ResultSubmissionReceipt  *EvaluationResultSubmissionReceiptRecord
	ControlledRuntimeReceipt *EvaluationControlledRuntimeReceiptRecord
	Attempt                  EvaluationFactRecord
	BudgetSettlement         EvaluationBudgetSettlementRecord
}

type decodedEvaluationAttemptEvidenceCommit struct {
	sources    []evaluationSourceReceipt
	invocation evaluationInvocationReceipt
	execution  evaluationExecutionReceipt
	submission evaluationResultSubmissionReceipt
	runtime    evaluationControlledRuntimeReceipt
	hasRuntime bool
	attempt    evaluationAttemptFact
}

func decodeEvaluationAttemptEvidenceCommit(input EvaluationAttemptEvidenceCommit) (decodedEvaluationAttemptEvidenceCommit, error) {
	if len(input.SourceReceipts) < 2 || len(input.SourceReceipts) > maximumEvaluationAttemptCommitSourceReceipts ||
		len(input.InvocationReceipt) == 0 || len(input.ExecutionReceipt) == 0 || len(input.AttemptFact) == 0 ||
		input.BudgetSettlement.ReservationID == "" || input.BudgetSettlement.ExpectedRevision < 0 ||
		len(input.BudgetSettlement.SettlementBytes) == 0 {
		return decodedEvaluationAttemptEvidenceCommit{}, ErrInvalid
	}
	attempt, err := decodeEvaluationAttempt(input.AttemptFact)
	if err != nil {
		return decodedEvaluationAttemptEvidenceCommit{}, err
	}
	invocation, err := decodeEvaluationInvocationReceipt(input.InvocationReceipt)
	if err != nil {
		return decodedEvaluationAttemptEvidenceCommit{}, err
	}
	execution, err := decodeEvaluationExecutionReceipt(input.ExecutionReceipt)
	if err != nil {
		return decodedEvaluationAttemptEvidenceCommit{}, err
	}
	hasRuntime := len(input.ResultSubmissionReceipt) > 0 || len(input.ControlledRuntimeReceipt) > 0
	if (attempt.Status == "completed") != hasRuntime ||
		(len(input.ResultSubmissionReceipt) == 0) != (len(input.ControlledRuntimeReceipt) == 0) {
		return decodedEvaluationAttemptEvidenceCommit{}, invalid("evaluation completed attempt requires one result submission and controlled runtime receipt")
	}
	var submission evaluationResultSubmissionReceipt
	var runtime evaluationControlledRuntimeReceipt
	if hasRuntime {
		submission, err = decodeEvaluationResultSubmissionReceipt(input.ResultSubmissionReceipt)
		if err != nil {
			return decodedEvaluationAttemptEvidenceCommit{}, err
		}
		runtime, err = decodeEvaluationControlledRuntimeReceipt(input.ControlledRuntimeReceipt)
		if err != nil {
			return decodedEvaluationAttemptEvidenceCommit{}, err
		}
	}
	sources := make([]evaluationSourceReceipt, len(input.SourceReceipts))
	for index, source := range input.SourceReceipts {
		receipt, err := decodeEvaluationSourceReceipt(source)
		if err != nil {
			return decodedEvaluationAttemptEvidenceCommit{}, err
		}
		if index > 0 && sources[index-1].SourceReceiptID >= receipt.SourceReceiptID {
			return decodedEvaluationAttemptEvidenceCommit{}, invalid("evaluation attempt source receipts are not in canonical identity order")
		}
		sources[index] = receipt
	}
	return decodedEvaluationAttemptEvidenceCommit{
		sources: sources, invocation: invocation, execution: execution, submission: submission,
		runtime: runtime, hasRuntime: hasRuntime, attempt: attempt,
	}, nil
}

func validateEvaluationAttemptCommitSources(
	invocation evaluationInvocationReceipt,
	sources []evaluationSourceReceipt,
) error {
	records := make([]EvaluationSourceReceiptRecord, len(sources))
	for index, source := range sources {
		records[index] = source.EvaluationSourceReceiptRecord
	}
	byDigest, pricingBySnapshotDigest, err := decodeEvaluationAuthenticitySources(records)
	if err != nil {
		return err
	}
	usageSource, usageExists := byDigest[invocation.UsageSourceReceiptDigest]
	costSource, costExists := byDigest[invocation.CostSourceReceiptDigest]
	used := make(map[string]struct{}, len(sources))
	if !usageExists || !costExists ||
		!evaluationUsageSourceMatches(usageSource, invocation.Usage, invocation.ProviderConfigurationID,
			invocation.ModelLineageDigest, invocation.ProviderRequestID,
			invocation.ExecutionFailureAuthorityReceiptDigest) ||
		!evaluationCostSourceMatches(costSource, invocation.Usage, invocation.Cost,
			invocation.ProviderConfigurationID, invocation.ModelLineageDigest, invocation.ProviderRequestID,
			invocation.ExecutionFailureAuthorityReceiptDigest, invocation.PricingSnapshotRef,
			pricingBySnapshotDigest, used) {
		return conflict("evaluation attempt source receipts do not exactly bind the invocation")
	}
	if err := markEvaluationSourceReceiptUsed(used, invocation.UsageSourceReceiptDigest); err != nil {
		return err
	}
	if err := markEvaluationSourceReceiptUsed(used, invocation.CostSourceReceiptDigest); err != nil {
		return err
	}
	if len(used) != len(sources) {
		return conflict("evaluation attempt source receipts contain unreferenced evidence")
	}
	return nil
}

func evaluationAttemptReservationID(planDigest, shardID string, leaseGeneration int64, descriptorDigest string) (string, error) {
	digest, err := canonicaljson.Digest(map[string]any{
		"planDigest": planDigest, "shardId": shardID, "leaseGeneration": leaseGeneration,
		"descriptorDigest": descriptorDigest,
	})
	if err != nil {
		return "", err
	}
	return "evaluation-reservation." + strings.TrimPrefix(digest, "sha256-"), nil
}

type evaluationAttemptCommitPresence struct {
	sourceBytes     [][]byte
	invocationBytes []byte
	executionBytes  []byte
	submissionBytes []byte
	runtimeBytes    []byte
	attemptBytes    []byte
	settlement      EvaluationBudgetSettlementRecord
	found           int
}

func optionalEvaluationImmutableBytes(
	ctx context.Context,
	tx *sql.Tx,
	query string,
	args ...any,
) ([]byte, bool, error) {
	var source []byte
	err := tx.QueryRowContext(ctx, query, args...).Scan(&source)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return source, true, nil
}

func loadEvaluationAttemptCommitPresence(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	input EvaluationAttemptEvidenceCommit,
	decoded decodedEvaluationAttemptEvidenceCommit,
) (evaluationAttemptCommitPresence, error) {
	presence := evaluationAttemptCommitPresence{sourceBytes: make([][]byte, len(decoded.sources))}
	for index, source := range decoded.sources {
		value, found, err := optionalEvaluationImmutableBytes(ctx, tx, `SELECT receipt_bytes
			FROM agent_evaluation_source_receipts
			WHERE namespace_id = $1 AND plan_digest = $2 AND source_receipt_id = $3
			FOR SHARE`, namespaceID, partition.PlanDigest, source.SourceReceiptID)
		if err != nil {
			return evaluationAttemptCommitPresence{}, err
		}
		presence.sourceBytes[index] = value
		if found {
			presence.found++
		}
	}
	var err error
	var found bool
	presence.invocationBytes, found, err = optionalEvaluationImmutableBytes(ctx, tx, `SELECT evidence_bytes
		FROM agent_evaluation_invocation_receipts
		WHERE namespace_id = $1 AND plan_digest = $2 AND attempt_id = $3
		FOR SHARE`, namespaceID, partition.PlanDigest, decoded.attempt.AttemptID)
	if err != nil {
		return evaluationAttemptCommitPresence{}, err
	}
	if found {
		presence.found++
	}
	presence.executionBytes, found, err = optionalEvaluationImmutableBytes(ctx, tx, `SELECT receipt_bytes
		FROM agent_evaluation_execution_receipts
		WHERE namespace_id = $1 AND plan_digest = $2 AND attempt_id = $3
		FOR SHARE`, namespaceID, partition.PlanDigest, decoded.attempt.AttemptID)
	if err != nil {
		return evaluationAttemptCommitPresence{}, err
	}
	if found {
		presence.found++
	}
	if decoded.hasRuntime {
		presence.submissionBytes, found, err = optionalEvaluationImmutableBytes(ctx, tx, `SELECT receipt_bytes
			FROM agent_evaluation_result_submission_receipts
			WHERE namespace_id = $1 AND plan_digest = $2 AND attempt_id = $3
			FOR SHARE`, namespaceID, partition.PlanDigest, decoded.attempt.AttemptID)
		if err != nil {
			return evaluationAttemptCommitPresence{}, err
		}
		if found {
			presence.found++
		}
		presence.runtimeBytes, found, err = optionalEvaluationImmutableBytes(ctx, tx, `SELECT receipt_bytes
			FROM agent_evaluation_controlled_runtime_receipts
			WHERE namespace_id = $1 AND plan_digest = $2 AND attempt_id = $3
			FOR SHARE`, namespaceID, partition.PlanDigest, decoded.attempt.AttemptID)
		if err != nil {
			return evaluationAttemptCommitPresence{}, err
		}
		if found {
			presence.found++
		}
	}
	presence.attemptBytes, found, err = optionalEvaluationImmutableBytes(ctx, tx, `SELECT attempt_bytes
		FROM agent_evaluation_attempts
		WHERE namespace_id = $1 AND plan_digest = $2 AND attempt_id = $3
		FOR SHARE`, namespaceID, partition.PlanDigest, decoded.attempt.AttemptID)
	if err != nil {
		return evaluationAttemptCommitPresence{}, err
	}
	if found {
		presence.found++
	}
	presence.settlement = EvaluationBudgetSettlementRecord{
		NamespaceID: namespaceID, PlanDigest: partition.PlanDigest,
		ReservationID: input.BudgetSettlement.ReservationID,
	}
	err = tx.QueryRowContext(ctx, `SELECT ledger_revision, settlement_digest, settlement_bytes, settled_at
		FROM agent_evaluation_budget_settlements
		WHERE namespace_id = $1 AND plan_digest = $2 AND reservation_id = $3
		FOR SHARE`, namespaceID, partition.PlanDigest, input.BudgetSettlement.ReservationID).Scan(
		&presence.settlement.LedgerRevision, &presence.settlement.SettlementDigest,
		&presence.settlement.SettlementBytes, &presence.settlement.SettledAt,
	)
	if err == nil {
		presence.found++
	} else if !errors.Is(err, sql.ErrNoRows) {
		return evaluationAttemptCommitPresence{}, err
	}
	return presence, nil
}

func evaluationAttemptCommitResult(
	namespaceID string,
	partition EvaluationPlanPartition,
	decoded decodedEvaluationAttemptEvidenceCommit,
	settlement EvaluationBudgetSettlementRecord,
) EvaluationAttemptEvidenceCommitResult {
	sources := make([]EvaluationSourceReceiptRecord, len(decoded.sources))
	for index, source := range decoded.sources {
		sources[index] = source.EvaluationSourceReceiptRecord
		sources[index].NamespaceID = namespaceID
	}
	invocation := decoded.invocation.EvaluationInvocationReceiptRecord
	invocation.NamespaceID = namespaceID
	execution := decoded.execution.EvaluationExecutionReceiptRecord
	execution.NamespaceID = namespaceID
	var submissionRecord *EvaluationResultSubmissionReceiptRecord
	var runtimeRecord *EvaluationControlledRuntimeReceiptRecord
	if decoded.hasRuntime {
		submission, runtime := runtimeEvidenceRecordsFromDecoded(namespaceID, partition, decoded.submission, decoded.runtime)
		submissionRecord, runtimeRecord = &submission, &runtime
	}
	attempt := evaluationRecord(namespaceID, partition.PlanDigest, "evaluation-attempt",
		decoded.attempt.AttemptID, decoded.attempt.AttemptDigest, decoded.attempt.Canonical, decoded.attempt.CompletedAt)
	return EvaluationAttemptEvidenceCommitResult{
		SourceReceipts: sources, InvocationReceipt: invocation, ExecutionReceipt: execution,
		ResultSubmissionReceipt: submissionRecord, ControlledRuntimeReceipt: runtimeRecord,
		Attempt: attempt, BudgetSettlement: settlement,
	}
}

// CommitEvaluationAttemptEvidence atomically joins provider accounting,
// invocation/execution authenticity, the immutable attempt, and its budget
// settlement. A partial pre-existing join is rejected and exact full replay is
// acknowledged without advancing the budget ledger again.
func (repository *Repository) CommitEvaluationAttemptEvidence(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	input EvaluationAttemptEvidenceCommit,
) (EvaluationAttemptEvidenceCommitResult, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationAttemptEvidenceCommitResult{}, false, err
	}
	decoded, err := decodeEvaluationAttemptEvidenceCommit(input)
	if err != nil {
		return EvaluationAttemptEvidenceCommitResult{}, false, err
	}
	if decoded.attempt.PlanDigest != partition.PlanDigest || decoded.invocation.PlanDigest != partition.PlanDigest ||
		decoded.execution.PlanDigest != partition.PlanDigest || decoded.invocation.AttemptID != decoded.attempt.AttemptID ||
		decoded.execution.AttemptID != decoded.attempt.AttemptID ||
		decoded.invocation.DescriptorDigest != decoded.attempt.DescriptorDigest ||
		decoded.execution.DescriptorDigest != decoded.attempt.DescriptorDigest {
		return EvaluationAttemptEvidenceCommitResult{}, false, conflict("evaluation attempt evidence belongs to a different plan, attempt, or descriptor")
	}
	writeContext, cancel, tx, _, plan, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationAttemptEvidenceCommitResult{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := validateEvaluationAttemptPlanBinding(plan.Canonical, decoded.attempt); err != nil {
		return EvaluationAttemptEvidenceCommitResult{}, false, err
	}
	targetID, _, err := resolveEvaluationInvocationPlanBinding(plan, decoded.invocation)
	if err != nil {
		return EvaluationAttemptEvidenceCommitResult{}, false, err
	}
	if err := validateEvaluationInvocationBinding(plan, decoded.attempt, decoded.invocation); err != nil {
		return EvaluationAttemptEvidenceCommitResult{}, false, err
	}
	if err := validateEvaluationExecutionBinding(plan, decoded.attempt, decoded.execution); err != nil {
		return EvaluationAttemptEvidenceCommitResult{}, false, err
	}
	if decoded.hasRuntime {
		if err := validateEvaluationRuntimeEvidenceBinding(plan, decoded.attempt, decoded.invocation,
			decoded.execution, decoded.submission, decoded.runtime); err != nil {
			return EvaluationAttemptEvidenceCommitResult{}, false, err
		}
	}
	for _, source := range decoded.sources {
		if err := validateEvaluationSourceBinding(plan, source); err != nil {
			return EvaluationAttemptEvidenceCommitResult{}, false, err
		}
	}
	if err := validateEvaluationAttemptCommitSources(decoded.invocation, decoded.sources); err != nil {
		return EvaluationAttemptEvidenceCommitResult{}, false, err
	}
	var leaseGeneration int64
	if err := tx.QueryRowContext(writeContext, `SELECT generation FROM agent_evaluation_shard_leases
		WHERE namespace_id = $1 AND plan_digest = $2 AND shard_id = $3 FOR SHARE`,
		authority.NamespaceID, partition.PlanDigest, decoded.attempt.ShardID).Scan(&leaseGeneration); errors.Is(err, sql.ErrNoRows) {
		return EvaluationAttemptEvidenceCommitResult{}, false, ErrNotFound
	} else if err != nil {
		return EvaluationAttemptEvidenceCommitResult{}, false, err
	}
	expectedReservationID, err := evaluationAttemptReservationID(partition.PlanDigest, decoded.attempt.ShardID,
		leaseGeneration, decoded.attempt.DescriptorDigest)
	if err != nil || expectedReservationID != input.BudgetSettlement.ReservationID {
		return EvaluationAttemptEvidenceCommitResult{}, false, conflict("evaluation budget reservation does not bind the attempt descriptor and lease generation")
	}
	var ledgerRevision int64
	if err := tx.QueryRowContext(writeContext, `SELECT revision FROM agent_evaluation_budget_ledgers
		WHERE namespace_id = $1 AND plan_digest = $2 FOR UPDATE`, authority.NamespaceID, partition.PlanDigest).Scan(&ledgerRevision); errors.Is(err, sql.ErrNoRows) {
		return EvaluationAttemptEvidenceCommitResult{}, false, ErrNotFound
	} else if err != nil {
		return EvaluationAttemptEvidenceCommitResult{}, false, err
	}
	var demandBytes []byte
	var reservedAt sql.NullTime
	if err := tx.QueryRowContext(writeContext, `SELECT demand_bytes, reserved_at
		FROM agent_evaluation_budget_reservations
		WHERE namespace_id = $1 AND plan_digest = $2 AND reservation_id = $3
		FOR SHARE`, authority.NamespaceID, partition.PlanDigest, input.BudgetSettlement.ReservationID).Scan(
		&demandBytes, &reservedAt,
	); errors.Is(err, sql.ErrNoRows) {
		return EvaluationAttemptEvidenceCommitResult{}, false, ErrNotFound
	} else if err != nil {
		return EvaluationAttemptEvidenceCommitResult{}, false, err
	}
	demand, err := decodeEvaluationBudgetDemand(demandBytes, true)
	if err != nil || !reservedAt.Valid {
		return EvaluationAttemptEvidenceCommitResult{}, false, conflict("persisted evaluation budget reservation is invalid")
	}
	settlement, err := decodeEvaluationBudgetSettlement(input.BudgetSettlement.SettlementBytes, demand, reservedAt.Time)
	if err != nil {
		return EvaluationAttemptEvidenceCommitResult{}, false, err
	}
	presence, err := loadEvaluationAttemptCommitPresence(writeContext, tx, authority.NamespaceID, partition, input, decoded)
	if err != nil {
		return EvaluationAttemptEvidenceCommitResult{}, false, err
	}
	expectedMembers := len(decoded.sources) + 4
	if decoded.hasRuntime {
		expectedMembers += 2
	}
	if presence.found == expectedMembers {
		for index, source := range decoded.sources {
			if !bytes.Equal(presence.sourceBytes[index], source.ReceiptBytes) {
				return EvaluationAttemptEvidenceCommitResult{}, false, conflict("evaluation attempt evidence replay drifted")
			}
		}
		if !bytes.Equal(presence.invocationBytes, decoded.invocation.EvidenceBytes) ||
			!bytes.Equal(presence.executionBytes, decoded.execution.ReceiptBytes) ||
			(decoded.hasRuntime && (!bytes.Equal(presence.submissionBytes, decoded.submission.ReceiptBytes) ||
				!bytes.Equal(presence.runtimeBytes, decoded.runtime.ReceiptBytes))) ||
			!bytes.Equal(presence.attemptBytes, decoded.attempt.Canonical) ||
			!bytes.Equal(presence.settlement.SettlementBytes, settlement.Canonical) {
			return EvaluationAttemptEvidenceCommitResult{}, false, conflict("evaluation attempt evidence replay drifted")
		}
		if err := tx.Commit(); err != nil {
			return EvaluationAttemptEvidenceCommitResult{}, false, err
		}
		result := evaluationAttemptCommitResult(authority.NamespaceID, partition, decoded, presence.settlement)
		result.InvocationReceipt.TargetID = targetID
		return result, true, nil
	}
	if presence.found != 0 {
		return EvaluationAttemptEvidenceCommitResult{}, false, conflict("evaluation attempt evidence has a partial durable join")
	}
	if err := ensureEvaluationAuthenticitySetOpen(writeContext, tx, authority.NamespaceID, partition.PlanDigest); err != nil {
		return EvaluationAttemptEvidenceCommitResult{}, false, err
	}
	if ledgerRevision != input.BudgetSettlement.ExpectedRevision {
		return EvaluationAttemptEvidenceCommitResult{}, false, conflict("evaluation attempt evidence budget revision is stale")
	}
	if decoded.invocation.ProviderRequestID != "" {
		if err := registerEvaluationProviderRequest(writeContext, tx, authority.NamespaceID, partition,
			decoded.invocation.ProviderConfigurationID, decoded.invocation.ProviderRequestID, "invocation",
			decoded.invocation.AttemptID, decoded.invocation.CompletedAt); err != nil {
			return EvaluationAttemptEvidenceCommitResult{}, false, err
		}
	}
	for _, source := range decoded.sources {
		if _, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_source_receipts (
			namespace_id, plan_digest, repository_commit, source_receipt_id, source_kind,
			provider_configuration_id, model_lineage_digest, provider_request_id,
			execution_failure_authority_receipt_digest, source_uri, source_content_digest,
			receipt_digest, receipt_json, receipt_bytes, observed_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15)`,
			authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, source.SourceReceiptID,
			source.SourceKind, source.ProviderConfigurationID, nullableEvaluationAuthenticityString(source.ModelLineageDigest),
			nullableEvaluationAuthenticityString(source.ProviderRequestID),
			nullableEvaluationAuthenticityString(source.ExecutionFailureAuthorityReceiptDigest),
			nullableEvaluationAuthenticityString(source.SourceURI), source.SourceContentDigest, source.ReceiptDigest,
			string(source.ReceiptBytes), source.ReceiptBytes, source.ObservedAt); err != nil {
			return EvaluationAttemptEvidenceCommitResult{}, false, err
		}
	}
	if _, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_invocation_receipts (
		namespace_id, plan_digest, repository_commit, attempt_id, descriptor_digest, target_id,
		provider_configuration_id, model_lineage_digest, provider_request_id,
		execution_failure_authority_receipt_digest, transport_receipt_digest,
		resolved_model_id, resolved_model_version, resolved_model_identity_digest,
		invocation_outcome, invocation_receipt_digest,
		response_artifact_digest, evidence_digest, evidence_json, evidence_bytes, started_at, completed_at
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20, $21, $22)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, decoded.invocation.AttemptID,
		decoded.invocation.DescriptorDigest, targetID, decoded.invocation.ProviderConfigurationID,
		decoded.invocation.ModelLineageDigest, nullableEvaluationAuthenticityString(decoded.invocation.ProviderRequestID),
		nullableEvaluationAuthenticityString(decoded.invocation.ExecutionFailureAuthorityReceiptDigest),
		decoded.invocation.TransportReceiptDigest,
		nullableEvaluationAuthenticityString(decoded.invocation.ResolvedModelID),
		nullableEvaluationAuthenticityString(decoded.invocation.ResolvedModelVersion),
		decoded.invocation.ResolvedModelIdentityDigest, decoded.invocation.InvocationOutcome,
		decoded.invocation.InvocationReceiptDigest,
		nullableEvaluationAuthenticityString(decoded.invocation.ResponseArtifactDigest), decoded.invocation.EvidenceDigest,
		string(decoded.invocation.EvidenceBytes), decoded.invocation.EvidenceBytes,
		decoded.invocation.StartedAt, decoded.invocation.CompletedAt); err != nil {
		return EvaluationAttemptEvidenceCommitResult{}, false, err
	}
	if _, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_execution_receipts (
		namespace_id, plan_digest, repository_commit, execution_receipt_id, attempt_id,
		descriptor_digest, model_invocations, tool_calls, repair_rounds, transactions,
		artifact_bytes, elapsed_ms, tool_receipt_set_digest, transaction_receipt_set_digest,
		verification_closure_digest, receipt_digest, receipt_json, receipt_bytes
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, decoded.execution.ExecutionReceiptID,
		decoded.execution.AttemptID, decoded.execution.DescriptorDigest, decoded.execution.ModelInvocations,
		decoded.execution.ToolCalls, decoded.execution.RepairRounds, decoded.execution.Transactions,
		decoded.execution.ArtifactBytes, decoded.execution.ElapsedMS,
		nullableEvaluationAuthenticityString(decoded.execution.ToolReceiptSetDigest),
		nullableEvaluationAuthenticityString(decoded.execution.TransactionReceiptSetDigest),
		nullableEvaluationAuthenticityString(decoded.execution.VerificationClosureDigest),
		decoded.execution.ReceiptDigest, string(decoded.execution.ReceiptBytes), decoded.execution.ReceiptBytes); err != nil {
		return EvaluationAttemptEvidenceCommitResult{}, false, err
	}
	if decoded.hasRuntime {
		if err := repository.storeEvaluationResultSubmissionReceiptTx(writeContext, tx, authority, partition, decoded.submission); err != nil {
			return EvaluationAttemptEvidenceCommitResult{}, false, err
		}
		if err := repository.storeEvaluationControlledRuntimeReceiptTx(writeContext, tx, authority, partition, decoded.runtime); err != nil {
			return EvaluationAttemptEvidenceCommitResult{}, false, err
		}
	}
	if _, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_attempts (
		namespace_id, plan_digest, attempt_id, descriptor_digest, sampling_identity_digest,
		independent_run_id, shard_id, case_id, target_id, status, outcome, attempt_digest,
		attempt_json, attempt_bytes, started_at, completed_at
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16)`,
		authority.NamespaceID, partition.PlanDigest, decoded.attempt.AttemptID, decoded.attempt.DescriptorDigest,
		decoded.attempt.SamplingIdentityDigest, decoded.attempt.IndependentRunID, decoded.attempt.ShardID,
		decoded.attempt.CaseID, decoded.attempt.TargetID, decoded.attempt.Status, decoded.attempt.Outcome,
		decoded.attempt.AttemptDigest, string(decoded.attempt.Canonical), decoded.attempt.Canonical,
		decoded.attempt.StartedAt, decoded.attempt.CompletedAt); err != nil {
		return EvaluationAttemptEvidenceCommitResult{}, false, err
	}
	nextRevision := ledgerRevision + 1
	if _, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_budget_settlements (
		namespace_id, plan_digest, reservation_id, ledger_revision, settlement_digest,
		settlement_json, settlement_bytes, settled_at
	) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`, authority.NamespaceID,
		partition.PlanDigest, input.BudgetSettlement.ReservationID, nextRevision, settlement.Digest,
		string(settlement.Canonical), settlement.Canonical, settlement.SettledAt); err != nil {
		return EvaluationAttemptEvidenceCommitResult{}, false, err
	}
	update, err := tx.ExecContext(writeContext, `UPDATE agent_evaluation_budget_ledgers
		SET revision = $3, updated_at = $4
		WHERE namespace_id = $1 AND plan_digest = $2 AND revision = $5`, authority.NamespaceID,
		partition.PlanDigest, nextRevision, settlement.SettledAt, ledgerRevision)
	if err != nil {
		return EvaluationAttemptEvidenceCommitResult{}, false, err
	}
	if affected, err := update.RowsAffected(); err != nil || affected != 1 {
		return EvaluationAttemptEvidenceCommitResult{}, false, conflict("evaluation attempt evidence budget CAS was lost")
	}
	if err := tx.Commit(); err != nil {
		return EvaluationAttemptEvidenceCommitResult{}, false, err
	}
	settlementRecord := EvaluationBudgetSettlementRecord{
		NamespaceID: authority.NamespaceID, PlanDigest: partition.PlanDigest,
		ReservationID: input.BudgetSettlement.ReservationID, LedgerRevision: nextRevision,
		SettlementDigest: settlement.Digest, SettlementBytes: settlement.Canonical, SettledAt: settlement.SettledAt,
	}
	result := evaluationAttemptCommitResult(authority.NamespaceID, partition, decoded, settlementRecord)
	result.InvocationReceipt.TargetID = targetID
	return result, false, nil
}
