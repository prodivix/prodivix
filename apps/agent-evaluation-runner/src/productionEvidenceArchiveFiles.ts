import { createHash, randomBytes } from 'node:crypto';
import {
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  rm,
  unlink,
  type FileHandle,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  win32,
} from 'node:path';
import {
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS,
  AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_FILE_NAME,
  AGENT_MODEL_EVALUATION_EVIDENCE_SHARD_DIRECTORY_NAME,
} from '@prodivix/ai';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import { containsAsciiControlCharacter } from './textSafety';

const digestPattern = /^sha256-[0-9a-f]{64}$/u;
const shardPathPattern = new RegExp(
  `^${AGENT_MODEL_EVALUATION_EVIDENCE_SHARD_DIRECTORY_NAME}\\/([0-9]{6})-(sha256-[0-9a-f]{64})\\.ndjson$`,
  'u'
);

type AwaitableIterable<T> = AsyncIterable<T> | Iterable<T>;

export type AgentEvaluationEvidenceArchiveFileInput = Readonly<{
  relativePath: string;
  expectedByteSize: number;
  expectedBytesDigest: string;
  chunks: AwaitableIterable<Uint8Array>;
}>;

export type AgentEvaluationEvidenceArchiveFileReceipt = Readonly<{
  relativePath: string;
  byteSize: number;
  bytesDigest: string;
}>;

export interface AgentEvaluationEvidenceArchiveStagingFiles {
  createFile(
    input: AgentEvaluationEvidenceArchiveFileInput
  ): Promise<AgentEvaluationEvidenceArchiveFileReceipt>;
}

export interface AgentEvaluationEvidenceArchiveFilePort {
  createArchive<T>(
    input: Readonly<{
      archiveOutputPath: string;
      write: (
        staging: AgentEvaluationEvidenceArchiveStagingFiles
      ) => Promise<T>;
    }>
  ): Promise<
    Readonly<{
      value: T;
      files: readonly AgentEvaluationEvidenceArchiveFileReceipt[];
    }>
  >;
}

export type NodeAgentEvaluationEvidenceArchiveFilePortOptions = Readonly<{
  randomSuffix?: () => string;
  syncDirectory?: (path: string) => Promise<void>;
}>;

const captureFailed = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed
  );
};

const nodeErrorCode = (caught: unknown): string | undefined =>
  caught !== null &&
  typeof caught === 'object' &&
  'code' in caught &&
  typeof caught.code === 'string'
    ? caught.code
    : undefined;

const canonicalArchivePath = (value: string): string => {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 4_096 ||
    value !== value.trim() ||
    containsAsciiControlCharacter(value) ||
    value.startsWith('\\\\') ||
    value.startsWith('//') ||
    !isAbsolute(value) ||
    (win32.isAbsolute(value) && !isAbsolute(value))
  ) {
    return captureFailed();
  }
  const target = resolve(value);
  if (
    target !== value ||
    target === parse(target).root ||
    basename(target).length < 1
  ) {
    return captureFailed();
  }
  return target;
};

const assertSafeParent = async (target: string): Promise<string> => {
  try {
    const parent = dirname(target);
    const physicalParent = resolve(await realpath(parent));
    if (relative(resolve(parent), physicalParent) !== '')
      return captureFailed();
    const parentStat = await lstat(parent);
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
      return captureFailed();
    }
    return parent;
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return captureFailed();
  }
};

const assertAbsent = async (path: string): Promise<void> => {
  try {
    await lstat(path);
    captureFailed();
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    if (nodeErrorCode(caught) !== 'ENOENT') captureFailed();
  }
};

const defaultSyncDirectory = async (path: string): Promise<void> => {
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, 'r');
    await handle.sync();
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    captureFailed();
  } finally {
    await handle?.close().catch(() => undefined);
  }
};

const validatedRandomSuffix = (source: () => string): string => {
  const value = source();
  return /^[0-9a-f]{32}$/u.test(value) ? value : captureFailed();
};

