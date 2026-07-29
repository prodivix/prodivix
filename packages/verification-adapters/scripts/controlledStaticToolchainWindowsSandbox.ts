import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, rm } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import type { ExecutableProjectSnapshot } from '@prodivix/runtime-core';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  CONTROLLED_STATIC_TOOLCHAIN_AUTHORITY_RECEIPT_FORMAT,
  type ControlledStaticToolchainAuthorityReceipt,
  type ControlledStaticToolchainCommandReceipt,
} from './controlledStaticToolchainProtocol';
import type {
  ControlledStaticToolchainSandboxAuthority,
  ControlledStaticToolchainSandboxExecution,
} from './controlledStaticToolchainSandboxTypes';
import {
  finalizeWindowsSandboxRuntimeAuthority,
  NODE_PREFIX_ARGUMENTS,
  prepareWindowsLauncherAuthority,
  prepareWindowsSandboxRuntime,
  runWindowsAppContainerLaunch,
  verifyWindowsEsbuildInProcessAuthority,
  type WindowsAppContainerLaunchReceipt,
} from './controlledStaticToolchainWindowsLauncher';
import {
  WINDOWS_VITE_COMPATIBILITY_RECEIPT_PATHS,
  windowsViteCompatibilityReceipt,
  type WindowsViteCompatibilityConsumer,
} from './controlledStaticToolchainWindowsRuntimeSources';

const ISOLATION_PROBE_FORMAT = 'prodivix.controlled-static-isolation-probe.v1';

type StagePlan = Readonly<{
  stage: ControlledStaticToolchainCommandReceipt['stage'];
  args: readonly string[];
  resultPaths: readonly string[];
  timeoutMs: number;
  tool: ControlledStaticToolchainCommandReceipt['tool'];
  viteCompatibilityConsumer?: WindowsViteCompatibilityConsumer;
}>;

type CompletedStage = Readonly<{
  plan: StagePlan;
  launch: WindowsAppContainerLaunchReceipt;
  command: ControlledStaticToolchainCommandReceipt;
  viteCompatibilityReceipt?: Readonly<{
    consumer: WindowsViteCompatibilityConsumer;
    digest: string;
  }>;
}>;

const digestBytes = (contents: string | Uint8Array): string =>
  `sha256-${createHash('sha256').update(contents).digest('hex')}`;

const exactRecord = (
  value: unknown,
  keys: readonly string[],
  label: string
): Record<string, unknown> => {
  if (
    !isPlainObject(value) ||
    keys.some((key) => !(key in value)) ||
    Object.keys(value).some(
      (key) => isUnsafeObjectKey(key) || !keys.includes(key)
    )
  ) {
    throw new TypeError(`${label} fields drifted.`);
  }
  return value;
};

const controlledPath = (root: string, path: string): string => {
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path
      .split('/')
      .some(
        (segment) =>
          !segment ||
          segment === '.' ||
          segment === '..' ||
          segment.includes(':')
      )
  ) {
    throw new TypeError('Windows controlled artifact path is not canonical.');
  }
  const target = resolve(root, path);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new TypeError('Windows controlled artifact escaped its root.');
  }
  return target;
};

const outputReceipt = (
  output: WindowsAppContainerLaunchReceipt['process']['stdout']
): ControlledStaticToolchainCommandReceipt['stdout'] =>
  Object.freeze({
    digest: output.digest,
    byteLength: output.byteLength,
    capturedByteLength: output.byteLength,
    truncated: false,
  });

const readViteCompatibilityReceipt = async (
  root: string,
  consumer: WindowsViteCompatibilityConsumer
): Promise<
  Readonly<{ consumer: WindowsViteCompatibilityConsumer; digest: string }>
> => {
  const contents = new Uint8Array(
    await readFile(
      controlledPath(root, WINDOWS_VITE_COMPATIBILITY_RECEIPT_PATHS[consumer])
    )
  );
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(contents);
  } catch {
    throw new TypeError(
      'Windows Vite compatibility receipt is not valid UTF-8.'
    );
  }
  if (source !== JSON.stringify(windowsViteCompatibilityReceipt(consumer))) {
    throw new TypeError(
      `Windows Vite ${consumer} compatibility receipt drifted.`
    );
  }
  return Object.freeze({
    consumer,
    digest: digestBytes(contents),
  });
};

