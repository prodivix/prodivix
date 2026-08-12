package main

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/modules/agent"
)

func TestTrustedAttestationVerifierAcceptsOnlyConfiguredEd25519Key(t *testing.T) {
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	registry, err := json.Marshal([]trustedPublicKeyConfiguration{{
		KeyID: "g4-release-key", PublicKeyBase64URL: base64.RawURLEncoding.EncodeToString(publicKey),
	}})
	if err != nil {
		t.Fatal(err)
	}
	verifier, err := trustedAttestationVerifier(string(registry))
	if err != nil {
		t.Fatal(err)
	}
	payload := []byte(`{"format":"prodivix.agent-model-evaluation-evidence","version":2}`)
	signature := ed25519.Sign(privateKey, payload)
	verification := agent.EvaluationAuthorityAttestationVerification{
		AuthorityID: "g4-release-authority", KeyID: "g4-release-key", Algorithm: "ed25519",
		AttestedPayloadBytes: payload, SignatureBase64URL: base64.RawURLEncoding.EncodeToString(signature),
	}
	if err := verifier(context.Background(), verification); err != nil {
		t.Fatalf("valid signature was rejected: %v", err)
	}
	verification.AttestedPayloadBytes = []byte(`{"tampered":true}`)
	if err := verifier(context.Background(), verification); !errors.Is(err, agent.ErrUnauthorized) {
		t.Fatalf("tampered payload was accepted: %v", err)
	}
	verification.AttestedPayloadBytes = payload
	verification.KeyID = "untrusted-key"
	if err := verifier(context.Background(), verification); !errors.Is(err, agent.ErrUnauthorized) {
		t.Fatalf("untrusted key was accepted: %v", err)
	}
}

func TestDecodeNativeProviderStateVaultRecoveryOnly(t *testing.T) {
	if enabled, err := decodeNativeProviderStateVaultRecoveryOnly(""); err != nil || enabled {
		t.Fatalf("empty recovery mode drifted: enabled=%v err=%v", enabled, err)
	}
	if enabled, err := decodeNativeProviderStateVaultRecoveryOnly("1"); err != nil || !enabled {
		t.Fatalf("exact recovery mode was rejected: enabled=%v err=%v", enabled, err)
	}
	for _, source := range []string{"0", "true", "TRUE", " 1"} {
		if enabled, err := decodeNativeProviderStateVaultRecoveryOnly(source); err == nil || enabled {
			t.Fatalf("non-exact recovery mode %q was accepted: enabled=%v err=%v", source, enabled, err)
		}
	}
}

func TestHostedRetrievalRuntimeResourceRoleMatrix(t *testing.T) {
	values := map[string]string{}
	read := func(name string) string { return values[name] }
	for _, test := range []struct {
		name         string
		ownerPurpose string
		recoveryOnly bool
		explicit     string
		want         string
		wantErr      bool
	}{
		{name: "inactive", want: ""},
		{name: "preplan derived", ownerPurpose: "preplan", want: "preplan"},
		{name: "full derived", ownerPurpose: "full-attempt", want: "full-attempt"},
		{name: "prepare explicit", explicit: "prepare", want: "prepare"},
		{name: "cleanup explicit", explicit: "cleanup", want: "cleanup"},
		{name: "recovery explicit", explicit: "recovery", want: "recovery"},
		{name: "vault recovery derived", recoveryOnly: true, want: "recovery"},
		{name: "runner role cannot be overridden", ownerPurpose: "preplan", explicit: "prepare", wantErr: true},
		{name: "vault recovery cannot be overridden", recoveryOnly: true, explicit: "recovery", wantErr: true},
		{name: "foreign role", explicit: "all", wantErr: true},
		{name: "foreign owner purpose", ownerPurpose: "foreign", wantErr: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			values[hostedRetrievalRuntimeResourceRoleEnvironment] = test.explicit
			role, err := evaluationHostedRetrievalRuntimeResourceRole(read, test.ownerPurpose, test.recoveryOnly)
			if (err != nil) != test.wantErr || role != test.want {
				t.Fatalf("hosted role drifted: role=%q err=%v want=%q wantErr=%v", role, err, test.want, test.wantErr)
			}
		})
	}
	if role, err := evaluationHostedRetrievalRuntimeResourceRole(nil, "", false); err == nil || role != "" {
		t.Fatalf("nil hosted role reader was accepted: role=%q err=%v", role, err)
	}
}

