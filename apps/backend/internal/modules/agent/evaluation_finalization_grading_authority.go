package agent

import (
	"context"
	"database/sql"
	"errors"
	"sort"
)

// validateEvaluationFinalizationAttemptGradingAuthority independently rebuilds
// the grading-owner preimage from the immutable attempt denominator. The
// owner projection is evidence only after its sealed journal, atomic attempt
// commit link, turn/runtime/grant leaves, and canonical observation set all
// agree with the current plan partition.
func validateEvaluationFinalizationAttemptGradingAuthority(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	snapshot *evaluationFinalizationSnapshot,
	evidence evaluationAuthenticityEvidenceV3,
) (bool, error) {
	owners, err := queryEvaluationAttemptAuthorityOwnerReceipts(
		ctx, tx, namespaceID, partition, "", false,
	)
	if err != nil {
		return false, err
	}
	attemptByID := make(map[string]evaluationAttemptFact, len(snapshot.Decoded))
	for _, attempt := range snapshot.Decoded {
		attemptByID[attempt.AttemptID] = attempt
	}
	seenRequests := make(map[string]struct{}, len(owners))
	seenReceipts := make(map[string]struct{}, len(owners))
	gradingByAttempt := make(map[string][]EvaluationAttemptAuthorityOwnerReceiptRecord)
	for _, owner := range owners {
		if _, duplicate := seenRequests[owner.RequestDigest]; duplicate {
			return false, conflict("evaluation attempt-authority request digest is duplicated")
		}
		if _, duplicate := seenReceipts[owner.ReceiptDigest]; duplicate {
			return false, conflict("evaluation attempt-authority receipt digest is duplicated")
		}
		seenRequests[owner.RequestDigest], seenReceipts[owner.ReceiptDigest] = struct{}{}, struct{}{}
		if _, exists := attemptByID[owner.AttemptID]; !exists {
			return false, conflict("evaluation attempt-authority receipt is orphaned from its immutable attempt")
		}
		if err := validateEvaluationAttemptAuthorityOwnerJournal(
			ctx, tx, namespaceID, partition, owner,
		); err != nil {
			return false, err
		}
		if owner.ServiceKind == "attempt-grading" {
			gradingByAttempt[owner.AttemptID] = append(gradingByAttempt[owner.AttemptID], owner)
		}
	}

	preDispatch := make(map[string]struct{}, len(evidence.PreDispatchFailures))
	for _, receipt := range evidence.PreDispatchFailures {
		preDispatch[receipt.AttemptID] = struct{}{}
	}
	turnSets := evaluationFinalizationTurnSetsByAttempt(evidence.InvocationTurnSets)
	terminalTurns, err := evaluationFinalizationTerminalTurnsByAttempt(evidence.InvocationTurns)
	if err != nil {
		return false, err
	}
	capabilities := evaluationFinalizationCapabilitiesByAttempt(evidence.CapabilityExecutions)
	executions := evaluationFinalizationExecutionsByAttempt(evidence.Executions)
	submissions := evaluationFinalizationSubmissionsByAttempt(evidence.ResultSubmissions)
	runtimes := evaluationFinalizationRuntimesByAttempt(evidence.ControlledRuntimes)
	grants := evaluationFinalizationGrantsByAttempt(evidence.VerificationAttemptGrants)

	complete := true
	for _, attempt := range snapshot.Decoded {
		gradingOwners := gradingByAttempt[attempt.AttemptID]
		_, failedBeforeDispatch := preDispatch[attempt.AttemptID]
		if failedBeforeDispatch {
			if len(gradingOwners) != 0 {
				return false, conflict("evaluation pre-dispatch attempt carries grading-owner authority")
			}
			continue
		}
		if len(gradingOwners) == 0 {
			complete = false
			continue
		}
		if len(gradingOwners) != 1 {
			return false, conflict("evaluation attempt has ambiguous grading-owner authority")
		}
		if err := validateEvaluationFinalizationAttemptGradingJoin(
			ctx, tx, namespaceID, partition, snapshot.Plan, attempt, gradingOwners[0],
			turnSets[attempt.AttemptID], terminalTurns[attempt.AttemptID],
			capabilities[attempt.AttemptID], executions[attempt.AttemptID],
			submissions[attempt.AttemptID], runtimes[attempt.AttemptID], grants[attempt.AttemptID],
		); err != nil {
			return false, err
		}
	}
	return complete, nil
}

