package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"reflect"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/pircontract"
)

var ErrWorkspaceNotFound = errors.New("workspace not found")
var ErrWorkspaceDocumentNotFound = errors.New("workspace document not found")
var ErrInvalidWorkspaceDocumentType = errors.New("invalid workspace document type")
var ErrWorkspaceVFSInvalid = errors.New("invalid workspace vfs")

type WorkspaceConflictType string

const (
	WorkspaceConflictDocument  WorkspaceConflictType = "DOCUMENT_CONFLICT"
	WorkspaceConflictWorkspace WorkspaceConflictType = "WORKSPACE_CONFLICT"
	WorkspaceConflictRoute     WorkspaceConflictType = "ROUTE_CONFLICT"
)

type WorkspaceRevisionConflictError struct {
	ConflictType       WorkspaceConflictType
	WorkspaceID        string
	DocumentID         string
	ServerWorkspaceRev int64
	ServerRouteRev     int64
	ServerContentRev   int64
	ServerMetaRev      int64
	ServerOpSeq        int64
}

func (err *WorkspaceRevisionConflictError) Error() string {
	if err == nil {
		return "workspace revision conflict"
	}
	return fmt.Sprintf("workspace revision conflict: type=%s workspace=%s document=%s", err.ConflictType, err.WorkspaceID, err.DocumentID)
}

type WorkspaceDocumentType string

const (
	WorkspaceDocumentTypePIRPage      WorkspaceDocumentType = "pir-page"
	WorkspaceDocumentTypePIRLayout    WorkspaceDocumentType = "pir-layout"
	WorkspaceDocumentTypePIRComponent WorkspaceDocumentType = "pir-component"
	WorkspaceDocumentTypePIRGraph     WorkspaceDocumentType = "pir-graph"
	WorkspaceDocumentTypePIRAnimation WorkspaceDocumentType = "pir-animation"
	WorkspaceDocumentTypeCode         WorkspaceDocumentType = "code"
)

type WorkspaceStore struct {
	db *sql.DB
}

func NewWorkspaceStore(db *sql.DB) *WorkspaceStore {
	return &WorkspaceStore{db: db}
}

var defaultWorkspaceTree = json.RawMessage(`{"rootId":"root","nodes":[]}`)
var defaultWorkspaceRouteManifest = json.RawMessage(`{"version":"1","root":{"id":"root"}}`)
var defaultWorkspaceSettings = json.RawMessage(`{}`)
var defaultPIRDocument = pircontract.DefaultDocument()
var defaultCodeDocument = json.RawMessage(`{"language":"ts","source":""}`)

type WorkspaceRecord struct {
	ID           string          `json:"id"`
	ProjectID    string          `json:"projectId"`
	OwnerID      string          `json:"ownerId"`
	Name         string          `json:"name"`
	WorkspaceRev int64           `json:"workspaceRev"`
	RouteRev     int64           `json:"routeRev"`
	OpSeq        int64           `json:"opSeq"`
	TreeRootID   string          `json:"treeRootId"`
	Tree         json.RawMessage `json:"tree"`
	CreatedAt    time.Time       `json:"createdAt"`
	UpdatedAt    time.Time       `json:"updatedAt"`
}

type WorkspaceDocumentRecord struct {
	WorkspaceID string                `json:"workspaceId"`
	ID          string                `json:"id"`
	Type        WorkspaceDocumentType `json:"type"`
	Name        string                `json:"name"`
	Path        string                `json:"path"`
	ContentRev  int64                 `json:"contentRev"`
	MetaRev     int64                 `json:"metaRev"`
	Content     json.RawMessage       `json:"content"`
	UpdatedAt   time.Time             `json:"updatedAt"`
}

type WorkspaceSnapshot struct {
	Workspace     WorkspaceRecord           `json:"workspace"`
	RouteManifest json.RawMessage           `json:"routeManifest"`
	Settings      json.RawMessage           `json:"settings"`
	Documents     []WorkspaceDocumentRecord `json:"documents"`
}

type WorkspaceDocumentRevision struct {
	ID         string `json:"id"`
	ContentRev int64  `json:"contentRev"`
	MetaRev    int64  `json:"metaRev"`
}

