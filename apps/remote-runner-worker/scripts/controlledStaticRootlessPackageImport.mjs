import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

const OUTPUT_ROOT = '.prodivix/controlled-output';
const RESULTS_ROOT = `${OUTPUT_ROOT}/results`;
const PACKAGE_IMPORT_FORMAT =
  'prodivix.controlled-static-rootless-package-import.v1';
export const MAXIMUM_PACKAGE_IMPORT_ENTRIES = 100_000;
export const MAXIMUM_PACKAGE_IMPORT_BYTES = 320 * 1024 * 1024;
const MAXIMUM_PACKAGE_IMPORT_FILE_BYTES = 64 * 1024 * 1024;
export const MAXIMUM_PACKAGE_IMPORT_TOTAL_FILE_BYTES = 256 * 1024 * 1024;
export const MAXIMUM_PACKAGE_IMPORT_DEPTH = 64;

const sha256 = (contents) =>
  `sha256-${createHash('sha256').update(contents).digest('hex')}`;

const compareCodePoints = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

const exactRecord = (value, required, label) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== required.length ||
    required.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new TypeError(`${label} fields drifted.`);
  }
  return value;
};

const relativePath = (value, label) => {
  if (
    typeof value !== 'string' ||
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
    throw new TypeError(`${label} must be a canonical relative path.`);
  }
  return value;
};

const workspacePath = (path) => {
  const canonical = relativePath(path, 'Controlled rootless workspace path');
  const target = resolve('/workspace', ...canonical.split('/'));
  const child = relative('/workspace', target);
  if (
    !child ||
    child === '..' ||
    child.startsWith(`..${sep}`) ||
    isAbsolute(child)
  ) {
    throw new TypeError('Controlled rootless path escaped the workspace.');
  }
  return target;
};

const safePackageLinkTarget = (linkPath, target) => {
  if (
    typeof target !== 'string' ||
    !target ||
    target.includes('\\') ||
    isAbsolute(target)
  ) {
    throw new TypeError('Controlled package import symlink is invalid.');
  }
  const root = workspacePath('node_modules');
  const link = workspacePath(`node_modules/${linkPath}`);
  const resolved = resolve(dirname(link), target);
  if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) {
    throw new TypeError('Controlled package import symlink escaped its root.');
  }
  return target;
};

const packageEntryFact = (entry) => {
  if (entry.kind === 'directory') {
    return {
      kind: 'directory',
      mode: entry.mode,
      path: entry.path,
    };
  }
  if (entry.kind === 'symlink') {
    return {
      kind: 'symlink',
      path: entry.path,
      target: entry.target,
    };
  }
  return {
    digest: entry.digest,
    kind: 'file',
    mode: entry.mode,
    path: entry.path,
    size: entry.size,
  };
};

export const createControlledStaticRootlessPackageManifest = (entries) => {
  const facts = entries.map(packageEntryFact);
  const fileEntries = entries.filter(({ kind }) => kind === 'file');
  const manifest = {
    directoryCount: entries.filter(({ kind }) => kind === 'directory').length,
    entryCount: entries.length,
    fileCount: fileEntries.length,
    fileSetDigest: sha256(Buffer.from(JSON.stringify(facts), 'utf8')),
    maximumDepth: Math.max(
      ...entries.map(({ path }) => path.split('/').length)
    ),
    symlinkCount: entries.filter(({ kind }) => kind === 'symlink').length,
    totalFileBytes: fileEntries.reduce((total, { size }) => total + size, 0),
  };
  if (
    manifest.entryCount < 1 ||
    manifest.entryCount > MAXIMUM_PACKAGE_IMPORT_ENTRIES ||
    manifest.totalFileBytes < 1 ||
    manifest.totalFileBytes > MAXIMUM_PACKAGE_IMPORT_TOTAL_FILE_BYTES ||
    manifest.maximumDepth < 1 ||
    manifest.maximumDepth > MAXIMUM_PACKAGE_IMPORT_DEPTH
  ) {
    throw new TypeError('Controlled package import manifest exceeds bounds.');
  }
  return Object.freeze({
    manifest: Object.freeze(manifest),
    manifestDigest: sha256(Buffer.from(JSON.stringify(manifest), 'utf8')),
  });
};

