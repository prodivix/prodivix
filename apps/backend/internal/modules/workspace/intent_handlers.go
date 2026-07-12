package workspace

import (
	"context"
	"encoding/json"
	"net/http"
)

type IntentHandler interface {
	CanHandle(intent IntentEnvelope) bool
	Handle(
		ctx context.Context,
		store *WorkspaceStore,
		workspaceID string,
		request ApplyIntentRequest,
		intent IntentEnvelope,
		command WorkspaceCommandEnvelope,
	) (*WorkspaceMutationResult, *RequestFailure)
}

type routeManifestUpdateHandler struct{}

func (routeManifestUpdateHandler) CanHandle(intent IntentEnvelope) bool {
	return intent.Namespace == "core.route" && intent.Type == "manifest.update"
}

func (routeManifestUpdateHandler) Handle(
	ctx context.Context,
	store *WorkspaceStore,
	workspaceID string,
	request ApplyIntentRequest,
	_ IntentEnvelope,
	command WorkspaceCommandEnvelope,
) (*WorkspaceMutationResult, *RequestFailure) {
	if err := validateRequiredJSONSafeRevision("expectedRouteRev", request.ExpectedRouteRev); err != nil {
		return nil, MapStoreError(err)
	}
	var payload struct {
		RouteManifest json.RawMessage `json:"routeManifest"`
	}
	if len(command.Target.WorkspaceID) == 0 && len(workspaceID) == 0 {
		// defensive — caller is expected to set workspaceID
		return nil, NewRequestFailure(
			http.StatusUnprocessableEntity,
			ErrorInvalidPayload,
			"workspaceId is required.",
			nil,
		)
	}
	if len(request.Intent.Payload) == 0 ||
		json.Unmarshal(request.Intent.Payload, &payload) != nil ||
		len(payload.RouteManifest) == 0 {
		return nil, NewRequestFailure(
			http.StatusUnprocessableEntity,
			ErrorInvalidPayload,
			"intent payload.routeManifest is required.",
			nil,
		)
	}
	result, err := store.SaveRouteManifest(ctx, SaveRouteManifestParams{
		WorkspaceID:          workspaceID,
		ExpectedWorkspaceRev: request.ExpectedWorkspaceRev,
		ExpectedRouteRev:     request.ExpectedRouteRev,
		RouteManifest:        payload.RouteManifest,
		Command:              command,
	})
	if err != nil {
		return nil, MapStoreError(err)
	}
	return result, nil
}

type workspaceSettingsUpdateHandler struct{}

func (workspaceSettingsUpdateHandler) CanHandle(intent IntentEnvelope) bool {
	return intent.Namespace == "core.settings" && intent.Type == "global.update"
}

func (workspaceSettingsUpdateHandler) Handle(
	ctx context.Context,
	store *WorkspaceStore,
	workspaceID string,
	request ApplyIntentRequest,
	_ IntentEnvelope,
	command WorkspaceCommandEnvelope,
) (*WorkspaceMutationResult, *RequestFailure) {
	var payload struct {
		Settings json.RawMessage `json:"settings"`
	}
	if len(request.Intent.Payload) == 0 ||
		json.Unmarshal(request.Intent.Payload, &payload) != nil ||
		len(payload.Settings) == 0 {
		return nil, NewRequestFailure(
			http.StatusUnprocessableEntity,
			ErrorInvalidPayload,
			"intent payload.settings is required.",
			nil,
		)
	}
	result, err := store.SaveWorkspaceSettings(ctx, SaveWorkspaceSettingsParams{
		WorkspaceID:          workspaceID,
		ExpectedWorkspaceRev: request.ExpectedWorkspaceRev,
		Settings:             payload.Settings,
		Command:              command,
	})
	if err != nil {
		return nil, MapStoreError(err)
	}
	return result, nil
}
