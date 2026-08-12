package agent

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type EvaluationSourceReceiptSelector struct {
	SourceReceiptID string
	ReceiptDigest   string
}

func (repository *Repository) ListEvaluationEndpointSmokeReceipts(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationEndpointSmokeReceiptRecord, error) {
	readContext, cancel, tx, plan, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return nil, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	records, err := queryEvaluationEndpointSmokeReceipts(readContext, tx, authority.NamespaceID, partition, plan, "")
	if err != nil {
		return nil, err
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return nil, err
	}
	return records, nil
}

func (repository *Repository) GetEvaluationEndpointSmokeReceipt(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	smokeTargetID string,
) (EvaluationEndpointSmokeReceiptRecord, error) {
	if !evaluationAuthenticityIdentityPattern.MatchString(smokeTargetID) {
		return EvaluationEndpointSmokeReceiptRecord{}, ErrInvalid
	}
	readContext, cancel, tx, plan, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return EvaluationEndpointSmokeReceiptRecord{}, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	records, err := queryEvaluationEndpointSmokeReceipts(readContext, tx, authority.NamespaceID, partition, plan,
		" AND smoke_target_id = $4", smokeTargetID)
	if err != nil {
		return EvaluationEndpointSmokeReceiptRecord{}, err
	}
	if len(records) == 0 {
		return EvaluationEndpointSmokeReceiptRecord{}, ErrNotFound
	}
	if len(records) != 1 {
		return EvaluationEndpointSmokeReceiptRecord{}, conflict("evaluation endpoint smoke selector matched duplicate durable receipts")
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return EvaluationEndpointSmokeReceiptRecord{}, err
	}
	return records[0], nil
}

func (repository *Repository) ListEvaluationInvocationReceipts(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationInvocationReceiptRecord, error) {
	readContext, cancel, tx, plan, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return nil, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	attempts, err := queryEvaluationAttempts(readContext, tx, authority.NamespaceID, partition, plan, "")
	if err != nil {
		return nil, err
	}
	records, err := queryEvaluationInvocationReceipts(readContext, tx, authority.NamespaceID, partition, plan, attempts, "")
	if err != nil {
		return nil, err
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return nil, err
	}
	return records, nil
}

func (repository *Repository) GetEvaluationInvocationReceipt(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	attemptID string,
) (EvaluationInvocationReceiptRecord, error) {
	if !evaluationAuthenticityIdentityPattern.MatchString(attemptID) {
		return EvaluationInvocationReceiptRecord{}, ErrInvalid
	}
	readContext, cancel, tx, plan, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return EvaluationInvocationReceiptRecord{}, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	attempts, err := queryEvaluationAttempts(readContext, tx, authority.NamespaceID, partition, plan,
		" AND attempt_id = $4", attemptID)
	if err != nil {
		return EvaluationInvocationReceiptRecord{}, err
	}
	records, err := queryEvaluationInvocationReceipts(readContext, tx, authority.NamespaceID, partition, plan, attempts,
		" AND attempt_id = $4", attemptID)
	if err != nil {
		return EvaluationInvocationReceiptRecord{}, err
	}
	if len(records) == 0 {
		return EvaluationInvocationReceiptRecord{}, ErrNotFound
	}
	if len(records) != 1 {
		return EvaluationInvocationReceiptRecord{}, conflict("evaluation invocation selector matched duplicate durable receipts")
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return EvaluationInvocationReceiptRecord{}, err
	}
	return records[0], nil
}

func (repository *Repository) ListEvaluationSourceReceipts(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationSourceReceiptRecord, error) {
	readContext, cancel, tx, plan, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return nil, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	records, err := queryEvaluationSourceReceipts(readContext, tx, authority.NamespaceID, partition, plan, "")
	if err != nil {
		return nil, err
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return nil, err
	}
	return records, nil
}

func (repository *Repository) GetEvaluationSourceReceipt(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	selector EvaluationSourceReceiptSelector,
) (EvaluationSourceReceiptRecord, error) {
	if (strings.TrimSpace(selector.SourceReceiptID) == "") == (strings.TrimSpace(selector.ReceiptDigest) == "") {
		return EvaluationSourceReceiptRecord{}, ErrInvalid
	}
	condition, value := " AND source_receipt_id = $4", selector.SourceReceiptID
	if selector.ReceiptDigest != "" {
		if !evaluationDigestPattern.MatchString(selector.ReceiptDigest) {
			return EvaluationSourceReceiptRecord{}, ErrInvalid
		}
		condition, value = " AND receipt_digest = $4", selector.ReceiptDigest
	} else if !evaluationAuthenticityIdentityPattern.MatchString(selector.SourceReceiptID) {
		return EvaluationSourceReceiptRecord{}, ErrInvalid
	}
	readContext, cancel, tx, plan, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return EvaluationSourceReceiptRecord{}, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	records, err := queryEvaluationSourceReceipts(readContext, tx, authority.NamespaceID, partition, plan, condition, value)
	if err != nil {
		return EvaluationSourceReceiptRecord{}, err
	}
	if len(records) == 0 {
		return EvaluationSourceReceiptRecord{}, ErrNotFound
	}
	if len(records) != 1 {
		return EvaluationSourceReceiptRecord{}, conflict("evaluation source selector matched duplicate durable receipts")
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return EvaluationSourceReceiptRecord{}, err
	}
	return records[0], nil
}

func (repository *Repository) ListEvaluationExecutionReceipts(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationExecutionReceiptRecord, error) {
	readContext, cancel, tx, plan, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return nil, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	attempts, err := queryEvaluationAttempts(readContext, tx, authority.NamespaceID, partition, plan, "")
	if err != nil {
		return nil, err
	}
	records, err := queryEvaluationExecutionReceipts(readContext, tx, authority.NamespaceID, partition, plan, attempts, "")
	if err != nil {
		return nil, err
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return nil, err
	}
	return records, nil
}

