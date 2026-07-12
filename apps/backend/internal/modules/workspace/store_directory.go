package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
)

func (store *WorkspaceStore) CreateWorkspaceDirectory(ctx context.Context, params CreateWorkspaceDirectoryMutationParams) (*WorkspaceMutationResult, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("workspace store is not initialized")
	}
	params.WorkspaceID = strings.TrimSpace(params.WorkspaceID)
	params.NodeID = strings.TrimSpace(params.NodeID)
	params.ParentNodeID = strings.TrimSpace(params.ParentNodeID)
	if params.WorkspaceID == "" || params.NodeID == "" {
		return nil, errors.New("workspaceID and nodeID are required")
	}
	if err := validateRequiredJSONSafeRevision("expectedWorkspaceRev", params.ExpectedWorkspaceRev); err != nil {
		return nil, err
	}
	command, err := normalizeWorkspaceCommand(params.Command)
	if err != nil {
		return nil, err
	}
	if err := validateWorkspaceCommand(command, params.WorkspaceID, nil); err != nil {
		return nil, err
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
	if err := validateWorkspaceMutationCanAdvance(currentWorkspaceRev, currentOpSeq); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if currentWorkspaceRev != params.ExpectedWorkspaceRev {
		_ = tx.Rollback()
		return nil, newWorkspaceRevisionConflict(
			params.WorkspaceID,
			params.ExpectedWorkspaceRev,
			currentWorkspaceRev,
			currentRouteRev,
			currentOpSeq,
		)
	}
	documents, err := queryWorkspaceDocumentsForUpdate(ctx, tx, params.WorkspaceID)
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	tree, err := parseWorkspaceVFSTree(treeBytes, treeRootID, documents)
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if err := tree.addDirectory(workspaceDirectoryMount{NodeID: params.NodeID, ParentID: params.ParentNodeID, Name: params.Name}); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	nextTreeJSON, err := tree.marshal()
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
	if err := insertWorkspaceOperation(ctx, tx, params.WorkspaceID, nextOpSeq, commandDomain(command), nil, payloadJSON, command.IssuedAt); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &WorkspaceMutationResult{WorkspaceID: params.WorkspaceID, WorkspaceRev: nextWorkspaceRev, RouteRev: nextRouteRev, OpSeq: nextOpSeq, Tree: nextTreeJSON}, nil
}

