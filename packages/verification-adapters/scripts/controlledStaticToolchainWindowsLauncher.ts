import { randomUUID } from 'node:crypto';
import {
  cp,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readlink,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, relative, resolve } from 'node:path';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  digestBytes,
  dotnetHostEnvironment,
  exactRecord,
  expectedMappedEnvironmentDigest,
  prepareWindowsLauncherAuthority,
  runHostProcess,
  WINDOWS_LAUNCHER_CLEANUP_GRACE_MS,
  WINDOWS_MAXIMUM_COMMAND_TIMEOUT_MS,
} from './controlledStaticToolchainWindowsHostAuthority';
import type {
  FinalizedWindowsSandboxRuntimeAuthority,
  WindowsAppContainerLaunchReceipt,
  WindowsEsbuildInProcessAuthority,
  WindowsEsbuildInProcessSourceAuthority,
  WindowsPackageAcquisitionAuthority,
  WindowsPackageAcquisitionAuthorityBase,
  WindowsSandboxRuntime,
} from './controlledStaticToolchainWindowsLauncherTypes';
import {
  ESBUILD_LOADER_SOURCE,
  ESBUILD_REGISTER_SOURCE,
  ESBUILD_WRAPPER_SOURCE,
  PNPM_BOOTSTRAP_SOURCE,
  WINDOWS_CONTROLLED_ROOT_ENVIRONMENT_NAMES,
  WINDOWS_VITE_COMPATIBILITY_RECEIPT_FORMAT,
  WINDOWS_VITE_COMPATIBILITY_RECEIPT_PATHS,
} from './controlledStaticToolchainWindowsRuntimeSources';

const NODE_PREFIX_ARGUMENTS = Object.freeze([
  '--preserve-symlinks',
  '--preserve-symlinks-main',
]);
const SHA256_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const PROHIBITED_PACKAGE_SOURCE_SCHEMES = Object.freeze([
  'file:',
  'link:',
  'workspace:',
  'git:',
  'git+',
  'github:',
  'http:',
  'https:',
] as const);

const packageFileSetAuthority = async (
  root: string
): Promise<
  Readonly<{
    facts: readonly Readonly<{
      path: string;
      size: number;
      digest: string;
    }>[];
    digest: string;
  }>
> => {
  const facts: Readonly<{ path: string; size: number; digest: string }>[] = [];
  let fileCount = 0;
  let directoryCount = 0;
  let byteCount = 0;
  const visit = async (directory: string): Promise<void> => {
    directoryCount += 1;
    if (directoryCount > 100_000) {
      throw new TypeError(
        'Windows package import exceeds its directory budget.'
      );
    }
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) =>
      compareUnicodeCodePoints(left.name, right.name)
    );
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) {
        throw new TypeError('Windows package import contains a symbolic link.');
      }
      if (stats.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!stats.isFile()) {
        throw new TypeError('Windows package import contains a special file.');
      }
      fileCount += 1;
      byteCount += stats.size;
      if (fileCount > 100_000 || byteCount > 2 * 1024 * 1024 * 1024) {
        throw new TypeError('Windows package import exceeds its file budget.');
      }
      const contents = new Uint8Array(await readFile(path));
      facts.push(
        Object.freeze({
          path: relative(root, path).replaceAll('\\', '/'),
          size: contents.byteLength,
          digest: digestBytes(contents),
        })
      );
    }
  };
  await visit(root);
  return Object.freeze({
    facts: Object.freeze(facts),
    digest: digestBytes(canonicalJsonText(facts)),
  });
};

const packageFileSetDigest = async (root: string): Promise<string> =>
  (await packageFileSetAuthority(root)).digest;

