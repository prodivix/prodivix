package agent

import (
	"net/http"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const evaluationOwnerActivationHealthFormat = "prodivix.agent-evaluation-owner-activation-health"

// ActivateOwnerAuthority atomically pins the exact sidecar health commitment.
// Replays are accepted only when the purpose and digest remain byte-identical.
func (handler *EvaluationServiceHandler) ActivateOwnerAuthority(
	purpose string,
	healthDigest string,
) error {
	if handler == nil || !handler.ownerActivationRequired || purpose != handler.ownerAuthorityPurpose ||
		!evaluationDigestPattern.MatchString(healthDigest) {
		return ErrInvalid
	}
	handler.ownerActivationMu.Lock()
	defer handler.ownerActivationMu.Unlock()
	if handler.ownerAuthorityHealthDigest != "" {
		if handler.ownerAuthorityHealthDigest != healthDigest {
			return ErrConflict
		}
		return nil
	}
	handler.ownerAuthorityHealthDigest = healthDigest
	handler.ownerActivatedAt = handler.clock().UTC().Truncate(time.Millisecond)
	return nil
}

func (handler *EvaluationServiceHandler) evaluationOwnerAuthorityActive() bool {
	if handler == nil {
		return false
	}
	if !handler.ownerActivationRequired {
		return true
	}
	handler.ownerActivationMu.RLock()
	defer handler.ownerActivationMu.RUnlock()
	return handler.ownerAuthorityHealthDigest != "" && !handler.ownerActivatedAt.IsZero()
}

func (handler *EvaluationServiceHandler) evaluationOwnerActivationHealthRoute(request *http.Request) bool {
	if handler == nil || !handler.ownerActivationRequired || request == nil || request.URL == nil ||
		strings.Contains(strings.ToLower(request.URL.EscapedPath()), "%2f") || strings.HasSuffix(request.URL.Path, "/") {
		return false
	}
	segments := strings.Split(strings.TrimPrefix(request.URL.Path, "/"), "/")
	return len(segments) == 5 && segments[0] == "v1" && segments[1] == "evaluations" &&
		segments[2] == handler.authority.NamespaceID && segments[3] == "owner-activation" && segments[4] == "health"
}

func (handler *EvaluationServiceHandler) handleEvaluationOwnerActivationHealth(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	if !evaluationServiceQueryIsExact(request) || request.ContentLength != 0 || len(request.TransferEncoding) != 0 {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	handler.ownerActivationMu.RLock()
	healthDigest := handler.ownerAuthorityHealthDigest
	activatedAt := handler.ownerActivatedAt
	handler.ownerActivationMu.RUnlock()
	phase := "bootstrap"
	status := "waiting-for-owner-authority"
	var ownerHealth any
	var activated any
	if healthDigest != "" && !activatedAt.IsZero() {
		phase = "active"
		status = "ready"
		ownerHealth = healthDigest
		activated = evaluationExportInstant(activatedAt)
	} else {
		ownerHealth = nil
		activated = nil
	}
	base := map[string]any{
		"format": evaluationOwnerActivationHealthFormat, "version": int64(1),
		"purpose": handler.ownerAuthorityPurpose, "phase": phase, "status": status,
		"ownerAuthorityHealthDigest": ownerHealth, "activatedAt": activated,
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	base["healthDigest"] = digest
	response, err := canonicaljson.Bytes(base)
	if err != nil || len(response) > maximumEvaluationServiceControlBytes {
		respondEvaluationServiceError(writer, errEvaluationServiceResponseTooLarge)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, response)
}

func (handler *EvaluationServiceHandler) evaluationOwnerBootstrapDirectRoute(request *http.Request) bool {
	if handler == nil || request == nil {
		return false
	}
	if handler.evaluationNativeProviderStateVaultRoute(request) ||
		handler.evaluationControlledWorkspaceOwnerLedgerHealthRoute(request) {
		return true
	}
	_, tail, err := handler.evaluationServiceRoute(request)
	return err == nil && len(tail) > 0 && tail[0] == "controlled-workspace-owner"
}
