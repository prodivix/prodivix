export const WINDOWS_CONTROLLED_ROOT_ENVIRONMENT_NAMES = Object.freeze([
  'APPDATA',
  'HOME',
  'LOCALAPPDATA',
  'TEMP',
  'TMP',
  'USERPROFILE',
] as const);

export const WINDOWS_VITE_COMPATIBILITY_RECEIPT_FORMAT =
  'prodivix.windows-vite-filesystem-compatibility-receipt.v1' as const;

export type WindowsViteCompatibilityConsumer = 'build' | 'test';

export const WINDOWS_VITE_COMPATIBILITY_RECEIPT_PATHS = Object.freeze({
  build: '.prodivix/windows-runtime/build-vite-compatibility-receipt.json',
  test: '.prodivix/windows-runtime/test-vite-compatibility-receipt.json',
} as const);

export const windowsViteCompatibilityReceipt = (
  consumer: WindowsViteCompatibilityConsumer
) =>
  Object.freeze({
    format: WINDOWS_VITE_COMPATIBILITY_RECEIPT_FORMAT,
    consumer,
    filesystemRealpathMode: 'bounded-identity-no-reparse' as const,
    networkDriveProbeCommand: 'net use' as const,
    networkDriveProbeDisposition: 'denied-without-spawn' as const,
    controlledRootEnvironmentNames: WINDOWS_CONTROLLED_ROOT_ENVIRONMENT_NAMES,
  });

export const PNPM_FS_BOUNDARY_SOURCE = `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { isAbsolute, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(process.cwd());
const controlledEnvironmentNames = [
  'APPDATA',
  'HOME',
  'LOCALAPPDATA',
  'TEMP',
  'TMP',
  'USERPROFILE',
];
const containsPath = (root, candidate) => {
  const relation = relative(root, candidate);
  return relation === '' ||
    (!isAbsolute(relation) &&
      relation !== '..' &&
      !relation.startsWith(\`..\${sep}\`));
};
const workspaceEnvironmentBound =
  resolve(process.env.NPM_CONFIG_WORKSPACE_DIR ?? '').toLowerCase() ===
  workspaceRoot.toLowerCase();
if (!workspaceEnvironmentBound) {
  throw new Error(
    'AppContainer workspace environment is not bound.'
  );
}
const controlledRoots = controlledEnvironmentNames.map((name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error('AppContainer profile environment is incomplete.');
  }
  const root = resolve(value);
  if (
    !/^[A-Za-z]:\\\\/u.test(root) ||
    root.toLowerCase() === parse(root).root.toLowerCase()
  ) {
    throw new Error('AppContainer profile root is not bounded.');
  }
  return root;
});
controlledRoots.push(workspaceRoot);
const sourcePath = (value) =>
  value instanceof URL
    ? fileURLToPath(value)
    : Buffer.isBuffer(value)
      ? value.toString('utf8')
      : String(value);
const resolveControlledPath = (value) => {
  const candidate = resolve(sourcePath(value));
  if (!controlledRoots.some((root) => containsPath(root, candidate))) {
    throw new Error('realpath escaped the controlled AppContainer roots.');
  }
  return candidate;
};
const encodedPath = (value, options) => {
  const resolved = resolveControlledPath(value);
  const encoding =
    typeof options === 'string' ? options : options?.encoding;
  return encoding === 'buffer' ? Buffer.from(resolved) : resolved;
};
const controlledRealpathSync = (value, options) =>
  encodedPath(value, options);
controlledRealpathSync.native = controlledRealpathSync;
const controlledRealpath = (value, options, callback) => {
  const complete = typeof options === 'function' ? options : callback;
  if (typeof complete !== 'function') {
    throw new TypeError('realpath callback is required.');
  }
  queueMicrotask(() => {
    try {
      complete(null, encodedPath(value, options));
    } catch (error) {
      complete(error);
    }
  });
};
controlledRealpath.native = controlledRealpath;
const controlledPromiseRealpath = async (value, options) =>
  encodedPath(value, options);
fs.realpathSync = controlledRealpathSync;
fs.realpath = controlledRealpath;
fs.promises.realpath = controlledPromiseRealpath;
syncBuiltinESMExports();

Object.defineProperty(
  globalThis,
  Symbol.for('__RESOLVED_TEMP_DIRECTORY__'),
  {
    value: '.prodivix/windows-environment/temp',
    configurable: false,
    enumerable: false,
    writable: false,
  }
);
`;

