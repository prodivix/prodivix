package agent

import (
	"bytes"
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func TestEvaluationHoldoutCanaryDigestMatchesCanonicalStringArrayVector(t *testing.T) {
	sets := EvaluationHoldoutCanarySets{
		SecretCanaries: [][]byte{
			[]byte("z-secret.canary/0002"),
			[]byte("a-secret.canary+0001"),
		},
		ProtectedHoldoutCanaries: [][]byte{[]byte("protected-canary_0001")},
	}
	signatures, secretDigest, protectedDigest, err := evaluationHoldoutCanarySignatures(sets)
	if err != nil {
		t.Fatal(err)
	}
	defer evaluationClearByteSlices(signatures)
	wantSecret, err := canonicaljson.Digest([]string{"a-secret.canary+0001", "z-secret.canary/0002"})
	if err != nil {
		t.Fatal(err)
	}
	wantProtected, err := canonicaljson.Digest([]string{"protected-canary_0001"})
	if err != nil {
		t.Fatal(err)
	}
	if secretDigest != wantSecret || protectedDigest != wantProtected {
		t.Fatalf("canary digest parity drifted: secret=%s protected=%s", secretDigest, protectedDigest)
	}
	for _, expected := range [][]byte{
		[]byte("a-secret.canary+0001"),
		[]byte("a-secret.canary%2B0001"),
		[]byte("%61%2D%73%65%63%72%65%74%2E%63%61%6E%61%72%79%2B%30%30%30%31"),
	} {
		found := false
		for _, signature := range signatures {
			if bytes.Equal(signature, expected) {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("canary signature set omitted %q", expected)
		}
	}
	clearEvaluationHoldoutCanaries(&sets)
	if sets.SecretCanaries != nil || sets.ProtectedHoldoutCanaries != nil {
		t.Fatal("canary owner buffers were retained after clearing")
	}
}

func TestEvaluationHoldoutCanaryContractRejectsEscapedAndUnicodeValues(t *testing.T) {
	for _, invalidCanary := range [][]byte{
		[]byte(`quote"canary`),
		[]byte(`slash\canary`),
		[]byte("unicode-canary-é"),
		[]byte("short"),
	} {
		sets := EvaluationHoldoutCanarySets{
			SecretCanaries:           [][]byte{append([]byte(nil), invalidCanary...)},
			ProtectedHoldoutCanaries: [][]byte{[]byte("protected-canary-0001")},
		}
		if err := validateEvaluationHoldoutCanaries(sets); err == nil {
			t.Fatalf("invalid canary was accepted: %q", invalidCanary)
		}
		clearEvaluationHoldoutCanaries(&sets)
	}
}