const validateRegistryOnlyLock = (
  lockContents: Buffer
): Readonly<{
  packageCount: number;
  packageResolutionSetDigest: string;
}> => {
  const maximumLockfileBytes = 4_194_304;
  if (
    lockContents.byteLength === 0 ||
    lockContents.byteLength > maximumLockfileBytes
  ) {
    throw new TypeError(
      'Windows package acquisition lockfile exceeds its byte budget.'
    );
  }
  const lockText = lockContents.toString('utf8');
  if (
    !Buffer.from(lockText, 'utf8').equals(lockContents) ||
    lockText.includes('\0') ||
    lockText.includes('\r')
  ) {
    throw new TypeError(
      'Windows package acquisition lockfile encoding drifted.'
    );
  }
  const lines = lockText.split('\n');
  const sectionIndex = (name: string): number => {
    const matches = lines
      .map((line, index) => (line === name ? index : -1))
      .filter((index) => index >= 0);
    if (matches.length !== 1) {
      throw new TypeError(
        'Windows package acquisition lockfile sections drifted.'
      );
    }
    return matches[0]!;
  };
  const importersIndex = sectionIndex('importers:');
  const packagesIndex = sectionIndex('packages:');
  const snapshotsIndex = sectionIndex('snapshots:');
  if (
    lines[0] !== "lockfileVersion: '9.0'" ||
    !(importersIndex < packagesIndex && packagesIndex < snapshotsIndex)
  ) {
    throw new TypeError(
      'Windows package acquisition lockfile version drifted.'
    );
  }
  if (
    lines.some((line) => {
      const sourceValue =
        /^\s+(?:specifier|version|resolution|tarball):\s*(.*)$/iu.exec(
          line
        )?.[1] ?? '';
      const normalizedSource = sourceValue.toLowerCase();
      return (
        normalizedSource.length > 0 &&
        (PROHIBITED_PACKAGE_SOURCE_SCHEMES.some((scheme) =>
          normalizedSource.includes(scheme)
        ) ||
          normalizedSource.includes('tarball:'))
      );
    })
  ) {
    throw new TypeError(
      'Windows package acquisition lockfile contains a non-registry source.'
    );
  }
  const packageEntries: {
    index: number;
    packageId: string;
  }[] = [];
  for (let index = packagesIndex + 1; index < snapshotsIndex; index += 1) {
    const line = lines[index]!;
    const match = /^[ ]{2}(\S.*):$/u.exec(line);
    if (!match) continue;
    const rawPackageId = match[1]!;
    const packageId =
      rawPackageId.startsWith("'") && rawPackageId.endsWith("'")
        ? rawPackageId.slice(1, -1)
        : rawPackageId;
    const versionSeparator = packageId.lastIndexOf('@');
    const packageName = packageId.slice(0, versionSeparator);
    const packageVersion = packageId.slice(versionSeparator + 1);
    if (
      versionSeparator < 1 ||
      !/^(?:@[a-z0-9._~-]+\/[a-z0-9._~-]+|[a-z0-9._~-]+)$/u.test(packageName) ||
      !/^[0-9a-z][0-9a-z._+~-]*$/iu.test(packageVersion)
    ) {
      throw new TypeError(
        'Windows package acquisition lockfile package identity drifted.'
      );
    }
    packageEntries.push({ index, packageId });
  }
  if (packageEntries.length === 0 || packageEntries.length > 10_000) {
    throw new TypeError(
      'Windows package acquisition lockfile package count drifted.'
    );
  }
  const resolutions = packageEntries.map((entry, entryIndex) => {
    const nextIndex = packageEntries[entryIndex + 1]?.index ?? snapshotsIndex;
    const resolutionLines = lines
      .slice(entry.index + 1, nextIndex)
      .filter((line) => line.startsWith('    resolution:'));
    if (resolutionLines.length !== 1) {
      throw new TypeError(
        'Windows package acquisition lockfile resolution drifted.'
      );
    }
    const integrityMatch =
      /^[ ]{4}resolution: \{integrity: sha512-([A-Za-z0-9+/]+={0,2})\}$/u.exec(
        resolutionLines[0]!
      );
    if (!integrityMatch) {
      throw new TypeError(
        'Windows package acquisition lockfile integrity drifted.'
      );
    }
    const integrityBytes = Buffer.from(integrityMatch[1]!, 'base64');
    if (
      integrityBytes.byteLength !== 64 ||
      integrityBytes.toString('base64') !== integrityMatch[1]
    ) {
      throw new TypeError(
        'Windows package acquisition lockfile integrity is not canonical SHA-512.'
      );
    }
    return Object.freeze({
      packageId: entry.packageId,
      integrity: `sha512-${integrityMatch[1]}`,
    });
  });
  return Object.freeze({
    packageCount: resolutions.length,
    packageResolutionSetDigest: digestBytes(canonicalJsonText(resolutions)),
  });
};

const packageTreeDigest = async (
  root: string,
  boundaryRoot: string
): Promise<string> => {
  const facts: Readonly<
    | {
        path: string;
        kind: 'file';
        size: number;
        digest: string;
      }
    | { path: string; kind: 'link'; target: string }
  >[] = [];
  let fileCount = 0;
  let directoryCount = 0;
  let byteCount = 0;
  const normalizedBoundary = resolve(boundaryRoot);
  const insideBoundary = (candidate: string): boolean => {
    const normalized = resolve(candidate);
    const lowerBoundary = normalizedBoundary.toLowerCase();
    const lowerCandidate = normalized.toLowerCase();
    return (
      lowerCandidate === lowerBoundary ||
      lowerCandidate.startsWith(`${lowerBoundary}\\`)
    );
  };
  const visit = async (directory: string): Promise<void> => {
    directoryCount += 1;
    if (directoryCount > 100_000) {
      throw new TypeError('Windows package tree exceeds its directory budget.');
    }
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) =>
      compareUnicodeCodePoints(left.name, right.name)
    );
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      const stats = await lstat(path);
      const relativePath = relative(root, path).replaceAll('\\', '/');
      if (stats.isSymbolicLink()) {
        const rawTarget = await readlink(path);
        const target = resolve(dirname(path), rawTarget);
        if (!insideBoundary(target)) {
          throw new TypeError(
            'Windows package tree contains an escaping link.'
          );
        }
        facts.push(
          Object.freeze({
            path: relativePath,
            kind: 'link' as const,
            target: relative(normalizedBoundary, target).replaceAll('\\', '/'),
          })
        );
        continue;
      }
      if (stats.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!stats.isFile()) {
        throw new TypeError('Windows package tree contains a special file.');
      }
      fileCount += 1;
      byteCount += stats.size;
      if (fileCount > 100_000 || byteCount > 2 * 1024 * 1024 * 1024) {
        throw new TypeError('Windows package tree exceeds its file budget.');
      }
      const contents = new Uint8Array(await readFile(path));
      facts.push(
        Object.freeze({
          path: relativePath,
          kind: 'file' as const,
          size: contents.byteLength,
          digest: digestBytes(contents),
        })
      );
    }
  };
  await visit(root);
  facts.sort((left, right) => compareUnicodeCodePoints(left.path, right.path));
  return digestBytes(canonicalJsonText(facts));
};

