import { createHash } from 'node:crypto';
import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import {
  createNodeAgentEvaluationEvidenceArchiveFilePort,
  type AgentEvaluationEvidenceArchiveFileInput,
} from './productionEvidenceArchiveFiles';

const temporaryRoots: string[] = [];

const digest = (bytes: Uint8Array): string =>
  `sha256-${createHash('sha256').update(bytes).digest('hex')}`;

const fileInput = (
  relativePath: string,
  bytes: Uint8Array,
  chunkSize = bytes.byteLength
): AgentEvaluationEvidenceArchiveFileInput => ({
  relativePath,
  expectedByteSize: bytes.byteLength,
  expectedBytesDigest: digest(bytes),
  chunks: (async function* () {
    for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
      yield bytes.subarray(
        offset,
        Math.min(bytes.byteLength, offset + chunkSize)
      );
    }
  })(),
});

const root = async (): Promise<string> => {
  const created = await mkdtemp(join(tmpdir(), 'prodivix-g4-archive-'));
  const physical = resolve(await realpath(created));
  temporaryRoots.push(physical);
  return physical;
};

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe('production evidence archive files', () => {
  it('streams shards, writes the index last, and atomically publishes one directory', async () => {
    const parent = await root();
    const archiveOutputPath = join(parent, 'evidence-archive');
    const shard = Buffer.from('{"record":1}\n{"record":2}\n', 'utf8');
    const index = Buffer.from('{"index":1}', 'utf8');
    const shardPath = `shards/000000-${digest(shard)}.ndjson`;
    const syncDirectory = vi.fn(async () => undefined);
    const port = createNodeAgentEvaluationEvidenceArchiveFilePort({
      randomSuffix: () => 'a'.repeat(32),
      syncDirectory,
    });

    const result = await port.createArchive({
      archiveOutputPath,
      write: async (staging) => {
        const shardReceipt = await staging.createFile(
          fileInput(shardPath, shard, 5)
        );
        const indexReceipt = await staging.createFile(
          fileInput('evidence-index.json', index, 2)
        );
        return Object.freeze({ shardReceipt, indexReceipt });
      },
    });

    await expect(
      readFile(join(archiveOutputPath, ...shardPath.split('/')))
    ).resolves.toEqual(shard);
    await expect(
      readFile(join(archiveOutputPath, 'evidence-index.json'))
    ).resolves.toEqual(index);
    expect(result.files).toEqual([
      {
        relativePath: shardPath,
        byteSize: shard.byteLength,
        bytesDigest: digest(shard),
      },
      {
        relativePath: 'evidence-index.json',
        byteSize: index.byteLength,
        bytesDigest: digest(index),
      },
    ]);
    expect(syncDirectory).toHaveBeenCalledTimes(4);
    expect(
      (await readdir(parent)).filter((entry) => entry.includes('.tmp-'))
    ).toEqual([]);
  });

  it('removes bounded staging state when a streamed digest drifts', async () => {
    const parent = await root();
    const archiveOutputPath = join(parent, 'evidence-archive');
    const bytes = Buffer.from('{"record":1}\n', 'utf8');
    const expectedBytesDigest = `sha256-${'0'.repeat(64)}`;
    const port = createNodeAgentEvaluationEvidenceArchiveFilePort({
      randomSuffix: () => 'b'.repeat(32),
      syncDirectory: async () => undefined,
    });

    await expect(
      port.createArchive({
        archiveOutputPath,
        write: async (staging) => {
          await staging.createFile({
            ...fileInput(`shards/000000-${expectedBytesDigest}.ndjson`, bytes),
            expectedBytesDigest,
          });
        },
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed,
    });
    await expect(lstat(archiveOutputPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(await readdir(parent)).toEqual([]);
  });

  it('requires shards before the singleton index and preserves an existing target', async () => {
    const parent = await root();
    const archiveOutputPath = join(parent, 'evidence-archive');
    const port = createNodeAgentEvaluationEvidenceArchiveFilePort({
      randomSuffix: () => 'c'.repeat(32),
      syncDirectory: async () => undefined,
    });
    const index = Buffer.from('{"index":1}', 'utf8');

    await expect(
      port.createArchive({
        archiveOutputPath,
        write: async (staging) => {
          await staging.createFile(fileInput('evidence-index.json', index));
        },
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed,
    });
    await mkdir(archiveOutputPath);
    await expect(
      port.createArchive({
        archiveOutputPath,
        write: async () => undefined,
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed,
    });
    expect(await readdir(parent)).toEqual(['evidence-archive']);
  });
});
