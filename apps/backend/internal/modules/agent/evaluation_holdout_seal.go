package agent

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const evaluationHoldoutExecutorPrincipal = "authority.prodivix.g4-holdout-sealer.v1"

var errEvaluationHoldoutAuthorityUnavailable = errors.New("evaluation holdout authority is unavailable")

type EvaluationHoldoutClosureResult struct {
	Status       string          `json:"status"`
	MissingFacts []string        `json:"missingFacts,omitempty"`
	Receipt      json.RawMessage `json:"receipt,omitempty"`
}

// EvaluationHoldoutClosureRecord is the immutable server authority consumed by
// finalization and bounded archive source binding.
type EvaluationHoldoutClosureRecord struct {
	Partition                     EvaluationPlanPartition
	RunConfigArtifactBinding      EvaluationProductionRunConfigArtifactBinding
	RunConfigArtifactBindingBytes []byte
	SourceConfigDigest            string
	FrozenRunDigest               string
	ConfigCommitmentDigest        string
	ConfigCommitmentBytes         []byte
	ProtectedEvidenceSetDigest    string
	AccessPolicyDigest            string
	EncryptedCorpusDigest         string
	SecretCanarySetDigest         string
	ProtectedCanarySetDigest      string
	ScanReceiptDigest             string
	ReceiptDigest                 string
	ReceiptFactBytes              []byte
	SealedAt                      time.Time
}

func evaluationCanonicalMissingFacts(values ...string) []string {
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		if validEvaluationServiceIdentity(value) {
			seen[value] = struct{}{}
		}
	}
	result := make([]string, 0, len(seen))
	for value := range seen {
		result = append(result, value)
	}
	sort.Strings(result)
	if len(result) > 128 {
		result = result[:128]
	}
	return result
}

func evaluationHoldoutPending(values ...string) EvaluationHoldoutClosureResult {
	return EvaluationHoldoutClosureResult{Status: "pending", MissingFacts: evaluationCanonicalMissingFacts(values...)}
}

func evaluationHoldoutReceiptValue(source []byte) (json.RawMessage, evaluationArtifactFact, error) {
	receipt, err := decodeEvaluationArtifact(source, "evaluation-holdout-receipt")
	if err != nil {
		return nil, evaluationArtifactFact{}, err
	}
	value, err := canonicaljson.Bytes(receipt.Value)
	if err != nil {
		return nil, evaluationArtifactFact{}, err
	}
	return json.RawMessage(value), receipt, nil
}