const collectPackageImportEntries = async () => {
  const root = workspacePath('node_modules');
  const stats = await lstat(root);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new TypeError('Controlled install did not create node_modules.');
  }
  const entries = [];
  const visit = async (directory, prefix) => {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => compareCodePoints(left.name, right.name));
    for (const child of children) {
      const path = prefix ? `${prefix}/${child.name}` : child.name;
      const absolutePath = resolve(directory, child.name);
      const childStats = await lstat(absolutePath);
      if (path.split('/').length > MAXIMUM_PACKAGE_IMPORT_DEPTH) {
        throw new TypeError('Controlled package import path is too deep.');
      }
      if (child.isDirectory()) {
        entries.push({
          kind: 'directory',
          mode: childStats.mode & 0o777,
          path,
        });
        await visit(absolutePath, path);
        continue;
      }
      if (child.isSymbolicLink()) {
        entries.push({
          kind: 'symlink',
          path,
          target: safePackageLinkTarget(path, await readlink(absolutePath)),
        });
        continue;
      }
      if (!child.isFile()) {
        throw new TypeError(
          'Controlled package import contains a special file.'
        );
      }
      const contents = await readFile(absolutePath);
      if (contents.byteLength > MAXIMUM_PACKAGE_IMPORT_FILE_BYTES) {
        throw new TypeError(
          'Controlled package import file exceeds its budget.'
        );
      }
      entries.push({
        contents: contents.toString('base64'),
        digest: sha256(contents),
        kind: 'file',
        mode: childStats.mode & 0o777,
        path,
        size: contents.byteLength,
      });
      if (entries.length > MAXIMUM_PACKAGE_IMPORT_ENTRIES) {
        throw new TypeError(
          'Controlled package import contains too many entries.'
        );
      }
    }
  };
  await visit(root, '');
  entries.sort((left, right) => compareCodePoints(left.path, right.path));
  const caseFoldedPaths = new Set();
  for (const entry of entries) {
    const folded = entry.path.toLowerCase();
    if (caseFoldedPaths.has(folded)) {
      throw new TypeError(
        'Controlled package import contains a case-colliding path.'
      );
    }
    caseFoldedPaths.add(folded);
  }
  const authority = createControlledStaticRootlessPackageManifest(entries);
  return Object.freeze({
    entries: Object.freeze(entries),
    ...authority,
  });
};

