package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"
)

const (
	MaxWorkspaceAssetBlobSweepWorkspaces = 1024
	MaxWorkspaceAssetBlobSweepBlobs      = 4096
)

var ErrWorkspaceAssetBlobSweepInvalid = errors.New("workspace asset blob sweep policy is invalid")

type WorkspaceAssetBlobSweepPolicy struct {
	ObservedAt      time.Time
	OrphanRetention time.Duration
	WorkspaceLimit  int
	BlobLimit       int
}

type WorkspaceAssetBlobSweepResult struct {
	ObservedWorkspaces int64
	ProtectedBlobs     int64
	MarkedOrphans      int64
	DeletedBlobs       int64
	DeletedBytes       int64
}

const sweepWorkspaceAssetBlobOrphansQuery = `WITH candidate_workspaces AS MATERIALIZED (
	SELECT w.id
	FROM workspaces AS w
	WHERE EXISTS (
		SELECT 1
		FROM workspace_asset_blobs AS b
		CROSS JOIN LATERAL (
			SELECT EXISTS (
				SELECT 1
				FROM workspace_documents AS d
				WHERE d.workspace_id = b.workspace_id
				  AND d.doc_type = 'asset'
				  AND d.content_json #>> '{blob,digest}' = b.digest
			) AS is_referenced
		) AS asset_reference
		WHERE b.workspace_id = w.id
		  AND (
			(asset_reference.is_referenced AND b.unreferenced_since IS NOT NULL)
			OR (NOT asset_reference.is_referenced AND b.unreferenced_since IS NULL)
			OR (NOT asset_reference.is_referenced AND b.unreferenced_since < $1)
		  )
	)
	ORDER BY w.id
	LIMIT $2
	FOR UPDATE OF w SKIP LOCKED
),
candidate_blobs AS MATERIALIZED (
	SELECT b.workspace_id,
	       b.digest,
	       b.byte_length,
	       b.unreferenced_since,
	       asset_reference.is_referenced
	FROM workspace_asset_blobs AS b
	JOIN candidate_workspaces AS candidate_workspace
	  ON candidate_workspace.id = b.workspace_id
	CROSS JOIN LATERAL (
		SELECT EXISTS (
			SELECT 1
			FROM workspace_documents AS d
			WHERE d.workspace_id = b.workspace_id
			  AND d.doc_type = 'asset'
			  AND d.content_json #>> '{blob,digest}' = b.digest
		) AS is_referenced
	) AS asset_reference
	WHERE (asset_reference.is_referenced AND b.unreferenced_since IS NOT NULL)
	   OR (NOT asset_reference.is_referenced AND b.unreferenced_since IS NULL)
	   OR (NOT asset_reference.is_referenced AND b.unreferenced_since < $1)
	ORDER BY CASE
		WHEN asset_reference.is_referenced THEN 0
		WHEN b.unreferenced_since IS NULL THEN 1
		ELSE 2
	END,
	b.unreferenced_since NULLS FIRST,
	b.workspace_id,
	b.digest
	LIMIT $3
	FOR UPDATE OF b SKIP LOCKED
),
protected_blobs AS (
	UPDATE workspace_asset_blobs AS b
	SET unreferenced_since = NULL
	FROM candidate_blobs AS candidate
	WHERE b.workspace_id = candidate.workspace_id
	  AND b.digest = candidate.digest
	  AND candidate.is_referenced
	  AND candidate.unreferenced_since IS NOT NULL
	RETURNING b.workspace_id
),
marked_orphans AS (
	UPDATE workspace_asset_blobs AS b
	SET unreferenced_since = $4
	FROM candidate_blobs AS candidate
	WHERE b.workspace_id = candidate.workspace_id
	  AND b.digest = candidate.digest
	  AND NOT candidate.is_referenced
	  AND candidate.unreferenced_since IS NULL
	RETURNING b.workspace_id
),
deleted_blobs AS (
	DELETE FROM workspace_asset_blobs AS b
	USING candidate_blobs AS candidate
	WHERE b.workspace_id = candidate.workspace_id
	  AND b.digest = candidate.digest
	  AND NOT candidate.is_referenced
	  AND candidate.unreferenced_since IS NOT NULL
	  AND candidate.unreferenced_since < $1
	RETURNING b.byte_length
)
SELECT (SELECT COUNT(*) FROM candidate_workspaces),
	   (SELECT COUNT(*) FROM protected_blobs),
	   (SELECT COUNT(*) FROM marked_orphans),
	   (SELECT COUNT(*) FROM deleted_blobs),
	   COALESCE((SELECT SUM(byte_length) FROM deleted_blobs), 0)::bigint`

func normalizeWorkspaceAssetBlobSweepPolicy(policy WorkspaceAssetBlobSweepPolicy) (WorkspaceAssetBlobSweepPolicy, error) {
	policy.ObservedAt = policy.ObservedAt.UTC()
	if policy.ObservedAt.IsZero() ||
		policy.OrphanRetention <= 0 ||
		policy.WorkspaceLimit <= 0 || policy.WorkspaceLimit > MaxWorkspaceAssetBlobSweepWorkspaces ||
		policy.BlobLimit <= 0 || policy.BlobLimit > MaxWorkspaceAssetBlobSweepBlobs {
		return WorkspaceAssetBlobSweepPolicy{}, ErrWorkspaceAssetBlobSweepInvalid
	}
	return policy, nil
}

