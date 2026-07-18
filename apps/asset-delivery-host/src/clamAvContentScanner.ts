import { once } from 'node:events';
import { createConnection, type Socket } from 'node:net';
import {
  BinaryAssetScannerUnavailableError,
  createBinaryAssetMaterialization,
  normalizeBinaryAssetMediaType,
  readBinaryAssetContentScannerDescriptor,
  type BinaryAssetContentScanner,
  type BinaryAssetScanResult,
} from '@prodivix/assets';

export const CLAMAV_CONTENT_SCANNER_ID =
  'prodivix.scanner.clamav-instream' as const;
export const CLAMAV_MALWARE_FINDING_CODE = 'AST-SCAN-MALWARE-DETECTED' as const;

const INSTREAM_COMMAND = Buffer.from('zINSTREAM\0', 'ascii');
const EMPTY_FRAME = Buffer.alloc(4);

export type CreateClamAvContentScannerOptions = Readonly<{
  host: string;
  port: number;
  timeoutMs: number;
  policyVersion: string;
  supportedMediaTypes: readonly string[];
  chunkBytes?: number;
  maximumResponseBytes?: number;
}>;

const boundedInteger = (
  value: number,
  minimum: number,
  maximum: number,
  label: string
): number => {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`ClamAV ${label} is invalid.`);
  }
  return value;
};

const writeWithBackpressure = async (
  socket: Socket,
  contents: Uint8Array
): Promise<void> => {
  if (socket.destroyed) {
    throw new BinaryAssetScannerUnavailableError('connection');
  }
  if (!socket.write(contents)) {
    await once(socket, 'drain');
  }
};

const scanWithClamAv = (
  options: Readonly<{
    host: string;
    port: number;
    timeoutMs: number;
    chunkBytes: number;
    maximumResponseBytes: number;
  }>,
  contents: Uint8Array
): Promise<BinaryAssetScanResult> =>
  new Promise((resolve, reject) => {
    const socket = createConnection({ host: options.host, port: options.port });
    let settled = false;
    let response = Buffer.alloc(0);

    const finish = (result: BinaryAssetScanResult): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    const fail = (
      reason: ConstructorParameters<
        typeof BinaryAssetScannerUnavailableError
      >[0]
    ): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new BinaryAssetScannerUnavailableError(reason));
    };

    socket.setTimeout(options.timeoutMs);
    socket.once('timeout', () => fail('timeout'));
    socket.once('error', () => fail('connection'));
    socket.once('end', () => fail('protocol'));
    socket.once('close', () => fail('protocol'));
    socket.on('data', (chunk: Buffer) => {
      if (settled) return;
      if (
        chunk.byteLength >
        options.maximumResponseBytes - response.byteLength
      ) {
        fail('protocol');
        return;
      }
      response = Buffer.concat([response, chunk]);
      const terminator = response.indexOf(0);
      if (terminator < 0) return;
      if (terminator !== response.byteLength - 1) {
        fail('protocol');
        return;
      }
      let message: string;
      try {
        message = new TextDecoder('utf-8', { fatal: true }).decode(
          response.subarray(0, terminator)
        );
      } catch {
        fail('protocol');
        return;
      }
      if (message === 'stream: OK') {
        finish(
          Object.freeze({
            verdict: 'clean',
            findingCodes: Object.freeze([]),
          })
        );
        return;
      }
      if (/^stream: .+ FOUND$/u.test(message)) {
        finish(
          Object.freeze({
            verdict: 'quarantined',
            findingCodes: Object.freeze([CLAMAV_MALWARE_FINDING_CODE]),
          })
        );
        return;
      }
      fail(message.endsWith(' ERROR') ? 'daemon-error' : 'protocol');
    });
    socket.once('connect', () => {
      socket.setNoDelay(true);
      void (async () => {
        await writeWithBackpressure(socket, INSTREAM_COMMAND);
        for (
          let offset = 0;
          offset < contents.byteLength;
          offset += options.chunkBytes
        ) {
          const chunk = contents.subarray(
            offset,
            Math.min(offset + options.chunkBytes, contents.byteLength)
          );
          const header = Buffer.allocUnsafe(4);
          header.writeUInt32BE(chunk.byteLength);
          await writeWithBackpressure(socket, header);
          await writeWithBackpressure(socket, chunk);
        }
        await writeWithBackpressure(socket, EMPTY_FRAME);
      })().catch(() => fail('connection'));
    });
  });

/** Creates a bounded clamd INSTREAM adapter; raw daemon findings never cross this boundary. */
export const createClamAvContentScanner = (
  options: CreateClamAvContentScannerOptions
): BinaryAssetContentScanner => {
  const host = options.host.trim();
  if (!host || host.length > 253 || !/^[A-Za-z0-9._:%-]+$/u.test(host)) {
    throw new TypeError('ClamAV host is invalid.');
  }
  const port = boundedInteger(options.port, 1, 65_535, 'port');
  const timeoutMs = boundedInteger(options.timeoutMs, 1, 60_000, 'timeout');
  const chunkBytes = boundedInteger(
    options.chunkBytes ?? 64 * 1024,
    1,
    1024 * 1024,
    'chunk size'
  );
  const maximumResponseBytes = boundedInteger(
    options.maximumResponseBytes ?? 4 * 1024,
    16,
    64 * 1024,
    'response byte limit'
  );
  if (
    !Array.isArray(options.supportedMediaTypes) ||
    new Set(options.supportedMediaTypes).size !==
      options.supportedMediaTypes.length
  ) {
    throw new TypeError('ClamAV media type capability is invalid.');
  }
  const supportedMediaTypes = Object.freeze(
    options.supportedMediaTypes.map(normalizeBinaryAssetMediaType).sort()
  );
  const descriptor = readBinaryAssetContentScannerDescriptor({
    id: CLAMAV_CONTENT_SCANNER_ID,
    version: options.policyVersion,
    supportedMediaTypes,
  });

  return Object.freeze({
    descriptor,
    async scan(request) {
      const materialization = createBinaryAssetMaterialization({
        assetDocumentId: 'clamav-content-scan',
        reference: request.reference,
        contents: request.contents,
      });
      if (
        !descriptor.supportedMediaTypes.includes(
          materialization.reference.mediaType
        )
      ) {
        throw new BinaryAssetScannerUnavailableError('configuration');
      }
      return scanWithClamAv(
        {
          host,
          port,
          timeoutMs,
          chunkBytes,
          maximumResponseBytes,
        },
        materialization.contents
      );
    },
  });
};
