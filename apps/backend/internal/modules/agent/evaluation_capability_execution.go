package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationCapabilityExecutionReceiptFormat = "prodivix.agent-evaluation-capability-execution-receipt"
	maximumEvaluationCapabilityExecutionBytes  = 65_536
	maximumEvaluationCapabilityListItems       = 32
)

type EvaluationCapabilityExecutionReceiptRecord struct {
	NamespaceID                  string
	PlanDigest                   string
	RepositoryCommit             string
	CapabilityExecutionReceiptID string
	AttemptID                    string
	DescriptorDigest             string
	TurnIndex                    int64
	InvocationID                 string
	CaseID                       string
	CaseDigest                   string
	TargetID                     string
	TargetDigest                 string
	CapabilityProfileID          string
	CapabilityID                 string
	SupportExpectation           string
	CapabilityDescriptorDigest   string
	Outcome                      string
	Verdict                      string
	PolicyDigest                 string
	ToolRegistryDigest           string
	ObservedAt                   time.Time
	ReceiptDigest                string
	ReceiptBytes                 []byte
}

type evaluationCapabilityExecutionReceipt struct {
	EvaluationCapabilityExecutionReceiptRecord
	ExpectedToolIDs                     []string
	ExpectedReceiptKinds                []string
	ToolBindings                        []map[string]any
	SpecificReceipts                    []map[string]any
	AttemptAuthorityOwnerReceiptDigests []string
	Value                               map[string]any
}

func evaluationCanonicalIdentityList(value any, requireItem bool, name string) ([]string, error) {
	raw, ok := value.([]any)
	if !ok || len(raw) > maximumEvaluationCapabilityListItems || (requireItem && len(raw) == 0) {
		return nil, invalid("evaluation capability " + name + " is invalid")
	}
	result := make([]string, len(raw))
	for index, entry := range raw {
		identity, err := evaluationAuthenticityIdentity(entry, name)
		if err != nil || (index > 0 && result[index-1] >= identity) {
			return nil, invalid("evaluation capability " + name + " is non-canonical")
		}
		result[index] = identity
	}
	return result, nil
}

func evaluationCapabilityToolBindings(value any) ([]map[string]any, error) {
	raw, ok := value.([]any)
	if !ok || len(raw) > maximumEvaluationCapabilityListItems {
		return nil, invalid("evaluation capability tool bindings are invalid")
	}
	result := make([]map[string]any, len(raw))
	previousID, previousDigest := "", ""
	for index, entry := range raw {
		binding, ok := entry.(map[string]any)
		if !ok || !exactEvaluationKeys(binding, []string{"toolId", "definitionDigest"}) {
			return nil, invalid("evaluation capability tool binding shape is invalid")
		}
		toolID, err := evaluationAuthenticityIdentity(binding["toolId"], "capability tool id")
		if err != nil {
			return nil, err
		}
		definitionDigest, err := evaluationAuthenticityDigest(binding["definitionDigest"], "capability tool definition digest")
		if err != nil {
			return nil, err
		}
		if index > 0 && (toolID < previousID || (toolID == previousID && definitionDigest <= previousDigest)) {
			return nil, invalid("evaluation capability tool bindings are non-canonical")
		}
		if toolID == previousID {
			return nil, invalid("evaluation capability tool id is duplicated")
		}
		previousID, previousDigest, result[index] = toolID, definitionDigest, binding
	}
	return result, nil
}

func evaluationCapabilitySpecificReceipts(value any) ([]map[string]any, error) {
	raw, ok := value.([]any)
	if !ok || len(raw) > 2 {
		return nil, invalid("evaluation capability specific receipts are invalid")
	}
	result := make([]map[string]any, len(raw))
	previousKind, previousDigest := "", ""
	for index, entry := range raw {
		receipt, ok := entry.(map[string]any)
		if !ok || !exactEvaluationKeys(receipt, []string{"receiptKind", "receiptDigest"}) {
			return nil, invalid("evaluation capability specific receipt shape is invalid")
		}
		kind, err := evaluationAuthenticityIdentity(receipt["receiptKind"], "capability receipt kind")
		if err != nil {
			return nil, err
		}
		digest, err := evaluationAuthenticityDigest(receipt["receiptDigest"], "capability specific receipt digest")
		if err != nil {
			return nil, err
		}
		if index > 0 && (kind < previousKind || (kind == previousKind && digest <= previousDigest)) {
			return nil, invalid("evaluation capability specific receipts are non-canonical")
		}
		if kind == previousKind {
			return nil, invalid("evaluation capability receipt kind is duplicated")
		}
		previousKind, previousDigest, result[index] = kind, digest, receipt
	}
	return result, nil
}