func TestHostedRetrievalRuntimeResourceLifecycleOwnerInstanceRoleMatrix(t *testing.T) {
	values := map[string]string{}
	read := func(name string) string { return values[name] }
	for _, role := range []string{"prepare", "cleanup", "recovery"} {
		if owner, err := evaluationHostedRetrievalRuntimeResourceLifecycleOwnerInstanceID(read, role); err == nil || owner != "" {
			t.Fatalf("role %q accepted a missing lifecycle owner: owner=%q err=%v", role, owner, err)
		}
	}
	values[hostedRetrievalRuntimeResourceLifecycleOwnerInstanceEnvironment] = "hosted-lifecycle-owner.01"
	for _, role := range []string{"prepare", "cleanup", "recovery"} {
		owner, err := evaluationHostedRetrievalRuntimeResourceLifecycleOwnerInstanceID(read, role)
		if err != nil || owner != values[hostedRetrievalRuntimeResourceLifecycleOwnerInstanceEnvironment] {
			t.Fatalf("role %q rejected its lifecycle owner: owner=%q err=%v", role, owner, err)
		}
	}
	for _, role := range []string{"", "preplan", "full-attempt"} {
		if owner, err := evaluationHostedRetrievalRuntimeResourceLifecycleOwnerInstanceID(read, role); err == nil || owner != "" {
			t.Fatalf("role %q consumed an out-of-scope lifecycle owner: owner=%q err=%v", role, owner, err)
		}
	}
	delete(values, hostedRetrievalRuntimeResourceLifecycleOwnerInstanceEnvironment)
	for _, role := range []string{"", "preplan", "full-attempt"} {
		if owner, err := evaluationHostedRetrievalRuntimeResourceLifecycleOwnerInstanceID(read, role); err != nil || owner != "" {
			t.Fatalf("role %q required a lifecycle owner: owner=%q err=%v", role, owner, err)
		}
	}
	values[hostedRetrievalRuntimeResourceLifecycleOwnerInstanceEnvironment] = "invalid owner"
	if owner, err := evaluationHostedRetrievalRuntimeResourceLifecycleOwnerInstanceID(read, "prepare"); err == nil || owner != "" {
		t.Fatalf("invalid lifecycle owner was accepted: owner=%q err=%v", owner, err)
	}
	if owner, err := evaluationHostedRetrievalRuntimeResourceLifecycleOwnerInstanceID(nil, "cleanup"); err == nil || owner != "" {
		t.Fatalf("nil required lifecycle owner reader was accepted: owner=%q err=%v", owner, err)
	}
}

func TestCapabilityEffectProviderJournalOwnerInstanceIsRequired(t *testing.T) {
	values := map[string]string{}
	read := func(name string) string { return values[name] }
	if ownerInstanceID, err := evaluationCapabilityEffectProviderJournalOwnerInstanceID(read, true); err == nil || ownerInstanceID != "" {
		t.Fatalf("missing journal owner was accepted: owner=%q err=%v", ownerInstanceID, err)
	}
	values[capabilityEffectProviderJournalOwnerEnvironment] = "g4-provider-journal-owner-01"
	if ownerInstanceID, err := evaluationCapabilityEffectProviderJournalOwnerInstanceID(read, true); err != nil || ownerInstanceID != values[capabilityEffectProviderJournalOwnerEnvironment] {
		t.Fatalf("configured journal owner was rejected: owner=%q err=%v", ownerInstanceID, err)
	}
	for _, invalid := range []string{"bad identity", "sk-12345678", strings.Repeat("a", 257)} {
		values[capabilityEffectProviderJournalOwnerEnvironment] = invalid
		if ownerInstanceID, err := evaluationCapabilityEffectProviderJournalOwnerInstanceID(read, true); err == nil || ownerInstanceID != "" {
			t.Fatalf("invalid journal owner %q was accepted: owner=%q err=%v", invalid, ownerInstanceID, err)
		}
	}
	if ownerInstanceID, err := evaluationCapabilityEffectProviderJournalOwnerInstanceID(nil, true); err == nil || ownerInstanceID != "" {
		t.Fatalf("nil environment reader was accepted: owner=%q err=%v", ownerInstanceID, err)
	}
	if ownerInstanceID, err := evaluationCapabilityEffectProviderJournalOwnerInstanceID(nil, false); err != nil || ownerInstanceID != "" {
		t.Fatalf("inactive journal scope required an owner: owner=%q err=%v", ownerInstanceID, err)
	}
}

