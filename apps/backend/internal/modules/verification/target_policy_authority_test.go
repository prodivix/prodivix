package verification

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

const verificationPolicyCurrentDigest = "sha256-7bb79b219540c48c4a5645b6d5d6ec13555ea6893f927d575726d8f1c083f268"

func verificationPolicyWireFixture() json.RawMessage {
	return json.RawMessage(`{
		"id":"policy.default",
		"name":"Default verification policy",
		"defaultRequirement":"advisory",
		"rules":[{
			"id":"rule.critical-browser",
			"requirement":"required",
			"checkKinds":["visual","e2e"],
			"scenarioIds":[],
			"scenarioTags":[],
			"criticalities":["critical"],
			"impactedDomains":[],
			"riskFlags":[],
			"matrixProfileId":"matrix.critical-browser",
			"retryPolicyId":"retry.infrastructure",
			"evidenceTrust":"ci-attested",
			"controlProfileRef":{
				"kind":"workspace",
				"documentId":"control.hermetic",
				"digest":"sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
			},
			"fixtureSetRef":{
				"documentId":"fixture.catalog",
				"digest":"sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
			},
			"baselineSetRef":{
				"documentId":"baseline.catalog",
				"digest":"sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
			}
		}],
		"matrixProfiles":[{
			"id":"matrix.critical-browser",
			"name":"Critical browser matrix",
			"matrix":{
				"frameworkTargets":["react-vite"],
				"surfaces":["preview","ci","export"],
				"browserEngines":["chromium"],
				"viewports":[{"id":"desktop","width":1280,"height":720}],
				"colorSchemes":["light","dark"],
				"motions":["reduced","full"],
				"locales":["en-US"]
			}
		}],
		"budgets":{
			"maximumCells":500,
			"maximumCellsPerCheckKind":100,
			"maximumTargetExpansions":8,
			"maximumBrowserExpansions":3,
			"maximumClosureEvidenceRecords":1000,
			"totalMs":600000,
			"artifactBytes":100000000,
			"estimatedComputeUnits":10000,
			"parallelism":8
		},
		"retryPolicies":[{
			"id":"retry.infrastructure",
			"maximumAttempts":2,
			"retryableOutcomes":["infrastructure-error"],
			"stabilitySamples":1,
			"freshFixtureNamespace":true
		}],
		"exemptions":[],
		"artifactCapture":{"defaultCapture":"allowed","targets":[]},
		"comparison":{"allowedMismatchFields":["operating-system","browser-engine"]},
		"evidenceRequirements":{
			"acceptedTrust":["ci-attested"],
			"maximumAgeMs":86400000,
			"requireAttestation":true,
			"requireCompatibleIdentity":true,
			"requiredArtifactKinds":["screenshot","replay-record"]
		},
		"baselinePolicy":{"visual":"required-when-observed","requireCompatibleIdentity":true},
		"retentionRequest":{
			"successful":"change",
			"failed":"release",
			"protectReleaseEvidence":true
		},
		"wireVersion":1
	}`)
}

func verificationPostgreSQLCandidate(
	t *testing.T,
	artifactBody []byte,
	attemptSuffix string,
) EvidenceCandidate {
	t.Helper()
	candidate := verificationVectorCandidate(t, artifactBody, attemptSuffix)
	candidate.WorkspaceRevision = 1
	candidate.PartitionRevisions = PartitionRevisions{
		WorkspaceRev: 1,
		RouteRev:     1,
		OpSeq:        1,
		DocumentRevisions: map[string]DocumentRevision{
			"policy.default": {ContentRev: 1, MetaRev: 1},
		},
	}
	candidate.PolicyRevision = 1
	candidate.PolicyDigest = verificationPolicyCurrentDigest
	candidate.Redaction.TargetPolicy.PolicyDigest = verificationPolicyCurrentDigest
	candidate.CandidateDigest = mustDigestWithoutField(t, candidate, "candidateDigest")
	return candidate
}

