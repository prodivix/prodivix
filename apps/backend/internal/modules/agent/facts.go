package agent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type decodedFact struct {
	FactType  string
	Value     map[string]any
	Canonical []byte
}

type taskFact struct {
	WorkspaceID    string
	ProjectID      string
	TaskID         string
	ActorKind      string
	ActorID        string
	Mode           string
	IdempotencyKey string
	TaskDigest     string
	PolicyDigest   string
	InitialGrantID string
	Spec           map[string]any
	CreatedAt      time.Time
	Canonical      []byte
}

type runFact struct {
	WorkspaceID       string
	TaskID            string
	RunID             string
	TaskDigest        string
	PolicyDigest      string
	GrantID           string
	Generation        int64
	Attempt           int64
	Phase             string
	Outcome           string
	Cursor            int64
	CallbackAuthority string
	CleanupState      string
	BudgetRevision    int64
	LatestEventDigest string
	SnapshotDigest    string
	CreatedAt         time.Time
	UpdatedAt         time.Time
	Value             map[string]any
	Canonical         []byte
}

type eventFact struct {
	TaskID              string
	RunID               string
	Generation          int64
	Sequence            int64
	Family              string
	Type                string
	IdempotencyKey      string
	RequestDigest       string
	PayloadDigest       string
	PolicyDigest        string
	GrantID             string
	PreviousEventDigest string
	EventDigest         string
	OccurredAt          time.Time
	Data                map[string]any
	Value               map[string]any
	Canonical           []byte
}