const resolveControlledWindowsNode = async (
  expectedVersion: string
): Promise<Readonly<{ path: string; digest: string }>> => {
  const candidates = [
    process.env.PRODIVIX_CONTROLLED_STATIC_NODE_PATH,
    process.versions.node === expectedVersion ? process.execPath : undefined,
    process.env.LOCALAPPDATA
      ? resolve(
          process.env.LOCALAPPDATA,
          `Volta/tools/image/node/${expectedVersion}/node.exe`
        )
      : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    let path: string;
    try {
      path = await realpath(candidate);
      if (basename(path).toLowerCase() !== 'node.exe') continue;
      const { stdout } = await runHostProcess(
        path,
        ['--version'],
        dirname(path),
        { SystemRoot: process.env.SystemRoot },
        15_000
      );
      if (stdout.toString('utf8').trim() !== `v${expectedVersion}`) {
        continue;
      }
      return Object.freeze({
        path,
        digest: digestBytes(new Uint8Array(await readFile(path))),
      });
    } catch {
      continue;
    }
  }
  throw new Error(
    `Windows controlled static toolchain requires an exact Node ${expectedVersion} executable.`
  );
};

export const prepareWindowsSandboxRuntime = async (
  root: string,
  expectedNodeVersion: string,
  manifestDigest: string,
  lockDigest: string
): Promise<WindowsSandboxRuntime> => {
  if (process.platform !== 'win32') {
    throw new Error('Windows sandbox requires the real Node executable.');
  }
  const [manifestContents, lockContents] = await Promise.all([
    readFile(resolve(root, 'package.json')),
    readFile(resolve(root, 'pnpm-lock.yaml')),
  ]);
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestContents.toString('utf8')) as unknown;
  } catch {
    throw new TypeError('Windows package acquisition manifest is invalid.');
  }
  if (
    !isPlainObject(manifest) ||
    manifest.packageManager !== 'pnpm@11.9.0' ||
    digestBytes(manifestContents) !== manifestDigest ||
    digestBytes(lockContents) !== lockDigest
  ) {
    throw new TypeError('Windows package acquisition inputs drifted.');
  }
  const registryLockAuthority = validateRegistryOnlyLock(lockContents);
  const controlledNode =
    await resolveControlledWindowsNode(expectedNodeVersion);
  const runtimeRoot = resolve(root, '.prodivix/windows-runtime');
  const nodePath = resolve(runtimeRoot, 'node.exe');
  const pnpmTargetRoot = resolve(runtimeRoot, 'pnpm');
  await mkdir(runtimeRoot, { recursive: true });
  await copyFile(controlledNode.path, nodePath);
  if (
    digestBytes(new Uint8Array(await readFile(nodePath))) !==
    controlledNode.digest
  ) {
    throw new TypeError(
      'Windows controlled Node binary changed while it was imported.'
    );
  }
  const pnpmPackageRoot = await realpath(
    dirname(createRequire(import.meta.url).resolve('pnpm'))
  );
  if (process.arch !== 'x64') {
    throw new Error(
      'Windows controlled pnpm compatibility policy requires x64.'
    );
  }
  const omittedPnpmPath =
    'dist/node_modules/@reflink/reflink-win32-x64-msvc' as const;
  const originalPnpmFileSetDigest = await packageFileSetDigest(pnpmPackageRoot);
  const omittedFileSetDigest = await packageFileSetDigest(
    resolve(pnpmPackageRoot, omittedPnpmPath)
  );
  await cp(pnpmPackageRoot, pnpmTargetRoot, {
    recursive: true,
    dereference: true,
    force: true,
  });
  const importedOmissionPath = resolve(pnpmTargetRoot, omittedPnpmPath);
  await rm(importedOmissionPath, {
    recursive: true,
    force: false,
    maxRetries: 20,
    retryDelay: 50,
  });
  try {
    await lstat(importedOmissionPath);
    throw new TypeError(
      'Windows pnpm native reflink compatibility omission failed.'
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code !== 'ENOENT') {
      throw error;
    }
  }
  const pnpmBootstrapLogicalPath =
    '.prodivix/windows-runtime/pnpm-bootstrap.mjs' as const;
  await writeFile(
    resolve(root, pnpmBootstrapLogicalPath),
    PNPM_BOOTSTRAP_SOURCE,
    'utf8'
  );
  const pnpmBootstrapDigest = digestBytes(
    new Uint8Array(await readFile(resolve(root, pnpmBootstrapLogicalPath)))
  );
  if (pnpmBootstrapDigest !== digestBytes(PNPM_BOOTSTRAP_SOURCE)) {
    throw new TypeError(
      'Windows controlled pnpm bootstrap changed while it was imported.'
    );
  }
  const esbuildRegisterLogicalPath =
    '.prodivix/windows-runtime/esbuild-register.mjs' as const;
  const esbuildLoaderLogicalPath =
    '.prodivix/windows-runtime/esbuild-loader.mjs' as const;
  const esbuildWrapperLogicalPath =
    '.prodivix/windows-runtime/esbuild-wrapper.mjs' as const;
  await Promise.all([
    writeFile(
      resolve(root, esbuildRegisterLogicalPath),
      ESBUILD_REGISTER_SOURCE,
      'utf8'
    ),
    writeFile(
      resolve(root, esbuildLoaderLogicalPath),
      ESBUILD_LOADER_SOURCE,
      'utf8'
    ),
    writeFile(
      resolve(root, esbuildWrapperLogicalPath),
      ESBUILD_WRAPPER_SOURCE,
      'utf8'
    ),
  ]);
  const [
    esbuildRegisterContents,
    esbuildLoaderContents,
    esbuildWrapperContents,
  ] = await Promise.all([
    readFile(resolve(root, esbuildRegisterLogicalPath)),
    readFile(resolve(root, esbuildLoaderLogicalPath)),
    readFile(resolve(root, esbuildWrapperLogicalPath)),
  ]);
  const esbuildRegisterDigest = digestBytes(esbuildRegisterContents);
  const esbuildLoaderDigest = digestBytes(esbuildLoaderContents);
  const esbuildWrapperDigest = digestBytes(esbuildWrapperContents);
  if (
    esbuildRegisterDigest !== digestBytes(ESBUILD_REGISTER_SOURCE) ||
    esbuildLoaderDigest !== digestBytes(ESBUILD_LOADER_SOURCE) ||
    esbuildWrapperDigest !== digestBytes(ESBUILD_WRAPPER_SOURCE)
  ) {
    throw new TypeError(
      'Windows controlled esbuild loader sources changed while they were imported.'
    );
  }
  const esbuildInProcessSourceAuthority =
    Object.freeze<WindowsEsbuildInProcessSourceAuthority>({
      format: 'prodivix.windows-esbuild-inprocess-authority.v1',
      implementation: 'esbuild-wasm',
      version: '0.27.7',
      aliasSpec: 'npm:esbuild-wasm@0.27.7',
      executionMode: 'in-process',
      api: 'browser',
      worker: false,
      registerLogicalPath: esbuildRegisterLogicalPath,
      registerDigest: esbuildRegisterDigest,
      loaderLogicalPath: esbuildLoaderLogicalPath,
      loaderDigest: esbuildLoaderDigest,
      wrapperLogicalPath: esbuildWrapperLogicalPath,
      wrapperDigest: esbuildWrapperDigest,
      wasmModuleSpecifier: 'esbuild/esbuild.wasm',
      nodeImportArguments: Object.freeze([
        '--import=./.prodivix/windows-runtime/esbuild-register.mjs',
      ]),
      filesystemRealpathMode: 'bounded-identity-no-reparse',
      networkDriveProbeCommand: 'net use',
      networkDriveProbeDisposition: 'denied-without-spawn',
      compatibilityReceiptFormat: WINDOWS_VITE_COMPATIBILITY_RECEIPT_FORMAT,
      controlledRootEnvironmentNames: WINDOWS_CONTROLLED_ROOT_ENVIRONMENT_NAMES,
      compatibilityReceiptPaths: WINDOWS_VITE_COMPATIBILITY_RECEIPT_PATHS,
    });
  const environmentRoot = resolve(root, '.prodivix/windows-environment');
  const acquisitionEnvironment = Object.freeze({
    APPDATA: resolve(environmentRoot, 'appdata'),
    CI: '1',
    HOME: resolve(environmentRoot, 'home'),
    LOCALAPPDATA: resolve(environmentRoot, 'localappdata'),
    NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
    NPM_CONFIG_WORKSPACE_DIR: root,
    SystemRoot:
      process.env.SystemRoot ??
      (() => {
        throw new Error('Windows sandbox has no SystemRoot.');
      })(),
    TEMP: resolve(environmentRoot, 'temp'),
    TMP: resolve(environmentRoot, 'tmp'),
    USERPROFILE: resolve(environmentRoot, 'profile'),
  });
  const acquisitionEnvironmentRecord: Readonly<Record<string, string>> =
    acquisitionEnvironment;
  const rootBoundEnvironmentNames = Object.freeze([
    'APPDATA',
    'HOME',
    'LOCALAPPDATA',
    'NPM_CONFIG_WORKSPACE_DIR',
    'TEMP',
    'TMP',
    'USERPROFILE',
  ]);
  await Promise.all(
    rootBoundEnvironmentNames
      .filter((name) => name !== 'NPM_CONFIG_WORKSPACE_DIR')
      .map((name) =>
        mkdir(acquisitionEnvironmentRecord[name]!, { recursive: true })
      )
  );
  const pnpmLogicalPath =
    '.prodivix/windows-runtime/pnpm/bin/pnpm.mjs' as const;
  const environmentAuthority = (source: Readonly<Record<string, string>>) => {
    const keys = Object.freeze(
      Object.keys(source).sort(compareUnicodeCodePoints)
    );
    const entries = Object.freeze(
      keys.map((key) =>
        Object.freeze({
          key,
          value: rootBoundEnvironmentNames.includes(key)
            ? `source:/${relative(root, source[key]!).replaceAll('\\', '/')}`
            : source[key]!,
        })
      )
    );
    return Object.freeze({
      keys,
      entries,
      digest: digestBytes(canonicalJsonText(entries)),
    });
  };
  const acquisitionEnvironmentAuthority = environmentAuthority(
    acquisitionEnvironment
  );
  const environment = Object.freeze({
    ...acquisitionEnvironment,
    NPM_CONFIG_FETCH_RETRIES: '0',
    NPM_CONFIG_NODE_LINKER: 'hoisted',
    NPM_CONFIG_OFFLINE: 'true',
    NPM_CONFIG_PACKAGE_IMPORT_METHOD: 'copy',
    NPM_CONFIG_TRUST_LOCKFILE: 'true',
  });
  const sandboxEnvironmentAuthority = environmentAuthority(environment);
  const fetchArgs = Object.freeze([
    ...NODE_PREFIX_ARGUMENTS,
    pnpmLogicalPath,
    'fetch',
    '--frozen-lockfile',
    '--ignore-scripts',
    '--node-linker=hoisted',
    '--store-dir=.prodivix/pnpm-store',
    '--registry=https://registry.npmjs.org/',
  ]);
  const fetchResult = await runHostProcess(
    controlledNode.path,
    fetchArgs,
    root,
    acquisitionEnvironment,
    60_000
  );
  const runtimeFileSetDigest = await packageFileSetDigest(runtimeRoot);
  const storeFileSetDigest = await packageFileSetDigest(
    resolve(root, '.prodivix/pnpm-store')
  );
  const virtualStoreFileSetDigest = await packageTreeDigest(
    resolve(root, 'node_modules'),
    root
  );
  const acquisitionAuthorityBase =
    Object.freeze<WindowsPackageAcquisitionAuthorityBase>({
      format: 'prodivix.windows-package-acquisition-authority.v1' as const,
      provider: 'windows-trusted-host-fetch' as const,
      environment: Object.freeze({
        keys: acquisitionEnvironmentAuthority.keys,
        digest: acquisitionEnvironmentAuthority.digest,
      }),
      command: Object.freeze({
        stage: 'fetch' as const,
        application: 'node' as const,
        args: fetchArgs,
        cwd: 'controller:/' as const,
        environmentDigest: acquisitionEnvironmentAuthority.digest,
        tool: Object.freeze({
          binary: 'pnpm-fetch',
          version: '11.9.0',
        }),
        startedAtEpochMs: fetchResult.startedAtEpochMs,
        completedAtEpochMs: fetchResult.completedAtEpochMs,
        stdout: Object.freeze({
          digest: digestBytes(fetchResult.stdout),
          byteLength: fetchResult.stdout.byteLength,
        }),
        stderr: Object.freeze({
          digest: digestBytes(fetchResult.stderr),
          byteLength: fetchResult.stderr.byteLength,
        }),
      }),
      packageManager: 'pnpm@11.9.0' as const,
      manifestDigest,
      lockDigest,
      registryPolicy: Object.freeze({
        format: 'prodivix.windows-registry-policy.v1' as const,
        registry: 'https://registry.npmjs.org/' as const,
        hostFetchBoundary: 'trusted-controller' as const,
        hostNetworkIsolationClaimed: false as const,
        sandboxInstallNetworkMode: 'offline' as const,
        resolutionPolicy: 'registry-integrity-only' as const,
        lockfileVersion: '9.0' as const,
        integrityAlgorithm: 'sha512' as const,
        packageCount: registryLockAuthority.packageCount,
        packageResolutionSetDigest:
          registryLockAuthority.packageResolutionSetDigest,
        prohibitedSourceSchemes: PROHIBITED_PACKAGE_SOURCE_SCHEMES,
        maximumLockfileBytes: 4_194_304 as const,
      }),
      compatibilityOmission: Object.freeze({
        format: 'prodivix.windows-pnpm-compatibility-omission.v1' as const,
        platform: 'win32-x64' as const,
        omittedPath: omittedPnpmPath,
        originalPnpmFileSetDigest,
        omittedFileSetDigest,
        nativeModuleAbsent: true as const,
      }),
      nodeVersion: expectedNodeVersion,
      nodeBinaryDigest: controlledNode.digest,
      pnpmVersion: '11.9.0',
      pnpmBootstrapDigest,
      runtimeFileSetDigest,
      storeFileSetDigest,
      virtualStoreFileSetDigest,
    });
  return Object.freeze({
    nodePath,
    nodeLogicalPath: '.prodivix/windows-runtime/node.exe',
    nodeVersion: expectedNodeVersion,
    nodeBinaryDigest: controlledNode.digest,
    pnpmBootstrapLogicalPath,
    pnpmBootstrapDigest,
    esbuildRegisterLogicalPath,
    esbuildInProcessSourceAuthority,
    acquisitionAuthorityBase,
    sandboxEnvironmentAuthorityDigest: sandboxEnvironmentAuthority.digest,
    environment,
  });
};

