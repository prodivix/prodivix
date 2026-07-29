package verification

type VerificationPlanControlProfileRef struct {
	Kind       string `json:"kind"`
	DocumentID string `json:"documentId,omitempty"`
	PresetID   string `json:"presetId,omitempty"`
	Digest     string `json:"digest,omitempty"`
}

type VerificationPlanDocumentDigestRef struct {
	DocumentID string `json:"documentId"`
	Digest     string `json:"digest,omitempty"`
}

type VerificationPlanAdapterIdentity struct {
	AdapterID        string `json:"adapterId"`
	DescriptorDigest string `json:"descriptorDigest"`
	ToolchainDigest  string `json:"toolchainDigest"`
	CapabilityDigest string `json:"capabilityDigest"`
}

type VerificationPlanRetryPolicy struct {
	ID                    string   `json:"id"`
	MaximumAttempts       int64    `json:"maximumAttempts"`
	RetryableOutcomes     []string `json:"retryableOutcomes"`
	StabilitySamples      int64    `json:"stabilitySamples"`
	FreshFixtureNamespace bool     `json:"freshFixtureNamespace"`
}

type VerificationPlanEvidenceRequirements struct {
	AcceptedTrust             []TrustClass   `json:"acceptedTrust"`
	MaximumAgeMS              int64          `json:"maximumAgeMs"`
	RequireAttestation        bool           `json:"requireAttestation"`
	RequireCompatibleIdentity bool           `json:"requireCompatibleIdentity"`
	RequiredArtifactKinds     []ArtifactKind `json:"requiredArtifactKinds"`
}

type VerificationPlanResource struct {
	Key  string `json:"key"`
	Mode string `json:"mode"`
}

type VerificationPlanCost struct {
	DurationMS    int64 `json:"durationMs"`
	ArtifactBytes int64 `json:"artifactBytes"`
	ComputeUnits  int64 `json:"computeUnits"`
}

type VerificationPlanPreflight struct {
	Status     string `json:"status"`
	ReasonCode string `json:"reasonCode,omitempty"`
	Message    string `json:"message,omitempty"`
}

type VerificationPlanCell struct {
	ID                   string                               `json:"id"`
	CheckID              string                               `json:"checkId"`
	CheckKind            string                               `json:"checkKind"`
	ScenarioID           string                               `json:"scenarioId,omitempty"`
	TargetID             string                               `json:"targetId"`
	TargetPolicy         TargetPolicy                         `json:"targetPolicy"`
	FrameworkTarget      string                               `json:"frameworkTarget"`
	Surface              string                               `json:"surface"`
	BrowserEngine        string                               `json:"browserEngine,omitempty"`
	Viewport             ViewportIdentity                     `json:"viewport"`
	ColorScheme          string                               `json:"colorScheme"`
	Motion               string                               `json:"motion"`
	Locale               string                               `json:"locale"`
	ControlProfileRef    VerificationPlanControlProfileRef    `json:"controlProfileRef"`
	FixtureSetRef        *VerificationPlanDocumentDigestRef   `json:"fixtureSetRef,omitempty"`
	BaselineSetRef       *VerificationPlanDocumentDigestRef   `json:"baselineSetRef,omitempty"`
	Adapter              VerificationPlanAdapterIdentity      `json:"adapter"`
	Requirement          string                               `json:"requirement"`
	PolicyRuleIDs        []string                             `json:"policyRuleIds"`
	AppliedExemptionIDs  []string                             `json:"appliedExemptionIds"`
	RetryPolicy          VerificationPlanRetryPolicy          `json:"retryPolicy"`
	EvidenceRequirements VerificationPlanEvidenceRequirements `json:"evidenceRequirements"`
	Resources            []VerificationPlanResource           `json:"resources"`
	InputKinds           []string                             `json:"inputKinds"`
	ArtifactKinds        []ArtifactKind                       `json:"artifactKinds"`
	EstimatedCost        VerificationPlanCost                 `json:"estimatedCost"`
	Preflight            VerificationPlanPreflight            `json:"preflight"`
	DependencyCellIDs    []string                             `json:"dependencyCellIds"`
	InputDigest          string                               `json:"inputDigest"`
}

