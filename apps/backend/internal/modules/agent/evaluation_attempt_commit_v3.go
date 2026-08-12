package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
)

const (
	maximumEvaluationAttemptCommitV3Receipts          = 256
	maximumEvaluationAttemptAuthorityOwnersPerAttempt = 6
)

type EvaluationAttemptEvidenceCommitV3 struct {
	PreDispatchFailureReceipts             [][]byte
	TransportDispatchIntents               [][]byte
	TransportReceipts                      [][]byte
	ProviderResultSpoolReceipts            [][]byte
	ProviderResultSpoolDispositionReceipts [][]byte
	InvocationTurnReceipts                 [][]byte
	InvocationTurnSetReceipt               []byte
	CapabilityExecutionReceipts            [][]byte
	CapabilitySpecificReceipts             [][]byte
	ProviderCapabilityObservationReceipts  [][]byte
	AttemptAuthorityOwnerReceipts          [][]byte
	VerificationAttemptGrantReceipts       [][]byte
	SourceReceipts                         [][]byte
	ResultSubmissionReceipt                []byte
	ControlledRuntimeReceipt               []byte
	ExecutionReceipt                       []byte
	AttemptFact                            []byte
	BudgetSettlement                       EvaluationAttemptBudgetSettlement
}

type EvaluationAttemptEvidenceCommitResultV3 struct {
	PreDispatchFailureReceipts             []EvaluationPreDispatchFailureReceiptRecord
	TransportDispatchIntents               []EvaluationTransportDispatchIntentRecord
	TransportReceipts                      []EvaluationTransportReceiptRecord
	ProviderResultSpoolReceipts            []EvaluationProviderResultSpoolReceiptRecord
	ProviderResultSpoolDispositionReceipts []EvaluationProviderResultSpoolDispositionRecord
	InvocationTurnReceipts                 []EvaluationInvocationTurnReceiptRecord
	InvocationTurnSetReceipt               EvaluationInvocationTurnSetReceiptRecord
	CapabilityExecutionReceipts            []EvaluationCapabilityExecutionReceiptRecord
	CapabilitySpecificReceipts             []EvaluationCapabilitySpecificReceiptRecord
	ProviderCapabilityObservationReceipts  []EvaluationProviderCapabilityObservationReceiptRecord
	AttemptAuthorityOwnerReceipts          []EvaluationAttemptAuthorityOwnerReceiptRecord
	VerificationAttemptGrantReceipts       []EvaluationVerificationAttemptGrantReceiptRecord
	SourceReceipts                         []EvaluationSourceReceiptRecord
	ResultSubmissionReceipt                *EvaluationResultSubmissionReceiptRecord
	ControlledRuntimeReceipt               *EvaluationControlledRuntimeReceiptRecord
	ExecutionReceipt                       EvaluationExecutionReceiptRecord
	Attempt                                EvaluationFactRecord
	BudgetSettlement                       EvaluationBudgetSettlementRecord
}

type decodedEvaluationAttemptEvidenceCommitV3 struct {
	preDispatchFailures  []evaluationPreDispatchFailureReceipt
	intents              []evaluationTransportDispatchIntent
	transports           []evaluationTransportReceipt
	spools               []EvaluationProviderResultSpoolReceiptRecord
	dispositions         []EvaluationProviderResultSpoolDispositionRecord
	turns                []evaluationInvocationTurnReceipt
	turnSet              evaluationInvocationTurnSetReceipt
	capabilities         []evaluationCapabilityExecutionReceipt
	capabilitySpecifics  []evaluationCapabilitySpecificReceipt
	providerObservations []EvaluationProviderCapabilityObservationReceiptRecord
	attemptAuthorities   []EvaluationAttemptAuthorityOwnerReceiptRecord
	verificationGrants   []EvaluationVerificationAttemptGrantReceiptRecord
	sources              []evaluationSourceReceipt
	submission           evaluationResultSubmissionReceipt
	runtime              evaluationControlledRuntimeReceipt
	hasRuntime           bool
	execution            evaluationExecutionReceipt
	attempt              evaluationAttemptFact
}

func decodeEvaluationCanonicalReceiptList[T any](
	values [][]byte,
	maximum int,
	decode func([]byte) (T, error),
	identity func(T) string,
) ([]T, error) {
	if len(values) > maximum {
		return nil, ErrInvalid
	}
	result := make([]T, len(values))
	previous := ""
	for index, source := range values {
		decoded, err := decode(source)
		if err != nil {
			return nil, err
		}
		current := identity(decoded)
		if index > 0 && previous >= current {
			return nil, invalid("evaluation attempt evidence receipts are not in canonical identity order")
		}
		previous, result[index] = current, decoded
	}
	return result, nil
}

func decodeEvaluationAttemptEvidenceCommitV3(input EvaluationAttemptEvidenceCommitV3) (decodedEvaluationAttemptEvidenceCommitV3, error) {
	if len(input.InvocationTurnReceipts) < 1 || len(input.InvocationTurnReceipts) > maximumEvaluationAttemptCommitV3Receipts ||
		len(input.InvocationTurnSetReceipt) == 0 || len(input.ExecutionReceipt) == 0 || len(input.AttemptFact) == 0 ||
		input.BudgetSettlement.ReservationID == "" || input.BudgetSettlement.ExpectedRevision < 0 ||
		len(input.BudgetSettlement.SettlementBytes) == 0 {
		return decodedEvaluationAttemptEvidenceCommitV3{}, ErrInvalid
	}
	preDispatchFailures, err := decodeEvaluationCanonicalReceiptList(
		input.PreDispatchFailureReceipts, maximumEvaluationAttemptCommitV3Receipts,
		decodeEvaluationPreDispatchFailureReceipt,
		func(value evaluationPreDispatchFailureReceipt) string {
			return fmt.Sprintf("%s\x00%03d\x00%s", value.AttemptID, value.TurnIndex, value.FailureReceiptID)
		},
	)
	if err != nil {
		return decodedEvaluationAttemptEvidenceCommitV3{}, err
	}
	intents, err := decodeEvaluationCanonicalReceiptList(input.TransportDispatchIntents, maximumEvaluationAttemptCommitV3Receipts,
		decodeEvaluationTransportDispatchIntent, func(value evaluationTransportDispatchIntent) string { return value.IntentID })
	if err != nil {
		return decodedEvaluationAttemptEvidenceCommitV3{}, err
	}
	transports, err := decodeEvaluationCanonicalReceiptList(input.TransportReceipts, maximumEvaluationAttemptCommitV3Receipts,
		decodeEvaluationTransportReceipt, func(value evaluationTransportReceipt) string { return value.ReceiptID })
	if err != nil {
		return decodedEvaluationAttemptEvidenceCommitV3{}, err
	}
	spools, err := decodeEvaluationCanonicalReceiptList(input.ProviderResultSpoolReceipts, maximumEvaluationAttemptCommitV3Receipts,
		decodeEvaluationProviderResultSpoolReceipt, func(value EvaluationProviderResultSpoolReceiptRecord) string { return value.SpoolRef })
	if err != nil {
		return decodedEvaluationAttemptEvidenceCommitV3{}, err
	}
	dispositions, err := decodeEvaluationCanonicalReceiptList(input.ProviderResultSpoolDispositionReceipts, maximumEvaluationAttemptCommitV3Receipts,
		decodeEvaluationProviderResultSpoolDisposition, func(value EvaluationProviderResultSpoolDispositionRecord) string { return value.SpoolRef })
	if err != nil {
		return decodedEvaluationAttemptEvidenceCommitV3{}, err
	}
	turns, err := invocationTurnsFromBytes(input.InvocationTurnReceipts)
	if err != nil {
		return decodedEvaluationAttemptEvidenceCommitV3{}, err
	}
	turnSet, err := decodeEvaluationInvocationTurnSetReceipt(input.InvocationTurnSetReceipt)
	if err != nil {
		return decodedEvaluationAttemptEvidenceCommitV3{}, err
	}
	if err := validateEvaluationInvocationTurnSetJoin(turns, turnSet); err != nil {
		return decodedEvaluationAttemptEvidenceCommitV3{}, err
	}
	capabilities, err := decodeEvaluationCanonicalReceiptList(
		input.CapabilityExecutionReceipts, maximumEvaluationAttemptCommitV3Receipts,
		decodeEvaluationCapabilityExecutionReceipt,
		func(value evaluationCapabilityExecutionReceipt) string {
			return fmt.Sprintf("%s\x00%03d\x00%s", value.AttemptID, value.TurnIndex, value.CapabilityExecutionReceiptID)
		},
	)
	if err != nil || len(capabilities) != 1 {
		return decodedEvaluationAttemptEvidenceCommitV3{}, invalid("evaluation attempt requires exactly one capability execution receipt")
	}
	capabilitySpecifics, err := decodeEvaluationCanonicalReceiptList(
		input.CapabilitySpecificReceipts, maximumEvaluationCapabilitySpecificPerAttempt,
		decodeEvaluationCapabilitySpecificReceipt,
		func(value evaluationCapabilitySpecificReceipt) string {
			return fmt.Sprintf("%s\x00%03d\x00%s\x00%s", value.AttemptID, value.TurnIndex, value.ReceiptKind, value.ReceiptID)
		},
	)
	if err != nil {
		return decodedEvaluationAttemptEvidenceCommitV3{}, err
	}
	providerObservations, err := decodeEvaluationCanonicalReceiptList(
		input.ProviderCapabilityObservationReceipts, maximumEvaluationProviderCapabilityObservationTurns,
		decodeEvaluationProviderCapabilityObservationReceipt,
		func(value EvaluationProviderCapabilityObservationReceiptRecord) string {
			return fmt.Sprintf("%s\x00%03d\x00%s\x00%s", value.AttemptID, value.TurnIndex,
				value.InvocationID, value.ObservationReceiptID)
		},
	)
	if err != nil {
		return decodedEvaluationAttemptEvidenceCommitV3{}, err
	}
	attemptAuthorities, err := decodeEvaluationCanonicalReceiptList(
		input.AttemptAuthorityOwnerReceipts, maximumEvaluationAttemptAuthorityOwnersPerAttempt,
		decodeEvaluationAttemptAuthorityOwnerReceipt,
		func(value EvaluationAttemptAuthorityOwnerReceiptRecord) string {
			return value.AttemptID + "\x00" + value.ServiceKind + "\x00" + value.Operation + "\x00" + value.RequestDigest
		},
	)
	if err != nil {
		return decodedEvaluationAttemptEvidenceCommitV3{}, err
	}
	verificationGrants, err := decodeEvaluationCanonicalReceiptList(
		input.VerificationAttemptGrantReceipts, maximumEvaluationAttemptCommitV3Receipts,
		decodeEvaluationVerificationAttemptGrantRecord,
		func(value EvaluationVerificationAttemptGrantReceiptRecord) string {
			return value.AttemptID + "\x00" + value.CellID + "\x00" + value.VerificationAttemptGrantID
		},
	)
	if err != nil {
		return decodedEvaluationAttemptEvidenceCommitV3{}, err
	}
	sources, err := decodeEvaluationCanonicalReceiptList(input.SourceReceipts, maximumEvaluationAttemptCommitV3Receipts,
		decodeEvaluationSourceReceipt, func(value evaluationSourceReceipt) string { return value.SourceReceiptID })
	if err != nil {
		return decodedEvaluationAttemptEvidenceCommitV3{}, err
	}
	execution, err := decodeEvaluationExecutionReceipt(input.ExecutionReceipt)
	if err != nil {
		return decodedEvaluationAttemptEvidenceCommitV3{}, err
	}
	attempt, err := decodeEvaluationAttempt(input.AttemptFact)
	if err != nil {
		return decodedEvaluationAttemptEvidenceCommitV3{}, err
	}
	hasRuntime := len(input.ResultSubmissionReceipt) > 0 || len(input.ControlledRuntimeReceipt) > 0
	if (attempt.Status == "completed") != hasRuntime ||
		(len(input.ResultSubmissionReceipt) == 0) != (len(input.ControlledRuntimeReceipt) == 0) {
		return decodedEvaluationAttemptEvidenceCommitV3{}, invalid("evaluation completed attempt requires one result submission and controlled runtime receipt")
	}
	var submission evaluationResultSubmissionReceipt
	var runtime evaluationControlledRuntimeReceipt
	if hasRuntime {
		submission, err = decodeEvaluationResultSubmissionReceipt(input.ResultSubmissionReceipt)
		if err != nil {
			return decodedEvaluationAttemptEvidenceCommitV3{}, err
		}
		runtime, err = decodeEvaluationControlledRuntimeReceipt(input.ControlledRuntimeReceipt)
		if err != nil {
			return decodedEvaluationAttemptEvidenceCommitV3{}, err
		}
	}
	decoded := decodedEvaluationAttemptEvidenceCommitV3{
		preDispatchFailures: preDispatchFailures,
		intents:             intents, transports: transports, spools: spools, dispositions: dispositions,
		turns: turns, turnSet: turnSet, capabilities: capabilities,
		capabilitySpecifics: capabilitySpecifics, providerObservations: providerObservations,
		attemptAuthorities: attemptAuthorities,
		verificationGrants: verificationGrants,
		sources:            sources, submission: submission, runtime: runtime,
		hasRuntime: hasRuntime, execution: execution, attempt: attempt,
	}
	if err := validateEvaluationAttemptCommitV3Shape(decoded); err != nil {
		return decodedEvaluationAttemptEvidenceCommitV3{}, err
	}
	return decoded, nil
}

