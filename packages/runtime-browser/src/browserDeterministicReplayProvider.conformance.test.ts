import { describe, expect, it } from 'vitest';
import {
  createDeterministicRuntimeControlPlan,
  type DeterministicRuntimeControlPlan,
} from '@prodivix/runtime-core';
import {
  EMPTY_BROWSER_RUNTIME_RESIDUAL,
  createBrowserDeterministicReplayProvider,
  type BrowserDeterministicControlHost,
} from './browserDeterministicReplayProvider';

const DIGEST = `sha256-${'a'.repeat(64)}`;
const IMPLEMENTATION_DIGEST = `sha256-${'b'.repeat(64)}`;

const createPlan = (): DeterministicRuntimeControlPlan =>
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
      id: 'browser',
      frameworkTarget: 'react-vite',
      surface: 'browser',
      browserEngine: 'chromium',
      viewport: { width: 1280, height: 720 },
      colorScheme: 'light',
      motion: 'full',
      locale: 'en-US',
    },
  });

describe('browser deterministic replay provider', () => {
  it('applies every control through a fresh host lifecycle', async () => {
    const calls: string[] = [];
    const host: BrowserDeterministicControlHost = {
      reset: ({ namespace }) => {
        calls.push(`reset:${namespace}`);
      },
      apply: ({ plan, expectedControlDigest }) => {
        calls.push(`apply:${plan.cell.id}`);
        return {
          appliedControlDigest: expectedControlDigest,
          fontReady: true,
        };
      },
      probe: ({ phase }) => {
        calls.push(`probe:${phase}`);
        return EMPTY_BROWSER_RUNTIME_RESIDUAL;
      },
      cleanup: ({ namespace }) => {
        calls.push(`cleanup:${namespace}`);
      },
    };
    const provider = createBrowserDeterministicReplayProvider({
      implementationDigest: IMPLEMENTATION_DIGEST,
      host,
    });
    const started = await provider.startAttempt({
      attemptId: 'attempt',
      plan: createPlan(),
    });
    expect(started.status).toBe('ready');
    if (started.status !== 'ready') return;
    expect(started.session.applied.cellId).toBe('browser');
    expect((await started.session.cleanup()).clean).toBe(true);
    expect(calls).toEqual([
      'reset:prodivix.browser.deterministic-replay:attempt',
      'probe:after-reset',
      'apply:browser',
      'cleanup:prodivix.browser.deterministic-replay:attempt',
      'probe:after-cleanup',
    ]);
  });

  it('rejects a browser host that only partially controls virtual time', async () => {
    const provider = createBrowserDeterministicReplayProvider({
      implementationDigest: IMPLEMENTATION_DIGEST,
      host: {
        reset: () => undefined,
        apply: ({ expectedControlDigest }) => ({
          appliedControlDigest: expectedControlDigest,
          fontReady: true,
        }),
        probe: () => EMPTY_BROWSER_RUNTIME_RESIDUAL,
        cleanup: () => undefined,
      },
      partiallyControlled: ['logical-clock'],
    });
    expect(
      await provider.startAttempt({
        attemptId: 'attempt',
        plan: createPlan(),
      })
    ).toMatchObject({
      status: 'blocked',
      code: 'control-preflight-failed',
      issues: [
        {
          controlId: 'logical-clock',
          status: 'partially-controlled',
        },
      ],
    });
  });

  it('rejects and cleans up a browser host that applies a different control digest', async () => {
    let cleaned = false;
    const provider = createBrowserDeterministicReplayProvider({
      implementationDigest: IMPLEMENTATION_DIGEST,
      host: {
        reset: () => undefined,
        apply: () => ({
          appliedControlDigest: DIGEST,
          fontReady: true,
        }),
        probe: () => EMPTY_BROWSER_RUNTIME_RESIDUAL,
        cleanup: () => {
          cleaned = true;
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
      code: 'control-application-mismatch',
    });
    expect(cleaned).toBe(true);
  });
});