export const PNPM_BOOTSTRAP_SOURCE = `${PNPM_FS_BOUNDARY_SOURCE}
import { pathToFileURL } from 'node:url';

const entry = fileURLToPath(
  new URL('./pnpm/bin/pnpm.mjs', import.meta.url)
);
process.argv = [process.execPath, entry, ...process.argv.slice(2)];
await import(pathToFileURL(entry).href);
`;

export const ESBUILD_REGISTER_SOURCE = `import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { register, syncBuiltinESMExports } from 'node:module';
import { dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread } from 'node:worker_threads';

const workspaceRoot = resolve(process.cwd());
const controlledRootEnvironmentNames = [
  'APPDATA',
  'HOME',
  'LOCALAPPDATA',
  'TEMP',
  'TMP',
  'USERPROFILE',
];
if (
  resolve(process.env.NPM_CONFIG_WORKSPACE_DIR ?? '').toLowerCase() !==
  workspaceRoot.toLowerCase()
) {
  throw new Error('AppContainer workspace environment is not bound.');
}
const containsPath = (root, candidate) => {
  const relation = relative(root, candidate);
  return relation === '' ||
    (!isAbsolute(relation) &&
      relation !== '..' &&
      !relation.startsWith('..' + sep));
};
const controlledRoots = controlledRootEnvironmentNames.map((name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error('AppContainer profile environment is incomplete.');
  }
  const root = resolve(value);
  if (
    !/^[A-Za-z]:\\\\/u.test(root) ||
    root.toLowerCase() === parse(root).root.toLowerCase()
  ) {
    throw new Error('AppContainer profile root is not bounded.');
  }
  return root;
});
controlledRoots.push(workspaceRoot);
const sourcePath = (value) =>
  value instanceof URL
    ? fileURLToPath(value)
    : Buffer.isBuffer(value)
      ? value.toString('utf8')
      : String(value);
const resolveControlledPath = (value) => {
  const candidate = resolve(sourcePath(value));
  const boundary = controlledRoots.find((root) =>
    containsPath(root, candidate)
  );
  if (!boundary) {
    throw new Error('realpath escaped the controlled AppContainer roots.');
  }
  let current = candidate;
  while (true) {
    const stats = fs.lstatSync(current);
    if (stats.isSymbolicLink()) {
      throw new Error('realpath encountered a symbolic link.');
    }
    if (current.toLowerCase() === boundary.toLowerCase()) break;
    current = dirname(current);
  }
  return candidate;
};
const encodedPath = (value, options) => {
  const resolved = resolveControlledPath(value);
  const encoding =
    typeof options === 'string' ? options : options?.encoding;
  return encoding === 'buffer' ? Buffer.from(resolved) : resolved;
};
const controlledRealpathSync = (value, options) =>
  encodedPath(value, options);
controlledRealpathSync.native = controlledRealpathSync;
const controlledRealpath = (value, options, callback) => {
  const complete = typeof options === 'function' ? options : callback;
  if (typeof complete !== 'function') {
    throw new TypeError('realpath callback is required.');
  }
  queueMicrotask(() => {
    try {
      complete(null, encodedPath(value, options));
    } catch (error) {
      complete(error);
    }
  });
};
controlledRealpath.native = controlledRealpath;
const controlledPromiseRealpath = async (value, options) =>
  encodedPath(value, options);
fs.realpathSync = controlledRealpathSync;
fs.realpath = controlledRealpath;
fs.promises.realpath = controlledPromiseRealpath;

const normalizedEntry = String(process.argv[1] ?? '').replaceAll('\\\\', '/');
const consumer =
  normalizedEntry.endsWith('/node_modules/vite/bin/vite.js')
    ? 'build'
    : normalizedEntry.endsWith('/node_modules/vitest/vitest.mjs')
      ? 'test'
      : undefined;
if (isMainThread && consumer) {
  const receipt = {
    format: 'prodivix.windows-vite-filesystem-compatibility-receipt.v1',
    consumer,
    filesystemRealpathMode: 'bounded-identity-no-reparse',
    networkDriveProbeCommand: 'net use',
    networkDriveProbeDisposition: 'denied-without-spawn',
    controlledRootEnvironmentNames,
  };
  const receiptPath = resolve(
    workspaceRoot,
    '.prodivix/windows-runtime/' +
      consumer +
      '-vite-compatibility-receipt.json'
  );
  const originalExec = childProcess.exec;
  let networkDriveProbeConsumed = false;
  childProcess.exec = function (...args) {
    if (
      !networkDriveProbeConsumed &&
      args.length === 2 &&
      args[0] === 'net use' &&
      typeof args[1] === 'function'
    ) {
      networkDriveProbeConsumed = true;
      fs.writeFileSync(receiptPath, JSON.stringify(receipt), 'utf8');
      const callback = args[1];
      const child = new EventEmitter();
      child.pid = undefined;
      child.kill = () => false;
      childProcess.exec = originalExec;
      syncBuiltinESMExports();
      queueMicrotask(() => {
        const error = Object.assign(
          new Error(
            'The controlled AppContainer does not permit network-drive discovery.'
          ),
          { code: 'EPERM' }
        );
        callback(error, '', '');
        child.emit('close', 1, null);
      });
      return child;
    }
    return originalExec.apply(this, args);
  };
}
syncBuiltinESMExports();

if (isMainThread) {
  register(new URL('./esbuild-loader.mjs', import.meta.url));
}
`;

