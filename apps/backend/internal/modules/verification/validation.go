package verification

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"path"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

const (
	maximumArtifacts           = 128
	maximumArtifactBytes int64 = 16 * 1024 * 1024
	maximumTotalBytes    int64 = 64 * 1024 * 1024
	maximumImagePixels   int64 = 40_000_000
)

var (
	digestPattern       = regexp.MustCompile(`^sha256-[a-f0-9]{64}$`)
	instantPattern      = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$`)
	identifierPattern   = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$`)
	localePattern       = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?$`)
	mediaTypePattern    = regexp.MustCompile(`^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$`)
	emailPattern        = regexp.MustCompile(`(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b`)
	governmentIDPattern = regexp.MustCompile(`\b\d{3}-\d{2}-\d{4}\b`)
	bearerPattern       = regexp.MustCompile(`(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}`)
	privateKeyPattern   = regexp.MustCompile(`-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----`)
	directTokenPattern  = regexp.MustCompile(
		`\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9_]{20,}\b|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b`,
	)
	authorizationFieldPattern = regexp.MustCompile(
		`(?i)\bauthorization\s*[:=]\s*(?:"([^"\r\n]{1,1000})"|'([^'\r\n]{1,1000})'|([^\s,;\r\n]{1,1000}))`,
	)
	cookieFieldPattern = regexp.MustCompile(
		`(?i)\b(?:cookie|set-cookie)\s*[:=]\s*(?:"([^"\r\n]{1,1000})"|'([^'\r\n]{1,1000})'|([^\r\n]{1,1000}))`,
	)
	environmentSecretFieldPattern = regexp.MustCompile(
		`(?i)\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|private[_-]?key|secret)\b\s*[:=]\s*(?:"([^"\r\n]{1,1000})"|'([^'\r\n]{1,1000})'|([^\s,;\r\n]{1,1000}))`,
	)
	redactedValuePattern = regexp.MustCompile(`(?i)^(?:\[redacted\]|<redacted>|redacted|\*{3,})$`)
	digestTokenPattern   = regexp.MustCompile(`(?i)^sha(?:1|256|384|512)-[a-f0-9]+$`)
	hexTokenPattern      = regexp.MustCompile(`(?i)^[a-f0-9]{32,128}$`)
	ciRepositoryPattern  = regexp.MustCompile(
		`^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}(:[A-Za-z0-9][A-Za-z0-9._+-]{0,127})?(/[A-Za-z0-9][A-Za-z0-9._+-]{0,127})+$`,
	)
	ciCommitPattern = regexp.MustCompile(`^(sha1-[a-f0-9]{40}|sha256-[a-f0-9]{64})$`)
)

const (
	minimumEntropyTokenLength      = 24
	maximumEntropyTokenSample      = 512
	minimumEntropyUniqueCharacters = 16
	minimumEntropyBitsPerCharacter = 4.25
)

type CandidateValidator struct {
	secretCanaries []string
	now            func() time.Time
}

func NewCandidateValidator(secretCanaries []string) *CandidateValidator {
	canaries := make([]string, 0, len(secretCanaries))
	for _, canary := range secretCanaries {
		if trimmed := strings.TrimSpace(canary); len(trimmed) >= 4 {
			canaries = append(canaries, trimmed)
		}
	}
	return &CandidateValidator{
		secretCanaries: canaries,
		now:            func() time.Time { return time.Now().UTC() },
	}
}

