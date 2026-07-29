import type {
  ExecutableProjectSnapshot,
  ExecutionSourceTrace,
} from '@prodivix/runtime-core';
import type { VitestExecutionFileIdentity } from './vitestExecutionTestReport';

const EXACT_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u;

export const VITEST_INSTALLED_PACKAGE_MANIFEST_PATH =
  'node_modules/vitest/package.json' as const;

const normalizeAbsoluteRoot = (value: string): string => {
  let root = value.replace(/\\/gu, '/');
  while (
    root.length > 1 &&
    root.endsWith('/') &&
    !/^[A-Za-z]:\/$/u.test(root)
  ) {
    root = root.slice(0, -1);
  }
  if (
    !(
      root === '/' ||
      /^\/[^/]+(?:\/[^/]+)*$/u.test(root) ||
      /^[A-Za-z]:\/(?:[^/]+(?:\/[^/]+)*)?$/u.test(root)
    ) ||
    root
      .split('/')
      .filter(Boolean)
      .some((segment) => segment === '.' || segment === '..')
  ) {
    throw new TypeError(
      'Vitest provider root must be an absolute canonical path.'
    );
  }
  return root;
};

const normalizeSnapshotPath = (value: string): string => {
  if (
    !value ||
    value !== value.trim() ||
    value !== value.normalize('NFC') ||
    value.includes('\\') ||
    value.startsWith('/') ||
    value
      .split('/')
      .some(
        (segment) =>
          !segment ||
          segment === '.' ||
          segment === '..' ||
          segment.includes(':')
      )
  ) {
    throw new TypeError(
      'Vitest executable snapshot contains a non-canonical file path.'
    );
  }
  return value;
};

export const createVitestExecutionFileIdentityResolver = (
  snapshot: ExecutableProjectSnapshot,
  providerRoot: string,
  fallbackSourceTrace: readonly ExecutionSourceTrace[]
): ((reportedPath: string) => VitestExecutionFileIdentity | undefined) => {
  const root = normalizeAbsoluteRoot(providerRoot);
  const rootPrefix = root.endsWith('/') ? root : `${root}/`;
  const byPath = new Map(
    snapshot.files.map((file) => {
      const path = normalizeSnapshotPath(file.path);
      return [
        path,
        Object.freeze({
          fileId: path,
          path,
          sourceTrace: file.sourceTrace?.length
            ? file.sourceTrace
            : fallbackSourceTrace,
        }),
      ] as const;
    })
  );
  if (byPath.size !== snapshot.files.length) {
    throw new TypeError(
      'Vitest executable snapshot contains duplicate file identities.'
    );
  }
  return (reportedPath: string): VitestExecutionFileIdentity | undefined => {
    if (
      typeof reportedPath !== 'string' ||
      !reportedPath ||
      reportedPath !== reportedPath.trim()
    ) {
      return undefined;
    }
    const normalized = reportedPath.replace(/\\/gu, '/');
    if (!normalized.startsWith(rootPrefix)) return undefined;
    const relativePath = normalized.slice(rootPrefix.length);
    return byPath.get(relativePath);
  };
};

/** Reads the exact provider-installed Vitest identity after dependency resolution. */
export const readInstalledVitestVersion = (
  source: string | Uint8Array
): string => {
  if (
    (typeof source === 'string'
      ? new TextEncoder().encode(source).byteLength
      : source.byteLength) >
    64 * 1024
  ) {
    throw new TypeError(
      'Installed Vitest package manifest exceeds its provider budget.'
    );
  }
  const text =
    typeof source === 'string'
      ? source
      : new TextDecoder('utf-8', { fatal: true }).decode(source);
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new TypeError('Installed Vitest package manifest is invalid JSON.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Installed Vitest package manifest must be an object.');
  }
  const manifest = value as Record<string, unknown>;
  if (
    manifest.name !== 'vitest' ||
    typeof manifest.version !== 'string' ||
    !EXACT_VERSION_PATTERN.test(manifest.version)
  ) {
    throw new TypeError(
      'Installed Vitest package manifest must attest one exact Vitest version.'
    );
  }
  return manifest.version;
};
