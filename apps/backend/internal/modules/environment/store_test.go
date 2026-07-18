package environment

import (
	"bytes"
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
	mock.ExpectQuery(regexp.QuoteMeta("SELECT workspace_id, owner_id, current_revision FROM execution_environments WHERE id = $1 FOR UPDATE")).WithArgs("environment-1").WillReturnError(sql.ErrNoRows)
	mock.ExpectExec("INSERT INTO execution_environments").WithArgs("environment-1", "workspace-1", "principal-1", "live", sqlmock.AnyArg(), store.now()).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO execution_environment_revisions").WithArgs("environment-1", sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), "session-1", store.now()).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO execution_environment_secret_materials").WithArgs(
		"environment-1", sqlmock.AnyArg(), "access-token",
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
	query := `SELECT g\.secret_bindings_json`
	mock.ExpectQuery(query).WithArgs("grant-1", "workspace-1", "environment-1", "revision-1", "principal-1", "session-1", "provider-1", "data-operation", "data/list", "access-token").WillReturnRows(sqlmock.NewRows([]string{"secret_bindings_json", "expires_at", "algorithm", "key_provider", "key_id", "wrapped_key_nonce", "wrapped_key", "nonce", "ciphertext"}).AddRow(bindings, store.now().Add(time.Minute), nil, nil, nil, nil, nil, nonce, ciphertext))
	mock.ExpectExec("INSERT INTO execution_environment_resolution_audit").WithArgs("grant-1", "environment-1", "revision-1", "workspace-1", "principal-1", "session-1", "provider-1", "data-operation", "data/list", "access-token", "source.authorization", store.now()).WillReturnResult(sqlmock.NewResult(1, 1))
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
	mock.ExpectQuery(`SELECT g\.secret_bindings_json`).WithArgs("grant-1", "workspace-1", "environment-1", "revision-1", "principal-1", "session-1", "provider-1", "data-operation", "data/list", "access-token").WillReturnRows(
		sqlmock.NewRows([]string{"secret_bindings_json", "expires_at", "algorithm", "key_provider", "key_id", "wrapped_key_nonce", "wrapped_key", "nonce", "ciphertext"}).AddRow(
			bindings, store.now().Add(time.Minute), envelope.Algorithm, envelope.KeyProvider, envelope.KeyID, envelope.WrappedKeyNonce, envelope.WrappedKey, envelope.Nonce, envelope.Ciphertext,
		),
	)
	mock.ExpectExec("INSERT INTO execution_environment_resolution_audit").WithArgs("grant-1", "environment-1", "revision-1", "workspace-1", "principal-1", "session-1", "provider-1", "data-operation", "data/list", "access-token", "source.authorization", store.now()).WillReturnResult(sqlmock.NewResult(1, 1))
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
	mock.ExpectQuery(`SELECT r\.secret_binding_ids_json`).WithArgs("environment-1", "workspace-1", "principal-1", "revision-1", "session-1", store.now()).WillReturnRows(sqlmock.NewRows([]string{"secret_binding_ids_json"}).AddRow(secretIDs))
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
	mock2.ExpectQuery(`SELECT r\.secret_binding_ids_json`).WithArgs("environment-1", "workspace-1", "principal-1", "revision-1", "expired-session", store.now()).WillReturnError(sql.ErrNoRows)
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
