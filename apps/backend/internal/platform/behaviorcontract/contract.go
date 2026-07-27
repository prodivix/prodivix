package behaviorcontract

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

//go:embed schemas.generated.json
var generatedSchemasJSON []byte

var schemas = mustCompileSchemas()

func mustCompileSchemas() map[string]*jsonschema.Schema {
	var documents map[string]json.RawMessage
	if err := json.Unmarshal(generatedSchemasJSON, &documents); err != nil {
		panic(fmt.Errorf("decode generated Behavior schemas: %w", err))
	}
	result := make(map[string]*jsonschema.Schema, len(documents))
	for documentType, raw := range documents {
		document, err := jsonschema.UnmarshalJSON(bytes.NewReader(raw))
		if err != nil {
			panic(fmt.Errorf("decode generated Behavior schema %s: %w", documentType, err))
		}
		resource := fmt.Sprintf("https://prodivix.dev/backend/behavior/%s.json", documentType)
		compiler := jsonschema.NewCompiler()
		compiler.DefaultDraft(jsonschema.Draft2020)
		if err := compiler.AddResource(resource, document); err != nil {
			panic(fmt.Errorf("register generated Behavior schema %s: %w", documentType, err))
		}
		schema, err := compiler.Compile(resource)
		if err != nil {
			panic(fmt.Errorf("compile generated Behavior schema %s: %w", documentType, err))
		}
		result[documentType] = schema
	}
	return result
}

// ValidateDocument applies the Behavior owner package's generated wire schema
// and its document-scoped identity invariant before Atomic Commit persists it.
func ValidateDocument(documentType string, documentID string, payload json.RawMessage) error {
	schema := schemas[documentType]
	if schema == nil {
		return fmt.Errorf("unsupported Behavior document type: %s", documentType)
	}
	document, err := jsonschema.UnmarshalJSON(bytes.NewReader(payload))
	if err != nil {
		return err
	}
	if err := schema.Validate(document); err != nil {
		return err
	}
	var identity struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(payload, &identity); err != nil {
		return err
	}
	if identity.ID != documentID {
		return errors.New("Behavior content id must match the Workspace document id")
	}
	return validateDocumentSemantics(documentType, payload)
}
