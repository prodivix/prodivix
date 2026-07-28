package verification

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"time"
)

func (repository *Repository) PrepareAttestationChallenge(
	ctx context.Context,
	workspaceID string,
	promotionID string,
	capabilityHash string,
	statement EvidenceStatement,
	statementBytes []byte,
	statementDigest string,
	nonceHash string,
	observedAt time.Time,
) (Promotion, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	if !digestPattern.MatchString(statementDigest) ||
		len(statementBytes) == 0 ||
		nonceHash == "" ||
		observedAt.IsZero() {
		return Promotion{}, ErrInvalid
	}
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return Promotion{}, err
	}
	defer func() { _ = tx.Rollback() }()
	current, err := scanPromotion(tx.QueryRowContext(ctx, promotionSelect+`
WHERE workspace_id = $1 AND id = $2 AND capability_hash = $3
FOR UPDATE`, workspaceID, promotionID, capabilityHash))
	if errors.Is(err, sql.ErrNoRows) {
		return Promotion{}, ErrUnauthorized
	}
	if err != nil {
		return Promotion{}, err
	}
	if current.State == "committed" {
		return current, tx.Commit()
	}
	if err := repository.lockCurrentWorkspaceAuthorityTx(
		ctx,
		tx,
		authorityLockPrepare,
		current,
	); err != nil {
		return Promotion{}, err
	}
	if current.State == "verification-pending" {
		if current.StatementDigest != statementDigest ||
			current.NonceHash != nonceHash ||
			!bytes.Equal(current.StatementBytes, statementBytes) {
			return Promotion{}, ErrConflict
		}
		if err := tx.Commit(); err != nil {
			return Promotion{}, err
		}
		return current, nil
	}
	if current.State != "staging" || !observedAt.Before(current.Deadline) ||
		(current.Trust != TrustRemoteAttested && current.Trust != TrustCIAttested) {
		return Promotion{}, ErrExpired
	}
	result, err := tx.ExecContext(ctx, `UPDATE verification_promotions
SET state = 'verification-pending',
	nonce_hash = $4,
	attestation_statement_bytes = $5,
	attestation_statement_digest = $6,
	version = version + 1,
	updated_at = $7
WHERE workspace_id = $1 AND id = $2 AND capability_hash = $3
	AND state = 'staging' AND version = $8`,
		workspaceID, promotionID, capabilityHash, nonceHash,
		statementBytes, statementDigest, observedAt.UTC(), current.Version)
	if err != nil {
		return Promotion{}, err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return Promotion{}, err
	}
	if updated != 1 {
		return Promotion{}, ErrConflict
	}
	current.State = "verification-pending"
	current.NonceHash = nonceHash
	current.Statement = &statement
	current.StatementBytes = append([]byte(nil), statementBytes...)
	current.StatementDigest = statementDigest
	current.Version++
	if err := tx.Commit(); err != nil {
		return Promotion{}, err
	}
	return current, nil
}