func validateEvaluationFinalizationAttemptGradingJoin(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	plan evaluationPlanFact,
	attempt evaluationAttemptFact,
	owner EvaluationAttemptAuthorityOwnerReceiptRecord,
	turnSets []EvaluationInvocationTurnSetReceiptRecord,
	terminalTurns []evaluationInvocationTurnReceipt,
	capabilities []EvaluationCapabilityExecutionReceiptRecord,
	executions []EvaluationExecutionReceiptRecord,
	submissions []EvaluationResultSubmissionReceiptRecord,
	runtimes []EvaluationControlledRuntimeReceiptRecord,
	grants []EvaluationVerificationAttemptGrantReceiptRecord,
) error {
	if owner.NamespaceID != namespaceID || owner.PlanDigest != partition.PlanDigest ||
		owner.RepositoryCommit != partition.RepositoryCommit || owner.ServiceKind != "attempt-grading" ||
		owner.Operation != "grade-and-persist" || owner.AttemptID != attempt.AttemptID ||
		owner.DescriptorDigest != attempt.DescriptorDigest || len(turnSets) != 1 ||
		len(terminalTurns) != 1 || len(capabilities) != 1 || len(executions) != 1 ||
		len(submissions) > 1 || len(runtimes) > 1 {
		return conflict("evaluation grading-owner denominator is ambiguous")
	}
	turnSet, terminal, capability, execution := turnSets[0], terminalTurns[0], capabilities[0], executions[0]
	if turnSet.ReceiptDigest != attempt.InvocationTurnSetReceiptDigest ||
		turnSet.DescriptorDigest != attempt.DescriptorDigest || terminal.DescriptorDigest != attempt.DescriptorDigest ||
		capability.DescriptorDigest != attempt.DescriptorDigest || execution.DescriptorDigest != attempt.DescriptorDigest ||
		capability.ReceiptDigest == "" || execution.CapabilityExecutionReceiptSetDigest != attempt.CapabilityExecutionReceiptSetDigest ||
		execution.VerificationAttemptGrantReceiptSetDigest != attempt.VerificationAttemptGrantReceiptSetDigest {
		return conflict("evaluation grading-owner turn or execution authority drifted")
	}
	capabilitySetDigest, err := evaluationCapabilityExecutionSetDigest(capabilities)
	if err != nil || capabilitySetDigest != attempt.CapabilityExecutionReceiptSetDigest ||
		capabilitySetDigest != execution.CapabilityExecutionReceiptSetDigest {
		return conflict("evaluation grading-owner capability set authority drifted")
	}
	grantSetDigest, err := evaluationVerificationAttemptGrantReceiptSetDigest(grants)
	if err != nil || grantSetDigest != attempt.VerificationAttemptGrantReceiptSetDigest ||
		grantSetDigest != execution.VerificationAttemptGrantReceiptSetDigest ||
		grantSetDigest != owner.VerificationAttemptGrantReceiptSetDigest {
		return conflict("evaluation grading-owner Verification AttemptGrant set authority drifted")
	}
	generationBound := false
	for _, grant := range grants {
		if grant.NamespaceID != namespaceID || grant.EvaluationPlanDigest != partition.PlanDigest ||
			grant.RepositoryCommit != partition.RepositoryCommit || grant.AttemptID != attempt.AttemptID ||
			grant.DescriptorDigest != attempt.DescriptorDigest {
			return conflict("evaluation grading-owner Verification AttemptGrant leaf drifted")
		}
		generationBound = generationBound || grant.Generation == owner.VerificationGrantGeneration
	}
	if !generationBound || owner.CompletedAt.After(attempt.CompletedAt) ||
		(terminal.Invocation != nil && owner.CompletedAt.Before(terminal.Invocation.CompletedAt)) {
		return conflict("evaluation grading-owner grant or timeline authority drifted")
	}

	resultDigest, runtimeDigest := "", ""
	var resultValue, runtimeValue map[string]any
	if len(submissions) == 1 {
		decoded, decodeErr := decodeEvaluationResultSubmissionReceipt(submissions[0].ReceiptBytes)
		if decodeErr != nil {
			return decodeErr
		}
		resultDigest, resultValue = decoded.ReceiptDigest, decoded.Value
	}
	if len(runtimes) == 1 {
		decoded, decodeErr := decodeEvaluationControlledRuntimeReceipt(runtimes[0].ReceiptBytes)
		if decodeErr != nil {
			return decodeErr
		}
		runtimeDigest, runtimeValue = decoded.ReceiptDigest, decoded.Value
	}
	if terminal.ResultSubmissionReceiptDigest != resultDigest ||
		terminal.ControlledRuntimeReceiptDigest != runtimeDigest {
		return conflict("evaluation grading-owner terminal runtime authority drifted")
	}
	capabilityValue, err := decodeEvaluationCapabilityExecutionReceipt(capability.ReceiptBytes)
	if err != nil {
		return err
	}
	turnSetValue, err := decodeEvaluationInvocationTurnSetReceipt(turnSet.ReceiptBytes)
	if err != nil {
		return err
	}
	executionValue, err := decodeEvaluationExecutionReceipt(execution.ReceiptBytes)
	if err != nil {
		return err
	}
	descriptor, ok := objectMember(attempt.Value, "descriptor")
	if !ok {
		return ErrInvalid
	}
	payload := map[string]any{
		"plan":                       plan.Value,
		"status":                     attempt.Status,
		"descriptor":                 descriptor,
		"invocationTurnSetReceipt":   turnSetValue.Value,
		"terminalTurnReceipt":        terminal.Value,
		"capabilityExecutionReceipt": capabilityValue.Value,
		"execution":                  evaluationFinalizationExecutionMeasurements(executionValue.EvaluationExecutionReceiptRecord),
	}
	if resultValue != nil {
		payload["resultSubmissionReceipt"] = resultValue
	}
	if runtimeValue != nil {
		payload["controlledRuntimeReceipt"] = runtimeValue
	}
	response := map[string]any{
		"metricObservations": attempt.Value["metricObservations"],
		"gradingDigest":      stringMember(owner.ResponseProjection, "gradingDigest"),
	}
	if err := validateEvaluationAttemptAuthorityGrading(payload, response); err != nil {
		return err
	}
	observationDigests, err := evaluationFinalizationObservationDigests(attempt)
	if err != nil || !sameEvaluationCanonicalValue(owner.ResponseProjection, map[string]any{
		"serviceKind": "attempt-grading", "operation": "grade-and-persist",
		"gradingDigest":      stringMember(owner.ResponseProjection, "gradingDigest"),
		"observationDigests": observationDigests,
	}) {
		return conflict("evaluation grading-owner response projection drifted from the immutable attempt")
	}
	var linkedAttemptID, linkedAttemptDigest string
	var linkedAt sql.NullTime
	err = tx.QueryRowContext(ctx, `SELECT attempt_id,attempt_digest,committed_at
		FROM agent_evaluation_attempt_authority_commit_links
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND receipt_digest=$4
		FOR SHARE`, namespaceID, partition.PlanDigest, partition.RepositoryCommit, owner.ReceiptDigest).Scan(
		&linkedAttemptID, &linkedAttemptDigest, &linkedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return conflict("evaluation grading-owner receipt is not atomically linked to its immutable attempt")
	}
	if err != nil {
		return err
	}
	if !linkedAt.Valid || linkedAttemptID != attempt.AttemptID || linkedAttemptDigest != attempt.AttemptDigest ||
		linkedAt.Time.Before(owner.CompletedAt) || linkedAt.Time.After(attempt.CompletedAt) {
		return conflict("evaluation grading-owner atomic attempt link drifted")
	}
	return nil
}