const runStage = async (
  root: string,
  nodePath: string,
  environment: Readonly<Record<string, string>>,
  plan: StagePlan
): Promise<CompletedStage> => {
  if (plan.viteCompatibilityConsumer) {
    await rm(
      controlledPath(
        root,
        WINDOWS_VITE_COMPATIBILITY_RECEIPT_PATHS[plan.viteCompatibilityConsumer]
      ),
      { force: true }
    );
  }
  const launch = await runWindowsAppContainerLaunch(
    root,
    plan.stage,
    nodePath,
    plan.args,
    environment,
    plan.resultPaths,
    plan.timeoutMs
  );
  if (launch.process.exitCode !== 0 || launch.process.timedOut) {
    const diagnostic = [launch.process.stderr.text, launch.process.stdout.text]
      .join('\n')
      .replaceAll(launch.profileRoot, 'workspace:')
      .replaceAll(launch.profileRoot.replaceAll('\\', '/'), 'workspace:')
      .replaceAll(resolve(launch.profileRoot, '..'), 'profile:')
      .replaceAll(
        resolve(launch.profileRoot, '..').replaceAll('\\', '/'),
        'profile:'
      )
      .replaceAll(root, 'source:')
      .replaceAll(root.replaceAll('\\', '/'), 'source:')
      .replace(/[A-Za-z]:\\[^:\r\n"']*/gu, '<private-windows-path>')
      .slice(0, 4_096)
      .trim();
    throw new Error(
      `Windows AppContainer ${plan.stage} stage ${launch.process.timedOut ? 'timed out' : `failed with exit code ${launch.process.exitCode}`} ` +
        `(Job total=${launch.job.totalProcesses}, terminated=${launch.job.terminatedProcesses}, active=${launch.job.activeProcesses}, limit=${launch.job.activeProcessLimit}, clean=${String(launch.job.processTreeClean)}): ` +
        (diagnostic || 'no output')
    );
  }
  const command: ControlledStaticToolchainCommandReceipt = Object.freeze({
    stage: plan.stage,
    application: 'node',
    args: plan.args,
    cwd: 'workspace:/',
    executionBoundary: 'sandbox',
    environmentDigest: launch.process.environmentDigest,
    tool: plan.tool,
    startedAtEpochMs: launch.startedAtEpochMs,
    completedAtEpochMs: launch.completedAtEpochMs,
    exitCode: 0,
    signal: null,
    timedOut: false,
    stdout: outputReceipt(launch.process.stdout),
    stderr: outputReceipt(launch.process.stderr),
  });
  const viteCompatibilityReceipt = plan.viteCompatibilityConsumer
    ? await readViteCompatibilityReceipt(root, plan.viteCompatibilityConsumer)
    : undefined;
  return Object.freeze({
    plan,
    launch,
    command,
    ...(viteCompatibilityReceipt ? { viteCompatibilityReceipt } : {}),
  });
};

const decodeIsolationProbe = (
  source: string
): Readonly<Record<string, unknown>> => {
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch {
    throw new TypeError(
      'Windows AppContainer isolation probe returned invalid JSON.'
    );
  }
  if (canonicalJsonText(value) !== source) {
    throw new TypeError(
      'Windows AppContainer isolation probe must return canonical JSON.'
    );
  }
  const probe = exactRecord(
    value,
    [
      'format',
      'httpDenied',
      'netDenied',
      'dnsDenied',
      'workerNetworkDenied',
      'childNetworkDenied',
      'symlinkEscapeDenied',
      'rootFilesystemWriteDenied',
      'hostMountAbsent',
      'containerSocketAbsent',
      'inheritedCredentialKeyCount',
      'egressAttemptCount',
      'egressSuccessCount',
    ],
    'Windows AppContainer isolation probe'
  );
  if (
    probe.format !== ISOLATION_PROBE_FORMAT ||
    probe.httpDenied !== true ||
    probe.netDenied !== true ||
    probe.dnsDenied !== true ||
    probe.workerNetworkDenied !== true ||
    probe.childNetworkDenied !== true ||
    probe.symlinkEscapeDenied !== true ||
    typeof probe.rootFilesystemWriteDenied !== 'boolean' ||
    probe.hostMountAbsent !== true ||
    probe.containerSocketAbsent !== true ||
    probe.inheritedCredentialKeyCount !== 0 ||
    probe.egressAttemptCount !== 5 ||
    probe.egressSuccessCount !== 0
  ) {
    throw new TypeError('Windows AppContainer isolation probe failed closed.');
  }
  return Object.freeze({ ...probe });
};

const collectBuildFiles = async (
  outputRoot: string
): Promise<ControlledStaticToolchainSandboxExecution['buildFiles']> => {
  const facts: {
    path: string;
    size: number;
    digest: string;
    contents: Uint8Array;
  }[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) =>
      compareUnicodeCodePoints(left.name, right.name)
    );
    for (const entry of entries) {
      const target = resolve(directory, entry.name);
      const stats = await lstat(target);
      if (stats.isSymbolicLink() || stats.isFile() !== entry.isFile()) {
        throw new TypeError(
          'Windows controlled build output contains an unstable file identity.'
        );
      }
      if (stats.isDirectory()) {
        await visit(target);
        continue;
      }
      if (!stats.isFile()) {
        throw new TypeError(
          'Windows controlled build output contains a special file.'
        );
      }
      const contents = new Uint8Array(await readFile(target));
      const path = relative(outputRoot, target).replaceAll('\\', '/');
      facts.push({
        path,
        size: contents.byteLength,
        digest: digestBytes(contents),
        contents,
      });
    }
  };
  await visit(outputRoot);
  if (!facts.length) {
    throw new TypeError('Windows controlled build output is empty.');
  }
  facts.sort((left, right) => compareUnicodeCodePoints(left.path, right.path));
  return Object.freeze(facts.map((fact) => Object.freeze(fact)));
};