func validateEvaluationAttemptCommitV3Shape(decoded decodedEvaluationAttemptEvidenceCommitV3) error {
	attempt := decoded.attempt
	set := decoded.turnSet
	if set.PlanDigest != attempt.PlanDigest || set.RepositoryCommit == "" || set.AttemptID != attempt.AttemptID ||
		set.DescriptorDigest != attempt.DescriptorDigest || set.ReceiptDigest != attempt.InvocationTurnSetReceiptDigest ||
		set.TerminalStatus != attempt.Status || !sameEvaluationCanonicalValue(set.AggregateUsage, attempt.Usage) ||
		!sameEvaluationCanonicalValue(set.AggregateCost, attempt.Cost) || decoded.execution.PlanDigest != attempt.PlanDigest ||
		decoded.execution.RepositoryCommit != set.RepositoryCommit || decoded.execution.AttemptID != attempt.AttemptID ||
		decoded.execution.DescriptorDigest != attempt.DescriptorDigest || decoded.execution.ModelInvocations != set.DispatchedInvocationCount {
		return conflict("evaluation attempt turn-set/execution authority drifted")
	}
	terminal := decoded.turns[len(decoded.turns)-1]
	if terminal.ResponseArtifactDigest != attempt.ResponseDigest {
		return conflict("evaluation attempt terminal response authority drifted")
	}
	for _, turn := range decoded.turns {
		if turn.PlanDigest != attempt.PlanDigest || turn.RepositoryCommit != set.RepositoryCommit || turn.AttemptID != attempt.AttemptID ||
			turn.DescriptorDigest != attempt.DescriptorDigest {
			return conflict("evaluation invocation turn belongs to another attempt partition")
		}
	}
	for _, receipt := range decoded.preDispatchFailures {
		if receipt.PlanDigest != attempt.PlanDigest || receipt.RepositoryCommit != set.RepositoryCommit ||
			receipt.AttemptID != attempt.AttemptID || receipt.DescriptorDigest != attempt.DescriptorDigest ||
			receipt.OccurredAt.Before(attempt.StartedAt) || receipt.OccurredAt.After(attempt.CompletedAt) {
			return conflict("evaluation pre-dispatch failure belongs to another attempt partition or time window")
		}
	}
	intentDigests := make([]string, len(decoded.intents))
	for index, intent := range decoded.intents {
		if intent.PlanDigest != attempt.PlanDigest || intent.RepositoryCommit != set.RepositoryCommit ||
			intent.AttemptID != attempt.AttemptID || intent.DescriptorDigest != attempt.DescriptorDigest {
			return conflict("evaluation dispatch intent belongs to another attempt partition")
		}
		intentDigests[index] = intent.IntentDigest
	}
	transportDigests := make([]string, len(decoded.transports))
	for index := range decoded.transports {
		transportDigests[index] = decoded.transports[index].ReceiptDigest
	}
	turnDigests := make([]string, len(decoded.turns))
	for index := range decoded.turns {
		turnDigests[index] = decoded.turns[index].EvidenceDigest
	}
	intentSetDigest, intentErr := evaluationDigestSequence(intentDigests)
	transportSetDigest, transportErr := evaluationDigestSequence(transportDigests)
	turnSetDigest, turnErr := evaluationDigestSequence(turnDigests)
	if intentErr != nil || transportErr != nil || turnErr != nil || intentSetDigest != attempt.DispatchIntentSetDigest ||
		transportSetDigest != attempt.TransportReceiptSetDigest || turnSetDigest != attempt.InvocationTurnReceiptSetDigest {
		return conflict("evaluation attempt four-level receipt-set authority drifted")
	}
	if len(decoded.spools) != len(decoded.dispositions) {
		return conflict("evaluation attempt encrypted spool dispositions are incomplete")
	}
	preDispatchRecords := make([]EvaluationPreDispatchFailureReceiptRecord, len(decoded.preDispatchFailures))
	turnRecords := make([]EvaluationInvocationTurnReceiptRecord, len(decoded.turns))
	for index := range decoded.preDispatchFailures {
		preDispatchRecords[index] = decoded.preDispatchFailures[index].EvaluationPreDispatchFailureReceiptRecord
	}
	for index := range decoded.turns {
		turnRecords[index] = decoded.turns[index].EvaluationInvocationTurnReceiptRecord
	}
	if err := validateEvaluationPreDispatchFailureJoin(preDispatchRecords, turnRecords); err != nil {
		return err
	}
	capabilityRecords := make([]EvaluationCapabilityExecutionReceiptRecord, len(decoded.capabilities))
	for index := range decoded.capabilities {
		capabilityRecords[index] = decoded.capabilities[index].EvaluationCapabilityExecutionReceiptRecord
	}
	capabilitySetDigest, err := evaluationCapabilityExecutionSetDigest(capabilityRecords)
	if err != nil || capabilitySetDigest != attempt.CapabilityExecutionReceiptSetDigest ||
		capabilitySetDigest != decoded.execution.CapabilityExecutionReceiptSetDigest {
		return conflict("evaluation attempt capability execution set authority drifted")
	}
	verificationGrantSetDigest, err := evaluationVerificationAttemptGrantReceiptSetDigest(decoded.verificationGrants)
	if err != nil || verificationGrantSetDigest != attempt.VerificationAttemptGrantReceiptSetDigest ||
		verificationGrantSetDigest != decoded.execution.VerificationAttemptGrantReceiptSetDigest {
		return conflict("evaluation attempt Verification AttemptGrant receipt set authority drifted")
	}
	grantDigests := make([]any, len(decoded.verificationGrants))
	for index, receipt := range decoded.verificationGrants {
		if receipt.EvaluationPlanDigest != attempt.PlanDigest || receipt.RepositoryCommit != set.RepositoryCommit ||
			receipt.AttemptID != attempt.AttemptID || receipt.DescriptorDigest != attempt.DescriptorDigest ||
			receipt.CaseID != attempt.CaseID {
			return conflict("evaluation Verification AttemptGrant receipt belongs to another attempt")
		}
		grantDigests[index] = receipt.ReceiptDigest
	}
	if decoded.hasRuntime {
		runtimeDigests, ok := decoded.runtime.Value["verificationAttemptGrantReceiptDigests"].([]any)
		if !ok || !sameEvaluationCanonicalValue(runtimeDigests, grantDigests) {
			return conflict("evaluation controlled runtime Verification AttemptGrant leaves drifted")
		}
		runtimeSetDigest := stringMember(decoded.runtime.Value, "verificationAttemptGrantReceiptSetDigest")
		if (len(grantDigests) > 0) != (runtimeSetDigest != "") ||
			(runtimeSetDigest != "" && runtimeSetDigest != verificationGrantSetDigest) {
			return conflict("evaluation controlled runtime Verification AttemptGrant set authority drifted")
		}
	} else if len(decoded.verificationGrants) != 0 {
		return conflict("evaluation noncompleted attempt cannot carry Verification AttemptGrant receipts")
	}
	return validateEvaluationAttemptAuthorityCommitShape(decoded)
}

