package nodegraphcontract

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"sort"
	"strings"
)

const CurrentVersion = 2

var ErrDocumentMigrationFailed = errors.New("NodeGraph wire migration failed")

type UpgradeResult struct {
	Document      json.RawMessage
	SourceVersion int
	Migrated      bool
}

type wireRecord map[string]any

func migrationFailure(path string, format string, args ...any) error {
	return fmt.Errorf(
		"%w at %s: %s",
		ErrDocumentMigrationFailed,
		path,
		fmt.Sprintf(format, args...),
	)
}

func decodeWireDocument(payload json.RawMessage) (wireRecord, error) {
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, migrationFailure("/", "document is not valid JSON: %v", err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return nil, migrationFailure("/", "document must contain exactly one JSON value")
	}
	record, ok := value.(map[string]any)
	if !ok {
		return nil, migrationFailure("/", "document must be an object")
	}
	return wireRecord(record), nil
}

func requireRecord(value any, path string) (wireRecord, error) {
	switch record := value.(type) {
	case wireRecord:
		return record, nil
	case map[string]any:
		return wireRecord(record), nil
	default:
		return nil, migrationFailure(path, "value must be an object")
	}
}

func requireArray(value any, path string) ([]any, error) {
	values, ok := value.([]any)
	if !ok {
		return nil, migrationFailure(path, "value must be an array")
	}
	return values, nil
}

func canonicalString(value any, path string) (string, error) {
	text, ok := value.(string)
	if !ok ||
		text == "" ||
		len(text) > 512 ||
		text != strings.TrimSpace(text) ||
		strings.ContainsRune(text, '\x00') {
		return "", migrationFailure(path, "value must be a canonical non-empty string")
	}
	return text, nil
}

