import { describe, expect, it } from 'vitest';
import {
  EMPTY_BROWSER_RUNTIME_RESIDUAL,
  createBrowserDeterministicReplayProvider,
} from '@prodivix/runtime-browser';
import { digestDeterministicRuntimeValue } from '@prodivix/runtime-core';
import {
  detectGoldenG3ReplayDrift,
  runGoldenG3DeterministicReplayMatrix,
  runGoldenG3ReplayAttempt,
} from './goldenG3DeterministicReplayFixture';

describe('Golden G3 V3 deterministic replay', () => {
  it('repeats Browser/Remote/Export/CI × React/Vue × full/reduced three times', async () => {
    const matrix = await runGoldenG3DeterministicReplayMatrix();

    expect(matrix.cells).toHaveLength(16);
    expect(
      new Set(
        matrix.cells.map(
          ({ surface, target, motion }) => `${surface}:${target}:${motion}`
        )
      ).size
    ).toBe(16);
    for (const cell of matrix.cells) {
      expect(cell.records).toHaveLength(3);
      expect(
        new Set(cell.records.map(({ semanticDigest }) => semanticDigest)).size
      ).toBe(1);
      expect(
        cell.records.every(
          ({ cleanup, truncatedEventCount, nonDeterminismFlags }) =>
            cleanup.status === 'clean' &&
            truncatedEventCount === 0 &&
            nonDeterminismFlags.length === 0
        )
      ).toBe(true);
      expect(
        cell.records[0]?.events.some(
          ({ stepId, kind }) =>
            stepId === 'catalog-conflict-retry' &&
            kind === 'instruction-completed'
        )
      ).toBe(true);
    }
    expect(matrix.semanticDigestByMotion.full).not.toBe(
      matrix.semanticDigestByMotion.reduced
    );
  }, 30_000);

  it.each([
    ['random', 'observation-divergence'],
    ['schedule', 'schedule-divergence'],
    ['network', 'effect-divergence'],
  ] as const)('finds the first %s drift', async (drift, expectedKind) => {
    const divergence = await detectGoldenG3ReplayDrift(drift);
    expect(divergence.kind).toBe(expectedKind);
    expect(divergence.eventIndex).toBeTypeOf('number');
    expect(divergence.reason).toBe(
      'The first normalized replay event differs.'
    );
  });

  it('does not produce a record for a provider with partial required control', async () => {
    const provider = createBrowserDeterministicReplayProvider({
      implementationDigest: digestDeterministicRuntimeValue({
        provider: 'partial-browser',
      }),
      partiallyControlled: ['logical-clock'],
      host: {
        reset: () => undefined,
        apply: ({ expectedControlDigest }) => ({
          appliedControlDigest: expectedControlDigest,
          fontReady: true,
        }),
        probe: () => EMPTY_BROWSER_RUNTIME_RESIDUAL,
        cleanup: () => undefined,
      },
    });
    const attempt = await runGoldenG3ReplayAttempt({
      surface: 'browser',
      target: 'react-vite',
      motion: 'full',
      attemptIndex: 0,
      provider,
    });
    expect(attempt).toMatchObject({
      status: 'blocked',
      code: 'BHV-4005',
    });
    expect(attempt.record).toBeUndefined();
  });
});