const readWindowsRuntimeRegularFile = async (
  root: string,
  logicalPath: string,
  label: string
): Promise<Uint8Array> => {
  const path = resolve(root, logicalPath);
  const stats = await lstat(path);
  const resolvedPath = await realpath(path);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    resolvedPath.toLowerCase() !== path.toLowerCase()
  ) {
    throw new TypeError(`${label} is not an exact regular file.`);
  }
  return new Uint8Array(await readFile(path));
};

const readWindowsEsbuildWasm = async (root: string): Promise<Uint8Array> => {
  const packageContents = await readWindowsRuntimeRegularFile(
    root,
    'node_modules/esbuild/package.json',
    'Windows controlled esbuild package manifest'
  );
  let packageManifest: unknown;
  try {
    packageManifest = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(packageContents)
    ) as unknown;
  } catch {
    throw new TypeError(
      'Windows controlled esbuild package manifest is invalid.'
    );
  }
  if (
    !isPlainObject(packageManifest) ||
    packageManifest.name !== 'esbuild-wasm' ||
    packageManifest.version !== '0.27.7'
  ) {
    throw new TypeError('Windows controlled esbuild package identity drifted.');
  }
  const wasm = await readWindowsRuntimeRegularFile(
    root,
    'node_modules/esbuild/esbuild.wasm',
    'Windows controlled esbuild WASM module'
  );
  if (wasm.byteLength === 0 || wasm.byteLength > 64 * 1024 * 1024) {
    throw new TypeError(
      'Windows controlled esbuild WASM module exceeds its byte budget.'
    );
  }
  return wasm;
};

