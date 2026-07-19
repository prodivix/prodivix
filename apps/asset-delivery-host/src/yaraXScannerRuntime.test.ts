import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  BinaryAssetScannerUnavailableError,
  createBinaryAssetBlobReference,
} from '@prodivix/assets';
import {
  initializeYaraXScannerRuntime,
  YARAX_MALWARE_FINDING_CODE,
  type YaraXCommandRunner,
} from './yaraXScannerRuntime';

const rulesPath = fileURLToPath(
  new URL('../rules/prodivix-baseline.yar', import.meta.url)
);

const createRunner = (): YaraXCommandRunner =>
  vi.fn(async (input) => {
    if (input.args.length === 1 && input.args[0] === '--version') {
      return { exitCode: 0, stdout: 'yara-x-cli 1.15.0\n', stderr: '' };
    }
    const targetPath = input.args.at(-1);
    if (!targetPath) throw new Error('Missing target path.');
    const { readFile } = await import('node:fs/promises');
    const contents = await readFile(targetPath, 'utf8');
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        version: '1.15.0',
        matches: contents.includes('PRODIVIX-YARAX-GATE-CANARY-v1')
          ? [{ rule: 'PRODIVIX_YARAX_GATE_CANARY', file: targetPath }]
          : [],
      }),
      stderr: '',
    };
  });

const initialize = (overrides?: {
  now?: () => number;
  runCommand?: YaraXCommandRunner;
}) =>
  initializeYaraXScannerRuntime({
    binaryPath: process.execPath,
    rulesPath,
    expectedVersion: '1.15.0',
    basePolicyVersion: 'test-policy-v1',
    timeoutSeconds: 5,
    wallTimeoutMs: 6_000,
    maximumOutputBytes: 64 * 1024,
    maximumRulesBytes: 1024 * 1024,
    maximumRulesAgeMs: 365 * 24 * 60 * 60 * 1_000,
    maximumConcurrentScans: 2,
    readinessCacheMs: 1_000,
    ...overrides,
  });

describe('YARA-X scanner runtime', () => {
  it('publishes an exact-rule generation and hides matching rule identities behind one finding code', async () => {
    const runCommand = createRunner();
    const runtime = await initialize({ runCommand });
    const snapshot = await runtime.acquire();
    const scanner = snapshot.scanners[0];
    if (!scanner) throw new Error('Missing YARA-X scanner.');
    const cleanBytes = new TextEncoder().encode('clean-image-bytes');
    const canaryBytes = new TextEncoder().encode(
      'PRODIVIX-YARAX-GATE-CANARY-v1'
    );

    await expect(
      scanner.scan({
        reference: createBinaryAssetBlobReference({
          contents: cleanBytes,
          mediaType: 'application/octet-stream',
        }),
        contents: cleanBytes,
      })
    ).resolves.toEqual({ verdict: 'clean', findingCodes: [] });
    await expect(
      scanner.scan({
        reference: createBinaryAssetBlobReference({
          contents: canaryBytes,
          mediaType: 'application/octet-stream',
        }),
        contents: canaryBytes,
      })
    ).resolves.toEqual({
      verdict: 'quarantined',
      findingCodes: [YARAX_MALWARE_FINDING_CODE],
    });
    expect(runtime.inspect()).toMatchObject({
      generation: 1,
      engineVersion: '1.15.0',
      rulesDigest: expect.stringMatching(/^sha256-[a-f0-9]{64}$/u),
    });
    expect(runCommand).toHaveBeenCalled();
  });

  it('fails closed on engine version drift, unknown output fields, and stale rules', async () => {
    const versionDrift = vi.fn(async () => ({
      exitCode: 0,
      stdout: 'yara-x-cli 1.14.0\n',
      stderr: '',
    }));
    await expect(
      initialize({ runCommand: versionDrift })
    ).rejects.toBeInstanceOf(BinaryAssetScannerUnavailableError);

    const malformed: YaraXCommandRunner = vi.fn(async (input) =>
      input.args[0] === '--version'
        ? { exitCode: 0, stdout: 'yara-x-cli 1.15.0\n', stderr: '' }
        : {
            exitCode: 0,
            stdout: JSON.stringify({
              version: '1.15.0',
              matches: [],
              credential: 'must-not-pass',
            }),
            stderr: '',
          }
    );
    await expect(initialize({ runCommand: malformed })).rejects.toMatchObject({
      reason: 'protocol',
    });

    await expect(
      initialize({
        runCommand: createRunner(),
        now: () => Date.now() + 366 * 24 * 60 * 60 * 1_000,
      })
    ).rejects.toMatchObject({ reason: 'stale-database' });
  });
});
