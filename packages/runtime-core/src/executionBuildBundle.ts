import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { normalizeExecutableProjectPath } from './executableProjectNormalization';
import {
  EXECUTABLE_PROJECT_LIMITS,
  type ExecutableProjectTarget,
} from './executableProject.types';

export const EXECUTION_BUILD_BUNDLE_FORMAT =
  'prodivix.execution-build-bundle.v1' as const;
export const EXECUTION_BUILD_BUNDLE_MEDIA_TYPE =
  'application/vnd.prodivix.execution-build-bundle+json' as const;

export type ExecutionBuildBundleFile = Readonly<{
  path: string;
  size: number;
  digest: string;
  contents: Uint8Array;
}>;

export type ExecutionBuildBundle = Readonly<{
  format: typeof EXECUTION_BUILD_BUNDLE_FORMAT;
  snapshotDigest: string;
  target: ExecutableProjectTarget;
  files: readonly ExecutionBuildBundleFile[];
}>;

const exactRecord = (
  value: unknown,
  keys: readonly string[],
  label: string
): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`${label} must be an object.`);
  const record = value as Record<string, unknown>;
  const allowed = new Set(keys);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown)
    throw new TypeError(`${label} has unsupported field: ${unknown}.`);
  return record;
};

const normalizedString = (value: unknown, label: string): string => {
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.trim() ||
    value.length > 4_096
  )
    throw new TypeError(`${label} must be a normalized string.`);
  return value;
};

const digest = (value: unknown, label: string): string => {
  const normalized = normalizedString(value, label);
  if (!/^sha256-[a-f0-9]{64}$/u.test(normalized))
    throw new TypeError(`${label} must be a canonical SHA-256 digest.`);
  return normalized;
};

const decodeBase64 = (value: unknown, label: string): Uint8Array => {
  if (
    typeof value !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value
    )
  )
    throw new TypeError(`${label} must be canonical base64.`);
  const binary = (
    globalThis as unknown as { atob(encoded: string): string }
  ).atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const decodeTarget = (value: unknown): ExecutableProjectTarget => {
  const record = exactRecord(
    value,
    ['presetId', 'framework', 'runtime'],
    'Execution build bundle target'
  );
  return Object.freeze({
    presetId: normalizedString(record.presetId, 'Build target presetId'),
    framework: normalizedString(record.framework, 'Build target framework'),
    runtime: normalizedString(record.runtime, 'Build target runtime'),
  });
};

/** Decodes a sandbox-produced build bundle without trusting its manifest facts. */
export const decodeExecutionBuildBundle = (
  value: string | Uint8Array
): ExecutionBuildBundle => {
  const text =
    typeof value === 'string'
      ? value
      : new (
          globalThis as unknown as {
            TextDecoder: new (
              label?: string,
              options?: Readonly<{ fatal?: boolean }>
            ) => { decode(input: Uint8Array): string };
          }
        ).TextDecoder('utf-8', { fatal: true }).decode(value);
  if (
    utf8ToBytes(text).byteLength >
    EXECUTABLE_PROJECT_LIMITS.maxTotalFileBytes * 2
  )
    throw new TypeError('Execution build bundle payload is too large.');
  const record = exactRecord(
    JSON.parse(text) as unknown,
    ['format', 'snapshotDigest', 'target', 'files'],
    'Execution build bundle'
  );
  if (record.format !== EXECUTION_BUILD_BUNDLE_FORMAT)
    throw new TypeError('Execution build bundle format is unsupported.');
  if (!Array.isArray(record.files) || !record.files.length)
    throw new TypeError('Execution build bundle must contain files.');
  if (record.files.length > EXECUTABLE_PROJECT_LIMITS.maxFiles)
    throw new TypeError('Execution build bundle contains too many files.');
  let previousPath = '';
  let totalBytes = 0;
  const paths = new Set<string>();
  const files = record.files.map((value, index) => {
    const file = exactRecord(
      value,
      ['path', 'size', 'digest', 'encoding', 'contents'],
      `Execution build bundle file ${index}`
    );
    const path = normalizeExecutableProjectPath(file.path);
    if (path.localeCompare(previousPath) <= 0)
      throw new TypeError(
        'Execution build bundle files must be uniquely sorted by path.'
      );
    previousPath = path;
    const segments = path.split('/');
    for (let parentIndex = 1; parentIndex < segments.length; parentIndex += 1) {
      if (paths.has(segments.slice(0, parentIndex).join('/')))
        throw new TypeError(
          'Execution build bundle path is both a file and a directory.'
        );
    }
    paths.add(path);
    if (file.encoding !== 'base64')
      throw new TypeError(
        `Execution build bundle file ${path} encoding is unsupported.`
      );
    const contents = decodeBase64(file.contents, `Build bundle file ${path}`);
    if (
      !Number.isSafeInteger(file.size) ||
      file.size !== contents.byteLength ||
      contents.byteLength > EXECUTABLE_PROJECT_LIMITS.maxFileBytes
    )
      throw new TypeError(
        `Execution build bundle file ${path} size is invalid.`
      );
    totalBytes += contents.byteLength;
    if (totalBytes > EXECUTABLE_PROJECT_LIMITS.maxTotalFileBytes)
      throw new TypeError(
        'Execution build bundle exceeds the total size limit.'
      );
    const expectedDigest = `sha256-${bytesToHex(sha256(contents))}`;
    if (
      digest(file.digest, `Build bundle file ${path} digest`) !== expectedDigest
    )
      throw new TypeError(
        `Execution build bundle file ${path} digest does not match.`
      );
    return Object.freeze({
      path,
      size: contents.byteLength,
      digest: expectedDigest,
      contents,
    });
  });
  return Object.freeze({
    format: EXECUTION_BUILD_BUNDLE_FORMAT,
    snapshotDigest: digest(
      record.snapshotDigest,
      'Build bundle snapshot digest'
    ),
    target: decodeTarget(record.target),
    files: Object.freeze(files),
  });
};
