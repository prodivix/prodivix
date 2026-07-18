import { createServer, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { BinaryAssetScannerUnavailableError } from '@prodivix/assets';
import { initializeClamAvDaemonRuntime } from './clamAvDaemonReadiness';

const servers: ReturnType<typeof createServer>[] = [];
const sockets = new Set<Socket>();

afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve()))
      )
  );
});

const startDaemon = async (initial?: {
  databaseVersion?: number;
  databaseTimestamp?: string;
  commands?: string;
  ping?: string;
}) => {
  const state = {
    databaseVersion: initial?.databaseVersion ?? 30_001,
    databaseTimestamp: initial?.databaseTimestamp ?? 'Sat Jul 18 09:00:00 2026',
    commands: initial?.commands ?? 'INSTREAM PING VERSION VERSIONCOMMANDS',
    ping: initial?.ping ?? 'PONG',
  };
  const requests: string[] = [];
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    let pending = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      const terminator = pending.indexOf(0);
      if (terminator < 0) return;
      if (terminator !== pending.byteLength - 1) {
        socket.destroy();
        return;
      }
      const command = pending.subarray(0, terminator).toString('ascii');
      requests.push(command);
      if (command === 'zPING') {
        socket.end(Buffer.from(`${state.ping}\0`, 'utf8'));
        return;
      }
      if (command === 'zVERSIONCOMMANDS') {
        socket.end(
          Buffer.from(
            `ClamAV 1.4.3/${state.databaseVersion}/${state.databaseTimestamp}| COMMANDS: ${state.commands}\0`,
            'utf8'
          )
        );
        return;
      }
      socket.end(Buffer.from('UNKNOWN COMMAND\0', 'utf8'));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Test daemon did not allocate a TCP port.');
  }
  return { port: address.port, requests, state };
};

const runtimeOptions = (
  port: number,
  now: () => number,
  overrides?: { maximumDatabaseAgeMs?: number; readinessCacheMs?: number }
) => ({
  host: '127.0.0.1',
  port,
  timeoutMs: 1_000,
  maximumResponseBytes: 4 * 1024,
  maximumDatabaseAgeMs: overrides?.maximumDatabaseAgeMs ?? 24 * 60 * 60 * 1_000,
  maximumFutureSkewMs: 5 * 60 * 1_000,
  readinessCacheMs: overrides?.readinessCacheMs ?? 30_000,
  basePolicyVersion: 'delivery-policy-1',
  now,
});

describe('ClamAV daemon readiness', () => {
  it('locks fresh daemon metadata into the effective scanner policy version', async () => {
    const daemon = await startDaemon();
    const now = Date.UTC(2026, 6, 18, 10, 0, 0);
    const runtime = await initializeClamAvDaemonRuntime(
      runtimeOptions(daemon.port, () => now)
    );

    expect(runtime.metadata).toMatchObject({
      engineVersion: '1.4.3',
      databaseVersion: 30_001,
      databaseTimestampMs: Date.UTC(2026, 6, 18, 9, 0, 0),
      checkedAtMs: now,
    });
    expect(runtime.metadata.policyDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
    expect(runtime.scannerPolicyVersion).toMatch(/^clamav-[a-f0-9]{32}$/u);
    await expect(runtime.readiness.assertReady()).resolves.toBe(
      runtime.metadata
    );
    expect(daemon.requests.sort()).toEqual(['zPING', 'zVERSIONCOMMANDS']);
  });

  it('fails closed when the loaded database identity changes after bootstrap', async () => {
    const daemon = await startDaemon();
    let now = Date.UTC(2026, 6, 18, 10, 0, 0);
    const runtime = await initializeClamAvDaemonRuntime(
      runtimeOptions(daemon.port, () => now, { readinessCacheMs: 1_000 })
    );
    daemon.state.databaseVersion += 1;
    now += 2_000;

    await expect(runtime.readiness.assertReady()).rejects.toMatchObject({
      name: BinaryAssetScannerUnavailableError.name,
      reason: 'policy-drift',
    });
  });

  it('deduplicates concurrent uncached readiness checks', async () => {
    const daemon = await startDaemon();
    const now = Date.UTC(2026, 6, 18, 10, 0, 0);
    const runtime = await initializeClamAvDaemonRuntime(
      runtimeOptions(daemon.port, () => now, { readinessCacheMs: 0 })
    );

    await Promise.all([
      runtime.readiness.assertReady(),
      runtime.readiness.assertReady(),
      runtime.readiness.assertReady(),
    ]);
    expect(daemon.requests).toHaveLength(4);
  });

  it('rejects stale databases and malformed capability metadata', async () => {
    const stale = await startDaemon({
      databaseTimestamp: 'Sat Jul 11 09:00:00 2026',
    });
    const now = Date.UTC(2026, 6, 18, 10, 0, 0);
    await expect(
      initializeClamAvDaemonRuntime(runtimeOptions(stale.port, () => now))
    ).rejects.toMatchObject({
      name: BinaryAssetScannerUnavailableError.name,
      reason: 'stale-database',
    });

    const incomplete = await startDaemon({
      commands: 'PING VERSION VERSIONCOMMANDS',
    });
    await expect(
      initializeClamAvDaemonRuntime(runtimeOptions(incomplete.port, () => now))
    ).rejects.toMatchObject({
      name: BinaryAssetScannerUnavailableError.name,
      reason: 'protocol',
    });

    const invalidDate = await startDaemon({
      databaseTimestamp: 'Fri Jul 18 09:00:00 2026',
    });
    await expect(
      initializeClamAvDaemonRuntime(runtimeOptions(invalidDate.port, () => now))
    ).rejects.toMatchObject({
      name: BinaryAssetScannerUnavailableError.name,
      reason: 'protocol',
    });
  });
});
