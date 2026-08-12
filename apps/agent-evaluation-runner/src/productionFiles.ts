import {
  lstat,
  open,
  realpath,
  rename,
  unlink,
  type FileHandle,
} from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import {
  basename,
  dirname,
  isAbsolute,
  parse,
  relative,
  resolve,
  win32,
} from 'node:path';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isUnsafeObjectKey } from '@prodivix/shared/safety';
import type { AgentEvaluationCoordinatorFilePort } from './coordinator';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import { containsAsciiControlCharacter } from './textSafety';

export const AGENT_EVALUATION_PRODUCTION_FILE_MAXIMUM_BYTES = 536_870_912;

export type NodeAgentEvaluationCoordinatorFilePortOptions = Readonly<{
  maximumBytes?: number;
}>;

type ObjectFrame = {
  kind: 'object';
  keys: Set<string>;
  expectsKey: boolean;
};
type ArrayFrame = { kind: 'array' };
type JsonFrame = ArrayFrame | ObjectFrame;

const readFailed = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );
};

const writeFailed = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed
  );
};

const maximumBytes = (value: number | undefined): number => {
  const maximum = value ?? AGENT_EVALUATION_PRODUCTION_FILE_MAXIMUM_BYTES;
  if (
    !Number.isSafeInteger(maximum) ||
    maximum < 1 ||
    maximum > AGENT_EVALUATION_PRODUCTION_FILE_MAXIMUM_BYTES
  ) {
    return readFailed();
  }
  return maximum;
};

const canonicalPath = (value: string, failure: () => never): string => {
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
    return failure();
  }
  const target = resolve(value);
  if (
    target !== value ||
    target === parse(target).root ||
    basename(target).length < 1
  ) {
    return failure();
  }
  return target;
};

const assertSafeDirectory = async (
  target: string,
  failure: () => never
): Promise<void> => {
  try {
    const directory = dirname(target);
    const resolvedDirectory = resolve(directory);
    const physicalDirectory = resolve(await realpath(directory));
    if (relative(resolvedDirectory, physicalDirectory) !== '') failure();
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    failure();
  }
};

const assertNoDuplicateOrUnsafeKeys = (source: string): void => {
  const frames: JsonFrame[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      const start = index;
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2;
          continue;
        }
        if (source[index] === '"') break;
        index += 1;
      }
      const frame = frames.at(-1);
      if (frame?.kind === 'object' && frame.expectsKey) {
        let key: unknown;
        try {
          key = JSON.parse(source.slice(start, index + 1)) as unknown;
        } catch {
          readFailed();
        }
        if (typeof key !== 'string') readFailed();
        const safeKey = key as string;
        if (isUnsafeObjectKey(safeKey) || frame.keys.has(safeKey)) {
          readFailed();
        }
        frame.keys.add(safeKey);
        frame.expectsKey = false;
      }
      continue;
    }
    if (character === '{') {
      frames.push({ kind: 'object', keys: new Set(), expectsKey: true });
      continue;
    }
    if (character === '[') {
      frames.push({ kind: 'array' });
      continue;
    }
    if (character === '}' || character === ']') {
      frames.pop();
      continue;
    }
    if (character === ',') {
      const frame = frames.at(-1);
      if (frame?.kind === 'object') frame.expectsKey = true;
    }
  }
};

const readFileHandle = async (
  handle: FileHandle,
  expectedBytes: number,
  maximum: number
): Promise<Buffer> => {
  const source = Buffer.alloc(expectedBytes + 1);
  let offset = 0;
  while (offset < source.byteLength) {
    const result = await handle.read(
      source,
      offset,
      source.byteLength - offset,
      null
    );
    if (result.bytesRead === 0) break;
    offset += result.bytesRead;
  }
  if (offset > maximum || offset !== expectedBytes) readFailed();
  return source.subarray(0, offset);
};

export type AgentEvaluationProductionJsonDocument = Readonly<{
  source: string;
  value: unknown;
}>;