type VerificationPlanIssue struct {
	Code       string   `json:"code"`
	Message    string   `json:"message"`
	CellID     string   `json:"cellId,omitempty"`
	CheckID    string   `json:"checkId,omitempty"`
	RelatedIDs []string `json:"relatedIds"`
}

type VerificationPlanExplanation struct {
	CellID        string   `json:"cellId,omitempty"`
	CheckID       string   `json:"checkId"`
	ScenarioID    string   `json:"scenarioId,omitempty"`
	TargetID      string   `json:"targetId"`
	Status        string   `json:"status"`
	ImpactPathIDs []string `json:"impactPathIds"`
	PolicyRuleIDs []string `json:"policyRuleIds"`
	Messages      []string `json:"messages"`
}

type VerificationPlanCheckKindCounts struct {
	Diagnostics   int64 `json:"diagnostics"`
	Build         int64 `json:"build"`
	Unit          int64 `json:"unit"`
	Integration   int64 `json:"integration"`
	E2E           int64 `json:"e2e"`
	Visual        int64 `json:"visual"`
	Accessibility int64 `json:"accessibility"`
	Performance   int64 `json:"performance"`
	Security      int64 `json:"security"`
}

type VerificationPlanBudgetSummary struct {
	Cells                  int64                           `json:"cells"`
	CellsByCheckKind       VerificationPlanCheckKindCounts `json:"cellsByCheckKind"`
	TargetExpansions       int64                           `json:"targetExpansions"`
	BrowserExpansions      int64                           `json:"browserExpansions"`
	ClosureEvidenceRecords int64                           `json:"closureEvidenceRecords"`
	TotalMS                int64                           `json:"totalMs"`
	ArtifactBytes          int64                           `json:"artifactBytes"`
	EstimatedComputeUnits  int64                           `json:"estimatedComputeUnits"`
	MaximumParallelism     int64                           `json:"maximumParallelism"`
	OverBudgetDimensions   []string                        `json:"overBudgetDimensions"`
}

// VerificationPlanGrant is the complete current-model VerificationPlan needed
// to authorize one attempt. It deliberately mirrors Core rather than accepting
// a client-selected subset of identity fields.
type VerificationPlanGrant struct {
	Status                   string                        `json:"status"`
	WorkspaceID              string                        `json:"workspaceId"`
	TargetRevision           int64                         `json:"targetRevision"`
	TargetPartitionRevisions PartitionRevisions            `json:"targetPartitionRevisions"`
	ScenarioRegistryDigest   string                        `json:"scenarioRegistryDigest"`
	PolicyRevision           int64                         `json:"policyRevision"`
	PolicyDigest             string                        `json:"policyDigest"`
	RetentionRequest         AuthoritativeRetentionRequest `json:"retentionRequest"`
	PolicyEvaluationInstant  string                        `json:"policyEvaluationInstant"`
	ImpactDigest             string                        `json:"impactDigest"`
	SemanticSchemaDigest     string                        `json:"semanticSchemaDigest"`
	ProviderSetDigest        string                        `json:"providerSetDigest"`
	CompilerDigest           string                        `json:"compilerDigest"`
	PlannerDigest            string                        `json:"plannerDigest"`
	AdapterRegistryDigest    string                        `json:"adapterRegistryDigest"`
	PlanDigest               string                        `json:"planDigest"`
	Cells                    []VerificationPlanCell        `json:"cells"`
	Issues                   []VerificationPlanIssue       `json:"issues"`
	Explanations             []VerificationPlanExplanation `json:"explanations"`
	Budget                   VerificationPlanBudgetSummary `json:"budget"`
}

type verificationPlanWireGrant struct {
	WireVersion int `json:"wireVersion"`
	VerificationPlanGrant
}
