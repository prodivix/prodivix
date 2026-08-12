import { resolve } from 'node:path';
import {
  digestAgentCanonicalValue,
  getG4V8PublicEvaluationCaseMaterials,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
  digestBehaviorControlProfile,
  digestBehaviorValue,
  type BehaviorScenarioProgram,
} from '@prodivix/behavior';
import {
  createExecutableProjectSnapshot,
  encodeExecutableProjectSnapshotArtifact,
  type ExecutableProjectSnapshot,
  type ExecutionBuildBundle,
} from '@prodivix/runtime-core';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  computeVerificationArtifactContentDigest,
  digestVerificationValue,
  type ExecuteVerificationAdapterLifecycleInput,
  type VerificationAbortSignal,
  type VerificationAdapterStagedArtifactRef,
  type VerificationCheckReportCandidate,
  type VerificationPlanCell,
} from '@prodivix/verification';
import type { ControlledStaticToolchainResult } from '@prodivix/verification-adapters';
import {
  BROWSER_VERIFICATION_CELL_INPUT_FORMAT,
  BROWSER_VERIFICATION_CELL_INPUT_VERSION,
  FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_DESCRIPTOR,
  FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION,
  FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_TOOL,
  type BrowserVerificationCellInput,
  type ProductionBrowserRemoteExecutionEvidence,
  type ProductionChromiumBrowserAuthority,
  type ProductionChromiumBrowserRegistration,
} from '@prodivix/verification-browser';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IDENTITY,
  type AgentEvaluationControlledWorkspaceG3SandboxBindInput,
} from './controlledWorkspaceG3CellAdapter';
import type { ProductionAgentEvaluationBrowserPreviewAuthority } from './productionBrowserAuthorityPorts';
import {
  createProductionControlledWorkspaceG3BrowserRunMaterialReceiptDigest,
  createProductionAgentEvaluationControlledWorkspaceG3SandboxPort,
  type CreateProductionControlledWorkspaceG3SandboxPortInput,
  type ProductionControlledWorkspaceG3BrowserRunMaterial,
  type ProductionControlledWorkspaceG3VerificationEvidenceAuthority,
} from './productionControlledWorkspaceG3SandboxPort';

const mocked = vi.hoisted(() => ({
  compileReact: vi.fn(),
  compileVue: vi.fn(),
  runToolchain: vi.fn(),
  executeLifecycle: vi.fn(),
}));

vi.mock('@prodivix/prodivix-compiler', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@prodivix/prodivix-compiler')>();
  return {
    ...actual,
    generateWorkspaceReactViteExecutableProject: mocked.compileReact,
    generateWorkspaceVueViteExecutableProject: mocked.compileVue,
  };
});

vi.mock('@prodivix/verification-adapters', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@prodivix/verification-adapters')>();
  return {
    ...actual,
    runControlledStaticToolchainProduction: mocked.runToolchain,
  };
});

vi.mock('@prodivix/verification', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@prodivix/verification')>();
  return {
    ...actual,
    executeVerificationAdapterLifecycle: mocked.executeLifecycle,
  };
});

const signal: VerificationAbortSignal = Object.freeze({
  aborted: false,
  subscribe: () => () => undefined,
});

const workspaceFixture = (): WorkspaceSnapshot => {
  const material = getG4V8PublicEvaluationCaseMaterials().find((candidate) =>
    candidate.invocation.blocks.some(
      (block) => block.kind === 'workspace-fixture'
    )
  );
  const block = material?.invocation.blocks.find(
    (candidate) => candidate.kind === 'workspace-fixture'
  );
  if (block?.kind !== 'workspace-fixture') {
    throw new TypeError('Missing canonical Workspace evaluation fixture.');
  }
  return block.fixture.workspaceSnapshot as WorkspaceSnapshot;
};

const buildFile = (path: string, source: string) => {
  const contents = new TextEncoder().encode(source);
  return Object.freeze({
    path,
    size: contents.byteLength,
    digest: computeVerificationArtifactContentDigest(contents),
    contents,
  });
};

