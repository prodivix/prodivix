package workspace

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"
	"time"

	backendproject "github.com/Prodivix/prodivix/apps/backend/internal/modules/project"
)

func createPublicationGateProject(t *testing.T, db *sql.DB) (*Module, *backendproject.Project, *backendproject.PublicationExpected) {
	t.Helper()
	const owner = "publication-owner"
	if _, err := db.Exec(`INSERT INTO users (id,email,name,password_hash,created_at) VALUES ($1,$2,$3,$4,$5)`, owner, owner+"@example.test", "Publication Gate", []byte("integration-only"), time.Now().UTC()); err != nil {
		t.Fatal(err)
	}
	module := NewModule(NewWorkspaceStore(db), backendproject.NewProjectStore(db))
	project, err := module.CreateProjectWorkspace(context.Background(), owner, "Publication Gate", "", backendproject.ResourceTypeProject, defaultPIRDocument)
	if err != nil {
		t.Fatal(err)
	}
	snapshot, err := module.GetSnapshotForUser(context.Background(), owner, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	expected := &backendproject.PublicationExpected{WorkspaceRev: snapshot.Workspace.WorkspaceRev, RouteRev: snapshot.Workspace.RouteRev, OpSeq: snapshot.Workspace.OpSeq, Documents: make([]backendproject.PublicationExpectedDocument, 0, len(snapshot.Documents))}
	for _, doc := range snapshot.Documents {
		expected.Documents = append(expected.Documents, backendproject.PublicationExpectedDocument{DocumentID: doc.ID, ContentRev: doc.ContentRev, MetaRev: doc.MetaRev})
	}
	return module, project, expected
}

func assertPublicationGatePrivate(t *testing.T, db *sql.DB, projectID string) {
	t.Helper()
	var public bool
	var absent bool
	if err := db.QueryRow(`SELECT is_public, published_pir_json IS NULL FROM projects WHERE id=$1`, projectID).Scan(&public, &absent); err != nil {
		t.Fatal(err)
	}
	if public || !absent {
		t.Fatalf("rejected publication changed public projection: public=%v absent=%v", public, absent)
	}
}

func TestExactPublicationPostgreSQLGate(t *testing.T) {
	t.Run("latest confirmed publication loads routes after waiting for authoring commit", func(t *testing.T) {
		db := openWorkspacePostgreSQLTestDatabase(t)
		module, project, _ := createPublicationGateProject(t, db)
		snapshot, err := module.GetSnapshotForUser(context.Background(), project.OwnerID, project.ID)
		if err != nil {
			t.Fatal(err)
		}
		tx, err := db.BeginTx(context.Background(), nil)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = tx.Rollback() }()
		if _, err := tx.Exec(`UPDATE workspaces SET tree_json=$2::jsonb,workspace_rev=workspace_rev+1,route_rev=route_rev+1,op_seq=op_seq+1 WHERE id=$1`, project.ID, strings.ReplaceAll(string(snapshot.Workspace.Tree), "doc_root", "doc_replaced")); err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(`UPDATE workspace_routes SET manifest_json=$2::jsonb WHERE workspace_id=$1`, project.ID, strings.ReplaceAll(string(snapshot.RouteManifest), "doc_root", "doc_replaced")); err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(`UPDATE workspace_documents SET id='doc_replaced',meta_rev=meta_rev+1 WHERE workspace_id=$1 AND id='doc_root'`, project.ID); err != nil {
			t.Fatal(err)
		}
		finished := make(chan error, 1)
		go func() {
			_, err := module.PublishProjectWorkspace(context.Background(), project.OwnerID, project.ID, nil)
			finished <- err
		}()
		waitForPublicationLock(t, db, finished)
		if err := tx.Commit(); err != nil {
			t.Fatal(err)
		}
		select {
		case err := <-finished:
			if err != nil {
				t.Fatalf("publication mixed route and document partitions: %v", err)
			}
		case <-time.After(5 * time.Second):
			t.Fatal("publication remained blocked")
		}
	})
	t.Run("publishes confirmed projection and denies another owner", func(t *testing.T) {
		db := openWorkspacePostgreSQLTestDatabase(t)
		module, project, expected := createPublicationGateProject(t, db)
		if _, err := module.PublishProjectWorkspace(context.Background(), "other-owner", project.ID, expected); !errors.Is(err, backendproject.ErrProjectNotFound) {
			t.Fatalf("wrong owner publication: %v", err)
		}
		assertPublicationGatePrivate(t, db, project.ID)
		published, err := module.PublishProjectWorkspace(context.Background(), project.OwnerID, project.ID, expected)
		if err != nil || !published.IsPublic {
			t.Fatalf("exact publication failed: project=%#v err=%v", published, err)
		}
		var exact bool
		if err := db.QueryRow(`SELECT p.published_pir_json = d.content_json FROM projects p JOIN workspace_documents d ON d.workspace_id=p.id AND d.id='doc_root' WHERE p.id=$1`, project.ID).Scan(&exact); err != nil {
			t.Fatal(err)
		}
		if !exact {
			t.Fatal("public projection must contain the exact confirmed PIR")
		}
	})
	t.Run("document partition drift fails even with unchanged workspace and route revisions", func(t *testing.T) {
		db := openWorkspacePostgreSQLTestDatabase(t)
		module, project, expected := createPublicationGateProject(t, db)
		if _, err := db.Exec(`UPDATE workspace_documents SET content_rev=content_rev+1 WHERE workspace_id=$1`, project.ID); err != nil {
			t.Fatal(err)
		}
		if _, err := module.PublishProjectWorkspace(context.Background(), project.OwnerID, project.ID, expected); !errors.Is(err, backendproject.ErrPublicationRevisionConflict) {
			t.Fatalf("content partition drift was published: %v", err)
		}
		assertPublicationGatePrivate(t, db, project.ID)
		if _, err := module.PublishProjectWorkspace(context.Background(), project.OwnerID, project.ID, nil); err != nil {
			t.Fatalf("explicit latest-confirmed publication failed: %v", err)
		}
	})
	t.Run("atomic authoring lock prevents compare projection race", func(t *testing.T) {
		db := openWorkspacePostgreSQLTestDatabase(t)
		module, project, expected := createPublicationGateProject(t, db)
		tx, err := db.BeginTx(context.Background(), nil)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = tx.Rollback() }()
		if _, err := tx.Exec(`SELECT 1 FROM workspaces WHERE id=$1 FOR UPDATE`, project.ID); err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(`UPDATE workspace_documents SET meta_rev=meta_rev+1 WHERE workspace_id=$1`, project.ID); err != nil {
			t.Fatal(err)
		}
		finished := make(chan error, 1)
		go func() {
			_, err := module.PublishProjectWorkspace(context.Background(), project.OwnerID, project.ID, expected)
			finished <- err
		}()
		waitForPublicationLock(t, db, finished)
		if err := tx.Commit(); err != nil {
			t.Fatal(err)
		}
		select {
		case err := <-finished:
			if !errors.Is(err, backendproject.ErrPublicationRevisionConflict) {
				t.Fatalf("concurrent revision must reject stale publication: %v", err)
			}
		case <-time.After(5 * time.Second):
			t.Fatal("publication remained blocked after authoring commit")
		}
		assertPublicationGatePrivate(t, db, project.ID)
	})
}

func waitForPublicationLock(t *testing.T, db *sql.DB, finished <-chan error) {
	t.Helper()
	deadline := time.After(5 * time.Second)
	for {
		var blocked bool
		if err := db.QueryRow(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%LEFT JOIN workspace_routes r%' AND pid <> pg_backend_pid())`).Scan(&blocked); err != nil {
			t.Fatal(err)
		}
		if blocked {
			return
		}
		select {
		case err := <-finished:
			t.Fatalf("publication did not wait for authoring lock: %v", err)
		case <-deadline:
			t.Fatal("publication lock was not observed")
		case <-time.After(10 * time.Millisecond):
		}
	}
}
