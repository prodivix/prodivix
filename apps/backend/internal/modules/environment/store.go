package environment

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

const (
	maximumPublicBindingsBytes = 256 * 1024
	maximumSecretBytes         = 64 * 1024
	maximumBindingCount        = 256
	maximumGrantDuration       = 5 * time.Minute
)

type Store struct {
	db             *sql.DB
	cipher         *secretCipher
	cipherErr      error
	envelopeCipher *secretEnvelopeCipher
	envelopeErr    error
	now            func() time.Time
}

func NewStore(db *sql.DB, encodedMasterKey string) *Store {
	encodedMasterKey = strings.TrimSpace(encodedMasterKey)
	keys := map[string]string{}
	if encodedMasterKey != "" {
		keys["legacy-v1"] = encodedMasterKey
	}
	return NewStoreWithKeyRing(db, encodedMasterKey, "legacy-v1", keys)
}

func NewStoreWithKeyRing(db *sql.DB, encodedLegacyMasterKey string, activeKeyID string, encodedKeys map[string]string) *Store {
	legacyCipher, legacyErr := newSecretCipher(strings.TrimSpace(encodedLegacyMasterKey))
	kms, kmsErr := newStaticKeyRingKMS(strings.TrimSpace(activeKeyID), encodedKeys)
	var envelopeCipher *secretEnvelopeCipher
	var envelopeErr error
	if kmsErr == nil {
		envelopeCipher, envelopeErr = newSecretEnvelopeCipher(kms)
	} else {
		envelopeErr = kmsErr
	}
	return &Store{
		db:             db,
		cipher:         legacyCipher,
		cipherErr:      legacyErr,
		envelopeCipher: envelopeCipher,
		envelopeErr:    envelopeErr,
		now:            func() time.Time { return time.Now().UTC() },
	}
}

func (store *Store) Available() bool {
	return store != nil && store.db != nil && store.envelopeCipher != nil && store.envelopeErr == nil
}

func canonical(value string) (string, bool) {
	normalized := strings.TrimSpace(value)
	return normalized, normalized == value && canonicalIdentifier.MatchString(normalized)
}

func canonicalOpaque(value string) (string, bool) {
	normalized := strings.TrimSpace(value)
	return normalized, normalized == value && normalized != "" && !strings.ContainsRune(normalized, '\x00') && len(normalized) <= 4096
}

func randomID(prefix string) (string, error) {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return prefix + "_" + hex.EncodeToString(buffer), nil
}

func normalizePrincipal(value PrincipalSession) (PrincipalSession, error) {
	principalID, principalOK := canonical(value.PrincipalID)
	sessionID, sessionOK := canonical(value.SessionID)
	if !principalOK || !sessionOK {
		return PrincipalSession{}, ErrPermissionDenied
	}
	return PrincipalSession{PrincipalID: principalID, SessionID: sessionID}, nil
}

func normalizeSnapshotInput(input PutSnapshotInput) (PutSnapshotInput, []byte, []string, error) {
	principal, err := normalizePrincipal(input.Principal)
	if err != nil {
		return PutSnapshotInput{}, nil, nil, err
	}
	workspaceID, workspaceOK := canonical(input.WorkspaceID)
	environmentID, environmentOK := canonical(input.EnvironmentID)
	if !workspaceOK || !environmentOK || (input.Mode != "mock" && input.Mode != "live") {
		return PutSnapshotInput{}, nil, nil, ErrPermissionDenied
	}
	if input.ExpectedRevision != "" {
		if _, ok := canonical(input.ExpectedRevision); !ok {
			return PutSnapshotInput{}, nil, nil, ErrRevisionConflict
		}
	}
	if len(input.PublicBindings)+len(input.Secrets) > maximumBindingCount {
		return PutSnapshotInput{}, nil, nil, errors.New("environment binding budget exceeded")
	}
	for bindingID := range input.PublicBindings {
		if _, ok := canonical(bindingID); !ok {
			return PutSnapshotInput{}, nil, nil, errors.New("public environment binding id is invalid")
		}
		if _, duplicate := input.Secrets[bindingID]; duplicate {
			return PutSnapshotInput{}, nil, nil, errors.New("environment binding kind is ambiguous")
		}
	}
	secretBindingIDs := make([]string, 0, len(input.Secrets))
	for bindingID, material := range input.Secrets {
		if _, ok := canonical(bindingID); !ok || material == "" || len(material) > maximumSecretBytes {
			return PutSnapshotInput{}, nil, nil, errors.New("Secret environment binding is invalid")
		}
		secretBindingIDs = append(secretBindingIDs, bindingID)
	}
	sort.Strings(secretBindingIDs)
	publicJSON, err := json.Marshal(input.PublicBindings)
	if err != nil || len(publicJSON) > maximumPublicBindingsBytes {
		return PutSnapshotInput{}, nil, nil, errors.New("public environment bindings are invalid")
	}
	var publicBindings map[string]any
	if err := json.Unmarshal(publicJSON, &publicBindings); err != nil {
		return PutSnapshotInput{}, nil, nil, errors.New("public environment bindings are invalid")
	}
	input.Principal = principal
	input.WorkspaceID = workspaceID
	input.EnvironmentID = environmentID
	input.PublicBindings = publicBindings
	return input, publicJSON, secretBindingIDs, nil
}