func evaluationAttemptAuthorityReceiptDigestProjection(
	receipts []evaluationCapabilitySpecificReceipt,
) []any {
	ordered := append([]evaluationCapabilitySpecificReceipt(nil), receipts...)
	sort.Slice(ordered, func(left, right int) bool {
		if ordered[left].ReceiptKind == ordered[right].ReceiptKind {
			return ordered[left].ReceiptDigest < ordered[right].ReceiptDigest
		}
		return ordered[left].ReceiptKind < ordered[right].ReceiptKind
	})
	result := make([]any, len(ordered))
	for index := range ordered {
		result[index] = map[string]any{
			"receiptKind": ordered[index].ReceiptKind, "receiptDigest": ordered[index].ReceiptDigest,
		}
	}
	return result
}

func evaluationAttemptAuthorityTurn(
	decoded decodedEvaluationAttemptEvidenceCommitV3,
	turnIndex int64,
	invocationID string,
) *evaluationInvocationTurnReceipt {
	for index := range decoded.turns {
		if decoded.turns[index].TurnIndex == turnIndex && decoded.turns[index].InvocationID == invocationID {
			return &decoded.turns[index]
		}
	}
	return nil
}

func evaluationAttemptAuthoritySpool(
	decoded decodedEvaluationAttemptEvidenceCommitV3,
	receiptDigest string,
) *EvaluationProviderResultSpoolReceiptRecord {
	for index := range decoded.spools {
		if decoded.spools[index].ReceiptDigest == receiptDigest {
			return &decoded.spools[index]
		}
	}
	return nil
}

func validateEvaluationProviderCapabilityObservationTurnBinding(
	decoded decodedEvaluationAttemptEvidenceCommitV3,
	observation EvaluationProviderCapabilityObservationReceiptRecord,
) error {
	attempt := decoded.attempt
	turn := evaluationAttemptAuthorityTurn(decoded, observation.TurnIndex, observation.InvocationID)
	spool := evaluationAttemptAuthoritySpool(decoded, observation.ResultSpoolReceiptDigest)
	if turn == nil || turn.Invocation == nil || spool == nil || observation.PlanDigest != attempt.PlanDigest ||
		observation.RepositoryCommit != decoded.turnSet.RepositoryCommit || observation.AttemptID != attempt.AttemptID ||
		observation.DescriptorDigest != attempt.DescriptorDigest || observation.RequestDigest != turn.Invocation.RequestDigest ||
		observation.ResponseDigest != turn.Invocation.ResponseDigest ||
		observation.ProtocolFamily != turn.Invocation.ProtocolFamily ||
		observation.ProviderConfigurationID != turn.Invocation.ProviderConfigurationID ||
		observation.ModelLineageDigest != turn.Invocation.ModelLineageDigest ||
		observation.DispatchIntentDigest != turn.DispatchIntentDigest ||
		observation.TransportReceiptDigest != turn.TransportReceiptDigest ||
		observation.ResultSpoolReceiptDigest != turn.ProviderResultSpoolReceiptDigest ||
		spool.PlanDigest != observation.PlanDigest || spool.RepositoryCommit != observation.RepositoryCommit ||
		spool.AttemptID != observation.AttemptID || spool.DescriptorDigest != observation.DescriptorDigest ||
		spool.TurnIndex != observation.TurnIndex || spool.InvocationID != observation.InvocationID ||
		spool.DispatchIntentDigest != observation.DispatchIntentDigest ||
		spool.TransportReceiptDigest != observation.TransportReceiptDigest ||
		spool.ResponseDigest != observation.ResponseDigest ||
		spool.NormalizedEventSetDigest != observation.NormalizedEventSetDigest ||
		observation.ObservedAt.Before(attempt.StartedAt) || observation.ObservedAt.After(attempt.CompletedAt) {
		return conflict("evaluation provider capability observation drifted from its invocation turn")
	}
	return nil
}

