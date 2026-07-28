package verification

import (
	"encoding/json"
	"time"
)

type TrustClass string

const (
	TrustLocalUnattested TrustClass = "local-unattested"
	TrustRemoteAttested  TrustClass = "remote-attested"
	TrustCIAttested      TrustClass = "ci-attested"
	TrustImported        TrustClass = "imported-untrusted"
)

type RetentionClass string

const (
	RetentionSession RetentionClass = "session"
	RetentionChange  RetentionClass = "change"
	RetentionRelease RetentionClass = "release"
)

type ArtifactKind string

const (
	ArtifactScreenshot          ArtifactKind = "screenshot"
	ArtifactVisualDiff          ArtifactKind = "visual-diff"
	ArtifactAccessibilityReport ArtifactKind = "accessibility-report"
	ArtifactTrace               ArtifactKind = "trace"
	ArtifactNetworkSummary      ArtifactKind = "network-summary"
	ArtifactConsoleSummary      ArtifactKind = "console-summary"
	ArtifactCoverageSummary     ArtifactKind = "coverage-summary"
	ArtifactPerformanceProfile  ArtifactKind = "performance-profile"
	ArtifactSecurityReport      ArtifactKind = "security-report"
	ArtifactBuildLog            ArtifactKind = "build-log"
	ArtifactReplayRecord        ArtifactKind = "replay-record"
)

type DocumentRevision struct {
	ContentRev int64 `json:"contentRev"`
	MetaRev    int64 `json:"metaRev"`
}

type PartitionRevisions struct {
	WorkspaceRev      int64                       `json:"workspaceRev"`
	RouteRev          int64                       `json:"routeRev"`
	OpSeq             int64                       `json:"opSeq"`
	DocumentRevisions map[string]DocumentRevision `json:"documentRevisions"`
}

type ScenarioIdentity struct {
	ID            string `json:"id"`
	Revision      int64  `json:"revision"`
	Digest        string `json:"digest"`
	ProgramDigest string `json:"programDigest"`
}

