package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type EvaluationAuthorityAttestationVerification struct {
	AuthorityID           string
	KeyID                 string
	Algorithm             string
	AttestedPayloadDigest string
	AttestedPayloadBytes  []byte
	SignatureBase64URL    string
}

// EvaluationAuthorityAttestationVerifier is supplied by the caller's trusted
// key owner. Persistence requires a successful external Ed25519 verification;
// the database intentionally does not own or discover trust roots.
type EvaluationAuthorityAttestationVerifier func(
	context.Context,
	EvaluationAuthorityAttestationVerification,
) error

func validateEvaluationAuthenticityWriteInput(repository *Repository, authority EvaluationAuthority, partition EvaluationPlanPartition) error {
	if err := repository.available(); err != nil {
		return err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return err
	}
	return validateEvaluationPartition(partition)
}

func (repository *Repository) StoreEvaluationEndpointSmokeReceipt(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	receiptBytes []byte,
) (EvaluationEndpointSmokeReceiptRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationEndpointSmokeReceiptRecord{}, false, err
	}
	receipt, err := decodeEvaluationEndpointSmokeReceipt(receiptBytes)
	if err != nil {
		return EvaluationEndpointSmokeReceiptRecord{}, false, err
	}
	writeContext, cancel, tx, _, plan, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationEndpointSmokeReceiptRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := ensureEvaluationAuthenticitySetOpen(writeContext, tx, authority.NamespaceID, partition.PlanDigest); err != nil {
		return EvaluationEndpointSmokeReceiptRecord{}, false, err
	}
	if err := validateEvaluationEndpointSmokeBinding(plan, receipt); err != nil {
		return EvaluationEndpointSmokeReceiptRecord{}, false, err
	}
	if err := registerEvaluationProviderRequest(writeContext, tx, authority.NamespaceID, partition,
		receipt.ProviderConfigurationID, receipt.ProviderRequestID, "endpoint-smoke", receipt.SmokeTargetID, receipt.CompletedAt); err != nil {
		return EvaluationEndpointSmokeReceiptRecord{}, false, err
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_endpoint_smoke_receipts (
		namespace_id, plan_digest, repository_commit, receipt_id, smoke_target_id,
		smoke_target_digest, protocol_family, provider_configuration_id, provider_request_id,
		adapter_digest, receipt_digest, receipt_json, receipt_bytes, started_at, completed_at
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		receipt.ReceiptID, receipt.SmokeTargetID, receipt.SmokeTargetDigest, receipt.ProtocolFamily,
		receipt.ProviderConfigurationID, receipt.ProviderRequestID, receipt.AdapterDigest, receipt.ReceiptDigest,
		string(receipt.ReceiptBytes), receipt.ReceiptBytes, receipt.StartedAt, receipt.CompletedAt)
	if err != nil {
		return EvaluationEndpointSmokeReceiptRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationEndpointSmokeReceiptRecord{}, false, err
	}
	replayed := inserted == 0
	if replayed {
		existing, err := immutableEvaluationCollisionBytes(writeContext, tx, `SELECT receipt_bytes
		FROM agent_evaluation_endpoint_smoke_receipts
		WHERE namespace_id = $1 AND plan_digest = $2
		  AND (smoke_target_id = $3 OR receipt_id = $4 OR receipt_digest = $5)
		FOR SHARE`, authority.NamespaceID, partition.PlanDigest, receipt.SmokeTargetID, receipt.ReceiptID, receipt.ReceiptDigest)
		if err != nil {
			return EvaluationEndpointSmokeReceiptRecord{}, false, err
		}
		if !bytes.Equal(existing, receipt.ReceiptBytes) {
			return EvaluationEndpointSmokeReceiptRecord{}, false, conflict("evaluation endpoint smoke identity was reused with different immutable bytes")
		}
	}
	if err := commitEvaluationAuthenticityWrite(tx); err != nil {
		return EvaluationEndpointSmokeReceiptRecord{}, false, err
	}
	record := receipt.EvaluationEndpointSmokeReceiptRecord
	record.NamespaceID = authority.NamespaceID
	return record, replayed, nil
}

func (repository *Repository) StoreEvaluationInvocationReceipt(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	receiptBytes []byte,
) (EvaluationInvocationReceiptRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationInvocationReceiptRecord{}, false, err
	}
	receipt, err := decodeEvaluationInvocationReceipt(receiptBytes)
	if err != nil {
		return EvaluationInvocationReceiptRecord{}, false, err
	}
	writeContext, cancel, tx, _, plan, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationInvocationReceiptRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := ensureEvaluationAuthenticitySetOpen(writeContext, tx, authority.NamespaceID, partition.PlanDigest); err != nil {
		return EvaluationInvocationReceiptRecord{}, false, err
	}
	targetID, _, err := resolveEvaluationInvocationPlanBinding(plan, receipt)
	if err != nil {
		return EvaluationInvocationReceiptRecord{}, false, err
	}
	attempt, err := loadEvaluationAttemptForAuthenticity(writeContext, tx, authority.NamespaceID, partition, receipt.AttemptID)
	if err == nil {
		if err := validateEvaluationInvocationBinding(plan, attempt, receipt); err != nil {
			return EvaluationInvocationReceiptRecord{}, false, err
		}
	} else if !errors.Is(err, ErrNotFound) {
		return EvaluationInvocationReceiptRecord{}, false, err
	}
	if receipt.ProviderRequestID != "" {
		if err := registerEvaluationProviderRequest(writeContext, tx, authority.NamespaceID, partition,
			receipt.ProviderConfigurationID, receipt.ProviderRequestID, "invocation", receipt.AttemptID, receipt.CompletedAt); err != nil {
			return EvaluationInvocationReceiptRecord{}, false, err
		}
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_invocation_receipts (
		namespace_id, plan_digest, repository_commit, attempt_id, descriptor_digest, target_id,
		provider_configuration_id, model_lineage_digest, provider_request_id,
		execution_failure_authority_receipt_digest, transport_receipt_digest,
		resolved_model_id, resolved_model_version, resolved_model_identity_digest,
		invocation_outcome, invocation_receipt_digest,
		response_artifact_digest, evidence_digest, evidence_json, evidence_bytes, started_at, completed_at
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20, $21, $22)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		receipt.AttemptID, receipt.DescriptorDigest, targetID, receipt.ProviderConfigurationID,
		receipt.ModelLineageDigest, nullableEvaluationAuthenticityString(receipt.ProviderRequestID),
		nullableEvaluationAuthenticityString(receipt.ExecutionFailureAuthorityReceiptDigest), receipt.TransportReceiptDigest,
		nullableEvaluationAuthenticityString(receipt.ResolvedModelID), nullableEvaluationAuthenticityString(receipt.ResolvedModelVersion),
		receipt.ResolvedModelIdentityDigest, receipt.InvocationOutcome,
		receipt.InvocationReceiptDigest, nullableEvaluationAuthenticityString(receipt.ResponseArtifactDigest),
		receipt.EvidenceDigest, string(receipt.EvidenceBytes), receipt.EvidenceBytes, receipt.StartedAt, receipt.CompletedAt)
	if err != nil {
		return EvaluationInvocationReceiptRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationInvocationReceiptRecord{}, false, err
	}
	replayed := inserted == 0
	if replayed {
		existing, err := immutableEvaluationCollisionBytes(writeContext, tx, `SELECT evidence_bytes
		FROM agent_evaluation_invocation_receipts
		WHERE namespace_id = $1 AND plan_digest = $2
		  AND (attempt_id = $3 OR descriptor_digest = $4 OR invocation_receipt_digest = $5
		    OR evidence_digest = $6 OR execution_failure_authority_receipt_digest = $7)
		FOR SHARE`, authority.NamespaceID, partition.PlanDigest, receipt.AttemptID, receipt.DescriptorDigest,
			receipt.InvocationReceiptDigest, receipt.EvidenceDigest,
			nullableEvaluationAuthenticityString(receipt.ExecutionFailureAuthorityReceiptDigest))
		if err != nil {
			return EvaluationInvocationReceiptRecord{}, false, err
		}
		if !bytes.Equal(existing, receipt.EvidenceBytes) {
			return EvaluationInvocationReceiptRecord{}, false, conflict("evaluation invocation identity was reused with different immutable bytes")
		}
	}
	if err := commitEvaluationAuthenticityWrite(tx); err != nil {
		return EvaluationInvocationReceiptRecord{}, false, err
	}
	record := receipt.EvaluationInvocationReceiptRecord
	record.NamespaceID, record.TargetID = authority.NamespaceID, targetID
	return record, replayed, nil
}

func (repository *Repository) StoreEvaluationSourceReceipt(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	receiptBytes []byte,
) (EvaluationSourceReceiptRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationSourceReceiptRecord{}, false, err
	}
	receipt, err := decodeEvaluationSourceReceipt(receiptBytes)
	if err != nil {
		return EvaluationSourceReceiptRecord{}, false, err
	}
	writeContext, cancel, tx, _, plan, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationSourceReceiptRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := ensureEvaluationAuthenticitySetOpen(writeContext, tx, authority.NamespaceID, partition.PlanDigest); err != nil {
		return EvaluationSourceReceiptRecord{}, false, err
	}
	if err := validateEvaluationSourceBinding(plan, receipt); err != nil {
		return EvaluationSourceReceiptRecord{}, false, err
	}
	if receipt.ProviderRequestID != "" {
		if err := validateEvaluationProviderRequestReference(writeContext, tx, authority.NamespaceID, partition,
			receipt.ProviderConfigurationID, receipt.ProviderRequestID); err != nil {
			return EvaluationSourceReceiptRecord{}, false, err
		}
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_source_receipts (
		namespace_id, plan_digest, repository_commit, source_receipt_id, source_kind,
		provider_configuration_id, model_lineage_digest, provider_request_id,
		execution_failure_authority_receipt_digest, source_uri,
		source_content_digest, receipt_digest, receipt_json, receipt_bytes, observed_at
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		receipt.SourceReceiptID, receipt.SourceKind, receipt.ProviderConfigurationID,
		nullableEvaluationAuthenticityString(receipt.ModelLineageDigest),
		nullableEvaluationAuthenticityString(receipt.ProviderRequestID),
		nullableEvaluationAuthenticityString(receipt.ExecutionFailureAuthorityReceiptDigest),
		nullableEvaluationAuthenticityString(receipt.SourceURI),
		receipt.SourceContentDigest, receipt.ReceiptDigest, string(receipt.ReceiptBytes), receipt.ReceiptBytes, receipt.ObservedAt)
	if err != nil {
		return EvaluationSourceReceiptRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationSourceReceiptRecord{}, false, err
	}
	replayed := inserted == 0
	if replayed {
		existing, err := immutableEvaluationCollisionBytes(writeContext, tx, `SELECT receipt_bytes
		FROM agent_evaluation_source_receipts
		WHERE namespace_id = $1 AND plan_digest = $2
		  AND (source_receipt_id = $3 OR receipt_digest = $4 OR source_content_digest = $5)
		FOR SHARE`, authority.NamespaceID, partition.PlanDigest, receipt.SourceReceiptID,
			receipt.ReceiptDigest, receipt.SourceContentDigest)
		if err != nil {
			return EvaluationSourceReceiptRecord{}, false, err
		}
		if !bytes.Equal(existing, receipt.ReceiptBytes) {
			return EvaluationSourceReceiptRecord{}, false, conflict("evaluation source identity was reused with different immutable bytes")
		}
	}
	if err := commitEvaluationAuthenticityWrite(tx); err != nil {
		return EvaluationSourceReceiptRecord{}, false, err
	}
	record := receipt.EvaluationSourceReceiptRecord
	record.NamespaceID = authority.NamespaceID
	return record, replayed, nil
}

func (repository *Repository) StoreEvaluationExecutionReceipt(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	receiptBytes []byte,
) (EvaluationExecutionReceiptRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationExecutionReceiptRecord{}, false, err
	}
	receipt, err := decodeEvaluationExecutionReceipt(receiptBytes)
	if err != nil {
		return EvaluationExecutionReceiptRecord{}, false, err
	}
	writeContext, cancel, tx, _, plan, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationExecutionReceiptRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := ensureEvaluationAuthenticitySetOpen(writeContext, tx, authority.NamespaceID, partition.PlanDigest); err != nil {
		return EvaluationExecutionReceiptRecord{}, false, err
	}
	if receipt.PlanDigest != plan.PlanDigest || receipt.RepositoryCommit != plan.RepositoryCommit {
		return EvaluationExecutionReceiptRecord{}, false, conflict("evaluation execution receipt belongs to a different plan partition")
	}
	attempt, err := loadEvaluationAttemptForAuthenticity(writeContext, tx, authority.NamespaceID, partition, receipt.AttemptID)
	if err == nil {
		if err := validateEvaluationExecutionBinding(plan, attempt, receipt); err != nil {
			return EvaluationExecutionReceiptRecord{}, false, err
		}
	} else if !errors.Is(err, ErrNotFound) {
		return EvaluationExecutionReceiptRecord{}, false, err
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_execution_receipts (
		namespace_id, plan_digest, repository_commit, execution_receipt_id, attempt_id,
		descriptor_digest, model_invocations, tool_calls, repair_rounds, transactions,
		artifact_bytes, elapsed_ms, tool_receipt_set_digest, transaction_receipt_set_digest,
		verification_closure_digest, receipt_digest, receipt_json, receipt_bytes
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		receipt.ExecutionReceiptID, receipt.AttemptID, receipt.DescriptorDigest, receipt.ModelInvocations,
		receipt.ToolCalls, receipt.RepairRounds, receipt.Transactions, receipt.ArtifactBytes, receipt.ElapsedMS,
		nullableEvaluationAuthenticityString(receipt.ToolReceiptSetDigest),
		nullableEvaluationAuthenticityString(receipt.TransactionReceiptSetDigest),
		nullableEvaluationAuthenticityString(receipt.VerificationClosureDigest), receipt.ReceiptDigest,
		string(receipt.ReceiptBytes), receipt.ReceiptBytes)
	if err != nil {
		return EvaluationExecutionReceiptRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationExecutionReceiptRecord{}, false, err
	}
	replayed := inserted == 0
	if replayed {
		existing, err := immutableEvaluationCollisionBytes(writeContext, tx, `SELECT receipt_bytes
		FROM agent_evaluation_execution_receipts
		WHERE namespace_id = $1 AND plan_digest = $2
		  AND (attempt_id = $3 OR execution_receipt_id = $4 OR receipt_digest = $5)
		FOR SHARE`, authority.NamespaceID, partition.PlanDigest, receipt.AttemptID,
			receipt.ExecutionReceiptID, receipt.ReceiptDigest)
		if err != nil {
			return EvaluationExecutionReceiptRecord{}, false, err
		}
		if !bytes.Equal(existing, receipt.ReceiptBytes) {
			return EvaluationExecutionReceiptRecord{}, false, conflict("evaluation execution identity was reused with different immutable bytes")
		}
	}
	if err := commitEvaluationAuthenticityWrite(tx); err != nil {
		return EvaluationExecutionReceiptRecord{}, false, err
	}
	record := receipt.EvaluationExecutionReceiptRecord
	record.NamespaceID = authority.NamespaceID
	return record, replayed, nil
}

