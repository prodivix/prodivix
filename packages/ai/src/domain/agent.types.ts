export type CanonicalDigest = string;
export type Instant = string;
export type DecimalString = string;
export type BoundedText = string;
export type AgentJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly AgentJsonValue[]
  | Readonly<{ [key: string]: AgentJsonValue }>;

export type AgentPolicyId = string;
export type AgentTaskId = string;
export type AgentRunId = string;
export type AgentCapabilityGrantId = string;
export type AgentContextPackId = string;
export type AgentContextItemId = string;
export type AgentProposalId = string;
export type AgentProposalPreviewId = string;
export type AgentApprovalDecisionId = string;
export type AgentInvocationId = string;
export type AgentToolId = string;
export type AgentToolRegistryId = string;
export type AgentAuditEventId = string;
export type AgentModelEvaluationManifestRef = string;
export type AgentMediaRepresentationRef = string;
export type AgentNetworkPolicyRef = string;
export type AgentUsageVectorRef = string;

export type AgentPrincipalRef = Readonly<{
  kind: 'user' | 'service';
  principalId: string;
}>;

export type AgentWorkspaceDocumentRevision = Readonly<{
  documentId: string;
  contentRev: number;
  metaRev: number;
}>;

export type AgentWorkspaceRevisionVector = Readonly<{
  workspaceRev: number;
  routeRev: number;
  opSeq: number;
  documents: readonly AgentWorkspaceDocumentRevision[];
}>;

export type AgentPolicyRef = Readonly<{
  documentId: string;
}>;

export type AgentCapabilityGrantRef = Readonly<{
  grantId: AgentCapabilityGrantId;
}>;

export type AgentTargetRef = Readonly<{
  kind: 'workspace' | 'document' | 'semantic-target';
  id: string;
}>;

export type AgentTargetScope = Readonly<{
  targets: readonly AgentTargetRef[];
}>;

export type AgentSensitivity =
  'public' | 'internal' | 'confidential' | 'restricted';

export type AgentRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type AgentCapability =
  'read' | 'execute' | 'propose' | 'approve' | 'commit' | 'rollback';

export type AgentRuntimeZone = 'browser' | 'server' | 'native' | 'sandbox';

export type AgentProviderProtocolFamily =
  | 'openai-responses'
  | 'anthropic-messages'
  | 'gemini-interactions'
  | 'openai-compatible';

export type AgentProviderSupportTier =
  'release-evaluated' | 'admission-only' | 'disabled';

export type AgentProviderEndpointClass =
  'first-party-hosted' | 'aggregator' | 'self-hosted' | 'local';

export type AgentUsageUnit =
  | 'text-token-input'
  | 'text-token-output'
  | 'reasoning-token'
  | 'cache-read-token'
  | 'cache-write-token'
  | 'image'
  | 'image-pixel'
  | 'document-page'
  | 'audio-second'
  | 'video-second'
  | 'video-frame'
  | 'hosted-search-query'
  | 'hosted-tool-call'
  | 'sandbox-compute-second'
  | 'provider-storage-byte-second';

export type AgentUsageLimit = Readonly<{
  unit: AgentUsageUnit;
  maximum: DecimalString;
}>;

export type AgentCostLimit = Readonly<{
  currency: string;
  maximum: DecimalString;
}>;

export type AgentBudget = Readonly<{
  usageLimits: readonly AgentUsageLimit[];
  costLimits: readonly AgentCostLimit[];
  maxModelInvocations: number;
  maxToolCalls: number;
  maxRepairRounds: number;
  maxTransactions: number;
  maxArtifactBytes: number;
  maxElapsedMs: number;
}>;

export type AgentProviderRule = Readonly<{
  id: string;
  effect: 'allow' | 'deny';
  providerConfigurationIds: readonly string[];
  protocolFamilies: readonly AgentProviderProtocolFamily[];
  endpointClasses: readonly AgentProviderEndpointClass[];
  regions: readonly string[];
  minimumSupportTier: AgentProviderSupportTier;
  maximumSensitivity: AgentSensitivity;
}>;

export type AgentModelRule = Readonly<{
  id: string;
  effect: 'allow' | 'deny';
  modelIds: readonly string[];
  modelFamilyIds: readonly string[];
  capabilityProfileIds: readonly string[];
  minimumSupportTier: AgentProviderSupportTier;
}>;