/** Strict JSON decoder shared by descriptor-safe files and tracked Git blobs. */
export const decodeAgentEvaluationProductionJsonDocument = (
  bytes: Uint8Array,
  maximumByteLength: number = AGENT_EVALUATION_PRODUCTION_FILE_MAXIMUM_BYTES
): AgentEvaluationProductionJsonDocument => {
  try {
    const maximum = maximumBytes(maximumByteLength);
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.byteLength < 1 ||
      bytes.byteLength > maximum ||
      (bytes.byteLength >= 3 &&
        bytes[0] === 0xef &&
        bytes[1] === 0xbb &&
        bytes[2] === 0xbf)
    ) {
      readFailed();
    }
    let source = '';
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      readFailed();
    }
    let value: unknown = undefined;
    try {
      value = JSON.parse(source) as unknown;
    } catch {
      readFailed();
    }
    assertNoDuplicateOrUnsafeKeys(source);
    return Object.freeze({ source, value });
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return readFailed();
  }
};

const readStrictJson = async (
  path: string,
  maximum: number
): Promise<AgentEvaluationProductionJsonDocument> => {
  const target = canonicalPath(path, readFailed);
  let handle: FileHandle | undefined;
  try {
    const pathStat = await lstat(target, { bigint: true });
    if (!pathStat.isFile() || pathStat.isSymbolicLink()) readFailed();
    const physicalTarget = resolve(await realpath(target));
    if (physicalTarget !== target) readFailed();
    handle = await open(target, 'r');
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.dev !== pathStat.dev ||
      before.ino !== pathStat.ino ||
      before.size < 1n ||
      before.size > BigInt(maximum)
    ) {
      readFailed();
    }
    const bytes = await readFileHandle(handle, Number(before.size), maximum);
    const after = await handle.stat({ bigint: true });
    if (
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      after.ctimeNs !== before.ctimeNs
    ) {
      readFailed();
    }
    return decodeAgentEvaluationProductionJsonDocument(bytes, maximum);
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return readFailed();
  } finally {
    await handle?.close().catch(() => undefined);
  }
};

const canonicalBytes = (value: unknown, maximum: number): Buffer => {
  try {
    const bytes = Buffer.from(canonicalJsonText(value), 'utf8');
    if (bytes.byteLength < 1 || bytes.byteLength > maximum) writeFailed();
    return bytes;
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return writeFailed();
  }
};

const writeExclusive = async (
  target: string,
  bytes: Uint8Array
): Promise<void> => {
  let handle: FileHandle | undefined;
  let created = false;
  try {
    await assertSafeDirectory(target, writeFailed);
    handle = await open(target, 'wx', 0o600);
    created = true;
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    created = false;
  } catch (caught) {
    await handle?.close().catch(() => undefined);
    handle = undefined;
    if (created) await unlink(target).catch(() => undefined);
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    writeFailed();
  }
};

const writeAtomic = async (
  target: string,
  bytes: Uint8Array
): Promise<void> => {
  let temporaryPath: string | undefined;
  let handle: FileHandle | undefined;
  try {
    await assertSafeDirectory(target, writeFailed);
    temporaryPath = `${target}.tmp-${process.pid}-${randomBytes(16).toString('hex')}`;
    handle = await open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, target);
    temporaryPath = undefined;
  } catch (caught) {
    await handle?.close().catch(() => undefined);
    handle = undefined;
    if (temporaryPath) await unlink(temporaryPath).catch(() => undefined);
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    writeFailed();
  }
};

/** Native, bounded file port for the CI coordinator composition root. */
export const createNodeAgentEvaluationCoordinatorFilePort = (
  options: NodeAgentEvaluationCoordinatorFilePortOptions = {}
): AgentEvaluationCoordinatorFilePort => {
  const maximum = maximumBytes(options.maximumBytes);
  return Object.freeze({
    readJson: async (path: string) =>
      (await readStrictJson(path, maximum)).value,
    readCanonicalJson: async (path: string) => {
      const parsed = await readStrictJson(path, maximum);
      if (parsed.source !== canonicalJsonText(parsed.value)) readFailed();
      return parsed.value;
    },
    writeCanonicalJson: async (path: string, value: unknown) => {
      const target = canonicalPath(path, writeFailed);
      await writeAtomic(target, canonicalBytes(value, maximum));
    },
    createCanonicalJson: async (path: string, value: unknown) => {
      const target = canonicalPath(path, writeFailed);
      await writeExclusive(target, canonicalBytes(value, maximum));
    },
  });
};
