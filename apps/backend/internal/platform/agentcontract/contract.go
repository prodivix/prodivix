package agentcontract

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
	"github.com/santhosh-tekuri/jsonschema/v6"
)

const maximumAgentPolicyBytes = 1_048_576
const maximumAgentControlBytes = 8_388_608
const maximumAgentProposalBytes = 8_388_608
const maximumAgentVerificationBytes = 8_388_608
const maximumAgentProductBytes = 8_388_608
const maximumAgentEvaluationBytes = 8_388_608
const maximumAgentG4ClosureBytes = 8_388_608

//go:embed schemas.generated.json
var generatedSchemasJSON []byte

var schemas = mustCompileSchemas()

func mustCompileSchemas() map[string]*jsonschema.Schema {
	var documents map[string]json.RawMessage
	if err := json.Unmarshal(generatedSchemasJSON, &documents); err != nil {
		panic(fmt.Errorf("decode generated Agent schemas: %w", err))
	}
	result := make(map[string]*jsonschema.Schema, len(documents))
	for identity, raw := range documents {
		document, err := jsonschema.UnmarshalJSON(bytes.NewReader(raw))
		if err != nil {
			panic(fmt.Errorf("decode generated Agent schema %s: %w", identity, err))
		}
		resource := fmt.Sprintf("https://prodivix.dev/backend/agent/%s.json", identity)
		compiler := jsonschema.NewCompiler()
		compiler.DefaultDraft(jsonschema.Draft2020)
		if err := compiler.AddResource(resource, document); err != nil {
			panic(fmt.Errorf("register generated Agent schema %s: %w", identity, err))
		}
		schema, err := compiler.Compile(resource)
		if err != nil {
			panic(fmt.Errorf("compile generated Agent schema %s: %w", identity, err))
		}
		result[identity] = schema
	}
	return result
}

func validateWithSchema(identity string, payload json.RawMessage) (map[string]any, error) {
	var rawError error
	if identity == "agent-control-fact@1" {
		rawError = canonicaljson.ValidateRawEnvelope(payload, maximumAgentControlBytes)
	} else if identity == "agent-proposal-fact@1" {
		rawError = canonicaljson.ValidateRawEnvelope(payload, maximumAgentProposalBytes)
	} else if identity == "agent-verification-fact@2" {
		rawError = canonicaljson.ValidateRawEnvelope(payload, maximumAgentVerificationBytes)
	} else if identity == "agent-product-fact@1" || identity == "agent-product-view@1" {
		rawError = canonicaljson.ValidateRawEnvelope(payload, maximumAgentProductBytes)
	} else if identity == "agent-evaluation-fact@1" {
		rawError = canonicaljson.ValidateRawEnvelope(payload, maximumAgentEvaluationBytes)
	} else if identity == "agent-g4-closure-manifest@1" {
		rawError = canonicaljson.ValidateRawEnvelope(payload, maximumAgentG4ClosureBytes)
	} else {
		rawError = canonicaljson.ValidateRaw(payload, maximumAgentPolicyBytes)
	}
	if rawError != nil {
		return nil, fmt.Errorf("invalid Agent JSON: %w", rawError)
	}
	schema := schemas[identity]
	if schema == nil {
		return nil, fmt.Errorf("unsupported Agent wire schema: %s", identity)
	}
	document, err := jsonschema.UnmarshalJSON(bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	if err := schema.Validate(document); err != nil {
		return nil, err
	}
	var decoded map[string]any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, err
	}
	if identity == "agent-control-fact@1" {
		if err := validateAgentControlSemantics(decoded); err != nil {
			return nil, err
		}
	} else if identity == "agent-proposal-fact@1" {
		if err := validateAgentProposalSemantics(decoded); err != nil {
			return nil, err
		}
	} else if identity == "agent-verification-fact@2" {
		if err := validateAgentVerificationSemantics(decoded); err != nil {
			return nil, err
		}
	} else if identity == "agent-product-fact@1" {
		if err := validateAgentProductSemantics(decoded); err != nil {
			return nil, err
		}
	} else if identity == "agent-product-view@1" {
		if err := validateAgentProductViewSemantics(decoded); err != nil {
			return nil, err
		}
	} else if identity == "agent-evaluation-fact@1" {
		if err := validateAgentEvaluationSemantics(decoded); err != nil {
			return nil, err
		}
	} else if identity == "agent-g4-closure-manifest@1" {
		if err := validateAgentG4ClosureSemantics(decoded); err != nil {
			return nil, err
		}
	} else if err := validateAgentPolicySemantics(decoded); err != nil {
		return nil, err
	}
	return decoded, nil
}

// ValidateG4ClosureManifest applies the strict V9 Golden Closure admission
// contract before CI evidence can be promoted to durable G4 status.
func ValidateG4ClosureManifest(payload json.RawMessage) error {
	_, err := validateWithSchema("agent-g4-closure-manifest@1", payload)
	return err
}

// CanonicalG4ClosureManifestDigest matches the TypeScript wire fact digest.
func CanonicalG4ClosureManifestDigest(payload json.RawMessage) (string, error) {
	document, err := validateWithSchema("agent-g4-closure-manifest@1", payload)
	if err != nil {
		return "", err
	}
	return canonicaljson.Digest(document)
}

// ValidateEvaluationFact applies the V8 strict, bounded, self-authenticating
// evaluation fact contract before a fact enters the immutable evidence ledger.
func ValidateEvaluationFact(payload json.RawMessage) error {
	_, err := validateWithSchema("agent-evaluation-fact@1", payload)
	return err
}