func TestNormalizePersistedVerificationPolicyMatchesCoreDigest(t *testing.T) {
	normalized, projection, err := normalizePersistedVerificationPolicy(
		verificationPolicyWireFixture(),
	)
	if err != nil {
		t.Fatal(err)
	}
	digest, _, err := canonicalDigest(normalized)
	if err != nil {
		t.Fatal(err)
	}
	if digest != verificationPolicyCurrentDigest {
		t.Fatalf("normalized policy digest = %q, want Core digest %q", digest, verificationPolicyCurrentDigest)
	}
	if projection.WireVersion != 1 ||
		projection.ID != "policy.default" ||
		projection.Budgets.MaximumClosureEvidenceRecords != 1000 {
		t.Fatalf("unexpected authority projection: %+v", projection)
	}
	if got := projection.Comparison.AllowedMismatchFields; len(got) != 2 ||
		got[0] != "browser-engine" || got[1] != "operating-system" {
		t.Fatalf("comparison allowlist is not canonical: %v", got)
	}
}

func TestVerificationServiceRequiresTargetPolicyAuthority(t *testing.T) {
	database, _, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	store, err := NewFilesystemArtifactStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	_, err = NewService(
		NewRepository(database),
		store,
		allowVerificationPermissions{},
		nil,
		NewPostgreSQLAttemptGrantAuthority(database),
		NewCandidateValidator(nil),
		nil,
		ServiceConfig{
			PromotionTTL:            time.Minute,
			SessionRetention:        time.Hour,
			TombstoneGrace:          time.Minute,
			RetentionSweepInterval:  time.Minute,
			RetentionSweepBatchSize: 1,
			ResumeKey:               bytes.Repeat([]byte{0x73}, 32),
		},
	)
	if err == nil {
		t.Fatal("service accepted a nil target policy authority")
	}
}

func TestTargetPolicyAuthorityResolutionRejectsSelfReportedCapture(t *testing.T) {
	candidate := verificationVectorCandidate(t, nil, "authority-self-report")
	candidate.PolicyRevision = 7
	candidate.PolicyDigest = repeatedDigest('c')
	candidate.Redaction.TargetPolicy.PolicyDigest = candidate.PolicyDigest
	candidate.Redaction.TargetPolicy.Capture = "allowed"
	resolution := TargetPolicyAuthorityResolution{
		Authority:      "verification-policy",
		PolicyID:       "policy.default",
		PolicyRevision: candidate.PolicyRevision,
		PolicyDigest:   candidate.PolicyDigest,
		TargetPolicy: TargetPolicy{
			Authority:        "verification-policy",
			PolicyDigest:     candidate.PolicyDigest,
			SemanticTargetID: candidate.TargetID,
			Capture:          "forbidden-sensitive",
		},
		MaximumClosureEvidenceRecords: 1000,
		Comparison: TargetPolicyComparison{
			Authority:    "verification-policy",
			PolicyID:     "policy.default",
			PolicyDigest: candidate.PolicyDigest,
		},
	}
	err := validateTargetPolicyAuthorityResolution(candidate, resolution)
	if err == nil || diagnosticCode(err, "") != "VER-5001" || !errors.Is(err, ErrInvalid) {
		t.Fatalf("self-reported capture mismatch was not rejected with VER-5001: %v", err)
	}
}

func TestPostgreSQLTargetPolicyAuthorityGate(t *testing.T) {
	database, _ := openVerificationPostgreSQL(t)
	seedVerificationPostgreSQLWorkspace(t, database)
	store, err := NewFilesystemArtifactStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	clock := &verificationGateClock{value: mustVectorTime(t, vectorNowText)}
	service := newVerificationGateService(t, database, store, clock, nil)
	assertTargetPolicyAuthorityGate(t, database, service)
}

type fixedTargetPolicyAuthority struct {
	resolution TargetPolicyAuthorityResolution
	comparison TargetPolicyComparison
	err        error
}

func (authority fixedTargetPolicyAuthority) ResolvePromotionPolicy(
	context.Context,
	string,
	EvidenceCandidate,
) (TargetPolicyAuthorityResolution, error) {
	return authority.resolution, authority.err
}

func (authority fixedTargetPolicyAuthority) ResolveComparisonPolicy(
	context.Context,
	string,
) (TargetPolicyComparison, error) {
	return authority.comparison, authority.err
}