func (validator *CandidateValidator) Validate(candidate *EvidenceCandidate, expectedWorkspaceID string) (TrustClass, error) {
	if candidate == nil {
		return "", coded("VER-5001", "Evidence candidate is required.", ErrInvalid)
	}
	if err := validateIdentifier(candidate.CandidateID, "candidateId"); err != nil {
		return "", err
	}
	for name, value := range map[string]string{
		"projectId": candidate.ProjectID, "workspaceId": candidate.WorkspaceID,
		"cellId": candidate.CellID, "checkId": candidate.CheckID,
		"targetId": candidate.TargetID, "attemptId": candidate.AttemptID,
	} {
		if err := validateIdentifier(value, name); err != nil {
			return "", err
		}
	}
	if candidate.WorkspaceID != expectedWorkspaceID {
		return "", coded("VER-4002", "Candidate workspace identity does not match the route.", ErrInvalid)
	}
	if candidate.WorkspaceRevision < 0 || candidate.WorkspaceRevision > 9007199254740991 ||
		candidate.PolicyRevision < 0 || candidate.PolicyRevision > 9007199254740991 {
		return "", coded("VER-4002", "Candidate revision is outside the canonical range.", ErrInvalid)
	}
	if candidate.PartitionRevisions.WorkspaceRev != candidate.WorkspaceRevision ||
		!validRevision(candidate.PartitionRevisions.RouteRev) ||
		!validRevision(candidate.PartitionRevisions.OpSeq) ||
		len(candidate.PartitionRevisions.DocumentRevisions) > 4096 {
		return "", coded("VER-4002", "Candidate partition revisions do not match the workspace revision.", ErrInvalid)
	}
	for documentID, revision := range candidate.PartitionRevisions.DocumentRevisions {
		if err := validateIdentifier(documentID, "partitionRevisions.documentRevisions"); err != nil ||
			!validRevision(revision.ContentRev) || !validRevision(revision.MetaRev) {
			return "", coded("VER-4002", "Candidate document revisions are invalid.", ErrInvalid)
		}
	}
	for name, value := range candidateDigests(candidate) {
		if !digestPattern.MatchString(value) {
			return "", coded("VER-4002", fmt.Sprintf("%s must be a canonical SHA-256 digest.", name), ErrInvalid)
		}
	}
	if candidate.Inputs.ExecutableSnapshotDigest != candidate.ExecutableSnapshotDigest {
		return "", coded("VER-4002", "Executable snapshot identity is inconsistent.", ErrInvalid)
	}
	if candidate.Scenario != nil {
		if err := validateIdentifier(candidate.Scenario.ID, "scenario.id"); err != nil ||
			!validRevision(candidate.Scenario.Revision) ||
			!digestPattern.MatchString(candidate.Scenario.Digest) ||
			!digestPattern.MatchString(candidate.Scenario.ProgramDigest) ||
			candidate.Inputs.ScenarioProgramDigest != candidate.Scenario.ProgramDigest {
			return "", coded("VER-4002", "Scenario identity chain is invalid.", ErrInvalid)
		}
	} else if candidate.Inputs.ScenarioProgramDigest != "" {
		return "", coded("VER-4002", "Scenario program digest requires a Scenario identity.", ErrInvalid)
	}
	if err := validateRunIdentity(candidate); err != nil {
		return "", err
	}
	if !validCheckKind(candidate.CheckKind) {
		return "", coded("VER-4002", "Candidate check kind is unsupported.", ErrInvalid)
	}
	if err := validateTiming(candidate); err != nil {
		return "", err
	}
	if err := validateResult(candidate); err != nil {
		return "", err
	}
	if !candidate.Redaction.Safe || !digestPattern.MatchString(candidate.Redaction.ScannerSetDigest) ||
		validateIdentifier(candidate.Redaction.PolicyID, "redaction.policyId") != nil ||
		len(candidate.Redaction.DroppedFieldCounts) > 2048 {
		return "", coded("VER-5002", "Candidate redaction report is incomplete.", ErrInvalid)
	}
	if err := validateArtifactTargetPolicy(
		candidate.Redaction.TargetPolicy,
		candidate.PolicyDigest,
		candidate.TargetID,
	); err != nil {
		return "", coded("VER-5002", "Candidate target capture policy is invalid.", ErrInvalid)
	}
	for field, count := range candidate.Redaction.DroppedFieldCounts {
		if validateCanonicalText(field, "redaction.droppedFieldCounts", 512) != nil ||
			isUnsafeJSONKey(field) || count < 0 || count > 9007199254740991 {
			return "", coded("VER-5002", "Candidate redaction report is invalid.", ErrInvalid)
		}
	}
	if err := validateSortedDigests(candidate.Inputs.FixtureSetDigests, "fixtureSetDigests"); err != nil {
		return "", err
	}
	sourceTraceDigests, err := normalizeCandidateSourceTraces(candidate)
	if err != nil {
		return "", err
	}
	if err := validateArtifacts(candidate.Artifacts); err != nil {
		return "", err
	}
	if err := validateCandidateArtifactSourceTraces(candidate.Artifacts, sourceTraceDigests); err != nil {
		return "", err
	}
	deadline, err := parseInstant(candidate.Promotion.Deadline)
	if err != nil || !deadline.After(validator.now().Add(-time.Second)) ||
		deadline.After(validator.now().Add(24*time.Hour)) {
		return "", coded("VER-4002", "Promotion deadline is invalid or outside the 24 hour budget.", ErrInvalid)
	}
	if err := validateMutationToken(candidate.Promotion.IdempotencyKey); err != nil {
		return "", err
	}
	trust, err := trustForOrigin(candidate.Provenance.Origin)
	if err != nil {
		return "", err
	}
	if err := validateProvenance(candidate, trust); err != nil {
		return "", err
	}
	if err := validateRetentionRequest(candidate.RequestedRetention, trust); err != nil {
		return "", err
	}
	computedDigest, _, err := digestWithoutField(candidate, "candidateDigest")
	if err != nil || computedDigest != candidate.CandidateDigest {
		return "", coded("VER-5001", "Candidate digest does not match its canonical content.", ErrInvalid)
	}
	sanitized := *candidate
	sanitized.Promotion.IdempotencyKey = ""
	serialized, err := canonicalBytes(sanitized)
	if err != nil || validator.containsSensitiveText(serialized) {
		return "", coded("VER-5002", "Candidate contains Secret, credential, or PII material.", ErrInvalid)
	}
	return trust, nil
}

