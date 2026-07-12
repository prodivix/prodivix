package workspace

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

const (
	workspaceOperationCommitDomain = "core.workspace.operation-commit@1.0"
	maxJSONSafeInteger             = int64(1<<53 - 1)
)

var ErrWorkspaceCommitIdentityMismatch = errors.New("workspace operation identity was reused with a different request")

type WorkspaceOperationCommitValidationError struct {
	Path    string
	Message string
}

func (err *WorkspaceOperationCommitValidationError) Error() string {
	if err == nil {
		return "workspace operation commit is invalid"
	}
	if strings.TrimSpace(err.Path) == "" {
		return err.Message
	}
	return fmt.Sprintf("%s: %s", err.Path, err.Message)
}

type WorkspaceOperationEnvelope struct {
	Kind               string                        `json:"kind"`
	Command            *WorkspaceCommandEnvelope     `json:"command,omitempty"`
	Transaction        *WorkspaceTransactionEnvelope `json:"transaction,omitempty"`
	UndoOf             string                        `json:"undoOf,omitempty"`
	RedoOf             string                        `json:"redoOf,omitempty"`
	SourceOperationIDs []string                      `json:"sourceOperationIds,omitempty"`
}

type WorkspaceTransactionEnvelope struct {
	ID          string                     `json:"id"`
	WorkspaceID string                     `json:"workspaceId"`
	IssuedAt    time.Time                  `json:"issuedAt"`
	Commands    []WorkspaceCommandEnvelope `json:"commands"`
	Label       string                     `json:"label,omitempty"`
	MergeKey    string                     `json:"mergeKey,omitempty"`
}

// WorkspaceCommitExpectedDocument distinguishes an omitted revision from an
// explicit null. Both explicit nulls mean that the document must be absent.
type WorkspaceCommitExpectedDocument struct {
	ID                string `json:"-"`
	ContentRev        *int64 `json:"-"`
	MetaRev           *int64 `json:"-"`
	ContentRevPresent bool   `json:"-"`
	MetaRevPresent    bool   `json:"-"`
}

func (expected *WorkspaceCommitExpectedDocument) UnmarshalJSON(payload []byte) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return err
	}
	for key := range fields {
		if key != "id" && key != "contentRev" && key != "metaRev" {
			return fmt.Errorf("unknown expected document field %q", key)
		}
	}
	if err := json.Unmarshal(fields["id"], &expected.ID); err != nil {
		return errors.New("expected document id is required")
	}
	if raw, ok := fields["contentRev"]; ok {
		expected.ContentRevPresent = true
		if !bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			var revision int64
			if err := json.Unmarshal(raw, &revision); err != nil {
				return errors.New("expected document contentRev must be an integer or null")
			}
			if revision > maxJSONSafeInteger {
				return errors.New("expected document contentRev must be a JSON safe integer or null")
			}
			expected.ContentRev = &revision
		}
	}
	if raw, ok := fields["metaRev"]; ok {
		expected.MetaRevPresent = true
		if !bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			var revision int64
			if err := json.Unmarshal(raw, &revision); err != nil {
				return errors.New("expected document metaRev must be an integer or null")
			}
			if revision > maxJSONSafeInteger {
				return errors.New("expected document metaRev must be a JSON safe integer or null")
			}
			expected.MetaRev = &revision
		}
	}
	return nil
}

func (expected WorkspaceCommitExpectedDocument) MarshalJSON() ([]byte, error) {
	payload := map[string]any{"id": expected.ID}
	if expected.ContentRevPresent {
		payload["contentRev"] = expected.ContentRev
	}
	if expected.MetaRevPresent {
		payload["metaRev"] = expected.MetaRev
	}
	return json.Marshal(payload)
}

type WorkspaceOperationCommitExpected struct {
	WorkspaceRev *int64                            `json:"-"`
	RouteRev     *int64                            `json:"-"`
	Documents    []WorkspaceCommitExpectedDocument `json:"-"`
}

type WorkspaceOperationCommitRequest struct {
	Expected  *WorkspaceOperationCommitExpected `json:"expected"`
	Operation WorkspaceOperationEnvelope        `json:"operation"`
}

