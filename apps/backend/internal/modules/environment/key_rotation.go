package environment

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

const maximumSecretRotationBatchSize = 256

type SecretKeyRotationPolicy struct {
	ObservedAt time.Time
	BatchSize  int
}

type SecretKeyRotationResult struct {
	ActiveKeyID        string
	RewrappedMaterials int
	MigratedLegacy     int
	RemainingMaterials int
}

type secretMaterialRotationRow struct {
	WorkspaceID     string
	EnvironmentID   string
	Revision        string
	BindingID       string
	Algorithm       sql.NullString
	KeyProvider     sql.NullString
	KeyID           sql.NullString
	WrappedKeyNonce []byte
	WrappedKey      []byte
	Nonce           []byte
	Ciphertext      []byte
}

func (store *Store) ActiveSecretKeyID() string {
	if !store.Available() || store.envelopeCipher.kms == nil {
		return ""
	}
	return store.envelopeCipher.kms.ActiveKeyID()
}

func normalizeSecretKeyRotationPolicy(policy SecretKeyRotationPolicy, now time.Time) (SecretKeyRotationPolicy, error) {
	if policy.ObservedAt.IsZero() {
		policy.ObservedAt = now
	}
	policy.ObservedAt = policy.ObservedAt.UTC()
	if policy.BatchSize <= 0 || policy.BatchSize > maximumSecretRotationBatchSize {
		return SecretKeyRotationPolicy{}, errors.New("environment Secret key rotation batch size is invalid")
	}
	return policy, nil
}

func (store *Store) RotateSecretMaterials(ctx context.Context, rawPolicy SecretKeyRotationPolicy) (SecretKeyRotationResult, error) {
	if !store.Available() {
		return SecretKeyRotationResult{}, ErrUnavailable
	}
	policy, err := normalizeSecretKeyRotationPolicy(rawPolicy, store.now())
	if err != nil {
		return SecretKeyRotationResult{}, err
	}
	activeProvider := store.envelopeCipher.kms.ProviderID()
	activeKeyID := store.envelopeCipher.kms.ActiveKeyID()
	result := SecretKeyRotationResult{ActiveKeyID: activeKeyID}
	ctx, cancel := databaseContext(ctx)
	defer cancel()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return SecretKeyRotationResult{}, err
	}
	defer func() { _ = tx.Rollback() }()
	rows, err := tx.QueryContext(ctx, `SELECT e.workspace_id, m.environment_id, m.revision, m.binding_id, m.algorithm, m.key_provider, m.key_id, m.wrapped_key_nonce, m.wrapped_key, m.nonce, m.ciphertext
		FROM execution_environment_secret_materials m
		JOIN execution_environments e ON e.id = m.environment_id
		WHERE m.algorithm IS NULL OR m.key_provider IS DISTINCT FROM $1 OR m.key_id IS DISTINCT FROM $2
		ORDER BY m.environment_id, m.revision, m.binding_id
		LIMIT $3
		FOR UPDATE OF m SKIP LOCKED`, activeProvider, activeKeyID, policy.BatchSize)
	if err != nil {
		return SecretKeyRotationResult{}, err
	}
	rotationRows := make([]secretMaterialRotationRow, 0, policy.BatchSize)
	for rows.Next() {
		var row secretMaterialRotationRow
		if err := rows.Scan(&row.WorkspaceID, &row.EnvironmentID, &row.Revision, &row.BindingID, &row.Algorithm, &row.KeyProvider, &row.KeyID, &row.WrappedKeyNonce, &row.WrappedKey, &row.Nonce, &row.Ciphertext); err != nil {
			_ = rows.Close()
			return SecretKeyRotationResult{}, err
		}
		rotationRows = append(rotationRows, row)
	}
	if err := rows.Close(); err != nil {
		return SecretKeyRotationResult{}, err
	}
	for _, row := range rotationRows {
		additionalData := secretAdditionalData(row.WorkspaceID, row.EnvironmentID, row.Revision, row.BindingID)
		var rotated storedSecretEnvelope
		if !row.Algorithm.Valid && !row.KeyProvider.Valid && !row.KeyID.Valid && len(row.WrappedKeyNonce) == 0 && len(row.WrappedKey) == 0 {
			if store.cipher == nil || store.cipherErr != nil {
				return SecretKeyRotationResult{}, ErrPermissionDenied
			}
			material, decryptErr := store.cipher.decrypt(row.Nonce, row.Ciphertext, additionalData)
			if decryptErr != nil {
				return SecretKeyRotationResult{}, decryptErr
			}
			rotated, err = store.envelopeCipher.encrypt(ctx, material, additionalData)
			clearBytes(material)
			if err != nil {
				return SecretKeyRotationResult{}, err
			}
			result.MigratedLegacy++
		} else if row.Algorithm.Valid && row.KeyProvider.Valid && row.KeyID.Valid && len(row.WrappedKeyNonce) > 0 && len(row.WrappedKey) > 0 {
			rotated, err = store.envelopeCipher.rewrap(ctx, storedSecretEnvelope{
				Algorithm: row.Algorithm.String, KeyProvider: row.KeyProvider.String, KeyID: row.KeyID.String,
				WrappedKeyNonce: row.WrappedKeyNonce, WrappedKey: row.WrappedKey, Nonce: row.Nonce, Ciphertext: row.Ciphertext,
			}, additionalData)
			if err != nil {
				return SecretKeyRotationResult{}, err
			}
		} else {
			return SecretKeyRotationResult{}, ErrPermissionDenied
		}
		update, err := tx.ExecContext(ctx, `UPDATE execution_environment_secret_materials
			SET algorithm=$1, key_provider=$2, key_id=$3, wrapped_key_nonce=$4, wrapped_key=$5, nonce=$6, ciphertext=$7
			WHERE environment_id=$8 AND revision=$9 AND binding_id=$10`,
			rotated.Algorithm, rotated.KeyProvider, rotated.KeyID, rotated.WrappedKeyNonce, rotated.WrappedKey, rotated.Nonce, rotated.Ciphertext,
			row.EnvironmentID, row.Revision, row.BindingID)
		if err != nil {
			return SecretKeyRotationResult{}, err
		}
		updated, err := update.RowsAffected()
		if err != nil || updated != 1 {
			return SecretKeyRotationResult{}, fmt.Errorf("environment Secret key rotation lost its row fence")
		}
		result.RewrappedMaterials++
	}
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM execution_environment_secret_materials
		WHERE algorithm IS NULL OR key_provider IS DISTINCT FROM $1 OR key_id IS DISTINCT FROM $2`, activeProvider, activeKeyID).Scan(&result.RemainingMaterials); err != nil {
		return SecretKeyRotationResult{}, err
	}
	if result.RewrappedMaterials > 0 {
		if _, err := tx.ExecContext(ctx, `INSERT INTO execution_environment_key_rotation_audit
			(active_key_provider, active_key_id, rewrapped_count, migrated_legacy_count, remaining_count, occurred_at)
			VALUES ($1, $2, $3, $4, $5, $6)`, activeProvider, activeKeyID, result.RewrappedMaterials, result.MigratedLegacy, result.RemainingMaterials, policy.ObservedAt); err != nil {
			return SecretKeyRotationResult{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return SecretKeyRotationResult{}, err
	}
	return result, nil
}
