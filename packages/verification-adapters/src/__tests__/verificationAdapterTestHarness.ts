import {
  EXECUTION_BUILD_BUNDLE_FORMAT,
  createExecutionTestReport,
  type ExecutionTestStatus,
} from '@prodivix/runtime-core';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  createVerificationAdapterRegistrySnapshot,
  createVerificationAdapterInputDigest,
  digestVerificationValue,
  type VerificationAbortSignal,
  type VerificationAdapter,
  type VerificationAdapterArtifactRetirementPort,
  type VerificationAdapterContext,
  type VerificationAdapterFactory,
  type VerificationAdapterInputRef,
  type VerificationAdapterLifecycleContext,
  type VerificationAdapterPreparedInvocationCandidate,
  type VerificationAdapterRegistration,
  type VerificationAdapterRegistrySnapshot,
  type VerificationArtifactKind,
  type VerificationCheckKind,
  type VerificationEventSink,
  type VerificationInputKind,
  type VerificationPlanCell,
  type VerificationSurface,
  type PreparedVerificationInvocation,
} from '@prodivix/verification';
import {
  digestVerificationAdapterBytes,
  encodeCanonicalExecutionTestReport,
  type TestVerificationResultInput,
  type VerificationAdapterArtifactSource,
} from '../verificationAdapterInputs';
import { projectVerificationBuildSummary } from '../buildLogProjection';
import { projectVerificationCoverageSummary } from '../coverageSummaryProjection';
import { createVerificationArtifactProjectionSourceResolver } from '../verificationArtifactProjectionSource';
import {
  VERIFICATION_TRACE_MEDIA_TYPE,
  encodeVerificationTrace,
} from '../verificationTraceProjection';

export const utf8 = (value: string): Uint8Array =>
  new TextEncoder().encode(value);
export const sha = (value: unknown): string => digestVerificationValue(value);

export const createTestAbortSignal = (): VerificationAbortSignal =>
  Object.freeze({
    aborted: false,
    subscribe: () => () => undefined,
  });

const testSourceTrace = Object.freeze([
  Object.freeze({
    sourceRef: Object.freeze({
      kind: 'workspace' as const,
      workspaceId: 'workspace:test',
    }),
    label: 'Controlled adapter test source',
  }),
]);

const coverageMetric = Object.freeze({
  total: 1,
  covered: 1,
  skipped: 0,
  pct: 100,
});

export const artifactSource = (
  kind: VerificationArtifactKind,
  options: Readonly<{
    traceKind?: 'diagnostics' | 'integration';
    subjectDigest?: string;
  }> = {}
): VerificationAdapterArtifactSource => {
  if (kind === 'build-log') {
    const artifact = projectVerificationBuildSummary({
      source: [
        '$ tsc -b && vite build',
        'vite v7.3.6 building client environment for production...',
        'transforming...',
        '✓ 1 modules transformed.',
        'rendering chunks...',
        'computing gzip size...',
        'dist/index.html 0.41 kB │ gzip: 0.28 kB',
        '✓ built in 1ms',
      ].join('\n'),
      providerRoot: '/provider/test-project',
      subjectDigest: options.subjectDigest ?? sha('snapshot'),
      sourceTrace: testSourceTrace,
    });
    return Object.freeze({
      id: `artifact:${kind}`,
      kind,
      mediaType: artifact.mediaType,
      bytes: artifact.bytes,
    });
  }
  if (kind === 'coverage-summary') {
    const root = '/provider/test-project';
    const artifact = projectVerificationCoverageSummary({
      source: JSON.stringify({
        total: {
          branches: coverageMetric,
          functions: coverageMetric,
          lines: coverageMetric,
          statements: coverageMetric,
          branchesTrue: coverageMetric,
        },
        [`${root}/src/App.tsx`]: {
          branches: coverageMetric,
          functions: coverageMetric,
          lines: coverageMetric,
          statements: coverageMetric,
        },
      }),
      subjectDigest: options.subjectDigest ?? sha('snapshot'),
      sourceResolver: createVerificationArtifactProjectionSourceResolver(root, [
        { path: 'src/App.tsx', sourceTrace: testSourceTrace },
      ]),
    });
    return Object.freeze({
      id: `artifact:${kind}`,
      kind,
      mediaType: artifact.mediaType,
      bytes: artifact.bytes,
    });
  }
  if (kind === 'trace') {
    return Object.freeze({
      id: `artifact:${kind}`,
      kind,
      mediaType: VERIFICATION_TRACE_MEDIA_TYPE,
      bytes: encodeVerificationTrace({
        traceKind: options.traceKind ?? 'diagnostics',
        subjectDigest: options.subjectDigest ?? sha('compiler'),
        entries: [
          {
            path: 'src/App.tsx',
            sourceTrace: testSourceTrace,
          },
        ],
      }),
    });
  }
  return Object.freeze({
    id: `artifact:${kind}`,
    kind,
    mediaType: 'application/json',
    bytes: utf8(canonicalJsonText({ kind, status: 'complete' })),
  });
};