func validateEvaluationAttemptAuthorityCommitShape(decoded decodedEvaluationAttemptEvidenceCommitV3) error {
	if len(decoded.capabilities) != 1 || len(decoded.capabilitySpecifics) > maximumEvaluationCapabilitySpecificPerAttempt ||
		len(decoded.providerObservations) > maximumEvaluationProviderCapabilityObservationTurns ||
		len(decoded.attemptAuthorities) > maximumEvaluationAttemptAuthorityOwnersPerAttempt {
		return conflict("evaluation attempt authority family cardinality drifted")
	}
	attempt, capability := decoded.attempt, decoded.capabilities[0]
	preDispatch := len(decoded.preDispatchFailures) > 0
	if preDispatch != (len(decoded.attemptAuthorities) == 0) {
		return conflict("evaluation pre-dispatch authority family drifted")
	}

	observationByDigest := make(map[string]EvaluationProviderCapabilityObservationReceiptRecord, len(decoded.providerObservations))
	observationTurns := make(map[int64]struct{}, len(decoded.providerObservations))
	for _, observation := range decoded.providerObservations {
		if err := validateEvaluationProviderCapabilityObservationTurnBinding(decoded, observation); err != nil {
			return err
		}
		if _, duplicate := observationByDigest[observation.ReceiptDigest]; duplicate {
			return conflict("evaluation provider capability observation digest is duplicated")
		}
		if _, duplicate := observationTurns[observation.TurnIndex]; duplicate {
			return conflict("evaluation provider capability observation turn is duplicated")
		}
		observationByDigest[observation.ReceiptDigest] = observation
		observationTurns[observation.TurnIndex] = struct{}{}
	}

	specificByDigest := make(map[string]evaluationCapabilitySpecificReceipt, len(decoded.capabilitySpecifics))
	for _, receipt := range decoded.capabilitySpecifics {
		if receipt.PlanDigest != attempt.PlanDigest || receipt.RepositoryCommit != decoded.turnSet.RepositoryCommit ||
			receipt.AttemptID != attempt.AttemptID || receipt.DescriptorDigest != attempt.DescriptorDigest ||
			receipt.CaseID != attempt.CaseID || receipt.CapabilityDescriptorDigest != capability.CapabilityDescriptorDigest ||
			receipt.StartedAt.Before(attempt.StartedAt) || receipt.CompletedAt.After(attempt.CompletedAt) ||
			evaluationAttemptAuthorityTurn(decoded, receipt.TurnIndex, receipt.InvocationID) == nil {
			return conflict("evaluation capability-specific receipt belongs to another attempt or turn")
		}
		if _, duplicate := specificByDigest[receipt.ReceiptDigest]; duplicate {
			return conflict("evaluation capability-specific receipt digest is duplicated")
		}
		authority, authorityOK := objectMember(receipt.Value, "authority")
		if !authorityOK {
			return ErrInvalid
		}
		observationDigest := stringMember(receipt.Value, "providerCapabilityObservationReceiptDigest")
		if evaluationProviderObservationFactKind(stringMember(authority, "authorityKind")) != "" {
			observation, exists := observationByDigest[observationDigest]
			if !exists || validateEvaluationCapabilitySpecificProviderObservation(receipt, observation) != nil {
				return conflict("evaluation provider capability-specific receipt lacks its exact observation")
			}
		} else if observationDigest != "" {
			return conflict("evaluation controlled capability-specific receipt references a provider observation")
		}
		specificByDigest[receipt.ReceiptDigest] = receipt
	}
	if !sameEvaluationCanonicalValue(
		capability.SpecificReceipts,
		evaluationAttemptAuthorityReceiptDigestProjection(decoded.capabilitySpecifics),
	) {
		return conflict("evaluation capability execution specific receipt coverage drifted")
	}

	capabilityOwnerDigests := make([]string, 0, len(decoded.attemptAuthorities))
	seenReceiptDigests := make(map[string]struct{}, len(decoded.attemptAuthorities))
	seenRequestDigests := make(map[string]struct{}, len(decoded.attemptAuthorities))
	executeCount, assessmentCount, gradingCount := 0, 0, 0
	var generationAuthority *EvaluationAttemptAuthorityOwnerReceiptRecord
	var assessment *EvaluationAttemptAuthorityOwnerReceiptRecord
	for index := range decoded.attemptAuthorities {
		receipt := &decoded.attemptAuthorities[index]
		if receipt.PlanDigest != attempt.PlanDigest || receipt.RepositoryCommit != decoded.turnSet.RepositoryCommit ||
			receipt.AttemptID != attempt.AttemptID || receipt.DescriptorDigest != attempt.DescriptorDigest ||
			receipt.CompletedAt.Before(attempt.StartedAt) || receipt.CompletedAt.After(attempt.CompletedAt) {
			return conflict("evaluation attempt-authority owner receipt belongs to another attempt or time window")
		}
		if _, duplicate := seenReceiptDigests[receipt.ReceiptDigest]; duplicate {
			return conflict("evaluation attempt-authority owner receipt digest is duplicated")
		}
		if _, duplicate := seenRequestDigests[receipt.RequestDigest]; duplicate {
			return conflict("evaluation attempt-authority owner request digest is duplicated")
		}
		seenReceiptDigests[receipt.ReceiptDigest] = struct{}{}
		seenRequestDigests[receipt.RequestDigest] = struct{}{}
		if generationAuthority == nil {
			generationAuthority = receipt
		} else if receipt.ShardLeaseOwnerID != generationAuthority.ShardLeaseOwnerID ||
			receipt.ShardLeaseGeneration != generationAuthority.ShardLeaseGeneration ||
			receipt.VerificationGrantGeneration != generationAuthority.VerificationGrantGeneration ||
			receipt.VerificationAttemptGrantReceiptSetDigest != generationAuthority.VerificationAttemptGrantReceiptSetDigest {
			return conflict("evaluation attempt-authority owner generations drifted within one attempt")
		}
		if receipt.ServiceKind == "capability-runtime" {
			capabilityOwnerDigests = append(capabilityOwnerDigests, receipt.ReceiptDigest)
			if receipt.Operation == "execute-tool" {
				executeCount++
			} else if receipt.Operation == "assess-capability" {
				assessmentCount++
				assessment = receipt
			}
		} else if receipt.ServiceKind == "attempt-grading" && receipt.Operation == "grade-and-persist" {
			gradingCount++
		}
	}
	sort.Strings(capabilityOwnerDigests)
	if !evaluationExactStringSequence(capability.AttemptAuthorityOwnerReceiptDigests, capabilityOwnerDigests) ||
		(!preDispatch && (executeCount > 4 || assessmentCount != 1 || gradingCount != 1)) {
		return conflict("evaluation capability/grading owner receipt coverage drifted")
	}

	executeSpecificOwners := make(map[string]struct{}, len(decoded.capabilitySpecifics))
	for _, owner := range decoded.attemptAuthorities {
		if owner.Operation != "execute-tool" {
			continue
		}
		binding, err := evaluationAttemptAuthorityExecuteBindingFromProjection(owner.ResponseProjection)
		if err != nil {
			return err
		}
		turn := evaluationAttemptAuthorityTurn(decoded, binding.TurnIndex, binding.InvocationID)
		if turn == nil || turn.ContinuationReceiptDigest != stringMember(owner.ResponseProjection, "continuationReceiptDigest") {
			return conflict("evaluation execute authority continuation drifted from its invocation turn")
		}
		refs, err := evaluationAttemptAuthoritySpecificReceiptProjection(owner.ResponseProjection["specificReceiptDigests"])
		if err != nil {
			return err
		}
		for _, ref := range refs {
			digest := stringMember(ref, "receiptDigest")
			specific, exists := specificByDigest[digest]
			if !exists || specific.ReceiptKind != stringMember(ref, "receiptKind") ||
				specific.TurnIndex != binding.TurnIndex || specific.InvocationID != binding.InvocationID ||
				specific.ToolID != binding.ToolID || specific.ToolCallID != binding.ToolCallID ||
				specific.ProviderToolCallID != binding.ProviderToolCallID ||
				specific.RequestDigest != binding.ProviderRequestDigest ||
				specific.ResultDigest != stringMember(owner.ResponseProjection, "resultDigest") {
				return conflict("evaluation execute authority specific fact join drifted")
			}
			authorityValue, authorityOK := objectMember(specific.Value, "authority")
			fact, factOK := objectMember(authorityValue, "fact")
			if authorityOK && factOK && stringMember(fact, "format") == "prodivix.agent-evaluation-capability-owner-fact" &&
				(stringMember(fact, "authorityRequestDigest") != owner.RequestDigest ||
					stringMember(fact, "authorityResultDigest") != specific.ResultDigest ||
					stringMember(fact, "authorityImplementationDigest") != owner.OwnerImplementationDigest) {
				return conflict("evaluation capability owner fact drifted from its Backend authority receipt")
			}
			if _, duplicate := executeSpecificOwners[digest]; duplicate {
				return conflict("evaluation specific fact is assigned to multiple execute calls")
			}
			executeSpecificOwners[digest] = struct{}{}
		}
	}
	if assessment != nil {
		binding, err := evaluationAttemptAuthorityAssessmentBindingFromProjection(assessment.ResponseProjection)
		if err != nil {
			return err
		}
		terminal := decoded.turns[len(decoded.turns)-1]
		if binding.TerminalTurnIndex != terminal.TurnIndex || binding.TerminalInvocationID != terminal.InvocationID ||
			binding.CapabilityDescriptorDigest != capability.CapabilityDescriptorDigest ||
			stringMember(assessment.ResponseProjection, "outcome") != capability.Outcome ||
			!sameEvaluationCanonicalValue(
				assessment.ResponseProjection["specificReceiptDigests"],
				evaluationAttemptAuthorityReceiptDigestProjection(decoded.capabilitySpecifics),
			) {
			return conflict("evaluation capability assessment projection drifted")
		}
		for _, specific := range decoded.capabilitySpecifics {
			if specific.MaterialDigest != binding.MaterialDigest || specific.TurnIndex > binding.TerminalTurnIndex ||
				(specific.ToolID != "" && func() bool {
					_, exists := executeSpecificOwners[specific.ReceiptDigest]
					return !exists
				}()) {
				return conflict("evaluation capability assessment specific fact is orphaned")
			}
		}
	}
	if generationAuthority != nil {
		grantSetDigest, err := evaluationVerificationAttemptGrantReceiptSetDigest(decoded.verificationGrants)
		if err != nil || grantSetDigest != generationAuthority.VerificationAttemptGrantReceiptSetDigest {
			return conflict("evaluation attempt-authority Verification AttemptGrant set drifted")
		}
		for _, grant := range decoded.verificationGrants {
			if grant.Generation != generationAuthority.VerificationGrantGeneration {
				return conflict("evaluation attempt-authority Verification AttemptGrant generation drifted")
			}
		}
	}
	return nil
}

func validateEvaluationAttemptCommitV3Sources(decoded decodedEvaluationAttemptEvidenceCommitV3) error {
	records := make([]EvaluationSourceReceiptRecord, len(decoded.sources))
	for index := range decoded.sources {
		records[index] = decoded.sources[index].EvaluationSourceReceiptRecord
	}
	byDigest, pricingBySnapshotDigest, err := decodeEvaluationAuthenticitySources(records)
	if err != nil {
		return err
	}
	used := make(map[string]struct{}, len(decoded.sources))
	for _, turn := range decoded.turns {
		if turn.Invocation == nil {
			continue
		}
		invocation := turn.Invocation
		if turn.UsageSourceReceiptDigest != "" {
			source, exists := byDigest[turn.UsageSourceReceiptDigest]
			if !exists || !evaluationUsageSourceMatches(source, invocation.Usage, invocation.ProviderConfigurationID,
				invocation.ModelLineageDigest, turn.ProviderRequestID, turn.ExecutionFailureAuthorityReceiptDigest) {
				return conflict("evaluation turn usage source receipt drifted")
			}
			if err := markEvaluationSourceReceiptUsed(used, turn.UsageSourceReceiptDigest); err != nil {
				return err
			}
		}
		if turn.CostSourceReceiptDigest != "" {
			source, exists := byDigest[turn.CostSourceReceiptDigest]
			if !exists || !evaluationCostSourceMatches(source, invocation.Usage, invocation.Cost,
				invocation.ProviderConfigurationID, invocation.ModelLineageDigest, turn.ProviderRequestID,
				turn.ExecutionFailureAuthorityReceiptDigest, invocation.PricingSnapshotRef, pricingBySnapshotDigest, used) {
				return conflict("evaluation turn cost source receipt drifted")
			}
			if err := markEvaluationSourceReceiptUsed(used, turn.CostSourceReceiptDigest); err != nil {
				return err
			}
		}
	}
	if len(used) != len(decoded.sources) {
		return conflict("evaluation attempt source receipts contain unreferenced evidence")
	}
	return nil
}

