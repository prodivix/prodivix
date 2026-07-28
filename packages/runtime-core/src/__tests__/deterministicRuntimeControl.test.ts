import { describe, expect, it } from 'vitest';
import {
  DETERMINISTIC_RUNTIME_CONTROL_IDS,
  createDeterministicRuntimeCapabilitySnapshot,
  createDeterministicRuntimeControlPlan,
  preflightDeterministicRuntimeControls,
  type DeterministicIsolationResidual,
  type DeterministicRuntimeControlDeclaration,
  type DeterministicRuntimeControlPlan,
} from '../deterministicRuntimeControl';
import { createDeterministicRuntimeProvider } from '../deterministicRuntimeProvider';

const DIGEST = `sha256-${'a'.repeat(64)}`;
const IMPLEMENTATION_DIGEST = `sha256-${'b'.repeat(64)}`;
const INPUT_DIGEST = `sha256-${'c'.repeat(64)}`;

const createPlan = (): DeterministicRuntimeControlPlan =>
  createDeterministicRuntimeControlPlan({
    profileId: 'profile.g3',
    profileDigest: DIGEST,
    fixtureSetDigests: [DIGEST],
    clock: {
      epoch: '2026-01-01T00:00:00.000Z',
      tickMs: 5,
      maximumVirtualDurationMs: 10_000,
    },
    timezone: 'UTC',
    random: { algorithm: 'xoshiro256ss', seed: 'random-seed' },
    identifiers: {
      seed: 'identifier-seed',
      namespaces: ['attempt', 'step', 'action', 'operation'],
    },
    scheduler: {
      seed: 'scheduler-seed',
      maximumTurns: 100,
      maximumConcurrency: 4,
    },
    network: {
      mode: 'fixture-only',
      undeclaredRequest: 'reject',
      fixtures: [
        {
          id: 'catalog-page',
          target: {
            kind: 'data-operation',
            resourceId: 'catalog.list',
          },
          inputDigest: INPUT_DIGEST,
          page: 'first',
          outcome: {
            kind: 'result',
            value: { items: ['Alpha', 'Beta'] },
            delayMs: 10,
          },
        },
      ],
    },
    storage: {
      bootstrapFixtureIds: ['auth-signed-in'],
      cleanup: 'required',
    },
    rendering: {
      devicePixelRatio: 1,
      animationClock: 'virtual',
      fontReadiness: 'required',
    },
    serviceWorker: { mode: 'disabled', cache: 'empty' },
    settle: {
      conditions: ['render-stable', 'declared-effects-complete', 'font-ready'],
      maximumFrames: 4,
    },
    budgets: {
      totalMs: 10_000,
      stepMs: 1_000,
      settleMs: 500,
      networkMs: 250,
      animationMs: 500,
    },
    cell: {
      id: 'react-preview-full',
      frameworkTarget: 'react-vite',
      surface: 'browser',
      browserEngine: 'chromium',
      viewport: { width: 1280, height: 720 },
      colorScheme: 'light',
      motion: 'full',
      locale: 'en-US',
    },
  });

const declarations = (
  override: Partial<
    Record<
      (typeof DETERMINISTIC_RUNTIME_CONTROL_IDS)[number],
      DeterministicRuntimeControlDeclaration['status']
    >
  > = {}
) =>
  DETERMINISTIC_RUNTIME_CONTROL_IDS.map((controlId) => ({
    controlId,
    status: override[controlId] ?? ('supported' as const),
    implementationDigest: IMPLEMENTATION_DIGEST,
  }));

const dirtyResidual = (): DeterministicIsolationResidual => ({
  storage: 1,
  cookies: 0,
  indexedDb: 0,
  cacheStorage: 0,
  serviceWorkers: 0,
  workers: 0,
  streams: 0,
  timers: 0,
  effects: 0,
  authSessions: 0,
});