export const cellFor = (
  registration: VerificationAdapterRegistration,
  checkKind: VerificationCheckKind,
  surface: VerificationSurface,
  inputKinds: readonly VerificationInputKind[],
  artifactKinds: readonly VerificationArtifactKind[],
  options: Readonly<{ fixtureDigest?: string }> = {}
): VerificationPlanCell =>
  Object.freeze({
    id: `cell:${checkKind}`,
    checkId: `check:${checkKind}`,
    checkKind,
    targetId: 'authenticated-catalog',
    targetPolicy: Object.freeze({
      authority: 'verification-policy',
      policyDigest: sha('policy'),
      semanticTargetId: 'authenticated-catalog',
      capture: 'allowed',
    }),
    frameworkTarget: 'react-vite',
    surface,
    viewport: Object.freeze({ id: 'desktop', width: 1280, height: 720 }),
    colorScheme: 'light',
    motion: 'reduced',
    locale: 'en-US',
    controlProfileRef: Object.freeze({
      kind: 'preset',
      presetId: 'deterministic',
      digest: sha('control-profile'),
    }),
    ...(options.fixtureDigest
      ? {
          fixtureSetRef: Object.freeze({
            documentId: 'fixture:catalog',
            digest: options.fixtureDigest,
          }),
        }
      : {}),
    adapter: registration.identity,
    requirement: 'required',
    policyRuleIds: Object.freeze(['rule:required']),
    appliedExemptionIds: Object.freeze([]),
    retryPolicy: Object.freeze({
      id: 'retry:none',
      maximumAttempts: 1,
      retryableOutcomes: Object.freeze([]),
      stabilitySamples: 1,
      freshFixtureNamespace: true,
    }),
    evidenceRequirements: Object.freeze({
      acceptedTrust: Object.freeze(['ci-attested'] as const),
      maximumAgeMs: 60_000,
      requireAttestation: true,
      requireCompatibleIdentity: true,
      requiredArtifactKinds: artifactKinds,
    }),
    resources: Object.freeze([]),
    inputKinds,
    artifactKinds,
    estimatedCost: Object.freeze({
      durationMs: 1_000,
      artifactBytes: 1_000,
      computeUnits: 1,
    }),
    preflight: Object.freeze({ status: 'supported' }),
    dependencyCellIds: Object.freeze([]),
    inputDigest: sha(`input:${checkKind}`),
  });

export const buildBundleBytes = (
  options: Readonly<{
    snapshotDigest?: string;
    presetId?: string;
  }> = {}
): Uint8Array => {
  const contents = utf8('<!doctype html>');
  return utf8(
    canonicalJsonText({
      format: EXECUTION_BUILD_BUNDLE_FORMAT,
      snapshotDigest: options.snapshotDigest ?? sha('snapshot'),
      target: {
        presetId: options.presetId ?? 'react-vite',
        framework: 'react',
        runtime: 'browser',
      },
      files: [
        {
          path: 'dist/index.html',
          size: contents.byteLength,
          digest: digestVerificationAdapterBytes(contents),
          encoding: 'base64',
          contents: btoa(String.fromCharCode(...contents)),
        },
      ],
    })
  );
};

