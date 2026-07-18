package environment

import (
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

var rotationColumns = []string{
	"workspace_id", "environment_id", "revision", "binding_id", "algorithm", "key_provider", "key_id",
	"wrapped_key_nonce", "wrapped_key", "nonce", "ciphertext",
}

func TestRotateSecretMaterialsMigratesLegacyRowsAtomically(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	legacyKey := encodedKey(0x22)
	store := NewStoreWithKeyRing(database, legacyKey, "key-2026-07", map[string]string{
		"key-2026-07": encodedKey(0x77),
	})
	store.now = func() time.Time { return time.Unix(2_000, 0).UTC() }
	canary := []byte("legacy-secret-canary")
	aad := secretAdditionalData("workspace-1", "environment-1", "revision-1", "binding-1")
	nonce, ciphertext, err := store.cipher.encrypt(canary, aad)
	if err != nil {
		t.Fatal(err)
	}

	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT e\.workspace_id`).WithArgs(staticKeyRingProviderID, "key-2026-07", 8).WillReturnRows(
		sqlmock.NewRows(rotationColumns).AddRow("workspace-1", "environment-1", "revision-1", "binding-1", nil, nil, nil, nil, nil, nonce, ciphertext),
	)
	mock.ExpectExec(`UPDATE execution_environment_secret_materials`).WithArgs(
		secretEnvelopeAlgorithm, staticKeyRingProviderID, "key-2026-07", sqlmock.AnyArg(), encryptedCanaryArgument{canary: canary}, sqlmock.AnyArg(), encryptedCanaryArgument{canary: canary},
		"environment-1", "revision-1", "binding-1",
	).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(`SELECT COUNT\(\*\) FROM execution_environment_secret_materials`).WithArgs(staticKeyRingProviderID, "key-2026-07").WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectExec(`INSERT INTO execution_environment_key_rotation_audit`).WithArgs(staticKeyRingProviderID, "key-2026-07", 1, 1, 0, store.now()).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	result, err := store.RotateSecretMaterials(t.Context(), SecretKeyRotationPolicy{ObservedAt: store.now(), BatchSize: 8})
	if err != nil {
		t.Fatal(err)
	}
	if result.ActiveKeyID != "key-2026-07" || result.RewrappedMaterials != 1 || result.MigratedLegacy != 1 || result.RemainingMaterials != 0 {
		t.Fatalf("unexpected rotation result: %#v", result)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestRotateSecretMaterialsRollsBackWhenAnOldKeyWasRetiredEarly(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	oldKMS, _ := newStaticKeyRingKMS("key-old", map[string]string{"key-old": encodedKey(0x11)})
	oldCipher, _ := newSecretEnvelopeCipher(oldKMS)
	aad := secretAdditionalData("workspace-1", "environment-1", "revision-1", "binding-1")
	envelope, err := oldCipher.encrypt(t.Context(), []byte("secret-canary"), aad)
	if err != nil {
		t.Fatal(err)
	}
	store := NewStoreWithKeyRing(database, "", "key-new", map[string]string{"key-new": encodedKey(0x77)})

	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT e\.workspace_id`).WithArgs(staticKeyRingProviderID, "key-new", 4).WillReturnRows(
		sqlmock.NewRows(rotationColumns).AddRow(
			"workspace-1", "environment-1", "revision-1", "binding-1", envelope.Algorithm, envelope.KeyProvider, envelope.KeyID,
			envelope.WrappedKeyNonce, envelope.WrappedKey, envelope.Nonce, envelope.Ciphertext,
		),
	)
	mock.ExpectRollback()
	_, err = store.RotateSecretMaterials(t.Context(), SecretKeyRotationPolicy{BatchSize: 4})
	if !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("expected an early old-key retirement to fail closed, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestRotateSecretMaterialsRejectsUnboundedPoliciesBeforeDatabaseAccess(t *testing.T) {
	store := NewStoreWithKeyRing(&sql.DB{}, "", "key-new", map[string]string{"key-new": encodedKey(0x77)})
	for _, batchSize := range []int{0, -1, maximumSecretRotationBatchSize + 1} {
		if _, err := store.RotateSecretMaterials(t.Context(), SecretKeyRotationPolicy{BatchSize: batchSize}); err == nil {
			t.Fatalf("accepted rotation batch size %d", batchSize)
		}
	}
}