func validateEvaluationAttemptCommitV3Journal(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	decoded decodedEvaluationAttemptEvidenceCommitV3,
) error {
	intents, err := queryEvaluationTransportDispatchIntents(ctx, tx, namespaceID, partition)
	if err != nil {
		return err
	}
	transports, err := queryEvaluationTransportReceipts(ctx, tx, namespaceID, partition)
	if err != nil {
		return err
	}
	spools, err := queryEvaluationProviderResultSpoolReceipts(ctx, tx, namespaceID, partition)
	if err != nil {
		return err
	}
	filteredIntents := make([][]byte, 0)
	for _, record := range intents {
		if record.AttemptID == decoded.attempt.AttemptID {
			filteredIntents = append(filteredIntents, record.IntentBytes)
		}
	}
	filteredTransports := make([][]byte, 0)
	for _, record := range transports {
		if record.AttemptID == decoded.attempt.AttemptID {
			filteredTransports = append(filteredTransports, record.ReceiptBytes)
		}
	}
	filteredSpools := make([][]byte, 0)
	for _, record := range spools {
		if record.AttemptID == decoded.attempt.AttemptID {
			filteredSpools = append(filteredSpools, record.ReceiptBytes)
		}
	}
	if !sameEvaluationByteSequence(filteredIntents, decodedIntentBytes(decoded.intents)) ||
		!sameEvaluationByteSequence(filteredTransports, decodedTransportBytes(decoded.transports)) ||
		!sameEvaluationByteSequence(filteredSpools, decodedSpoolBytes(decoded.spools)) {
		return conflict("evaluation final commit drifted from its durable turn journal")
	}
	persistedGrants, err := queryEvaluationVerificationAttemptGrantReceipts(
		ctx, tx, namespaceID, partition, decoded.attempt.AttemptID,
	)
	if err != nil {
		return err
	}
	if !sameEvaluationByteSequence(
		decodedVerificationAttemptGrantBytes(persistedGrants),
		decodedVerificationAttemptGrantBytes(decoded.verificationGrants),
	) {
		return conflict("evaluation final commit drifted from its durable Verification AttemptGrant receipts")
	}
	persistedObservations, err := queryEvaluationProviderCapabilityObservationReceipts(
		ctx, tx, namespaceID, partition, decoded.attempt.AttemptID,
	)
	if err != nil {
		return err
	}
	if !sameEvaluationByteSequence(
		decodedEvaluationProviderCapabilityObservationBytes(persistedObservations),
		decodedEvaluationProviderCapabilityObservationBytes(decoded.providerObservations),
	) {
		return conflict("evaluation final commit drifted from its durable provider capability observations")
	}
	persistedOwners, err := queryEvaluationAttemptAuthorityOwnerReceipts(
		ctx, tx, namespaceID, partition, decoded.attempt.AttemptID, false,
	)
	if err != nil {
		return err
	}
	if !sameEvaluationByteSequence(
		decodedEvaluationAttemptAuthorityOwnerBytes(persistedOwners),
		decodedEvaluationAttemptAuthorityOwnerBytes(decoded.attemptAuthorities),
	) {
		return conflict("evaluation final commit drifted from its durable attempt-authority owner receipts")
	}
	for _, owner := range persistedOwners {
		if owner.NamespaceID != namespaceID {
			return conflict("evaluation attempt-authority owner receipt namespace drifted")
		}
		if err := validateEvaluationAttemptAuthorityOwnerJournal(ctx, tx, namespaceID, partition, owner); err != nil {
			return err
		}
	}
	return nil
}

func sameEvaluationByteSequence(left, right [][]byte) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if !bytes.Equal(left[index], right[index]) {
			return false
		}
	}
	return true
}

func decodedIntentBytes(values []evaluationTransportDispatchIntent) [][]byte {
	result := make([][]byte, len(values))
	for index := range values {
		result[index] = values[index].IntentBytes
	}
	return result
}
func decodedTransportBytes(values []evaluationTransportReceipt) [][]byte {
	result := make([][]byte, len(values))
	for index := range values {
		result[index] = values[index].ReceiptBytes
	}
	return result
}
func decodedSpoolBytes(values []EvaluationProviderResultSpoolReceiptRecord) [][]byte {
	result := make([][]byte, len(values))
	for index := range values {
		result[index] = values[index].ReceiptBytes
	}
	return result
}

func decodedCapabilityExecutionBytes(values []evaluationCapabilityExecutionReceipt) [][]byte {
	result := make([][]byte, len(values))
	for index := range values {
		result[index] = values[index].ReceiptBytes
	}
	return result
}

func decodedEvaluationCapabilitySpecificBytes(values []evaluationCapabilitySpecificReceipt) [][]byte {
	result := make([][]byte, len(values))
	for index := range values {
		result[index] = values[index].ReceiptBytes
	}
	return result
}

func decodedEvaluationCapabilitySpecificRecordBytes(values []EvaluationCapabilitySpecificReceiptRecord) [][]byte {
	result := make([][]byte, len(values))
	for index := range values {
		result[index] = values[index].ReceiptBytes
	}
	return result
}

func decodedEvaluationProviderCapabilityObservationBytes(values []EvaluationProviderCapabilityObservationReceiptRecord) [][]byte {
	result := make([][]byte, len(values))
	for index := range values {
		result[index] = values[index].ReceiptBytes
	}
	return result
}

func decodedEvaluationAttemptAuthorityOwnerBytes(values []EvaluationAttemptAuthorityOwnerReceiptRecord) [][]byte {
	result := make([][]byte, len(values))
	for index := range values {
		result[index] = values[index].ReceiptBytes
	}
	return result
}

func decodedVerificationAttemptGrantBytes(values []EvaluationVerificationAttemptGrantReceiptRecord) [][]byte {
	result := make([][]byte, len(values))
	for index := range values {
		result[index] = values[index].ReceiptBytes
	}
	return result
}

func evaluationAttemptCommitResultV3(namespaceID string, partition EvaluationPlanPartition, decoded decodedEvaluationAttemptEvidenceCommitV3, settlement EvaluationBudgetSettlementRecord) EvaluationAttemptEvidenceCommitResultV3 {
	preDispatchFailures := make([]EvaluationPreDispatchFailureReceiptRecord, len(decoded.preDispatchFailures))
	for index := range decoded.preDispatchFailures {
		preDispatchFailures[index] = decoded.preDispatchFailures[index].EvaluationPreDispatchFailureReceiptRecord
		preDispatchFailures[index].NamespaceID = namespaceID
	}
	intents := make([]EvaluationTransportDispatchIntentRecord, len(decoded.intents))
	for index := range decoded.intents {
		intents[index] = decoded.intents[index].EvaluationTransportDispatchIntentRecord
		intents[index].NamespaceID = namespaceID
	}
	transports := make([]EvaluationTransportReceiptRecord, len(decoded.transports))
	for index := range decoded.transports {
		transports[index] = decoded.transports[index].EvaluationTransportReceiptRecord
		transports[index].NamespaceID = namespaceID
	}
	spools := append([]EvaluationProviderResultSpoolReceiptRecord(nil), decoded.spools...)
	dispositions := append([]EvaluationProviderResultSpoolDispositionRecord(nil), decoded.dispositions...)
	turns := make([]EvaluationInvocationTurnReceiptRecord, len(decoded.turns))
	for index := range decoded.turns {
		turns[index] = decoded.turns[index].EvaluationInvocationTurnReceiptRecord
		turns[index].NamespaceID = namespaceID
	}
	capabilities := make([]EvaluationCapabilityExecutionReceiptRecord, len(decoded.capabilities))
	for index := range decoded.capabilities {
		capabilities[index] = decoded.capabilities[index].EvaluationCapabilityExecutionReceiptRecord
		capabilities[index].NamespaceID = namespaceID
	}
	capabilitySpecifics := make([]EvaluationCapabilitySpecificReceiptRecord, len(decoded.capabilitySpecifics))
	for index := range decoded.capabilitySpecifics {
		capabilitySpecifics[index] = decoded.capabilitySpecifics[index].EvaluationCapabilitySpecificReceiptRecord
		capabilitySpecifics[index].NamespaceID = namespaceID
	}
	providerObservations := append([]EvaluationProviderCapabilityObservationReceiptRecord(nil), decoded.providerObservations...)
	for index := range providerObservations {
		providerObservations[index].NamespaceID = namespaceID
	}
	attemptAuthorities := append([]EvaluationAttemptAuthorityOwnerReceiptRecord(nil), decoded.attemptAuthorities...)
	for index := range attemptAuthorities {
		attemptAuthorities[index].NamespaceID = namespaceID
	}
	verificationGrants := append([]EvaluationVerificationAttemptGrantReceiptRecord(nil), decoded.verificationGrants...)
	for index := range verificationGrants {
		verificationGrants[index].NamespaceID = namespaceID
	}
	sources := make([]EvaluationSourceReceiptRecord, len(decoded.sources))
	for index := range decoded.sources {
		sources[index] = decoded.sources[index].EvaluationSourceReceiptRecord
		sources[index].NamespaceID = namespaceID
	}
	set := decoded.turnSet.EvaluationInvocationTurnSetReceiptRecord
	set.NamespaceID = namespaceID
	execution := decoded.execution.EvaluationExecutionReceiptRecord
	execution.NamespaceID = namespaceID
	var submissionRecord *EvaluationResultSubmissionReceiptRecord
	var runtimeRecord *EvaluationControlledRuntimeReceiptRecord
	if decoded.hasRuntime {
		submission, runtime := runtimeEvidenceRecordsFromDecoded(namespaceID, partition, decoded.submission, decoded.runtime)
		submissionRecord, runtimeRecord = &submission, &runtime
	}
	attempt := evaluationRecord(namespaceID, partition.PlanDigest, "evaluation-attempt", decoded.attempt.AttemptID,
		decoded.attempt.AttemptDigest, decoded.attempt.Canonical, decoded.attempt.CompletedAt)
	return EvaluationAttemptEvidenceCommitResultV3{
		PreDispatchFailureReceipts: preDispatchFailures,
		TransportDispatchIntents:   intents, TransportReceipts: transports, ProviderResultSpoolReceipts: spools,
		ProviderResultSpoolDispositionReceipts: dispositions, InvocationTurnReceipts: turns, InvocationTurnSetReceipt: set,
		CapabilityExecutionReceipts:           capabilities,
		CapabilitySpecificReceipts:            capabilitySpecifics,
		ProviderCapabilityObservationReceipts: providerObservations,
		AttemptAuthorityOwnerReceipts:         attemptAuthorities,
		VerificationAttemptGrantReceipts:      verificationGrants,
		SourceReceipts:                        sources, ResultSubmissionReceipt: submissionRecord, ControlledRuntimeReceipt: runtimeRecord,
		ExecutionReceipt: execution, Attempt: attempt, BudgetSettlement: settlement,
	}
}