func (expected *WorkspaceOperationCommitExpected) UnmarshalJSON(payload []byte) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return err
	}
	for key := range fields {
		if key != "workspaceRev" && key != "routeRev" && key != "documents" {
			return fmt.Errorf("unknown expected revision field %q", key)
		}
	}
	decodeRevision := func(key string) (*int64, error) {
		raw, exists := fields[key]
		if !exists {
			return nil, nil
		}
		if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			return nil, fmt.Errorf("expected %s cannot be null", key)
		}
		var revision int64
		if err := json.Unmarshal(raw, &revision); err != nil {
			return nil, fmt.Errorf("expected %s must be an integer", key)
		}
		if revision > maxJSONSafeInteger {
			return nil, fmt.Errorf("expected %s must be a JSON safe integer", key)
		}
		return &revision, nil
	}
	var err error
	if expected.WorkspaceRev, err = decodeRevision("workspaceRev"); err != nil {
		return err
	}
	if expected.RouteRev, err = decodeRevision("routeRev"); err != nil {
		return err
	}
	documents, exists := fields["documents"]
	if !exists || bytes.Equal(bytes.TrimSpace(documents), []byte("null")) {
		return errors.New("expected documents array is required")
	}
	if err := json.Unmarshal(documents, &expected.Documents); err != nil {
		return errors.New("expected documents must be an array")
	}
	if expected.Documents == nil {
		expected.Documents = []WorkspaceCommitExpectedDocument{}
	}
	return nil
}

func (expected WorkspaceOperationCommitExpected) MarshalJSON() ([]byte, error) {
	payload := map[string]any{"documents": expected.Documents}
	if expected.WorkspaceRev != nil {
		payload["workspaceRev"] = *expected.WorkspaceRev
	}
	if expected.RouteRev != nil {
		payload["routeRev"] = *expected.RouteRev
	}
	return json.Marshal(payload)
}

type CommitWorkspaceOperationParams struct {
	WorkspaceID string
	OwnerID     string
	Request     WorkspaceOperationCommitRequest
}

type workspaceCommitDocumentRequirement struct {
	Content bool
	Meta    bool
	Absent  bool
}

type workspaceCommitRequirements struct {
	Workspace  bool
	Route      bool
	Persistent bool
	Documents  map[string]workspaceCommitDocumentRequirement
}

type normalizedWorkspaceOperationCommit struct {
	Request      WorkspaceOperationCommitRequest
	CommitID     string
	IssuedAt     time.Time
	Commands     []WorkspaceCommandEnvelope
	Requirements workspaceCommitRequirements
	RequestHash  string
}

type workspaceOperationCommitRecord struct {
	Kind        string                     `json:"kind"`
	Version     int                        `json:"version"`
	CommitID    string                     `json:"commitId"`
	RequestHash string                     `json:"requestHash"`
	Operation   WorkspaceOperationEnvelope `json:"operation"`
	Mutation    WorkspaceMutationResult    `json:"mutation"`
}

func commitValidation(path string, message string) error {
	return &WorkspaceOperationCommitValidationError{Path: path, Message: message}
}

func normalizeWorkspaceOperationCommit(
	workspaceID string,
	request WorkspaceOperationCommitRequest,
) (*normalizedWorkspaceOperationCommit, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" {
		return nil, commitValidation("/workspaceId", "workspace id is required")
	}
	operation, commitID, issuedAt, commands, err := normalizeWorkspaceOperation(request.Operation, workspaceID)
	if err != nil {
		return nil, err
	}
	request.Operation = operation
	requirements, err := analyzeWorkspaceOperationRequirements(commands)
	if err != nil {
		return nil, err
	}
	if request.Expected == nil {
		return nil, commitValidation("/expected", "expected revision vector is required")
	}
	if err := normalizeAndValidateCommitExpected(request.Expected, requirements); err != nil {
		return nil, err
	}
	canonical, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256(canonical)
	return &normalizedWorkspaceOperationCommit{
		Request:      request,
		CommitID:     commitID,
		IssuedAt:     issuedAt,
		Commands:     commands,
		Requirements: requirements,
		RequestHash:  hex.EncodeToString(digest[:]),
	}, nil
}

