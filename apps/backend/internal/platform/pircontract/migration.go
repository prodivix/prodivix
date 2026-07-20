package pircontract

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
)

var ErrDocumentMigrationFailed = errors.New("PIR wire migration failed")

type UpgradeResult struct {
	Document      json.RawMessage
	SourceVersion string
	Migrated      bool
}

type wireRecord map[string]any

func migrationFailure(path string, format string, args ...any) error {
	return fmt.Errorf("%w at %s: %s", ErrDocumentMigrationFailed, path, fmt.Sprintf(format, args...))
}

func decodeWireDocument(payload json.RawMessage) (wireRecord, error) {
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, migrationFailure("$", "document is not valid JSON: %v", err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return nil, migrationFailure("$", "document must contain exactly one JSON value")
	}
	return requireWireRecord(value, "$")
}

func requireWireRecord(value any, path string) (wireRecord, error) {
	record, ok := value.(map[string]any)
	if !ok {
		return nil, migrationFailure(path, "value must be an object")
	}
	return wireRecord(record), nil
}

func requireWireValue(record wireRecord, key string, path string) (any, error) {
	value, ok := record[key]
	if !ok {
		return nil, migrationFailure(path, "value is required")
	}
	return value, nil
}

func requireWireString(value any, path string) (string, error) {
	text, ok := value.(string)
	if !ok {
		return "", migrationFailure(path, "value must be a string")
	}
	return text, nil
}

