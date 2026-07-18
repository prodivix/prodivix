package remoteexecution

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

var ErrExecutionNotFound = errors.New("remote execution not found")
var ErrExecutionAuthorityConflict = errors.New("remote execution authority conflict")

type GrantStore interface {
	VerifyWorkspaceOwner(ctx context.Context, ownerID string, workspaceID string) error
	RecordExecution(ctx context.Context, authority ExecutionAuthority) error
	VerifyExecutionOwner(ctx context.Context, ownerID string, sessionID string, executionID string) error
	GetExecutionAuthority(ctx context.Context, ownerID string, sessionID string, executionID string) (*ExecutionAuthority, error)
	GetDataSourceDocument(ctx context.Context, authority ExecutionAuthority, documentID string) ([]byte, error)
}

type EnvironmentReference struct {
	EnvironmentID string
	Revision      string
	Mode          string
}

type ExecutionAuthority struct {
	ExecutionID        string
	WorkspaceID        string
	OwnerID            string
	SessionID          string
	SnapshotID         string
	PartitionRevisions map[string]string
	Environment        *EnvironmentReference
}

type Store struct{ db *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{db: db} }

func withTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, 5*time.Second)
}

func (store *Store) VerifyWorkspaceOwner(ctx context.Context, ownerID string, workspaceID string) error {
	ctx, cancel := withTimeout(ctx)
	defer cancel()
	var marker int
	err := store.db.QueryRowContext(ctx, `SELECT 1 FROM workspaces WHERE id = $1 AND owner_id = $2`, strings.TrimSpace(workspaceID), strings.TrimSpace(ownerID)).Scan(&marker)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrExecutionNotFound
	}
	return err
}

func (store *Store) RecordExecution(ctx context.Context, authority ExecutionAuthority) error {
	ctx, cancel := withTimeout(ctx)
	defer cancel()
	if strings.TrimSpace(authority.SnapshotID) == "" || len(authority.PartitionRevisions) == 0 || len(authority.PartitionRevisions) > 4096 {
		return ErrExecutionAuthorityConflict
	}
	for partition, revision := range authority.PartitionRevisions {
		if partition == "" || partition != strings.TrimSpace(partition) || revision == "" || revision != strings.TrimSpace(revision) {
			return ErrExecutionAuthorityConflict
		}
	}
	var environmentID, environmentRevision, environmentMode any
	if authority.Environment != nil {
		environmentID = strings.TrimSpace(authority.Environment.EnvironmentID)
		environmentRevision = strings.TrimSpace(authority.Environment.Revision)
		environmentMode = strings.TrimSpace(authority.Environment.Mode)
	}
	sessionID := strings.TrimSpace(authority.SessionID)
	if sessionID == "" {
		return ErrExecutionAuthorityConflict
	}
	partitionRevisions, err := json.Marshal(authority.PartitionRevisions)
	if err != nil {
		return err
	}
	result, err := store.db.ExecContext(ctx, `INSERT INTO remote_execution_grants (execution_id, workspace_id, owner_id, session_id, snapshot_id, partition_revisions_json, environment_id, environment_revision, environment_mode)
VALUES ($1, $2, $3, NULLIF($4, ''), $5, $6, $7, $8, $9)
ON CONFLICT (execution_id) DO UPDATE SET execution_id = EXCLUDED.execution_id
WHERE remote_execution_grants.workspace_id = EXCLUDED.workspace_id
	AND remote_execution_grants.owner_id = EXCLUDED.owner_id
	AND remote_execution_grants.session_id IS NOT DISTINCT FROM EXCLUDED.session_id
	AND remote_execution_grants.snapshot_id IS NOT DISTINCT FROM EXCLUDED.snapshot_id
	AND remote_execution_grants.partition_revisions_json IS NOT DISTINCT FROM EXCLUDED.partition_revisions_json
	AND remote_execution_grants.environment_id IS NOT DISTINCT FROM EXCLUDED.environment_id
	AND remote_execution_grants.environment_revision IS NOT DISTINCT FROM EXCLUDED.environment_revision
	AND remote_execution_grants.environment_mode IS NOT DISTINCT FROM EXCLUDED.environment_mode`, strings.TrimSpace(authority.ExecutionID), strings.TrimSpace(authority.WorkspaceID), strings.TrimSpace(authority.OwnerID), sessionID, strings.TrimSpace(authority.SnapshotID), partitionRevisions, environmentID, environmentRevision, environmentMode)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows != 1 {
		return ErrExecutionAuthorityConflict
	}
	return nil
}