export type AgentContextAuthority =
  'canonical' | 'derived' | 'user-provided' | 'external-untrusted';

export type AgentContextInstructionBoundary =
  'system' | 'developer-policy' | 'user-intent' | 'data-only';

export type AgentContextPolicy = Readonly<{
  allowedAuthorities: readonly AgentContextAuthority[];
  allowedItemKinds: readonly string[];
  maximumSensitivity: AgentSensitivity;
  maxItems: number;
  maxBytes: number;
  requireSourceTrace: boolean;
  externalInstructionBoundary: 'data-only';
}>;

export type AgentCapabilityRule = Readonly<{
  id: string;
  effect: 'allow' | 'deny';
  capabilities: readonly AgentCapability[];
  targetScope: AgentTargetScope;
  toolIds: readonly AgentToolId[];
  runtimeZones: readonly AgentRuntimeZone[];
  maximumRisk: AgentRiskLevel;
}>;

export type AgentApprovalRule = Readonly<{
  id: string;
  riskLevels: readonly AgentRiskLevel[];
  capabilities: readonly AgentCapability[];
  decisionAuthority: 'explicit-human';
  rollbackAuthorization: 'none' | 'on-unsatisfied-closure';
}>;

export type AgentNetworkRule = Readonly<{
  id: string;
  effect: 'allow' | 'deny';
  hosts: readonly string[];
  methods: readonly ('GET' | 'HEAD' | 'POST')[];
  maxRequestBytes: number;
  maxResponseBytes: number;
  redirectPolicy: 'deny' | 'same-origin';
  tls: 'required';
}>;

export type AgentSecretRule = Readonly<{
  id: string;
  effect: 'allow' | 'deny';
  referenceKinds: readonly string[];
  purposes: readonly string[];
  runtimeZones: readonly Exclude<AgentRuntimeZone, 'browser'>[];
}>;

export type AgentVerificationRules = Readonly<{
  requiredModes: readonly 'apply'[];
  requiredClosure: 'satisfied';
  requiredCheckKinds: readonly string[];
  repair: 'forbidden' | 'approval-bound';
  rollback: 'forbidden' | 'approval-bound';
}>;

export type AgentRetentionRules = Readonly<{
  auditDays: number;
  sanitizedTraceDays: number;
  rawPrivateArtifactDays: number;
  providerStateDays: number;
  requireDeletionReceipt: boolean;
}>;

export type AgentPrivacyPolicy = Readonly<{
  maximumSensitivity: AgentSensitivity;
  allowedRegions: readonly string[];
  providerTraining: 'deny' | 'policy-qualified';
  providerTelemetry: 'deny' | 'policy-qualified';
  rawArtifactCapture: 'deny' | 'role-restricted';
}>;

/** The only project-authored G4 policy document in Canonical Workspace. */
export type AgentPolicy = Readonly<{
  id: AgentPolicyId;
  name: string;
  providerRules: readonly AgentProviderRule[];
  modelRules: readonly AgentModelRule[];
  contextRules: AgentContextPolicy;
  capabilityRules: readonly AgentCapabilityRule[];
  approvalRules: readonly AgentApprovalRule[];
  networkRules: readonly AgentNetworkRule[];
  secretRules: readonly AgentSecretRule[];
  budgetCeiling: AgentBudget;
  verificationRules: AgentVerificationRules;
  retentionRules: AgentRetentionRules;
  privacy: AgentPrivacyPolicy;
}>;

export type AgentPolicyEvaluation = Readonly<{
  projectPolicyRef: AgentPolicyRef;
  projectPolicyDigest: CanonicalDigest;
  enforcementPolicyDigests: readonly CanonicalDigest[];
  actorAuthorizationDigest: CanonicalDigest;
  effectivePolicyDigest: CanonicalDigest;
  evaluatedAt: Instant;
}>;

export type AgentTaskMode = 'explain' | 'plan' | 'propose' | 'apply';

export type AgentVerificationRequirement = Readonly<{
  policyRef: string;
  requiredCheckKinds: readonly string[];
}>;

