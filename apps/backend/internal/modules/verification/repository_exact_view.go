package verification

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"time"
)

const maximumAgentEvaluationExactEvidenceIDs = 128

type agentEvaluationExactVerifiedViewSnapshot struct {
	View      ClosureView
	Manifests []VerificationEvidenceManifest
}

func (repository *Repository) AgentEvaluationExactVerifiedView(
	ctx context.Context,
	workspaceID string,
	evidenceIDs []string,
	observedAt time.Time,
) (agentEvaluationExactVerifiedViewSnapshot, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	if validateIdentifier(workspaceID, "workspaceId") != nil ||
		len(evidenceIDs) == 0 || len(evidenceIDs) > maximumAgentEvaluationExactEvidenceIDs {
		return agentEvaluationExactVerifiedViewSnapshot{}, ErrInvalid
	}
	for index, evidenceID := range evidenceIDs {
		if validateIdentifier(evidenceID, "evidenceId") != nil ||
			(index > 0 && evidenceIDs[index-1] >= evidenceID) {
			return agentEvaluationExactVerifiedViewSnapshot{}, ErrInvalid
		}
	}
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{
		ReadOnly: true, Isolation: sql.LevelRepeatableRead,
	})
	if err != nil {
		return agentEvaluationExactVerifiedViewSnapshot{}, err
	}
	defer func() { _ = tx.Rollback() }()

	records := make([]VerifiedViewRecord, 0, len(evidenceIDs))
	manifests := make([]VerificationEvidenceManifest, 0, len(evidenceIDs))
	for _, evidenceID := range evidenceIDs {
		manifest, err := loadEvidenceManifest(ctx, tx, workspaceID, evidenceID)
		if err != nil {
			return agentEvaluationExactVerifiedViewSnapshot{}, err
		}
		record, err := loadEvidenceRecord(ctx, tx, workspaceID, evidenceID, observedAt)
		if err != nil {
			return agentEvaluationExactVerifiedViewSnapshot{}, err
		}
		if manifest.Evidence.ID != evidenceID || record.VerifiedView.EvidenceID != evidenceID ||
			manifest.ManifestDigest != record.VerifiedView.ManifestDigest {
			return agentEvaluationExactVerifiedViewSnapshot{}, ErrConflict
		}
		manifests = append(manifests, manifest)
		records = append(records, record.VerifiedView)
	}
	byID := make(map[string]struct{}, len(records))
	for _, record := range records {
		byID[record.EvidenceID] = struct{}{}
	}
	for _, record := range records {
		if record.SupersededByEvidenceID != "" {
			if _, exists := byID[record.SupersededByEvidenceID]; !exists {
				return agentEvaluationExactVerifiedViewSnapshot{}, coded(
					"VER-6002",
					"Exact Evidence view omits a durable supersession target.",
					ErrConflict,
				)
			}
		}
	}
	revocationDigest, err := effectiveRevocationDigest(
		ctx, tx, workspaceID, observedAt, records,
	)
	if err != nil {
		return agentEvaluationExactVerifiedViewSnapshot{}, err
	}
	view := ClosureView{
		Format:                   "prodivix.verification-evidence-view.v1",
		ClosureEvaluationInstant: formatInstant(observedAt),
		Records:                  records,
		RevocationRecordDigest:   revocationDigest,
	}
	view.ViewDigest, _, err = digestWithoutField(view, "viewDigest")
	if err != nil {
		return agentEvaluationExactVerifiedViewSnapshot{}, err
	}
	if err := tx.Commit(); err != nil {
		return agentEvaluationExactVerifiedViewSnapshot{}, err
	}
	return agentEvaluationExactVerifiedViewSnapshot{
		View: view, Manifests: manifests,
	}, nil
}

func (repository *Repository) GetEvidenceManifest(
	ctx context.Context,
	workspaceID string,
	evidenceID string,
) (VerificationEvidenceManifest, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	return loadEvidenceManifest(ctx, repository.db, workspaceID, evidenceID)
}

func loadEvidenceManifest(
	ctx context.Context,
	queryer readQueryer,
	workspaceID string,
	evidenceID string,
) (VerificationEvidenceManifest, error) {
	var manifestBytes []byte
	err := queryer.QueryRowContext(ctx, `SELECT manifest_bytes
FROM verification_evidence
WHERE workspace_id = $1 AND id = $2`, workspaceID, evidenceID).Scan(&manifestBytes)
	if errors.Is(err, sql.ErrNoRows) {
		return VerificationEvidenceManifest{}, ErrNotFound
	}
	if err != nil {
		return VerificationEvidenceManifest{}, err
	}
	var manifest VerificationEvidenceManifest
	if err := jsonUnmarshalStrictStored(manifestBytes, &manifest); err != nil {
		return VerificationEvidenceManifest{}, err
	}
	canonical, err := canonicalBytes(manifest)
	if err != nil || !bytes.Equal(canonical, manifestBytes) {
		return VerificationEvidenceManifest{}, ErrConflict
	}
	if _, err := projectEvidenceManifest(manifest); err != nil {
		return VerificationEvidenceManifest{}, ErrConflict
	}
	return manifest, nil
}
