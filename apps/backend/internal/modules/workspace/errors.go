package workspace

import backendresponse "github.com/Prodivix/prodivix/apps/backend/internal/platform/http/response"

const (
	ErrorInvalidPayload             = "API-1001"
	ErrorPIRValidationFailed        = "PIR-4001"
	ErrorPIRGraphPatchPathForbidden = "WKS-5002"
	ErrorWorkspaceNotFound          = "WKS-1001"
	ErrorWorkspaceDocumentNotFound  = "WKS-3001"
	ErrorWorkspaceOperationFailed   = "API-9001"
	ErrorWorkspacePatchFailed       = "WKS-5002"
)

type RequestFailure struct {
	Status  int
	Payload map[string]any
}

func NewRequestFailure(status int, code string, message string, details any) *RequestFailure {
	return &RequestFailure{
		Status:  status,
		Payload: BuildErrorEnvelopePayload(code, message, details),
	}
}

func BuildErrorEnvelopePayload(
	code string,
	message string,
	details any,
	options ...backendresponse.ErrorOption,
) map[string]any {
	if details != nil {
		options = append(options, backendresponse.WithDetails(details))
	}
	envelope := backendresponse.NewErrorEnvelope(code, message, options...)
	return map[string]any{"error": envelope.Error}
}