/** Immutable human request. `apply` never pre-authorizes a Workspace write. */
export type AgentTaskSpec = Readonly<{
  taskId: AgentTaskId;
  projectId: string;
  workspaceId: string;
  actor: AgentPrincipalRef;
  mode: AgentTaskMode;
  baseRevision: AgentWorkspaceRevisionVector;
  intent: BoundedText;
  intentDigest: CanonicalDigest;
  targetScope: AgentTargetScope;
  policyRef: AgentPolicyRef;
  policyDigest: CanonicalDigest;
  initialGrantRef: AgentCapabilityGrantRef;
  budget: AgentBudget;
  verificationRequirement: AgentVerificationRequirement;
  createdAt: Instant;
  idempotencyKey: string;
}>;

export type AgentRunPhase =
  | 'queued'
  | 'preparing'
  | 'running'
  | 'awaiting-approval'
  | 'committing'
  | 'verifying'
  | 'repairing'
  | 'cancelling'
  | 'terminal';

export type AgentRunOutcome =
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'cancelled'
  | 'budget-exhausted'
  | 'infrastructure-error';

export type AgentRun = Readonly<{
  runId: AgentRunId;
  taskId: AgentTaskId;
  generation: number;
  attempt: number;
  phase: AgentRunPhase;
  outcome?: AgentRunOutcome;
  baseRevision: AgentWorkspaceRevisionVector;
  policyDigest: CanonicalDigest;
  grantRef: AgentCapabilityGrantRef;
  contextPackDigest?: CanonicalDigest;
  latestEventDigest?: CanonicalDigest;
  createdAt: Instant;
  updatedAt: Instant;
}>;

export type AgentGrantLimits = Readonly<{
  budget: AgentBudget;
  maxUses: number;
}>;

export type AgentSecretReference = Readonly<{
  kind: string;
  referenceId: string;
  purpose: string;
}>;

export type AgentCapabilityGrant = Readonly<{
  grantId: AgentCapabilityGrantId;
  subject: AgentPrincipalRef;
  taskId: AgentTaskId;
  runId?: AgentRunId;
  workspaceId: string;
  baseRevision: AgentWorkspaceRevisionVector;
  targetScope: AgentTargetScope;
  capabilities: readonly AgentCapability[];
  toolIds: readonly AgentToolId[];
  runtimeZones: readonly AgentRuntimeZone[];
  networkPolicyRef?: AgentNetworkPolicyRef;
  secretRefs: readonly AgentSecretReference[];
  limits: AgentGrantLimits;
  policyRef: AgentPolicyRef;
  policyDigest: CanonicalDigest;
  issuedAt: Instant;
  expiresAt: Instant;
  maxUses: number;
}>;

export type AgentGroundingReference = Readonly<{
  kind: 'workspace-document' | 'semantic-symbol' | 'source-trace' | 'external';
  id: string;
}>;

export type AgentContextItem = Readonly<{
  itemId: AgentContextItemId;
  kind: string;
  authority: AgentContextAuthority;
  source: AgentGroundingReference;
  revision: AgentWorkspaceRevisionVector;
  contentDigest: CanonicalDigest;
  mediaType: string;
  byteLength: number;
  mediaRepresentationRef?: AgentMediaRepresentationRef;
  sensitivity: AgentSensitivity;
  instructionBoundary: AgentContextInstructionBoundary;
  sourceTraceRef?: string;
}>;

export type AgentContextOmission = Readonly<{
  source: AgentGroundingReference;
  reason:
    'budget' | 'policy' | 'sensitivity' | 'unsupported' | 'stale' | 'invalid';
  diagnosticCode: string;
}>;

export type AgentContextPack = Readonly<{
  contextPackId: AgentContextPackId;
  taskId: AgentTaskId;
  runId: AgentRunId;
  workspaceRevision: AgentWorkspaceRevisionVector;
  semanticSnapshotRef: string;
  semanticProviderSetDigest: CanonicalDigest;
  items: readonly AgentContextItem[];
  omitted: readonly AgentContextOmission[];
  budget: Readonly<{ maxItems: number; maxBytes: number }>;
  manifestDigest: CanonicalDigest;
}>;

export type AgentToolEffect =
  'read' | 'ephemeral-execute' | 'proposal' | 'external-side-effect';

export type AgentToolExecutionLocus =
  'client-hosted' | 'prodivix-runtime' | 'provider-hosted' | 'pinned-mcp';

