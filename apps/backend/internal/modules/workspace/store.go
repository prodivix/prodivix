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

// WorkspaceRevisionConflictError mirrors the canonical 409 details contract.
// Store branches must construct it through the partition-specific helpers below.
type WorkspaceRevisionConflictError struct {
	ConflictType WorkspaceConflictType
	WorkspaceID  string
	Expected     WorkspaceConflictExpectedRevisions
	Current      WorkspaceConflictCurrentRevisions
}

type WorkspaceConflictExpectedRevisions struct {
	WorkspaceRev int64
	RouteRev     int64
	Document     *WorkspaceConflictExpectedDocumentRevision
}

type WorkspaceConflictExpectedDocumentRevision struct {
	ID              string
	ContentRev      int64
	MetaRev         int64
	ContentRevKnown bool
	MetaRevKnown    bool
}

type WorkspaceConflictCurrentRevisions struct {
	WorkspaceRev  int64
	RouteRev      int64
	OpSeq         int64
	Document      *WorkspaceConflictDocumentMetadata
	DocumentKnown bool
}

// WorkspaceConflictDocumentMetadata is the minimum document state needed to
// rebase a stale mutation. Content is intentionally excluded; callers fetch an
// authorized workspace snapshot before attempting a semantic merge.
type WorkspaceConflictDocumentMetadata struct {
	ID         string
	Type       WorkspaceDocumentType
	Path       string
	ContentRev int64
	MetaRev    int64
	UpdatedAt  time.Time
}

func (err *WorkspaceRevisionConflictError) Error() string {
	if err == nil {
		return "workspace revision conflict"
	}
	documentID := ""
	if err.Expected.Document != nil {
		documentID = err.Expected.Document.ID
	}
	return fmt.Sprintf("workspace revision conflict: type=%s workspace=%s document=%s", err.ConflictType, err.WorkspaceID, documentID)
}

func newWorkspaceRevisionConflict(
	workspaceID string,
	expectedWorkspaceRev int64,
	currentWorkspaceRev int64,
	currentRouteRev int64,
	currentOpSeq int64,
) *WorkspaceRevisionConflictError {
	return &WorkspaceRevisionConflictError{
		ConflictType: WorkspaceConflictWorkspace,
		WorkspaceID:  workspaceID,
		Expected: WorkspaceConflictExpectedRevisions{
			WorkspaceRev: expectedWorkspaceRev,
		},
		Current: WorkspaceConflictCurrentRevisions{
			WorkspaceRev: currentWorkspaceRev,
			RouteRev:     currentRouteRev,
			OpSeq:        currentOpSeq,
		},
	}
}

func newWorkspaceRevisionConflictWithRoute(
	workspaceID string,
	expectedWorkspaceRev int64,
	expectedRouteRev int64,
	currentWorkspaceRev int64,
	currentRouteRev int64,
	currentOpSeq int64,
) *WorkspaceRevisionConflictError {
	conflict := newWorkspaceRevisionConflict(
		workspaceID,
		expectedWorkspaceRev,
		currentWorkspaceRev,
		currentRouteRev,
		currentOpSeq,
	)
	conflict.Expected.RouteRev = expectedRouteRev
	return conflict
}

func newRouteRevisionConflict(
	workspaceID string,
	expectedWorkspaceRev int64,
	expectedRouteRev int64,
	currentWorkspaceRev int64,
	currentRouteRev int64,
	currentOpSeq int64,
) *WorkspaceRevisionConflictError {
	return &WorkspaceRevisionConflictError{
		ConflictType: WorkspaceConflictRoute,
		WorkspaceID:  workspaceID,
		Expected: WorkspaceConflictExpectedRevisions{
			WorkspaceRev: expectedWorkspaceRev,
			RouteRev:     expectedRouteRev,
		},
		Current: WorkspaceConflictCurrentRevisions{
			WorkspaceRev: currentWorkspaceRev,
			RouteRev:     currentRouteRev,
			OpSeq:        currentOpSeq,
		},
	}
}

func newDocumentRevisionConflict(
	workspaceID string,
	documentID string,
	expectedContentRev int64,
	currentWorkspaceRev int64,
	currentRouteRev int64,
	currentOpSeq int64,
	currentDocument WorkspaceConflictDocumentMetadata,
) *WorkspaceRevisionConflictError {
	return &WorkspaceRevisionConflictError{
		ConflictType: WorkspaceConflictDocument,
		WorkspaceID:  workspaceID,
		Expected: WorkspaceConflictExpectedRevisions{
			Document: &WorkspaceConflictExpectedDocumentRevision{
				ID:              documentID,
				ContentRev:      expectedContentRev,
				ContentRevKnown: true,
			},
		},
		Current: WorkspaceConflictCurrentRevisions{
			WorkspaceRev:  currentWorkspaceRev,
			RouteRev:      currentRouteRev,
			OpSeq:         currentOpSeq,
			Document:      &currentDocument,
			DocumentKnown: true,
		},
	}
}