const executableFor = (workspace: WorkspaceSnapshot) =>
  createExecutableProjectSnapshot({
    workspace: Object.freeze({
      workspaceId: workspace.id,
      snapshotId: `${workspace.id}:${workspace.workspaceRev}`,
      partitionRevisions: Object.freeze({
        workspace: String(workspace.workspaceRev),
      }),
    }),
    target: Object.freeze({
      presetId: 'react-vite',
      framework: 'react',
      runtime: 'vite',
    }),
    files: Object.freeze([
      Object.freeze({
        path: 'package.json',
        contents: '{"private":true}',
      }),
      Object.freeze({
        path: 'src/main.tsx',
        contents: 'export const productionG3 = true;',
      }),
      Object.freeze({
        path: 'index.html',
        contents: '<!doctype html><div id="root"></div>',
      }),
    ]),
    dependencyPlan: Object.freeze({ manifestFilePath: 'package.json' }),
    entrypoints: Object.freeze([
      Object.freeze({ kind: 'preview' as const, path: 'index.html' }),
    ]),
    capabilityRequirements: Object.freeze({
      preview: Object.freeze(['filesystem'] as const),
      build: Object.freeze(['filesystem', 'build'] as const),
      test: Object.freeze([]),
      production: Object.freeze([]),
    }),
    publicBuildConfiguration: Object.freeze([]),
    cacheHints: Object.freeze({ dependencyInstall: 'isolated' as const }),
    installCommand: Object.freeze({ command: 'pnpm', args: ['install'] }),
    previewCommand: Object.freeze({ command: 'pnpm', args: ['preview'] }),
    buildCommand: Object.freeze({ command: 'pnpm', args: ['build'] }),
    previewPlan: Object.freeze({
      mode: 'static-bundle' as const,
      command: Object.freeze({ command: 'pnpm', args: ['preview'] }),
      outputDirectoryPath: 'dist',
      entryFilePath: 'index.html',
    }),
  });

const toolchainResultFor = (
  snapshot: ExecutableProjectSnapshot
): ControlledStaticToolchainResult => {
  const buildBundle: ExecutionBuildBundle = Object.freeze({
    format: 'prodivix.execution-build-bundle.v1',
    snapshotDigest: snapshot.contentDigest,
    target: snapshot.target,
    files: Object.freeze([
      buildFile('assets/app.js', 'globalThis.__productionG3 = true;'),
      buildFile(
        'index.html',
        '<!doctype html><script src="/assets/app.js"></script>'
      ),
    ]),
  });
  const authorityReceiptDigest = digestVerificationValue(
    'toolchain-authority-receipt'
  );
  const projectionReceiptDigest = digestVerificationValue(
    'toolchain-projection-receipt'
  );
  return {
    format: 'prodivix.controlled-static-toolchain-result.v1',
    buildBundle,
    buildSummary: new Uint8Array([1]),
    coverageSummary: new Uint8Array([2]),
    testReport: {} as ControlledStaticToolchainResult['testReport'],
    authorityReceipt: {
      snapshotDigest: snapshot.contentDigest,
      receiptDigest: authorityReceiptDigest,
      toolchain: {
        lockDigest: digestVerificationValue('dependency-lock'),
      },
    } as ControlledStaticToolchainResult['authorityReceipt'],
    projectionAuthority: {
      receipt: {
        snapshotDigest: snapshot.contentDigest,
        receiptDigest: projectionReceiptDigest,
      },
    } as ControlledStaticToolchainResult['projectionAuthority'],
  };
};

const controlProfileDigest = digestBehaviorControlProfile(
  BEHAVIOR_DETERMINISTIC_CONTROL_PRESET
);

const outerCell = (): VerificationPlanCell =>
  Object.freeze({
    id: 'cell:g3-production',
    checkId: 'check:g3-production',
    checkKind: 'integration',
    scenarioId: 'scenario:g3-production',
    targetId: 'target:g3-production',
    targetPolicy: Object.freeze({
      authority: 'verification-policy',
      policyDigest: digestVerificationValue('policy:g3-production'),
      semanticTargetId: 'target:g3-production',
      capture: 'allowed',
    }),
    frameworkTarget: 'react-vite',
    surface: 'preview',
    browserEngine: 'chromium',
    viewport: Object.freeze({ id: 'desktop', width: 1280, height: 720 }),
    colorScheme: 'light',
    motion: 'reduced',
    locale: 'en-US',
    controlProfileRef: Object.freeze({
      kind: 'preset',
      presetId: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET.id,
      digest: controlProfileDigest,
    }),
    adapter: AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IDENTITY,
    requirement: 'required',
    policyRuleIds: Object.freeze(['rule:g3-production']),
    appliedExemptionIds: Object.freeze([]),
    retryPolicy: Object.freeze({
      id: 'retry:none',
      maximumAttempts: 1,
      retryableOutcomes: Object.freeze([]),
      stabilitySamples: 1,
      freshFixtureNamespace: true,
    }),
    evidenceRequirements: Object.freeze({
      acceptedTrust: Object.freeze(['remote-attested'] as const),
      maximumAgeMs: 60_000,
      requireAttestation: true,
      requireCompatibleIdentity: true,
      requiredArtifactKinds: Object.freeze(['replay-record'] as const),
    }),
    resources: Object.freeze([]),
    inputKinds: Object.freeze(['executable-snapshot'] as const),
    artifactKinds: Object.freeze(['replay-record'] as const),
    estimatedCost: Object.freeze({
      durationMs: 120_000,
      artifactBytes: 4 * 1024 * 1024,
      computeUnits: 1,
    }),
    preflight: Object.freeze({ status: 'supported' as const }),
    dependencyCellIds: Object.freeze([]),
    inputDigest: digestVerificationValue('input:g3-production'),
  });