func sortedKeys(record wireRecord) []string {
	keys := make([]string, 0, len(record))
	for key := range record {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func isUnsafeKey(key string) bool {
	return key == "__proto__" || key == "prototype" || key == "constructor"
}

func assertAllowedKeys(record wireRecord, path string, allowed ...string) error {
	allowedKeys := make(map[string]struct{}, len(allowed))
	for _, key := range allowed {
		allowedKeys[key] = struct{}{}
	}
	for _, key := range sortedKeys(record) {
		if isUnsafeKey(key) {
			return migrationFailure(path+"/"+key, "unsafe persisted field")
		}
		if _, ok := allowedKeys[key]; !ok {
			return migrationFailure(
				path+"/"+key,
				"field cannot be migrated without losing authoring semantics",
			)
		}
	}
	return nil
}

func readVersion(record wireRecord) (int, error) {
	version, ok := record["version"].(json.Number)
	if !ok {
		return 0, migrationFailure("/version", "wire version must be an integer")
	}
	value, err := version.Int64()
	if err != nil || value < 1 || value > 1_000_000 {
		return 0, migrationFailure("/version", "wire version must be an integer")
	}
	return int(value), nil
}

func legacyPort(
	id string,
	direction string,
	flow string,
	typeRef string,
	required bool,
	cardinality string,
) wireRecord {
	port := wireRecord{
		"id":          id,
		"direction":   direction,
		"flow":        flow,
		"required":    required,
		"cardinality": cardinality,
	}
	if typeRef != "" {
		port["typeRef"] = typeRef
	}
	return port
}

func staticLegacyPorts(descriptorID string) []any {
	input := func() wireRecord {
		return legacyPort("in.control.prev", "input", "control", "", true, "single")
	}
	output := func() wireRecord {
		return legacyPort("out.control.next", "output", "control", "", false, "single")
	}
	switch descriptorID {
	case "core.start":
		return []any{output()}
	case "core.end":
		return []any{input()}
	case "core.process", "core.log":
		return []any{input(), output()}
	default:
		return nil
	}
}

func migrateLegacyPort(value any, path string) (wireRecord, error) {
	port, err := requireRecord(value, path)
	if err != nil {
		return nil, err
	}
	if err := assertAllowedKeys(
		port,
		path,
		"id",
		"direction",
		"kind",
		"typeRef",
		"required",
		"multiple",
	); err != nil {
		return nil, err
	}
	id, err := canonicalString(port["id"], path+"/id")
	if err != nil {
		return nil, err
	}
	direction, ok := port["direction"].(string)
	if !ok || (direction != "input" && direction != "output") {
		return nil, migrationFailure(path+"/direction", "unsupported port direction")
	}
	flow, ok := port["kind"].(string)
	if !ok || (flow != "control" && flow != "data") {
		return nil, migrationFailure(path+"/kind", "unsupported port flow")
	}
	typeRef := ""
	if value, exists := port["typeRef"]; exists {
		typeRef, err = canonicalString(value, path+"/typeRef")
		if err != nil {
			return nil, err
		}
	}
	if (flow == "control" && typeRef != "") || (flow == "data" && typeRef == "") {
		return nil, migrationFailure(path, "port cannot be migrated to an exact typed port")
	}
	required := false
	if value, exists := port["required"]; exists {
		var valid bool
		required, valid = value.(bool)
		if !valid {
			return nil, migrationFailure(path+"/required", "value must be boolean")
		}
	}
	cardinality := "single"
	if value, exists := port["multiple"]; exists {
		multiple, valid := value.(bool)
		if !valid {
			return nil, migrationFailure(path+"/multiple", "value must be boolean")
		}
		if multiple {
			cardinality = "multiple"
		}
	}
	return legacyPort(id, direction, flow, typeRef, required, cardinality), nil
}

func dynamicSwitchPorts(
	nodeID string,
	edges []any,
) ([]any, error) {
	outputs := make(map[string]struct{})
	for index, value := range edges {
		edge, ok := value.(map[string]any)
		if !ok || edge["source"] != nodeID {
			continue
		}
		path := fmt.Sprintf("/edges/%d/sourceHandle", index)
		handle, err := canonicalString(edge["sourceHandle"], path)
		if err != nil {
			return nil, err
		}
		if handle != "out.control.default" &&
			!strings.HasPrefix(handle, "out.control.case-") {
			return nil, migrationFailure(path, "unrecognized switch output port")
		}
		outputs[handle] = struct{}{}
	}
	ids := make([]string, 0, len(outputs))
	for id := range outputs {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	ports := []any{
		legacyPort("in.control.prev", "input", "control", "", true, "single"),
		legacyPort("in.data.condition", "input", "data", "boolean", false, "single"),
	}
	for _, id := range ids {
		ports = append(ports, legacyPort(id, "output", "control", "", false, "single"))
	}
	return ports, nil
}

func legacyDescriptorID(node wireRecord, data wireRecord, path string) (string, error) {
	if value, exists := data["kind"]; exists {
		kind, err := canonicalString(value, path+"/data/kind")
		if err == nil {
			return "core." + kind, nil
		}
	}
	if value, exists := node["type"]; exists {
		nodeType, err := canonicalString(value, path+"/type")
		if err == nil && nodeType != "graphNode" {
			return "core." + nodeType, nil
		}
	}
	return "", migrationFailure(
		path+"/data/kind",
		"legacy node has no uniquely resolvable descriptor identity",
	)
}

func migrateLegacyEditor(data wireRecord, path string) (wireRecord, error) {
	editor := wireRecord{}
	if value, exists := data["x-prodivix-canvas-layout"]; exists {
		layout, err := requireRecord(value, path+"/x-prodivix-canvas-layout")
		if err != nil {
			return nil, err
		}
		version, ok := numberAsFiniteFloat(layout["version"])
		if !ok || version != 1 {
			return nil, migrationFailure(
				path+"/x-prodivix-canvas-layout/version",
				"legacy canvas layout version must be 1",
			)
		}
		x, xOK := numberAsFiniteFloat(layout["x"])
		y, yOK := numberAsFiniteFloat(layout["y"])
		if !xOK || !yOK {
			return nil, migrationFailure(
				path+"/x-prodivix-canvas-layout",
				"legacy canvas position must be finite",
			)
		}
		editor["position"] = wireRecord{"x": x, "y": y}
		if value, exists := layout["parentId"]; exists {
			parentID, err := canonicalString(value, path+"/x-prodivix-canvas-layout/parentId")
			if err != nil {
				return nil, err
			}
			editor["parentId"] = parentID
		}
		if layout["extent"] == "parent" {
			editor["extent"] = "parent"
		}
		if value, exists := layout["zIndex"]; exists {
			number, ok := value.(json.Number)
			if !ok {
				return nil, migrationFailure(path+"/x-prodivix-canvas-layout/zIndex", "value must be an integer")
			}
			zIndex, err := number.Int64()
			if err != nil {
				return nil, migrationFailure(path+"/x-prodivix-canvas-layout/zIndex", "value must be an integer")
			}
			editor["zIndex"] = zIndex
		}
		if value, exists := layout["collapsed"]; exists {
			collapsed, ok := value.(bool)
			if !ok {
				return nil, migrationFailure(path+"/x-prodivix-canvas-layout/collapsed", "value must be boolean")
			}
			editor["collapsed"] = collapsed
		}
	}
	if value, exists := data["label"]; exists {
		label, err := canonicalString(value, path+"/label")
		if err != nil {
			return nil, err
		}
		editor["label"] = label
	}
	return editor, nil
}

func numberAsFiniteFloat(value any) (float64, bool) {
	number, ok := value.(json.Number)
	if !ok {
		return 0, false
	}
	parsed, err := number.Float64()
	return parsed, err == nil && !math.IsInf(parsed, 0) && !math.IsNaN(parsed)
}

func migrateLegacyConfiguration(data wireRecord, path string) (wireRecord, error) {
	configuration := wireRecord{}
	for _, key := range sortedKeys(data) {
		if key == "kind" || key == "label" || key == "x-prodivix-canvas-layout" {
			continue
		}
		if isUnsafeKey(key) {
			return nil, migrationFailure(path+"/"+key, "unsafe configuration key")
		}
		configuration[key] = data[key]
	}
	return configuration, nil
}

func resolveMigratedPort(
	node wireRecord,
	direction string,
	requested any,
	path string,
) (string, error) {
	rawPorts, err := requireArray(node["ports"], path)
	if err != nil {
		return "", err
	}
	ports := make([]string, 0, len(rawPorts))
	for _, value := range rawPorts {
		port, err := requireRecord(value, path)
		if err != nil || port["direction"] != direction {
			continue
		}
		id, err := canonicalString(port["id"], path)
		if err == nil {
			ports = append(ports, id)
		}
	}
	if requested != nil {
		id, err := canonicalString(requested, path)
		if err != nil {
			return "", err
		}
		for _, candidate := range ports {
			if candidate == id {
				return id, nil
			}
		}
		return "", migrationFailure(path, "edge references unknown %s port %q", direction, id)
	}
	if len(ports) == 1 {
		return ports[0], nil
	}
	return "", migrationFailure(
		path,
		"legacy node-level edge is ambiguous and requires an explicit port mapping",
	)
}

func migrateV1(source wireRecord) (json.RawMessage, error) {
	if err := assertAllowedKeys(source, "", "version", "nodes", "edges"); err != nil {
		return nil, err
	}
	legacyNodes, err := requireArray(source["nodes"], "/nodes")
	if err != nil {
		return nil, err
	}
	legacyEdges, err := requireArray(source["edges"], "/edges")
	if err != nil {
		return nil, err
	}

	nodes := make([]any, 0, len(legacyNodes))
	nodesByID := make(map[string]wireRecord, len(legacyNodes))
	for index, value := range legacyNodes {
		path := fmt.Sprintf("/nodes/%d", index)
		node, err := requireRecord(value, path)
		if err != nil {
			return nil, err
		}
		if err := assertAllowedKeys(node, path, "id", "type", "data", "ports", "executor"); err != nil {
			return nil, err
		}
		id, err := canonicalString(node["id"], path+"/id")
		if err != nil {
			return nil, err
		}
		if _, duplicate := nodesByID[id]; duplicate {
			return nil, migrationFailure(path+"/id", "duplicate legacy node id %q", id)
		}
		data, err := requireRecord(node["data"], path+"/data")
		if err != nil {
			return nil, err
		}
		descriptorID, err := legacyDescriptorID(node, data, path)
		if err != nil {
			return nil, err
		}

		var ports []any
		if value, exists := node["ports"]; exists {
			legacyPorts, err := requireArray(value, path+"/ports")
			if err != nil || len(legacyPorts) == 0 {
				return nil, migrationFailure(path+"/ports", "legacy ports must be a non-empty array")
			}
			portIDs := make(map[string]struct{}, len(legacyPorts))
			for portIndex, rawPort := range legacyPorts {
				port, err := migrateLegacyPort(rawPort, fmt.Sprintf("%s/ports/%d", path, portIndex))
				if err != nil {
					return nil, err
				}
				id := port["id"].(string)
				if _, duplicate := portIDs[id]; duplicate {
					return nil, migrationFailure(path+"/ports", "duplicate port identity %q", id)
				}
				portIDs[id] = struct{}{}
				ports = append(ports, port)
			}
		} else if descriptorID == "core.switch" {
			ports, err = dynamicSwitchPorts(id, legacyEdges)
			if err != nil {
				return nil, err
			}
		} else {
			ports = staticLegacyPorts(descriptorID)
		}
		if len(ports) == 0 {
			return nil, migrationFailure(
				path+"/ports",
				"legacy node ports cannot be inferred uniquely from its descriptor",
			)
		}
		configuration, err := migrateLegacyConfiguration(data, path+"/data")
		if err != nil {
			return nil, err
		}
		editor, err := migrateLegacyEditor(data, path+"/data")
		if err != nil {
			return nil, err
		}
		migrated := wireRecord{
			"id":            id,
			"descriptorRef": wireRecord{"id": descriptorID, "version": "1"},
			"ports":         ports,
			"configuration": configuration,
			"editor":        editor,
		}
		if codeSlot, exists := node["executor"]; exists {
			migrated["codeSlot"] = codeSlot
		}
		nodesByID[id] = migrated
		nodes = append(nodes, migrated)
	}

	edges := make([]any, 0, len(legacyEdges))
	edgeIDs := make(map[string]struct{}, len(legacyEdges))
	for index, value := range legacyEdges {
		path := fmt.Sprintf("/edges/%d", index)
		edge, err := requireRecord(value, path)
		if err != nil {
			return nil, err
		}
		if err := assertAllowedKeys(
			edge,
			path,
			"id",
			"source",
			"target",
			"sourceHandle",
			"targetHandle",
		); err != nil {
			return nil, err
		}
		id, err := canonicalString(edge["id"], path+"/id")
		if err != nil {
			return nil, err
		}
		if _, duplicate := edgeIDs[id]; duplicate {
			return nil, migrationFailure(path+"/id", "duplicate legacy edge id %q", id)
		}
		edgeIDs[id] = struct{}{}
		source, err := canonicalString(edge["source"], path+"/source")
		if err != nil {
			return nil, err
		}
		target, err := canonicalString(edge["target"], path+"/target")
		if err != nil {
			return nil, err
		}
		sourceNode, sourceExists := nodesByID[source]
		targetNode, targetExists := nodesByID[target]
		if !sourceExists || !targetExists {
			return nil, migrationFailure(path, "legacy edge references a missing node")
		}
		sourcePortID, err := resolveMigratedPort(
			sourceNode,
			"output",
			edge["sourceHandle"],
			path+"/sourceHandle",
		)
		if err != nil {
			return nil, err
		}
		targetPortID, err := resolveMigratedPort(
			targetNode,
			"input",
			edge["targetHandle"],
			path+"/targetHandle",
		)
		if err != nil {
			return nil, err
		}
		edges = append(edges, wireRecord{
			"id": id,
			"source": wireRecord{
				"nodeId": source,
				"portId": sourcePortID,
			},
			"target": wireRecord{
				"nodeId": target,
				"portId": targetPortID,
			},
		})
	}

	upgraded, err := json.Marshal(wireRecord{
		"version": CurrentVersion,
		"nodes":   nodes,
		"edges":   edges,
	})
	if err != nil {
		return nil, migrationFailure("/", "encode upgraded document: %v", err)
	}
	if err := ValidateDocument(upgraded); err != nil {
		return nil, migrationFailure("/", "upgraded document violates current schema: %v", err)
	}
	return upgraded, nil
}

// UpgradeDocument deterministically promotes any supported persisted snapshot
// into the activated immutable wire version.
func UpgradeDocument(payload json.RawMessage) (UpgradeResult, error) {
	document, err := decodeWireDocument(payload)
	if err != nil {
		return UpgradeResult{}, err
	}
	version, err := readVersion(document)
	if err != nil {
		return UpgradeResult{}, err
	}
	switch version {
	case CurrentVersion:
		if err := ValidateDocument(payload); err != nil {
			return UpgradeResult{}, migrationFailure("/", "current document is invalid: %v", err)
		}
		return UpgradeResult{
			Document:      append(json.RawMessage(nil), payload...),
			SourceVersion: version,
			Migrated:      false,
		}, nil
	case 1:
		upgraded, err := migrateV1(document)
		if err != nil {
			return UpgradeResult{}, err
		}
		return UpgradeResult{
			Document:      upgraded,
			SourceVersion: version,
			Migrated:      true,
		}, nil
	default:
		return UpgradeResult{}, migrationFailure(
			"/version",
			"unsupported NodeGraph wire version %d",
			version,
		)
	}
}
