import { createServer, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BinaryAssetScannerUnavailableError,
  createBinaryAssetBlobReference,
} from '@prodivix/assets';
import {
  CLAMAV_MALWARE_FINDING_CODE,
  createClamAvContentScanner,
} from './clamAvContentScanner';

const command = Buffer.from('zINSTREAM\0', 'ascii');
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

const readInstream = (
  socket: Socket
): Promise<Readonly<{ contents: Buffer; frameLengths: readonly number[] }>> =>
  new Promise((resolve, reject) => {
    let pending = Buffer.alloc(0);
    let commandRead = false;
    const chunks: Buffer[] = [];
    const frameLengths: number[] = [];
    const onData = (chunk: Buffer): void => {
      pending = Buffer.concat([pending, chunk]);
      if (!commandRead) {
        if (pending.byteLength < command.byteLength) return;
        if (!pending.subarray(0, command.byteLength).equals(command)) {
          reject(new Error('Unexpected command.'));
          return;
        }
        pending = pending.subarray(command.byteLength);
        commandRead = true;
      }
      while (pending.byteLength >= 4) {
        const byteLength = pending.readUInt32BE(0);
        if (byteLength === 0) {
          if (pending.byteLength !== 4) {
            reject(new Error('Unexpected trailing request bytes.'));
            return;
          }
          socket.off('data', onData);
          resolve({
            contents: Buffer.concat(chunks),
            frameLengths: Object.freeze(frameLengths),
          });
          return;
        }
        if (pending.byteLength < 4 + byteLength) return;
        chunks.push(Buffer.from(pending.subarray(4, 4 + byteLength)));
        frameLengths.push(byteLength);
        pending = pending.subarray(4 + byteLength);
      }
    };
    socket.on('data', onData);
    socket.once('error', reject);
  });

const startDaemon = async (
  respond: (
    socket: Socket,
    request: Awaited<ReturnType<typeof readInstream>>
  ) => void | Promise<void>
) => {
  const requests: Awaited<ReturnType<typeof readInstream>>[] = [];
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    void readInstream(socket)
      .then(async (request) => {
        requests.push(request);
        await respond(socket, request);
      })
      .catch(() => socket.destroy());
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Test daemon did not allocate a TCP port.');
  }
  return { port: address.port, requests };
};

const scannerFor = (port: number, overrides?: { timeoutMs?: number }) =>
  createClamAvContentScanner({
    host: '127.0.0.1',
    port,
    timeoutMs: overrides?.timeoutMs ?? 1_000,
    policyVersion: 'test-policy-1',
    supportedMediaTypes: ['application/pdf'],
    chunkBytes: 3,
    maximumResponseBytes: 64,
  });

const requestFor = (contents: Uint8Array) => ({
  reference: createBinaryAssetBlobReference({
    contents,
    mediaType: 'application/pdf',
  }),
  contents,
});

describe('ClamAV content scanner', () => {
  it('writes exact bounded INSTREAM frames and accepts only a clean response', async () => {
    const daemon = await startDaemon((socket) => {
      socket.end(Buffer.from('stream: OK\0', 'utf8'));
    });
    const contents = new TextEncoder().encode('1234567');

    await expect(
      scannerFor(daemon.port).scan(requestFor(contents))
    ).resolves.toEqual({ verdict: 'clean', findingCodes: [] });
    expect(daemon.requests).toHaveLength(1);
    expect(daemon.requests[0]?.contents).toEqual(Buffer.from(contents));
    expect(daemon.requests[0]?.frameLengths).toEqual([3, 3, 1]);
  });

  it('maps daemon signatures to one fixed quarantine finding', async () => {
    const daemon = await startDaemon((socket) => {
      socket.end(Buffer.from('stream: Private.Signature FOUND\0', 'utf8'));
    });

    await expect(
      scannerFor(daemon.port).scan(requestFor(new Uint8Array([1, 2, 3])))
    ).resolves.toEqual({
      verdict: 'quarantined',
      findingCodes: [CLAMAV_MALWARE_FINDING_CODE],
    });
  });

  it('fails closed on daemon errors, timeouts, and oversized responses', async () => {
    const daemonError = await startDaemon((socket) => {
      socket.end(Buffer.from('stream: internal failure ERROR\0', 'utf8'));
    });
    await expect(
      scannerFor(daemonError.port).scan(requestFor(new Uint8Array([1])))
    ).rejects.toMatchObject({
      name: BinaryAssetScannerUnavailableError.name,
      reason: 'daemon-error',
    });

    const oversized = await startDaemon((socket) => {
      socket.end(Buffer.alloc(65, 65));
    });
    await expect(
      scannerFor(oversized.port).scan(requestFor(new Uint8Array([2])))
    ).rejects.toMatchObject({
      name: BinaryAssetScannerUnavailableError.name,
      reason: 'protocol',
    });

    const timeout = await startDaemon(() => undefined);
    await expect(
      scannerFor(timeout.port, { timeoutMs: 25 }).scan(
        requestFor(new Uint8Array([3]))
      )
    ).rejects.toMatchObject({
      name: BinaryAssetScannerUnavailableError.name,
      reason: 'timeout',
    });
  });

  it('validates exact bytes before opening the scanner transport', async () => {
    const daemon = await startDaemon(() => undefined);
    const request = requestFor(new Uint8Array([1, 2, 3]));

    await expect(
      scannerFor(daemon.port).scan({
        ...request,
        contents: new Uint8Array([1, 2, 4]),
      })
    ).rejects.toThrow(/digest/u);
    expect(daemon.requests).toHaveLength(0);
  });
});