const normalizeRelativePath = (
  value: string
): Readonly<{ kind: 'index' | 'shard'; relativePath: string }> => {
  if (value === AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_FILE_NAME) {
    return Object.freeze({ kind: 'index', relativePath: value });
  }
  const match = shardPathPattern.exec(value);
  if (!match || value.includes('\\')) {
    return captureFailed();
  }
  return Object.freeze({ kind: 'shard', relativePath: value });
};

const assertExpectedFile = (
  input: AgentEvaluationEvidenceArchiveFileInput,
  kind: 'index' | 'shard'
): void => {
  const maximum =
    kind === 'index'
      ? AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumIndexBytes
      : AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumShardBytes;
  if (
    !Number.isSafeInteger(input.expectedByteSize) ||
    input.expectedByteSize < 1 ||
    input.expectedByteSize > maximum ||
    !digestPattern.test(input.expectedBytesDigest)
  ) {
    captureFailed();
  }
  if (
    kind === 'shard' &&
    shardPathPattern.exec(input.relativePath)?.[2] !== input.expectedBytesDigest
  ) {
    captureFailed();
  }
};

const writeChunk = async (
  handle: FileHandle,
  chunk: Uint8Array
): Promise<void> => {
  let offset = 0;
  while (offset < chunk.byteLength) {
    const result = await handle.write(
      chunk,
      offset,
      chunk.byteLength - offset,
      null
    );
    if (result.bytesWritten < 1) captureFailed();
    offset += result.bytesWritten;
  }
};

const writeStagedFile = async (
  target: string,
  input: AgentEvaluationEvidenceArchiveFileInput
): Promise<AgentEvaluationEvidenceArchiveFileReceipt> => {
  let handle: FileHandle | undefined;
  let created = false;
  const hash = createHash('sha256');
  let byteSize = 0;
  try {
    handle = await open(target, 'wx', 0o600);
    created = true;
    for await (const chunk of input.chunks) {
      if (!(chunk instanceof Uint8Array)) captureFailed();
      byteSize += chunk.byteLength;
      if (byteSize > input.expectedByteSize) captureFailed();
      hash.update(chunk);
      await writeChunk(handle, chunk);
    }
    const bytesDigest = `sha256-${hash.digest('hex')}`;
    if (
      byteSize !== input.expectedByteSize ||
      bytesDigest !== input.expectedBytesDigest
    ) {
      captureFailed();
    }
    await handle.sync();
    await handle.close();
    handle = undefined;
    created = false;
    return Object.freeze({
      relativePath: input.relativePath,
      byteSize,
      bytesDigest,
    });
  } catch (caught) {
    await handle?.close().catch(() => undefined);
    if (created) await unlink(target).catch(() => undefined);
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return captureFailed();
  }
};

const safeTemporaryDirectory = (
  temporaryPath: string,
  parent: string,
  expectedPrefix: string
): boolean =>
  dirname(temporaryPath) === parent &&
  basename(temporaryPath).startsWith(expectedPrefix);

const removeTemporaryDirectory = async (
  temporaryPath: string | undefined,
  parent: string,
  expectedPrefix: string
): Promise<void> => {
  if (
    !temporaryPath ||
    !safeTemporaryDirectory(temporaryPath, parent, expectedPrefix)
  ) {
    return;
  }
  try {
    const pathStat = await lstat(temporaryPath);
    if (!pathStat.isDirectory() || pathStat.isSymbolicLink()) return;
    await rm(temporaryPath, { recursive: true, force: false });
  } catch {
    // A failed operation retains only its bounded sibling staging directory.
  }
};

/**
 * Streams archive files into an exclusive sibling directory, fsyncs every
 * durable boundary, then atomically publishes the directory as one unit.
 */
