package workspace

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
)

func isExplicitJSONNull(value json.RawMessage) bool {
	return bytes.Equal(bytes.TrimSpace(value), []byte("null"))
}

func rejectCommitNullField(fields map[string]json.RawMessage, field string, path string) error {
	value, present := fields[field]
	if present && isExplicitJSONNull(value) {
		return commitValidation(path+"/"+field, "field cannot be null when present")
	}
	return nil
}

func validateCommitPatchWirePresence(payload json.RawMessage, path string) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return err
	}
	return rejectCommitNullField(fields, "from", path)
}

func validateCommitCommandWirePresence(payload json.RawMessage, path string) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return err
	}
	for _, field := range []string{"mergeKey", "label", "domainHint"} {
		if err := rejectCommitNullField(fields, field, path); err != nil {
			return err
		}
	}

	var target map[string]json.RawMessage
	if rawTarget, present := fields["target"]; present && !isExplicitJSONNull(rawTarget) {
		if err := json.Unmarshal(rawTarget, &target); err != nil {
			return err
		}
	}
	for _, field := range []string{"documentId", "routeNodeId"} {
		rawValue, present := target[field]
		if !present {
			continue
		}
		if isExplicitJSONNull(rawValue) {
			return commitValidation(path+"/target/"+field, "optional target ids cannot be null")
		}
		var value string
		if err := json.Unmarshal(rawValue, &value); err != nil {
			return err
		}
		if strings.TrimSpace(value) == "" {
			return commitValidation(path+"/target/"+field, "optional target ids must be non-empty when present")
		}
	}

	for _, direction := range []string{"forwardOps", "reverseOps"} {
		var operations []json.RawMessage
		if rawOperations, present := fields[direction]; present && !isExplicitJSONNull(rawOperations) {
			if err := json.Unmarshal(rawOperations, &operations); err != nil {
				return err
			}
		}
		for index, operation := range operations {
			if err := validateCommitPatchWirePresence(operation, fmt.Sprintf("%s/%s/%d", path, direction, index)); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateCommitTransactionWirePresence(payload json.RawMessage, path string) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return err
	}
	for _, field := range []string{"label", "mergeKey"} {
		if err := rejectCommitNullField(fields, field, path); err != nil {
			return err
		}
	}
	var commands []json.RawMessage
	if rawCommands, present := fields["commands"]; present && !isExplicitJSONNull(rawCommands) {
		if err := json.Unmarshal(rawCommands, &commands); err != nil {
			return err
		}
	}
	for index, command := range commands {
		if err := validateCommitCommandWirePresence(command, fmt.Sprintf("%s/commands/%d", path, index)); err != nil {
			return err
		}
	}
	return nil
}

// validateWorkspaceOperationCommitWirePresence preserves the distinction
// between an omitted optional field and an OpenAPI-invalid explicit null before
// the shared Go envelope types normalize both forms to their zero values.
func validateWorkspaceOperationCommitWirePresence(payload json.RawMessage) error {
	var request map[string]json.RawMessage
	if err := json.Unmarshal(payload, &request); err != nil {
		return err
	}
	var operation map[string]json.RawMessage
	if rawOperation, present := request["operation"]; present && !isExplicitJSONNull(rawOperation) {
		if err := json.Unmarshal(rawOperation, &operation); err != nil {
			return err
		}
	}
	for _, field := range []string{"command", "transaction", "undoOf", "redoOf", "sourceOperationIds"} {
		if err := rejectCommitNullField(operation, field, "/operation"); err != nil {
			return err
		}
	}
	if command, present := operation["command"]; present {
		if err := validateCommitCommandWirePresence(command, "/operation/command"); err != nil {
			return err
		}
	}
	if transaction, present := operation["transaction"]; present {
		if err := validateCommitTransactionWirePresence(transaction, "/operation/transaction"); err != nil {
			return err
		}
	}
	return nil
}
