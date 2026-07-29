package verification

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

type RevocationInput struct {
	EvidenceID  string
	Issuer      string
	KeyID       string
	ReasonCode  string
	Reason      string
	EffectiveAt time.Time
}

func (repository *Repository) CreateRevocation(
	ctx context.Context,
	workspaceID string,
	input RevocationInput,
	actorID string,
	now time.Time,
	idempotencyKey string,
	expectedScopeState string,
) (string, bool, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	evidenceScope := input.EvidenceID != "" && input.Issuer == "" && input.KeyID == ""
	issuerScope := input.EvidenceID == "" && input.Issuer != "" && input.KeyID == ""
	keyScope := input.EvidenceID == "" && input.Issuer != "" && input.KeyID != ""
	if (!evidenceScope && !issuerScope && !keyScope) ||
		validateIdentifier(input.ReasonCode, "revocation reason code") != nil ||
		!safeReason(input.Reason) || input.EffectiveAt.Before(now.Add(-time.Minute)) ||
		input.EffectiveAt.After(now.Add(24*time.Hour)) ||
		expectedScopeState != "unrevoked" {
		return "", false, ErrInvalid
	}
	if input.EvidenceID != "" && validateIdentifier(input.EvidenceID, "revocation Evidence scope") != nil {
		return "", false, ErrInvalid
	}
	if input.KeyID != "" && validateIdentifier(input.KeyID, "revocation key scope") != nil {
		return "", false, ErrInvalid
	}
	if input.Issuer != "" && validateCanonicalText(input.Issuer, "revocation issuer scope", 4096) != nil {
		return "", false, ErrInvalid
	}
	now = canonicalTime(now)
	input.EffectiveAt = canonicalTime(input.EffectiveAt)
	request, err := prepareMutationLedgerRequest(
		workspaceID, actorID, idempotencyKey, mutationRevocation,
		revocationMutationPayload{
			EvidenceID: input.EvidenceID, Issuer: input.Issuer, KeyID: input.KeyID,
			ReasonCode: input.ReasonCode, Reason: input.Reason,
			EffectiveAt:        formatInstant(input.EffectiveAt),
			ExpectedScopeState: expectedScopeState,
		},
	)
	if err != nil {
		return "", false, err
	}
	result, replayed, err := runMutationWithRetry(ctx, func() (revocationMutationResult, bool, error) {
		return repository.createRevocationOnce(ctx, request, input, actorID, now)
	})
	return result.RevocationID, replayed, err
}