func validRevision(value int64) bool {
	return value >= 0 && value <= 9007199254740991
}

func validateIdentifier(value string, field string) error {
	if value != strings.TrimSpace(value) || !utf8.ValidString(value) || !norm.NFC.IsNormalString(value) ||
		!identifierPattern.MatchString(value) {
		return coded("VER-4002", field+" is not a canonical identifier.", ErrInvalid)
	}
	return nil
}

func validateCanonicalText(value string, field string, maximumBytes int) error {
	if value != strings.TrimSpace(value) || value == "" ||
		len([]byte(value)) > maximumBytes || !utf8.ValidString(value) ||
		!norm.NFC.IsNormalString(value) {
		return coded("VER-4002", field+" is not canonical bounded text.", ErrInvalid)
	}
	for _, character := range value {
		if character <= 0x1f || character == 0x7f {
			return coded("VER-4002", field+" contains a control code point.", ErrInvalid)
		}
	}
	return nil
}

func candidateDigests(candidate *EvidenceCandidate) map[string]string {
	digests := map[string]string{
		"executableSnapshotDigest":      candidate.ExecutableSnapshotDigest,
		"policyDigest":                  candidate.PolicyDigest,
		"impactDigest":                  candidate.ImpactDigest,
		"planDigest":                    candidate.PlanDigest,
		"result.normalizedResultDigest": candidate.Result.NormalizedResultDigest,
		"toolchain.buildDigest":         candidate.Toolchain.BuildDigest,
		"toolchain.toolchainDigest":     candidate.Toolchain.ToolchainDigest,
		"toolchain.schemaDigest":        candidate.Toolchain.SchemaDigest,
		"normalization.buildDigest":     candidate.Normalization.BuildDigest,
		"normalization.toolchainDigest": candidate.Normalization.ToolchainDigest,
		"normalization.schemaDigest":    candidate.Normalization.SchemaDigest,
		"controls.profileDigest":        candidate.Controls.ProfileDigest,
		"controls.appliedDigest":        candidate.Controls.AppliedDigest,
		"inputs.inputDigest":            candidate.Inputs.InputDigest,
		"sourceTraceDigest":             candidate.SourceTraceDigest,
		"dependencyLockDigest":          candidate.DependencyLockDigest,
	}
	if candidate.Inputs.ScenarioProgramDigest != "" {
		digests["inputs.scenarioProgramDigest"] = candidate.Inputs.ScenarioProgramDigest
	}
	if candidate.Inputs.BaselineSetDigest != "" {
		digests["inputs.baselineSetDigest"] = candidate.Inputs.BaselineSetDigest
	}
	if candidate.Run.FontSetDigest != "" {
		digests["run.fontSetDigest"] = candidate.Run.FontSetDigest
	}
	if candidate.Run.SandboxImageDigest != "" {
		digests["run.sandboxImageDigest"] = candidate.Run.SandboxImageDigest
	}
	return digests
}