func normalizeWorkspaceOperation(
	operation WorkspaceOperationEnvelope,
	workspaceID string,
) (WorkspaceOperationEnvelope, string, time.Time, []WorkspaceCommandEnvelope, error) {
	if operation.Kind != "command" && operation.Kind != "transaction" {
		return operation, "", time.Time{}, nil, commitValidation("/operation/kind", "operation kind must use canonical command or transaction spelling")
	}
	operation.UndoOf = strings.TrimSpace(operation.UndoOf)
	operation.RedoOf = strings.TrimSpace(operation.RedoOf)
	if operation.UndoOf != "" && operation.RedoOf != "" {
		return operation, "", time.Time{}, nil, commitValidation("/operation", "undoOf and redoOf are mutually exclusive")
	}
	sources := make([]string, 0, len(operation.SourceOperationIDs))
	seenSources := make(map[string]struct{})
	for index, sourceID := range operation.SourceOperationIDs {
		sourceID = strings.TrimSpace(sourceID)
		if sourceID == "" {
			return operation, "", time.Time{}, nil, commitValidation(fmt.Sprintf("/operation/sourceOperationIds/%d", index), "source operation id is required")
		}
		if _, exists := seenSources[sourceID]; exists {
			continue
		}
		seenSources[sourceID] = struct{}{}
		sources = append(sources, sourceID)
	}
	operation.SourceOperationIDs = sources

	switch operation.Kind {
	case "command":
		if operation.Command == nil || operation.Transaction != nil {
			return operation, "", time.Time{}, nil, commitValidation("/operation", "command operations require only command")
		}
		if err := validateRawCommitCommand(*operation.Command); err != nil {
			return operation, "", time.Time{}, nil, err
		}
		command, err := normalizeWorkspaceCommand(*operation.Command)
		if err != nil {
			return operation, "", time.Time{}, nil, commitValidation("/operation/command", err.Error())
		}
		if err := validateCommitCommand(command, workspaceID); err != nil {
			return operation, "", time.Time{}, nil, err
		}
		if err := canonicalizeCommitCommandPatchValues(&command); err != nil {
			return operation, "", time.Time{}, nil, err
		}
		operation.Command = &command
		return operation, command.ID, command.IssuedAt, []WorkspaceCommandEnvelope{command}, nil
	case "transaction":
		if operation.Transaction == nil || operation.Command != nil {
			return operation, "", time.Time{}, nil, commitValidation("/operation", "transaction operations require only transaction")
		}
		transaction := *operation.Transaction
		if transaction.ID != strings.TrimSpace(transaction.ID) || transaction.WorkspaceID != strings.TrimSpace(transaction.WorkspaceID) {
			return operation, "", time.Time{}, nil, commitValidation("/operation/transaction", "transaction id and workspaceId must not contain outer whitespace")
		}
		transaction.ID = strings.TrimSpace(transaction.ID)
		transaction.WorkspaceID = strings.TrimSpace(transaction.WorkspaceID)
		transaction.Label = strings.TrimSpace(transaction.Label)
		transaction.MergeKey = strings.TrimSpace(transaction.MergeKey)
		if transaction.ID == "" || transaction.WorkspaceID != workspaceID || transaction.IssuedAt.IsZero() || len(transaction.Commands) == 0 {
			return operation, "", time.Time{}, nil, commitValidation("/operation/transaction", "transaction id, matching workspaceId, issuedAt and commands are required")
		}
		transaction.IssuedAt = transaction.IssuedAt.UTC()
		commands := make([]WorkspaceCommandEnvelope, 0, len(transaction.Commands))
		commandIDs := make(map[string]struct{})
		for index, candidate := range transaction.Commands {
			if err := validateRawCommitCommand(candidate); err != nil {
				return operation, "", time.Time{}, nil, err
			}
			command, err := normalizeWorkspaceCommand(candidate)
			if err != nil {
				return operation, "", time.Time{}, nil, commitValidation(fmt.Sprintf("/operation/transaction/commands/%d", index), err.Error())
			}
			if err := validateCommitCommand(command, workspaceID); err != nil {
				return operation, "", time.Time{}, nil, err
			}
			if err := canonicalizeCommitCommandPatchValues(&command); err != nil {
				return operation, "", time.Time{}, nil, err
			}
			if _, exists := commandIDs[command.ID]; exists {
				return operation, "", time.Time{}, nil, commitValidation(fmt.Sprintf("/operation/transaction/commands/%d/id", index), "command ids must be unique within a transaction")
			}
			commandIDs[command.ID] = struct{}{}
			commands = append(commands, command)
		}
		transaction.Commands = commands
		operation.Transaction = &transaction
		return operation, transaction.ID, transaction.IssuedAt, commands, nil
	default:
		return operation, "", time.Time{}, nil, commitValidation("/operation/kind", "operation kind must be command or transaction")
	}
}