export const decodeControlledStaticRootlessPackageImportBytes = (
  source,
  authority,
  observePhase = () => undefined
) => {
  const compressed = Buffer.isBuffer(source) ? source : Buffer.from(source);
  observePhase('archive-verify-bytes');
  if (
    compressed.byteLength !== authority.byteLength ||
    sha256(compressed) !== authority.digest
  ) {
    throw new TypeError('Controlled package import bytes drifted.');
  }
  let contents;
  observePhase('archive-inflate');
  try {
    contents = gunzipSync(compressed, {
      maxOutputLength: MAXIMUM_PACKAGE_IMPORT_BYTES,
    });
  } catch {
    throw new TypeError('Controlled package import compression is invalid.');
  }
  observePhase('archive-verify-content');
  if (sha256(contents) !== authority.contentDigest) {
    throw new TypeError('Controlled package import content drifted.');
  }
  const text = contents.toString('utf8');
  let value;
  observePhase('archive-parse-json');
  try {
    value = JSON.parse(text);
  } catch {
    throw new TypeError('Controlled package import JSON is invalid.');
  }
  if (JSON.stringify(value) !== text) {
    throw new TypeError('Controlled package import JSON is not canonical.');
  }
  observePhase('archive-verify-envelope');
  const archive = exactRecord(
    value,
    ['format', 'manifest', 'entries'],
    'Controlled package import archive'
  );
  const manifest = exactRecord(
    archive.manifest,
    [
      'directoryCount',
      'entryCount',
      'fileCount',
      'fileSetDigest',
      'maximumDepth',
      'symlinkCount',
      'totalFileBytes',
    ],
    'Controlled package import manifest'
  );
  if (
    archive.format !== PACKAGE_IMPORT_FORMAT ||
    !Array.isArray(archive.entries) ||
    archive.entries.length !== authority.entryCount ||
    archive.entries.length !== manifest.entryCount ||
    archive.entries.length < 1 ||
    archive.entries.length > MAXIMUM_PACKAGE_IMPORT_ENTRIES ||
    sha256(Buffer.from(JSON.stringify(manifest), 'utf8')) !==
      authority.manifestDigest ||
    manifest.fileSetDigest !== authority.fileSetDigest ||
    manifest.totalFileBytes !== authority.totalFileBytes ||
    manifest.maximumDepth !== authority.maximumDepth
  ) {
    throw new TypeError('Controlled package import archive drifted.');
  }
  let previousPath = '';
  let totalFileBytes = 0;
  const caseFoldedPaths = new Set();
  observePhase('archive-verify-entries');
  const entries = archive.entries.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError(`Controlled package import entry ${index} drifted.`);
    }
    const kind = entry.kind;
    const required =
      kind === 'file'
        ? ['contents', 'digest', 'kind', 'mode', 'path', 'size']
        : kind === 'symlink'
          ? ['kind', 'path', 'target']
          : kind === 'directory'
            ? ['kind', 'mode', 'path']
            : [];
    const record = exactRecord(
      entry,
      required,
      `Controlled package import entry ${index}`
    );
    const path = relativePath(
      record.path,
      `Controlled package import entry ${index} path`
    );
    const folded = path.toLowerCase();
    if (
      path.startsWith('node_modules/') ||
      path === 'node_modules' ||
      path.split('/').length > MAXIMUM_PACKAGE_IMPORT_DEPTH ||
      (previousPath && compareCodePoints(previousPath, path) >= 0) ||
      caseFoldedPaths.has(folded)
    ) {
      throw new TypeError(
        `Controlled package import entry ${index} path drifted.`
      );
    }
    previousPath = path;
    caseFoldedPaths.add(folded);
    if (kind === 'symlink') {
      return Object.freeze({
        kind,
        path,
        target: safePackageLinkTarget(path, record.target),
      });
    }
    if (
      !Number.isSafeInteger(record.mode) ||
      record.mode < 0 ||
      record.mode > 0o777
    ) {
      throw new TypeError(
        `Controlled package import entry ${index} mode drifted.`
      );
    }
    if (kind === 'directory') {
      return Object.freeze({ kind, mode: record.mode, path });
    }
    if (
      typeof record.contents !== 'string' ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
        record.contents
      )
    ) {
      throw new TypeError(
        `Controlled package import entry ${index} contents drifted.`
      );
    }
    const file = Buffer.from(record.contents, 'base64');
    if (
      file.byteLength > MAXIMUM_PACKAGE_IMPORT_FILE_BYTES ||
      record.size !== file.byteLength ||
      record.digest !== sha256(file)
    ) {
      throw new TypeError(
        `Controlled package import entry ${index} bytes drifted.`
      );
    }
    totalFileBytes += file.byteLength;
    if (totalFileBytes > MAXIMUM_PACKAGE_IMPORT_TOTAL_FILE_BYTES) {
      throw new TypeError(
        'Controlled package import expanded bytes exceed the budget.'
      );
    }
    return Object.freeze({
      contents: file,
      digest: record.digest,
      kind,
      mode: record.mode,
      path,
      size: file.byteLength,
    });
  });
  observePhase('archive-verify-manifest');
  const recomputed = createControlledStaticRootlessPackageManifest(entries);
  if (
    recomputed.manifestDigest !== authority.manifestDigest ||
    !Object.entries(recomputed.manifest).every(
      ([key, value]) => manifest[key] === value
    )
  ) {
    throw new TypeError('Controlled package import manifest drifted.');
  }
  return recomputed.manifest.fileSetDigest === authority.fileSetDigest
    ? Object.freeze({ entries: Object.freeze(entries), manifest })
    : (() => {
        throw new TypeError('Controlled package import file set drifted.');
      })();
};

