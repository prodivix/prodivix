package verificationcontract

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

//go:embed evidence-schemas.generated.json
var generatedEvidenceSchemasJSON []byte

var evidenceSchemas = mustCompileEvidenceSchemas()

func mustCompileEvidenceSchemas() map[string]*jsonschema.Schema {
	var documents map[string]json.RawMessage
	if err := json.Unmarshal(generatedEvidenceSchemasJSON, &documents); err != nil {
		panic(fmt.Errorf("decode generated Verification Evidence schemas: %w", err))
	}
	result := make(map[string]*jsonschema.Schema, 1)
	for documentType, raw := range documents {
		// Candidate schemas intentionally retain ECMA-262 regex constructs
		// that Go's RE2-backed validator cannot compile. Compile only the
		// generated schemas consumed at Backend byte-admission boundaries.
		if documentType != "verification-artifact-envelope" &&
			documentType != "verification-plan" &&
			documentType != "verification-closure" &&
			documentType != "verification-run-snapshot" &&
			documentType != "verification-run-event" {
			continue
		}
		document, err := jsonschema.UnmarshalJSON(bytes.NewReader(raw))
		if err != nil {
			panic(fmt.Errorf(
				"decode generated Verification Evidence schema %s: %w",
				documentType,
				err,
			))
		}
		resource := fmt.Sprintf(
			"https://prodivix.dev/backend/verification-evidence/%s.json",
			documentType,
		)
		compiler := jsonschema.NewCompiler()
		compiler.DefaultDraft(jsonschema.Draft2020)
		if err := compiler.AddResource(resource, document); err != nil {
			panic(fmt.Errorf(
				"register generated Verification Evidence schema %s: %w",
				documentType,
				err,
			))
		}
		schema, err := compiler.Compile(resource)
		if err != nil {
			panic(fmt.Errorf(
				"compile generated Verification Evidence schema %s: %w",
				documentType,
				err,
			))
		}
		result[documentType] = schema
	}
	return result
}

// ValidateEvidenceTransport applies the Core-owned immutable transport schema.
// Domain modules remain responsible for canonical ordering, digests, and
// cross-record authority checks.
func ValidateEvidenceTransport(
	documentType string,
	payload json.RawMessage,
) error {
	schema := evidenceSchemas[documentType]
	if schema == nil {
		return fmt.Errorf(
			"unsupported Verification Evidence transport type: %s",
			documentType,
		)
	}
	document, err := jsonschema.UnmarshalJSON(bytes.NewReader(payload))
	if err != nil {
		return err
	}
	return schema.Validate(document)
}
