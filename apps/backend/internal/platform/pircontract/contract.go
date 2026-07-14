package pircontract

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

const currentSchemaResource = "https://prodivix.dev/schemas/pir/current.json"

//go:embed current_schema.generated.json
var currentSchemaJSON []byte

var currentSchema = mustCompileCurrentSchema()

var defaultDocumentJSON = fmt.Sprintf(
	`{"version":"%s","ui":{"graph":{"version":1,"rootId":"root","nodesById":{"root":{"id":"root","kind":"element","type":"container"}},"childIdsById":{"root":[]}}}}`,
	CurrentVersion,
)

func mustCompileCurrentSchema() *jsonschema.Schema {
	document, err := jsonschema.UnmarshalJSON(bytes.NewReader(currentSchemaJSON))
	if err != nil {
		panic(fmt.Errorf("decode generated PIR current schema: %w", err))
	}
	compiler := jsonschema.NewCompiler()
	compiler.DefaultDraft(jsonschema.Draft2020)
	if err := compiler.AddResource(currentSchemaResource, document); err != nil {
		panic(fmt.Errorf("register generated PIR current schema: %w", err))
	}
	schema, err := compiler.Compile(currentSchemaResource)
	if err != nil {
		panic(fmt.Errorf("compile generated PIR current schema: %w", err))
	}
	return schema
}

// ValidateDocument applies the generated current wire schema. Numeric PIR
// versions never escape this transport and persistence boundary.
func ValidateDocument(payload json.RawMessage) error {
	document, err := jsonschema.UnmarshalJSON(bytes.NewReader(payload))
	if err != nil {
		return err
	}
	return currentSchema.Validate(document)
}

func DefaultDocument() json.RawMessage {
	return json.RawMessage(defaultDocumentJSON)
}
