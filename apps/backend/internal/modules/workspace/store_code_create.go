package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
)

func (store *WorkspaceStore) CreateCodeDocument(ctx context.Context, params CreateCodeDocumentMutationParams) (*WorkspaceMutationResult, error) {
	return store.CreateWorkspaceDocument(ctx, CreateWorkspaceDocumentMutationParams{
		WorkspaceID:          params.WorkspaceID,
		ExpectedWorkspaceRev: params.ExpectedWorkspaceRev,
		DocumentID:           params.DocumentID,
		NodeID:               params.NodeID,
		ParentNodeID:         params.ParentNodeID,
		Path:                 params.Path,
		Type:                 WorkspaceDocumentTypeCode,
		Content:              params.Content,
		Command:              params.Command,
	})
}

func (store *WorkspaceStore) CreateWorkspaceDocument(ctx context.Context, params CreateWorkspaceDocumentMutationParams) (*WorkspaceMutationResult, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("workspace store is not initialized")
	}
	params.WorkspaceID = strings.TrimSpace(params.WorkspaceID)
	params.DocumentID = strings.TrimSpace(params.DocumentID)
	params.NodeID = strings.TrimSpace(params.NodeID)
	params.ParentNodeID = strings.TrimSpace(params.ParentNodeID)
	if !isValidWorkspaceDocumentType(params.Type) {
		return nil, ErrInvalidWorkspaceDocumentType
	}
	if params.WorkspaceID == "" || params.DocumentID == "" {
		return nil, errors.New("workspaceID and documentID are required")
	}
	if params.ExpectedWorkspaceRev <= 0 {
		return nil, errors.New("expectedWorkspaceRev must be positive")
	}
	documentPath, err := normalizeWorkspacePath(params.Path)
	if err != nil {
		return nil, err
	}
	contentJSON, err := normalizeWorkspaceDocumentContent(params.Type, params.Content)
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
	if command.Target.DocumentID != "" && command.Target.DocumentID != params.DocumentID {
		return nil, errors.New("command.target.documentId does not match documentID")
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

	const lockWorkspace = `SELECT workspace_rev, route_rev, op_seq, tree_root_id, tree_json
FROM workspaces
WHERE id = $1
FOR UPDATE`

	var currentWorkspaceRev int64
	var currentRouteRev int64
	var currentOpSeq int64
	var treeRootID string
	var treeBytes []byte
	err = tx.QueryRowContext(ctx, lockWorkspace, params.WorkspaceID).Scan(&currentWorkspaceRev, &currentRouteRev, &currentOpSeq, &treeRootID, &treeBytes)
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
			"[workspace] conflict create_code_document workspace=%s expectedWorkspaceRev=%d serverWorkspaceRev=%d serverRouteRev=%d serverOpSeq=%d",
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

	const documentQuery = `SELECT workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, updated_at
FROM workspace_documents
WHERE workspace_id = $1
ORDER BY path ASC`
	rows, err := tx.QueryContext(ctx, documentQuery, params.WorkspaceID)
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	existingDocuments := make([]WorkspaceDocumentRecord, 0)
	for rows.Next() {
		document, scanErr := scanWorkspaceDocument(rows)
		if scanErr != nil {
			_ = rows.Close()
			_ = tx.Rollback()
			return nil, scanErr
		}
		if document.ID == params.DocumentID {
			_ = rows.Close()
			_ = tx.Rollback()
			return nil, fmt.Errorf("%w: document id already exists", ErrWorkspaceVFSInvalid)
		}
		if normalizeComparablePath(document.Path) == normalizeComparablePath(documentPath) {
			_ = rows.Close()
			_ = tx.Rollback()
			return nil, fmt.Errorf("%w: workspace path already exists", ErrWorkspaceVFSInvalid)
		}
		existingDocuments = append(existingDocuments, *document)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		_ = tx.Rollback()
		return nil, err
	}
	if err := rows.Close(); err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	tree, err := parseWorkspaceVFSTree(treeBytes, treeRootID, existingDocuments)
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	documentName := workspacePathName(documentPath)
	if err := tree.addDocument(codeDocumentMount{
		DocumentID: params.DocumentID,
		NodeID:     params.NodeID,
		ParentID:   params.ParentNodeID,
		Path:       documentPath,
		Name:       documentName,
	}); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	nextTreeJSON, err := tree.marshal()
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	const insertDocument = `INSERT INTO workspace_documents (
	workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, updated_at
) VALUES ($1, $2, $3, $4, $5, 1, 1, $6::jsonb, NOW())
RETURNING workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, updated_at`
	createdDocument, err := scanWorkspaceDocument(tx.QueryRowContext(
		ctx,
		insertDocument,
		params.WorkspaceID,
		params.DocumentID,
		string(params.Type),
		documentName,
		documentPath,
		string(contentJSON),
	))
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	const updateWorkspace = `UPDATE workspaces
SET tree_json = $2::jsonb, workspace_rev = workspace_rev + 1, op_seq = op_seq + 1, updated_at = NOW()
WHERE id = $1
RETURNING workspace_rev, route_rev, op_seq`
	var nextWorkspaceRev int64
	var nextRouteRev int64
	var nextOpSeq int64
	if err := tx.QueryRowContext(ctx, updateWorkspace, params.WorkspaceID, string(nextTreeJSON)).Scan(&nextWorkspaceRev, &nextRouteRev, &nextOpSeq); err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	if err := insertWorkspaceOperation(ctx, tx, params.WorkspaceID, nextOpSeq, commandDomain(command), &params.DocumentID, payloadJSON, command.IssuedAt); err != nil {
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
		Tree:         nextTreeJSON,
		UpdatedDocuments: []WorkspaceDocumentRevision{
			toWorkspaceDocumentRevision(*createdDocument),
		},
	}, nil
}
