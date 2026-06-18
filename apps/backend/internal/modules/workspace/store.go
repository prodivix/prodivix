package workspace

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
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
	WorkspaceDocumentTypePIRPage       WorkspaceDocumentType = "pir-page"
	WorkspaceDocumentTypePIRLayout     WorkspaceDocumentType = "pir-layout"
	WorkspaceDocumentTypePIRComponent  WorkspaceDocumentType = "pir-component"
	WorkspaceDocumentTypePIRGraph      WorkspaceDocumentType = "pir-graph"
	WorkspaceDocumentTypePIRAnimation  WorkspaceDocumentType = "pir-animation"
	WorkspaceDocumentTypeCode          WorkspaceDocumentType = "code"
	WorkspaceDocumentTypeAsset         WorkspaceDocumentType = "asset"
	WorkspaceDocumentTypeProjectConfig WorkspaceDocumentType = "project-config"
)

type WorkspaceStore struct {
	db *sql.DB
}

func NewWorkspaceStore(db *sql.DB) *WorkspaceStore {
	return &WorkspaceStore{db: db}
}

var defaultWorkspaceTree = defaultWorkspaceTreeJSON("root")
var defaultWorkspaceRouteManifest = json.RawMessage(`{"version":"1","root":{"id":"root"}}`)
var defaultWorkspaceSettings = json.RawMessage(`{}`)
var defaultPIRDocument = pircontract.DefaultDocument()
var defaultCodeDocument = json.RawMessage(`{"language":"ts","source":""}`)
var defaultGenericDocument = json.RawMessage(`{}`)

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

type WorkspaceImportDocumentRecord struct {
	ID         string                `json:"id"`
	Type       WorkspaceDocumentType `json:"type"`
	Path       string                `json:"path"`
	ContentRev int64                 `json:"contentRev"`
	MetaRev    int64                 `json:"metaRev"`
	Content    json.RawMessage       `json:"content"`
	UpdatedAt  time.Time             `json:"updatedAt"`
}

type WorkspaceSnapshot struct {
	Workspace     WorkspaceRecord           `json:"workspace"`
	RouteManifest json.RawMessage           `json:"routeManifest"`
	Settings      json.RawMessage           `json:"settings"`
	Documents     []WorkspaceDocumentRecord `json:"documents"`
}

func toWorkspaceDocumentRecords(
	workspaceID string,
	documents []WorkspaceImportDocumentRecord,
) []WorkspaceDocumentRecord {
	records := make([]WorkspaceDocumentRecord, 0, len(documents))
	for _, document := range documents {
		records = append(records, WorkspaceDocumentRecord{
			WorkspaceID: workspaceID,
			ID:          document.ID,
			Type:        document.Type,
			Name:        workspacePathName(document.Path),
			Path:        document.Path,
			ContentRev:  document.ContentRev,
			MetaRev:     document.MetaRev,
			Content:     document.Content,
			UpdatedAt:   document.UpdatedAt,
		})
	}
	return records
}

type WorkspaceDocumentRevision struct {
	ID         string                `json:"id"`
	Type       WorkspaceDocumentType `json:"type"`
	Path       string                `json:"path"`
	ContentRev int64                 `json:"contentRev"`
	MetaRev    int64                 `json:"metaRev"`
	Content    json.RawMessage       `json:"content"`
	UpdatedAt  time.Time             `json:"updatedAt"`
}

type WorkspaceMutationResult struct {
	WorkspaceID        string                      `json:"workspaceId"`
	WorkspaceRev       int64                       `json:"workspaceRev"`
	RouteRev           int64                       `json:"routeRev"`
	OpSeq              int64                       `json:"opSeq"`
	Tree               json.RawMessage             `json:"tree,omitempty"`
	UpdatedDocuments   []WorkspaceDocumentRevision `json:"updatedDocuments,omitempty"`
	RemovedDocumentIDs []string                    `json:"removedDocumentIds,omitempty"`
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

type ImportWorkspaceSnapshotParams struct {
	WorkspaceID   string
	ProjectID     string
	OwnerID       string
	Name          string
	WorkspaceRev  int64
	RouteRev      int64
	OpSeq         int64
	Tree          json.RawMessage
	RouteManifest json.RawMessage
	Settings      json.RawMessage
	Documents     []WorkspaceImportDocumentRecord
}

type CreateCodeDocumentMutationParams struct {
	WorkspaceID          string
	ExpectedWorkspaceRev int64
	DocumentID           string
	NodeID               string
	ParentNodeID         string
	Path                 string
	Content              json.RawMessage
	Command              WorkspaceCommandEnvelope
}

type CreateWorkspaceDocumentMutationParams struct {
	WorkspaceID          string
	ExpectedWorkspaceRev int64
	DocumentID           string
	NodeID               string
	ParentNodeID         string
	Path                 string
	Type                 WorkspaceDocumentType
	Content              json.RawMessage
	Command              WorkspaceCommandEnvelope
}

type RenameCodeDocumentMutationParams struct {
	WorkspaceID          string
	ExpectedWorkspaceRev int64
	DocumentID           string
	Path                 string
	Command              WorkspaceCommandEnvelope
}

type RenameWorkspaceDocumentMutationParams struct {
	WorkspaceID          string
	ExpectedWorkspaceRev int64
	DocumentID           string
	Path                 string
	Type                 WorkspaceDocumentType
	Command              WorkspaceCommandEnvelope
}

type DeleteCodeDocumentMutationParams struct {
	WorkspaceID          string
	ExpectedWorkspaceRev int64
	DocumentID           string
	Command              WorkspaceCommandEnvelope
}

type DeleteWorkspaceDocumentMutationParams struct {
	WorkspaceID          string
	ExpectedWorkspaceRev int64
	DocumentID           string
	Type                 WorkspaceDocumentType
	Command              WorkspaceCommandEnvelope
}

type CreateWorkspaceDirectoryMutationParams struct {
	WorkspaceID          string
	ExpectedWorkspaceRev int64
	NodeID               string
	ParentNodeID         string
	Name                 string
	Command              WorkspaceCommandEnvelope
}

type RenameWorkspaceDirectoryMutationParams struct {
	WorkspaceID          string
	ExpectedWorkspaceRev int64
	NodeID               string
	Name                 string
	Command              WorkspaceCommandEnvelope
}

type DeleteWorkspaceDirectoryMutationParams struct {
	WorkspaceID          string
	ExpectedWorkspaceRev int64
	NodeID               string
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
