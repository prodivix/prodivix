import { createHash } from 'node:crypto';
import { lstat, open, readdir, readlink, realpath } from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  digestVerificationValue,
  type VerificationBrowserEngine,
} from '@prodivix/verification';
import {
  createPlaywrightBrowserImageAuthorityReceipt,
  type PlaywrightBrowserImageAuthorityReceipt,
} from '../browserImageAuthority';

const PLAYWRIGHT_INSTALL_MARKERS = new Set([
  'DEPENDENCIES_VALIDATED',
  'INSTALLATION_COMPLETE',
]);
const HASH_CONCURRENCY = 4;

type PendingBrowserImageEntry =
  | Readonly<{
      kind: 'file';
      path: string;
      absolutePath: string;
    }>
  | Readonly<{
      kind: 'symbolic-link';
      path: string;
      target: string;
      mode: number;
    }>;

export type PlaywrightBrowserImageFileReceipt = Readonly<{
  kind: 'file';
  path: string;
  mode: number;
  byteLength: number;
  contentDigest: string;
}>;

export type PlaywrightBrowserImageSymbolicLinkReceipt = Readonly<{
  kind: 'symbolic-link';
  path: string;
  mode: number;
  target: string;
}>;

export type PlaywrightBrowserImageEntryReceipt =
  PlaywrightBrowserImageFileReceipt | PlaywrightBrowserImageSymbolicLinkReceipt;

const normalizeRelativePath = (value: string): string =>
  value.split(sep).join('/');

const isInside = (rootPath: string, candidatePath: string): boolean => {
  const childPath = relative(rootPath, candidatePath);
  return (
    childPath === '' ||
    (!childPath.startsWith(`..${sep}`) &&
      childPath !== '..' &&
      !isAbsolute(childPath))
  );
};

const revisionRootFor = (
  engine: VerificationBrowserEngine,
  executablePath: string
): string => {
  let candidate = dirname(executablePath);
  const revisionRootPattern = new RegExp(`^${engine}-[0-9]+$`, 'u');
  while (true) {
    if (revisionRootPattern.test(basename(candidate))) return candidate;
    const parent = dirname(candidate);
    if (parent === candidate) return dirname(executablePath);
    candidate = parent;
  }
};

const assertStableOpenFile = (
  path: string,
  before: Awaited<ReturnType<Awaited<ReturnType<typeof open>>['stat']>>,
  after: Awaited<ReturnType<Awaited<ReturnType<typeof open>>['stat']>>
): void => {
  if (
    !before.isFile() ||
    !after.isFile() ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    before.ctimeMs !== after.ctimeMs
  ) {
    throw new Error(
      `Playwright browser image file changed while it was being observed: ${path}.`
    );
  }
};

const hashFile = async (
  entry: Extract<PendingBrowserImageEntry, Readonly<{ kind: 'file' }>>
): Promise<PlaywrightBrowserImageFileReceipt> => {
  const handle = await open(entry.absolutePath, 'r');
  try {
    const before = await handle.stat();
    if (!before.isFile()) {
      throw new Error(
        `Playwright browser image entry is no longer a regular file: ${entry.path}.`
      );
    }
    if (before.size > Number.MAX_SAFE_INTEGER) {
      throw new Error(
        `Playwright browser image file exceeds the supported byte bound: ${entry.path}.`
      );
    }
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      hash.update(chunk);
    }
    const after = await handle.stat();
    assertStableOpenFile(entry.path, before, after);
    return Object.freeze({
      kind: 'file',
      path: entry.path,
      mode: before.mode & 0o777,
      byteLength: before.size,
      contentDigest: `sha256-${hash.digest('hex')}`,
    });
  } finally {
    await handle.close();
  }
};