func validateRunIdentity(candidate *EvidenceCandidate) error {
	for name, value := range map[string]string{
		"run.runId": candidate.Run.RunID, "run.providerId": candidate.Run.ProviderID,
		"run.frameworkTarget": candidate.Run.FrameworkTarget, "run.runtimeZone": candidate.Run.RuntimeZone,
		"run.viewport.id": candidate.Run.Viewport.ID,
	} {
		if err := validateIdentifier(value, name); err != nil {
			return err
		}
	}
	for _, optional := range []string{candidate.Run.JobID, candidate.Run.SessionID, candidate.Run.ParentAttemptID} {
		if optional != "" {
			if err := validateIdentifier(optional, "run optional identity"); err != nil {
				return err
			}
		}
	}
	if !localePattern.MatchString(candidate.Run.Locale) ||
		validateCanonicalText(candidate.Run.Timezone, "run.timezone", 128) != nil ||
		validateCanonicalText(candidate.Toolchain.PackageName, "toolchain.packageName", 512) != nil ||
		validateCanonicalText(candidate.Toolchain.PackageVersion, "toolchain.packageVersion", 128) != nil ||
		validateCanonicalText(candidate.Normalization.PackageName, "normalization.packageName", 512) != nil ||
		validateCanonicalText(candidate.Normalization.PackageVersion, "normalization.packageVersion", 128) != nil ||
		(candidate.Run.OperatingSystemIdentity != "" &&
			validateCanonicalText(candidate.Run.OperatingSystemIdentity, "run.operatingSystemIdentity", 512) != nil) {
		return coded("VER-4002", "Run or toolchain text identity is invalid.", ErrInvalid)
	}
	if candidate.Run.ProviderID != candidate.Provenance.ProviderID ||
		candidate.Run.Viewport.Width < 1 || candidate.Run.Viewport.Width > 100000 ||
		candidate.Run.Viewport.Height < 1 || candidate.Run.Viewport.Height > 100000 ||
		candidate.Run.DevicePixelRatio <= 0 || candidate.Run.DevicePixelRatio > 16 {
		return coded("VER-4002", "Run identity is inconsistent or outside its budget.", ErrInvalid)
	}
	if candidate.Run.Surface != "preview" && candidate.Run.Surface != "export" && candidate.Run.Surface != "ci" {
		return coded("VER-4002", "Run surface is unsupported.", ErrInvalid)
	}
	if candidate.Run.BrowserEngine != "" && candidate.Run.BrowserEngine != "chromium" &&
		candidate.Run.BrowserEngine != "firefox" && candidate.Run.BrowserEngine != "webkit" {
		return coded("VER-4002", "Browser engine is unsupported.", ErrInvalid)
	}
	if candidate.Run.ColorScheme != "light" && candidate.Run.ColorScheme != "dark" {
		return coded("VER-4002", "Color scheme is unsupported.", ErrInvalid)
	}
	if candidate.Run.Motion != "full" && candidate.Run.Motion != "reduced" {
		return coded("VER-4002", "Motion control is unsupported.", ErrInvalid)
	}
	return nil
}

