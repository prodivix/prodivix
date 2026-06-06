package workspace

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strconv"
	"strings"
)

var (
	ErrWorkspacePatchPathForbidden = errors.New("PIR graph patch path forbidden")
	ErrWorkspacePatchPathMissing   = errors.New("patch path does not exist")
	ErrWorkspacePatchInvalid       = errors.New("invalid JSON patch")
	ErrWorkspacePatchTestFailed    = errors.New("patch test failed")
)

type jsonPointer []string
type workspacePatchPathValidator func(path string) error

func applyWorkspacePatch(content json.RawMessage, ops []WorkspacePatchOp) (json.RawMessage, error) {
	return applyWorkspacePatchWithValidator(content, ops, validateWorkspacePatchPath)
}

func applyWorkspaceDocumentPatch(documentType WorkspaceDocumentType, content json.RawMessage, ops []WorkspacePatchOp) (json.RawMessage, error) {
	if documentType == WorkspaceDocumentTypeCode {
		return applyWorkspacePatchWithValidator(content, ops, validateWorkspaceCodePatchPath)
	}
	return applyWorkspacePatch(content, ops)
}

func applyWorkspacePatchWithValidator(content json.RawMessage, ops []WorkspacePatchOp, validatePath workspacePatchPathValidator) (json.RawMessage, error) {
	var document any
	if err := decodeJSONValue(content, &document); err != nil {
		return nil, err
	}
	next := deepCloneJSONValue(document)
	for index, op := range ops {
		patched, err := applyWorkspacePatchOperation(next, op, validatePath)
		if err != nil {
			return nil, fmt.Errorf("patch operation %d: %w", index, err)
		}
		next = patched
	}
	return json.Marshal(next)
}

func validateWorkspacePatchPath(path string) error {
	pointer, err := parseJSONPointer(path)
	if err != nil {
		return err
	}
	if len(pointer) == 0 {
		return ErrWorkspacePatchPathForbidden
	}
	if pointer[0] == "ui" && len(pointer) > 1 && pointer[1] == "root" {
		return ErrWorkspacePatchPathForbidden
	}
	switch pointer[0] {
	case "ui":
		if len(pointer) >= 2 && pointer[1] == "graph" {
			return nil
		}
	case "logic", "animation", "metadata":
		return nil
	default:
		if strings.HasPrefix(pointer[0], "x-") {
			return nil
		}
	}
	return ErrWorkspacePatchPathForbidden
}

func validateWorkspaceCodePatchPath(path string) error {
	pointer, err := parseJSONPointer(path)
	if err != nil {
		return err
	}
	if len(pointer) == 0 {
		return ErrWorkspacePatchPathForbidden
	}
	switch pointer[0] {
	case "language", "source":
		if len(pointer) == 1 {
			return nil
		}
	case "metadata":
		return nil
	default:
		if strings.HasPrefix(pointer[0], "x-") {
			return nil
		}
	}
	return ErrWorkspacePatchPathForbidden
}

func applyWorkspacePatchOperation(document any, op WorkspacePatchOp, validatePath workspacePatchPathValidator) (any, error) {
	op.Op = strings.TrimSpace(strings.ToLower(op.Op))
	op.Path = strings.TrimSpace(op.Path)
	op.From = strings.TrimSpace(op.From)
	if err := validatePath(op.Path); err != nil {
		return nil, err
	}
	path, err := parseJSONPointer(op.Path)
	if err != nil {
		return nil, err
	}
	value, err := decodePatchValue(op.Value)
	if err != nil {
		return nil, err
	}

	switch op.Op {
	case "add":
		return addJSONValue(document, path, value)
	case "remove":
		return removeJSONValue(document, path)
	case "replace":
		if _, err := getJSONValue(document, path); err != nil {
			return nil, err
		}
		removed, err := removeJSONValue(document, path)
		if err != nil {
			return nil, err
		}
		return addJSONValue(removed, path, value)
	case "test":
		current, err := getJSONValue(document, path)
		if err != nil {
			return nil, err
		}
		if !jsonDeepEqual(current, value) {
			return nil, ErrWorkspacePatchTestFailed
		}
		return document, nil
	case "copy":
		from, err := parseAndValidateFromPointer(op.From, validatePath)
		if err != nil {
			return nil, err
		}
		value, err := getJSONValue(document, from)
		if err != nil {
			return nil, err
		}
		return addJSONValue(document, path, deepCloneJSONValue(value))
	case "move":
		from, err := parseAndValidateFromPointer(op.From, validatePath)
		if err != nil {
			return nil, err
		}
		if isPointerPrefix(from, path) {
			return nil, fmt.Errorf("%w: cannot move a value into itself", ErrWorkspacePatchInvalid)
		}
		value, err := getJSONValue(document, from)
		if err != nil {
			return nil, err
		}
		removed, err := removeJSONValue(document, from)
		if err != nil {
			return nil, err
		}
		adjustedPath := adjustMoveDestinationAfterRemove(from, path)
		return addJSONValue(removed, adjustedPath, value)
	default:
		return nil, fmt.Errorf("%w: unsupported op %q", ErrWorkspacePatchInvalid, op.Op)
	}
}

