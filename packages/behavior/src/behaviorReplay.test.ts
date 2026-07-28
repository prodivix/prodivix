import { describe, expect, it, vi } from 'vitest';
import {
  createDeterministicRuntimeProvider,
  type DeterministicRuntimePlanCell,
} from '@prodivix/runtime-core';
import {
  BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
  createBehaviorDeterministicControlPlan,
  digestBehaviorControlProfile,
  digestBehaviorFixtureSet,
} from './behaviorControlProfile';
import { digestBehaviorValue } from './behaviorCanonical';
import { executeBehaviorReplayAttempt } from './behaviorReplay';
import {
  compareBehaviorReplayRecords,
  runBehaviorReplaySeries,
} from './behaviorReplayComparison';
import {
  decodeBehaviorReplayRecord,
  encodeBehaviorReplayRecord,
} from './behaviorReplayCodec';
import {
  createBehaviorReplayDebugCommand,
  createBehaviorReplayDebugController,
} from './behaviorReplayDebugger';
import { createBehaviorRuntimeCapabilityRegistry } from './behaviorRuntime';
import type {
  BehaviorFixtureSet,
  BehaviorScenarioProgram,
} from './behavior.types';

const DIGEST = `sha256-${'a'.repeat(64)}`;
const IMPLEMENTATION_DIGEST = `sha256-${'b'.repeat(64)}`;
const TOOLCHAIN_DIGEST = `sha256-${'c'.repeat(64)}`;
const INPUT_DIGEST = `sha256-${'d'.repeat(64)}`;

const browserCell = Object.freeze({
  id: 'react-browser-full',
  frameworkTarget: 'react-vite',
  surface: 'browser',
  browserEngine: 'chromium',
  viewport: Object.freeze({ width: 1280, height: 720 }),
  colorScheme: 'light',
  motion: 'full',
  locale: 'en-US',
} satisfies DeterministicRuntimePlanCell);

const createProgram = (
  input: Readonly<{
    capabilityId?: string;
    fixtureSetDigests?: readonly string[];
    sourcePath?: string;
  }> = {}
): BehaviorScenarioProgram => {
  const capabilityId = input.capabilityId ?? 'scenario.manual';
  const manual = capabilityId === 'scenario.manual';
  return Object.freeze({
    scenarioId: 'scenario.catalog',
    scenarioDigest: DIGEST,
    workspaceRevision: 1,
    semanticSnapshotDigest: DIGEST,
    executableSnapshotDigest: DIGEST,
    compilerDigest: DIGEST,
    registryDigest: DIGEST,
    controlProfileDigest: digestBehaviorControlProfile(
      BEHAVIOR_DETERMINISTIC_CONTROL_PRESET
    ),
    fixtureSetDigests: Object.freeze([...(input.fixtureSetDigests ?? [])]),
    baselineSetDigests: Object.freeze([]),
    requiredCapabilities: Object.freeze([capabilityId]),
    capabilityManifest: Object.freeze([
      Object.freeze({
        capabilityId,
        descriptorKind: capabilityId,
        targetCapability: manual ? 'behavior:scenario:manual' : 'test:runtime',
        owner: manual ? '@prodivix/behavior' : 'test.owner',
        runtimeZones: Object.freeze(['client', 'test'] as const),
        effect: 'none' as const,
        cancellation: 'required' as const,
      }),
    ]),
    targetManifest: manual
      ? Object.freeze([])
      : Object.freeze([
          Object.freeze({
            targetId: 'target.runtime',
            semanticSymbolId: 'symbol.runtime',
            capability: 'test:runtime',
            source: Object.freeze({
              workspaceDocumentId: 'document.runtime',
              path: '/runtime',
            }),
          }),
        ]),
    instructions: Object.freeze([
      Object.freeze({
        id: 'instruction-1',
        stepId: 'step-1',
        dependencyInstructionIds: Object.freeze([]),
        operation: manual ? 'trigger:manual' : 'action:test',
        capabilityId,
        ...(manual ? {} : { targetId: 'target.runtime' }),
      }),
    ]),
    observations: Object.freeze([]),
    sourceTrace: Object.freeze([
      Object.freeze({
        instructionId: 'instruction-1',
        source: Object.freeze({
          workspaceDocumentId: 'scenario-document',
          path: input.sourcePath ?? '/steps/0',
        }),
      }),
    ]),
    budgets: Object.freeze({
      totalMs: 30_000,
      stepMs: 5_000,
      settleMs: 2_000,
    }),
    programDigest: DIGEST,
  });
};