type evaluationAuthenticitySetDigests struct {
	CapabilityProbeAdmission                                    string
	CapabilityProbeReference                                    string
	RuntimeFactSourceOwnerRegistration                          string
	CapabilityProbeProviderResourceCleanup                      string
	HostedRetrievalRuntimeResourceLifecycleJournal              string
	HostedRetrievalRuntimeResourceLifecycleBudgetClosureBinding string
	HostedRetrievalRuntimeResourceCleanup                       string
	CapabilityEffectProviderRuntimeJournal                      string
	OptionalCapabilityFactSource                                string
	OptionalCapabilityFactAuthority                             string
	EndpointSmokeDispatchIntent                                 string
	EndpointSmokeTransport                                      string
	EndpointSmokeResultSpool                                    string
	EndpointSmokeSpoolDisposition                               string
	EndpointSmokeValidationFailure                              string
	EndpointSmoke                                               string
	PreDispatchFailure                                          string
	TransportDispatchIntent                                     string
	Transport                                                   string
	ProviderResultSpool                                         string
	ProviderResultSpoolDisposition                              string
	InvocationTurn                                              string
	InvocationTurnSet                                           string
	ResultSubmission                                            string
	AttemptAuthorityOwner                                       string
	ControlledRuntime                                           string
	CapabilityExecution                                         string
	CapabilitySpecific                                          string
	ProviderCapabilityObservation                               string
	VerificationAttemptGrant                                    string
	ValidatedHumanReview                                        string
	ValidatedHumanMetric                                        string
	ReviewRasterScan                                            string
	ReviewCandidateRef                                          string
	BlindReviewMapping                                          string
	Source                                                      string
	Execution                                                   string
	Invocation                                                  string // v2-only helper retained for migration tests.
}

func validateEvaluationEndpointSmokePersistedSets(
	commit evaluationEndpointSmokeEvidenceCommit,
	intents []EvaluationEndpointSmokeDispatchIntentRecord,
	transports []EvaluationEndpointSmokeTransportReceiptRecord,
	spools []EvaluationEndpointSmokeResultSpoolReceiptRecord,
	dispositions []EvaluationEndpointSmokeResultSpoolDispositionRecord,
	validationFailures []EvaluationEndpointSmokeValidationFailureRecord,
	terminals []EvaluationEndpointSmokeTerminalReceiptRecord,
) error {
	if len(intents) != len(commit.DispatchIntents) || len(transports) != len(commit.TransportReceipts) ||
		len(spools) != len(commit.SpoolReceipts) || len(dispositions) != len(commit.Dispositions) ||
		len(validationFailures) != len(commit.ValidationFailures) || len(terminals) != len(commit.TerminalReceipts) {
		return conflict("evaluation endpoint smoke persisted receipt sets drifted from the atomic commit")
	}
	for index := range intents {
		if !bytes.Equal(intents[index].IntentBytes, commit.DispatchIntents[index].IntentBytes) ||
			!bytes.Equal(transports[index].ReceiptBytes, commit.TransportReceipts[index].ReceiptBytes) ||
			!bytes.Equal(terminals[index].ReceiptBytes, commit.TerminalReceipts[index].ReceiptBytes) {
			return conflict("evaluation endpoint smoke persisted denominator drifted from the atomic commit")
		}
	}
	for index := range spools {
		if !bytes.Equal(spools[index].ReceiptBytes, commit.SpoolReceipts[index].ReceiptBytes) {
			return conflict("evaluation endpoint smoke persisted spool set drifted from the atomic commit")
		}
	}
	for index := range dispositions {
		if !bytes.Equal(dispositions[index].ReceiptBytes, commit.Dispositions[index].ReceiptBytes) {
			return conflict("evaluation endpoint smoke persisted disposition set drifted from the atomic commit")
		}
	}
	for index := range validationFailures {
		if !bytes.Equal(validationFailures[index].ReceiptBytes, commit.ValidationFailures[index].ReceiptBytes) {
			return conflict("evaluation endpoint smoke persisted validation-failure set drifted from the atomic commit")
		}
	}
	return nil
}

func validateEvaluationAuthenticityCompletenessV3(
	plan evaluationPlanFact,
	attempts []EvaluationAttemptRecord,
	endpointSmokeCommit *evaluationEndpointSmokeEvidenceCommit,
	endpointSmokeDispatchIntents []EvaluationEndpointSmokeDispatchIntentRecord,
	endpointSmokeTransports []EvaluationEndpointSmokeTransportReceiptRecord,
	endpointSmokeSpools []EvaluationEndpointSmokeResultSpoolReceiptRecord,
	endpointSmokeDispositions []EvaluationEndpointSmokeResultSpoolDispositionRecord,
	endpointSmokeValidationFailures []EvaluationEndpointSmokeValidationFailureRecord,
	endpointRecords []EvaluationEndpointSmokeTerminalReceiptRecord,
	preDispatchFailureRecords []EvaluationPreDispatchFailureReceiptRecord,
	intentRecords []EvaluationTransportDispatchIntentRecord,
	transportRecords []EvaluationTransportReceiptRecord,
	spoolRecords []EvaluationProviderResultSpoolReceiptRecord,
	dispositionRecords []EvaluationProviderResultSpoolDispositionRecord,
	turnRecords []EvaluationInvocationTurnReceiptRecord,
	turnSetRecords []EvaluationInvocationTurnSetReceiptRecord,
	resultSubmissionRecords []EvaluationResultSubmissionReceiptRecord,
	controlledRuntimeRecords []EvaluationControlledRuntimeReceiptRecord,
	capabilityExecutionRecords []EvaluationCapabilityExecutionReceiptRecord,
	attemptAuthorityOwnerRecords []EvaluationAttemptAuthorityOwnerReceiptRecord,
	capabilitySpecificRecords []EvaluationCapabilitySpecificReceiptRecord,
	providerCapabilityObservationRecords []EvaluationProviderCapabilityObservationReceiptRecord,
	verificationAttemptGrantRecords []EvaluationVerificationAttemptGrantReceiptRecord,
	validatedHumanReviewRecords []EvaluationValidatedHumanReviewArtifactRecord,
	validatedHumanMetricObservations []map[string]any,
	validatedHumanMetricObservationSetDigest string,
	reviewRasterScanRecords []EvaluationReviewRasterScanReceiptRecord,
	reviewCandidateRefs []EvaluationReviewCandidateRef,
	blindReviewMappings []EvaluationBlindReviewMappingRecord,
	sourceRecords []EvaluationSourceReceiptRecord,
	executionRecords []EvaluationExecutionReceiptRecord,
) (evaluationAuthenticitySetDigests, error) {
	endpointTargets, _ := plan.Value["endpointSmokeTargets"].([]any)
	if endpointSmokeCommit == nil || int64(len(attempts)) != plan.PlannedJourneyCount ||
		len(endpointSmokeDispatchIntents) != len(endpointTargets) || len(endpointSmokeTransports) != len(endpointTargets) ||
		len(endpointRecords) != len(endpointTargets) ||
		len(turnSetRecords) != len(attempts) || len(executionRecords) != len(attempts) ||
		len(capabilityExecutionRecords) != len(attempts) || len(validatedHumanReviewRecords) > 1 ||
		validatedHumanMetricObservationSetDigest == "" {
		return evaluationAuthenticitySetDigests{}, conflict("evaluation v3 authenticity evidence does not cover the frozen denominator")
	}
	if err := validateEvaluationEndpointSmokeCommit(plan, *endpointSmokeCommit); err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	if err := validateEvaluationEndpointSmokePersistedSets(
		*endpointSmokeCommit, endpointSmokeDispatchIntents, endpointSmokeTransports, endpointSmokeSpools,
		endpointSmokeDispositions, endpointSmokeValidationFailures, endpointRecords,
	); err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	if err := validateEvaluationTurnJournalSnapshot(attempts, intentRecords, transportRecords, spoolRecords,
		dispositionRecords, turnRecords, turnSetRecords); err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	if err := validateEvaluationPreDispatchFailureJoin(preDispatchFailureRecords, turnRecords); err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	if err := validateEvaluationCapabilityExecutionSnapshot(
		plan, attempts, turnRecords, executionRecords, controlledRuntimeRecords, capabilityExecutionRecords,
		true,
	); err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	if err := validateEvaluationVerificationAttemptGrantSnapshot(
		plan, attempts, executionRecords, controlledRuntimeRecords,
		verificationAttemptGrantRecords, true,
	); err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	if int64(len(providerCapabilityObservationRecords)) > plan.PlannedJourneyCount*maximumEvaluationProviderCapabilityObservationTurns {
		return evaluationAuthenticitySetDigests{}, conflict("evaluation provider capability observation denominator exceeds the frozen turn budget")
	}
	attemptByID := make(map[string]evaluationAttemptFact, len(attempts))
	for _, record := range attempts {
		attempt, err := decodeEvaluationAttempt(record.FactBytes)
		if err != nil {
			return evaluationAuthenticitySetDigests{}, err
		}
		if _, duplicate := attemptByID[attempt.AttemptID]; duplicate {
			return evaluationAuthenticitySetDigests{}, conflict("evaluation v3 authenticity attempts are duplicated")
		}
		attemptByID[attempt.AttemptID] = attempt
	}
	executionByAttempt := make(map[string]evaluationExecutionReceipt, len(executionRecords))
	for _, record := range executionRecords {
		execution, err := decodeEvaluationExecutionReceipt(record.ReceiptBytes)
		if err != nil {
			return evaluationAuthenticitySetDigests{}, err
		}
		attempt, exists := attemptByID[execution.AttemptID]
		if !exists {
			return evaluationAuthenticitySetDigests{}, conflict("evaluation v3 execution receipt is orphaned")
		}
		if _, duplicate := executionByAttempt[execution.AttemptID]; duplicate {
			return evaluationAuthenticitySetDigests{}, conflict("evaluation v3 execution receipts are duplicated")
		}
		if err := validateEvaluationExecutionBinding(plan, attempt, execution); err != nil {
			return evaluationAuthenticitySetDigests{}, err
		}
		executionByAttempt[execution.AttemptID] = execution
	}
	observationByDigest := make(map[string]EvaluationProviderCapabilityObservationReceiptRecord, len(providerCapabilityObservationRecords))
	observationTurns := make(map[string]struct{}, len(providerCapabilityObservationRecords))
	var observationBytes int64
	for _, observation := range providerCapabilityObservationRecords {
		attempt, exists := attemptByID[observation.AttemptID]
		turnKey := fmt.Sprintf("%s\x00%03d", observation.AttemptID, observation.TurnIndex)
		if !exists || observation.PlanDigest != plan.PlanDigest || observation.RepositoryCommit != plan.RepositoryCommit ||
			observation.DescriptorDigest != attempt.DescriptorDigest || observation.ObservedAt.Before(attempt.StartedAt) ||
			observation.ObservedAt.After(attempt.CompletedAt) {
			return evaluationAuthenticitySetDigests{}, conflict("evaluation provider capability observation belongs to another attempt")
		}
		if _, duplicate := observationByDigest[observation.ReceiptDigest]; duplicate {
			return evaluationAuthenticitySetDigests{}, conflict("evaluation provider capability observation digest is duplicated")
		}
		if _, duplicate := observationTurns[turnKey]; duplicate {
			return evaluationAuthenticitySetDigests{}, conflict("evaluation provider capability observation turn is duplicated")
		}
		observationByDigest[observation.ReceiptDigest] = observation
		observationTurns[turnKey] = struct{}{}
		observationBytes += int64(len(observation.ReceiptBytes))
	}
	if observationBytes > maximumEvaluationObservationBytes {
		return evaluationAuthenticitySetDigests{}, conflict("evaluation provider capability observation archive exceeds its capacity")
	}
	for _, record := range capabilitySpecificRecords {
		receipt, err := decodeEvaluationCapabilitySpecificReceipt(record.ReceiptBytes)
		if err != nil {
			return evaluationAuthenticitySetDigests{}, err
		}
		authority, ok := objectMember(receipt.Value, "authority")
		if !ok {
			return evaluationAuthenticitySetDigests{}, ErrInvalid
		}
		providerFactKind := evaluationProviderObservationFactKind(stringMember(authority, "authorityKind"))
		observationDigest := stringMember(receipt.Value, "providerCapabilityObservationReceiptDigest")
		if providerFactKind == "" {
			if observationDigest != "" {
				return evaluationAuthenticitySetDigests{}, conflict("evaluation non-provider capability receipt references a provider observation")
			}
			continue
		}
		observation, exists := observationByDigest[observationDigest]
		if !exists || validateEvaluationCapabilitySpecificProviderObservation(receipt, observation) != nil {
			return evaluationAuthenticitySetDigests{}, conflict("evaluation capability-specific provider authority lacks its exact observation")
		}
	}
	sourcesByDigest, pricingBySnapshotDigest, err := decodeEvaluationAuthenticitySources(sourceRecords)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	usedSources := make(map[string]struct{}, len(sourceRecords))
	for _, record := range turnRecords {
		turn, err := decodeEvaluationInvocationTurnReceipt(record.ReceiptBytes)
		if err != nil {
			return evaluationAuthenticitySetDigests{}, err
		}
		if turn.Invocation == nil {
			continue
		}
		invocation := turn.Invocation
		if turn.UsageSourceReceiptDigest != "" {
			usageSource, exists := sourcesByDigest[turn.UsageSourceReceiptDigest]
			if !exists || !evaluationUsageSourceMatches(usageSource, invocation.Usage,
				invocation.ProviderConfigurationID, invocation.ModelLineageDigest, turn.ProviderRequestID,
				turn.ExecutionFailureAuthorityReceiptDigest) {
				return evaluationAuthenticitySetDigests{}, conflict("evaluation invocation turn usage source binding is incomplete")
			}
			usedSources[usageSource.ReceiptDigest] = struct{}{}
		}
		if turn.CostSourceReceiptDigest != "" {
			costSource, exists := sourcesByDigest[turn.CostSourceReceiptDigest]
			if !exists || !evaluationCostSourceMatches(costSource, invocation.Usage, invocation.Cost,
				invocation.ProviderConfigurationID, invocation.ModelLineageDigest, turn.ProviderRequestID,
				turn.ExecutionFailureAuthorityReceiptDigest, invocation.PricingSnapshotRef,
				pricingBySnapshotDigest, usedSources) {
				return evaluationAuthenticitySetDigests{}, conflict("evaluation invocation turn cost source binding is incomplete")
			}
			usedSources[costSource.ReceiptDigest] = struct{}{}
		}
	}
	for _, source := range endpointSmokeCommit.SourceReceipts {
		persisted, exists := sourcesByDigest[source.ReceiptDigest]
		if !exists || !bytes.Equal(persisted.ReceiptBytes, source.ReceiptBytes) {
			return evaluationAuthenticitySetDigests{}, conflict("evaluation endpoint smoke source authority drifted from the global ledger")
		}
		usedSources[source.ReceiptDigest] = struct{}{}
	}
	if len(usedSources) != len(sourceRecords) {
		return evaluationAuthenticitySetDigests{}, conflict("evaluation source receipts contain unreferenced evidence")
	}
	if err := validateEvaluationBlindReviewMappingSet(plan, reviewCandidateRefs, blindReviewMappings, true); err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	blindReviewMappingSetDigest, err := evaluationBlindReviewMappingSetDigest(blindReviewMappings)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	validatedHumanReviewSetDigest, err := evaluationValidatedHumanReviewArtifactSetDigest(validatedHumanReviewRecords)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	completed := 0
	for _, attempt := range attemptByID {
		if attempt.Status == "completed" {
			completed++
		}
	}
	if len(resultSubmissionRecords) != completed || len(controlledRuntimeRecords) != completed {
		return evaluationAuthenticitySetDigests{}, conflict("evaluation runtime evidence does not exactly cover completed attempts")
	}
	sets := evaluationAuthenticitySetDigests{}
	setInputs := []struct {
		target *string
		values []string
	}{
		{&sets.PreDispatchFailure, evaluationRecordDigests(preDispatchFailureRecords, func(record EvaluationPreDispatchFailureReceiptRecord) string { return record.ReceiptDigest })},
		{&sets.TransportDispatchIntent, evaluationRecordDigests(intentRecords, func(record EvaluationTransportDispatchIntentRecord) string { return record.IntentDigest })},
		{&sets.Transport, evaluationRecordDigests(transportRecords, func(record EvaluationTransportReceiptRecord) string { return record.ReceiptDigest })},
		{&sets.ProviderResultSpool, evaluationRecordDigests(spoolRecords, func(record EvaluationProviderResultSpoolReceiptRecord) string { return record.ReceiptDigest })},
		{&sets.ProviderResultSpoolDisposition, evaluationRecordDigests(dispositionRecords, func(record EvaluationProviderResultSpoolDispositionRecord) string { return record.ReceiptDigest })},
		{&sets.InvocationTurn, evaluationRecordDigests(turnRecords, func(record EvaluationInvocationTurnReceiptRecord) string { return record.EvidenceDigest })},
		{&sets.InvocationTurnSet, evaluationRecordDigests(turnSetRecords, func(record EvaluationInvocationTurnSetReceiptRecord) string { return record.ReceiptDigest })},
		{&sets.ResultSubmission, evaluationRecordDigests(resultSubmissionRecords, func(record EvaluationResultSubmissionReceiptRecord) string { return record.ReceiptDigest })},
		{&sets.AttemptAuthorityOwner, evaluationRecordDigests(attemptAuthorityOwnerRecords, func(record EvaluationAttemptAuthorityOwnerReceiptRecord) string { return record.ReceiptDigest })},
		{&sets.ControlledRuntime, evaluationRecordDigests(controlledRuntimeRecords, func(record EvaluationControlledRuntimeReceiptRecord) string { return record.ReceiptDigest })},
		{&sets.CapabilityExecution, evaluationRecordDigests(capabilityExecutionRecords, func(record EvaluationCapabilityExecutionReceiptRecord) string { return record.ReceiptDigest })},
		{&sets.CapabilitySpecific, evaluationRecordDigests(capabilitySpecificRecords, func(record EvaluationCapabilitySpecificReceiptRecord) string { return record.ReceiptDigest })},
		{&sets.ProviderCapabilityObservation, evaluationRecordDigests(providerCapabilityObservationRecords, func(record EvaluationProviderCapabilityObservationReceiptRecord) string { return record.ReceiptDigest })},
		{&sets.ReviewRasterScan, evaluationRecordDigests(reviewRasterScanRecords, func(record EvaluationReviewRasterScanReceiptRecord) string { return record.ReceiptDigest })},
		{&sets.ReviewCandidateRef, evaluationRecordDigests(reviewCandidateRefs, func(record EvaluationReviewCandidateRef) string { return record.CandidateDigest })},
		{&sets.Source, evaluationRecordDigests(sourceRecords, func(record EvaluationSourceReceiptRecord) string { return record.ReceiptDigest })},
		{&sets.Execution, evaluationRecordDigests(executionRecords, func(record EvaluationExecutionReceiptRecord) string { return record.ReceiptDigest })},
	}
	for _, input := range setInputs {
		digest, err := evaluationCanonicalStringSetDigest(input.values)
		if err != nil {
			return evaluationAuthenticitySetDigests{}, err
		}
		*input.target = digest
	}
	sets.BlindReviewMapping = blindReviewMappingSetDigest
	sets.ValidatedHumanReview = validatedHumanReviewSetDigest
	sets.ValidatedHumanMetric = validatedHumanMetricObservationSetDigest
	sets.AttemptAuthorityOwner, err = evaluationAttemptAuthorityOwnerReceiptSetDigest(attemptAuthorityOwnerRecords)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	sets.CapabilitySpecific, err = evaluationCapabilitySpecificReceiptSetDigest(capabilitySpecificRecords)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	sets.ProviderCapabilityObservation, err = evaluationProviderCapabilityObservationReceiptSetDigest(providerCapabilityObservationRecords)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	computedHumanMetricSetDigest, err := evaluationValidatedHumanMetricObservationSetDigest(validatedHumanMetricObservations)
	if err != nil || computedHumanMetricSetDigest != validatedHumanMetricObservationSetDigest {
		return evaluationAuthenticitySetDigests{}, conflict("evaluation validated human metric observation set authority drifted")
	}
	sets.EndpointSmokeDispatchIntent, err = evaluationEndpointSmokeDispatchIntentSetDigest(endpointSmokeDispatchIntents)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	sets.EndpointSmokeTransport, err = evaluationEndpointSmokeTransportReceiptSetDigest(endpointSmokeTransports)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	sets.EndpointSmokeResultSpool, err = evaluationEndpointSmokeSpoolReceiptSetDigest(endpointSmokeSpools)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	sets.EndpointSmokeSpoolDisposition, err = evaluationEndpointSmokeSpoolDispositionSetDigest(endpointSmokeDispositions)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	sets.EndpointSmokeValidationFailure, err = evaluationEndpointSmokeValidationFailureSetDigest(endpointSmokeValidationFailures)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	sets.EndpointSmoke, err = evaluationEndpointSmokeTerminalReceiptSetDigest(endpointRecords)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	sets.VerificationAttemptGrant, err = evaluationVerificationAttemptGrantReceiptSetDigest(verificationAttemptGrantRecords)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	return sets, nil
}