func newMissingDocumentRevisionConflictForCommit(
	workspaceID string,
	documentID string,
	expectedContentRev int64,
	expectedMetaRev int64,
	currentWorkspaceRev int64,
	currentRouteRev int64,
	currentOpSeq int64,
) *WorkspaceRevisionConflictError {
	return &WorkspaceRevisionConflictError{
		ConflictType: WorkspaceConflictDocument,
		WorkspaceID:  workspaceID,
		Expected: WorkspaceConflictExpectedRevisions{
			Document: &WorkspaceConflictExpectedDocumentRevision{
				ID:              documentID,
				ContentRev:      expectedContentRev,
				MetaRev:         expectedMetaRev,
				ContentRevKnown: expectedContentRev > 0,
				MetaRevKnown:    expectedMetaRev > 0,
			},
		},
		Current: WorkspaceConflictCurrentRevisions{
			WorkspaceRev:  currentWorkspaceRev,
			RouteRev:      currentRouteRev,
			OpSeq:         currentOpSeq,
			DocumentKnown: true,
		},
	}
}

func newDocumentRevisionConflictForCommit(
	workspaceID string,
	documentID string,
	expectedContentRev int64,
	expectedMetaRev int64,
	currentWorkspaceRev int64,
	currentRouteRev int64,
	currentOpSeq int64,
	currentDocument WorkspaceConflictDocumentMetadata,
) *WorkspaceRevisionConflictError {
	conflict := newDocumentRevisionConflict(
		workspaceID,
		documentID,
		expectedContentRev,
		currentWorkspaceRev,
		currentRouteRev,
		currentOpSeq,
		currentDocument,
	)
	conflict.Expected.Document.MetaRev = expectedMetaRev
	conflict.Expected.Document.MetaRevKnown = expectedMetaRev > 0
	conflict.Expected.Document.ContentRevKnown = expectedContentRev > 0
	return conflict
}

func newExistingDocumentAgainstAbsentConflictForCommit(
	workspaceID string,
	documentID string,
	currentWorkspaceRev int64,
	currentRouteRev int64,
	currentOpSeq int64,
	currentDocument WorkspaceConflictDocumentMetadata,
) *WorkspaceRevisionConflictError {
	return &WorkspaceRevisionConflictError{
		ConflictType: WorkspaceConflictDocument,
		WorkspaceID:  workspaceID,
		Expected: WorkspaceConflictExpectedRevisions{
			Document: &WorkspaceConflictExpectedDocumentRevision{
				ID:              documentID,
				ContentRevKnown: true,
				MetaRevKnown:    true,
			},
		},
		Current: WorkspaceConflictCurrentRevisions{
			WorkspaceRev:  currentWorkspaceRev,
			RouteRev:      currentRouteRev,
			OpSeq:         currentOpSeq,
			Document:      &currentDocument,
			DocumentKnown: true,
		},
	}
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
	WorkspaceID  string                `json:"workspaceId"`
	ID           string                `json:"id"`
	Type         WorkspaceDocumentType `json:"type"`
	Name         string                `json:"name"`
	Path         string                `json:"path"`
	ContentRev   int64                 `json:"contentRev"`
	MetaRev      int64                 `json:"metaRev"`
	Content      json.RawMessage       `json:"content"`
	Capabilities []string              `json:"capabilities,omitempty"`
	UpdatedAt    time.Time             `json:"updatedAt"`
}

type WorkspaceImportDocumentRecord struct {
	ID           string                `json:"id"`
	Type         WorkspaceDocumentType `json:"type"`
	Path         string                `json:"path"`
	ContentRev   int64                 `json:"contentRev"`
	MetaRev      int64                 `json:"metaRev"`
	Content      json.RawMessage       `json:"content"`
	Capabilities []string              `json:"capabilities,omitempty"`
	UpdatedAt    time.Time             `json:"updatedAt"`
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
			WorkspaceID:  workspaceID,
			ID:           document.ID,
			Type:         document.Type,
			Name:         workspacePathName(document.Path),
			Path:         document.Path,
			ContentRev:   document.ContentRev,
			MetaRev:      document.MetaRev,
			Content:      document.Content,
			Capabilities: append([]string(nil), document.Capabilities...),
			UpdatedAt:    document.UpdatedAt,
		})
	}
	return records
}

type WorkspaceDocumentRevision struct {
	ID           string                `json:"id"`
	Type         WorkspaceDocumentType `json:"type"`
	Name         string                `json:"name,omitempty"`
	Path         string                `json:"path"`
	ContentRev   int64                 `json:"contentRev"`
	MetaRev      int64                 `json:"metaRev"`
	Content      json.RawMessage       `json:"content"`
	Capabilities []string              `json:"capabilities,omitempty"`
	UpdatedAt    time.Time             `json:"updatedAt"`
}

type WorkspaceMutationResult struct {
	WorkspaceID        string                      `json:"workspaceId"`
	WorkspaceRev       int64                       `json:"workspaceRev"`
	RouteRev           int64                       `json:"routeRev"`
	OpSeq              int64                       `json:"opSeq"`
	Tree               json.RawMessage             `json:"tree,omitempty"`
	RouteManifest      json.RawMessage             `json:"routeManifest,omitempty"`
	Settings           json.RawMessage             `json:"settings,omitempty"`
	UpdatedDocuments   []WorkspaceDocumentRevision `json:"updatedDocuments,omitempty"`
	RemovedDocumentIDs []string                    `json:"removedDocumentIds,omitempty"`
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

type WorkspacePatchOp struct {
	Op    string          `json:"op"`
	Path  string          `json:"path"`
	From  string          `json:"from,omitempty"`
	Value json.RawMessage `json:"value,omitempty"`
}

type WorkspaceCommandTarget struct {
	WorkspaceID string `json:"workspaceId"`
	DocumentID  string `json:"documentId,omitempty"`
	RouteNodeID string `json:"routeNodeId,omitempty"`
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
