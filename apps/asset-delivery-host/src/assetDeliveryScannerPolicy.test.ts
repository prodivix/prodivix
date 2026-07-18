import { createServer, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createBinaryAssetBlobReference } from '@prodivix/assets';
import {
  ASSET_DELIVERY_BINARY_SCANNER_POLICY_ID,
  ASSET_DELIVERY_JPEG_SCANNER_POLICY_ID,
  ASSET_DELIVERY_PNG_SCANNER_POLICY_ID,
  ASSET_DELIVERY_SCANNED_MEDIA_TYPES,
  createAssetDeliveryScannerPolicy,
} from './assetDeliveryScannerPolicy';

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

const startScanDaemon = async (response: string) => {
  let requests = 0;
  const command = Buffer.from('zINSTREAM\0', 'ascii');
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    let pending = Buffer.alloc(0);
    let commandRead = false;
    socket.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      if (!commandRead) {
        if (pending.byteLength < command.byteLength) return;
        if (!pending.subarray(0, command.byteLength).equals(command)) {
          socket.destroy();
          return;
        }
        pending = pending.subarray(command.byteLength);
        commandRead = true;
      }
      while (pending.byteLength >= 4) {
        const byteLength = pending.readUInt32BE(0);
        if (byteLength === 0) {
          requests += 1;
          socket.end(Buffer.from(`${response}\0`, 'utf8'));
          return;
        }
        if (pending.byteLength < 4 + byteLength) return;
        pending = pending.subarray(4 + byteLength);
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Test scanner did not allocate a TCP port.');
  }
  return {
    port: address.port,
    requestCount: () => requests,
  };
};

describe('asset delivery scanner policy', () => {
  it('assigns every allowlisted media type to exactly one top-level scanner', () => {
    const scanners = createAssetDeliveryScannerPolicy({
      malwareEngines: [
        {
          id: 'clamav-primary',
          replicas: [
            { id: 'a', host: '127.0.0.1', port: 3310 },
            { id: 'b', host: '127.0.0.2', port: 3310 },
          ],
        },
        {
          id: 'clamav-secondary',
          replicas: [{ id: 'a', host: '127.0.0.3', port: 3310 }],
        },
      ],
      clamAvTimeoutMs: 1_000,
      policyVersion: 'policy-2026.07.18',
    });

    for (const mediaType of ASSET_DELIVERY_SCANNED_MEDIA_TYPES) {
      expect(
        scanners.filter((scanner) =>
          scanner.descriptor.supportedMediaTypes.includes(mediaType)
        )
      ).toHaveLength(1);
    }
    expect(scanners).toHaveLength(3);
    expect(scanners[0]?.descriptor).toEqual({
      id: ASSET_DELIVERY_PNG_SCANNER_POLICY_ID,
      version: 'policy-2026.07.18',
      supportedMediaTypes: ['image/png'],
    });
    expect(scanners[1]?.descriptor).toEqual({
      id: ASSET_DELIVERY_JPEG_SCANNER_POLICY_ID,
      version: 'policy-2026.07.18',
      supportedMediaTypes: ['image/jpeg'],
    });
    expect(scanners[2]?.descriptor.id).toBe(
      ASSET_DELIVERY_BINARY_SCANNER_POLICY_ID
    );
    expect(scanners[2]?.descriptor.version).toBe('policy-2026.07.18');
    expect(scanners[2]?.descriptor.supportedMediaTypes).not.toContain(
      'image/png'
    );
    expect(scanners[2]?.descriptor.supportedMediaTypes).not.toContain(
      'image/jpeg'
    );
  });

  it('requires every malware engine and preserves any quarantine verdict', async () => {
    const clean = await startScanDaemon('stream: OK');
    const quarantine = await startScanDaemon(
      'stream: Test.Private.Signature FOUND'
    );
    const scanners = createAssetDeliveryScannerPolicy({
      malwareEngines: [
        {
          id: 'engine-clean',
          replicas: [{ id: 'primary', host: '127.0.0.1', port: clean.port }],
        },
        {
          id: 'engine-quarantine',
          replicas: [
            { id: 'primary', host: '127.0.0.1', port: quarantine.port },
          ],
        },
      ],
      clamAvTimeoutMs: 1_000,
      clamAvChunkBytes: 3,
      clamAvMaximumResponseBytes: 128,
      policyVersion: 'policy-2026.07.18',
    });
    const contents = new TextEncoder().encode('%PDF-1.7');
    const reference = createBinaryAssetBlobReference({
      contents,
      mediaType: 'application/pdf',
    });
    const binaryPolicy = scanners[2];
    if (!binaryPolicy) throw new Error('Missing binary policy.');

    await expect(binaryPolicy.scan({ reference, contents })).resolves.toEqual({
      verdict: 'quarantined',
      findingCodes: ['AST-SCAN-MALWARE-DETECTED'],
    });
    expect(clean.requestCount()).toBe(1);
    expect(quarantine.requestCount()).toBe(1);
  });
});
