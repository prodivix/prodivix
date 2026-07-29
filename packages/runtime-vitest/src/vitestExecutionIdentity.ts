import type {
  ExecutableProjectSnapshot,
  ExecutionSourceTrace,
} from '@prodivix/runtime-core';
import type { VitestExecutionFileIdentity } from './vitestExecutionTestReport';

const EXACT_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u;

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

export const readExecutableSnapshotVitestVersion = (
  snapshot: ExecutableProjectSnapshot
): string => {
  const manifest = snapshot.files.find(
    ({ path }) => path === snapshot.dependencyPlan.manifestFilePath
  );
  if (!manifest) {
    throw new TypeError(
      'Vitest executable snapshot does not contain its dependency manifest.'
    );
  }
  const source =
    typeof manifest.contents === 'string'
      ? manifest.contents
      : new TextDecoder('utf-8', { fatal: true }).decode(manifest.contents);
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch {
    throw new TypeError(
      'Vitest executable snapshot dependency manifest is invalid JSON.'
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(
      'Vitest executable snapshot dependency manifest must be an object.'
    );
  }
  const manifestRecord = value as Record<string, unknown>;
  const dependencyOwners = [
    manifestRecord.devDependencies,
    manifestRecord.dependencies,
  ];
  const versions = dependencyOwners.flatMap((owner) => {
    if (!owner || typeof owner !== 'object' || Array.isArray(owner)) return [];
    const version = (owner as Record<string, unknown>).vitest;
    return typeof version === 'string' ? [version] : [];
  });
  if (versions.length !== 1 || !EXACT_VERSION_PATTERN.test(versions[0]!)) {
    throw new TypeError(
      'Vitest executable snapshot must pin one exact attested Vitest version.'
    );
  }
  return versions[0]!;
};