func insertEvaluationSourceReceiptV3(ctx context.Context, tx *sql.Tx, namespaceID string, partition EvaluationPlanPartition, source evaluationSourceReceipt) error {
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_source_receipts (
		namespace_id, plan_digest, repository_commit, source_receipt_id, source_kind,
		provider_configuration_id, model_lineage_digest, provider_request_id,
		execution_failure_authority_receipt_digest, source_uri, source_content_digest,
		receipt_digest, receipt_json, receipt_bytes, observed_at
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15)
	ON CONFLICT DO NOTHING`, namespaceID, partition.PlanDigest, partition.RepositoryCommit, source.SourceReceiptID,
		source.SourceKind, source.ProviderConfigurationID, nullableEvaluationAuthenticityString(source.ModelLineageDigest),
		nullableEvaluationAuthenticityString(source.ProviderRequestID), nullableEvaluationAuthenticityString(source.ExecutionFailureAuthorityReceiptDigest),
		nullableEvaluationAuthenticityString(source.SourceURI), source.SourceContentDigest, source.ReceiptDigest,
		string(source.ReceiptBytes), source.ReceiptBytes, source.ObservedAt)
	if err != nil {
		return err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if inserted == 1 {
		return nil
	}
	var existing []byte
	if err := tx.QueryRowContext(ctx, `SELECT receipt_bytes FROM agent_evaluation_source_receipts
		WHERE namespace_id = $1 AND plan_digest = $2 AND source_receipt_id = $3 FOR SHARE`, namespaceID,
		partition.PlanDigest, source.SourceReceiptID).Scan(&existing); err != nil {
		return err
	}
	if !bytes.Equal(existing, source.ReceiptBytes) {
		return conflict("evaluation source receipt identity was reused")
	}
	return nil
}

func insertEvaluationInvocationTurnV3(ctx context.Context, tx *sql.Tx, namespaceID string, partition EvaluationPlanPartition, turn evaluationInvocationTurnReceipt) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_invocation_turn_receipts (
		namespace_id, plan_digest, repository_commit, attempt_id, descriptor_digest, turn_index, invocation_id,
		status, dispatch_state, terminal, dispatch_intent_digest, transport_receipt_digest,
		provider_result_spool_receipt_digest, execution_failure_authority_receipt_digest,
		result_submission_receipt_digest, controlled_runtime_receipt_digest, response_artifact_digest,
		pre_dispatch_failure_receipt_digest, evidence_digest, receipt_json, receipt_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21)`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit, turn.AttemptID, turn.DescriptorDigest, turn.TurnIndex,
		turn.InvocationID, turn.Status, turn.DispatchState, turn.Terminal,
		nullableEvaluationAuthenticityString(turn.DispatchIntentDigest), nullableEvaluationAuthenticityString(turn.TransportReceiptDigest),
		nullableEvaluationAuthenticityString(turn.ProviderResultSpoolReceiptDigest),
		nullableEvaluationAuthenticityString(turn.ExecutionFailureAuthorityReceiptDigest),
		nullableEvaluationAuthenticityString(turn.ResultSubmissionReceiptDigest), nullableEvaluationAuthenticityString(turn.ControlledRuntimeReceiptDigest),
		nullableEvaluationAuthenticityString(turn.ResponseArtifactDigest),
		nullableEvaluationAuthenticityString(turn.PreDispatchFailureReceiptDigest),
		turn.EvidenceDigest, string(turn.ReceiptBytes), turn.ReceiptBytes)
	return err
}

func insertEvaluationInvocationTurnSetV3(ctx context.Context, tx *sql.Tx, namespaceID string, partition EvaluationPlanPartition, set evaluationInvocationTurnSetReceipt) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_invocation_turn_set_receipts (
		namespace_id, plan_digest, repository_commit, attempt_id, descriptor_digest, terminal_turn_index,
		terminal_status, dispatched_invocation_count, turn_receipt_count, source_receipt_set_digest,
		receipt_digest, receipt_json, receipt_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`, namespaceID, partition.PlanDigest,
		partition.RepositoryCommit, set.AttemptID, set.DescriptorDigest, set.TerminalTurnIndex, set.TerminalStatus,
		set.DispatchedInvocationCount, set.TurnReceiptCount, set.SourceReceiptSetDigest, set.ReceiptDigest,
		string(set.ReceiptBytes), set.ReceiptBytes)
	return err
}

func insertEvaluationSpoolDispositionV3(ctx context.Context, tx *sql.Tx, namespaceID string, partition EvaluationPlanPartition, receipt EvaluationProviderResultSpoolDispositionRecord) error {
	spool, err := loadEvaluationProviderResultSpoolReceipt(ctx, tx, namespaceID, partition, receipt.AttemptID, receipt.TurnIndex)
	if err != nil {
		return err
	}
	if receipt.SpoolRef != spool.SpoolRef || receipt.SpoolReceiptDigest != spool.ReceiptDigest || receipt.DescriptorDigest != spool.DescriptorDigest ||
		receipt.InvocationID != spool.InvocationID || receipt.RetentionPolicyDigest != spool.RetentionPolicyDigest || receipt.DisposedAt.Before(spool.CreatedAt) ||
		receipt.DisposedAt.After(spool.ExpiresAt) || receipt.RetainedUntil != nil && receipt.RetainedUntil.After(spool.ExpiresAt) {
		return conflict("evaluation spool disposition drifted from its immutable receipt")
	}
	var existing []byte
	err = tx.QueryRowContext(ctx, `SELECT receipt_bytes FROM agent_evaluation_provider_result_spool_dispositions
		WHERE namespace_id=$1 AND plan_digest=$2 AND attempt_id=$3 AND turn_index=$4 FOR SHARE`, namespaceID, partition.PlanDigest,
		receipt.AttemptID, receipt.TurnIndex).Scan(&existing)
	if err == nil {
		if !bytes.Equal(existing, receipt.ReceiptBytes) {
			return conflict("evaluation spool disposition replay drifted")
		}
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_provider_result_spool_dispositions (
		namespace_id, plan_digest, repository_commit, attempt_id, descriptor_digest, turn_index, invocation_id,
		spool_ref, spool_receipt_digest, disposition, retention_policy_digest, retained_until, disposed_at,
		receipt_digest, receipt_json, receipt_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16)`, namespaceID,
		partition.PlanDigest, partition.RepositoryCommit, receipt.AttemptID, receipt.DescriptorDigest, receipt.TurnIndex,
		receipt.InvocationID, receipt.SpoolRef, receipt.SpoolReceiptDigest, receipt.Disposition, receipt.RetentionPolicyDigest,
		receipt.RetainedUntil, receipt.DisposedAt, receipt.ReceiptDigest, string(receipt.ReceiptBytes), receipt.ReceiptBytes); err != nil {
		return err
	}
	if receipt.Disposition == "consumed-and-destroyed" {
		result, err := tx.ExecContext(ctx, `DELETE FROM agent_evaluation_provider_result_spool_payloads
			WHERE namespace_id=$1 AND plan_digest=$2 AND attempt_id=$3 AND turn_index=$4`, namespaceID, partition.PlanDigest,
			receipt.AttemptID, receipt.TurnIndex)
		if err != nil {
			return err
		}
		if affected, err := result.RowsAffected(); err != nil || affected != 1 {
			return conflict("evaluation spool destruction lost its payload fence")
		}
	}
	return nil
}

