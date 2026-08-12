import { Buffer } from 'node:buffer';
import { digestVerificationValue } from '@prodivix/verification';
import { createProductionBrowserCanaryScanReceipt } from './productionChromiumBrowserAuthorityResources';
import type { ProductionBrowserCanaryScannerPort } from './productionChromiumBrowserAuthority.types';

const digestPattern = /^sha256-[a-f0-9]{64}$/u;
const printableAsciiPattern = /^[\x21-\x7e]{8,4096}$/u;
const maximumCanaries = 256;
const maximumSourceBytes = 256 * 1024 * 1024;

const fail = (message: string): never => {
  throw new TypeError(`PRODUCTION_BROWSER_CANARY_SCAN_FAILED: ${message}`);
};

export type CreateProductionBrowserCanaryScannerInput = Readonly<{
  secretAuthorityDigest: string;
  forbiddenCanaries(): readonly string[];
}>;

const exactSourceId = (value: string): boolean =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= 4_096 &&
  value === value.trim() &&
  value === value.normalize('NFC') &&
  ![...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint < 0x20 || codePoint === 0x7f || character === '\\';
  });

/**
 * Creates a callback-bound scanner whose durable output contains only content
 * and implementation commitments. Dynamic canary values and their encoded
 * byte patterns remain inside one scan call and are never returned.
 */
export const createProductionBrowserCanaryScanner = (
  input: CreateProductionBrowserCanaryScannerInput
): ProductionBrowserCanaryScannerPort => {
  if (
    !digestPattern.test(input.secretAuthorityDigest) ||
    typeof input.forbiddenCanaries !== 'function'
  ) {
    return fail('Secret canary authority is invalid.');
  }
  const authorityDigest = digestVerificationValue({
    format: 'prodivix.production-browser-callback-canary-scanner',
    version: 1,
    secretAuthorityDigest: input.secretAuthorityDigest,
    algorithm: 'exact-utf8-byte-subsequence',
    maximumCanaries,
    maximumSourceBytes,
    persistence: 'commitments-only',
  });
  return Object.freeze({
    authorityDigest,
    async scan(source, signal) {
      if (
        signal.aborted ||
        !exactSourceId(source.sourceId) ||
        ![
          'executable-source',
          'behavior-program',
          'production-bundle',
          'security-observation-set',
        ].includes(source.sourceKind) ||
        !(source.contents instanceof Uint8Array) ||
        source.contents.byteLength > maximumSourceBytes
      ) {
        return fail('Scan source is invalid or aborted.');
      }
      const canaries = input.forbiddenCanaries();
      if (
        !Array.isArray(canaries) ||
        canaries.length < 1 ||
        canaries.length > maximumCanaries ||
        canaries.some(
          (canary) =>
            typeof canary !== 'string' || !printableAsciiPattern.test(canary)
        ) ||
        new Set(canaries).size !== canaries.length
      ) {
        return fail('Dynamic canary set is invalid.');
      }
      const sourceBytes = Buffer.from(
        source.contents.buffer,
        source.contents.byteOffset,
        source.contents.byteLength
      );
      const patterns: Buffer[] = [];
      try {
        for (const canary of canaries) {
          if (signal.aborted) return fail('Scan was aborted.');
          const pattern = Buffer.from(canary, 'utf8');
          patterns.push(pattern);
          if (sourceBytes.includes(pattern)) {
            return fail('Sensitive canary material was detected.');
          }
        }
        if (signal.aborted) return fail('Scan was aborted.');
        return createProductionBrowserCanaryScanReceipt({
          contents: source.contents,
          scannerAuthorityDigest: authorityDigest,
        });
      } finally {
        for (const pattern of patterns) pattern.fill(0);
      }
    },
  });
};