type WorkspaceMutationResult struct {
	WorkspaceID      string                      `json:"workspaceId"`
	WorkspaceRev     int64                       `json:"workspaceRev"`
	RouteRev         int64                       `json:"routeRev"`
	OpSeq            int64                       `json:"opSeq"`
	UpdatedDocuments []WorkspaceDocumentRevision `json:"updatedDocuments,omitempty"`
}

type CreateWorkspaceParams struct {
	WorkspaceID   string
	ProjectID     string
	OwnerID       string
	Name          string
	TreeRootID    string
	Tree          json.RawMessage
	RouteManifest json.RawMessage
}

type CreateWorkspaceDocumentParams struct {
	WorkspaceID string
	DocumentID  string
	Type        WorkspaceDocumentType
	Name        string
	Path        string
	Content     json.RawMessage
}

type CreateCodeDocumentMutationParams struct {
	WorkspaceID          string
	ExpectedWorkspaceRev int64
	DocumentID           string
	NodeID               string
	Path                 string
	Content              json.RawMessage
	Command              WorkspaceCommandEnvelope
}

type WorkspacePatchOp struct {
	Op    string          `json:"op"`
	Path  string          `json:"path"`
	From  string          `json:"from,omitempty"`
	Value json.RawMessage `json:"value,omitempty"`
}

type WorkspaceCommandTarget struct {
	WorkspaceID string `json:"workspaceId"`
	DocumentID  string `json:"documentId,omitempty"`
}

type WorkspaceCommandEnvelope struct {
	ID         string                 `json:"id"`
	Namespace  string                 `json:"namespace"`
	Type       string                 `json:"type"`
	Version    string                 `json:"version"`
	IssuedAt   time.Time              `json:"issuedAt"`
	ForwardOps []WorkspacePatchOp     `json:"forwardOps"`
	ReverseOps []WorkspacePatchOp     `json:"reverseOps"`
	Target     WorkspaceCommandTarget `json:"target"`
	MergeKey   string                 `json:"mergeKey,omitempty"`
	Label      string                 `json:"label,omitempty"`
	DomainHint string                 `json:"domainHint,omitempty"`
}

type SaveDocumentContentParams struct {
	WorkspaceID        string
	DocumentID         string
	ExpectedContentRev int64
	Content            json.RawMessage
	Command            WorkspaceCommandEnvelope
}

type PatchDocumentContentParams struct {
	WorkspaceID        string
	DocumentID         string
	ExpectedContentRev int64
	Command            WorkspaceCommandEnvelope
}

type SaveRouteManifestParams struct {
	WorkspaceID          string
	ExpectedWorkspaceRev int64
	ExpectedRouteRev     int64
	RouteManifest        json.RawMessage
	Command              WorkspaceCommandEnvelope
}

type SaveWorkspaceSettingsParams struct {
	WorkspaceID          string
	ExpectedWorkspaceRev int64
	Settings             json.RawMessage
	Command              WorkspaceCommandEnvelope
}

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
	manifestJSON, err := normalizeJSONDocument(params.RouteManifest, defaultWorkspaceRouteManifest)
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

func (store *WorkspaceStore) GetSnapshot(ctx context.Context, workspaceID string) (*WorkspaceSnapshot, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("workspace store is not initialized")
	}
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" {
		return nil, ErrWorkspaceNotFound
	}

	ctx, cancel := withStoreTimeout(ctx)
	defer cancel()

	const workspaceQuery = `SELECT w.id, w.project_id, w.owner_id, w.name, w.workspace_rev, w.route_rev, w.op_seq, w.tree_root_id, w.tree_json, w.created_at, w.updated_at, r.manifest_json, s.settings_json
FROM workspaces w
LEFT JOIN workspace_routes r ON r.workspace_id = w.id
LEFT JOIN workspace_settings s ON s.workspace_id = w.id
WHERE w.id = $1`

	var workspace WorkspaceRecord
	var treeBytes []byte
	var routeBytes []byte
	var settingsBytes []byte
	err := store.db.QueryRowContext(ctx, workspaceQuery, workspaceID).Scan(
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
	workspace.Tree = treeBytes
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

	const documentQuery = `SELECT workspace_id, id, doc_type, name, path, content_rev, meta_rev, content_json, updated_at
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
		documents = append(documents, *document)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &WorkspaceSnapshot{
		Workspace:     workspace,
		RouteManifest: routeBytes,
		Settings:      settingsBytes,
		Documents:     documents,
	}, nil
}

func (store *WorkspaceStore) CreateCodeDocument(ctx context.Context, params CreateCodeDocumentMutationParams) (*WorkspaceMutationResult, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("workspace store is not initialized")
	}
	params.WorkspaceID = strings.TrimSpace(params.WorkspaceID)
	params.DocumentID = strings.TrimSpace(params.DocumentID)
	params.NodeID = strings.TrimSpace(params.NodeID)
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
	contentJSON, err := normalizeWorkspaceDocumentContent(WorkspaceDocumentTypeCode, params.Content)
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
) VALUES ($1, $2, $3, $4, $5, 1, 1, $6::jsonb, NOW())`
	if _, err := tx.ExecContext(
		ctx,
		insertDocument,
		params.WorkspaceID,
		params.DocumentID,
		string(WorkspaceDocumentTypeCode),
		documentName,
		documentPath,
		string(contentJSON),
	); err != nil {
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
		UpdatedDocuments: []WorkspaceDocumentRevision{
			{ID: params.DocumentID, ContentRev: 1, MetaRev: 1},
		},
	}, nil
}