func evaluationRecordDigests[T any](records []T, digest func(T) string) []string {
	values := make([]string, len(records))
	for index, record := range records {
		values[index] = digest(record)
	}
	return values
}

type evaluationAuthenticityEvidenceV3 struct {
	EndpointSmokeCommit            *evaluationEndpointSmokeEvidenceCommit
	EndpointSmokeIntents           []EvaluationEndpointSmokeDispatchIntentRecord
	EndpointSmokeTransports        []EvaluationEndpointSmokeTransportReceiptRecord
	EndpointSmokeSpools            []EvaluationEndpointSmokeResultSpoolReceiptRecord
	EndpointSmokeDispositions      []EvaluationEndpointSmokeResultSpoolDispositionRecord
	EndpointSmokeFailures          []EvaluationEndpointSmokeValidationFailureRecord
	EndpointSmokes                 []EvaluationEndpointSmokeTerminalReceiptRecord
	PreDispatchFailures            []EvaluationPreDispatchFailureReceiptRecord
	DispatchIntents                []EvaluationTransportDispatchIntentRecord
	Transports                     []EvaluationTransportReceiptRecord
	Spools                         []EvaluationProviderResultSpoolReceiptRecord
	SpoolDispositions              []EvaluationProviderResultSpoolDispositionRecord
	InvocationTurns                []EvaluationInvocationTurnReceiptRecord
	InvocationTurnSets             []EvaluationInvocationTurnSetReceiptRecord
	ResultSubmissions              []EvaluationResultSubmissionReceiptRecord
	ControlledRuntimes             []EvaluationControlledRuntimeReceiptRecord
	CapabilityExecutions           []EvaluationCapabilityExecutionReceiptRecord
	AttemptAuthorityOwners         []EvaluationAttemptAuthorityOwnerReceiptRecord
	CapabilitySpecifics            []EvaluationCapabilitySpecificReceiptRecord
	ProviderCapabilityObservations []EvaluationProviderCapabilityObservationReceiptRecord
	VerificationAttemptGrants      []EvaluationVerificationAttemptGrantReceiptRecord
	ValidatedHumanReviews          []EvaluationValidatedHumanReviewArtifactRecord
	ValidatedHumanMetrics          []map[string]any
	ValidatedHumanMetricSetDigest  string
	ReviewCandidateRefs            []EvaluationReviewCandidateRef
	BlindReviewMappings            []EvaluationBlindReviewMappingRecord
	ReviewRasterScanRecords        []EvaluationReviewRasterScanReceiptRecord
	Sources                        []EvaluationSourceReceiptRecord
	Executions                     []EvaluationExecutionReceiptRecord
}

