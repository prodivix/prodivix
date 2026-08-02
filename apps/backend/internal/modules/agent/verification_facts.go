package agent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type verificationEvidenceRefFact struct {
	EvidenceID     string
	ManifestDigest string
	Outcome        string
}

type verificationPlanBindingFact struct {
	BindingID                      string
	TaskID                         string
	RunID                          string
	ProposalID                     string
	PreviewID                      string
	DecisionID                     string
	MutationReceiptID              string
	MutationKind                   string
	VerificationRunID              string
	TargetRevision                 map[string]any
	TargetRevisionDigest           string
	ApprovedPlanDigest             string
	ActualPlanDigest               string
	PlanCompatibility              string
	ImpactDigest                   string
	PolicyDigest                   string
	ApprovedRequiredCellSetDigest  string
	ActualRequiredCellSetDigest    string
	RegressionRequirementSetDigest string
	ProducerKind                   string
	ProducerID                     string
	BoundAt                        time.Time
	BindingDigest                  string
	Value                          map[string]any
	Canonical                      []byte
}

type verificationClosureReceiptFact struct {
	ReceiptID                  string
	BindingID                  string
	TaskID                     string
	RunID                      string
	VerificationRunID          string
	TargetRevision             map[string]any
	TargetRevisionDigest       string
	PlanDigest                 string
	EvidenceRefs               []verificationEvidenceRefFact
	EvidenceSetDigest          string
	VerifiedEvidenceViewDigest string
	ClosureDigest              string
	Verdict                    string
	ProducerKind               string
	ProducerID                 string
	EvaluatedAt                time.Time
	ReceiptDigest              string
	Value                      map[string]any
	Canonical                  []byte
}

type repairRoundReceiptFact struct {
	ReceiptID                      string
	RepairRoundID                  string
	State                          string
	TaskID                         string
	RunID                          string
	Round                          int64
	FailedClosureReceiptID         string
	FailedClosureDigest            string
	FailedEvidenceManifestDigests  []string
	FailureContextPackDigest       string
	CounterexampleSetDigest        string
	RegressionRequirementSetDigest string
	CumulativeBudgetLedgerDigest   string
	ProposalID                     string
	PreviewID                      string
	DecisionID                     string
	TransactionDigest              string
	VerificationPlanDigest         string
	BlockReason                    string
	ProducerKind                   string
	ProducerID                     string
	RecordedAt                     time.Time
	ReceiptDigest                  string
	Value                          map[string]any
	Canonical                      []byte
}

