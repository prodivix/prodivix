import { isAbsolute } from 'node:path';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  type AgentJsonValue,
  type CanonicalDigest,
} from '@prodivix/ai';
import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import {
  generateWorkspaceReactViteExecutableProject,
  generateWorkspaceVueViteExecutableProject,
  PRODUCTION_WORKSPACE_VERIFICATION_COMPILE_PROFILE,
} from '@prodivix/prodivix-compiler';
import {
  decodeExecutableProjectSnapshotArtifact,
  encodeExecutableProjectSnapshotArtifact,
  EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_SCHEMA_DIGEST,
  type ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  computeVerificationArtifactContentDigest,
  createVerificationAdapterRegistrySnapshot,
  digestVerificationValue,
  executeVerificationAdapterLifecycle,
  type VerificationAbortSignal,
  type VerificationAdapterArtifactAttemptCoordinates,
  type VerificationAdapterArtifactRetirementResult,
  type VerificationAdapterArtifactStagingRequest,
  type VerificationAdapterArtifactStagingResult,
  type VerificationAdapterInputRef,
  type VerificationAdapterLifecycleResult,
  type VerificationAdapterStagedArtifactRef,
  type VerificationBaselineSet,
  type VerificationPlanCell,
} from '@prodivix/verification';
import {
  CONTROLLED_STATIC_TOOLCHAIN_CLEANUP_TIMEOUT_MS,
  CONTROLLED_STATIC_TOOLCHAIN_EXECUTION_TIMEOUT_MS,
  CONTROLLED_STATIC_TOOLCHAIN_PRODUCTION_CLIENT_IMPLEMENTATION_DIGEST,
  runControlledStaticToolchainProduction,
  type ControlledStaticToolchainResult,
} from '@prodivix/verification-adapters';
import {
  assertBrowserVerificationCellInputCoordinates,
  createBrowserBaselineSetInputRef,
  createBrowserScenarioProgramInputRef,
  createBrowserSecurityObservationSetInputRef,
  createBrowserVerificationProfileInputRef,
  createProductionBrowserBuildBundleDigest,
  createProductionBrowserExecutableSnapshotReceipt,
  FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION,
  type BrowserSecurityObservationSet,
  type BrowserVerificationCellInput,
  type ProductionBrowserPreviewHostReleaseResult,
  type ProductionChromiumBrowserAuthority,
  type ProductionChromiumBrowserRegistration,
} from '@prodivix/verification-browser';
import {
  validateWorkspaceSnapshot,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  AGENT_EVALUATION_G3_SANDBOX_ADAPTER_REGISTRATION,
  AGENT_EVALUATION_G3_SANDBOX_EXECUTABLE_CODEC_SCHEMA_DIGEST,
  AGENT_EVALUATION_G3_SANDBOX_EXECUTABLE_MEDIA_TYPE,
  assertProductionAgentEvaluationG3SandboxBinding,
  createAgentEvaluationControlledWorkspaceG3ReplayRecord,
  createAgentEvaluationControlledWorkspaceG3SandboxBinding,
  createAgentEvaluationControlledWorkspaceG3SandboxLease,
  type AgentEvaluationControlledWorkspaceG3ReplayRecord,
  type AgentEvaluationControlledWorkspaceG3SandboxBindInput,
  type AgentEvaluationControlledWorkspaceG3SandboxBinding,
  type AgentEvaluationControlledWorkspaceG3SandboxCompletion,
  type AgentEvaluationControlledWorkspaceG3SandboxLease,
  type AgentEvaluationControlledWorkspaceG3SandboxPort,
} from './controlledWorkspaceG3CellAdapter';
import type { ProductionAgentEvaluationBrowserPreviewAuthority } from './productionBrowserAuthorityPorts';

const PRODUCTION_G3_COMPILER_PROJECTION_FORMAT =
  'prodivix.agent-evaluation-g3-compiler-projection-receipt' as const;
const PRODUCTION_G3_COMPILER_PROJECTION_VERSION = 1 as const;
const PRODUCTION_G3_SANDBOX_MAXIMUM_SESSIONS = 256;
const CLEANUP_TIMEOUT_MS =
  CONTROLLED_STATIC_TOOLCHAIN_CLEANUP_TIMEOUT_MS as number;
const digestPattern = /^sha256-[a-f0-9]{64}$/u;
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;

const passiveAbortSignal: VerificationAbortSignal = Object.freeze({
  aborted: false,
  subscribe: () => () => undefined,
});

export type ProductionControlledWorkspaceG3FinalSnapshotReadRequest = Readonly<{
  authorityInputDigest: CanonicalDigest;
  evaluationPlanDigest: CanonicalDigest;
  repositoryCommit: string;
  projectId: string;
  caseId: string;
  attemptId: string;
  generation: number;
  finalSnapshotRef: string;
  expectedSnapshotDigest: CanonicalDigest;
  expectedRevision: number;
}>;

export type ProductionControlledWorkspaceG3FinalSnapshotReadReceipt = Readonly<{
  snapshot: WorkspaceSnapshot;
  snapshotDigest: CanonicalDigest;
  revision: number;
  sourceReceiptDigest: CanonicalDigest;
}>;

/** Callback-bound ingress over the canonical Workspace owner/CAS projection. */
export type ProductionControlledWorkspaceG3FinalSnapshotSource = Readonly<{
  authorityDigest: CanonicalDigest;
  readFinalWorkspaceSnapshot(
    input: ProductionControlledWorkspaceG3FinalSnapshotReadRequest
  ): Promise<ProductionControlledWorkspaceG3FinalSnapshotReadReceipt>;
}>;

export type ProductionControlledWorkspaceG3BrowserRunMaterial = Readonly<{
  outerScenarioId: string;
  scenarioDocumentId: string;
  cell: VerificationPlanCell;
  program: BehaviorScenarioProgram;
  baselineSet?: VerificationBaselineSet;
  securityObservationSet?: BrowserSecurityObservationSet;
  receiptDigest: CanonicalDigest;
}>;

export const createProductionControlledWorkspaceG3BrowserRunMaterialReceiptDigest =
  (
    material:
      | Omit<ProductionControlledWorkspaceG3BrowserRunMaterial, 'receiptDigest'>
      | ProductionControlledWorkspaceG3BrowserRunMaterial
  ): CanonicalDigest => {
    const { receiptDigest: _receiptDigest, ...base } =
      material as ProductionControlledWorkspaceG3BrowserRunMaterial;
    return digestAgentCanonicalValue({
      format: 'prodivix.agent-evaluation-g3-browser-run-material',
      version: 1,
      ...base,
    });
  };

/**
 * Reads only frozen, owner-issued Verification material. The profile is read
 * after Chromium registration because its target binding is attempt-scoped.
 */