func parseAndValidateFromPointer(raw string, validatePath workspacePatchPathValidator) (jsonPointer, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, fmt.Errorf("%w: from is required", ErrWorkspacePatchInvalid)
	}
	if err := validatePath(raw); err != nil {
		return nil, err
	}
	return parseJSONPointer(raw)
}

func parseJSONPointer(raw string) (jsonPointer, error) {
	if raw == "" {
		return jsonPointer{}, nil
	}
	if !strings.HasPrefix(raw, "/") {
		return nil, fmt.Errorf("%w: path must be a JSON pointer", ErrWorkspacePatchInvalid)
	}
	parts := strings.Split(raw[1:], "/")
	pointer := make(jsonPointer, 0, len(parts))
	for _, part := range parts {
		decoded := strings.Builder{}
		for index := 0; index < len(part); index++ {
			if part[index] != '~' {
				decoded.WriteByte(part[index])
				continue
			}
			if index+1 >= len(part) {
				return nil, fmt.Errorf("%w: invalid JSON pointer escape", ErrWorkspacePatchInvalid)
			}
			switch part[index+1] {
			case '0':
				decoded.WriteByte('~')
			case '1':
				decoded.WriteByte('/')
			default:
				return nil, fmt.Errorf("%w: invalid JSON pointer escape", ErrWorkspacePatchInvalid)
			}
			index++
		}
		pointer = append(pointer, decoded.String())
	}
	return pointer, nil
}

func decodeJSONValue(payload json.RawMessage, target *any) error {
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.UseNumber()
	return decoder.Decode(target)
}

func decodePatchValue(payload json.RawMessage) (any, error) {
	if len(payload) == 0 {
		return nil, nil
	}
	var value any
	if err := decodeJSONValue(payload, &value); err != nil {
		return nil, err
	}
	return value, nil
}

func deepCloneJSONValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		next := make(map[string]any, len(typed))
		for key, item := range typed {
			next[key] = deepCloneJSONValue(item)
		}
		return next
	case []any:
		next := make([]any, len(typed))
		for index, item := range typed {
			next[index] = deepCloneJSONValue(item)
		}
		return next
	default:
		return typed
	}
}

func getJSONValue(document any, path jsonPointer) (any, error) {
	current := document
	for _, segment := range path {
		switch typed := current.(type) {
		case map[string]any:
			next, ok := typed[segment]
			if !ok {
				return nil, fmt.Errorf("%w: %s", ErrWorkspacePatchPathMissing, segment)
			}
			current = next
		case []any:
			index, err := parseArrayIndex(segment, len(typed), false)
			if err != nil {
				return nil, err
			}
			current = typed[index]
		default:
			return nil, fmt.Errorf("%w: %s", ErrWorkspacePatchPathMissing, segment)
		}
	}
	return current, nil
}

func addJSONValue(document any, path jsonPointer, value any) (any, error) {
	if len(path) == 0 {
		return deepCloneJSONValue(value), nil
	}
	parentPath := path[:len(path)-1]
	key := path[len(path)-1]
	parent, err := getJSONValue(document, parentPath)
	if err != nil {
		return nil, err
	}
	switch typed := parent.(type) {
	case map[string]any:
		nextParent := deepCloneJSONValue(typed).(map[string]any)
		nextParent[key] = deepCloneJSONValue(value)
		return replaceExistingJSONValue(document, parentPath, nextParent)
	case []any:
		index, err := parseArrayIndex(key, len(typed), true)
		if err != nil {
			return nil, err
		}
		nextParent := make([]any, 0, len(typed)+1)
		nextParent = append(nextParent, typed[:index]...)
		nextParent = append(nextParent, deepCloneJSONValue(value))
		nextParent = append(nextParent, typed[index:]...)
		return replaceExistingJSONValue(document, parentPath, nextParent)
	default:
		return nil, fmt.Errorf("%w: parent is not container", ErrWorkspacePatchInvalid)
	}
}

