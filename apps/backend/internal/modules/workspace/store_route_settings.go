package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"strings"
)

func (store *WorkspaceStore) SaveRouteManifest(ctx context.Context, params SaveRouteManifestParams) (*WorkspaceMutationResult, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("workspace store is not initialized")
	}
	if strings.TrimSpace(params.WorkspaceID) == "" {
		return nil, errors.New("workspaceID is required")
	}
	if params.ExpectedWorkspaceRev <= 0 || params.ExpectedRouteRev <= 0 {
		return nil, errors.New("expectedWorkspaceRev and expectedRouteRev must be positive")
	}

	manifestJSON, err := normalizeRouteManifestDocument(params.RouteManifest)
	if err != nil {
		return nil, err
	}
	command, err := normalizeWorkspaceCommand(params.Command)
	if err != nil {
		return nil, err
	}
	if err := validateWorkspaceCommand(command, params.WorkspaceID, nil); err != nil {
		return nil, err
	}
	if command.Target.DocumentID != "" {
		return nil, errors.New("route command must not set target.documentId")
	}

	commandJSON, err := json.Marshal(command)
	if err != nil {
		return nil, err
	}
	payloadJSON := json.RawMessage(commandJSON)

	ctx, cancel := withStoreTimeout(ctx)
	defer cancel()

	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}

	const lockWorkspace = `SELECT workspace_rev, route_rev, op_seq
FROM workspaces
WHERE id = $1
FOR UPDATE`

	var currentWorkspaceRev int64
	var currentRouteRev int64
	var currentOpSeq int64
	err = tx.QueryRowContext(ctx, lockWorkspace, params.WorkspaceID).Scan(&currentWorkspaceRev, &currentRouteRev, &currentOpSeq)
	if err != nil {
		_ = tx.Rollback()
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrWorkspaceNotFound
		}
		return nil, err
	}

	if currentWorkspaceRev != params.ExpectedWorkspaceRev {
		_ = tx.Rollback()
		log.Printf(
			"[workspace] conflict save_route_manifest workspace=%s type=%s expectedWorkspaceRev=%d serverWorkspaceRev=%d expectedRouteRev=%d serverRouteRev=%d serverOpSeq=%d",
			params.WorkspaceID,
			WorkspaceConflictWorkspace,
			params.ExpectedWorkspaceRev,
			currentWorkspaceRev,
			params.ExpectedRouteRev,
			currentRouteRev,
			currentOpSeq,
		)
		return nil, &WorkspaceRevisionConflictError{
			ConflictType:       WorkspaceConflictWorkspace,
			WorkspaceID:        params.WorkspaceID,
			ServerWorkspaceRev: currentWorkspaceRev,
			ServerRouteRev:     currentRouteRev,
			ServerOpSeq:        currentOpSeq,
		}
	}
	if currentRouteRev != params.ExpectedRouteRev {
		_ = tx.Rollback()
		log.Printf(
			"[workspace] conflict save_route_manifest workspace=%s type=%s expectedWorkspaceRev=%d serverWorkspaceRev=%d expectedRouteRev=%d serverRouteRev=%d serverOpSeq=%d",
			params.WorkspaceID,
			WorkspaceConflictRoute,
			params.ExpectedWorkspaceRev,
			currentWorkspaceRev,
			params.ExpectedRouteRev,
			currentRouteRev,
			currentOpSeq,
		)
		return nil, &WorkspaceRevisionConflictError{
			ConflictType:       WorkspaceConflictRoute,
			WorkspaceID:        params.WorkspaceID,
			ServerWorkspaceRev: currentWorkspaceRev,
			ServerRouteRev:     currentRouteRev,
			ServerOpSeq:        currentOpSeq,
		}
	}

	const upsertRoute = `INSERT INTO workspace_routes (workspace_id, manifest_json, updated_at)
VALUES ($1, $2::jsonb, NOW())
ON CONFLICT (workspace_id) DO UPDATE
SET manifest_json = EXCLUDED.manifest_json, updated_at = EXCLUDED.updated_at`

	if _, err := tx.ExecContext(ctx, upsertRoute, params.WorkspaceID, string(manifestJSON)); err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	const bumpWorkspaceAndRoute = `UPDATE workspaces
SET workspace_rev = workspace_rev + 1, route_rev = route_rev + 1, op_seq = op_seq + 1, updated_at = NOW()
WHERE id = $1
RETURNING workspace_rev, route_rev, op_seq`

	var nextWorkspaceRev int64
	var nextRouteRev int64
	var nextOpSeq int64
	if err := tx.QueryRowContext(ctx, bumpWorkspaceAndRoute, params.WorkspaceID).Scan(&nextWorkspaceRev, &nextRouteRev, &nextOpSeq); err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	if err := insertWorkspaceOperation(ctx, tx, params.WorkspaceID, nextOpSeq, commandDomain(command), nil, payloadJSON, command.IssuedAt); err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &WorkspaceMutationResult{
		WorkspaceID:  params.WorkspaceID,
		WorkspaceRev: nextWorkspaceRev,
		RouteRev:     nextRouteRev,
		OpSeq:        nextOpSeq,
	}, nil
}