func (store *WorkspaceStore) RenameWorkspaceDirectory(ctx context.Context, params RenameWorkspaceDirectoryMutationParams) (*WorkspaceMutationResult, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("workspace store is not initialized")
	}
	params.WorkspaceID = strings.TrimSpace(params.WorkspaceID)
	params.NodeID = strings.TrimSpace(params.NodeID)
	if params.WorkspaceID == "" || params.NodeID == "" {
		return nil, errors.New("workspaceID and nodeID are required")
	}
	if err := validateRequiredJSONSafeRevision("expectedWorkspaceRev", params.ExpectedWorkspaceRev); err != nil {
		return nil, err
	}
	command, err := normalizeWorkspaceCommand(params.Command)
	if err != nil {
		return nil, err
	}
	if err := validateWorkspaceCommand(command, params.WorkspaceID, nil); err != nil {
		return nil, err
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
	if err := validateWorkspaceMutationCanAdvance(currentWorkspaceRev, currentOpSeq); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if currentWorkspaceRev != params.ExpectedWorkspaceRev {
		_ = tx.Rollback()
		return nil, newWorkspaceRevisionConflict(
			params.WorkspaceID,
			params.ExpectedWorkspaceRev,
			currentWorkspaceRev,
			currentRouteRev,
			currentOpSeq,
		)
	}
	documents, err := queryWorkspaceDocumentsForUpdate(ctx, tx, params.WorkspaceID)
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	tree, err := parseWorkspaceVFSTree(treeBytes, treeRootID, documents)
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if err := tree.renameDirectory(params.NodeID, params.Name); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	pathsByDocumentID := tree.documentPathsByID()
	nextTreeJSON, err := tree.marshal()
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	type documentPathUpdate struct {
		documentID string
		path       string
	}
	documentPathUpdates := make([]documentPathUpdate, 0)
	for _, document := range documents {
		nextPath, exists := pathsByDocumentID[document.ID]
		if !exists || normalizeComparablePath(document.Path) == normalizeComparablePath(nextPath) {
			continue
		}
		if err := validateRevisionCanAdvance("metaRev", document.MetaRev); err != nil {
			_ = tx.Rollback()
			return nil, err
		}
		documentPathUpdates = append(documentPathUpdates, documentPathUpdate{documentID: document.ID, path: nextPath})
	}

	updatedDocuments := make([]WorkspaceDocumentRevision, 0, len(documentPathUpdates))
	const updateDocumentPath = `UPDATE workspace_documents
SET name = $3, path = $4, meta_rev = meta_rev + 1, updated_at = NOW()
WHERE workspace_id = $1 AND id = $2
RETURNING workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, capabilities_json, updated_at`
	for _, update := range documentPathUpdates {
		updatedDocument, err := scanWorkspaceDocument(tx.QueryRowContext(ctx, updateDocumentPath, params.WorkspaceID, update.documentID, workspacePathName(update.path), update.path))
		if err != nil {
			_ = tx.Rollback()
			return nil, err
		}
		updatedDocuments = append(updatedDocuments, toWorkspaceDocumentRevision(*updatedDocument))
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
	if err := insertWorkspaceOperation(ctx, tx, params.WorkspaceID, nextOpSeq, commandDomain(command), nil, payloadJSON, command.IssuedAt); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &WorkspaceMutationResult{WorkspaceID: params.WorkspaceID, WorkspaceRev: nextWorkspaceRev, RouteRev: nextRouteRev, OpSeq: nextOpSeq, Tree: nextTreeJSON, UpdatedDocuments: updatedDocuments}, nil
}

func (store *WorkspaceStore) DeleteWorkspaceDirectory(ctx context.Context, params DeleteWorkspaceDirectoryMutationParams) (*WorkspaceMutationResult, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("workspace store is not initialized")
	}
	params.WorkspaceID = strings.TrimSpace(params.WorkspaceID)
	params.NodeID = strings.TrimSpace(params.NodeID)
	if params.WorkspaceID == "" || params.NodeID == "" {
		return nil, errors.New("workspaceID and nodeID are required")
	}
	if err := validateRequiredJSONSafeRevision("expectedWorkspaceRev", params.ExpectedWorkspaceRev); err != nil {
		return nil, err
	}
	command, err := normalizeWorkspaceCommand(params.Command)
	if err != nil {
		return nil, err
	}
	if err := validateWorkspaceCommand(command, params.WorkspaceID, nil); err != nil {
		return nil, err
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
	if err := validateWorkspaceMutationCanAdvance(currentWorkspaceRev, currentOpSeq); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if currentWorkspaceRev != params.ExpectedWorkspaceRev {
		_ = tx.Rollback()
		return nil, newWorkspaceRevisionConflict(
			params.WorkspaceID,
			params.ExpectedWorkspaceRev,
			currentWorkspaceRev,
			currentRouteRev,
			currentOpSeq,
		)
	}
	documents, err := queryWorkspaceDocumentsForUpdate(ctx, tx, params.WorkspaceID)
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	tree, err := parseWorkspaceVFSTree(treeBytes, treeRootID, documents)
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	removedDocumentIDs, err := tree.removeDirectory(params.NodeID)
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if err := validateWorkspaceDocumentRetention(len(documents), len(removedDocumentIDs)); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	finalDocumentsByID, err := indexWorkspaceDocumentsAfterRemoval(documents, removedDocumentIDs)
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	manifestJSON, err := queryWorkspaceRouteManifestForValidation(ctx, tx, params.WorkspaceID)
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if err := validateWorkspaceRouteDocumentReferences(manifestJSON, finalDocumentsByID); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	nextTreeJSON, err := tree.marshal()
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	for _, documentID := range removedDocumentIDs {
		const deleteDocument = `DELETE FROM workspace_documents
WHERE workspace_id = $1 AND id = $2`
		if _, err := tx.ExecContext(ctx, deleteDocument, params.WorkspaceID, documentID); err != nil {
			_ = tx.Rollback()
			return nil, err
		}
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
	if err := insertWorkspaceOperation(ctx, tx, params.WorkspaceID, nextOpSeq, commandDomain(command), nil, payloadJSON, command.IssuedAt); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &WorkspaceMutationResult{WorkspaceID: params.WorkspaceID, WorkspaceRev: nextWorkspaceRev, RouteRev: nextRouteRev, OpSeq: nextOpSeq, Tree: nextTreeJSON, RemovedDocumentIDs: removedDocumentIDs}, nil
}