func secretAdditionalData(workspaceID string, environmentID string, revision string, bindingID string) []byte {
	return []byte(workspaceID + "\x00" + environmentID + "\x00" + revision + "\x00" + bindingID)
}

func databaseContext(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, 5*time.Second)
}

func (store *Store) PutSnapshot(ctx context.Context, rawInput PutSnapshotInput) (*Snapshot, error) {
	if !store.Available() {
		return nil, ErrUnavailable
	}
	input, publicJSON, secretBindingIDs, err := normalizeSnapshotInput(rawInput)
	if err != nil {
		return nil, err
	}
	secretBindingJSON, _ := json.Marshal(secretBindingIDs)
	revision, err := randomID("envrev")
	if err != nil {
		return nil, err
	}
	now := store.now()
	ctx, cancel := databaseContext(ctx)
	defer cancel()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	var workspaceOwner string
	if err := tx.QueryRowContext(ctx, `SELECT owner_id FROM workspaces WHERE id = $1`, input.WorkspaceID).Scan(&workspaceOwner); err != nil || workspaceOwner != input.Principal.PrincipalID {
		return nil, ErrNotFound
	}
	var existingWorkspaceID, existingOwnerID, currentRevision string
	err = tx.QueryRowContext(ctx, `SELECT workspace_id, owner_id, current_revision FROM execution_environments WHERE id = $1 FOR UPDATE`, input.EnvironmentID).Scan(&existingWorkspaceID, &existingOwnerID, &currentRevision)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	isNew := errors.Is(err, sql.ErrNoRows)
	if isNew {
		if input.ExpectedRevision != "" {
			return nil, ErrRevisionConflict
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO execution_environments (id, workspace_id, owner_id, mode, current_revision, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $6)`, input.EnvironmentID, input.WorkspaceID, input.Principal.PrincipalID, input.Mode, revision, now)
	} else {
		if existingWorkspaceID != input.WorkspaceID || existingOwnerID != input.Principal.PrincipalID {
			return nil, ErrNotFound
		}
		if input.ExpectedRevision != currentRevision {
			return nil, ErrRevisionConflict
		}
		_, err = tx.ExecContext(ctx, `UPDATE execution_environments SET mode = $1, current_revision = $2, updated_at = $3 WHERE id = $4 AND current_revision = $5`, input.Mode, revision, now, input.EnvironmentID, currentRevision)
	}
	if err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO execution_environment_revisions (environment_id, revision, public_bindings_json, secret_binding_ids_json, created_by_session_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)`, input.EnvironmentID, revision, publicJSON, secretBindingJSON, input.Principal.SessionID, now); err != nil {
		return nil, err
	}
	for _, bindingID := range secretBindingIDs {
		material := []byte(input.Secrets[bindingID])
		envelope, encryptErr := store.envelopeCipher.encrypt(ctx, material, secretAdditionalData(input.WorkspaceID, input.EnvironmentID, revision, bindingID))
		clearBytes(material)
		if encryptErr != nil {
			return nil, encryptErr
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO execution_environment_secret_materials (environment_id, revision, binding_id, algorithm, key_provider, key_id, wrapped_key_nonce, wrapped_key, nonce, ciphertext) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, input.EnvironmentID, revision, bindingID, envelope.Algorithm, envelope.KeyProvider, envelope.KeyID, envelope.WrappedKeyNonce, envelope.WrappedKey, envelope.Nonce, envelope.Ciphertext); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &Snapshot{EnvironmentID: input.EnvironmentID, WorkspaceID: input.WorkspaceID, Revision: revision, Mode: input.Mode, PublicBindings: input.PublicBindings, SecretBindingIDs: secretBindingIDs, CreatedAt: now}, nil
}

func (store *Store) GetSnapshot(ctx context.Context, principal PrincipalSession, workspaceID string, environmentID string, revision string) (*Snapshot, error) {
	if !store.Available() {
		return nil, ErrUnavailable
	}
	principal, err := normalizePrincipal(principal)
	if err != nil {
		return nil, err
	}
	if _, ok := canonical(workspaceID); !ok {
		return nil, ErrNotFound
	}
	if _, ok := canonical(environmentID); !ok {
		return nil, ErrNotFound
	}
	ctx, cancel := databaseContext(ctx)
	defer cancel()
	var snapshot Snapshot
	var publicJSON, secretBindingJSON []byte
	query := `SELECT e.id, e.workspace_id, r.revision, e.mode, r.public_bindings_json, r.secret_binding_ids_json, r.created_at
		FROM execution_environments e JOIN execution_environment_revisions r ON r.environment_id = e.id
		WHERE e.id = $1 AND e.workspace_id = $2 AND e.owner_id = $3 AND r.revision = CASE WHEN $4 = '' THEN e.current_revision ELSE $4 END`
	err = store.db.QueryRowContext(ctx, query, environmentID, workspaceID, principal.PrincipalID, revision).Scan(&snapshot.EnvironmentID, &snapshot.WorkspaceID, &snapshot.Revision, &snapshot.Mode, &publicJSON, &secretBindingJSON, &snapshot.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if json.Unmarshal(publicJSON, &snapshot.PublicBindings) != nil || json.Unmarshal(secretBindingJSON, &snapshot.SecretBindingIDs) != nil {
		return nil, errors.New("stored environment snapshot is invalid")
	}
	return &snapshot, nil
}

func (store *Store) VerifySnapshotAccess(ctx context.Context, principal PrincipalSession, workspaceID string, environmentID string, revision string, mode string) error {
	snapshot, err := store.GetSnapshot(ctx, principal, workspaceID, environmentID, revision)
	if err != nil {
		return err
	}
	if snapshot.Revision != revision || snapshot.Mode != mode {
		return ErrPermissionDenied
	}
	return nil
}

func canResolveSecret(input IssueGrantInput) bool {
	if input.ProviderIsolation != "sandboxed" && input.ProviderIsolation != "remote-isolated" {
		return false
	}
	switch input.RuntimeZone {
	case "worker":
		return input.ExecutionClass == "isolated-runner" && input.ProviderIsolation == "remote-isolated"
	case "test":
		return input.ExecutionClass == "isolated-runner"
	case "server", "edge":
		return input.ExecutionClass == "trusted-service" || input.ExecutionClass == "isolated-runner"
	default:
		return false
	}
}

func normalizeGrantInput(input IssueGrantInput, now time.Time) (IssueGrantInput, []byte, error) {
	principal, err := normalizePrincipal(input.Principal)
	if err != nil || !canResolveSecret(input) {
		return IssueGrantInput{}, nil, ErrPermissionDenied
	}
	input.Principal = principal
	identities := []*string{&input.WorkspaceID, &input.EnvironmentID, &input.Revision, &input.ProviderID, &input.PurposeKind}
	for _, identity := range identities {
		normalized, ok := canonical(*identity)
		if !ok {
			return IssueGrantInput{}, nil, ErrPermissionDenied
		}
		*identity = normalized
	}
	if resourceID, ok := canonicalOpaque(input.ResourceID); ok {
		input.ResourceID = resourceID
	} else {
		return IssueGrantInput{}, nil, ErrPermissionDenied
	}
	if len(input.SecretBindings) == 0 || len(input.SecretBindings) > maximumBindingCount || !input.ExpiresAt.After(now) || input.ExpiresAt.After(now.Add(maximumGrantDuration)) {
		return IssueGrantInput{}, nil, ErrPermissionDenied
	}
	bindings := append([]SecretBindingGrant(nil), input.SecretBindings...)
	for index := range bindings {
		bindingID, bindingOK := canonical(bindings[index].BindingID)
		field, fieldOK := canonicalOpaque(bindings[index].Field)
		if !bindingOK || !fieldOK {
			return IssueGrantInput{}, nil, ErrPermissionDenied
		}
		bindings[index] = SecretBindingGrant{BindingID: bindingID, Field: field}
	}
	sort.Slice(bindings, func(left, right int) bool { return bindings[left].Field < bindings[right].Field })
	for index := 1; index < len(bindings); index++ {
		if bindings[index-1].Field == bindings[index].Field {
			return IssueGrantInput{}, nil, ErrPermissionDenied
		}
	}
	input.SecretBindings = bindings
	bindingJSON, err := json.Marshal(bindings)
	return input, bindingJSON, err
}

func (store *Store) IssueGrant(ctx context.Context, rawInput IssueGrantInput) (*Grant, error) {
	if !store.Available() {
		return nil, ErrUnavailable
	}
	now := store.now()
	input, bindingJSON, err := normalizeGrantInput(rawInput, now)
	if err != nil {
		return nil, err
	}
	ctx, cancel := databaseContext(ctx)
	defer cancel()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	var storedBindingJSON []byte
	query := `SELECT r.secret_binding_ids_json FROM execution_environments e
		JOIN execution_environment_revisions r ON r.environment_id = e.id
		JOIN sessions s ON s.id = $5 AND s.user_id = e.owner_id AND s.expires_at > $6
		WHERE e.id = $1 AND e.workspace_id = $2 AND e.owner_id = $3 AND r.revision = $4`
	if err := tx.QueryRowContext(ctx, query, input.EnvironmentID, input.WorkspaceID, input.Principal.PrincipalID, input.Revision, input.Principal.SessionID, now).Scan(&storedBindingJSON); err != nil {
		return nil, ErrPermissionDenied
	}
	var storedBindingIDs []string
	if json.Unmarshal(storedBindingJSON, &storedBindingIDs) != nil {
		return nil, ErrPermissionDenied
	}
	allowedBindings := make(map[string]struct{}, len(storedBindingIDs))
	for _, bindingID := range storedBindingIDs {
		allowedBindings[bindingID] = struct{}{}
	}
	for _, binding := range input.SecretBindings {
		if _, ok := allowedBindings[binding.BindingID]; !ok {
			return nil, ErrPermissionDenied
		}
	}
	grantID, err := randomID("envgrant")
	if err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO execution_environment_grants (grant_id, environment_id, revision, workspace_id, principal_id, session_id, provider_id, purpose_kind, resource_id, secret_bindings_json, expires_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, grantID, input.EnvironmentID, input.Revision, input.WorkspaceID, input.Principal.PrincipalID, input.Principal.SessionID, input.ProviderID, input.PurposeKind, input.ResourceID, bindingJSON, input.ExpiresAt, now); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO execution_environment_resolution_audit (kind, grant_id, environment_id, revision, workspace_id, principal_id, session_id, provider_id, purpose_kind, resource_id, occurred_at) VALUES ('grant-issued',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, grantID, input.EnvironmentID, input.Revision, input.WorkspaceID, input.Principal.PrincipalID, input.Principal.SessionID, input.ProviderID, input.PurposeKind, input.ResourceID, now); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &Grant{GrantID: grantID, EnvironmentID: input.EnvironmentID, Revision: input.Revision, WorkspaceID: input.WorkspaceID, Principal: input.Principal, ProviderID: input.ProviderID, PurposeKind: input.PurposeKind, ResourceID: input.ResourceID, SecretBindings: input.SecretBindings, ExpiresAt: input.ExpiresAt}, nil
}

func (store *Store) UseSecret(ctx context.Context, input UseSecretInput, consumer func([]byte) error) error {
	if !store.Available() {
		return ErrUnavailable
	}
	if consumer == nil {
		return ErrPermissionDenied
	}
	principal, err := normalizePrincipal(input.Principal)
	if err != nil {
		return err
	}
	input.Principal = principal
	identities := []string{input.GrantID, input.WorkspaceID, input.EnvironmentID, input.Revision, input.ProviderID, input.PurposeKind, input.BindingID}
	for _, identity := range identities {
		if _, ok := canonical(identity); !ok {
			return ErrPermissionDenied
		}
	}
	if _, ok := canonicalOpaque(input.ResourceID); !ok {
		return ErrPermissionDenied
	}
	if _, ok := canonicalOpaque(input.Field); !ok {
		return ErrPermissionDenied
	}
	ctx, cancel := databaseContext(ctx)
	defer cancel()
	var bindingJSON, wrappedKeyNonce, wrappedKey, nonce, ciphertext []byte
	var algorithm, keyProvider, keyID sql.NullString
	var expiresAt time.Time
	query := `SELECT g.secret_bindings_json, g.expires_at, m.algorithm, m.key_provider, m.key_id, m.wrapped_key_nonce, m.wrapped_key, m.nonce, m.ciphertext
		FROM execution_environment_grants g JOIN execution_environment_secret_materials m ON m.environment_id = g.environment_id AND m.revision = g.revision AND m.binding_id = $10
		WHERE g.grant_id=$1 AND g.workspace_id=$2 AND g.environment_id=$3 AND g.revision=$4 AND g.principal_id=$5 AND g.session_id=$6 AND g.provider_id=$7 AND g.purpose_kind=$8 AND g.resource_id=$9 AND g.revoked_at IS NULL AND g.expires_at > NOW()`
	err = store.db.QueryRowContext(ctx, query, input.GrantID, input.WorkspaceID, input.EnvironmentID, input.Revision, input.Principal.PrincipalID, input.Principal.SessionID, input.ProviderID, input.PurposeKind, input.ResourceID, input.BindingID).Scan(&bindingJSON, &expiresAt, &algorithm, &keyProvider, &keyID, &wrappedKeyNonce, &wrappedKey, &nonce, &ciphertext)
	if err != nil {
		return ErrPermissionDenied
	}
	var bindings []SecretBindingGrant
	if json.Unmarshal(bindingJSON, &bindings) != nil {
		return ErrPermissionDenied
	}
	allowed := false
	for _, binding := range bindings {
		if binding.BindingID == input.BindingID && binding.Field == input.Field {
			allowed = true
			break
		}
	}
	if !allowed || !expiresAt.After(store.now()) {
		return ErrPermissionDenied
	}
	additionalData := secretAdditionalData(input.WorkspaceID, input.EnvironmentID, input.Revision, input.BindingID)
	var material []byte
	if !algorithm.Valid && !keyProvider.Valid && !keyID.Valid && len(wrappedKeyNonce) == 0 && len(wrappedKey) == 0 {
		if store.cipher == nil || store.cipherErr != nil {
			return ErrPermissionDenied
		}
		material, err = store.cipher.decrypt(nonce, ciphertext, additionalData)
	} else if algorithm.Valid && keyProvider.Valid && keyID.Valid && len(wrappedKeyNonce) > 0 && len(wrappedKey) > 0 {
		material, err = store.envelopeCipher.decrypt(ctx, storedSecretEnvelope{
			Algorithm: algorithm.String, KeyProvider: keyProvider.String, KeyID: keyID.String,
			WrappedKeyNonce: wrappedKeyNonce, WrappedKey: wrappedKey, Nonce: nonce, Ciphertext: ciphertext,
		}, additionalData)
	} else {
		return ErrPermissionDenied
	}
	if err != nil {
		return err
	}
	defer clearBytes(material)
	if err := consumer(material); err != nil {
		return err
	}
	if !expiresAt.After(store.now()) {
		return ErrPermissionDenied
	}
	_, err = store.db.ExecContext(ctx, `INSERT INTO execution_environment_resolution_audit (kind, grant_id, environment_id, revision, workspace_id, principal_id, session_id, provider_id, purpose_kind, resource_id, binding_id, field, occurred_at) VALUES ('secret-used',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, input.GrantID, input.EnvironmentID, input.Revision, input.WorkspaceID, input.Principal.PrincipalID, input.Principal.SessionID, input.ProviderID, input.PurposeKind, input.ResourceID, input.BindingID, input.Field, store.now())
	return err
}

func (store *Store) RevokeGrant(ctx context.Context, grantID string, principal PrincipalSession) error {
	if !store.Available() {
		return ErrUnavailable
	}
	principal, err := normalizePrincipal(principal)
	if err != nil {
		return err
	}
	ctx, cancel := databaseContext(ctx)
	defer cancel()
	result, err := store.db.ExecContext(ctx, `UPDATE execution_environment_grants SET revoked_at=$1 WHERE grant_id=$2 AND principal_id=$3 AND session_id=$4 AND revoked_at IS NULL`, store.now(), grantID, principal.PrincipalID, principal.SessionID)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows != 1 {
		return ErrPermissionDenied
	}
	return nil
}

func (store *Store) String() string {
	if store == nil || store.envelopeErr == nil {
		return "environment-store"
	}
	return fmt.Sprintf("environment-store(unavailable: %v)", store.envelopeErr)
}