func validateRawCommitCommand(command WorkspaceCommandEnvelope) error {
	canonicalFields := []struct {
		path  string
		value string
	}{
		{path: "/operation/command/id", value: command.ID},
		{path: "/operation/command/namespace", value: command.Namespace},
		{path: "/operation/command/type", value: command.Type},
		{path: "/operation/command/version", value: command.Version},
		{path: "/operation/command/target/workspaceId", value: command.Target.WorkspaceID},
		{path: "/operation/command/target/documentId", value: command.Target.DocumentID},
		{path: "/operation/command/target/routeNodeId", value: command.Target.RouteNodeID},
	}
	for _, field := range canonicalFields {
		if field.value != strings.TrimSpace(field.value) {
			return commitValidation(field.path, "value must not contain outer whitespace")
		}
	}
	if command.DomainHint != strings.TrimSpace(command.DomainHint) {
		return commitValidation("/operation/command/domainHint", "domainHint must not contain outer whitespace")
	}
	if command.DomainHint != "" {
		switch command.DomainHint {
		case "pir", "workspace", "route", "nodegraph", "animation", "code":
		default:
			return commitValidation("/operation/command/domainHint", "domainHint must use a canonical registered domain")
		}
	}
	validateOperations := func(operations []WorkspacePatchOp, direction string) error {
		for index, operation := range operations {
			if operation.Op != strings.TrimSpace(strings.ToLower(operation.Op)) {
				return commitValidation(fmt.Sprintf("/operation/command/%sOps/%d/op", direction, index), "patch op must use canonical lowercase spelling")
			}
			if operation.Path != strings.TrimSpace(operation.Path) {
				return commitValidation(fmt.Sprintf("/operation/command/%sOps/%d/path", direction, index), "patch path must not contain outer whitespace")
			}
			if _, err := parseJSONPointer(operation.Path); err != nil {
				return commitValidation(fmt.Sprintf("/operation/command/%sOps/%d/path", direction, index), err.Error())
			}
			if operation.From != strings.TrimSpace(operation.From) {
				return commitValidation(fmt.Sprintf("/operation/command/%sOps/%d/from", direction, index), "patch from must not contain outer whitespace")
			}
			if operation.From != "" {
				if _, err := parseJSONPointer(operation.From); err != nil {
					return commitValidation(fmt.Sprintf("/operation/command/%sOps/%d/from", direction, index), err.Error())
				}
			}
		}
		return nil
	}
	if err := validateOperations(command.ForwardOps, "forward"); err != nil {
		return err
	}
	return validateOperations(command.ReverseOps, "reverse")
}

func validateCommitCommand(command WorkspaceCommandEnvelope, workspaceID string) error {
	if err := validateWorkspaceCommand(command, workspaceID, nil); err != nil {
		return commitValidation("/operation/command", err.Error())
	}
	if len(command.ForwardOps) == 0 || len(command.ReverseOps) == 0 {
		return commitValidation("/operation/command", "forwardOps and reverseOps are required")
	}
	if command.Target.DocumentID != "" {
		for index, operation := range append(append([]WorkspacePatchOp{}, command.ForwardOps...), command.ReverseOps...) {
			if operation.Op == "move" || operation.Op == "copy" {
				return commitValidation(fmt.Sprintf("/operation/command/ops/%d/op", index), "atomic document commits do not support move/copy operations")
			}
		}
	}
	if command.Target.DocumentID != "" && command.Target.RouteNodeID != "" {
		return commitValidation("/operation/command/target", "documentId and routeNodeId are mutually exclusive")
	}
	hint := strings.TrimSpace(strings.ToLower(command.DomainHint))
	namespaceDomain := commitNamespaceDomain(command.Namespace)
	if namespaceDomain != "" && hint != "" && hint != namespaceDomain {
		return commitValidation("/operation/command/domainHint", fmt.Sprintf("domainHint %s conflicts with namespace domain %s", hint, namespaceDomain))
	}
	if command.Target.RouteNodeID != "" && commitCommandDomain(command) != "route" {
		return commitValidation("/operation/command/target/routeNodeId", "routeNodeId requires the route domain")
	}
	if command.Target.DocumentID != "" && (hint == "route" || hint == "workspace") {
		return commitValidation("/operation/command/domainHint", "document-targeted commands require a document domain")
	}
	if command.Target.DocumentID != "" {
		documentDomain := hint
		if documentDomain == "" {
			documentDomain = namespaceDomain
		}
		if documentDomain != "pir" && documentDomain != "nodegraph" && documentDomain != "animation" && documentDomain != "code" {
			return commitValidation("/operation/command/domainHint", "document-targeted commands require pir, nodegraph, animation, or code domain")
		}
	}
	return nil
}

