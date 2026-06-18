package workspace

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"strings"

	backendproject "github.com/Prodivix/prodivix/apps/backend/internal/modules/project"
	"github.com/jackc/pgx/v5/pgconn"
)

type Module struct {
	store          *WorkspaceStore
	projects       *backendproject.ProjectStore
	intentHandlers []IntentHandler
}

func NewModule(store *WorkspaceStore, projects *backendproject.ProjectStore) *Module {
	return &Module{
		store:          store,
		projects:       projects,
		intentHandlers: defaultIntentHandlers(),
	}
}

func (module *Module) Store() *WorkspaceStore {
	if module == nil {
		return nil
	}
	return module.store
}

func (module *Module) BootstrapProjectWorkspace(ctx context.Context, project *backendproject.Project) error {
	if module == nil || module.store == nil || project == nil {
		return errors.New("workspace bootstrap requires module and project")
	}
	workspaceID := strings.TrimSpace(project.ID)
	if workspaceID == "" {
		return errors.New("project id is required to bootstrap workspace")
	}
	if _, err := module.store.CreateWorkspace(ctx, CreateWorkspaceParams{
		WorkspaceID: workspaceID,
		ProjectID:   project.ID,
		OwnerID:     project.OwnerID,
		Name:        project.Name,
		TreeRootID:  "root",
		Tree:        defaultWorkspaceTreeWithRootDocumentJSON("root"),
	}); err != nil && !isUniqueViolation(err) {
		return err
	}
	if _, err := module.store.CreateDocument(ctx, CreateWorkspaceDocumentParams{
		WorkspaceID: workspaceID,
		DocumentID:  "doc_root",
		Type:        WorkspaceDocumentTypePIRPage,
		Name:        "Root",
		Path:        "/pir.json",
		Content:     project.PIR,
	}); err != nil && !isUniqueViolation(err) {
		return err
	}
	return nil
}

func (module *Module) GetSnapshotForUser(ctx context.Context, userID string, workspaceID string) (*WorkspaceSnapshot, error) {
	if module == nil || module.store == nil {
		return nil, errors.New("workspace module is not initialized")
	}
	normalizedWorkspaceID := strings.TrimSpace(workspaceID)
	snapshot, err := module.store.GetSnapshot(ctx, normalizedWorkspaceID)
	if err == nil {
		return snapshot, nil
	}
	if !errors.Is(err, ErrWorkspaceNotFound) {
		return nil, err
	}
	if module.projects == nil {
		return nil, err
	}
	project, projectErr := module.projects.GetByID(strings.TrimSpace(userID), normalizedWorkspaceID)
	if projectErr != nil {
		if errors.Is(projectErr, backendproject.ErrProjectNotFound) {
			return nil, ErrWorkspaceNotFound
		}
		return nil, projectErr
	}
	if bootstrapErr := module.BootstrapProjectWorkspace(ctx, project); bootstrapErr != nil {
		return nil, bootstrapErr
	}
	return module.store.GetSnapshot(ctx, normalizedWorkspaceID)
}

func ResolveCanonicalWorkspacePIR(snapshot *WorkspaceSnapshot) (json.RawMessage, bool) {
	if snapshot == nil || len(snapshot.Documents) == 0 {
		return nil, false
	}
	for _, document := range snapshot.Documents {
		if document.Type == WorkspaceDocumentTypePIRPage &&
			(strings.TrimSpace(document.Path) == "/" || strings.TrimSpace(document.Path) == "") {
			return document.Content, true
		}
	}
	for _, document := range snapshot.Documents {
		if document.Type == WorkspaceDocumentTypePIRPage {
			return document.Content, true
		}
	}
	return snapshot.Documents[0].Content, true
}

func (module *Module) SyncProjectMirrorFromWorkspace(ctx context.Context, userID string, workspaceID string) {
	if module == nil || module.projects == nil || module.store == nil {
		return
	}
	snapshot, err := module.GetSnapshotForUser(ctx, userID, workspaceID)
	if err != nil {
		log.Printf("[workspace] mirror sync skipped workspace=%s reason=%v", workspaceID, err)
		return
	}
	pir, ok := ResolveCanonicalWorkspacePIR(snapshot)
	if !ok {
		log.Printf("[workspace] mirror sync skipped workspace=%s reason=no_canonical_document", workspaceID)
		return
	}
	projectID := strings.TrimSpace(snapshot.Workspace.ProjectID)
	if projectID == "" {
		projectID = strings.TrimSpace(workspaceID)
	}
	if _, err := module.projects.SavePIR(strings.TrimSpace(userID), projectID, pir); err != nil {
		log.Printf("[workspace] mirror sync failed workspace=%s project=%s err=%v", workspaceID, projectID, err)
		return
	}
	log.Printf("[workspace] mirror sync success workspace=%s project=%s", workspaceID, projectID)
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}
