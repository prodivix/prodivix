import {
  decodeExecutionBuildBundle,
  type ExecutionBuildBundleFile,
} from './executionBuildBundle';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { normalizeExecutableProjectPath } from './executableProjectNormalization';
import {
  EXECUTABLE_PROJECT_LIMITS,
  type ExecutableProjectTarget,
} from './executableProject.types';

export const EXECUTION_PREVIEW_BUNDLE_FORMAT =
  'prodivix.execution-preview-bundle.v1' as const;
export const EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE =
  'application/vnd.prodivix.execution-preview-bundle+json' as const;

export type ExecutionPreviewBundle = Readonly<{
  format: typeof EXECUTION_PREVIEW_BUNDLE_FORMAT;
  snapshotDigest: string;
  target: ExecutableProjectTarget;
  entryFilePath: string;
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

/** Decodes a static preview only after its nested build bundle and HTML entrypoint are verified. */
export const decodeExecutionPreviewBundle = (
  value: string | Uint8Array
): ExecutionPreviewBundle => {
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
    throw new TypeError('Execution preview bundle payload is too large.');
  const record = exactRecord(
    JSON.parse(text) as unknown,
    ['format', 'entryFilePath', 'bundle'],
    'Execution preview bundle'
  );
  if (record.format !== EXECUTION_PREVIEW_BUNDLE_FORMAT)
    throw new TypeError('Execution preview bundle format is unsupported.');
  const entryFilePath = normalizeExecutableProjectPath(record.entryFilePath);
  if (!entryFilePath.toLowerCase().endsWith('.html'))
    throw new TypeError('Execution preview entrypoint must be an HTML file.');
  const bundle = decodeExecutionBuildBundle(JSON.stringify(record.bundle));
  if (!bundle.files.some((file) => file.path === entryFilePath))
    throw new TypeError(
      'Execution preview entrypoint is missing from the bundle.'
    );
  return Object.freeze({
    format: EXECUTION_PREVIEW_BUNDLE_FORMAT,
    snapshotDigest: bundle.snapshotDigest,
    target: bundle.target,
    entryFilePath,
    files: bundle.files,
  });
};
