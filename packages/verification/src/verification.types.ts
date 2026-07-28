import type {
  BehaviorControlProfileRef,
  BehaviorDocumentDigestRef,
} from '@prodivix/behavior';
import type { SourceSpan } from '@prodivix/diagnostics';

export type VerificationCheckKind =
  | 'diagnostics'
  | 'build'
  | 'unit'
  | 'integration'
  | 'e2e'
  | 'visual'
  | 'accessibility'
  | 'performance'
  | 'security';

export type VerificationSurface = 'preview' | 'export' | 'ci';
export type VerificationBrowserEngine = 'chromium' | 'firefox' | 'webkit';
export type VerificationColorScheme = 'light' | 'dark';
export type VerificationMotion = 'full' | 'reduced';
export type VerificationRequirement = 'required' | 'advisory';
export type VerificationPolicyRequirement =
  VerificationRequirement | 'forbidden';
export type VerificationEvidenceTrust =
  'local-unattested' | 'remote-attested' | 'ci-attested' | 'imported-untrusted';

export type VerificationViewportAxis = Readonly<{
  id: string;
  width: number;
  height: number;
}>;

export type VerificationMatrix = Readonly<{
  frameworkTargets: readonly string[];
  surfaces: readonly VerificationSurface[];
  browserEngines: readonly VerificationBrowserEngine[];
  viewports: readonly VerificationViewportAxis[];
  colorSchemes: readonly VerificationColorScheme[];
  motions: readonly VerificationMotion[];
  locales: readonly string[];
}>;

export type VerificationMatrixProfile = Readonly<{
  id: string;
  name: string;
  matrix: VerificationMatrix;
}>;

export type VerificationPolicyRule = Readonly<{
  id: string;
  requirement: VerificationPolicyRequirement;
  checkKinds: readonly VerificationCheckKind[];
  scenarioIds: readonly string[];
  scenarioTags: readonly string[];
  criticalities: readonly ('smoke' | 'standard' | 'critical')[];
  impactedDomains: readonly string[];
  riskFlags: readonly string[];
  matrixProfileId: string;
  retryPolicyId: string;
  evidenceTrust: VerificationEvidenceTrust;
  controlProfileRef: BehaviorControlProfileRef;
  fixtureSetRef?: BehaviorDocumentDigestRef;
  baselineSetRef?: BehaviorDocumentDigestRef;
}>;

export type VerificationExemption = Readonly<{
  id: string;
  ruleId: string;
  targetId: string;
  reason: string;
  actorRef: string;
  createdAt: string;
  expiresAt: string;
  reducesTo: 'advisory';
  issueRef: string;
}>;

export type VerificationPlanBudgets = Readonly<{
  maximumCells: number;
  maximumCellsPerCheckKind: number;
  maximumTargetExpansions: number;
  maximumBrowserExpansions: number;
  totalMs: number;
  artifactBytes: number;
  estimatedComputeUnits: number;
  parallelism: number;
}>;

export type VerificationRetryPolicy = Readonly<{
  id: string;
  maximumAttempts: number;
  retryableOutcomes: readonly 'infrastructure-error'[];
  stabilitySamples: number;
  freshFixtureNamespace: true;
}>;

export type VerificationEvidenceRequirements = Readonly<{
  acceptedTrust: readonly VerificationEvidenceTrust[];
  maximumAgeMs: number;
  requireAttestation: boolean;
  requireCompatibleIdentity: true;
  requiredArtifactKinds: readonly VerificationArtifactKind[];
}>;

export type VerificationPolicy = Readonly<{
  id: string;
  name: string;
  defaultRequirement: VerificationPolicyRequirement;
  rules: readonly VerificationPolicyRule[];
  matrixProfiles: readonly VerificationMatrixProfile[];
  budgets: VerificationPlanBudgets;
  retryPolicies: readonly VerificationRetryPolicy[];
  exemptions: readonly VerificationExemption[];
  evidenceRequirements: VerificationEvidenceRequirements;
  baselinePolicy: Readonly<{
    visual: 'required-when-observed' | 'advisory' | 'forbidden';
    requireCompatibleIdentity: true;
  }>;
  retentionRequest: Readonly<{
    successful: VerificationRetentionClass;
    failed: VerificationRetentionClass;
    protectReleaseEvidence: boolean;
  }>;
}>;

