package agent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type productSupplementFact struct {
	SupplementID      string
	TaskID            string
	RunID             string
	Generation        int64
	RunSnapshotDigest string
	ProposalID        string
	PreviewID         string
	ProducerID        string
	SupplementDigest  string
	ProjectedAt       time.Time
	Value             map[string]any
	Canonical         []byte
}

type runUserCommandFact struct {
	CommandID              string
	TaskID                 string
	RunID                  string
	Kind                   string
	ActorID                string
	ExpectedGeneration     int64
	ExpectedSnapshotDigest string
	IdempotencyKey         string
	CommandDigest          string
	RequestedAt            time.Time
	Value                  map[string]any
	Canonical              []byte
}

func decodeProductFact(source []byte, expectedType string) (decodedFact, error) {
	if err := agentcontract.ValidateProductFact(json.RawMessage(source)); err != nil {
		return decodedFact{}, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var envelope map[string]any
	if err := decoder.Decode(&envelope); err != nil {
		return decodedFact{}, fmt.Errorf("%w: decode product fact: %v", ErrInvalid, err)
	}
	factType, _ := envelope["factType"].(string)
	if factType != expectedType {
		return decodedFact{}, fmt.Errorf("%w: expected %s, got %s", ErrInvalid, expectedType, factType)
	}
	value, ok := envelope["value"].(map[string]any)
	if !ok {
		return decodedFact{}, fmt.Errorf("%w: product fact value is not an object", ErrInvalid)
	}
	canonical, err := canonicaljson.Bytes(envelope)
	if err != nil {
		return decodedFact{}, fmt.Errorf("%w: canonicalize product fact: %v", ErrInvalid, err)
	}
	return decodedFact{FactType: factType, Value: value, Canonical: canonical}, nil
}

func decodeProductSupplement(source []byte) (productSupplementFact, error) {
	fact, err := decodeProductFact(source, "product-supplement")
	if err != nil {
		return productSupplementFact{}, err
	}
	producer, ok := objectMember(fact.Value, "producer")
	if !ok {
		return productSupplementFact{}, ErrInvalid
	}
	generation, ok := integerMember(fact.Value, "generation")
	if !ok {
		return productSupplementFact{}, ErrInvalid
	}
	projectedAt, err := instantMember(fact.Value, "projectedAt")
	if err != nil {
		return productSupplementFact{}, err
	}
	proposalID, previewID := "", ""
	if review, present := objectMember(fact.Value, "proposalReview"); present {
		proposalID = stringMember(review, "proposalId")
		previewID = stringMember(review, "previewId")
	}
	return productSupplementFact{
		SupplementID: stringMember(fact.Value, "supplementId"), TaskID: stringMember(fact.Value, "taskId"),
		RunID: stringMember(fact.Value, "runId"), Generation: generation,
		RunSnapshotDigest: stringMember(fact.Value, "runSnapshotDigest"), ProposalID: proposalID,
		PreviewID: previewID, ProducerID: stringMember(producer, "principalId"),
		SupplementDigest: stringMember(fact.Value, "supplementDigest"), ProjectedAt: projectedAt,
		Value: fact.Value, Canonical: fact.Canonical,
	}, nil
}

func decodeRunUserCommand(source []byte) (runUserCommandFact, error) {
	fact, err := decodeProductFact(source, "run-user-command")
	if err != nil {
		return runUserCommandFact{}, err
	}
	actor, ok := objectMember(fact.Value, "actor")
	if !ok {
		return runUserCommandFact{}, ErrInvalid
	}
	generation, ok := integerMember(fact.Value, "expectedGeneration")
	if !ok {
		return runUserCommandFact{}, ErrInvalid
	}
	requestedAt, err := instantMember(fact.Value, "requestedAt")
	if err != nil {
		return runUserCommandFact{}, err
	}
	return runUserCommandFact{
		CommandID: stringMember(fact.Value, "commandId"), TaskID: stringMember(fact.Value, "taskId"),
		RunID: stringMember(fact.Value, "runId"), Kind: stringMember(fact.Value, "kind"),
		ActorID: stringMember(actor, "principalId"), ExpectedGeneration: generation,
		ExpectedSnapshotDigest: stringMember(fact.Value, "expectedSnapshotDigest"),
		IdempotencyKey:         stringMember(fact.Value, "idempotencyKey"),
		CommandDigest:          stringMember(fact.Value, "commandDigest"), RequestedAt: requestedAt,
		Value: fact.Value, Canonical: fact.Canonical,
	}, nil
}