func validateTiming(candidate *EvidenceCandidate) error {
	startedAt, startErr := parseInstant(candidate.Timing.StartedAt)
	completedAt, completionErr := parseInstant(candidate.Timing.CompletedAt)
	policyAt, policyErr := parseInstant(candidate.PolicyEvaluationInstant)
	if startErr != nil || completionErr != nil || policyErr != nil ||
		completedAt.Before(startedAt) || policyAt.After(startedAt) ||
		candidate.Timing.DurationMS < 0 ||
		completedAt.Sub(startedAt).Milliseconds() != candidate.Timing.DurationMS {
		return coded("VER-4002", "Candidate timing identity is invalid.", ErrInvalid)
	}
	return nil
}

func validateResult(candidate *EvidenceCandidate) error {
	switch candidate.Result.Outcome {
	case "passed", "failed", "blocked", "cancelled", "infrastructure-error":
	default:
		return coded("VER-4002", "Candidate outcome is unsupported.", ErrInvalid)
	}
	if len(candidate.Result.Summary) == 0 || len(candidate.Result.Summary) > 256*1024 ||
		validateJSONObject(candidate.Result.Summary) != nil {
		return coded("VER-5001", "Normalized result summary is not strict bounded JSON.", ErrInvalid)
	}
	var summary any
	if err := json.Unmarshal(candidate.Result.Summary, &summary); err != nil {
		return coded("VER-5001", "Normalized result summary is invalid.", ErrInvalid)
	}
	digest, _, err := canonicalDigest(struct {
		Outcome             string          `json:"outcome"`
		Summary             json.RawMessage `json:"summary"`
		DiagnosticCodes     []string        `json:"diagnosticCodes"`
		AppliedExemptionIDs []string        `json:"appliedExemptionIds"`
	}{
		Outcome: candidate.Result.Outcome, Summary: candidate.Result.Summary,
		DiagnosticCodes:     candidate.Result.DiagnosticCodes,
		AppliedExemptionIDs: candidate.Result.AppliedExemptionIDs,
	})
	if err != nil || digest != candidate.Result.NormalizedResultDigest {
		return coded("VER-5001", "Normalized result digest does not match the summary.", ErrInvalid)
	}
	if len(candidate.Result.DiagnosticCodes) > 2048 || len(candidate.Result.AppliedExemptionIDs) > 2048 {
		return coded("VER-5001", "Normalized result arrays exceed their budget.", ErrInvalid)
	}
	if err := validateSortedIdentifiers(candidate.Result.DiagnosticCodes, "diagnosticCodes"); err != nil {
		return err
	}
	return validateSortedIdentifiers(candidate.Result.AppliedExemptionIDs, "appliedExemptionIds")
}

func validateSortedIdentifiers(values []string, field string) error {
	for index, value := range values {
		if err := validateIdentifier(value, field); err != nil {
			return err
		}
		if index > 0 && values[index-1] >= value {
			return coded("VER-5001", field+" must be sorted and unique.", ErrInvalid)
		}
	}
	return nil
}

func validateSortedDigests(values []string, field string) error {
	for index, value := range values {
		if !digestPattern.MatchString(value) || (index > 0 && values[index-1] >= value) {
			return coded("VER-5001", field+" must contain sorted unique canonical digests.", ErrInvalid)
		}
	}
	return nil
}

