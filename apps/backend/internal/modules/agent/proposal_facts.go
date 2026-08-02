package agent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type proposalFact struct {
	ProposalID         string
	TaskID             string
	RunID              string
	ContextPackDigest  string
	ProposalDigest     string
	BaseRevision       map[string]any
	BaseRevisionDigest string
	Value              map[string]any
	Canonical          []byte
}

type planningFact struct {
	ProposalID               string
	PlanningDigest           string
	ProposedSnapshotDigest   string
	TransactionDigest        string
	ReverseTransactionDigest string
	SemanticDiffDigest       string
	ImpactDigest             string
	VerificationPlanDigest   string
	SourceTraceDigest        string
	BaseRevision             map[string]any
	PlannedAt                time.Time
	ExpiresAt                time.Time
	Value                    map[string]any
	Canonical                []byte
}

type previewFact struct {
	PreviewID                string
	ProposalID               string
	PreviewDigest            string
	ProposedSnapshotDigest   string
	TransactionDigest        string
	ReverseTransactionDigest string
	SemanticDiffDigest       string
	ImpactDigest             string
	VerificationPlanDigest   string
	BaseRevision             map[string]any
	ExpiresAt                time.Time
	Value                    map[string]any
	Canonical                []byte
}

type approvalFact struct {
	DecisionID             string
	Decision               string
	ActorKind              string
	ActorID                string
	TaskID                 string
	RunID                  string
	PreviewID              string
	PreviewDigest          string
	TransactionDigest      string
	ImpactDigest           string
	VerificationPlanDigest string
	GrantID                string
	PolicyDigest           string
	RollbackAuthorization  string
	BaseRevision           map[string]any
	DecisionDigest         string
	DecidedAt              time.Time
	ExpiresAt              time.Time
	Value                  map[string]any
	Canonical              []byte
}

type mutationReceiptFact struct {
	ReceiptID                string
	Kind                     string
	State                    string
	TaskID                   string
	RunID                    string
	ProposalID               string
	PreviewID                string
	DecisionID               string
	OperationID              string
	BaseRevision             map[string]any
	BaseRevisionDigest       string
	TargetRevision           map[string]any
	TargetRevisionDigest     string
	TransactionDigest        string
	ReverseTransactionDigest string
	RequestDigest            string
	ProducerKind             string
	ProducerID               string
	MutationDigest           string
	ConflictDigest           string
	ReceiptDigest            string
	StartedAt                time.Time
	CompletedAt              *time.Time
	Value                    map[string]any
	Canonical                []byte
}