export type VerificationBaselineAssetRef = Readonly<{
  assetDocumentId: string;
  digest: string;
  mediaType: string;
}>;

export type VerificationBaselineEntry = Readonly<{
  id: string;
  scenarioId: string;
  stepId: string;
  targetId: string;
  frameworkTarget: string;
  surface: VerificationSurface;
  browserEngine?: VerificationBrowserEngine;
  viewport: VerificationViewportAxis;
  colorScheme: VerificationColorScheme;
  motion: VerificationMotion;
  locale: string;
  devicePixelRatio: number;
  asset: VerificationBaselineAssetRef;
  normalizerDigest: string;
  adoptedAt: string;
  adoptedBy: string;
}>;

export type VerificationBaselineSet = Readonly<{
  id: string;
  name: string;
  entries: readonly VerificationBaselineEntry[];
}>;

export type VerificationImpactSet = Readonly<{
  workspaceId: string;
  baseRevision?: number;
  basePartitionRevisions?: VerificationPartitionRevisions;
  targetRevision: number;
  targetPartitionRevisions: VerificationPartitionRevisions;
  semanticSchemaDigest: string;
  providerSetDigest: string;
  operationIds: readonly string[];
  contributorIds: readonly string[];
  changedDocumentIds: readonly string[];
  changedSymbolIds: readonly string[];
  changedSourceSpans: readonly SourceSpan[];
  impactedSymbolIds: readonly string[];
  impactedScenarioIds: readonly string[];
  impactedDomains: readonly string[];
  frameworkTargets: readonly string[];
  runtimeZones: readonly string[];
  capabilityIds: readonly string[];
  riskFlags: readonly string[];
  impactPaths: readonly VerificationImpactPath[];
  completeness: 'complete' | 'conservative' | 'unknown';
  reasons: readonly VerificationImpactReason[];
  impactDigest: string;
}>;

export type VerificationImpactCompleteness =
  VerificationImpactSet['completeness'];

export type VerificationImpactRelationship =
  | 'changed'
  | 'reference'
  | 'dependency'
  | 'capability'
  | 'domain'
  | 'conservative-expansion';

export type VerificationImpactPath = Readonly<{
  id: string;
  relationship: VerificationImpactRelationship;
  fromId: string;
  toId: string;
  nodes: readonly string[];
  contributorId: string;
}>;

export type VerificationImpactReasonKind =
  | 'document-change'
  | 'symbol-change'
  | 'reference'
  | 'dependency'
  | 'capability-change'
  | 'target-change'
  | 'schema-drift'
  | 'provider-drift'
  | 'missing-before'
  | 'graph-budget-exceeded'
  | 'contributor-incomplete'
  | 'conservative-expansion';

export type VerificationImpactReason = Readonly<{
  id: string;
  kind: VerificationImpactReasonKind;
  message: string;
  contributorId: string;
  sourceId?: string;
  targetId?: string;
}>;

export type VerificationImpactContribution = Readonly<{
  contributorId: string;
  completeness: VerificationImpactCompleteness;
  changedDocumentIds?: readonly string[];
  changedSymbolIds?: readonly string[];
  changedSourceSpans?: readonly SourceSpan[];
  impactedSymbolIds?: readonly string[];
  impactedScenarioIds?: readonly string[];
  impactedDomains?: readonly string[];
  frameworkTargets?: readonly string[];
  runtimeZones?: readonly string[];
  capabilityIds?: readonly string[];
  riskFlags?: readonly string[];
  impactPaths?: readonly VerificationImpactPath[];
  reasons?: readonly VerificationImpactReason[];
}>;

