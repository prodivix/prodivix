import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectSnapshot,
  type ExecutionSourceTrace,
} from '@prodivix/runtime-core';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import type { ControlledStaticToolchainAuthorityReceipt } from './controlledStaticToolchainProtocol';
import {
  runControlledStaticToolchainSandbox,
  type ControlledStaticToolchainSandboxAuthority,
} from './controlledStaticToolchainSandbox';

const MAXIMUM_COMMAND_ARGUMENTS = 256;
const CONTROLLED_PNPM_VERSION = '11.9.0';
const CONTROLLED_NODE_VERSION = '22.23.1';
const CONTROLLED_ROLLUP_VERSION = '4.62.3';
const CONTROLLED_ROLLUP_IMPLEMENTATION = '@rollup/wasm-node' as const;
const CONTROLLED_ROLLUP_ALIAS_SPEC = 'npm:@rollup/wasm-node@4.62.3' as const;
const CONTROLLED_ESBUILD_VERSION = '0.27.7';
const CONTROLLED_ESBUILD_IMPLEMENTATION = 'esbuild-wasm' as const;
const CONTROLLED_ESBUILD_ALIAS_SPEC = 'npm:esbuild-wasm@0.27.7' as const;

export type ControlledRuntimeFile = Readonly<{
  path: string;
  contents: string | Uint8Array;
  sourceTrace?: readonly ExecutionSourceTrace[];
}>;

export type ControlledStaticToolchainExecution = Readonly<{
  root: string;
  testProviderRoot: string;
  buildProviderRoot: string;
  runtimeFiles: readonly ControlledRuntimeFile[];
  buildLog: string;
  vitestVersion: string;
  testExitCode: number;
  buildExitCode: number;
  authorityReceipt: ControlledStaticToolchainAuthorityReceipt;
}>;

type ControlledToolchainAuthority = ControlledStaticToolchainSandboxAuthority &
  Readonly<{
    packageContents: string;
    lockContents: Uint8Array;
    workspaceContents: string;
    viteConfigContents: string;
    isolationProbeContents: string;
  }>;

export const resolveControlledOutputPath = (
  root: string,
  path: string
): string => {
  const target = resolve(root, path);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new TypeError('Controlled static toolchain path escaped its root.');
  }
  return target;
};

const writeFiles = async (
  root: string,
  files: readonly ControlledRuntimeFile[]
): Promise<void> => {
  for (const file of files) {
    const target = resolveControlledOutputPath(root, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.contents);
  }
};

const commandArgs = (
  value: unknown,
  expectedFirst: string,
  label: string
): readonly string[] => {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAXIMUM_COMMAND_ARGUMENTS
  ) {
    throw new TypeError(`${label} must be a bounded argument array.`);
  }
  const args = value.map((entry, index) => {
    if (
      typeof entry !== 'string' ||
      !entry ||
      entry !== entry.trim() ||
      // eslint-disable-next-line no-control-regex -- command controls are forbidden
      /[\u0000-\u001f\u007f]/u.test(entry) ||
      entry.length > 16_384
    ) {
      throw new TypeError(`${label}[${index}] is invalid.`);
    }
    return entry;
  });
  if (
    args[0] !== expectedFirst &&
    !(args[0] === 'run' && args[1] === expectedFirst)
  ) {
    throw new TypeError(
      `${label} must invoke the controlled ${expectedFirst} script.`
    );
  }
  return Object.freeze(args);
};

const snapshotCommandArgs = (
  command: ExecutableProjectSnapshot['buildCommand'],
  expectedFirst: string,
  label: string
): readonly string[] => {
  const args =
    command.command === 'pnpm'
      ? (command.args ?? [])
      : command.command === 'corepack' && command.args?.[0] === 'pnpm'
        ? command.args.slice(1)
        : undefined;
  if (!args) {
    throw new TypeError(`${label} must be controlled by pinned pnpm.`);
  }
  return commandArgs(args, expectedFirst, label);
};

const exactRecord = (
  value: unknown,
  keys: readonly string[],
  label: string
): Record<string, unknown> => {
  if (
    !isPlainObject(value) ||
    keys.some((key) => !(key in value)) ||
    Object.keys(value).some((key) => !keys.includes(key))
  ) {
    throw new TypeError(`${label} has unknown or missing fields.`);
  }
  return value;
};

const stringRecord = (
  value: unknown,
  label: string
): Readonly<Record<string, string>> => {
  if (
    !isPlainObject(value) ||
    Object.keys(value).some(
      (key) =>
        !key ||
        key !== key.trim() ||
        typeof value[key] !== 'string' ||
        !(value[key] as string)
    )
  ) {
    throw new TypeError(`${label} must contain exact dependency strings.`);
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0
      )
    ) as Record<string, string>
  );
};