describe('deterministic runtime controls', () => {
  it('produces a byte-stable digest and rejects tampering', () => {
    const first = createPlan();
    const second = createPlan();
    expect(first).toEqual(second);
    expect(first.controlDigest).toMatch(/^sha256-[a-f0-9]{64}$/);
    expect(
      createDeterministicRuntimeControlPlan({
        ...first,
        identifiers: {
          ...first.identifiers,
          namespaces: [...first.identifiers.namespaces].reverse(),
        },
        settle: {
          ...first.settle,
          conditions: [...first.settle.conditions].reverse(),
        },
      }).controlDigest
    ).toBe(first.controlDigest);

    const tampered = {
      ...first,
      timezone: 'Asia/Shanghai',
    };
    const snapshot = createDeterministicRuntimeCapabilitySnapshot({
      providerId: 'browser',
      providerVersion: '1',
      implementationDigest: IMPLEMENTATION_DIGEST,
      controls: declarations(),
    });
    expect(
      preflightDeterministicRuntimeControls(tampered, snapshot)
    ).toMatchObject({
      status: 'blocked',
      issues: [{ controlId: 'profile-digest', status: 'mismatch' }],
    });
  });

  it('fails required preflight on partial or undeclared controls', () => {
    const plan = createPlan();
    const partialSnapshot = createDeterministicRuntimeCapabilitySnapshot({
      providerId: 'partial-provider',
      providerVersion: '1',
      implementationDigest: IMPLEMENTATION_DIGEST,
      controls: declarations({ 'logical-clock': 'partially-controlled' }),
    });
    expect(
      preflightDeterministicRuntimeControls(plan, partialSnapshot)
    ).toMatchObject({
      status: 'blocked',
      issues: [
        {
          controlId: 'logical-clock',
          status: 'partially-controlled',
        },
      ],
    });

    const missingSnapshot = createDeterministicRuntimeCapabilitySnapshot({
      providerId: 'missing-provider',
      providerVersion: '1',
      implementationDigest: IMPLEMENTATION_DIGEST,
      controls: declarations().slice(1),
    });
    expect(
      preflightDeterministicRuntimeControls(plan, missingSnapshot)
    ).toMatchObject({
      status: 'blocked',
      issues: [{ controlId: 'logical-clock', status: 'unsupported' }],
    });
  });

  it('applies clock, scoped random, ids, fixtures, and cleanup consistently', async () => {
    const provider = createDeterministicRuntimeProvider({
      id: 'browser',
      version: '1',
      surface: 'browser',
      implementationDigest: IMPLEMENTATION_DIGEST,
    });
    const started = await provider.startAttempt({
      attemptId: 'attempt-1',
      plan: createPlan(),
    });
    expect(started.status).toBe('ready');
    if (started.status !== 'ready') return;

    const { session } = started;
    const repeated = await provider.startAttempt({
      attemptId: 'attempt-2',
      plan: createPlan(),
    });
    expect(repeated.status).toBe('ready');
    if (repeated.status !== 'ready') return;
    expect(session.clock.wallTime()).toBe('2026-01-01T00:00:00.000Z');
    const firstDataSample = session.random.stream('data').nextUint32();
    expect(firstDataSample).toBe(3_071_995_856);
    expect(firstDataSample).toBe(
      repeated.session.random.stream('data').nextUint32()
    );
    expect(session.random.stream('data').nextUint32()).toBe(467_497_508);
    expect(repeated.session.random.stream('data').nextUint32()).toBe(
      467_497_508
    );
    expect(session.random.stream('route').nextUint32()).toBe(
      repeated.session.random.stream('route').nextUint32()
    );
    expect(session.identifiers.next('step')).toMatch(/^step-[a-f0-9]{16}$/);

    const matched = await session.network.dispatch({
      kind: 'data-operation',
      resourceId: 'catalog.list',
      inputDigest: INPUT_DIGEST,
      page: 'first',
    });
    expect(matched).toEqual({
      status: 'matched',
      fixtureId: 'catalog-page',
      value: { items: ['Alpha', 'Beta'] },
    });
    expect(session.clock.now()).toBe(10);
    expect(session.scheduler.snapshot().logicalTime).toBe(10);
    session.scheduler.enqueue({
      id: 'clock-bound-task',
      lane: 'scenario',
      readyAt: 15,
      run: () => undefined,
    });
    await expect(session.scheduler.runNext()).resolves.toEqual({
      status: 'completed',
      taskId: 'clock-bound-task',
    });
    expect(session.clock.now()).toBe(15);
    expect(
      await session.network.dispatch({
        kind: 'data-operation',
        resourceId: 'catalog.unknown',
        inputDigest: INPUT_DIGEST,
      })
    ).toEqual({ status: 'blocked', reason: 'fixture-not-found' });
    expect(
      await session.network.dispatch({
        kind: 'live-egress',
        resourceId: 'external-origin',
        inputDigest: INPUT_DIGEST,
      })
    ).toEqual({ status: 'blocked', reason: 'live-egress-denied' });
    expect((await session.cleanup()).clean).toBe(true);
    expect((await repeated.session.cleanup()).clean).toBe(true);
  });

  it('blocks polluted reset, font failure, and applied digest drift', async () => {
    const plan = createPlan();
    const polluted = createDeterministicRuntimeProvider({
      id: 'polluted',
      version: '1',
      surface: 'browser',
      implementationDigest: IMPLEMENTATION_DIGEST,
      hooks: {
        probe: () => dirtyResidual(),
      },
    });
    expect(
      await polluted.startAttempt({ attemptId: 'attempt', plan })
    ).toMatchObject({
      status: 'blocked',
      code: 'isolation-canary-failed',
      canary: { clean: false, residual: { storage: 1 } },
    });

    const missingFont = createDeterministicRuntimeProvider({
      id: 'font-missing',
      version: '1',
      surface: 'browser',
      implementationDigest: IMPLEMENTATION_DIGEST,
      hooks: {
        apply: () => ({
          appliedControlDigest: plan.controlDigest,
          fontReady: false,
        }),
      },
    });
    expect(
      await missingFont.startAttempt({ attemptId: 'attempt', plan })
    ).toMatchObject({
      status: 'blocked',
      code: 'font-readiness-failed',
    });

    const drifted = createDeterministicRuntimeProvider({
      id: 'drifted',
      version: '1',
      surface: 'browser',
      implementationDigest: IMPLEMENTATION_DIGEST,
      hooks: {
        apply: () => ({
          appliedControlDigest: DIGEST,
          fontReady: true,
        }),
      },
    });
    expect(
      await drifted.startAttempt({ attemptId: 'attempt', plan })
    ).toMatchObject({
      status: 'blocked',
      code: 'control-application-mismatch',
    });
  });

  it('tears down a reset namespace when control application is blocked', async () => {
    const plan = createPlan();
    const lifecycle: string[] = [];
    const provider = createDeterministicRuntimeProvider({
      id: 'cleanup-on-block',
      version: '1',
      surface: 'browser',
      implementationDigest: IMPLEMENTATION_DIGEST,
      hooks: {
        reset: () => {
          lifecycle.push('reset');
        },
        probe: ({ phase }) => {
          lifecycle.push(`probe:${phase}`);
          return {
            ...dirtyResidual(),
            storage: 0,
          };
        },
        apply: () => ({
          appliedControlDigest: DIGEST,
          fontReady: true,
        }),
        cleanup: () => {
          lifecycle.push('cleanup');
        },
      },
    });

    await expect(
      provider.startAttempt({ attemptId: 'attempt', plan })
    ).resolves.toMatchObject({
      status: 'blocked',
      code: 'control-application-mismatch',
    });
    expect(lifecycle).toEqual([
      'reset',
      'probe:after-reset',
      'cleanup',
      'probe:after-cleanup',
    ]);
  });

  it('rejects ambiguous fixture matchers before any provider effect', () => {
    const base = createPlan();
    expect(() =>
      createDeterministicRuntimeControlPlan({
        ...base,
        network: {
          ...base.network,
          fixtures: [
            base.network.fixtures[0]!,
            {
              ...base.network.fixtures[0]!,
              id: 'same-matcher-different-id',
            },
          ],
        },
      })
    ).toThrow('matchers must be unambiguous');
  });

  it('rejects random algorithms that the provider cannot truthfully apply', () => {
    const plan = createPlan();
    expect(() =>
      createDeterministicRuntimeControlPlan({
        ...plan,
        random: { algorithm: 'unimplemented-prng', seed: 'random-seed' },
      })
    ).toThrow('Unsupported deterministic random algorithm');
  });

  it('rejects unknown control enum values before provider effects', () => {
    const plan = createPlan();
    expect(() =>
      createDeterministicRuntimeControlPlan({
        ...plan,
        cell: { ...plan.cell, motion: 'ambient' as never },
      })
    ).toThrow('Deterministic motion mode is unsupported');
    expect(() =>
      createDeterministicRuntimeCapabilitySnapshot({
        providerId: 'invalid-control-provider',
        providerVersion: '1',
        implementationDigest: IMPLEMENTATION_DIGEST,
        controls: [
          ...declarations(),
          {
            controlId: 'unknown-control' as never,
            status: 'supported',
            implementationDigest: IMPLEMENTATION_DIGEST,
          },
        ],
      })
    ).toThrow('Runtime control id is unsupported');
  });

  it('normalizes a tampered runtime plan to a blocked preflight', async () => {
    let resetCalls = 0;
    const provider = createDeterministicRuntimeProvider({
      id: 'strict-preflight-provider',
      version: '1',
      surface: 'browser',
      implementationDigest: IMPLEMENTATION_DIGEST,
      hooks: {
        reset: () => {
          resetCalls += 1;
        },
      },
    });
    const plan = createPlan();
    await expect(
      provider.startAttempt({
        attemptId: 'invalid-plan-attempt',
        plan: {
          ...plan,
          cell: { ...plan.cell, motion: 'ambient' as never },
        },
      })
    ).resolves.toMatchObject({
      status: 'blocked',
      code: 'control-preflight-failed',
      issues: [{ controlId: 'profile-digest', status: 'mismatch' }],
    });
    expect(resetCalls).toBe(0);
  });

  it('binds viewport, DPR, color, motion, locale, timezone, and font policy to the digest', () => {
    const plan = createPlan();
    const variants = [
      createDeterministicRuntimeControlPlan({
        ...plan,
        timezone: 'Asia/Shanghai',
      }),
      createDeterministicRuntimeControlPlan({
        ...plan,
        rendering: { ...plan.rendering, devicePixelRatio: 2 },
      }),
      createDeterministicRuntimeControlPlan({
        ...plan,
        cell: {
          ...plan.cell,
          viewport: { width: 390, height: 844 },
        },
      }),
      createDeterministicRuntimeControlPlan({
        ...plan,
        cell: { ...plan.cell, colorScheme: 'dark' },
      }),
      createDeterministicRuntimeControlPlan({
        ...plan,
        cell: { ...plan.cell, motion: 'reduced' },
      }),
      createDeterministicRuntimeControlPlan({
        ...plan,
        cell: { ...plan.cell, locale: 'zh-CN' },
      }),
      createDeterministicRuntimeControlPlan({
        ...plan,
        rendering: { ...plan.rendering, fontReadiness: 'bounded' },
      }),
    ];
    expect(
      new Set(variants.map(({ controlDigest }) => controlDigest)).size
    ).toBe(variants.length);
    expect(
      variants.every(
        ({ controlDigest }) => controlDigest !== plan.controlDigest
      )
    ).toBe(true);
  });

  it('matches page/stream fixtures and applies timeout and retry-after faults', async () => {
    const base = createPlan();
    const plan = createDeterministicRuntimeControlPlan({
      ...base,
      network: {
        mode: 'fixture-only',
        undeclaredRequest: 'reject',
        fixtures: [
          {
            id: 'stream-page',
            target: {
              kind: 'data-operation',
              resourceId: 'catalog.stream',
            },
            inputDigest: INPUT_DIGEST,
            page: 'cursor-2',
            outcome: {
              kind: 'result',
              value: { frames: ['first', 'second', 'third'] },
            },
          },
          {
            id: 'retry',
            target: {
              kind: 'data-operation',
              resourceId: 'catalog.retry',
            },
            inputDigest: INPUT_DIGEST,
            outcome: {
              kind: 'fault',
              fault: 'retry-after',
              retryAfterMs: 50,
            },
          },
          {
            id: 'slow',
            target: {
              kind: 'data-operation',
              resourceId: 'catalog.slow',
            },
            inputDigest: INPUT_DIGEST,
            outcome: {
              kind: 'result',
              value: null,
              delayMs: base.budgets.networkMs + 1,
            },
          },
        ],
      },
    });
    const provider = createDeterministicRuntimeProvider({
      id: 'network-provider',
      version: '1',
      surface: 'browser',
      implementationDigest: IMPLEMENTATION_DIGEST,
    });
    const started = await provider.startAttempt({
      attemptId: 'network-attempt',
      plan,
    });
    expect(started.status).toBe('ready');
    if (started.status !== 'ready') return;
    expect(
      await started.session.network.dispatch({
        kind: 'data-operation',
        resourceId: 'catalog.stream',
        inputDigest: INPUT_DIGEST,
        page: 'cursor-2',
      })
    ).toEqual({
      status: 'matched',
      fixtureId: 'stream-page',
      value: { frames: ['first', 'second', 'third'] },
    });
    expect(
      await started.session.network.dispatch({
        kind: 'data-operation',
        resourceId: 'catalog.retry',
        inputDigest: INPUT_DIGEST,
      })
    ).toEqual({
      status: 'fault',
      fixtureId: 'retry',
      fault: 'retry-after',
      retryAfterMs: 50,
    });
    expect(
      await started.session.network.dispatch({
        kind: 'data-operation',
        resourceId: 'catalog.slow',
        inputDigest: INPUT_DIGEST,
      })
    ).toEqual({
      status: 'fault',
      fixtureId: 'slow',
      fault: 'timeout',
    });
  });
});
