package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
)

func (store *WorkspaceStore) PatchDocumentContent(ctx context.Context, params PatchDocumentContentParams) (*WorkspaceMutationResult, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("workspace store is not initialized")
	}
	if strings.TrimSpace(params.WorkspaceID) == "" || strings.TrimSpace(params.DocumentID) == "" {
		return nil, errors.New("workspaceID and documentID are required")
	}
	if params.ExpectedContentRev <= 0 {
		return nil, errors.New("expectedContentRev must be positive")
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

	const lockQuery = `SELECT d.doc_type, d.content_json, d.content_rev, d.meta_rev, w.workspace_rev, w.route_rev, w.op_seq
FROM workspace_documents d
JOIN workspaces w ON w.id = d.workspace_id
WHERE d.workspace_id = $1 AND d.id = $2
FOR UPDATE OF d, w`

	var rawDocumentType string
	var currentContent json.RawMessage
	var currentContentRev int64
	var currentMetaRev int64
	var currentWorkspaceRev int64
	var currentRouteRev int64
	var currentOpSeq int64

	err = tx.QueryRowContext(ctx, lockQuery, params.WorkspaceID, params.DocumentID).Scan(
		&rawDocumentType,
		&currentContent,
		&currentContentRev,
		&currentMetaRev,
		&currentWorkspaceRev,
		&currentRouteRev,
		&currentOpSeq,
	)
	if err != nil {
		_ = tx.Rollback()
		if errors.Is(err, sql.ErrNoRows) {
			return nil, store.resolveDocumentLookupError(ctx, params.WorkspaceID)
		}
		return nil, err
	}

	if currentContentRev != params.ExpectedContentRev {
		_ = tx.Rollback()
		return nil, &WorkspaceRevisionConflictError{
			ConflictType:       WorkspaceConflictDocument,
			WorkspaceID:        params.WorkspaceID,
			DocumentID:         params.DocumentID,
			ServerWorkspaceRev: currentWorkspaceRev,
			ServerRouteRev:     currentRouteRev,
			ServerContentRev:   currentContentRev,
			ServerMetaRev:      currentMetaRev,
			ServerOpSeq:        currentOpSeq,
		}
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
RETURNING workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, updated_at`

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
