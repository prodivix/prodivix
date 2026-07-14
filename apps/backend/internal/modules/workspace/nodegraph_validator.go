package workspace

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var ErrNodeGraphValidationFailed = errors.New("NodeGraph validation failed")

var defaultNodeGraphDocument = json.RawMessage(`{"version":1,"nodes":[],"edges":[]}`)

func validateNodeGraphDocument(payload json.RawMessage) error {
	fields, err := decodeNodeGraphObject(payload, "/")
	if err != nil {
		return err
	}
	if err := rejectUnknownNodeGraphFields(fields, "/", "version", "nodes", "edges"); err != nil {
		return err
	}
	for _, field := range []string{"version", "nodes", "edges"} {
		if _, exists := fields[field]; !exists {
			return nodeGraphValidationError("/%s is required", field)
		}
	}

	var version int
	if err := json.Unmarshal(fields["version"], &version); err != nil || version != 1 {
		return nodeGraphValidationError("/version must equal 1")
	}
	var nodes []json.RawMessage
	if !isJSONArray(fields["nodes"]) || json.Unmarshal(fields["nodes"], &nodes) != nil {
		return nodeGraphValidationError("/nodes must be an array")
	}
	var edges []json.RawMessage
	if !isJSONArray(fields["edges"]) || json.Unmarshal(fields["edges"], &edges) != nil {
		return nodeGraphValidationError("/edges must be an array")
	}

	nodeIDs := make(map[string]struct{}, len(nodes))
	for index, rawNode := range nodes {
		path := fmt.Sprintf("/nodes/%d", index)
		node, err := decodeNodeGraphObject(rawNode, path)
		if err != nil {
			return err
		}
		if err := rejectUnknownNodeGraphFields(node, path, "id", "type", "data"); err != nil {
			return err
		}
		id, err := requireNodeGraphID(node, "id", path+"/id")
		if err != nil {
			return err
		}
		if _, duplicate := nodeIDs[id]; duplicate {
			return nodeGraphValidationError("%s duplicates node id %q", path+"/id", id)
		}
		nodeIDs[id] = struct{}{}
		if rawType, exists := node["type"]; exists {
			if _, err := decodeNodeGraphCanonicalString(rawType, path+"/type"); err != nil {
				return err
			}
		}
		data, exists := node["data"]
		if !exists || !isJSONObject(data) {
			return nodeGraphValidationError("%s must be an object", path+"/data")
		}
	}

	edgeIDs := make(map[string]struct{}, len(edges))
	for index, rawEdge := range edges {
		path := fmt.Sprintf("/edges/%d", index)
		edge, err := decodeNodeGraphObject(rawEdge, path)
		if err != nil {
			return err
		}
		if err := rejectUnknownNodeGraphFields(edge, path, "id", "source", "target", "sourceHandle", "targetHandle"); err != nil {
			return err
		}
		id, err := requireNodeGraphID(edge, "id", path+"/id")
		if err != nil {
			return err
		}
		if _, duplicate := edgeIDs[id]; duplicate {
			return nodeGraphValidationError("%s duplicates edge id %q", path+"/id", id)
		}
		edgeIDs[id] = struct{}{}
		source, err := requireNodeGraphID(edge, "source", path+"/source")
		if err != nil {
			return err
		}
		target, err := requireNodeGraphID(edge, "target", path+"/target")
		if err != nil {
			return err
		}
		if _, exists := nodeIDs[source]; !exists {
			return nodeGraphValidationError("%s references unknown node %q", path+"/source", source)
		}
		if _, exists := nodeIDs[target]; !exists {
			return nodeGraphValidationError("%s references unknown node %q", path+"/target", target)
		}
		for _, handle := range []string{"sourceHandle", "targetHandle"} {
			rawHandle, exists := edge[handle]
			if !exists || bytes.Equal(bytes.TrimSpace(rawHandle), []byte("null")) {
				continue
			}
			var value string
			if err := json.Unmarshal(rawHandle, &value); err != nil {
				return nodeGraphValidationError("%s must be a string or null", path+"/"+handle)
			}
		}
	}
	return nil
}

func decodeNodeGraphObject(payload json.RawMessage, path string) (map[string]json.RawMessage, error) {
	if !isJSONObject(payload) {
		return nil, nodeGraphValidationError("%s must be an object", path)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return nil, nodeGraphValidationError("%s must be an object", path)
	}
	return fields, nil
}

func rejectUnknownNodeGraphFields(fields map[string]json.RawMessage, path string, allowed ...string) error {
	allowedFields := make(map[string]struct{}, len(allowed))
	for _, field := range allowed {
		allowedFields[field] = struct{}{}
	}
	for field := range fields {
		if _, exists := allowedFields[field]; !exists {
			return nodeGraphValidationError("%s contains unknown field %q", path, field)
		}
	}
	return nil
}

func requireNodeGraphID(fields map[string]json.RawMessage, field string, path string) (string, error) {
	payload, exists := fields[field]
	if !exists {
		return "", nodeGraphValidationError("%s is required", path)
	}
	return decodeNodeGraphCanonicalString(payload, path)
}

func decodeNodeGraphCanonicalString(payload json.RawMessage, path string) (string, error) {
	var value string
	if err := json.Unmarshal(payload, &value); err != nil || value == "" || value != strings.TrimSpace(value) {
		return "", nodeGraphValidationError("%s must be a canonical non-empty string", path)
	}
	return value, nil
}

func isJSONObject(payload json.RawMessage) bool {
	trimmed := bytes.TrimSpace(payload)
	return len(trimmed) > 1 && trimmed[0] == '{'
}

func isJSONArray(payload json.RawMessage) bool {
	trimmed := bytes.TrimSpace(payload)
	return len(trimmed) > 1 && trimmed[0] == '['
}

func nodeGraphValidationError(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrNodeGraphValidationFailed, fmt.Sprintf(format, args...))
}