func evaluationExactStringSequence(expected, actual []string) bool {
	if len(expected) != len(actual) {
		return false
	}
	for index := range expected {
		if expected[index] != actual[index] {
			return false
		}
	}
	return true
}

func evaluationStringSubset(expected, actual []string) bool {
	allowed := make(map[string]struct{}, len(expected))
	for _, value := range expected {
		allowed[value] = struct{}{}
	}
	for _, value := range actual {
		if _, exists := allowed[value]; !exists {
			return false
		}
	}
	return true
}

func decodeEvaluationCapabilityExecutionReceipt(source []byte) (evaluationCapabilityExecutionReceipt, error) {
	if len(source) == 0 || len(source) > maximumEvaluationCapabilityExecutionBytes {
		return evaluationCapabilityExecutionReceipt{}, invalid("evaluation capability execution receipt exceeds its byte limit")
	}
	value, canonical, err := decodeEvaluationAuthenticityObject(source)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "capabilityExecutionReceiptId", "planDigest", "repositoryCommit",
		"attemptId", "descriptorDigest", "turnIndex", "invocationId", "caseId", "caseDigest",
		"targetId", "targetDigest", "capabilityProfileId", "capabilityId", "supportExpectation",
		"expectedToolIds", "expectedReceiptKinds", "capabilityDescriptorDigest", "toolBindings",
		"outcome", "verdict", "specificReceiptDigests", "attemptAuthorityOwnerReceiptDigests",
		"policyDigest", "toolRegistryDigest",
		"observedAt", "receiptDigest",
	}) || value["format"] != evaluationCapabilityExecutionReceiptFormat {
		return evaluationCapabilityExecutionReceipt{}, invalid("evaluation capability execution receipt shape is invalid")
	}
	version, versionOK := integerMember(value, "version")
	turnIndex, turnErr := evaluationCount(value["turnIndex"], "evaluation capability turn")
	if !versionOK || version != 1 || turnErr != nil || turnIndex > maximumEvaluationPreDispatchTurnIndex ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) {
		return evaluationCapabilityExecutionReceipt{}, invalid("evaluation capability execution partition is invalid")
	}
	identities := make(map[string]string)
	for _, field := range []string{
		"capabilityExecutionReceiptId", "attemptId", "invocationId", "caseId", "targetId",
		"capabilityProfileId", "capabilityId",
	} {
		identities[field], err = evaluationAuthenticityIdentity(value[field], field)
		if err != nil {
			return evaluationCapabilityExecutionReceipt{}, err
		}
	}
	digests := make(map[string]string)
	for _, field := range []string{
		"planDigest", "descriptorDigest", "caseDigest", "targetDigest", "capabilityDescriptorDigest",
		"policyDigest", "toolRegistryDigest",
	} {
		digests[field], err = evaluationAuthenticityDigest(value[field], field)
		if err != nil {
			return evaluationCapabilityExecutionReceipt{}, err
		}
	}
	support, outcome, verdict := stringMember(value, "supportExpectation"), stringMember(value, "outcome"), stringMember(value, "verdict")
	if !oneOfString(support, "required", "expected-blocked") || !oneOfString(outcome, "supported", "unsupported", "failed") ||
		!oneOfString(verdict, "passed", "failed") {
		return evaluationCapabilityExecutionReceipt{}, invalid("evaluation capability execution outcome is invalid")
	}
	expectedTools, err := evaluationCanonicalIdentityList(value["expectedToolIds"], false, "expected tool ids")
	if err != nil {
		return evaluationCapabilityExecutionReceipt{}, err
	}
	expectedKinds, err := evaluationCanonicalIdentityList(value["expectedReceiptKinds"], true, "expected receipt kinds")
	if err != nil {
		return evaluationCapabilityExecutionReceipt{}, err
	}
	descriptorDigest, err := canonicaljson.Digest(map[string]any{
		"capabilityId": identities["capabilityId"], "support": support,
		"toolIds": value["expectedToolIds"], "expectedReceiptKinds": value["expectedReceiptKinds"],
	})
	if err != nil || descriptorDigest != digests["capabilityDescriptorDigest"] {
		return evaluationCapabilityExecutionReceipt{}, invalid("evaluation capability descriptor digest drifted")
	}
	toolBindings, err := evaluationCapabilityToolBindings(value["toolBindings"])
	if err != nil {
		return evaluationCapabilityExecutionReceipt{}, err
	}
	specificReceipts, err := evaluationCapabilitySpecificReceipts(value["specificReceiptDigests"])
	if err != nil {
		return evaluationCapabilityExecutionReceipt{}, err
	}
	ownerReceiptDigests, err := evaluationCanonicalDigestArray(
		value["attemptAuthorityOwnerReceiptDigests"], 128,
	)
	if err != nil {
		return evaluationCapabilityExecutionReceipt{}, err
	}
	toolIDs := make([]string, len(toolBindings))
	for index := range toolBindings {
		toolIDs[index] = stringMember(toolBindings[index], "toolId")
	}
	receiptKinds := make([]string, len(specificReceipts))
	for index := range specificReceipts {
		receiptKinds[index] = stringMember(specificReceipts[index], "receiptKind")
	}
	wantVerdict := "failed"
	if (support == "required" && outcome == "supported") || (support == "expected-blocked" && outcome == "unsupported") {
		wantVerdict = "passed"
	}
	if !evaluationStringSubset(expectedTools, toolIDs) || !evaluationStringSubset(expectedKinds, receiptKinds) ||
		((outcome == "supported" || outcome == "unsupported" || len(specificReceipts) > 0) && len(ownerReceiptDigests) == 0) ||
		(outcome == "unsupported" && len(toolBindings) != 0) ||
		(outcome == "supported" && (!evaluationExactStringSequence(expectedTools, toolIDs) || !evaluationExactStringSequence(expectedKinds, receiptKinds))) ||
		(verdict == "passed" && !evaluationExactStringSequence(expectedKinds, receiptKinds)) || verdict != wantVerdict {
		return evaluationCapabilityExecutionReceipt{}, invalid("evaluation capability execution semantics drifted")
	}
	observedAt, err := evaluationInstant(value["observedAt"], "evaluation capability observation")
	if err != nil {
		return evaluationCapabilityExecutionReceipt{}, err
	}
	receiptDigest, err := verifyEvaluationAuthenticityDigest(value, "receiptDigest")
	if err != nil {
		return evaluationCapabilityExecutionReceipt{}, err
	}
	return evaluationCapabilityExecutionReceipt{
		EvaluationCapabilityExecutionReceiptRecord: EvaluationCapabilityExecutionReceiptRecord{
			PlanDigest: digests["planDigest"], RepositoryCommit: stringMember(value, "repositoryCommit"),
			CapabilityExecutionReceiptID: identities["capabilityExecutionReceiptId"], AttemptID: identities["attemptId"],
			DescriptorDigest: digests["descriptorDigest"], TurnIndex: turnIndex, InvocationID: identities["invocationId"],
			CaseID: identities["caseId"], CaseDigest: digests["caseDigest"], TargetID: identities["targetId"],
			TargetDigest: digests["targetDigest"], CapabilityProfileID: identities["capabilityProfileId"],
			CapabilityID: identities["capabilityId"], SupportExpectation: support,
			CapabilityDescriptorDigest: digests["capabilityDescriptorDigest"], Outcome: outcome, Verdict: verdict,
			PolicyDigest: digests["policyDigest"], ToolRegistryDigest: digests["toolRegistryDigest"],
			ObservedAt: observedAt, ReceiptDigest: receiptDigest, ReceiptBytes: canonical,
		},
		ExpectedToolIDs: expectedTools, ExpectedReceiptKinds: expectedKinds,
		ToolBindings: toolBindings, SpecificReceipts: specificReceipts,
		AttemptAuthorityOwnerReceiptDigests: ownerReceiptDigests, Value: value,
	}, nil
}

