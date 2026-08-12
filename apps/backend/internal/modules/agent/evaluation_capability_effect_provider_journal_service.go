package agent

import (
	"context"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type EvaluationCapabilityEffectProviderJournalConfig struct {
	Repository      *Repository
	OwnerInstanceID string
	Clock           func() time.Time
}

// EvaluationCapabilityEffectProviderJournal owns only encrypted Provider
// runtime preimages and their durable ACK/reconciliation lifecycle. Provider
// dispatch remains owned by the 8791 executor.
type EvaluationCapabilityEffectProviderJournal struct {
	repository      *repositoryEvaluationCapabilityEffectProviderJournal
	ownerInstanceID string
	clock           func() time.Time
}

func ValidEvaluationCapabilityEffectProviderJournalOwnerInstanceID(value string) bool {
	return validEvaluationAgentControlIdentity(value)
}

func NewEvaluationCapabilityEffectProviderJournal(
	config EvaluationCapabilityEffectProviderJournalConfig,
) (*EvaluationCapabilityEffectProviderJournal, error) {
	if config.Repository == nil || config.Repository.available() != nil ||
		!ValidEvaluationCapabilityEffectProviderJournalOwnerInstanceID(config.OwnerInstanceID) {
		return nil, ErrInvalid
	}
	if _, _, err := evaluationCapabilityEffectProviderJournalAuthority(); err != nil {
		return nil, err
	}
	clock := config.Clock
	if clock == nil {
		clock = time.Now
	}
	return &EvaluationCapabilityEffectProviderJournal{
		repository: &repositoryEvaluationCapabilityEffectProviderJournal{
			repository: config.Repository, ownerInstanceID: config.OwnerInstanceID,
		},
		ownerInstanceID: config.OwnerInstanceID, clock: clock,
	}, nil
}

func (journal *EvaluationCapabilityEffectProviderJournal) AuthorityDigest() (string, error) {
	if journal == nil || journal.repository == nil {
		return "", errEvaluationServiceUnavailable
	}
	_, digest, err := evaluationCapabilityEffectProviderJournalAuthority()
	return digest, err
}

func (journal *EvaluationCapabilityEffectProviderJournal) StoreStage(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	source []byte,
) ([]byte, bool, error) {
	if journal == nil || journal.repository == nil {
		return nil, false, errEvaluationServiceUnavailable
	}
	record, err := decodeEvaluationCapabilityEffectProviderJournalStageRecord(source)
	if err != nil || record.NamespaceID != authority.NamespaceID || record.PlanDigest != partition.PlanDigest ||
		record.RepositoryCommit != partition.RepositoryCommit {
		return nil, false, ErrConflict
	}
	stored, replay, err := journal.repository.StoreStage(ctx, authority, partition, record)
	if err != nil {
		return nil, false, err
	}
	return append([]byte(nil), stored.RecordBytes...), replay, nil
}

func (journal *EvaluationCapabilityEffectProviderJournal) StoreExecution(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	source []byte,
) ([]byte, bool, error) {
	if journal == nil || journal.repository == nil {
		return nil, false, errEvaluationServiceUnavailable
	}
	record, replay, err := journal.repository.StoreExecution(ctx, authority, partition, source)
	if err != nil {
		return nil, false, err
	}
	return append([]byte(nil), record.RecordBytes...), replay, nil
}

func (journal *EvaluationCapabilityEffectProviderJournal) StoreResult(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	source []byte,
) ([]byte, bool, error) {
	if journal == nil || journal.repository == nil {
		return nil, false, errEvaluationServiceUnavailable
	}
	record, replay, err := journal.repository.StoreResult(ctx, authority, partition, source)
	if err != nil {
		return nil, false, err
	}
	return append([]byte(nil), record.RecordBytes...), replay, nil
}

func createEvaluationCapabilityEffectProviderJournalSnapshot(
	data evaluationCapabilityEffectProviderJournalSnapshotData,
	readAt time.Time,
) ([]byte, error) {
	readAt = readAt.UTC().Truncate(time.Millisecond)
	terminal := data.Result != nil || data.Abandonment != nil
	latest := data.Stage.SealedAt
	if len(data.Executions) > 0 {
		latest = data.Executions[len(data.Executions)-1].SealedAt
	}
	if data.Result != nil {
		latest = data.Result.SealedAt
	}
	if data.Abandonment != nil {
		latest = data.Abandonment.AbandonedAt
	}
	if readAt.Before(latest) || !terminal && !readAt.Before(data.Stage.ExpiresAt) {
		return nil, ErrConflict
	}
	executionValues := make([]any, len(data.Executions))
	resumableSpools := make([]any, 0, len(data.Spools))
	for index, execution := range data.Executions {
		executionValues[index] = execution.Value
		if execution.SpoolReceipt == nil {
			if _, exists := data.Spools[execution.ExecutionSequence]; exists {
				return nil, ErrConflict
			}
			continue
		}
		spoolEnvelope, exists := data.Spools[execution.ExecutionSequence]
		if terminal {
			if exists {
				return nil, ErrConflict
			}
			continue
		}
		if !exists || !readAt.Before(execution.SpoolReceipt.ExpiresAt) {
			return nil, ErrConflict
		}
		base := map[string]any{
			"format": evaluationCapabilityEffectProviderJournalResumableFormat, "version": int64(1),
			"executionSequence":     execution.ExecutionSequence,
			"executionRecordDigest": execution.RecordDigest,
			"spoolAadDigest":        execution.SpoolAADDigest,
			"spoolEnvelope":         spoolEnvelope,
		}
		digest, err := canonicaljson.Digest(base)
		if err != nil {
			return nil, err
		}
		value := cloneEvaluationObject(base)
		value["spoolDigest"] = digest
		resumableSpools = append(resumableSpools, value)
	}
	if !terminal && len(resumableSpools) != len(data.Spools) || terminal && len(data.Spools) != 0 {
		return nil, ErrConflict
	}
	resultValue := any(nil)
	if data.Result != nil {
		resultValue = data.Result.Value
	}
	abandonmentValue := any(nil)
	if data.Abandonment != nil {
		abandonmentValue = data.Abandonment.Value
	}
	base := map[string]any{
		"format": evaluationCapabilityEffectProviderJournalSnapshotFormat, "version": int64(1),
		"ownerRequestDigest": data.Stage.OwnerRequestDigest, "stageRecord": data.Stage.Value,
		"executionRecords": executionValues, "resultRecord": resultValue,
		"abandonmentRecord": abandonmentValue, "resumableSpools": resumableSpools,
		"readAt": evaluationCapabilityEffectProviderJournalInstant(readAt),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, err
	}
	value := cloneEvaluationObject(base)
	value["snapshotDigest"] = digest
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || len(canonical) > maximumEvaluationCapabilityEffectProviderJournalSnapshotBytes {
		return nil, ErrConflict
	}
	return canonical, nil
}

func (journal *EvaluationCapabilityEffectProviderJournal) Snapshot(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	ownerRequestDigest string,
) ([]byte, error) {
	if journal == nil || journal.repository == nil || !evaluationDigestPattern.MatchString(ownerRequestDigest) {
		return nil, errEvaluationServiceUnavailable
	}
	data, err := journal.repository.LoadSnapshot(ctx, authority, partition, ownerRequestDigest)
	if err != nil {
		return nil, err
	}
	return createEvaluationCapabilityEffectProviderJournalSnapshot(data, journal.clock())
}

func (journal *EvaluationCapabilityEffectProviderJournal) Cleanup(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	source []byte,
) ([]byte, bool, error) {
	if journal == nil || journal.repository == nil {
		return nil, false, errEvaluationServiceUnavailable
	}
	request, err := decodeEvaluationCapabilityEffectProviderJournalCleanupRequest(source)
	if err != nil || request.NamespaceID != authority.NamespaceID || request.PlanDigest != partition.PlanDigest ||
		request.RepositoryCommit != partition.RepositoryCommit {
		return nil, false, ErrConflict
	}
	completedAt := journal.clock().UTC().Truncate(time.Millisecond)
	if completedAt.Before(request.RequestedAt) || completedAt.Sub(request.RequestedAt) > maximumEvaluationCapabilityEffectProviderSpoolLifetime {
		return nil, false, ErrConflict
	}
	receipt, replay, err := journal.repository.StoreCleanup(ctx, authority, partition, request, completedAt)
	if err != nil {
		return nil, false, err
	}
	return append([]byte(nil), receipt.Bytes...), replay, nil
}

func (journal *EvaluationCapabilityEffectProviderJournal) Health(
	ctx context.Context,
	authority EvaluationAuthority,
) ([]byte, bool, error) {
	if journal == nil || journal.repository == nil {
		return nil, false, errEvaluationServiceUnavailable
	}
	checkedAt := journal.clock().UTC().Truncate(time.Millisecond)
	summary, err := journal.repository.Summary(ctx, authority, checkedAt)
	if err != nil {
		return nil, false, err
	}
	value, canonical, err := createEvaluationCapabilityEffectProviderJournalHealth(journal.ownerInstanceID, summary, checkedAt)
	if err != nil {
		return nil, false, err
	}
	return canonical, stringMember(value, "status") == "healthy", nil
}

func (journal *EvaluationCapabilityEffectProviderJournal) ZeroResidual(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	attemptID string,
) ([]byte, error) {
	if journal == nil || journal.repository == nil || !validEvaluationAgentControlIdentity(attemptID) {
		return nil, errEvaluationServiceUnavailable
	}
	summary, err := journal.repository.AttemptSummary(ctx, authority, partition, attemptID)
	if err != nil {
		return nil, err
	}
	_, canonical, err := createEvaluationCapabilityEffectProviderJournalZeroResidual(
		partition, authority.NamespaceID, attemptID, summary, journal.clock(),
	)
	return canonical, err
}