func validateEvaluationRuntimeEvidenceBindingV3(plan evaluationPlanFact, decoded decodedEvaluationAttemptEvidenceCommitV3) error {
	if !decoded.hasRuntime {
		return nil
	}
	terminal := decoded.turns[len(decoded.turns)-1]
	if terminal.Invocation == nil {
		return conflict("completed evaluation runtime requires a terminal provider invocation")
	}
	invocation := evaluationInvocationReceipt{
		EvaluationInvocationReceiptRecord: EvaluationInvocationReceiptRecord{
			PlanDigest: terminal.PlanDigest, RepositoryCommit: terminal.RepositoryCommit, AttemptID: terminal.AttemptID,
			DescriptorDigest: terminal.DescriptorDigest, ProviderConfigurationID: terminal.Invocation.ProviderConfigurationID,
			ModelLineageDigest: terminal.Invocation.ModelLineageDigest, ProviderRequestID: terminal.ProviderRequestID,
			TransportReceiptDigest: terminal.TransportReceiptDigest, ResolvedModelID: terminal.ResolvedModelID,
			ResolvedModelVersion: terminal.ResolvedModelVersion, ResolvedModelIdentityDigest: terminal.ResolvedModelIdentityDigest,
			InvocationOutcome: terminal.Invocation.Outcome, InvocationReceiptDigest: terminal.Invocation.ReceiptDigest,
			ResponseArtifactDigest: terminal.ResponseArtifactDigest, StartedAt: terminal.Invocation.StartedAt, CompletedAt: terminal.Invocation.CompletedAt,
		},
		CaseDefinitionDigest: terminal.CaseDefinitionDigest, ContextPackDigest: terminal.ContextPackDigest,
		MediaRepresentationManifestDigest: terminal.MediaRepresentationManifestDigest,
		RequestArtifactDigest:             terminal.RequestArtifactDigest, UsageSourceDigest: terminal.UsageSourceDigest,
		CostSourceDigest: terminal.CostSourceDigest, UsageSourceReceiptDigest: terminal.UsageSourceReceiptDigest,
		CostSourceReceiptDigest: terminal.CostSourceReceiptDigest, CapabilityQualificationDigest: stringMember(terminal.Invocation.Value, "capabilityQualificationDigest"),
		InferenceConfigurationDigest: terminal.Invocation.InferenceConfigDigest, PricingSnapshotRef: terminal.Invocation.PricingSnapshotRef,
		IndependentRunID: terminal.Invocation.RunID, Usage: terminal.Invocation.Usage, Cost: terminal.Invocation.Cost,
		Provider: terminal.Invocation.Value["provider"].(map[string]any), Model: terminal.Invocation.Value["model"].(map[string]any),
	}
	return validateEvaluationRuntimeEvidenceBinding(plan, decoded.attempt, invocation, decoded.execution, decoded.submission, decoded.runtime)
}