export type CreateVerificationImpactSetInput = Readonly<{
  workspaceId: string;
  baseRevision?: number;
  basePartitionRevisions?: VerificationPartitionRevisions;
  targetRevision: number;
  targetPartitionRevisions: VerificationPartitionRevisions;
  semanticSchemaDigest: string;
  providerSetDigest: string;
  operationIds: readonly string[];
  contributions: readonly VerificationImpactContribution[];
  conservativeScope?: Readonly<{
    scenarioIds: readonly string[];
    domains: readonly string[];
    frameworkTargets: readonly string[];
    runtimeZones: readonly string[];
    capabilityIds: readonly string[];
    riskFlags: readonly string[];
  }>;
}>;

export type VerificationImpactSetResult =
  | Readonly<{ status: 'ready'; impactSet: VerificationImpactSet }>
  | Readonly<{
      status: 'blocked';
      reasonCode: 'VER-1001';
      message: string;
    }>;

export type VerificationAdapterIdentity = Readonly<{
  adapterId: string;
  toolchainDigest: string;
  capabilityDigest: string;
}>;

export type VerificationMatrixAxis =
  | 'frameworkTarget'
  | 'surface'
  | 'browserEngine'
  | 'viewport'
  | 'colorScheme'
  | 'motion'
  | 'locale';

export type VerificationScenarioDescriptor = Readonly<{
  id: string;
  documentId: string;
  criticality: 'smoke' | 'standard' | 'critical';
  tags: readonly string[];
  impactedDomains: readonly string[];
  capabilityIds: readonly string[];
  targetIds: readonly string[];
  frameworkTargets: readonly string[];
  controlProfileRef: BehaviorControlProfileRef;
  fixtureSetRef?: BehaviorDocumentDigestRef;
  baselineSetRef?: BehaviorDocumentDigestRef;
}>;

export type VerificationCheckCost = Readonly<{
  durationMs: number;
  artifactBytes: number;
  computeUnits: number;
}>;

export type VerificationCheckDefinition = Readonly<{
  id: string;
  ownerId: string;
  kind: VerificationCheckKind;
  scenarioIds: readonly string[];
  scenarioTags: readonly string[];
  impactedDomains: readonly string[];
  capabilityIds: readonly string[];
  riskFlags: readonly string[];
  targetIds: readonly string[];
  frameworkTargets: readonly string[];
  surfaces: readonly VerificationSurface[];
  browserEngines: readonly VerificationBrowserEngine[];
  matrixAxes: readonly VerificationMatrixAxis[];
  adapterId: string;
  dependencyCheckIds: readonly string[];
  resources: readonly VerificationPlanResource[];
  inputKinds: readonly VerificationInputKind[];
  artifactKinds: readonly VerificationArtifactKind[];
  estimatedCost: VerificationCheckCost;
}>;

export type VerificationAdapterRegistration = Readonly<{
  descriptor: VerificationAdapterDescriptor;
  identity: VerificationAdapterIdentity;
}>;

export type VerificationPolicyEvaluationFacts = Readonly<{
  checkId: string;
  checkKind: VerificationCheckKind;
  scenarioId?: string;
  scenarioTags: readonly string[];
  criticality?: 'smoke' | 'standard' | 'critical';
  impactedDomains: readonly string[];
  riskFlags: readonly string[];
  targetId: string;
}>;

export type VerificationPolicyEvaluationTrace = Readonly<{
  matchedRuleIds: readonly string[];
  winningRuleIds: readonly string[];
  forbiddenRuleIds: readonly string[];
  appliedExemptionIds: readonly string[];
  specificity: number;
  messages: readonly string[];
}>;

