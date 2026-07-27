package animationcontract

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

const currentSchemaResource = "https://prodivix.dev/schemas/animation/current.json"

//go:embed current_schema.generated.json
var currentSchemaJSON []byte

var (
	currentSchema              = mustCompileCurrentSchema()
	currentDocumentPatchFields = mustReadCurrentDocumentFields()
)

func mustCompileCurrentSchema() *jsonschema.Schema {
	document, err := jsonschema.UnmarshalJSON(bytes.NewReader(currentSchemaJSON))
	if err != nil {
		panic(fmt.Errorf("decode generated Animation current schema: %w", err))
	}
	compiler := jsonschema.NewCompiler()
	compiler.DefaultDraft(jsonschema.Draft2020)
	if err := compiler.AddResource(currentSchemaResource, document); err != nil {
		panic(fmt.Errorf("register generated Animation current schema: %w", err))
	}
	schema, err := compiler.Compile(currentSchemaResource)
	if err != nil {
		panic(fmt.Errorf("compile generated Animation current schema: %w", err))
	}
	return schema
}

func mustReadCurrentDocumentFields() map[string]struct{} {
	var schema struct {
		Properties map[string]json.RawMessage `json:"properties"`
	}
	if err := json.Unmarshal(currentSchemaJSON, &schema); err != nil {
		panic(fmt.Errorf("decode generated Animation patch roots: %w", err))
	}
	fields := make(map[string]struct{}, len(schema.Properties))
	for field := range schema.Properties {
		if field != "version" {
			fields[field] = struct{}{}
		}
	}
	return fields
}

// ValidateDocument applies the Animation owner package's generated current
// wire schema before Workspace-specific semantic validation runs.
func ValidateDocument(payload json.RawMessage) error {
	document, err := jsonschema.UnmarshalJSON(bytes.NewReader(payload))
	if err != nil {
		return err
	}
	return currentSchema.Validate(document)
}

// AllowsDocumentPatchRoot keeps Backend patch ownership derived from the same
// generated wire schema instead of duplicating its top-level field list.
func AllowsDocumentPatchRoot(field string) bool {
	_, allowed := currentDocumentPatchFields[field]
	return allowed
}