func queryEvaluationAuthenticityEvidenceV3(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	planRecord EvaluationPlanRecord,
	attempts []EvaluationAttemptRecord,
	requireComplete bool,
) (evaluationAuthenticityEvidenceV3, error) {
	var evidence evaluationAuthenticityEvidenceV3
	var err error
	var smokeCommitBytes []byte
	err = queryer.QueryRowContext(ctx, `SELECT commit_bytes
		FROM agent_evaluation_endpoint_smoke_evidence_commits
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit).Scan(&smokeCommitBytes)
	if errors.Is(err, sql.ErrNoRows) {
		if requireComplete {
			return evidence, conflict("evaluation endpoint smoke atomic evidence commit is missing")
		}
	} else if err != nil {
		return evidence, err
	} else {
		decoded, decodeErr := decodeEvaluationEndpointSmokeCommit(smokeCommitBytes)
		if decodeErr != nil || decoded.PlanDigest != partition.PlanDigest || decoded.RepositoryCommit != partition.RepositoryCommit {
			return evidence, conflict("persisted evaluation endpoint smoke atomic evidence commit drifted")
		}
		evidence.EndpointSmokeCommit = &decoded
	}
	if evidence.EndpointSmokeIntents, err = queryEvaluationEndpointSmokeDispatchIntents(ctx, queryer, namespaceID, partition); err != nil {
		return evidence, err
	}
	if evidence.EndpointSmokeTransports, err = queryEvaluationEndpointSmokeTransportReceipts(ctx, queryer, namespaceID, partition); err != nil {
		return evidence, err
	}
	if evidence.EndpointSmokeSpools, err = queryEvaluationEndpointSmokeResultSpoolReceipts(ctx, queryer, namespaceID, partition); err != nil {
		return evidence, err
	}
	if evidence.EndpointSmokeDispositions, err = queryEvaluationEndpointSmokeSpoolDispositions(ctx, queryer, namespaceID, partition); err != nil {
		return evidence, err
	}
	if evidence.EndpointSmokeFailures, err = queryEvaluationEndpointSmokeValidationFailures(ctx, queryer, namespaceID, partition); err != nil {
		return evidence, err
	}
	if evidence.EndpointSmokes, err = queryEvaluationEndpointSmokeTerminalReceipts(ctx, queryer, namespaceID, partition); err != nil {
		return evidence, err
	}
	if evidence.PreDispatchFailures, err = queryEvaluationPreDispatchFailureReceipts(ctx, queryer, namespaceID, partition, ""); err != nil {
		return evidence, err
	}
	if evidence.DispatchIntents, err = queryEvaluationTransportDispatchIntents(ctx, queryer, namespaceID, partition); err != nil {
		return evidence, err
	}
	if evidence.Transports, err = queryEvaluationTransportReceipts(ctx, queryer, namespaceID, partition); err != nil {
		return evidence, err
	}
	if evidence.Spools, err = queryEvaluationProviderResultSpoolReceipts(ctx, queryer, namespaceID, partition); err != nil {
		return evidence, err
	}
	if evidence.SpoolDispositions, err = queryEvaluationProviderResultSpoolDispositions(ctx, queryer, namespaceID, partition); err != nil {
		return evidence, err
	}
	if evidence.InvocationTurns, err = queryEvaluationInvocationTurnReceipts(ctx, queryer, namespaceID, partition, ""); err != nil {
		return evidence, err
	}
	if evidence.InvocationTurnSets, err = queryEvaluationInvocationTurnSetReceipts(ctx, queryer, namespaceID, partition, ""); err != nil {
		return evidence, err
	}
	if evidence.Sources, err = queryEvaluationSourceReceipts(ctx, queryer, namespaceID, partition, planRecord, ""); err != nil {
		return evidence, err
	}
	if evidence.Executions, err = queryEvaluationExecutionReceipts(ctx, queryer, namespaceID, partition, planRecord, attempts, ""); err != nil {
		return evidence, err
	}
	if evidence.ResultSubmissions, evidence.ControlledRuntimes, err = queryEvaluationRuntimeEvidence(
		ctx, queryer, namespaceID, partition, planRecord, attempts, evidence.InvocationTurns, evidence.Executions, requireComplete,
	); err != nil {
		return evidence, err
	}
	if evidence.CapabilityExecutions, err = queryEvaluationCapabilityExecutionReceipts(ctx, queryer, namespaceID, partition, ""); err != nil {
		return evidence, err
	}
	if evidence.AttemptAuthorityOwners, err = queryEvaluationAttemptAuthorityOwnerReceipts(ctx, queryer, namespaceID, partition, "", true); err != nil {
		return evidence, err
	}
	if evidence.CapabilitySpecifics, err = queryEvaluationCapabilitySpecificReceipts(ctx, queryer, namespaceID, partition, ""); err != nil {
		return evidence, err
	}
	if evidence.ProviderCapabilityObservations, err = queryCommittedEvaluationProviderCapabilityObservationReceipts(
		ctx, queryer, namespaceID, partition, "",
	); err != nil {
		return evidence, err
	}
	if evidence.VerificationAttemptGrants, err = queryEvaluationVerificationAttemptGrantReceipts(ctx, queryer, namespaceID, partition, ""); err != nil {
		return evidence, err
	}
	validatedHumanReview, err := queryEvaluationValidatedHumanReviewArtifact(ctx, queryer, namespaceID, partition)
	if err != nil {
		return evidence, err
	}
	if validatedHumanReview != nil {
		evidence.ValidatedHumanReviews = []EvaluationValidatedHumanReviewArtifactRecord{*validatedHumanReview}
	}
	if evidence.ValidatedHumanMetrics, evidence.ValidatedHumanMetricSetDigest, err =
		queryEvaluationValidatedHumanMetricObservationSnapshot(ctx, queryer, namespaceID, partition); err != nil {
		return evidence, err
	}
	if evidence.ReviewCandidateRefs, err = queryEvaluationReviewCandidateRefs(ctx, queryer, namespaceID, partition); err != nil {
		return evidence, err
	}
	if evidence.BlindReviewMappings, err = queryEvaluationBlindReviewMappings(ctx, queryer, namespaceID, partition, ""); err != nil {
		return evidence, err
	}
	if evidence.ReviewRasterScanRecords, err = queryEvaluationReviewRasterScanReceipts(ctx, queryer, namespaceID, partition, ""); err != nil {
		return evidence, err
	}
	return evidence, nil
}

func validateEvaluationAuthoritySetDigests(record EvaluationAuthorityAttestationRecord, sets evaluationAuthenticitySetDigests) error {
	if record.CapabilityProbeAdmissionSetDigest != sets.CapabilityProbeAdmission ||
		record.CapabilityProbeReferenceReceiptSetDigest != sets.CapabilityProbeReference ||
		record.RuntimeFactSourceOwnerRegistrationSetDigest != sets.RuntimeFactSourceOwnerRegistration ||
		record.CapabilityProbeProviderResourceCleanupSetDigest != sets.CapabilityProbeProviderResourceCleanup ||
		record.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest != sets.HostedRetrievalRuntimeResourceLifecycleJournal ||
		record.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest != sets.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBinding ||
		record.HostedRetrievalRuntimeResourceCleanupSetDigest != sets.HostedRetrievalRuntimeResourceCleanup ||
		record.CapabilityEffectProviderRuntimeJournalSetDigest != sets.CapabilityEffectProviderRuntimeJournal ||
		record.OptionalCapabilityFactSourceSetDigest != sets.OptionalCapabilityFactSource ||
		record.OptionalCapabilityFactAuthoritySetDigest != sets.OptionalCapabilityFactAuthority ||
		record.EndpointSmokeDispatchIntentSetDigest != sets.EndpointSmokeDispatchIntent ||
		record.EndpointSmokeTransportReceiptSetDigest != sets.EndpointSmokeTransport ||
		record.EndpointSmokeResultSpoolReceiptSetDigest != sets.EndpointSmokeResultSpool ||
		record.EndpointSmokeResultSpoolDispositionReceiptSetDigest != sets.EndpointSmokeSpoolDisposition ||
		record.EndpointSmokeValidationFailureReceiptSetDigest != sets.EndpointSmokeValidationFailure ||
		record.EndpointSmokeSetDigest != sets.EndpointSmoke ||
		record.PreDispatchFailureReceiptSetDigest != sets.PreDispatchFailure ||
		record.TransportDispatchIntentSetDigest != sets.TransportDispatchIntent ||
		record.TransportReceiptSetDigest != sets.Transport ||
		record.ProviderResultSpoolReceiptSetDigest != sets.ProviderResultSpool ||
		record.ProviderResultSpoolDispositionReceiptSetDigest != sets.ProviderResultSpoolDisposition ||
		record.InvocationTurnReceiptSetDigest != sets.InvocationTurn ||
		record.InvocationTurnSetReceiptSetDigest != sets.InvocationTurnSet ||
		record.ResultSubmissionReceiptSetDigest != sets.ResultSubmission ||
		record.AttemptAuthorityOwnerReceiptSetDigest != sets.AttemptAuthorityOwner ||
		record.ControlledRuntimeReceiptSetDigest != sets.ControlledRuntime ||
		record.CapabilityExecutionReceiptSetDigest != sets.CapabilityExecution ||
		record.CapabilitySpecificReceiptSetDigest != sets.CapabilitySpecific ||
		record.ProviderCapabilityObservationReceiptSetDigest != sets.ProviderCapabilityObservation ||
		record.VerificationAttemptGrantReceiptSetDigest != sets.VerificationAttemptGrant ||
		record.ValidatedHumanReviewArtifactSetDigest != sets.ValidatedHumanReview ||
		record.ValidatedHumanMetricObservationSetDigest != sets.ValidatedHumanMetric ||
		record.ReviewRasterScanReceiptSetDigest != sets.ReviewRasterScan ||
		record.ReviewCandidateRefSetDigest != sets.ReviewCandidateRef ||
		record.BlindReviewMappingSetDigest != sets.BlindReviewMapping ||
		record.SourceReceiptSetDigest != sets.Source || record.ExecutionReceiptSetDigest != sets.Execution {
		return conflict("evaluation authority v3 receipt-set digests drifted")
	}
	return nil
}

func validateEvaluationEvidenceRootSetDigests(record EvaluationEvidenceRootRecord, sets evaluationAuthenticitySetDigests) error {
	return validateEvaluationAuthoritySetDigests(EvaluationAuthorityAttestationRecord{
		CapabilityProbeAdmissionSetDigest:                                    record.CapabilityProbeAdmissionSetDigest,
		CapabilityProbeReferenceReceiptSetDigest:                             record.CapabilityProbeReferenceReceiptSetDigest,
		RuntimeFactSourceOwnerRegistrationSetDigest:                          record.RuntimeFactSourceOwnerRegistrationSetDigest,
		CapabilityProbeProviderResourceCleanupSetDigest:                      record.CapabilityProbeProviderResourceCleanupSetDigest,
		HostedRetrievalRuntimeResourceLifecycleJournalSetDigest:              record.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest,
		HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest: record.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest,
		HostedRetrievalRuntimeResourceCleanupSetDigest:                       record.HostedRetrievalRuntimeResourceCleanupSetDigest,
		CapabilityEffectProviderRuntimeJournalSetDigest:                      record.CapabilityEffectProviderRuntimeJournalSetDigest,
		OptionalCapabilityFactSourceSetDigest:                                record.OptionalCapabilityFactSourceSetDigest,
		OptionalCapabilityFactAuthoritySetDigest:                             record.OptionalCapabilityFactAuthoritySetDigest,
		EndpointSmokeDispatchIntentSetDigest:                                 record.EndpointSmokeDispatchIntentSetDigest,
		EndpointSmokeTransportReceiptSetDigest:                               record.EndpointSmokeTransportReceiptSetDigest,
		EndpointSmokeResultSpoolReceiptSetDigest:                             record.EndpointSmokeResultSpoolReceiptSetDigest,
		EndpointSmokeResultSpoolDispositionReceiptSetDigest:                  record.EndpointSmokeResultSpoolDispositionReceiptSetDigest,
		EndpointSmokeValidationFailureReceiptSetDigest:                       record.EndpointSmokeValidationFailureReceiptSetDigest,
		EndpointSmokeSetDigest:                                               record.EndpointSmokeSetDigest,
		PreDispatchFailureReceiptSetDigest:                                   record.PreDispatchFailureReceiptSetDigest,
		TransportDispatchIntentSetDigest:                                     record.TransportDispatchIntentSetDigest,
		TransportReceiptSetDigest:                                            record.TransportReceiptSetDigest,
		ProviderResultSpoolReceiptSetDigest:                                  record.ProviderResultSpoolReceiptSetDigest,
		ProviderResultSpoolDispositionReceiptSetDigest:                       record.ProviderResultSpoolDispositionReceiptSetDigest,
		InvocationTurnReceiptSetDigest:                                       record.InvocationTurnReceiptSetDigest,
		InvocationTurnSetReceiptSetDigest:                                    record.InvocationTurnSetReceiptSetDigest,
		ResultSubmissionReceiptSetDigest:                                     record.ResultSubmissionReceiptSetDigest,
		AttemptAuthorityOwnerReceiptSetDigest:                                record.AttemptAuthorityOwnerReceiptSetDigest,
		ControlledRuntimeReceiptSetDigest:                                    record.ControlledRuntimeReceiptSetDigest,
		CapabilityExecutionReceiptSetDigest:                                  record.CapabilityExecutionReceiptSetDigest,
		CapabilitySpecificReceiptSetDigest:                                   record.CapabilitySpecificReceiptSetDigest,
		ProviderCapabilityObservationReceiptSetDigest:                        record.ProviderCapabilityObservationReceiptSetDigest,
		VerificationAttemptGrantReceiptSetDigest:                             record.VerificationAttemptGrantReceiptSetDigest,
		ValidatedHumanReviewArtifactSetDigest:                                record.ValidatedHumanReviewArtifactSetDigest,
		ValidatedHumanMetricObservationSetDigest:                             record.ValidatedHumanMetricObservationSetDigest,
		ReviewRasterScanReceiptSetDigest:                                     record.ReviewRasterScanReceiptSetDigest,
		ReviewCandidateRefSetDigest:                                          record.ReviewCandidateRefSetDigest,
		BlindReviewMappingSetDigest:                                          record.BlindReviewMappingSetDigest,
		SourceReceiptSetDigest:                                               record.SourceReceiptSetDigest,
		ExecutionReceiptSetDigest:                                            record.ExecutionReceiptSetDigest,
	}, sets)
}

func decodeEvaluationAuthenticitySources(records []EvaluationSourceReceiptRecord) (map[string]evaluationSourceReceipt, map[string]evaluationSourceReceipt, error) {
	byReceiptDigest := make(map[string]evaluationSourceReceipt, len(records))
	pricingBySnapshotDigest := make(map[string]evaluationSourceReceipt)
	for _, record := range records {
		value, err := decodeEvaluationSourceReceipt(record.ReceiptBytes)
		if err != nil {
			return nil, nil, err
		}
		if _, exists := byReceiptDigest[value.ReceiptDigest]; exists {
			return nil, nil, conflict("evaluation source receipt digest is duplicated")
		}
		byReceiptDigest[value.ReceiptDigest] = value
		if value.SourceKind == "pricing-snapshot" {
			snapshotDigest := stringMember(value.PricingSnapshot, "snapshotDigest")
			if _, exists := pricingBySnapshotDigest[snapshotDigest]; exists {
				return nil, nil, conflict("evaluation pricing snapshot digest is duplicated")
			}
			pricingBySnapshotDigest[snapshotDigest] = value
		}
	}
	return byReceiptDigest, pricingBySnapshotDigest, nil
}

func markEvaluationSourceReceiptUsed(used map[string]struct{}, digest string) error {
	if _, exists := used[digest]; exists {
		return conflict("evaluation source receipt is referenced more than once")
	}
	used[digest] = struct{}{}
	return nil
}

func evaluationUsageSourceMatches(
	source evaluationSourceReceipt,
	usage any,
	providerConfigurationID, modelLineageDigest, providerRequestID, failureAuthorityDigest string,
) bool {
	usageValue, ok := usage.(map[string]any)
	if !ok || source.SourceKind != "provider-reported-usage" ||
		source.ProviderConfigurationID != providerConfigurationID || source.ModelLineageDigest != modelLineageDigest ||
		source.ProviderRequestID != providerRequestID ||
		source.ExecutionFailureAuthorityReceiptDigest != failureAuthorityDigest ||
		source.InputUsageDigest != stringMember(usageValue, "vectorDigest") {
		return false
	}
	amounts, _ := usageValue["amounts"].([]any)
	for _, raw := range amounts {
		amount, _ := raw.(map[string]any)
		if stringMember(amount, "sourceDigest") != source.SourceContentDigest {
			return false
		}
	}
	return true
}

func evaluationCostSourceMatches(
	source evaluationSourceReceipt,
	usage, cost any,
	providerConfigurationID, modelLineageDigest, providerRequestID, failureAuthorityDigest, pricingSnapshotRef string,
	pricingBySnapshotDigest map[string]evaluationSourceReceipt,
	used map[string]struct{},
) bool {
	if !oneOfString(source.SourceKind, "provider-reported-cost", "cost-calculation") ||
		source.ProviderConfigurationID != providerConfigurationID || source.ModelLineageDigest != modelLineageDigest ||
		source.ProviderRequestID != providerRequestID ||
		source.ExecutionFailureAuthorityReceiptDigest != failureAuthorityDigest {
		return false
	}
	costDigest, err := evaluationCanonicalCostValueDigest(cost)
	if err != nil || source.OutputCostDigest != costDigest {
		return false
	}
	costValues, _ := cost.([]any)
	for _, raw := range costValues {
		entry, _ := raw.(map[string]any)
		if stringMember(entry, "sourceDigest") != source.SourceContentDigest {
			return false
		}
	}
	if source.SourceKind == "provider-reported-cost" {
		return true
	}
	usageValue, ok := usage.(map[string]any)
	if !ok || source.InputUsageDigest != stringMember(usageValue, "vectorDigest") ||
		pricingSnapshotRef != stringMember(source.PricingSnapshot, "pricingSnapshotId") {
		return false
	}
	pricingSource, exists := pricingBySnapshotDigest[stringMember(source.PricingSnapshot, "snapshotDigest")]
	if !exists || pricingSource.ProviderConfigurationID != providerConfigurationID ||
		!sameEvaluationCanonicalValue(pricingSource.PricingSnapshot, source.PricingSnapshot) {
		return false
	}
	return markEvaluationSourceReceiptUsed(used, pricingSource.ReceiptDigest) == nil
}

func validateEvaluationAuthenticityCompleteness(
	plan evaluationPlanFact,
	attempts []EvaluationAttemptRecord,
	endpointRecords []EvaluationEndpointSmokeReceiptRecord,
	invocationRecords []EvaluationInvocationReceiptRecord,
	sourceRecords []EvaluationSourceReceiptRecord,
	executionRecords []EvaluationExecutionReceiptRecord,
) (evaluationAuthenticitySetDigests, error) {
	endpointTargets, _ := plan.Value["endpointSmokeTargets"].([]any)
	if int64(len(attempts)) != plan.PlannedJourneyCount || len(endpointRecords) != len(endpointTargets) ||
		len(invocationRecords) != len(attempts) || len(executionRecords) != len(attempts) {
		return evaluationAuthenticitySetDigests{}, conflict("evaluation authenticity receipts do not cover the frozen plan exactly")
	}
	attemptByID := make(map[string]evaluationAttemptFact, len(attempts))
	for _, record := range attempts {
		attempt, err := decodeEvaluationAttempt(record.FactBytes)
		if err != nil {
			return evaluationAuthenticitySetDigests{}, err
		}
		attemptByID[attempt.AttemptID] = attempt
	}
	sourcesByDigest, pricingBySnapshotDigest, err := decodeEvaluationAuthenticitySources(sourceRecords)
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	usedSources := make(map[string]struct{}, len(sourceRecords))
	executionByAttempt := make(map[string]evaluationExecutionReceipt, len(executionRecords))
	for _, record := range executionRecords {
		execution, err := decodeEvaluationExecutionReceipt(record.ReceiptBytes)
		if err != nil {
			return evaluationAuthenticitySetDigests{}, err
		}
		executionByAttempt[execution.AttemptID] = execution
	}
	for _, record := range invocationRecords {
		invocation, err := decodeEvaluationInvocationReceipt(record.EvidenceBytes)
		if err != nil {
			return evaluationAuthenticitySetDigests{}, err
		}
		attempt, attemptExists := attemptByID[invocation.AttemptID]
		execution, executionExists := executionByAttempt[invocation.AttemptID]
		usageSource, usageExists := sourcesByDigest[invocation.UsageSourceReceiptDigest]
		costSource, costExists := sourcesByDigest[invocation.CostSourceReceiptDigest]
		if !attemptExists || !executionExists || !usageExists || !costExists ||
			!evaluationUsageSourceMatches(usageSource, invocation.Usage, invocation.ProviderConfigurationID,
				invocation.ModelLineageDigest, invocation.ProviderRequestID,
				invocation.ExecutionFailureAuthorityReceiptDigest) ||
			!evaluationCostSourceMatches(costSource, invocation.Usage, invocation.Cost,
				invocation.ProviderConfigurationID, invocation.ModelLineageDigest, invocation.ProviderRequestID,
				invocation.ExecutionFailureAuthorityReceiptDigest,
				invocation.PricingSnapshotRef, pricingBySnapshotDigest, usedSources) {
			return evaluationAuthenticitySetDigests{}, conflict("evaluation invocation source or failure-authority binding is incomplete")
		}
		if err := validateEvaluationInvocationBinding(plan, attempt, invocation); err != nil {
			return evaluationAuthenticitySetDigests{}, err
		}
		if err := validateEvaluationExecutionBinding(plan, attempt, execution); err != nil {
			return evaluationAuthenticitySetDigests{}, err
		}
		if err := markEvaluationSourceReceiptUsed(usedSources, invocation.UsageSourceReceiptDigest); err != nil {
			return evaluationAuthenticitySetDigests{}, err
		}
		if err := markEvaluationSourceReceiptUsed(usedSources, invocation.CostSourceReceiptDigest); err != nil {
			return evaluationAuthenticitySetDigests{}, err
		}
	}
	for _, record := range endpointRecords {
		receipt, err := decodeEvaluationEndpointSmokeReceipt(record.ReceiptBytes)
		if err != nil {
			return evaluationAuthenticitySetDigests{}, err
		}
		usageSource, usageExists := sourcesByDigest[receipt.UsageSourceReceiptDigest]
		costSource, costExists := sourcesByDigest[receipt.CostSourceReceiptDigest]
		if receipt.Outcome != "passed" || !usageExists || !costExists ||
			!evaluationUsageSourceMatches(usageSource, receipt.Value["usage"], receipt.ProviderConfigurationID, "", receipt.ProviderRequestID, "") ||
			!evaluationCostSourceMatches(costSource, receipt.Value["usage"], receipt.Value["cost"],
				receipt.ProviderConfigurationID, "", receipt.ProviderRequestID, "", receipt.PricingSnapshotRef,
				pricingBySnapshotDigest, usedSources) {
			return evaluationAuthenticitySetDigests{}, conflict("evaluation endpoint smoke source binding is incomplete")
		}
		if err := markEvaluationSourceReceiptUsed(usedSources, receipt.UsageSourceReceiptDigest); err != nil {
			return evaluationAuthenticitySetDigests{}, err
		}
		if err := markEvaluationSourceReceiptUsed(usedSources, receipt.CostSourceReceiptDigest); err != nil {
			return evaluationAuthenticitySetDigests{}, err
		}
	}
	if len(usedSources) != len(sourceRecords) {
		return evaluationAuthenticitySetDigests{}, conflict("evaluation source receipts contain unreferenced evidence")
	}
	endpointDigest, err := evaluationAuthenticitySetDigest(endpointRecords, func(record EvaluationEndpointSmokeReceiptRecord) string { return record.ReceiptDigest })
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	invocationDigest, err := evaluationAuthenticitySetDigest(invocationRecords, func(record EvaluationInvocationReceiptRecord) string { return record.EvidenceDigest })
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	sourceDigest, err := evaluationAuthenticitySetDigest(sourceRecords, func(record EvaluationSourceReceiptRecord) string { return record.ReceiptDigest })
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	executionDigest, err := evaluationAuthenticitySetDigest(executionRecords, func(record EvaluationExecutionReceiptRecord) string { return record.ReceiptDigest })
	if err != nil {
		return evaluationAuthenticitySetDigests{}, err
	}
	return evaluationAuthenticitySetDigests{
		EndpointSmoke: endpointDigest, Invocation: invocationDigest, Source: sourceDigest, Execution: executionDigest,
	}, nil
}

func evaluationSingletonArtifact(artifacts []EvaluationArtifactRecord, factType string) (EvaluationArtifactRecord, error) {
	var matched []EvaluationArtifactRecord
	for _, artifact := range artifacts {
		if artifact.FactType == factType {
			matched = append(matched, artifact)
		}
	}
	if len(matched) != 1 {
		return EvaluationArtifactRecord{}, conflict("evaluation partition requires exactly one " + factType)
	}
	return matched[0], nil
}

func (repository *Repository) StoreEvaluationAuthorityAttestation(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	attestationBytes []byte,
	verifier EvaluationAuthorityAttestationVerifier,
) (EvaluationAuthorityAttestationRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationAuthorityAttestationRecord{}, false, err
	}
	if verifier == nil {
		return EvaluationAuthorityAttestationRecord{}, false, ErrInvalid
	}
	attestation, err := decodeEvaluationAuthorityAttestation(attestationBytes)
	if err != nil {
		return EvaluationAuthorityAttestationRecord{}, false, err
	}
	if err := verifier(ctx, EvaluationAuthorityAttestationVerification{
		AuthorityID: attestation.AuthorityID, KeyID: attestation.KeyID, Algorithm: "ed25519",
		AttestedPayloadDigest: attestation.AttestedPayloadDigest,
		AttestedPayloadBytes:  append([]byte(nil), attestation.AttestedPayloadBytes...),
		SignatureBase64URL:    attestation.Signature,
	}); err != nil {
		return EvaluationAuthorityAttestationRecord{}, false, fmt.Errorf("%w: evaluation authority signature verification failed: %v", ErrUnauthorized, err)
	}
	writeContext, cancel, tx, planRecord, plan, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationAuthorityAttestationRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := ensureEvaluationV46EligiblePartition(writeContext, tx, authority.NamespaceID, partition); err != nil {
		return EvaluationAuthorityAttestationRecord{}, false, err
	}
	if err := lockEvaluationPlanForFinalization(writeContext, tx, authority.NamespaceID, partition); err != nil {
		return EvaluationAuthorityAttestationRecord{}, false, err
	}
	if attestation.PlanDigest != plan.PlanDigest || attestation.RepositoryCommit != plan.RepositoryCommit ||
		attestation.IssuedAt.Before(plan.PlannedAt) || attestation.IssuedAt.After(plan.ExpiresAt) {
		return EvaluationAuthorityAttestationRecord{}, false, conflict("evaluation authority attestation belongs to a different or expired plan partition")
	}
	attempts, err := queryEvaluationAttempts(writeContext, tx, authority.NamespaceID, partition, planRecord, "")
	if err != nil {
		return EvaluationAuthorityAttestationRecord{}, false, err
	}
	evidence, err := queryEvaluationAuthenticityEvidenceV3(
		writeContext, tx, authority.NamespaceID, partition, planRecord, attempts, true,
	)
	if err != nil {
		return EvaluationAuthorityAttestationRecord{}, false, err
	}
	setDigests, err := validateEvaluationAuthenticityCompletenessV3(
		plan, attempts, evidence.EndpointSmokeCommit, evidence.EndpointSmokeIntents, evidence.EndpointSmokeTransports,
		evidence.EndpointSmokeSpools, evidence.EndpointSmokeDispositions, evidence.EndpointSmokeFailures,
		evidence.EndpointSmokes, evidence.PreDispatchFailures, evidence.DispatchIntents, evidence.Transports,
		evidence.Spools, evidence.SpoolDispositions, evidence.InvocationTurns, evidence.InvocationTurnSets,
		evidence.ResultSubmissions, evidence.ControlledRuntimes, evidence.CapabilityExecutions,
		evidence.AttemptAuthorityOwners, evidence.CapabilitySpecifics, evidence.ProviderCapabilityObservations,
		evidence.VerificationAttemptGrants,
		evidence.ValidatedHumanReviews, evidence.ValidatedHumanMetrics, evidence.ValidatedHumanMetricSetDigest,
		evidence.ReviewRasterScanRecords,
		evidence.ReviewCandidateRefs, evidence.BlindReviewMappings,
		evidence.Sources, evidence.Executions,
	)
	if err != nil {
		return EvaluationAuthorityAttestationRecord{}, false, err
	}
	qualificationSetDigests, err := evaluationQualificationAuthorityArchiveSetDigests(
		writeContext, tx, authority, partition, plan,
	)
	if err != nil {
		return EvaluationAuthorityAttestationRecord{}, false, err
	}
	setDigests.CapabilityProbeAdmission = qualificationSetDigests.CapabilityProbeAdmission
	setDigests.CapabilityProbeReference = qualificationSetDigests.CapabilityProbeReference
	setDigests.RuntimeFactSourceOwnerRegistration = qualificationSetDigests.RuntimeFactSourceOwnerRegistration
	setDigests.CapabilityProbeProviderResourceCleanup = qualificationSetDigests.CapabilityProbeProviderResourceCleanup
	setDigests.HostedRetrievalRuntimeResourceLifecycleJournal = qualificationSetDigests.HostedRetrievalRuntimeResourceLifecycleJournal
	setDigests.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBinding = qualificationSetDigests.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBinding
	setDigests.HostedRetrievalRuntimeResourceCleanup = qualificationSetDigests.HostedRetrievalRuntimeResourceCleanup
	setDigests.CapabilityEffectProviderRuntimeJournal = qualificationSetDigests.CapabilityEffectProviderRuntimeJournal
	setDigests.OptionalCapabilityFactSource = qualificationSetDigests.OptionalCapabilityFactSource
	setDigests.OptionalCapabilityFactAuthority = qualificationSetDigests.OptionalCapabilityFactAuthority
	if err := validateEvaluationAuthoritySetDigests(attestation.EvaluationAuthorityAttestationRecord, setDigests); err != nil {
		return EvaluationAuthorityAttestationRecord{}, false, err
	}
	artifacts, err := queryEvaluationArtifacts(writeContext, tx, authority.NamespaceID, partition, "")
	if err != nil {
		return EvaluationAuthorityAttestationRecord{}, false, err
	}
	var validatedHumanReview *EvaluationValidatedHumanReviewArtifactRecord
	if len(evidence.ValidatedHumanReviews) == 1 {
		validatedHumanReview = &evidence.ValidatedHumanReviews[0]
	}
	reviewLeaseDigest, err := evaluationValidatedHumanReviewLeaseDigest(artifacts, validatedHumanReview)
	if err != nil {
		return EvaluationAuthorityAttestationRecord{}, false, err
	}
	if attestation.ReviewLeaseDigest != reviewLeaseDigest {
		return EvaluationAuthorityAttestationRecord{}, false, conflict("evaluation authority attestation review lease binding drifted")
	}
	if err := validateEvaluationReviewRasterScanBindings(planRecord, attempts, evidence.ReviewRasterScanRecords); err != nil {
		return EvaluationAuthorityAttestationRecord{}, false, err
	}
	if err := validateEvaluationReviewCandidateBindings(
		planRecord, attempts, evidence.InvocationTurns, evidence.Executions,
		evidence.ReviewRasterScanRecords, evidence.ReviewCandidateRefs, true,
	); err != nil {
		return EvaluationAuthorityAttestationRecord{}, false, err
	}
	holdout, err := evaluationSingletonArtifact(artifacts, "evaluation-holdout-receipt")
	if err != nil || holdout.FactDigest != attestation.HoldoutExecutionReceiptDigest {
		return EvaluationAuthorityAttestationRecord{}, false, conflict("evaluation authority attestation holdout receipt drifted")
	}
	manifest, err := evaluationSingletonArtifact(artifacts, "evaluation-manifest")
	if err != nil {
		return EvaluationAuthorityAttestationRecord{}, false, err
	}
	if err := validateEvaluationAuthorityCompletionWindow(attestation.IssuedAt, manifest, evidence.Sources); err != nil {
		return EvaluationAuthorityAttestationRecord{}, false, err
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_authority_attestations (
		namespace_id, plan_digest, repository_commit, authority_id, key_id, evidence_set_digest,
		endpoint_smoke_dispatch_intent_set_digest, endpoint_smoke_transport_receipt_set_digest,
		endpoint_smoke_result_spool_receipt_set_digest, endpoint_smoke_result_spool_disposition_receipt_set_digest,
		endpoint_smoke_validation_failure_receipt_set_digest,
		endpoint_smoke_set_digest, pre_dispatch_failure_receipt_set_digest,
		transport_dispatch_intent_set_digest, transport_receipt_set_digest,
		provider_result_spool_receipt_set_digest, provider_result_spool_disposition_receipt_set_digest,
		invocation_turn_receipt_set_digest, invocation_turn_set_receipt_set_digest,
		result_submission_receipt_set_digest,
		controlled_runtime_receipt_set_digest, capability_execution_receipt_set_digest,
		verification_attempt_grant_receipt_set_digest,
		validated_human_review_artifact_set_digest,
		review_lease_digest,
		review_raster_scan_receipt_set_digest, review_candidate_ref_set_digest,
		blind_review_mapping_set_digest, source_receipt_set_digest, execution_receipt_set_digest,
		holdout_execution_receipt_digest, secret_canary_set_digest, protected_holdout_canary_set_digest,
		attestation_digest, attestation_json, attestation_bytes, issued_at
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
		$16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
		$31, $32, $33, $34, $35::jsonb, $36, $37)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		attestation.AuthorityID, attestation.KeyID, attestation.EvidenceSetDigest,
		attestation.EndpointSmokeDispatchIntentSetDigest, attestation.EndpointSmokeTransportReceiptSetDigest,
		attestation.EndpointSmokeResultSpoolReceiptSetDigest, attestation.EndpointSmokeResultSpoolDispositionReceiptSetDigest,
		attestation.EndpointSmokeValidationFailureReceiptSetDigest,
		attestation.EndpointSmokeSetDigest, attestation.PreDispatchFailureReceiptSetDigest,
		attestation.TransportDispatchIntentSetDigest, attestation.TransportReceiptSetDigest,
		attestation.ProviderResultSpoolReceiptSetDigest, attestation.ProviderResultSpoolDispositionReceiptSetDigest,
		attestation.InvocationTurnReceiptSetDigest, attestation.InvocationTurnSetReceiptSetDigest,
		attestation.ResultSubmissionReceiptSetDigest,
		attestation.ControlledRuntimeReceiptSetDigest, attestation.CapabilityExecutionReceiptSetDigest,
		attestation.VerificationAttemptGrantReceiptSetDigest,
		attestation.ValidatedHumanReviewArtifactSetDigest,
		nullableEvaluationAuthenticityString(attestation.ReviewLeaseDigest),
		attestation.ReviewRasterScanReceiptSetDigest, attestation.ReviewCandidateRefSetDigest,
		attestation.BlindReviewMappingSetDigest,
		attestation.SourceReceiptSetDigest, attestation.ExecutionReceiptSetDigest,
		attestation.HoldoutExecutionReceiptDigest, attestation.SecretCanarySetDigest, attestation.ProtectedHoldoutCanarySetDigest,
		attestation.AttestationDigest, string(attestation.AttestationBytes),
		attestation.AttestationBytes, attestation.IssuedAt)
	if err != nil {
		return EvaluationAuthorityAttestationRecord{}, false, err
	}
	if _, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_authority_attestation_v46_roots (
		namespace_id,plan_digest,attestation_digest,attempt_authority_owner_receipt_set_digest,
		provider_capability_observation_receipt_set_digest,capability_specific_receipt_set_digest,
		validated_human_metric_observation_set_digest,capability_probe_admission_set_digest,
		capability_probe_reference_receipt_set_digest,runtime_fact_source_owner_registration_set_digest,
		capability_probe_provider_resource_cleanup_set_digest,
		hosted_retrieval_runtime_resource_lifecycle_journal_set_digest,
		hosted_retrieval_runtime_resource_lifecycle_budget_closure_binding_set_digest,
		hosted_retrieval_runtime_resource_cleanup_set_digest,
		capability_effect_provider_runtime_journal_set_digest,
		optional_capability_fact_source_set_digest,optional_capability_fact_authority_set_digest,created_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, partition.PlanDigest, attestation.AttestationDigest,
		attestation.AttemptAuthorityOwnerReceiptSetDigest,
		attestation.ProviderCapabilityObservationReceiptSetDigest,
		attestation.CapabilitySpecificReceiptSetDigest,
		attestation.ValidatedHumanMetricObservationSetDigest,
		attestation.CapabilityProbeAdmissionSetDigest, attestation.CapabilityProbeReferenceReceiptSetDigest,
		attestation.RuntimeFactSourceOwnerRegistrationSetDigest,
		attestation.CapabilityProbeProviderResourceCleanupSetDigest,
		attestation.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest,
		attestation.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest,
		attestation.HostedRetrievalRuntimeResourceCleanupSetDigest,
		attestation.CapabilityEffectProviderRuntimeJournalSetDigest,
		attestation.OptionalCapabilityFactSourceSetDigest,
		attestation.OptionalCapabilityFactAuthoritySetDigest, attestation.IssuedAt); err != nil {
		return EvaluationAuthorityAttestationRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationAuthorityAttestationRecord{}, false, err
	}
	replayed := inserted == 0
	if replayed {
		existing, err := immutableEvaluationCollisionBytes(writeContext, tx, `SELECT attestation_bytes
		FROM agent_evaluation_authority_attestations
		WHERE namespace_id = $1 AND (plan_digest = $2 OR attestation_digest = $3)
		FOR SHARE`, authority.NamespaceID, partition.PlanDigest, attestation.AttestationDigest)
		if err != nil {
			return EvaluationAuthorityAttestationRecord{}, false, err
		}
		if !bytes.Equal(existing, attestation.AttestationBytes) {
			return EvaluationAuthorityAttestationRecord{}, false, conflict("evaluation authority identity was reused with different immutable bytes")
		}
	}
	var exactV46Roots bool
	if err := tx.QueryRowContext(writeContext, `SELECT base.v46_eligible
			AND roots.attempt_authority_owner_receipt_set_digest=$3
			AND roots.provider_capability_observation_receipt_set_digest=$4
			AND roots.capability_specific_receipt_set_digest=$5
			AND roots.validated_human_metric_observation_set_digest=$6
			AND roots.capability_probe_admission_set_digest=$7
			AND roots.capability_probe_reference_receipt_set_digest=$8
			AND roots.runtime_fact_source_owner_registration_set_digest=$9
			AND roots.capability_probe_provider_resource_cleanup_set_digest=$10
			AND roots.hosted_retrieval_runtime_resource_lifecycle_journal_set_digest=$11
			AND roots.hosted_retrieval_runtime_resource_lifecycle_budget_closure_binding_set_digest=$12
			AND roots.hosted_retrieval_runtime_resource_cleanup_set_digest=$13
			AND roots.capability_effect_provider_runtime_journal_set_digest=$14
			AND roots.optional_capability_fact_source_set_digest=$15
			AND roots.optional_capability_fact_authority_set_digest=$16
			AND roots.created_at=base.issued_at
		FROM agent_evaluation_authority_attestations base
		JOIN agent_evaluation_authority_attestation_v46_roots roots
			ON roots.namespace_id=base.namespace_id AND roots.plan_digest=base.plan_digest
			AND roots.attestation_digest=base.attestation_digest
		WHERE base.namespace_id=$1 AND base.plan_digest=$2`, authority.NamespaceID, partition.PlanDigest,
		attestation.AttemptAuthorityOwnerReceiptSetDigest,
		attestation.ProviderCapabilityObservationReceiptSetDigest,
		attestation.CapabilitySpecificReceiptSetDigest,
		attestation.ValidatedHumanMetricObservationSetDigest,
		attestation.CapabilityProbeAdmissionSetDigest, attestation.CapabilityProbeReferenceReceiptSetDigest,
		attestation.RuntimeFactSourceOwnerRegistrationSetDigest,
		attestation.CapabilityProbeProviderResourceCleanupSetDigest,
		attestation.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest,
		attestation.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest,
		attestation.HostedRetrievalRuntimeResourceCleanupSetDigest,
		attestation.CapabilityEffectProviderRuntimeJournalSetDigest,
		attestation.OptionalCapabilityFactSourceSetDigest,
		attestation.OptionalCapabilityFactAuthoritySetDigest).Scan(&exactV46Roots); err != nil || !exactV46Roots {
		if err != nil {
			return EvaluationAuthorityAttestationRecord{}, false, err
		}
		return EvaluationAuthorityAttestationRecord{}, false, conflict("evaluation authority attestation v46 roots drifted")
	}
	if err := commitEvaluationAuthenticityWrite(tx); err != nil {
		return EvaluationAuthorityAttestationRecord{}, false, err
	}
	record := attestation.EvaluationAuthorityAttestationRecord
	record.NamespaceID = authority.NamespaceID
	return record, replayed, nil
}

func validateEvaluationAuthorityCompletionWindow(
	issuedAt time.Time,
	manifest EvaluationArtifactRecord,
	sources []EvaluationSourceReceiptRecord,
) error {
	if issuedAt.Before(manifest.RecordedAt) {
		return conflict("evaluation authority attestation predates manifest completion")
	}
	for _, source := range sources {
		if source.ObservedAt.After(manifest.RecordedAt) {
			return conflict("evaluation source receipt was observed after manifest completion")
		}
	}
	return nil
}

func (repository *Repository) StoreEvaluationEvidenceRoot(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	rootBytes []byte,
) (EvaluationEvidenceRootRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationEvidenceRootRecord{}, false, err
	}
	root, err := decodeEvaluationEvidenceRoot(rootBytes)
	if err != nil {
		return EvaluationEvidenceRootRecord{}, false, err
	}
	writeContext, cancel, tx, planRecord, plan, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationEvidenceRootRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := ensureEvaluationV46EligiblePartition(writeContext, tx, authority.NamespaceID, partition); err != nil {
		return EvaluationEvidenceRootRecord{}, false, err
	}
	if root.PlanDigest != plan.PlanDigest || root.RepositoryCommit != plan.RepositoryCommit ||
		root.RecordedAt.Before(plan.PlannedAt) || root.RecordedAt.After(plan.ExpiresAt) {
		return EvaluationEvidenceRootRecord{}, false, conflict("evaluation evidence root belongs to a different or expired plan partition")
	}
	attestationRecord, err := queryEvaluationAuthorityAttestation(writeContext, tx, authority.NamespaceID, partition, planRecord)
	if err != nil {
		return EvaluationEvidenceRootRecord{}, false, err
	}
	if attestationRecord == nil {
		return EvaluationEvidenceRootRecord{}, false, conflict("evaluation evidence root requires an authority attestation")
	}
	attempts, err := queryEvaluationAttempts(writeContext, tx, authority.NamespaceID, partition, planRecord, "")
	if err != nil {
		return EvaluationEvidenceRootRecord{}, false, err
	}
	evidence, err := queryEvaluationAuthenticityEvidenceV3(
		writeContext, tx, authority.NamespaceID, partition, planRecord, attempts, true,
	)
	if err != nil {
		return EvaluationEvidenceRootRecord{}, false, err
	}
	setDigests, err := validateEvaluationAuthenticityCompletenessV3(
		plan, attempts, evidence.EndpointSmokeCommit, evidence.EndpointSmokeIntents, evidence.EndpointSmokeTransports,
		evidence.EndpointSmokeSpools, evidence.EndpointSmokeDispositions, evidence.EndpointSmokeFailures,
		evidence.EndpointSmokes, evidence.PreDispatchFailures, evidence.DispatchIntents, evidence.Transports,
		evidence.Spools, evidence.SpoolDispositions, evidence.InvocationTurns, evidence.InvocationTurnSets,
		evidence.ResultSubmissions, evidence.ControlledRuntimes, evidence.CapabilityExecutions,
		evidence.AttemptAuthorityOwners, evidence.CapabilitySpecifics, evidence.ProviderCapabilityObservations,
		evidence.VerificationAttemptGrants,
		evidence.ValidatedHumanReviews, evidence.ValidatedHumanMetrics, evidence.ValidatedHumanMetricSetDigest,
		evidence.ReviewRasterScanRecords,
		evidence.ReviewCandidateRefs, evidence.BlindReviewMappings,
		evidence.Sources, evidence.Executions,
	)
	if err != nil {
		return EvaluationEvidenceRootRecord{}, false, err
	}
	qualificationSetDigests, err := evaluationQualificationAuthorityArchiveSetDigests(
		writeContext, tx, authority, partition, plan,
	)
	if err != nil {
		return EvaluationEvidenceRootRecord{}, false, err
	}
	setDigests.CapabilityProbeAdmission = qualificationSetDigests.CapabilityProbeAdmission
	setDigests.CapabilityProbeReference = qualificationSetDigests.CapabilityProbeReference
	setDigests.RuntimeFactSourceOwnerRegistration = qualificationSetDigests.RuntimeFactSourceOwnerRegistration
	setDigests.CapabilityProbeProviderResourceCleanup = qualificationSetDigests.CapabilityProbeProviderResourceCleanup
	setDigests.HostedRetrievalRuntimeResourceLifecycleJournal = qualificationSetDigests.HostedRetrievalRuntimeResourceLifecycleJournal
	setDigests.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBinding = qualificationSetDigests.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBinding
	setDigests.HostedRetrievalRuntimeResourceCleanup = qualificationSetDigests.HostedRetrievalRuntimeResourceCleanup
	setDigests.CapabilityEffectProviderRuntimeJournal = qualificationSetDigests.CapabilityEffectProviderRuntimeJournal
	setDigests.OptionalCapabilityFactSource = qualificationSetDigests.OptionalCapabilityFactSource
	setDigests.OptionalCapabilityFactAuthority = qualificationSetDigests.OptionalCapabilityFactAuthority
	if root.EvidenceSetDigest != attestationRecord.EvidenceSetDigest ||
		root.CapabilityProbeAdmissionSetDigest != attestationRecord.CapabilityProbeAdmissionSetDigest ||
		root.CapabilityProbeReferenceReceiptSetDigest != attestationRecord.CapabilityProbeReferenceReceiptSetDigest ||
		root.RuntimeFactSourceOwnerRegistrationSetDigest != attestationRecord.RuntimeFactSourceOwnerRegistrationSetDigest ||
		root.CapabilityProbeProviderResourceCleanupSetDigest != attestationRecord.CapabilityProbeProviderResourceCleanupSetDigest ||
		root.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest != attestationRecord.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest ||
		root.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest != attestationRecord.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest ||
		root.HostedRetrievalRuntimeResourceCleanupSetDigest != attestationRecord.HostedRetrievalRuntimeResourceCleanupSetDigest ||
		root.CapabilityEffectProviderRuntimeJournalSetDigest != attestationRecord.CapabilityEffectProviderRuntimeJournalSetDigest ||
		root.OptionalCapabilityFactSourceSetDigest != attestationRecord.OptionalCapabilityFactSourceSetDigest ||
		root.OptionalCapabilityFactAuthoritySetDigest != attestationRecord.OptionalCapabilityFactAuthoritySetDigest ||
		root.EndpointSmokeDispatchIntentSetDigest != attestationRecord.EndpointSmokeDispatchIntentSetDigest ||
		root.EndpointSmokeTransportReceiptSetDigest != attestationRecord.EndpointSmokeTransportReceiptSetDigest ||
		root.EndpointSmokeResultSpoolReceiptSetDigest != attestationRecord.EndpointSmokeResultSpoolReceiptSetDigest ||
		root.EndpointSmokeResultSpoolDispositionReceiptSetDigest != attestationRecord.EndpointSmokeResultSpoolDispositionReceiptSetDigest ||
		root.EndpointSmokeValidationFailureReceiptSetDigest != attestationRecord.EndpointSmokeValidationFailureReceiptSetDigest ||
		root.AttemptAuthorityOwnerReceiptSetDigest != attestationRecord.AttemptAuthorityOwnerReceiptSetDigest ||
		root.CapabilitySpecificReceiptSetDigest != attestationRecord.CapabilitySpecificReceiptSetDigest ||
		root.ProviderCapabilityObservationReceiptSetDigest != attestationRecord.ProviderCapabilityObservationReceiptSetDigest ||
		root.ValidatedHumanMetricObservationSetDigest != attestationRecord.ValidatedHumanMetricObservationSetDigest ||
		root.AuthorityAttestationDigest != attestationRecord.AttestationDigest ||
		root.HoldoutExecutionReceiptDigest != attestationRecord.HoldoutExecutionReceiptDigest ||
		root.BlindReviewMappingSetDigest != attestationRecord.BlindReviewMappingSetDigest ||
		root.SecretCanarySetDigest != attestationRecord.SecretCanarySetDigest ||
		root.ProtectedHoldoutCanarySetDigest != attestationRecord.ProtectedHoldoutCanarySetDigest ||
		validateEvaluationEvidenceRootSetDigests(root.EvaluationEvidenceRootRecord, setDigests) != nil ||
		validateEvaluationAuthoritySetDigests(*attestationRecord, setDigests) != nil ||
		root.RecordedAt.Before(attestationRecord.IssuedAt) {
		return EvaluationEvidenceRootRecord{}, false, conflict("evaluation evidence root drifted from its authority-attested receipt sets")
	}
	artifacts, err := queryEvaluationArtifacts(writeContext, tx, authority.NamespaceID, partition, "")
	if err != nil {
		return EvaluationEvidenceRootRecord{}, false, err
	}
	var validatedHumanReview *EvaluationValidatedHumanReviewArtifactRecord
	if len(evidence.ValidatedHumanReviews) == 1 {
		validatedHumanReview = &evidence.ValidatedHumanReviews[0]
	}
	reviewLeaseDigest, err := evaluationValidatedHumanReviewLeaseDigest(artifacts, validatedHumanReview)
	if err != nil {
		return EvaluationEvidenceRootRecord{}, false, err
	}
	if root.ReviewLeaseDigest != reviewLeaseDigest || attestationRecord.ReviewLeaseDigest != reviewLeaseDigest {
		return EvaluationEvidenceRootRecord{}, false, conflict("evaluation evidence root review lease binding drifted")
	}
	if err := validateEvaluationReviewRasterScanBindings(planRecord, attempts, evidence.ReviewRasterScanRecords); err != nil {
		return EvaluationEvidenceRootRecord{}, false, err
	}
	if err := validateEvaluationReviewCandidateBindings(
		planRecord, attempts, evidence.InvocationTurns, evidence.Executions,
		evidence.ReviewRasterScanRecords, evidence.ReviewCandidateRefs, true,
	); err != nil {
		return EvaluationEvidenceRootRecord{}, false, err
	}
	manifest, err := evaluationSingletonArtifact(artifacts, "evaluation-manifest")
	if err != nil || manifest.FactDigest != root.EvaluationManifestDigest {
		return EvaluationEvidenceRootRecord{}, false, conflict("evaluation evidence root manifest binding drifted")
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_evidence_roots (
		namespace_id, plan_digest, repository_commit, root_id, evidence_set_digest,
		endpoint_smoke_dispatch_intent_set_digest, endpoint_smoke_transport_receipt_set_digest,
		endpoint_smoke_result_spool_receipt_set_digest, endpoint_smoke_result_spool_disposition_receipt_set_digest,
		endpoint_smoke_validation_failure_receipt_set_digest,
		endpoint_smoke_set_digest, pre_dispatch_failure_receipt_set_digest,
		transport_dispatch_intent_set_digest, transport_receipt_set_digest,
		provider_result_spool_receipt_set_digest, provider_result_spool_disposition_receipt_set_digest,
		invocation_turn_receipt_set_digest, invocation_turn_set_receipt_set_digest,
		result_submission_receipt_set_digest,
		controlled_runtime_receipt_set_digest, capability_execution_receipt_set_digest,
		verification_attempt_grant_receipt_set_digest,
		validated_human_review_artifact_set_digest,
		review_lease_digest,
		review_raster_scan_receipt_set_digest, review_candidate_ref_set_digest,
		blind_review_mapping_set_digest, source_receipt_set_digest, execution_receipt_set_digest,
		holdout_execution_receipt_digest, secret_canary_set_digest, protected_holdout_canary_set_digest,
		authority_attestation_digest, evaluation_manifest_digest,
		bundle_digest, bundle_artifact_digest, bundle_artifact_size, root_digest, root_json, root_bytes, recorded_at
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
		$16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
		$31, $32, $33, $34, $35, $36, $37, $38, $39::jsonb, $40, $41)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		root.RootID, root.EvidenceSetDigest,
		root.EndpointSmokeDispatchIntentSetDigest, root.EndpointSmokeTransportReceiptSetDigest,
		root.EndpointSmokeResultSpoolReceiptSetDigest, root.EndpointSmokeResultSpoolDispositionReceiptSetDigest,
		root.EndpointSmokeValidationFailureReceiptSetDigest,
		root.EndpointSmokeSetDigest, root.PreDispatchFailureReceiptSetDigest,
		root.TransportDispatchIntentSetDigest, root.TransportReceiptSetDigest,
		root.ProviderResultSpoolReceiptSetDigest, root.ProviderResultSpoolDispositionReceiptSetDigest,
		root.InvocationTurnReceiptSetDigest, root.InvocationTurnSetReceiptSetDigest,
		root.ResultSubmissionReceiptSetDigest,
		root.ControlledRuntimeReceiptSetDigest, root.CapabilityExecutionReceiptSetDigest,
		root.VerificationAttemptGrantReceiptSetDigest,
		root.ValidatedHumanReviewArtifactSetDigest,
		nullableEvaluationAuthenticityString(root.ReviewLeaseDigest),
		root.ReviewRasterScanReceiptSetDigest, root.ReviewCandidateRefSetDigest, root.BlindReviewMappingSetDigest,
		root.SourceReceiptSetDigest, root.ExecutionReceiptSetDigest,
		root.HoldoutExecutionReceiptDigest, root.SecretCanarySetDigest, root.ProtectedHoldoutCanarySetDigest,
		root.AuthorityAttestationDigest,
		root.EvaluationManifestDigest, root.BundleDigest, root.BundleArtifactDigest, root.BundleArtifactSize,
		root.RootDigest, string(root.RootBytes), root.RootBytes, root.RecordedAt)
	if err != nil {
		return EvaluationEvidenceRootRecord{}, false, err
	}
	if _, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_evidence_root_v46_roots (
		namespace_id,plan_digest,root_digest,authority_attestation_digest,
		attempt_authority_owner_receipt_set_digest,provider_capability_observation_receipt_set_digest,
		capability_specific_receipt_set_digest,validated_human_metric_observation_set_digest,
		capability_probe_admission_set_digest,capability_probe_reference_receipt_set_digest,
		runtime_fact_source_owner_registration_set_digest,capability_probe_provider_resource_cleanup_set_digest,
		hosted_retrieval_runtime_resource_lifecycle_journal_set_digest,
		hosted_retrieval_runtime_resource_lifecycle_budget_closure_binding_set_digest,
		hosted_retrieval_runtime_resource_cleanup_set_digest,
		capability_effect_provider_runtime_journal_set_digest,
		optional_capability_fact_source_set_digest,
		optional_capability_fact_authority_set_digest,created_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, partition.PlanDigest, root.RootDigest,
		root.AuthorityAttestationDigest, root.AttemptAuthorityOwnerReceiptSetDigest,
		root.ProviderCapabilityObservationReceiptSetDigest, root.CapabilitySpecificReceiptSetDigest,
		root.ValidatedHumanMetricObservationSetDigest,
		root.CapabilityProbeAdmissionSetDigest, root.CapabilityProbeReferenceReceiptSetDigest,
		root.RuntimeFactSourceOwnerRegistrationSetDigest,
		root.CapabilityProbeProviderResourceCleanupSetDigest,
		root.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest,
		root.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest,
		root.HostedRetrievalRuntimeResourceCleanupSetDigest,
		root.CapabilityEffectProviderRuntimeJournalSetDigest,
		root.OptionalCapabilityFactSourceSetDigest,
		root.OptionalCapabilityFactAuthoritySetDigest, root.RecordedAt); err != nil {
		return EvaluationEvidenceRootRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationEvidenceRootRecord{}, false, err
	}
	replayed := inserted == 0
	if replayed {
		existing, err := immutableEvaluationCollisionBytes(writeContext, tx, `SELECT root_bytes
		FROM agent_evaluation_evidence_roots
		WHERE namespace_id = $1 AND (plan_digest = $2 OR root_id = $3 OR root_digest = $4 OR bundle_digest = $5)
		FOR SHARE`, authority.NamespaceID, partition.PlanDigest, root.RootID, root.RootDigest, root.BundleDigest)
		if err != nil {
			return EvaluationEvidenceRootRecord{}, false, err
		}
		if !bytes.Equal(existing, root.RootBytes) {
			return EvaluationEvidenceRootRecord{}, false, conflict("evaluation evidence root identity was reused with different immutable bytes")
		}
	}
	var exactV46Roots bool
	if err := tx.QueryRowContext(writeContext, `SELECT base.v46_eligible
			AND roots.authority_attestation_digest=$3
			AND roots.attempt_authority_owner_receipt_set_digest=$4
			AND roots.provider_capability_observation_receipt_set_digest=$5
			AND roots.capability_specific_receipt_set_digest=$6
			AND roots.validated_human_metric_observation_set_digest=$7
			AND roots.capability_probe_admission_set_digest=$8
			AND roots.capability_probe_reference_receipt_set_digest=$9
			AND roots.runtime_fact_source_owner_registration_set_digest=$10
			AND roots.capability_probe_provider_resource_cleanup_set_digest=$11
			AND roots.hosted_retrieval_runtime_resource_lifecycle_journal_set_digest=$12
			AND roots.hosted_retrieval_runtime_resource_lifecycle_budget_closure_binding_set_digest=$13
			AND roots.hosted_retrieval_runtime_resource_cleanup_set_digest=$14
			AND roots.capability_effect_provider_runtime_journal_set_digest=$15
			AND roots.optional_capability_fact_source_set_digest=$16
			AND roots.optional_capability_fact_authority_set_digest=$17
			AND roots.created_at=base.recorded_at
		FROM agent_evaluation_evidence_roots base
		JOIN agent_evaluation_evidence_root_v46_roots roots
			ON roots.namespace_id=base.namespace_id AND roots.plan_digest=base.plan_digest
			AND roots.root_digest=base.root_digest
		WHERE base.namespace_id=$1 AND base.plan_digest=$2`, authority.NamespaceID, partition.PlanDigest,
		root.AuthorityAttestationDigest, root.AttemptAuthorityOwnerReceiptSetDigest,
		root.ProviderCapabilityObservationReceiptSetDigest, root.CapabilitySpecificReceiptSetDigest,
		root.ValidatedHumanMetricObservationSetDigest,
		root.CapabilityProbeAdmissionSetDigest, root.CapabilityProbeReferenceReceiptSetDigest,
		root.RuntimeFactSourceOwnerRegistrationSetDigest,
		root.CapabilityProbeProviderResourceCleanupSetDigest,
		root.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest,
		root.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest,
		root.HostedRetrievalRuntimeResourceCleanupSetDigest,
		root.CapabilityEffectProviderRuntimeJournalSetDigest,
		root.OptionalCapabilityFactSourceSetDigest,
		root.OptionalCapabilityFactAuthoritySetDigest).Scan(&exactV46Roots); err != nil || !exactV46Roots {
		if err != nil {
			return EvaluationEvidenceRootRecord{}, false, err
		}
		return EvaluationEvidenceRootRecord{}, false, conflict("evaluation evidence root v46 roots drifted")
	}
	if err := commitEvaluationAuthenticityWrite(tx); err != nil {
		return EvaluationEvidenceRootRecord{}, false, err
	}
	record := root.EvaluationEvidenceRootRecord
	record.NamespaceID = authority.NamespaceID
	return record, replayed, nil
}

func beginEvaluationAuthenticityWrite(
	ctx context.Context,
	repository *Repository,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) (context.Context, context.CancelFunc, *sql.Tx, EvaluationPlanRecord, evaluationPlanFact, error) {
	if err := repository.available(); err != nil {
		return nil, nil, nil, EvaluationPlanRecord{}, evaluationPlanFact{}, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return nil, nil, nil, EvaluationPlanRecord{}, evaluationPlanFact{}, err
	}
	if err := validateEvaluationPartition(partition); err != nil {
		return nil, nil, nil, EvaluationPlanRecord{}, evaluationPlanFact{}, err
	}
	writeContext, cancel := repositoryContext(ctx)
	tx, err := repository.db.BeginTx(writeContext, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		cancel()
		return nil, nil, nil, EvaluationPlanRecord{}, evaluationPlanFact{}, err
	}
	var planID, planDigest, repositoryCommit string
	var plannedJourneyCount int64
	var source []byte
	var plannedAt, expiresAt time.Time
	err = tx.QueryRowContext(writeContext, `SELECT evaluation_plan_id, plan_digest, repository_commit,
		planned_journey_count, plan_bytes, planned_at, expires_at
	FROM agent_evaluation_plans
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
	FOR SHARE`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit).Scan(
		&planID, &planDigest, &repositoryCommit, &plannedJourneyCount, &source, &plannedAt, &expiresAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		_ = tx.Rollback()
		cancel()
		return nil, nil, nil, EvaluationPlanRecord{}, evaluationPlanFact{}, ErrNotFound
	}
	if err != nil {
		_ = tx.Rollback()
		cancel()
		return nil, nil, nil, EvaluationPlanRecord{}, evaluationPlanFact{}, err
	}
	plan, err := decodeEvaluationPlan(source)
	if err != nil || !bytes.Equal(source, plan.Canonical) || plan.PlanID != planID ||
		plan.PlanDigest != planDigest || plan.RepositoryCommit != repositoryCommit ||
		plan.PlannedJourneyCount != plannedJourneyCount || !plan.PlannedAt.Equal(plannedAt) ||
		!plan.ExpiresAt.Equal(expiresAt) {
		_ = tx.Rollback()
		cancel()
		return nil, nil, nil, EvaluationPlanRecord{}, evaluationPlanFact{}, conflict("persisted evaluation plan metadata drifted from its canonical fact")
	}
	record := EvaluationPlanRecord{
		EvaluationFactRecord: evaluationRecord(authority.NamespaceID, plan.PlanDigest, "evaluation-plan", plan.PlanID, plan.PlanDigest, plan.Canonical, plan.PlannedAt),
		PlanID:               plan.PlanID, RepositoryCommit: plan.RepositoryCommit, PlannedJourneyCount: plan.PlannedJourneyCount,
		PlannedAt: plan.PlannedAt, ExpiresAt: plan.ExpiresAt,
	}
	return writeContext, cancel, tx, record, plan, nil
}

func ensureEvaluationAuthenticitySetOpen(ctx context.Context, tx *sql.Tx, namespaceID, planDigest string) error {
	var finalized bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM agent_evaluation_authority_attestations
		WHERE namespace_id = $1 AND plan_digest = $2
	)`, namespaceID, planDigest).Scan(&finalized); err != nil {
		return err
	}
	if finalized {
		return conflict("evaluation authenticity set is already authority-attested")
	}
	return nil
}

