package workspace

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

const workspaceSettingsCommitDomain = "core.settings.commit@1.0"

type WorkspaceSettingsCommitRequest struct {
	CommitID             string          `json:"commitId"`
	IssuedAt             time.Time       `json:"issuedAt"`
	ExpectedWorkspaceRev int64           `json:"expectedWorkspaceRev"`
	Settings             json.RawMessage `json:"settings"`
}

type CommitWorkspaceSettingsParams struct {
	WorkspaceID string
	OwnerID     string
	Request     WorkspaceSettingsCommitRequest
}

type normalizedWorkspaceSettingsCommit struct {
	Request     WorkspaceSettingsCommitRequest
	RequestHash string
}

func normalizeWorkspaceSettingsCommit(request WorkspaceSettingsCommitRequest) (*normalizedWorkspaceSettingsCommit, error) {
	if request.CommitID != strings.TrimSpace(request.CommitID) || request.CommitID == "" {
		return nil, commitValidation("/commitId", "commitId is required and must not contain outer whitespace")
	}
	if request.IssuedAt.IsZero() {
		return nil, commitValidation("/issuedAt", "issuedAt is required")
	}
	if err := validateRequiredJSONSafeRevision("expectedWorkspaceRev", request.ExpectedWorkspaceRev); err != nil {
		return nil, err
	}
	if len(bytes.TrimSpace(request.Settings)) == 0 {
		return nil, commitValidation("/settings", "settings is required")
	}
	settings, err := normalizeJSONDocument(request.Settings, defaultWorkspaceSettings)
	if err != nil {
		return nil, commitValidation("/settings", "settings must contain valid JSON")
	}
	var settingsObject map[string]any
	if err := json.Unmarshal(settings, &settingsObject); err != nil || settingsObject == nil {
		return nil, commitValidation("/settings", "settings must be a JSON object")
	}
	request.IssuedAt = request.IssuedAt.UTC()
	request.Settings = settings
	canonical, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256(canonical)
	return &normalizedWorkspaceSettingsCommit{
		Request:     request,
		RequestHash: hex.EncodeToString(digest[:]),
	}, nil
}

// CommitWorkspaceSettings provides exact idempotent replay outside authoring Operations.
func (store *WorkspaceStore) CommitWorkspaceSettings(
	ctx context.Context,
	params CommitWorkspaceSettingsParams,
) (*WorkspaceMutationResult, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("workspace store is not initialized")
	}
	params.WorkspaceID = strings.TrimSpace(params.WorkspaceID)
	params.OwnerID = strings.TrimSpace(params.OwnerID)
	if params.WorkspaceID == "" || params.OwnerID == "" {
		return nil, ErrWorkspaceNotFound
	}
	normalized, err := normalizeWorkspaceSettingsCommit(params.Request)
	if err != nil {
		return nil, err
	}

	ctx, cancel := withStoreTimeout(ctx)
	defer cancel()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	rollback := func(result *WorkspaceMutationResult, commitErr error) (*WorkspaceMutationResult, error) {
		_ = tx.Rollback()
		return result, commitErr
	}

	const lockWorkspace = `SELECT workspace_rev, route_rev, op_seq
FROM workspaces
WHERE id = $1 AND owner_id = $2
FOR UPDATE`
	var workspaceRev int64
	var routeRev int64
	var opSeq int64
	if err := tx.QueryRowContext(ctx, lockWorkspace, params.WorkspaceID, params.OwnerID).Scan(&workspaceRev, &routeRev, &opSeq); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return rollback(nil, ErrWorkspaceNotFound)
		}
		return rollback(nil, err)
	}

	replayed, found, err := loadWorkspaceOperationCommitRecord(
		ctx,
		tx,
		params.WorkspaceID,
		normalized.Request.CommitID,
	)
	if err != nil {
		return rollback(nil, err)
	}
	if found {
		if replayed.RequestHash != normalized.RequestHash {
			return rollback(nil, ErrWorkspaceCommitIdentityMismatch)
		}
		return rollback(&replayed.Mutation, nil)
	}
	if err := validateWorkspaceMutationCanAdvance(workspaceRev, opSeq); err != nil {
		return rollback(nil, err)
	}
	if workspaceRev != normalized.Request.ExpectedWorkspaceRev {
		return rollback(
			nil,
			newWorkspaceRevisionConflict(
				params.WorkspaceID,
				normalized.Request.ExpectedWorkspaceRev,
				workspaceRev,
				routeRev,
				opSeq,
			),
		)
	}

	const upsertSettings = `INSERT INTO workspace_settings (workspace_id, settings_json, updated_at)
VALUES ($1, $2::jsonb, NOW())
ON CONFLICT (workspace_id) DO UPDATE
SET settings_json = EXCLUDED.settings_json, updated_at = EXCLUDED.updated_at`
	if _, err := tx.ExecContext(ctx, upsertSettings, params.WorkspaceID, string(normalized.Request.Settings)); err != nil {
		return rollback(nil, err)
	}

	const advanceWorkspace = `UPDATE workspaces
SET workspace_rev = workspace_rev + 1, op_seq = op_seq + 1, updated_at = NOW()
WHERE id = $1
RETURNING workspace_rev, route_rev, op_seq`
	if err := tx.QueryRowContext(ctx, advanceWorkspace, params.WorkspaceID).Scan(&workspaceRev, &routeRev, &opSeq); err != nil {
		return rollback(nil, err)
	}
	mutation := WorkspaceMutationResult{
		WorkspaceID:  params.WorkspaceID,
		WorkspaceRev: workspaceRev,
		RouteRev:     routeRev,
		OpSeq:        opSeq,
		Settings:     normalized.Request.Settings,
	}
	record := map[string]any{
		"kind":        "workspace-settings-commit",
		"version":     1,
		"commitId":    normalized.Request.CommitID,
		"requestHash": normalized.RequestHash,
		"request":     normalized.Request,
		"mutation":    mutation,
	}
	payloadJSON, err := json.Marshal(record)
	if err != nil {
		return rollback(nil, err)
	}
	resultJSON, err := json.Marshal(mutation)
	if err != nil {
		return rollback(nil, err)
	}
	const insertCommit = `INSERT INTO workspace_operations (
	workspace_id, op_seq, domain, document_id, payload_json, created_at, operation_id, request_hash, result_json
) VALUES ($1, $2, $3, NULL, $4::jsonb, $5, $6, $7, $8::jsonb)`
	if _, err := tx.ExecContext(
		ctx,
		insertCommit,
		params.WorkspaceID,
		opSeq,
		workspaceSettingsCommitDomain,
		string(payloadJSON),
		normalized.Request.IssuedAt,
		normalized.Request.CommitID,
		normalized.RequestHash,
		string(resultJSON),
	); err != nil {
		return rollback(nil, err)
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &mutation, nil
}
