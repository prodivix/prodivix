package workspace

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
)

var ErrDataSourceValidationFailed = errors.New("Data source validation failed")

const dataSourceWireVersion = 1

var dataRuntimeZones = map[string]struct{}{
	"client": {},
	"worker": {},
	"server": {},
	"edge":   {},
	"build":  {},
	"test":   {},
}

type dataSourceValidationContext struct {
	bindings map[string]string
}

func validateDataSourceDocument(payload json.RawMessage, documentID string) error {
	fields, err := decodeDataObject(
		payload,
		"/",
		[]string{"wireVersion", "source", "schemasById", "operationsById"},
		nil,
	)
	if err != nil {
		return err
	}

	var wireVersion int
	if err := json.Unmarshal(fields["wireVersion"], &wireVersion); err != nil || wireVersion != dataSourceWireVersion {
		return dataSourceValidationError("/wireVersion must equal %d", dataSourceWireVersion)
	}
	context, err := validateDataSourceDefinition(fields["source"])
	if err != nil {
		return err
	}

	schemasByID, err := decodeDataObjectMap(fields["schemasById"], "/schemasById")
	if err != nil {
		return err
	}
	for _, schemaID := range sortedDataKeys(schemasByID) {
		schema := schemasByID[schemaID]
		if err := validateDataMapKey(schemaID, "/schemasById"); err != nil {
			return err
		}
		if err := validateDataSchema(schemaID, schema); err != nil {
			return err
		}
	}

	operationsByID, err := decodeDataObjectMap(fields["operationsById"], "/operationsById")
	if err != nil {
		return err
	}
	for _, operationID := range sortedDataKeys(operationsByID) {
		operation := operationsByID[operationID]
		if err := validateDataMapKey(operationID, "/operationsById"); err != nil {
			return err
		}
		if err := validateDataOperation(operationID, operation, schemasByID, context); err != nil {
			return err
		}
	}
	return validateDataOperationRelations(documentID, operationsByID)
}

func validateDataOperationRelations(documentID string, operationsByID map[string]json.RawMessage) error {
	if documentID == "" {
		return nil
	}
	for _, operationID := range sortedDataKeys(operationsByID) {
		operationPath := "/operationsById/" + escapeDataPointer(operationID)
		operationFields, err := decodeDataObject(
			operationsByID[operationID],
			operationPath,
			[]string{"id", "kind", "outputSchemaId", "configurationByKey", "policies"},
			[]string{"name", "description", "inputSchemaId"},
		)
		if err != nil {
			return err
		}
		policies, err := decodeDataObject(operationFields["policies"], operationPath+"/policies", nil, []string{"cache", "retry", "pagination", "optimistic"})
		if err != nil {
			return err
		}
		optimistic, exists := policies["optimistic"]
		if !exists {
			continue
		}
		optimisticFields, err := decodeDataObject(
			optimistic,
			operationPath+"/policies/optimistic",
			[]string{"kind", "action", "target", "rollback"},
			[]string{"entityIdPath", "valueInputPath", "valueOutputPath", "placement"},
		)
		if err != nil {
			return err
		}
		targetPath := operationPath + "/policies/optimistic/target"
		target, err := decodeDataObject(optimisticFields["target"], targetPath, []string{"documentId", "operationId"}, nil)
		if err != nil {
			return err
		}
		targetDocumentID, err := decodeDataCanonicalString(target["documentId"], targetPath+"/documentId")
		if err != nil {
			return err
		}
		if targetDocumentID != documentID {
			continue
		}
		targetOperationID, err := decodeDataCanonicalString(target["operationId"], targetPath+"/operationId")
		if err != nil {
			return err
		}
		targetOperation, exists := operationsByID[targetOperationID]
		if !exists {
			return dataSourceValidationError("%s/operationId references unknown same-document operation %q", targetPath, targetOperationID)
		}
		targetFields, err := decodeDataObject(
			targetOperation,
			"/operationsById/"+escapeDataPointer(targetOperationID),
			[]string{"id", "kind", "outputSchemaId", "configurationByKey", "policies"},
			[]string{"name", "description", "inputSchemaId"},
		)
		if err != nil {
			return err
		}
		targetKind, err := decodeDataCanonicalString(targetFields["kind"], "/operationsById/"+escapeDataPointer(targetOperationID)+"/kind")
		if err != nil {
			return err
		}
		if targetKind != "query" {
			return dataSourceValidationError("%s/operationId must target a query operation", targetPath)
		}
	}
	return nil
}