export const reportBytes = (
  status: ExecutionTestStatus = 'passed'
): Uint8Array =>
  encodeCanonicalExecutionTestReport(
    createExecutionTestReport({
      reportId: `report:${status}`,
      tool: { name: 'vitest', version: '4.1.9' },
      files: [
        {
          fileId: 'file:catalog',
          path: 'src/catalog.test.ts',
          status,
          cases: [
            {
              caseId: `case:${status}`,
              name: `catalog ${status}`,
              status,
              failureMessages:
                status === 'failed' ? ['redacted assertion failure'] : [],
            },
          ],
          failureMessages: [],
        },
      ],
      failureMessages: [],
    })
  );

export type InputEntry = Readonly<{
  id: string;
  kind: VerificationInputKind;
  mediaType: string;
  bytes: Uint8Array;
}>;

const inputRef = (entry: InputEntry): VerificationAdapterInputRef =>
  Object.freeze({
    id: entry.id,
    kind: entry.kind,
    mediaType: entry.mediaType,
    digest: digestVerificationAdapterBytes(entry.bytes),
    size: entry.bytes.byteLength,
  });

export const adapterHarness = (
  registration: VerificationAdapterRegistration,
  factory: VerificationAdapterFactory,
  cell: VerificationPlanCell,
  entries: readonly InputEntry[],
  overrides: Readonly<{
    sink?: VerificationEventSink;
    stageDigestDrift?: boolean;
    resolver?: VerificationAdapterContext['inputResolver'];
    executableSnapshotDigest?: string;
    abortSignal?: VerificationAbortSignal;
    onArtifactStaged?: () => void;
    artifactRetirement?: VerificationAdapterArtifactRetirementPort;
  }> = {}
): Readonly<{
  adapter: VerificationAdapter;
  factory: VerificationAdapterFactory;
  registrySnapshot: VerificationAdapterRegistrySnapshot;
  context: VerificationAdapterContext;
  lifecycleContext: VerificationAdapterLifecycleContext;
  artifactRetirement: VerificationAdapterArtifactRetirementPort;
  prepareInput: Parameters<VerificationAdapter['prepare']>[0];
  sink: VerificationEventSink;
}> => {
  const registry = createVerificationAdapterRegistrySnapshot([registration]);
  if (!registration.tool) {
    throw new Error(
      'Static adapter test registration requires a tool identity.'
    );
  }
  const refs = entries.map(inputRef);
  const executableSnapshotDigest =
    overrides.executableSnapshotDigest ?? sha('snapshot');
  const byId = new Map(entries.map((entry) => [entry.id, entry.bytes]));
  const signal = overrides.abortSignal ?? createTestAbortSignal();
  let sequence = 0;
  const sink =
    overrides.sink ??
    Object.freeze({
      emit: () =>
        Object.freeze({ status: 'accepted' as const, sequence: ++sequence }),
    });
  const stageArtifact = async (
    artifact: Parameters<
      VerificationAdapterContext['artifactStaging']['stage']
    >[0],
    coordinates?: Readonly<{
      planDigest: string;
      cellId: string;
      attemptId: string;
      generation: number;
    }>
  ) => {
    const result = Object.freeze({
      status: 'staged' as const,
      stagingArtifactId: `staging:${sha({
        ...(coordinates ?? {}),
        id: artifact.id,
        kind: artifact.kind,
        digest: digestVerificationAdapterBytes(artifact.bytes),
      }).slice('sha256-'.length)}`,
      digest: overrides.stageDigestDrift
        ? sha('drift')
        : digestVerificationAdapterBytes(artifact.bytes),
      size: artifact.bytes.byteLength,
      mediaType: artifact.mediaType,
    });
    overrides.onArtifactStaged?.();
    return result;
  };
  const adapterArtifactStaging: VerificationAdapterContext['artifactStaging'] =
    Object.freeze({
      stage: async (artifact) => stageArtifact(artifact),
    });
  const lifecycleContext: VerificationAdapterLifecycleContext = Object.freeze({
    registrySnapshotDigest: registry.snapshotDigest,
    adapter: registration.identity,
    runtimeZone: 'node',
    runtimeEnvironmentDigest: sha('runtime-environment'),
    inputDigest: cell.inputDigest,
    executableSnapshotDigest,
    controlProfileDigest: cell.controlProfileRef.digest!,
    fixtureSetDigests: Object.freeze(
      cell.fixtureSetRef?.digest ? [cell.fixtureSetRef.digest] : []
    ),
    controlCapabilityIds: registration.descriptor.controlCapabilities,
    controlCapabilitySnapshotDigest: sha('control-capabilities'),
    appliedControlDigest: sha('applied-controls'),
    inputRefs: Object.freeze(refs),
    inputResolver:
      overrides.resolver ??
      Object.freeze({
        read: async (ref: VerificationAdapterInputRef) =>
          new Uint8Array(byId.get(ref.id)!),
      }),
    artifactStaging: Object.freeze({
      stage: async (
        request: Parameters<
          VerificationAdapterLifecycleContext['artifactStaging']['stage']
        >[0]
      ) =>
        stageArtifact(request.artifact, {
          planDigest: request.planDigest,
          cellId: request.cellId,
          attemptId: request.attemptId,
          generation: request.generation,
        }),
    }),
    abortSignal: signal,
  });
  const context: VerificationAdapterContext = Object.freeze({
    ...lifecycleContext,
    artifactStaging: adapterArtifactStaging,
    resolvedInputSetDigest: createVerificationAdapterInputDigest({
      runtimeEnvironmentDigest: lifecycleContext.runtimeEnvironmentDigest,
      executableSnapshotDigest: lifecycleContext.executableSnapshotDigest,
      controlProfileDigest: lifecycleContext.controlProfileDigest,
      fixtureSetDigests: lifecycleContext.fixtureSetDigests,
      controlCapabilityIds: lifecycleContext.controlCapabilityIds,
      controlCapabilitySnapshotDigest:
        lifecycleContext.controlCapabilitySnapshotDigest,
      appliedControlDigest: lifecycleContext.appliedControlDigest,
      inputRefs: lifecycleContext.inputRefs,
    }),
  });
  const artifactRetirement: VerificationAdapterArtifactRetirementPort =
    overrides.artifactRetirement ??
    Object.freeze({
      retireAttempt: async (input) =>
        Object.freeze({
          status: 'retired' as const,
          ...input,
        }),
    });
  return Object.freeze({
    adapter: factory({
      descriptor: registration.descriptor,
      identity: registration.identity,
      tool: registration.tool,
      runtimeZone: 'node',
      registrySnapshotDigest: registry.snapshotDigest,
    }),
    factory,
    registrySnapshot: registry,
    context,
    lifecycleContext,
    artifactRetirement,
    prepareInput: Object.freeze({
      planDigest: sha('plan'),
      cell,
      attemptId: 'attempt:1',
      generation: 1,
      providerKind: cell.surface === 'export' ? 'export' : 'ci',
      controlCapabilitySnapshotDigest: context.controlCapabilitySnapshotDigest,
      appliedControlDigest: context.appliedControlDigest,
      context,
    }),
    sink,
  });
};