// CommitEvaluationAttemptEvidenceV3 is the one transaction that seals ordered
// provider turns, accounting, runtime evidence, the denominator attempt, and
// its budget settlement. Durable intent/transport/spool journal facts are
// compared byte-for-byte and remain the crash-recovery authority.
func (repository *Repository) CommitEvaluationAttemptEvidenceV3(ctx context.Context, authority EvaluationAuthority, partition EvaluationPlanPartition, input EvaluationAttemptEvidenceCommitV3) (EvaluationAttemptEvidenceCommitResultV3, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, err
	}
	decoded, err := decodeEvaluationAttemptEvidenceCommitV3(input)
	if err != nil {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, err
	}
	if decoded.attempt.PlanDigest != partition.PlanDigest || decoded.turnSet.RepositoryCommit != partition.RepositoryCommit {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, conflict("evaluation attempt evidence belongs to another partition")
	}
	writeContext, cancel, tx, _, plan, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := ensureEvaluationAuthenticitySetOpen(writeContext, tx, authority.NamespaceID, partition.PlanDigest); err != nil {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, err
	}
	if err := validateEvaluationAttemptPlanBinding(plan.Canonical, decoded.attempt); err != nil {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, err
	}
	descriptor, descriptorOK := objectMember(decoded.attempt.Value, "descriptor")
	if !descriptorOK {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, ErrInvalid
	}
	for _, observation := range decoded.providerObservations {
		if err := validateEvaluationProviderCapabilityObservationPlanBinding(plan, descriptor, observation); err != nil {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, err
		}
	}
	for _, source := range decoded.sources {
		if err := validateEvaluationSourceBinding(plan, source); err != nil {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, err
		}
	}
	if err := validateEvaluationAttemptCommitV3Sources(decoded); err != nil {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, err
	}
	if err := validateEvaluationExecutionBinding(plan, decoded.attempt, decoded.execution); err != nil {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, err
	}
	if err := validateEvaluationRuntimeEvidenceBindingV3(plan, decoded); err != nil {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, err
	}
	if err := validateEvaluationAttemptCapabilityExecutionBinding(plan, decoded); err != nil {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, err
	}
	if err := validateEvaluationAttemptCommitV3Journal(writeContext, tx, authority.NamespaceID, partition, decoded); err != nil {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, err
	}
	expectedReservationID, err := evaluationAttemptStableReservationID(partition.PlanDigest, decoded.attempt.ShardID, decoded.attempt.DescriptorDigest)
	if err != nil || expectedReservationID != input.BudgetSettlement.ReservationID {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, conflict("evaluation budget reservation drifted from the stable descriptor")
	}
	var ledgerRevision int64
	if err := tx.QueryRowContext(writeContext, `SELECT revision FROM agent_evaluation_budget_ledgers WHERE namespace_id=$1 AND plan_digest=$2 FOR UPDATE`, authority.NamespaceID, partition.PlanDigest).Scan(&ledgerRevision); err != nil {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, err
	}
	var demandBytes []byte
	var reservedAt sql.NullTime
	if err := tx.QueryRowContext(writeContext, `SELECT demand_bytes,reserved_at FROM agent_evaluation_budget_reservations
		WHERE namespace_id=$1 AND plan_digest=$2 AND reservation_id=$3 FOR SHARE`, authority.NamespaceID, partition.PlanDigest,
		input.BudgetSettlement.ReservationID).Scan(&demandBytes, &reservedAt); err != nil {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, err
	}
	demand, err := decodeEvaluationBudgetDemand(demandBytes, true)
	if err != nil || !reservedAt.Valid {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, conflict("persisted evaluation budget reservation is invalid")
	}
	settlement, err := decodeEvaluationBudgetSettlement(input.BudgetSettlement.SettlementBytes, demand, reservedAt.Time)
	if err != nil {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, err
	}
	var existingAttempt []byte
	err = tx.QueryRowContext(writeContext, `SELECT attempt_bytes FROM agent_evaluation_attempts WHERE namespace_id=$1 AND plan_digest=$2 AND attempt_id=$3 FOR SHARE`, authority.NamespaceID, partition.PlanDigest, decoded.attempt.AttemptID).Scan(&existingAttempt)
	if err == nil {
		if !bytes.Equal(existingAttempt, decoded.attempt.Canonical) {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, conflict("evaluation attempt commit replay drifted")
		}
		existingCapabilities, queryErr := queryEvaluationCapabilityExecutionReceipts(
			writeContext, tx, authority.NamespaceID, partition, decoded.attempt.AttemptID,
		)
		if queryErr != nil {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, queryErr
		}
		existingCapabilityBytes := make([][]byte, len(existingCapabilities))
		for index := range existingCapabilities {
			existingCapabilityBytes[index] = existingCapabilities[index].ReceiptBytes
		}
		if !sameEvaluationByteSequence(existingCapabilityBytes, decodedCapabilityExecutionBytes(decoded.capabilities)) {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, conflict("evaluation attempt capability execution replay drifted")
		}
		existingCapabilitySpecifics, queryErr := queryEvaluationCapabilitySpecificReceipts(
			writeContext, tx, authority.NamespaceID, partition, decoded.attempt.AttemptID,
		)
		if queryErr != nil {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, queryErr
		}
		if !sameEvaluationByteSequence(
			decodedEvaluationCapabilitySpecificRecordBytes(existingCapabilitySpecifics),
			decodedEvaluationCapabilitySpecificBytes(decoded.capabilitySpecifics),
		) {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, conflict("evaluation attempt capability-specific replay drifted")
		}
		existingProviderObservations, queryErr := queryCommittedEvaluationProviderCapabilityObservationReceipts(
			writeContext, tx, authority.NamespaceID, partition, decoded.attempt.AttemptID,
		)
		if queryErr != nil {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, queryErr
		}
		if !sameEvaluationByteSequence(
			decodedEvaluationProviderCapabilityObservationBytes(existingProviderObservations),
			decodedEvaluationProviderCapabilityObservationBytes(decoded.providerObservations),
		) {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, conflict("evaluation attempt provider observation replay drifted")
		}
		existingAttemptAuthorities, queryErr := queryEvaluationAttemptAuthorityOwnerReceipts(
			writeContext, tx, authority.NamespaceID, partition, decoded.attempt.AttemptID, true,
		)
		if queryErr != nil {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, queryErr
		}
		if !sameEvaluationByteSequence(
			decodedEvaluationAttemptAuthorityOwnerBytes(existingAttemptAuthorities),
			decodedEvaluationAttemptAuthorityOwnerBytes(decoded.attemptAuthorities),
		) {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, conflict("evaluation attempt-authority owner replay drifted")
		}
		existingVerificationGrants, queryErr := queryEvaluationVerificationAttemptGrantReceipts(
			writeContext, tx, authority.NamespaceID, partition, decoded.attempt.AttemptID,
		)
		if queryErr != nil {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, queryErr
		}
		if !sameEvaluationByteSequence(
			decodedVerificationAttemptGrantBytes(existingVerificationGrants),
			decodedVerificationAttemptGrantBytes(decoded.verificationGrants),
		) {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, conflict("evaluation attempt Verification AttemptGrant replay drifted")
		}
		var existingSettlement []byte
		var settlementRecord EvaluationBudgetSettlementRecord
		settlementRecord.NamespaceID, settlementRecord.PlanDigest, settlementRecord.ReservationID = authority.NamespaceID, partition.PlanDigest, input.BudgetSettlement.ReservationID
		if err := tx.QueryRowContext(writeContext, `SELECT ledger_revision,settlement_digest,settlement_bytes,settled_at FROM agent_evaluation_budget_settlements
			WHERE namespace_id=$1 AND plan_digest=$2 AND reservation_id=$3 FOR SHARE`, authority.NamespaceID, partition.PlanDigest,
			input.BudgetSettlement.ReservationID).Scan(&settlementRecord.LedgerRevision, &settlementRecord.SettlementDigest, &existingSettlement, &settlementRecord.SettledAt); err != nil || !bytes.Equal(existingSettlement, settlement.Canonical) {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, conflict("evaluation attempt settlement replay drifted")
		}
		settlementRecord.SettlementBytes = existingSettlement
		if err := tx.Commit(); err != nil {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, err
		}
		return evaluationAttemptCommitResultV3(authority.NamespaceID, partition, decoded, settlementRecord), true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, err
	}
	var partial bool
	if err := tx.QueryRowContext(writeContext, `SELECT EXISTS(
		SELECT 1 FROM agent_evaluation_invocation_turn_receipts WHERE namespace_id=$1 AND plan_digest=$2 AND attempt_id=$3
		UNION ALL SELECT 1 FROM agent_evaluation_pre_dispatch_failure_receipts WHERE namespace_id=$1 AND plan_digest=$2 AND attempt_id=$3
		UNION ALL SELECT 1 FROM agent_evaluation_invocation_turn_set_receipts WHERE namespace_id=$1 AND plan_digest=$2 AND attempt_id=$3
		UNION ALL SELECT 1 FROM agent_evaluation_capability_execution_receipts WHERE namespace_id=$1 AND plan_digest=$2 AND attempt_id=$3
		UNION ALL SELECT 1 FROM agent_evaluation_capability_specific_receipts WHERE namespace_id=$1 AND plan_digest=$2 AND attempt_id=$3
		UNION ALL SELECT 1 FROM agent_evaluation_provider_capability_observation_commit_links WHERE namespace_id=$1 AND plan_digest=$2 AND attempt_id=$3
		UNION ALL SELECT 1 FROM agent_evaluation_attempt_authority_commit_links WHERE namespace_id=$1 AND plan_digest=$2 AND attempt_id=$3
		UNION ALL SELECT 1 FROM agent_evaluation_execution_receipts WHERE namespace_id=$1 AND plan_digest=$2 AND attempt_id=$3
		UNION ALL SELECT 1 FROM agent_evaluation_budget_settlements WHERE namespace_id=$1 AND plan_digest=$2 AND reservation_id=$4
	)`, authority.NamespaceID, partition.PlanDigest, decoded.attempt.AttemptID, input.BudgetSettlement.ReservationID).Scan(&partial); err != nil {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, err
	}
	if partial {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, conflict("evaluation attempt evidence has a partial final join")
	}
	if ledgerRevision != input.BudgetSettlement.ExpectedRevision {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, conflict("evaluation attempt budget revision is stale")
	}
	for _, receipt := range decoded.preDispatchFailures {
		if err := insertEvaluationPreDispatchFailureReceipt(writeContext, tx, authority.NamespaceID, partition, receipt); err != nil {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, err
		}
	}
	for _, source := range decoded.sources {
		if err := insertEvaluationSourceReceiptV3(writeContext, tx, authority.NamespaceID, partition, source); err != nil {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, err
		}
	}
	for _, disposition := range decoded.dispositions {
		if err := insertEvaluationSpoolDispositionV3(writeContext, tx, authority.NamespaceID, partition, disposition); err != nil {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, err
		}
	}
	for _, turn := range decoded.turns {
		if err := insertEvaluationInvocationTurnV3(writeContext, tx, authority.NamespaceID, partition, turn); err != nil {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, err
		}
	}
	if err := insertEvaluationInvocationTurnSetV3(writeContext, tx, authority.NamespaceID, partition, decoded.turnSet); err != nil {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, err
	}
	for _, receipt := range decoded.capabilities {
		if err := insertEvaluationCapabilityExecutionReceipt(writeContext, tx, authority.NamespaceID, partition, receipt); err != nil {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, err
		}
	}
	for _, receipt := range decoded.capabilitySpecifics {
		if err := insertEvaluationCapabilitySpecificReceipt(
			writeContext, tx, authority.NamespaceID, partition, receipt,
		); err != nil {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, err
		}
	}
	if _, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_execution_receipts (
		namespace_id,plan_digest,repository_commit,execution_receipt_id,attempt_id,descriptor_digest,model_invocations,
		tool_calls,repair_rounds,transactions,artifact_bytes,elapsed_ms,tool_receipt_set_digest,transaction_receipt_set_digest,
		verification_closure_digest,receipt_digest,receipt_json,receipt_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18)`, authority.NamespaceID,
		partition.PlanDigest, partition.RepositoryCommit, decoded.execution.ExecutionReceiptID, decoded.execution.AttemptID,
		decoded.execution.DescriptorDigest, decoded.execution.ModelInvocations, decoded.execution.ToolCalls, decoded.execution.RepairRounds,
		decoded.execution.Transactions, decoded.execution.ArtifactBytes, decoded.execution.ElapsedMS,
		nullableEvaluationAuthenticityString(decoded.execution.ToolReceiptSetDigest), nullableEvaluationAuthenticityString(decoded.execution.TransactionReceiptSetDigest),
		nullableEvaluationAuthenticityString(decoded.execution.VerificationClosureDigest), decoded.execution.ReceiptDigest,
		string(decoded.execution.ReceiptBytes), decoded.execution.ReceiptBytes); err != nil {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, err
	}
	if decoded.hasRuntime {
		if err := repository.storeEvaluationResultSubmissionReceiptTx(writeContext, tx, authority, partition, decoded.submission); err != nil {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, err
		}
		if err := repository.storeEvaluationControlledRuntimeReceiptTx(writeContext, tx, authority, partition, decoded.runtime); err != nil {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, err
		}
	}
	if _, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_attempts (
		namespace_id,plan_digest,attempt_id,descriptor_digest,sampling_identity_digest,independent_run_id,shard_id,case_id,target_id,
		status,outcome,attempt_digest,attempt_json,attempt_bytes,started_at,completed_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16)`, authority.NamespaceID,
		partition.PlanDigest, decoded.attempt.AttemptID, decoded.attempt.DescriptorDigest, decoded.attempt.SamplingIdentityDigest,
		decoded.attempt.IndependentRunID, decoded.attempt.ShardID, decoded.attempt.CaseID, decoded.attempt.TargetID,
		decoded.attempt.Status, decoded.attempt.Outcome, decoded.attempt.AttemptDigest, string(decoded.attempt.Canonical),
		decoded.attempt.Canonical, decoded.attempt.StartedAt, decoded.attempt.CompletedAt); err != nil {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, err
	}
	for _, receipt := range decoded.providerObservations {
		if err := insertEvaluationProviderCapabilityObservationCommitLink(
			writeContext, tx, authority.NamespaceID, partition, decoded.attempt, receipt,
		); err != nil {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, err
		}
	}
	for _, receipt := range decoded.attemptAuthorities {
		result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_attempt_authority_commit_links (
			namespace_id,plan_digest,repository_commit,attempt_id,receipt_digest,attempt_digest,committed_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7)`, authority.NamespaceID, partition.PlanDigest,
			partition.RepositoryCommit, decoded.attempt.AttemptID, receipt.ReceiptDigest,
			decoded.attempt.AttemptDigest, decoded.attempt.CompletedAt)
		if err != nil {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, err
		}
		if affected, err := result.RowsAffected(); err != nil || affected != 1 {
			return EvaluationAttemptEvidenceCommitResultV3{}, false, conflict("evaluation attempt-authority commit link CAS was lost")
		}
	}
	nextRevision := ledgerRevision + 1
	if _, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_budget_settlements (
		namespace_id,plan_digest,reservation_id,ledger_revision,settlement_digest,settlement_json,settlement_bytes,settled_at
	) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`, authority.NamespaceID, partition.PlanDigest,
		input.BudgetSettlement.ReservationID, nextRevision, settlement.Digest, string(settlement.Canonical), settlement.Canonical, settlement.SettledAt); err != nil {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, err
	}
	update, err := tx.ExecContext(writeContext, `UPDATE agent_evaluation_budget_ledgers SET revision=$3,updated_at=$4
		WHERE namespace_id=$1 AND plan_digest=$2 AND revision=$5`, authority.NamespaceID, partition.PlanDigest, nextRevision,
		settlement.SettledAt, ledgerRevision)
	if err != nil {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, err
	}
	if affected, err := update.RowsAffected(); err != nil || affected != 1 {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, conflict("evaluation attempt evidence budget CAS was lost")
	}
	if err := tx.Commit(); err != nil {
		return EvaluationAttemptEvidenceCommitResultV3{}, false, err
	}
	settlementRecord := EvaluationBudgetSettlementRecord{NamespaceID: authority.NamespaceID, PlanDigest: partition.PlanDigest,
		ReservationID: input.BudgetSettlement.ReservationID, LedgerRevision: nextRevision, SettlementDigest: settlement.Digest,
		SettlementBytes: settlement.Canonical, SettledAt: settlement.SettledAt}
	return evaluationAttemptCommitResultV3(authority.NamespaceID, partition, decoded, settlementRecord), false, nil
}

var _ = sort.Slice