export type AgentToolDescriptor = Readonly<{
  toolId: AgentToolId;
  name: string;
  version: string;
  implementationDigest: CanonicalDigest;
  inputSchemaDigest: CanonicalDigest;
  outputSchemaDigest: CanonicalDigest;
  effect: AgentToolEffect;
  executionLocus: AgentToolExecutionLocus;
  operatorId: string;
  requiredCapabilities: readonly AgentCapability[];
  targetScopePolicyDigest: CanonicalDigest;
  networkPolicyRef?: AgentNetworkPolicyRef;
  secretPurposeRefs: readonly string[];
  statePolicyDigest: CanonicalDigest;
  retentionPolicyDigest: CanonicalDigest;
  budgetProfileDigest: CanonicalDigest;
  concurrencyPolicyDigest: CanonicalDigest;
  normalizationDigest: CanonicalDigest;
  descriptorDigest: CanonicalDigest;
}>;

export type AgentToolRegistrySnapshot = Readonly<{
  registryId: AgentToolRegistryId;
  descriptors: readonly AgentToolDescriptor[];
  searchableDescriptorIds: readonly AgentToolId[];
  alwaysVisibleDescriptorIds: readonly AgentToolId[];
  discoveryPolicyDigest: CanonicalDigest;
  registryDigest: CanonicalDigest;
}>;

export type AgentProposedAction = Readonly<{
  ownerId: string;
  actionType: string;
  inputSchemaId: string;
  target: AgentTargetRef;
  input: AgentJsonValue;
}>;

export type AgentActionProposal = Readonly<{
  proposalId: AgentProposalId;
  taskId: AgentTaskId;
  runId: AgentRunId;
  baseRevision: AgentWorkspaceRevisionVector;
  contextPackDigest: CanonicalDigest;
  actions: readonly AgentProposedAction[];
  explanation: BoundedText;
  assumptions: readonly BoundedText[];
  requestedVerification: AgentVerificationRequirement;
  modelInvocationRefs: readonly AgentInvocationId[];
  proposalDigest: CanonicalDigest;
}>;

export type AgentRisk = Readonly<{
  id: string;
  level: AgentRiskLevel;
  message: BoundedText;
}>;

export type AgentProposalPreview = Readonly<{
  previewId: AgentProposalPreviewId;
  proposalId: AgentProposalId;
  baseRevision: AgentWorkspaceRevisionVector;
  proposedSnapshotDigest: CanonicalDigest;
  transactionDigest: CanonicalDigest;
  reverseTransactionDigest: CanonicalDigest;
  semanticDiffDigest: CanonicalDigest;
  impactSetRef: string;
  impactDigest: CanonicalDigest;
  verificationPlanRef: string;
  verificationPlanDigest: CanonicalDigest;
  requiredCapabilities: readonly AgentCapability[];
  risks: readonly AgentRisk[];
  diagnosticRefs: readonly string[];
  previewDigest: CanonicalDigest;
  expiresAt: Instant;
}>;

export type AgentApprovalDecision = Readonly<{
  decisionId: AgentApprovalDecisionId;
  decision: 'approved' | 'rejected';
  actor: AgentPrincipalRef;
  taskId: AgentTaskId;
  runId: AgentRunId;
  previewId: AgentProposalPreviewId;
  previewDigest: CanonicalDigest;
  baseRevision: AgentWorkspaceRevisionVector;
  transactionDigest: CanonicalDigest;
  impactDigest: CanonicalDigest;
  verificationPlanDigest: CanonicalDigest;
  grantRef: AgentCapabilityGrantRef;
  policyDigest: CanonicalDigest;
  rollbackAuthorization: 'none' | 'on-unsatisfied-closure';
  reason?: BoundedText;
  decidedAt: Instant;
  expiresAt: Instant;
}>;

export type AgentAuditEventFamily =
  | 'task'
  | 'run'
  | 'context'
  | 'model'
  | 'tool'
  | 'proposal'
  | 'approval'
  | 'commit'
  | 'verification'
  | 'repair'
  | 'rollback'
  | 'budget'
  | 'security';

export type AgentAuditEvent = Readonly<{
  eventId: AgentAuditEventId;
  family: AgentAuditEventFamily;
  type: string;
  taskId: AgentTaskId;
  runId?: AgentRunId;
  generation?: number;
  producer: AgentPrincipalRef;
  occurredAt: Instant;
  previousEventDigest?: CanonicalDigest;
  payloadDigest: CanonicalDigest;
  policyDigest: CanonicalDigest;
  grantRef?: AgentCapabilityGrantRef;
  sanitizedPayload: AgentJsonValue;
  eventDigest: CanonicalDigest;
}>;
