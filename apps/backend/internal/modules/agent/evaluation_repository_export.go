package agent

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type EvaluationSnapshotRequirements struct {
	RequireCompleteAttemptSet         bool
	RequireCompleteReviewCandidateSet bool
	RequireSettledBudget              bool
	RequireAuthenticityEvidence       bool
	RequiredArtifactTypes             []string
}

type EvaluationRepositorySnapshot struct {
	NamespaceID                              string
	Partition                                EvaluationPlanPartition
	Plan                                     EvaluationPlanRecord
	Attempts                                 []EvaluationAttemptRecord
	Checkpoints                              []EvaluationCheckpointRecord
	Budget                                   EvaluationBudgetSnapshot
	Artifacts                                []EvaluationArtifactRecord
	ValidatedHumanReviewArtifacts            []EvaluationValidatedHumanReviewArtifactRecord
	ReviewRasterScanReceipts                 []EvaluationReviewRasterScanReceiptRecord
	ReviewCandidateRefs                      []EvaluationReviewCandidateRef
	BlindReviewMappingRefs                   []EvaluationBlindReviewMappingRef
	BlindReviewMappingSetDigest              string
	EndpointSmokeReceipts                    []EvaluationEndpointSmokeReceiptRecord
	PreDispatchFailureReceipts               []EvaluationPreDispatchFailureReceiptRecord
	TransportDispatchIntents                 []EvaluationTransportDispatchIntentRecord
	TransportReceipts                        []EvaluationTransportReceiptRecord
	ProviderResultSpoolReceipts              []EvaluationProviderResultSpoolReceiptRecord
	ProviderResultSpoolDispositionReceipts   []EvaluationProviderResultSpoolDispositionRecord
	InvocationTurnReceipts                   []EvaluationInvocationTurnReceiptRecord
	InvocationTurnSetReceipts                []EvaluationInvocationTurnSetReceiptRecord
	CapabilityExecutionReceipts              []EvaluationCapabilityExecutionReceiptRecord
	AttemptAuthorityOwnerReceipts            []EvaluationAttemptAuthorityOwnerReceiptRecord
	CapabilitySpecificReceipts               []EvaluationCapabilitySpecificReceiptRecord
	VerificationAttemptGrantReceipts         []EvaluationVerificationAttemptGrantReceiptRecord
	ValidatedHumanMetricObservations         []map[string]any
	ValidatedHumanMetricObservationSetDigest string
	SourceReceipts                           []EvaluationSourceReceiptRecord
	ExecutionReceipts                        []EvaluationExecutionReceiptRecord
	ResultSubmissionReceipts                 []EvaluationResultSubmissionReceiptRecord
	ControlledRuntimeReceipts                []EvaluationControlledRuntimeReceiptRecord
	AuthorityAttestation                     *EvaluationAuthorityAttestationRecord
	EvidenceRoot                             *EvaluationEvidenceRootRecord
	LatestCheckpointByShard                  map[string]EvaluationCheckpointRecord
}

type EvaluationSnapshotExport struct {
	Snapshot EvaluationRepositorySnapshot
	Bytes    []byte
	Digest   string
}

