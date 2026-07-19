package remoteexecution

import (
	"errors"
	"regexp"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

func TestResolveWorkspaceExecutionPermissionsProjectsCanonicalRolesExactly(t *testing.T) {
	tests := []struct {
		name        string
		principalID string
		isOwner     bool
		role        any
		want        []string
	}{
		{
			name:        "owner",
			principalID: "owner-1",
			isOwner:     true,
			want:        []string{"workspace.owner", "workspace.read", "workspace.write"},
		},
		{
			name:        "viewer",
			principalID: "viewer-1",
			isOwner:     false,
			role:        workspaceExecutionViewerRole,
			want:        []string{"workspace.read"},
		},
		{
			name:        "editor",
			principalID: "editor-1",
			isOwner:     false,
			role:        workspaceExecutionEditorRole,
			want:        []string{"workspace.read", "workspace.write"},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			database, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()

			mock.ExpectQuery("SELECT w.owner_id = \\$2, r.role").
				WithArgs("workspace-1", test.principalID).
				WillReturnRows(sqlmock.NewRows([]string{"is_owner", "role"}).AddRow(test.isOwner, test.role))
			permissions, err := NewStore(database).ResolveWorkspaceExecutionPermissions(t.Context(), test.principalID, "workspace-1")
			if err != nil {
				t.Fatalf("resolve execution permissions: %v", err)
			}
			if len(permissions) != len(test.want) {
				t.Fatalf("unexpected permissions: %v", permissions)
			}
			for index := range test.want {
				if permissions[index] != test.want[index] {
					t.Fatalf("unexpected permissions: %v", permissions)
				}
			}
			permissions[0] = "mutated"
			if workspaceOwnerExecutionPermissions[0] != workspaceOwnerPermissionID || workspaceViewerExecutionPermissions[0] != workspaceReadPermissionID || workspaceEditorExecutionPermissions[0] != workspaceReadPermissionID {
				t.Fatal("resolved permissions aliased the canonical role projection")
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestWorkspaceExecutionEditorGrantByEmailAndListAreOwnerFenced(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	store := NewStore(database)

	mock.ExpectQuery(regexp.QuoteMeta("SELECT u.id")).
		WithArgs("workspace-1", "owner-1", "editor@example.test").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("editor-1"))
	mock.ExpectExec("INSERT INTO workspace_execution_role_grants").
		WithArgs("workspace-1", "owner-1", "editor-1", workspaceExecutionEditorRole).
		WillReturnResult(sqlmock.NewResult(0, 1))
	if err := store.GrantWorkspaceExecutionRoleByEmail(t.Context(), "owner-1", "workspace-1", " Editor@Example.Test ", workspaceExecutionEditorRole); err != nil {
		t.Fatalf("grant editor role: %v", err)
	}

	grantedAt := time.Unix(1_700_000_000, 0).UTC()
	mock.ExpectQuery("SELECT r.principal_id, u.email, u.name, r.role, r.granted_at").
		WithArgs("workspace-1", "owner-1").
		WillReturnRows(sqlmock.NewRows([]string{"principal_id", "email", "name", "role", "granted_at"}).AddRow("editor-1", "editor@example.test", "Editor", workspaceExecutionEditorRole, grantedAt))
	roles, err := store.ListWorkspaceExecutionRoles(t.Context(), "owner-1", "workspace-1")
	if err != nil || len(roles) != 1 || roles[0].PrincipalID != "editor-1" || roles[0].Role != workspaceExecutionEditorRole || !roles[0].GrantedAt.Equal(grantedAt) {
		t.Fatalf("list editor role: roles=%#v err=%v", roles, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestResolveWorkspaceExecutionPermissionsFailsClosedForMissingOrCorruptRole(t *testing.T) {
	tests := []struct {
		name    string
		rows    *sqlmock.Rows
		wantErr error
	}{
		{
			name:    "missing workspace or principal grant",
			rows:    sqlmock.NewRows([]string{"is_owner", "role"}),
			wantErr: ErrExecutionNotFound,
		},
		{
			name:    "unknown role",
			rows:    sqlmock.NewRows([]string{"is_owner", "role"}).AddRow(false, "admin"),
			wantErr: ErrExecutionAuthorityConflict,
		},
		{
			name:    "owner also has collaborator row",
			rows:    sqlmock.NewRows([]string{"is_owner", "role"}).AddRow(true, workspaceExecutionViewerRole),
			wantErr: ErrExecutionAuthorityConflict,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			database, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()
			mock.ExpectQuery("SELECT w.owner_id = \\$2, r.role").
				WithArgs("workspace-1", "principal-1").
				WillReturnRows(test.rows)
			permissions, err := NewStore(database).ResolveWorkspaceExecutionPermissions(t.Context(), "principal-1", "workspace-1")
			if permissions != nil || !errors.Is(err, test.wantErr) {
				t.Fatalf("expected %v, got permissions=%v err=%v", test.wantErr, permissions, err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestWorkspaceExecutionViewerGrantAndRevocationAreOwnerFenced(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	store := NewStore(database)

	mock.ExpectExec("INSERT INTO workspace_execution_role_grants").
		WithArgs("workspace-1", "owner-1", "viewer-1", workspaceExecutionViewerRole).
		WillReturnResult(sqlmock.NewResult(0, 1))
	if err := store.GrantWorkspaceExecutionViewer(t.Context(), "owner-1", "workspace-1", "viewer-1"); err != nil {
		t.Fatalf("grant viewer role: %v", err)
	}

	mock.ExpectExec("DELETE FROM workspace_execution_role_grants").
		WithArgs("workspace-1", "owner-1", "viewer-1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	if err := store.RevokeWorkspaceExecutionViewer(t.Context(), "owner-1", "workspace-1", "viewer-1"); err != nil {
		t.Fatalf("revoke viewer role: %v", err)
	}

	if err := store.GrantWorkspaceExecutionViewer(t.Context(), "owner-1", "workspace-1", "owner-1"); !errors.Is(err, ErrExecutionAuthorityConflict) {
		t.Fatalf("expected self grant to fail closed, got %v", err)
	}
	if err := store.RevokeWorkspaceExecutionViewer(t.Context(), "owner-1", "workspace-1", "owner-1"); !errors.Is(err, ErrExecutionAuthorityConflict) {
		t.Fatalf("expected self revoke to fail closed, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestWorkspaceExecutionViewerGrantRejectsUnownedOrMissingIdentity(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	store := NewStore(database)

	mock.ExpectExec("INSERT INTO workspace_execution_role_grants").
		WithArgs("workspace-1", "other-owner", "viewer-1", workspaceExecutionViewerRole).
		WillReturnResult(sqlmock.NewResult(0, 0))
	if err := store.GrantWorkspaceExecutionViewer(t.Context(), "other-owner", "workspace-1", "viewer-1"); !errors.Is(err, ErrExecutionNotFound) {
		t.Fatalf("expected unowned workspace grant to fail closed, got %v", err)
	}

	mock.ExpectExec("DELETE FROM workspace_execution_role_grants").
		WithArgs("workspace-1", "other-owner", "viewer-1").
		WillReturnResult(sqlmock.NewResult(0, 0))
	if err := store.RevokeWorkspaceExecutionViewer(t.Context(), "other-owner", "workspace-1", "viewer-1"); !errors.Is(err, ErrExecutionNotFound) {
		t.Fatalf("expected unowned workspace revoke to fail closed, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
