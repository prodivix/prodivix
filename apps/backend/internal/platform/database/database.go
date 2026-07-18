package database

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/config"
	_ "github.com/jackc/pgx/v5/stdlib"
)

type migration struct {
	version    int64
	name       string
	statements []string
}

func OpenDatabase(cfg config.Config) (*sql.DB, error) {
	db, err := sql.Open("pgx", cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	db.SetMaxOpenConns(cfg.DBMaxOpenConns)
	db.SetMaxIdleConns(cfg.DBMaxIdleConns)
	db.SetConnMaxLifetime(cfg.DBMaxLifetime)

	pingCtx, cancelPing := context.WithTimeout(context.Background(), 5*time.Second)
	if err := db.PingContext(pingCtx); err != nil {
		cancelPing()
		_ = db.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	cancelPing()

	migrationCtx, cancelMigration := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancelMigration()
	if err := RunMigrations(migrationCtx, db); err != nil {
		_ = db.Close()
		return nil, err
	}

	return db, nil
}

func RunMigrations(ctx context.Context, db *sql.DB) error {
	if db == nil {
		return fmt.Errorf("run migrations: database is required")
	}
	migrations := []migration{{
		version: 1,
		name:    "baseline",
		statements: []string{
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
			id TEXT,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			created_at TIMESTAMPTZ NOT NULL,
			expires_at TIMESTAMPTZ NOT NULL
		)`,
			`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS id TEXT`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_id ON sessions(id) WHERE id IS NOT NULL`,
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
			session_id TEXT,
			environment_id TEXT,
			environment_revision TEXT,
			environment_mode TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
			`ALTER TABLE remote_execution_grants ADD COLUMN IF NOT EXISTS session_id TEXT`,
			`ALTER TABLE remote_execution_grants ADD COLUMN IF NOT EXISTS snapshot_id TEXT NOT NULL DEFAULT ''`,
			`ALTER TABLE remote_execution_grants ADD COLUMN IF NOT EXISTS partition_revisions_json JSONB NOT NULL DEFAULT '{}'::jsonb`,
			`ALTER TABLE remote_execution_grants ADD COLUMN IF NOT EXISTS environment_id TEXT`,
			`ALTER TABLE remote_execution_grants ADD COLUMN IF NOT EXISTS environment_revision TEXT`,
			`ALTER TABLE remote_execution_grants ADD COLUMN IF NOT EXISTS environment_mode TEXT`,
			`CREATE INDEX IF NOT EXISTS idx_remote_execution_grants_owner ON remote_execution_grants(owner_id, created_at DESC)`,
			`CREATE TABLE IF NOT EXISTS execution_environments (
			id TEXT PRIMARY KEY,
			workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			mode TEXT NOT NULL,
			current_revision TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL,
			CONSTRAINT execution_environments_mode_check CHECK (mode IN ('mock', 'live'))
		)`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_environments_workspace_id ON execution_environments(workspace_id, id)`,
			`CREATE TABLE IF NOT EXISTS execution_environment_revisions (
			environment_id TEXT NOT NULL REFERENCES execution_environments(id) ON DELETE CASCADE,
			revision TEXT NOT NULL,
			public_bindings_json JSONB NOT NULL,
			secret_binding_ids_json JSONB NOT NULL,
			created_by_session_id TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (environment_id, revision)
		)`,
			`CREATE TABLE IF NOT EXISTS execution_environment_secret_materials (
			environment_id TEXT NOT NULL,
			revision TEXT NOT NULL,
			binding_id TEXT NOT NULL,
			algorithm TEXT,
			key_provider TEXT,
			key_id TEXT,
			wrapped_key_nonce BYTEA,
			wrapped_key BYTEA,
			nonce BYTEA NOT NULL,
			ciphertext BYTEA NOT NULL,
			PRIMARY KEY (environment_id, revision, binding_id),
			FOREIGN KEY (environment_id, revision) REFERENCES execution_environment_revisions(environment_id, revision) ON DELETE CASCADE,
			CONSTRAINT execution_environment_secret_materials_envelope_check CHECK (
				(algorithm IS NULL AND key_provider IS NULL AND key_id IS NULL AND wrapped_key_nonce IS NULL AND wrapped_key IS NULL)
				OR
				(algorithm = 'AES-256-GCM+KMS-DATA-KEY/v1' AND key_provider ~ '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$' AND key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$' AND octet_length(wrapped_key_nonce) BETWEEN 12 AND 32 AND octet_length(wrapped_key) BETWEEN 33 AND 4096)
			)
		)`,
			`CREATE TABLE IF NOT EXISTS execution_environment_grants (
			grant_id TEXT PRIMARY KEY,
			environment_id TEXT NOT NULL,
			revision TEXT NOT NULL,
			workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			principal_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			session_id TEXT NOT NULL,
			provider_id TEXT NOT NULL,
			purpose_kind TEXT NOT NULL,
			resource_id TEXT NOT NULL,
			secret_bindings_json JSONB NOT NULL,
			expires_at TIMESTAMPTZ NOT NULL,
			revoked_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL,
			FOREIGN KEY (environment_id, revision) REFERENCES execution_environment_revisions(environment_id, revision) ON DELETE CASCADE
		)`,
			`CREATE INDEX IF NOT EXISTS idx_execution_environment_grants_expiry ON execution_environment_grants(expires_at) WHERE revoked_at IS NULL`,
			`CREATE TABLE IF NOT EXISTS execution_environment_resolution_audit (
			id BIGSERIAL PRIMARY KEY,
			kind TEXT NOT NULL,
			grant_id TEXT NOT NULL,
			environment_id TEXT NOT NULL,
			revision TEXT NOT NULL,
			workspace_id TEXT NOT NULL,
			principal_id TEXT NOT NULL,
			session_id TEXT NOT NULL,
			provider_id TEXT NOT NULL,
			purpose_kind TEXT NOT NULL,
			resource_id TEXT NOT NULL,
			binding_id TEXT,
			field TEXT,
			occurred_at TIMESTAMPTZ NOT NULL
		)`,
			`CREATE INDEX IF NOT EXISTS idx_execution_environment_audit_grant ON execution_environment_resolution_audit(grant_id, occurred_at)`,
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
		},
	}, {
		version: 2,
		name:    "remote-data-mutation-replay-ledger",
		statements: []string{
			`CREATE TABLE IF NOT EXISTS remote_data_mutation_replays (
			execution_id TEXT NOT NULL REFERENCES remote_execution_grants(execution_id) ON DELETE CASCADE,
			document_id TEXT NOT NULL,
			operation_id TEXT NOT NULL,
			invocation_id TEXT NOT NULL,
			request_hash TEXT NOT NULL,
			status TEXT NOT NULL,
			result_json JSONB,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (execution_id, document_id, operation_id, invocation_id),
			CONSTRAINT remote_data_mutation_replays_request_hash_check CHECK (request_hash ~ '^[a-f0-9]{64}$'),
			CONSTRAINT remote_data_mutation_replays_status_check CHECK (status IN ('pending', 'succeeded', 'indeterminate')),
			CONSTRAINT remote_data_mutation_replays_result_check CHECK ((status = 'succeeded' AND result_json IS NOT NULL) OR (status IN ('pending', 'indeterminate') AND result_json IS NULL))
		)`,
			`CREATE INDEX IF NOT EXISTS idx_remote_data_mutation_replays_created_at ON remote_data_mutation_replays(created_at DESC)`,
		},
	}, {
		version: 3,
		name:    "remote-data-upstream-idempotency",
		statements: []string{
			`ALTER TABLE remote_data_mutation_replays ADD COLUMN IF NOT EXISTS attempt BIGINT NOT NULL DEFAULT 1`,
			`ALTER TABLE remote_data_mutation_replays ADD COLUMN IF NOT EXISTS maximum_attempts BIGINT NOT NULL DEFAULT 1`,
			`ALTER TABLE remote_data_mutation_replays DROP CONSTRAINT IF EXISTS remote_data_mutation_replays_status_check`,
			`ALTER TABLE remote_data_mutation_replays DROP CONSTRAINT IF EXISTS remote_data_mutation_replays_result_check`,
			`ALTER TABLE remote_data_mutation_replays ADD CONSTRAINT remote_data_mutation_replays_status_check CHECK (status IN ('pending', 'retryable', 'succeeded', 'indeterminate'))`,
			`ALTER TABLE remote_data_mutation_replays ADD CONSTRAINT remote_data_mutation_replays_attempt_check CHECK (attempt >= 1 AND maximum_attempts >= 1 AND maximum_attempts <= 10 AND attempt <= maximum_attempts)`,
			`ALTER TABLE remote_data_mutation_replays ADD CONSTRAINT remote_data_mutation_replays_result_check CHECK ((status = 'succeeded' AND result_json IS NOT NULL) OR (status IN ('pending', 'retryable', 'indeterminate') AND result_json IS NULL))`,
			`ALTER TABLE remote_data_mutation_replays ADD CONSTRAINT remote_data_mutation_replays_retryable_check CHECK (status <> 'retryable' OR attempt < maximum_attempts)`,
		},
	}, {
		version: 4,
		name:    "workspace-binary-asset-blobs",
		statements: []string{
			`CREATE TABLE IF NOT EXISTS workspace_asset_blobs (
			workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			digest TEXT NOT NULL,
			media_type TEXT NOT NULL,
			byte_length BIGINT NOT NULL,
			contents BYTEA NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (workspace_id, digest),
			CONSTRAINT workspace_asset_blobs_digest_check CHECK (digest ~ '^sha256-[a-f0-9]{64}$'),
			CONSTRAINT workspace_asset_blobs_media_type_check CHECK (char_length(media_type) BETWEEN 3 AND 127 AND media_type = lower(media_type) AND media_type ~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$'),
			CONSTRAINT workspace_asset_blobs_byte_length_check CHECK (byte_length BETWEEN 0 AND 33554432),
			CONSTRAINT workspace_asset_blobs_contents_check CHECK (octet_length(contents) = byte_length)
		)`,
			`CREATE INDEX IF NOT EXISTS idx_workspace_asset_blobs_created_at ON workspace_asset_blobs(workspace_id, created_at)`,
		},
	}, {
		version: 5,
		name:    "workspace-asset-blob-retention",
		statements: []string{
			`ALTER TABLE workspace_asset_blobs ADD COLUMN IF NOT EXISTS unreferenced_since TIMESTAMPTZ`,
			`UPDATE workspace_asset_blobs SET unreferenced_since = created_at WHERE unreferenced_since IS NULL`,
			`ALTER TABLE workspace_asset_blobs ALTER COLUMN unreferenced_since SET DEFAULT NOW()`,
			`CREATE INDEX IF NOT EXISTS idx_workspace_asset_blobs_unreferenced_since ON workspace_asset_blobs(unreferenced_since, workspace_id) WHERE unreferenced_since IS NOT NULL`,
		},
	}, {
		version: 6,
		name:    "remote-server-function-live-mutation",
		statements: []string{
			`CREATE TABLE IF NOT EXISTS remote_server_function_execution_state (
			execution_id TEXT NOT NULL REFERENCES remote_execution_grants(execution_id) ON DELETE CASCADE,
			artifact_id TEXT NOT NULL,
			export_name TEXT NOT NULL,
			state_key TEXT NOT NULL,
			value_json JSONB NOT NULL,
			revision BIGINT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (execution_id, artifact_id, export_name, state_key),
			CONSTRAINT remote_server_function_execution_state_artifact_check CHECK (artifact_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$'),
			CONSTRAINT remote_server_function_execution_state_export_check CHECK (export_name ~ '^[A-Za-z_$][A-Za-z0-9_$]{0,255}$'),
			CONSTRAINT remote_server_function_execution_state_key_check CHECK (state_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
			CONSTRAINT remote_server_function_execution_state_value_check CHECK (octet_length(value_json::text) <= 1048576),
			CONSTRAINT remote_server_function_execution_state_revision_check CHECK (revision >= 1)
		)`,
			`CREATE TABLE IF NOT EXISTS remote_server_function_mutation_replays (
			execution_id TEXT NOT NULL REFERENCES remote_execution_grants(execution_id) ON DELETE CASCADE,
			artifact_id TEXT NOT NULL,
			export_name TEXT NOT NULL,
			invocation_id TEXT NOT NULL,
			request_hash TEXT NOT NULL,
			result_json JSONB NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (execution_id, artifact_id, export_name, invocation_id),
			CONSTRAINT remote_server_function_mutation_replays_artifact_check CHECK (artifact_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$'),
			CONSTRAINT remote_server_function_mutation_replays_export_check CHECK (export_name ~ '^[A-Za-z_$][A-Za-z0-9_$]{0,255}$'),
			CONSTRAINT remote_server_function_mutation_replays_invocation_check CHECK (char_length(invocation_id) BETWEEN 1 AND 512 AND invocation_id = btrim(invocation_id)),
			CONSTRAINT remote_server_function_mutation_replays_hash_check CHECK (request_hash ~ '^[a-f0-9]{64}$'),
			CONSTRAINT remote_server_function_mutation_replays_result_check CHECK (octet_length(result_json::text) <= 1049600)
		)`,
			`CREATE INDEX IF NOT EXISTS idx_remote_server_function_mutation_replays_created_at ON remote_server_function_mutation_replays(execution_id, created_at DESC)`,
		},
	}, {
		version: 7,
		name:    "isolated-server-function-secret-resolution",
		statements: []string{
			`CREATE TABLE IF NOT EXISTS remote_isolated_secret_resolutions (
			execution_id TEXT PRIMARY KEY REFERENCES remote_execution_grants(execution_id) ON DELETE CASCADE,
			worker_id TEXT NOT NULL,
			worker_attempt BIGINT NOT NULL,
			artifact_id TEXT NOT NULL,
			export_name TEXT NOT NULL,
			invocation_id TEXT NOT NULL,
			recipient_public_key TEXT NOT NULL,
			envelope_json JSONB,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			completed_at TIMESTAMPTZ,
			CONSTRAINT remote_isolated_secret_resolutions_worker_check CHECK (worker_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$'),
			CONSTRAINT remote_isolated_secret_resolutions_attempt_check CHECK (worker_attempt BETWEEN 1 AND 9007199254740991),
			CONSTRAINT remote_isolated_secret_resolutions_artifact_check CHECK (artifact_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$'),
			CONSTRAINT remote_isolated_secret_resolutions_export_check CHECK (export_name ~ '^[A-Za-z_$][A-Za-z0-9_$]{0,255}$'),
			CONSTRAINT remote_isolated_secret_resolutions_invocation_check CHECK (char_length(invocation_id) BETWEEN 1 AND 512 AND invocation_id = btrim(invocation_id)),
			CONSTRAINT remote_isolated_secret_resolutions_recipient_check CHECK (recipient_public_key ~ '^[A-Za-z0-9_-]{43}$'),
			CONSTRAINT remote_isolated_secret_resolutions_envelope_check CHECK (envelope_json IS NULL OR octet_length(envelope_json::text) <= 786432),
			CONSTRAINT remote_isolated_secret_resolutions_completion_check CHECK ((envelope_json IS NULL) = (completed_at IS NULL))
		)`,
		},
	}, {
		version: 8,
		name:    "environment-secret-kms-key-rotation",
		statements: []string{
			`ALTER TABLE execution_environment_secret_materials
			ADD COLUMN IF NOT EXISTS algorithm TEXT,
			ADD COLUMN IF NOT EXISTS key_provider TEXT,
			ADD COLUMN IF NOT EXISTS key_id TEXT,
			ADD COLUMN IF NOT EXISTS wrapped_key_nonce BYTEA,
			ADD COLUMN IF NOT EXISTS wrapped_key BYTEA`,
			`ALTER TABLE execution_environment_secret_materials
			DROP CONSTRAINT IF EXISTS execution_environment_secret_materials_envelope_check,
			ADD CONSTRAINT execution_environment_secret_materials_envelope_check CHECK (
				(algorithm IS NULL AND key_provider IS NULL AND key_id IS NULL AND wrapped_key_nonce IS NULL AND wrapped_key IS NULL)
				OR
				(algorithm = 'AES-256-GCM+KMS-DATA-KEY/v1' AND key_provider ~ '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$' AND key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$' AND octet_length(wrapped_key_nonce) BETWEEN 12 AND 32 AND octet_length(wrapped_key) BETWEEN 33 AND 4096)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_execution_environment_secret_materials_key ON execution_environment_secret_materials(key_provider, key_id)`,
			`CREATE TABLE IF NOT EXISTS execution_environment_key_rotation_audit (
			id BIGSERIAL PRIMARY KEY,
			active_key_provider TEXT NOT NULL,
			active_key_id TEXT NOT NULL,
			rewrapped_count INTEGER NOT NULL,
			migrated_legacy_count INTEGER NOT NULL,
			remaining_count INTEGER NOT NULL,
			occurred_at TIMESTAMPTZ NOT NULL,
			CONSTRAINT execution_environment_key_rotation_audit_count_check CHECK (rewrapped_count BETWEEN 1 AND 256 AND migrated_legacy_count BETWEEN 0 AND rewrapped_count AND remaining_count >= 0)
		)`,
		},
	}}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin migration transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version BIGINT PRIMARY KEY,
		name TEXT NOT NULL,
		applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`); err != nil {
		return fmt.Errorf("create migration registry: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock($1)`, int64(0x50726f6469766978)); err != nil {
		return fmt.Errorf("acquire migration lock: %w", err)
	}
	for _, migration := range migrations {
		var applied bool
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`, migration.version).Scan(&applied); err != nil {
			return fmt.Errorf("read migration registry: %w", err)
		}
		if applied {
			continue
		}
		for _, statement := range migration.statements {
			if _, err := tx.ExecContext(ctx, statement); err != nil {
				return fmt.Errorf("run migration version %d: %w", migration.version, err)
			}
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations (version, name) VALUES ($1, $2)`, migration.version, migration.name); err != nil {
			return fmt.Errorf("record migration version %d: %w", migration.version, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit migrations: %w", err)
	}
	return nil
}