func validateArtifacts(artifacts []CandidateArtifact) error {
	if len(artifacts) > maximumArtifacts {
		return coded("VER-5001", "Candidate artifact count exceeds the budget.", ErrInvalid)
	}
	ids := make(map[string]struct{}, len(artifacts))
	paths := make(map[string]struct{}, len(artifacts))
	stagingIDs := make(map[string]struct{}, len(artifacts))
	var total int64
	previousID := ""
	for _, artifact := range artifacts {
		if validateIdentifier(artifact.ID, "artifacts.id") != nil ||
			validateIdentifier(artifact.StagingArtifactID, "artifacts.stagingArtifactId") != nil ||
			!digestPattern.MatchString(artifact.ExpectedDigest) ||
			!mediaTypePattern.MatchString(artifact.ExpectedMediaType) ||
			artifact.ExpectedSize < 0 || artifact.ExpectedSize > maximumArtifactBytes {
			return coded("VER-5001", "Candidate artifact identity is invalid.", ErrInvalid)
		}
		if previousID != "" && previousID >= artifact.ID {
			return coded("VER-5001", "Candidate artifacts must be sorted by unique id.", ErrInvalid)
		}
		previousID = artifact.ID
		if !canonicalArtifactPath(artifact.Path) {
			return coded("VER-5002", "Candidate artifact path is unsafe.", ErrInvalid)
		}
		if artifact.SourceTraceDigest != "" && !digestPattern.MatchString(artifact.SourceTraceDigest) {
			return coded("VER-5001", "Candidate artifact SourceTrace digest is invalid.", ErrInvalid)
		}
		if _, duplicate := ids[artifact.ID]; duplicate {
			return coded("VER-5001", "Candidate artifact ids must be unique.", ErrInvalid)
		}
		if _, duplicate := paths[artifact.Path]; duplicate {
			return coded("VER-5001", "Candidate artifact paths must be unique.", ErrInvalid)
		}
		if _, duplicate := stagingIDs[artifact.StagingArtifactID]; duplicate {
			return coded("VER-5001", "Candidate staging artifact ids must be unique.", ErrInvalid)
		}
		if !allowedArtifactMedia(artifact.Kind, artifact.ExpectedMediaType) {
			return coded("VER-5002", "Candidate artifact media type is unsupported for its class.", ErrInvalid)
		}
		ids[artifact.ID], paths[artifact.Path], stagingIDs[artifact.StagingArtifactID] = struct{}{}, struct{}{}, struct{}{}
		total += artifact.ExpectedSize
		if total > maximumTotalBytes {
			return coded("VER-5001", "Candidate artifact bytes exceed the aggregate budget.", ErrInvalid)
		}
	}
	return nil
}