export type ProductionControlledWorkspaceG3VerificationSource = Readonly<{
  authorityDigest: CanonicalDigest;
  readBrowserRunMaterial(
    input: Readonly<{
      authorityInputDigest: CanonicalDigest;
      evaluationPlanDigest: CanonicalDigest;
      repositoryCommit: string;
      projectId: string;
      caseId: string;
      attemptId: string;
      generation: number;
      outerCell: VerificationPlanCell;
      finalWorkspaceSnapshotDigest: CanonicalDigest;
      finalRevision: number;
      executableSnapshotDigest: CanonicalDigest;
      executableSnapshotArtifactDigest: CanonicalDigest;
    }>
  ): Promise<ProductionControlledWorkspaceG3BrowserRunMaterial>;
  readBrowserVerificationProfile(
    input: Readonly<{
      materialReceiptDigest: CanonicalDigest;
      browserAttemptId: string;
      generation: number;
      cell: VerificationPlanCell;
      executableSnapshotDigest: CanonicalDigest;
      targetLeaseBindingDigest: CanonicalDigest;
      runtimeEnvironmentDigest: CanonicalDigest;
      controlCapabilitySnapshotDigest: CanonicalDigest;
      appliedControlDigest: CanonicalDigest;
    }>
  ): Promise<
    Readonly<{
      profile: BrowserVerificationCellInput;
      receiptDigest: CanonicalDigest;
    }>
  >;
}>;

type ReportedBrowserLifecycle = Extract<
  VerificationAdapterLifecycleResult,
  Readonly<{ status: 'reported' }>
>;

export type ProductionControlledWorkspaceG3VerificationEvidenceAuthority =
  Readonly<{
    artifactSourceAuthorityDigest: CanonicalDigest;
    attestationAuthorityDigest: CanonicalDigest;
    stageArtifact(
      input: Readonly<{
        binding: AgentEvaluationControlledWorkspaceG3SandboxBinding;
        request: VerificationAdapterArtifactStagingRequest;
        signal: VerificationAbortSignal;
      }>
    ): Promise<VerificationAdapterArtifactStagingResult>;
    retireArtifacts(
      input: Readonly<{
        binding: AgentEvaluationControlledWorkspaceG3SandboxBinding;
        attempt: VerificationAdapterArtifactAttemptCoordinates;
        signal: VerificationAbortSignal;
      }>
    ): Promise<VerificationAdapterArtifactRetirementResult>;
    readArtifact(
      input: Readonly<{
        binding: AgentEvaluationControlledWorkspaceG3SandboxBinding;
        artifact: VerificationAdapterStagedArtifactRef;
      }>
    ): Promise<Uint8Array>;
    complete(
      input: Readonly<{
        binding: AgentEvaluationControlledWorkspaceG3SandboxBinding;
        replay: AgentEvaluationControlledWorkspaceG3ReplayRecord;
        replayArtifactDigest: CanonicalDigest;
        lifecycleDigest: CanonicalDigest;
        browserLifecycle: ReportedBrowserLifecycle;
        browserMaterialReceiptDigest: CanonicalDigest;
        browserProfileReceiptDigest: CanonicalDigest;
        toolchainResult: ControlledStaticToolchainResult;
      }>
    ): Promise<AgentEvaluationControlledWorkspaceG3SandboxCompletion>;
    signAttestation(
      input: Readonly<{
        binding: AgentEvaluationControlledWorkspaceG3SandboxBinding;
        authorityDigest: CanonicalDigest;
        verificationAttemptGrantReceiptDigest: CanonicalDigest;
        candidateDigest: CanonicalDigest;
        attestationNonce: string;
        attestationStatement: AgentJsonValue;
        attestationStatementDigest: CanonicalDigest;
      }>
    ): Promise<AgentJsonValue>;
  }>;

export type CreateProductionControlledWorkspaceG3SandboxPortInput = Readonly<{
  repositoryRoot: string;
  providerId: string;
  snapshotSource: ProductionControlledWorkspaceG3FinalSnapshotSource;
  verificationSource: ProductionControlledWorkspaceG3VerificationSource;
  verificationEvidence: ProductionControlledWorkspaceG3VerificationEvidenceAuthority;
  previewAuthority: ProductionAgentEvaluationBrowserPreviewAuthority;
  browserAuthority: ProductionChromiumBrowserAuthority;
  now?: () => string;
}>;

export type ProductionControlledWorkspaceG3SandboxAuthority =
  AgentEvaluationControlledWorkspaceG3SandboxPort &
    Readonly<{
      drainAndDispose(): Promise<ProductionBrowserPreviewHostReleaseResult>;
    }>;

type CompilerProjectionReceipt = Readonly<{
  format: typeof PRODUCTION_G3_COMPILER_PROJECTION_FORMAT;
  version: typeof PRODUCTION_G3_COMPILER_PROJECTION_VERSION;
  compilerOwner: '@prodivix/prodivix-compiler';
  compilerProfile: 'production';
  frameworkTarget: 'react-vite' | 'vue-vite';
  snapshotSourceAuthorityDigest: CanonicalDigest;
  snapshotSourceReceiptDigest: CanonicalDigest;
  finalWorkspaceSnapshotDigest: CanonicalDigest;
  finalRevision: number;
  executableSnapshotArtifactDigest: CanonicalDigest;
  executableSnapshotSemanticDigest: CanonicalDigest;
  executableSnapshotCodecSchemaDigest: CanonicalDigest;
  diagnosticSetDigest: CanonicalDigest;
  receiptDigest: CanonicalDigest;
}>;

type SandboxSession = {
  bindInput: AgentEvaluationControlledWorkspaceG3SandboxBindInput;
  binding: AgentEvaluationControlledWorkspaceG3SandboxBinding;
  executableSnapshot: ExecutableProjectSnapshot;
  executableArtifactBytes: Uint8Array;
  toolchainResult: ControlledStaticToolchainResult;
  browserMaterial: ProductionControlledWorkspaceG3BrowserRunMaterial;
  browserAttemptId: string;
  registration: ProductionChromiumBrowserRegistration;
  lease?: AgentEvaluationControlledWorkspaceG3SandboxLease;
  executionPromise?: Promise<AgentEvaluationControlledWorkspaceG3ReplayRecord>;
  executionError?: Error;
  replay?: AgentEvaluationControlledWorkspaceG3ReplayRecord;
  browserLifecycle?: ReportedBrowserLifecycle;
  browserProfileReceiptDigest?: CanonicalDigest;
  cleanupPromise?: Promise<ProductionBrowserPreviewHostReleaseResult>;
  cleanup?: ProductionBrowserPreviewHostReleaseResult;
  completionInputDigest?: CanonicalDigest;
  completion?: AgentEvaluationControlledWorkspaceG3SandboxCompletion;
};

const fail = (message: string): never => {
  throw new TypeError(`G4_PRODUCTION_G3_SANDBOX_INVALID: ${message}`);
};

const canonicalDigest = (
  value: string | undefined,
  label: string
): CanonicalDigest => {
  if (!value || !isAgentCanonicalDigest(value)) {
    return fail(`${label} is invalid.`);
  }
  return value;
};

const canonicalIdentity = (value: string, label: string): string => {
  if (
    !identityPattern.test(value) ||
    value !== value.trim() ||
    value !== value.normalize('NFC')
  ) {
    return fail(`${label} is invalid.`);
  }
  return value;
};

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  Object.freeze([...new Set(values)].sort(compareUnicodeCodePoints));