func (store *WorkspaceStore) SaveDocumentContent(ctx context.Context, params SaveDocumentContentParams) (*WorkspaceMutationResult, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("workspace store is not initialized")
	}
	if strings.TrimSpace(params.WorkspaceID) == "" || strings.TrimSpace(params.DocumentID) == "" {
		return nil, errors.New("workspaceID and documentID are required")
	}
	if params.ExpectedContentRev <= 0 {
		return nil, errors.New("expectedContentRev must be positive")
	}

	contentJSON, err := normalizeJSONDocument(params.Content, defaultPIRDocument)
	if err != nil {
		return nil, err
	}
	command, err := normalizeWorkspaceCommand(params.Command)
	if err != nil {
		return nil, err
	}
	if err := validateWorkspaceCommand(command, params.WorkspaceID, &params.DocumentID); err != nil {
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

	const lockQuery = `SELECT d.content_rev, d.meta_rev, w.workspace_rev, w.route_rev, w.op_seq
FROM workspace_documents d
JOIN workspaces w ON w.id = d.workspace_id
WHERE d.workspace_id = $1 AND d.id = $2
FOR UPDATE OF d, w`

	var currentContentRev int64
	var currentMetaRev int64
	var currentWorkspaceRev int64
	var currentRouteRev int64
	var currentOpSeq int64

	err = tx.QueryRowContext(ctx, lockQuery, params.WorkspaceID, params.DocumentID).Scan(
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
		log.Printf(
			"[workspace] conflict save_document workspace=%s document=%s expectedContentRev=%d serverContentRev=%d serverMetaRev=%d serverWorkspaceRev=%d serverRouteRev=%d serverOpSeq=%d",
			params.WorkspaceID,
			params.DocumentID,
			params.ExpectedContentRev,
			currentContentRev,
			currentMetaRev,
			currentWorkspaceRev,
			currentRouteRev,
			currentOpSeq,
		)
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

	const updateDocument = `UPDATE workspace_documents
SET content_json = $3::jsonb, content_rev = content_rev + 1, updated_at = NOW()
WHERE workspace_id = $1 AND id = $2
RETURNING content_rev, meta_rev`

	var nextContentRev int64
	var nextMetaRev int64
	if err := tx.QueryRowContext(
		ctx,
		updateDocument,
		params.WorkspaceID,
		params.DocumentID,
		string(contentJSON),
	).Scan(&nextContentRev, &nextMetaRev); err != nil {
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
			{
				ID:         params.DocumentID,
				ContentRev: nextContentRev,
				MetaRev:    nextMetaRev,
			},
		},
	}, nil
}

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
RETURNING content_rev, meta_rev`

	var nextContentRev int64
	var nextMetaRev int64
	if err := tx.QueryRowContext(
		ctx,
		updateDocument,
		params.WorkspaceID,
		params.DocumentID,
		string(patchedContent),
	).Scan(&nextContentRev, &nextMetaRev); err != nil {
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
			{ID: params.DocumentID, ContentRev: nextContentRev, MetaRev: nextMetaRev},
		},
	}, nil
}

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

	manifestJSON, err := normalizeJSONDocument(params.RouteManifest, defaultWorkspaceRouteManifest)
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

func insertWorkspaceOperation(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	opSeq int64,
	domain string,
	documentID *string,
	payload json.RawMessage,
	issuedAt time.Time,
) error {
	const query = `INSERT INTO workspace_operations (workspace_id, op_seq, domain, document_id, payload_json, created_at)