export const createNodeAgentEvaluationEvidenceArchiveFilePort = (
  options: NodeAgentEvaluationEvidenceArchiveFilePortOptions = {}
): AgentEvaluationEvidenceArchiveFilePort => {
  const randomSuffix =
    options.randomSuffix ?? (() => randomBytes(16).toString('hex'));
  const syncDirectory = options.syncDirectory ?? defaultSyncDirectory;
  return Object.freeze({
    createArchive: async <T>(
      input: Readonly<{
        archiveOutputPath: string;
        write: (
          staging: AgentEvaluationEvidenceArchiveStagingFiles
        ) => Promise<T>;
      }>
    ) => {
      const target = canonicalArchivePath(input.archiveOutputPath);
      const parent = await assertSafeParent(target);
      const targetName = basename(target);
      const temporaryPrefix = `.${targetName}.tmp-`;
      const temporaryPath = join(
        parent,
        `${temporaryPrefix}${validatedRandomSuffix(randomSuffix)}`
      );
      const lockPath = join(parent, `.${targetName}.archive.lock`);
      let lockHandle: FileHandle | undefined;
      let temporaryCreated = false;
      let committed = false;
      try {
        await assertAbsent(target);
        lockHandle = await open(lockPath, 'wx', 0o600);
        await assertAbsent(temporaryPath);
        await mkdir(temporaryPath, { recursive: false, mode: 0o700 });
        temporaryCreated = true;
        const shardsPath = join(
          temporaryPath,
          AGENT_MODEL_EVALUATION_EVIDENCE_SHARD_DIRECTORY_NAME
        );
        await mkdir(shardsPath, { recursive: false, mode: 0o700 });

        const files: AgentEvaluationEvidenceArchiveFileReceipt[] = [];
        const relativePaths = new Set<string>();
        let shardCount = 0;
        let totalBytes = 0;
        let indexWritten = false;
        let writing = false;
        const staging: AgentEvaluationEvidenceArchiveStagingFiles =
          Object.freeze({
            createFile: async (
              fileInput: AgentEvaluationEvidenceArchiveFileInput
            ) => {
              if (writing || indexWritten) captureFailed();
              const normalized = normalizeRelativePath(fileInput.relativePath);
              assertExpectedFile(fileInput, normalized.kind);
              if (relativePaths.has(normalized.relativePath)) captureFailed();
              if (
                normalized.kind === 'index' &&
                (shardCount < 1 || files.length !== shardCount)
              ) {
                captureFailed();
              }
              if (
                normalized.kind === 'shard' &&
                shardCount >=
                  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumShards
              ) {
                captureFailed();
              }
              if (
                totalBytes + fileInput.expectedByteSize >
                AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes
              ) {
                captureFailed();
              }
              writing = true;
              try {
                const receipt = await writeStagedFile(
                  join(temporaryPath, ...normalized.relativePath.split('/')),
                  fileInput
                );
                relativePaths.add(normalized.relativePath);
                files.push(receipt);
                totalBytes += receipt.byteSize;
                if (normalized.kind === 'shard') shardCount += 1;
                else indexWritten = true;
                return receipt;
              } finally {
                writing = false;
              }
            },
          });
        const value = await input.write(staging);
        if (writing || !indexWritten || files.length !== shardCount + 1) {
          captureFailed();
        }
        await syncDirectory(shardsPath);
        await syncDirectory(temporaryPath);
        await lockHandle.sync();
        await syncDirectory(parent);
        await assertAbsent(target);
        await rename(temporaryPath, target);
        temporaryCreated = false;
        committed = true;
        await syncDirectory(parent);
        return Object.freeze({ value, files: Object.freeze(files) });
      } catch (caught) {
        if (caught instanceof AgentEvaluationRunnerError) throw caught;
        return captureFailed();
      } finally {
        if (temporaryCreated && !committed) {
          await removeTemporaryDirectory(
            temporaryPath,
            parent,
            temporaryPrefix
          );
        }
        await lockHandle?.close().catch(() => undefined);
        if (lockHandle) await unlink(lockPath).catch(() => undefined);
      }
    },
  });
};