func (store *Store) GetExecutionAuthority(ctx context.Context, ownerID string, sessionID string, executionID string) (*ExecutionAuthority, error) {
	ctx, cancel := withTimeout(ctx)
	defer cancel()
	var authority ExecutionAuthority
	var storedSession sql.NullString
	var partitionRevisionsJSON []byte
	var environmentID, environmentRevision, environmentMode sql.NullString
	err := store.db.QueryRowContext(ctx, `SELECT execution_id, workspace_id, owner_id, session_id, snapshot_id, partition_revisions_json, environment_id, environment_revision, environment_mode
FROM remote_execution_grants
WHERE execution_id = $1 AND owner_id = $2 AND (session_id IS NULL OR session_id = $3)`, strings.TrimSpace(executionID), strings.TrimSpace(ownerID), strings.TrimSpace(sessionID)).Scan(
		&authority.ExecutionID,
		&authority.WorkspaceID,
		&authority.OwnerID,
		&storedSession,
		&authority.SnapshotID,
		&partitionRevisionsJSON,
		&environmentID,
		&environmentRevision,
		&environmentMode,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrExecutionNotFound
	}
	if err != nil {
		return nil, err
	}
	authority.SessionID = storedSession.String
	if err := json.Unmarshal(partitionRevisionsJSON, &authority.PartitionRevisions); err != nil || len(authority.PartitionRevisions) == 0 {
		return nil, ErrExecutionAuthorityConflict
	}
	if environmentID.Valid || environmentRevision.Valid || environmentMode.Valid {
		if !environmentID.Valid || !environmentRevision.Valid || !environmentMode.Valid {
			return nil, ErrExecutionAuthorityConflict
		}
		authority.Environment = &EnvironmentReference{EnvironmentID: environmentID.String, Revision: environmentRevision.String, Mode: environmentMode.String}
	}
	return &authority, nil
}

func (store *Store) GetDataSourceDocument(ctx context.Context, authority ExecutionAuthority, documentID string) ([]byte, error) {
	revision := authority.PartitionRevisions["document:"+strings.TrimSpace(documentID)+":content"]
	if revision == "" {
		return nil, ErrExecutionAuthorityConflict
	}
	ctx, cancel := withTimeout(ctx)
	defer cancel()
	var content []byte
	err := store.db.QueryRowContext(ctx, `SELECT content_json
FROM workspace_documents
WHERE workspace_id = $1 AND id = $2 AND doc_type = 'data-source' AND content_rev::text = $3`, authority.WorkspaceID, strings.TrimSpace(documentID), revision).Scan(&content)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrExecutionAuthorityConflict
	}
	return content, err
}

func (store *Store) GetCodeDocument(ctx context.Context, authority ExecutionAuthority, documentID string) ([]byte, error) {
	revision := authority.PartitionRevisions["document:"+strings.TrimSpace(documentID)+":content"]
	if revision == "" {
		return nil, ErrExecutionAuthorityConflict
	}
	ctx, cancel := withTimeout(ctx)
	defer cancel()
	var content []byte
	err := store.db.QueryRowContext(ctx, `SELECT content_json
FROM workspace_documents
WHERE workspace_id = $1 AND id = $2 AND doc_type = 'code' AND content_rev::text = $3`, authority.WorkspaceID, strings.TrimSpace(documentID), revision).Scan(&content)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrExecutionAuthorityConflict
	}
	return content, err
}

func (store *Store) VerifyExecutionOwner(ctx context.Context, ownerID string, sessionID string, executionID string) error {
	ctx, cancel := withTimeout(ctx)
	defer cancel()
	var marker int
	err := store.db.QueryRowContext(ctx, `SELECT 1 FROM remote_execution_grants WHERE execution_id = $1 AND owner_id = $2 AND (session_id IS NULL OR session_id = $3)`, strings.TrimSpace(executionID), strings.TrimSpace(ownerID), strings.TrimSpace(sessionID)).Scan(&marker)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrExecutionNotFound
	}
	return err
}
