package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	backendproject "github.com/Prodivix/prodivix/apps/backend/internal/modules/project"
)

type Module struct {
	store    *WorkspaceStore
	projects *backendproject.ProjectStore
}

type workspaceBootstrapDocument struct {
	ID               string
	Type             WorkspaceDocumentType
	Path             string
	Content          json.RawMessage
	RouteDocumentRef bool
}

func NewModule(store *WorkspaceStore, projects *backendproject.ProjectStore) *Module {
	return &Module{store: store, projects: projects}
}

func (module *Module) Store() *WorkspaceStore {
	if module == nil {
		return nil
	}
	return module.store
}

// CreateProjectWorkspace creates project metadata and its initial canonical Workspace in one database transaction.
func (module *Module) CreateProjectWorkspace(
	ctx context.Context,
	ownerID string,
	name string,
	description string,
	resourceType backendproject.ResourceType,
	initialPIR json.RawMessage,
) (*backendproject.Project, error) {
	if module == nil || module.store == nil || module.projects == nil {
		return nil, errors.New("project Workspace creation is not initialized")
	}
	project, err := module.projects.PrepareProject(backendproject.PrepareProjectParams{
		OwnerID:      ownerID,
		Name:         name,
		Description:  description,
		ResourceType: resourceType,
		IsPublic:     false,
	})
	if err != nil {
		return nil, err
	}
	bootstrap, err := createProjectWorkspaceBootstrap(project.ResourceType, initialPIR)
	if err != nil {
		return nil, err
	}
	_, err = module.importPreparedProjectWorkspace(
		ctx,
		project,
		bootstrap,
	)
	if err != nil {
		return nil, err
	}
	return project, nil
}

func createProjectWorkspaceBootstrap(
	resourceType backendproject.ResourceType,
	initialPIR json.RawMessage,
) (ImportWorkspaceSnapshotParams, error) {
	var document workspaceBootstrapDocument
	switch resourceType {
	case backendproject.ResourceTypeProject:
		document = workspaceBootstrapDocument{
			ID:               "doc_root",
			Type:             WorkspaceDocumentTypePIRPage,
			Path:             "/pir.json",
			Content:          initialPIR,
			RouteDocumentRef: true,
		}
	case backendproject.ResourceTypeComponent:
		content, err := ensureComponentPIRDocument(initialPIR)
		if err != nil {
			return ImportWorkspaceSnapshotParams{}, err
		}
		document = workspaceBootstrapDocument{
			ID:               "doc_component",
			Type:             WorkspaceDocumentTypePIRComponent,
			Path:             "/components/component.pir.json",
			Content:          content,
			RouteDocumentRef: true,
		}
	case backendproject.ResourceTypeNodeGraph:
		document = workspaceBootstrapDocument{
			ID:      "doc_graph",
			Type:    WorkspaceDocumentTypePIRGraph,
			Path:    "/graphs/main.graph.json",
			Content: defaultNodeGraphDocument,
		}
	default:
		return ImportWorkspaceSnapshotParams{}, backendproject.ErrInvalidResourceType
	}

	tree, err := defaultWorkspaceTreeWithDocumentJSON("root", document.ID, document.Path)
	if err != nil {
		return ImportWorkspaceSnapshotParams{}, err
	}
	routeManifest := defaultWorkspaceRouteManifest
	if document.RouteDocumentRef {
		routeManifest, err = json.Marshal(map[string]any{
			"version": "1",
			"root": map[string]any{
				"id":        "root",
				"pageDocId": document.ID,
			},
		})
		if err != nil {
			return ImportWorkspaceSnapshotParams{}, err
		}
	}

	return ImportWorkspaceSnapshotParams{
		Tree:          tree,
		RouteManifest: routeManifest,
		Documents: []WorkspaceImportDocumentRecord{
			{
				ID:      document.ID,
				Type:    document.Type,
				Path:    document.Path,
				Content: document.Content,
			},
		},
	}, nil
}

func ensureComponentPIRDocument(payload json.RawMessage) (json.RawMessage, error) {
	normalized, err := normalizeJSONDocument(payload, defaultPIRDocument)
	if err != nil {
		return nil, err
	}
	var document map[string]any
	if err := json.Unmarshal(normalized, &document); err != nil {
		return nil, err
	}
	if _, exists := document["componentContract"]; !exists {
		document["componentContract"] = map[string]any{
			"propsById":       map[string]any{},
			"eventsById":      map[string]any{},
			"slotsById":       map[string]any{},
			"variantAxesById": map[string]any{},
		}
	}
	return json.Marshal(document)
}

func (module *Module) importPreparedProjectWorkspace(
	ctx context.Context,
	project *backendproject.Project,
	params ImportWorkspaceSnapshotParams,
) (*WorkspaceSnapshot, error) {
	if module == nil || module.store == nil || module.projects == nil || project == nil {
		return nil, errors.New("project Workspace import is not initialized")
	}
	params.WorkspaceID = strings.TrimSpace(project.ID)
	params.ProjectID = strings.TrimSpace(project.ID)
	params.OwnerID = strings.TrimSpace(project.OwnerID)
	params.Name = strings.TrimSpace(project.Name)
	return module.store.importWorkspaceSnapshot(
		ctx,
		params,
		func(ctx context.Context, tx *sql.Tx) error {
			return module.projects.InsertPreparedProject(ctx, tx, project)
		},
	)
}

func (module *Module) GetSnapshotForUser(ctx context.Context, userID string, workspaceID string) (*WorkspaceSnapshot, error) {
	if module == nil || module.store == nil {
		return nil, errors.New("workspace module is not initialized")
	}
	return module.store.GetSnapshotForOwner(
		ctx,
		strings.TrimSpace(userID),
		strings.TrimSpace(workspaceID),
	)
}

func ResolveWorkspacePublicationPIR(snapshot *WorkspaceSnapshot) (json.RawMessage, bool) {
	if snapshot == nil || len(snapshot.Documents) == 0 {
		return nil, false
	}
	for _, document := range snapshot.Documents {
		if document.Type == WorkspaceDocumentTypePIRPage &&
			strings.TrimSpace(document.Path) == "/pir.json" {
			return document.Content, true
		}
	}
	for _, document := range snapshot.Documents {
		if document.Type == WorkspaceDocumentTypePIRPage {
			return document.Content, true
		}
	}
	return nil, false
}

func (module *Module) PublishProjectWorkspace(ctx context.Context, userID string, workspaceID string) (*backendproject.Project, error) {
	if module == nil || module.projects == nil {
		return nil, errors.New("workspace publication is not initialized")
	}
	normalizedUserID := strings.TrimSpace(userID)
	normalizedWorkspaceID := strings.TrimSpace(workspaceID)
	snapshot, err := module.GetSnapshotForUser(ctx, normalizedUserID, normalizedWorkspaceID)
	if err != nil {
		if errors.Is(err, ErrWorkspaceNotFound) {
			return nil, backendproject.ErrProjectNotFound
		}
		return nil, err
	}
	pir, ok := ResolveWorkspacePublicationPIR(snapshot)
	if !ok {
		return nil, errors.New("workspace publication requires a PIR page document")
	}
	projectID := strings.TrimSpace(snapshot.Workspace.ProjectID)
	if projectID == "" {
		return nil, errors.New("workspace publication requires a project id")
	}
	if projectID != normalizedWorkspaceID {
		return nil, errors.New("workspace publication project identity does not match")
	}
	return module.projects.PublishWorkspaceProjection(normalizedUserID, projectID, pir)
}