const parseJsonObject = (
  source: string,
  label: string
): Record<string, unknown> => {
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch {
    throw new TypeError(`${label} is invalid JSON.`);
  }
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
};

const digestBytes = (contents: string | Uint8Array): string =>
  `sha256-${createHash('sha256').update(contents).digest('hex')}`;

const readSnapshotManifest = (
  snapshot: ExecutableProjectSnapshot
): Record<string, unknown> => {
  const manifest = snapshot.files.find(
    ({ path }) => path === snapshot.dependencyPlan.manifestFilePath
  );
  if (!manifest || typeof manifest.contents !== 'string') {
    throw new TypeError(
      'Controlled executable snapshot has no textual dependency manifest.'
    );
  }
  return parseJsonObject(
    manifest.contents,
    'Controlled executable snapshot dependency manifest'
  );
};

const controlledAuthorityRoot = (presetId: string): string => {
  if (presetId !== 'react-vite' && presetId !== 'vue-vite') {
    throw new TypeError(
      'Controlled static toolchain target has no adopted authority.'
    );
  }
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    'toolchains',
    presetId
  );
};

const loadControlledToolchainAuthority = async (
  snapshot: ExecutableProjectSnapshot
): Promise<ControlledToolchainAuthority> => {
  const root = controlledAuthorityRoot(snapshot.target.presetId);
  const [
    controlSource,
    exactManifestSource,
    lockSource,
    workspaceContents,
    viteConfigContents,
    isolationProbeContents,
  ] = await Promise.all([
    readFile(resolve(root, 'control.json'), 'utf8'),
    readFile(resolve(root, 'package.json'), 'utf8'),
    readFile(resolve(root, 'pnpm-lock.yaml')),
    readFile(resolve(root, 'pnpm-workspace.yaml'), 'utf8'),
    readFile(resolve(root, 'controlled-vite.config.mjs'), 'utf8'),
    readFile(resolve(root, '..', 'isolationProbe.mjs'), 'utf8'),
  ]);
  const control = exactRecord(
    parseJsonObject(controlSource, 'Controlled static toolchain authority'),
    [
      'format',
      'targetPresetId',
      'packageManager',
      'expectedScripts',
      'expectedDependencies',
      'expectedDevDependencies',
    ],
    'Controlled static toolchain authority'
  );
  if (
    control.format !== 'prodivix.controlled-static-toolchain-authority.v1' ||
    control.targetPresetId !== snapshot.target.presetId ||
    control.packageManager !== `pnpm@${CONTROLLED_PNPM_VERSION}`
  ) {
    throw new TypeError(
      'Controlled static toolchain authority identity drifted.'
    );
  }
  const generatedManifest = exactRecord(
    readSnapshotManifest(snapshot),
    [
      'name',
      'private',
      'version',
      'type',
      'packageManager',
      'scripts',
      'dependencies',
      'devDependencies',
    ],
    'Controlled executable snapshot dependency manifest'
  );
  const expectedDependencies = stringRecord(
    control.expectedDependencies,
    'Controlled expected dependencies'
  );
  const expectedDevDependencies = stringRecord(
    control.expectedDevDependencies,
    'Controlled expected devDependencies'
  );
  const expectedScripts = stringRecord(
    control.expectedScripts,
    'Controlled expected scripts'
  );
  if (
    generatedManifest.packageManager !== control.packageManager ||
    !sameCanonicalJson(
      stringRecord(generatedManifest.scripts, 'Generated scripts'),
      expectedScripts
    ) ||
    !sameCanonicalJson(
      stringRecord(generatedManifest.dependencies, 'Generated dependencies'),
      expectedDependencies
    ) ||
    !sameCanonicalJson(
      stringRecord(
        generatedManifest.devDependencies,
        'Generated devDependencies'
      ),
      expectedDevDependencies
    )
  ) {
    throw new TypeError(
      'Controlled executable snapshot dependency ranges drifted from their adopted authority.'
    );
  }
  const exactManifest = exactRecord(
    parseJsonObject(
      exactManifestSource,
      'Controlled exact dependency manifest'
    ),
    [
      'name',
      'private',
      'version',
      'packageManager',
      'dependencies',
      'devDependencies',
    ],
    'Controlled exact dependency manifest'
  );
  const exactDependencies = stringRecord(
    exactManifest.dependencies,
    'Controlled exact dependencies'
  );
  const exactDevDependencies = stringRecord(
    exactManifest.devDependencies,
    'Controlled exact devDependencies'
  );
  const exactVersionPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u;
  const exactSemverDependencies = Object.entries({
    ...exactDependencies,
    ...exactDevDependencies,
  }).filter(([name]) => name !== 'esbuild' && name !== 'rollup');
  if (
    exactManifest.packageManager !== control.packageManager ||
    Object.keys(exactDependencies).length !==
      Object.keys(expectedDependencies).length ||
    Object.keys(expectedDependencies).some(
      (name) => !(name in exactDependencies)
    ) ||
    Object.keys(exactDevDependencies).length !==
      Object.keys(expectedDevDependencies).length + 3 ||
    Object.keys(expectedDevDependencies).some(
      (name) => !(name in exactDevDependencies)
    ) ||
    !('@vitest/coverage-v8' in exactDevDependencies) ||
    'esbuild' in expectedDevDependencies ||
    exactDevDependencies.esbuild !== CONTROLLED_ESBUILD_ALIAS_SPEC ||
    'rollup' in expectedDevDependencies ||
    exactDevDependencies.rollup !== CONTROLLED_ROLLUP_ALIAS_SPEC ||
    !('typescript' in exactDevDependencies) ||
    !('vite' in exactDevDependencies) ||
    !('vitest' in exactDevDependencies) ||
    exactSemverDependencies.some(
      ([, version]) => !exactVersionPattern.test(version)
    ) ||
    exactDevDependencies['@vitest/coverage-v8'] !==
      exactDevDependencies.vitest ||
    workspaceContents !==
      `allowBuilds:\n  esbuild: true\noverrides:\n  esbuild: ${CONTROLLED_ESBUILD_ALIAS_SPEC}\n  rollup: ${CONTROLLED_ROLLUP_ALIAS_SPEC}\n`
  ) {
    throw new TypeError(
      'Controlled exact dependency manifest is not a complete exact pin set.'
    );
  }
  const packageContents = `${JSON.stringify(
    {
      ...generatedManifest,
      dependencies: exactDependencies,
      devDependencies: exactDevDependencies,
    },
    null,
    2
  )}\n`;
  const lockContents = new Uint8Array(lockSource);
  const manifestDigest = digestBytes(packageContents);
  const lockDigest = digestBytes(lockContents);
  const isolationProbeDigest = digestBytes(isolationProbeContents);
  const toolchainFileSetDigest = digestBytes(
    canonicalJsonText([
      { path: 'control.json', digest: digestBytes(controlSource) },
      { path: 'package.json', digest: manifestDigest },
      { path: 'pnpm-lock.yaml', digest: lockDigest },
      {
        path: 'pnpm-workspace.yaml',
        digest: digestBytes(workspaceContents),
      },
      {
        path: 'controlled-vite.config.mjs',
        digest: digestBytes(viteConfigContents),
      },
      { path: 'isolation-probe.mjs', digest: isolationProbeDigest },
    ])
  );
  return Object.freeze({
    packageContents,
    lockContents,
    workspaceContents,
    viteConfigContents,
    isolationProbeContents,
    pnpmVersion: CONTROLLED_PNPM_VERSION,
    nodeVersion: CONTROLLED_NODE_VERSION,
    typescriptVersion: exactDevDependencies.typescript!,
    vitestVersion: exactDevDependencies.vitest!,
    viteVersion: exactDevDependencies.vite!,
    rollupVersion: CONTROLLED_ROLLUP_VERSION,
    rollupImplementation: CONTROLLED_ROLLUP_IMPLEMENTATION,
    rollupAliasSpec: CONTROLLED_ROLLUP_ALIAS_SPEC,
    esbuildVersion: CONTROLLED_ESBUILD_VERSION,
    esbuildImplementation: CONTROLLED_ESBUILD_IMPLEMENTATION,
    esbuildAliasSpec: CONTROLLED_ESBUILD_ALIAS_SPEC,
    manifestDigest,
    lockDigest,
    toolchainFileSetDigest,
    isolationProbeDigest,
  });
};