func validateDataSourceDefinition(payload json.RawMessage) (dataSourceValidationContext, error) {
	fields, err := decodeDataObject(
		payload,
		"/source",
		[]string{"id", "adapterId", "runtimeZone", "bindingsById", "configurationByKey"},
		[]string{"name"},
	)
	if err != nil {
		return dataSourceValidationContext{}, err
	}
	if _, err := decodeDataCanonicalString(fields["id"], "/source/id"); err != nil {
		return dataSourceValidationContext{}, err
	}
	if _, err := decodeDataOptionalCanonicalString(fields, "name", "/source/name"); err != nil {
		return dataSourceValidationContext{}, err
	}
	if _, err := decodeDataCanonicalString(fields["adapterId"], "/source/adapterId"); err != nil {
		return dataSourceValidationContext{}, err
	}
	runtimeZone, err := decodeDataCanonicalString(fields["runtimeZone"], "/source/runtimeZone")
	if err != nil {
		return dataSourceValidationContext{}, err
	}
	if _, exists := dataRuntimeZones[runtimeZone]; !exists {
		return dataSourceValidationContext{}, dataSourceValidationError("/source/runtimeZone uses unsupported zone %q", runtimeZone)
	}

	bindings, err := decodeDataObjectMap(fields["bindingsById"], "/source/bindingsById")
	if err != nil {
		return dataSourceValidationContext{}, err
	}
	bindingKinds := make(map[string]string, len(bindings))
	for _, bindingID := range sortedDataKeys(bindings) {
		binding := bindings[bindingID]
		if err := validateDataMapKey(bindingID, "/source/bindingsById"); err != nil {
			return dataSourceValidationContext{}, err
		}
		path := fmt.Sprintf("/source/bindingsById/%s", escapeDataPointer(bindingID))
		kind, referenceID, err := validateDataReferenceValue(binding, path)
		if err != nil {
			return dataSourceValidationContext{}, err
		}
		if referenceID != bindingID {
			return dataSourceValidationContext{}, dataSourceValidationError("%s/reference/bindingId must match its bindingsById key", path)
		}
		if kind == "secret-ref" && (runtimeZone == "client" || runtimeZone == "worker") {
			return dataSourceValidationContext{}, dataSourceValidationError("%s cannot expose a secret-ref to the %s runtime zone", path, runtimeZone)
		}
		bindingKinds[bindingID] = kind
	}
	context := dataSourceValidationContext{bindings: bindingKinds}
	if err := validateDataConfigurationMap(fields["configurationByKey"], "/source/configurationByKey", context); err != nil {
		return dataSourceValidationContext{}, err
	}
	return context, nil
}

func validateDataSchema(schemaID string, payload json.RawMessage) error {
	path := "/schemasById/" + escapeDataPointer(schemaID)
	fields, err := decodeDataObject(payload, path, []string{"id", "schema"}, []string{"name", "description"})
	if err != nil {
		return err
	}
	id, err := decodeDataCanonicalString(fields["id"], path+"/id")
	if err != nil {
		return err
	}
	if id != schemaID {
		return dataSourceValidationError("%s/id must match its schemasById key", path)
	}
	if _, err := decodeDataOptionalCanonicalString(fields, "name", path+"/name"); err != nil {
		return err
	}
	if _, err := decodeDataOptionalCanonicalString(fields, "description", path+"/description"); err != nil {
		return err
	}
	if isJSONObject(fields["schema"]) {
		var schema map[string]json.RawMessage
		if err := json.Unmarshal(fields["schema"], &schema); err != nil {
			return dataSourceValidationError("%s/schema must be a JSON Schema object", path)
		}
		schemaURI, exists := schema["$schema"]
		if !exists {
			return dataSourceValidationError("%s/schema/$schema must declare JSON Schema 2020-12", path)
		}
		var value string
		if err := json.Unmarshal(schemaURI, &value); err != nil || value != "https://json-schema.org/draft/2020-12/schema" {
			return dataSourceValidationError("%s/schema/$schema must use JSON Schema 2020-12", path)
		}
	} else {
		var schema bool
		if err := json.Unmarshal(fields["schema"], &schema); err != nil {
			return dataSourceValidationError("%s/schema must be a JSON Schema object or boolean", path)
		}
	}
	return nil
}