func commitNamespaceDomain(namespace string) string {
	namespace = strings.TrimSpace(namespace)
	switch {
	case strings.HasPrefix(namespace, "core.pir"):
		return "pir"
	case strings.HasPrefix(namespace, "core.nodegraph"):
		return "nodegraph"
	case strings.HasPrefix(namespace, "core.animation"):
		return "animation"
	case strings.HasPrefix(namespace, "core.code"):
		return "code"
	case strings.HasPrefix(namespace, "core.route"):
		return "route"
	case strings.HasPrefix(namespace, "core.workspace"):
		return "workspace"
	default:
		return ""
	}
}

func canonicalizeCommitCommandPatchValues(command *WorkspaceCommandEnvelope) error {
	canonicalize := func(operations []WorkspacePatchOp, direction string) error {
		for index := range operations {
			operation := &operations[index]
			requiresValue := operation.Op == "add" || operation.Op == "replace" || operation.Op == "test"
			if requiresValue && len(bytes.TrimSpace(operation.Value)) == 0 {
				return commitValidation(fmt.Sprintf("/operation/command/%sOps/%d/value", direction, index), "patch value is required")
			}
			if len(bytes.TrimSpace(operation.Value)) == 0 {
				operation.Value = nil
				continue
			}
			decoder := json.NewDecoder(bytes.NewReader(operation.Value))
			decoder.UseNumber()
			var value any
			if err := decoder.Decode(&value); err != nil {
				return commitValidation(fmt.Sprintf("/operation/command/%sOps/%d/value", direction, index), "patch value must be valid JSON")
			}
			canonical, err := json.Marshal(value)
			if err != nil {
				return err
			}
			operation.Value = canonical
		}
		return nil
	}
	if err := canonicalize(command.ForwardOps, "forward"); err != nil {
		return err
	}
	return canonicalize(command.ReverseOps, "reverse")
}