const browserCell = (): VerificationPlanCell =>
  Object.freeze({
    ...outerCell(),
    id: 'cell:g3-production-browser',
    checkId: 'check:g3-production-browser',
    checkKind: 'e2e',
    adapter: FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION.identity,
    evidenceRequirements: Object.freeze({
      ...outerCell().evidenceRequirements,
      requiredArtifactKinds: Object.freeze([
        'console-summary',
        'network-summary',
        'replay-record',
        'trace',
      ] as const),
    }),
    inputKinds: Object.freeze([
      'executable-snapshot',
      'scenario-program',
      'verification-profile',
    ] as const),
    artifactKinds: Object.freeze([
      'console-summary',
      'network-summary',
      'replay-record',
      'trace',
    ] as const),
    inputDigest: digestVerificationValue('input:g3-production-browser'),
  });

const programFor = (
  workspace: WorkspaceSnapshot,
  snapshot: ExecutableProjectSnapshot
): BehaviorScenarioProgram => {
  const base = Object.freeze({
    scenarioId: 'scenario:g3-production',
    scenarioDigest: digestVerificationValue('scenario:g3-production'),
    workspaceRevision: workspace.workspaceRev,
    semanticSnapshotDigest: digestVerificationValue('semantic:g3-production'),
    executableSnapshotDigest: snapshot.contentDigest,
    compilerDigest: digestVerificationValue('compiler:g3-production'),
    registryDigest: digestVerificationValue('registry:g3-production'),
    controlProfileDigest,
    fixtureSetDigests: Object.freeze([]),
    baselineSetDigests: Object.freeze([]),
    requiredCapabilities: Object.freeze([]),
    capabilityManifest: Object.freeze([]),
    targetManifest: Object.freeze([]),
    instructions: Object.freeze([]),
    observations: Object.freeze([]),
    sourceTrace: Object.freeze([]),
    budgets: Object.freeze({
      totalMs: 30_000,
      stepMs: 5_000,
      settleMs: 2_000,
    }),
  });
  return Object.freeze({
    ...base,
    programDigest: digestBehaviorValue(base),
  });
};

const bindInputFor = (
  workspace: WorkspaceSnapshot
): AgentEvaluationControlledWorkspaceG3SandboxBindInput => {
  const cell = outerCell();
  return Object.freeze({
    authorityInputDigest: digestAgentCanonicalValue('authority-input'),
    evaluationPlanDigest: digestAgentCanonicalValue('evaluation-plan'),
    repositoryCommit: 'a'.repeat(40),
    projectId: 'project:g3-production',
    caseId: 'case:g3-production',
    attemptId: 'attempt:g3-production',
    generation: 1,
    planDigest: digestAgentCanonicalValue('verification-plan'),
    registrySnapshotDigest: digestAgentCanonicalValue('adapter-registry'),
    cell,
    adapter: AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IDENTITY,
    finalSnapshotRef: 'workspace-snapshot:g3-production:final',
    finalSnapshotDigest: digestAgentCanonicalValue(workspace),
    finalRevision: workspace.workspaceRev,
  });
};

type HarnessOptions = Readonly<{
  snapshotDigestDrift?: boolean;
  cleanupStatus?: 'clean' | 'residual';
  omitBrowserAuthority?: boolean;
}>;