func loadEvaluationHoldoutClosure(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
) (*EvaluationHoldoutClosureRecord, error) {
	var record EvaluationHoldoutClosureRecord
	var commitmentBytes []byte
	var runConfigArtifactBindingDigest string
	var runConfigArtifactBindingJSON []byte
	record.Partition = partition
	err := queryer.QueryRowContext(ctx, `SELECT repository_commit, run_config_artifact_binding_digest,
		run_config_artifact_binding_json, run_config_artifact_binding_bytes, source_config_digest,
		frozen_run_digest, config_commitment_digest, config_commitment_bytes,
		protected_evidence_set_digest, access_policy_digest, encrypted_corpus_digest,
		secret_canary_set_digest, protected_holdout_canary_set_digest, scan_receipt_digest,
		receipt_digest, receipt_bytes, sealed_at
		FROM agent_evaluation_holdout_closures
		WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit).Scan(
		&record.Partition.RepositoryCommit, &runConfigArtifactBindingDigest, &runConfigArtifactBindingJSON,
		&record.RunConfigArtifactBindingBytes, &record.SourceConfigDigest,
		&record.FrozenRunDigest, &record.ConfigCommitmentDigest, &commitmentBytes,
		&record.ProtectedEvidenceSetDigest, &record.AccessPolicyDigest, &record.EncryptedCorpusDigest,
		&record.SecretCanarySetDigest, &record.ProtectedCanarySetDigest, &record.ScanReceiptDigest,
		&record.ReceiptDigest, &record.ReceiptFactBytes, &record.SealedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	record.ConfigCommitmentBytes = append([]byte(nil), commitmentBytes...)
	runConfigArtifactBinding, err := decodeEvaluationProductionRunConfigArtifactBindingBytes(record.RunConfigArtifactBindingBytes)
	if err != nil || runConfigArtifactBinding.BindingDigest != runConfigArtifactBindingDigest ||
		!evaluationJSONColumnMatchesCanonical(
			runConfigArtifactBindingJSON, record.RunConfigArtifactBindingBytes,
			maximumEvaluationRunConfigArtifactBindingBytes,
		) {
		return nil, conflict("persisted evaluation holdout run-config artifact binding drifted")
	}
	record.RunConfigArtifactBinding = runConfigArtifactBinding
	commitment, err := decodeEvaluationFrozenConfigCommitment(commitmentBytes)
	if err != nil || commitment.CommitmentDigest != record.ConfigCommitmentDigest ||
		!sameEvaluationProductionRunConfigArtifactBinding(commitment.RunConfigArtifactBinding, record.RunConfigArtifactBinding) ||
		commitment.SourceConfigDigest != record.SourceConfigDigest ||
		commitment.FrozenRunDigest != record.FrozenRunDigest || commitment.PlanDigest != partition.PlanDigest ||
		commitment.RepositoryCommit != partition.RepositoryCommit || commitment.AccessPolicyDigest != record.AccessPolicyDigest {
		return nil, conflict("persisted evaluation holdout config commitment drifted")
	}
	_, receipt, err := evaluationHoldoutReceiptValue(record.ReceiptFactBytes)
	if err != nil || receipt.PlanDigest != partition.PlanDigest || receipt.FactDigest != record.ReceiptDigest ||
		receipt.RepositoryCommit != "" || receipt.RecordedAt.UTC() != record.SealedAt.UTC() ||
		stringMember(receipt.Value, "accessPolicyDigest") != record.AccessPolicyDigest ||
		stringMember(receipt.Value, "encryptedCorpusDigest") != record.EncryptedCorpusDigest ||
		stringMember(receipt.Value, "publicArtifactScanDigest") != record.ScanReceiptDigest {
		return nil, conflict("persisted evaluation holdout receipt drifted")
	}
	return &record, nil
}

func (repository *Repository) GetEvaluationHoldoutClosureRecord(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) (EvaluationHoldoutClosureRecord, error) {
	readContext, cancel, tx, _, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return EvaluationHoldoutClosureRecord{}, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	record, err := loadEvaluationHoldoutClosure(readContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return EvaluationHoldoutClosureRecord{}, err
	}
	if record == nil {
		return EvaluationHoldoutClosureRecord{}, ErrNotFound
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return EvaluationHoldoutClosureRecord{}, err
	}
	return *record, nil
}

func (repository *Repository) GetEvaluationHoldoutClosure(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) (EvaluationHoldoutClosureResult, error) {
	record, err := repository.GetEvaluationHoldoutClosureRecord(ctx, authority, partition)
	if err != nil {
		return EvaluationHoldoutClosureResult{}, err
	}
	receipt, _, err := evaluationHoldoutReceiptValue(record.ReceiptFactBytes)
	if err != nil {
		return EvaluationHoldoutClosureResult{}, err
	}
	return EvaluationHoldoutClosureResult{Status: "sealed", Receipt: receipt}, nil
}

func evaluationHoldoutCanarySetDigest(values [][]byte) (string, error) {
	ordered := append([][]byte(nil), values...)
	sort.Slice(ordered, func(left, right int) bool { return bytes.Compare(ordered[left], ordered[right]) < 0 })
	hashValue := sha256.New()
	_, _ = hashValue.Write([]byte{'['})
	for index, value := range ordered {
		if index > 0 {
			_, _ = hashValue.Write([]byte{','})
		}
		// The production canary alphabet excludes every JSON escape character,
		// so this streaming form is byte-identical to canonical JSON while
		// avoiding an immutable Go string copy of secret material.
		_, _ = hashValue.Write([]byte{'"'})
		_, _ = hashValue.Write(value)
		_, _ = hashValue.Write([]byte{'"'})
	}
	_, _ = hashValue.Write([]byte{']'})
	return "sha256-" + hex.EncodeToString(hashValue.Sum(nil)), nil
}

func evaluationHoldoutClone(value []byte) []byte {
	return append(make([]byte, 0, len(value)), value...)
}

func evaluationHoldoutQueryEscape(value []byte) []byte {
	result := make([]byte, 0, len(value)*3)
	const upperHex = "0123456789ABCDEF"
	for _, character := range value {
		if (character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z') ||
			(character >= '0' && character <= '9') || character == '-' || character == '_' ||
			character == '.' || character == '~' {
			result = append(result, character)
			continue
		}
		result = append(result, '%', upperHex[character>>4], upperHex[character&15])
	}
	return result
}

func evaluationHoldoutPercentEscape(value []byte) []byte {
	result := make([]byte, len(value)*3)
	const upperHex = "0123456789ABCDEF"
	for index, character := range value {
		result[index*3], result[index*3+1], result[index*3+2] = '%', upperHex[character>>4], upperHex[character&15]
	}
	return result
}

func evaluationHoldoutHex(value []byte, upper bool) []byte {
	result := make([]byte, hex.EncodedLen(len(value)))
	hex.Encode(result, value)
	if upper {
		for index, character := range result {
			if character >= 'a' && character <= 'f' {
				result[index] = character - ('a' - 'A')
			}
		}
	}
	return result
}

func evaluationHoldoutBase64(value []byte, encoding *base64.Encoding) []byte {
	result := make([]byte, encoding.EncodedLen(len(value)))
	encoding.Encode(result, value)
	return result
}

func evaluationClearByteSlices(values [][]byte) {
	for _, value := range values {
		for index := range value {
			value[index] = 0
		}
	}
}

func evaluationHoldoutCanarySignatures(sets EvaluationHoldoutCanarySets) ([][]byte, string, string, error) {
	if err := validateEvaluationHoldoutCanaries(sets); err != nil {
		return nil, "", "", err
	}
	secretDigest, err := evaluationHoldoutCanarySetDigest(sets.SecretCanaries)
	if err != nil {
		return nil, "", "", err
	}
	protectedDigest, err := evaluationHoldoutCanarySetDigest(sets.ProtectedHoldoutCanaries)
	if err != nil {
		return nil, "", "", err
	}
	seen := make(map[[sha256.Size]byte]struct{})
	signatures := make([][]byte, 0, (len(sets.SecretCanaries)+len(sets.ProtectedHoldoutCanaries))*7)
	appendSignature := func(candidate []byte) {
		key := sha256.Sum256(candidate)
		if _, duplicate := seen[key]; duplicate {
			for byteIndex := range candidate {
				candidate[byteIndex] = 0
			}
			return
		}
		seen[key] = struct{}{}
		signatures = append(signatures, candidate)
	}
	for _, group := range [][][]byte{sets.SecretCanaries, sets.ProtectedHoldoutCanaries} {
		for _, canary := range group {
			for _, encoded := range [][]byte{
				evaluationHoldoutClone(canary),
				evaluationHoldoutQueryEscape(canary),
				evaluationHoldoutPercentEscape(canary),
				evaluationHoldoutHex(canary, false),
				evaluationHoldoutHex(canary, true),
				evaluationHoldoutBase64(canary, base64.StdEncoding),
				evaluationHoldoutBase64(canary, base64.RawURLEncoding),
			} {
				appendSignature(encoded)
			}
		}
	}
	sort.Slice(signatures, func(left, right int) bool {
		if len(signatures[left]) != len(signatures[right]) {
			return len(signatures[left]) > len(signatures[right])
		}
		return bytes.Compare(signatures[left], signatures[right]) < 0
	})
	return signatures, secretDigest, protectedDigest, nil
}

func evaluationHoldoutBytesContainCanary(value []byte, signatures [][]byte) bool {
	for _, signature := range signatures {
		if bytes.Contains(value, signature) {
			return true
		}
	}
	return false
}

func evaluationHoldoutScanPublicFacts(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	signatures [][]byte,
) (int64, error) {
	// The exact plan row is already locked by the caller. Tables without their
	// own repository_commit column are FK-bound to the namespace/plan_digest
	// primary key, which fixes one and only one repository commit.
	queries := []struct {
		query     string
		arguments []any
	}{
		{`SELECT plan_bytes FROM agent_evaluation_plans WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3`,
			[]any{namespaceID, partition.PlanDigest, partition.RepositoryCommit}},
		{`SELECT attempt_bytes FROM agent_evaluation_attempts WHERE namespace_id=$1 AND plan_digest=$2 ORDER BY attempt_id COLLATE "C" ASC`,
			[]any{namespaceID, partition.PlanDigest}},
		{`SELECT checkpoint_bytes FROM agent_evaluation_checkpoints WHERE namespace_id=$1 AND plan_digest=$2 ORDER BY shard_id COLLATE "C" ASC, revision ASC`,
			[]any{namespaceID, partition.PlanDigest}},
		{`SELECT fact_bytes FROM agent_evaluation_artifacts WHERE namespace_id=$1 AND plan_digest=$2 ORDER BY fact_type COLLATE "C" ASC, fact_id COLLATE "C" ASC`,
			[]any{namespaceID, partition.PlanDigest}},
		{`SELECT demand_bytes FROM agent_evaluation_budget_reservations WHERE namespace_id=$1 AND plan_digest=$2 ORDER BY ledger_revision ASC`,
			[]any{namespaceID, partition.PlanDigest}},
		{`SELECT settlement_bytes FROM agent_evaluation_budget_settlements WHERE namespace_id=$1 AND plan_digest=$2 ORDER BY ledger_revision ASC`,
			[]any{namespaceID, partition.PlanDigest}},
	}
	var scanned int64
	scanRows := func(rows *sql.Rows, message string) error {
		defer rows.Close()
		for rows.Next() {
			var source []byte
			if err := rows.Scan(&source); err != nil {
				return err
			}
			if evaluationHoldoutBytesContainCanary(source, signatures) {
				return conflict(message)
			}
			scanned++
		}
		return rows.Err()
	}
	for _, sourceQuery := range queries {
		rows, err := tx.QueryContext(ctx, sourceQuery.query, sourceQuery.arguments...)
		if err != nil {
			return 0, err
		}
		if err := scanRows(rows, "evaluation public artifact contains a secret or protected holdout canary"); err != nil {
			return 0, err
		}
	}
	// Scan every raw family that the bounded archive can publish. Encrypted
	// provider spool ciphertext columns are intentionally excluded; their
	// sanitized receipt_bytes and immutable disposition receipts are included.
	for _, spec := range evaluationExportFamilySpecs() {
		if spec.Inline || spec.SourceTable == "" || spec.SourceBytesColumn == "" {
			continue
		}
		query := fmt.Sprintf(`SELECT source.%s FROM %s source
			WHERE source.namespace_id=$1 AND source.%s=$2 AND source.repository_commit=$3
			ORDER BY source.%s COLLATE "C" ASC`, spec.SourceBytesColumn, spec.SourceTable,
			spec.SourcePlanColumn, spec.SourceDigestColumn)
		rows, err := tx.QueryContext(ctx, query, namespaceID, partition.PlanDigest, partition.RepositoryCommit)
		if err != nil {
			return 0, err
		}
		if err := scanRows(rows, "evaluation archive evidence contains a secret or protected holdout canary"); err != nil {
			return 0, err
		}
	}
	candidates, err := queryEvaluationReviewCandidateRefs(ctx, tx, namespaceID, partition)
	if err != nil {
		return 0, err
	}
	for _, candidate := range candidates {
		canonical, err := canonicaljson.Bytes(canonicalEvaluationReviewCandidateRef(candidate))
		if err != nil {
			return 0, err
		}
		if evaluationHoldoutBytesContainCanary(canonical, signatures) {
			return 0, conflict("evaluation review candidate reference contains a protected canary")
		}
		scanned++
	}
	mappings, err := queryEvaluationBlindReviewMappings(ctx, tx, namespaceID, partition, "")
	if err != nil {
		return 0, err
	}
	for _, mapping := range mappings {
		canonical, err := canonicaljson.Bytes(map[string]any{
			"mappingId": mapping.MappingID, "mappingDigest": mapping.MappingDigest,
		})
		if err != nil {
			return 0, err
		}
		if evaluationHoldoutBytesContainCanary(canonical, signatures) {
			return 0, conflict("evaluation blind review mapping reference contains a protected canary")
		}
		scanned++
	}
	return scanned, nil
}

type evaluationHoldoutMachineEvidence struct {
	Plan                       evaluationPlanFact
	Attempts                   []EvaluationAttemptRecord
	ProtectedAttemptRefs       []map[string]any
	ExecutedProtectedCaseIDs   []string
	CheckpointSetDigest        string
	BudgetLedgerDigest         string
	AuthenticityFamilyRoots    map[string]string
	ProtectedEvidenceSetDigest string
	MissingFacts               []string
}

func evaluationHoldoutAuthenticityRoots(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	planRecord EvaluationPlanRecord,
	plan evaluationPlanFact,
	attempts []EvaluationAttemptRecord,
) (map[string]string, error) {
	evidence, err := queryEvaluationAuthenticityEvidenceV3(
		ctx, tx, namespaceID, partition, planRecord, attempts, true,
	)
	if err != nil {
		return nil, err
	}
	if err := validateEvaluationReviewRasterScanBindings(
		planRecord, attempts, evidence.ReviewRasterScanRecords,
	); err != nil {
		return nil, err
	}
	if err := validateEvaluationReviewCandidateBindings(
		planRecord, attempts, evidence.InvocationTurns, evidence.Executions,
		evidence.ReviewRasterScanRecords, evidence.ReviewCandidateRefs, true,
	); err != nil {
		return nil, err
	}
	sets, err := validateEvaluationAuthenticityCompletenessV3(
		plan, attempts, evidence.EndpointSmokeCommit, evidence.EndpointSmokeIntents, evidence.EndpointSmokeTransports,
		evidence.EndpointSmokeSpools, evidence.EndpointSmokeDispositions, evidence.EndpointSmokeFailures,
		evidence.EndpointSmokes, evidence.PreDispatchFailures, evidence.DispatchIntents, evidence.Transports,
		evidence.Spools, evidence.SpoolDispositions, evidence.InvocationTurns, evidence.InvocationTurnSets,
		evidence.ResultSubmissions, evidence.ControlledRuntimes, evidence.CapabilityExecutions,
		evidence.AttemptAuthorityOwners, evidence.CapabilitySpecifics, evidence.ProviderCapabilityObservations,
		evidence.VerificationAttemptGrants, evidence.ValidatedHumanReviews,
		evidence.ValidatedHumanMetrics, evidence.ValidatedHumanMetricSetDigest, evidence.ReviewRasterScanRecords,
		evidence.ReviewCandidateRefs, evidence.BlindReviewMappings, evidence.Sources, evidence.Executions,
	)
	if err != nil {
		return nil, err
	}
	return map[string]string{
		"endpointSmokeDispatchIntents":                sets.EndpointSmokeDispatchIntent,
		"endpointSmokeTransportReceipts":              sets.EndpointSmokeTransport,
		"endpointSmokeResultSpoolReceipts":            sets.EndpointSmokeResultSpool,
		"endpointSmokeResultSpoolDispositionReceipts": sets.EndpointSmokeSpoolDisposition,
		"endpointSmokeValidationFailureReceipts":      sets.EndpointSmokeValidationFailure,
		"endpointSmokeReceipts":                       sets.EndpointSmoke,
		"preDispatchFailureReceipts":                  sets.PreDispatchFailure,
		"transportDispatchIntents":                    sets.TransportDispatchIntent,
		"transportReceipts":                           sets.Transport,
		"providerResultSpoolReceipts":                 sets.ProviderResultSpool,
		"providerResultSpoolDispositionReceipts":      sets.ProviderResultSpoolDisposition,
		"invocationTurnReceipts":                      sets.InvocationTurn,
		"invocationTurnSetReceipts":                   sets.InvocationTurnSet,
		"resultSubmissionReceipts":                    sets.ResultSubmission,
		"attemptAuthorityOwnerReceipts":               sets.AttemptAuthorityOwner,
		"controlledRuntimeReceipts":                   sets.ControlledRuntime,
		"capabilityExecutionReceipts":                 sets.CapabilityExecution,
		"capabilitySpecificReceipts":                  sets.CapabilitySpecific,
		"providerCapabilityObservationReceipts":       sets.ProviderCapabilityObservation,
		"verificationAttemptGrantReceipts":            sets.VerificationAttemptGrant,
		"validatedHumanReviewArtifacts":               sets.ValidatedHumanReview,
		"validatedHumanMetricObservations":            sets.ValidatedHumanMetric,
		"reviewRasterScanReceipts":                    sets.ReviewRasterScan,
		"reviewCandidateRefs":                         sets.ReviewCandidateRef,
		"blindReviewMappingRefs":                      sets.BlindReviewMapping,
		"sourceReceipts":                              sets.Source,
		"executionReceipts":                           sets.Execution,
	}, nil
}

func evaluationHoldoutMachineEvidenceForPartition(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	planRecord EvaluationPlanRecord,
) (evaluationHoldoutMachineEvidence, error) {
	plan, err := decodeEvaluationPlan(planRecord.FactBytes)
	if err != nil {
		return evaluationHoldoutMachineEvidence{}, err
	}
	planned, err := evaluationStatusPlannedAttempts(plan)
	if err != nil {
		return evaluationHoldoutMachineEvidence{}, err
	}
	expected := make(map[string]evaluationStatusPlannedAttempt, len(planned))
	expectedShards := make(map[string]struct{})
	for _, descriptor := range planned {
		expected[descriptor.AttemptID] = descriptor
		expectedShards[descriptor.ShardID] = struct{}{}
	}
	attempts, err := queryEvaluationAttempts(ctx, tx, namespaceID, partition, planRecord, "")
	if err != nil {
		return evaluationHoldoutMachineEvidence{}, err
	}
	missing := make([]string, 0)
	seen := make(map[string]struct{}, len(attempts))
	completedCount := int64(0)
	protectedRefs := make([]map[string]any, 0, len(attempts)/4)
	protectedCases, err := evaluationPlanProtectedCases(plan)
	if err != nil {
		return evaluationHoldoutMachineEvidence{}, err
	}
	protectedCaseIDs := make(map[string]struct{}, len(protectedCases))
	protectedCaseList := make([]string, len(protectedCases))
	for _, evaluationCase := range protectedCases {
		protectedCaseIDs[evaluationCase.CaseID] = struct{}{}
	}
	for index, evaluationCase := range protectedCases {
		protectedCaseList[index] = evaluationCase.CaseID
	}
	for _, attempt := range attempts {
		descriptor, exists := expected[attempt.FactID]
		if !exists || descriptor.ShardID != attempt.ShardID || descriptor.CaseID != attempt.CaseID {
			return evaluationHoldoutMachineEvidence{}, conflict("evaluation holdout attempt denominator drifted")
		}
		if _, duplicate := seen[attempt.FactID]; duplicate {
			return evaluationHoldoutMachineEvidence{}, conflict("evaluation holdout attempt identity is duplicated")
		}
		seen[attempt.FactID] = struct{}{}
		if attempt.Status == "completed" {
			completedCount++
		}
		if _, protected := protectedCaseIDs[attempt.CaseID]; protected {
			protectedRefs = append(protectedRefs, map[string]any{
				"attemptId": attempt.FactID, "descriptorDigest": attempt.DescriptorDigest, "attemptDigest": attempt.FactDigest,
			})
		}
	}
	if len(attempts) != len(expected) || int64(len(attempts)) != plan.PlannedJourneyCount {
		missing = append(missing, "complete-attempt-denominator")
	}
	sort.Slice(protectedRefs, func(left, right int) bool {
		return stringMember(protectedRefs[left], "attemptId") < stringMember(protectedRefs[right], "attemptId")
	})
	checkpointSetDigest, checkpointErr := evaluationReviewLatestCheckpointRoot(ctx, tx, namespaceID, partition, expectedShards)
	if checkpointErr != nil {
		if errors.Is(checkpointErr, ErrConflict) {
			missing = append(missing, "completed-shard-checkpoints")
		} else {
			return evaluationHoldoutMachineEvidence{}, checkpointErr
		}
	}
	budgetSnapshot, err := loadEvaluationBudgetSnapshot(ctx, tx, namespaceID, partition, planRecord)
	if err != nil {
		return evaluationHoldoutMachineEvidence{}, err
	}
	if len(budgetSnapshot.UnsettledReservationIDs) != 0 {
		missing = append(missing, "settled-budget-ledger")
	}
	_, _, budgetLedgerDigest, err := canonicalEvaluationBudgetLedger(ctx, tx, namespaceID, partition, planRecord)
	if err != nil {
		return evaluationHoldoutMachineEvidence{}, err
	}
	var validatedHumanCount, reviewLeaseCount, authorityCount int64
	if err := tx.QueryRowContext(ctx, `SELECT
		(SELECT COUNT(*) FROM agent_evaluation_validated_human_review_artifacts
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3),
		(SELECT COUNT(*) FROM agent_evaluation_export_leases
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND lease_kind=$4),
		(SELECT COUNT(*) FROM agent_evaluation_authority_attestations
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3)`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit, evaluationHumanReviewExportLeaseKind).Scan(
		&validatedHumanCount, &reviewLeaseCount, &authorityCount); err != nil {
		return evaluationHoldoutMachineEvidence{}, err
	}
	if validatedHumanCount != 0 || reviewLeaseCount != 0 || authorityCount != 0 {
		return evaluationHoldoutMachineEvidence{}, conflict("evaluation holdout closure must precede review and final attestation")
	}
	eligibleReviewAttempts, err := evaluationReviewEligibleAttemptIDs(plan)
	if err != nil {
		return evaluationHoldoutMachineEvidence{}, err
	}
	var endpointCommitCount, endpointTerminalCount int64
	var turnSetCount, executionCount, capabilityCount, submissionCount, runtimeCount int64
	var reviewCandidateCount, blindMappingCount, reviewRasterCount int64
	var openIntentCount, undisposedSpoolCount, orphanPreDispatchCount int64
	if err := tx.QueryRowContext(ctx, `SELECT
		(SELECT COUNT(*) FROM agent_evaluation_endpoint_smoke_evidence_commits
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3),
		(SELECT COUNT(*) FROM agent_evaluation_endpoint_smoke_terminal_receipts
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3),
		(SELECT COUNT(*) FROM agent_evaluation_invocation_turn_set_receipts
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3),
		(SELECT COUNT(*) FROM agent_evaluation_execution_receipts
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3),
		(SELECT COUNT(*) FROM agent_evaluation_capability_execution_receipts
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3),
		(SELECT COUNT(*) FROM agent_evaluation_result_submission_receipts
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3),
		(SELECT COUNT(*) FROM agent_evaluation_controlled_runtime_receipts
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3),
		(SELECT COUNT(*) FROM agent_evaluation_review_candidates
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3),
		(SELECT COUNT(*) FROM agent_evaluation_blind_review_mappings
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3),
		(SELECT COUNT(*) FROM agent_evaluation_review_raster_scan_receipts
		 WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3),
		(SELECT COUNT(*) FROM agent_evaluation_transport_dispatch_intents intent
		 LEFT JOIN agent_evaluation_transport_receipts receipt ON receipt.namespace_id=intent.namespace_id
		  AND receipt.plan_digest=intent.plan_digest AND receipt.attempt_id=intent.attempt_id AND receipt.turn_index=intent.turn_index
		 WHERE intent.namespace_id=$1 AND intent.plan_digest=$2 AND intent.repository_commit=$3 AND receipt.receipt_digest IS NULL),
		(SELECT COUNT(*) FROM agent_evaluation_provider_result_spool_receipts spool
		 LEFT JOIN agent_evaluation_provider_result_spool_dispositions disposition ON disposition.namespace_id=spool.namespace_id
		  AND disposition.plan_digest=spool.plan_digest AND disposition.spool_ref=spool.spool_ref
		 WHERE spool.namespace_id=$1 AND spool.plan_digest=$2 AND spool.repository_commit=$3 AND disposition.receipt_digest IS NULL),
		(SELECT COUNT(*) FROM agent_evaluation_pre_dispatch_failure_receipts failure
		 LEFT JOIN agent_evaluation_invocation_turn_receipts turn ON turn.namespace_id=failure.namespace_id
		  AND turn.plan_digest=failure.plan_digest AND turn.attempt_id=failure.attempt_id AND turn.turn_index=failure.turn_index
		  AND turn.execution_failure_authority_receipt_digest=failure.receipt_digest
		 WHERE failure.namespace_id=$1 AND failure.plan_digest=$2 AND failure.repository_commit=$3 AND turn.evidence_digest IS NULL)`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit).Scan(
		&endpointCommitCount, &endpointTerminalCount, &turnSetCount, &executionCount, &capabilityCount,
		&submissionCount, &runtimeCount, &reviewCandidateCount, &blindMappingCount, &reviewRasterCount,
		&openIntentCount, &undisposedSpoolCount, &orphanPreDispatchCount); err != nil {
		return evaluationHoldoutMachineEvidence{}, err
	}
	endpointTargets, _ := plan.Value["endpointSmokeTargets"].([]any)
	eligibleReviewCount := int64(len(eligibleReviewAttempts))
	for _, check := range []struct {
		missing          string
		actual, expected int64
	}{
		{"endpoint-smoke-evidence-commit", endpointCommitCount, 1},
		{"endpoint-smoke-receipts", endpointTerminalCount, int64(len(endpointTargets))},
		{"invocation-turn-set-receipts", turnSetCount, plan.PlannedJourneyCount},
		{"execution-receipts", executionCount, plan.PlannedJourneyCount},
		{"capability-execution-receipts", capabilityCount, plan.PlannedJourneyCount},
		{"result-submission-receipts", submissionCount, completedCount},
		{"controlled-runtime-receipts", runtimeCount, completedCount},
		{"review-candidate-refs", reviewCandidateCount, eligibleReviewCount},
		{"blind-review-mappings", blindMappingCount, eligibleReviewCount},
		{"review-raster-scan-receipts", reviewRasterCount, eligibleReviewCount},
		{"closed-transport-dispatch-intents", openIntentCount, 0},
		{"disposed-provider-result-spools", undisposedSpoolCount, 0},
		{"bound-pre-dispatch-failures", orphanPreDispatchCount, 0},
	} {
		if check.actual != check.expected {
			missing = append(missing, check.missing)
		}
	}
	// The receipt's executed case list is derived from durable joins. Encrypted
	// inventory identities never count as execution evidence.
	placeholders := make([]string, len(protectedCaseList))
	arguments := []any{namespaceID, partition.PlanDigest}
	for index, caseID := range protectedCaseList {
		placeholders[index] = fmt.Sprintf("$%d", index+3)
		arguments = append(arguments, caseID)
	}
	joinRows, err := tx.QueryContext(ctx, `SELECT attempt.attempt_id, attempt.case_id,
		EXISTS (SELECT 1 FROM agent_evaluation_invocation_turn_set_receipts turn_set
		 WHERE turn_set.namespace_id=attempt.namespace_id AND turn_set.plan_digest=attempt.plan_digest
		  AND turn_set.attempt_id=attempt.attempt_id),
		EXISTS (SELECT 1 FROM agent_evaluation_execution_receipts execution
		 WHERE execution.namespace_id=attempt.namespace_id AND execution.plan_digest=attempt.plan_digest
		  AND execution.attempt_id=attempt.attempt_id AND execution.descriptor_digest=attempt.descriptor_digest),
		EXISTS (SELECT 1 FROM agent_evaluation_capability_execution_receipts capability
		 WHERE capability.namespace_id=attempt.namespace_id AND capability.plan_digest=attempt.plan_digest
		  AND capability.attempt_id=attempt.attempt_id AND capability.descriptor_digest=attempt.descriptor_digest)
		FROM agent_evaluation_attempts attempt
		WHERE attempt.namespace_id=$1 AND attempt.plan_digest=$2 AND attempt.case_id IN (`+
		strings.Join(placeholders, ",")+`) ORDER BY attempt.attempt_id COLLATE "C" ASC`, arguments...)
	if err != nil {
		return evaluationHoldoutMachineEvidence{}, err
	}
	executedCases := make(map[string]struct{}, len(protectedCaseList))
	joinedAttemptCount := 0
	for joinRows.Next() {
		var attemptID, caseID string
		var turnSetExists, executionExists, capabilityExists bool
		if err := joinRows.Scan(&attemptID, &caseID, &turnSetExists, &executionExists, &capabilityExists); err != nil {
			_ = joinRows.Close()
			return evaluationHoldoutMachineEvidence{}, err
		}
		joinedAttemptCount++
		if !turnSetExists || !executionExists || !capabilityExists {
			missing = append(missing, "protected-attempt-evidence-join")
			continue
		}
		executedCases[caseID] = struct{}{}
	}
	if err := joinRows.Close(); err != nil {
		return evaluationHoldoutMachineEvidence{}, err
	}
	if joinedAttemptCount != len(protectedRefs) || len(executedCases) != len(protectedCaseList) {
		missing = append(missing, "protected-attempt-evidence-join")
	}
	executedProtectedCaseIDs := make([]string, 0, len(executedCases))
	for caseID := range executedCases {
		executedProtectedCaseIDs = append(executedProtectedCaseIDs, caseID)
	}
	sort.Strings(executedProtectedCaseIDs)
	roots := make(map[string]string)
	if len(missing) == 0 {
		roots, err = evaluationHoldoutAuthenticityRoots(ctx, tx, namespaceID, partition, planRecord, plan, attempts)
		if err != nil {
			return evaluationHoldoutMachineEvidence{}, err
		}
		for _, spec := range evaluationReviewMachineFamilySpecs() {
			if spec.Family != "attempts" {
				continue
			}
			attemptRoot, attemptCount, rootErr := evaluationReviewSourceFamilyRoot(ctx, tx, namespaceID, partition, spec)
			if rootErr != nil {
				return evaluationHoldoutMachineEvidence{}, rootErr
			}
			if attemptCount != plan.PlannedJourneyCount {
				return evaluationHoldoutMachineEvidence{}, conflict("evaluation attempt root drifted from its complete denominator")
			}
			roots["attempts"] = attemptRoot
			break
		}
		if roots["attempts"] == "" {
			return evaluationHoldoutMachineEvidence{}, conflict("evaluation attempt root is unavailable")
		}
	}
	protectedEvidenceSetDigest, err := canonicaljson.Digest(map[string]any{
		"planDigest": partition.PlanDigest, "repositoryCommit": partition.RepositoryCommit,
		"protectedAttemptRefs": protectedRefs, "checkpointSetDigest": checkpointSetDigest,
		"budgetLedgerDigest": budgetLedgerDigest, "authenticityFamilyRoots": roots,
	})
	if err != nil {
		return evaluationHoldoutMachineEvidence{}, err
	}
	return evaluationHoldoutMachineEvidence{
		Plan: plan, Attempts: attempts, ProtectedAttemptRefs: protectedRefs,
		ExecutedProtectedCaseIDs: executedProtectedCaseIDs,
		CheckpointSetDigest:      checkpointSetDigest, BudgetLedgerDigest: budgetLedgerDigest,
		AuthenticityFamilyRoots: roots, ProtectedEvidenceSetDigest: protectedEvidenceSetDigest,
		MissingFacts: evaluationCanonicalMissingFacts(missing...),
	}, nil
}

func evaluationHoldoutScanReceiptDigest(
	partition EvaluationPlanPartition,
	machine evaluationHoldoutMachineEvidence,
	secretCanarySetDigest string,
	protectedCanarySetDigest string,
	scannedRecordCount int64,
	scannedAt time.Time,
) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format": "prodivix.g4-model-evaluation-public-artifact-scan", "version": int64(1),
		"planDigest": partition.PlanDigest, "repositoryCommit": partition.RepositoryCommit,
		"protectedEvidenceSetDigest":      machine.ProtectedEvidenceSetDigest,
		"authenticityFamilyRoots":         machine.AuthenticityFamilyRoots,
		"secretCanarySetDigest":           secretCanarySetDigest,
		"protectedHoldoutCanarySetDigest": protectedCanarySetDigest,
		"scannedRecordCount":              scannedRecordCount, "leakedCaseIds": []string{},
		"scannedAt": evaluationExportInstant(scannedAt),
	})
}

func insertEvaluationHoldoutArtifact(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	artifact evaluationArtifactFact,
) error {
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_artifacts (
		namespace_id, plan_digest, fact_type, fact_id, fact_digest, outcome, fact_json, fact_bytes, recorded_at
	) VALUES ($1,$2,$3,$4,$5,NULL,$6::jsonb,$7,$8) ON CONFLICT DO NOTHING`,
		namespaceID, artifact.PlanDigest, artifact.FactType, artifact.FactID, artifact.FactDigest,
		string(artifact.Canonical), artifact.Canonical, artifact.RecordedAt)
	if err != nil {
		return err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if inserted != 1 {
		return conflict("evaluation holdout artifact identity already exists")
	}
	return nil
}

func (repository *Repository) SealEvaluationHoldoutClosure(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	evidence EvaluationHoldoutSealAuthorityEvidence,
	canaries EvaluationHoldoutCanarySets,
	sealedAt time.Time,
) (EvaluationHoldoutClosureResult, bool, error) {
	defer clearEvaluationHoldoutCanaries(&canaries)
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationHoldoutClosureResult{}, false, err
	}
	sealedAt = sealedAt.UTC().Truncate(time.Millisecond)
	if sealedAt.IsZero() || validateEvaluationProductionRunConfigArtifactPartition(evidence.RunConfigArtifactBinding, partition) != nil ||
		!evaluationDigestPattern.MatchString(evidence.ConfigCommitmentDigest) ||
		!evaluationDigestPattern.MatchString(evidence.EncryptedCorpusDigest) || validateEvaluationHoldoutCanaries(canaries) != nil {
		return EvaluationHoldoutClosureResult{}, false, ErrInvalid
	}
	writeContext, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(writeContext, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationHoldoutClosureResult{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(writeContext, `SELECT 1 FROM agent_evaluation_plans
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 FOR UPDATE`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit); err != nil {
		return EvaluationHoldoutClosureResult{}, false, err
	}
	existing, err := loadEvaluationHoldoutClosure(writeContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return EvaluationHoldoutClosureResult{}, false, err
	}
	if existing != nil {
		if !sameEvaluationProductionRunConfigArtifactBinding(existing.RunConfigArtifactBinding, evidence.RunConfigArtifactBinding) ||
			existing.SourceConfigDigest != evidence.SourceConfigDigest ||
			existing.FrozenRunDigest != evidence.FrozenRunDigest ||
			existing.ConfigCommitmentDigest != evidence.ConfigCommitmentDigest ||
			!bytes.Equal(existing.ConfigCommitmentBytes, evidence.ConfigCommitmentBytes) ||
			existing.AccessPolicyDigest != evidence.AccessPolicyDigest ||
			existing.EncryptedCorpusDigest != evidence.EncryptedCorpusDigest {
			return EvaluationHoldoutClosureResult{}, false, conflict("evaluation holdout closure replay drifted from immutable authority")
		}
		receipt, _, err := evaluationHoldoutReceiptValue(existing.ReceiptFactBytes)
		if err != nil {
			return EvaluationHoldoutClosureResult{}, false, err
		}
		if err := tx.Commit(); err != nil {
			return EvaluationHoldoutClosureResult{}, false, err
		}
		return EvaluationHoldoutClosureResult{Status: "sealed", Receipt: receipt}, true, nil
	}
	planRecord, err := loadEvaluationPlanRecord(writeContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return EvaluationHoldoutClosureResult{}, false, err
	}
	if sealedAt.Before(planRecord.PlannedAt) || sealedAt.After(planRecord.ExpiresAt) {
		return EvaluationHoldoutClosureResult{}, false, conflict("evaluation holdout closure time is outside the frozen plan window")
	}
	commitment, err := decodeEvaluationFrozenConfigCommitment(evidence.ConfigCommitmentBytes)
	if err != nil || commitment.CommitmentDigest != evidence.ConfigCommitmentDigest ||
		!sameEvaluationProductionRunConfigArtifactBinding(commitment.RunConfigArtifactBinding, evidence.RunConfigArtifactBinding) ||
		commitment.SourceConfigDigest != evidence.SourceConfigDigest ||
		commitment.FrozenRunDigest != evidence.FrozenRunDigest || commitment.PlanDigest != partition.PlanDigest ||
		commitment.RepositoryCommit != partition.RepositoryCommit || commitment.AccessPolicyDigest != evidence.AccessPolicyDigest ||
		commitment.ProtectedHoldoutManifestDigest != evidence.ProtectedHoldoutManifestDigest {
		return EvaluationHoldoutClosureResult{}, false, conflict("evaluation holdout authority evidence drifted")
	}
	artifactRecord, _, err := loadEvaluationProductionRunConfigArtifact(
		writeContext, tx, authority.NamespaceID, partition, evidence.RunConfigArtifactBinding.BindingDigest,
	)
	if err != nil || !sameEvaluationProductionRunConfigArtifactBinding(artifactRecord.Binding, evidence.RunConfigArtifactBinding) ||
		artifactRecord.Binding.SourceConfigDigest != evidence.SourceConfigDigest ||
		artifactRecord.Binding.FrozenRunDigest != evidence.FrozenRunDigest {
		return EvaluationHoldoutClosureResult{}, false, conflict("evaluation holdout requires the exact sealed production run-config artifact")
	}
	machine, err := evaluationHoldoutMachineEvidenceForPartition(writeContext, tx, authority.NamespaceID, partition, planRecord)
	if err != nil {
		return EvaluationHoldoutClosureResult{}, false, err
	}
	if len(machine.MissingFacts) != 0 {
		if err := tx.Commit(); err != nil {
			return EvaluationHoldoutClosureResult{}, false, err
		}
		return EvaluationHoldoutClosureResult{Status: "pending", MissingFacts: machine.MissingFacts}, false, nil
	}
	if len(machine.ExecutedProtectedCaseIDs) != len(evidence.EnvelopeCaseIDs) {
		return EvaluationHoldoutClosureResult{}, false, conflict("evaluation holdout envelope inventory does not cover the executed protected cases")
	}
	for index := range machine.ExecutedProtectedCaseIDs {
		if machine.ExecutedProtectedCaseIDs[index] != evidence.EnvelopeCaseIDs[index] {
			return EvaluationHoldoutClosureResult{}, false, conflict("evaluation holdout envelope inventory drifted from durable execution evidence")
		}
	}
	signatures, secretCanarySetDigest, protectedCanarySetDigest, err := evaluationHoldoutCanarySignatures(canaries)
	if err != nil {
		return EvaluationHoldoutClosureResult{}, false, err
	}
	scannedRecordCount, err := evaluationHoldoutScanPublicFacts(writeContext, tx, authority.NamespaceID, partition, signatures)
	for _, signature := range signatures {
		for index := range signature {
			signature[index] = 0
		}
	}
	if err != nil {
		return EvaluationHoldoutClosureResult{}, false, err
	}
	scanReceiptDigest, err := evaluationHoldoutScanReceiptDigest(partition, machine, secretCanarySetDigest,
		protectedCanarySetDigest, scannedRecordCount, sealedAt)
	if err != nil {
		return EvaluationHoldoutClosureResult{}, false, err
	}
	receiptID := "holdout-receipt:" + strings.TrimPrefix(partition.PlanDigest, "sha256-")
	receiptBase := map[string]any{
		"receiptId": receiptID, "planDigest": partition.PlanDigest,
		"protectedHoldoutManifestDigest": evidence.ProtectedHoldoutManifestDigest,
		"accessPolicyDigest":             evidence.AccessPolicyDigest, "encryptedCorpusDigest": evidence.EncryptedCorpusDigest,
		"executedCaseIds": machine.ExecutedProtectedCaseIDs, "publicArtifactScanDigest": scanReceiptDigest,
		"leakedCaseIds": []string{}, "executorPrincipalId": evaluationHoldoutExecutorPrincipal,
		"executedAt": evaluationExportInstant(sealedAt),
	}
	receiptDigest, err := canonicaljson.Digest(receiptBase)
	if err != nil {
		return EvaluationHoldoutClosureResult{}, false, err
	}
	receiptValue := make(map[string]any, len(receiptBase)+1)
	for key, value := range receiptBase {
		receiptValue[key] = value
	}
	receiptValue["receiptDigest"] = receiptDigest
	factValue := map[string]any{"wireVersion": int64(1), "factType": "evaluation-holdout-receipt", "value": receiptValue}
	factBytes, err := canonicaljson.Bytes(factValue)
	if err != nil {
		return EvaluationHoldoutClosureResult{}, false, err
	}
	artifact, err := decodeEvaluationArtifact(factBytes, "evaluation-holdout-receipt")
	if err != nil || artifact.PlanDigest != partition.PlanDigest || artifact.FactDigest != receiptDigest {
		return EvaluationHoldoutClosureResult{}, false, conflict("evaluation holdout receipt did not satisfy the canonical contract")
	}
	if err := insertEvaluationHoldoutArtifact(writeContext, tx, authority.NamespaceID, artifact); err != nil {
		return EvaluationHoldoutClosureResult{}, false, err
	}
	if _, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_holdout_closures (
		namespace_id, plan_digest, repository_commit, run_config_artifact_binding_digest,
		run_config_artifact_binding_json, run_config_artifact_binding_bytes, source_config_digest,
		frozen_run_digest, config_commitment_digest, config_commitment_bytes,
		protected_evidence_set_digest, access_policy_digest, encrypted_corpus_digest,
		secret_canary_set_digest, protected_holdout_canary_set_digest, scan_receipt_digest,
		receipt_digest, receipt_bytes, sealed_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		evidence.RunConfigArtifactBinding.BindingDigest,
		evaluationProductionRunConfigArtifactBindingBytes(evidence.RunConfigArtifactBinding),
		evaluationProductionRunConfigArtifactBindingBytes(evidence.RunConfigArtifactBinding),
		evidence.SourceConfigDigest, evidence.FrozenRunDigest, evidence.ConfigCommitmentDigest, evidence.ConfigCommitmentBytes,
		machine.ProtectedEvidenceSetDigest, evidence.AccessPolicyDigest, evidence.EncryptedCorpusDigest,
		secretCanarySetDigest, protectedCanarySetDigest, scanReceiptDigest, receiptDigest, factBytes, sealedAt); err != nil {
		return EvaluationHoldoutClosureResult{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationHoldoutClosureResult{}, false, err
	}
	receiptBytes, err := canonicaljson.Bytes(receiptValue)
	if err != nil {
		return EvaluationHoldoutClosureResult{}, false, err
	}
	return EvaluationHoldoutClosureResult{Status: "sealed", Receipt: json.RawMessage(receiptBytes)}, false, nil
}