export const resolvePreparedInvocation = (
  candidate: VerificationAdapterPreparedInvocationCandidate,
  context: VerificationAdapterContext
): PreparedVerificationInvocation =>
  Object.freeze({
    ...candidate,
    resolvedInputSetDigest: context.resolvedInputSetDigest,
  });

export const prepareHarnessInvocation = async (
  harness: Readonly<{
    adapter: VerificationAdapter;
    context: VerificationAdapterContext;
    prepareInput: Parameters<VerificationAdapter['prepare']>[0];
  }>
): Promise<PreparedVerificationInvocation> =>
  resolvePreparedInvocation(
    await harness.adapter.prepare(harness.prepareInput),
    harness.context
  );

export const testResultInput = (
  cell: VerificationPlanCell,
  report: Uint8Array,
  artifacts: readonly VerificationAdapterArtifactSource[],
  overrides: Partial<TestVerificationResultInput> = {}
): TestVerificationResultInput =>
  ({
    checkKind: cell.checkKind,
    cellInputDigest: cell.inputDigest,
    snapshotDigest: sha('snapshot'),
    reportDigest: digestVerificationAdapterBytes(report),
    controlProfileDigest: cell.controlProfileRef.digest!,
    status: 'passed',
    exitCode: 0,
    artifacts,
    ...overrides,
  }) as TestVerificationResultInput;