const controlledRuntimeFiles = (
  snapshot: ExecutableProjectSnapshot,
  authority: ControlledToolchainAuthority
): readonly ControlledRuntimeFile[] => {
  const files = projectExecutableProjectRuntimeFiles(snapshot, 'test');
  const manifestPath = snapshot.dependencyPlan.manifestFilePath;
  return Object.freeze([
    ...files
      .filter(({ path }) => path !== 'pnpm-lock.yaml')
      .map((file) =>
        Object.freeze({
          path: file.path,
          contents:
            file.path === manifestPath
              ? authority.packageContents
              : file.path === 'pnpm-workspace.yaml'
                ? authority.workspaceContents
                : file.contents,
          ...(file.sourceTrace ? { sourceTrace: file.sourceTrace } : {}),
        })
      ),
    Object.freeze({
      path: 'pnpm-lock.yaml',
      contents: authority.lockContents,
    }),
    Object.freeze({
      path: '.prodivix/controlled-vite.config.mjs',
      contents: authority.viteConfigContents,
    }),
    Object.freeze({
      path: '.prodivix/isolation-probe.mjs',
      contents: authority.isolationProbeContents,
    }),
  ]);
};

const exactSnapshotCommand = (
  command: ExecutableProjectSnapshot['buildCommand'],
  expected: readonly string[],
  label: string
): void => {
  const actual = snapshotCommandArgs(command, expected[0]!, label);
  if (!sameCanonicalJson(actual, expected)) {
    throw new TypeError(`${label} drifted from the controlled command.`);
  }
};