func validateDataOperation(operationID string, payload json.RawMessage, schemasByID map[string]json.RawMessage, context dataSourceValidationContext) error {
	path := "/operationsById/" + escapeDataPointer(operationID)
	fields, err := decodeDataObject(
		payload,
		path,
		[]string{"id", "kind", "outputSchemaId", "configurationByKey", "policies"},
		[]string{"name", "description", "inputSchemaId"},
	)
	if err != nil {
		return err
	}
	id, err := decodeDataCanonicalString(fields["id"], path+"/id")
	if err != nil {
		return err
	}
	if id != operationID {
		return dataSourceValidationError("%s/id must match its operationsById key", path)
	}
	if _, err := decodeDataOptionalCanonicalString(fields, "name", path+"/name"); err != nil {
		return err
	}
	if _, err := decodeDataOptionalCanonicalString(fields, "description", path+"/description"); err != nil {
		return err
	}
	kind, err := decodeDataCanonicalString(fields["kind"], path+"/kind")
	if err != nil {
		return err
	}
	if kind != "query" && kind != "mutation" {
		return dataSourceValidationError("%s/kind must be query or mutation", path)
	}
	inputSchemaID, err := decodeDataOptionalCanonicalString(fields, "inputSchemaId", path+"/inputSchemaId")
	if err != nil {
		return err
	}
	if inputSchemaID != "" {
		if _, exists := schemasByID[inputSchemaID]; !exists {
			return dataSourceValidationError("%s/inputSchemaId references unknown schema %q", path, inputSchemaID)
		}
	}
	outputSchemaID, err := decodeDataCanonicalString(fields["outputSchemaId"], path+"/outputSchemaId")
	if err != nil {
		return err
	}
	if _, exists := schemasByID[outputSchemaID]; !exists {
		return dataSourceValidationError("%s/outputSchemaId references unknown schema %q", path, outputSchemaID)
	}
	if err := validateDataConfigurationMap(fields["configurationByKey"], path+"/configurationByKey", context); err != nil {
		return err
	}
	policies, err := decodeDataObject(fields["policies"], path+"/policies", nil, []string{"cache", "retry", "pagination", "optimistic"})
	if err != nil {
		return err
	}
	return validateDataOperationPolicies(kind, policies, path+"/policies")
}

func validateDataConfigurationMap(payload json.RawMessage, path string, context dataSourceValidationContext) error {
	configuration, err := decodeDataObjectMap(payload, path)
	if err != nil {
		return err
	}
	for _, key := range sortedDataKeys(configuration) {
		value := configuration[key]
		if err := validateDataMapKey(key, path); err != nil {
			return err
		}
		valuePath := path + "/" + escapeDataPointer(key)
		fields, err := decodeDataObject(value, valuePath, []string{"kind"}, []string{"value", "reference"})
		if err != nil {
			return err
		}
		kind, err := decodeDataCanonicalString(fields["kind"], valuePath+"/kind")
		if err != nil {
			return err
		}
		switch kind {
		case "literal":
			if len(fields) != 2 || fields["value"] == nil {
				return dataSourceValidationError("%s literal configuration must contain only kind and value", valuePath)
			}
		case "environment-ref", "secret-ref":
			referenceID, err := validateDataReferenceFields(fields, valuePath, kind)
			if err != nil {
				return err
			}
			bindingKind, exists := context.bindings[referenceID]
			if !exists {
				return dataSourceValidationError("%s/reference/bindingId references unknown source binding %q", valuePath, referenceID)
			}
			if bindingKind != kind {
				return dataSourceValidationError("%s kind must match source binding %q", valuePath, referenceID)
			}
		default:
			return dataSourceValidationError("%s/kind is unsupported", valuePath)
		}
	}
	return nil
}