// CanonicalEvaluationFactDigest matches digestAgentCanonicalValue over the fact.
func CanonicalEvaluationFactDigest(payload json.RawMessage) (string, error) {
	document, err := validateWithSchema("agent-evaluation-fact@1", payload)
	if err != nil {
		return "", err
	}
	return canonicaljson.Digest(document)
}

// ValidateControlFact applies the shared V4 wire schema, bounded strict JSON,
// canonical digests, and sanitized audit invariants before service persistence.
func ValidateControlFact(payload json.RawMessage) error {
	_, err := validateWithSchema("agent-control-fact@1", payload)
	return err
}

// ValidateProposalFact applies the strict V5 proposal/approval/mutation wire
// contract before an immutable fact can enter the server ledger.
func ValidateProposalFact(payload json.RawMessage) error {
	_, err := validateWithSchema("agent-proposal-fact@1", payload)
	return err
}

// CanonicalProposalFactDigest matches digestAgentCanonicalValue over the fact.
func CanonicalProposalFactDigest(payload json.RawMessage) (string, error) {
	document, err := validateWithSchema("agent-proposal-fact@1", payload)
	if err != nil {
		return "", err
	}
	return canonicaljson.Digest(document)
}

// ValidateVerificationFact applies the strict V6 Plan/Closure/repair fact
// contract before an immutable fact can enter the server ledger.
func ValidateVerificationFact(payload json.RawMessage) error {
	_, err := validateWithSchema("agent-verification-fact@2", payload)
	return err
}

// CanonicalVerificationFactDigest matches digestAgentCanonicalValue over the fact.
func CanonicalVerificationFactDigest(payload json.RawMessage) (string, error) {
	document, err := validateWithSchema("agent-verification-fact@2", payload)
	if err != nil {
		return "", err
	}
	return canonicaljson.Digest(document)
}

// ValidateProductFact applies the V7 immutable product supplement and user
// command contract before either fact can enter the server ledger.
func ValidateProductFact(payload json.RawMessage) error {
	_, err := validateWithSchema("agent-product-fact@1", payload)
	return err
}

// CanonicalProductFactDigest matches digestAgentCanonicalValue over the fact.
func CanonicalProductFactDigest(payload json.RawMessage) (string, error) {
	document, err := validateWithSchema("agent-product-fact@1", payload)
	if err != nil {
		return "", err
	}
	return canonicaljson.Digest(document)
}

// ValidateProductView applies the strict shared Web/CLI view contract.
func ValidateProductView(payload json.RawMessage) error {
	_, err := validateWithSchema("agent-product-view@1", payload)
	return err
}

// CanonicalControlFactDigest matches digestAgentCanonicalValue over the wire fact.
func CanonicalControlFactDigest(payload json.RawMessage) (string, error) {
	document, err := validateWithSchema("agent-control-fact@1", payload)
	if err != nil {
		return "", err
	}
	return canonicaljson.Digest(document)
}

// ValidateDocument applies the generated owner schema and semantic invariants
// before Atomic Commit persists an AgentPolicy Workspace document.
func ValidateDocument(documentID string, payload json.RawMessage) error {
	document, err := validateWithSchema("agent-policy", payload)
	if err != nil {
		return err
	}
	if id, _ := document["id"].(string); id != documentID {
		return errors.New("AgentPolicy content id must match the Workspace document id")
	}
	return nil
}

// MigrateDocument is the sole v0-to-v1 dispatch. Its privacy defaults only
// narrow disclosure, retention, training, telemetry, and raw-artifact access.
func MigrateDocument(documentID string, payload json.RawMessage) (json.RawMessage, error) {
	var identity struct {
		WireVersion int `json:"wireVersion"`
	}
	if err := json.Unmarshal(payload, &identity); err != nil {
		return nil, err
	}
	if identity.WireVersion == 1 {
		if err := ValidateDocument(documentID, payload); err != nil {
			return nil, err
		}
		return append(json.RawMessage(nil), payload...), nil
	}
	if identity.WireVersion != 0 {
		return nil, errors.New("unsupported AgentPolicy wire version; expected 0 or 1")
	}
	document, err := validateWithSchema("agent-policy@0", payload)
	if err != nil {
		return nil, err
	}
	if id, _ := document["id"].(string); id != documentID {
		return nil, errors.New("AgentPolicy content id must match the Workspace document id")
	}
	document["wireVersion"] = float64(1)
	document["privacy"] = map[string]any{
		"maximumSensitivity": "public",
		"allowedRegions":     []any{},
		"providerTraining":   "deny",
		"providerTelemetry":  "deny",
		"rawArtifactCapture": "deny",
	}
	migrated, err := canonicaljson.Bytes(document)
	if err != nil {
		return nil, err
	}
	if err := ValidateDocument(documentID, migrated); err != nil {
		return nil, err
	}
	return migrated, nil
}

// CanonicalCurrentDigest matches @prodivix/ai digestAgentPolicy.
func CanonicalCurrentDigest(documentID string, payload json.RawMessage) (string, error) {
	if err := ValidateDocument(documentID, payload); err != nil {
		return "", err
	}
	var current map[string]any
	if err := json.Unmarshal(payload, &current); err != nil {
		return "", err
	}
	delete(current, "wireVersion")
	return canonicaljson.Digest(current)
}
