package workspace

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	backendproject "github.com/Prodivix/prodivix/apps/backend/internal/modules/project"
)

// Publication holds the same Workspace/document locks as Atomic Commit until
// the explicit community projection has committed. No authoring bytes come from the browser.
func (module *Module) publishProjectWorkspace(ctx context.Context, userID, workspaceID string, expected *backendproject.PublicationExpected) (*backendproject.Project, error) {
	if module.store == nil {
		return nil, errors.New("workspace publication is not initialized")
	}
	ctx, cancel := withStoreTimeout(ctx)
	defer cancel()
	userID = strings.TrimSpace(userID)
	workspaceID = strings.TrimSpace(workspaceID)
	tx, err := module.store.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	record, routes, err := lockWorkspaceCommitSnapshot(ctx, tx, workspaceID, userID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, backendproject.ErrProjectNotFound
	}
	if err != nil {
		return nil, err
	}
	if record.ProjectID != workspaceID {
		return nil, errors.New("workspace publication project identity does not match")
	}
	// A joined row read may have started before waiting on the Workspace lock.
	// Read the route partition again after acquiring that lock at READ COMMITTED.
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE((SELECT manifest_json FROM workspace_routes WHERE workspace_id=$1), '{"version":"1","root":{"id":"root"}}'::jsonb)`, workspaceID).Scan(&routes); err != nil {
		return nil, err
	}
	documents, err := queryWorkspaceCommitDocumentsForUpdate(ctx, tx, workspaceID)
	if err != nil {
		return nil, err
	}
	if expected != nil && !publicationExpectedMatches(expected, record, documents) {
		return nil, backendproject.ErrPublicationRevisionConflict
	}
	if _, err := parseWorkspaceVFSTree(record.Tree, record.TreeRootID, documents); err != nil {
		return nil, err
	}
	documentsByID, err := indexWorkspaceVFSDocuments(documents)
	if err != nil {
		return nil, err
	}
	if err := validateWorkspaceRouteDocumentReferences(routes, documentsByID); err != nil {
		return nil, err
	}
	var resourceType backendproject.ResourceType
	if err := tx.QueryRowContext(ctx, `SELECT resource_type FROM projects WHERE id = $1 AND owner_id = $2 FOR UPDATE`, record.ProjectID, userID).Scan(&resourceType); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, backendproject.ErrProjectNotFound
		}
		return nil, err
	}
	snapshot := &WorkspaceSnapshot{Workspace: *record, RouteManifest: routes, Documents: documents}
	pir, ok := ResolveWorkspacePublicationPIR(resourceType, snapshot)
	if !ok {
		return nil, backendproject.ErrProjectNotPublishable
	}
	project, err := module.projects.PublishWorkspaceProjection(ctx, tx, userID, record.ProjectID, pir)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return project, nil
}

func publicationExpectedMatches(expected *backendproject.PublicationExpected, workspace *WorkspaceRecord, documents []WorkspaceDocumentRecord) bool {
	if expected.WorkspaceRev != workspace.WorkspaceRev || expected.RouteRev != workspace.RouteRev || expected.OpSeq != workspace.OpSeq || len(expected.Documents) != len(documents) {
		return false
	}
	byID := make(map[string]WorkspaceDocumentRecord, len(documents))
	for _, document := range documents {
		byID[document.ID] = document
	}
	for _, revision := range expected.Documents {
		document, exists := byID[revision.DocumentID]
		if !exists || revision.ContentRev != document.ContentRev || revision.MetaRev != document.MetaRev {
			return false
		}
		delete(byID, revision.DocumentID)
	}
	return len(byID) == 0
}