func validateDataReferenceValue(payload json.RawMessage, path string) (string, string, error) {
	fields, err := decodeDataObject(payload, path, []string{"kind", "reference"}, nil)
	if err != nil {
		return "", "", err
	}
	kind, err := decodeDataCanonicalString(fields["kind"], path+"/kind")
	if err != nil {
		return "", "", err
	}
	if kind != "environment-ref" && kind != "secret-ref" {
		return "", "", dataSourceValidationError("%s/kind must be environment-ref or secret-ref", path)
	}
	referenceID, err := validateDataReferenceFields(fields, path, kind)
	return kind, referenceID, err
}

func validateDataReferenceFields(fields map[string]json.RawMessage, path string, kind string) (string, error) {
	if len(fields) != 2 || fields["reference"] == nil {
		return "", dataSourceValidationError("%s %s must contain only kind and reference", path, kind)
	}
	reference, err := decodeDataObject(fields["reference"], path+"/reference", []string{"bindingId"}, nil)
	if err != nil {
		return "", err
	}
	return decodeDataCanonicalString(reference["bindingId"], path+"/reference/bindingId")
}

func decodeDataObject(payload json.RawMessage, path string, required []string, optional []string) (map[string]json.RawMessage, error) {
	if !isJSONObject(payload) {
		return nil, dataSourceValidationError("%s must be an object", path)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return nil, dataSourceValidationError("%s must be an object", path)
	}
	allowed := make(map[string]struct{}, len(required)+len(optional))
	for _, field := range required {
		allowed[field] = struct{}{}
		if _, exists := fields[field]; !exists {
			return nil, dataSourceValidationError("%s/%s is required", strings.TrimSuffix(path, "/"), field)
		}
	}
	for _, field := range optional {
		allowed[field] = struct{}{}
	}
	for _, field := range sortedDataKeys(fields) {
		if _, exists := allowed[field]; !exists {
			return nil, dataSourceValidationError("%s contains unknown field %q", path, field)
		}
	}
	return fields, nil
}

func decodeDataObjectMap(payload json.RawMessage, path string) (map[string]json.RawMessage, error) {
	if !isJSONObject(payload) {
		return nil, dataSourceValidationError("%s must be an object map", path)
	}
	var value map[string]json.RawMessage
	if err := json.Unmarshal(payload, &value); err != nil {
		return nil, dataSourceValidationError("%s must be an object map", path)
	}
	return value, nil
}

func decodeDataCanonicalString(payload json.RawMessage, path string) (string, error) {
	var value string
	if err := json.Unmarshal(payload, &value); err != nil || value == "" || value != strings.TrimSpace(value) || strings.ContainsRune(value, '\x00') {
		return "", dataSourceValidationError("%s must be a canonical non-empty string", path)
	}
	return value, nil
}

func decodeDataOptionalCanonicalString(fields map[string]json.RawMessage, field string, path string) (string, error) {
	payload, exists := fields[field]
	if !exists {
		return "", nil
	}
	return decodeDataCanonicalString(payload, path)
}

func decodeDataInteger(payload json.RawMessage, path string, minimum int64) (int64, error) {
	var value float64
	if err := json.Unmarshal(payload, &value); err != nil || math.IsNaN(value) || math.IsInf(value, 0) || value != math.Trunc(value) || value < float64(minimum) || value > float64(maxJSONSafeInteger) {
		return 0, dataSourceValidationError("%s must be an integer between %d and %d", path, minimum, maxJSONSafeInteger)
	}
	return int64(value), nil
}

func validateDataStringArray(payload json.RawMessage, path string) error {
	if !isJSONArray(payload) {
		return dataSourceValidationError("%s must be an array", path)
	}
	var values []json.RawMessage
	if err := json.Unmarshal(payload, &values); err != nil {
		return dataSourceValidationError("%s must be an array", path)
	}
	for index, value := range values {
		if _, err := decodeDataCanonicalString(value, fmt.Sprintf("%s/%d", path, index)); err != nil {
			return err
		}
	}
	return nil
}

func validateDataMapKey(value string, path string) error {
	if value == "" || value != strings.TrimSpace(value) || strings.ContainsRune(value, '\x00') {
		return dataSourceValidationError("%s keys must be canonical non-empty strings", path)
	}
	return nil
}

func sortedDataKeys[Value any](values map[string]Value) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func escapeDataPointer(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "~", "~0"), "/", "~1")
}

func dataSourceValidationError(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrDataSourceValidationFailed, fmt.Sprintf(format, args...))
}
