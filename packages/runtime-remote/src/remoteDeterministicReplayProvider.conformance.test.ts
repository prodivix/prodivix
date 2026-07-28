import { describe, expect, it } from 'vitest';
import {
  DETERMINISTIC_RUNTIME_CONTROL_IDS,
  createDeterministicRuntimeControlPlan,
  type DeterministicIsolationResidual,
} from '@prodivix/runtime-core';
import { createRemoteDeterministicReplayProvider } from './remoteDeterministicReplayProvider';

const DIGEST = `sha256-${'a'.repeat(64)}`;
const IMPLEMENTATION_DIGEST = `sha256-${'b'.repeat(64)}`;

const cleanResidual = (): DeterministicIsolationResidual => ({
  storage: 0,
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

const createPlan = () =>
  createDeterministicRuntimeControlPlan({
    profileId: 'profile',
    profileDigest: DIGEST,
    fixtureSetDigests: [],
    clock: {
      epoch: '2026-01-01T00:00:00.000Z',
      tickMs: 1,
      maximumVirtualDurationMs: 10_000,
    },
    timezone: 'UTC',
    random: { algorithm: 'xoshiro256ss', seed: 'random' },
    identifiers: {
      seed: 'ids',
      namespaces: ['attempt', 'step', 'action', 'operation'],
    },
    scheduler: {
      seed: 'scheduler',
      maximumTurns: 100,
      maximumConcurrency: 4,
    },
    network: {
      mode: 'fixture-only',
      undeclaredRequest: 'reject',
      fixtures: [],
    },
    storage: { bootstrapFixtureIds: [], cleanup: 'required' },
    rendering: {
      devicePixelRatio: 1,
      animationClock: 'virtual',
      fontReadiness: 'required',
    },
    serviceWorker: { mode: 'disabled', cache: 'empty' },
    settle: {
      conditions: ['render-stable', 'font-ready'],
      maximumFrames: 4,
    },
    budgets: {
      totalMs: 10_000,
      stepMs: 1_000,
      settleMs: 500,
      networkMs: 500,
      animationMs: 500,
    },
    cell: {
      id: 'remote',
      frameworkTarget: 'react-vite',
      surface: 'remote',
      browserEngine: 'chromium',
      viewport: { width: 1280, height: 720 },
      colorScheme: 'light',
      motion: 'full',
      locale: 'en-US',
    },
  });

describe('remote deterministic replay provider', () => {
  it('recovers a worker loss only at the pre-effect reset boundary', async () => {
    const calls: string[] = [];
    let resets = 0;
    const provider = createRemoteDeterministicReplayProvider({
      implementationDigest: IMPLEMENTATION_DIGEST,
      maximumResetAttempts: 2,
      transport: {
        reset: () => {
          resets += 1;
          calls.push(`reset:${resets}`);
          if (resets === 1) throw new Error('worker lost');
        },
        apply: ({ expectedControlDigest }) => {
          calls.push('apply');
          return {
            appliedControlDigest: expectedControlDigest,
            fontReady: true,
          };
        },
        probe: ({ phase }) => {
          calls.push(`probe:${phase}`);
          return cleanResidual();
        },
        cleanup: () => {
          calls.push('cleanup');
        },
      },
    });

    const started = await provider.startAttempt({
      attemptId: 'attempt',
      plan: createPlan(),
    });
    expect(started.status).toBe('ready');
    if (started.status !== 'ready') return;
    expect((await started.session.cleanup()).clean).toBe(true);
    expect(calls).toEqual([
      'reset:1',
      'cleanup',
      'reset:2',
      'probe:after-reset',
      'apply',
      'cleanup',
      'probe:after-cleanup',
    ]);
  });

  it('fails closed when a remote worker cannot apply the exact digest', async () => {
    const provider = createRemoteDeterministicReplayProvider({
      implementationDigest: IMPLEMENTATION_DIGEST,
      transport: {
        reset: () => undefined,
        apply: () => ({
          appliedControlDigest: DIGEST,
          fontReady: true,
        }),
        probe: () => cleanResidual(),
        cleanup: () => undefined,
      },
    });
    expect(
      await provider.startAttempt({
        attemptId: 'attempt',
        plan: createPlan(),
      })
    ).toMatchObject({
      status: 'blocked',
      code: 'control-application-mismatch',
    });
  });

  it('does not trusted-pass an unsupported remote control', async () => {
    const provider = createRemoteDeterministicReplayProvider({
      implementationDigest: IMPLEMENTATION_DIGEST,
      controls: DETERMINISTIC_RUNTIME_CONTROL_IDS.map((controlId) => ({
        controlId,
        status:
          controlId === 'service-worker-isolation'
            ? 'unsupported'
            : 'supported',
        implementationDigest: IMPLEMENTATION_DIGEST,
      })),
      transport: {
        reset: () => undefined,
        apply: ({ expectedControlDigest }) => ({
          appliedControlDigest: expectedControlDigest,
          fontReady: true,
        }),
        probe: () => cleanResidual(),
        cleanup: () => undefined,
      },
    });
    expect(
      await provider.startAttempt({
        attemptId: 'attempt',
        plan: createPlan(),
      })
    ).toMatchObject({
      status: 'blocked',
      code: 'control-preflight-failed',
      issues: [{ controlId: 'service-worker-isolation' }],
    });
  });

  it('does not retry reset when the failed remote namespace cannot be cleaned', async () => {
    let resets = 0;
    const provider = createRemoteDeterministicReplayProvider({
      implementationDigest: IMPLEMENTATION_DIGEST,
      maximumResetAttempts: 3,
      transport: {
        reset: () => {
          resets += 1;
          throw new Error('worker lost');
        },
        apply: ({ expectedControlDigest }) => ({
          appliedControlDigest: expectedControlDigest,
          fontReady: true,
        }),
        probe: () => cleanResidual(),
        cleanup: () => {
          throw new Error('namespace cleanup failed');
        },
      },
    });

    await expect(
      provider.startAttempt({
        attemptId: 'attempt',
        plan: createPlan(),
      })
    ).resolves.toMatchObject({
      status: 'blocked',
      code: 'provider-control-failed',
    });
    expect(resets).toBe(1);
  });

  it.each([0, 4, Number.NaN])(
    'rejects an invalid reset recovery budget',
    (maximumResetAttempts) => {
      expect(() =>
        createRemoteDeterministicReplayProvider({
          implementationDigest: IMPLEMENTATION_DIGEST,
          maximumResetAttempts,
          transport: {
            reset: () => undefined,
            apply: ({ expectedControlDigest }) => ({
              appliedControlDigest: expectedControlDigest,
              fontReady: true,
            }),
            probe: () => cleanResidual(),
            cleanup: () => undefined,
          },
        })
      ).toThrow('one to three');
    }
  );
});