func TestTrustedAttestationVerifierRejectsMalformedRegistry(t *testing.T) {
	for _, source := range []string{
		"",
		`[]`,
		`[{"keyId":"key","publicKeyBase64Url":"invalid"}]`,
		`[{"keyId":"key","publicKeyBase64Url":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","extra":true}]`,
	} {
		if verifier, err := trustedAttestationVerifier(source); err == nil || verifier != nil {
			t.Fatalf("malformed registry was accepted: %q", source)
		}
	}
}

func TestEvaluationLedgerListenAddressMustBeLoopback(t *testing.T) {
	for _, address := range []string{"127.0.0.1:8790", "localhost:8790", "[::1]:8790"} {
		if !isLoopbackAddress(address) {
			t.Fatalf("loopback address was rejected: %s", address)
		}
	}
	for _, address := range []string{":8790", "0.0.0.0:8790", "[::]:8790", "example.com:8790", "127.0.0.1", "127.0.0.1:0", "127.0.0.1:http"} {
		if isLoopbackAddress(address) {
			t.Fatalf("non-loopback address was accepted: %s", address)
		}
	}
}

func TestEvaluationHoldoutEnvironmentRequiresCompleteProductionAuthority(t *testing.T) {
	values := map[string]string{}
	read := func(name string) string { return values[name] }
	configured, err := evaluationHoldoutEnvironmentConfigured(read)
	if err != nil || configured {
		t.Fatalf("absent holdout configuration = %v, %v", configured, err)
	}
	// Trust, provenance and canaries are shared with other job roles and do not
	// opt a finalize/review process into the holdout authority by themselves.
	values[trustedPublicKeysEnvironment] = "configured-elsewhere"
	values[repositoryCommitEnvironment] = "0123456789012345678901234567890123456789"
	values[secretCanariesEnvironment] = `["secret-canary-0001"]`
	values[protectedCanariesEnvironment] = `["protected-canary-0001"]`
	configured, err = evaluationHoldoutEnvironmentConfigured(read)
	if err != nil || configured {
		t.Fatalf("shared-only holdout configuration = %v, %v", configured, err)
	}
	values[commitmentPathEnvironment] = `D:\runner\commitment.json`
	if configured, err = evaluationHoldoutEnvironmentConfigured(read); err == nil || configured {
		t.Fatalf("partial holdout configuration was accepted: %v, %v", configured, err)
	}
	for _, name := range evaluationHoldoutRequiredEnvironmentNames {
		if values[name] == "" {
			values[name] = "configured"
		}
	}
	configured, err = evaluationHoldoutEnvironmentConfigured(read)
	if err != nil || !configured {
		t.Fatalf("complete holdout configuration = %v, %v", configured, err)
	}
}

func TestEvaluationHoldoutStartupCanariesUseSafeASCIIContract(t *testing.T) {
	values := map[string]string{
		secretCanariesEnvironment:    `["secret-canary-0001","secret-canary-0002"]`,
		protectedCanariesEnvironment: `["protected-canary-0001"]`,
	}
	read := func(name string) string { return values[name] }
	if err := validateEnvironmentHoldoutCanaries(read); err != nil {
		t.Fatalf("valid startup canaries were rejected: %v", err)
	}
	for _, invalid := range []string{
		`[]`,
		`["short"]`,
		`["contains\\escape"]`,
		`["contains\u0022escape"]`,
		`["contains unicode"]`,
	} {
		values[protectedCanariesEnvironment] = invalid
		if err := validateEnvironmentHoldoutCanaries(read); err == nil {
			t.Fatalf("invalid startup canaries were accepted: %s", invalid)
		}
	}
}

func TestEvaluationHumanReviewEnvironmentRequiresArtifactPartition(t *testing.T) {
	values := map[string]string{}
	read := func(name string) string { return values[name] }
	configured, err := evaluationHumanReviewEnvironmentConfigured(read)
	if err != nil || configured {
		t.Fatalf("absent human review configuration = %v, %v", configured, err)
	}
	values[repositoryCommitEnvironment] = "0123456789012345678901234567890123456789"
	configured, err = evaluationHumanReviewEnvironmentConfigured(read)
	if err != nil || !configured {
		t.Fatalf("complete human review configuration = %v, %v", configured, err)
	}
	// Artifact-partition inputs are shared with finalization and do not opt the
	// process into holdout decryption without its commitment and directory.
	if holdout, err := evaluationHoldoutEnvironmentConfigured(read); err != nil || holdout {
		t.Fatalf("artifact-partition-only holdout configuration = %v, %v", holdout, err)
	}
}

