import { describe, expect, it, vi } from 'vitest';
import {
  BinaryAssetScannerUnavailableError,
  createBinaryAssetBlobReference,
  type BinaryAssetContentScanner,
} from '@prodivix/assets';
import { createRequiredAssetDeliveryScannerRuntime } from './requiredScannerRuntime';
import {
  createAssetDeliveryScannerSnapshot,
  type AssetDeliveryScannerSnapshot,
} from './assetDeliveryScannerRuntime';

const scanner = (input: {
  id: string;
  version: string;
  mediaTypes: readonly string[];
  scan: BinaryAssetContentScanner['scan'];
}): BinaryAssetContentScanner => ({
  descriptor: {
    id: input.id,
    version: input.version,
    supportedMediaTypes: input.mediaTypes,
  },
  scan: input.scan,
});

describe('required asset delivery scanner runtime', () => {
  it('requires the independent engine for every primary partition and preserves quarantine', async () => {
    const primaryScan = vi.fn(async () => ({
      verdict: 'clean' as const,
      findingCodes: [] as const,
    }));
    const requiredScan = vi.fn(async () => ({
      verdict: 'quarantined' as const,
      findingCodes: ['AST-SCAN-YARAX-DETECTED'] as const,
    }));
    const primarySnapshot = createAssetDeliveryScannerSnapshot({
      generation: 1,
      policyVersion: 'clamav-policy-v1',
      scanners: [
        scanner({
          id: 'test.primary.png',
          version: 'clamav-policy-v1',
          mediaTypes: ['image/png'],
          scan: primaryScan,
        }),
        scanner({
          id: 'test.primary.binary',
          version: 'clamav-policy-v1',
          mediaTypes: ['application/octet-stream'],
          scan: primaryScan,
        }),
      ],
    });
    const requiredSnapshot = createAssetDeliveryScannerSnapshot({
      generation: 1,
      policyVersion: 'yarax-policy-v1',
      scanners: [
        scanner({
          id: 'test.yarax',
          version: 'yarax-policy-v1',
          mediaTypes: ['application/octet-stream', 'image/png'],
          scan: requiredScan,
        }),
      ],
    });
    const runtime = createRequiredAssetDeliveryScannerRuntime({
      primary: {
        async acquire() {
          return primarySnapshot;
        },
      },
      required: [
        {
          async acquire() {
            return requiredSnapshot;
          },
        },
      ],
    });
    const snapshot = await runtime.acquire();
    const pngScanner = snapshot.scanners.find((entry) =>
      entry.descriptor.supportedMediaTypes.includes('image/png')
    );
    if (!pngScanner) throw new Error('Missing PNG policy scanner.');
    const contents = new Uint8Array([1, 2, 3]);

    await expect(
      pngScanner.scan({
        reference: createBinaryAssetBlobReference({
          contents,
          mediaType: 'image/png',
        }),
        contents,
      })
    ).resolves.toEqual({
      verdict: 'quarantined',
      findingCodes: ['AST-SCAN-YARAX-DETECTED'],
    });
    expect(primaryScan).toHaveBeenCalledTimes(1);
    expect(requiredScan).toHaveBeenCalledTimes(1);
    expect(snapshot.policyVersion).toMatch(/^required-scanners-[a-f0-9]{32}$/u);
  });

  it('rejects missing coverage and child generation drift', async () => {
    const baseScanner = scanner({
      id: 'test.primary',
      version: 'primary-v1',
      mediaTypes: ['image/png'],
      async scan() {
        return { verdict: 'clean', findingCodes: [] };
      },
    });
    const primarySnapshot = createAssetDeliveryScannerSnapshot({
      generation: 1,
      policyVersion: 'primary-v1',
      scanners: [baseScanner],
    });
    let requiredSnapshot: AssetDeliveryScannerSnapshot =
      createAssetDeliveryScannerSnapshot({
        generation: 1,
        policyVersion: 'required-v1',
        scanners: [
          scanner({
            id: 'test.required',
            version: 'required-v1',
            mediaTypes: ['application/octet-stream'],
            async scan() {
              return { verdict: 'clean', findingCodes: [] };
            },
          }),
        ],
      });
    const missing = createRequiredAssetDeliveryScannerRuntime({
      primary: {
        async acquire() {
          return primarySnapshot;
        },
      },
      required: [
        {
          async acquire() {
            return requiredSnapshot;
          },
        },
      ],
    });
    await expect(missing.acquire()).rejects.toMatchObject({
      reason: 'configuration',
    });

    requiredSnapshot = createAssetDeliveryScannerSnapshot({
      generation: 1,
      policyVersion: 'required-v1',
      scanners: [
        scanner({
          id: 'test.required',
          version: 'required-v1',
          mediaTypes: ['image/png'],
          async scan() {
            return { verdict: 'clean', findingCodes: [] };
          },
        }),
      ],
    });
    const drifting = createRequiredAssetDeliveryScannerRuntime({
      primary: {
        async acquire() {
          return primarySnapshot;
        },
      },
      required: [
        {
          async acquire() {
            return requiredSnapshot;
          },
        },
      ],
    });
    await drifting.acquire();
    requiredSnapshot = createAssetDeliveryScannerSnapshot({
      generation: 1,
      policyVersion: 'required-v2',
      scanners: [
        scanner({
          id: 'test.required',
          version: 'required-v2',
          mediaTypes: ['image/png'],
          async scan() {
            return { verdict: 'clean', findingCodes: [] };
          },
        }),
      ],
    });
    await expect(drifting.acquire()).rejects.toBeInstanceOf(
      BinaryAssetScannerUnavailableError
    );
  });
});