VALUES ($1, $2, $3, $4, $5::jsonb, $6)`

	var docID any
	if documentID != nil {
		docID = *documentID
	}

	_, err := tx.ExecContext(ctx, query, workspaceID, opSeq, domain, docID, string(payload), issuedAt)
	return err
}

func normalizeWorkspaceCommand(command WorkspaceCommandEnvelope) (WorkspaceCommandEnvelope, error) {
	command.ID = strings.TrimSpace(command.ID)
	command.Namespace = strings.TrimSpace(command.Namespace)
	command.Type = strings.TrimSpace(command.Type)
	command.Version = strings.TrimSpace(command.Version)
	if !command.IssuedAt.IsZero() {
		command.IssuedAt = command.IssuedAt.UTC()
	}
	command.Target.WorkspaceID = strings.TrimSpace(command.Target.WorkspaceID)
	command.Target.DocumentID = strings.TrimSpace(command.Target.DocumentID)
	command.MergeKey = strings.TrimSpace(command.MergeKey)
	command.Label = strings.TrimSpace(command.Label)
	command.DomainHint = strings.TrimSpace(command.DomainHint)

	if command.ForwardOps == nil {
		command.ForwardOps = make([]WorkspacePatchOp, 0)
	}
	if command.ReverseOps == nil {
		command.ReverseOps = make([]WorkspacePatchOp, 0)
	}

	forwardOps, err := normalizeWorkspacePatchOps(command.ForwardOps)
	if err != nil {
		return WorkspaceCommandEnvelope{}, err
	}
	command.ForwardOps = forwardOps

	reverseOps, err := normalizeWorkspacePatchOps(command.ReverseOps)
	if err != nil {
		return WorkspaceCommandEnvelope{}, err
	}
	command.ReverseOps = reverseOps

	return command, nil
}

func normalizeWorkspacePatchOps(ops []WorkspacePatchOp) ([]WorkspacePatchOp, error) {
	normalized := make([]WorkspacePatchOp, 0, len(ops))
	for index, op := range ops {
		op.Op = strings.TrimSpace(strings.ToLower(op.Op))
		op.Path = strings.TrimSpace(op.Path)
		op.From = strings.TrimSpace(op.From)

		if op.Path == "" {
			return nil, fmt.Errorf("patch operation %d missing path", index)
		}
		if !isSupportedPatchOperation(op.Op) {
			return nil, fmt.Errorf("patch operation %d uses unsupported op %q", index, op.Op)
		}
		if (op.Op == "copy" || op.Op == "move") && op.From == "" {
			return nil, fmt.Errorf("patch operation %d missing from for %s", index, op.Op)
		}

		normalized = append(normalized, op)
	}
	return normalized, nil
}

func validateWorkspaceCommand(command WorkspaceCommandEnvelope, workspaceID string, documentID *string) error {
	if command.ID == "" {
		return errors.New("command.id is required")
	}
	if command.Namespace == "" {
		return errors.New("command.namespace is required")
	}
	if command.Type == "" {
		return errors.New("command.type is required")
	}
	if command.Version == "" {
		return errors.New("command.version is required")
	}
	if command.IssuedAt.IsZero() {
		return errors.New("command.issuedAt is required")
	}
	if command.Target.WorkspaceID == "" {
		return errors.New("command.target.workspaceId is required")
	}
	if command.Target.WorkspaceID != workspaceID {
		return errors.New("command.target.workspaceId does not match workspaceID")
	}

	if documentID == nil {
		return nil
	}

	expectedDocumentID := strings.TrimSpace(*documentID)
	if expectedDocumentID == "" {
		return errors.New("documentID is required")
	}
	if command.Target.DocumentID == "" {
		return errors.New("command.target.documentId is required for document mutations")
	}
	if command.Target.DocumentID != expectedDocumentID {
		return errors.New("command.target.documentId does not match documentID")
	}
	return nil
}

func isSupportedPatchOperation(operation string) bool {
	switch operation {
	case "add", "remove", "replace", "move", "copy", "test":
		return true
	default:
		return false
	}
}

func commandDomain(command WorkspaceCommandEnvelope) string {
	return fmt.Sprintf("%s.%s@%s", command.Namespace, command.Type, command.Version)
}

func (store *WorkspaceStore) resolveDocumentLookupError(ctx context.Context, workspaceID string) error {
	const query = `SELECT 1 FROM workspaces WHERE id = $1`
	var marker int
	err := store.db.QueryRowContext(ctx, query, workspaceID).Scan(&marker)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrWorkspaceNotFound
		}
		return err
	}
	return ErrWorkspaceDocumentNotFound
}

func scanWorkspaceDocument(scanner interface{ Scan(dest ...any) error }) (*WorkspaceDocumentRecord, error) {
	record := &WorkspaceDocumentRecord{}
	var docType string
	var contentBytes []byte
	if err := scanner.Scan(
		&record.WorkspaceID,
		&record.ID,
		&docType,
		&record.Name,
		&record.Path,
		&record.ContentRev,
		&record.MetaRev,
		&contentBytes,
		&record.UpdatedAt,
	); err != nil {
		return nil, err
	}
	record.Type = WorkspaceDocumentType(docType)
	record.Content = json.RawMessage(contentBytes)
	return record, nil
}

func normalizeJSONDocument(payload json.RawMessage, fallback json.RawMessage) (json.RawMessage, error) {
	if len(payload) == 0 || strings.TrimSpace(string(payload)) == "" {
		return fallback, nil
	}
	var decoded any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, err
	}
	normalized, err := json.Marshal(decoded)
	if err != nil {
		return nil, err
	}
	return normalized, nil
}

func normalizeWorkspaceDocumentContent(documentType WorkspaceDocumentType, payload json.RawMessage) (json.RawMessage, error) {
	fallback := defaultPIRDocument
	if documentType == WorkspaceDocumentTypeCode {
		fallback = defaultCodeDocument
	}
	normalized, err := normalizeJSONDocument(payload, fallback)
	if err != nil {
		return nil, err
	}
	if err := validateWorkspaceDocumentContent(documentType, normalized); err != nil {
		return nil, err
	}
	return normalized, nil
}

func validateWorkspaceDocumentContent(documentType WorkspaceDocumentType, payload json.RawMessage) error {
	if documentType == WorkspaceDocumentTypeCode {
		return validateWorkspaceCodeDocument(payload)
	}
	if isPIRWorkspaceDocumentType(documentType) {
		return validatePIRV13Document(payload)
	}
	return nil
}

func validateWorkspaceCodeDocument(payload json.RawMessage) error {
	var document map[string]any
	if err := json.Unmarshal(payload, &document); err != nil {
		return err
	}
	language, ok := document["language"].(string)
	if !ok || strings.TrimSpace(language) == "" {
		return errors.New("code document language is required")
	}
	source, ok := document["source"].(string)
	if !ok {
		return errors.New("code document source must be a string")
	}
	document["language"] = strings.TrimSpace(language)
	document["source"] = source
	if metadata, exists := document["metadata"]; exists {
		if _, ok := metadata.(map[string]any); !ok {
			return errors.New("code document metadata must be an object")
		}
	}
	return nil
}

func jsonBytesEqual(left json.RawMessage, right json.RawMessage) bool {
	var leftValue any
	var rightValue any
	if err := json.Unmarshal(left, &leftValue); err != nil {
		return false
	}
	if err := json.Unmarshal(right, &rightValue); err != nil {
		return false
	}
	return reflect.DeepEqual(leftValue, rightValue)
}

func withStoreTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	if ctx == nil {
		ctx = context.Background()
	}
	return context.WithTimeout(ctx, 5*time.Second)
}

func isValidWorkspaceDocumentType(documentType WorkspaceDocumentType) bool {
	switch documentType {
	case WorkspaceDocumentTypePIRPage, WorkspaceDocumentTypePIRLayout, WorkspaceDocumentTypePIRComponent, WorkspaceDocumentTypePIRGraph, WorkspaceDocumentTypePIRAnimation, WorkspaceDocumentTypeCode:
		return true
	default:
		return false
	}
}

func isPIRWorkspaceDocumentType(documentType WorkspaceDocumentType) bool {
	switch documentType {
	case WorkspaceDocumentTypePIRPage, WorkspaceDocumentTypePIRLayout, WorkspaceDocumentTypePIRComponent:
		return true
	default:
		return false
	}
}
