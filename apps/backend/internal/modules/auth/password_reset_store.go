package auth

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

var ErrInvalidResetToken = errors.New("invalid or expired password reset token")

type PasswordResetStore struct{ db *sql.DB }

func NewPasswordResetStore(db *sql.DB) *PasswordResetStore { return &PasswordResetStore{db: db} }

func (store *PasswordResetStore) Issue(ctx context.Context, email, digest string, ttl time.Duration) (bool, error) {
	var userID string
	err := store.db.QueryRowContext(ctx, `INSERT INTO auth_password_resets (user_id, token_digest, created_at, expires_at)
SELECT id, $2, NOW(), NOW() + $3 * interval '1 second' FROM users WHERE email = $1
ON CONFLICT (user_id) DO UPDATE SET token_digest = EXCLUDED.token_digest, created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at
RETURNING user_id`, normalizeEmail(email), digest, ttl.Seconds()).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

func (store *PasswordResetStore) Revoke(ctx context.Context, digest string) error {
	_, err := store.db.ExecContext(ctx, `DELETE FROM auth_password_resets WHERE token_digest = $1`, digest)
	return err
}

// Complete consumes the token, replaces the password and revokes sessions atomically.
// DELETE locks the token row, so concurrent attempts cannot reuse the same link.
func (store *PasswordResetStore) Complete(ctx context.Context, digest string, passwordHash []byte) error {
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var userID string
	err = tx.QueryRowContext(ctx, `DELETE FROM auth_password_resets WHERE token_digest = $1 AND expires_at > NOW() RETURNING user_id`, digest).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrInvalidResetToken
	}
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE users SET password_hash = $1 WHERE id = $2`, passwordHash, userID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID); err != nil {
		return err
	}
	return tx.Commit()
}