func canonicalArtifactPath(value string) bool {
	segments := strings.Split(value, "/")
	if len(segments) > 16 {
		return false
	}
	for _, segment := range segments {
		if len(segment) < 1 || len(segment) > 128 ||
			!regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`).MatchString(segment) {
			return false
		}
	}
	return value != "" && len(value) <= 512 && value == strings.TrimSpace(value) &&
		utf8.ValidString(value) && norm.NFC.IsNormalString(value) &&
		!strings.Contains(value, `\`) && !strings.ContainsRune(value, '\x00') &&
		!strings.HasPrefix(value, "/") && !strings.HasPrefix(value, "//") &&
		!regexp.MustCompile(`^[A-Za-z]:`).MatchString(value) &&
		path.Clean(value) == value && value != "." &&
		!strings.HasPrefix(value, "../") && !strings.Contains(value, "/../")
}

func allowedArtifactMedia(kind ArtifactKind, mediaType string) bool {
	switch kind {
	case ArtifactScreenshot, ArtifactVisualDiff:
		return mediaType == "image/png" || mediaType == "image/jpeg"
	case ArtifactBuildLog:
		return mediaType == "text/plain"
	case ArtifactAccessibilityReport, ArtifactTrace, ArtifactNetworkSummary,
		ArtifactConsoleSummary, ArtifactCoverageSummary, ArtifactPerformanceProfile,
		ArtifactSecurityReport, ArtifactReplayRecord:
		return isArtifactJSONMediaType(mediaType)
	default:
		return false
	}
}

func trustForOrigin(origin string) (TrustClass, error) {
	switch origin {
	case "local":
		return TrustLocalUnattested, nil
	case "remote":
		return TrustRemoteAttested, nil
	case "ci":
		return TrustCIAttested, nil
	case "import":
		return TrustImported, nil
	default:
		return "", coded("VER-5003", "Candidate provenance origin is unsupported.", ErrInvalid)
	}
}

func validateProvenance(candidate *EvidenceCandidate, trust TrustClass) error {
	if validateIdentifier(candidate.Provenance.ProducerID, "provenance.producerId") != nil ||
		validateIdentifier(candidate.Provenance.ProviderID, "provenance.providerId") != nil {
		return coded("VER-5003", "Candidate provenance identity is invalid.", ErrInvalid)
	}
	issuedAt, issueErr := parseInstant(candidate.Provenance.IssuedAt)
	completedAt, completionErr := parseInstant(candidate.Timing.CompletedAt)
	if issueErr != nil || completionErr != nil || issuedAt.Before(completedAt.Add(-5*time.Minute)) {
		return coded("VER-5003", "Candidate provenance time is invalid.", ErrInvalid)
	}
	if candidate.Provenance.ExpiresAt != "" {
		expiresAt, err := parseInstant(candidate.Provenance.ExpiresAt)
		if err != nil || !expiresAt.After(issuedAt) {
			return coded("VER-5003", "Candidate provenance expiry is invalid.", ErrInvalid)
		}
	}
	if candidate.Provenance.Origin == "ci" {
		if candidate.Provenance.CI == nil || validateCIRepositoryIdentity(*candidate.Provenance.CI) != nil {
			return coded("VER-5003", "CI provenance requires a canonical repository identity.", ErrInvalid)
		}
	} else if candidate.Provenance.CI != nil {
		return coded("VER-5003", "CI repository identity is forbidden outside CI provenance.", ErrInvalid)
	}
	return nil
}

func validateCIRepositoryIdentity(identity CIRepositoryIdentity) error {
	if validateCanonicalText(identity.Repository, "ci.repository", 512) != nil ||
		!ciRepositoryPattern.MatchString(identity.Repository) ||
		validateCanonicalText(identity.Ref, "ci.ref", 512) != nil ||
		!canonicalGitRef(identity.Ref) ||
		!ciCommitPattern.MatchString(identity.Commit) {
		return ErrInvalid
	}
	return nil
}

func canonicalGitRef(ref string) bool {
	return strings.HasPrefix(ref, "refs/") &&
		len(ref) > len("refs/") &&
		!strings.HasSuffix(ref, "/") &&
		!strings.HasSuffix(ref, ".") &&
		!strings.Contains(ref, "..") &&
		!strings.Contains(ref, "//") &&
		!strings.Contains(ref, "@{") &&
		!strings.ContainsAny(ref, `\ ~^:?*[`)
}

func validCheckKind(value string) bool {
	switch value {
	case "diagnostics", "build", "unit", "integration", "e2e",
		"visual", "accessibility", "performance", "security":
		return true
	default:
		return false
	}
}

func validateRetentionRequest(retention RetentionClass, trust TrustClass) error {
	switch retention {
	case RetentionSession:
		return nil
	case RetentionChange:
		if trust == TrustImported {
			return coded("VER-5005", "Imported Evidence cannot request change retention.", ErrInvalid)
		}
		return nil
	case RetentionRelease:
		if trust != TrustCIAttested {
			return coded("VER-5005", "Only CI-attested Evidence can request release retention.", ErrInvalid)
		}
		return nil
	default:
		return coded("VER-5005", "Requested retention class is unsupported.", ErrInvalid)
	}
}

func validateMutationToken(value string) error {
	if len(value) < 16 || len(value) > 256 || value != strings.TrimSpace(value) ||
		!utf8.ValidString(value) || strings.ContainsAny(value, "\x00\r\n") {
		return coded("VER-4002", "Idempotency key is invalid.", ErrInvalid)
	}
	return nil
}

func parseInstant(value string) (time.Time, error) {
	if value != strings.TrimSpace(value) || !instantPattern.MatchString(value) {
		return time.Time{}, errors.New("instant must be UTC")
	}
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil || parsed.Location() != time.UTC {
		return time.Time{}, errors.New("instant is invalid")
	}
	return parsed.UTC(), nil
}

func canonicalTime(value time.Time) time.Time {
	return value.UTC().Truncate(time.Millisecond)
}

func formatInstant(value time.Time) string {
	return canonicalTime(value).Format("2006-01-02T15:04:05.000Z")
}

func (validator *CandidateValidator) containsSensitiveText(value []byte) bool {
	if privateKeyPattern.Match(value) || bearerPattern.Match(value) ||
		directTokenPattern.Match(value) || emailPattern.Match(value) ||
		governmentIDPattern.Match(value) ||
		containsUnredactedSensitiveField(value, authorizationFieldPattern) ||
		containsUnredactedSensitiveField(value, cookieFieldPattern) ||
		containsUnredactedSensitiveField(value, environmentSecretFieldPattern) ||
		containsHighEntropyCredential(value) {
		return true
	}
	for _, canary := range validator.secretCanaries {
		if bytes.Contains(value, []byte(canary)) {
			return true
		}
	}
	return false
}

func containsUnredactedSensitiveField(value []byte, pattern *regexp.Regexp) bool {
	for offset := 0; offset < len(value); {
		match := pattern.FindSubmatchIndex(value[offset:])
		if match == nil {
			return false
		}
		for group := 1; group < len(match)/2; group++ {
			start, end := match[group*2], match[group*2+1]
			if start >= 0 && end >= start {
				captured := bytes.TrimSpace(value[offset+start : offset+end])
				if len(captured) > 0 && !redactedValuePattern.Match(captured) {
					return true
				}
				break
			}
		}
		advance := match[1]
		if advance <= 0 {
			advance = 1
		}
		offset += advance
	}
	return false
}

func containsHighEntropyCredential(value []byte) bool {
	for offset := 0; offset < len(value); {
		if !isEntropyTokenByte(value[offset]) {
			offset++
			continue
		}
		start := offset
		for offset < len(value) && isEntropyTokenByte(value[offset]) {
			offset++
		}
		if offset-start < minimumEntropyTokenLength {
			continue
		}
		sampleEnd := min(offset, start+maximumEntropyTokenSample)
		if isHighEntropyCredentialToken(value[start:sampleEnd]) {
			return true
		}
	}
	return false
}

func isEntropyTokenByte(value byte) bool {
	return value >= '0' && value <= '9' ||
		value >= 'A' && value <= 'Z' ||
		value >= 'a' && value <= 'z' ||
		value == '+' || value == '/' || value == '_' ||
		value == '=' || value == '-'
}

func isHighEntropyCredentialToken(value []byte) bool {
	if digestTokenPattern.Match(value) || hexTokenPattern.Match(value) {
		return false
	}
	var (
		frequencies               [256]int
		uppercase, lowercase      bool
		digit, symbol             bool
		uniqueCharacters, classes int
	)
	for _, character := range value {
		switch {
		case character >= 'A' && character <= 'Z':
			uppercase = true
		case character >= 'a' && character <= 'z':
			lowercase = true
		case character >= '0' && character <= '9':
			digit = true
		default:
			symbol = true
		}
		if frequencies[character] == 0 {
			uniqueCharacters++
		}
		frequencies[character]++
	}
	for _, present := range []bool{uppercase, lowercase, digit, symbol} {
		if present {
			classes++
		}
	}
	if classes < 3 || uniqueCharacters < minimumEntropyUniqueCharacters {
		return false
	}
	entropy := 0.0
	for _, count := range frequencies {
		if count == 0 {
			continue
		}
		probability := float64(count) / float64(len(value))
		entropy -= probability * math.Log2(probability)
	}
	return entropy >= minimumEntropyBitsPerCharacter
}

func sniffedMediaType(body []byte) string {
	detected := http.DetectContentType(body)
	if separator := strings.IndexByte(detected, ';'); separator >= 0 {
		detected = detected[:separator]
	}
	return detected
}

func sortedArtifactStatements(artifacts []CandidateArtifact) []EvidenceArtifactStatement {
	result := make([]EvidenceArtifactStatement, len(artifacts))
	for index, artifact := range artifacts {
		result[index] = EvidenceArtifactStatement{
			ID: artifact.ID, Path: artifact.Path, Kind: artifact.Kind,
			Digest:            artifact.ExpectedDigest,
			SourceTraceDigest: artifact.SourceTraceDigest,
			Size:              artifact.ExpectedSize,
			MediaType:         artifact.ExpectedMediaType,
		}
	}
	sort.Slice(result, func(left, right int) bool { return result[left].ID < result[right].ID })
	return result
}