const assertSnapshotCommands = (snapshot: ExecutableProjectSnapshot): void => {
  exactSnapshotCommand(
    snapshot.installCommand,
    ['install', '--no-frozen-lockfile'],
    'installArgs'
  );
  exactSnapshotCommand(
    snapshot.testPlan.command,
    [
      'run',
      'test',
      '--reporter=default',
      '--reporter=json',
      '--no-file-parallelism',
      `--outputFile.json=${snapshot.testPlan.reportFilePath}`,
    ],
    'testArgs'
  );
  exactSnapshotCommand(snapshot.buildCommand, ['run', 'build'], 'buildArgs');
};

const successfulStageExitCode = (
  receipt: ControlledStaticToolchainAuthorityReceipt,
  stage: 'test' | 'build'
): number => {
  const command = receipt.commands.find(
    (candidate) => candidate.stage === stage
  );
  if (
    !command ||
    command.exitCode !== 0 ||
    command.signal !== null ||
    command.timedOut
  ) {
    throw new TypeError(
      `Controlled static toolchain ${stage} authority is incomplete.`
    );
  }
  return command.exitCode;
};

export const withControlledStaticToolchainExecution = async <Result>(
  requestDigest: string,
  snapshot: ExecutableProjectSnapshot,
  consume: (execution: ControlledStaticToolchainExecution) => Promise<Result>
): Promise<Result> => {
  const root = await mkdtemp(join(tmpdir(), 'prodivix-static-adapter-'));
  let result: Result | undefined;
  let executionFailure: unknown;
  try {
    assertSnapshotCommands(snapshot);
    const authority = await loadControlledToolchainAuthority(snapshot);
    const runtimeFiles = controlledRuntimeFiles(snapshot, authority);
    await writeFiles(root, runtimeFiles);
    const sandbox = await runControlledStaticToolchainSandbox(
      root,
      requestDigest,
      snapshot,
      runtimeFiles,
      authority
    );
    await writeFiles(
      resolveControlledOutputPath(root, snapshot.buildPlan.outputDirectoryPath),
      sandbox.buildFiles
    );
    await writeFiles(root, [
      {
        path: snapshot.testPlan.reportFilePath,
        contents: sandbox.testReport,
      },
      {
        path: '.prodivix/coverage/coverage-summary.json',
        contents: sandbox.coverageSummary,
      },
    ]);
    result = await consume(
      Object.freeze({
        root,
        testProviderRoot: sandbox.testProviderRoot,
        buildProviderRoot: sandbox.buildProviderRoot,
        runtimeFiles,
        buildLog: sandbox.buildLog,
        vitestVersion: authority.vitestVersion,
        testExitCode: successfulStageExitCode(sandbox.authorityReceipt, 'test'),
        buildExitCode: successfulStageExitCode(
          sandbox.authorityReceipt,
          'build'
        ),
        authorityReceipt: sandbox.authorityReceipt,
      })
    );
  } catch (error) {
    executionFailure = error;
  }
  let cleanupFailure: unknown;
  try {
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 50,
    });
    try {
      await lstat(root);
      cleanupFailure = new Error(
        'Controlled static toolchain host root remained after cleanup.'
      );
    } catch (error) {
      if (!(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      )) {
        cleanupFailure = error;
      }
    }
  } catch (error) {
    cleanupFailure = error;
  }
  if (executionFailure) {
    if (cleanupFailure) {
      const primary =
        executionFailure instanceof Error
          ? executionFailure.message
          : 'unknown execution failure';
      const cleanup =
        cleanupFailure instanceof Error
          ? cleanupFailure.message
          : 'unknown cleanup failure';
      throw new Error(
        `${primary}; controlled host cleanup also failed: ${cleanup}`
      );
    }
    throw executionFailure;
  }
  if (cleanupFailure) {
    throw cleanupFailure;
  }
  return result as Result;
};