export type VerificationPolicyEvaluation = Readonly<{
  requirement: VerificationPolicyRequirement;
  matrixProfile?: VerificationMatrixProfile;
  retryPolicy?: VerificationRetryPolicy;
  evidenceRequirements: VerificationEvidenceRequirements;
  controlProfileRef?: BehaviorControlProfileRef;
  fixtureSetRef?: BehaviorDocumentDigestRef;
  baselineSetRef?: BehaviorDocumentDigestRef;
  trace: VerificationPolicyEvaluationTrace;
}>;

export type VerificationPolicyEvaluationResult =
  | Readonly<{
      status: 'resolved';
      evaluation: VerificationPolicyEvaluation;
    }>
  | Readonly<{
      status: 'invalid';
      reasonCode: 'VER-2001' | 'VER-2002';
      message: string;
      conflictingRuleIds: readonly string[];
    }>;

export type VerificationPlanCellPreflight =
  | Readonly<{ status: 'supported' }>
  | Readonly<{
      status: 'unsupported' | 'blocked' | 'not-applicable';
      reasonCode: string;
      message: string;
    }>;

export type VerificationPlanResource = Readonly<{
  key: string;
  mode: 'shared' | 'exclusive';
}>;

export type VerificationPlanCell = Readonly<{
  id: string;
  checkId: string;
  checkKind: VerificationCheckKind;
  scenarioId?: string;
  targetId: string;
  frameworkTarget: string;
  surface: VerificationSurface;
  browserEngine?: VerificationBrowserEngine;
  viewport: VerificationViewportAxis;
  colorScheme: VerificationColorScheme;
  motion: VerificationMotion;
  locale: string;
  controlProfileRef: BehaviorControlProfileRef;
  fixtureSetRef?: BehaviorDocumentDigestRef;
  baselineSetRef?: BehaviorDocumentDigestRef;
  adapter: VerificationAdapterIdentity;
  requirement: VerificationRequirement;
  policyRuleIds: readonly string[];
  appliedExemptionIds: readonly string[];
  retryPolicy: VerificationRetryPolicy;
  evidenceRequirements: VerificationEvidenceRequirements;
  resources: readonly VerificationPlanResource[];
  inputKinds: readonly VerificationInputKind[];
  artifactKinds: readonly VerificationArtifactKind[];
  estimatedCost: VerificationCheckCost;
  preflight: VerificationPlanCellPreflight;
  dependencyCellIds: readonly string[];
  inputDigest: string;
}>;

export type VerificationPlanIssue = Readonly<{
  code:
    'VER-2001' | 'VER-2002' | 'VER-3001' | 'VER-3002' | 'VER-3003' | 'VER-3004';
  message: string;
  cellId?: string;
  checkId?: string;
  relatedIds: readonly string[];
}>;

export type VerificationPlanSelectionExplanation = Readonly<{
  cellId?: string;
  checkId: string;
  scenarioId?: string;
  targetId: string;
  status: 'selected' | 'forbidden' | 'not-applicable' | 'trimmed-advisory';
  impactPathIds: readonly string[];
  policyRuleIds: readonly string[];
  messages: readonly string[];
}>;

export type VerificationPlanBudgetSummary = Readonly<{
  cells: number;
  cellsByCheckKind: Readonly<Record<VerificationCheckKind, number>>;
  targetExpansions: number;
  browserExpansions: number;
  totalMs: number;
  artifactBytes: number;
  estimatedComputeUnits: number;
  maximumParallelism: number;
  overBudgetDimensions: readonly string[];
}>;

export type VerificationPlan = Readonly<{
  status: 'ready' | 'blocked';
  workspaceId: string;
  targetRevision: number;
  targetPartitionRevisions: VerificationPartitionRevisions;
  scenarioRegistryDigest: string;
  policyRevision: number;
  policyDigest: string;
  policyEvaluationInstant: string;
  impactDigest: string;
  semanticSchemaDigest: string;
  providerSetDigest: string;
  compilerDigest: string;
  plannerDigest: string;
  adapterRegistryDigest: string;
  planDigest: string;
  cells: readonly VerificationPlanCell[];
  issues: readonly VerificationPlanIssue[];
  explanations: readonly VerificationPlanSelectionExplanation[];
  budget: VerificationPlanBudgetSummary;
}>;