func evaluationFinalizationObservationDigests(attempt evaluationAttemptFact) ([]string, error) {
	raw, ok := attempt.Value["metricObservations"].([]any)
	if !ok || len(raw) == 0 || len(raw) > maximumEvaluationAttemptAuthorityReceipts {
		return nil, ErrInvalid
	}
	digests := make([]string, len(raw))
	seen := make(map[string]struct{}, len(raw))
	for index, entry := range raw {
		observation, ok := entry.(map[string]any)
		digest := stringMember(observation, "observationDigest")
		if !ok || !evaluationDigestPattern.MatchString(digest) {
			return nil, ErrInvalid
		}
		if _, duplicate := seen[digest]; duplicate {
			return nil, conflict("evaluation attempt observation digest is duplicated")
		}
		seen[digest], digests[index] = struct{}{}, digest
	}
	sort.Strings(digests)
	return digests, nil
}

func evaluationFinalizationExecutionMeasurements(record EvaluationExecutionReceiptRecord) map[string]any {
	value := map[string]any{
		"modelInvocations": record.ModelInvocations, "toolCalls": record.ToolCalls,
		"repairRounds": record.RepairRounds, "transactions": record.Transactions,
		"artifactBytes":                            record.ArtifactBytes,
		"capabilityExecutionReceiptSetDigest":      record.CapabilityExecutionReceiptSetDigest,
		"verificationAttemptGrantReceiptSetDigest": record.VerificationAttemptGrantReceiptSetDigest,
	}
	if record.ToolReceiptSetDigest != "" {
		value["toolReceiptSetDigest"] = record.ToolReceiptSetDigest
	}
	if record.TransactionReceiptSetDigest != "" {
		value["transactionReceiptSetDigest"] = record.TransactionReceiptSetDigest
	}
	if record.VerificationClosureDigest != "" {
		value["verificationClosureDigest"] = record.VerificationClosureDigest
	}
	return value
}