func removeJSONValue(document any, path jsonPointer) (any, error) {
	if len(path) == 0 {
		return nil, fmt.Errorf("%w: remove root is forbidden", ErrWorkspacePatchInvalid)
	}
	parentPath := path[:len(path)-1]
	key := path[len(path)-1]
	parent, err := getJSONValue(document, parentPath)
	if err != nil {
		return nil, err
	}
	switch typed := parent.(type) {
	case map[string]any:
		if _, ok := typed[key]; !ok {
			return nil, fmt.Errorf("%w: %s", ErrWorkspacePatchPathMissing, key)
		}
		nextParent := deepCloneJSONValue(typed).(map[string]any)
		delete(nextParent, key)
		return replaceExistingJSONValue(document, parentPath, nextParent)
	case []any:
		index, err := parseArrayIndex(key, len(typed), false)
		if err != nil {
			return nil, err
		}
		nextParent := make([]any, 0, len(typed)-1)
		nextParent = append(nextParent, typed[:index]...)
		nextParent = append(nextParent, typed[index+1:]...)
		return replaceExistingJSONValue(document, parentPath, nextParent)
	default:
		return nil, fmt.Errorf("%w: parent is not container", ErrWorkspacePatchInvalid)
	}
}

func replaceExistingJSONValue(document any, path jsonPointer, value any) (any, error) {
	if len(path) == 0 {
		return deepCloneJSONValue(value), nil
	}
	parentPath := path[:len(path)-1]
	key := path[len(path)-1]
	parent, err := getJSONValue(document, parentPath)
	if err != nil {
		return nil, err
	}
	switch typed := parent.(type) {
	case map[string]any:
		if _, ok := typed[key]; !ok {
			return nil, fmt.Errorf("%w: %s", ErrWorkspacePatchPathMissing, key)
		}
		nextParent := deepCloneJSONValue(typed).(map[string]any)
		nextParent[key] = deepCloneJSONValue(value)
		return replaceExistingJSONValue(document, parentPath, nextParent)
	case []any:
		index, err := parseArrayIndex(key, len(typed), false)
		if err != nil {
			return nil, err
		}
		nextParent := deepCloneJSONValue(typed).([]any)
		nextParent[index] = deepCloneJSONValue(value)
		return replaceExistingJSONValue(document, parentPath, nextParent)
	default:
		return nil, fmt.Errorf("%w: parent is not container", ErrWorkspacePatchInvalid)
	}
}

func parseArrayIndex(segment string, length int, allowAppend bool) (int, error) {
	if segment == "-" {
		if allowAppend {
			return length, nil
		}
		return 0, fmt.Errorf("%w: '-' only valid for add", ErrWorkspacePatchInvalid)
	}
	if segment == "" || (len(segment) > 1 && strings.HasPrefix(segment, "0")) {
		return 0, fmt.Errorf("%w: invalid array index %q", ErrWorkspacePatchInvalid, segment)
	}
	index, err := strconv.Atoi(segment)
	if err != nil || index < 0 {
		return 0, fmt.Errorf("%w: invalid array index %q", ErrWorkspacePatchInvalid, segment)
	}
	if allowAppend {
		if index > length {
			return 0, fmt.Errorf("%w: array index %d out of range", ErrWorkspacePatchPathMissing, index)
		}
		return index, nil
	}
	if index >= length {
		return 0, fmt.Errorf("%w: array index %d out of range", ErrWorkspacePatchPathMissing, index)
	}
	return index, nil
}

func jsonDeepEqual(left any, right any) bool {
	return reflect.DeepEqual(normalizeJSONNumbers(left), normalizeJSONNumbers(right))
}

func normalizeJSONNumbers(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		next := make(map[string]any, len(typed))
		for key, item := range typed {
			next[key] = normalizeJSONNumbers(item)
		}
		return next
	case []any:
		next := make([]any, len(typed))
		for index, item := range typed {
			next[index] = normalizeJSONNumbers(item)
		}
		return next
	case json.Number:
		if integer, err := typed.Int64(); err == nil {
			return integer
		}
		if float, err := typed.Float64(); err == nil {
			return float
		}
		return typed.String()
	default:
		return typed
	}
}

func isPointerPrefix(prefix jsonPointer, path jsonPointer) bool {
	if len(prefix) > len(path) {
		return false
	}
	for index := range prefix {
		if prefix[index] != path[index] {
			return false
		}
	}
	return true
}

func adjustMoveDestinationAfterRemove(from jsonPointer, path jsonPointer) jsonPointer {
	if len(from) == 0 || len(path) == 0 || len(from) != len(path) {
		return path
	}
	for index := 0; index < len(from)-1; index++ {
		if from[index] != path[index] {
			return path
		}
	}
	fromIndex, fromErr := strconv.Atoi(from[len(from)-1])
	pathIndex, pathErr := strconv.Atoi(path[len(path)-1])
	if fromErr != nil || pathErr != nil || fromIndex >= pathIndex {
		return path
	}
	next := append(jsonPointer{}, path...)
	next[len(next)-1] = strconv.Itoa(pathIndex - 1)
	return next
}
