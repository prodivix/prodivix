package environment

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"testing"
)

func encodedKey(fill byte) string {
	return base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{fill}, 32))
}

func TestSecretEnvelopeRewrapsOnlyDataKeyAndSupportsOldKeyRetirement(t *testing.T) {
	oldKMS, err := newStaticKeyRingKMS("key-2026-01", map[string]string{"key-2026-01": encodedKey(0x11)})
	if err != nil {
		t.Fatal(err)
	}
	oldCipher, _ := newSecretEnvelopeCipher(oldKMS)
	canary := []byte("prodivix-kms-secret-canary")
	aad := []byte("workspace\x00environment\x00revision\x00binding")
	original, err := oldCipher.encrypt(context.Background(), canary, aad)
	if err != nil {
		t.Fatal(err)
	}
	for _, persisted := range [][]byte{original.WrappedKeyNonce, original.WrappedKey, original.Nonce, original.Ciphertext} {
		if bytes.Contains(persisted, canary) {
			t.Fatal("persisted envelope contains the Secret canary")
		}
	}

	rotatingKMS, err := newStaticKeyRingKMS("key-2026-07", map[string]string{
		"key-2026-01": encodedKey(0x11),
		"key-2026-07": encodedKey(0x77),
	})
	if err != nil {
		t.Fatal(err)
	}
	rotatingCipher, _ := newSecretEnvelopeCipher(rotatingKMS)
	rotated, err := rotatingCipher.rewrap(context.Background(), original, aad)
	if err != nil {
		t.Fatal(err)
	}
	if rotated.KeyID != "key-2026-07" || bytes.Equal(rotated.WrappedKey, original.WrappedKey) {
		t.Fatal("rotation did not replace the wrapped data key")
	}
	if !bytes.Equal(rotated.Nonce, original.Nonce) || !bytes.Equal(rotated.Ciphertext, original.Ciphertext) {
		t.Fatal("rotation decrypted or rewrote the Secret ciphertext")
	}

	retiredKMS, err := newStaticKeyRingKMS("key-2026-07", map[string]string{"key-2026-07": encodedKey(0x77)})
	if err != nil {
		t.Fatal(err)
	}
	retiredCipher, _ := newSecretEnvelopeCipher(retiredKMS)
	if _, err := retiredCipher.decrypt(context.Background(), original, aad); !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("old envelope remained readable after old key retirement: %v", err)
	}
	material, err := retiredCipher.decrypt(context.Background(), rotated, aad)
	if err != nil || !bytes.Equal(material, canary) {
		t.Fatalf("rotated envelope is not readable by the active key: %v", err)
	}
	clearBytes(material)
	if _, err := retiredCipher.decrypt(context.Background(), rotated, []byte("wrong-context")); !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("rotated envelope accepted the wrong authenticated context: %v", err)
	}
}

func TestStaticKeyRingKMSRejectsMissingActiveAndInvalidKeys(t *testing.T) {
	for _, test := range []struct {
		active string
		keys   map[string]string
	}{
		{active: "missing", keys: map[string]string{"key-1": encodedKey(1)}},
		{active: "key-1", keys: map[string]string{"key-1": "not-base64"}},
		{active: "bad key", keys: map[string]string{"bad key": encodedKey(1)}},
		{active: "", keys: map[string]string{}},
	} {
		if _, err := newStaticKeyRingKMS(test.active, test.keys); err == nil {
			t.Fatalf("accepted invalid KMS key ring: active=%q keys=%v", test.active, len(test.keys))
		}
	}
}
