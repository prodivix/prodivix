package workspace

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	backendresponse "github.com/Prodivix/prodivix/apps/backend/internal/platform/http/response"
)

func MapStoreError(err error) *RequestFailure {
	if err == nil {
		return nil
	}
	var conflictErr *WorkspaceRevisionConflictError
	if errors.As(err, &conflictErr) {
		currentDocumentRev := int64(0)
		currentDocumentMetaRev := int64(0)
		documentID := ""
		if conflictErr.Expected.Document != nil {
			documentID = conflictErr.Expected.Document.ID
		}
		if conflictErr.Current.Document != nil {
			currentDocumentRev = conflictErr.Current.Document.ContentRev
			currentDocumentMetaRev = conflictErr.Current.Document.MetaRev
		}
		log.Printf(
			"[workspace] conflict mapped type=%s workspace=%s document=%s currentWorkspaceRev=%d currentRouteRev=%d currentContentRev=%d currentMetaRev=%d currentOpSeq=%d",
			conflictErr.ConflictType,
			conflictErr.WorkspaceID,
			documentID,
			conflictErr.Current.WorkspaceRev,
			conflictErr.Current.RouteRev,
			currentDocumentRev,
			currentDocumentMetaRev,
			conflictErr.Current.OpSeq,
		)
		return &RequestFailure{Status: http.StatusConflict, Payload: BuildConflictPayload(conflictErr)}
	}
	if errors.Is(err, ErrWorkspaceNotFound) {
		return NewRequestFailure(http.StatusNotFound, ErrorWorkspaceNotFound, "Workspace not found.", nil)
	}
	if errors.Is(err, ErrWorkspaceDocumentNotFound) {
		return NewRequestFailure(http.StatusNotFound, ErrorWorkspaceDocumentNotFound, "Workspace document not found.", nil)
	}
	if errors.Is(err, ErrWorkspaceCommitIdentityMismatch) {
		return NewRequestFailure(
			http.StatusUnprocessableEntity,
			ErrorInvalidPayload,
			"Workspace operation id was already used by a different request.",
			map[string]any{"reason": "COMMIT_IDENTITY_MISMATCH"},
		)
	}
	var revisionLimitErr *workspaceRevisionLimitError
	if errors.As(err, &revisionLimitErr) {
		return NewRequestFailure(
			http.StatusUnprocessableEntity,
			ErrorInvalidPayload,
			revisionLimitErr.Message,
			map[string]any{
				"field":  revisionLimitErr.Field,
				"reason": revisionLimitErr.Reason,
			},
		)
	}
	var commitValidationErr *WorkspaceOperationCommitValidationError
	if errors.As(err, &commitValidationErr) {
		return NewRequestFailure(
			http.StatusUnprocessableEntity,
			ErrorInvalidPayload,
			commitValidationErr.Message,
			map[string]any{"path": commitValidationErr.Path, "reason": "COMMIT_VALIDATION_FAILED"},
		)
	}
	var syntaxErr *json.SyntaxError
	if errors.As(err, &syntaxErr) {
		return NewRequestFailure(http.StatusUnprocessableEntity, ErrorPIRValidationFailed, "Invalid JSON document payload.", map[string]any{"offset": syntaxErr.Offset})
	}
	if errors.Is(err, ErrWorkspacePatchPathForbidden) {
		return NewRequestFailure(http.StatusUnprocessableEntity, ErrorWorkspacePatchFailed, err.Error(), nil)
	}
	if errors.Is(err, ErrWorkspacePatchInvalid) || errors.Is(err, ErrWorkspacePatchPathMissing) || errors.Is(err, ErrWorkspacePatchTestFailed) {
		return NewRequestFailure(http.StatusUnprocessableEntity, ErrorWorkspacePatchFailed, err.Error(), nil)
	}
	if errors.Is(err, ErrWorkspaceVFSInvalid) {
		return NewRequestFailure(http.StatusUnprocessableEntity, ErrorInvalidPayload, err.Error(), nil)
	}
	var routeManifestErr *RouteManifestValidationError
	if errors.As(err, &routeManifestErr) {
		return NewRequestFailure(
			http.StatusUnprocessableEntity,
			ErrorInvalidPayload,
			err.Error(),
			map[string]any{"issues": routeManifestErr.Issues},
		)
	}
	if errors.Is(err, ErrPIRValidationFailed) {
		return NewRequestFailure(http.StatusUnprocessableEntity, ErrorPIRValidationFailed, err.Error(), nil)
	}
	if errors.Is(err, ErrNodeGraphValidationFailed) || errors.Is(err, ErrAnimationValidationFailed) {
		return NewRequestFailure(http.StatusUnprocessableEntity, ErrorInvalidPayload, err.Error(), nil)
	}
	if IsWorkspaceEnvelopeError(err) {
		return NewRequestFailure(http.StatusUnprocessableEntity, ErrorInvalidPayload, err.Error(), nil)
	}
	return NewRequestFailure(http.StatusInternalServerError, ErrorWorkspaceOperationFailed, "Could not process workspace request.", nil)
}

