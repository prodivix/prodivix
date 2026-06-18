package workspace

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

func parseWorkspaceDocumentType(value string) (WorkspaceDocumentType, bool) {
	documentType := WorkspaceDocumentType(strings.TrimSpace(value))
	if !isValidWorkspaceDocumentType(documentType) {
		return "", false
	}
	return documentType, true
}

type workspaceDocumentCreateHandler struct{}

func (workspaceDocumentCreateHandler) CanHandle(intent IntentEnvelope) bool {
	return intent.Namespace == "core.workspace" && intent.Type == "document.create"
}

func (workspaceDocumentCreateHandler) Handle(
	ctx context.Context,
	store *WorkspaceStore,
	workspaceID string,
	request ApplyIntentRequest,
	_ IntentEnvelope,
	command WorkspaceCommandEnvelope,
) (*WorkspaceMutationResult, *RequestFailure) {
	var payload struct {
		DocumentID   string          `json:"documentId"`
		NodeID       string          `json:"nodeId"`
		ParentNodeID string          `json:"parentNodeId"`
		Path         string          `json:"path"`
		Type         string          `json:"type"`
		Content      json.RawMessage `json:"content"`
	}
	if len(request.Intent.Payload) == 0 ||
		json.Unmarshal(request.Intent.Payload, &payload) != nil ||
		strings.TrimSpace(payload.DocumentID) == "" ||
		strings.TrimSpace(payload.Path) == "" ||
		strings.TrimSpace(payload.Type) == "" ||
		len(payload.Content) == 0 {
		return nil, NewRequestFailure(
			http.StatusUnprocessableEntity,
			ErrorInvalidPayload,
			"intent payload.documentId, payload.path, payload.type and payload.content are required.",
			nil,
		)
	}
	documentType, ok := parseWorkspaceDocumentType(payload.Type)
	if !ok {
		return nil, NewRequestFailure(
			http.StatusUnprocessableEntity,
			ErrorInvalidPayload,
			"intent payload.type is not a valid workspace document type.",
			nil,
		)
	}
	command.Target.DocumentID = strings.TrimSpace(payload.DocumentID)
	result, err := store.CreateWorkspaceDocument(ctx, CreateWorkspaceDocumentMutationParams{
		WorkspaceID:          workspaceID,
		ExpectedWorkspaceRev: request.ExpectedWorkspaceRev,
		DocumentID:           payload.DocumentID,
		NodeID:               payload.NodeID,
		ParentNodeID:         payload.ParentNodeID,
		Path:                 payload.Path,
		Type:                 documentType,
		Content:              payload.Content,
		Command:              command,
	})
	if err != nil {
		return nil, MapStoreError(err)
	}
	return result, nil
}

type workspaceDocumentRenameHandler struct{}

func (workspaceDocumentRenameHandler) CanHandle(intent IntentEnvelope) bool {
	return intent.Namespace == "core.workspace" && intent.Type == "document.rename"
}

func (workspaceDocumentRenameHandler) Handle(
	ctx context.Context,
	store *WorkspaceStore,
	workspaceID string,
	request ApplyIntentRequest,
	_ IntentEnvelope,
	command WorkspaceCommandEnvelope,
) (*WorkspaceMutationResult, *RequestFailure) {
	var payload struct {
		DocumentID string `json:"documentId"`
		Path       string `json:"path"`
		Type       string `json:"type"`
	}
	if len(request.Intent.Payload) == 0 ||
		json.Unmarshal(request.Intent.Payload, &payload) != nil ||
		strings.TrimSpace(payload.DocumentID) == "" ||
		strings.TrimSpace(payload.Path) == "" ||
		strings.TrimSpace(payload.Type) == "" {
		return nil, NewRequestFailure(
			http.StatusUnprocessableEntity,
			ErrorInvalidPayload,
			"intent payload.documentId, payload.path and payload.type are required.",
			nil,
		)
	}
	documentType, ok := parseWorkspaceDocumentType(payload.Type)
	if !ok {
		return nil, NewRequestFailure(
			http.StatusUnprocessableEntity,
			ErrorInvalidPayload,
			"intent payload.type is not a valid workspace document type.",
			nil,
		)
	}
	command.Target.DocumentID = strings.TrimSpace(payload.DocumentID)
	result, err := store.RenameWorkspaceDocument(ctx, RenameWorkspaceDocumentMutationParams{
		WorkspaceID:          workspaceID,
		ExpectedWorkspaceRev: request.ExpectedWorkspaceRev,
		DocumentID:           payload.DocumentID,
		Path:                 payload.Path,
		Type:                 documentType,
		Command:              command,
	})
	if err != nil {
		return nil, MapStoreError(err)
	}
	return result, nil
}

type workspaceDocumentDeleteHandler struct{}

func (workspaceDocumentDeleteHandler) CanHandle(intent IntentEnvelope) bool {
	return intent.Namespace == "core.workspace" && intent.Type == "document.delete"
}

func (workspaceDocumentDeleteHandler) Handle(
	ctx context.Context,
	store *WorkspaceStore,
	workspaceID string,
	request ApplyIntentRequest,
	_ IntentEnvelope,
	command WorkspaceCommandEnvelope,
) (*WorkspaceMutationResult, *RequestFailure) {
	var payload struct {
		DocumentID string `json:"documentId"`
		Type       string `json:"type"`
	}
	if len(request.Intent.Payload) == 0 ||
		json.Unmarshal(request.Intent.Payload, &payload) != nil ||
		strings.TrimSpace(payload.DocumentID) == "" ||
		strings.TrimSpace(payload.Type) == "" {
		return nil, NewRequestFailure(
			http.StatusUnprocessableEntity,
			ErrorInvalidPayload,
			"intent payload.documentId and payload.type are required.",
			nil,
		)
	}
	documentType, ok := parseWorkspaceDocumentType(payload.Type)
	if !ok {
		return nil, NewRequestFailure(
			http.StatusUnprocessableEntity,
			ErrorInvalidPayload,
			"intent payload.type is not a valid workspace document type.",
			nil,
		)
	}
	command.Target.DocumentID = strings.TrimSpace(payload.DocumentID)
	result, err := store.DeleteWorkspaceDocument(ctx, DeleteWorkspaceDocumentMutationParams{
		WorkspaceID:          workspaceID,
		ExpectedWorkspaceRev: request.ExpectedWorkspaceRev,
		DocumentID:           payload.DocumentID,
		Type:                 documentType,
		Command:              command,
	})
	if err != nil {
		return nil, MapStoreError(err)
	}
	return result, nil
}