export const verifyWindowsEsbuildInProcessAuthority = async (
  root: string,
  authority: WindowsEsbuildInProcessAuthority
): Promise<void> => {
  const [register, loader, wrapper, wasm] = await Promise.all([
    readWindowsRuntimeRegularFile(
      root,
      authority.registerLogicalPath,
      'Windows controlled esbuild register module'
    ),
    readWindowsRuntimeRegularFile(
      root,
      authority.loaderLogicalPath,
      'Windows controlled esbuild loader module'
    ),
    readWindowsRuntimeRegularFile(
      root,
      authority.wrapperLogicalPath,
      'Windows controlled esbuild wrapper module'
    ),
    readWindowsEsbuildWasm(root),
  ]);
  if (
    digestBytes(register) !== authority.registerDigest ||
    digestBytes(loader) !== authority.loaderDigest ||
    digestBytes(wrapper) !== authority.wrapperDigest ||
    digestBytes(wasm) !== authority.wasmDigest ||
    wasm.byteLength !== authority.wasmByteLength ||
    canonicalJsonText(authority.nodeImportArguments) !==
      canonicalJsonText([
        '--import=./.prodivix/windows-runtime/esbuild-register.mjs',
      ]) ||
    authority.filesystemRealpathMode !== 'bounded-identity-no-reparse' ||
    authority.networkDriveProbeCommand !== 'net use' ||
    authority.networkDriveProbeDisposition !== 'denied-without-spawn' ||
    authority.compatibilityReceiptFormat !==
      WINDOWS_VITE_COMPATIBILITY_RECEIPT_FORMAT ||
    canonicalJsonText(authority.controlledRootEnvironmentNames) !==
      canonicalJsonText(WINDOWS_CONTROLLED_ROOT_ENVIRONMENT_NAMES) ||
    canonicalJsonText(authority.compatibilityReceiptPaths) !==
      canonicalJsonText(WINDOWS_VITE_COMPATIBILITY_RECEIPT_PATHS)
  ) {
    throw new TypeError(
      'Windows controlled esbuild in-process authority drifted.'
    );
  }
};