func evaluationFinalizationTurnSetsByAttempt(values []EvaluationInvocationTurnSetReceiptRecord) map[string][]EvaluationInvocationTurnSetReceiptRecord {
	result := make(map[string][]EvaluationInvocationTurnSetReceiptRecord)
	for _, value := range values {
		result[value.AttemptID] = append(result[value.AttemptID], value)
	}
	return result
}

func evaluationFinalizationTerminalTurnsByAttempt(values []EvaluationInvocationTurnReceiptRecord) (map[string][]evaluationInvocationTurnReceipt, error) {
	result := make(map[string][]evaluationInvocationTurnReceipt)
	for _, value := range values {
		if !value.Terminal {
			continue
		}
		decoded, err := decodeEvaluationInvocationTurnReceipt(value.ReceiptBytes)
		if err != nil {
			return nil, err
		}
		result[value.AttemptID] = append(result[value.AttemptID], decoded)
	}
	return result, nil
}

func evaluationFinalizationCapabilitiesByAttempt(values []EvaluationCapabilityExecutionReceiptRecord) map[string][]EvaluationCapabilityExecutionReceiptRecord {
	result := make(map[string][]EvaluationCapabilityExecutionReceiptRecord)
	for _, value := range values {
		result[value.AttemptID] = append(result[value.AttemptID], value)
	}
	return result
}

func evaluationFinalizationExecutionsByAttempt(values []EvaluationExecutionReceiptRecord) map[string][]EvaluationExecutionReceiptRecord {
	result := make(map[string][]EvaluationExecutionReceiptRecord)
	for _, value := range values {
		result[value.AttemptID] = append(result[value.AttemptID], value)
	}
	return result
}

func evaluationFinalizationSubmissionsByAttempt(values []EvaluationResultSubmissionReceiptRecord) map[string][]EvaluationResultSubmissionReceiptRecord {
	result := make(map[string][]EvaluationResultSubmissionReceiptRecord)
	for _, value := range values {
		result[value.AttemptID] = append(result[value.AttemptID], value)
	}
	return result
}

func evaluationFinalizationRuntimesByAttempt(values []EvaluationControlledRuntimeReceiptRecord) map[string][]EvaluationControlledRuntimeReceiptRecord {
	result := make(map[string][]EvaluationControlledRuntimeReceiptRecord)
	for _, value := range values {
		result[value.AttemptID] = append(result[value.AttemptID], value)
	}
	return result
}

func evaluationFinalizationGrantsByAttempt(values []EvaluationVerificationAttemptGrantReceiptRecord) map[string][]EvaluationVerificationAttemptGrantReceiptRecord {
	result := make(map[string][]EvaluationVerificationAttemptGrantReceiptRecord)
	for _, value := range values {
		result[value.AttemptID] = append(result[value.AttemptID], value)
	}
	return result
}