func analyzeWorkspaceOperationRequirements(commands []WorkspaceCommandEnvelope) (workspaceCommitRequirements, error) {
	requirements := workspaceCommitRequirements{Documents: make(map[string]workspaceCommitDocumentRequirement)}
	structuralDocuments := make(map[string]string)
	for commandIndex, command := range commands {
		if documentID := strings.TrimSpace(command.Target.DocumentID); documentID != "" {
			requirement := requirements.Documents[documentID]
			if structuralDocuments[documentID] != "" {
				return requirements, commitValidation(fmt.Sprintf("/operation/commands/%d/target/documentId", commandIndex), "document content cannot be combined with an add or remove of the same document")
			}
			requirement.Content = true
			requirements.Documents[documentID] = requirement
			requirements.Persistent = true
			continue
		}
		domain := commitCommandDomain(command)
		switch domain {
		case "route":
			for operationIndex, operation := range command.ForwardOps {
				if operation.Op == "move" || operation.Op == "copy" {
					return requirements, commitValidation(fmt.Sprintf("/operation/commands/%d/forwardOps/%d/op", commandIndex, operationIndex), "route move/copy operations are not supported by atomic persistence")
				}
				if err := validateCommitRoutePatchPath(operation.Path); err != nil {
					return requirements, commitValidation(fmt.Sprintf("/operation/commands/%d/ops/%d/path", commandIndex, operationIndex), err.Error())
				}
				if operation.From != "" {
					if err := validateCommitRoutePatchPath(operation.From); err != nil {
						return requirements, commitValidation(fmt.Sprintf("/operation/commands/%d/forwardOps/%d/from", commandIndex, operationIndex), err.Error())
					}
					if isPersistentCommitRoutePath(operation.Path) != isPersistentCommitRoutePath(operation.From) {
						return requirements, commitValidation(fmt.Sprintf("/operation/commands/%d/forwardOps/%d/from", commandIndex, operationIndex), "route move/copy cannot cross persistent and ephemeral state")
					}
				}
				if isPersistentCommitRoutePath(operation.Path) {
					requirements.Workspace = true
					requirements.Route = true
					requirements.Persistent = true
				}
			}
			for operationIndex, operation := range command.ReverseOps {
				if operation.Op == "move" || operation.Op == "copy" {
					return requirements, commitValidation(fmt.Sprintf("/operation/commands/%d/reverseOps/%d/op", commandIndex, operationIndex), "route move/copy operations are not supported by atomic persistence")
				}
				if err := validateCommitRoutePatchPath(operation.Path); err != nil {
					return requirements, commitValidation(fmt.Sprintf("/operation/commands/%d/reverseOps/%d/path", commandIndex, operationIndex), err.Error())
				}
				if operation.From != "" {
					if err := validateCommitRoutePatchPath(operation.From); err != nil {
						return requirements, commitValidation(fmt.Sprintf("/operation/commands/%d/reverseOps/%d/from", commandIndex, operationIndex), err.Error())
					}
				}
				if operation.Op == "test" && isPersistentCommitRoutePath(operation.Path) {
					requirements.Workspace = true
					requirements.Route = true
				}
			}
		case "workspace":
			for operationIndex, operation := range command.ForwardOps {
				if operation.Op == "move" || operation.Op == "copy" {
					return requirements, commitValidation(fmt.Sprintf("/operation/commands/%d/forwardOps/%d/op", commandIndex, operationIndex), "workspace move/copy operations are not supported by atomic persistence")
				}
				documentID, mutation, err := analyzeCommitWorkspacePatch(operation)
				if err != nil {
					return requirements, commitValidation(fmt.Sprintf("/operation/commands/%d/forwardOps/%d/path", commandIndex, operationIndex), err.Error())
				}
				if mutation == "add" {
					if err := validateCommitNewDocumentValue(operation.Value, documentID); err != nil {
						return requirements, commitValidation(fmt.Sprintf("/operation/commands/%d/forwardOps/%d/value", commandIndex, operationIndex), err.Error())
					}
				}
				fromDocumentID := ""
				fromMutation := ""
				if operation.From != "" {
					fromDocumentID, fromMutation, err = analyzeCommitWorkspaceSourcePath(operation.From)
					if err != nil {
						return requirements, commitValidation(fmt.Sprintf("/operation/commands/%d/forwardOps/%d/from", commandIndex, operationIndex), err.Error())
					}
					if (mutation == "ephemeral") != (fromMutation == "ephemeral") {
						return requirements, commitValidation(fmt.Sprintf("/operation/commands/%d/forwardOps/%d/from", commandIndex, operationIndex), "workspace move/copy cannot cross persistent and ephemeral state")
					}
				}
				if mutation == "ephemeral" {
					continue
				}
				requirements.Workspace = true
				requirements.Persistent = true
				if documentID != "" {
					requirement := requirements.Documents[documentID]
					switch mutation {
					case "add":
						if previous := structuralDocuments[documentID]; previous != "" || requirement.Content || requirement.Meta {
							return requirements, commitValidation(fmt.Sprintf("/operation/commands/%d/forwardOps/%d", commandIndex, operationIndex), "a document can have only one structural mutation per commit")
						}
						structuralDocuments[documentID] = mutation
						requirement.Absent = true
					case "remove":
						if previous := structuralDocuments[documentID]; previous != "" || requirement.Content || requirement.Meta {
							return requirements, commitValidation(fmt.Sprintf("/operation/commands/%d/forwardOps/%d", commandIndex, operationIndex), "a document can have only one structural mutation per commit")
						}
						structuralDocuments[documentID] = mutation
						requirement.Content = true
						requirement.Meta = true
					case "meta":
						if structuralDocuments[documentID] != "" {
							return requirements, commitValidation(fmt.Sprintf("/operation/commands/%d/forwardOps/%d", commandIndex, operationIndex), "document metadata cannot be combined with an add or remove of the same document")
						}
						requirement.Meta = true
					}
					requirements.Documents[documentID] = requirement
				}
				if operation.Op == "move" && fromDocumentID != "" && fromMutation == "meta" {
					fromRequirement := requirements.Documents[fromDocumentID]
					if structuralDocuments[fromDocumentID] != "" {
						return requirements, commitValidation(fmt.Sprintf("/operation/commands/%d/forwardOps/%d/from", commandIndex, operationIndex), "document metadata move cannot be combined with structural mutation")
					}
					fromRequirement.Meta = true
					requirements.Documents[fromDocumentID] = fromRequirement
				}
			}
			for operationIndex, operation := range command.ReverseOps {
				if operation.Op == "move" || operation.Op == "copy" {
					return requirements, commitValidation(fmt.Sprintf("/operation/commands/%d/reverseOps/%d/op", commandIndex, operationIndex), "workspace move/copy operations are not supported by atomic persistence")
				}
				documentID, mutation, err := analyzeCommitWorkspacePatch(operation)
				if err != nil {
					return requirements, commitValidation(fmt.Sprintf("/operation/commands/%d/reverseOps/%d/path", commandIndex, operationIndex), err.Error())
				}
				if operation.From != "" {
					if _, _, err := analyzeCommitWorkspaceSourcePath(operation.From); err != nil {
						return requirements, commitValidation(fmt.Sprintf("/operation/commands/%d/reverseOps/%d/from", commandIndex, operationIndex), err.Error())
					}
				}
				if operation.Op != "test" || mutation == "ephemeral" {
					continue
				}
				requirements.Workspace = true
				if documentID != "" && mutation == "meta" {
					requirement := requirements.Documents[documentID]
					if structuralDocuments[documentID] != "" {
						continue
					}
					requirement.Meta = true
					requirements.Documents[documentID] = requirement
				}
			}
		default:
			return requirements, commitValidation(fmt.Sprintf("/operation/commands/%d/domainHint", commandIndex), "commands without a document target must use workspace or route domain")
		}
	}
	if !requirements.Persistent {
		return requirements, commitValidation("/operation", "operation has no persistent workspace writes")
	}
	return requirements, nil
}