const commandPlans = (
  snapshot: ExecutableProjectSnapshot,
  authority: ControlledStaticToolchainSandboxAuthority,
  pnpmBootstrapLogicalPath: string,
  esbuildNodeImportArguments: readonly string[]
): readonly StagePlan[] => {
  const typecheckSubject =
    snapshot.target.presetId === 'vue-vite'
      ? 'node_modules/vue-tsc/bin/vue-tsc.js'
      : 'node_modules/typescript/bin/tsc';
  const nodePlan = (
    stage: StagePlan['stage'],
    subjectBinary: string,
    subjectVersion: string,
    args: readonly string[],
    timeoutMs: number,
    resultPaths: readonly string[] = Object.freeze([]),
    viteCompatibilityConsumer?: WindowsViteCompatibilityConsumer
  ): StagePlan =>
    Object.freeze({
      stage,
      args: Object.freeze([...NODE_PREFIX_ARGUMENTS, ...args]),
      resultPaths: Object.freeze([
        ...resultPaths,
        ...(viteCompatibilityConsumer
          ? [
              WINDOWS_VITE_COMPATIBILITY_RECEIPT_PATHS[
                viteCompatibilityConsumer
              ],
            ]
          : []),
      ]),
      timeoutMs,
      tool: Object.freeze({
        binary: 'node',
        version: authority.nodeVersion,
        subjectBinary,
        subjectVersion,
      }),
      ...(viteCompatibilityConsumer ? { viteCompatibilityConsumer } : {}),
    });
  return Object.freeze([
    Object.freeze({
      stage: 'version',
      args: Object.freeze([
        ...NODE_PREFIX_ARGUMENTS,
        pnpmBootstrapLogicalPath,
        '--version',
      ]),
      resultPaths: Object.freeze([]),
      timeoutMs: 15_000,
      tool: Object.freeze({
        binary: 'pnpm',
        version: authority.pnpmVersion,
      }),
    }),
    Object.freeze({
      stage: 'install',
      args: Object.freeze([
        ...NODE_PREFIX_ARGUMENTS,
        pnpmBootstrapLogicalPath,
        'install',
        '--frozen-lockfile',
        '--offline',
        '--ignore-scripts',
        '--node-linker=hoisted',
        '--trust-lockfile',
        '--fetch-retries=0',
        '--registry=https://registry.npmjs.org/',
        '--store-dir=.prodivix/pnpm-store',
        '--package-import-method=copy',
      ]),
      resultPaths: Object.freeze(['node_modules']),
      timeoutMs: 60_000,
      tool: Object.freeze({
        binary: 'pnpm',
        version: authority.pnpmVersion,
      }),
    }),
    nodePlan(
      'isolation',
      '.prodivix/isolation-probe.mjs',
      authority.isolationProbeDigest,
      ['.prodivix/isolation-probe.mjs'],
      15_000
    ),
    nodePlan(
      'typecheck',
      typecheckSubject,
      authority.typescriptVersion,
      [typecheckSubject, '--noEmit'],
      60_000
    ),
    nodePlan(
      'build',
      'node_modules/vite/bin/vite.js',
      authority.viteVersion,
      [
        ...esbuildNodeImportArguments,
        'node_modules/vite/bin/vite.js',
        'build',
        '--config=.prodivix/controlled-vite.config.mjs',
        '--configLoader=native',
      ],
      60_000,
      [snapshot.buildPlan.outputDirectoryPath],
      'build'
    ),
    nodePlan(
      'test',
      'node_modules/vitest/vitest.mjs',
      authority.vitestVersion,
      [
        ...esbuildNodeImportArguments,
        'node_modules/vitest/vitest.mjs',
        'run',
        '--config=.prodivix/controlled-vite.config.mjs',
        '--configLoader=native',
        '--reporter=default',
        '--reporter=json',
        '--no-file-parallelism',
        '--pool=threads',
        `--outputFile.json=${snapshot.testPlan.reportFilePath}`,
        '--coverage',
        '--coverage.provider=v8',
        '--coverage.reporter=json-summary',
        '--coverage.reportsDirectory=.prodivix/coverage',
      ],
      60_000,
      [
        snapshot.testPlan.reportFilePath,
        '.prodivix/coverage/coverage-summary.json',
      ],
      'test'
    ),
  ]);
};

