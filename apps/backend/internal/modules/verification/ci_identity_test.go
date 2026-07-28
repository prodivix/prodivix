package verification

import (
	"strings"
	"testing"
)

func TestCIRepositoryIdentityAcceptsOnlyCanonicalProviderNeutralIdentity(t *testing.T) {
	valid := []CIRepositoryIdentity{
		{
			Repository: "owner/repository",
			Ref:        "refs/heads/main",
			Commit:     "sha1-" + strings.Repeat("a", 40),
		},
		{
			Repository: "github:owner/repository",
			Ref:        "refs/tags/release-v5",
			Commit:     "sha256-" + strings.Repeat("b", 64),
		},
	}
	for _, identity := range valid {
		if err := validateCIRepositoryIdentity(identity); err != nil {
			t.Errorf("canonical CI identity was rejected: %#v: %v", identity, err)
		}
	}

	base := valid[0]
	invalid := map[string]CIRepositoryIdentity{
		"credential-url": {
			Repository: "https://token@example.com/owner/repository",
			Ref:        base.Ref, Commit: base.Commit,
		},
		"repository-without-owner": {
			Repository: "repository", Ref: base.Ref, Commit: base.Commit,
		},
		"non-nfc-repository": {
			Repository: "owne\u0301r/repository", Ref: base.Ref, Commit: base.Commit,
		},
		"oversized-repository": {
			Repository: "owner/" + strings.Repeat("r", 507),
			Ref:        base.Ref, Commit: base.Commit,
		},
		"unqualified-ref": {
			Repository: base.Repository, Ref: "main", Commit: base.Commit,
		},
		"ambiguous-ref": {
			Repository: base.Repository, Ref: "refs/heads/main..other", Commit: base.Commit,
		},
		"dangerous-ref": {
			Repository: base.Repository, Ref: "refs/heads/main@{1}", Commit: base.Commit,
		},
		"backslash-ref": {
			Repository: base.Repository, Ref: `refs\heads\main`, Commit: base.Commit,
		},
		"bare-commit": {
			Repository: base.Repository, Ref: base.Ref, Commit: strings.Repeat("a", 40),
		},
		"uppercase-commit": {
			Repository: base.Repository, Ref: base.Ref,
			Commit: "sha1-" + strings.Repeat("A", 40),
		},
	}
	for name, identity := range invalid {
		t.Run(name, func(t *testing.T) {
			if err := validateCIRepositoryIdentity(identity); err == nil {
				t.Fatalf("invalid CI identity was accepted: %#v", identity)
			}
		})
	}
}

func TestCandidateProvenanceCarriesCIIdentityExactlyForCIOrigin(t *testing.T) {
	candidate := verificationVectorCandidate(t, nil, "ci-origin")
	candidate.Provenance.Origin = "ci"
	candidate.Provenance.CI = verificationVectorCIIdentity()
	if err := validateProvenance(&candidate, TrustCIAttested); err != nil {
		t.Fatalf("canonical CI provenance was rejected: %v", err)
	}

	missing := candidate
	missing.Provenance.CI = nil
	if err := validateProvenance(&missing, TrustCIAttested); err == nil {
		t.Fatal("CI provenance without repository identity was accepted")
	}

	for _, origin := range []string{"local", "remote", "import"} {
		t.Run(origin, func(t *testing.T) {
			changed := candidate
			changed.Provenance.Origin = origin
			if err := validateProvenance(&changed, TrustLocalUnattested); err == nil {
				t.Fatal("non-CI provenance carrying CI identity was accepted")
			}
		})
	}
}