func validateCommitNewDocumentValue(payload json.RawMessage, documentID string) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil || fields == nil {
		return errors.New("whole-document add value must be an object")
	}
	var valueID string
	if err := json.Unmarshal(fields["id"], &valueID); err != nil || valueID != documentID {
		return errors.New("whole-document add id must match its JSON pointer identity")
	}
	var contentRev int64
	if err := json.Unmarshal(fields["contentRev"], &contentRev); err != nil || contentRev != 1 {
		return errors.New("new document contentRev must be 1")
	}
	var metaRev int64
	if err := json.Unmarshal(fields["metaRev"], &metaRev); err != nil || metaRev != 1 {
		return errors.New("new document metaRev must be 1")
	}
	return nil
}

func commitCommandDomain(command WorkspaceCommandEnvelope) string {
	hint := strings.TrimSpace(strings.ToLower(command.DomainHint))
	if hint == "route" {
		return "route"
	}
	if hint == "workspace" {
		return "workspace"
	}
	if namespaceDomain := commitNamespaceDomain(command.Namespace); namespaceDomain == "route" || namespaceDomain == "workspace" {
		return namespaceDomain
	}
	if strings.TrimSpace(command.Target.RouteNodeID) != "" {
		return "route"
	}
	return ""
}

func analyzeCommitWorkspacePatch(operation WorkspacePatchOp) (string, string, error) {
	pointer, err := parseJSONPointer(operation.Path)
	if err != nil {
		return "", "", err
	}
	if len(pointer) == 1 && pointer[0] == "treeRootId" {
		return "", "workspace", nil
	}
	if len(pointer) >= 1 && pointer[0] == "treeById" {
		return "", "workspace", nil
	}
	if len(pointer) == 1 && (pointer[0] == "activeDocumentId" || pointer[0] == "activeRouteNodeId") {
		return "", "ephemeral", nil
	}
	if len(pointer) < 2 || pointer[0] != "docsById" || strings.TrimSpace(pointer[1]) == "" {
		return "", "", errors.New("workspace patches may change only treeRootId, treeById, or document metadata")
	}
	documentID := pointer[1]
	if len(pointer) == 2 {
		switch operation.Op {
		case "add":
			return documentID, "add", nil
		case "remove":
			return documentID, "remove", nil
		default:
			return "", "", errors.New("whole-document workspace patches support only add or remove")
		}
	}
	if len(pointer) >= 3 && (pointer[2] == "name" || pointer[2] == "path" || pointer[2] == "capabilities") {
		if (pointer[2] == "name" || pointer[2] == "path") && len(pointer) != 3 {
			return "", "", errors.New("document name and path patches must target the field directly")
		}
		return documentID, "meta", nil
	}
	return "", "", errors.New("document content must use a document-targeted command")
}

func analyzeCommitWorkspaceSourcePath(path string) (string, string, error) {
	pointer, err := parseJSONPointer(path)
	if err != nil {
		return "", "", err
	}
	if (len(pointer) == 1 && pointer[0] == "treeRootId") || (len(pointer) >= 1 && pointer[0] == "treeById") {
		return "", "workspace", nil
	}
	if len(pointer) == 1 && (pointer[0] == "activeDocumentId" || pointer[0] == "activeRouteNodeId") {
		return "", "ephemeral", nil
	}
	if len(pointer) >= 3 && pointer[0] == "docsById" && (pointer[2] == "name" || pointer[2] == "path" || pointer[2] == "capabilities") {
		if (pointer[2] == "name" || pointer[2] == "path") && len(pointer) != 3 {
			return "", "", errors.New("document name and path sources must target the field directly")
		}
		return pointer[1], "meta", nil
	}
	return "", "", errors.New("workspace move/copy source is outside the persistent workspace path policy")
}

