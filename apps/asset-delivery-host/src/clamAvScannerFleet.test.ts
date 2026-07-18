import { describe, expect, it, vi } from 'vitest';
import { BinaryAssetScannerUnavailableError } from '@prodivix/assets';
import type {
  ClamAvDaemonMetadata,
  InitializeClamAvDaemonRuntimeOptions,
} from './clamAvDaemonReadiness';
import {
  initializeClamAvScannerFleetRuntime,
  readClamAvScannerEngineConfiguration,
} from './clamAvScannerFleet';

const NOW = Date.UTC(2026, 6, 18, 10, 0, 0);
const digest = (value: string): string => `sha256-${value.repeat(64)}`;

const metadata = (
  policyDigest: string,
  databaseVersion: number,
  databaseTimestampMs: number
): Omit<ClamAvDaemonMetadata, 'checkedAtMs'> =>
  Object.freeze({
    engineVersion: '1.4.3',
    databaseVersion,
    databaseTimestampMs,
    policyDigest,
  });

const engines = Object.freeze([
  Object.freeze({
    id: 'engine-a',
    replicas: Object.freeze([
      Object.freeze({ id: 'primary', host: 'a-primary', port: 3310 }),
      Object.freeze({ id: 'secondary', host: 'a-secondary', port: 3310 }),
    ]),
  }),
  Object.freeze({
    id: 'engine-b',
    replicas: Object.freeze([
      Object.freeze({ id: 'primary', host: 'b-primary', port: 3310 }),
      Object.freeze({ id: 'secondary', host: 'b-secondary', port: 3310 }),
    ]),
  }),
]);

const createProbe = (
  states: Map<string, Omit<ClamAvDaemonMetadata, 'checkedAtMs'> | Error>,
  now: () => number
) => {
  let active = 0;
  let maximumConcurrency = 0;
  const probe = vi.fn(async (options: InitializeClamAvDaemonRuntimeOptions) => {
    active += 1;
    maximumConcurrency = Math.max(maximumConcurrency, active);
    await Promise.resolve();
    try {
      const state = states.get(options.host);
      if (!state) throw new Error('Missing test probe state.');
      if (state instanceof Error) throw state;
      return Object.freeze({ ...state, checkedAtMs: now() });
    } finally {
      active -= 1;
    }
  });
  return Object.assign(probe, {
    maximumConcurrency: () => maximumConcurrency,
  });
};

const runtimeOptions = (
  probe: ReturnType<typeof createProbe>,
  now: () => number
) => ({
  engines,
  timeoutMs: 1_000,
  maximumResponseBytes: 4 * 1024,
  maximumDatabaseAgeMs: 24 * 60 * 60 * 1_000,
  maximumFutureSkewMs: 5 * 60 * 1_000,
  readinessCacheMs: 1_000,
  basePolicyVersion: 'delivery-policy-1',
  chunkBytes: 64 * 1024,
  probe,
  now,
});