export const finalizeWindowsSandboxRuntimeAuthority = async (
  root: string,
  runtime: WindowsSandboxRuntime
): Promise<FinalizedWindowsSandboxRuntimeAuthority> => {
  const wasm = await readWindowsEsbuildWasm(root);
  const esbuildInProcessAuthority =
    Object.freeze<WindowsEsbuildInProcessAuthority>({
      ...runtime.esbuildInProcessSourceAuthority,
      wasmDigest: digestBytes(wasm),
      wasmByteLength: wasm.byteLength,
    });
  await verifyWindowsEsbuildInProcessAuthority(root, esbuildInProcessAuthority);
  const acquisitionBase = Object.freeze({
    ...runtime.acquisitionAuthorityBase,
    esbuildInProcess: esbuildInProcessAuthority,
  });
  const acquisitionAuthority =
    Object.freeze<WindowsPackageAcquisitionAuthority>({
      ...acquisitionBase,
      receiptDigest: digestBytes(canonicalJsonText(acquisitionBase)),
    });
  const packageImportDigest = digestBytes(
    canonicalJsonText({
      acquisitionReceiptDigest: acquisitionAuthority.receiptDigest,
      runtimeFileSetDigest: acquisitionAuthority.runtimeFileSetDigest,
      storeFileSetDigest: acquisitionAuthority.storeFileSetDigest,
      virtualStoreFileSetDigest: acquisitionAuthority.virtualStoreFileSetDigest,
      sandboxEnvironmentDigest: runtime.sandboxEnvironmentAuthorityDigest,
    })
  );
  return Object.freeze({
    esbuildInProcessAuthority,
    acquisitionAuthority,
    packageImportDigest,
  });
};