const snapshotRequest = (
  input: AgentEvaluationControlledWorkspaceG3SandboxBindInput
): ProductionControlledWorkspaceG3FinalSnapshotReadRequest =>
  Object.freeze({
    authorityInputDigest: input.authorityInputDigest,
    evaluationPlanDigest: input.evaluationPlanDigest,
    repositoryCommit: input.repositoryCommit,
    projectId: input.projectId,
    caseId: input.caseId,
    attemptId: input.attemptId,
    generation: input.generation,
    finalSnapshotRef: input.finalSnapshotRef,
    expectedSnapshotDigest: input.finalSnapshotDigest,
    expectedRevision: input.finalRevision,
  });

const assertSnapshotReceipt = (
  receipt: ProductionControlledWorkspaceG3FinalSnapshotReadReceipt,
  input: AgentEvaluationControlledWorkspaceG3SandboxBindInput
): WorkspaceSnapshot => {
  const validation = validateWorkspaceSnapshot(receipt.snapshot);
  const observedDigest = digestAgentCanonicalValue(receipt.snapshot);
  if (
    !validation.valid ||
    receipt.snapshotDigest !== input.finalSnapshotDigest ||
    receipt.snapshotDigest !== observedDigest ||
    receipt.revision !== input.finalRevision ||
    receipt.snapshot.workspaceRev !== input.finalRevision ||
    !isAgentCanonicalDigest(receipt.sourceReceiptDigest)
  ) {
    return fail(
      'Canonical Workspace source drifted from the frozen final snapshot.'
    );
  }
  return receipt.snapshot;
};

const compileExecutableSnapshot = (
  workspace: WorkspaceSnapshot,
  frameworkTarget: string
): Readonly<{
  snapshot: ExecutableProjectSnapshot;
  diagnosticSetDigest: CanonicalDigest;
}> => {
  const options = Object.freeze({
    verificationProfile: PRODUCTION_WORKSPACE_VERIFICATION_COMPILE_PROFILE,
  });
  const result =
    frameworkTarget === 'react-vite'
      ? generateWorkspaceReactViteExecutableProject(workspace, options)
      : frameworkTarget === 'vue-vite'
        ? generateWorkspaceVueViteExecutableProject(workspace, options)
        : fail('Framework target is outside the production compiler set.');
  if (result.status !== 'ready') {
    return fail('Production Workspace compilation was blocked.');
  }
  if (
    result.snapshot.dataMockProvision !== undefined ||
    result.snapshot.serverRuntimeMockProvision !== undefined
  ) {
    return fail(
      'Production compiler emitted fixture-backed runtime authority.'
    );
  }
  return Object.freeze({
    snapshot: result.snapshot,
    diagnosticSetDigest: digestAgentCanonicalValue(result.diagnostics),
  });
};