export type CreateVerificationPlanInput = Readonly<{
  impactSet: VerificationImpactSet;
  policy: VerificationPolicy;
  policyRevision: number;
  policyDigest: string;
  policyEvaluationInstant: string;
  scenarioRegistryDigest: string;
  scenarios: readonly VerificationScenarioDescriptor[];
  checks: readonly VerificationCheckDefinition[];
  adapters: readonly VerificationAdapterRegistration[];
  adapterRegistryDigest: string;
  compilerDigest: string;
  plannerDigest: string;
}>;

export type VerificationPlanResult =
  | Readonly<{ status: 'ready'; plan: VerificationPlan }>
  | Readonly<{ status: 'blocked'; plan: VerificationPlan }>;

export type VerificationPlanExplanation = Readonly<{
  schema: 'prodivix.verification-plan-explain.v1';
  planDigest: string;
  status: VerificationPlan['status'];
  identity: Readonly<{
    workspaceId: string;
    targetRevision: number;
    targetPartitionRevisions: VerificationPartitionRevisions;
    impactDigest: string;
    policyDigest: string;
    policyRevision: number;
    policyEvaluationInstant: string;
    scenarioRegistryDigest: string;
    semanticSchemaDigest: string;
    providerSetDigest: string;
    adapterRegistryDigest: string;
    compilerDigest: string;
    plannerDigest: string;
  }>;
  summary: Readonly<{
    requiredCells: number;
    advisoryCells: number;
    blockedCells: number;
    unsupportedCells: number;
    selectedChecks: number;
    selectedScenarios: number;
  }>;
  budget: VerificationPlanBudgetSummary;
  issues: readonly VerificationPlanIssue[];
  selections: readonly VerificationPlanSelectionExplanation[];
  cells: readonly Readonly<{
    id: string;
    checkId: string;
    checkKind: VerificationCheckKind;
    scenarioId?: string;
    targetId: string;
    frameworkTarget: string;
    surface: VerificationSurface;
    browserEngine?: VerificationBrowserEngine;
    viewportId: string;
    colorScheme: VerificationColorScheme;
    motion: VerificationMotion;
    locale: string;
    requirement: VerificationRequirement;
    preflight: VerificationPlanCellPreflight;
    policyRuleIds: readonly string[];
    impactPathIds: readonly string[];
    dependencyCellIds: readonly string[];
    inputKinds: readonly VerificationInputKind[];
    artifactKinds: readonly VerificationArtifactKind[];
  }>[];
  closure?: Readonly<{
    closureDigest: string;
    verdict: VerificationClosureVerdict;
    cellStatuses: Readonly<Record<string, VerificationCellStatus>>;
    issues: readonly VerificationClosureIssue[];
  }>;
}>;

export type VerificationAttemptOutcome =
  'passed' | 'failed' | 'blocked' | 'cancelled' | 'infrastructure-error';

export type VerificationCellStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'blocked'
  | 'cancelled'
  | 'infrastructure-error'
  | 'unsupported'
  | 'not-applicable'
  | 'unstable'
  | 'stale'
  | 'incompatible'
  | 'missing';

export type VerificationClosureVerdict = 'satisfied' | 'unsatisfied' | 'stale';

export type VerificationInputKind =
  | 'diagnostic-snapshot'
  | 'executable-snapshot'
  | 'scenario-program'
  | 'test-report'
  | 'baseline-set';

export type VerificationArtifactKind =
  | 'screenshot'
  | 'visual-diff'
  | 'accessibility-report'
  | 'trace'
  | 'network-summary'
  | 'console-summary'
  | 'coverage-summary'
  | 'performance-profile'
  | 'security-report'
  | 'build-log'
  | 'replay-record';

