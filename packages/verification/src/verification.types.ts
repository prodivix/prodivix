import type {
  BehaviorControlProfileRef,
  BehaviorDocumentDigestRef,
} from '@prodivix/behavior';

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
  targetRevision: number;
  semanticSchemaDigest: string;
  providerSetDigest: string;
  operationIds: readonly string[];
  changedDocumentIds: readonly string[];
  changedSymbolIds: readonly string[];
  impactedScenarioIds: readonly string[];
  impactedDomains: readonly string[];
  frameworkTargets: readonly string[];
  runtimeZones: readonly string[];
  capabilityIds: readonly string[];
  riskFlags: readonly string[];
  completeness: 'complete' | 'conservative' | 'unknown';
  reasons: readonly string[];
  impactDigest: string;
}>;

export type VerificationAdapterIdentity = Readonly<{
  adapterId: string;
  toolchainDigest: string;
  capabilityDigest: string;
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
  dependencyCellIds: readonly string[];
  inputDigest: string;
}>;

export type VerificationPlan = Readonly<{
  workspaceId: string;
  targetRevision: number;
  scenarioRegistryDigest: string;
  policyRevision: number;
  policyDigest: string;
  policyEvaluationInstant: string;
  impactDigest: string;
  semanticSchemaDigest: string;
  providerSetDigest: string;
  compilerDigest: string;
  plannerDigest: string;
  planDigest: string;
  cells: readonly VerificationPlanCell[];
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
  scenarioRegistryDigest: string;
  semanticSchemaDigest: string;
  providerSetDigest: string;
  adapterRegistryDigest: string;
  policyDigest: string;
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
  closureDigest: string;
}>;

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