describe('ClamAV scanner fleet runtime', () => {
  it('uses deterministic replica availability and publishes fresh policies atomically', async () => {
    let now = NOW;
    const states = new Map<
      string,
      Omit<ClamAvDaemonMetadata, 'checkedAtMs'> | Error
    >([
      ['a-primary', new BinaryAssetScannerUnavailableError('connection')],
      ['a-secondary', metadata(digest('a'), 30_001, NOW - 60 * 60 * 1_000)],
      ['b-primary', metadata(digest('b'), 40_001, NOW - 30 * 60 * 1_000)],
      ['b-secondary', metadata(digest('b'), 40_001, NOW - 30 * 60 * 1_000)],
    ]);
    const probe = createProbe(states, () => now);
    const runtime = await initializeClamAvScannerFleetRuntime(
      runtimeOptions(probe, () => now)
    );
    const first = await runtime.acquire();

    expect(first.generation).toBe(1);
    expect(first.policyVersion).toMatch(/^clamav-fleet-[a-f0-9]{32}$/u);
    expect(first.scanners.map((scanner) => scanner.descriptor.version)).toEqual(
      [first.policyVersion, first.policyVersion, first.policyVersion]
    );
    expect(runtime.inspect()).toMatchObject({
      generation: 1,
      engines: [
        { id: 'engine-a', policyDigest: digest('a'), availableReplicas: 1 },
        { id: 'engine-b', policyDigest: digest('b'), availableReplicas: 2 },
      ],
    });
    expect(probe).toHaveBeenCalledTimes(4);
    expect(probe.maximumConcurrency()).toBe(4);

    now += 2_000;
    states.set(
      'a-primary',
      metadata(digest('c'), 30_002, NOW - 20 * 60 * 1_000)
    );
    states.set(
      'a-secondary',
      metadata(digest('c'), 30_002, NOW - 20 * 60 * 1_000)
    );
    const second = await runtime.acquire();
    expect(second.generation).toBe(2);
    expect(second.policyVersion).not.toBe(first.policyVersion);
    expect(runtime.inspect()).toMatchObject({
      generation: 2,
      engines: [
        { id: 'engine-a', policyDigest: digest('c'), availableReplicas: 2 },
        { id: 'engine-b', policyDigest: digest('b'), availableReplicas: 2 },
      ],
    });

    now += 2_000;
    states.set('b-primary', new BinaryAssetScannerUnavailableError('timeout'));
    states.set(
      'b-secondary',
      new BinaryAssetScannerUnavailableError('connection')
    );
    await expect(runtime.acquire()).rejects.toMatchObject({
      name: BinaryAssetScannerUnavailableError.name,
      reason: 'replicas-exhausted',
    });
    expect(runtime.inspect().generation).toBe(2);
  });

  it('rejects downgrade and divergent frontier cohorts without replacing the last good snapshot', async () => {
    let now = NOW;
    const currentA = metadata(digest('d'), 30_010, NOW - 10 * 60 * 1_000);
    const currentB = metadata(digest('e'), 40_010, NOW - 10 * 60 * 1_000);
    const states = new Map<
      string,
      Omit<ClamAvDaemonMetadata, 'checkedAtMs'> | Error
    >([
      ['a-primary', currentA],
      ['a-secondary', currentA],
      ['b-primary', currentB],
      ['b-secondary', currentB],
    ]);
    const probe = createProbe(states, () => now);
    const runtime = await initializeClamAvScannerFleetRuntime(
      runtimeOptions(probe, () => now)
    );
    const stable = runtime.inspect();

    now += 2_000;
    const oldA = metadata(digest('a'), 30_009, NOW - 20 * 60 * 1_000);
    states.set('a-primary', oldA);
    states.set('a-secondary', oldA);
    await expect(runtime.acquire()).rejects.toMatchObject({
      reason: 'policy-drift',
    });
    expect(runtime.inspect()).toEqual(stable);

    now += 2_000;
    states.set('a-primary', currentA);
    states.set(
      'a-secondary',
      metadata(
        digest('f'),
        currentA.databaseVersion,
        currentA.databaseTimestampMs
      )
    );
    await expect(runtime.acquire()).rejects.toMatchObject({
      reason: 'policy-drift',
    });
    expect(runtime.inspect()).toEqual(stable);
  });

  it('requires every configured engine and strictly decodes bounded JSON topology', async () => {
    const unavailable = new Map<
      string,
      Omit<ClamAvDaemonMetadata, 'checkedAtMs'> | Error
    >(
      engines.flatMap((engine) =>
        engine.replicas.map(
          (replica) =>
            [
              replica.host,
              new BinaryAssetScannerUnavailableError('connection'),
            ] as const
        )
      )
    );
    await expect(
      initializeClamAvScannerFleetRuntime(
        runtimeOptions(
          createProbe(unavailable, () => NOW),
          () => NOW
        )
      )
    ).rejects.toMatchObject({ reason: 'replicas-exhausted' });

    expect(
      readClamAvScannerEngineConfiguration(undefined, {
        host: '127.0.0.1',
        port: 3310,
      })
    ).toEqual([
      {
        id: 'clamav',
        replicas: [{ id: 'primary', host: '127.0.0.1', port: 3310 }],
      },
    ]);
    expect(() =>
      readClamAvScannerEngineConfiguration(
        JSON.stringify([
          {
            id: 'engine-a',
            replicas: [
              { id: 'primary', host: 'clamav-a', port: 3310, token: 'no' },
            ],
          },
        ]),
        { host: '127.0.0.1', port: 3310 }
      )
    ).toThrow(/configuration/u);
  });
});
