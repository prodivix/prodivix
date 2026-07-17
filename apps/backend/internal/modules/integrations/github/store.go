package github

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	backendidentity "github.com/Prodivix/prodivix/apps/backend/internal/platform/identity"
)

var ErrRepositoryBindingNotFound = errors.New("github repository binding not found")
var ErrInstallationNotFound = errors.New("github installation not found")

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (store *Store) UpsertInstallation(ctx context.Context, record InstallationRecord) (*InstallationRecord, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("github store is not initialized")
	}
	if record.InstallationID <= 0 {
		return nil, errors.New("installationID is required")
	}
	if record.Status == "" {
		record.Status = InstallationStatusActive
	}
	if len(record.Raw) == 0 {
		record.Raw = json.RawMessage(`{}`)
	}

	ctx, cancel := withStoreTimeout(ctx)
	defer cancel()

	const query = `INSERT INTO github_installations (
	installation_id, account_login, account_type, account_id, status, raw_json, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW(), NOW())
ON CONFLICT (installation_id) DO UPDATE
SET account_login = EXCLUDED.account_login,
    account_type = EXCLUDED.account_type,
    account_id = EXCLUDED.account_id,
    status = EXCLUDED.status,
    raw_json = EXCLUDED.raw_json,
    updated_at = NOW()
RETURNING installation_id, account_login, account_type, account_id, status, raw_json, created_at, updated_at`

	row := store.db.QueryRowContext(
		ctx,
		query,
		record.InstallationID,
		strings.TrimSpace(record.AccountLogin),
		strings.TrimSpace(record.AccountType),
		record.AccountID,
		string(record.Status),
		string(record.Raw),
	)
	return scanInstallation(row)
}

func (store *Store) ListInstallationsForUser(ctx context.Context, userID string) ([]InstallationRecord, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("github store is not initialized")
	}
	ctx, cancel := withStoreTimeout(ctx)
	defer cancel()
	const query = `SELECT DISTINCT i.installation_id, i.account_login, i.account_type, i.account_id, i.status, i.raw_json, i.created_at, i.updated_at
FROM github_installations i
INNER JOIN github_repository_bindings b ON b.installation_id = i.installation_id
WHERE b.user_id = $1 AND b.status = 'active'
ORDER BY i.updated_at DESC`
	rows, err := store.db.QueryContext(ctx, query, strings.TrimSpace(userID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]InstallationRecord, 0)
	for rows.Next() {
		record, err := scanInstallation(rows)
		if err != nil {
			return nil, err
		}
		records = append(records, *record)
	}
	return records, rows.Err()
}