const decodeOutput = (
  value: unknown,
  label: string
): WindowsAppContainerLaunchReceipt['process']['stdout'] => {
  const record = exactRecord(
    value,
    ['text', 'digest', 'byteLength', 'truncated'],
    label
  );
  const text = record.text;
  if (
    typeof text !== 'string' ||
    typeof record.byteLength !== 'number' ||
    !Number.isSafeInteger(record.byteLength) ||
    record.byteLength < 0 ||
    record.truncated !== false ||
    record.byteLength !== Buffer.byteLength(text, 'utf8') ||
    record.digest !== digestBytes(text)
  ) {
    throw new TypeError(`${label} drifted.`);
  }
  return Object.freeze({
    text,
    digest: record.digest as string,
    byteLength: record.byteLength,
    truncated: false,
  });
};

export const runWindowsAppContainerLaunch = async (
  root: string,
  stage: string,
  application: string,
  args: readonly string[],
  environment: Readonly<Record<string, string>>,
  resultPaths: readonly string[],
  timeoutMs: number
): Promise<WindowsAppContainerLaunchReceipt> => {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > WINDOWS_MAXIMUM_COMMAND_TIMEOUT_MS
  ) {
    throw new TypeError(
      'Windows AppContainer command timeout must be at most 60 seconds.'
    );
  }
  const launcher = await prepareWindowsLauncherAuthority();
  const profileName = `Prodivix.Static.${stage}.${randomUUID().slice(0, 8)}`;
  const request = canonicalJsonText({
    format: 'prodivix.windows-appcontainer-launch-request.v1',
    profileName,
    root,
    application,
    arguments: args,
    environment,
    resultPaths,
    timeoutMilliseconds: timeoutMs,
    maximumOutputBytes: 4 * 1024 * 1024,
  });
  const requestPath = resolve(root, `.prodivix/windows-launch-${stage}.json`);
  await writeFile(requestPath, request, 'utf8');
  const startedAtEpochMs = Date.now();
  const { stdout, stderr } = await runHostProcess(
    launcher.dotnetPath,
    [launcher.assemblyPath, requestPath],
    root,
    dotnetHostEnvironment(),
    timeoutMs + WINDOWS_LAUNCHER_CLEANUP_GRACE_MS
  );
  if (stderr.byteLength > 0) {
    process.stderr.write(stderr);
  }
  const completedAtEpochMs = Date.now();
  let value: unknown;
  try {
    value = JSON.parse(stdout.toString('utf8')) as unknown;
  } catch {
    throw new TypeError('Windows AppContainer launcher returned invalid JSON.');
  }
  const result = exactRecord(
    value,
    ['format', 'requestDigest', 'provider', 'appContainer', 'job', 'process'],
    'Windows AppContainer result'
  );
  const appContainer = exactRecord(
    result.appContainer,
    [
      'profileName',
      'profileSid',
      'tokenIsAppContainer',
      'tokenSidMatched',
      'tokenCapabilityCount',
      'capabilities',
      'profileStorageBound',
    ],
    'Windows AppContainer token'
  );
  const job = exactRecord(
    result.job,
    [
      'killOnClose',
      'activeProcessLimit',
      'totalProcesses',
      'activeProcesses',
      'terminatedProcesses',
      'processTreeClean',
    ],
    'Windows AppContainer Job'
  );
  const processReceipt = exactRecord(
    result.process,
    [
      'application',
      'arguments',
      'workingDirectory',
      'environmentDigest',
      'exitCode',
      'signal',
      'timedOut',
      'stdout',
      'stderr',
    ],
    'Windows AppContainer process'
  );
  const profileRoot = processReceipt.workingDirectory;
  const mapped = (valueToMap: string): string =>
    valueToMap.replaceAll(root, profileRoot as string);
  const environmentDigest =
    typeof profileRoot === 'string'
      ? expectedMappedEnvironmentDigest(root, profileRoot, environment)
      : undefined;
  const drift: string[] = [];
  const expect = (condition: boolean, label: string): void => {
    if (!condition) drift.push(label);
  };
  expect(
    result.format === 'prodivix.windows-appcontainer-launch-result.v1',
    'format'
  );
  expect(result.provider === 'windows-appcontainer', 'provider');
  expect(result.requestDigest === digestBytes(request), 'requestDigest');
  expect(appContainer.profileName === profileName, 'profileName');
  expect(typeof appContainer.profileSid === 'string', 'profileSid');
  expect(appContainer.tokenIsAppContainer === true, 'tokenType');
  expect(appContainer.tokenSidMatched === true, 'tokenSid');
  expect(appContainer.tokenCapabilityCount === 0, 'tokenCapabilities');
  expect(
    Array.isArray(appContainer.capabilities) &&
      appContainer.capabilities.length === 0,
    'capabilitySet'
  );
  expect(appContainer.profileStorageBound === true, 'profileStorage');
  expect(job.killOnClose === true, 'jobKillOnClose');
  expect(
    Number.isSafeInteger(job.activeProcessLimit) &&
      (job.activeProcessLimit as number) >= 1,
    'jobProcessLimit'
  );
  expect(Number.isSafeInteger(job.totalProcesses), 'jobTotalProcesses');
  expect(
    Number.isSafeInteger(job.terminatedProcesses),
    'jobTerminatedProcesses'
  );
  expect(job.activeProcesses === 0, 'jobActiveProcesses');
  expect(job.processTreeClean === true, 'jobCleanup');
  expect(typeof profileRoot === 'string', 'workingDirectory');
  expect(processReceipt.application === mapped(application), 'application');
  expect(
    canonicalJsonText(processReceipt.arguments) ===
      canonicalJsonText(args.map(mapped)),
    'arguments'
  );
  expect(Number.isSafeInteger(processReceipt.exitCode), 'exitCode');
  expect(processReceipt.signal === null, 'signal');
  expect(typeof processReceipt.timedOut === 'boolean', 'timeout');
  expect(
    typeof processReceipt.environmentDigest === 'string' &&
      SHA256_PATTERN.test(processReceipt.environmentDigest),
    'environmentDigestFormat'
  );
  expect(
    processReceipt.environmentDigest === environmentDigest,
    'environmentDigest'
  );
  if (drift.length) {
    throw new TypeError(
      `Windows AppContainer result failed closed: ${drift.join(', ')}.`
    );
  }
  return Object.freeze({
    requestDigest: result.requestDigest as string,
    startedAtEpochMs,
    completedAtEpochMs,
    profileRoot: profileRoot as string,
    appContainer: Object.freeze({
      profileName,
      profileSid: appContainer.profileSid as string,
      tokenIsAppContainer: true as const,
      tokenSidMatched: true as const,
      tokenCapabilityCount: 0 as const,
      capabilities: Object.freeze([] as const),
      profileStorageBound: true as const,
    }),
    job: Object.freeze({
      killOnClose: true as const,
      activeProcessLimit: job.activeProcessLimit as number,
      totalProcesses: job.totalProcesses as number,
      activeProcesses: 0 as const,
      terminatedProcesses: job.terminatedProcesses as number,
      processTreeClean: true as const,
    }),
    process: Object.freeze({
      environmentDigest: processReceipt.environmentDigest as string,
      exitCode: processReceipt.exitCode as number,
      signal: null,
      timedOut: processReceipt.timedOut as boolean,
      stdout: decodeOutput(
        processReceipt.stdout,
        'Windows AppContainer stdout'
      ),
      stderr: decodeOutput(
        processReceipt.stderr,
        'Windows AppContainer stderr'
      ),
    }),
  });
};

export { NODE_PREFIX_ARGUMENTS, prepareWindowsLauncherAuthority };
export type {
  FinalizedWindowsSandboxRuntimeAuthority,
  WindowsAppContainerLaunchReceipt,
  WindowsEsbuildInProcessAuthority,
  WindowsEsbuildInProcessSourceAuthority,
  WindowsLauncherAuthority,
  WindowsPackageAcquisitionAuthority,
  WindowsPackageAcquisitionAuthorityBase,
  WindowsSandboxRuntime,
} from './controlledStaticToolchainWindowsLauncherTypes';