func decodeVerificationEnvelope(source []byte, expectedType string) (decodedFact, error) {
	if err := agentcontract.ValidateVerificationFact(json.RawMessage(source)); err != nil {
		return decodedFact{}, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var envelope map[string]any
	if err := decoder.Decode(&envelope); err != nil {
		return decodedFact{}, fmt.Errorf("%w: decode verification fact: %v", ErrInvalid, err)
	}
	factType, _ := envelope["factType"].(string)
	if factType != expectedType {
		return decodedFact{}, fmt.Errorf("%w: expected %s, got %s", ErrInvalid, expectedType, factType)
	}
	value, ok := envelope["value"].(map[string]any)
	if !ok {
		return decodedFact{}, fmt.Errorf("%w: verification fact value is not an object", ErrInvalid)
	}
	canonical, err := canonicaljson.Bytes(envelope)
	if err != nil {
		return decodedFact{}, fmt.Errorf("%w: canonicalize verification fact: %v", ErrInvalid, err)
	}
	return decodedFact{FactType: factType, Value: value, Canonical: canonical}, nil
}

func producerMembers(value map[string]any) (string, string) {
	producer, _ := objectMember(value, "producer")
	return stringMember(producer, "kind"), stringMember(producer, "principalId")
}

func decodeVerificationPlanBinding(source []byte) (verificationPlanBindingFact, error) {
	fact, err := decodeVerificationEnvelope(source, "committed-plan-binding")
	if err != nil {
		return verificationPlanBindingFact{}, err
	}
	revision, revisionDigest, err := revisionMember(fact.Value, "targetRevision")
	if err != nil {
		return verificationPlanBindingFact{}, err
	}
	boundAt, err := instantMember(fact.Value, "boundAt")
	if err != nil {
		return verificationPlanBindingFact{}, err
	}
	producerKind, producerID := producerMembers(fact.Value)
	return verificationPlanBindingFact{
		BindingID: stringMember(fact.Value, "bindingId"), TaskID: stringMember(fact.Value, "taskId"),
		RunID: stringMember(fact.Value, "runId"), ProposalID: stringMember(fact.Value, "proposalId"),
		PreviewID: stringMember(fact.Value, "previewId"), DecisionID: stringMember(fact.Value, "decisionId"),
		MutationReceiptID: stringMember(fact.Value, "mutationReceiptId"), MutationKind: stringMember(fact.Value, "mutationKind"),
		VerificationRunID: stringMember(fact.Value, "verificationRunId"), TargetRevision: revision,
		TargetRevisionDigest: revisionDigest, ApprovedPlanDigest: stringMember(fact.Value, "approvedPlanDigest"),
		ActualPlanDigest: stringMember(fact.Value, "actualPlanDigest"), PlanCompatibility: stringMember(fact.Value, "planCompatibility"),
		ImpactDigest: stringMember(fact.Value, "impactDigest"), PolicyDigest: stringMember(fact.Value, "policyDigest"),
		ApprovedRequiredCellSetDigest:  stringMember(fact.Value, "approvedRequiredCellSetDigest"),
		ActualRequiredCellSetDigest:    stringMember(fact.Value, "actualRequiredCellSetDigest"),
		RegressionRequirementSetDigest: stringMember(fact.Value, "regressionRequirementSetDigest"),
		ProducerKind:                   producerKind, ProducerID: producerID, BoundAt: boundAt,
		BindingDigest: stringMember(fact.Value, "bindingDigest"), Value: fact.Value, Canonical: fact.Canonical,
	}, nil
}

func decodeVerificationClosureReceipt(source []byte) (verificationClosureReceiptFact, error) {
	fact, err := decodeVerificationEnvelope(source, "verification-closure-receipt")
	if err != nil {
		return verificationClosureReceiptFact{}, err
	}
	revision, revisionDigest, err := revisionMember(fact.Value, "targetRevision")
	if err != nil {
		return verificationClosureReceiptFact{}, err
	}
	evaluatedAt, err := instantMember(fact.Value, "evaluatedAt")
	if err != nil {
		return verificationClosureReceiptFact{}, err
	}
	rawRefs, _ := arrayMember(fact.Value, "evidenceRefs")
	refs := make([]verificationEvidenceRefFact, 0, len(rawRefs))
	for _, raw := range rawRefs {
		ref, _ := raw.(map[string]any)
		refs = append(refs, verificationEvidenceRefFact{
			EvidenceID: stringMember(ref, "evidenceId"), ManifestDigest: stringMember(ref, "manifestDigest"), Outcome: stringMember(ref, "outcome"),
		})
	}
	producerKind, producerID := producerMembers(fact.Value)
	return verificationClosureReceiptFact{
		ReceiptID: stringMember(fact.Value, "receiptId"), BindingID: stringMember(fact.Value, "bindingId"),
		TaskID: stringMember(fact.Value, "taskId"), RunID: stringMember(fact.Value, "runId"),
		VerificationRunID: stringMember(fact.Value, "verificationRunId"), TargetRevision: revision,
		TargetRevisionDigest: revisionDigest, PlanDigest: stringMember(fact.Value, "planDigest"), EvidenceRefs: refs,
		EvidenceSetDigest: stringMember(fact.Value, "evidenceSetDigest"), VerifiedEvidenceViewDigest: stringMember(fact.Value, "verifiedEvidenceViewDigest"),
		ClosureDigest: stringMember(fact.Value, "closureDigest"), Verdict: stringMember(fact.Value, "verdict"),
		ProducerKind: producerKind, ProducerID: producerID, EvaluatedAt: evaluatedAt,
		ReceiptDigest: stringMember(fact.Value, "receiptDigest"), Value: fact.Value, Canonical: fact.Canonical,
	}, nil
}

func decodeRepairRoundReceipt(source []byte) (repairRoundReceiptFact, error) {
	fact, err := decodeVerificationEnvelope(source, "repair-round-receipt")
	if err != nil {
		return repairRoundReceiptFact{}, err
	}
	round, ok := integerMember(fact.Value, "round")
	if !ok {
		return repairRoundReceiptFact{}, ErrInvalid
	}
	recordedAt, err := instantMember(fact.Value, "recordedAt")
	if err != nil {
		return repairRoundReceiptFact{}, err
	}
	rawDigests, _ := arrayMember(fact.Value, "failedEvidenceManifestDigests")
	digests := make([]string, 0, len(rawDigests))
	for _, raw := range rawDigests {
		digest, _ := raw.(string)
		digests = append(digests, digest)
	}
	producerKind, producerID := producerMembers(fact.Value)
	return repairRoundReceiptFact{
		ReceiptID: stringMember(fact.Value, "receiptId"), RepairRoundID: stringMember(fact.Value, "repairRoundId"),
		State: stringMember(fact.Value, "state"), TaskID: stringMember(fact.Value, "taskId"), RunID: stringMember(fact.Value, "runId"), Round: round,
		FailedClosureReceiptID: stringMember(fact.Value, "failedClosureReceiptId"), FailedClosureDigest: stringMember(fact.Value, "failedClosureDigest"),
		FailedEvidenceManifestDigests: digests, FailureContextPackDigest: stringMember(fact.Value, "failureContextPackDigest"),
		CounterexampleSetDigest: stringMember(fact.Value, "counterexampleSetDigest"), RegressionRequirementSetDigest: stringMember(fact.Value, "regressionRequirementSetDigest"),
		CumulativeBudgetLedgerDigest: stringMember(fact.Value, "cumulativeBudgetLedgerDigest"), ProposalID: stringMember(fact.Value, "proposalId"),
		PreviewID: stringMember(fact.Value, "previewId"), DecisionID: stringMember(fact.Value, "decisionId"),
		TransactionDigest: stringMember(fact.Value, "transactionDigest"), VerificationPlanDigest: stringMember(fact.Value, "verificationPlanDigest"),
		BlockReason: stringMember(fact.Value, "blockReason"), ProducerKind: producerKind, ProducerID: producerID,
		RecordedAt: recordedAt, ReceiptDigest: stringMember(fact.Value, "receiptDigest"), Value: fact.Value, Canonical: fact.Canonical,
	}, nil
}