func lockEvaluationPlanForFinalization(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
) error {
	var locked int
	err := tx.QueryRowContext(ctx, `SELECT 1
	FROM agent_evaluation_plans
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
	FOR UPDATE`, namespaceID, partition.PlanDigest, partition.RepositoryCommit).Scan(&locked)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

func nullableEvaluationAuthenticityString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func evaluationPlanObjectByIdentity(raw any, field, identity string) map[string]any {
	values, ok := raw.([]any)
	if !ok {
		return nil
	}
	for _, rawValue := range values {
		value, ok := rawValue.(map[string]any)
		if ok && stringMember(value, field) == identity {
			return value
		}
	}
	return nil
}

func validateEvaluationEndpointSmokeBinding(plan evaluationPlanFact, receipt evaluationEndpointSmokeReceipt) error {
	if receipt.PlanDigest != plan.PlanDigest || receipt.RepositoryCommit != plan.RepositoryCommit {
		return conflict("evaluation endpoint smoke receipt belongs to a different plan partition")
	}
	target := evaluationPlanObjectByIdentity(plan.Value["endpointSmokeTargets"], "smokeTargetId", receipt.SmokeTargetID)
	if target == nil || stringMember(target, "targetDigest") != receipt.SmokeTargetDigest ||
		stringMember(target, "endpointClass") != receipt.EndpointClass ||
		stringMember(target, "protocolFamily") != receipt.ProtocolFamily ||
		stringMember(target, "providerConfigurationId") != receipt.ProviderConfigurationID ||
		stringMember(target, "adapterDigest") != receipt.AdapterDigest ||
		stringMember(target, "smokeProfileDigest") != receipt.SmokeProfileDigest {
		return conflict("evaluation endpoint smoke receipt drifted from its frozen target")
	}
	if receipt.StartedAt.Before(plan.PlannedAt) || receipt.CompletedAt.After(plan.ExpiresAt) {
		return conflict("evaluation endpoint smoke receipt is outside the frozen plan window")
	}
	return nil
}

func expectedEvaluationMediaDigest(plan evaluationPlanFact, attempt evaluationAttemptFact) string {
	descriptor, _ := objectMember(attempt.Value, "descriptor")
	tier, hasTier := descriptor["mediaRepresentationTier"].(string)
	if !hasTier {
		return ""
	}
	values, _ := plan.Value["mediaRepresentationTiers"].([]any)
	for _, raw := range values {
		value, _ := raw.(map[string]any)
		if stringMember(value, "caseId") == attempt.CaseID && stringMember(value, "tier") == tier {
			return stringMember(value, "representationManifestDigest")
		}
	}
	return ""
}

func expectedEvaluationContextDigest(plan evaluationPlanFact, attempt evaluationAttemptFact) string {
	descriptor, _ := objectMember(attempt.Value, "descriptor")
	tier, hasTier := descriptor["contextTier"].(string)
	if !hasTier {
		return ""
	}
	values, _ := plan.Value["contextTiers"].([]any)
	for _, raw := range values {
		value, _ := raw.(map[string]any)
		if stringMember(value, "caseId") == attempt.CaseID && stringMember(value, "tier") == tier {
			return stringMember(value, "contextPackDigest")
		}
	}
	return ""
}

func evaluationInvocationOutcomeMatchesAttempt(status, outcome string) bool {
	switch status {
	case "completed":
		return oneOfString(outcome, "completed", "refused", "safety-blocked", "truncated", "partial")
	case "timed-out":
		return outcome == "timed-out"
	case "schema-failed":
		return outcome == "schema-failed"
	case "cancelled":
		return outcome == "cancelled"
	case "blocked":
		return outcome == "safety-blocked"
	case "provider-error", "rate-limited", "infrastructure-error":
		return outcome == "provider-error"
	default:
		return false
	}
}

func resolveEvaluationInvocationPlanBinding(
	plan evaluationPlanFact,
	receipt evaluationInvocationReceipt,
) (string, string, error) {
	if receipt.PlanDigest != plan.PlanDigest || receipt.RepositoryCommit != plan.RepositoryCommit {
		return "", "", conflict("evaluation invocation receipt belongs to a different plan partition")
	}
	provider := evaluationPlanObjectByIdentity(plan.Value["providerConfigurations"], "providerConfigurationId", receipt.ProviderConfigurationID)
	model := evaluationPlanObjectByIdentity(plan.Value["modelConfigurations"], "lineageDigest", receipt.ModelLineageDigest)
	if provider == nil || model == nil || !sameEvaluationCanonicalValue(receipt.Provider, provider) ||
		!sameEvaluationCanonicalValue(receipt.Model, model) {
		return "", "", conflict("evaluation invocation provider or model is outside the frozen plan")
	}
	var targetID string
	targetValues, _ := plan.Value["capabilityQualificationTargets"].([]any)
	for _, raw := range targetValues {
		target, _ := raw.(map[string]any)
		if stringMember(target, "providerConfigurationId") == receipt.ProviderConfigurationID &&
			stringMember(target, "modelLineageDigest") == receipt.ModelLineageDigest &&
			stringMember(target, "inferenceConfigurationDigest") == receipt.InferenceConfigurationDigest &&
			stringMember(target, "qualificationSliceDigest") == receipt.CapabilityQualificationDigest {
			if targetID != "" {
				return "", "", conflict("evaluation invocation target binding is ambiguous")
			}
			targetID = stringMember(target, "targetId")
		}
	}
	var caseID string
	caseValues, _ := plan.Value["concreteCases"].([]any)
	for _, raw := range caseValues {
		evaluationCase, _ := raw.(map[string]any)
		if stringMember(evaluationCase, "caseDefinitionDigest") == receipt.CaseDefinitionDigest {
			if caseID != "" {
				return "", "", conflict("evaluation invocation case binding is ambiguous")
			}
			caseID = stringMember(evaluationCase, "caseId")
		}
	}
	if targetID == "" || caseID == "" {
		return "", "", conflict("evaluation invocation target or case is outside the frozen plan")
	}
	if receipt.MediaRepresentationManifestDigest != "" {
		matched := false
		mediaValues, _ := plan.Value["mediaRepresentationTiers"].([]any)
		for _, raw := range mediaValues {
			media, _ := raw.(map[string]any)
			if stringMember(media, "caseId") == caseID &&
				stringMember(media, "representationManifestDigest") == receipt.MediaRepresentationManifestDigest {
				matched = true
			}
		}
		if !matched || receipt.MultimodalContextManifestDigest == "" || receipt.ProviderMediaBlockManifestDigest == "" {
			return "", "", conflict("evaluation invocation media evidence is outside the frozen plan")
		}
	}
	if receipt.StartedAt.Before(plan.PlannedAt) || receipt.CompletedAt.After(plan.ExpiresAt) {
		return "", "", conflict("evaluation invocation receipt is outside the frozen plan window")
	}
	return targetID, caseID, nil
}

func validateEvaluationInvocationBinding(plan evaluationPlanFact, attempt evaluationAttemptFact, receipt evaluationInvocationReceipt) error {
	if receipt.PlanDigest != plan.PlanDigest || receipt.RepositoryCommit != plan.RepositoryCommit ||
		receipt.AttemptID != attempt.AttemptID || receipt.DescriptorDigest != attempt.DescriptorDigest {
		return conflict("evaluation invocation receipt belongs to a different plan or attempt")
	}
	resolvedTargetID, resolvedCaseID, err := resolveEvaluationInvocationPlanBinding(plan, receipt)
	if err != nil {
		return err
	}
	if resolvedTargetID != attempt.TargetID || resolvedCaseID != attempt.CaseID {
		return conflict("evaluation invocation receipt drifted from its durable descriptor slice")
	}
	target := evaluationPlanObjectByIdentity(plan.Value["capabilityQualificationTargets"], "targetId", attempt.TargetID)
	evaluationCase := evaluationPlanObjectByIdentity(plan.Value["concreteCases"], "caseId", attempt.CaseID)
	if target == nil || evaluationCase == nil ||
		stringMember(target, "providerConfigurationId") != receipt.ProviderConfigurationID ||
		stringMember(target, "modelLineageDigest") != receipt.ModelLineageDigest ||
		stringMember(target, "inferenceConfigurationDigest") != receipt.InferenceConfigurationDigest ||
		stringMember(target, "qualificationSliceDigest") != receipt.CapabilityQualificationDigest ||
		stringMember(evaluationCase, "caseDefinitionDigest") != receipt.CaseDefinitionDigest {
		return conflict("evaluation invocation receipt drifted from its frozen case, target, provider, or model")
	}
	expectedMedia := expectedEvaluationMediaDigest(plan, attempt)
	if receipt.MediaRepresentationManifestDigest != expectedMedia ||
		(expectedMedia != "" && (receipt.MultimodalContextManifestDigest == "" || receipt.ProviderMediaBlockManifestDigest == "")) {
		return conflict("evaluation invocation media binding drifted from the frozen representation tier")
	}
	if expectedContext := expectedEvaluationContextDigest(plan, attempt); expectedContext != "" && receipt.ContextPackDigest != expectedContext {
		return conflict("evaluation invocation context binding drifted from the frozen context tier")
	}
	responseDigest, _ := attempt.Value["responseDigest"].(string)
	if responseDigest != receipt.ResponseArtifactDigest || receipt.IndependentRunID != attempt.IndependentRunID ||
		!evaluationInvocationOutcomeMatchesAttempt(attempt.Status, receipt.InvocationOutcome) ||
		!sameEvaluationCanonicalValue(receipt.Usage, attempt.Value["usage"]) ||
		!sameEvaluationCanonicalValue(receipt.Cost, attempt.Value["cost"]) ||
		!receipt.StartedAt.Equal(attempt.StartedAt) || !receipt.CompletedAt.Equal(attempt.CompletedAt) {
		return conflict("evaluation invocation receipt drifted from the durable attempt outcome, usage, cost, or time")
	}
	return nil
}

func validateEvaluationSourceBinding(plan evaluationPlanFact, receipt evaluationSourceReceipt) error {
	if receipt.PlanDigest != plan.PlanDigest || receipt.RepositoryCommit != plan.RepositoryCommit {
		return conflict("evaluation source receipt belongs to a different plan partition")
	}
	provider := evaluationPlanObjectByIdentity(plan.Value["providerConfigurations"], "providerConfigurationId", receipt.ProviderConfigurationID)
	if provider == nil {
		provider = evaluationPlanObjectByIdentity(plan.Value["endpointSmokeTargets"], "providerConfigurationId", receipt.ProviderConfigurationID)
	}
	if provider == nil {
		return conflict("evaluation source receipt provider is outside the frozen plan")
	}
	if receipt.ModelLineageDigest != "" && evaluationPlanObjectByIdentity(plan.Value["modelConfigurations"], "lineageDigest", receipt.ModelLineageDigest) == nil {
		return conflict("evaluation source receipt model is outside the frozen plan")
	}
	if receipt.ObservedAt.After(plan.ExpiresAt) ||
		(receipt.SourceKind != "pricing-snapshot" && receipt.ObservedAt.Before(plan.PlannedAt)) {
		return conflict("evaluation source receipt is outside the frozen plan window")
	}
	return nil
}

func validateEvaluationExecutionBinding(plan evaluationPlanFact, attempt evaluationAttemptFact, receipt evaluationExecutionReceipt) error {
	if receipt.PlanDigest != plan.PlanDigest || receipt.RepositoryCommit != plan.RepositoryCommit ||
		receipt.AttemptID != attempt.AttemptID || receipt.DescriptorDigest != attempt.DescriptorDigest {
		return conflict("evaluation execution receipt belongs to a different plan or attempt")
	}
	elapsed := attempt.CompletedAt.Sub(attempt.StartedAt).Milliseconds()
	if receipt.ElapsedMS != elapsed {
		return conflict("evaluation execution elapsed time drifted from the durable attempt")
	}
	evaluationCase := evaluationPlanObjectByIdentity(plan.Value["concreteCases"], "caseId", attempt.CaseID)
	if evaluationCase == nil {
		return conflict("evaluation execution receipt case is outside the frozen plan")
	}
	tagValues, _ := evaluationCase["tags"].([]any)
	tags := make(map[string]struct{}, len(tagValues))
	for _, raw := range tagValues {
		if tag, ok := raw.(string); ok {
			tags[tag] = struct{}{}
		}
	}
	expectsTool := false
	for _, tag := range []string{"tool", "hosted-tool", "parallel", "mcp", "tool-description"} {
		if _, ok := tags[tag]; ok {
			expectsTool = true
		}
	}
	_, expectsRepair := tags["repair"]
	_, expectsTransaction := tags["transaction"]
	if _, rollback := tags["rollback"]; rollback {
		expectsTransaction = true
	}
	_, expectsClosure := tags["closure"]
	if (expectsTool && receipt.ToolCalls < 1) || (expectsRepair && receipt.RepairRounds < 1) ||
		(expectsTransaction && receipt.Transactions < 1) || (expectsClosure && receipt.VerificationClosureDigest == "") {
		return conflict("evaluation execution receipt omits case-required runtime evidence")
	}
	return nil
}

func loadEvaluationAttemptForAuthenticity(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	attemptID string,
) (evaluationAttemptFact, error) {
	var source []byte
	err := tx.QueryRowContext(ctx, `SELECT attempt_bytes
	FROM agent_evaluation_attempts
	WHERE namespace_id = $1 AND plan_digest = $2 AND attempt_id = $3
	  AND EXISTS (
		SELECT 1 FROM agent_evaluation_plans
		WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $4
	  )
	FOR SHARE`, namespaceID, partition.PlanDigest, attemptID, partition.RepositoryCommit).Scan(&source)
	if errors.Is(err, sql.ErrNoRows) {
		return evaluationAttemptFact{}, ErrNotFound
	}
	if err != nil {
		return evaluationAttemptFact{}, err
	}
	attempt, err := decodeEvaluationAttempt(source)
	if err != nil {
		return evaluationAttemptFact{}, err
	}
	if !bytes.Equal(source, attempt.Canonical) || attempt.PlanDigest != partition.PlanDigest || attempt.AttemptID != attemptID {
		return evaluationAttemptFact{}, conflict("persisted evaluation attempt drifted from its canonical fact")
	}
	return attempt, nil
}

func registerEvaluationProviderRequest(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	providerConfigurationID, providerRequestID, receiptKind, receiptIdentity string,
	recordedAt time.Time,
) error {
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_provider_requests (
		namespace_id, plan_digest, repository_commit, provider_configuration_id,
		provider_request_id, receipt_kind, receipt_identity, recorded_at
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	ON CONFLICT DO NOTHING`, namespaceID, partition.PlanDigest, partition.RepositoryCommit,
		providerConfigurationID, providerRequestID, receiptKind, receiptIdentity, recordedAt)
	if err != nil {
		return err
	}
	inserted, err := result.RowsAffected()
	if err != nil || inserted > 0 {
		return err
	}
	rows, err := tx.QueryContext(ctx, `SELECT repository_commit, provider_configuration_id,
		provider_request_id, receipt_kind, receipt_identity
	FROM agent_evaluation_provider_requests
	WHERE namespace_id = $1 AND plan_digest = $2
	  AND ((provider_configuration_id = $3 AND provider_request_id = $4)
	    OR (receipt_kind = $5 AND receipt_identity = $6))
	FOR SHARE`, namespaceID, partition.PlanDigest, providerConfigurationID, providerRequestID, receiptKind, receiptIdentity)
	if err != nil {
		return err
	}
	defer rows.Close()
	matched := 0
	for rows.Next() {
		var commit, provider, request, kind, identity string
		if err := rows.Scan(&commit, &provider, &request, &kind, &identity); err != nil {
			return err
		}
		matched++
		if commit != partition.RepositoryCommit || provider != providerConfigurationID || request != providerRequestID ||
			kind != receiptKind || identity != receiptIdentity {
			return conflict("evaluation provider request identity was reused")
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if matched != 1 {
		return conflict("evaluation provider request identity was reused")
	}
	return nil
}

func validateEvaluationProviderRequestReference(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	providerConfigurationID, providerRequestID string,
) error {
	var repositoryCommit string
	err := tx.QueryRowContext(ctx, `SELECT repository_commit
	FROM agent_evaluation_provider_requests
	WHERE namespace_id = $1 AND plan_digest = $2
	  AND provider_configuration_id = $3 AND provider_request_id = $4
	FOR SHARE`, namespaceID, partition.PlanDigest, providerConfigurationID, providerRequestID).Scan(&repositoryCommit)
	if errors.Is(err, sql.ErrNoRows) {
		// Source receipts are persisted before the invocation/endpoint envelope by
		// the runner. Final authority completeness performs the mandatory exact
		// cross-binding once both immutable sides exist.
		return nil
	}
	if err != nil {
		return err
	}
	if repositoryCommit != partition.RepositoryCommit {
		return conflict("evaluation source receipt provider request belongs to a different commit")
	}
	return nil
}

func immutableEvaluationCollisionBytes(ctx context.Context, tx *sql.Tx, query string, args ...any) ([]byte, error) {
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := make([][]byte, 0, 1)
	for rows.Next() {
		var value []byte
		if err := rows.Scan(&value); err != nil {
			return nil, err
		}
		values = append(values, append([]byte(nil), value...))
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(values) != 1 {
		return nil, conflict("evaluation immutable receipt identity was reused")
	}
	return values[0], nil
}

func commitEvaluationAuthenticityWrite(tx *sql.Tx) error {
	return tx.Commit()
}

func evaluationCanonicalCostValueDigest(value any) (string, error) {
	costs, ok := value.([]any)
	if !ok {
		return "", invalid("evaluation cost is not an array")
	}
	base := make([]any, 0, len(costs))
	for _, raw := range costs {
		cost, ok := raw.(map[string]any)
		if !ok {
			return "", invalid("evaluation cost entry is invalid")
		}
		entry := map[string]any{
			"currency":   cost["currency"],
			"confidence": cost["confidence"],
		}
		if amount, exists := cost["amount"]; exists {
			entry["amount"] = amount
		}
		base = append(base, entry)
	}
	return canonicaljson.Digest(base)
}
