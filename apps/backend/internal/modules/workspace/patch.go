package workspace

import (
	"encoding/json"
	"errors"
	"fmt"
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
	if !isPIRWorkspaceDocumentType(documentType) {
		return applyWorkspacePatchWithValidator(content, ops, validateGenericWorkspaceDocumentPatchPath)
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

func validateGenericWorkspaceDocumentPatchPath(path string) error {
	pointer, err := parseJSONPointer(path)
	if err != nil {
		return err
	}
	if len(pointer) == 0 {
		return ErrWorkspacePatchPathForbidden
	}
	return nil
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