func BuildConflictPayload(conflictErr *WorkspaceRevisionConflictError) map[string]any {
	code := ErrorWorkspaceConflictCode(conflictErr.ConflictType)
	expected := make(map[string]any)
	if conflictErr.Expected.WorkspaceRev > 0 {
		expected["workspaceRev"] = conflictErr.Expected.WorkspaceRev
	}
	if conflictErr.Expected.RouteRev > 0 {
		expected["routeRev"] = conflictErr.Expected.RouteRev
	}
	if conflictErr.Expected.Document != nil {
		expectedDocument := map[string]any{"id": conflictErr.Expected.Document.ID}
		if conflictErr.Expected.Document.ContentRevKnown {
			if conflictErr.Expected.Document.ContentRev > 0 {
				expectedDocument["contentRev"] = conflictErr.Expected.Document.ContentRev
			} else {
				expectedDocument["contentRev"] = nil
			}
		}
		if conflictErr.Expected.Document.MetaRevKnown {
			if conflictErr.Expected.Document.MetaRev > 0 {
				expectedDocument["metaRev"] = conflictErr.Expected.Document.MetaRev
			} else {
				expectedDocument["metaRev"] = nil
			}
		}
		expected["document"] = expectedDocument
	}

	current := map[string]any{
		"workspaceRev": conflictErr.Current.WorkspaceRev,
		"routeRev":     conflictErr.Current.RouteRev,
		"opSeq":        conflictErr.Current.OpSeq,
	}
	if conflictErr.Current.Document != nil {
		document := conflictErr.Current.Document
		current["document"] = map[string]any{
			"id":         document.ID,
			"type":       document.Type,
			"path":       document.Path,
			"contentRev": document.ContentRev,
			"metaRev":    document.MetaRev,
			"updatedAt":  document.UpdatedAt.UTC(),
		}
	} else if conflictErr.Current.DocumentKnown {
		current["document"] = nil
	}

	details := map[string]any{
		"conflictType": conflictErr.ConflictType,
		"workspaceId":  conflictErr.WorkspaceID,
		"expected":     expected,
		"current":      current,
	}
	return BuildErrorEnvelopePayload(
		code,
		"Revision conflict.",
		details,
		backendresponse.WithDomain("workspace"),
		backendresponse.WithSeverity("warning"),
		backendresponse.WithRetryable(true),
	)
}

func ErrorWorkspaceConflictCode(conflictType WorkspaceConflictType) string {
	switch conflictType {
	case WorkspaceConflictRoute:
		return "WKS-4002"
	case WorkspaceConflictDocument:
		return "WKS-4003"
	default:
		return "WKS-4001"
	}
}