func normalizeAndValidateCommitExpected(expected *WorkspaceOperationCommitExpected, requirements workspaceCommitRequirements) error {
	if expected == nil {
		return commitValidation("/expected", "expected revision vector is required")
	}
	if expected.Documents == nil {
		expected.Documents = []WorkspaceCommitExpectedDocument{}
	}
	if requirements.Workspace {
		if expected.WorkspaceRev == nil || *expected.WorkspaceRev <= 0 {
			return commitValidation("/expected/workspaceRev", "workspaceRev is required for workspace and route commands")
		}
	} else if expected.WorkspaceRev != nil {
		return commitValidation("/expected/workspaceRev", "workspaceRev is not part of this operation write set")
	}
	if requirements.Route {
		if expected.RouteRev == nil || *expected.RouteRev <= 0 {
			return commitValidation("/expected/routeRev", "routeRev is required for route commands")
		}
	} else if expected.RouteRev != nil {
		return commitValidation("/expected/routeRev", "routeRev is not part of this operation write set")
	}

	expectedByID := make(map[string]WorkspaceCommitExpectedDocument, len(expected.Documents))
	previousDocumentID := ""
	for index, document := range expected.Documents {
		if document.ID != strings.TrimSpace(document.ID) {
			return commitValidation(fmt.Sprintf("/expected/documents/%d/id", index), "document id must not contain outer whitespace")
		}
		if document.ID == "" || (!document.ContentRevPresent && !document.MetaRevPresent) {
			return commitValidation(fmt.Sprintf("/expected/documents/%d", index), "document id and at least one revision field are required")
		}
		if _, exists := expectedByID[document.ID]; exists {
			return commitValidation(fmt.Sprintf("/expected/documents/%d/id", index), "expected document ids must be unique")
		}
		if index > 0 && document.ID < previousDocumentID {
			return commitValidation("/expected/documents", "expected document ids must use Unicode code-point order")
		}
		if document.ContentRev != nil && *document.ContentRev <= 0 {
			return commitValidation(fmt.Sprintf("/expected/documents/%d/contentRev", index), "contentRev must be positive or null")
		}
		if document.MetaRev != nil && *document.MetaRev <= 0 {
			return commitValidation(fmt.Sprintf("/expected/documents/%d/metaRev", index), "metaRev must be positive or null")
		}
		expected.Documents[index] = document
		expectedByID[document.ID] = document
		previousDocumentID = document.ID
	}
	for documentID, requirement := range requirements.Documents {
		document, ok := expectedByID[documentID]
		if !ok {
			return commitValidation("/expected/documents", fmt.Sprintf("expected revisions are missing for document %s", documentID))
		}
		if requirement.Absent {
			if !document.ContentRevPresent || !document.MetaRevPresent || document.ContentRev != nil || document.MetaRev != nil {
				return commitValidation("/expected/documents", fmt.Sprintf("new document %s must declare null contentRev and metaRev", documentID))
			}
		} else {
			if requirement.Content && (!document.ContentRevPresent || document.ContentRev == nil) {
				return commitValidation("/expected/documents", fmt.Sprintf("contentRev is required for document %s", documentID))
			}
			if requirement.Meta && (!document.MetaRevPresent || document.MetaRev == nil) {
				return commitValidation("/expected/documents", fmt.Sprintf("metaRev is required for document %s", documentID))
			}
			if !requirement.Content && document.ContentRevPresent {
				return commitValidation("/expected/documents", fmt.Sprintf("contentRev is not part of the write set for document %s", documentID))
			}
			if !requirement.Meta && document.MetaRevPresent {
				return commitValidation("/expected/documents", fmt.Sprintf("metaRev is not part of the write set for document %s", documentID))
			}
		}
		delete(expectedByID, documentID)
	}
	if len(expectedByID) > 0 {
		ids := make([]string, 0, len(expectedByID))
		for documentID := range expectedByID {
			ids = append(ids, documentID)
		}
		sort.Strings(ids)
		return commitValidation("/expected/documents", fmt.Sprintf("unexpected document revision %s", ids[0]))
	}
	sort.Slice(expected.Documents, func(left int, right int) bool {
		return expected.Documents[left].ID < expected.Documents[right].ID
	})
	return nil
}
