package workspace

import (
	"context"
	"errors"
	"strings"
	"time"
)

func (store *WorkspaceStore) CreateWorkspace(ctx context.Context, params CreateWorkspaceParams) (*WorkspaceRecord, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("workspace store is not initialized")
	}
	if strings.TrimSpace(params.WorkspaceID) == "" || strings.TrimSpace(params.ProjectID) == "" || strings.TrimSpace(params.OwnerID) == "" {
		return nil, errors.New("workspaceID, projectID and ownerID are required")
	}

	treeRootID := strings.TrimSpace(params.TreeRootID)
	if treeRootID == "" {
		treeRootID = "root"
	}

	treeJSON, err := normalizeJSONDocument(params.Tree, defaultWorkspaceTree)
	if err != nil {
		return nil, err
	}
	manifestJSON, err := normalizeRouteManifestDocument(params.RouteManifest)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	ctx, cancel := withStoreTimeout(ctx)
	defer cancel()

	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}

	const insertWorkspace = `INSERT INTO workspaces (
	id, project_id, owner_id, name, workspace_rev, route_rev, op_seq, tree_root_id, tree_json, created_at, updated_at
) VALUES ($1, $2, $3, $4, 1, 1, 1, $5, $6::jsonb, $7, $8)`
	if _, err := tx.ExecContext(
		ctx,
		insertWorkspace,
		params.WorkspaceID,
		params.ProjectID,
		params.OwnerID,
		strings.TrimSpace(params.Name),
		treeRootID,
		string(treeJSON),
		now,
		now,
	); err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	const insertRoute = `INSERT INTO workspace_routes (workspace_id, manifest_json, updated_at)
VALUES ($1, $2::jsonb, $3)`
	if _, err := tx.ExecContext(ctx, insertRoute, params.WorkspaceID, string(manifestJSON), now); err != nil {
		_ = tx.Rollback()
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &WorkspaceRecord{
		ID:           params.WorkspaceID,
		ProjectID:    params.ProjectID,
		OwnerID:      params.OwnerID,
		Name:         strings.TrimSpace(params.Name),
		WorkspaceRev: 1,
		RouteRev:     1,
		OpSeq:        1,
		TreeRootID:   treeRootID,
		Tree:         treeJSON,
		CreatedAt:    now,
		UpdatedAt:    now,
	}, nil
}

func (store *WorkspaceStore) CreateDocument(ctx context.Context, params CreateWorkspaceDocumentParams) (*WorkspaceDocumentRecord, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("workspace store is not initialized")
	}
	if strings.TrimSpace(params.WorkspaceID) == "" || strings.TrimSpace(params.DocumentID) == "" || strings.TrimSpace(params.Path) == "" {
		return nil, errors.New("workspaceID, documentID and path are required")
	}
	if !isValidWorkspaceDocumentType(params.Type) {
		return nil, ErrInvalidWorkspaceDocumentType
	}

	contentJSON, err := normalizeWorkspaceDocumentContent(params.Type, params.Content)
	if err != nil {
		return nil, err
	}

	ctx, cancel := withStoreTimeout(ctx)
	defer cancel()

	const query = `INSERT INTO workspace_documents (
	workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, updated_at
) VALUES ($1, $2, $3, $4, $5, 1, 1, $6::jsonb, NOW())
RETURNING workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, updated_at`

	row := store.db.QueryRowContext(
		ctx,
		query,
		params.WorkspaceID,
		params.DocumentID,
		string(params.Type),
		strings.TrimSpace(params.Name),
		strings.TrimSpace(params.Path),
		string(contentJSON),
	)

	document, err := scanWorkspaceDocument(row)
	if err != nil {
		return nil, err
	}
	return document, nil
}
