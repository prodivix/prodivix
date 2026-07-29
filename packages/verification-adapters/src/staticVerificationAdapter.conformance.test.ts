import {
  digestVerificationValue,
  executeVerificationAdapterLifecycle,
  normalizeVerificationCheckReport,
  type VerificationAdapterRegistrySnapshot,
  type VerificationCheckKind,
  type VerificationEventSink,
  type VerificationPlan,
  type VerificationPlanCell,
} from '@prodivix/verification';
import { describe, expect, it, vi } from 'vitest';
import {
  DIAGNOSTICS_VERIFICATION_ADAPTER_REGISTRATION,
  DIAGNOSTICS_VERIFICATION_ADAPTER_TOOL,
  DIAGNOSTIC_VERIFICATION_SNAPSHOT_MEDIA_TYPE,
  FIRST_PARTY_VERIFICATION_INPUT_IDS,
  createDiagnosticsVerificationAdapter,
  encodeDiagnosticVerificationSnapshot,
} from './index';
import {
  adapterHarness,
  artifactSource,
  cellFor,
  createTestAbortSignal,
  prepareHarnessInvocation,
  resolvePreparedInvocation,
  sha,
  utf8,
} from './__tests__/verificationAdapterTestHarness';

const diagnosticFixture = (workspaceSnapshotDigest = sha('workspace')) => {
  const cell = cellFor(
    DIAGNOSTICS_VERIFICATION_ADAPTER_REGISTRATION,
    'diagnostics',
    'ci',
    ['diagnostic-snapshot'],
    ['trace']
  );
  const bytes = encodeDiagnosticVerificationSnapshot({
    cellInputDigest: cell.inputDigest,
    workspaceSnapshotDigest,
    semanticIndexDigest: sha('semantic'),
    compilerProjectionDigest: sha('compiler'),
    findings: [],
    artifacts: [artifactSource('trace')],
  });
  const entry = {
    id: FIRST_PARTY_VERIFICATION_INPUT_IDS.diagnosticSnapshot,
    kind: 'diagnostic-snapshot' as const,
    mediaType: DIAGNOSTIC_VERIFICATION_SNAPSHOT_MEDIA_TYPE,
    bytes,
  };
  return { cell, bytes, entry };
};

const planForCell = (
  cell: VerificationPlanCell,
  registry: VerificationAdapterRegistrySnapshot
): VerificationPlan => {
  const cellsByCheckKind = Object.freeze(
    Object.fromEntries(
      (
        [
          'diagnostics',
          'build',
          'unit',
          'integration',
          'e2e',
          'visual',
          'accessibility',
          'performance',
          'security',
        ] satisfies readonly VerificationCheckKind[]
      ).map((kind) => [kind, kind === cell.checkKind ? 1 : 0])
    ) as Record<VerificationCheckKind, number>
  );
  const planWithoutDigest = Object.freeze({
    status: 'ready' as const,
    workspaceId: 'workspace:v6-static-adapters',
    targetRevision: 1,
    targetPartitionRevisions: Object.freeze({
      workspaceRev: 1,
      routeRev: 1,
      opSeq: 1,
      documentRevisions: Object.freeze({}),
    }),
    scenarioRegistryDigest: sha('scenario-registry'),
    policyRevision: 1,
    policyDigest: cell.targetPolicy.policyDigest,
    retentionRequest: Object.freeze({
      successful: 'change' as const,
      failed: 'session' as const,
      protectReleaseEvidence: true,
    }),
    policyEvaluationInstant: '2026-07-28T00:00:00.000Z',
    impactDigest: sha('impact'),
    semanticSchemaDigest: sha('semantic-schema'),
    providerSetDigest: sha('provider-set'),
    compilerDigest: sha('compiler'),
    plannerDigest: sha('planner'),
    adapterRegistryDigest: registry.snapshotDigest,
    cells: Object.freeze([cell]),
    issues: Object.freeze([]),
    explanations: Object.freeze([]),
    budget: Object.freeze({
      cells: 1,
      cellsByCheckKind,
      targetExpansions: 1,
      browserExpansions: 0,
      closureEvidenceRecords: 1,
      totalMs: 1_000,
      artifactBytes: 1_000,
      estimatedComputeUnits: 1,
      maximumParallelism: 1,
      overBudgetDimensions: Object.freeze([]),
    }),
  });
  return Object.freeze({
    ...planWithoutDigest,
    planDigest: digestVerificationValue(planWithoutDigest),
  });
};