func (store *WorkspaceStore) SaveWorkspaceSettings(ctx context.Context, params SaveWorkspaceSettingsParams) (*WorkspaceMutationResult, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("workspace store is not initialized")
	}
	if strings.TrimSpace(params.WorkspaceID) == "" {
		return nil, errors.New("workspaceID is required")
	}
	if params.ExpectedWorkspaceRev <= 0 {
		return nil, errors.New("expectedWorkspaceRev must be positive")
	}

	settingsJSON, err := normalizeJSONDocument(params.Settings, defaultWorkspaceSettings)
	if err != nil {
		return nil, err
	}
	command, err := normalizeWorkspaceCommand(params.Command)
	if err != nil {
		return nil, err
	}
	if err := validateWorkspaceCommand(command, params.WorkspaceID, nil); err != nil {
		return nil, err
	}
	if command.Target.DocumentID != "" {
		return nil, errors.New("settings command must not set target.documentId")
	}

	commandJSON, err := json.Marshal(command)
	if err != nil {
		return nil, err
	}
	payloadJSON := json.RawMessage(commandJSON)

	ctx, cancel := withStoreTimeout(ctx)
	defer cancel()

	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}

	const lockWorkspace = `SELECT workspace_rev, route_rev, op_seq
FROM workspaces
WHERE id = $1
FOR UPDATE`

	var currentWorkspaceRev int64
	var currentRouteRev int64
	var currentOpSeq int64
	err = tx.QueryRowContext(ctx, lockWorkspace, params.WorkspaceID).Scan(&currentWorkspaceRev, &currentRouteRev, &currentOpSeq)
	if err != nil {
		_ = tx.Rollback()
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrWorkspaceNotFound
		}
		return nil, err
	}

	if currentWorkspaceRev != params.ExpectedWorkspaceRev {
		_ = tx.Rollback()
		log.Printf(
			"[workspace] conflict save_workspace_settings workspace=%s expectedWorkspaceRev=%d serverWorkspaceRev=%d serverRouteRev=%d serverOpSeq=%d",
			params.WorkspaceID,
			params.ExpectedWorkspaceRev,
			currentWorkspaceRev,
			currentRouteRev,
			currentOpSeq,
		)
		return nil, &WorkspaceRevisionConflictError{
			ConflictType:       WorkspaceConflictWorkspace,
			WorkspaceID:        params.WorkspaceID,
			ServerWorkspaceRev: currentWorkspaceRev,
			ServerRouteRev:     currentRouteRev,
			ServerOpSeq:        currentOpSeq,
		}
	}

	const upsertSettings = `INSERT INTO workspace_settings (workspace_id, settings_json, updated_at)
VALUES ($1, $2::jsonb, NOW())
ON CONFLICT (workspace_id) DO UPDATE
SET settings_json = EXCLUDED.settings_json, updated_at = EXCLUDED.updated_at`
	if _, err := tx.ExecContext(ctx, upsertSettings, params.WorkspaceID, string(settingsJSON)); err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	const bumpWorkspaceOnly = `UPDATE workspaces
SET workspace_rev = workspace_rev + 1, op_seq = op_seq + 1, updated_at = NOW()
WHERE id = $1
RETURNING workspace_rev, route_rev, op_seq`

	var nextWorkspaceRev int64
	var nextRouteRev int64
	var nextOpSeq int64
	if err := tx.QueryRowContext(ctx, bumpWorkspaceOnly, params.WorkspaceID).Scan(&nextWorkspaceRev, &nextRouteRev, &nextOpSeq); err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	if err := insertWorkspaceOperation(ctx, tx, params.WorkspaceID, nextOpSeq, commandDomain(command), nil, payloadJSON, command.IssuedAt); err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &WorkspaceMutationResult{
		WorkspaceID:  params.WorkspaceID,
		WorkspaceRev: nextWorkspaceRev,
		RouteRev:     nextRouteRev,
		OpSeq:        nextOpSeq,
	}, nil
}