const createProvider = (
  hooks?: Parameters<typeof createDeterministicRuntimeProvider>[0]['hooks']
) =>
  createDeterministicRuntimeProvider({
    id: 'browser-controls',
    version: '1',
    surface: 'browser',
    implementationDigest: IMPLEMENTATION_DIGEST,
    hooks,
  });

const createPlan = (
  program: BehaviorScenarioProgram,
  fixtureSets: readonly BehaviorFixtureSet[] = []
) => {
  const result = createBehaviorDeterministicControlPlan({
    program,
    profile: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
    fixtureSets,
    cell: browserCell,
  });
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error('Expected a ready plan.');
  return result.plan;
};

describe('Behavior deterministic replay', () => {
  it('resolves exact profile/fixture identity and blocks drift', () => {
    const program = createProgram();
    expect(
      createBehaviorDeterministicControlPlan({
        program,
        profile: {
          ...BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
          timezone: 'Asia/Shanghai',
        },
        fixtureSets: [],
        cell: browserCell,
      })
    ).toMatchObject({
      status: 'blocked',
      issues: [{ code: 'profile-digest-mismatch' }],
    });
    expect(
      createBehaviorDeterministicControlPlan({
        program,
        profile: {
          ...BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
          network: {
            mode: 'isolated-live-read',
            undeclaredRequest: 'reject',
          },
        },
        fixtureSets: [],
        cell: browserCell,
      })
    ).toMatchObject({
      status: 'blocked',
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'fixture-only-required' }),
      ]),
    });
    expect(
      createBehaviorDeterministicControlPlan({
        program,
        profile: {
          ...BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
          random: { algorithm: 'unimplemented-prng', seed: 'seed' },
        },
        fixtureSets: [],
        cell: browserCell,
      })
    ).toMatchObject({
      status: 'blocked',
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'random-algorithm-unsupported' }),
      ]),
    });
  });

  it('repeats a fresh attempt three times with one semantic digest', async () => {
    const program = createProgram();
    const registry = createBehaviorRuntimeCapabilityRegistry([]);
    expect(registry.ok).toBe(true);
    if (!registry.ok) return;
    const series = await runBehaviorReplaySeries({
      attempts: 3,
      createAttemptId: (index) => `attempt-${index + 1}`,
      program,
      plan: createPlan(program),
      provider: createProvider(),
      registry: registry.registry,
      toolchainDigest: TOOLCHAIN_DIGEST,
    });

    expect(series.status).toBe('consistent');
    if (series.status !== 'consistent') return;
    expect(series.records).toHaveLength(3);
    expect(
      new Set(series.records.map(({ semanticDigest }) => semanticDigest)).size
    ).toBe(1);
    expect(new Set(series.records.map(({ attemptId }) => attemptId)).size).toBe(
      3
    );
    expect(
      series.records.every(({ cleanup }) => cleanup.status === 'clean')
    ).toBe(true);
  });

  it('locates the first uncontrolled output as observation divergence', async () => {
    const program = createProgram({ capabilityId: 'test.random' });
    let invocation = 0;
    const registry = createBehaviorRuntimeCapabilityRegistry([
      {
        capabilityId: 'test.random',
        owner: 'test.owner',
        invoke: () => ({
          status: 'succeeded',
          output: ++invocation,
        }),
      },
    ]);
    expect(registry.ok).toBe(true);
    if (!registry.ok) return;

    const series = await runBehaviorReplaySeries({
      attempts: 2,
      createAttemptId: (index) => `random-attempt-${index + 1}`,
      program,
      plan: createPlan(program),
      provider: createProvider(),
      registry: registry.registry,
      toolchainDigest: TOOLCHAIN_DIGEST,
    });
    expect(series).toMatchObject({
      status: 'diverged',
      divergence: {
        kind: 'observation-divergence',
        reason: 'The first normalized replay event differs.',
      },
    });
  });

  it('reports an unmatched fixture as the first effect divergence', async () => {
    const fixtureSet: BehaviorFixtureSet = Object.freeze({
      id: 'catalog-fixtures',
      name: 'Catalog fixtures',
      fixtures: Object.freeze([
        Object.freeze({
          id: 'catalog-list',
          target: Object.freeze({
            kind: 'data-operation',
            resourceId: 'catalog.list',
          }),
          inputDigest: INPUT_DIGEST,
          outcome: Object.freeze({
            kind: 'result',
            value: Object.freeze({ items: Object.freeze(['Alpha']) }),
          }),
        }),
      ]),
    });
    const program = createProgram({
      capabilityId: 'test.network',
      fixtureSetDigests: [digestBehaviorFixtureSet(fixtureSet)],
    });
    let invocation = 0;
    const registry = createBehaviorRuntimeCapabilityRegistry([
      {
        capabilityId: 'test.network',
        owner: 'test.owner',
        async invoke(runtime) {
          invocation += 1;
          const outcome = await runtime.controls!.network.dispatch({
            kind: 'data-operation',
            resourceId: invocation === 1 ? 'catalog.list' : 'catalog.unmatched',
            inputDigest: INPUT_DIGEST,
          });
          return outcome.status === 'matched'
            ? { status: 'succeeded', output: outcome.value }
            : {
                status: 'failed',
                error: {
                  code: 'fixture-denied',
                  safeMessage: 'Fixture request was denied.',
                },
              };
        },
      },
    ]);
    expect(registry.ok).toBe(true);
    if (!registry.ok) return;
    const series = await runBehaviorReplaySeries({
      attempts: 2,
      createAttemptId: (index) => `network-attempt-${index + 1}`,
      program,
      plan: createPlan(program, [fixtureSet]),
      provider: createProvider(),
      registry: registry.registry,
      toolchainDigest: TOOLCHAIN_DIGEST,
    });
    expect(series).toMatchObject({
      status: 'diverged',
      divergence: { kind: 'effect-divergence' },
    });
  });

  it('round-trips a bounded record and rejects digest tampering', async () => {
    const program = createProgram();
    const registry = createBehaviorRuntimeCapabilityRegistry([]);
    if (!registry.ok) return;
    const attempt = await executeBehaviorReplayAttempt({
      attemptId: 'codec-attempt',
      program,
      plan: createPlan(program),
      provider: createProvider(),
      registry: registry.registry,
      toolchainDigest: TOOLCHAIN_DIGEST,
    });
    expect(attempt.status).toBe('completed');
    if (attempt.status !== 'completed') return;
    const wire = encodeBehaviorReplayRecord(attempt.record);
    expect(decodeBehaviorReplayRecord(wire)).toEqual(attempt.record);
    expect(
      decodeBehaviorReplayRecord({
        ...wire,
        recordDigest: DIGEST,
      })
    ).toBeNull();
    const withProviderCredential = {
      ...wire,
      provider: {
        ...wire.provider,
        credential: 'must-not-be-accepted',
      },
    };
    const {
      wireVersion: _wireVersion,
      recordDigest: _recordDigest,
      ...forgedRecord
    } = withProviderCredential;
    expect(
      decodeBehaviorReplayRecord({
        ...withProviderCredential,
        recordDigest: digestBehaviorValue(forgedRecord),
      })
    ).toBeNull();
    const semanticallyForged = {
      ...wire,
      semanticDigest: DIGEST,
    };
    const {
      wireVersion: _semanticWireVersion,
      recordDigest: _semanticRecordDigest,
      ...semanticRecord
    } = semanticallyForged;
    expect(
      decodeBehaviorReplayRecord({
        ...semanticallyForged,
        recordDigest: digestBehaviorValue(semanticRecord),
      })
    ).toBeNull();
    expect(
      decodeBehaviorReplayRecord(wire, { maximumEvents: Number.NaN })
    ).toBeNull();
    expect(
      compareBehaviorReplayRecords(attempt.record, attempt.record)
    ).toMatchObject({ status: 'consistent' });
  });

  it('distinguishes capability, toolchain, and truncation drift', async () => {
    const program = createProgram();
    const registry = createBehaviorRuntimeCapabilityRegistry([]);
    if (!registry.ok) return;
    const first = await executeBehaviorReplayAttempt({
      attemptId: 'drift-1',
      program,
      plan: createPlan(program),
      provider: createProvider(),
      registry: registry.registry,
      toolchainDigest: TOOLCHAIN_DIGEST,
    });
    const capability = await executeBehaviorReplayAttempt({
      attemptId: 'drift-2',
      program,
      plan: createPlan(program),
      provider: createDeterministicRuntimeProvider({
        id: 'browser-controls-v2',
        version: '2',
        surface: 'browser',
        implementationDigest: `sha256-${'e'.repeat(64)}`,
      }),
      registry: registry.registry,
      toolchainDigest: TOOLCHAIN_DIGEST,
    });
    const tool = await executeBehaviorReplayAttempt({
      attemptId: 'drift-3',
      program,
      plan: createPlan(program),
      provider: createProvider(),
      registry: registry.registry,
      toolchainDigest: `sha256-${'f'.repeat(64)}`,
    });
    const truncated = await executeBehaviorReplayAttempt({
      attemptId: 'drift-4',
      program,
      plan: createPlan(program),
      provider: createProvider(),
      registry: registry.registry,
      toolchainDigest: TOOLCHAIN_DIGEST,
      recordBudget: { maximumEvents: 1 },
    });
    if (
      !first.record ||
      !capability.record ||
      !tool.record ||
      !truncated.record
    ) {
      throw new Error('Expected comparable ReplayRecords.');
    }
    expect(
      compareBehaviorReplayRecords(first.record, capability.record)
    ).toMatchObject({
      status: 'diverged',
      divergence: { kind: 'capability-drift' },
    });
    expect(
      compareBehaviorReplayRecords(first.record, tool.record)
    ).toMatchObject({
      status: 'diverged',
      divergence: { kind: 'input-drift' },
    });
    expect(
      compareBehaviorReplayRecords(first.record, truncated.record)
    ).toMatchObject({
      status: 'diverged',
      divergence: { kind: 'truncated' },
    });
  });

  it('blocks residual cleanup and protected record material', async () => {
    const program = createProgram();
    const registry = createBehaviorRuntimeCapabilityRegistry([]);
    if (!registry.ok) return;
    const residual = await executeBehaviorReplayAttempt({
      attemptId: 'residual-attempt',
      program,
      plan: createPlan(program),
      provider: createProvider({
        probe: ({ phase }) => ({
          storage: phase === 'after-cleanup' ? 1 : 0,
          cookies: 0,
          indexedDb: 0,
          cacheStorage: 0,
          serviceWorkers: 0,
          workers: 0,
          streams: 0,
          timers: 0,
          effects: 0,
          authSessions: 0,
        }),
      }),
      registry: registry.registry,
      toolchainDigest: TOOLCHAIN_DIGEST,
    });
    expect(residual).toMatchObject({
      status: 'blocked',
      code: 'BHV-4006',
    });

    const protectedValue = 'secret-canary-value';
    const secretProgram = createProgram({ sourcePath: protectedValue });
    const secret = await executeBehaviorReplayAttempt({
      attemptId: 'secret-attempt',
      program: secretProgram,
      plan: createPlan(secretProgram),
      provider: createProvider(),
      registry: registry.registry,
      toolchainDigest: TOOLCHAIN_DIGEST,
      protectedSecretValues: [protectedValue],
    });
    expect(secret).toMatchObject({
      status: 'blocked',
      code: 'BHV-4004',
    });

    const truncatedSecret = await executeBehaviorReplayAttempt({
      attemptId: protectedValue,
      program: secretProgram,
      plan: createPlan(secretProgram),
      provider: createProvider(),
      registry: registry.registry,
      toolchainDigest: TOOLCHAIN_DIGEST,
      protectedSecretValues: [protectedValue],
      recordBudget: { maximumEvents: 1 },
    });
    expect(truncatedSecret).toMatchObject({
      status: 'blocked',
      code: 'BHV-4004',
    });
    expect(truncatedSecret.record).toBeUndefined();
  });

  it('rejects invalid record budgets before starting a provider effect', async () => {
    const program = createProgram();
    const registry = createBehaviorRuntimeCapabilityRegistry([]);
    if (!registry.ok) return;
    const reset = vi.fn();

    await expect(
      executeBehaviorReplayAttempt({
        attemptId: 'invalid-budget-attempt',
        program,
        plan: createPlan(program),
        provider: createProvider({ reset }),
        registry: registry.registry,
        toolchainDigest: TOOLCHAIN_DIGEST,
        recordBudget: { maximumEvents: Number.NaN },
      })
    ).rejects.toThrow('positive safe integer');
    expect(reset).not.toHaveBeenCalled();
  });

  it('pauses, steps, and requests a fresh replay without time travel', async () => {
    const program = createProgram();
    const registry = createBehaviorRuntimeCapabilityRegistry([]);
    if (!registry.ok) return;
    const debug = createBehaviorReplayDebugController({
      attemptId: 'debug-attempt',
      programDigest: program.programDigest,
      leaseId: 'debug-lease',
      stepIds: ['step-1'],
      startPaused: true,
    });
    const running = executeBehaviorReplayAttempt({
      attemptId: 'debug-attempt',
      program,
      plan: createPlan(program),
      provider: createProvider(),
      registry: registry.registry,
      toolchainDigest: TOOLCHAIN_DIGEST,
      debugger: debug,
    });
    await vi.waitFor(() => {
      expect(debug.snapshot()).toMatchObject({
        status: 'paused',
        current: { stepId: 'step-1' },
      });
    });

    const stepped = debug.command(
      createBehaviorReplayDebugCommand(debug.snapshot(), 'step')
    );
    expect(stepped.accepted).toBe(true);
    expect((await running).status).toBe('completed');
    expect(debug.snapshot().status).toBe('completed');

    const freshReplay = debug.command(
      createBehaviorReplayDebugCommand(debug.snapshot(), 'fresh-replay')
    );
    expect(freshReplay).toMatchObject({
      accepted: true,
      action: 'fresh-replay',
    });
  });

  it('fences stale debugger runtime boundaries and invalid budgets', async () => {
    const debug = createBehaviorReplayDebugController({
      attemptId: 'current-attempt',
      programDigest: DIGEST,
      leaseId: 'debug-lease',
      stepIds: ['step-1'],
    });
    await expect(
      debug.beforeInstruction({
        attemptId: 'stale-attempt',
        instructionId: 'instruction-1',
        stepId: 'step-1',
        source: {
          workspaceDocumentId: 'scenario-document',
          path: '/steps/0',
        },
      })
    ).resolves.toBe('cancel');
    expect(() =>
      createBehaviorReplayDebugController({
        attemptId: 'attempt',
        programDigest: DIGEST,
        leaseId: 'lease',
        stepIds: ['step-1'],
        maximumEvents: Number.NaN,
      })
    ).toThrow('positive safe integer');
    expect(() =>
      createBehaviorReplayDebugController({
        attemptId: 'attempt',
        programDigest: DIGEST,
        leaseId: 'lease',
        stepIds: ['step-1', 'step-1'],
      })
    ).toThrow('unique and bounded');

    const leased = createBehaviorReplayDebugController({
      attemptId: 'leased-attempt',
      programDigest: DIGEST,
      leaseId: 'leased-debug',
      stepIds: ['step-1'],
      startPaused: true,
      maximumCommands: 1,
    });
    expect(
      leased.command(
        createBehaviorReplayDebugCommand(
          leased.snapshot(),
          'set-breakpoints',
          []
        )
      ).accepted
    ).toBe(true);
    expect(
      leased.command(
        createBehaviorReplayDebugCommand(leased.snapshot(), 'continue')
      )
    ).toMatchObject({
      accepted: false,
      issue: { code: 'lease-expired' },
    });
  });
});