export const runControlledStaticToolchainWindowsSandbox = async (
  root: string,
  requestDigest: string,
  snapshot: ExecutableProjectSnapshot,
  authority: ControlledStaticToolchainSandboxAuthority
): Promise<ControlledStaticToolchainSandboxExecution> => {
  if (process.platform !== 'win32') {
    throw new Error('Windows AppContainer sandbox requires Windows.');
  }
  const [launcher, runtime] = await Promise.all([
    prepareWindowsLauncherAuthority(),
    prepareWindowsSandboxRuntime(
      root,
      authority.nodeVersion,
      authority.manifestDigest,
      authority.lockDigest
    ),
  ]);
  if (runtime.nodeVersion !== authority.nodeVersion) {
    throw new TypeError('Windows AppContainer Node version authority drifted.');
  }
  const plans = commandPlans(
    snapshot,
    authority,
    runtime.pnpmBootstrapLogicalPath,
    runtime.esbuildInProcessSourceAuthority.nodeImportArguments
  );
  const completed: CompletedStage[] = [];
  let finalizedRuntime:
    | Awaited<ReturnType<typeof finalizeWindowsSandboxRuntimeAuthority>>
    | undefined;
  for (const plan of plans) {
    if (plan.stage === 'isolation' && !finalizedRuntime) {
      finalizedRuntime = await finalizeWindowsSandboxRuntimeAuthority(
        root,
        runtime
      );
    }
    if (plan.stage === 'build' || plan.stage === 'test') {
      if (!finalizedRuntime) {
        throw new TypeError(
          'Windows controlled esbuild authority was not finalized.'
        );
      }
      await verifyWindowsEsbuildInProcessAuthority(
        root,
        finalizedRuntime.esbuildInProcessAuthority
      );
    }
    completed.push(
      await runStage(root, runtime.nodePath, runtime.environment, plan)
    );
  }
  if (!finalizedRuntime) {
    throw new TypeError(
      'Windows controlled runtime authority was not finalized.'
    );
  }
  const completedStage = (
    stage: ControlledStaticToolchainCommandReceipt['stage']
  ): CompletedStage => {
    const matches = completed.filter(({ plan }) => plan.stage === stage);
    if (matches.length !== 1) {
      throw new TypeError(
        `Windows AppContainer ${stage} stage authority is ambiguous.`
      );
    }
    return matches[0]!;
  };
  const versionStage = completedStage('version');
  if (
    versionStage.launch.process.stdout.text.trim() !== authority.pnpmVersion
  ) {
    throw new TypeError('Windows AppContainer pnpm version authority drifted.');
  }
  const isolationStage = completedStage('isolation');
  const isolationProbe = decodeIsolationProbe(
    isolationStage.launch.process.stdout.text
  );
  const testReport = new Uint8Array(
    await readFile(controlledPath(root, snapshot.testPlan.reportFilePath))
  );
  const coverageSummary = new Uint8Array(
    await readFile(
      controlledPath(root, '.prodivix/coverage/coverage-summary.json')
    )
  );
  const buildStage = completedStage('build');
  const buildCommandLine = `$ ${buildStage.command.application} ${buildStage.command.args.join(' ')}\n`;
  const buildLogBytes = new Uint8Array(
    Buffer.concat([
      Buffer.from(buildCommandLine, 'utf8'),
      Buffer.from(buildStage.launch.process.stdout.text, 'utf8'),
      Buffer.from(buildStage.launch.process.stderr.text, 'utf8'),
    ])
  );
  const buildFiles = await collectBuildFiles(
    controlledPath(root, snapshot.buildPlan.outputDirectoryPath)
  );
  const buildFileSetFacts = buildFiles.map(({ path, size, digest }) => ({
    digest,
    path,
    size,
  }));
  const artifacts = Object.freeze({
    testReportDigest: digestBytes(testReport),
    coverageSummaryDigest: digestBytes(coverageSummary),
    buildLogDigest: digestBytes(buildLogBytes),
    buildFileSetDigest: digestBytes(canonicalJsonText(buildFileSetFacts)),
    buildFileCount: buildFiles.length,
  });
  const environmentKeys = Object.freeze(
    Object.keys(runtime.environment).sort(compareUnicodeCodePoints)
  );
  const executionEnvironmentDigest = (
    stages: readonly CompletedStage[]
  ): string =>
    digestBytes(
      canonicalJsonText({
        phase: 'execution',
        keys: environmentKeys,
        rootBound: true,
        packageImportDigest: finalizedRuntime.packageImportDigest,
        commandEnvironmentDigests: stages.map(({ plan, launch }) => ({
          stage: plan.stage,
          digest: launch.process.environmentDigest,
        })),
      })
    );
  const environment = Object.freeze({
    install: Object.freeze({
      keys: environmentKeys,
      digest: digestBytes(
        canonicalJsonText({
          phase: 'install',
          keys: environmentKeys,
          rootBound: true,
          packageImportDigest: finalizedRuntime.packageImportDigest,
          commandEnvironmentDigests: completed
            .slice(0, 2)
            .map(({ plan, launch }) => ({
              stage: plan.stage,
              digest: launch.process.environmentDigest,
            })),
        })
      ),
    }),
    execution: Object.freeze({
      keys: environmentKeys,
      digest: executionEnvironmentDigest(completed.slice(2)),
    }),
  });
  const launches = Object.freeze(
    completed.map(({ plan, launch }) =>
      Object.freeze({
        stage: plan.stage,
        requestDigest: launch.requestDigest,
        appContainer: launch.appContainer,
        job: launch.job,
        process: Object.freeze({
          environmentDigest: launch.process.environmentDigest,
          exitCode: launch.process.exitCode,
          signal: launch.process.signal,
          timedOut: launch.process.timedOut,
        }),
      })
    )
  );
  const viteFilesystemCompatibilityBase = Object.freeze({
    format: 'prodivix.windows-vite-filesystem-compatibility-authority.v1',
    registerDigest: finalizedRuntime.esbuildInProcessAuthority.registerDigest,
    filesystemRealpathMode:
      finalizedRuntime.esbuildInProcessAuthority.filesystemRealpathMode,
    networkDriveProbeCommand:
      finalizedRuntime.esbuildInProcessAuthority.networkDriveProbeCommand,
    networkDriveProbeDisposition:
      finalizedRuntime.esbuildInProcessAuthority.networkDriveProbeDisposition,
    compatibilityReceiptFormat:
      finalizedRuntime.esbuildInProcessAuthority.compatibilityReceiptFormat,
    controlledRootEnvironmentNames:
      finalizedRuntime.esbuildInProcessAuthority.controlledRootEnvironmentNames,
    compatibilityReceiptPaths:
      finalizedRuntime.esbuildInProcessAuthority.compatibilityReceiptPaths,
    receipts: Object.freeze(
      (['build', 'test'] as const).map((consumer) => {
        const matches = completed.filter(
          ({ viteCompatibilityReceipt }) =>
            viteCompatibilityReceipt?.consumer === consumer
        );
        if (matches.length !== 1 || !matches[0]!.viteCompatibilityReceipt) {
          throw new TypeError(
            `Windows Vite ${consumer} compatibility receipt is ambiguous.`
          );
        }
        return Object.freeze({
          stage: consumer,
          consumer,
          digest: matches[0]!.viteCompatibilityReceipt.digest,
        });
      })
    ),
  });
  const viteFilesystemCompatibility = Object.freeze({
    ...viteFilesystemCompatibilityBase,
    receiptDigest: digestBytes(
      canonicalJsonText(viteFilesystemCompatibilityBase)
    ),
  });
  const isolationAuthority = Object.freeze({
    format: 'prodivix.windows-appcontainer-isolation-authority.v1',
    launcher: Object.freeze({
      sourceDigest: launcher.sourceDigest,
      assemblyDigest: launcher.assemblyDigest,
      dotnetVersion: launcher.dotnetVersion,
      packageImportDigest: finalizedRuntime.packageImportDigest,
      nodeVersion: runtime.nodeVersion,
      nodeBinaryDigest: runtime.nodeBinaryDigest,
      pnpmBootstrapDigest: runtime.pnpmBootstrapDigest,
      esbuildInProcessAuthority: finalizedRuntime.esbuildInProcessAuthority,
      viteFilesystemCompatibility,
    }),
    acquisitionAuthority: finalizedRuntime.acquisitionAuthority,
    sandboxCommandAuthority: Object.freeze({
      format: 'prodivix.windows-appcontainer-command-authority.v1',
      provider: 'windows-appcontainer',
      packageImportDigest: finalizedRuntime.packageImportDigest,
      launches,
    }),
    probe: isolationProbe,
  });
  const processTree = Object.freeze({
    provider: 'windows-job-object',
    directCommandCount: completed.length,
    totalProcessCount: completed.reduce(
      (total, { launch }) => total + launch.job.totalProcesses,
      0
    ),
    terminatedProcessCount: completed.reduce(
      (total, { launch }) => total + launch.job.terminatedProcesses,
      0
    ),
    activeProcessCount: 0,
    activeProcessLimit: Math.min(
      ...completed.map(({ launch }) => launch.job.activeProcessLimit)
    ),
    killOnClose: true,
    cleanupVerified: completed.every(
      ({ launch }) =>
        launch.job.processTreeClean && launch.job.activeProcesses === 0
    ),
  });
  if (!processTree.cleanupVerified) {
    throw new TypeError(
      'Windows AppContainer process tree was not cleaned exactly.'
    );
  }
  const toolchain = Object.freeze({
    pnpmVersion: authority.pnpmVersion,
    nodeVersion: authority.nodeVersion,
    nodeBinaryDigest: runtime.nodeBinaryDigest,
    typescriptVersion: authority.typescriptVersion,
    vitestVersion: authority.vitestVersion,
    viteVersion: authority.viteVersion,
    rollupVersion: authority.rollupVersion,
    rollupImplementation: authority.rollupImplementation,
    rollupAliasSpec: authority.rollupAliasSpec,
    esbuildVersion: authority.esbuildVersion,
    esbuildImplementation: authority.esbuildImplementation,
    esbuildAliasSpec: authority.esbuildAliasSpec,
    manifestDigest: authority.manifestDigest,
    lockDigest: authority.lockDigest,
    toolchainFileSetDigest: authority.toolchainFileSetDigest,
  });
  const commands = Object.freeze(completed.map(({ command }) => command));
  const isolation = Object.freeze({
    provider: 'windows-appcontainer' as const,
    networkMode: 'none' as const,
    liveEgressAttemptCount: 5,
    liveEgressSuccessCount: 0 as const,
    hostMountCount: 0 as const,
    rootFilesystem: 'appcontainer-lowbox' as const,
    authority: isolationAuthority,
  });
  const sandboxResultDigest = digestBytes(
    canonicalJsonText({
      provider: 'windows-appcontainer',
      requestDigest,
      snapshotDigest: snapshot.contentDigest,
      environment,
      commands,
      isolation,
      processTree,
      toolchain,
      artifacts,
    })
  );
  const receiptBase = Object.freeze({
    format: CONTROLLED_STATIC_TOOLCHAIN_AUTHORITY_RECEIPT_FORMAT,
    provider: 'windows-appcontainer' as const,
    requestDigest,
    snapshotDigest: snapshot.contentDigest,
    environment,
    commands,
    isolation,
    processTree,
    toolchain,
    artifacts,
    sandboxResultDigest,
  });
  const authorityReceipt: ControlledStaticToolchainAuthorityReceipt =
    Object.freeze({
      ...receiptBase,
      receiptDigest: digestBytes(canonicalJsonText(receiptBase)),
    });
  return Object.freeze({
    testProviderRoot: completedStage('test').launch.profileRoot,
    buildProviderRoot: buildStage.launch.profileRoot,
    buildFiles,
    testReport,
    coverageSummary,
    buildLog: new TextDecoder('utf-8', { fatal: true }).decode(buildLogBytes),
    authorityReceipt,
  });
};