// ExportEvaluationSnapshot reads one exact plan/commit partition under one
// repeatable-read snapshot, validates its recovery/evidence chains, and emits
// stable canonical JSON suitable for content-addressed artifact storage.
func (repository *Repository) ExportEvaluationSnapshot(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	requirements EvaluationSnapshotRequirements,
) (EvaluationSnapshotExport, error) {
	if err := validateEvaluationSnapshotRequirements(requirements); err != nil {
		return EvaluationSnapshotExport{}, err
	}
	readContext, cancel, tx, plan, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	attempts, err := queryEvaluationAttempts(readContext, tx, authority.NamespaceID, partition, plan, "")
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	checkpoints, err := queryEvaluationCheckpoints(readContext, tx, authority.NamespaceID, partition, "")
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	budget, err := loadEvaluationBudgetSnapshot(readContext, tx, authority.NamespaceID, partition, plan)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	artifacts, err := queryEvaluationArtifacts(readContext, tx, authority.NamespaceID, partition, "")
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	if err := validateEvaluationSnapshotCompleteness(plan, attempts, budget, artifacts, requirements); err != nil {
		return EvaluationSnapshotExport{}, err
	}
	validatedHumanReviewArtifact, err := queryEvaluationValidatedHumanReviewArtifact(
		readContext, tx, authority.NamespaceID, partition,
	)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	if err := validateEvaluationValidatedHumanReviewSnapshot(artifacts, validatedHumanReviewArtifact); err != nil {
		return EvaluationSnapshotExport{}, err
	}
	validatedHumanReviewArtifacts := make([]EvaluationValidatedHumanReviewArtifactRecord, 0, 1)
	if validatedHumanReviewArtifact != nil {
		validatedHumanReviewArtifacts = append(validatedHumanReviewArtifacts, *validatedHumanReviewArtifact)
	}
	endpointSmokeReceipts, err := queryEvaluationEndpointSmokeReceipts(readContext, tx, authority.NamespaceID, partition, plan, "")
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	preDispatchFailureReceipts, err := queryEvaluationPreDispatchFailureReceipts(readContext, tx, authority.NamespaceID, partition, "")
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	transportDispatchIntents, err := queryEvaluationTransportDispatchIntents(readContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	transportReceipts, err := queryEvaluationTransportReceipts(readContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	providerResultSpoolReceipts, err := queryEvaluationProviderResultSpoolReceipts(readContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	providerResultSpoolDispositionReceipts, err := queryEvaluationProviderResultSpoolDispositions(readContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	invocationTurnReceipts, err := queryEvaluationInvocationTurnReceipts(readContext, tx, authority.NamespaceID, partition, "")
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	invocationTurnSetReceipts, err := queryEvaluationInvocationTurnSetReceipts(readContext, tx, authority.NamespaceID, partition, "")
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	reviewCandidateRefs, err := queryEvaluationReviewCandidateRefs(readContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	reviewRasterScanReceipts, err := queryEvaluationReviewRasterScanReceipts(
		readContext, tx, authority.NamespaceID, partition, "",
	)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	if err := validateEvaluationReviewRasterScanBindings(plan, attempts, reviewRasterScanReceipts); err != nil {
		return EvaluationSnapshotExport{}, err
	}
	planFact, err := decodeEvaluationPlan(plan.FactBytes)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	blindReviewMappings, err := queryEvaluationBlindReviewMappings(
		readContext, tx, authority.NamespaceID, partition, "",
	)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	if err := validateEvaluationBlindReviewMappingSet(
		planFact, reviewCandidateRefs, blindReviewMappings,
		requirements.RequireCompleteReviewCandidateSet || requirements.RequireAuthenticityEvidence,
	); err != nil {
		return EvaluationSnapshotExport{}, err
	}
	blindReviewMappingRefs, err := evaluationBlindReviewMappingRefs(blindReviewMappings)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	blindReviewMappingSetDigest, err := evaluationBlindReviewMappingSetDigest(blindReviewMappings)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	sourceReceipts, err := queryEvaluationSourceReceipts(readContext, tx, authority.NamespaceID, partition, plan, "")
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	executionReceipts, err := queryEvaluationExecutionReceipts(readContext, tx, authority.NamespaceID, partition, plan, attempts, "")
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	resultSubmissionReceipts, controlledRuntimeReceipts, err := queryEvaluationRuntimeEvidence(
		readContext, tx, authority.NamespaceID, partition, plan, attempts, invocationTurnReceipts,
		executionReceipts, requirements.RequireAuthenticityEvidence,
	)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	capabilityExecutionReceipts, err := queryEvaluationCapabilityExecutionReceipts(
		readContext, tx, authority.NamespaceID, partition, "",
	)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	if err := validateEvaluationCapabilityExecutionSnapshot(
		planFact, attempts, invocationTurnReceipts, executionReceipts, controlledRuntimeReceipts,
		capabilityExecutionReceipts, requirements.RequireAuthenticityEvidence,
	); err != nil {
		return EvaluationSnapshotExport{}, err
	}
	attemptAuthorityOwnerReceipts, err := queryEvaluationAttemptAuthorityOwnerReceipts(
		readContext, tx, authority.NamespaceID, partition, "", true,
	)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	capabilitySpecificReceipts, err := queryEvaluationCapabilitySpecificReceipts(
		readContext, tx, authority.NamespaceID, partition, "",
	)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	validatedHumanMetricObservations, validatedHumanMetricObservationSetDigest, err :=
		queryEvaluationValidatedHumanMetricObservationSnapshot(
			readContext, tx, authority.NamespaceID, partition,
		)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	verificationAttemptGrantReceipts, err := queryEvaluationVerificationAttemptGrantReceipts(
		readContext, tx, authority.NamespaceID, partition, "",
	)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	if err := validateEvaluationVerificationAttemptGrantSnapshot(
		planFact, attempts, executionReceipts, controlledRuntimeReceipts,
		verificationAttemptGrantReceipts, requirements.RequireAuthenticityEvidence,
	); err != nil {
		return EvaluationSnapshotExport{}, err
	}
	if err := validateEvaluationReviewCandidateBindings(
		plan, attempts, invocationTurnReceipts, executionReceipts, reviewRasterScanReceipts, reviewCandidateRefs,
		requirements.RequireCompleteReviewCandidateSet || requirements.RequireAuthenticityEvidence,
	); err != nil {
		return EvaluationSnapshotExport{}, err
	}
	authorityAttestation, err := queryEvaluationAuthorityAttestation(readContext, tx, authority.NamespaceID, partition, plan)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	evidenceRoot, err := queryEvaluationEvidenceRoot(readContext, tx, authority.NamespaceID, partition, plan)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	if requirements.RequireAuthenticityEvidence {
		if err := validateEvaluationTurnJournalSnapshot(
			attempts, transportDispatchIntents, transportReceipts, providerResultSpoolReceipts,
			providerResultSpoolDispositionReceipts, invocationTurnReceipts, invocationTurnSetReceipts,
		); err != nil {
			return EvaluationSnapshotExport{}, err
		}
		if authorityAttestation == nil || evidenceRoot == nil {
			return EvaluationSnapshotExport{}, conflict("evaluation snapshot is missing authority-attested authenticity evidence")
		}
		authenticityEvidence, err := queryEvaluationAuthenticityEvidenceV3(
			readContext, tx, authority.NamespaceID, partition, plan, attempts, true,
		)
		if err != nil {
			return EvaluationSnapshotExport{}, err
		}
		setDigests, err := validateEvaluationAuthenticityCompletenessV3(
			planFact, attempts, authenticityEvidence.EndpointSmokeCommit, authenticityEvidence.EndpointSmokeIntents,
			authenticityEvidence.EndpointSmokeTransports, authenticityEvidence.EndpointSmokeSpools,
			authenticityEvidence.EndpointSmokeDispositions, authenticityEvidence.EndpointSmokeFailures,
			authenticityEvidence.EndpointSmokes, preDispatchFailureReceipts, transportDispatchIntents, transportReceipts,
			providerResultSpoolReceipts, providerResultSpoolDispositionReceipts,
			invocationTurnReceipts, invocationTurnSetReceipts, resultSubmissionReceipts,
			controlledRuntimeReceipts, capabilityExecutionReceipts,
			authenticityEvidence.AttemptAuthorityOwners, authenticityEvidence.CapabilitySpecifics,
			authenticityEvidence.ProviderCapabilityObservations,
			verificationAttemptGrantReceipts, validatedHumanReviewArtifacts,
			authenticityEvidence.ValidatedHumanMetrics, authenticityEvidence.ValidatedHumanMetricSetDigest,
			reviewRasterScanReceipts, reviewCandidateRefs, blindReviewMappings,
			sourceReceipts, executionReceipts,
		)
		if err != nil {
			return EvaluationSnapshotExport{}, err
		}
		if err := validateEvaluationExportAuthorityBindings(
			*authorityAttestation, *evidenceRoot, setDigests, artifacts,
		); err != nil {
			return EvaluationSnapshotExport{}, err
		}
	}
	latest := make(map[string]EvaluationCheckpointRecord)
	for _, checkpoint := range checkpoints {
		latest[checkpoint.ShardID] = checkpoint
	}
	snapshot := EvaluationRepositorySnapshot{
		NamespaceID: authority.NamespaceID, Partition: partition, Plan: plan,
		Attempts: attempts, Checkpoints: checkpoints, Budget: budget, Artifacts: artifacts,
		ValidatedHumanReviewArtifacts: validatedHumanReviewArtifacts,
		ReviewRasterScanReceipts:      reviewRasterScanReceipts, ReviewCandidateRefs: reviewCandidateRefs,
		BlindReviewMappingRefs: blindReviewMappingRefs, BlindReviewMappingSetDigest: blindReviewMappingSetDigest,
		EndpointSmokeReceipts:      endpointSmokeReceipts,
		PreDispatchFailureReceipts: preDispatchFailureReceipts,
		TransportDispatchIntents:   transportDispatchIntents, TransportReceipts: transportReceipts,
		ProviderResultSpoolReceipts:            providerResultSpoolReceipts,
		ProviderResultSpoolDispositionReceipts: providerResultSpoolDispositionReceipts,
		InvocationTurnReceipts:                 invocationTurnReceipts, InvocationTurnSetReceipts: invocationTurnSetReceipts,
		CapabilityExecutionReceipts:              capabilityExecutionReceipts,
		AttemptAuthorityOwnerReceipts:            attemptAuthorityOwnerReceipts,
		CapabilitySpecificReceipts:               capabilitySpecificReceipts,
		VerificationAttemptGrantReceipts:         verificationAttemptGrantReceipts,
		ValidatedHumanMetricObservations:         validatedHumanMetricObservations,
		ValidatedHumanMetricObservationSetDigest: validatedHumanMetricObservationSetDigest,
		SourceReceipts:                           sourceReceipts, ExecutionReceipts: executionReceipts,
		ResultSubmissionReceipts:  resultSubmissionReceipts,
		ControlledRuntimeReceipts: controlledRuntimeReceipts,
		AuthorityAttestation:      authorityAttestation, EvidenceRoot: evidenceRoot,
		LatestCheckpointByShard: latest,
	}
	canonical, err := canonicalEvaluationSnapshot(snapshot)
	if err != nil {
		return EvaluationSnapshotExport{}, err
	}
	digest := fmt.Sprintf("sha256-%x", sha256.Sum256(canonical))
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return EvaluationSnapshotExport{}, err
	}
	return EvaluationSnapshotExport{
		Snapshot: snapshot,
		Bytes:    append([]byte(nil), canonical...),
		Digest:   digest,
	}, nil
}

func validateEvaluationExportAuthorityBindings(
	attestation EvaluationAuthorityAttestationRecord,
	root EvaluationEvidenceRootRecord,
	sets evaluationAuthenticitySetDigests,
	artifacts []EvaluationArtifactRecord,
) error {
	if validateEvaluationAuthoritySetDigests(attestation, sets) != nil ||
		validateEvaluationEvidenceRootSetDigests(root, sets) != nil ||
		root.HoldoutExecutionReceiptDigest != attestation.HoldoutExecutionReceiptDigest ||
		root.BlindReviewMappingSetDigest != attestation.BlindReviewMappingSetDigest ||
		root.SecretCanarySetDigest != attestation.SecretCanarySetDigest ||
		root.ProtectedHoldoutCanarySetDigest != attestation.ProtectedHoldoutCanarySetDigest ||
		root.EvidenceSetDigest != attestation.EvidenceSetDigest ||
		root.AuthorityAttestationDigest != attestation.AttestationDigest {
		return conflict("evaluation snapshot authority/root receipt-set binding drifted")
	}
	manifest, err := evaluationSingletonArtifact(artifacts, "evaluation-manifest")
	if err != nil || root.EvaluationManifestDigest != manifest.FactDigest {
		return conflict("evaluation snapshot authority root is missing its exact manifest")
	}
	holdout, err := evaluationSingletonArtifact(artifacts, "evaluation-holdout-receipt")
	if err != nil || root.HoldoutExecutionReceiptDigest != holdout.FactDigest {
		return conflict("evaluation snapshot authority root is missing its exact holdout receipt")
	}
	return nil
}

func validateEvaluationSnapshotRequirements(requirements EvaluationSnapshotRequirements) error {
	required := append([]string(nil), requirements.RequiredArtifactTypes...)
	sort.Strings(required)
	for index, factType := range required {
		if !supportedEvaluationArtifactType(factType) ||
			(index > 0 && factType == required[index-1]) {
			return ErrInvalid
		}
	}
	return nil
}

func validateEvaluationSnapshotCompleteness(
	plan EvaluationPlanRecord,
	attempts []EvaluationAttemptRecord,
	budget EvaluationBudgetSnapshot,
	artifacts []EvaluationArtifactRecord,
	requirements EvaluationSnapshotRequirements,
) error {
	if requirements.RequireCompleteAttemptSet && int64(len(attempts)) != plan.PlannedJourneyCount {
		return conflict("evaluation snapshot is missing attempts from the frozen denominator")
	}
	if requirements.RequireSettledBudget && len(budget.UnsettledReservationIDs) > 0 {
		return conflict("evaluation snapshot contains unsettled budget reservations")
	}
	artifactsByType := make(map[string][]EvaluationArtifactRecord)
	for _, artifact := range artifacts {
		artifactsByType[artifact.FactType] = append(artifactsByType[artifact.FactType], artifact)
	}
	for factType, records := range artifactsByType {
		if len(records) > 1 {
			return conflict("evaluation snapshot contains multiple " + factType + " facts")
		}
	}
	for _, factType := range requirements.RequiredArtifactTypes {
		if len(artifactsByType[factType]) != 1 {
			return conflict("evaluation snapshot is missing required " + factType)
		}
	}
	return nil
}

func evaluationDigestSequence(values []string) (string, error) {
	sequence := make([]any, len(values))
	for index := range values {
		sequence[index] = values[index]
	}
	return canonicaljson.Digest(sequence)
}

func validateEvaluationTurnJournalSnapshot(
	attempts []EvaluationAttemptRecord,
	intentRecords []EvaluationTransportDispatchIntentRecord,
	transportRecords []EvaluationTransportReceiptRecord,
	spoolRecords []EvaluationProviderResultSpoolReceiptRecord,
	dispositionRecords []EvaluationProviderResultSpoolDispositionRecord,
	turnRecords []EvaluationInvocationTurnReceiptRecord,
	turnSetRecords []EvaluationInvocationTurnSetReceiptRecord,
) error {
	intentsByDigest := make(map[string]evaluationTransportDispatchIntent, len(intentRecords))
	intentsByAttempt := make(map[string][]evaluationTransportDispatchIntent)
	for _, record := range intentRecords {
		intent, err := decodeEvaluationTransportDispatchIntent(record.IntentBytes)
		if err != nil || intent.PlanDigest != record.PlanDigest || intent.RepositoryCommit != record.RepositoryCommit ||
			intent.AttemptID != record.AttemptID || intent.DescriptorDigest != record.DescriptorDigest || intent.TurnIndex != record.TurnIndex {
			return conflict("evaluation snapshot contains a drifted transport dispatch intent")
		}
		if _, duplicate := intentsByDigest[intent.IntentDigest]; duplicate {
			return conflict("evaluation snapshot contains duplicate transport dispatch intent authority")
		}
		intentsByDigest[intent.IntentDigest] = intent
		intentsByAttempt[intent.AttemptID] = append(intentsByAttempt[intent.AttemptID], intent)
	}
	transportsByDigest := make(map[string]evaluationTransportReceipt, len(transportRecords))
	transportsByIntent := make(map[string]evaluationTransportReceipt, len(transportRecords))
	transportsByAttempt := make(map[string][]evaluationTransportReceipt)
	for _, record := range transportRecords {
		receipt, err := decodeEvaluationTransportReceipt(record.ReceiptBytes)
		intent, exists := intentsByDigest[receipt.IntentDigest]
		if err != nil || !exists || receipt.InvocationID != intent.InvocationID || receipt.ProtocolFamily != intent.ProtocolFamily ||
			receipt.ProviderConfigurationID != intent.ProviderConfigurationID || receipt.RequestDigest != intent.RequestDigest ||
			receipt.EndpointID != intent.EndpointID || receipt.EndpointClass != intent.EndpointClass ||
			receipt.RequestBodyDigest != intent.RequestBodyDigest || receipt.RequestBytes != intent.RequestBytes ||
			receipt.StartedAt.Before(intent.CreatedAt) {
			return conflict("evaluation snapshot transport receipt drifted from its dispatch intent")
		}
		if _, duplicate := transportsByIntent[receipt.IntentDigest]; duplicate {
			return conflict("evaluation snapshot contains duplicate transport seals")
		}
		transportsByIntent[receipt.IntentDigest], transportsByDigest[receipt.ReceiptDigest] = receipt, receipt
		transportsByAttempt[intent.AttemptID] = append(transportsByAttempt[intent.AttemptID], receipt)
	}
	if len(transportsByIntent) != len(intentsByDigest) {
		return conflict("evaluation snapshot contains an open transport dispatch intent")
	}
	spoolsByDigest := make(map[string]EvaluationProviderResultSpoolReceiptRecord, len(spoolRecords))
	spoolsByTransport := make(map[string]EvaluationProviderResultSpoolReceiptRecord, len(spoolRecords))
	for _, spool := range spoolRecords {
		transport, transportExists := transportsByDigest[spool.TransportReceiptDigest]
		intent, intentExists := intentsByDigest[spool.DispatchIntentDigest]
		if !transportExists || !intentExists || transport.Outcome != "completed" || transport.ResponseBodyDigest != spool.ResponseBodyDigest ||
			transport.InvocationID != spool.InvocationID || intent.AttemptID != spool.AttemptID || intent.TurnIndex != spool.TurnIndex {
			return conflict("evaluation snapshot result spool drifted from transport authority")
		}
		if _, duplicate := spoolsByTransport[spool.TransportReceiptDigest]; duplicate {
			return conflict("evaluation snapshot contains duplicate result spools")
		}
		spoolsByDigest[spool.ReceiptDigest], spoolsByTransport[spool.TransportReceiptDigest] = spool, spool
	}
	for _, transport := range transportsByDigest {
		_, hasSpool := spoolsByTransport[transport.ReceiptDigest]
		if (transport.Outcome == "completed") != hasSpool {
			return conflict("evaluation snapshot completed transport/spool coverage drifted")
		}
	}
	dispositionsBySpool := make(map[string]EvaluationProviderResultSpoolDispositionRecord, len(dispositionRecords))
	for _, disposition := range dispositionRecords {
		spool, exists := spoolsByDigest[disposition.SpoolReceiptDigest]
		if !exists || disposition.SpoolRef != spool.SpoolRef || disposition.AttemptID != spool.AttemptID ||
			disposition.DescriptorDigest != spool.DescriptorDigest || disposition.TurnIndex != spool.TurnIndex ||
			disposition.InvocationID != spool.InvocationID || disposition.RetentionPolicyDigest != spool.RetentionPolicyDigest ||
			disposition.DisposedAt.Before(spool.CreatedAt) || disposition.DisposedAt.After(spool.ExpiresAt) ||
			disposition.RetainedUntil != nil && disposition.RetainedUntil.After(spool.ExpiresAt) {
			return conflict("evaluation snapshot result spool disposition drifted")
		}
		if _, duplicate := dispositionsBySpool[disposition.SpoolRef]; duplicate {
			return conflict("evaluation snapshot contains duplicate result spool dispositions")
		}
		dispositionsBySpool[disposition.SpoolRef] = disposition
	}
	if len(dispositionsBySpool) != len(spoolRecords) {
		return conflict("evaluation snapshot contains an undisposed encrypted result spool")
	}
	turnsByAttempt := make(map[string][]evaluationInvocationTurnReceipt)
	for _, record := range turnRecords {
		turn, err := decodeEvaluationInvocationTurnReceipt(record.ReceiptBytes)
		if err != nil {
			return err
		}
		turnsByAttempt[turn.AttemptID] = append(turnsByAttempt[turn.AttemptID], turn)
	}
	setsByAttempt := make(map[string]evaluationInvocationTurnSetReceipt, len(turnSetRecords))
	for _, record := range turnSetRecords {
		set, err := decodeEvaluationInvocationTurnSetReceipt(record.ReceiptBytes)
		if err != nil {
			return err
		}
		if _, duplicate := setsByAttempt[set.AttemptID]; duplicate {
			return conflict("evaluation snapshot contains duplicate invocation turn sets")
		}
		setsByAttempt[set.AttemptID] = set
	}
	if len(setsByAttempt) != len(attempts) {
		return conflict("evaluation snapshot invocation turn-set coverage drifted from the frozen denominator")
	}
	for _, record := range attempts {
		attempt, err := decodeEvaluationAttempt(record.FactBytes)
		if err != nil {
			return err
		}
		turns := turnsByAttempt[attempt.AttemptID]
		sort.Slice(turns, func(left, right int) bool { return turns[left].TurnIndex < turns[right].TurnIndex })
		set, exists := setsByAttempt[attempt.AttemptID]
		if !exists || validateEvaluationInvocationTurnSetJoin(turns, set) != nil || set.ReceiptDigest != attempt.InvocationTurnSetReceiptDigest ||
			set.TerminalStatus != attempt.Status || !sameEvaluationCanonicalValue(set.AggregateUsage, attempt.Usage) ||
			!sameEvaluationCanonicalValue(set.AggregateCost, attempt.Cost) {
			return conflict("evaluation snapshot attempt/turn-set authority drifted")
		}
		terminal := turns[len(turns)-1]
		if terminal.ResponseArtifactDigest != attempt.ResponseDigest {
			return conflict("evaluation snapshot terminal response authority drifted")
		}
		intents := intentsByAttempt[attempt.AttemptID]
		sort.Slice(intents, func(left, right int) bool { return intents[left].IntentID < intents[right].IntentID })
		intentDigests := make([]string, len(intents))
		for index := range intents {
			intentDigests[index] = intents[index].IntentDigest
		}
		transports := transportsByAttempt[attempt.AttemptID]
		sort.Slice(transports, func(left, right int) bool { return transports[left].ReceiptID < transports[right].ReceiptID })
		transportDigests := make([]string, len(transports))
		for index := range transports {
			transportDigests[index] = transports[index].ReceiptDigest
		}
		turnDigests := make([]string, len(turns))
		for index := range turns {
			turnDigests[index] = turns[index].EvidenceDigest
		}
		intentSetDigest, intentErr := evaluationDigestSequence(intentDigests)
		transportSetDigest, transportErr := evaluationDigestSequence(transportDigests)
		turnSetDigest, turnErr := evaluationDigestSequence(turnDigests)
		if intentErr != nil || transportErr != nil || turnErr != nil || intentSetDigest != attempt.DispatchIntentSetDigest ||
			transportSetDigest != attempt.TransportReceiptSetDigest || turnSetDigest != attempt.InvocationTurnReceiptSetDigest {
			return conflict("evaluation snapshot attempt receipt-set authority drifted")
		}
	}
	return nil
}

func canonicalEvaluationSnapshot(snapshot EvaluationRepositorySnapshot) ([]byte, error) {
	plan, err := decodeCanonicalEvaluationJSON(snapshot.Plan.FactBytes)
	if err != nil {
		return nil, err
	}
	attempts, err := evaluationFactValues(snapshot.Attempts, func(record EvaluationAttemptRecord) []byte { return record.FactBytes })
	if err != nil {
		return nil, err
	}
	checkpoints, err := evaluationFactValues(snapshot.Checkpoints, func(record EvaluationCheckpointRecord) []byte { return record.FactBytes })
	if err != nil {
		return nil, err
	}
	artifacts, err := evaluationFactValues(snapshot.Artifacts, func(record EvaluationArtifactRecord) []byte { return record.FactBytes })
	if err != nil {
		return nil, err
	}
	validatedHumanReviewArtifacts := make([]any, len(snapshot.ValidatedHumanReviewArtifacts))
	for index, record := range snapshot.ValidatedHumanReviewArtifacts {
		validatedHumanReviewArtifacts[index], _, err = decodeEvaluationCanonicalObjectWithLimit(
			record.ArtifactBytes, maximumEvaluationValidatedHumanReviewBytes,
		)
		if err != nil {
			return nil, err
		}
	}
	reviewCandidateRefs := make([]any, 0, len(snapshot.ReviewCandidateRefs))
	for _, reference := range snapshot.ReviewCandidateRefs {
		reviewCandidateRefs = append(reviewCandidateRefs, canonicalEvaluationReviewCandidateRef(reference))
	}
	blindReviewMappingRefs := make([]any, len(snapshot.BlindReviewMappingRefs))
	for index, reference := range snapshot.BlindReviewMappingRefs {
		blindReviewMappingRefs[index] = map[string]any{
			"mappingId": reference.MappingID, "mappingDigest": reference.MappingDigest,
		}
	}
	reviewRasterScanReceipts, err := evaluationFactValues(
		snapshot.ReviewRasterScanReceipts,
		func(record EvaluationReviewRasterScanReceiptRecord) []byte { return record.ReceiptBytes },
	)
	if err != nil {
		return nil, err
	}
	endpointSmokeReceipts, err := evaluationFactValues(snapshot.EndpointSmokeReceipts, func(record EvaluationEndpointSmokeReceiptRecord) []byte { return record.ReceiptBytes })
	if err != nil {
		return nil, err
	}
	preDispatchFailureReceipts, err := evaluationFactValues(snapshot.PreDispatchFailureReceipts, func(record EvaluationPreDispatchFailureReceiptRecord) []byte { return record.ReceiptBytes })
	if err != nil {
		return nil, err
	}
	transportDispatchIntents, err := evaluationFactValues(snapshot.TransportDispatchIntents, func(record EvaluationTransportDispatchIntentRecord) []byte { return record.IntentBytes })
	if err != nil {
		return nil, err
	}
	transportReceipts, err := evaluationFactValues(snapshot.TransportReceipts, func(record EvaluationTransportReceiptRecord) []byte { return record.ReceiptBytes })
	if err != nil {
		return nil, err
	}
	providerResultSpoolReceipts, err := evaluationFactValues(snapshot.ProviderResultSpoolReceipts, func(record EvaluationProviderResultSpoolReceiptRecord) []byte { return record.ReceiptBytes })
	if err != nil {
		return nil, err
	}
	providerResultSpoolDispositionReceipts, err := evaluationFactValues(snapshot.ProviderResultSpoolDispositionReceipts, func(record EvaluationProviderResultSpoolDispositionRecord) []byte { return record.ReceiptBytes })
	if err != nil {
		return nil, err
	}
	invocationTurnReceipts, err := evaluationFactValues(snapshot.InvocationTurnReceipts, func(record EvaluationInvocationTurnReceiptRecord) []byte { return record.ReceiptBytes })
	if err != nil {
		return nil, err
	}
	invocationTurnSetReceipts, err := evaluationFactValues(snapshot.InvocationTurnSetReceipts, func(record EvaluationInvocationTurnSetReceiptRecord) []byte { return record.ReceiptBytes })
	if err != nil {
		return nil, err
	}
	capabilityExecutionReceipts, err := evaluationFactValues(snapshot.CapabilityExecutionReceipts, func(record EvaluationCapabilityExecutionReceiptRecord) []byte { return record.ReceiptBytes })
	if err != nil {
		return nil, err
	}
	attemptAuthorityOwnerReceipts, err := evaluationFactValues(
		snapshot.AttemptAuthorityOwnerReceipts,
		func(record EvaluationAttemptAuthorityOwnerReceiptRecord) []byte { return record.ReceiptBytes },
	)
	if err != nil {
		return nil, err
	}
	capabilitySpecificReceipts, err := evaluationFactValues(
		snapshot.CapabilitySpecificReceipts,
		func(record EvaluationCapabilitySpecificReceiptRecord) []byte { return record.ReceiptBytes },
	)
	if err != nil {
		return nil, err
	}
	verificationAttemptGrantReceipts, err := evaluationFactValues(
		snapshot.VerificationAttemptGrantReceipts,
		func(record EvaluationVerificationAttemptGrantReceiptRecord) []byte { return record.ReceiptBytes },
	)
	if err != nil {
		return nil, err
	}
	sourceReceipts, err := evaluationFactValues(snapshot.SourceReceipts, func(record EvaluationSourceReceiptRecord) []byte { return record.ReceiptBytes })
	if err != nil {
		return nil, err
	}
	executionReceipts, err := evaluationFactValues(snapshot.ExecutionReceipts, func(record EvaluationExecutionReceiptRecord) []byte { return record.ReceiptBytes })
	if err != nil {
		return nil, err
	}
	resultSubmissionReceipts, err := evaluationFactValues(snapshot.ResultSubmissionReceipts, func(record EvaluationResultSubmissionReceiptRecord) []byte { return record.ReceiptBytes })
	if err != nil {
		return nil, err
	}
	controlledRuntimeReceipts, err := evaluationFactValues(snapshot.ControlledRuntimeReceipts, func(record EvaluationControlledRuntimeReceiptRecord) []byte { return record.ReceiptBytes })
	if err != nil {
		return nil, err
	}
	var authorityAttestation any
	if snapshot.AuthorityAttestation != nil {
		authorityAttestation, err = decodeCanonicalEvaluationJSON(snapshot.AuthorityAttestation.AttestationBytes)
		if err != nil {
			return nil, err
		}
	}
	var evidenceRoot any
	if snapshot.EvidenceRoot != nil {
		evidenceRoot, err = decodeCanonicalEvaluationJSON(snapshot.EvidenceRoot.RootBytes)
		if err != nil {
			return nil, err
		}
	}
	reservations := make([]any, 0, len(snapshot.Budget.Reservations))
	for _, reservation := range snapshot.Budget.Reservations {
		demand, err := decodeCanonicalEvaluationJSON(reservation.DemandBytes)
		if err != nil {
			return nil, err
		}
		reservations = append(reservations, map[string]any{
			"demand": demand, "demandDigest": reservation.DemandDigest,
			"ledgerRevision": reservation.LedgerRevision, "reservationId": reservation.ReservationID,
			"reservedAt": evaluationExportInstant(reservation.ReservedAt),
		})
	}
	settlements := make([]any, 0, len(snapshot.Budget.Settlements))
	for _, settlement := range snapshot.Budget.Settlements {
		value, err := decodeCanonicalEvaluationJSON(settlement.SettlementBytes)
		if err != nil {
			return nil, err
		}
		settlements = append(settlements, map[string]any{
			"ledgerRevision": settlement.LedgerRevision, "reservationId": settlement.ReservationID,
			"settledAt":  evaluationExportInstant(settlement.SettledAt),
			"settlement": value, "settlementDigest": settlement.SettlementDigest,
		})
	}
	value := map[string]any{
		"artifactFacts":        artifacts,
		"attemptFacts":         attempts,
		"authorityAttestation": authorityAttestation,
		"budgetLedger": map[string]any{
			"reservations":            reservations,
			"revision":                snapshot.Budget.Revision,
			"settlements":             settlements,
			"unsettledReservationIds": append([]string(nil), snapshot.Budget.UnsettledReservationIDs...),
			"updatedAt":               evaluationExportInstant(snapshot.Budget.UpdatedAt),
		},
		"blindReviewMappingRefs":                   blindReviewMappingRefs,
		"blindReviewMappingSetDigest":              snapshot.BlindReviewMappingSetDigest,
		"checkpointFacts":                          checkpoints,
		"endpointSmokeReceipts":                    endpointSmokeReceipts,
		"preDispatchFailureReceipts":               preDispatchFailureReceipts,
		"transportDispatchIntents":                 transportDispatchIntents,
		"transportReceipts":                        transportReceipts,
		"providerResultSpoolReceipts":              providerResultSpoolReceipts,
		"providerResultSpoolDispositionReceipts":   providerResultSpoolDispositionReceipts,
		"invocationTurnReceipts":                   invocationTurnReceipts,
		"invocationTurnSetReceipts":                invocationTurnSetReceipts,
		"capabilityExecutionReceipts":              capabilityExecutionReceipts,
		"attemptAuthorityOwnerReceipts":            attemptAuthorityOwnerReceipts,
		"capabilitySpecificReceipts":               capabilitySpecificReceipts,
		"verificationAttemptGrantReceipts":         verificationAttemptGrantReceipts,
		"validatedHumanMetricObservations":         snapshot.ValidatedHumanMetricObservations,
		"validatedHumanMetricObservationSetDigest": snapshot.ValidatedHumanMetricObservationSetDigest,
		"evidenceRoot":                             evidenceRoot,
		"executionReceipts":                        executionReceipts,
		"resultSubmissionReceipts":                 resultSubmissionReceipts,
		"controlledRuntimeReceipts":                controlledRuntimeReceipts,
		"namespaceId":                              snapshot.NamespaceID,
		"partition": map[string]any{
			"planDigest":       snapshot.Partition.PlanDigest,
			"repositoryCommit": snapshot.Partition.RepositoryCommit,
		},
		"planFact":                      plan,
		"reviewCandidateRefs":           reviewCandidateRefs,
		"reviewRasterScanReceipts":      reviewRasterScanReceipts,
		"sourceReceipts":                sourceReceipts,
		"validatedHumanReviewArtifacts": validatedHumanReviewArtifacts,
	}
	return canonicaljson.Bytes(map[string]any{
		"exportType": "agent-evaluation-repository-snapshot",
		"value":      value,
	})
}

func evaluationFactValues[T any](records []T, source func(T) []byte) ([]any, error) {
	values := make([]any, 0, len(records))
	for _, record := range records {
		value, err := decodeCanonicalEvaluationJSON(source(record))
		if err != nil {
			return nil, err
		}
		values = append(values, value)
	}
	return values, nil
}

func canonicalEvaluationReviewCandidateRef(reference EvaluationReviewCandidateRef) map[string]any {
	return map[string]any{
		"attemptId":                 reference.AttemptID,
		"byteLength":                reference.ByteLength,
		"bytesDigest":               reference.BytesDigest,
		"candidateDigest":           reference.CandidateDigest,
		"candidateId":               reference.CandidateID,
		"descriptorDigest":          reference.DescriptorDigest,
		"executionReceiptDigest":    reference.ExecutionReceiptDigest,
		"generatedAt":               evaluationExportInstant(reference.GeneratedAt),
		"graderArtifactDigest":      reference.GraderArtifactDigest,
		"height":                    reference.Height,
		"mediaType":                 reference.MediaType,
		"planDigest":                reference.PlanDigest,
		"projectionAuthorityDigest": reference.ProjectionAuthorityDigest,
		"publicArtifactScanDigest":  reference.PublicArtifactScanDigest,
		"repositoryCommit":          reference.RepositoryCommit,
		"responseDigest":            reference.ResponseDigest,
		"width":                     reference.Width,
	}
}

func decodeCanonicalEvaluationJSON(source []byte) (any, error) {
	if err := canonicaljson.ValidateRawEnvelope(source, 8_388_608); err != nil {
		return nil, fmt.Errorf("persisted evaluation export JSON is invalid: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	canonical, err := canonicaljson.Bytes(value)
	if err != nil {
		return nil, err
	}
	if !bytes.Equal(canonical, source) {
		return nil, conflict("persisted evaluation export JSON is not canonical")
	}
	return value, nil
}

func evaluationExportInstant(value time.Time) string {
	return value.UTC().Format("2006-01-02T15:04:05.000Z")
}