func (repository *Repository) GetEvaluationExecutionReceipt(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	attemptID string,
) (EvaluationExecutionReceiptRecord, error) {
	if !evaluationAuthenticityIdentityPattern.MatchString(attemptID) {
		return EvaluationExecutionReceiptRecord{}, ErrInvalid
	}
	readContext, cancel, tx, plan, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return EvaluationExecutionReceiptRecord{}, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	attempts, err := queryEvaluationAttempts(readContext, tx, authority.NamespaceID, partition, plan,
		" AND attempt_id = $4", attemptID)
	if err != nil {
		return EvaluationExecutionReceiptRecord{}, err
	}
	records, err := queryEvaluationExecutionReceipts(readContext, tx, authority.NamespaceID, partition, plan, attempts,
		" AND attempt_id = $4", attemptID)
	if err != nil {
		return EvaluationExecutionReceiptRecord{}, err
	}
	if len(records) == 0 {
		return EvaluationExecutionReceiptRecord{}, ErrNotFound
	}
	if len(records) != 1 {
		return EvaluationExecutionReceiptRecord{}, conflict("evaluation execution selector matched duplicate durable receipts")
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return EvaluationExecutionReceiptRecord{}, err
	}
	return records[0], nil
}

func (repository *Repository) GetEvaluationAuthorityAttestation(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) (EvaluationAuthorityAttestationRecord, error) {
	readContext, cancel, tx, plan, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return EvaluationAuthorityAttestationRecord{}, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	record, err := queryEvaluationAuthorityAttestation(readContext, tx, authority.NamespaceID, partition, plan)
	if err != nil {
		return EvaluationAuthorityAttestationRecord{}, err
	}
	if record == nil {
		return EvaluationAuthorityAttestationRecord{}, ErrNotFound
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return EvaluationAuthorityAttestationRecord{}, err
	}
	return *record, nil
}

func (repository *Repository) GetEvaluationEvidenceRoot(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) (EvaluationEvidenceRootRecord, error) {
	readContext, cancel, tx, plan, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return EvaluationEvidenceRootRecord{}, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	record, err := queryEvaluationEvidenceRoot(readContext, tx, authority.NamespaceID, partition, plan)
	if err != nil {
		return EvaluationEvidenceRootRecord{}, err
	}
	if record == nil {
		return EvaluationEvidenceRootRecord{}, ErrNotFound
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return EvaluationEvidenceRootRecord{}, err
	}
	return *record, nil
}

func queryEvaluationEndpointSmokeReceipts(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	plan EvaluationPlanRecord,
	condition string,
	args ...any,
) ([]EvaluationEndpointSmokeReceiptRecord, error) {
	queryArgs := append([]any{namespaceID, partition.PlanDigest, partition.RepositoryCommit}, args...)
	rows, err := queryer.QueryContext(ctx, `SELECT receipt_id, smoke_target_id, smoke_target_digest,
		protocol_family, provider_configuration_id, provider_request_id, adapter_digest,
		receipt_digest, receipt_bytes, started_at, completed_at
	FROM agent_evaluation_endpoint_smoke_receipts
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3`+condition+`
	ORDER BY smoke_target_id ASC`, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationEndpointSmokeReceiptRecord, 0)
	seenTargets, seenIDs, seenDigests := map[string]struct{}{}, map[string]struct{}{}, map[string]struct{}{}
	planFact, err := decodeEvaluationPlan(plan.FactBytes)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var columns EvaluationEndpointSmokeReceiptRecord
		var source []byte
		if err := rows.Scan(&columns.ReceiptID, &columns.SmokeTargetID, &columns.SmokeTargetDigest,
			&columns.ProtocolFamily, &columns.ProviderConfigurationID, &columns.ProviderRequestID,
			&columns.AdapterDigest, &columns.ReceiptDigest, &source, &columns.StartedAt, &columns.CompletedAt); err != nil {
			return nil, err
		}
		decoded, err := decodeEvaluationEndpointSmokeReceipt(source)
		if err != nil {
			return nil, fmt.Errorf("decode persisted endpoint smoke receipt: %w", err)
		}
		if err := validateEvaluationEndpointSmokeBinding(planFact, decoded); err != nil {
			return nil, err
		}
		if !bytes.Equal(source, decoded.ReceiptBytes) || decoded.PlanDigest != partition.PlanDigest ||
			decoded.RepositoryCommit != partition.RepositoryCommit || columns.ReceiptID != decoded.ReceiptID ||
			columns.SmokeTargetID != decoded.SmokeTargetID || columns.SmokeTargetDigest != decoded.SmokeTargetDigest ||
			columns.ProtocolFamily != decoded.ProtocolFamily || columns.ProviderConfigurationID != decoded.ProviderConfigurationID ||
			columns.ProviderRequestID != decoded.ProviderRequestID || columns.AdapterDigest != decoded.AdapterDigest ||
			columns.ReceiptDigest != decoded.ReceiptDigest || !columns.StartedAt.Equal(decoded.StartedAt) ||
			!columns.CompletedAt.Equal(decoded.CompletedAt) {
			return nil, conflict("persisted endpoint smoke receipt metadata drifted from its canonical bytes")
		}
		if _, exists := seenTargets[columns.SmokeTargetID]; exists {
			return nil, conflict("evaluation endpoint smoke partition contains duplicate target receipts")
		}
		if _, exists := seenIDs[columns.ReceiptID]; exists {
			return nil, conflict("evaluation endpoint smoke partition contains duplicate receipt identities")
		}
		if _, exists := seenDigests[columns.ReceiptDigest]; exists {
			return nil, conflict("evaluation endpoint smoke partition contains duplicate receipt digests")
		}
		seenTargets[columns.SmokeTargetID], seenIDs[columns.ReceiptID], seenDigests[columns.ReceiptDigest] = struct{}{}, struct{}{}, struct{}{}
		columns.NamespaceID, columns.PlanDigest, columns.RepositoryCommit = namespaceID, partition.PlanDigest, partition.RepositoryCommit
		columns.ReceiptBytes = append([]byte(nil), source...)
		records = append(records, columns)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Slice(records, func(left, right int) bool {
		return records[left].SmokeTargetID < records[right].SmokeTargetID
	})
	return records, nil
}