func TestOwnerAuthorityStartupRequiresCompletePurposeBoundConfiguration(t *testing.T) {
	ledgerToken := "ledger-service-token-0000000000000000000001"
	ownerToken := "owner-service-token-00000000000000000000002"
	valid := map[string]string{
		ownerAuthorityURLEnvironment:     "http://127.0.0.1:8791",
		ownerAuthorityTokenEnvironment:   ownerToken,
		ownerAuthorityPurposeEnvironment: "full-attempt",
		secretCanariesEnvironment:        `["secret-canary-production-0001"]`,
		protectedCanariesEnvironment:     `["protected-canary-production-0002"]`,
	}
	read := func(values map[string]string) func(string) string {
		return func(name string) string { return values[name] }
	}
	empty, err := evaluationOwnerAuthorityComposition(read(map[string]string{}), ledgerToken)
	if err != nil || empty.controlledAuthority != nil || empty.verificationAuthority != nil ||
		empty.runtimeFactSourceRegistrationAuthority != nil || empty.controlledScanner != nil ||
		empty.verificationScanner != nil {
		t.Fatalf("absent composition=%#v err=%v", empty, err)
	}
	for _, missing := range []string{
		ownerAuthorityURLEnvironment, ownerAuthorityTokenEnvironment,
		ownerAuthorityPurposeEnvironment,
		secretCanariesEnvironment, protectedCanariesEnvironment,
	} {
		partial := make(map[string]string, len(valid)-1)
		for name, value := range valid {
			if name != missing {
				partial[name] = value
			}
		}
		if composition, err := evaluationOwnerAuthorityComposition(read(partial), ledgerToken); err == nil ||
			composition.controlledAuthority != nil {
			t.Fatalf("missing=%s composition=%#v err=%v", missing, composition, err)
		}
	}
	samePurpose := make(map[string]string, len(valid))
	for name, value := range valid {
		samePurpose[name] = value
	}
	samePurpose[ownerAuthorityTokenEnvironment] = ledgerToken
	if _, err := evaluationOwnerAuthorityComposition(read(samePurpose), ledgerToken); err == nil {
		t.Fatal("owner token equal to ledger token was accepted")
	}
	invalidToken := make(map[string]string, len(valid))
	for name, value := range valid {
		invalidToken[name] = value
	}
	invalidToken[ownerAuthorityTokenEnvironment] = "short"
	if _, err := evaluationOwnerAuthorityComposition(read(invalidToken), ledgerToken); err == nil {
		t.Fatal("short owner token was accepted")
	}
	composition, err := evaluationOwnerAuthorityComposition(read(valid), ledgerToken)
	if err != nil || composition.controlledAuthority == nil || composition.verificationAuthority == nil ||
		composition.attemptAuthority == nil || composition.g3CellAdmissionAuthority == nil ||
		composition.runtimeFactSourceRegistrationAuthority != nil || composition.capabilityProbeAdmissionAuthority != nil ||
		composition.controlledScanner == nil || composition.verificationScanner == nil {
		t.Fatalf("valid composition=%#v err=%v", composition, err)
	}
	preplan := make(map[string]string, len(valid))
	for name, value := range valid {
		preplan[name] = value
	}
	preplan[ownerAuthorityPurposeEnvironment] = "preplan"
	composition, err = evaluationOwnerAuthorityComposition(read(preplan), ledgerToken)
	if err != nil || composition.controlledAuthority != nil || composition.verificationAuthority != nil ||
		composition.attemptAuthority != nil || composition.g3CellAdmissionAuthority != nil ||
		composition.capabilityProbeAdmissionAuthority == nil ||
		composition.capabilityProbeProviderResourceAuthority == nil ||
		composition.capabilityProbeProviderResourceCleanupAuthority == nil ||
		composition.runtimeFactSourceRegistrationAuthority == nil {
		t.Fatalf("preplan composition=%#v err=%v", composition, err)
	}
}