const decodePackageImport = async (authority, observePhase, source) =>
  decodeControlledStaticRootlessPackageImportBytes(
    source ?? (await readFile(workspacePath(authority.path))),
    authority,
    observePhase
  );

export const materializeControlledStaticRootlessPackageImport = async (
  authority,
  observePhase = () => undefined,
  source
) => {
  const decoded = await decodePackageImport(authority, observePhase, source);
  const entries = decoded.entries;
  const root = workspacePath('node_modules');
  observePhase('archive-create-root');
  await mkdir(root, { recursive: false, mode: 0o700 });
  const directories = entries.filter(({ kind }) => kind === 'directory');
  observePhase('archive-write-tree');
  for (const entry of directories) {
    await mkdir(workspacePath(`node_modules/${entry.path}`), {
      recursive: true,
      mode: 0o700,
    });
  }
  for (const entry of entries) {
    const path = workspacePath(`node_modules/${entry.path}`);
    if (entry.kind === 'directory') continue;
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    if (entry.kind === 'symlink') {
      await symlink(entry.target, path);
      continue;
    }
    await writeFile(path, entry.contents, {
      flag: 'wx',
      mode: entry.mode,
    });
    await chmod(path, entry.mode);
  }
  directories.sort(
    (left, right) =>
      right.path.split('/').length - left.path.split('/').length ||
      compareCodePoints(left.path, right.path)
  );
  for (const entry of directories) {
    await chmod(workspacePath(`node_modules/${entry.path}`), entry.mode);
  }
  observePhase('archive-rehash');
  const observed = await collectPackageImportEntries();
  if (
    observed.manifestDigest !== authority.manifestDigest ||
    observed.manifest.fileSetDigest !== authority.fileSetDigest ||
    observed.manifest.entryCount !== authority.entryCount ||
    observed.manifest.totalFileBytes !== authority.totalFileBytes ||
    observed.manifest.maximumDepth !== authority.maximumDepth
  ) {
    throw new TypeError(
      'Controlled package import rehash after materialization drifted.'
    );
  }
};

export const createControlledStaticRootlessPackageImport = async () => {
  const collected = await collectPackageImportEntries();
  const { entries, manifest, manifestDigest } = collected;
  const contents = Buffer.from(
    JSON.stringify({
      format: PACKAGE_IMPORT_FORMAT,
      manifest,
      entries,
    }),
    'utf8'
  );
  if (contents.byteLength > MAXIMUM_PACKAGE_IMPORT_BYTES) {
    throw new TypeError('Controlled package import exceeds its budget.');
  }
  const compressed = gzipSync(contents, { level: 9 });
  if (compressed.byteLength > MAXIMUM_PACKAGE_IMPORT_BYTES) {
    throw new TypeError(
      'Controlled compressed package import exceeds its budget.'
    );
  }
  const outputPath = `${RESULTS_ROOT}/package-import.json.gz`;
  await mkdir(workspacePath(RESULTS_ROOT), {
    recursive: true,
    mode: 0o700,
  });
  await writeFile(workspacePath(outputPath), compressed, {
    flag: 'wx',
    mode: 0o600,
  });
  return Object.freeze({
    path: 'results/package-import.json.gz',
    digest: sha256(compressed),
    size: compressed.byteLength,
    contentDigest: sha256(contents),
    manifestDigest,
    fileSetDigest: manifest.fileSetDigest,
    entryCount: manifest.entryCount,
    totalFileBytes: manifest.totalFileBytes,
    maximumDepth: manifest.maximumDepth,
  });
};