func BuildMutationSuccessPayload(result *WorkspaceMutationResult, acceptedMutationID string) map[string]any {
	response := map[string]any{
		"workspaceId":  result.WorkspaceID,
		"workspaceRev": result.WorkspaceRev,
		"routeRev":     result.RouteRev,
		"opSeq":        result.OpSeq,
	}
	if len(result.UpdatedDocuments) > 0 {
		response["updatedDocuments"] = result.UpdatedDocuments
	}
	if len(result.RemovedDocumentIDs) > 0 {
		response["removedDocumentIds"] = result.RemovedDocumentIDs
	}
	if len(result.Tree) > 0 {
		response["tree"] = result.Tree
	}
	if len(result.RouteManifest) > 0 {
		response["routeManifest"] = result.RouteManifest
	}
	if len(result.Settings) > 0 {
		response["settings"] = result.Settings
	}
	if acceptedMutationID != "" {
		response["acceptedMutationId"] = acceptedMutationID
	}
	return response
}

func LogWorkspaceConflictFailure(
	action string,
	method string,
	path string,
	workspaceID string,
	documentID string,
	expectedWorkspaceRev int64,
	expectedRouteRev int64,
	expectedContentRev int64,
	clientMutationID string,
	failure *RequestFailure,
) {
	if failure == nil || failure.Status != http.StatusConflict {
		return
	}
	details := ExtractErrorDetails(failure.Payload)
	conflictType, _ := details["conflictType"]
	current, _ := details["current"].(map[string]any)
	currentWorkspaceRev, _ := current["workspaceRev"]
	currentRouteRev, _ := current["routeRev"]
	currentOpSeq, _ := current["opSeq"]
	log.Printf(
		"[workspace] 409 action=%s method=%s path=%s workspace=%s document=%s clientMutationId=%s expectedWorkspaceRev=%d expectedRouteRev=%d expectedContentRev=%d conflictType=%v currentWorkspaceRev=%v currentRouteRev=%v currentOpSeq=%v",
		action,
		method,
		path,
		workspaceID,
		documentID,
		strings.TrimSpace(clientMutationID),
		expectedWorkspaceRev,
		expectedRouteRev,
		expectedContentRev,
		conflictType,
		currentWorkspaceRev,
		currentRouteRev,
		currentOpSeq,
	)
}

func ExtractErrorDetails(payload map[string]any) map[string]any {
	errorPayload, ok := payload["error"].(backendresponse.ErrorPayload)
	if ok {
		details, _ := errorPayload.Details.(map[string]any)
		return details
	}
	errorMap, ok := payload["error"].(map[string]any)
	if !ok {
		return nil
	}
	details, _ := errorMap["details"].(map[string]any)
	return details
}

func IsWorkspaceEnvelopeError(err error) bool {
	if err == nil {
		return false
	}
	message := err.Error()
	return strings.HasPrefix(message, "command.") ||
		strings.HasPrefix(message, "patch operation") ||
		strings.Contains(message, "target.documentId") ||
		strings.Contains(message, "target.workspaceId") ||
		strings.Contains(message, "expectedContentRev") ||
		strings.Contains(message, "expectedWorkspaceRev") ||
		strings.Contains(message, "expectedRouteRev")
}

func DefaultCapabilities() map[string]bool {
	return map[string]bool{
		"core.workspace.operation.commit@1.0":             true,
		"core.settings.commit@1.0":                        true,
		"core.pir.document.update@1.0":                    true,
		"core.pir.graph.replace@1.0":                      true,
		"core.route.manifest.update@1.0":                  true,
		"core.nodegraph.graph.update@1.0":                 true,
		"core.animation.definition.update@1.0":            true,
		"core.design-tokens.document.update@1.0":          true,
		"core.design-token-resolvers.document.update@1.0": true,
		"core.resource.project-config.value.update@1.0":   true,
		"core.workspace.document.create@1.0":              true,
		"core.workspace.document.rename@1.0":              true,
		"core.workspace.document.delete@1.0":              true,
		"core.workspace.code-document.create@1.0":         true,
		"core.workspace.code-document.rename@1.0":         true,
		"core.workspace.code-document.delete@1.0":         true,
		"core.workspace.directory.create@1.0":             true,
		"core.workspace.directory.rename@1.0":             true,
		"core.workspace.directory.delete@1.0":             true,
	}
}