type ViewportIdentity struct {
	ID     string `json:"id"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

type RunIdentity struct {
	RunID                   string           `json:"runId"`
	ProviderID              string           `json:"providerId"`
	JobID                   string           `json:"jobId,omitempty"`
	SessionID               string           `json:"sessionId,omitempty"`
	ParentAttemptID         string           `json:"parentAttemptId,omitempty"`
	Surface                 string           `json:"surface"`
	FrameworkTarget         string           `json:"frameworkTarget"`
	RuntimeZone             string           `json:"runtimeZone"`
	BrowserEngine           string           `json:"browserEngine,omitempty"`
	OperatingSystemIdentity string           `json:"operatingSystemIdentity,omitempty"`
	Viewport                ViewportIdentity `json:"viewport"`
	DevicePixelRatio        float64          `json:"devicePixelRatio"`
	ColorScheme             string           `json:"colorScheme"`
	Motion                  string           `json:"motion"`
	Locale                  string           `json:"locale"`
	Timezone                string           `json:"timezone"`
	FontSetDigest           string           `json:"fontSetDigest"`
	SandboxImageDigest      string           `json:"sandboxImageDigest,omitempty"`
}

type EvidenceRunIdentity struct {
	RunID                   string           `json:"runId"`
	ProviderID              string           `json:"providerId"`
	JobID                   string           `json:"jobId,omitempty"`
	SessionID               string           `json:"sessionId,omitempty"`
	ParentAttemptID         string           `json:"parentAttemptId,omitempty"`
	Surface                 string           `json:"surface"`
	FrameworkTarget         string           `json:"frameworkTarget"`
	RuntimeZone             string           `json:"runtimeZone"`
	BrowserEngine           string           `json:"browserEngine,omitempty"`
	OperatingSystemIdentity string           `json:"operatingSystemIdentity,omitempty"`
	Viewport                ViewportIdentity `json:"viewport"`
	DevicePixelRatio        float64          `json:"devicePixelRatio"`
	ColorScheme             string           `json:"colorScheme"`
	Motion                  string           `json:"motion"`
	Locale                  string           `json:"locale"`
	Timezone                string           `json:"timezone"`
	FontSetDigest           string           `json:"fontSetDigest"`
	SandboxImageDigest      string           `json:"sandboxImageDigest,omitempty"`
}

type TimingIdentity struct {
	StartedAt   string `json:"startedAt"`
	CompletedAt string `json:"completedAt"`
	DurationMS  int64  `json:"durationMs"`
}

type NormalizedResult struct {
	Outcome                string          `json:"outcome"`
	NormalizedResultDigest string          `json:"normalizedResultDigest"`
	Summary                json.RawMessage `json:"summary"`
	DiagnosticCodes        []string        `json:"diagnosticCodes"`
	AppliedExemptionIDs    []string        `json:"appliedExemptionIds"`
}

type CIRepositoryIdentity struct {
	Repository string `json:"repository"`
	Ref        string `json:"ref"`
	Commit     string `json:"commit"`
}

type CandidateProvenance struct {
	Origin     string                `json:"origin"`
	ProducerID string                `json:"producerId"`
	ProviderID string                `json:"providerId"`
	IssuedAt   string                `json:"issuedAt"`
	ExpiresAt  string                `json:"expiresAt,omitempty"`
	CI         *CIRepositoryIdentity `json:"ci,omitempty"`
}

type ImplementationIdentity struct {
	PackageName     string `json:"packageName"`
	PackageVersion  string `json:"packageVersion"`
	BuildDigest     string `json:"buildDigest"`
	ToolchainDigest string `json:"toolchainDigest"`
	SchemaDigest    string `json:"schemaDigest"`
}

type ControlIdentity struct {
	ProfileDigest string `json:"profileDigest"`
	AppliedDigest string `json:"appliedDigest"`
}

type InputIdentity struct {
	ExecutableSnapshotDigest string   `json:"executableSnapshotDigest"`
	ScenarioProgramDigest    string   `json:"scenarioProgramDigest,omitempty"`
	FixtureSetDigests        []string `json:"fixtureSetDigests"`
	BaselineSetDigest        string   `json:"baselineSetDigest,omitempty"`
	InputDigest              string   `json:"inputDigest"`
}

type CandidateArtifact struct {
	ID                string       `json:"id"`
	Path              string       `json:"path"`
	StagingArtifactID string       `json:"stagingArtifactId"`
	Kind              ArtifactKind `json:"kind"`
	ExpectedDigest    string       `json:"expectedDigest"`
	ExpectedSize      int64        `json:"expectedSize"`
	ExpectedMediaType string       `json:"expectedMediaType"`
	SourceTraceDigest string       `json:"sourceTraceDigest,omitempty"`
}

// DiagnosticTargetRef is the transport-neutral source identity union shared
// with @prodivix/diagnostics. Kind-specific field ownership is enforced by the
// source-trace validator; omitempty preserves the exact selected union member
// in canonical JSON.
type DiagnosticTargetRef struct {
	Kind        string `json:"kind"`
	WorkspaceID string `json:"workspaceId,omitempty"`
	DocumentID  string `json:"documentId,omitempty"`
	NodeID      string `json:"nodeId,omitempty"`
	FieldPath   string `json:"fieldPath,omitempty"`
	RouteID     string `json:"routeId,omitempty"`
	PortID      string `json:"portId,omitempty"`
	TimelineID  string `json:"timelineId,omitempty"`
	BindingID   string `json:"bindingId,omitempty"`
	TrackID     string `json:"trackId,omitempty"`
	OperationID string `json:"operationId,omitempty"`
	ArtifactID  string `json:"artifactId,omitempty"`
	StepID      string `json:"stepId,omitempty"`
	AssertionID string `json:"assertionId,omitempty"`
	PlanDigest  string `json:"planDigest,omitempty"`
	CellID      string `json:"cellId,omitempty"`
	AttemptID   string `json:"attemptId,omitempty"`
	Operation   string `json:"operation,omitempty"`
	ThemeID     string `json:"themeId,omitempty"`
	TokenPath   string `json:"tokenPath,omitempty"`
	Width       int64  `json:"width,omitempty"`
	Height      int64  `json:"height,omitempty"`
	StablePath  string `json:"stablePath,omitempty"`
	SlotName    string `json:"slotName,omitempty"`

	presentFields map[string]struct{}
}

type SourceSpan struct {
	ArtifactID  string `json:"artifactId"`
	StartLine   int64  `json:"startLine"`
	StartColumn int64  `json:"startColumn"`
	EndLine     int64  `json:"endLine"`
	EndColumn   int64  `json:"endColumn"`
}

type VerificationEvidenceSourceTrace struct {
	SourceRef  DiagnosticTargetRef `json:"sourceRef"`
	SourceSpan *SourceSpan         `json:"sourceSpan,omitempty"`
	Label      string              `json:"label,omitempty"`

	presentFields map[string]struct{}
}

type TargetPolicy struct {
	Authority        string `json:"authority"`
	PolicyDigest     string `json:"policyDigest"`
	SemanticTargetID string `json:"semanticTargetId"`
	Capture          string `json:"capture"`
}

type RedactionIdentity struct {
	PolicyID           string         `json:"policyId"`
	ScannerSetDigest   string         `json:"scannerSetDigest"`
	DroppedFieldCounts map[string]int `json:"droppedFieldCounts"`
	TargetPolicy       TargetPolicy   `json:"targetPolicy"`
	Safe               bool           `json:"safe"`
}

type PromotionIdentity struct {
	IdempotencyKey string `json:"idempotencyKey,omitempty"`
	Deadline       string `json:"deadline"`
}

// EvidenceCandidate mirrors the transport-neutral current candidate model.
// Staging capability and proof bytes are carried by the API envelope, never by
// this structure or its canonical digest.
type EvidenceCandidate struct {
	CandidateID              string                            `json:"candidateId"`
	ProjectID                string                            `json:"projectId"`
	WorkspaceID              string                            `json:"workspaceId"`
	WorkspaceRevision        int64                             `json:"workspaceRevision"`
	PartitionRevisions       PartitionRevisions                `json:"partitionRevisions"`
	ExecutableSnapshotDigest string                            `json:"executableSnapshotDigest"`
	Scenario                 *ScenarioIdentity                 `json:"scenario,omitempty"`
	PolicyRevision           int64                             `json:"policyRevision"`
	PolicyDigest             string                            `json:"policyDigest"`
	ImpactDigest             string                            `json:"impactDigest"`
	PlanDigest               string                            `json:"planDigest"`
	PolicyEvaluationInstant  string                            `json:"policyEvaluationInstant"`
	CellID                   string                            `json:"cellId"`
	CheckID                  string                            `json:"checkId"`
	CheckKind                string                            `json:"checkKind"`
	TargetID                 string                            `json:"targetId"`
	AttemptID                string                            `json:"attemptId"`
	Run                      RunIdentity                       `json:"run"`
	Timing                   TimingIdentity                    `json:"timing"`
	Result                   NormalizedResult                  `json:"result"`
	Provenance               CandidateProvenance               `json:"provenance"`
	Toolchain                ImplementationIdentity            `json:"toolchain"`
	Normalization            ImplementationIdentity            `json:"normalization"`
	Controls                 ControlIdentity                   `json:"controls"`
	Inputs                   InputIdentity                     `json:"inputs"`
	Artifacts                []CandidateArtifact               `json:"artifacts"`
	SourceTraces             []VerificationEvidenceSourceTrace `json:"sourceTraces"`
	SourceTraceDigest        string                            `json:"sourceTraceDigest"`
	DependencyLockDigest     string                            `json:"dependencyLockDigest"`
	Redaction                RedactionIdentity                 `json:"redaction"`
	RequestedRetention       RetentionClass                    `json:"requestedRetention"`
	Promotion                PromotionIdentity                 `json:"promotion"`
	CandidateDigest          string                            `json:"candidateDigest"`
}

type EvidenceCandidateWire struct {
	WireVersion int `json:"wireVersion"`
	EvidenceCandidate
}

type ArtifactManifest struct {
	ID                string       `json:"id"`
	Path              string       `json:"path"`
	Kind              ArtifactKind `json:"kind"`
	Digest            string       `json:"digest"`
	NormalizedDigest  string       `json:"normalizedDigest,omitempty"`
	SourceTraceDigest string       `json:"sourceTraceDigest,omitempty"`
	Size              int64        `json:"size"`
	MediaType         string       `json:"mediaType"`
}

type EvidenceProvenance struct {
	Trust             TrustClass            `json:"trust"`
	ProducerID        string                `json:"producerId"`
	AttestationDigest string                `json:"attestationDigest,omitempty"`
	IssuedAt          string                `json:"issuedAt"`
	ExpiresAt         string                `json:"expiresAt,omitempty"`
	CI                *CIRepositoryIdentity `json:"ci,omitempty"`
}

type VerificationEvidence struct {
	ID                       string                            `json:"id"`
	ProjectID                string                            `json:"projectId"`
	WorkspaceID              string                            `json:"workspaceId"`
	WorkspaceRevision        int64                             `json:"workspaceRevision"`
	PartitionRevisions       PartitionRevisions                `json:"partitionRevisions"`
	ExecutableSnapshotDigest string                            `json:"executableSnapshotDigest"`
	Scenario                 *ScenarioIdentity                 `json:"scenario,omitempty"`
	PolicyRevision           int64                             `json:"policyRevision"`
	PolicyDigest             string                            `json:"policyDigest"`
	ImpactDigest             string                            `json:"impactDigest"`
	PlanDigest               string                            `json:"planDigest"`
	PolicyEvaluationInstant  string                            `json:"policyEvaluationInstant"`
	CellID                   string                            `json:"cellId"`
	CheckID                  string                            `json:"checkId"`
	CheckKind                string                            `json:"checkKind"`
	TargetID                 string                            `json:"targetId"`
	AttemptID                string                            `json:"attemptId"`
	Run                      EvidenceRunIdentity               `json:"run"`
	Timing                   TimingIdentity                    `json:"timing"`
	Result                   NormalizedResult                  `json:"result"`
	Provenance               EvidenceProvenance                `json:"provenance"`
	Toolchain                ImplementationIdentity            `json:"toolchain"`
	Normalization            ImplementationIdentity            `json:"normalization"`
	Controls                 ControlIdentity                   `json:"controls"`
	Inputs                   InputIdentity                     `json:"inputs"`
	Artifacts                []ArtifactManifest                `json:"artifacts"`
	SourceTraces             []VerificationEvidenceSourceTrace `json:"sourceTraces"`
	SourceTraceDigest        string                            `json:"sourceTraceDigest"`
	DependencyLockDigest     string                            `json:"dependencyLockDigest"`
	RedactionPolicyID        string                            `json:"redactionPolicyId"`
	TargetPolicy             TargetPolicy                      `json:"targetPolicy"`
	CreatedAt                string                            `json:"createdAt"`
	Retention                RetentionClass                    `json:"retention"`
	Supersedes               string                            `json:"supersedes,omitempty"`
	ManifestDigest           string                            `json:"manifestDigest,omitempty"`
}

type EvidenceArtifactStatement struct {
	ID                string       `json:"id"`
	Path              string       `json:"path"`
	Kind              ArtifactKind `json:"kind"`
	Digest            string       `json:"digest"`
	SourceTraceDigest string       `json:"sourceTraceDigest,omitempty"`
	Size              int64        `json:"size"`
	MediaType         string       `json:"mediaType"`
}

type ProducerStatement struct {
	Origin             string                `json:"origin"`
	ProducerID         string                `json:"producerId"`
	ProviderID         string                `json:"providerId"`
	RunID              string                `json:"runId"`
	JobID              string                `json:"jobId,omitempty"`
	SessionID          string                `json:"sessionId,omitempty"`
	WorkerID           string                `json:"workerId,omitempty"`
	WorkerAttempt      int64                 `json:"workerAttempt,omitempty"`
	SandboxImageDigest string                `json:"sandboxImageDigest,omitempty"`
	CI                 *CIRepositoryIdentity `json:"ci,omitempty"`
}

type EvidenceExecutionStatement struct {
	Surface                 string           `json:"surface"`
	FrameworkTarget         string           `json:"frameworkTarget"`
	RuntimeZone             string           `json:"runtimeZone"`
	BrowserEngine           string           `json:"browserEngine,omitempty"`
	OperatingSystemIdentity string           `json:"operatingSystemIdentity,omitempty"`
	Viewport                ViewportIdentity `json:"viewport"`
	DevicePixelRatio        float64          `json:"devicePixelRatio"`
	ColorScheme             string           `json:"colorScheme"`
	Motion                  string           `json:"motion"`
	Locale                  string           `json:"locale"`
	Timezone                string           `json:"timezone"`
	FontSetDigest           string           `json:"fontSetDigest"`
	SandboxImageDigest      string           `json:"sandboxImageDigest,omitempty"`
}

type EvidenceStatement struct {
	EvidenceID               string                      `json:"evidenceId"`
	CandidateID              string                      `json:"candidateId"`
	CandidateDigest          string                      `json:"candidateDigest"`
	EvidenceCoreDigest       string                      `json:"evidenceCoreDigest"`
	ProjectID                string                      `json:"projectId"`
	WorkspaceID              string                      `json:"workspaceId"`
	WorkspaceRevision        int64                       `json:"workspaceRevision"`
	PartitionRevisionsDigest string                      `json:"partitionRevisionsDigest"`
	ExecutableSnapshotDigest string                      `json:"executableSnapshotDigest"`
	PolicyDigest             string                      `json:"policyDigest"`
	TargetPolicyDigest       string                      `json:"targetPolicyDigest"`
	PlanDigest               string                      `json:"planDigest"`
	CellID                   string                      `json:"cellId"`
	CheckID                  string                      `json:"checkId"`
	CheckKind                string                      `json:"checkKind"`
	TargetID                 string                      `json:"targetId"`
	AttemptID                string                      `json:"attemptId"`
	Producer                 ProducerStatement           `json:"producer"`
	Execution                EvidenceExecutionStatement  `json:"execution"`
	ToolchainDigest          string                      `json:"toolchainDigest"`
	NormalizationDigest      string                      `json:"normalizationDigest"`
	ControlDigest            string                      `json:"controlDigest"`
	InputDigest              string                      `json:"inputDigest"`
	ResultDigest             string                      `json:"resultDigest"`
	SourceTraceDigest        string                      `json:"sourceTraceDigest"`
	CreatedAt                string                      `json:"createdAt"`
	Retention                RetentionClass              `json:"retention"`
	Artifacts                []EvidenceArtifactStatement `json:"artifacts"`
}

type EvidenceStatementEnvelope struct {
	Format    string            `json:"format"`
	Version   int               `json:"version"`
	Statement EvidenceStatement `json:"statement"`
}

type VerificationVerifiedClaims struct {
	Trust                    TrustClass            `json:"trust"`
	Issuer                   string                `json:"issuer"`
	Audience                 string                `json:"audience"`
	Subject                  string                `json:"subject"`
	KeyID                    string                `json:"keyId"`
	Algorithm                string                `json:"algorithm"`
	IssuedAt                 string                `json:"issuedAt"`
	NotBefore                string                `json:"notBefore"`
	ExpiresAt                string                `json:"expiresAt"`
	NonceDigest              string                `json:"nonceDigest"`
	ReplayKey                string                `json:"replayKey"`
	ClaimsDigest             string                `json:"claimsDigest"`
	ProofDigest              string                `json:"proofDigest"`
	AttestationDigest        string                `json:"attestationDigest"`
	VerifierID               string                `json:"verifierId"`
	VerifierVersion          string                `json:"verifierVersion"`
	VerifiedAt               string                `json:"verifiedAt"`
	PolicyGeneration         int64                 `json:"policyGeneration"`
	StatementDigest          string                `json:"statementDigest"`
	CandidateDigest          string                `json:"candidateDigest"`
	EvidenceCoreDigest       string                `json:"evidenceCoreDigest"`
	ArtifactSetDigest        string                `json:"artifactSetDigest"`
	ProjectID                string                `json:"projectId"`
	WorkspaceID              string                `json:"workspaceId"`
	WorkspaceRevision        int64                 `json:"workspaceRevision"`
	ExecutableSnapshotDigest string                `json:"executableSnapshotDigest"`
	PlanDigest               string                `json:"planDigest"`
	CellID                   string                `json:"cellId"`
	CheckID                  string                `json:"checkId"`
	CheckKind                string                `json:"checkKind"`
	TargetID                 string                `json:"targetId"`
	TargetPolicyDigest       string                `json:"targetPolicyDigest"`
	AttemptID                string                `json:"attemptId"`
	ProducerDigest           string                `json:"producerDigest"`
	ExecutionDigest          string                `json:"executionDigest"`
	ToolchainDigest          string                `json:"toolchainDigest"`
	NormalizationDigest      string                `json:"normalizationDigest"`
	CI                       *CIRepositoryIdentity `json:"ci,omitempty"`
}

type PersistedProvenance struct {
	Kind       string                      `json:"kind"`
	Trust      TrustClass                  `json:"trust,omitempty"`
	ProducerID string                      `json:"producerId,omitempty"`
	IssuedAt   string                      `json:"issuedAt,omitempty"`
	ExpiresAt  string                      `json:"expiresAt,omitempty"`
	Claims     *VerificationVerifiedClaims `json:"claims,omitempty"`
}

type VerificationEvidenceManifest struct {
	Format             string               `json:"format"`
	CandidateDigest    string               `json:"candidateDigest"`
	Statement          EvidenceStatement    `json:"statement"`
	StatementDigest    string               `json:"statementDigest"`
	VerifiedProvenance PersistedProvenance  `json:"verifiedProvenance"`
	Evidence           VerificationEvidence `json:"evidence"`
	ManifestDigest     string               `json:"manifestDigest,omitempty"`
}

type AttestationPresentation struct {
	Format                   string                `json:"format"`
	Version                  int                   `json:"version"`
	Trust                    TrustClass            `json:"trust"`
	Issuer                   string                `json:"issuer"`
	Audience                 string                `json:"audience"`
	Subject                  string                `json:"subject"`
	Nonce                    string                `json:"nonce"`
	IssuedAt                 string                `json:"issuedAt"`
	NotBefore                string                `json:"notBefore"`
	ExpiresAt                string                `json:"expiresAt"`
	PolicyGeneration         int64                 `json:"policyGeneration"`
	StatementDigest          string                `json:"statementDigest"`
	CandidateDigest          string                `json:"candidateDigest"`
	EvidenceCoreDigest       string                `json:"evidenceCoreDigest"`
	ArtifactSetDigest        string                `json:"artifactSetDigest"`
	ProjectID                string                `json:"projectId"`
	WorkspaceID              string                `json:"workspaceId"`
	WorkspaceRevision        int64                 `json:"workspaceRevision"`
	ExecutableSnapshotDigest string                `json:"executableSnapshotDigest"`
	PlanDigest               string                `json:"planDigest"`
	CellID                   string                `json:"cellId"`
	CheckID                  string                `json:"checkId"`
	CheckKind                string                `json:"checkKind"`
	TargetID                 string                `json:"targetId"`
	TargetPolicyDigest       string                `json:"targetPolicyDigest"`
	AttemptID                string                `json:"attemptId"`
	ProducerDigest           string                `json:"producerDigest"`
	ExecutionDigest          string                `json:"executionDigest"`
	ToolchainDigest          string                `json:"toolchainDigest"`
	NormalizationDigest      string                `json:"normalizationDigest"`
	CI                       *CIRepositoryIdentity `json:"ci,omitempty"`
	Algorithm                string                `json:"algorithm"`
	KeyID                    string                `json:"keyId"`
	Signature                string                `json:"signature"`
}

type VerifiedAttestation struct {
	Trust             TrustClass      `json:"trust"`
	Issuer            string          `json:"issuer"`
	Audience          string          `json:"audience"`
	Subject           string          `json:"subject"`
	KeyID             string          `json:"keyId"`
	Algorithm         string          `json:"algorithm"`
	IssuedAt          time.Time       `json:"issuedAt"`
	NotBefore         time.Time       `json:"notBefore"`
	ExpiresAt         time.Time       `json:"expiresAt"`
	NonceDigest       string          `json:"nonceDigest"`
	ReplayKey         string          `json:"replayKey"`
	StatementDigest   string          `json:"statementDigest"`
	ArtifactSetDigest string          `json:"artifactSetDigest"`
	ClaimsDigest      string          `json:"claimsDigest"`
	AttestationDigest string          `json:"attestationDigest"`
	ProofDigest       string          `json:"proofDigest"`
	VerifierID        string          `json:"verifierId"`
	VerifiedAt        time.Time       `json:"verifiedAt"`
	ClaimsJSON        json.RawMessage `json:"claims"`
	PersistedClaims   VerificationVerifiedClaims
}

type Promotion struct {
	ID                            string
	WorkspaceID                   string
	ProjectID                     string
	Candidate                     EvidenceCandidate
	CandidateBytes                []byte
	CandidateDigest               string
	VerificationPlan              VerificationPlanGrant
	VerificationPlanBytes         []byte
	AttemptGrantID                string
	AttemptGrantDigest            string
	ProtectReleaseEvidence        bool
	ActorID                       string
	State                         string
	Trust                         TrustClass
	Retention                     RetentionClass
	EvidenceID                    string
	EvidenceCreatedAt             time.Time
	CapabilityHash                string
	NonceHash                     string
	Deadline                      time.Time
	Statement                     *EvidenceStatement
	StatementBytes                []byte
	StatementDigest               string
	ManifestDigest                string
	MaximumClosureEvidenceRecords int
	Version                       int64
}

type CreatePromotionResult struct {
	PromotionID                string             `json:"promotionId"`
	EvidenceID                 string             `json:"evidenceId"`
	State                      string             `json:"state"`
	CreatedAt                  string             `json:"createdAt"`
	Deadline                   string             `json:"deadline"`
	UploadCapability           string             `json:"uploadCapability,omitempty"`
	AttestationNonce           string             `json:"attestationNonce,omitempty"`
	AttestationStatement       *EvidenceStatement `json:"attestationStatement,omitempty"`
	AttestationStatementDigest string             `json:"attestationStatementDigest,omitempty"`
}

type ArtifactDescriptor struct {
	ID                string       `json:"id"`
	Path              string       `json:"path"`
	Kind              ArtifactKind `json:"kind"`
	Digest            string       `json:"digest"`
	NormalizedDigest  string       `json:"normalizedDigest,omitempty"`
	SourceTraceDigest string       `json:"sourceTraceDigest,omitempty"`
	Size              int64        `json:"size"`
	MediaType         string       `json:"mediaType"`
	Availability      string       `json:"availability"`
}

type VerifiedArtifactAvailability struct {
	ArtifactID string `json:"artifactId"`
	Digest     string `json:"digest"`
	Status     string `json:"status"`
}

type VerifiedViewRecord struct {
	EvidenceID                 string                         `json:"evidenceId"`
	ManifestDigest             string                         `json:"manifestDigest"`
	MaterializedEvidenceDigest string                         `json:"materializedEvidenceDigest"`
	EffectiveTrust             TrustClass                     `json:"effectiveTrust"`
	TrustStatus                string                         `json:"trustStatus"`
	AttestationDigest          string                         `json:"attestationDigest,omitempty"`
	RetentionState             string                         `json:"retentionState"`
	RetentionExpiresAt         string                         `json:"retentionExpiresAt,omitempty"`
	SupersededByEvidenceID     string                         `json:"supersededByEvidenceId,omitempty"`
	RevocationRecordDigests    []string                       `json:"revocationRecordDigests"`
	TombstoneDigest            string                         `json:"tombstoneDigest,omitempty"`
	Artifacts                  []VerifiedArtifactAvailability `json:"artifacts"`
	RecordDigest               string                         `json:"recordDigest"`
}

type EvidenceRecord struct {
	Evidence          VerificationEvidence  `json:"evidence"`
	Artifacts         []ArtifactDescriptor  `json:"artifacts"`
	VerifiedView      VerifiedViewRecord    `json:"verifiedView"`
	ActiveProtections []RetentionProtection `json:"activeProtections"`
}

type ListFilter struct {
	WorkspaceRevision    int64
	WorkspaceRevisionSet bool
	PlanDigest           string
	CellID               string
	Trust                TrustClass
	Outcome              string
	Limit                int
	CursorCreatedAt      time.Time
	CursorID             string
}

type EvidencePage struct {
	Records    []EvidenceRecord `json:"records"`
	NextCursor string           `json:"nextCursor,omitempty"`
}

type ComparisonPolicy struct {
	ID                    string   `json:"id"`
	Digest                string   `json:"digest"`
	AllowedMismatchFields []string `json:"allowedMismatchFields"`
}

type ComparisonDescriptor struct {
	Compatibility    string   `json:"compatibility"`
	LeftEvidenceID   string   `json:"leftEvidenceId"`
	RightEvidenceID  string   `json:"rightEvidenceId"`
	MismatchFields   []string `json:"mismatchFields"`
	PolicyID         string   `json:"policyId,omitempty"`
	PolicyDigest     string   `json:"policyDigest,omitempty"`
	ComparisonDigest string   `json:"comparisonDigest"`
}

type ClosureView struct {
	Format                   string               `json:"format"`
	ClosureEvaluationInstant string               `json:"closureEvaluationInstant"`
	Records                  []VerifiedViewRecord `json:"records"`
	RevocationRecordDigest   string               `json:"revocationRecordDigest"`
	ViewDigest               string               `json:"viewDigest"`
}

type RetentionProtection struct {
	ID          string `json:"id"`
	EvidenceID  string `json:"evidenceId"`
	Kind        string `json:"kind"`
	ExternalRef string `json:"externalRef"`
	Active      bool   `json:"active"`
	Version     int64  `json:"version"`
}

type RetentionSweepPolicy struct {
	ObservedAt     time.Time
	TombstoneGrace time.Duration
	PromotionTTL   time.Duration
	BatchSize      int
}

type RetentionSweepResult struct {
	ExpiredPromotions  int `json:"expiredPromotions"`
	TombstonedEvidence int `json:"tombstonedEvidence"`
	ReleasedReferences int `json:"releasedReferences"`
	DeletedArtifacts   int `json:"deletedArtifacts"`
	RecoveredOrphans   int `json:"recoveredOrphans"`
}

type TrustRevocationRecord struct {
	Format       string `json:"format"`
	Version      int    `json:"version"`
	ID           string `json:"id"`
	Scope        any    `json:"scope"`
	ReasonCode   string `json:"reasonCode"`
	Reason       string `json:"reason"`
	ActorID      string `json:"actorId"`
	RecordedAt   string `json:"recordedAt"`
	EffectiveAt  string `json:"effectiveAt"`
	RecordDigest string `json:"recordDigest,omitempty"`
}
