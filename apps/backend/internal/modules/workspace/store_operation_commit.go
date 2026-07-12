package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

// CommitWorkspaceOperation validates every affected revision before applying
// one command or transaction as a single durable workspace commit.
func (store *WorkspaceStore) CommitWorkspaceOperation(
	ctx context.Context,
	params CommitWorkspaceOperationParams,
) (*WorkspaceMutationResult, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("workspace store is not initialized")
	}
	params.WorkspaceID = strings.TrimSpace(params.WorkspaceID)
	params.OwnerID = strings.TrimSpace(params.OwnerID)
	if params.WorkspaceID == "" || params.OwnerID == "" {
		return nil, ErrWorkspaceNotFound
	}
	normalized, err := normalizeWorkspaceOperationCommit(params.WorkspaceID, params.Request)
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

	workspace, routeManifest, err := lockWorkspaceCommitSnapshot(
		ctx,
		tx,
		params.WorkspaceID,
		params.OwnerID,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return rollback(nil, ErrWorkspaceNotFound)
		}
		return rollback(nil, err)
	}

	replayed, found, err := loadWorkspaceOperationCommitRecord(
		ctx,
		tx,
		params.WorkspaceID,
		normalized.CommitID,
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

	documents, err := queryWorkspaceCommitDocumentsForUpdate(ctx, tx, params.WorkspaceID)
	if err != nil {
		return rollback(nil, err)
	}
	if err := validateWorkspaceCommitPreconditions(workspace, documents, normalized); err != nil {
		return rollback(nil, err)
	}

	state, err := newWorkspaceCommitState(*workspace, routeManifest, documents)
	if err != nil {
		return rollback(nil, err)
	}
	if err := state.validate(); err != nil {
		return rollback(nil, commitValidation("/workspace", err.Error()))
	}
	originalDocuments := cloneWorkspaceCommitDocuments(state.Documents)
	originalTree := workspaceVFSTree{TreeRootID: state.TreeRootID, TreeByID: cloneWorkspaceTreeByID(state.TreeByID)}
	originalTreeJSON, err := originalTree.marshal()
	if err != nil {
		return rollback(nil, err)
	}
	if err := state.apply(normalized.Commands); err != nil {
		return rollback(nil, commitValidation("/operation", err.Error()))
	}
	finalTree := workspaceVFSTree{TreeRootID: state.TreeRootID, TreeByID: state.TreeByID}
	finalTreeJSON, err := finalTree.marshal()
	if err != nil {
		return rollback(nil, err)
	}

	now := time.Now().UTC()
	changes, err := buildWorkspaceCommitChanges(
		params.WorkspaceID,
		originalDocuments,
		state.Documents,
		originalTreeJSON,
		finalTreeJSON,
		routeManifest,
		state.RouteManifest,
		now,
	)
	if err != nil {
		return rollback(nil, err)
	}
	if err := validateWorkspaceCommitChangesAgainstRequirements(
		originalDocuments,
		state.Documents,
		changes,
		normalized.Requirements,
	); err != nil {
		return rollback(nil, err)
	}
	if err := validateWorkspaceCommitHasDurableDelta(changes); err != nil {
		return rollback(nil, err)
	}
	if err := validateWorkspaceCommitRevisionCapacity(workspace, changes); err != nil {
		return rollback(nil, err)
	}
	if err := persistWorkspaceCommitChanges(ctx, tx, params.WorkspaceID, changes); err != nil {
		return rollback(nil, err)
	}

	workspaceIncrement := int64(0)
	if changes.WorkspaceChanged {
		workspaceIncrement = 1
	}
	routeIncrement := int64(0)
	if changes.RouteChanged {
		routeIncrement = 1
	}
	const updateWorkspace = `UPDATE workspaces
SET tree_root_id = CASE WHEN $4 = 1 THEN $2 ELSE tree_root_id END,
    tree_json = CASE WHEN $4 = 1 THEN $3::jsonb ELSE tree_json END,
    workspace_rev = workspace_rev + $5,
    route_rev = route_rev + $6,
	    op_seq = op_seq + 1,
	    updated_at = $7
WHERE id = $1
RETURNING workspace_rev, route_rev, op_seq`
	if err := tx.QueryRowContext(
		ctx,
		updateWorkspace,
		params.WorkspaceID,
		state.TreeRootID,
		string(finalTreeJSON),
		boolToRevisionIncrement(changes.TreeChanged),
		workspaceIncrement,
		routeIncrement,
		now,
	).Scan(&workspace.WorkspaceRev, &workspace.RouteRev, &workspace.OpSeq); err != nil {
		return rollback(nil, err)
	}

	mutation := WorkspaceMutationResult{
		WorkspaceID:        params.WorkspaceID,
		WorkspaceRev:       workspace.WorkspaceRev,
		RouteRev:           workspace.RouteRev,
		OpSeq:              workspace.OpSeq,
		UpdatedDocuments:   changes.UpdatedDocuments,
		RemovedDocumentIDs: changes.RemovedDocumentIDs,
	}
	if changes.TreeChanged {
		mutation.Tree = finalTreeJSON
	}
	if changes.RouteChanged {
		mutation.RouteManifest = append(json.RawMessage(nil), state.RouteManifest...)
	}

	record := workspaceOperationCommitRecord{
		Kind:        "workspace-operation-commit",
		Version:     1,
		CommitID:    normalized.CommitID,
		RequestHash: normalized.RequestHash,
		Operation:   normalized.Request.Operation,
		Mutation:    mutation,
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
		workspace.OpSeq,
		workspaceOperationCommitDomain,
		string(payloadJSON),
		now,
		normalized.CommitID,
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

func boolToRevisionIncrement(value bool) int64 {
	if value {
		return 1
	}
	return 0
}

func lockWorkspaceCommitSnapshot(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	ownerID string,
) (*WorkspaceRecord, json.RawMessage, error) {
	const query = `SELECT w.id, w.project_id, w.owner_id, w.name, w.workspace_rev, w.route_rev, w.op_seq,
       w.tree_root_id, w.tree_json, w.created_at, w.updated_at,
	       COALESCE(r.manifest_json, '{"version":"1","root":{"id":"root"}}'::jsonb)
FROM workspaces w
LEFT JOIN workspace_routes r ON r.workspace_id = w.id
WHERE w.id = $1 AND w.owner_id = $2
FOR UPDATE OF w`
	workspace := &WorkspaceRecord{}
	var treeBytes []byte
	var routeBytes []byte
	err := tx.QueryRowContext(ctx, query, workspaceID, ownerID).Scan(
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
	)
	workspace.Tree = json.RawMessage(treeBytes)
	return workspace, json.RawMessage(routeBytes), err
}

func loadWorkspaceOperationCommitRecord(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	commitID string,
) (*workspaceOperationCommitRecord, bool, error) {
	const query = `SELECT request_hash, result_json
FROM workspace_operations
WHERE workspace_id = $1 AND operation_id = $2`
	var requestHash string
	var resultBytes []byte
	err := tx.QueryRowContext(ctx, query, workspaceID, commitID).Scan(&requestHash, &resultBytes)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	var mutation WorkspaceMutationResult
	if err := json.Unmarshal(resultBytes, &mutation); err != nil {
		return nil, false, err
	}
	return &workspaceOperationCommitRecord{
		Kind:        "workspace-operation-commit",
		Version:     1,
		CommitID:    commitID,
		RequestHash: requestHash,
		Mutation:    mutation,
	}, true, nil
}

func queryWorkspaceCommitDocumentsForUpdate(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
) ([]WorkspaceDocumentRecord, error) {
	const query = `SELECT workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, capabilities_json, updated_at
FROM workspace_documents
WHERE workspace_id = $1
ORDER BY id ASC
FOR UPDATE`
	rows, err := tx.QueryContext(ctx, query, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	documents := make([]WorkspaceDocumentRecord, 0)
	for rows.Next() {
		document, err := scanWorkspaceDocument(rows)
		if err != nil {
			return nil, err
		}
		documents = append(documents, *document)
	}
	return documents, rows.Err()
}

func validateWorkspaceCommitPreconditions(
	workspace *WorkspaceRecord,
	documents []WorkspaceDocumentRecord,
	commit *normalizedWorkspaceOperationCommit,
) error {
	documentsByID := make(map[string]WorkspaceDocumentRecord, len(documents))
	for _, document := range documents {
		documentsByID[document.ID] = document
	}
	expectedByID := make(map[string]WorkspaceCommitExpectedDocument, len(commit.Request.Expected.Documents))
	for _, expected := range commit.Request.Expected.Documents {
		expectedByID[expected.ID] = expected
	}
	documentIDs := make([]string, 0, len(commit.Requirements.Documents))
	for documentID := range commit.Requirements.Documents {
		documentIDs = append(documentIDs, documentID)
	}
	sort.Strings(documentIDs)
	for _, documentID := range documentIDs {
		requirement := commit.Requirements.Documents[documentID]
		expected := expectedByID[documentID]
		current, exists := documentsByID[documentID]
		if requirement.Absent {
			if exists {
				return newExistingDocumentAgainstAbsentConflictForCommit(
					workspace.ID,
					documentID,
					workspace.WorkspaceRev,
					workspace.RouteRev,
					workspace.OpSeq,
					WorkspaceConflictDocumentMetadata{
						ID:         current.ID,
						Type:       current.Type,
						Path:       current.Path,
						ContentRev: current.ContentRev,
						MetaRev:    current.MetaRev,
						UpdatedAt:  current.UpdatedAt.UTC(),
					},
				)
			}
			continue
		}
		if !exists {
			expectedContentRev := int64(0)
			if expected.ContentRev != nil {
				expectedContentRev = *expected.ContentRev
			}
			expectedMetaRev := int64(0)
			if expected.MetaRev != nil {
				expectedMetaRev = *expected.MetaRev
			}
			return newMissingDocumentRevisionConflictForCommit(
				workspace.ID,
				documentID,
				expectedContentRev,
				expectedMetaRev,
				workspace.WorkspaceRev,
				workspace.RouteRev,
				workspace.OpSeq,
			)
		}
		contentMismatch := requirement.Content && current.ContentRev != *expected.ContentRev
		metaMismatch := requirement.Meta && current.MetaRev != *expected.MetaRev
		if contentMismatch || metaMismatch {
			expectedContentRev := int64(0)
			if expected.ContentRev != nil {
				expectedContentRev = *expected.ContentRev
			}
			expectedMetaRev := int64(0)
			if expected.MetaRev != nil {
				expectedMetaRev = *expected.MetaRev
			}
			return newDocumentRevisionConflictForCommit(
				workspace.ID,
				documentID,
				expectedContentRev,
				expectedMetaRev,
				workspace.WorkspaceRev,
				workspace.RouteRev,
				workspace.OpSeq,
				WorkspaceConflictDocumentMetadata{
					ID:         current.ID,
					Type:       current.Type,
					Path:       current.Path,
					ContentRev: current.ContentRev,
					MetaRev:    current.MetaRev,
					UpdatedAt:  current.UpdatedAt.UTC(),
				},
			)
		}
	}
	if commit.Requirements.Route && workspace.RouteRev != *commit.Request.Expected.RouteRev {
		return newRouteRevisionConflict(
			workspace.ID,
			*commit.Request.Expected.WorkspaceRev,
			*commit.Request.Expected.RouteRev,
			workspace.WorkspaceRev,
			workspace.RouteRev,
			workspace.OpSeq,
		)
	}
	if commit.Requirements.Workspace && workspace.WorkspaceRev != *commit.Request.Expected.WorkspaceRev {
		return newWorkspaceRevisionConflict(
			workspace.ID,
			*commit.Request.Expected.WorkspaceRev,
			workspace.WorkspaceRev,
			workspace.RouteRev,
			workspace.OpSeq,
		)
	}
	return nil
}

type workspaceCommitChanges struct {
	TreeChanged        bool
	RouteChanged       bool
	WorkspaceChanged   bool
	RouteManifest      json.RawMessage
	UpdatedDocuments   []WorkspaceDocumentRevision
	RemovedDocumentIDs []string
	DocumentsToDelete  []string
	DocumentsToWrite   []WorkspaceDocumentRecord
	PathsToRelease     []string
}

func buildWorkspaceCommitChanges(
	workspaceID string,
	before map[string]WorkspaceDocumentRecord,
	after map[string]WorkspaceDocumentRecord,
	beforeTree json.RawMessage,
	afterTree json.RawMessage,
	beforeRoute json.RawMessage,
	afterRoute json.RawMessage,
	now time.Time,
) (*workspaceCommitChanges, error) {
	changes := &workspaceCommitChanges{
		TreeChanged:   !jsonBytesEqual(beforeTree, afterTree),
		RouteChanged:  !jsonBytesEqual(beforeRoute, afterRoute),
		RouteManifest: append(json.RawMessage(nil), afterRoute...),
	}
	if changes.RouteChanged {
		changes.WorkspaceChanged = true
	}
	documentIDs := make(map[string]struct{}, len(before)+len(after))
	for documentID := range before {
		documentIDs[documentID] = struct{}{}
	}
	for documentID := range after {
		documentIDs[documentID] = struct{}{}
	}
	orderedIDs := make([]string, 0, len(documentIDs))
	for documentID := range documentIDs {
		orderedIDs = append(orderedIDs, documentID)
	}
	sort.Strings(orderedIDs)
	for _, documentID := range orderedIDs {
		original, existed := before[documentID]
		final, exists := after[documentID]
		switch {
		case existed && !exists:
			changes.DocumentsToDelete = append(changes.DocumentsToDelete, documentID)
			changes.RemovedDocumentIDs = append(changes.RemovedDocumentIDs, documentID)
			changes.WorkspaceChanged = true
		case !existed && exists:
			if final.ContentRev != 1 || final.MetaRev != 1 {
				return nil, commitValidation("/operation", fmt.Sprintf("new document %s must start at contentRev=1 and metaRev=1", documentID))
			}
			final.WorkspaceID = workspaceID
			final.UpdatedAt = now
			changes.DocumentsToWrite = append(changes.DocumentsToWrite, final)
			changes.UpdatedDocuments = append(changes.UpdatedDocuments, toWorkspaceDocumentRevision(final))
			changes.WorkspaceChanged = true
		case existed && exists:
			if original.Type != final.Type {
				return nil, commitValidation("/operation", fmt.Sprintf("document %s type cannot change in place", documentID))
			}
			contentChanged := !jsonBytesEqual(original.Content, final.Content)
			metadataChanged := original.Name != final.Name ||
				normalizeComparablePath(original.Path) != normalizeComparablePath(final.Path) ||
				!stringSlicesEqual(original.Capabilities, final.Capabilities)
			if !contentChanged && !metadataChanged {
				continue
			}
			final.WorkspaceID = workspaceID
			final.ContentRev = original.ContentRev
			if contentChanged {
				final.ContentRev++
			}
			final.MetaRev = original.MetaRev
			if metadataChanged {
				final.MetaRev++
			}
			final.UpdatedAt = now
			changes.DocumentsToWrite = append(changes.DocumentsToWrite, final)
			changes.UpdatedDocuments = append(changes.UpdatedDocuments, toWorkspaceDocumentRevision(final))
			if metadataChanged {
				changes.WorkspaceChanged = true
			}
			if normalizeComparablePath(original.Path) != normalizeComparablePath(final.Path) {
				changes.PathsToRelease = append(changes.PathsToRelease, documentID)
			}
		}
	}
	if changes.TreeChanged {
		changes.WorkspaceChanged = true
	}
	return changes, nil
}

func stringSlicesEqual(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func persistWorkspaceCommitChanges(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	changes *workspaceCommitChanges,
) error {
	const deleteDocument = `DELETE FROM workspace_documents WHERE workspace_id = $1 AND id = $2`
	for _, documentID := range changes.DocumentsToDelete {
		if _, err := tx.ExecContext(ctx, deleteDocument, workspaceID, documentID); err != nil {
			return err
		}
	}
	const releasePath = `UPDATE workspace_documents
	SET path = $3
	WHERE workspace_id = $1 AND id = $2`
	for index, documentID := range changes.PathsToRelease {
		// A double slash cannot be a canonical VFS path, so a valid persisted
		// document can never collide with this transaction-local swap sentinel.
		temporaryPath := fmt.Sprintf("//.prodivix-commit/%d", index)
		if _, err := tx.ExecContext(ctx, releasePath, workspaceID, documentID, temporaryPath); err != nil {
			return err
		}
	}
	const upsertDocument = `INSERT INTO workspace_documents (
	workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, capabilities_json, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
ON CONFLICT (workspace_id, id) DO UPDATE
SET name = EXCLUDED.name,
    path = EXCLUDED.path,
    content_rev = EXCLUDED.content_rev,
    meta_rev = EXCLUDED.meta_rev,
    content_json = EXCLUDED.content_json,
    capabilities_json = EXCLUDED.capabilities_json,
    updated_at = EXCLUDED.updated_at`
	for _, document := range changes.DocumentsToWrite {
		if _, err := tx.ExecContext(
			ctx,
			upsertDocument,
			workspaceID,
			document.ID,
			string(document.Type),
			document.Name,
			document.Path,
			document.ContentRev,
			document.MetaRev,
			string(document.Content),
			mustMarshalWorkspaceCapabilities(document.Capabilities),
			document.UpdatedAt,
		); err != nil {
			return err
		}
	}
	if changes.RouteChanged {
		const upsertRoute = `INSERT INTO workspace_routes (workspace_id, manifest_json, updated_at)
VALUES ($1, $2::jsonb, NOW())
ON CONFLICT (workspace_id) DO UPDATE
SET manifest_json = EXCLUDED.manifest_json, updated_at = EXCLUDED.updated_at`
		if _, err := tx.ExecContext(ctx, upsertRoute, workspaceID, string(changes.RouteManifest)); err != nil {
			return err
		}
	}
	return nil
}
