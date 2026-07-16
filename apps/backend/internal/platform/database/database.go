package database

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/config"
	_ "github.com/jackc/pgx/v5/stdlib"
)

func OpenDatabase(cfg config.Config) (*sql.DB, error) {
	db, err := sql.Open("pgx", cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	db.SetMaxOpenConns(cfg.DBMaxOpenConns)
	db.SetMaxIdleConns(cfg.DBMaxIdleConns)
	db.SetConnMaxLifetime(cfg.DBMaxLifetime)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	if err := RunMigrations(ctx, db); err != nil {
		_ = db.Close()
		return nil, err
	}

	return db, nil
}

func RunMigrations(ctx context.Context, db *sql.DB) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			email TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL DEFAULT '',
			description TEXT NOT NULL DEFAULT '',
			avatar_url TEXT NOT NULL DEFAULT '',
			password_hash BYTEA NOT NULL,
			created_at TIMESTAMPTZ NOT NULL
		)`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT ''`,
		`CREATE TABLE IF NOT EXISTS sessions (
			token TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			created_at TIMESTAMPTZ NOT NULL,
			expires_at TIMESTAMPTZ NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS projects (
			id TEXT PRIMARY KEY,
			owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			resource_type TEXT NOT NULL,
			name TEXT NOT NULL DEFAULT '',
			description TEXT NOT NULL DEFAULT '',
			published_pir_json JSONB,
			is_public BOOLEAN NOT NULL DEFAULT FALSE,
			stars_count INTEGER NOT NULL DEFAULT 0,
			created_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL,
			CONSTRAINT projects_resource_type_check CHECK (resource_type IN ('project', 'component', 'nodegraph'))
		)`,
		`ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE`,
		`ALTER TABLE projects ADD COLUMN IF NOT EXISTS stars_count INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE projects ADD COLUMN IF NOT EXISTS published_pir_json JSONB`,
		`ALTER TABLE projects DROP COLUMN IF EXISTS pir_json`,
		`CREATE TABLE IF NOT EXISTS workspaces (
			id TEXT PRIMARY KEY,
			project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
			owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			name TEXT NOT NULL DEFAULT '',
			workspace_rev BIGINT NOT NULL DEFAULT 1,
			route_rev BIGINT NOT NULL DEFAULT 1,
			op_seq BIGINT NOT NULL DEFAULT 1,
			tree_root_id TEXT NOT NULL DEFAULT 'root',
			tree_json JSONB NOT NULL DEFAULT '{"rootId":"root","nodes":[]}'::jsonb,
			created_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL,
			CONSTRAINT workspaces_workspace_rev_check CHECK (workspace_rev BETWEEN 1 AND 9007199254740991),
			CONSTRAINT workspaces_route_rev_check CHECK (route_rev BETWEEN 1 AND 9007199254740991),
			CONSTRAINT workspaces_op_seq_check CHECK (op_seq BETWEEN 1 AND 9007199254740991)
		)`,
		`ALTER TABLE workspaces
			DROP CONSTRAINT IF EXISTS workspaces_workspace_rev_check,
			ADD CONSTRAINT workspaces_workspace_rev_check CHECK (workspace_rev BETWEEN 1 AND 9007199254740991),
			DROP CONSTRAINT IF EXISTS workspaces_route_rev_check,
			ADD CONSTRAINT workspaces_route_rev_check CHECK (route_rev BETWEEN 1 AND 9007199254740991),
			DROP CONSTRAINT IF EXISTS workspaces_op_seq_check,
			ADD CONSTRAINT workspaces_op_seq_check CHECK (op_seq BETWEEN 1 AND 9007199254740991)`,
		`CREATE TABLE IF NOT EXISTS workspace_routes (
			workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
			manifest_json JSONB NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS workspace_settings (
			workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
			settings_json JSONB NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS workspace_documents (
			workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			id TEXT NOT NULL,
			doc_type TEXT NOT NULL,
			name TEXT NOT NULL DEFAULT '',
			path TEXT NOT NULL,
			content_rev BIGINT NOT NULL DEFAULT 1,
			meta_rev BIGINT NOT NULL DEFAULT 1,
			content_json JSONB NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (workspace_id, id),
			CONSTRAINT workspace_documents_type_check CHECK (doc_type IN ('pir-page', 'pir-layout', 'pir-component', 'pir-graph', 'pir-animation', 'design-tokens', 'design-token-resolver', 'code', 'data-source', 'asset', 'project-config')),
			CONSTRAINT workspace_documents_content_rev_check CHECK (content_rev BETWEEN 1 AND 9007199254740991),
			CONSTRAINT workspace_documents_meta_rev_check CHECK (meta_rev BETWEEN 1 AND 9007199254740991)
		)`,
		`ALTER TABLE workspace_documents
			DROP CONSTRAINT IF EXISTS workspace_documents_type_check,
			ADD CONSTRAINT workspace_documents_type_check CHECK (doc_type IN ('pir-page', 'pir-layout', 'pir-component', 'pir-graph', 'pir-animation', 'design-tokens', 'design-token-resolver', 'code', 'data-source', 'asset', 'project-config')),
			DROP CONSTRAINT IF EXISTS workspace_documents_content_rev_check,
			ADD CONSTRAINT workspace_documents_content_rev_check CHECK (content_rev BETWEEN 1 AND 9007199254740991),
			DROP CONSTRAINT IF EXISTS workspace_documents_meta_rev_check,
			ADD CONSTRAINT workspace_documents_meta_rev_check CHECK (meta_rev BETWEEN 1 AND 9007199254740991)`,
		`ALTER TABLE workspace_documents ADD COLUMN IF NOT EXISTS capabilities_json JSONB NOT NULL DEFAULT '[]'::jsonb`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_documents_workspace_path ON workspace_documents(workspace_id, path)`,
		`CREATE INDEX IF NOT EXISTS idx_workspace_documents_workspace_updated_at ON workspace_documents(workspace_id, updated_at DESC)`,
		`CREATE TABLE IF NOT EXISTS workspace_operations (
			workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			op_seq BIGINT NOT NULL,
			domain TEXT NOT NULL,
			document_id TEXT,
			payload_json JSONB NOT NULL,
			created_at TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (workspace_id, op_seq),
			CONSTRAINT workspace_operations_op_seq_check CHECK (op_seq BETWEEN 1 AND 9007199254740991)
		)`,
		`ALTER TABLE workspace_operations
			DROP CONSTRAINT IF EXISTS workspace_operations_op_seq_check,
			ADD CONSTRAINT workspace_operations_op_seq_check CHECK (op_seq BETWEEN 1 AND 9007199254740991)`,
		`CREATE INDEX IF NOT EXISTS idx_workspace_operations_workspace_created_at ON workspace_operations(workspace_id, created_at DESC)`,
		`ALTER TABLE workspace_operations ADD COLUMN IF NOT EXISTS operation_id TEXT`,
		`ALTER TABLE workspace_operations ADD COLUMN IF NOT EXISTS request_hash TEXT`,
		`ALTER TABLE workspace_operations ADD COLUMN IF NOT EXISTS result_json JSONB`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_operations_workspace_operation_id ON workspace_operations(workspace_id, operation_id) WHERE operation_id IS NOT NULL`,
		`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`,
		`CREATE INDEX IF NOT EXISTS idx_projects_owner_updated_at ON projects(owner_id, updated_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_projects_public_updated_at ON projects(updated_at DESC) WHERE is_public = TRUE`,
		`CREATE INDEX IF NOT EXISTS idx_projects_public_stars ON projects(stars_count DESC, updated_at DESC) WHERE is_public = TRUE`,
		`CREATE INDEX IF NOT EXISTS idx_projects_resource_type ON projects(resource_type)`,
		`CREATE INDEX IF NOT EXISTS idx_workspaces_owner_updated_at ON workspaces(owner_id, updated_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_workspaces_project_id ON workspaces(project_id)`,
		`CREATE TABLE IF NOT EXISTS remote_execution_grants (
			execution_id TEXT PRIMARY KEY,
			workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_remote_execution_grants_owner ON remote_execution_grants(owner_id, created_at DESC)`,
		`CREATE TABLE IF NOT EXISTS github_installations (
			installation_id BIGINT PRIMARY KEY,
			account_login TEXT NOT NULL DEFAULT '',
			account_type TEXT NOT NULL DEFAULT '',
			account_id BIGINT NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'active',
			raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
			created_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS github_installation_repositories (
			installation_id BIGINT NOT NULL REFERENCES github_installations(installation_id) ON DELETE CASCADE,
			repository_id BIGINT NOT NULL,
			owner TEXT NOT NULL,
			name TEXT NOT NULL,
			full_name TEXT NOT NULL,
			private BOOLEAN NOT NULL DEFAULT FALSE,
			default_branch TEXT NOT NULL DEFAULT 'main',
			updated_at TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (installation_id, repository_id)
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_github_installation_repositories_full_name ON github_installation_repositories(installation_id, full_name)`,
		`CREATE TABLE IF NOT EXISTS github_repository_bindings (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
			workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			provider TEXT NOT NULL DEFAULT 'github',
			installation_id BIGINT NOT NULL REFERENCES github_installations(installation_id) ON DELETE CASCADE,
			owner TEXT NOT NULL,
			repo TEXT NOT NULL,
			default_branch TEXT NOT NULL DEFAULT 'main',
			status TEXT NOT NULL DEFAULT 'active',
			branch TEXT NOT NULL DEFAULT '',
			pir_dirty BOOLEAN NOT NULL DEFAULT FALSE,
			pir_last_synced_rev BIGINT,
			pir_last_synced_at TIMESTAMPTZ,
			pir_last_commit_sha TEXT NOT NULL DEFAULT '',
			pir_last_error_code TEXT NOT NULL DEFAULT '',
			artifacts_dirty BOOLEAN NOT NULL DEFAULT FALSE,
			artifacts_last_synced_rev BIGINT,
			artifacts_last_synced_at TIMESTAMPTZ,
			artifacts_last_commit_sha TEXT NOT NULL DEFAULT '',
			artifacts_last_error_code TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL,
			CONSTRAINT github_repository_bindings_provider_check CHECK (provider = 'github'),
			CONSTRAINT github_repository_bindings_status_check CHECK (status IN ('active', 'disabled', 'revoked', 'error'))
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_github_repository_bindings_project ON github_repository_bindings(project_id) WHERE status = 'active'`,
		`CREATE INDEX IF NOT EXISTS idx_github_repository_bindings_user ON github_repository_bindings(user_id, updated_at DESC)`,
		`CREATE TABLE IF NOT EXISTS github_events (
			delivery_id TEXT PRIMARY KEY,
			event_type TEXT NOT NULL,
			installation_id BIGINT,
			action TEXT NOT NULL DEFAULT '',
			payload_json JSONB NOT NULL,
			processed BOOLEAN NOT NULL DEFAULT FALSE,
			created_at TIMESTAMPTZ NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_github_events_created_at ON github_events(created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_github_events_installation ON github_events(installation_id, created_at DESC)`,
		`DELETE FROM sessions WHERE expires_at <= NOW()`,
	}

	for _, statement := range statements {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("run migration: %w", err)
		}
	}

	return nil
}
