package remoteexecution

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

var ErrIsolatedSecretResolutionConflict = errors.New("isolated Secret resolution identity conflicts")

type IsolatedSecretResolutionKey struct {
	ExecutionID        string
	WorkerID           string
	WorkerAttempt      int64
	ArtifactID         string
	ExportName         string
	InvocationID       string
	RecipientPublicKey string
}

type IsolatedSecretResolutionReservation struct {
	Kind     string
	Envelope json.RawMessage
}

type IsolatedSecretBrokerStore interface {
	GetExecutionAuthorityForSecretBroker(ctx context.Context, executionID string) (*ExecutionAuthority, error)
	GetCodeDocument(ctx context.Context, authority ExecutionAuthority, documentID string) ([]byte, error)
	ReserveIsolatedSecretResolution(ctx context.Context, key IsolatedSecretResolutionKey) (*IsolatedSecretResolutionReservation, error)
	CompleteIsolatedSecretResolution(ctx context.Context, key IsolatedSecretResolutionKey, envelope json.RawMessage) error
	AbandonIsolatedSecretResolution(ctx context.Context, key IsolatedSecretResolutionKey) error
}

func (store *Store) GetExecutionAuthorityForSecretBroker(ctx context.Context, executionID string) (*ExecutionAuthority, error) {
	ctx, cancel := withTimeout(ctx)
	defer cancel()
	var authority ExecutionAuthority
	var storedSession sql.NullString
	var partitionRevisionsJSON []byte
	var environmentID, environmentRevision, environmentMode sql.NullString
	err := store.db.QueryRowContext(ctx, `SELECT execution_id, workspace_id, owner_id, session_id, snapshot_id, partition_revisions_json, environment_id, environment_revision, environment_mode
FROM remote_execution_grants WHERE execution_id = $1`, strings.TrimSpace(executionID)).Scan(
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
	if authority.SessionID == "" || json.Unmarshal(partitionRevisionsJSON, &authority.PartitionRevisions) != nil || len(authority.PartitionRevisions) == 0 {
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

func (store *Store) ReserveIsolatedSecretResolution(ctx context.Context, key IsolatedSecretResolutionKey) (*IsolatedSecretResolutionReservation, error) {
	ctx, cancel := withTimeout(ctx)
	defer cancel()
	result, err := store.db.ExecContext(ctx, `INSERT INTO remote_isolated_secret_resolutions
	(execution_id, worker_id, worker_attempt, artifact_id, export_name, invocation_id, recipient_public_key)
	VALUES ($1,$2,$3,$4,$5,$6,$7)
	ON CONFLICT (execution_id) DO UPDATE SET
		worker_id=EXCLUDED.worker_id,
		worker_attempt=EXCLUDED.worker_attempt,
		recipient_public_key=EXCLUDED.recipient_public_key,
		envelope_json=NULL,
		created_at=NOW(),
		completed_at=NULL
	WHERE remote_isolated_secret_resolutions.worker_attempt < EXCLUDED.worker_attempt
		AND remote_isolated_secret_resolutions.artifact_id = EXCLUDED.artifact_id
		AND remote_isolated_secret_resolutions.export_name = EXCLUDED.export_name
		AND remote_isolated_secret_resolutions.invocation_id = EXCLUDED.invocation_id`, key.ExecutionID, key.WorkerID, key.WorkerAttempt, key.ArtifactID, key.ExportName, key.InvocationID, key.RecipientPublicKey)
	if err != nil {
		return nil, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return nil, err
	}
	if rows == 1 {
		return &IsolatedSecretResolutionReservation{Kind: "reserved"}, nil
	}
	var stored IsolatedSecretResolutionKey
	var envelope []byte
	err = store.db.QueryRowContext(ctx, `SELECT execution_id, worker_id, worker_attempt, artifact_id, export_name, invocation_id, recipient_public_key, envelope_json
	FROM remote_isolated_secret_resolutions WHERE execution_id = $1`, key.ExecutionID).Scan(&stored.ExecutionID, &stored.WorkerID, &stored.WorkerAttempt, &stored.ArtifactID, &stored.ExportName, &stored.InvocationID, &stored.RecipientPublicKey, &envelope)
	if err != nil {
		return nil, err
	}
	if stored != key {
		return nil, ErrIsolatedSecretResolutionConflict
	}
	if len(envelope) == 0 {
		return &IsolatedSecretResolutionReservation{Kind: "pending"}, nil
	}
	return &IsolatedSecretResolutionReservation{Kind: "existing", Envelope: append(json.RawMessage(nil), envelope...)}, nil
}

func (store *Store) CompleteIsolatedSecretResolution(ctx context.Context, key IsolatedSecretResolutionKey, envelope json.RawMessage) error {
	if len(envelope) == 0 || len(envelope) > 768*1024 || !json.Valid(envelope) {
		return ErrIsolatedSecretResolutionConflict
	}
	ctx, cancel := withTimeout(ctx)
	defer cancel()
	result, err := store.db.ExecContext(ctx, `UPDATE remote_isolated_secret_resolutions SET envelope_json=$1, completed_at=$2
	WHERE execution_id=$3 AND worker_id=$4 AND worker_attempt=$5 AND artifact_id=$6 AND export_name=$7 AND invocation_id=$8 AND recipient_public_key=$9 AND envelope_json IS NULL`, envelope, time.Now().UTC(), key.ExecutionID, key.WorkerID, key.WorkerAttempt, key.ArtifactID, key.ExportName, key.InvocationID, key.RecipientPublicKey)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows != 1 {
		return ErrIsolatedSecretResolutionConflict
	}
	return nil
}

func (store *Store) AbandonIsolatedSecretResolution(ctx context.Context, key IsolatedSecretResolutionKey) error {
	ctx, cancel := withTimeout(ctx)
	defer cancel()
	_, err := store.db.ExecContext(ctx, `DELETE FROM remote_isolated_secret_resolutions
	WHERE execution_id=$1 AND worker_id=$2 AND worker_attempt=$3 AND artifact_id=$4 AND export_name=$5 AND invocation_id=$6 AND recipient_public_key=$7 AND envelope_json IS NULL`, key.ExecutionID, key.WorkerID, key.WorkerAttempt, key.ArtifactID, key.ExportName, key.InvocationID, key.RecipientPublicKey)
	return err
}