func (store *Store) UpsertInstallationRepositories(ctx context.Context, installationID int64, repositories []InstallationRepositoryRecord) error {
	if store == nil || store.db == nil {
		return errors.New("github store is not initialized")
	}
	if installationID <= 0 {
		return errors.New("installationID is required")
	}
	ctx, cancel := withStoreTimeout(ctx)
	defer cancel()

	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	for _, repository := range repositories {
		if repository.RepositoryID <= 0 || strings.TrimSpace(repository.FullName) == "" {
			continue
		}
		owner := strings.TrimSpace(repository.Owner)
		name := strings.TrimSpace(repository.Name)
		fullName := strings.TrimSpace(repository.FullName)
		defaultBranch := strings.TrimSpace(repository.DefaultBranch)
		if defaultBranch == "" {
			defaultBranch = "main"
		}
		const query = `INSERT INTO github_installation_repositories (
	installation_id, repository_id, owner, name, full_name, private, default_branch, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
ON CONFLICT (installation_id, repository_id) DO UPDATE
SET owner = EXCLUDED.owner,
    name = EXCLUDED.name,
    full_name = EXCLUDED.full_name,
    private = EXCLUDED.private,
    default_branch = EXCLUDED.default_branch,
    updated_at = NOW()`
		if _, err := tx.ExecContext(ctx, query, installationID, repository.RepositoryID, owner, name, fullName, repository.Private, defaultBranch); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

func (store *Store) ListInstallationRepositoriesForUser(ctx context.Context, userID string, installationID int64) ([]InstallationRepositoryRecord, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("github store is not initialized")
	}
	if installationID <= 0 {
		return nil, ErrInstallationNotFound
	}
	ctx, cancel := withStoreTimeout(ctx)
	defer cancel()
	const query = `SELECT DISTINCT r.installation_id, r.repository_id, r.owner, r.name, r.full_name, r.private, r.default_branch, r.updated_at
FROM github_installation_repositories r
INNER JOIN github_repository_bindings b ON b.installation_id = r.installation_id
WHERE b.user_id = $1 AND b.status = 'active' AND r.installation_id = $2
ORDER BY r.full_name ASC`
	rows, err := store.db.QueryContext(ctx, query, strings.TrimSpace(userID), installationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]InstallationRepositoryRecord, 0)
	for rows.Next() {
		var record InstallationRepositoryRecord
		if err := rows.Scan(&record.InstallationID, &record.RepositoryID, &record.Owner, &record.Name, &record.FullName, &record.Private, &record.DefaultBranch, &record.UpdatedAt); err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func (store *Store) UserHasInstallationAccess(ctx context.Context, userID string, installationID int64) (bool, error) {
	if store == nil || store.db == nil {
		return false, errors.New("github store is not initialized")
	}
	ctx, cancel := withStoreTimeout(ctx)
	defer cancel()
	var allowed bool
	err := store.db.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM github_repository_bindings
		WHERE user_id = $1 AND installation_id = $2 AND status = 'active'
	)`, strings.TrimSpace(userID), installationID).Scan(&allowed)
	return allowed, err
}

func (store *Store) RecordWebhookEvent(ctx context.Context, record WebhookEventRecord) (bool, error) {
	if store == nil || store.db == nil {
		return false, errors.New("github store is not initialized")
	}
	record.DeliveryID = strings.TrimSpace(record.DeliveryID)
	record.EventType = strings.TrimSpace(record.EventType)
	if record.DeliveryID == "" || record.EventType == "" {
		return false, errors.New("deliveryID and eventType are required")
	}
	if len(record.Payload) == 0 {
		record.Payload = json.RawMessage(`{}`)
	}
	ctx, cancel := withStoreTimeout(ctx)
	defer cancel()

	const query = `INSERT INTO github_events (
	delivery_id, event_type, installation_id, action, payload_json, processed, created_at
) VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())
ON CONFLICT (delivery_id) DO UPDATE SET delivery_id = EXCLUDED.delivery_id
RETURNING processed`
	var processed bool
	err := store.db.QueryRowContext(ctx, query, record.DeliveryID, record.EventType, record.InstallationID, strings.TrimSpace(record.Action), string(record.Payload), false).Scan(&processed)
	return !processed, err
}

func (store *Store) MarkWebhookEventProcessed(ctx context.Context, deliveryID string) error {
	if store == nil || store.db == nil {
		return errors.New("github store is not initialized")
	}
	ctx, cancel := withStoreTimeout(ctx)
	defer cancel()
	_, err := store.db.ExecContext(ctx, `UPDATE github_events SET processed = TRUE WHERE delivery_id = $1`, strings.TrimSpace(deliveryID))
	return err
}

func (store *Store) UpsertRepositoryBinding(ctx context.Context, params UpsertRepositoryBindingParams) (*RepositoryBindingRecord, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("github store is not initialized")
	}
	if strings.TrimSpace(params.UserID) == "" || strings.TrimSpace(params.ProjectID) == "" || strings.TrimSpace(params.WorkspaceID) == "" {
		return nil, errors.New("userID, projectID and workspaceID are required")
	}
	if params.InstallationID <= 0 || strings.TrimSpace(params.Owner) == "" || strings.TrimSpace(params.Repo) == "" {
		return nil, errors.New("installationID, owner and repo are required")
	}
	defaultBranch := strings.TrimSpace(params.DefaultBranch)
	if defaultBranch == "" {
		defaultBranch = "main"
	}
	branch := strings.TrimSpace(params.Branch)
	if branch == "" {
		branch = defaultBranch
	}

	bindingID, err := backendidentity.NewID("ghb", 8)
	if err != nil {
		return nil, err
	}
	ctx, cancel := withStoreTimeout(ctx)
	defer cancel()

	const query = `INSERT INTO github_repository_bindings (
	id, user_id, project_id, workspace_id, provider, installation_id, owner, repo, default_branch, status, branch, created_at, updated_at
) VALUES ($1, $2, $3, $4, 'github', $5, $6, $7, $8, 'active', $9, NOW(), NOW())
ON CONFLICT (project_id) WHERE status = 'active' DO UPDATE
SET installation_id = EXCLUDED.installation_id,
    owner = EXCLUDED.owner,
    repo = EXCLUDED.repo,
    default_branch = EXCLUDED.default_branch,
    branch = EXCLUDED.branch,
    updated_at = NOW()
RETURNING id, user_id, project_id, workspace_id, provider, installation_id, owner, repo, default_branch, status, branch,
	pir_dirty, pir_last_synced_rev, pir_last_synced_at, pir_last_commit_sha, pir_last_error_code,
	artifacts_dirty, artifacts_last_synced_rev, artifacts_last_synced_at, artifacts_last_commit_sha, artifacts_last_error_code,
	created_at, updated_at`

	row := store.db.QueryRowContext(ctx, query, bindingID, params.UserID, params.ProjectID, params.WorkspaceID, params.InstallationID, strings.TrimSpace(params.Owner), strings.TrimSpace(params.Repo), defaultBranch, branch)
	return scanRepositoryBinding(row)
}

func (store *Store) GetRepositoryBindingByProject(ctx context.Context, userID, projectID string) (*RepositoryBindingRecord, error) {
	if store == nil || store.db == nil {
		return nil, errors.New("github store is not initialized")
	}
	ctx, cancel := withStoreTimeout(ctx)
	defer cancel()

	const query = `SELECT id, user_id, project_id, workspace_id, provider, installation_id, owner, repo, default_branch, status, branch,
	pir_dirty, pir_last_synced_rev, pir_last_synced_at, pir_last_commit_sha, pir_last_error_code,
	artifacts_dirty, artifacts_last_synced_rev, artifacts_last_synced_at, artifacts_last_commit_sha, artifacts_last_error_code,
	created_at, updated_at
FROM github_repository_bindings
WHERE user_id = $1 AND project_id = $2 AND status = 'active'`
	record, err := scanRepositoryBinding(store.db.QueryRowContext(ctx, query, strings.TrimSpace(userID), strings.TrimSpace(projectID)))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrRepositoryBindingNotFound
		}
		return nil, err
	}
	return record, nil
}

func scanInstallation(scanner interface{ Scan(dest ...any) error }) (*InstallationRecord, error) {
	record := &InstallationRecord{}
	var status string
	var rawBytes []byte
	if err := scanner.Scan(&record.InstallationID, &record.AccountLogin, &record.AccountType, &record.AccountID, &status, &rawBytes, &record.CreatedAt, &record.UpdatedAt); err != nil {
		return nil, err
	}
	record.Status = InstallationStatus(status)
	record.Raw = json.RawMessage(rawBytes)
	return record, nil
}

func scanRepositoryBinding(scanner interface{ Scan(dest ...any) error }) (*RepositoryBindingRecord, error) {
	record := &RepositoryBindingRecord{}
	var status string
	var pirLastSyncedRev sql.NullInt64
	var pirLastSyncedAt sql.NullTime
	var artifactsLastSyncedRev sql.NullInt64
	var artifactsLastSyncedAt sql.NullTime

	err := scanner.Scan(
		&record.ID,
		&record.UserID,
		&record.ProjectID,
		&record.WorkspaceID,
		&record.Provider,
		&record.InstallationID,
		&record.Owner,
		&record.Repo,
		&record.DefaultBranch,
		&status,
		&record.Branch,
		&record.PIR.Dirty,
		&pirLastSyncedRev,
		&pirLastSyncedAt,
		&record.PIR.LastCommitSHA,
		&record.PIR.LastErrorCode,
		&record.Artifacts.Dirty,
		&artifactsLastSyncedRev,
		&artifactsLastSyncedAt,
		&record.Artifacts.LastCommitSHA,
		&record.Artifacts.LastErrorCode,
		&record.CreatedAt,
		&record.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	record.Status = RepositoryBindingStatus(status)
	record.PIR.Track = GitSyncTrackPIR
	record.Artifacts.Track = GitSyncTrackArtifacts
	if pirLastSyncedRev.Valid {
		record.PIR.LastSyncedRev = &pirLastSyncedRev.Int64
	}
	if pirLastSyncedAt.Valid {
		record.PIR.LastSyncedAt = &pirLastSyncedAt.Time
	}
	if artifactsLastSyncedRev.Valid {
		record.Artifacts.LastSyncedRev = &artifactsLastSyncedRev.Int64
	}
	if artifactsLastSyncedAt.Valid {
		record.Artifacts.LastSyncedAt = &artifactsLastSyncedAt.Time
	}
	return record, nil
}

func withStoreTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	if ctx == nil {
		ctx = context.Background()
	}
	return context.WithTimeout(ctx, 5*time.Second)
}
