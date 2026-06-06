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
		log.Printf(
			"[workspace] conflict mapped type=%s workspace=%s document=%s serverWorkspaceRev=%d serverRouteRev=%d serverContentRev=%d serverMetaRev=%d serverOpSeq=%d",
			conflictErr.ConflictType,
			conflictErr.WorkspaceID,
			conflictErr.DocumentID,
			conflictErr.ServerWorkspaceRev,
			conflictErr.ServerRouteRev,
			conflictErr.ServerContentRev,
			conflictErr.ServerMetaRev,
			conflictErr.ServerOpSeq,
		)
		return &RequestFailure{Status: http.StatusConflict, Payload: BuildConflictPayload(conflictErr)}
	}
	if errors.Is(err, ErrWorkspaceNotFound) {
		return NewRequestFailure(http.StatusNotFound, ErrorWorkspaceNotFound, "Workspace not found.", nil)
	}
	if errors.Is(err, ErrWorkspaceDocumentNotFound) {
		return NewRequestFailure(http.StatusNotFound, ErrorWorkspaceDocumentNotFound, "Workspace document not found.", nil)
	}
	var syntaxErr *json.SyntaxError
	if errors.As(err, &syntaxErr) {
		return NewRequestFailure(http.StatusUnprocessableEntity, ErrorPIRValidationFailed, "Invalid JSON document payload.", map[string]any{"offset": syntaxErr.Offset})
	}
	if errors.Is(err, ErrWorkspacePatchPathForbidden) {
		return NewRequestFailure(http.StatusUnprocessableEntity, ErrorPIRGraphPatchPathForbidden, err.Error(), nil)
	}
	if errors.Is(err, ErrWorkspacePatchInvalid) || errors.Is(err, ErrWorkspacePatchPathMissing) || errors.Is(err, ErrWorkspacePatchTestFailed) {
		return NewRequestFailure(http.StatusUnprocessableEntity, ErrorWorkspacePatchFailed, err.Error(), nil)
	}
	if errors.Is(err, ErrWorkspaceVFSInvalid) {
		return NewRequestFailure(http.StatusUnprocessableEntity, ErrorInvalidPayload, err.Error(), nil)
	}
	if errors.Is(err, ErrPIRV13ValidationFailed) {
		return NewRequestFailure(http.StatusUnprocessableEntity, ErrorPIRValidationFailed, err.Error(), nil)
	}
	if IsWorkspaceEnvelopeError(err) {
		return NewRequestFailure(http.StatusUnprocessableEntity, ErrorInvalidPayload, err.Error(), nil)
	}
	return NewRequestFailure(http.StatusInternalServerError, ErrorWorkspaceOperationFailed, "Could not process workspace request.", nil)
}

func BuildConflictPayload(conflictErr *WorkspaceRevisionConflictError) map[string]any {
	code := ErrorWorkspaceConflictCode(conflictErr.ConflictType)
	details := map[string]any{
		"conflictType":       conflictErr.ConflictType,
		"workspaceId":        conflictErr.WorkspaceID,
		"serverWorkspaceRev": conflictErr.ServerWorkspaceRev,
		"serverRouteRev":     conflictErr.ServerRouteRev,
		"opSeq":              conflictErr.ServerOpSeq,
	}
	if strings.TrimSpace(conflictErr.DocumentID) != "" {
		details["serverDocument"] = map[string]any{
			"id":         conflictErr.DocumentID,
			"contentRev": conflictErr.ServerContentRev,
			"metaRev":    conflictErr.ServerMetaRev,
		}
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
	serverWorkspaceRev, _ := details["serverWorkspaceRev"]
	serverRouteRev, _ := details["serverRouteRev"]
	opSeq, _ := details["opSeq"]
	log.Printf(
		"[workspace] 409 action=%s method=%s path=%s workspace=%s document=%s clientMutationId=%s expectedWorkspaceRev=%d expectedRouteRev=%d expectedContentRev=%d conflictType=%v serverWorkspaceRev=%v serverRouteRev=%v serverOpSeq=%v",
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
		serverWorkspaceRev,
		serverRouteRev,
		opSeq,
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
		"core.pir.document.update@1.0":             true,
		"core.pir.graph.replace@1.0":               true,
		"core.route.manifest.update@1.0":           true,
		"core.settings.global.update@1.0":          true,
		"core.workspace.code-document.create@1.0":  true,
		"core.nodegraph.node.move@1.0":             false,
		"core.nodegraph.edge.connect@1.0":          false,
		"core.animation.timeline.keyframe.add@1.0": false,
		"core.animation.clip.bind@1.0":             false,
	}
}