const collectPendingEntries = async (
  rootPath: string,
  directoryPath = rootPath
): Promise<readonly PendingBrowserImageEntry[]> => {
  const entries: PendingBrowserImageEntry[] = [];
  const children = await readdir(directoryPath, { withFileTypes: true });
  children.sort((left, right) =>
    compareUnicodeCodePoints(left.name, right.name)
  );
  for (const child of children) {
    if (
      directoryPath === rootPath &&
      PLAYWRIGHT_INSTALL_MARKERS.has(child.name)
    ) {
      continue;
    }
    const absolutePath = resolve(directoryPath, child.name);
    const relativePath = normalizeRelativePath(
      relative(rootPath, absolutePath)
    );
    const stats = await lstat(absolutePath);
    if (stats.isDirectory()) {
      entries.push(...(await collectPendingEntries(rootPath, absolutePath)));
      continue;
    }
    if (stats.isFile()) {
      entries.push(
        Object.freeze({
          kind: 'file',
          path: relativePath,
          absolutePath,
        })
      );
      continue;
    }
    if (stats.isSymbolicLink()) {
      const resolvedTarget = await realpath(absolutePath);
      if (!isInside(rootPath, resolvedTarget)) {
        throw new Error(
          `Playwright browser image symbolic link escapes its image root: ${relativePath}.`
        );
      }
      entries.push(
        Object.freeze({
          kind: 'symbolic-link',
          path: relativePath,
          target: await readlink(absolutePath),
          mode: stats.mode & 0o777,
        })
      );
      continue;
    }
    throw new Error(
      `Playwright browser image contains an unsupported filesystem entry: ${relativePath}.`
    );
  }
  return Object.freeze(entries);
};

const materializeEntryReceipts = async (
  pending: readonly PendingBrowserImageEntry[]
): Promise<readonly PlaywrightBrowserImageEntryReceipt[]> => {
  const receipts = new Array<PlaywrightBrowserImageEntryReceipt>(
    pending.length
  );
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < pending.length) {
      const index = nextIndex++;
      const entry = pending[index]!;
      receipts[index] =
        entry.kind === 'file'
          ? await hashFile(entry)
          : Object.freeze({
              kind: entry.kind,
              path: entry.path,
              mode: entry.mode,
              target: entry.target,
            });
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(HASH_CONCURRENCY, Math.max(1, pending.length)) },
      worker
    )
  );
  return Object.freeze(receipts);
};

/**
 * Observes the actual Playwright browser revision consumed by the provider.
 * Absolute host paths and install-completion markers are deliberately excluded
 * from identity; every runtime-relevant file byte, relative path and mode is
 * content-addressed before the browser process is launched.
 */
export const observePlaywrightBrowserImageAuthority = async (input: {
  engine: VerificationBrowserEngine;
  executablePath: string;
}): Promise<PlaywrightBrowserImageAuthorityReceipt> => {
  const executablePath = await realpath(resolve(input.executablePath));
  const imageRootPath = await realpath(
    revisionRootFor(input.engine, executablePath)
  );
  if (!isInside(imageRootPath, executablePath)) {
    throw new Error(
      `Playwright ${input.engine} executable is outside its browser image root.`
    );
  }
  const executableRelativePath = normalizeRelativePath(
    relative(imageRootPath, executablePath)
  );
  const receipts = await materializeEntryReceipts(
    await collectPendingEntries(imageRootPath)
  );
  const executable = receipts.find(
    (entry) => entry.kind === 'file' && entry.path === executableRelativePath
  );
  if (!executable || executable.kind !== 'file') {
    throw new Error(
      `Playwright ${input.engine} executable is absent from its browser image file set.`
    );
  }
  const fileSetDigest = digestVerificationValue(receipts);
  const totalByteLength = receipts.reduce(
    (total, entry) => total + (entry.kind === 'file' ? entry.byteLength : 0),
    0
  );
  return createPlaywrightBrowserImageAuthorityReceipt({
    engine: input.engine,
    executableRelativePath,
    executableContentDigest: executable.contentDigest,
    fileSetDigest,
    fileCount: receipts.length,
    totalByteLength,
  });
};