const createHarness = (options: HarnessOptions = {}) => {
  const workspace = workspaceFixture();
  const executable = executableFor(workspace);
  const toolchain = toolchainResultFor(executable);
  const program = programFor(workspace, executable);
  const cell = browserCell();
  const artifacts = new Map<string, Uint8Array>();
  const registrationRetire = vi.fn(async () =>
    options.cleanupStatus === 'residual'
      ? Object.freeze({
          status: 'residual' as const,
          residualCanaryIds: Object.freeze(['canary:browser:residual']),
          diagnosticCodes: Object.freeze(['VER-BROWSER-RESIDUAL']),
        })
      : Object.freeze({
          status: 'clean' as const,
          residualCanaryIds: Object.freeze([]),
          diagnosticCodes: Object.freeze([]),
        })
  );
  const remoteExecution: ProductionBrowserRemoteExecutionEvidence =
    Object.freeze({
      attemptId: 'g3:reserved',
      generation: 1,
      requestId: 'request:reserved',
      executionId: 'execution:reserved',
      snapshotDigest: executable.contentDigest,
      materializedBundleDigest: digestVerificationValue('bundle'),
      materializedOrigin: 'http://127.0.0.1:49152',
      materializedEntryUrl: 'http://127.0.0.1:49152/index.html',
      materializedEntryFilePath: 'index.html',
      materializedEntryDigest: toolchain.buildBundle.files[1]!.digest,
      materializedFileCount: toolchain.buildBundle.files.length,
      evidenceDigest: digestVerificationValue('remote-execution'),
    });
  const previewAuthority: ProductionAgentEvaluationBrowserPreviewAuthority =
    Object.freeze({
      originFor: () => remoteExecution.materializedOrigin,
      reserve: vi.fn(async (identity) =>
        Object.freeze({ ...remoteExecution, ...identity })
      ),
      port: {} as ProductionAgentEvaluationBrowserPreviewAuthority['port'],
      drainAndDispose: vi.fn(async () =>
        Object.freeze({
          status: 'clean' as const,
          residualCanaryIds: Object.freeze([]),
          diagnosticCodes: Object.freeze([]),
        })
      ),
    });
  const runtimeAuthority = Object.freeze({
    format: 'prodivix.production-chromium-runtime-authority' as const,
    version: 1 as const,
    browserEngine: 'chromium' as const,
    machineClass: 'evaluation-runner',
    operatingSystemImageDigest: digestVerificationValue('runner-os'),
    browserVersion: 'chromium-production-test',
    fontSetDigest: digestVerificationValue('font-set'),
    devicePixelRatio: 1,
    cacheClass: 'cold' as const,
    rendererGeneration: 'renderer:g3-production',
    normalizer: Object.freeze({ id: 'rgba', version: '1' }),
    browserImageAuthority: Object.freeze({
      imageDigest: digestVerificationValue('browser-image'),
    }),
    executablePathBindingDigest: digestVerificationValue('executable-path'),
    authorityDigest: digestVerificationValue('browser-runtime-authority'),
  });
  const register = vi.fn(
    async (
      registrationInput: Parameters<
        ProductionChromiumBrowserAuthority['register']
      >[0]
    ): Promise<ProductionChromiumBrowserRegistration> =>
      ({
        lease: Object.freeze({
          leaseId: 'target:g3-production-browser',
          origin: remoteExecution.materializedOrigin,
          binding: Object.freeze({}),
          bindingDigest: digestVerificationValue('target-binding'),
          runtimeIdentity: Object.freeze({}),
        }),
        runtimeIdentity: Object.freeze({}),
        runtimeAuthority,
        runtimeEnvironmentDigest: digestVerificationValue(
          'runtime-environment'
        ),
        controlCapabilitySnapshotDigest: digestVerificationValue(
          'control-capability-snapshot'
        ),
        appliedControlDigest: digestVerificationValue('applied-controls'),
        controlCapabilityIds:
          FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_DESCRIPTOR.controlCapabilities,
        origin: remoteExecution.materializedOrigin,
        remoteBinding: Object.freeze({
          attemptId: registrationInput.attemptId,
          requestId: registrationInput.remoteExecution.requestId,
          executionId: registrationInput.remoteExecution.executionId,
          snapshotDigest: executable.contentDigest,
          materializedBundleDigest:
            registrationInput.remoteExecution.materializedBundleDigest,
          materializedOriginDigest: digestVerificationValue('origin'),
          materializedEntryDigest:
            registrationInput.remoteExecution.materializedEntryDigest,
          bindingDigest: digestVerificationValue('remote-binding'),
        }),
        browserImageAuthority: runtimeAuthority.browserImageAuthority,
        executableSnapshotReceipt: registrationInput.executableSnapshotReceipt,
        runtimeReceipt: Object.freeze({
          receiptDigest: digestVerificationValue('browser-runtime-receipt'),
        }),
        canaryScanReceiptSetDigest: digestVerificationValue('canary-scans'),
        retire: registrationRetire,
      }) as unknown as ProductionChromiumBrowserRegistration
  );
  const browserAuthority = {
    runtimeAuthority,
    register,
    adapterFactory: (() =>
      Object.freeze(
        {}
      )) as unknown as ProductionChromiumBrowserAuthority['adapterFactory'],
    snapshot: vi.fn(() =>
      Object.freeze({
        state: 'accepting' as const,
        registered: 0,
        acquiredTargetLeases: 0,
        acquiredRuntimeLeases: 0,
        activeRuntimeSessions: 0,
      })
    ),
    drainAndDispose: vi.fn(async () =>
      Object.freeze({
        status: 'clean' as const,
        residualCanaryIds: Object.freeze([]),
        diagnosticCodes: Object.freeze([]),
      })
    ),
  } as unknown as ProductionChromiumBrowserAuthority;
  const browserMaterial: ProductionControlledWorkspaceG3BrowserRunMaterial =
    (() => {
      const material = Object.freeze({
        outerScenarioId: cell.scenarioId!,
        scenarioDocumentId: 'document:g3-production-behavior',
        cell,
        program,
      });
      return Object.freeze({
        ...material,
        receiptDigest:
          createProductionControlledWorkspaceG3BrowserRunMaterialReceiptDigest(
            material
          ),
      });
    })();
  const complete = vi.fn(async ({ binding }) =>
    Object.freeze({
      timing: Object.freeze({
        startedAt: '2026-08-09T00:00:00.000Z',
        completedAt: '2026-08-09T00:00:01.000Z',
        durationMs: 1_000,
      }),
      artifacts: Object.freeze([]),
      sourceTraces: Object.freeze([]),
      dependencyLockDigest: toolchain.authorityReceipt.toolchain
        .lockDigest as CanonicalDigest,
      provenance: Object.freeze({
        origin: 'remote' as const,
        producerId: 'producer:g3-production',
        providerId: binding.run.providerId,
        issuedAt: '2026-08-09T00:00:00.000Z',
        expiresAt: '2026-08-09T00:10:00.000Z',
      }),
      redaction: Object.freeze({
        policyId: 'redaction:g3-production',
        scannerSetDigest: digestVerificationValue('scanners'),
        droppedFieldCounts: Object.freeze({}),
      }),
      scenario: Object.freeze({
        id: 'scenario:g3-production',
        revision: 1,
        digest: digestVerificationValue('scenario:g3-production'),
        programDigest: program.programDigest,
      }),
    })
  );
  const verificationEvidence: ProductionControlledWorkspaceG3VerificationEvidenceAuthority =
    Object.freeze({
      artifactSourceAuthorityDigest: digestVerificationValue(
        'artifact-source-authority'
      ),
      attestationAuthorityDigest: digestVerificationValue(
        'attestation-authority'
      ),
      stageArtifact: vi.fn(async ({ request }) => {
        const digest = computeVerificationArtifactContentDigest(
          request.artifact.bytes
        );
        const stagingArtifactId = `staged:${digest.slice(7)}`;
        artifacts.set(
          stagingArtifactId,
          new Uint8Array(request.artifact.bytes)
        );
        return Object.freeze({
          status: 'staged' as const,
          stagingArtifactId,
          digest,
          size: request.artifact.bytes.byteLength,
          mediaType: request.artifact.mediaType,
        });
      }),
      retireArtifacts: vi.fn(async ({ attempt }) => {
        artifacts.clear();
        return Object.freeze({ status: 'retired' as const, ...attempt });
      }),
      readArtifact: vi.fn(async ({ artifact }) => {
        const bytes = artifacts.get(artifact.stagingArtifactId);
        if (!bytes) throw new TypeError('Missing staged artifact.');
        return new Uint8Array(bytes);
      }),
      complete,
      signAttestation: vi.fn(async ({ attestationStatementDigest }) =>
        Object.freeze({
          authority: 'ed25519:g3-production',
          statementDigest: attestationStatementDigest,
        })
      ),
    });
  const profileReceiptDigest = digestVerificationValue(
    'browser-profile-receipt'
  );
  const createInput: CreateProductionControlledWorkspaceG3SandboxPortInput = {
    repositoryRoot: resolve('.'),
    providerId: 'provider:g3-production',
    snapshotSource: Object.freeze({
      authorityDigest: digestVerificationValue('workspace-source-authority'),
      readFinalWorkspaceSnapshot: vi.fn(async ({ expectedSnapshotDigest }) =>
        Object.freeze({
          snapshot: workspace,
          snapshotDigest: options.snapshotDigestDrift
            ? digestAgentCanonicalValue('drifted-workspace')
            : expectedSnapshotDigest,
          revision: workspace.workspaceRev,
          sourceReceiptDigest: digestVerificationValue(
            'workspace-source-receipt'
          ),
        })
      ),
    }),
    verificationSource: Object.freeze({
      authorityDigest: digestVerificationValue('verification-source-authority'),
      readBrowserRunMaterial: vi.fn(async () => browserMaterial),
      readBrowserVerificationProfile: vi.fn(
        async ({ targetLeaseBindingDigest }) => {
          const profile: BrowserVerificationCellInput = Object.freeze({
            format: BROWSER_VERIFICATION_CELL_INPUT_FORMAT,
            version: BROWSER_VERIFICATION_CELL_INPUT_VERSION,
            cellId: cell.id,
            checkKind: 'e2e',
            scenarioId: program.scenarioId,
            targetId: cell.targetId,
            frameworkTarget: cell.frameworkTarget,
            surface: 'preview',
            browserEngine: 'chromium',
            viewport: Object.freeze({
              width: cell.viewport.width,
              height: cell.viewport.height,
            }),
            colorScheme: cell.colorScheme,
            motion: cell.motion,
            locale: cell.locale,
            executableSnapshotDigest: executable.contentDigest,
            scenarioProgramDigest: program.programDigest,
            controlProfileDigest,
            fixtureSetDigests: Object.freeze([]),
            targetLeaseBindingDigest,
            profile: Object.freeze({
              kind: 'e2e' as const,
              scenarioId: program.scenarioId,
              programDigest: program.programDigest,
            }),
          });
          return Object.freeze({
            profile,
            receiptDigest: profileReceiptDigest,
          });
        }
      ),
    }),
    verificationEvidence,
    previewAuthority,
    browserAuthority: options.omitBrowserAuthority
      ? (undefined as unknown as ProductionChromiumBrowserAuthority)
      : browserAuthority,
    now: (() => {
      const values = ['2026-08-09T00:00:00.000Z', '2026-08-09T00:00:01.000Z'];
      return () => values.shift() ?? '2026-08-09T00:00:01.000Z';
    })(),
  };
  return Object.freeze({
    workspace,
    executable,
    toolchain,
    program,
    cell,
    browserMaterial,
    artifacts,
    previewAuthority,
    browserAuthority,
    registrationRetire,
    register,
    verificationEvidence,
    complete,
    createInput,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked.executeLifecycle.mockImplementation(
    async (input: ExecuteVerificationAdapterLifecycleInput) => {
      const artifactBytes = new TextEncoder().encode(
        canonicalJsonText({ browser: 'real-production-path' })
      );
      const staged = await input.context.artifactStaging.stage(
        {
          planDigest: input.planDigest,
          cellId: input.cell.id,
          attemptId: input.attemptId,
          generation: input.generation,
          artifact: Object.freeze({
            id: 'artifact:browser-trace',
            kind: 'trace' as const,
            mediaType: 'application/json',
            bytes: artifactBytes,
          }),
        },
        input.context.abortSignal
      );
      if (staged.status !== 'staged') {
        throw new TypeError('Browser artifact was rejected.');
      }
      const report = {
        format: 'prodivix.verification-check-report-candidate',
        version: 1,
        cellId: input.cell.id,
        attemptId: input.attemptId,
        checkKind: input.cell.checkKind,
        inputDigest: input.cell.inputDigest,
        adapter: FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION.identity,
        tool: FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_TOOL,
        terminal: Object.freeze({
          status: 'completed' as const,
          complete: true as const,
          exitCode: 0,
        }),
        payload: Object.freeze({
          kind: 'e2e' as const,
          scenarioId: input.cell.scenarioId!,
          steps: Object.freeze([]),
          behaviorAssertionReceipt: Object.freeze({}),
        }),
        artifacts: Object.freeze([]),
        diagnosticCodes: Object.freeze([]),
      } as unknown as VerificationCheckReportCandidate;
      const stagedArtifact: VerificationAdapterStagedArtifactRef =
        Object.freeze({
          id: 'artifact:browser-trace',
          stagingArtifactId: staged.stagingArtifactId,
          kind: 'trace',
          digest: staged.digest,
          size: staged.size,
          mediaType: staged.mediaType,
        });
      return Object.freeze({
        status: 'reported' as const,
        report,
        invocation: Object.freeze({
          invocationId: 'invocation:browser',
          planDigest: input.planDigest,
          cellId: input.cell.id,
          adapterId:
            FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION.identity
              .adapterId,
          attemptId: input.attemptId,
          generation: input.generation,
          providerKind: input.providerKind,
          inputDigest: input.cell.inputDigest,
          resolvedInputSetDigest: digestVerificationValue(
            'browser-resolved-inputs'
          ),
          controlCapabilitySnapshotDigest:
            input.context.controlCapabilitySnapshotDigest,
          appliedControlDigest: input.context.appliedControlDigest,
          confirmedCursor: 0,
          state: 'collecting' as const,
        }),
        events: Object.freeze([]),
        stagedArtifacts: Object.freeze([stagedArtifact]),
        resolvedInputSetDigest: digestVerificationValue(
          'browser-resolved-inputs'
        ),
        cleanup: Object.freeze({
          status: 'clean' as const,
          residualCanaryIds: Object.freeze([]),
          diagnosticCodes: Object.freeze([]),
        }),
      });
    }
  );
});

describe('production controlled Workspace G3 SandboxPort', () => {
  it('binds the exact Workspace through codec/build/preview/Chromium and replays ACK-loss retries', async () => {
    const harness = createHarness();
    mocked.compileReact.mockReturnValue(
      Object.freeze({
        status: 'ready' as const,
        snapshot: harness.executable,
        diagnostics: Object.freeze([]),
      })
    );
    mocked.runToolchain.mockResolvedValue(harness.toolchain);
    const authority =
      createProductionAgentEvaluationControlledWorkspaceG3SandboxPort(
        harness.createInput
      );
    const bindInput = bindInputFor(harness.workspace);
    const firstBinding = await authority.bind(bindInput);
    const replayedBinding = await authority.bind(bindInput);
    expect(replayedBinding).toEqual(firstBinding);
    expect(mocked.compileReact).toHaveBeenCalledTimes(1);
    expect(mocked.compileReact).toHaveBeenCalledWith(
      harness.workspace,
      expect.objectContaining({
        verificationProfile: Object.freeze({ kind: 'production' }),
      })
    );
    expect(mocked.runToolchain).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 170_000 })
    );
    expect(harness.previewAuthority.reserve).toHaveBeenCalledTimes(1);
    expect(harness.register).toHaveBeenCalledTimes(1);
    expect(firstBinding.executableSnapshot.artifactDigest).not.toBe(
      firstBinding.executableSnapshot.semanticSnapshotDigest
    );
    const encoded = await authority.readExecutableSnapshot({
      binding: firstBinding,
      signal,
    });
    const encodedArtifact = encodeExecutableProjectSnapshotArtifact(
      harness.executable
    );
    expect(encoded).toEqual(encodedArtifact.bytes);

    const leaseInput = Object.freeze({
      binding: firstBinding,
      planDigest: firstBinding.planDigest,
      cell: bindInput.cell,
      attemptId: firstBinding.attemptId,
      generation: firstBinding.generation,
      resolvedInputSetDigest: digestVerificationValue('outer-inputs'),
      signal,
    });
    const lease = await authority.prepare(leaseInput);
    expect(await authority.prepare(leaseInput)).toEqual(lease);
    const replay = await authority.execute({
      binding: firstBinding,
      lease,
      signal,
    });
    const ackLossReplay = await authority.execute({
      binding: firstBinding,
      lease,
      signal,
    });
    expect(ackLossReplay).toEqual(replay);
    expect(mocked.executeLifecycle).toHaveBeenCalledTimes(1);
    expect(replay.assertions).toEqual([
      expect.objectContaining({ status: 'passed' }),
    ]);

    const replayBytes = new TextEncoder().encode(canonicalJsonText(replay));
    const staged = await authority.stageArtifact({
      binding: firstBinding,
      request: Object.freeze({
        planDigest: firstBinding.planDigest,
        cellId: firstBinding.cellId,
        attemptId: firstBinding.attemptId,
        generation: firstBinding.generation,
        artifact: Object.freeze({
          id: 'artifact:outer-replay',
          kind: 'replay-record',
          mediaType: 'application/vnd.prodivix.verification-replay-record+json',
          bytes: replayBytes,
        }),
      }),
      signal,
    });
    expect(staged.status).toBe('staged');
    if (staged.status !== 'staged') return;
    const ref: VerificationAdapterStagedArtifactRef = Object.freeze({
      id: 'artifact:outer-replay',
      stagingArtifactId: staged.stagingArtifactId,
      kind: 'replay-record',
      digest: staged.digest,
      size: staged.size,
      mediaType: staged.mediaType,
    });
    await expect(
      authority.readArtifact({ binding: firstBinding, artifact: ref })
    ).resolves.toEqual(replayBytes);
    const completionInput = Object.freeze({
      binding: firstBinding,
      replayArtifactDigest: computeVerificationArtifactContentDigest(
        replayBytes
      ) as CanonicalDigest,
      lifecycleDigest: digestVerificationValue('outer-lifecycle'),
    });
    const completion = await authority.complete(completionInput);
    expect(await authority.complete(completionInput)).toEqual(completion);
    expect(harness.complete).toHaveBeenCalledTimes(1);
    expect(completion.provenance.origin).toBe('remote');

    await expect(
      authority.cleanup({
        binding: firstBinding,
        lease,
        cause: 'success',
        signal,
      })
    ).resolves.toMatchObject({ status: 'clean' });
    await expect(
      authority.cleanup({
        binding: firstBinding,
        lease,
        cause: 'success',
        signal,
      })
    ).resolves.toMatchObject({ status: 'clean' });
    expect(harness.registrationRetire).toHaveBeenCalledTimes(1);
    await expect(authority.drainAndDispose()).resolves.toMatchObject({
      status: 'clean',
    });
  }, 15_000);

  it('fails closed before compile/build when final Workspace authority drifts', async () => {
    const harness = createHarness({ snapshotDigestDrift: true });
    mocked.compileReact.mockReturnValue(
      Object.freeze({
        status: 'ready' as const,
        snapshot: harness.executable,
        diagnostics: Object.freeze([]),
      })
    );
    mocked.runToolchain.mockResolvedValue(harness.toolchain);
    const authority =
      createProductionAgentEvaluationControlledWorkspaceG3SandboxPort(
        harness.createInput
      );
    await expect(
      authority.bind(bindInputFor(harness.workspace))
    ).rejects.toThrow(/Canonical Workspace source drifted/u);
    expect(mocked.compileReact).not.toHaveBeenCalled();
    expect(mocked.runToolchain).not.toHaveBeenCalled();
    expect(harness.previewAuthority.reserve).not.toHaveBeenCalled();
    expect(harness.register).not.toHaveBeenCalled();
  });

  it('requires a real Chromium owner and surfaces cleanup residuals', async () => {
    const missing = createHarness({ omitBrowserAuthority: true });
    expect(() =>
      createProductionAgentEvaluationControlledWorkspaceG3SandboxPort(
        missing.createInput
      )
    ).toThrow(
      /requires repository, Workspace, Verification, preview, and Chromium owners/u
    );

    const harness = createHarness({ cleanupStatus: 'residual' });
    mocked.compileReact.mockReturnValue(
      Object.freeze({
        status: 'ready' as const,
        snapshot: harness.executable,
        diagnostics: Object.freeze([]),
      })
    );
    mocked.runToolchain.mockResolvedValue(harness.toolchain);
    const authority =
      createProductionAgentEvaluationControlledWorkspaceG3SandboxPort(
        harness.createInput
      );
    const binding = await authority.bind(bindInputFor(harness.workspace));
    await expect(
      authority.cleanup({
        binding,
        cause: 'execute-failed',
        signal,
      })
    ).resolves.toEqual({
      status: 'residual',
      residualCanaryIds: ['canary:browser:residual'],
      diagnosticCodes: ['VER-BROWSER-RESIDUAL'],
    });
    await expect(authority.drainAndDispose()).resolves.toMatchObject({
      status: 'residual',
      residualCanaryIds: ['canary:browser:residual'],
    });
  });
});
