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
	if err := canonicaljson.ValidateRaw(payload, maximumAgentPolicyBytes); err != nil {
		return nil, fmt.Errorf("invalid AgentPolicy JSON: %w", err)
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
	if err := validateAgentPolicySemantics(decoded); err != nil {
		return nil, err
	}
	return decoded, nil
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
