package agent

import (
	"context"
	"time"
)

type EvaluationHostedRetrievalRuntimeResourceConfig struct {
	Repository               *Repository
	LifecycleOwnerInstanceID string
	Clock                    func() time.Time
}

// EvaluationHostedRetrievalRuntimeResource owns the durable hosted retrieval
// resource ledger. Its preactivation health is derived from a fresh database
// summary and does not require a frozen run or a Provider credential.
type EvaluationHostedRetrievalRuntimeResource struct {
	repository               *Repository
	lifecycleOwnerInstanceID string
	clock                    func() time.Time
}

func ValidEvaluationHostedRetrievalRuntimeResourceLifecycleOwnerInstanceID(value string) bool {
	return validEvaluationAgentControlIdentity(value)
}

func (owner *EvaluationHostedRetrievalRuntimeResource) loadStorageSummary(
	ctx context.Context,
	namespaceID string,
	checkedAt time.Time,
) (evaluationHostedRetrievalRuntimeResourceOwnerStorageSummary, error) {
	var summary evaluationHostedRetrievalRuntimeResourceOwnerStorageSummary
	err := owner.repository.db.QueryRowContext(ctx, `SELECT * FROM
		agent_evaluation_hosted_runtime_resource_owner_storage_summary($1,$2)`,
		namespaceID, checkedAt).Scan(
		&summary.LedgerRevision,
		&summary.RegistrationCount,
		&summary.ActiveResourceCount,
		&summary.ActiveReadLeaseCount,
		&summary.UnfinishedCleanupCount,
		&summary.OverdueCount,
	)
	return summary, err
}

func NewEvaluationHostedRetrievalRuntimeResource(
	config EvaluationHostedRetrievalRuntimeResourceConfig,
) (*EvaluationHostedRetrievalRuntimeResource, error) {
	if config.Repository == nil || config.Repository.available() != nil {
		return nil, ErrInvalid
	}
	if err := evaluationHostedRetrievalRuntimeResourceOwnerContract(); err != nil {
		return nil, err
	}
	clock := config.Clock
	if clock == nil {
		clock = time.Now
	}
	if config.LifecycleOwnerInstanceID != "" &&
		!ValidEvaluationHostedRetrievalRuntimeResourceLifecycleOwnerInstanceID(config.LifecycleOwnerInstanceID) {
		return nil, ErrInvalid
	}
	return &EvaluationHostedRetrievalRuntimeResource{
		repository: config.Repository, lifecycleOwnerInstanceID: config.LifecycleOwnerInstanceID, clock: clock,
	}, nil
}

func (owner *EvaluationHostedRetrievalRuntimeResource) Health(
	ctx context.Context,
	authority EvaluationAuthority,
) ([]byte, error) {
	if owner == nil || owner.repository == nil || owner.repository.available() != nil || validateEvaluationAuthority(authority) != nil {
		return nil, errEvaluationServiceUnavailable
	}
	// The public receipt advertises the complete durable owner. Activation stays
	// fail-closed whenever this build does not contain every advertised operation.
	if !evaluationHostedRetrievalRuntimeResourceLiveOperationsComplete {
		return nil, errEvaluationServiceUnavailable
	}
	checkedAt := owner.clock().UTC().Truncate(time.Millisecond)
	if checkedAt.IsZero() {
		return nil, errEvaluationServiceUnavailable
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	summary, err := owner.loadStorageSummary(ctx, authority.NamespaceID, checkedAt)
	if err != nil {
		return nil, errEvaluationServiceUnavailable
	}
	if !evaluationHostedRetrievalRuntimeResourceOwnerHealthReady(summary) {
		return nil, errEvaluationServiceUnavailable
	}
	return createEvaluationHostedRetrievalRuntimeResourceOwnerHealthReceipt(authority.NamespaceID, summary, checkedAt)
}