func decodeControlFact(source []byte, expectedType string) (decodedFact, error) {
	if err := agentcontract.ValidateControlFact(json.RawMessage(source)); err != nil {
		return decodedFact{}, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var envelope map[string]any
	if err := decoder.Decode(&envelope); err != nil {
		return decodedFact{}, fmt.Errorf("%w: decode control fact: %v", ErrInvalid, err)
	}
	factType, _ := envelope["factType"].(string)
	if factType != expectedType {
		return decodedFact{}, fmt.Errorf("%w: expected %s, got %s", ErrInvalid, expectedType, factType)
	}
	value, ok := envelope["value"].(map[string]any)
	if !ok {
		return decodedFact{}, fmt.Errorf("%w: control fact value is not an object", ErrInvalid)
	}
	canonical, err := canonicaljson.Bytes(envelope)
	if err != nil {
		return decodedFact{}, fmt.Errorf("%w: canonicalize control fact: %v", ErrInvalid, err)
	}
	return decodedFact{FactType: factType, Value: value, Canonical: canonical}, nil
}

func decodeTaskFact(source []byte) (taskFact, error) {
	fact, err := decodeControlFact(source, "task-record")
	if err != nil {
		return taskFact{}, err
	}
	spec, ok := objectMember(fact.Value, "spec")
	if !ok {
		return taskFact{}, ErrInvalid
	}
	actor, ok := objectMember(spec, "actor")
	if !ok {
		return taskFact{}, ErrInvalid
	}
	grant, ok := objectMember(spec, "initialGrantRef")
	if !ok {
		return taskFact{}, ErrInvalid
	}
	createdAt, err := instantMember(spec, "createdAt")
	if err != nil {
		return taskFact{}, err
	}
	return taskFact{
		WorkspaceID:    stringMember(spec, "workspaceId"),
		ProjectID:      stringMember(spec, "projectId"),
		TaskID:         stringMember(spec, "taskId"),
		ActorKind:      stringMember(actor, "kind"),
		ActorID:        stringMember(actor, "principalId"),
		Mode:           stringMember(spec, "mode"),
		IdempotencyKey: stringMember(spec, "idempotencyKey"),
		TaskDigest:     stringMember(fact.Value, "taskDigest"),
		PolicyDigest:   stringMember(spec, "policyDigest"),
		InitialGrantID: stringMember(grant, "grantId"),
		Spec:           spec,
		CreatedAt:      createdAt,
		Canonical:      fact.Canonical,
	}, nil
}

func decodeRunFact(source []byte) (runFact, error) {
	fact, err := decodeControlFact(source, "run-snapshot")
	if err != nil {
		return runFact{}, err
	}
	run, ok := objectMember(fact.Value, "run")
	if !ok {
		return runFact{}, ErrInvalid
	}
	grant, ok := objectMember(run, "grantRef")
	if !ok {
		return runFact{}, ErrInvalid
	}
	ledger, ok := objectMember(fact.Value, "budgetLedger")
	if !ok {
		return runFact{}, ErrInvalid
	}
	createdAt, err := instantMember(run, "createdAt")
	if err != nil {
		return runFact{}, err
	}
	updatedAt, err := instantMember(run, "updatedAt")
	if err != nil {
		return runFact{}, err
	}
	generation, ok := integerMember(run, "generation")
	if !ok {
		return runFact{}, ErrInvalid
	}
	attempt, ok := integerMember(run, "attempt")
	if !ok {
		return runFact{}, ErrInvalid
	}
	cursor, ok := integerMember(fact.Value, "cursor")
	if !ok {
		return runFact{}, ErrInvalid
	}
	budgetRevision, ok := integerMember(ledger, "revision")
	if !ok {
		return runFact{}, ErrInvalid
	}
	return runFact{
		TaskID:            stringMember(run, "taskId"),
		RunID:             stringMember(run, "runId"),
		TaskDigest:        stringMember(fact.Value, "taskDigest"),
		PolicyDigest:      stringMember(run, "policyDigest"),
		GrantID:           stringMember(grant, "grantId"),
		Generation:        generation,
		Attempt:           attempt,
		Phase:             stringMember(run, "phase"),
		Outcome:           stringMember(run, "outcome"),
		Cursor:            cursor,
		CallbackAuthority: stringMember(fact.Value, "callbackAuthority"),
		CleanupState:      stringMember(fact.Value, "cleanupState"),
		BudgetRevision:    budgetRevision,
		LatestEventDigest: stringMember(run, "latestEventDigest"),
		SnapshotDigest:    stringMember(fact.Value, "snapshotDigest"),
		CreatedAt:         createdAt,
		UpdatedAt:         updatedAt,
		Value:             fact.Value,
		Canonical:         fact.Canonical,
	}, nil
}

func decodeEventFact(source []byte) (eventFact, error) {
	fact, err := decodeControlFact(source, "run-event")
	if err != nil {
		return eventFact{}, err
	}
	grant, ok := objectMember(fact.Value, "grantRef")
	if !ok {
		return eventFact{}, ErrInvalid
	}
	data, ok := objectMember(fact.Value, "data")
	if !ok {
		return eventFact{}, ErrInvalid
	}
	generation, ok := integerMember(fact.Value, "generation")
	if !ok {
		return eventFact{}, ErrInvalid
	}
	sequence, ok := integerMember(fact.Value, "sequence")
	if !ok {
		return eventFact{}, ErrInvalid
	}
	occurredAt, err := instantMember(fact.Value, "occurredAt")
	if err != nil {
		return eventFact{}, err
	}
	return eventFact{
		TaskID:              stringMember(fact.Value, "taskId"),
		RunID:               stringMember(fact.Value, "runId"),
		Generation:          generation,
		Sequence:            sequence,
		Family:              stringMember(fact.Value, "family"),
		Type:                stringMember(fact.Value, "type"),
		IdempotencyKey:      stringMember(fact.Value, "idempotencyKey"),
		RequestDigest:       stringMember(fact.Value, "requestDigest"),
		PayloadDigest:       stringMember(fact.Value, "payloadDigest"),
		PolicyDigest:        stringMember(fact.Value, "policyDigest"),
		GrantID:             stringMember(grant, "grantId"),
		PreviousEventDigest: stringMember(fact.Value, "previousEventDigest"),
		EventDigest:         stringMember(fact.Value, "eventDigest"),
		OccurredAt:          occurredAt,
		Data:                data,
		Value:               fact.Value,
		Canonical:           fact.Canonical,
	}, nil
}

func objectMember(value map[string]any, key string) (map[string]any, bool) {
	member, ok := value[key].(map[string]any)
	return member, ok
}

func arrayMember(value map[string]any, key string) ([]any, bool) {
	member, ok := value[key].([]any)
	return member, ok
}

func stringMember(value map[string]any, key string) string {
	member, _ := value[key].(string)
	return member
}

func integerMember(value map[string]any, key string) (int64, bool) {
	switch member := value[key].(type) {
	case json.Number:
		parsed, err := member.Int64()
		return parsed, err == nil
	case float64:
		parsed := int64(member)
		return parsed, float64(parsed) == member
	default:
		return 0, false
	}
}

func instantMember(value map[string]any, key string) (time.Time, error) {
	text := stringMember(value, key)
	parsed, err := time.Parse(time.RFC3339Nano, text)
	if err != nil {
		return time.Time{}, fmt.Errorf("%w: %s is not an instant", ErrInvalid, key)
	}
	return parsed.UTC(), nil
}

func canonicalMember(value any) ([]byte, error) {
	encoded, err := canonicaljson.Bytes(value)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	return encoded, nil
}

func sameMember(left, right any) bool {
	leftBytes, leftErr := canonicaljson.Bytes(left)
	rightBytes, rightErr := canonicaljson.Bytes(right)
	return leftErr == nil && rightErr == nil && bytes.Equal(leftBytes, rightBytes)
}

func requireObject(value any, name string) (map[string]any, error) {
	object, ok := value.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("%w: %s must be an object", ErrInvalid, name)
	}
	return object, nil
}

func requireArray(value any, name string) ([]any, error) {
	array, ok := value.([]any)
	if !ok {
		return nil, fmt.Errorf("%w: %s must be an array", ErrInvalid, name)
	}
	return array, nil
}

func conflict(reason string) error {
	return fmt.Errorf("%w: %s", ErrConflict, reason)
}

func invalid(reason string) error {
	return fmt.Errorf("%w: %s", ErrInvalid, reason)
}