func queryEvaluationInvocationReceipts(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	plan EvaluationPlanRecord,
	attempts []EvaluationAttemptRecord,
	condition string,
	args ...any,
) ([]EvaluationInvocationReceiptRecord, error) {
	queryArgs := append([]any{namespaceID, partition.PlanDigest, partition.RepositoryCommit}, args...)
	rows, err := queryer.QueryContext(ctx, `SELECT attempt_id, descriptor_digest, target_id,
		provider_configuration_id, model_lineage_digest, provider_request_id,
		execution_failure_authority_receipt_digest, transport_receipt_digest,
		resolved_model_id, resolved_model_version, resolved_model_identity_digest,
		invocation_outcome, invocation_receipt_digest,
		response_artifact_digest, evidence_digest, evidence_bytes, started_at, completed_at
	FROM agent_evaluation_invocation_receipts
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3`+condition+`
	ORDER BY attempt_id ASC`, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	planFact, err := decodeEvaluationPlan(plan.FactBytes)
	if err != nil {
		return nil, err
	}
	attemptByID := make(map[string]evaluationAttemptFact, len(attempts))
	for _, record := range attempts {
		attempt, err := decodeEvaluationAttempt(record.FactBytes)
		if err != nil {
			return nil, err
		}
		attemptByID[attempt.AttemptID] = attempt
	}
	records := make([]EvaluationInvocationReceiptRecord, 0)
	seenAttempts, seenDescriptors, seenInvocationDigests, seenEvidenceDigests := map[string]struct{}{}, map[string]struct{}{}, map[string]struct{}{}, map[string]struct{}{}
	for rows.Next() {
		var columns EvaluationInvocationReceiptRecord
		var providerRequestID, failureAuthorityDigest, resolvedModelID, resolvedModelVersion, responseArtifactDigest sql.NullString
		var source []byte
		if err := rows.Scan(&columns.AttemptID, &columns.DescriptorDigest, &columns.TargetID,
			&columns.ProviderConfigurationID, &columns.ModelLineageDigest, &providerRequestID,
			&failureAuthorityDigest, &columns.TransportReceiptDigest, &resolvedModelID, &resolvedModelVersion,
			&columns.ResolvedModelIdentityDigest, &columns.InvocationOutcome, &columns.InvocationReceiptDigest, &responseArtifactDigest,
			&columns.EvidenceDigest, &source, &columns.StartedAt, &columns.CompletedAt); err != nil {
			return nil, err
		}
		columns.ProviderRequestID = providerRequestID.String
		columns.ExecutionFailureAuthorityReceiptDigest = failureAuthorityDigest.String
		columns.ResolvedModelID, columns.ResolvedModelVersion = resolvedModelID.String, resolvedModelVersion.String
		columns.ResponseArtifactDigest = responseArtifactDigest.String
		decoded, err := decodeEvaluationInvocationReceipt(source)
		if err != nil {
			return nil, fmt.Errorf("decode persisted invocation receipt: %w", err)
		}
		attempt, exists := attemptByID[columns.AttemptID]
		if !exists {
			return nil, conflict("persisted invocation receipt has no exact durable attempt")
		}
		if err := validateEvaluationInvocationBinding(planFact, attempt, decoded); err != nil {
			return nil, err
		}
		if !bytes.Equal(source, decoded.EvidenceBytes) || decoded.PlanDigest != partition.PlanDigest ||
			decoded.RepositoryCommit != partition.RepositoryCommit || columns.AttemptID != decoded.AttemptID ||
			columns.DescriptorDigest != decoded.DescriptorDigest || columns.TargetID != attempt.TargetID ||
			columns.ProviderConfigurationID != decoded.ProviderConfigurationID || columns.ModelLineageDigest != decoded.ModelLineageDigest ||
			columns.ProviderRequestID != decoded.ProviderRequestID ||
			columns.ExecutionFailureAuthorityReceiptDigest != decoded.ExecutionFailureAuthorityReceiptDigest ||
			columns.TransportReceiptDigest != decoded.TransportReceiptDigest ||
			columns.ResolvedModelID != decoded.ResolvedModelID || columns.ResolvedModelVersion != decoded.ResolvedModelVersion ||
			columns.ResolvedModelIdentityDigest != decoded.ResolvedModelIdentityDigest ||
			columns.InvocationOutcome != decoded.InvocationOutcome ||
			columns.InvocationReceiptDigest != decoded.InvocationReceiptDigest ||
			columns.ResponseArtifactDigest != decoded.ResponseArtifactDigest || columns.EvidenceDigest != decoded.EvidenceDigest ||
			!columns.StartedAt.Equal(decoded.StartedAt) || !columns.CompletedAt.Equal(decoded.CompletedAt) {
			return nil, conflict("persisted invocation receipt metadata drifted from its canonical bytes")
		}
		for _, identity := range []struct {
			value string
			seen  map[string]struct{}
		}{
			{columns.AttemptID, seenAttempts}, {columns.DescriptorDigest, seenDescriptors},
			{columns.InvocationReceiptDigest, seenInvocationDigests}, {columns.EvidenceDigest, seenEvidenceDigests},
		} {
			if _, exists := identity.seen[identity.value]; exists {
				return nil, conflict("evaluation invocation partition contains duplicate immutable identities")
			}
			identity.seen[identity.value] = struct{}{}
		}
		columns.NamespaceID, columns.PlanDigest, columns.RepositoryCommit = namespaceID, partition.PlanDigest, partition.RepositoryCommit
		columns.EvidenceBytes = append([]byte(nil), source...)
		records = append(records, columns)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Slice(records, func(left, right int) bool {
		return records[left].AttemptID < records[right].AttemptID
	})
	return records, nil
}

func queryEvaluationSourceReceipts(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	plan EvaluationPlanRecord,
	condition string,
	args ...any,
) ([]EvaluationSourceReceiptRecord, error) {
	queryArgs := append([]any{namespaceID, partition.PlanDigest, partition.RepositoryCommit}, args...)
	rows, err := queryer.QueryContext(ctx, `SELECT source_receipt_id, source_kind, provider_configuration_id,
		model_lineage_digest, provider_request_id, execution_failure_authority_receipt_digest,
		source_uri, source_content_digest,
		receipt_digest, receipt_bytes, observed_at
	FROM agent_evaluation_source_receipts
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3`+condition+`
	ORDER BY source_receipt_id ASC`, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	planFact, err := decodeEvaluationPlan(plan.FactBytes)
	if err != nil {
		return nil, err
	}
	records := make([]EvaluationSourceReceiptRecord, 0)
	seenIDs, seenDigests, seenContent := map[string]struct{}{}, map[string]struct{}{}, map[string]struct{}{}
	for rows.Next() {
		var columns EvaluationSourceReceiptRecord
		var modelLineageDigest, providerRequestID, failureAuthorityDigest, sourceURI sql.NullString
		var source []byte
		if err := rows.Scan(&columns.SourceReceiptID, &columns.SourceKind, &columns.ProviderConfigurationID,
			&modelLineageDigest, &providerRequestID, &failureAuthorityDigest, &sourceURI, &columns.SourceContentDigest,
			&columns.ReceiptDigest, &source, &columns.ObservedAt); err != nil {
			return nil, err
		}
		columns.ModelLineageDigest, columns.ProviderRequestID = modelLineageDigest.String, providerRequestID.String
		columns.ExecutionFailureAuthorityReceiptDigest, columns.SourceURI = failureAuthorityDigest.String, sourceURI.String
		decoded, err := decodeEvaluationSourceReceipt(source)
		if err != nil {
			return nil, fmt.Errorf("decode persisted source receipt: %w", err)
		}
		if err := validateEvaluationSourceBinding(planFact, decoded); err != nil {
			return nil, err
		}
		if !bytes.Equal(source, decoded.ReceiptBytes) || decoded.PlanDigest != partition.PlanDigest ||
			decoded.RepositoryCommit != partition.RepositoryCommit || columns.SourceReceiptID != decoded.SourceReceiptID ||
			columns.SourceKind != decoded.SourceKind || columns.ProviderConfigurationID != decoded.ProviderConfigurationID ||
			columns.ModelLineageDigest != decoded.ModelLineageDigest || columns.ProviderRequestID != decoded.ProviderRequestID ||
			columns.ExecutionFailureAuthorityReceiptDigest != decoded.ExecutionFailureAuthorityReceiptDigest ||
			columns.SourceURI != decoded.SourceURI || columns.SourceContentDigest != decoded.SourceContentDigest ||
			columns.ReceiptDigest != decoded.ReceiptDigest || !columns.ObservedAt.Equal(decoded.ObservedAt) {
			return nil, conflict("persisted source receipt metadata drifted from its canonical bytes")
		}
		for _, identity := range []struct {
			value string
			seen  map[string]struct{}
		}{
			{columns.SourceReceiptID, seenIDs}, {columns.ReceiptDigest, seenDigests}, {columns.SourceContentDigest, seenContent},
		} {
			if _, exists := identity.seen[identity.value]; exists {
				return nil, conflict("evaluation source partition contains duplicate immutable identities")
			}
			identity.seen[identity.value] = struct{}{}
		}
		columns.NamespaceID, columns.PlanDigest, columns.RepositoryCommit = namespaceID, partition.PlanDigest, partition.RepositoryCommit
		columns.ReceiptBytes = append([]byte(nil), source...)
		records = append(records, columns)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Slice(records, func(left, right int) bool {
		return records[left].SourceReceiptID < records[right].SourceReceiptID
	})
	return records, nil
}

func queryEvaluationExecutionReceipts(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	plan EvaluationPlanRecord,
	attempts []EvaluationAttemptRecord,
	condition string,
	args ...any,
) ([]EvaluationExecutionReceiptRecord, error) {
	queryArgs := append([]any{namespaceID, partition.PlanDigest, partition.RepositoryCommit}, args...)
	rows, err := queryer.QueryContext(ctx, `SELECT execution_receipt_id, attempt_id, descriptor_digest,
		model_invocations, tool_calls, repair_rounds, transactions, artifact_bytes, elapsed_ms,
		tool_receipt_set_digest, transaction_receipt_set_digest, verification_closure_digest,
		receipt_digest, receipt_bytes
	FROM agent_evaluation_execution_receipts
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3`+condition+`
	ORDER BY attempt_id ASC`, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	planFact, err := decodeEvaluationPlan(plan.FactBytes)
	if err != nil {
		return nil, err
	}
	attemptByID := make(map[string]evaluationAttemptFact, len(attempts))
	for _, record := range attempts {
		attempt, err := decodeEvaluationAttempt(record.FactBytes)
		if err != nil {
			return nil, err
		}
		attemptByID[attempt.AttemptID] = attempt
	}
	records := make([]EvaluationExecutionReceiptRecord, 0)
	seenAttempts, seenIDs, seenDigests := map[string]struct{}{}, map[string]struct{}{}, map[string]struct{}{}
	for rows.Next() {
		var columns EvaluationExecutionReceiptRecord
		var toolSet, transactionSet, closure sql.NullString
		var source []byte
		if err := rows.Scan(&columns.ExecutionReceiptID, &columns.AttemptID, &columns.DescriptorDigest,
			&columns.ModelInvocations, &columns.ToolCalls, &columns.RepairRounds, &columns.Transactions,
			&columns.ArtifactBytes, &columns.ElapsedMS, &toolSet, &transactionSet, &closure,
			&columns.ReceiptDigest, &source); err != nil {
			return nil, err
		}
		columns.ToolReceiptSetDigest, columns.TransactionReceiptSetDigest, columns.VerificationClosureDigest = toolSet.String, transactionSet.String, closure.String
		decoded, err := decodeEvaluationExecutionReceipt(source)
		if err != nil {
			return nil, fmt.Errorf("decode persisted execution receipt: %w", err)
		}
		attempt, exists := attemptByID[columns.AttemptID]
		if !exists {
			return nil, conflict("persisted execution receipt has no exact durable attempt")
		}
		if err := validateEvaluationExecutionBinding(planFact, attempt, decoded); err != nil {
			return nil, err
		}
		if !bytes.Equal(source, decoded.ReceiptBytes) || decoded.PlanDigest != partition.PlanDigest ||
			decoded.RepositoryCommit != partition.RepositoryCommit || columns.ExecutionReceiptID != decoded.ExecutionReceiptID ||
			columns.AttemptID != decoded.AttemptID || columns.DescriptorDigest != decoded.DescriptorDigest ||
			columns.ModelInvocations != decoded.ModelInvocations || columns.ToolCalls != decoded.ToolCalls ||
			columns.RepairRounds != decoded.RepairRounds || columns.Transactions != decoded.Transactions ||
			columns.ArtifactBytes != decoded.ArtifactBytes || columns.ElapsedMS != decoded.ElapsedMS ||
			columns.ToolReceiptSetDigest != decoded.ToolReceiptSetDigest ||
			columns.TransactionReceiptSetDigest != decoded.TransactionReceiptSetDigest ||
			columns.VerificationClosureDigest != decoded.VerificationClosureDigest || columns.ReceiptDigest != decoded.ReceiptDigest {
			return nil, conflict("persisted execution receipt metadata drifted from its canonical bytes")
		}
		for _, identity := range []struct {
			value string
			seen  map[string]struct{}
		}{
			{columns.AttemptID, seenAttempts}, {columns.ExecutionReceiptID, seenIDs}, {columns.ReceiptDigest, seenDigests},
		} {
			if _, exists := identity.seen[identity.value]; exists {
				return nil, conflict("evaluation execution partition contains duplicate immutable identities")
			}
			identity.seen[identity.value] = struct{}{}
		}
		columns.NamespaceID, columns.PlanDigest, columns.RepositoryCommit = namespaceID, partition.PlanDigest, partition.RepositoryCommit
		columns.ReceiptBytes = append([]byte(nil), source...)
		records = append(records, columns)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Slice(records, func(left, right int) bool {
		return records[left].AttemptID < records[right].AttemptID
	})
	return records, nil
}

func queryEvaluationAuthorityAttestation(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	plan EvaluationPlanRecord,
) (*EvaluationAuthorityAttestationRecord, error) {
	if err := ensureEvaluationV46EligiblePartition(ctx, queryer, namespaceID, partition); err != nil {
		return nil, err
	}
	rows, err := queryer.QueryContext(ctx, `SELECT authority_id, key_id, evidence_set_digest,
		v46.capability_probe_admission_set_digest,v46.capability_probe_reference_receipt_set_digest,
		v46.runtime_fact_source_owner_registration_set_digest,
		v46.capability_probe_provider_resource_cleanup_set_digest,
		v46.hosted_retrieval_runtime_resource_lifecycle_journal_set_digest,
		v46.hosted_retrieval_runtime_resource_lifecycle_budget_closure_binding_set_digest,
		v46.hosted_retrieval_runtime_resource_cleanup_set_digest,
		v46.capability_effect_provider_runtime_journal_set_digest,
		v46.optional_capability_fact_source_set_digest,
		v46.optional_capability_fact_authority_set_digest,
		endpoint_smoke_dispatch_intent_set_digest, endpoint_smoke_transport_receipt_set_digest,
		endpoint_smoke_result_spool_receipt_set_digest, endpoint_smoke_result_spool_disposition_receipt_set_digest,
		endpoint_smoke_validation_failure_receipt_set_digest,
		endpoint_smoke_set_digest, pre_dispatch_failure_receipt_set_digest,
		transport_dispatch_intent_set_digest, transport_receipt_set_digest,
		provider_result_spool_receipt_set_digest, provider_result_spool_disposition_receipt_set_digest,
		invocation_turn_receipt_set_digest, invocation_turn_set_receipt_set_digest,
		result_submission_receipt_set_digest, v46.attempt_authority_owner_receipt_set_digest,
		controlled_runtime_receipt_set_digest, capability_execution_receipt_set_digest,
		v46.capability_specific_receipt_set_digest, v46.provider_capability_observation_receipt_set_digest,
		verification_attempt_grant_receipt_set_digest,
		validated_human_review_artifact_set_digest, v46.validated_human_metric_observation_set_digest,
		review_lease_digest,
		review_raster_scan_receipt_set_digest, review_candidate_ref_set_digest,
		blind_review_mapping_set_digest, source_receipt_set_digest, execution_receipt_set_digest,
		holdout_execution_receipt_digest, secret_canary_set_digest, protected_holdout_canary_set_digest,
		base.attestation_digest, attestation_bytes, issued_at
	FROM agent_evaluation_authority_attestations base
	JOIN agent_evaluation_authority_attestation_v46_roots v46
		ON v46.namespace_id=base.namespace_id AND v46.plan_digest=base.plan_digest
		AND v46.attestation_digest=base.attestation_digest
	WHERE base.namespace_id = $1 AND base.plan_digest = $2 AND base.repository_commit = $3
		AND base.v46_eligible`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationAuthorityAttestationRecord, 0, 1)
	for rows.Next() {
		var columns EvaluationAuthorityAttestationRecord
		var reviewLeaseDigest sql.NullString
		var source []byte
		if err := rows.Scan(&columns.AuthorityID, &columns.KeyID, &columns.EvidenceSetDigest,
			&columns.CapabilityProbeAdmissionSetDigest, &columns.CapabilityProbeReferenceReceiptSetDigest,
			&columns.RuntimeFactSourceOwnerRegistrationSetDigest,
			&columns.CapabilityProbeProviderResourceCleanupSetDigest,
			&columns.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest,
			&columns.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest,
			&columns.HostedRetrievalRuntimeResourceCleanupSetDigest,
			&columns.CapabilityEffectProviderRuntimeJournalSetDigest,
			&columns.OptionalCapabilityFactSourceSetDigest,
			&columns.OptionalCapabilityFactAuthoritySetDigest,
			&columns.EndpointSmokeDispatchIntentSetDigest, &columns.EndpointSmokeTransportReceiptSetDigest,
			&columns.EndpointSmokeResultSpoolReceiptSetDigest, &columns.EndpointSmokeResultSpoolDispositionReceiptSetDigest,
			&columns.EndpointSmokeValidationFailureReceiptSetDigest,
			&columns.EndpointSmokeSetDigest, &columns.PreDispatchFailureReceiptSetDigest,
			&columns.TransportDispatchIntentSetDigest, &columns.TransportReceiptSetDigest,
			&columns.ProviderResultSpoolReceiptSetDigest, &columns.ProviderResultSpoolDispositionReceiptSetDigest,
			&columns.InvocationTurnReceiptSetDigest, &columns.InvocationTurnSetReceiptSetDigest,
			&columns.ResultSubmissionReceiptSetDigest, &columns.AttemptAuthorityOwnerReceiptSetDigest,
			&columns.ControlledRuntimeReceiptSetDigest, &columns.CapabilityExecutionReceiptSetDigest,
			&columns.CapabilitySpecificReceiptSetDigest, &columns.ProviderCapabilityObservationReceiptSetDigest,
			&columns.VerificationAttemptGrantReceiptSetDigest,
			&columns.ValidatedHumanReviewArtifactSetDigest, &columns.ValidatedHumanMetricObservationSetDigest,
			&reviewLeaseDigest,
			&columns.ReviewRasterScanReceiptSetDigest, &columns.ReviewCandidateRefSetDigest,
			&columns.BlindReviewMappingSetDigest,
			&columns.SourceReceiptSetDigest, &columns.ExecutionReceiptSetDigest,
			&columns.HoldoutExecutionReceiptDigest, &columns.SecretCanarySetDigest, &columns.ProtectedHoldoutCanarySetDigest,
			&columns.AttestationDigest, &source, &columns.IssuedAt); err != nil {
			return nil, err
		}
		columns.ReviewLeaseDigest = reviewLeaseDigest.String
		decoded, err := decodeEvaluationAuthorityAttestation(source)
		if err != nil {
			return nil, fmt.Errorf("decode persisted authority attestation: %w", err)
		}
		if !bytes.Equal(source, decoded.AttestationBytes) || decoded.PlanDigest != plan.PlanDigest ||
			decoded.RepositoryCommit != partition.RepositoryCommit || columns.AuthorityID != decoded.AuthorityID ||
			columns.KeyID != decoded.KeyID || columns.EvidenceSetDigest != decoded.EvidenceSetDigest ||
			columns.CapabilityProbeAdmissionSetDigest != decoded.CapabilityProbeAdmissionSetDigest ||
			columns.CapabilityProbeReferenceReceiptSetDigest != decoded.CapabilityProbeReferenceReceiptSetDigest ||
			columns.RuntimeFactSourceOwnerRegistrationSetDigest != decoded.RuntimeFactSourceOwnerRegistrationSetDigest ||
			columns.CapabilityProbeProviderResourceCleanupSetDigest != decoded.CapabilityProbeProviderResourceCleanupSetDigest ||
			columns.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest != decoded.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest ||
			columns.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest != decoded.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest ||
			columns.HostedRetrievalRuntimeResourceCleanupSetDigest != decoded.HostedRetrievalRuntimeResourceCleanupSetDigest ||
			columns.CapabilityEffectProviderRuntimeJournalSetDigest != decoded.CapabilityEffectProviderRuntimeJournalSetDigest ||
			columns.OptionalCapabilityFactSourceSetDigest != decoded.OptionalCapabilityFactSourceSetDigest ||
			columns.OptionalCapabilityFactAuthoritySetDigest != decoded.OptionalCapabilityFactAuthoritySetDigest ||
			columns.EndpointSmokeDispatchIntentSetDigest != decoded.EndpointSmokeDispatchIntentSetDigest ||
			columns.EndpointSmokeTransportReceiptSetDigest != decoded.EndpointSmokeTransportReceiptSetDigest ||
			columns.EndpointSmokeResultSpoolReceiptSetDigest != decoded.EndpointSmokeResultSpoolReceiptSetDigest ||
			columns.EndpointSmokeResultSpoolDispositionReceiptSetDigest != decoded.EndpointSmokeResultSpoolDispositionReceiptSetDigest ||
			columns.EndpointSmokeValidationFailureReceiptSetDigest != decoded.EndpointSmokeValidationFailureReceiptSetDigest ||
			columns.EndpointSmokeSetDigest != decoded.EndpointSmokeSetDigest ||
			columns.PreDispatchFailureReceiptSetDigest != decoded.PreDispatchFailureReceiptSetDigest ||
			columns.TransportDispatchIntentSetDigest != decoded.TransportDispatchIntentSetDigest ||
			columns.TransportReceiptSetDigest != decoded.TransportReceiptSetDigest ||
			columns.ProviderResultSpoolReceiptSetDigest != decoded.ProviderResultSpoolReceiptSetDigest ||
			columns.ProviderResultSpoolDispositionReceiptSetDigest != decoded.ProviderResultSpoolDispositionReceiptSetDigest ||
			columns.InvocationTurnReceiptSetDigest != decoded.InvocationTurnReceiptSetDigest ||
			columns.InvocationTurnSetReceiptSetDigest != decoded.InvocationTurnSetReceiptSetDigest ||
			columns.ResultSubmissionReceiptSetDigest != decoded.ResultSubmissionReceiptSetDigest ||
			columns.AttemptAuthorityOwnerReceiptSetDigest != decoded.AttemptAuthorityOwnerReceiptSetDigest ||
			columns.ControlledRuntimeReceiptSetDigest != decoded.ControlledRuntimeReceiptSetDigest ||
			columns.CapabilityExecutionReceiptSetDigest != decoded.CapabilityExecutionReceiptSetDigest ||
			columns.CapabilitySpecificReceiptSetDigest != decoded.CapabilitySpecificReceiptSetDigest ||
			columns.ProviderCapabilityObservationReceiptSetDigest != decoded.ProviderCapabilityObservationReceiptSetDigest ||
			columns.VerificationAttemptGrantReceiptSetDigest != decoded.VerificationAttemptGrantReceiptSetDigest ||
			columns.ValidatedHumanReviewArtifactSetDigest != decoded.ValidatedHumanReviewArtifactSetDigest ||
			columns.ValidatedHumanMetricObservationSetDigest != decoded.ValidatedHumanMetricObservationSetDigest ||
			columns.ReviewLeaseDigest != decoded.ReviewLeaseDigest ||
			columns.ReviewRasterScanReceiptSetDigest != decoded.ReviewRasterScanReceiptSetDigest ||
			columns.ReviewCandidateRefSetDigest != decoded.ReviewCandidateRefSetDigest ||
			columns.BlindReviewMappingSetDigest != decoded.BlindReviewMappingSetDigest ||
			columns.SourceReceiptSetDigest != decoded.SourceReceiptSetDigest ||
			columns.ExecutionReceiptSetDigest != decoded.ExecutionReceiptSetDigest ||
			columns.HoldoutExecutionReceiptDigest != decoded.HoldoutExecutionReceiptDigest ||
			columns.SecretCanarySetDigest != decoded.SecretCanarySetDigest ||
			columns.ProtectedHoldoutCanarySetDigest != decoded.ProtectedHoldoutCanarySetDigest ||
			columns.AttestationDigest != decoded.AttestationDigest || !columns.IssuedAt.Equal(decoded.IssuedAt) {
			return nil, conflict("persisted authority attestation metadata drifted from its canonical bytes")
		}
		columns.NamespaceID, columns.PlanDigest, columns.RepositoryCommit = namespaceID, partition.PlanDigest, partition.RepositoryCommit
		columns.AttestationBytes = append([]byte(nil), source...)
		records = append(records, columns)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return nil, nil
	}
	if len(records) != 1 {
		return nil, conflict("evaluation partition contains duplicate authority attestations")
	}
	return &records[0], nil
}

func queryEvaluationEvidenceRoot(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	plan EvaluationPlanRecord,
) (*EvaluationEvidenceRootRecord, error) {
	if err := ensureEvaluationV46EligiblePartition(ctx, queryer, namespaceID, partition); err != nil {
		return nil, err
	}
	rows, err := queryer.QueryContext(ctx, `SELECT root_id, evidence_set_digest,
		v46.capability_probe_admission_set_digest,v46.capability_probe_reference_receipt_set_digest,
		v46.runtime_fact_source_owner_registration_set_digest,
		v46.capability_probe_provider_resource_cleanup_set_digest,
		v46.hosted_retrieval_runtime_resource_lifecycle_journal_set_digest,
		v46.hosted_retrieval_runtime_resource_lifecycle_budget_closure_binding_set_digest,
		v46.hosted_retrieval_runtime_resource_cleanup_set_digest,
		v46.capability_effect_provider_runtime_journal_set_digest,
		v46.optional_capability_fact_source_set_digest,
		v46.optional_capability_fact_authority_set_digest,
		endpoint_smoke_dispatch_intent_set_digest, endpoint_smoke_transport_receipt_set_digest,
		endpoint_smoke_result_spool_receipt_set_digest, endpoint_smoke_result_spool_disposition_receipt_set_digest,
		endpoint_smoke_validation_failure_receipt_set_digest, endpoint_smoke_set_digest,
		pre_dispatch_failure_receipt_set_digest, transport_dispatch_intent_set_digest, transport_receipt_set_digest,
		provider_result_spool_receipt_set_digest, provider_result_spool_disposition_receipt_set_digest,
		invocation_turn_receipt_set_digest, invocation_turn_set_receipt_set_digest,
		result_submission_receipt_set_digest, v46.attempt_authority_owner_receipt_set_digest,
		controlled_runtime_receipt_set_digest, capability_execution_receipt_set_digest,
		v46.capability_specific_receipt_set_digest, v46.provider_capability_observation_receipt_set_digest,
		verification_attempt_grant_receipt_set_digest,
		validated_human_review_artifact_set_digest, v46.validated_human_metric_observation_set_digest,
		review_lease_digest,
		review_raster_scan_receipt_set_digest, review_candidate_ref_set_digest,
		blind_review_mapping_set_digest, source_receipt_set_digest, execution_receipt_set_digest,
		holdout_execution_receipt_digest, secret_canary_set_digest, protected_holdout_canary_set_digest,
		base.authority_attestation_digest, evaluation_manifest_digest, bundle_digest,
		bundle_artifact_digest, bundle_artifact_size, base.root_digest, root_bytes, recorded_at
	FROM agent_evaluation_evidence_roots base
	JOIN agent_evaluation_evidence_root_v46_roots v46
		ON v46.namespace_id=base.namespace_id AND v46.plan_digest=base.plan_digest
		AND v46.root_digest=base.root_digest
	WHERE base.namespace_id = $1 AND base.plan_digest = $2 AND base.repository_commit = $3
		AND base.v46_eligible`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationEvidenceRootRecord, 0, 1)
	for rows.Next() {
		var columns EvaluationEvidenceRootRecord
		var reviewLeaseDigest sql.NullString
		var source []byte
		if err := rows.Scan(&columns.RootID, &columns.EvidenceSetDigest,
			&columns.CapabilityProbeAdmissionSetDigest, &columns.CapabilityProbeReferenceReceiptSetDigest,
			&columns.RuntimeFactSourceOwnerRegistrationSetDigest,
			&columns.CapabilityProbeProviderResourceCleanupSetDigest,
			&columns.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest,
			&columns.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest,
			&columns.HostedRetrievalRuntimeResourceCleanupSetDigest,
			&columns.CapabilityEffectProviderRuntimeJournalSetDigest,
			&columns.OptionalCapabilityFactSourceSetDigest,
			&columns.OptionalCapabilityFactAuthoritySetDigest,
			&columns.EndpointSmokeDispatchIntentSetDigest, &columns.EndpointSmokeTransportReceiptSetDigest,
			&columns.EndpointSmokeResultSpoolReceiptSetDigest, &columns.EndpointSmokeResultSpoolDispositionReceiptSetDigest,
			&columns.EndpointSmokeValidationFailureReceiptSetDigest, &columns.EndpointSmokeSetDigest,
			&columns.PreDispatchFailureReceiptSetDigest, &columns.TransportDispatchIntentSetDigest, &columns.TransportReceiptSetDigest,
			&columns.ProviderResultSpoolReceiptSetDigest, &columns.ProviderResultSpoolDispositionReceiptSetDigest,
			&columns.InvocationTurnReceiptSetDigest, &columns.InvocationTurnSetReceiptSetDigest,
			&columns.ResultSubmissionReceiptSetDigest, &columns.AttemptAuthorityOwnerReceiptSetDigest,
			&columns.ControlledRuntimeReceiptSetDigest, &columns.CapabilityExecutionReceiptSetDigest,
			&columns.CapabilitySpecificReceiptSetDigest, &columns.ProviderCapabilityObservationReceiptSetDigest,
			&columns.VerificationAttemptGrantReceiptSetDigest,
			&columns.ValidatedHumanReviewArtifactSetDigest, &columns.ValidatedHumanMetricObservationSetDigest,
			&reviewLeaseDigest,
			&columns.ReviewRasterScanReceiptSetDigest, &columns.ReviewCandidateRefSetDigest,
			&columns.BlindReviewMappingSetDigest,
			&columns.SourceReceiptSetDigest, &columns.ExecutionReceiptSetDigest,
			&columns.HoldoutExecutionReceiptDigest, &columns.SecretCanarySetDigest, &columns.ProtectedHoldoutCanarySetDigest,
			&columns.AuthorityAttestationDigest, &columns.EvaluationManifestDigest, &columns.BundleDigest,
			&columns.BundleArtifactDigest, &columns.BundleArtifactSize, &columns.RootDigest, &source, &columns.RecordedAt); err != nil {
			return nil, err
		}
		columns.ReviewLeaseDigest = reviewLeaseDigest.String
		decoded, err := decodeEvaluationEvidenceRoot(source)
		if err != nil {
			return nil, fmt.Errorf("decode persisted evidence root: %w", err)
		}
		if !bytes.Equal(source, decoded.RootBytes) || decoded.PlanDigest != plan.PlanDigest ||
			decoded.RepositoryCommit != partition.RepositoryCommit || columns.RootID != decoded.RootID ||
			columns.EvidenceSetDigest != decoded.EvidenceSetDigest ||
			columns.CapabilityProbeAdmissionSetDigest != decoded.CapabilityProbeAdmissionSetDigest ||
			columns.CapabilityProbeReferenceReceiptSetDigest != decoded.CapabilityProbeReferenceReceiptSetDigest ||
			columns.RuntimeFactSourceOwnerRegistrationSetDigest != decoded.RuntimeFactSourceOwnerRegistrationSetDigest ||
			columns.CapabilityProbeProviderResourceCleanupSetDigest != decoded.CapabilityProbeProviderResourceCleanupSetDigest ||
			columns.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest != decoded.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest ||
			columns.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest != decoded.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest ||
			columns.HostedRetrievalRuntimeResourceCleanupSetDigest != decoded.HostedRetrievalRuntimeResourceCleanupSetDigest ||
			columns.CapabilityEffectProviderRuntimeJournalSetDigest != decoded.CapabilityEffectProviderRuntimeJournalSetDigest ||
			columns.OptionalCapabilityFactSourceSetDigest != decoded.OptionalCapabilityFactSourceSetDigest ||
			columns.OptionalCapabilityFactAuthoritySetDigest != decoded.OptionalCapabilityFactAuthoritySetDigest ||
			columns.EndpointSmokeDispatchIntentSetDigest != decoded.EndpointSmokeDispatchIntentSetDigest ||
			columns.EndpointSmokeTransportReceiptSetDigest != decoded.EndpointSmokeTransportReceiptSetDigest ||
			columns.EndpointSmokeResultSpoolReceiptSetDigest != decoded.EndpointSmokeResultSpoolReceiptSetDigest ||
			columns.EndpointSmokeResultSpoolDispositionReceiptSetDigest != decoded.EndpointSmokeResultSpoolDispositionReceiptSetDigest ||
			columns.EndpointSmokeValidationFailureReceiptSetDigest != decoded.EndpointSmokeValidationFailureReceiptSetDigest ||
			columns.EndpointSmokeSetDigest != decoded.EndpointSmokeSetDigest ||
			columns.PreDispatchFailureReceiptSetDigest != decoded.PreDispatchFailureReceiptSetDigest ||
			columns.TransportDispatchIntentSetDigest != decoded.TransportDispatchIntentSetDigest ||
			columns.TransportReceiptSetDigest != decoded.TransportReceiptSetDigest ||
			columns.ProviderResultSpoolReceiptSetDigest != decoded.ProviderResultSpoolReceiptSetDigest ||
			columns.ProviderResultSpoolDispositionReceiptSetDigest != decoded.ProviderResultSpoolDispositionReceiptSetDigest ||
			columns.InvocationTurnReceiptSetDigest != decoded.InvocationTurnReceiptSetDigest ||
			columns.InvocationTurnSetReceiptSetDigest != decoded.InvocationTurnSetReceiptSetDigest ||
			columns.ResultSubmissionReceiptSetDigest != decoded.ResultSubmissionReceiptSetDigest ||
			columns.AttemptAuthorityOwnerReceiptSetDigest != decoded.AttemptAuthorityOwnerReceiptSetDigest ||
			columns.ControlledRuntimeReceiptSetDigest != decoded.ControlledRuntimeReceiptSetDigest ||
			columns.CapabilityExecutionReceiptSetDigest != decoded.CapabilityExecutionReceiptSetDigest ||
			columns.CapabilitySpecificReceiptSetDigest != decoded.CapabilitySpecificReceiptSetDigest ||
			columns.ProviderCapabilityObservationReceiptSetDigest != decoded.ProviderCapabilityObservationReceiptSetDigest ||
			columns.VerificationAttemptGrantReceiptSetDigest != decoded.VerificationAttemptGrantReceiptSetDigest ||
			columns.ValidatedHumanReviewArtifactSetDigest != decoded.ValidatedHumanReviewArtifactSetDigest ||
			columns.ValidatedHumanMetricObservationSetDigest != decoded.ValidatedHumanMetricObservationSetDigest ||
			columns.ReviewLeaseDigest != decoded.ReviewLeaseDigest ||
			columns.ReviewRasterScanReceiptSetDigest != decoded.ReviewRasterScanReceiptSetDigest ||
			columns.ReviewCandidateRefSetDigest != decoded.ReviewCandidateRefSetDigest ||
			columns.BlindReviewMappingSetDigest != decoded.BlindReviewMappingSetDigest ||
			columns.SourceReceiptSetDigest != decoded.SourceReceiptSetDigest ||
			columns.ExecutionReceiptSetDigest != decoded.ExecutionReceiptSetDigest ||
			columns.HoldoutExecutionReceiptDigest != decoded.HoldoutExecutionReceiptDigest ||
			columns.SecretCanarySetDigest != decoded.SecretCanarySetDigest ||
			columns.ProtectedHoldoutCanarySetDigest != decoded.ProtectedHoldoutCanarySetDigest ||
			columns.AuthorityAttestationDigest != decoded.AuthorityAttestationDigest ||
			columns.EvaluationManifestDigest != decoded.EvaluationManifestDigest || columns.BundleDigest != decoded.BundleDigest ||
			columns.BundleArtifactDigest != decoded.BundleArtifactDigest || columns.BundleArtifactSize != decoded.BundleArtifactSize ||
			columns.RootDigest != decoded.RootDigest || !columns.RecordedAt.Equal(decoded.RecordedAt) {
			return nil, conflict("persisted evidence root metadata drifted from its canonical bytes")
		}
		columns.NamespaceID, columns.PlanDigest, columns.RepositoryCommit = namespaceID, partition.PlanDigest, partition.RepositoryCommit
		columns.RootBytes = append([]byte(nil), source...)
		records = append(records, columns)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return nil, nil
	}
	if len(records) != 1 {
		return nil, conflict("evaluation partition contains duplicate evidence roots")
	}
	return &records[0], nil
}

func evaluationAuthenticitySetDigest[T any](records []T, digest func(T) string) (string, error) {
	values := make([]string, len(records))
	for index, record := range records {
		values[index] = digest(record)
	}
	return evaluationCanonicalStringSetDigest(values)
}

func evaluationCanonicalStringSetDigest(values []string) (string, error) {
	return canonicaljson.Digest(append([]string(nil), values...))
}