export const ESBUILD_LOADER_SOURCE = `const wrapperUrl =
  new URL('./esbuild-wrapper.mjs', import.meta.url).href;

export const resolve = async (specifier, context, nextResolve) =>
  specifier === 'esbuild'
    ? { shortCircuit: true, url: wrapperUrl }
    : nextResolve(specifier, context);
`;

export const ESBUILD_WRAPPER_SOURCE = `import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const hadFs = Object.hasOwn(globalThis, 'fs');
const originalFs = globalThis.fs;
const hadSelf = Object.hasOwn(globalThis, 'self');
const originalSelf = globalThis.self;
let api;
try {
  delete globalThis.fs;
  globalThis.self = globalThis;
  api = await import('esbuild/esm/browser.js');
  const wasmPath = createRequire(import.meta.url).resolve(
    'esbuild/esbuild.wasm'
  );
  const wasmModule = await WebAssembly.compile(await readFile(wasmPath));
  await api.initialize({ wasmModule, worker: false });
} finally {
  if (hadFs) globalThis.fs = originalFs;
  else delete globalThis.fs;
  if (hadSelf) globalThis.self = originalSelf;
  else delete globalThis.self;
}
if (api.version !== '0.27.7') {
  throw new Error('Controlled esbuild-wasm version drifted.');
}
await api.transform(
  'export const __prodivixEsbuildInProcessProbe = true;',
  { loader: 'js' }
);

export const analyzeMetafile = api.analyzeMetafile;
export const analyzeMetafileSync = api.analyzeMetafileSync;
export const build = api.build;
export const buildSync = api.buildSync;
export const context = api.context;
export const formatMessages = api.formatMessages;
export const formatMessagesSync = api.formatMessagesSync;
export const initialize = api.initialize;
export const stop = api.stop;
export const transform = api.transform;
export const transformSync = api.transformSync;
export const version = api.version;
export default api.default;
`;