func sortedWireKeys(record wireRecord) []string {
	keys := make([]string, 0, len(record))
	for key := range record {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func assertAllowedWireKeys(record wireRecord, path string, allowed ...string) error {
	allowedKeys := make(map[string]struct{}, len(allowed))
	for _, key := range allowed {
		allowedKeys[key] = struct{}{}
	}
	for _, key := range sortedWireKeys(record) {
		if _, ok := allowedKeys[key]; !ok {
			return migrationFailure(path+"."+key, "field cannot be migrated without losing authoring semantics")
		}
	}
	return nil
}

func canonicalWireJSON(value any, path string) (any, error) {
	switch typed := value.(type) {
	case nil, bool, string, json.Number:
		return typed, nil
	case []any:
		result := make([]any, len(typed))
		for index, item := range typed {
			canonical, err := canonicalWireJSON(item, fmt.Sprintf("%s[%d]", path, index))
			if err != nil {
				return nil, err
			}
			result[index] = canonical
		}
		return result, nil
	case map[string]any:
		record := wireRecord(typed)
		result := make(wireRecord, len(record))
		for _, key := range sortedWireKeys(record) {
			canonical, err := canonicalWireJSON(record[key], path+"."+key)
			if err != nil {
				return nil, err
			}
			result[key] = canonical
		}
		return result, nil
	default:
		return nil, migrationFailure(path, "value must be JSON-compatible")
	}
}

func migrateV13ValueBinding(value any, path string) (any, error) {
	if object, ok := value.(map[string]any); ok && len(object) == 1 {
		for key, reference := range object {
			switch key {
			case "$param":
				paramID, err := requireWireString(reference, path+".$param")
				if err != nil {
					return nil, err
				}
				return wireRecord{"kind": "param", "paramId": paramID}, nil
			case "$state":
				stateID, err := requireWireString(reference, path+".$state")
				if err != nil {
					return nil, err
				}
				return wireRecord{"kind": "state", "stateId": stateID}, nil
			case "$data":
				if _, err := requireWireString(reference, path+".$data"); err != nil {
					return nil, err
				}
				return nil, migrationFailure(path, "legacy data path requires explicit dataId and path mapping")
			case "$item", "$index":
				return nil, migrationFailure(path, "legacy list symbol requires an explicit Collection migration")
			}
		}
	}
	canonical, err := canonicalWireJSON(value, path)
	if err != nil {
		return nil, err
	}
	return wireRecord{"kind": "literal", "value": canonical}, nil
}

func migrateV13BindingRecord(value any, path string) (wireRecord, error) {
	record, err := requireWireRecord(value, path)
	if err != nil {
		return nil, err
	}
	result := make(wireRecord, len(record))
	for _, key := range sortedWireKeys(record) {
		binding, err := migrateV13ValueBinding(record[key], path+"."+key)
		if err != nil {
			return nil, err
		}
		result[key] = binding
	}
	return result, nil
}

func migrateV13DataScope(value any, path string) (wireRecord, error) {
	record, err := requireWireRecord(value, path)
	if err != nil {
		return nil, err
	}
	if err := assertAllowedWireKeys(record, path, "source", "pick", "value", "mock", "extend"); err != nil {
		return nil, err
	}
	result := wireRecord{}
	for _, field := range []string{"source", "value", "mock"} {
		if raw, ok := record[field]; ok {
			binding, err := migrateV13ValueBinding(raw, path+"."+field)
			if err != nil {
				return nil, err
			}
			result[field] = binding
		}
	}
	if raw, ok := record["pick"]; ok {
		pick, err := requireWireString(raw, path+".pick")
		if err != nil {
			return nil, err
		}
		result["pick"] = pick
	}
	if raw, ok := record["extend"]; ok {
		extend, err := migrateV13BindingRecord(raw, path+".extend")
		if err != nil {
			return nil, err
		}
		result["extend"] = extend
	}
	return result, nil
}

func migrateV13Node(value any, path string) (wireRecord, error) {
	node, err := requireWireRecord(value, path)
	if err != nil {
		return nil, err
	}
	if err := assertAllowedWireKeys(node, path, "id", "type", "text", "style", "props", "data", "list", "events"); err != nil {
		return nil, err
	}
	if _, ok := node["list"]; ok {
		return nil, migrationFailure(path+".list", "field must be migrated to a first-class Collection explicitly")
	}
	if rawEvents, ok := node["events"]; ok {
		events, err := requireWireRecord(rawEvents, path+".events")
		if err != nil {
			return nil, err
		}
		if len(events) > 0 {
			return nil, migrationFailure(path+".events", "legacy action strings require explicit CodeReference mapping")
		}
	}
	rawID, err := requireWireValue(node, "id", path+".id")
	if err != nil {
		return nil, err
	}
	id, err := requireWireString(rawID, path+".id")
	if err != nil {
		return nil, err
	}
	rawType, err := requireWireValue(node, "type", path+".type")
	if err != nil {
		return nil, err
	}
	nodeType, err := requireWireString(rawType, path+".type")
	if err != nil {
		return nil, err
	}
	result := wireRecord{"id": id, "kind": "element", "type": nodeType}
	if raw, ok := node["text"]; ok {
		result["text"], err = migrateV13ValueBinding(raw, path+".text")
		if err != nil {
			return nil, err
		}
	}
	if raw, ok := node["style"]; ok {
		result["style"], err = migrateV13BindingRecord(raw, path+".style")
		if err != nil {
			return nil, err
		}
	}
	if raw, ok := node["props"]; ok {
		result["props"], err = migrateV13BindingRecord(raw, path+".props")
		if err != nil {
			return nil, err
		}
	}
	if raw, ok := node["data"]; ok {
		result["data"], err = migrateV13DataScope(raw, path+".data")
		if err != nil {
			return nil, err
		}
	}
	if _, ok := node["events"]; ok {
		result["events"] = wireRecord{}
	}
	return result, nil
}

func migrateV13Graph(value any, path string) (wireRecord, error) {
	graph, err := requireWireRecord(value, path)
	if err != nil {
		return nil, err
	}
	if err := assertAllowedWireKeys(graph, path, "version", "rootId", "nodesById", "childIdsById", "regionsById", "order"); err != nil {
		return nil, err
	}
	version, err := requireWireValue(graph, "version", path+".version")
	if err != nil {
		return nil, err
	}
	number, ok := version.(json.Number)
	numericVersion, numberErr := number.Float64()
	if !ok || numberErr != nil || numericVersion != 1 {
		return nil, migrationFailure(path+".version", "value must be 1")
	}
	rawRootID, err := requireWireValue(graph, "rootId", path+".rootId")
	if err != nil {
		return nil, err
	}
	rootID, err := requireWireString(rawRootID, path+".rootId")
	if err != nil {
		return nil, err
	}
	rawNodes, err := requireWireValue(graph, "nodesById", path+".nodesById")
	if err != nil {
		return nil, err
	}
	nodes, err := requireWireRecord(rawNodes, path+".nodesById")
	if err != nil {
		return nil, err
	}
	migratedNodes := make(wireRecord, len(nodes))
	for _, nodeID := range sortedWireKeys(nodes) {
		migrated, err := migrateV13Node(nodes[nodeID], path+".nodesById."+nodeID)
		if err != nil {
			return nil, err
		}
		migratedNodes[nodeID] = migrated
	}
	rawChildren, err := requireWireValue(graph, "childIdsById", path+".childIdsById")
	if err != nil {
		return nil, err
	}
	children, err := canonicalWireJSON(rawChildren, path+".childIdsById")
	if err != nil {
		return nil, err
	}
	result := wireRecord{
		"version":      json.Number("1"),
		"rootId":       rootID,
		"nodesById":    migratedNodes,
		"childIdsById": children,
	}
	for _, field := range []string{"regionsById", "order"} {
		if raw, ok := graph[field]; ok {
			result[field], err = canonicalWireJSON(raw, path+"."+field)
			if err != nil {
				return nil, err
			}
		}
	}
	return result, nil
}

func migrateV13Metadata(value any, path string) (wireRecord, error) {
	metadata, err := requireWireRecord(value, path)
	if err != nil {
		return nil, err
	}
	fields := []string{"name", "description", "author", "createdAt", "updatedAt"}
	if err := assertAllowedWireKeys(metadata, path, fields...); err != nil {
		return nil, err
	}
	result := wireRecord{}
	for _, field := range fields {
		if raw, ok := metadata[field]; ok {
			result[field], err = requireWireString(raw, path+"."+field)
			if err != nil {
				return nil, err
			}
		}
	}
	return result, nil
}

func migrateV13Definitions(value any, path string, kind string) (wireRecord, error) {
	definitions, err := requireWireRecord(value, path)
	if err != nil {
		return nil, err
	}
	result := make(wireRecord, len(definitions))
	for _, definitionID := range sortedWireKeys(definitions) {
		entryPath := path + "." + definitionID
		definition, err := requireWireRecord(definitions[definitionID], entryPath)
		if err != nil {
			return nil, err
		}
		migrated := wireRecord{}
		if kind == "prop" {
			if err := assertAllowedWireKeys(definition, entryPath, "type", "description", "default"); err != nil {
				return nil, err
			}
			rawType, err := requireWireValue(definition, "type", entryPath+".type")
			if err != nil {
				return nil, err
			}
			migrated["typeRef"], err = requireWireString(rawType, entryPath+".type")
			if err != nil {
				return nil, err
			}
			if raw, ok := definition["description"]; ok {
				migrated["description"], err = requireWireString(raw, entryPath+".description")
				if err != nil {
					return nil, err
				}
			}
			if raw, ok := definition["default"]; ok {
				migrated["defaultValue"], err = canonicalWireJSON(raw, entryPath+".default")
				if err != nil {
					return nil, err
				}
			}
		} else {
			if err := assertAllowedWireKeys(definition, entryPath, "type", "initial"); err != nil {
				return nil, err
			}
			if raw, ok := definition["type"]; ok {
				migrated["typeRef"], err = requireWireString(raw, entryPath+".type")
				if err != nil {
					return nil, err
				}
			}
			rawInitial, err := requireWireValue(definition, "initial", entryPath+".initial")
			if err != nil {
				return nil, err
			}
			migrated["initial"], err = canonicalWireJSON(rawInitial, entryPath+".initial")
			if err != nil {
				return nil, err
			}
		}
		result[definitionID] = migrated
	}
	return result, nil
}

func migrateV13Logic(value any, path string) (wireRecord, error) {
	logic, err := requireWireRecord(value, path)
	if err != nil {
		return nil, err
	}
	if err := assertAllowedWireKeys(logic, path, "props", "state", "graphs"); err != nil {
		return nil, err
	}
	if _, ok := logic["graphs"]; ok {
		return nil, migrationFailure(path+".graphs", "field must be migrated to standalone NodeGraph documents")
	}
	result := wireRecord{}
	if raw, ok := logic["props"]; ok {
		result["props"], err = migrateV13Definitions(raw, path+".props", "prop")
		if err != nil {
			return nil, err
		}
	}
	if raw, ok := logic["state"]; ok {
		result["state"], err = migrateV13Definitions(raw, path+".state", "state")
		if err != nil {
			return nil, err
		}
	}
	return result, nil
}

func migrateV13ToV14(document wireRecord) (wireRecord, error) {
	if err := assertAllowedWireKeys(document, "$", "version", "metadata", "ui", "logic", "animation"); err != nil {
		return nil, err
	}
	if _, ok := document["animation"]; ok {
		return nil, migrationFailure("$.animation", "field must be migrated to a standalone Animation document")
	}
	rawUI, err := requireWireValue(document, "ui", "$.ui")
	if err != nil {
		return nil, err
	}
	ui, err := requireWireRecord(rawUI, "$.ui")
	if err != nil {
		return nil, err
	}
	if err := assertAllowedWireKeys(ui, "$.ui", "graph"); err != nil {
		return nil, err
	}
	rawGraph, err := requireWireValue(ui, "graph", "$.ui.graph")
	if err != nil {
		return nil, err
	}
	graph, err := migrateV13Graph(rawGraph, "$.ui.graph")
	if err != nil {
		return nil, err
	}
	result := wireRecord{"version": "1.4", "ui": wireRecord{"graph": graph}}
	if raw, ok := document["metadata"]; ok {
		result["metadata"], err = migrateV13Metadata(raw, "$.metadata")
		if err != nil {
			return nil, err
		}
	}
	if raw, ok := document["logic"]; ok {
		result["logic"], err = migrateV13Logic(raw, "$.logic")
		if err != nil {
			return nil, err
		}
	}
	return result, nil
}

func copyWithWireVersion(document wireRecord, version string) wireRecord {
	result := make(wireRecord, len(document))
	for key, value := range document {
		result[key] = value
	}
	result["version"] = version
	return result
}

// UpgradeDocument deterministically promotes every supported canonical wire
// baseline to the generated current schema before persistence accepts writes.
func UpgradeDocument(payload json.RawMessage) (UpgradeResult, error) {
	document, err := decodeWireDocument(payload)
	if err != nil {
		return UpgradeResult{}, err
	}
	rawVersion, ok := document["version"]
	if !ok {
		return UpgradeResult{}, migrationFailure("$.version", "string schema version is required")
	}
	sourceVersion, err := requireWireString(rawVersion, "$.version")
	if err != nil {
		return UpgradeResult{}, err
	}
	migrated := false
	switch sourceVersion {
	case "1.3":
		document, err = migrateV13ToV14(document)
		if err != nil {
			return UpgradeResult{}, err
		}
		fallthrough
	case "1.4":
		document = copyWithWireVersion(document, "1.5")
		fallthrough
	case "1.5":
		document = copyWithWireVersion(document, CurrentVersion)
		migrated = true
	case CurrentVersion:
	default:
		return UpgradeResult{}, migrationFailure("$.version", "schema %q has no migration path to %q", sourceVersion, CurrentVersion)
	}

	encoded := append(json.RawMessage(nil), payload...)
	if migrated {
		encoded, err = json.Marshal(document)
		if err != nil {
			return UpgradeResult{}, migrationFailure("$", "migrated document could not be encoded: %v", err)
		}
	}
	if err := ValidateDocument(encoded); err != nil {
		return UpgradeResult{}, migrationFailure("$", "migrated document does not satisfy current schema: %v", err)
	}
	return UpgradeResult{
		Document:      encoded,
		SourceVersion: sourceVersion,
		Migrated:      migrated,
	}, nil
}