// SweepWorkspaceAssetBlobOrphans performs one bounded mark/sweep cycle. It
// locks the same Workspace row used by authoring commits, so a reference can
// neither appear nor disappear between the reference check and the update.
func (store *WorkspaceStore) SweepWorkspaceAssetBlobOrphans(
	ctx context.Context,
	policy WorkspaceAssetBlobSweepPolicy,
) (WorkspaceAssetBlobSweepResult, error) {
	if store == nil || store.db == nil {
		return WorkspaceAssetBlobSweepResult{}, errors.New("workspace store is not initialized")
	}
	normalized, err := normalizeWorkspaceAssetBlobSweepPolicy(policy)
	if err != nil {
		return WorkspaceAssetBlobSweepResult{}, err
	}

	ctx, cancel := withStoreTimeout(ctx)
	defer cancel()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return WorkspaceAssetBlobSweepResult{}, err
	}
	rollback := func(sweepErr error) (WorkspaceAssetBlobSweepResult, error) {
		_ = tx.Rollback()
		return WorkspaceAssetBlobSweepResult{}, sweepErr
	}

	cutoff := normalized.ObservedAt.Add(-normalized.OrphanRetention)
	result := WorkspaceAssetBlobSweepResult{}
	if err := tx.QueryRowContext(
		ctx,
		sweepWorkspaceAssetBlobOrphansQuery,
		cutoff,
		normalized.WorkspaceLimit,
		normalized.BlobLimit,
		normalized.ObservedAt,
	).Scan(
		&result.ObservedWorkspaces,
		&result.ProtectedBlobs,
		&result.MarkedOrphans,
		&result.DeletedBlobs,
		&result.DeletedBytes,
	); err != nil {
		return rollback(err)
	}
	if err := tx.Commit(); err != nil {
		return WorkspaceAssetBlobSweepResult{}, err
	}
	return result, nil
}

func workspaceAssetDocumentDigests(documents map[string]WorkspaceDocumentRecord) (map[string]struct{}, error) {
	digests := make(map[string]struct{})
	for _, document := range documents {
		if document.Type != WorkspaceDocumentTypeAsset {
			continue
		}
		reference, err := readWorkspaceAssetDocumentReference(document)
		if err != nil {
			return nil, err
		}
		digests[reference.Digest] = struct{}{}
	}
	return digests, nil
}

func marshalWorkspaceAssetDigestSet(digests map[string]struct{}) (string, error) {
	values := make([]string, 0, len(digests))
	for digest := range digests {
		values = append(values, digest)
	}
	sort.Strings(values)
	payload, err := json.Marshal(values)
	if err != nil {
		return "", err
	}
	return string(payload), nil
}

// reconcileWorkspaceAssetBlobReferenceRetention runs inside the authoring
// transaction. Current references clear the orphan clock; a durable
// dereference starts a fresh retention window instead of deleting bytes.
func reconcileWorkspaceAssetBlobReferenceRetention(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	previousDocuments map[string]WorkspaceDocumentRecord,
	currentDocuments map[string]WorkspaceDocumentRecord,
	observedAt time.Time,
) error {
	previousDigests, err := workspaceAssetDocumentDigests(previousDocuments)
	if err != nil {
		return err
	}
	currentDigests, err := workspaceAssetDocumentDigests(currentDocuments)
	if err != nil {
		return err
	}
	if len(currentDigests) > 0 {
		currentJSON, err := marshalWorkspaceAssetDigestSet(currentDigests)
		if err != nil {
			return err
		}
		const protect = `UPDATE workspace_asset_blobs
SET unreferenced_since = NULL
WHERE workspace_id = $1
  AND unreferenced_since IS NOT NULL
  AND digest IN (
	SELECT value
	FROM jsonb_array_elements_text($2::jsonb) AS digest_set(value)
  )`
		if _, err := tx.ExecContext(ctx, protect, workspaceID, currentJSON); err != nil {
			return err
		}
	}

	removedDigests := make(map[string]struct{})
	for digest := range previousDigests {
		if _, retained := currentDigests[digest]; !retained {
			removedDigests[digest] = struct{}{}
		}
	}
	if len(removedDigests) == 0 {
		return nil
	}
	removedJSON, err := marshalWorkspaceAssetDigestSet(removedDigests)
	if err != nil {
		return err
	}
	const mark = `UPDATE workspace_asset_blobs
SET unreferenced_since = $3
WHERE workspace_id = $1
  AND digest IN (
	SELECT value
	FROM jsonb_array_elements_text($2::jsonb) AS digest_set(value)
  )`
	if _, err := tx.ExecContext(ctx, mark, workspaceID, removedJSON, observedAt.UTC()); err != nil {
		return fmt.Errorf("mark dereferenced workspace asset blobs: %w", err)
	}
	return nil
}
