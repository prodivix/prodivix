package workspace

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

type workspaceImportTransactionHook func(context.Context, *sql.Tx) error

func (store *WorkspaceStore) ImportWorkspaceSnapshot(ctx context.Context, params ImportWorkspaceSnapshotParams) (*WorkspaceSnapshot, error) {
	return store.importWorkspaceSnapshot(ctx, params, nil)
}

func (store *WorkspaceStore) importWorkspaceSnapshot(ctx context.Context, params ImportWorkspaceSnapshotParams, beforeWorkspaceInsert workspaceImportTransactionHook) (*WorkspaceSnapshot, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("workspace store is not initialized")
	}
	params.WorkspaceID = strings.TrimSpace(params.WorkspaceID)
	params.ProjectID = strings.TrimSpace(params.ProjectID)
	params.OwnerID = strings.TrimSpace(params.OwnerID)
	if params.WorkspaceID == "" || params.ProjectID == "" || params.OwnerID == "" {
		return nil, errors.New("workspaceID, projectID and ownerID are required")
	}
	if len(params.Documents) == 0 {
		return nil, fmt.Errorf("%w: workspace import requires at least one document", ErrWorkspaceVFSInvalid)
	}

	treeJSON, err := normalizeJSONDocument(params.Tree, defaultWorkspaceTree)
	if err != nil {
		return nil, err
	}
	manifestJSON, err := normalizeRouteManifestDocument(params.RouteManifest)
	if err != nil {
		return nil, err
	}
	settingsJSON, err := normalizeJSONDocument(params.Settings, defaultWorkspaceSettings)
	if err != nil {
		return nil, err
	}
	workspaceRev := params.WorkspaceRev
	if workspaceRev <= 0 {
		workspaceRev = 1
	}
	if err := validateRequiredJSONSafeRevision("workspaceRev", workspaceRev); err != nil {
		return nil, err
	}
	routeRev := params.RouteRev
	if routeRev <= 0 {
		routeRev = 1
	}
	if err := validateRequiredJSONSafeRevision("routeRev", routeRev); err != nil {
		return nil, err
	}
	opSeq := params.OpSeq
	if opSeq <= 0 {
		opSeq = 1
	}
	if err := validateRequiredJSONSafeRevision("opSeq", opSeq); err != nil {
		return nil, err
	}

	documents := make([]WorkspaceImportDocumentRecord, 0, len(params.Documents))
	paths := map[string]struct{}{}
	for _, document := range params.Documents {
		if !isCanonicalWorkspaceVFSID(document.ID) {
			return nil, fmt.Errorf("%w: workspace document id must be canonical", ErrWorkspaceVFSInvalid)
		}
		if !isValidWorkspaceDocumentType(document.Type) {
			return nil, ErrInvalidWorkspaceDocumentType
		}
		normalizedPath, err := normalizeWorkspacePath(document.Path)
		if err != nil {
			return nil, err
		}
		comparablePath := normalizeComparablePath(normalizedPath)
		if _, exists := paths[comparablePath]; exists {
			return nil, fmt.Errorf("%w: duplicate workspace document path", ErrWorkspaceVFSInvalid)
		}
		paths[comparablePath] = struct{}{}
		contentJSON, err := normalizeWorkspaceDocumentContent(document.Type, document.Content)
		if err != nil {
			return nil, err
		}
		capabilities, err := normalizeWorkspaceCapabilities(document.Capabilities)
		if err != nil {
			return nil, err
		}
		contentRev := document.ContentRev
		if contentRev <= 0 {
			contentRev = 1
		}
		if err := validateRequiredJSONSafeRevision("contentRev", contentRev); err != nil {
			return nil, err
		}
		metaRev := document.MetaRev
		if metaRev <= 0 {
			metaRev = 1
		}
		if err := validateRequiredJSONSafeRevision("metaRev", metaRev); err != nil {
			return nil, err
		}
		updatedAt := document.UpdatedAt
		if updatedAt.IsZero() {
			updatedAt = time.Now().UTC()
		}
		documents = append(documents, WorkspaceImportDocumentRecord{
			ID:           document.ID,
			Type:         document.Type,
			Path:         normalizedPath,
			ContentRev:   contentRev,
			MetaRev:      metaRev,
			Content:      contentJSON,
			Capabilities: capabilities,
			UpdatedAt:    updatedAt.UTC(),
		})
	}

	documentRecords := toWorkspaceDocumentRecords(params.WorkspaceID, documents)
	tree, err := parseWorkspaceVFSTree(treeJSON, "root", documentRecords)
	if err != nil {
		return nil, err
	}
	documentsByID, err := indexWorkspaceVFSDocuments(documentRecords)
	if err != nil {
		return nil, err
	}
	if err := validateWorkspaceRouteDocumentReferences(manifestJSON, documentsByID); err != nil {
		return nil, err
	}
	treeJSON, err = tree.marshal()
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
	if beforeWorkspaceInsert != nil {
		if err := beforeWorkspaceInsert(ctx, tx); err != nil {
			_ = tx.Rollback()
			return nil, err
		}
	}

	const insertWorkspace = `INSERT INTO workspaces (
	id, project_id, owner_id, name, workspace_rev, route_rev, op_seq, tree_root_id, tree_json, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`
	if _, err := tx.ExecContext(
		ctx,
		insertWorkspace,
		params.WorkspaceID,
		params.ProjectID,
		params.OwnerID,
		strings.TrimSpace(params.Name),
		workspaceRev,
		routeRev,
		opSeq,
		tree.TreeRootID,
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

	if string(settingsJSON) != string(defaultWorkspaceSettings) {
		const insertSettings = `INSERT INTO workspace_settings (workspace_id, settings_json, updated_at)
VALUES ($1, $2::jsonb, $3)`
		if _, err := tx.ExecContext(ctx, insertSettings, params.WorkspaceID, string(settingsJSON), now); err != nil {
			_ = tx.Rollback()
			return nil, err
		}
	}

	const insertDocument = `INSERT INTO workspace_documents (
	workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, capabilities_json, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)`
	for _, document := range documents {
		if _, err := tx.ExecContext(
			ctx,
			insertDocument,
			params.WorkspaceID,
			document.ID,
			string(document.Type),
			workspacePathName(document.Path),
			document.Path,
			document.ContentRev,
			document.MetaRev,
			string(document.Content),
			mustMarshalWorkspaceCapabilities(document.Capabilities),
			document.UpdatedAt,
		); err != nil {
			_ = tx.Rollback()
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &WorkspaceSnapshot{
		Workspace: WorkspaceRecord{
			ID:           params.WorkspaceID,
			ProjectID:    params.ProjectID,
			OwnerID:      params.OwnerID,
			Name:         strings.TrimSpace(params.Name),
			WorkspaceRev: workspaceRev,
			RouteRev:     routeRev,
			OpSeq:        opSeq,
			TreeRootID:   tree.TreeRootID,
			Tree:         treeJSON,
			CreatedAt:    now,
			UpdatedAt:    now,
		},
		RouteManifest: manifestJSON,
		Settings:      settingsJSON,
		Documents:     documentRecords,
	}, nil
}

func (store *WorkspaceStore) GetSnapshotForOwner(ctx context.Context, ownerID string, workspaceID string) (*WorkspaceSnapshot, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("workspace store is not initialized")
	}
	ownerID = strings.TrimSpace(ownerID)
	workspaceID = strings.TrimSpace(workspaceID)
	if ownerID == "" || workspaceID == "" {
		return nil, ErrWorkspaceNotFound
	}

	ctx, cancel := withStoreTimeout(ctx)
	defer cancel()

	const workspaceQuery = `SELECT w.id, w.project_id, w.owner_id, w.name, w.workspace_rev, w.route_rev, w.op_seq, w.tree_root_id, w.tree_json, w.created_at, w.updated_at, r.manifest_json, s.settings_json
FROM workspaces w
LEFT JOIN workspace_routes r ON r.workspace_id = w.id
LEFT JOIN workspace_settings s ON s.workspace_id = w.id
WHERE w.id = $1 AND w.owner_id = $2`

	var workspace WorkspaceRecord
	var treeBytes []byte
	var routeBytes []byte
	var settingsBytes []byte
	err := store.db.QueryRowContext(ctx, workspaceQuery, workspaceID, ownerID).Scan(
		&workspace.ID,
		&workspace.ProjectID,
		&workspace.OwnerID,
		&workspace.Name,
		&workspace.WorkspaceRev,
		&workspace.RouteRev,
		&workspace.OpSeq,
		&workspace.TreeRootID,
		&treeBytes,
		&workspace.CreatedAt,
		&workspace.UpdatedAt,
		&routeBytes,
		&settingsBytes,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrWorkspaceNotFound
		}
		return nil, err
	}
	if err := validateRequiredJSONSafeRevision("workspaceRev", workspace.WorkspaceRev); err != nil {
		return nil, err
	}
	if err := validateRequiredJSONSafeRevision("routeRev", workspace.RouteRev); err != nil {
		return nil, err
	}
	if err := validateRequiredJSONSafeRevision("opSeq", workspace.OpSeq); err != nil {
		return nil, err
	}
	if len(routeBytes) == 0 {
		workspaceRoute, normalizeErr := normalizeJSONDocument(nil, defaultWorkspaceRouteManifest)
		if normalizeErr != nil {
			return nil, normalizeErr
		}
		routeBytes = workspaceRoute
	}
	if len(settingsBytes) == 0 {
		workspaceSettings, normalizeErr := normalizeJSONDocument(nil, defaultWorkspaceSettings)
		if normalizeErr != nil {
			return nil, normalizeErr
		}
		settingsBytes = workspaceSettings
	}

	const documentQuery = `SELECT workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, capabilities_json, updated_at
FROM workspace_documents
WHERE workspace_id = $1
ORDER BY path ASC`

	rows, err := store.db.QueryContext(ctx, documentQuery, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	documents := make([]WorkspaceDocumentRecord, 0)
	for rows.Next() {
		document, scanErr := scanWorkspaceDocument(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		if err := validateRequiredJSONSafeRevision("contentRev", document.ContentRev); err != nil {
			_ = rows.Close()
			return nil, err
		}
		if err := validateRequiredJSONSafeRevision("metaRev", document.MetaRev); err != nil {
			_ = rows.Close()
			return nil, err
		}
		documents = append(documents, *document)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	tree, err := parseWorkspaceVFSTree(treeBytes, workspace.TreeRootID, documents)
	if err != nil {
		return nil, err
	}
	documentsByID, err := indexWorkspaceVFSDocuments(documents)
	if err != nil {
		return nil, err
	}
	if err := validateWorkspaceRouteDocumentReferences(routeBytes, documentsByID); err != nil {
		return nil, err
	}
	canonicalTree, err := tree.marshal()
	if err != nil {
		return nil, err
	}
	workspace.TreeRootID = tree.TreeRootID
	workspace.Tree = canonicalTree

	return &WorkspaceSnapshot{
		Workspace:     workspace,
		RouteManifest: routeBytes,
		Settings:      settingsBytes,
		Documents:     documents,
	}, nil
}
