package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

func (store *WorkspaceStore) PatchDocumentContent(ctx context.Context, params PatchDocumentContentParams) (*WorkspaceMutationResult, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("workspace store is not initialized")
	}
	if strings.TrimSpace(params.WorkspaceID) == "" || strings.TrimSpace(params.DocumentID) == "" {
		return nil, errors.New("workspaceID and documentID are required")
	}
	if err := validateRequiredJSONSafeRevision("expectedContentRev", params.ExpectedContentRev); err != nil {
		return nil, err
	}

	command, err := normalizeWorkspaceCommand(params.Command)
	if err != nil {
		return nil, err
	}
	if err := validateWorkspaceCommand(command, params.WorkspaceID, &params.DocumentID); err != nil {
		return nil, err
	}
	if len(command.ForwardOps) == 0 || len(command.ReverseOps) == 0 {
		return nil, errors.New("command.forwardOps and command.reverseOps are required")
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

	// All Workspace writers acquire the workspace row before document rows. This
	// explicit order prevents Atomic WorkspaceOperation Commit from deadlocking
	// with the retained single-document mutation endpoint.
	const lockWorkspaceQuery = `SELECT workspace_rev, route_rev, op_seq
FROM workspaces
WHERE id = $1
FOR UPDATE`

	var currentWorkspaceRev int64
	var currentRouteRev int64
	var currentOpSeq int64
	err = tx.QueryRowContext(ctx, lockWorkspaceQuery, params.WorkspaceID).Scan(
		&currentWorkspaceRev,
		&currentRouteRev,
		&currentOpSeq,
	)
	if err != nil {
		_ = tx.Rollback()
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrWorkspaceNotFound
		}
		return nil, err
	}

	const lockDocumentQuery = `SELECT doc_type, path, updated_at, content_json, content_rev, meta_rev
FROM workspace_documents
WHERE workspace_id = $1 AND id = $2
FOR UPDATE`

	var rawDocumentType string
	var currentPath string
	var currentUpdatedAt time.Time
	var currentContent json.RawMessage
	var currentContentRev int64
	var currentMetaRev int64
	err = tx.QueryRowContext(ctx, lockDocumentQuery, params.WorkspaceID, params.DocumentID).Scan(
		&rawDocumentType,
		&currentPath,
		&currentUpdatedAt,
		&currentContent,
		&currentContentRev,
		&currentMetaRev,
	)
	if err != nil {
		_ = tx.Rollback()
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrWorkspaceDocumentNotFound
		}
		return nil, err
	}
	if err := validateRevisionCanAdvance("contentRev", currentContentRev); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if err := validateRevisionCanAdvance("opSeq", currentOpSeq); err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	if currentContentRev != params.ExpectedContentRev {
		_ = tx.Rollback()
		return nil, newDocumentRevisionConflict(
			params.WorkspaceID,
			params.DocumentID,
			params.ExpectedContentRev,
			currentWorkspaceRev,
			currentRouteRev,
			currentOpSeq,
			WorkspaceConflictDocumentMetadata{
				ID:         params.DocumentID,
				Type:       WorkspaceDocumentType(rawDocumentType),
				Path:       currentPath,
				ContentRev: currentContentRev,
				MetaRev:    currentMetaRev,
				UpdatedAt:  currentUpdatedAt.UTC(),
			},
		)
	}
	documentType := WorkspaceDocumentType(rawDocumentType)
	if !isValidWorkspaceDocumentType(documentType) {
		_ = tx.Rollback()
		return nil, ErrInvalidWorkspaceDocumentType
	}

	patchedContent, err := applyWorkspaceDocumentPatch(documentType, currentContent, command.ForwardOps)
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if err := validateWorkspaceDocumentContent(documentType, patchedContent); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	reversedContent, err := applyWorkspaceDocumentPatch(documentType, patchedContent, command.ReverseOps)
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if !jsonBytesEqual(currentContent, reversedContent) {
		_ = tx.Rollback()
		return nil, errors.New("command.reverseOps do not restore original document")
	}

	const updateDocument = `UPDATE workspace_documents
SET content_json = $3::jsonb, content_rev = content_rev + 1, updated_at = NOW()
WHERE workspace_id = $1 AND id = $2
RETURNING workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, capabilities_json, updated_at`

	updatedDocument, err := scanWorkspaceDocument(tx.QueryRowContext(
		ctx,
		updateDocument,
		params.WorkspaceID,
		params.DocumentID,
		string(patchedContent),
	))
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	const bumpSequenceOnly = `UPDATE workspaces
SET op_seq = op_seq + 1, updated_at = NOW()
WHERE id = $1
RETURNING workspace_rev, route_rev, op_seq`

	var workspaceRev int64
	var routeRev int64
	var opSeq int64
	if err := tx.QueryRowContext(ctx, bumpSequenceOnly, params.WorkspaceID).Scan(&workspaceRev, &routeRev, &opSeq); err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	if err := insertWorkspaceOperation(ctx, tx, params.WorkspaceID, opSeq, commandDomain(command), &params.DocumentID, payloadJSON, command.IssuedAt); err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &WorkspaceMutationResult{
		WorkspaceID:  params.WorkspaceID,
		WorkspaceRev: workspaceRev,
		RouteRev:     routeRev,
		OpSeq:        opSeq,
		UpdatedDocuments: []WorkspaceDocumentRevision{
			toWorkspaceDocumentRevision(*updatedDocument),
		},
	}, nil
}