func decodeProposalEnvelope(source []byte, expectedType string) (decodedFact, error) {
	if err := agentcontract.ValidateProposalFact(json.RawMessage(source)); err != nil {
		return decodedFact{}, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var envelope map[string]any
	if err := decoder.Decode(&envelope); err != nil {
		return decodedFact{}, fmt.Errorf("%w: decode proposal fact: %v", ErrInvalid, err)
	}
	factType, _ := envelope["factType"].(string)
	if factType != expectedType {
		return decodedFact{}, fmt.Errorf("%w: expected %s, got %s", ErrInvalid, expectedType, factType)
	}
	value, ok := envelope["value"].(map[string]any)
	if !ok {
		return decodedFact{}, fmt.Errorf("%w: proposal fact value is not an object", ErrInvalid)
	}
	canonical, err := canonicaljson.Bytes(envelope)
	if err != nil {
		return decodedFact{}, fmt.Errorf("%w: canonicalize proposal fact: %v", ErrInvalid, err)
	}
	return decodedFact{FactType: factType, Value: value, Canonical: canonical}, nil
}

func revisionMember(value map[string]any, key string) (map[string]any, string, error) {
	revision, ok := objectMember(value, key)
	if !ok {
		return nil, "", invalid(key + " must be a revision object")
	}
	digest, err := canonicaljson.Digest(revision)
	if err != nil {
		return nil, "", invalid(key + " cannot be canonicalized")
	}
	return revision, digest, nil
}

func decodeProposal(source []byte) (proposalFact, error) {
	fact, err := decodeProposalEnvelope(source, "proposal")
	if err != nil {
		return proposalFact{}, err
	}
	revision, revisionDigest, err := revisionMember(fact.Value, "baseRevision")
	if err != nil {
		return proposalFact{}, err
	}
	return proposalFact{
		ProposalID:         stringMember(fact.Value, "proposalId"),
		TaskID:             stringMember(fact.Value, "taskId"),
		RunID:              stringMember(fact.Value, "runId"),
		ContextPackDigest:  stringMember(fact.Value, "contextPackDigest"),
		ProposalDigest:     stringMember(fact.Value, "proposalDigest"),
		BaseRevision:       revision,
		BaseRevisionDigest: revisionDigest,
		Value:              fact.Value,
		Canonical:          fact.Canonical,
	}, nil
}

func decodePlanning(source []byte) (planningFact, error) {
	fact, err := decodeProposalEnvelope(source, "planning")
	if err != nil {
		return planningFact{}, err
	}
	revision, _, err := revisionMember(fact.Value, "baseRevision")
	if err != nil {
		return planningFact{}, err
	}
	plannedAt, err := instantMember(fact.Value, "plannedAt")
	if err != nil {
		return planningFact{}, err
	}
	expiresAt, err := instantMember(fact.Value, "expiresAt")
	if err != nil {
		return planningFact{}, err
	}
	return planningFact{
		ProposalID:               stringMember(fact.Value, "proposalId"),
		PlanningDigest:           stringMember(fact.Value, "planningDigest"),
		ProposedSnapshotDigest:   stringMember(fact.Value, "proposedSnapshotDigest"),
		TransactionDigest:        stringMember(fact.Value, "transactionDigest"),
		ReverseTransactionDigest: stringMember(fact.Value, "reverseTransactionDigest"),
		SemanticDiffDigest:       stringMember(fact.Value, "semanticDiffDigest"),
		ImpactDigest:             stringMember(fact.Value, "impactDigest"),
		VerificationPlanDigest:   stringMember(fact.Value, "verificationPlanDigest"),
		SourceTraceDigest:        stringMember(fact.Value, "sourceTraceDigest"),
		BaseRevision:             revision,
		PlannedAt:                plannedAt,
		ExpiresAt:                expiresAt,
		Value:                    fact.Value,
		Canonical:                fact.Canonical,
	}, nil
}

func decodePreview(source []byte) (previewFact, error) {
	fact, err := decodeProposalEnvelope(source, "preview")
	if err != nil {
		return previewFact{}, err
	}
	revision, _, err := revisionMember(fact.Value, "baseRevision")
	if err != nil {
		return previewFact{}, err
	}
	expiresAt, err := instantMember(fact.Value, "expiresAt")
	if err != nil {
		return previewFact{}, err
	}
	return previewFact{
		PreviewID:                stringMember(fact.Value, "previewId"),
		ProposalID:               stringMember(fact.Value, "proposalId"),
		PreviewDigest:            stringMember(fact.Value, "previewDigest"),
		ProposedSnapshotDigest:   stringMember(fact.Value, "proposedSnapshotDigest"),
		TransactionDigest:        stringMember(fact.Value, "transactionDigest"),
		ReverseTransactionDigest: stringMember(fact.Value, "reverseTransactionDigest"),
		SemanticDiffDigest:       stringMember(fact.Value, "semanticDiffDigest"),
		ImpactDigest:             stringMember(fact.Value, "impactDigest"),
		VerificationPlanDigest:   stringMember(fact.Value, "verificationPlanDigest"),
		BaseRevision:             revision,
		ExpiresAt:                expiresAt,
		Value:                    fact.Value,
		Canonical:                fact.Canonical,
	}, nil
}

func decodeApproval(source []byte) (approvalFact, error) {
	fact, err := decodeProposalEnvelope(source, "approval")
	if err != nil {
		return approvalFact{}, err
	}
	actor, _ := objectMember(fact.Value, "actor")
	grant, _ := objectMember(fact.Value, "grantRef")
	revision, _, err := revisionMember(fact.Value, "baseRevision")
	if err != nil {
		return approvalFact{}, err
	}
	decidedAt, err := instantMember(fact.Value, "decidedAt")
	if err != nil {
		return approvalFact{}, err
	}
	expiresAt, err := instantMember(fact.Value, "expiresAt")
	if err != nil {
		return approvalFact{}, err
	}
	digest, err := canonicaljson.Digest(fact.Value)
	if err != nil {
		return approvalFact{}, invalid("approval decision cannot be canonicalized")
	}
	return approvalFact{
		DecisionID:             stringMember(fact.Value, "decisionId"),
		Decision:               stringMember(fact.Value, "decision"),
		ActorKind:              stringMember(actor, "kind"),
		ActorID:                stringMember(actor, "principalId"),
		TaskID:                 stringMember(fact.Value, "taskId"),
		RunID:                  stringMember(fact.Value, "runId"),
		PreviewID:              stringMember(fact.Value, "previewId"),
		PreviewDigest:          stringMember(fact.Value, "previewDigest"),
		TransactionDigest:      stringMember(fact.Value, "transactionDigest"),
		ImpactDigest:           stringMember(fact.Value, "impactDigest"),
		VerificationPlanDigest: stringMember(fact.Value, "verificationPlanDigest"),
		GrantID:                stringMember(grant, "grantId"),
		PolicyDigest:           stringMember(fact.Value, "policyDigest"),
		RollbackAuthorization:  stringMember(fact.Value, "rollbackAuthorization"),
		BaseRevision:           revision,
		DecisionDigest:         digest,
		DecidedAt:              decidedAt,
		ExpiresAt:              expiresAt,
		Value:                  fact.Value,
		Canonical:              fact.Canonical,
	}, nil
}

func decodeMutationReceipt(source []byte) (mutationReceiptFact, error) {
	fact, err := decodeProposalEnvelope(source, "workspace-mutation-receipt")
	if err != nil {
		return mutationReceiptFact{}, err
	}
	producer, _ := objectMember(fact.Value, "producer")
	baseRevision, baseDigest, err := revisionMember(fact.Value, "baseRevision")
	if err != nil {
		return mutationReceiptFact{}, err
	}
	var targetRevision map[string]any
	var targetDigest string
	if _, exists := fact.Value["targetRevision"]; exists {
		targetRevision, targetDigest, err = revisionMember(fact.Value, "targetRevision")
		if err != nil {
			return mutationReceiptFact{}, err
		}
	}
	startedAt, err := instantMember(fact.Value, "startedAt")
	if err != nil {
		return mutationReceiptFact{}, err
	}
	var completedAt *time.Time
	if _, exists := fact.Value["completedAt"]; exists {
		parsed, parseErr := instantMember(fact.Value, "completedAt")
		if parseErr != nil {
			return mutationReceiptFact{}, parseErr
		}
		completedAt = &parsed
	}
	return mutationReceiptFact{
		ReceiptID:                stringMember(fact.Value, "receiptId"),
		Kind:                     stringMember(fact.Value, "kind"),
		State:                    stringMember(fact.Value, "state"),
		TaskID:                   stringMember(fact.Value, "taskId"),
		RunID:                    stringMember(fact.Value, "runId"),
		ProposalID:               stringMember(fact.Value, "proposalId"),
		PreviewID:                stringMember(fact.Value, "previewId"),
		DecisionID:               stringMember(fact.Value, "decisionId"),
		OperationID:              stringMember(fact.Value, "operationId"),
		BaseRevision:             baseRevision,
		BaseRevisionDigest:       baseDigest,
		TargetRevision:           targetRevision,
		TargetRevisionDigest:     targetDigest,
		TransactionDigest:        stringMember(fact.Value, "transactionDigest"),
		ReverseTransactionDigest: stringMember(fact.Value, "reverseTransactionDigest"),
		RequestDigest:            stringMember(fact.Value, "requestDigest"),
		ProducerKind:             stringMember(producer, "kind"),
		ProducerID:               stringMember(producer, "principalId"),
		MutationDigest:           stringMember(fact.Value, "mutationDigest"),
		ConflictDigest:           stringMember(fact.Value, "conflictDigest"),
		ReceiptDigest:            stringMember(fact.Value, "receiptDigest"),
		StartedAt:                startedAt,
		CompletedAt:              completedAt,
		Value:                    fact.Value,
		Canonical:                fact.Canonical,
	}, nil
}