export type VerificationImplementationIdentity = Readonly<{
  packageName: string;
  packageVersion: string;
  buildDigest: string;
  toolchainDigest: string;
  schemaDigest: string;
}>;

export type VerificationAdapterBudgets = Readonly<{
  maximumDurationMs: number;
  maximumArtifactBytes: number;
  maximumEvents: number;
}>;

export type VerificationAdapterDescriptor = Readonly<{
  id: string;
  implementation: VerificationImplementationIdentity;
  checkKinds: readonly VerificationCheckKind[];
  surfaces: readonly VerificationSurface[];
  targets: readonly string[];
  browserEngines: readonly VerificationBrowserEngine[];
  controlCapabilities: readonly string[];
  inputKinds: readonly VerificationInputKind[];
  artifactKinds: readonly VerificationArtifactKind[];
  budgets: VerificationAdapterBudgets;
  trustInputs: readonly string[];
}>;

export type VerificationPreflightResult =
  | Readonly<{ status: 'supported' }>
  | Readonly<{
      status: 'unsupported' | 'blocked';
      reasonCode: string;
      message: string;
    }>;

export type VerificationAbortSignal = Readonly<{
  aborted: boolean;
  reason?: string;
}>;

export type VerificationRunContext = Readonly<{
  cell: VerificationPlanCell;
  attemptId: string;
  executableSnapshotDigest: string;
  scenarioProgramDigest?: string;
  controlProfileDigest: string;
  fixtureSetDigests: readonly string[];
  baselineSetDigest?: string;
  abortSignal: VerificationAbortSignal;
}>;

export type VerificationCheckReportCandidate = Readonly<{
  candidateId: string;
  cellId: string;
  attemptId: string;
  outcome: VerificationAttemptOutcome;
  normalizedInputDigest: string;
  report: VerificationJsonValue;
  artifacts: readonly Readonly<{
    id: string;
    kind: VerificationArtifactKind;
    digest: string;
    size: number;
    mediaType: string;
  }>[];
  diagnosticCodes: readonly string[];
}>;

export type VerificationAdapter = Readonly<{
  descriptor: VerificationAdapterDescriptor;
  preflight(cell: VerificationPlanCell): Promise<VerificationPreflightResult>;
  prepare(context: VerificationRunContext): Promise<void>;
  execute(
    context: VerificationRunContext
  ): Promise<VerificationCheckReportCandidate>;
  cleanup(context: VerificationRunContext): Promise<void>;
}>;

export type VerificationJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly VerificationJsonValue[]
  | { readonly [key: string]: VerificationJsonValue };

export type VerificationRetentionClass =
  'session' | 'change' | 'release' | 'legal-hold';

export type VerificationArtifactManifest = Readonly<{
  id: string;
  kind: VerificationArtifactKind;
  digest: string;
  normalizedDigest?: string;
  size: number;
  mediaType: string;
}>;

export type VerificationPartitionRevisions = Readonly<{
  workspaceRev: number;
  routeRev: number;
  opSeq: number;
  documentRevisions: Readonly<
    Record<string, Readonly<{ contentRev: number; metaRev: number }>>
  >;
}>;

