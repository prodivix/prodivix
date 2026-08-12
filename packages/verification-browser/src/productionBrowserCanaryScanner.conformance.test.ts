import { digestVerificationValue } from '@prodivix/verification';
import { describe, expect, it } from 'vitest';
import { digestBrowserVerificationBytes } from './browserVerificationCellInput';
import { createProductionBrowserCanaryScanner } from './productionBrowserCanaryScanner';

const encoder = new TextEncoder();
const signal = Object.freeze({
  aborted: false,
  subscribe: () => () => undefined,
});
const canary = 'production-canary-value-00000001';

describe('production browser canary scanner', () => {
  it('returns only exact content and authority commitments for clean bytes', async () => {
    const scanner = createProductionBrowserCanaryScanner({
      secretAuthorityDigest: digestVerificationValue('secret-owner'),
      forbiddenCanaries: () => Object.freeze([canary]),
    });
    const contents = encoder.encode('export const catalog = true;');
    await expect(
      scanner.scan(
        {
          sourceKind: 'production-bundle',
          sourceId: 'assets/目录/catalog.js',
          contents,
        },
        signal
      )
    ).resolves.toMatchObject({
      contentDigest: digestBrowserVerificationBytes(contents),
      byteLength: contents.byteLength,
      scannerAuthorityDigest: scanner.authorityDigest,
      verdict: 'clean',
    });
  });

  it('fails closed before issuing a receipt when raw canary bytes are present', async () => {
    const scanner = createProductionBrowserCanaryScanner({
      secretAuthorityDigest: digestVerificationValue('secret-owner'),
      forbiddenCanaries: () => Object.freeze([canary]),
    });
    await expect(
      scanner.scan(
        {
          sourceKind: 'executable-source',
          sourceId: 'src/leak.ts',
          contents: encoder.encode(`export const leaked = '${canary}';`),
        },
        signal
      )
    ).rejects.toThrow(/Sensitive canary material/u);
  });

  it('rejects missing, duplicate, non-printable, and aborted canary authority', async () => {
    const owner = digestVerificationValue('secret-owner');
    for (const forbiddenCanaries of [
      () => Object.freeze([]),
      () => Object.freeze([canary, canary]),
      () => Object.freeze(['short']),
      () => Object.freeze(['canary-with-control\n']),
    ]) {
      const scanner = createProductionBrowserCanaryScanner({
        secretAuthorityDigest: owner,
        forbiddenCanaries,
      });
      await expect(
        scanner.scan(
          {
            sourceKind: 'behavior-program',
            sourceId: 'scenario:catalog',
            contents: encoder.encode('clean'),
          },
          signal
        )
      ).rejects.toThrow(/canary set/u);
    }
    const scanner = createProductionBrowserCanaryScanner({
      secretAuthorityDigest: owner,
      forbiddenCanaries: () => Object.freeze([canary]),
    });
    await expect(
      scanner.scan(
        {
          sourceKind: 'behavior-program',
          sourceId: 'scenario:catalog',
          contents: encoder.encode('clean'),
        },
        { aborted: true, reason: 'cancelled', subscribe: () => () => undefined }
      )
    ).rejects.toThrow(/aborted/u);
  });
});
