package environment

import (
	"bytes"
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

type encryptedCanaryArgument struct {
	canary []byte
}

func (argument encryptedCanaryArgument) Match(value driver.Value) bool {
	bytesValue, ok := value.([]byte)
	return ok && len(bytesValue) > 0 && !bytes.Contains(bytesValue, argument.canary)
}

func TestPutSnapshotPersistsOnlyEncryptedSecretMaterial(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	store := NewStore(database, testMasterKey())
	store.now = func() time.Time { return time.Unix(1_000, 0).UTC() }
	canary := "prodivix-secret-canary"
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT owner_id FROM workspaces WHERE id = $1")).WithArgs("workspace-1").WillReturnRows(sqlmock.NewRows([]string{"owner_id"}).AddRow("principal-1"))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT id, owner_id, current_revision FROM execution_environments WHERE workspace_id = $1 AND environment_key = $2 FOR UPDATE")).WithArgs("workspace-1", "environment-1").WillReturnError(sql.ErrNoRows)
	mock.ExpectExec("INSERT INTO execution_environments").WithArgs(sqlmock.AnyArg(), "workspace-1", "environment-1", "principal-1", "live", sqlmock.AnyArg(), store.now()).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO execution_environment_revisions").WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), "session-1", store.now()).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO execution_environment_secret_materials").WithArgs(
		sqlmock.AnyArg(), sqlmock.AnyArg(), "access-token",
		secretEnvelopeAlgorithm, staticKeyRingProviderID, "legacy-v1",
		sqlmock.AnyArg(), encryptedCanaryArgument{canary: []byte(canary)}, sqlmock.AnyArg(), encryptedCanaryArgument{canary: []byte(canary)},
	).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()
	snapshot, err := store.PutSnapshot(t.Context(), PutSnapshotInput{
		Principal: PrincipalSession{PrincipalID: "principal-1", SessionID: "session-1"}, WorkspaceID: "workspace-1", EnvironmentID: "environment-1", Mode: "live",
		PublicBindings: map[string]any{"endpoint": "https://api.example.test"}, Secrets: map[string]string{"access-token": canary},
	})
	if err != nil {
		t.Fatalf("put snapshot: %v", err)
	}
	serialized, _ := json.Marshal(snapshot)
	if bytes.Contains(serialized, []byte(canary)) {
		t.Fatal("snapshot contains Secret canary")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestUseSecretRequiresExactPrincipalSessionAndClearsCallbackMaterial(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	store := NewStore(database, testMasterKey())
	store.now = func() time.Time { return time.Unix(1_000, 0).UTC() }
	canary := []byte("prodivix-secret-canary")
	nonce, ciphertext, err := store.cipher.encrypt(canary, secretAdditionalData("workspace-1", "environment-1", "revision-1", "access-token"))
	if err != nil {
		t.Fatal(err)
	}
	bindings, _ := json.Marshal([]SecretBindingGrant{{BindingID: "access-token", Field: "source.authorization"}})
	query := `SELECT e\.id, g\.secret_bindings_json`
	mock.ExpectQuery(query).WithArgs("grant-1", "workspace-1", "environment-1", "revision-1", "principal-1", "session-1", "provider-1", "data-operation", "data/list", "access-token").WillReturnRows(sqlmock.NewRows([]string{"id", "secret_bindings_json", "expires_at", "algorithm", "key_provider", "key_id", "wrapped_key_nonce", "wrapped_key", "nonce", "ciphertext"}).AddRow("env_storage-1", bindings, store.now().Add(time.Minute), nil, nil, nil, nil, nil, nonce, ciphertext))
	mock.ExpectExec("INSERT INTO execution_environment_resolution_audit").WithArgs("grant-1", "env_storage-1", "revision-1", "workspace-1", "principal-1", "session-1", "provider-1", "data-operation", "data/list", "access-token", "source.authorization", store.now()).WillReturnResult(sqlmock.NewResult(1, 1))
	var callbackMaterial []byte
	err = store.UseSecret(t.Context(), UseSecretInput{GrantID: "grant-1", Principal: PrincipalSession{PrincipalID: "principal-1", SessionID: "session-1"}, WorkspaceID: "workspace-1", EnvironmentID: "environment-1", Revision: "revision-1", ProviderID: "provider-1", PurposeKind: "data-operation", ResourceID: "data/list", BindingID: "access-token", Field: "source.authorization"}, func(material []byte) error {
		callbackMaterial = material
		if !bytes.Equal(material, canary) {
			t.Fatal("consumer did not receive exact Secret")
		}
		return nil
	})
	if err != nil {
		t.Fatalf("use Secret: %v; SQL: %v", err, mock.ExpectationsWereMet())
	}
	if !bytes.Equal(callbackMaterial, make([]byte, len(callbackMaterial))) {
		t.Fatal("callback Secret material was not cleared after use")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestUseSecretDecryptsOnlyTheExactKMSWrappedEnvelope(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	store := NewStoreWithKeyRing(database, "", "key-2026-07", map[string]string{"key-2026-07": encodedKey(0x77)})
	store.now = func() time.Time { return time.Unix(1_000, 0).UTC() }
	canary := []byte("prodivix-kms-secret-canary")
	envelope, err := store.envelopeCipher.encrypt(t.Context(), canary, secretAdditionalData("workspace-1", "environment-1", "revision-1", "access-token"))
	if err != nil {
		t.Fatal(err)
	}
	bindings, _ := json.Marshal([]SecretBindingGrant{{BindingID: "access-token", Field: "source.authorization"}})
	mock.ExpectQuery(`SELECT e\.id, g\.secret_bindings_json`).WithArgs("grant-1", "workspace-1", "environment-1", "revision-1", "principal-1", "session-1", "provider-1", "data-operation", "data/list", "access-token").WillReturnRows(
		sqlmock.NewRows([]string{"id", "secret_bindings_json", "expires_at", "algorithm", "key_provider", "key_id", "wrapped_key_nonce", "wrapped_key", "nonce", "ciphertext"}).AddRow(
			"env_storage-1", bindings, store.now().Add(time.Minute), envelope.Algorithm, envelope.KeyProvider, envelope.KeyID, envelope.WrappedKeyNonce, envelope.WrappedKey, envelope.Nonce, envelope.Ciphertext,
		),
	)
	mock.ExpectExec("INSERT INTO execution_environment_resolution_audit").WithArgs("grant-1", "env_storage-1", "revision-1", "workspace-1", "principal-1", "session-1", "provider-1", "data-operation", "data/list", "access-token", "source.authorization", store.now()).WillReturnResult(sqlmock.NewResult(1, 1))
	var callbackMaterial []byte
	err = store.UseSecret(t.Context(), UseSecretInput{GrantID: "grant-1", Principal: PrincipalSession{PrincipalID: "principal-1", SessionID: "session-1"}, WorkspaceID: "workspace-1", EnvironmentID: "environment-1", Revision: "revision-1", ProviderID: "provider-1", PurposeKind: "data-operation", ResourceID: "data/list", BindingID: "access-token", Field: "source.authorization"}, func(material []byte) error {
		callbackMaterial = material
		if !bytes.Equal(material, canary) {
			t.Fatal("consumer did not receive exact KMS-wrapped Secret")
		}
		return nil
	})
	if err != nil {
		t.Fatalf("use KMS-wrapped Secret: %v", err)
	}
	if !bytes.Equal(callbackMaterial, make([]byte, len(callbackMaterial))) {
		t.Fatal("KMS-wrapped callback Secret material was not cleared")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestIssueGrantRequiresAnActiveDurableSession(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	store := NewStore(database, testMasterKey())
	store.now = func() time.Time { return time.Unix(1_000, 0).UTC() }
	secretIDs, _ := json.Marshal([]string{"access-token"})
	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT e\.id, r\.secret_binding_ids_json`).WithArgs("environment-1", "workspace-1", "principal-1", "revision-1", "session-1", store.now()).WillReturnRows(sqlmock.NewRows([]string{"id", "secret_binding_ids_json"}).AddRow("env_storage-1", secretIDs))
	mock.ExpectExec("INSERT INTO execution_environment_grants").WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO execution_environment_resolution_audit").WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()
	grant, err := store.IssueGrant(t.Context(), IssueGrantInput{
		Principal: PrincipalSession{PrincipalID: "principal-1", SessionID: "session-1"}, WorkspaceID: "workspace-1", EnvironmentID: "environment-1", Revision: "revision-1",
		ProviderID: "provider-1", ProviderIsolation: "remote-isolated", ExecutionClass: "isolated-runner", RuntimeZone: "server", PurposeKind: "data-operation", ResourceID: "data/list",
		SecretBindings: []SecretBindingGrant{{BindingID: "access-token", Field: "source.authorization"}}, ExpiresAt: store.now().Add(time.Minute),
	})
	if err != nil || grant == nil || grant.Principal.SessionID != "session-1" {
		t.Fatalf("issue active-session grant: %#v, %v", grant, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}

	database2, mock2, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database2.Close()
	store2 := NewStore(database2, testMasterKey())
	store2.now = store.now
	mock2.ExpectBegin()
	mock2.ExpectQuery(`SELECT e\.id, r\.secret_binding_ids_json`).WithArgs("environment-1", "workspace-1", "principal-1", "revision-1", "expired-session", store.now()).WillReturnError(sql.ErrNoRows)
	mock2.ExpectRollback()
	_, err = store2.IssueGrant(t.Context(), IssueGrantInput{
		Principal: PrincipalSession{PrincipalID: "principal-1", SessionID: "expired-session"}, WorkspaceID: "workspace-1", EnvironmentID: "environment-1", Revision: "revision-1",
		ProviderID: "provider-1", ProviderIsolation: "remote-isolated", ExecutionClass: "isolated-runner", RuntimeZone: "server", PurposeKind: "data-operation", ResourceID: "data/list",
		SecretBindings: []SecretBindingGrant{{BindingID: "access-token", Field: "source.authorization"}}, ExpiresAt: store.now().Add(time.Minute),
	})
	if !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("expected expired session denial, got %v", err)
	}
	if err := mock2.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

const useSecretStorageID = "env-storage-1"

// useSecretMock wires the exact grant/material lookup UseSecret performs so a test can
// concentrate on what happens around the consumer callback.
func useSecretMock(t *testing.T) (*Store, sqlmock.Sqlmock, func()) {
	t.Helper()
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	store := NewStore(database, testMasterKey())
	store.now = func() time.Time { return time.Unix(1_000, 0).UTC() }
	nonce, ciphertext, err := store.cipher.encrypt([]byte("prodivix-secret-canary"), secretAdditionalData("workspace-1", "environment-1", "revision-1", "access-token"))
	if err != nil {
		t.Fatal(err)
	}
	bindings, _ := json.Marshal([]SecretBindingGrant{{BindingID: "access-token", Field: "source.authorization"}})
	mock.ExpectQuery(`SELECT e\.id, g\.secret_bindings_json`).WithArgs("grant-1", "workspace-1", "environment-1", "revision-1", "principal-1", "session-1", "provider-1", "data-operation", "data/list", "access-token").WillReturnRows(
		sqlmock.NewRows([]string{"id", "secret_bindings_json", "expires_at", "algorithm", "key_provider", "key_id", "wrapped_key_nonce", "wrapped_key", "nonce", "ciphertext"}).AddRow(
			useSecretStorageID, bindings, store.now().Add(time.Minute), nil, nil, nil, nil, nil, nonce, ciphertext,
		),
	)
	return store, mock, func() { database.Close() }
}

func useSecretInput() UseSecretInput {
	return UseSecretInput{
		GrantID: "grant-1", Principal: PrincipalSession{PrincipalID: "principal-1", SessionID: "session-1"},
		WorkspaceID: "workspace-1", EnvironmentID: "environment-1", Revision: "revision-1", ProviderID: "provider-1",
		PurposeKind: "data-operation", ResourceID: "data/list", BindingID: "access-token", Field: "source.authorization",
	}
}

func TestUseSecretAuditsEveryReleaseIncludingFailedConsumers(t *testing.T) {
	store, mock, closeDatabase := useSecretMock(t)
	defer closeDatabase()
	mock.ExpectExec("INSERT INTO execution_environment_resolution_audit").WithArgs("grant-1", useSecretStorageID, "revision-1", "workspace-1", "principal-1", "session-1", "provider-1", "data-operation", "data/list", "access-token", "source.authorization", store.now()).WillReturnResult(sqlmock.NewResult(1, 1))
	consumerErr := errors.New("upstream transport failed")
	err := store.UseSecret(t.Context(), useSecretInput(), func([]byte) error { return consumerErr })
	if !errors.Is(err, consumerErr) {
		t.Fatalf("expected the consumer error to propagate, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("secret use was not audited: %v", err)
	}
}

func TestUseSecretWithholdsMaterialWhenTheAuditWriteFails(t *testing.T) {
	store, mock, closeDatabase := useSecretMock(t)
	defer closeDatabase()
	auditErr := errors.New("audit insert failed")
	mock.ExpectExec("INSERT INTO execution_environment_resolution_audit").WillReturnError(auditErr)
	consumed := false
	err := store.UseSecret(t.Context(), useSecretInput(), func([]byte) error {
		consumed = true
		return nil
	})
	if !errors.Is(err, auditErr) {
		t.Fatalf("expected the audit error, got %v", err)
	}
	if consumed {
		t.Fatal("Secret material was released without a durable audit row")
	}
}

func TestDetachedDatabaseContextSurvivesCallerCancellation(t *testing.T) {
	cancelled, cancel := context.WithCancel(t.Context())
	cancel()
	detached, release := detachedDatabaseContext(cancelled)
	defer release()
	if detached.Err() != nil {
		t.Fatalf("detached context inherited caller cancellation: %v", detached.Err())
	}
}

// One tenant naming an environment "production" must not consume that name for
// every other tenant, so the row lookup is scoped by workspace and the stored
// row id is server owned rather than the client-supplied name.
func TestPutSnapshotScopesEnvironmentIdentityToItsWorkspace(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	store := NewStore(database, testMasterKey())
	store.now = func() time.Time { return time.Unix(1_000, 0).UTC() }

	var storedID, storedWorkspaceID, storedKey string
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT owner_id FROM workspaces WHERE id = $1")).
		WithArgs("workspace-b").
		WillReturnRows(sqlmock.NewRows([]string{"owner_id"}).AddRow("principal-b"))
	mock.ExpectQuery(regexp.QuoteMeta("FROM execution_environments WHERE workspace_id = $1 AND environment_key = $2 FOR UPDATE")).
		WithArgs("workspace-b", "production").
		WillReturnError(sql.ErrNoRows)
	mock.ExpectExec("INSERT INTO execution_environments").WithArgs(
		capturedArgument{into: &storedID},
		capturedArgument{into: &storedWorkspaceID},
		capturedArgument{into: &storedKey},
		"principal-b", "mock", sqlmock.AnyArg(), store.now(),
	).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO execution_environment_revisions").
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), "session-b", store.now()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	snapshot, err := store.PutSnapshot(t.Context(), PutSnapshotInput{
		Principal:     PrincipalSession{PrincipalID: "principal-b", SessionID: "session-b"},
		WorkspaceID:   "workspace-b",
		EnvironmentID: "production",
		Mode:          "mock",
	})
	if err != nil {
		t.Fatalf("put snapshot in a second workspace: %v", err)
	}
	if snapshot.EnvironmentID != "production" || snapshot.WorkspaceID != "workspace-b" {
		t.Fatalf("unexpected snapshot identity: %+v", snapshot)
	}
	if storedWorkspaceID != "workspace-b" || storedKey != "production" {
		t.Fatalf("environment identity was not scoped to its workspace: workspace %q key %q", storedWorkspaceID, storedKey)
	}
	if storedID == "production" || storedID == "" {
		t.Fatalf("stored row id must be server owned, got %q", storedID)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

type capturedArgument struct {
	into *string
}

func (argument capturedArgument) Match(value driver.Value) bool {
	text, ok := value.(string)
	if !ok {
		return false
	}
	*argument.into = text
	return true
}
