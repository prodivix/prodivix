package verification

import (
	"context"
	"database/sql"
	"errors"
)

type ArtifactContent struct {
	Locator   string
	Digest    string
	MediaType string
	Size      int64
	Kind      ArtifactKind
}

func (repository *Repository) ResolveArtifactContent(
	ctx context.Context,
	workspaceID string,
	evidenceID string,
	artifactID string,
) (ArtifactContent, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	var evidenceExists, tombstoned bool
	if err := repository.db.QueryRowContext(ctx, `SELECT
	EXISTS (
		SELECT 1 FROM verification_evidence
		WHERE workspace_id = $1 AND id = $2
	),
	EXISTS (
		SELECT 1 FROM verification_tombstones
		WHERE workspace_id = $1 AND evidence_id = $2
	)`, workspaceID, evidenceID).Scan(&evidenceExists, &tombstoned); err != nil {
		return ArtifactContent{}, err
	}
	if !evidenceExists {
		return ArtifactContent{}, ErrNotFound
	}
	if tombstoned {
		return ArtifactContent{}, ErrExpired
	}
	var content ArtifactContent
	var physicalSize int64
	err := repository.db.QueryRowContext(ctx, `SELECT a.store_locator, a.digest,
	ea.media_type, ea.byte_length, ea.kind, a.byte_length
FROM verification_evidence e
JOIN verification_evidence_artifacts ea ON ea.evidence_id = e.id
JOIN verification_artifacts a
	ON a.workspace_id = ea.workspace_id AND a.digest = ea.artifact_digest
	WHERE e.workspace_id = $1 AND e.id = $2 AND ea.artifact_id = $3`,
		workspaceID, evidenceID, artifactID).Scan(
		&content.Locator, &content.Digest, &content.MediaType,
		&content.Size, &content.Kind, &physicalSize,
	)
	if errors.Is(err, sql.ErrNoRows) {
		if err := repository.db.QueryRowContext(ctx, `SELECT EXISTS (
			SELECT 1 FROM verification_tombstones
			WHERE workspace_id = $1 AND evidence_id = $2
		)`, workspaceID, evidenceID).Scan(&tombstoned); err != nil {
			return ArtifactContent{}, err
		}
		if tombstoned {
			return ArtifactContent{}, ErrExpired
		}
		return ArtifactContent{}, ErrNotFound
	}
	if err != nil {
		return ArtifactContent{}, err
	}
	if physicalSize != content.Size {
		return ArtifactContent{}, coded(
			"VER-5001",
			"Stored artifact bytes do not match the signed Evidence relation.",
			ErrConflict,
		)
	}
	return content, nil
}