describe('static verification adapter lifecycle conformance', () => {
  it('rejects factory identity, tool, or runtime-zone drift before allocating invocation state', () => {
    expect(() =>
      createDiagnosticsVerificationAdapter({
        descriptor: DIAGNOSTICS_VERIFICATION_ADAPTER_REGISTRATION.descriptor,
        identity: DIAGNOSTICS_VERIFICATION_ADAPTER_REGISTRATION.identity,
        tool: {
          ...DIAGNOSTICS_VERIFICATION_ADAPTER_TOOL,
          version: 'drifted',
        },
        runtimeZone: 'node',
        registrySnapshotDigest: sha('registry'),
      })
    ).toThrow(/Factory identity, tool, runtime zone, or descriptor/u);
  });

  it('bridges a Core-owned lifecycle report into V5 Evidence without replacing logical artifact identity', async () => {
    const { cell, entry } = diagnosticFixture();
    const harness = adapterHarness(
      DIAGNOSTICS_VERIFICATION_ADAPTER_REGISTRATION,
      createDiagnosticsVerificationAdapter,
      cell,
      [entry]
    );
    const plan = planForCell(cell, harness.registrySnapshot);
    const result = await executeVerificationAdapterLifecycle({
      factory: harness.factory,
      registrySnapshot: harness.registrySnapshot,
      planDigest: plan.planDigest,
      cell,
      attemptId: harness.prepareInput.attemptId,
      generation: harness.prepareInput.generation,
      providerKind: harness.prepareInput.providerKind,
      context: harness.lifecycleContext,
      artifactRetirement: harness.artifactRetirement,
    });
    expect(result).toMatchObject({
      status: 'reported',
      report: {
        artifacts: [{ id: 'artifact:trace', kind: 'trace' }],
      },
      events: [
        { sequence: 1, event: { kind: 'progress', completed: 0 } },
        {
          sequence: 2,
          event: { kind: 'artifact', artifactId: 'artifact:trace' },
        },
        { sequence: 3, event: { kind: 'progress', completed: 1 } },
      ],
      cleanup: { status: 'clean' },
    });
    if (result.status !== 'reported') {
      throw new Error(`Expected a report, received ${result.status}.`);
    }
    const sourceTraces = Object.freeze([
      Object.freeze({
        sourceRef: Object.freeze({
          kind: 'verification-plan-cell' as const,
          planDigest: plan.planDigest,
          cellId: cell.id,
        }),
        label: 'Static diagnostics verification cell',
      }),
    ]);
    const sourceTraceDigest = digestVerificationValue(sourceTraces[0]);
    const normalized = normalizeVerificationCheckReport({
      projectId: 'project:v6-static-adapters',
      plan,
      adapterRegistry: harness.registrySnapshot,
      cellId: cell.id,
      context: Object.freeze({
        cell,
        attemptId: harness.prepareInput.attemptId,
        resolvedInputSetDigest: result.resolvedInputSetDigest,
        runtimeEnvironmentDigest:
          harness.lifecycleContext.runtimeEnvironmentDigest,
        executableSnapshotDigest:
          harness.lifecycleContext.executableSnapshotDigest,
        controlProfileDigest: harness.lifecycleContext.controlProfileDigest,
        fixtureSetDigests: harness.lifecycleContext.fixtureSetDigests,
        controlCapabilityIds: harness.lifecycleContext.controlCapabilityIds,
        controlCapabilitySnapshotDigest:
          harness.lifecycleContext.controlCapabilitySnapshotDigest,
        appliedControlDigest: harness.lifecycleContext.appliedControlDigest,
        inputRefs: harness.lifecycleContext.inputRefs,
      }),
      report: result.report,
      run: Object.freeze({
        runId: 'run:v6-static-adapters',
        providerId: 'provider:ci',
        runtimeZone: 'node',
        operatingSystemIdentity: 'windows-x64',
        devicePixelRatio: 1,
        timezone: 'Asia/Shanghai',
        fontSetDigest: sha('font-set'),
      }),
      timing: Object.freeze({
        startedAt: '2026-07-28T00:00:00.000Z',
        completedAt: '2026-07-28T00:00:01.000Z',
        durationMs: 1_000,
      }),
      artifacts: Object.freeze([
        Object.freeze({
          id: result.report.artifacts[0]!.id,
          path: 'traces/diagnostics.json',
          sourceTraceDigest,
        }),
      ]),
      stagedArtifacts: result.stagedArtifacts,
      sourceTraces,
      dependencyLockDigest: sha('dependency-lock'),
      provenance: Object.freeze({
        origin: 'ci' as const,
        producerId: 'producer:v6-static-adapters',
        providerId: 'provider:ci',
        issuedAt: '2026-07-28T00:00:02.000Z',
        expiresAt: '2026-07-29T00:00:02.000Z',
        ci: Object.freeze({
          repository: 'github.com/prodivix/prodivix',
          ref: 'refs/heads/main',
          commit: `sha1-${'a'.repeat(40)}`,
        }),
      }),
      redaction: Object.freeze({
        policyId: 'redaction:default',
        scannerSetDigest: sha('scanner-set'),
        droppedFieldCounts: Object.freeze({}),
      }),
      promotion: Object.freeze({
        idempotencyKey: 'promotion:v6-static-adapters',
        deadline: '2026-07-28T00:01:00.000Z',
      }),
    });
    if (normalized.status !== 'ready') {
      throw new Error(JSON.stringify(normalized.issues));
    }
    expect(normalized).toMatchObject({
      status: 'ready',
      candidate: {
        artifacts: [
          {
            id: result.report.artifacts[0]!.id,
            expectedDigest: result.report.artifacts[0]!.digest,
            stagingArtifactId: result.stagedArtifacts[0]!.stagingArtifactId,
          },
        ],
      },
    });
  });

  it('binds exact diagnostics bytes without conflating Workspace and Executable Snapshot digests', async () => {
    const run = async (workspaceSnapshotDigest: string) => {
      const { cell, entry } = diagnosticFixture(workspaceSnapshotDigest);
      const harness = adapterHarness(
        DIAGNOSTICS_VERIFICATION_ADAPTER_REGISTRATION,
        createDiagnosticsVerificationAdapter,
        cell,
        [entry]
      );
      const plan = planForCell(cell, harness.registrySnapshot);
      const result = await executeVerificationAdapterLifecycle({
        factory: harness.factory,
        registrySnapshot: harness.registrySnapshot,
        planDigest: plan.planDigest,
        cell,
        attemptId: harness.prepareInput.attemptId,
        generation: harness.prepareInput.generation,
        providerKind: harness.prepareInput.providerKind,
        context: harness.lifecycleContext,
        artifactRetirement: harness.artifactRetirement,
      });
      if (result.status !== 'reported') {
        throw new Error(`Expected a report, received ${result.status}.`);
      }
      return Object.freeze({
        result,
        executableSnapshotDigest:
          harness.lifecycleContext.executableSnapshotDigest,
      });
    };

    const first = await run(sha('workspace:a'));
    const second = await run(sha('workspace:b'));
    expect(first.executableSnapshotDigest).not.toBe(sha('workspace:a'));
    expect(first.executableSnapshotDigest).toBe(
      second.executableSnapshotDigest
    );
    expect(first.result.resolvedInputSetDigest).not.toBe(
      second.result.resolvedInputSetDigest
    );
  });

  it('retires the whole attempt when transport wrote an artifact but its receipt drifted', async () => {
    const { cell, entry } = diagnosticFixture();
    let staged = false;
    const retireAttempt = vi.fn(
      async (input: {
        planDigest: string;
        cellId: string;
        attemptId: string;
        generation: number;
      }) =>
        Object.freeze({
          status: 'retired' as const,
          ...input,
        })
    );
    const harness = adapterHarness(
      DIAGNOSTICS_VERIFICATION_ADAPTER_REGISTRATION,
      createDiagnosticsVerificationAdapter,
      cell,
      [entry],
      {
        onArtifactStaged: () => {
          staged = true;
        },
        stageDigestDrift: true,
        artifactRetirement: Object.freeze({ retireAttempt }),
      }
    );
    const plan = planForCell(cell, harness.registrySnapshot);
    const result = await executeVerificationAdapterLifecycle({
      factory: harness.factory,
      registrySnapshot: harness.registrySnapshot,
      planDigest: plan.planDigest,
      cell,
      attemptId: harness.prepareInput.attemptId,
      generation: harness.prepareInput.generation,
      providerKind: harness.prepareInput.providerKind,
      context: harness.lifecycleContext,
      artifactRetirement: harness.artifactRetirement,
    });
    expect(result).toMatchObject({
      status: 'failed',
      reasonCode: 'VER-4001',
      cleanup: { status: 'clean' },
    });
    expect(staged).toBe(true);
    expect(retireAttempt).toHaveBeenCalledTimes(1);
    expect(retireAttempt).toHaveBeenCalledWith(
      {
        planDigest: plan.planDigest,
        cellId: cell.id,
        attemptId: harness.prepareInput.attemptId,
        generation: harness.prepareInput.generation,
      },
      expect.objectContaining({ aborted: false })
    );
  });

  it('reserves concurrent prepares and reports drifted cleanup through residual canaries', async () => {
    const { cell, bytes, entry } = diagnosticFixture();
    let releaseRead!: () => void;
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const harness = adapterHarness(
      DIAGNOSTICS_VERIFICATION_ADAPTER_REGISTRATION,
      createDiagnosticsVerificationAdapter,
      cell,
      [entry],
      {
        resolver: {
          read: async () => {
            await readGate;
            return new Uint8Array(bytes);
          },
        },
      }
    );
    const first = harness.adapter.prepare(harness.prepareInput);
    const second = harness.adapter.prepare(harness.prepareInput);
    await expect(second).rejects.toThrow(/already preparing or active/u);
    releaseRead();
    const invocation = resolvePreparedInvocation(await first, harness.context);

    const driftedInvocation = {
      ...invocation,
      confirmedCursor: 1,
    };
    await expect(
      harness.adapter.cleanup({
        planDigest: invocation.planDigest,
        cellId: invocation.cellId,
        attemptId: invocation.attemptId,
        generation: invocation.generation,
        cause: 'execute-failed',
        invocation: driftedInvocation,
        abortSignal: createTestAbortSignal(),
      })
    ).resolves.toMatchObject({
      status: 'residual',
      residualCanaryIds: [expect.stringMatching(/^canary:/u)],
      diagnosticCodes: ['VER-4002'],
    });
    await expect(
      harness.adapter.cleanup({
        planDigest: invocation.planDigest,
        cellId: invocation.cellId,
        attemptId: invocation.attemptId,
        generation: invocation.generation,
        cause: 'execute-failed',
        invocation,
        abortSignal: createTestAbortSignal(),
      })
    ).resolves.toEqual({
      status: 'clean',
      residualCanaryIds: [],
      diagnosticCodes: [],
    });
    await expect(
      harness.adapter.execute(invocation, harness.sink)
    ).rejects.toThrow(/unknown, stale/u);
  });

  it('delegates event budget enforcement to the Core sink', async () => {
    const { cell, entry } = diagnosticFixture();
    const harness = adapterHarness(
      DIAGNOSTICS_VERIFICATION_ADAPTER_REGISTRATION,
      createDiagnosticsVerificationAdapter,
      cell,
      [entry]
    );
    const invocation = await prepareHarnessInvocation(harness);
    const rejectingSink: VerificationEventSink = {
      emit: vi.fn(() => ({
        status: 'rejected' as const,
        reason: 'budget-exceeded' as const,
      })),
    };
    await expect(
      harness.adapter.execute(invocation, rejectingSink)
    ).rejects.toThrow(/Core event sink rejected/u);
    expect(rejectingSink.emit).toHaveBeenCalledTimes(1);
  });

  it('fails closed on content-address drift and artifact staging drift', async () => {
    const { cell, entry } = diagnosticFixture();
    const digestDrift = adapterHarness(
      DIAGNOSTICS_VERIFICATION_ADAPTER_REGISTRATION,
      createDiagnosticsVerificationAdapter,
      cell,
      [entry],
      {
        resolver: {
          read: async () => utf8('different bytes'),
        },
      }
    );
    await expect(
      digestDrift.adapter.prepare(digestDrift.prepareInput)
    ).rejects.toThrow(/content address/u);

    const stageDrift = adapterHarness(
      DIAGNOSTICS_VERIFICATION_ADAPTER_REGISTRATION,
      createDiagnosticsVerificationAdapter,
      cell,
      [entry],
      { stageDigestDrift: true }
    );
    const invocation = await prepareHarnessInvocation(stageDrift);
    await expect(
      stageDrift.adapter.execute(invocation, stageDrift.sink)
    ).rejects.toThrow(/staging identity drifted/u);
  });

  it('blocks registry identity drift and rejects control digest mismatch at prepare', async () => {
    const { cell, entry } = diagnosticFixture();
    const harness = adapterHarness(
      DIAGNOSTICS_VERIFICATION_ADAPTER_REGISTRATION,
      createDiagnosticsVerificationAdapter,
      cell,
      [entry]
    );
    await expect(
      harness.adapter.preflight(cell, {
        ...harness.context,
        registrySnapshotDigest: sha('wrong-registry'),
      })
    ).resolves.toMatchObject({
      status: 'blocked',
      reasonCode: 'VER-4001',
    });
    await expect(
      harness.adapter.prepare({
        ...harness.prepareInput,
        appliedControlDigest: sha('wrong-applied-controls'),
      })
    ).rejects.toThrow(/Prepare controls/u);
  });
});