func insertEvaluationCapabilityExecutionReceipt(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	receipt evaluationCapabilityExecutionReceipt,
) error {
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_capability_execution_receipts (
		namespace_id, plan_digest, repository_commit, capability_execution_receipt_id, attempt_id,
		descriptor_digest, turn_index, invocation_id, case_id, case_digest, target_id, target_digest,
		capability_profile_id, capability_id, support_expectation, capability_descriptor_digest,
		outcome, verdict, policy_digest, tool_registry_digest, receipt_digest, receipt_json, receipt_bytes, observed_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23,$24)
	ON CONFLICT DO NOTHING`, namespaceID, partition.PlanDigest, partition.RepositoryCommit,
		receipt.CapabilityExecutionReceiptID, receipt.AttemptID, receipt.DescriptorDigest, receipt.TurnIndex,
		receipt.InvocationID, receipt.CaseID, receipt.CaseDigest, receipt.TargetID, receipt.TargetDigest,
		receipt.CapabilityProfileID, receipt.CapabilityID, receipt.SupportExpectation,
		receipt.CapabilityDescriptorDigest, receipt.Outcome, receipt.Verdict, receipt.PolicyDigest,
		receipt.ToolRegistryDigest, receipt.ReceiptDigest, string(receipt.ReceiptBytes), receipt.ReceiptBytes, receipt.ObservedAt)
	if err != nil {
		return err
	}
	inserted, err := result.RowsAffected()
	if err != nil || inserted == 1 {
		return err
	}
	var existing []byte
	if err := tx.QueryRowContext(ctx, `SELECT receipt_bytes FROM agent_evaluation_capability_execution_receipts
		WHERE namespace_id=$1 AND plan_digest=$2 AND capability_execution_receipt_id=$3 FOR SHARE`,
		namespaceID, partition.PlanDigest, receipt.CapabilityExecutionReceiptID).Scan(&existing); err != nil {
		return err
	}
	if !bytes.Equal(existing, receipt.ReceiptBytes) {
		return conflict("evaluation capability execution receipt identity was reused")
	}
	return nil
}

func scanEvaluationCapabilityExecutionReceipt(
	scanner interface{ Scan(...any) error },
	namespaceID string,
	partition EvaluationPlanPartition,
) (EvaluationCapabilityExecutionReceiptRecord, error) {
	var record EvaluationCapabilityExecutionReceiptRecord
	var source []byte
	if err := scanner.Scan(&record.CapabilityExecutionReceiptID, &record.AttemptID, &record.DescriptorDigest,
		&record.TurnIndex, &record.InvocationID, &record.CaseID, &record.CaseDigest, &record.TargetID,
		&record.TargetDigest, &record.CapabilityProfileID, &record.CapabilityID, &record.SupportExpectation,
		&record.CapabilityDescriptorDigest, &record.Outcome, &record.Verdict, &record.PolicyDigest,
		&record.ToolRegistryDigest, &record.ObservedAt, &record.ReceiptDigest, &source); err != nil {
		return record, err
	}
	decoded, err := decodeEvaluationCapabilityExecutionReceipt(source)
	if err != nil {
		return record, fmt.Errorf("decode persisted evaluation capability execution receipt: %w", err)
	}
	actual := decoded.EvaluationCapabilityExecutionReceiptRecord
	if actual.PlanDigest != partition.PlanDigest || actual.RepositoryCommit != partition.RepositoryCommit ||
		record.CapabilityExecutionReceiptID != actual.CapabilityExecutionReceiptID || record.AttemptID != actual.AttemptID ||
		record.DescriptorDigest != actual.DescriptorDigest || record.TurnIndex != actual.TurnIndex ||
		record.InvocationID != actual.InvocationID || record.CaseID != actual.CaseID || record.CaseDigest != actual.CaseDigest ||
		record.TargetID != actual.TargetID || record.TargetDigest != actual.TargetDigest ||
		record.CapabilityProfileID != actual.CapabilityProfileID || record.CapabilityID != actual.CapabilityID ||
		record.SupportExpectation != actual.SupportExpectation || record.CapabilityDescriptorDigest != actual.CapabilityDescriptorDigest ||
		record.Outcome != actual.Outcome || record.Verdict != actual.Verdict || record.PolicyDigest != actual.PolicyDigest ||
		record.ToolRegistryDigest != actual.ToolRegistryDigest || !record.ObservedAt.Equal(actual.ObservedAt) ||
		record.ReceiptDigest != actual.ReceiptDigest || !bytes.Equal(source, actual.ReceiptBytes) {
		return record, conflict("persisted evaluation capability execution metadata drifted")
	}
	actual.NamespaceID = namespaceID
	return actual, nil
}

func queryEvaluationCapabilityExecutionReceipts(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	attemptID string,
) ([]EvaluationCapabilityExecutionReceiptRecord, error) {
	query := `SELECT capability_execution_receipt_id, attempt_id, descriptor_digest, turn_index, invocation_id,
		case_id, case_digest, target_id, target_digest, capability_profile_id, capability_id,
		support_expectation, capability_descriptor_digest, outcome, verdict, policy_digest,
		tool_registry_digest, observed_at, receipt_digest, receipt_bytes
	FROM agent_evaluation_capability_execution_receipts
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3`
	args := []any{namespaceID, partition.PlanDigest, partition.RepositoryCommit}
	if attemptID != "" {
		query += ` AND attempt_id=$4`
		args = append(args, attemptID)
	}
	query += ` ORDER BY attempt_id COLLATE "C", turn_index, capability_execution_receipt_id COLLATE "C"`
	rows, err := queryer.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationCapabilityExecutionReceiptRecord, 0)
	for rows.Next() {
		record, err := scanEvaluationCapabilityExecutionReceipt(rows, namespaceID, partition)
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

func (repository *Repository) StoreEvaluationCapabilityExecutionReceipt(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	receiptBytes []byte,
) (EvaluationCapabilityExecutionReceiptRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationCapabilityExecutionReceiptRecord{}, false, err
	}
	receipt, err := decodeEvaluationCapabilityExecutionReceipt(receiptBytes)
	if err != nil || receipt.PlanDigest != partition.PlanDigest || receipt.RepositoryCommit != partition.RepositoryCommit {
		return EvaluationCapabilityExecutionReceiptRecord{}, false, ErrInvalid
	}
	writeContext, cancel, tx, _, plan, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationCapabilityExecutionReceiptRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if receipt.ObservedAt.Before(plan.PlannedAt) || receipt.ObservedAt.After(plan.ExpiresAt) {
		return EvaluationCapabilityExecutionReceiptRecord{}, false, conflict("evaluation capability observation is outside the frozen plan")
	}
	var existing []byte
	err = tx.QueryRowContext(writeContext, `SELECT receipt_bytes FROM agent_evaluation_capability_execution_receipts
		WHERE namespace_id=$1 AND plan_digest=$2 AND capability_execution_receipt_id=$3 FOR SHARE`,
		authority.NamespaceID, partition.PlanDigest, receipt.CapabilityExecutionReceiptID).Scan(&existing)
	replayed := err == nil
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return EvaluationCapabilityExecutionReceiptRecord{}, false, err
	}
	if replayed && !bytes.Equal(existing, receipt.ReceiptBytes) {
		return EvaluationCapabilityExecutionReceiptRecord{}, false, conflict("evaluation capability execution replay drifted")
	}
	if !replayed {
		if err := insertEvaluationCapabilityExecutionReceipt(writeContext, tx, authority.NamespaceID, partition, receipt); err != nil {
			return EvaluationCapabilityExecutionReceiptRecord{}, false, err
		}
	}
	if err := tx.Commit(); err != nil {
		return EvaluationCapabilityExecutionReceiptRecord{}, false, err
	}
	record := receipt.EvaluationCapabilityExecutionReceiptRecord
	record.NamespaceID = authority.NamespaceID
	return record, replayed, nil
}

func (repository *Repository) ListEvaluationCapabilityExecutionReceipts(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationCapabilityExecutionReceiptRecord, error) {
	readContext, cancel, tx, _, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return nil, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	records, err := queryEvaluationCapabilityExecutionReceipts(readContext, tx, authority.NamespaceID, partition, "")
	if err != nil {
		return nil, err
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return nil, err
	}
	return records, nil
}

func (repository *Repository) GetEvaluationCapabilityExecutionReceipt(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	receiptID string,
) (EvaluationCapabilityExecutionReceiptRecord, error) {
	if _, err := evaluationAuthenticityIdentity(receiptID, "capability execution receipt id"); err != nil {
		return EvaluationCapabilityExecutionReceiptRecord{}, ErrInvalid
	}
	records, err := repository.ListEvaluationCapabilityExecutionReceipts(ctx, authority, partition)
	if err != nil {
		return EvaluationCapabilityExecutionReceiptRecord{}, err
	}
	for _, record := range records {
		if record.CapabilityExecutionReceiptID == receiptID {
			return record, nil
		}
	}
	return EvaluationCapabilityExecutionReceiptRecord{}, ErrNotFound
}

func evaluationCapabilityExecutionSetDigest(records []EvaluationCapabilityExecutionReceiptRecord) (string, error) {
	ordered := append([]EvaluationCapabilityExecutionReceiptRecord(nil), records...)
	sort.Slice(ordered, func(left, right int) bool {
		if ordered[left].AttemptID != ordered[right].AttemptID {
			return ordered[left].AttemptID < ordered[right].AttemptID
		}
		if ordered[left].TurnIndex != ordered[right].TurnIndex {
			return ordered[left].TurnIndex < ordered[right].TurnIndex
		}
		return ordered[left].CapabilityExecutionReceiptID < ordered[right].CapabilityExecutionReceiptID
	})
	digests := make([]string, len(ordered))
	for index := range ordered {
		digests[index] = ordered[index].ReceiptDigest
	}
	return canonicaljson.Digest(digests)
}

func validateEvaluationAttemptCapabilityExecutionBinding(
	plan evaluationPlanFact,
	decoded decodedEvaluationAttemptEvidenceCommitV3,
) error {
	if len(decoded.capabilities) != 1 {
		return conflict("evaluation attempt capability execution cardinality drifted")
	}
	receipt := decoded.capabilities[0]
	attempt := decoded.attempt
	if receipt.PlanDigest != plan.PlanDigest || receipt.RepositoryCommit != plan.RepositoryCommit ||
		receipt.AttemptID != attempt.AttemptID || receipt.DescriptorDigest != attempt.DescriptorDigest ||
		receipt.CaseID != attempt.CaseID || receipt.TargetID != attempt.TargetID ||
		receipt.PolicyDigest != stringMember(plan.Value, "policyDigest") ||
		receipt.ToolRegistryDigest != stringMember(plan.Value, "toolRegistryDigest") ||
		receipt.ObservedAt.Before(attempt.StartedAt) || receipt.ObservedAt.After(attempt.CompletedAt) ||
		(attempt.Outcome == "passed" && receipt.Verdict != "passed") ||
		(receipt.Verdict == "failed" && attempt.Outcome == "passed") {
		return conflict("evaluation capability execution drifted from its plan or attempt")
	}
	descriptor, ok := objectMember(attempt.Value, "descriptor")
	if !ok || stringMember(descriptor, "capabilityDescriptorDigest") != receipt.CapabilityDescriptorDigest ||
		stringMember(descriptor, "targetDigest") != receipt.TargetDigest {
		return conflict("evaluation capability execution drifted from its descriptor")
	}
	var concreteCase map[string]any
	for _, raw := range plan.Value["concreteCases"].([]any) {
		candidate, candidateOK := raw.(map[string]any)
		if candidateOK && stringMember(candidate, "caseId") == receipt.CaseID {
			concreteCase = candidate
			break
		}
	}
	var target map[string]any
	for _, raw := range plan.Value["capabilityQualificationTargets"].([]any) {
		candidate, candidateOK := raw.(map[string]any)
		if candidateOK && stringMember(candidate, "targetId") == receipt.TargetID {
			target = candidate
			break
		}
	}
	resolvedCapabilityDescriptorDigest, resolveErr := evaluationResolvedCapabilityDescriptorDigest(concreteCase, target)
	if concreteCase == nil || target == nil ||
		resolveErr != nil ||
		stringMember(concreteCase, "caseDigest") != receipt.CaseDigest ||
		stringMember(concreteCase, "capabilityProfileId") != receipt.CapabilityProfileID ||
		stringMember(target, "capabilityProfileId") != receipt.CapabilityProfileID ||
		resolvedCapabilityDescriptorDigest != receipt.CapabilityDescriptorDigest ||
		stringMember(target, "targetDigest") != receipt.TargetDigest {
		return conflict("evaluation capability execution drifted from its frozen case or target")
	}
	var turn *evaluationInvocationTurnReceipt
	for index := range decoded.turns {
		candidate := &decoded.turns[index]
		if candidate.TurnIndex == receipt.TurnIndex && candidate.InvocationID == receipt.InvocationID {
			turn = candidate
			break
		}
	}
	if turn == nil {
		return conflict("evaluation capability execution lacks its exact invocation turn")
	}
	// Full capability-specific facts and their Backend owner receipts are joined
	// by validateEvaluationAttemptAuthorityCommitShape. This plan-level helper
	// intentionally avoids treating arbitrary runtime digests as substitutes for
	// the canonical capability authority families.
	return nil
}

func validateEvaluationCapabilityExecutionSnapshot(
	plan evaluationPlanFact,
	attemptRecords []EvaluationAttemptRecord,
	turnRecords []EvaluationInvocationTurnReceiptRecord,
	executionRecords []EvaluationExecutionReceiptRecord,
	runtimeRecords []EvaluationControlledRuntimeReceiptRecord,
	capabilityRecords []EvaluationCapabilityExecutionReceiptRecord,
	requireComplete bool,
) error {
	turnsByAttempt := make(map[string][]evaluationInvocationTurnReceipt)
	for _, record := range turnRecords {
		turn, err := decodeEvaluationInvocationTurnReceipt(record.ReceiptBytes)
		if err != nil {
			return err
		}
		turnsByAttempt[turn.AttemptID] = append(turnsByAttempt[turn.AttemptID], turn)
	}
	executionsByAttempt := make(map[string]evaluationExecutionReceipt, len(executionRecords))
	for _, record := range executionRecords {
		execution, err := decodeEvaluationExecutionReceipt(record.ReceiptBytes)
		if err != nil {
			return err
		}
		if _, duplicate := executionsByAttempt[execution.AttemptID]; duplicate {
			return conflict("evaluation capability snapshot contains duplicate execution authority")
		}
		executionsByAttempt[execution.AttemptID] = execution
	}
	runtimesByAttempt := make(map[string]evaluationControlledRuntimeReceipt, len(runtimeRecords))
	for _, record := range runtimeRecords {
		runtime, err := decodeEvaluationControlledRuntimeReceipt(record.ReceiptBytes)
		if err != nil {
			return err
		}
		if _, duplicate := runtimesByAttempt[runtime.AttemptID]; duplicate {
			return conflict("evaluation capability snapshot contains duplicate runtime authority")
		}
		runtimesByAttempt[runtime.AttemptID] = runtime
	}
	capabilitiesByAttempt := make(map[string][]evaluationCapabilityExecutionReceipt)
	for _, record := range capabilityRecords {
		receipt, err := decodeEvaluationCapabilityExecutionReceipt(record.ReceiptBytes)
		if err != nil {
			return err
		}
		capabilitiesByAttempt[receipt.AttemptID] = append(capabilitiesByAttempt[receipt.AttemptID], receipt)
	}
	if requireComplete && len(capabilityRecords) != len(attemptRecords) {
		return conflict("evaluation capability snapshot coverage drifted from the attempt denominator")
	}
	seenAttempts := make(map[string]struct{}, len(attemptRecords))
	for _, record := range attemptRecords {
		attempt, err := decodeEvaluationAttempt(record.FactBytes)
		if err != nil {
			return err
		}
		if _, duplicate := seenAttempts[attempt.AttemptID]; duplicate {
			return conflict("evaluation capability snapshot contains duplicate attempts")
		}
		seenAttempts[attempt.AttemptID] = struct{}{}
		capabilities := capabilitiesByAttempt[attempt.AttemptID]
		execution, hasExecution := executionsByAttempt[attempt.AttemptID]
		if len(capabilities) == 0 && !requireComplete {
			continue
		}
		if len(capabilities) != 1 || !hasExecution {
			return conflict("evaluation capability snapshot lacks exact attempt execution authority")
		}
		turns := turnsByAttempt[attempt.AttemptID]
		sort.Slice(turns, func(left, right int) bool { return turns[left].TurnIndex < turns[right].TurnIndex })
		decoded := decodedEvaluationAttemptEvidenceCommitV3{
			turns: turns, capabilities: capabilities, execution: execution, attempt: attempt,
		}
		if runtime, exists := runtimesByAttempt[attempt.AttemptID]; exists {
			decoded.runtime, decoded.hasRuntime = runtime, true
		}
		if err := validateEvaluationAttemptCapabilityExecutionBinding(plan, decoded); err != nil {
			return err
		}
		setRecords := []EvaluationCapabilityExecutionReceiptRecord{
			capabilities[0].EvaluationCapabilityExecutionReceiptRecord,
		}
		setDigest, err := evaluationCapabilityExecutionSetDigest(setRecords)
		if err != nil || setDigest != attempt.CapabilityExecutionReceiptSetDigest ||
			setDigest != execution.CapabilityExecutionReceiptSetDigest {
			return conflict("evaluation capability snapshot receipt-set authority drifted")
		}
	}
	for attemptID := range capabilitiesByAttempt {
		if _, exists := seenAttempts[attemptID]; !exists {
			return conflict("evaluation capability snapshot contains orphan authority")
		}
	}
	return nil
}