const createCompilerProjectionReceipt = (
  input: Readonly<{
    frameworkTarget: 'react-vite' | 'vue-vite';
    snapshotSourceAuthorityDigest: CanonicalDigest;
    snapshotSourceReceiptDigest: CanonicalDigest;
    finalWorkspaceSnapshotDigest: CanonicalDigest;
    finalRevision: number;
    executableSnapshotArtifactDigest: CanonicalDigest;
    executableSnapshotSemanticDigest: CanonicalDigest;
    diagnosticSetDigest: CanonicalDigest;
  }>
): CompilerProjectionReceipt => {
  const base = Object.freeze({
    format: PRODUCTION_G3_COMPILER_PROJECTION_FORMAT,
    version: PRODUCTION_G3_COMPILER_PROJECTION_VERSION,
    compilerOwner: '@prodivix/prodivix-compiler' as const,
    compilerProfile: 'production' as const,
    ...input,
    executableSnapshotCodecSchemaDigest:
      EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_SCHEMA_DIGEST as CanonicalDigest,
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

const assertBuildResult = (
  result: ControlledStaticToolchainResult,
  snapshot: ExecutableProjectSnapshot
): ControlledStaticToolchainResult => {
  if (
    result.buildBundle.snapshotDigest !== snapshot.contentDigest ||
    !sameCanonicalJson(result.buildBundle.target, snapshot.target) ||
    result.buildBundle.files.length < 1 ||
    result.authorityReceipt.snapshotDigest !== snapshot.contentDigest ||
    result.projectionAuthority.receipt.snapshotDigest !==
      snapshot.contentDigest ||
    !isAgentCanonicalDigest(result.authorityReceipt.receiptDigest) ||
    !isAgentCanonicalDigest(result.authorityReceipt.toolchain.lockDigest) ||
    !isAgentCanonicalDigest(result.projectionAuthority.receipt.receiptDigest)
  ) {
    return fail(
      'Controlled static toolchain result drifted from the snapshot.'
    );
  }
  return result;
};

const sameStringSet = (
  left: readonly string[],
  right: readonly string[]
): boolean => sameCanonicalJson(uniqueSorted(left), uniqueSorted(right));

const assertBrowserMaterial = (
  material: ProductionControlledWorkspaceG3BrowserRunMaterial,
  outerCell: VerificationPlanCell,
  workspace: WorkspaceSnapshot,
  executableSnapshot: ExecutableProjectSnapshot
): ProductionControlledWorkspaceG3BrowserRunMaterial => {
  const cell = material.cell;
  const controlProfileDigest = canonicalDigest(
    cell.controlProfileRef.digest,
    'Browser control profile digest'
  );
  const expectedFixtureDigests = cell.fixtureSetRef
    ? [canonicalDigest(cell.fixtureSetRef.digest, 'Browser Fixture Set digest')]
    : [];
  const expectedBaselineDigests = cell.baselineSetRef
    ? [
        canonicalDigest(
          cell.baselineSetRef.digest,
          'Browser Baseline Set digest'
        ),
      ]
    : [];
  if (
    !isAgentCanonicalDigest(material.receiptDigest) ||
    material.receiptDigest !==
      createProductionControlledWorkspaceG3BrowserRunMaterialReceiptDigest(
        material
      ) ||
    material.outerScenarioId !== outerCell.scenarioId ||
    !identityPattern.test(material.outerScenarioId) ||
    !identityPattern.test(material.scenarioDocumentId) ||
    !sameCanonicalJson(
      cell.adapter,
      FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION.identity
    ) ||
    cell.preflight.status !== 'supported' ||
    cell.frameworkTarget !== outerCell.frameworkTarget ||
    cell.surface !== outerCell.surface ||
    cell.browserEngine !== outerCell.browserEngine ||
    !sameCanonicalJson(cell.viewport, outerCell.viewport) ||
    cell.colorScheme !== outerCell.colorScheme ||
    cell.motion !== outerCell.motion ||
    cell.locale !== outerCell.locale ||
    controlProfileDigest !==
      canonicalDigest(
        outerCell.controlProfileRef.digest,
        'Outer control profile digest'
      ) ||
    cell.scenarioId !== material.program.scenarioId ||
    material.program.workspaceRevision !== workspace.workspaceRev ||
    material.program.executableSnapshotDigest !==
      executableSnapshot.contentDigest ||
    material.program.controlProfileDigest !== controlProfileDigest ||
    !sameStringSet(
      material.program.fixtureSetDigests,
      expectedFixtureDigests
    ) ||
    !sameStringSet(
      material.program.baselineSetDigests,
      expectedBaselineDigests
    ) ||
    (cell.baselineSetRef !== undefined) !==
      (material.baselineSet !== undefined) ||
    (cell.checkKind === 'security') !==
      (material.securityObservationSet !== undefined)
  ) {
    return fail(
      'Frozen Browser Verification material drifted from Workspace, cell, or executable snapshot.'
    );
  }
  createBrowserScenarioProgramInputRef(
    `input:program:${material.program.programDigest.slice(7)}`,
    material.program
  );
  return material;
};

const browserAttemptIdentity = (
  input: AgentEvaluationControlledWorkspaceG3SandboxBindInput
): Readonly<{
  browserAttemptId: string;
  requestId: string;
  executionId: string;
}> => {
  const suffix = digestAgentCanonicalValue({
    authorityInputDigest: input.authorityInputDigest,
    planDigest: input.planDigest,
    cellId: input.cell.id,
    attemptId: input.attemptId,
    generation: input.generation,
  }).slice(7);
  return Object.freeze({
    browserAttemptId: `g3:${suffix}`,
    requestId: `request:${suffix}`,
    executionId: `execution:${suffix}`,
  });
};

const bindKey = (
  input: AgentEvaluationControlledWorkspaceG3SandboxBindInput
): CanonicalDigest => digestAgentCanonicalValue(input);

const mergeReleaseResults = (
  results: readonly ProductionBrowserPreviewHostReleaseResult[]
): ProductionBrowserPreviewHostReleaseResult => {
  const residualCanaryIds = uniqueSorted(
    results.flatMap(({ residualCanaryIds }) => residualCanaryIds)
  );
  const diagnosticCodes = uniqueSorted(
    results.flatMap(({ diagnosticCodes }) => diagnosticCodes)
  );
  const status = results.some(({ status }) => status === 'failed')
    ? 'failed'
    : results.some(({ status }) => status === 'residual') ||
        residualCanaryIds.length > 0
      ? 'residual'
      : 'clean';
  return Object.freeze({ status, residualCanaryIds, diagnosticCodes });
};

const cleanupWithinDeadline = async (
  task: Promise<ProductionBrowserPreviewHostReleaseResult>,
  residualId: string
): Promise<ProductionBrowserPreviewHostReleaseResult> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<ProductionBrowserPreviewHostReleaseResult>(
    (resolve) => {
      timeout = setTimeout(
        () =>
          resolve(
            Object.freeze({
              status: 'failed',
              residualCanaryIds: Object.freeze([residualId]),
              diagnosticCodes: Object.freeze([
                'VER-PRODUCTION-G3-SANDBOX-CLEANUP-TIMEOUT',
              ]),
            })
          ),
        CLEANUP_TIMEOUT_MS
      );
    }
  );
  try {
    return await Promise.race([task, timedOut]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
};

const browserLifecycleAssertions = (
  lifecycle: ReportedBrowserLifecycle
): readonly Readonly<{
  assertionId: string;
  status: 'passed' | 'failed';
  diagnosticCodes: readonly string[];
}>[] => {
  const passed =
    lifecycle.report.terminal.status === 'completed' &&
    lifecycle.report.terminal.exitCode === 0;
  return Object.freeze([
    Object.freeze({
      assertionId: `assertion:browser-verification:${lifecycle.report.checkKind}`,
      status: passed ? ('passed' as const) : ('failed' as const),
      diagnosticCodes: uniqueSorted([
        ...lifecycle.report.diagnosticCodes,
        ...(passed ? [] : ['VER-PRODUCTION-G3-BROWSER-REPORT-FAILED']),
      ]),
    }),
  ]);
};

const createInputResolver = (
  inputs: readonly Readonly<{
    ref: VerificationAdapterInputRef;
    bytes: Uint8Array;
  }>[]
) => {
  const byId = new Map(inputs.map((input) => [input.ref.id, input]));
  return Object.freeze({
    async read(ref: VerificationAdapterInputRef) {
      const input = byId.get(ref.id);
      if (!input || !sameCanonicalJson(input.ref, ref)) {
        return fail(
          'Browser input resolver received an unknown or drifted ref.'
        );
      }
      return new Uint8Array(input.bytes);
    },
  });
};

/**
 * Composes one disposable, production-only G3 sandbox authority. Compilation
 * and the fixed toolchain complete before AttemptGrant issue; Chromium remains
 * unacquired until the granted outer adapter enters execute.
 */
export const createProductionAgentEvaluationControlledWorkspaceG3SandboxPort = (
  input: CreateProductionControlledWorkspaceG3SandboxPortInput
): ProductionControlledWorkspaceG3SandboxAuthority => {
  if (
    !input ||
    !isAbsolute(input.repositoryRoot) ||
    !input.snapshotSource ||
    typeof input.snapshotSource.readFinalWorkspaceSnapshot !== 'function' ||
    !input.verificationSource ||
    typeof input.verificationSource.readBrowserRunMaterial !== 'function' ||
    typeof input.verificationSource.readBrowserVerificationProfile !==
      'function' ||
    !input.verificationEvidence ||
    !input.previewAuthority ||
    typeof input.previewAuthority.reserve !== 'function' ||
    !input.browserAuthority ||
    typeof input.browserAuthority.register !== 'function'
  ) {
    return fail(
      'Production SandboxPort requires repository, Workspace, Verification, preview, and Chromium owners.'
    );
  }
  canonicalIdentity(input.providerId, 'Provider id');
  for (const [label, digest] of [
    ['Workspace source authority', input.snapshotSource.authorityDigest],
    ['Verification source authority', input.verificationSource.authorityDigest],
    [
      'Artifact source authority',
      input.verificationEvidence.artifactSourceAuthorityDigest,
    ],
    [
      'Attestation authority',
      input.verificationEvidence.attestationAuthorityDigest,
    ],
  ] as const) {
    canonicalDigest(digest, label);
  }
  const now = input.now ?? (() => new Date().toISOString());
  const browserRegistry = createVerificationAdapterRegistrySnapshot([
    FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION,
  ]);
  const pendingBindings = new Map<CanonicalDigest, Promise<SandboxSession>>();
  const sessionsByKey = new Map<CanonicalDigest, SandboxSession>();
  const sessionsByDigest = new Map<CanonicalDigest, SandboxSession>();
  let draining = false;
  let drainPromise:
    Promise<ProductionBrowserPreviewHostReleaseResult> | undefined;

  const sessionFor = (
    binding: AgentEvaluationControlledWorkspaceG3SandboxBinding
  ): SandboxSession => {
    const session = sessionsByDigest.get(binding.bindingDigest);
    if (!session || !sameCanonicalJson(session.binding, binding)) {
      return fail('Sandbox binding is unknown, stale, or drifted.');
    }
    return session;
  };

  const createSession = async (
    bindInput: AgentEvaluationControlledWorkspaceG3SandboxBindInput
  ): Promise<SandboxSession> => {
    const snapshotReceipt =
      await input.snapshotSource.readFinalWorkspaceSnapshot(
        snapshotRequest(bindInput)
      );
    const workspace = assertSnapshotReceipt(snapshotReceipt, bindInput);
    const compiled = compileExecutableSnapshot(
      workspace,
      bindInput.cell.frameworkTarget
    );
    const executableArtifact = encodeExecutableProjectSnapshotArtifact(
      compiled.snapshot
    );
    const decodedArtifact = decodeExecutableProjectSnapshotArtifact(
      executableArtifact.bytes
    );
    if (
      !sameCanonicalJson(decodedArtifact.snapshot, compiled.snapshot) ||
      decodedArtifact.artifactDigest !== executableArtifact.artifactDigest ||
      decodedArtifact.snapshot.contentDigest !==
        executableArtifact.semanticDigest ||
      executableArtifact.artifactDigest === executableArtifact.semanticDigest ||
      executableArtifact.size > 8_388_608 ||
      executableArtifact.mediaType !==
        AGENT_EVALUATION_G3_SANDBOX_EXECUTABLE_MEDIA_TYPE ||
      executableArtifact.codec.schemaDigest !==
        AGENT_EVALUATION_G3_SANDBOX_EXECUTABLE_CODEC_SCHEMA_DIGEST
    ) {
      return fail(
        'Executable snapshot codec or raw/semantic digest binding drifted.'
      );
    }
    const projectionReceipt = createCompilerProjectionReceipt({
      frameworkTarget: bindInput.cell.frameworkTarget as
        'react-vite' | 'vue-vite',
      snapshotSourceAuthorityDigest: input.snapshotSource.authorityDigest,
      snapshotSourceReceiptDigest: snapshotReceipt.sourceReceiptDigest,
      finalWorkspaceSnapshotDigest: bindInput.finalSnapshotDigest,
      finalRevision: bindInput.finalRevision,
      executableSnapshotArtifactDigest:
        executableArtifact.artifactDigest as CanonicalDigest,
      executableSnapshotSemanticDigest:
        executableArtifact.semanticDigest as CanonicalDigest,
      diagnosticSetDigest: compiled.diagnosticSetDigest,
    });
    const toolchainResult = assertBuildResult(
      await runControlledStaticToolchainProduction({
        repositoryRoot: input.repositoryRoot,
        snapshot: compiled.snapshot,
        timeoutMs: CONTROLLED_STATIC_TOOLCHAIN_EXECUTION_TIMEOUT_MS,
      }),
      compiled.snapshot
    );
    const material = assertBrowserMaterial(
      await input.verificationSource.readBrowserRunMaterial({
        authorityInputDigest: bindInput.authorityInputDigest,
        evaluationPlanDigest: bindInput.evaluationPlanDigest,
        repositoryCommit: bindInput.repositoryCommit,
        projectId: bindInput.projectId,
        caseId: bindInput.caseId,
        attemptId: bindInput.attemptId,
        generation: bindInput.generation,
        outerCell: bindInput.cell,
        finalWorkspaceSnapshotDigest: bindInput.finalSnapshotDigest,
        finalRevision: bindInput.finalRevision,
        executableSnapshotDigest:
          executableArtifact.semanticDigest as CanonicalDigest,
        executableSnapshotArtifactDigest:
          executableArtifact.artifactDigest as CanonicalDigest,
      }),
      bindInput.cell,
      workspace,
      compiled.snapshot
    );
    const identity = browserAttemptIdentity(bindInput);
    const entry = toolchainResult.buildBundle.files.find(
      ({ path }) => path === compiled.snapshot.previewPlan.entryFilePath
    );
    if (!entry) {
      return fail('Controlled build bundle has no exact preview entry.');
    }
    const remoteExecution = await input.previewAuthority.reserve(
      Object.freeze({
        attemptId: identity.browserAttemptId,
        generation: bindInput.generation,
        requestId: identity.requestId,
        executionId: identity.executionId,
        snapshotDigest: compiled.snapshot.contentDigest,
        buildBundleDigest: createProductionBrowserBuildBundleDigest(
          toolchainResult.buildBundle
        ),
        entryFilePath: compiled.snapshot.previewPlan.entryFilePath,
        entryDigest: entry.digest,
        buildFileCount: toolchainResult.buildBundle.files.length,
      }),
      passiveAbortSignal
    );
    let registration: ProductionChromiumBrowserRegistration | undefined;
    try {
      registration = await input.browserAuthority.register(
        Object.freeze({
          cell: material.cell,
          attemptId: identity.browserAttemptId,
          generation: bindInput.generation,
          providerKind: 'remote' as const,
          snapshot: compiled.snapshot,
          buildBundle: toolchainResult.buildBundle,
          program: material.program,
          runtimeAuthority: input.browserAuthority.runtimeAuthority,
          remoteExecution,
          executableSnapshotReceipt:
            createProductionBrowserExecutableSnapshotReceipt({
              snapshot: compiled.snapshot,
              sourceRef: `compiler-projection:${projectionReceipt.receiptDigest.slice(7)}`,
              compilerProjectionReceiptDigest: projectionReceipt.receiptDigest,
            }),
          projectionAuthorityDigest: projectionReceipt.receiptDigest,
          ...(material.securityObservationSet
            ? { securityObservationSet: material.securityObservationSet }
            : {}),
        }),
        passiveAbortSignal
      );
      const binding = createAgentEvaluationControlledWorkspaceG3SandboxBinding({
        bindingId: `binding:${bindKey(bindInput).slice(7)}`,
        authorityInputDigest: bindInput.authorityInputDigest,
        evaluationPlanDigest: bindInput.evaluationPlanDigest,
        repositoryCommit: bindInput.repositoryCommit,
        projectId: bindInput.projectId,
        caseId: bindInput.caseId,
        attemptId: bindInput.attemptId,
        generation: bindInput.generation,
        planDigest: bindInput.planDigest,
        registrySnapshotDigest: bindInput.registrySnapshotDigest,
        cellId: bindInput.cell.id,
        ...(bindInput.cell.scenarioId
          ? { scenarioId: bindInput.cell.scenarioId }
          : {}),
        adapter: bindInput.adapter,
        tool: AGENT_EVALUATION_G3_SANDBOX_ADAPTER_REGISTRATION.tool!,
        runtimeAuthorityId: `runtime:${registration.runtimeAuthority.authorityDigest.slice(7)}`,
        runtimeImplementationDigest: digestAgentCanonicalValue({
          toolchainImplementationDigest:
            CONTROLLED_STATIC_TOOLCHAIN_PRODUCTION_CLIENT_IMPLEMENTATION_DIGEST,
          browserRuntimeAuthorityDigest:
            registration.runtimeAuthority.authorityDigest,
          verificationSourceAuthorityDigest:
            input.verificationSource.authorityDigest,
          providerId: input.providerId,
        }),
        artifactSourceAuthorityDigest:
          input.verificationEvidence.artifactSourceAuthorityDigest,
        attestationAuthorityDigest:
          input.verificationEvidence.attestationAuthorityDigest,
        providerKind: 'remote',
        runtimeEnvironmentDigest: registration.runtimeEnvironmentDigest,
        ...(bindInput.cell.scenarioId
          ? { scenarioProgramDigest: material.program.programDigest }
          : {}),
        controlCapabilitySnapshotDigest:
          registration.controlCapabilitySnapshotDigest,
        appliedControlDigest: registration.appliedControlDigest,
        finalWorkspaceSnapshotDigest: bindInput.finalSnapshotDigest,
        compilerProjectionReceiptDigest: projectionReceipt.receiptDigest,
        executableSnapshot: Object.freeze({
          id: `input:${executableArtifact.artifactDigest.slice(7)}`,
          sourceRef: `compiler-projection:${projectionReceipt.receiptDigest.slice(7)}`,
          artifactDigest: executableArtifact.artifactDigest as CanonicalDigest,
          semanticSnapshotDigest:
            executableArtifact.semanticDigest as CanonicalDigest,
          size: executableArtifact.size,
          mediaType: AGENT_EVALUATION_G3_SANDBOX_EXECUTABLE_MEDIA_TYPE,
          codecSchemaDigest:
            AGENT_EVALUATION_G3_SANDBOX_EXECUTABLE_CODEC_SCHEMA_DIGEST,
        }),
        run: Object.freeze({
          runId: `run:${bindKey(bindInput).slice(7)}`,
          providerId: input.providerId,
          jobId: remoteExecution.executionId,
          sessionId: registration.lease.leaseId,
          parentAttemptId: bindInput.attemptId,
          surface: bindInput.cell.surface,
          frameworkTarget: bindInput.cell.frameworkTarget,
          runtimeZone: 'sandbox' as const,
          browserEngine: bindInput.cell.browserEngine,
          viewport: bindInput.cell.viewport,
          devicePixelRatio: registration.runtimeAuthority.devicePixelRatio,
          colorScheme: bindInput.cell.colorScheme,
          motion: bindInput.cell.motion,
          locale: bindInput.cell.locale,
          timezone: 'UTC',
          fontSetDigest: registration.runtimeAuthority.fontSetDigest,
          operatingSystemIdentity:
            registration.runtimeAuthority.operatingSystemImageDigest,
          sandboxImageDigest:
            registration.runtimeAuthority.operatingSystemImageDigest,
        }),
      });
      assertProductionAgentEvaluationG3SandboxBinding(binding, bindInput);
      return {
        bindInput,
        binding,
        executableSnapshot: compiled.snapshot,
        executableArtifactBytes: new Uint8Array(executableArtifact.bytes),
        toolchainResult,
        browserMaterial: material,
        browserAttemptId: identity.browserAttemptId,
        registration,
      };
    } catch (error) {
      if (registration) {
        const retired = await cleanupWithinDeadline(
          registration.retire(),
          `canary:g3-sandbox:${bindInput.attemptId}:bind-cleanup`
        );
        if (retired.status !== 'clean') {
          throw new Error(
            'Production G3 bind failed and Chromium cleanup retained residuals.',
            { cause: error }
          );
        }
      }
      throw error;
    }
  };

  const port: ProductionControlledWorkspaceG3SandboxAuthority = {
    async bind(bindInput) {
      if (draining) return fail('Sandbox authority is draining.');
      const key = bindKey(bindInput);
      const existing = sessionsByKey.get(key);
      if (existing) {
        assertProductionAgentEvaluationG3SandboxBinding(
          existing.binding,
          bindInput
        );
        return existing.binding;
      }
      if (
        sessionsByKey.size + pendingBindings.size >=
        PRODUCTION_G3_SANDBOX_MAXIMUM_SESSIONS
      ) {
        return fail('Sandbox session budget is exhausted.');
      }
      let pending = pendingBindings.get(key);
      if (!pending) {
        pending = createSession(bindInput);
        pendingBindings.set(key, pending);
      }
      try {
        const session = await pending;
        const raced = sessionsByKey.get(key);
        if (raced && !sameCanonicalJson(raced.binding, session.binding)) {
          return fail('Concurrent Sandbox binding drifted.');
        }
        sessionsByKey.set(key, session);
        sessionsByDigest.set(session.binding.bindingDigest, session);
        return session.binding;
      } finally {
        pendingBindings.delete(key);
      }
    },

    async readExecutableSnapshot({ binding }) {
      const session = sessionFor(binding);
      const decoded = decodeExecutableProjectSnapshotArtifact(
        session.executableArtifactBytes
      );
      if (
        decoded.artifactDigest !== binding.executableSnapshot.artifactDigest ||
        decoded.snapshot.contentDigest !==
          binding.executableSnapshot.semanticSnapshotDigest
      ) {
        return fail('Executable snapshot bytes drifted after binding.');
      }
      return new Uint8Array(session.executableArtifactBytes);
    },

    async prepare({
      binding,
      planDigest,
      cell,
      attemptId,
      generation,
      resolvedInputSetDigest,
      signal,
    }) {
      const session = sessionFor(binding);
      if (
        signal.aborted ||
        session.cleanup !== undefined ||
        planDigest !== binding.planDigest ||
        attemptId !== binding.attemptId ||
        generation !== binding.generation ||
        cell.id !== binding.cellId ||
        !sameCanonicalJson(cell, session.bindInput.cell) ||
        !isAgentCanonicalDigest(resolvedInputSetDigest)
      ) {
        return fail('Sandbox prepare coordinates are stale or drifted.');
      }
      const expected = createAgentEvaluationControlledWorkspaceG3SandboxLease({
        leaseId: `lease:${binding.bindingDigest.slice(7)}`,
        bindingDigest: binding.bindingDigest,
        invocationId: `invocation:${binding.bindingDigest.slice(7)}`,
        attemptId,
        generation,
        resolvedInputSetDigest,
        executionId: session.registration.remoteBinding.executionId,
        sessionId: session.registration.lease.leaseId,
        confirmedCursor: 0,
      });
      if (session.lease && !sameCanonicalJson(session.lease, expected)) {
        return fail('Sandbox prepare replay drifted.');
      }
      session.lease ??= expected;
      return session.lease;
    },

    async execute({ binding, lease, signal }) {
      const session = sessionFor(binding);
      if (
        signal.aborted ||
        !session.lease ||
        !sameCanonicalJson(session.lease, lease) ||
        session.cleanup !== undefined
      ) {
        return fail('Sandbox execute lease is missing, stale, or aborted.');
      }
      if (session.replay) return session.replay;
      if (session.executionError) throw session.executionError;
      if (!session.executionPromise) {
        session.executionPromise = (async () => {
          const startedAt = now();
          const startedMs = Date.parse(startedAt);
          if (!Number.isFinite(startedMs)) {
            return fail('Sandbox execution clock is invalid.');
          }
          const profileReceipt =
            await input.verificationSource.readBrowserVerificationProfile({
              materialReceiptDigest: session.browserMaterial.receiptDigest,
              browserAttemptId: session.browserAttemptId,
              generation: binding.generation,
              cell: session.browserMaterial.cell,
              executableSnapshotDigest:
                binding.executableSnapshot.semanticSnapshotDigest,
              targetLeaseBindingDigest:
                session.registration.lease.bindingDigest,
              runtimeEnvironmentDigest: binding.runtimeEnvironmentDigest,
              controlCapabilitySnapshotDigest:
                binding.controlCapabilitySnapshotDigest,
              appliedControlDigest: binding.appliedControlDigest,
            });
          canonicalDigest(
            profileReceipt.receiptDigest,
            'Browser profile receipt'
          );
          const profile = profileReceipt.profile;
          assertBrowserVerificationCellInputCoordinates(
            profile,
            session.browserMaterial.cell,
            {
              executableSnapshotDigest:
                session.executableSnapshot.contentDigest,
              scenarioProgramDigest:
                session.browserMaterial.program.programDigest,
              controlProfileDigest: canonicalDigest(
                session.browserMaterial.cell.controlProfileRef.digest,
                'Browser control profile digest'
              ),
              fixtureSetDigests:
                session.browserMaterial.program.fixtureSetDigests,
              ...(session.browserMaterial.cell.baselineSetRef
                ? {
                    baselineSetDigest: canonicalDigest(
                      session.browserMaterial.cell.baselineSetRef.digest,
                      'Browser Baseline Set digest'
                    ),
                  }
                : {}),
            }
          );
          if (
            profile.targetLeaseBindingDigest !==
            session.registration.lease.bindingDigest
          ) {
            return fail('Browser profile target lease binding drifted.');
          }
          const executableInput = Object.freeze({
            ref: Object.freeze({
              id: binding.executableSnapshot.id,
              kind: 'executable-snapshot' as const,
              digest: binding.executableSnapshot.artifactDigest,
              size: binding.executableSnapshot.size,
              mediaType: binding.executableSnapshot.mediaType,
            }),
            bytes: new Uint8Array(session.executableArtifactBytes),
          });
          const scenarioInput = createBrowserScenarioProgramInputRef(
            `input:program:${session.browserMaterial.program.programDigest.slice(7)}`,
            session.browserMaterial.program
          );
          const profileInput = createBrowserVerificationProfileInputRef(
            `input:profile:${profileReceipt.receiptDigest.slice(7)}`,
            profile
          );
          const availableInputs = [
            executableInput,
            scenarioInput,
            profileInput,
            ...(session.browserMaterial.baselineSet
              ? [
                  createBrowserBaselineSetInputRef(
                    `input:baseline:${canonicalDigest(
                      session.browserMaterial.cell.baselineSetRef?.digest,
                      'Browser Baseline Set digest'
                    ).slice(7)}`,
                    session.browserMaterial.baselineSet
                  ),
                ]
              : []),
            ...(session.browserMaterial.securityObservationSet
              ? [
                  createBrowserSecurityObservationSetInputRef(
                    `input:security:${session.browserMaterial.receiptDigest.slice(7)}`,
                    session.browserMaterial.securityObservationSet
                  ),
                ]
              : []),
          ];
          const inputsByKind = new Map(
            availableInputs.map((value) => [value.ref.kind, value])
          );
          const orderedInputs = session.browserMaterial.cell.inputKinds.map(
            (kind) =>
              inputsByKind.get(kind) ??
              fail(`Browser input ${kind} is unavailable.`)
          );
          if (
            orderedInputs.length !== availableInputs.length ||
            new Set(orderedInputs.map(({ ref }) => ref.kind)).size !==
              orderedInputs.length
          ) {
            return fail('Browser input set has extra or duplicate authority.');
          }
          const lifecycle = await executeVerificationAdapterLifecycle({
            factory: input.browserAuthority.adapterFactory,
            registrySnapshot: browserRegistry,
            planDigest: binding.planDigest,
            cell: session.browserMaterial.cell,
            attemptId: session.browserAttemptId,
            generation: binding.generation,
            providerKind: 'remote',
            context: Object.freeze({
              registrySnapshotDigest: browserRegistry.snapshotDigest,
              adapter:
                FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION.identity,
              runtimeZone: 'browser',
              runtimeEnvironmentDigest: binding.runtimeEnvironmentDigest,
              inputDigest: session.browserMaterial.cell.inputDigest,
              executableSnapshotDigest:
                binding.executableSnapshot.semanticSnapshotDigest,
              scenarioProgramDigest:
                session.browserMaterial.program.programDigest,
              controlProfileDigest: canonicalDigest(
                session.browserMaterial.cell.controlProfileRef.digest,
                'Browser control profile digest'
              ),
              fixtureSetDigests:
                session.browserMaterial.program.fixtureSetDigests,
              ...(session.browserMaterial.cell.baselineSetRef
                ? {
                    baselineSetDigest: canonicalDigest(
                      session.browserMaterial.cell.baselineSetRef.digest,
                      'Browser Baseline Set digest'
                    ),
                  }
                : {}),
              controlCapabilityIds: session.registration.controlCapabilityIds,
              controlCapabilitySnapshotDigest:
                binding.controlCapabilitySnapshotDigest,
              appliedControlDigest: binding.appliedControlDigest,
              inputRefs: Object.freeze(orderedInputs.map(({ ref }) => ref)),
              inputResolver: createInputResolver(orderedInputs),
              artifactStaging: Object.freeze({
                stage: (
                  request: VerificationAdapterArtifactStagingRequest,
                  abortSignal: VerificationAbortSignal
                ) =>
                  input.verificationEvidence.stageArtifact({
                    binding,
                    request,
                    signal: abortSignal,
                  }),
              }),
              abortSignal: signal,
            }),
            artifactRetirement: Object.freeze({
              retireAttempt: (
                attempt: VerificationAdapterArtifactAttemptCoordinates,
                abortSignal: VerificationAbortSignal
              ) =>
                input.verificationEvidence.retireArtifacts({
                  binding,
                  attempt,
                  signal: abortSignal,
                }),
            }),
          });
          if (lifecycle.status !== 'reported') {
            throw new TypeError(
              `Production Browser Verification ended ${lifecycle.status}:${lifecycle.reasonCode}.`
            );
          }
          const completedAt = now();
          const durationMs = Date.parse(completedAt) - startedMs;
          if (
            !Number.isSafeInteger(durationMs) ||
            durationMs < 0 ||
            durationMs > 120_000
          ) {
            return fail('Sandbox cell exceeded its 120000ms execution budget.');
          }
          session.browserLifecycle = lifecycle;
          session.browserProfileReceiptDigest = profileReceipt.receiptDigest;
          const runtimeReceiptDigests = uniqueSorted([
            session.toolchainResult.authorityReceipt.receiptDigest,
            session.toolchainResult.projectionAuthority.receipt.receiptDigest,
            session.registration.runtimeReceipt.receiptDigest,
            session.browserMaterial.receiptDigest,
            profileReceipt.receiptDigest,
            digestVerificationValue(lifecycle.report),
          ]);
          const replay = createAgentEvaluationControlledWorkspaceG3ReplayRecord(
            {
              bindingDigest: binding.bindingDigest,
              leaseReceiptDigest: lease.leaseReceiptDigest,
              planDigest: binding.planDigest,
              cellId: binding.cellId,
              attemptId: binding.attemptId,
              generation: binding.generation,
              resolvedInputSetDigest: lease.resolvedInputSetDigest,
              executableSnapshotArtifactDigest:
                binding.executableSnapshot.artifactDigest,
              executableSnapshotSemanticDigest:
                binding.executableSnapshot.semanticSnapshotDigest,
              executableSnapshotMediaType: binding.executableSnapshot.mediaType,
              executableSnapshotCodecSchemaDigest:
                binding.executableSnapshot.codecSchemaDigest,
              runtimeEnvironmentDigest: binding.runtimeEnvironmentDigest,
              controlCapabilitySnapshotDigest:
                binding.controlCapabilitySnapshotDigest,
              appliedControlDigest: binding.appliedControlDigest,
              startedAt,
              completedAt,
              durationMs,
              assertions: browserLifecycleAssertions(lifecycle),
              runtimeReceiptDigests:
                runtimeReceiptDigests as readonly CanonicalDigest[],
            }
          );
          session.replay = replay;
          return replay;
        })().catch((error: unknown) => {
          const normalized =
            error instanceof Error
              ? error
              : new TypeError('Production Browser Verification failed.');
          session.executionError = normalized;
          throw normalized;
        });
      }
      return session.executionPromise;
    },

    async cleanup({ binding }) {
      const session = sessionFor(binding);
      if (session.cleanup) return session.cleanup;
      session.cleanupPromise ??= cleanupWithinDeadline(
        session.registration.retire().catch(() =>
          Object.freeze({
            status: 'failed' as const,
            residualCanaryIds: Object.freeze([
              `canary:g3-sandbox:${binding.attemptId}:browser-cleanup`,
            ]),
            diagnosticCodes: Object.freeze([
              'VER-PRODUCTION-G3-SANDBOX-CLEANUP-FAILED',
            ]),
          })
        ),
        `canary:g3-sandbox:${binding.attemptId}:browser-cleanup-timeout`
      );
      session.cleanup = await session.cleanupPromise;
      return session.cleanup;
    },

    async stageArtifact(stageInput) {
      sessionFor(stageInput.binding);
      return input.verificationEvidence.stageArtifact(stageInput);
    },

    async retireArtifacts(retireInput) {
      const session = sessionFor(retireInput.binding);
      const outer =
        await input.verificationEvidence.retireArtifacts(retireInput);
      const browserAttempt = Object.freeze({
        planDigest: retireInput.attempt.planDigest,
        cellId: session.browserMaterial.cell.id,
        attemptId: session.browserAttemptId,
        generation: retireInput.attempt.generation,
      });
      const browser = await input.verificationEvidence.retireArtifacts({
        binding: retireInput.binding,
        attempt: browserAttempt,
        signal: retireInput.signal,
      });
      if (outer.status === 'retired' && browser.status === 'retired') {
        if (session.cleanup?.status === 'clean') {
          session.executableArtifactBytes.fill(0);
          sessionsByKey.delete(bindKey(session.bindInput));
          sessionsByDigest.delete(session.binding.bindingDigest);
        }
        return outer;
      }
      return Object.freeze({
        status: 'failed' as const,
        reasonCode: 'VER-PRODUCTION-G3-ARTIFACT-RETIREMENT-FAILED',
      });
    },

    async readArtifact(readInput) {
      sessionFor(readInput.binding);
      const bytes = await input.verificationEvidence.readArtifact(readInput);
      if (
        computeVerificationArtifactContentDigest(bytes) !==
        readInput.artifact.digest
      ) {
        return fail('Verification Evidence artifact bytes drifted.');
      }
      return bytes;
    },

    async complete(completeInput) {
      const session = sessionFor(completeInput.binding);
      if (
        !session.replay ||
        !session.browserLifecycle ||
        !session.browserProfileReceiptDigest ||
        computeVerificationArtifactContentDigest(
          new TextEncoder().encode(canonicalJsonText(session.replay))
        ) !== completeInput.replayArtifactDigest ||
        !digestPattern.test(completeInput.lifecycleDigest)
      ) {
        return fail('Sandbox completion lacks exact Replay/Evidence state.');
      }
      const completionInputDigest = digestAgentCanonicalValue({
        bindingDigest: completeInput.binding.bindingDigest,
        replayArtifactDigest: completeInput.replayArtifactDigest,
        lifecycleDigest: completeInput.lifecycleDigest,
      });
      if (
        session.completionInputDigest &&
        session.completionInputDigest !== completionInputDigest
      ) {
        return fail('Sandbox completion replay drifted.');
      }
      if (session.completion) return session.completion;
      session.completionInputDigest = completionInputDigest;
      session.completion = await input.verificationEvidence.complete({
        ...completeInput,
        replay: session.replay,
        browserLifecycle: session.browserLifecycle,
        browserMaterialReceiptDigest: session.browserMaterial.receiptDigest,
        browserProfileReceiptDigest: session.browserProfileReceiptDigest,
        toolchainResult: session.toolchainResult,
      });
      return session.completion;
    },

    async signAttestation(signInput) {
      sessionFor(signInput.binding);
      return input.verificationEvidence.signAttestation(signInput);
    },

    drainAndDispose() {
      drainPromise ??= (async () => {
        draining = true;
        const sessionResults = await Promise.all(
          [...sessionsByDigest.values()].map(async (session) => {
            if (session.cleanup) return session.cleanup;
            session.cleanupPromise ??= cleanupWithinDeadline(
              session.registration.retire(),
              `canary:g3-sandbox:${session.binding.attemptId}:drain-timeout`
            );
            session.cleanup = await session.cleanupPromise.catch(() =>
              Object.freeze({
                status: 'failed' as const,
                residualCanaryIds: Object.freeze([
                  `canary:g3-sandbox:${session.binding.attemptId}:drain`,
                ]),
                diagnosticCodes: Object.freeze([
                  'VER-PRODUCTION-G3-SANDBOX-DRAIN-FAILED',
                ]),
              })
            );
            return session.cleanup;
          })
        );
        const browser = await cleanupWithinDeadline(
          input.browserAuthority.drainAndDispose(),
          'canary:g3-sandbox:browser-authority-drain'
        );
        const preview = await cleanupWithinDeadline(
          input.previewAuthority.drainAndDispose(),
          'canary:g3-sandbox:preview-authority-drain'
        );
        const result = mergeReleaseResults([
          ...sessionResults,
          browser,
          preview,
          ...(input.browserAuthority.snapshot().registered === 0
            ? []
            : [
                Object.freeze({
                  status: 'residual' as const,
                  residualCanaryIds: Object.freeze([
                    'canary:g3-sandbox:browser-registrations',
                  ]),
                  diagnosticCodes: Object.freeze([
                    'VER-PRODUCTION-G3-BROWSER-REGISTRATION-RESIDUAL',
                  ]),
                }),
              ]),
        ]);
        if (result.status === 'clean') {
          for (const session of sessionsByDigest.values()) {
            session.executableArtifactBytes.fill(0);
          }
          sessionsByKey.clear();
          sessionsByDigest.clear();
        }
        return result;
      })();
      return drainPromise;
    },
  };
  return Object.freeze(port);
};