func (repository *Repository) createRevocationOnce(
	ctx context.Context,
	request mutationLedgerRequest,
	input RevocationInput,
	actorID string,
	now time.Time,
) (revocationMutationResult, bool, error) {
	idDigest := digestBytes([]byte(fmt.Sprintf("%s\x00%s\x00%s\x00%s\x00%s\x00%s",
		request.WorkspaceID, input.EvidenceID, input.Issuer, input.KeyID,
		formatInstant(input.EffectiveAt), input.ReasonCode+"\x00"+input.Reason+"\x00"+actorID)))
	id := "revocation-" + strings.TrimPrefix(idDigest, "sha256-")[:40]
	record, recordBytes, err := buildTrustRevocationRecord(
		id, input, actorID, now,
	)
	if err != nil {
		return revocationMutationResult{}, false, err
	}
	tx, err := repository.db.BeginTx(ctx, nil)
	if err != nil {
		return revocationMutationResult{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	replayBytes, replayed, err := lockMutationRequest(ctx, tx, request)
	if err != nil {
		return revocationMutationResult{}, false, err
	}
	if replayed {
		result, err := decodeMutationResult[revocationMutationResult](replayBytes)
		return result, true, err
	}
	scopeIdentity := fmt.Sprintf(
		"revocation:%s:%s:%s:%s",
		request.WorkspaceID, input.EvidenceID, input.Issuer, input.KeyID,
	)
	if err := lockMutationResource(ctx, tx, scopeIdentity); err != nil {
		return revocationMutationResult{}, false, err
	}
	if input.EvidenceID != "" {
		var marker int
		if err := tx.QueryRowContext(ctx, `SELECT 1 FROM verification_evidence
WHERE workspace_id = $1 AND id = $2 FOR SHARE`, request.WorkspaceID, input.EvidenceID).Scan(&marker); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return revocationMutationResult{}, false, ErrNotFound
			}
			return revocationMutationResult{}, false, err
		}
	}
	var scopeExists bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (
	SELECT 1
	FROM verification_trust_revocations
	WHERE workspace_id = $1
		AND evidence_id IS NOT DISTINCT FROM $2::text
		AND issuer IS NOT DISTINCT FROM $3::text
		AND key_id IS NOT DISTINCT FROM $4::text
)`, request.WorkspaceID, nullableString(input.EvidenceID),
		nullableString(input.Issuer), nullableString(input.KeyID)).Scan(&scopeExists); err != nil {
		return revocationMutationResult{}, false, err
	}
	if scopeExists {
		return revocationMutationResult{}, false, ErrConflict
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO verification_trust_revocations (
	id, workspace_id, evidence_id, issuer, key_id, reason_code, reason,
	actor_id, effective_at, created_at, record_digest, record_json, record_bytes
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)`,
		id, request.WorkspaceID, nullableString(input.EvidenceID),
		nullableString(input.Issuer), nullableString(input.KeyID), input.ReasonCode,
		input.Reason, actorID, input.EffectiveAt.UTC(), now.UTC(), record.RecordDigest,
		string(recordBytes), recordBytes); err != nil {
		return revocationMutationResult{}, false, err
	}
	if err := appendAudit(ctx, tx, request.WorkspaceID, input.EvidenceID, "", actorID,
		"trust.revoked", map[string]any{
			"revocationId": id, "evidenceId": nullableString(input.EvidenceID),
			"issuer": nullableString(input.Issuer), "keyId": nullableString(input.KeyID),
			"effectiveAt": formatInstant(input.EffectiveAt),
		}, now); err != nil {
		return revocationMutationResult{}, false, err
	}
	result := revocationMutationResult{RevocationID: id}
	if err := storeMutationResult(ctx, tx, request, result, now); err != nil {
		return revocationMutationResult{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return revocationMutationResult{}, false, err
	}
	return result, false, nil
}

func buildTrustRevocationRecord(
	id string,
	input RevocationInput,
	actorID string,
	recordedAt time.Time,
) (TrustRevocationRecord, []byte, error) {
	var scope any
	switch {
	case input.EvidenceID != "":
		scope = struct {
			Kind       string `json:"kind"`
			EvidenceID string `json:"evidenceId"`
		}{Kind: "evidence", EvidenceID: input.EvidenceID}
	case input.KeyID != "":
		scope = struct {
			Kind   string `json:"kind"`
			Issuer string `json:"issuer"`
			KeyID  string `json:"keyId"`
		}{Kind: "key", Issuer: input.Issuer, KeyID: input.KeyID}
	default:
		scope = struct {
			Kind   string `json:"kind"`
			Issuer string `json:"issuer"`
		}{Kind: "issuer", Issuer: input.Issuer}
	}
	record := TrustRevocationRecord{
		Format: "prodivix.verification-trust-revocation", Version: 1,
		ID: id, Scope: scope, ReasonCode: input.ReasonCode, Reason: input.Reason,
		ActorID: actorID, RecordedAt: formatInstant(recordedAt),
		EffectiveAt: formatInstant(input.EffectiveAt),
	}
	digest, _, err := digestWithoutField(record, "recordDigest")
	if err != nil {
		return TrustRevocationRecord{}, nil, err
	}
	record.RecordDigest = digest
	encoded, err := canonicalBytes(record)
	return record, encoded, err
}