export type VerificationEvidence = Readonly<{
  id: string;
  projectId: string;
  workspaceId: string;
  workspaceRevision: number;
  partitionRevisions: VerificationPartitionRevisions;
  executableSnapshotDigest: string;
  scenario?: Readonly<{
    id: string;
    revision: number;
    digest: string;
    programDigest: string;
  }>;
  policyRevision: number;
  policyDigest: string;
  impactDigest: string;
  planDigest: string;
  policyEvaluationInstant: string;
  cellId: string;
  checkId: string;
  attemptId: string;
  run: Readonly<{
    runId: string;
    providerId: string;
    jobId?: string;
    sessionId?: string;
    parentAttemptId?: string;
    surface: VerificationSurface;
    frameworkTarget: string;
    runtimeZone: string;
    browserEngine?: VerificationBrowserEngine;
    operatingSystemIdentity?: string;
  }>;
  timing: Readonly<{
    startedAt: string;
    completedAt: string;
    durationMs: number;
  }>;
  result: Readonly<{
    outcome: VerificationAttemptOutcome;
    normalizedResultDigest: string;
    summary: VerificationJsonValue;
    diagnosticCodes: readonly string[];
    appliedExemptionIds: readonly string[];
  }>;
  provenance: Readonly<{
    trust: VerificationEvidenceTrust;
    producerId: string;
    attestationDigest?: string;
    issuedAt: string;
    expiresAt?: string;
  }>;
  toolchain: VerificationImplementationIdentity;
  controls: Readonly<{
    profileDigest: string;
    appliedDigest: string;
  }>;
  inputs: Readonly<{
    executableSnapshotDigest: string;
    scenarioProgramDigest?: string;
    fixtureSetDigests: readonly string[];
    baselineSetDigest?: string;
    inputDigest: string;
  }>;
  artifacts: readonly VerificationArtifactManifest[];
  sourceTraceDigest: string;
  dependencyLockDigest: string;
  redactionPolicyId: string;
  createdAt: string;
  retention: VerificationRetentionClass;
  supersedes?: string;
  manifestDigest: string;
}>;

export type VerificationClosure = Readonly<{
  workspaceId: string;
  targetRevision: number;
  targetPartitionRevisions: VerificationPartitionRevisions;
  scenarioRegistryDigest: string;
  semanticSchemaDigest: string;
  providerSetDigest: string;
  adapterRegistryDigest: string;
  impactDigest: string;
  policyRevision: number;
  policyDigest: string;
  compilerDigest: string;
  plannerDigest: string;
  policyEvaluationInstant: string;
  planDigest: string;
  closureEvaluationInstant: string;
  evidenceSetDigest: string;
  revocationRecordDigest: string;
  baselineSetDigests: readonly string[];
  toolchainSetDigest: string;
  verdict: VerificationClosureVerdict;
  cellStatuses: Readonly<Record<string, VerificationCellStatus>>;
  evidenceDigests: readonly string[];
  appliedExemptionIds: readonly string[];
  issues: readonly VerificationClosureIssue[];
  closureDigest: string;
}>;

export type VerificationClosureIssue = Readonly<{
  cellId?: string;
  status: VerificationCellStatus | 'closure-stale';
  message: string;
  evidenceIds: readonly string[];
}>;

export type EvaluateVerificationClosureInput = Readonly<{
  plan: VerificationPlan;
  evidence: readonly VerificationEvidence[];
  closureEvaluationInstant: string;
  targetRevision: number;
  targetPartitionRevisions: VerificationPartitionRevisions;
  scenarioRegistryDigest: string;
  semanticSchemaDigest: string;
  providerSetDigest: string;
  adapterRegistryDigest: string;
  impactDigest: string;
  policyRevision: number;
  policyDigest: string;
  compilerDigest: string;
  plannerDigest: string;
  baselineSetDigests: readonly string[];
  toolchainSetDigest: string;
  revocationRecordDigest: string;
  revokedEvidenceIds: readonly string[];
  runningCellIds?: readonly string[];
}>;

export type VerificationClosureResult =
  | Readonly<{ status: 'ready'; closure: VerificationClosure }>
  | Readonly<{ status: 'invalid'; reasonCode: 'VER-6002'; message: string }>;

export type VerificationDocumentKind =
  'verification-policy' | 'verification-baseline-set';

export type VerificationDocumentByKind = Readonly<{
  'verification-policy': VerificationPolicy;
  'verification-baseline-set': VerificationBaselineSet;
}>;

export type VerificationWireDocument<TCurrent> = TCurrent & {
  wireVersion: 1;
};

export type VerificationDecodeIssue = Readonly<{
  code: 'VER-2001' | 'VER-5004';
  path: string;
  message: string;
}>;

export type VerificationDecodeResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly VerificationDecodeIssue[] }>;
