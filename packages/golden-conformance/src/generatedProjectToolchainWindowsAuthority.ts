import { createHash } from 'node:crypto';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import { digestVerificationValue } from '@prodivix/verification';
import type {
  GoldenControlledStaticToolchainAuthorityReceipt,
  GoldenControlledStaticToolchainCommandReceipt,
} from './generatedProjectToolchainAuthorityTypes';

const SHA256_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/u;
const CONTROLLED_ROOT_ENVIRONMENT_NAMES = Object.freeze([
  'APPDATA',
  'HOME',
  'LOCALAPPDATA',
  'TEMP',
  'TMP',
  'USERPROFILE',
] as const);
const VITE_COMPATIBILITY_PATHS = Object.freeze({
  build: '.prodivix/windows-runtime/build-vite-compatibility-receipt.json',
  test: '.prodivix/windows-runtime/test-vite-compatibility-receipt.json',
} as const);

type Toolchain = GoldenControlledStaticToolchainAuthorityReceipt['toolchain'];
type Environment =
  GoldenControlledStaticToolchainAuthorityReceipt['environment'];

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
    throw new Error(`${label} has unknown or missing fields.`);
  }
  return value;
};

const exactDigest = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} is not canonical SHA-256.`);
  }
  return value;
};

const exactInteger = (value: unknown, label: string, minimum = 0): number => {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} is outside its integer budget.`);
  }
  return value as number;
};

const exactStringArray = (
  value: unknown,
  expected: readonly string[],
  label: string
): readonly string[] => {
  if (
    !Array.isArray(value) ||
    canonicalJsonText(value) !== canonicalJsonText(expected)
  ) {
    throw new Error(`${label} drifted.`);
  }
  return Object.freeze([...expected]);
};

const rawDigest = (source: string): string =>
  `sha256-${createHash('sha256').update(source).digest('hex')}`;

const normalizeEsbuildAuthority = (value: unknown, toolchain: Toolchain) => {
  const authority = exactRecord(
    value,
    [
      'format',
      'implementation',
      'version',
      'aliasSpec',
      'executionMode',
      'api',
      'worker',
      'registerLogicalPath',
      'registerDigest',
      'loaderLogicalPath',
      'loaderDigest',
      'wrapperLogicalPath',
      'wrapperDigest',
      'wasmModuleSpecifier',
      'nodeImportArguments',
      'filesystemRealpathMode',
      'networkDriveProbeCommand',
      'networkDriveProbeDisposition',
      'compatibilityReceiptFormat',
      'controlledRootEnvironmentNames',
      'compatibilityReceiptPaths',
      'wasmDigest',
      'wasmByteLength',
    ],
    'Windows esbuild in-process authority'
  );
  const compatibilityPaths = exactRecord(
    authority.compatibilityReceiptPaths,
    ['build', 'test'],
    'Windows Vite compatibility receipt paths'
  );
  const wasmByteLength = exactInteger(
    authority.wasmByteLength,
    'Windows esbuild WASM byte length',
    1
  );
  if (
    authority.format !== 'prodivix.windows-esbuild-inprocess-authority.v1' ||
    authority.implementation !== toolchain.esbuildImplementation ||
    authority.version !== toolchain.esbuildVersion ||
    authority.aliasSpec !== toolchain.esbuildAliasSpec ||
    authority.executionMode !== 'in-process' ||
    authority.api !== 'browser' ||
    authority.worker !== false ||
    authority.registerLogicalPath !==
      '.prodivix/windows-runtime/esbuild-register.mjs' ||
    authority.loaderLogicalPath !==
      '.prodivix/windows-runtime/esbuild-loader.mjs' ||
    authority.wrapperLogicalPath !==
      '.prodivix/windows-runtime/esbuild-wrapper.mjs' ||
    authority.wasmModuleSpecifier !== 'esbuild/esbuild.wasm' ||
    authority.filesystemRealpathMode !== 'bounded-identity-no-reparse' ||
    authority.networkDriveProbeCommand !== 'net use' ||
    authority.networkDriveProbeDisposition !== 'denied-without-spawn' ||
    authority.compatibilityReceiptFormat !==
      'prodivix.windows-vite-filesystem-compatibility-receipt.v1' ||
    compatibilityPaths.build !== VITE_COMPATIBILITY_PATHS.build ||
    compatibilityPaths.test !== VITE_COMPATIBILITY_PATHS.test ||
    wasmByteLength > 64 * 1024 * 1024
  ) {
    throw new Error('Windows esbuild in-process authority drifted.');
  }
  return Object.freeze({
    format: authority.format,
    implementation: authority.implementation,
    version: authority.version,
    aliasSpec: authority.aliasSpec,
    executionMode: authority.executionMode,
    api: authority.api,
    worker: false,
    registerLogicalPath: authority.registerLogicalPath,
    registerDigest: exactDigest(
      authority.registerDigest,
      'Windows esbuild register digest'
    ),
    loaderLogicalPath: authority.loaderLogicalPath,
    loaderDigest: exactDigest(
      authority.loaderDigest,
      'Windows esbuild loader digest'
    ),
    wrapperLogicalPath: authority.wrapperLogicalPath,
    wrapperDigest: exactDigest(
      authority.wrapperDigest,
      'Windows esbuild wrapper digest'
    ),
    wasmModuleSpecifier: authority.wasmModuleSpecifier,
    nodeImportArguments: exactStringArray(
      authority.nodeImportArguments,
      ['--import=./.prodivix/windows-runtime/esbuild-register.mjs'],
      'Windows esbuild Node import arguments'
    ),
    filesystemRealpathMode: authority.filesystemRealpathMode,
    networkDriveProbeCommand: authority.networkDriveProbeCommand,
    networkDriveProbeDisposition: authority.networkDriveProbeDisposition,
    compatibilityReceiptFormat: authority.compatibilityReceiptFormat,
    controlledRootEnvironmentNames: exactStringArray(
      authority.controlledRootEnvironmentNames,
      CONTROLLED_ROOT_ENVIRONMENT_NAMES,
      'Windows controlled realpath roots'
    ),
    compatibilityReceiptPaths: VITE_COMPATIBILITY_PATHS,
    wasmDigest: exactDigest(
      authority.wasmDigest,
      'Windows esbuild WASM digest'
    ),
    wasmByteLength,
  });
};

const normalizeOutput = (value: unknown, label: string) => {
  const output = exactRecord(value, ['digest', 'byteLength'], label);
  return Object.freeze({
    digest: exactDigest(output.digest, `${label} digest`),
    byteLength: exactInteger(output.byteLength, `${label} byte length`),
  });
};

const normalizeAcquisitionAuthority = (
  value: unknown,
  toolchain: Toolchain,
  expectedEsbuildAuthority: ReturnType<typeof normalizeEsbuildAuthority>,
  expectedPnpmBootstrapDigest: string
) => {
  const authority = exactRecord(
    value,
    [
      'format',
      'provider',
      'environment',
      'command',
      'packageManager',
      'manifestDigest',
      'lockDigest',
      'registryPolicy',
      'esbuildInProcess',
      'compatibilityOmission',
      'nodeVersion',
      'nodeBinaryDigest',
      'pnpmVersion',
      'pnpmBootstrapDigest',
      'runtimeFileSetDigest',
      'storeFileSetDigest',
      'virtualStoreFileSetDigest',
      'receiptDigest',
    ],
    'Windows package acquisition authority'
  );
  const environment = exactRecord(
    authority.environment,
    ['keys', 'digest'],
    'Windows acquisition environment'
  );
  const command = exactRecord(
    authority.command,
    [
      'stage',
      'application',
      'args',
      'cwd',
      'environmentDigest',
      'tool',
      'startedAtEpochMs',
      'completedAtEpochMs',
      'stdout',
      'stderr',
    ],
    'Windows acquisition command'
  );
  const tool = exactRecord(
    command.tool,
    ['binary', 'version'],
    'Windows acquisition tool'
  );
  const registryPolicy = exactRecord(
    authority.registryPolicy,
    [
      'format',
      'registry',
      'hostFetchBoundary',
      'hostNetworkIsolationClaimed',
      'sandboxInstallNetworkMode',
      'resolutionPolicy',
      'lockfileVersion',
      'integrityAlgorithm',
      'packageCount',
      'packageResolutionSetDigest',
      'prohibitedSourceSchemes',
      'maximumLockfileBytes',
    ],
    'Windows registry policy'
  );
  const compatibilityOmission = exactRecord(
    authority.compatibilityOmission,
    [
      'format',
      'platform',
      'omittedPath',
      'originalPnpmFileSetDigest',
      'omittedFileSetDigest',
      'nativeModuleAbsent',
    ],
    'Windows pnpm compatibility omission'
  );
  const expectedEnvironmentKeys = Object.freeze([
    'APPDATA',
    'CI',
    'HOME',
    'LOCALAPPDATA',
    'NPM_CONFIG_REGISTRY',
    'NPM_CONFIG_WORKSPACE_DIR',
    'SystemRoot',
    'TEMP',
    'TMP',
    'USERPROFILE',
  ]);
  const expectedFetchArgs = Object.freeze([
    '--preserve-symlinks',
    '--preserve-symlinks-main',
    '.prodivix/windows-runtime/pnpm/bin/pnpm.mjs',
    'fetch',
    '--frozen-lockfile',
    '--ignore-scripts',
    '--node-linker=hoisted',
    '--store-dir=.prodivix/pnpm-store',
    '--registry=https://registry.npmjs.org/',
  ]);
  const normalizedEsbuildAuthority = normalizeEsbuildAuthority(
    authority.esbuildInProcess,
    toolchain
  );
  if (
    authority.format !== 'prodivix.windows-package-acquisition-authority.v1' ||
    authority.provider !== 'windows-trusted-host-fetch' ||
    authority.packageManager !== `pnpm@${toolchain.pnpmVersion}` ||
    authority.manifestDigest !== toolchain.manifestDigest ||
    authority.lockDigest !== toolchain.lockDigest ||
    authority.nodeVersion !== toolchain.nodeVersion ||
    authority.nodeBinaryDigest !== toolchain.nodeBinaryDigest ||
    authority.pnpmVersion !== toolchain.pnpmVersion ||
    authority.pnpmBootstrapDigest !== expectedPnpmBootstrapDigest ||
    canonicalJsonText(normalizedEsbuildAuthority) !==
      canonicalJsonText(expectedEsbuildAuthority) ||
    command.stage !== 'fetch' ||
    command.application !== 'node' ||
    command.cwd !== 'controller:/' ||
    command.environmentDigest !== environment.digest ||
    canonicalJsonText(command.args) !== canonicalJsonText(expectedFetchArgs) ||
    tool.binary !== 'pnpm-fetch' ||
    tool.version !== toolchain.pnpmVersion ||
    !Number.isSafeInteger(command.startedAtEpochMs) ||
    !Number.isSafeInteger(command.completedAtEpochMs) ||
    (command.completedAtEpochMs as number) <
      (command.startedAtEpochMs as number) ||
    registryPolicy.format !== 'prodivix.windows-registry-policy.v1' ||
    registryPolicy.registry !== 'https://registry.npmjs.org/' ||
    registryPolicy.hostFetchBoundary !== 'trusted-controller' ||
    registryPolicy.hostNetworkIsolationClaimed !== false ||
    registryPolicy.sandboxInstallNetworkMode !== 'offline' ||
    registryPolicy.resolutionPolicy !== 'registry-integrity-only' ||
    registryPolicy.lockfileVersion !== '9.0' ||
    registryPolicy.integrityAlgorithm !== 'sha512' ||
    registryPolicy.maximumLockfileBytes !== 4_194_304 ||
    compatibilityOmission.format !==
      'prodivix.windows-pnpm-compatibility-omission.v1' ||
    compatibilityOmission.platform !== 'win32-x64' ||
    compatibilityOmission.omittedPath !==
      'dist/node_modules/@reflink/reflink-win32-x64-msvc' ||
    compatibilityOmission.nativeModuleAbsent !== true
  ) {
    throw new Error('Windows package acquisition authority drifted.');
  }
  const normalizedEnvironment = Object.freeze({
    keys: exactStringArray(
      environment.keys,
      expectedEnvironmentKeys,
      'Windows acquisition environment keys'
    ),
    digest: exactDigest(
      environment.digest,
      'Windows acquisition environment digest'
    ),
  });
  const normalizedCommand = Object.freeze({
    stage: 'fetch',
    application: 'node',
    args: expectedFetchArgs,
    cwd: 'controller:/',
    environmentDigest: normalizedEnvironment.digest,
    tool: Object.freeze({
      binary: 'pnpm-fetch',
      version: toolchain.pnpmVersion,
    }),
    startedAtEpochMs: command.startedAtEpochMs as number,
    completedAtEpochMs: command.completedAtEpochMs as number,
    stdout: normalizeOutput(command.stdout, 'Windows acquisition stdout'),
    stderr: normalizeOutput(command.stderr, 'Windows acquisition stderr'),
  });
  const normalizedRegistryPolicy = Object.freeze({
    format: registryPolicy.format,
    registry: registryPolicy.registry,
    hostFetchBoundary: registryPolicy.hostFetchBoundary,
    hostNetworkIsolationClaimed: false,
    sandboxInstallNetworkMode: registryPolicy.sandboxInstallNetworkMode,
    resolutionPolicy: registryPolicy.resolutionPolicy,
    lockfileVersion: registryPolicy.lockfileVersion,
    integrityAlgorithm: registryPolicy.integrityAlgorithm,
    packageCount: exactInteger(
      registryPolicy.packageCount,
      'Windows registry package count',
      1
    ),
    packageResolutionSetDigest: exactDigest(
      registryPolicy.packageResolutionSetDigest,
      'Windows package resolution-set digest'
    ),
    prohibitedSourceSchemes: exactStringArray(
      registryPolicy.prohibitedSourceSchemes,
      [
        'file:',
        'link:',
        'workspace:',
        'git:',
        'git+',
        'github:',
        'http:',
        'https:',
      ],
      'Windows prohibited package source schemes'
    ),
    maximumLockfileBytes: 4_194_304,
  });
  const normalizedCompatibilityOmission = Object.freeze({
    format: compatibilityOmission.format,
    platform: compatibilityOmission.platform,
    omittedPath: compatibilityOmission.omittedPath,
    originalPnpmFileSetDigest: exactDigest(
      compatibilityOmission.originalPnpmFileSetDigest,
      'Windows original pnpm file-set digest'
    ),
    omittedFileSetDigest: exactDigest(
      compatibilityOmission.omittedFileSetDigest,
      'Windows omitted pnpm file-set digest'
    ),
    nativeModuleAbsent: true,
  });
  const base = Object.freeze({
    format: authority.format,
    provider: authority.provider,
    environment: normalizedEnvironment,
    command: normalizedCommand,
    packageManager: authority.packageManager,
    manifestDigest: toolchain.manifestDigest,
    lockDigest: toolchain.lockDigest,
    registryPolicy: normalizedRegistryPolicy,
    esbuildInProcess: normalizedEsbuildAuthority,
    compatibilityOmission: normalizedCompatibilityOmission,
    nodeVersion: toolchain.nodeVersion,
    nodeBinaryDigest: toolchain.nodeBinaryDigest,
    pnpmVersion: toolchain.pnpmVersion,
    pnpmBootstrapDigest: expectedPnpmBootstrapDigest,
    runtimeFileSetDigest: exactDigest(
      authority.runtimeFileSetDigest,
      'Windows runtime file-set digest'
    ),
    storeFileSetDigest: exactDigest(
      authority.storeFileSetDigest,
      'Windows store file-set digest'
    ),
    virtualStoreFileSetDigest: exactDigest(
      authority.virtualStoreFileSetDigest,
      'Windows virtual-store file-set digest'
    ),
  });
  if (authority.receiptDigest !== digestVerificationValue(base)) {
    throw new Error('Windows package acquisition receipt drifted.');
  }
  return Object.freeze({
    ...base,
    receiptDigest: authority.receiptDigest,
  });
};

const normalizeViteCompatibilityAuthority = (
  value: unknown,
  registerDigest: string
) => {
  const authority = exactRecord(
    value,
    [
      'format',
      'registerDigest',
      'filesystemRealpathMode',
      'networkDriveProbeCommand',
      'networkDriveProbeDisposition',
      'compatibilityReceiptFormat',
      'controlledRootEnvironmentNames',
      'compatibilityReceiptPaths',
      'receipts',
      'receiptDigest',
    ],
    'Windows Vite filesystem compatibility authority'
  );
  const paths = exactRecord(
    authority.compatibilityReceiptPaths,
    ['build', 'test'],
    'Windows Vite receipt path authority'
  );
  const receiptValues = authority.receipts;
  if (
    authority.format !==
      'prodivix.windows-vite-filesystem-compatibility-authority.v1' ||
    authority.registerDigest !== registerDigest ||
    authority.filesystemRealpathMode !== 'bounded-identity-no-reparse' ||
    authority.networkDriveProbeCommand !== 'net use' ||
    authority.networkDriveProbeDisposition !== 'denied-without-spawn' ||
    authority.compatibilityReceiptFormat !==
      'prodivix.windows-vite-filesystem-compatibility-receipt.v1' ||
    paths.build !== VITE_COMPATIBILITY_PATHS.build ||
    paths.test !== VITE_COMPATIBILITY_PATHS.test ||
    !Array.isArray(receiptValues) ||
    receiptValues.length !== 2
  ) {
    throw new Error('Windows Vite filesystem compatibility authority drifted.');
  }
  const receipts = Object.freeze(
    (['build', 'test'] as const).map((consumer, index) => {
      const receipt = exactRecord(
        receiptValues[index],
        ['stage', 'consumer', 'digest'],
        `Windows Vite ${consumer} compatibility receipt`
      );
      const receiptValue = {
        format: 'prodivix.windows-vite-filesystem-compatibility-receipt.v1',
        consumer,
        filesystemRealpathMode: 'bounded-identity-no-reparse',
        networkDriveProbeCommand: 'net use',
        networkDriveProbeDisposition: 'denied-without-spawn',
        controlledRootEnvironmentNames: CONTROLLED_ROOT_ENVIRONMENT_NAMES,
      };
      if (
        receipt.stage !== consumer ||
        receipt.consumer !== consumer ||
        receipt.digest !== rawDigest(JSON.stringify(receiptValue))
      ) {
        throw new Error(
          `Windows Vite ${consumer} compatibility receipt drifted.`
        );
      }
      return Object.freeze({
        stage: consumer,
        consumer,
        digest: receipt.digest,
      });
    })
  );
  const base = Object.freeze({
    format: authority.format,
    registerDigest,
    filesystemRealpathMode: authority.filesystemRealpathMode,
    networkDriveProbeCommand: authority.networkDriveProbeCommand,
    networkDriveProbeDisposition: authority.networkDriveProbeDisposition,
    compatibilityReceiptFormat: authority.compatibilityReceiptFormat,
    controlledRootEnvironmentNames: exactStringArray(
      authority.controlledRootEnvironmentNames,
      CONTROLLED_ROOT_ENVIRONMENT_NAMES,
      'Windows Vite controlled roots'
    ),
    compatibilityReceiptPaths: VITE_COMPATIBILITY_PATHS,
    receipts,
  });
  if (authority.receiptDigest !== digestVerificationValue(base)) {
    throw new Error(
      'Windows Vite filesystem compatibility receipt digest drifted.'
    );
  }
  return Object.freeze({
    ...base,
    receiptDigest: authority.receiptDigest,
  });
};

const normalizeLaunches = (
  value: unknown,
  commands: readonly GoldenControlledStaticToolchainCommandReceipt[]
) => {
  if (!Array.isArray(value) || value.length !== commands.length) {
    throw new Error('Windows AppContainer launch count drifted.');
  }
  return Object.freeze(
    value.map((launch, index) => {
      const record = exactRecord(
        launch,
        ['stage', 'requestDigest', 'appContainer', 'job', 'process'],
        `Windows AppContainer launch ${index}`
      );
      const appContainer = exactRecord(
        record.appContainer,
        [
          'profileName',
          'profileSid',
          'tokenIsAppContainer',
          'tokenSidMatched',
          'tokenCapabilityCount',
          'capabilities',
          'profileStorageBound',
        ],
        `Windows AppContainer token ${index}`
      );
      const job = exactRecord(
        record.job,
        [
          'killOnClose',
          'activeProcessLimit',
          'totalProcesses',
          'activeProcesses',
          'terminatedProcesses',
          'processTreeClean',
        ],
        `Windows AppContainer Job ${index}`
      );
      const processAuthority = exactRecord(
        record.process,
        ['environmentDigest', 'exitCode', 'signal', 'timedOut'],
        `Windows AppContainer process ${index}`
      );
      const command = commands[index]!;
      const activeProcessLimit = exactInteger(
        job.activeProcessLimit,
        `Windows AppContainer Job ${index} active-process limit`,
        1
      );
      const totalProcesses = exactInteger(
        job.totalProcesses,
        `Windows AppContainer Job ${index} total process count`,
        1
      );
      const terminatedProcesses = exactInteger(
        job.terminatedProcesses,
        `Windows AppContainer Job ${index} terminated process count`
      );
      if (
        record.stage !== command.stage ||
        !SHA256_PATTERN.test(String(record.requestDigest)) ||
        typeof appContainer.profileName !== 'string' ||
        !/^Prodivix\.Static\.[A-Za-z0-9._-]{1,47}$/u.test(
          appContainer.profileName
        ) ||
        typeof appContainer.profileSid !== 'string' ||
        !/^S-1-15-2(?:-[0-9]+)+$/u.test(appContainer.profileSid) ||
        appContainer.tokenIsAppContainer !== true ||
        appContainer.tokenSidMatched !== true ||
        appContainer.tokenCapabilityCount !== 0 ||
        !Array.isArray(appContainer.capabilities) ||
        appContainer.capabilities.length !== 0 ||
        appContainer.profileStorageBound !== true ||
        job.killOnClose !== true ||
        job.activeProcesses !== 0 ||
        job.processTreeClean !== true ||
        processAuthority.environmentDigest !== command.environmentDigest ||
        processAuthority.exitCode !== 0 ||
        processAuthority.signal !== null ||
        processAuthority.timedOut !== false
      ) {
        throw new Error(
          `Windows AppContainer launch ${index} authority drifted.`
        );
      }
      return Object.freeze({
        stage: command.stage,
        requestDigest: record.requestDigest as string,
        appContainer: Object.freeze({
          profileName: appContainer.profileName,
          profileSid: appContainer.profileSid,
          tokenIsAppContainer: true,
          tokenSidMatched: true,
          tokenCapabilityCount: 0,
          capabilities: Object.freeze([]),
          profileStorageBound: true,
        }),
        job: Object.freeze({
          killOnClose: true,
          activeProcessLimit,
          totalProcesses,
          activeProcesses: 0,
          terminatedProcesses,
          processTreeClean: true,
        }),
        process: Object.freeze({
          environmentDigest: command.environmentDigest,
          exitCode: 0,
          signal: null,
          timedOut: false,
        }),
      });
    })
  );
};

const normalizeProbe = (value: unknown, attemptCount: number) => {
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
    probe.format !== 'prodivix.controlled-static-isolation-probe.v1' ||
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
    probe.egressAttemptCount !== attemptCount ||
    probe.egressSuccessCount !== 0
  ) {
    throw new Error('Windows AppContainer isolation probe authority drifted.');
  }
  return Object.freeze({ ...probe });
};

export const decodeGoldenControlledStaticWindowsAuthority = (input: {
  isolationAuthority: unknown;
  processTree: unknown;
  commands: readonly GoldenControlledStaticToolchainCommandReceipt[];
  toolchain: Toolchain;
  environment: Environment;
  liveEgressAttemptCount: number;
}) => {
  const authority = exactRecord(
    input.isolationAuthority,
    [
      'format',
      'launcher',
      'acquisitionAuthority',
      'sandboxCommandAuthority',
      'probe',
    ],
    'Windows AppContainer isolation authority'
  );
  const launcher = exactRecord(
    authority.launcher,
    [
      'sourceDigest',
      'assemblyDigest',
      'dotnetVersion',
      'packageImportDigest',
      'nodeVersion',
      'nodeBinaryDigest',
      'pnpmBootstrapDigest',
      'esbuildInProcessAuthority',
      'viteFilesystemCompatibility',
    ],
    'Windows AppContainer launcher authority'
  );
  const sandboxCommand = exactRecord(
    authority.sandboxCommandAuthority,
    ['format', 'provider', 'packageImportDigest', 'launches'],
    'Windows AppContainer command authority'
  );
  const packageImportDigest = exactDigest(
    launcher.packageImportDigest,
    'Windows package import digest'
  );
  const pnpmBootstrapDigest = exactDigest(
    launcher.pnpmBootstrapDigest,
    'Windows pnpm bootstrap digest'
  );
  const esbuildAuthority = normalizeEsbuildAuthority(
    launcher.esbuildInProcessAuthority,
    input.toolchain
  );
  const viteCompatibility = normalizeViteCompatibilityAuthority(
    launcher.viteFilesystemCompatibility,
    esbuildAuthority.registerDigest
  );
  const acquisitionAuthority = normalizeAcquisitionAuthority(
    authority.acquisitionAuthority,
    input.toolchain,
    esbuildAuthority,
    pnpmBootstrapDigest
  );
  const launches = normalizeLaunches(sandboxCommand.launches, input.commands);
  const probe = normalizeProbe(authority.probe, input.liveEgressAttemptCount);
  if (
    authority.format !==
      'prodivix.windows-appcontainer-isolation-authority.v1' ||
    launcher.nodeVersion !== input.toolchain.nodeVersion ||
    launcher.nodeBinaryDigest !== input.toolchain.nodeBinaryDigest ||
    typeof launcher.dotnetVersion !== 'string' ||
    !VERSION_PATTERN.test(launcher.dotnetVersion) ||
    sandboxCommand.format !==
      'prodivix.windows-appcontainer-command-authority.v1' ||
    sandboxCommand.provider !== 'windows-appcontainer' ||
    sandboxCommand.packageImportDigest !== packageImportDigest
  ) {
    throw new Error('Windows AppContainer authority drifted.');
  }
  const normalizedLauncher = Object.freeze({
    sourceDigest: exactDigest(
      launcher.sourceDigest,
      'Windows launcher source digest'
    ),
    assemblyDigest: exactDigest(
      launcher.assemblyDigest,
      'Windows launcher assembly digest'
    ),
    dotnetVersion: launcher.dotnetVersion,
    packageImportDigest,
    nodeVersion: input.toolchain.nodeVersion,
    nodeBinaryDigest: input.toolchain.nodeBinaryDigest,
    pnpmBootstrapDigest,
    esbuildInProcessAuthority: esbuildAuthority,
    viteFilesystemCompatibility: viteCompatibility,
  });
  const normalizedSandboxCommand = Object.freeze({
    format: sandboxCommand.format,
    provider: sandboxCommand.provider,
    packageImportDigest,
    launches,
  });
  const phaseDigest = (
    phase: 'install' | 'execution',
    phaseCommands: readonly GoldenControlledStaticToolchainCommandReceipt[]
  ): string =>
    digestVerificationValue({
      phase,
      keys: input.environment[phase].keys,
      rootBound: true,
      packageImportDigest,
      commandEnvironmentDigests: phaseCommands.map((command) => ({
        stage: command.stage,
        digest: command.environmentDigest,
      })),
    });
  if (
    input.environment.install.digest !==
      phaseDigest('install', input.commands.slice(0, 2)) ||
    input.environment.execution.digest !==
      phaseDigest('execution', input.commands.slice(2))
  ) {
    throw new Error('Windows AppContainer phase environment digest drifted.');
  }
  const processTree = exactRecord(
    input.processTree,
    [
      'provider',
      'directCommandCount',
      'totalProcessCount',
      'terminatedProcessCount',
      'activeProcessCount',
      'activeProcessLimit',
      'killOnClose',
      'cleanupVerified',
    ],
    'Windows AppContainer process tree'
  );
  const totalProcessCount = launches.reduce(
    (total, launch) => total + launch.job.totalProcesses,
    0
  );
  const terminatedProcessCount = launches.reduce(
    (total, launch) => total + launch.job.terminatedProcesses,
    0
  );
  const activeProcessLimit = Math.min(
    ...launches.map((launch) => launch.job.activeProcessLimit)
  );
  if (
    processTree.provider !== 'windows-job-object' ||
    processTree.directCommandCount !== input.commands.length ||
    processTree.totalProcessCount !== totalProcessCount ||
    processTree.terminatedProcessCount !== terminatedProcessCount ||
    processTree.activeProcessCount !== 0 ||
    processTree.activeProcessLimit !== activeProcessLimit ||
    processTree.killOnClose !== true ||
    processTree.cleanupVerified !== true
  ) {
    throw new Error('Windows AppContainer process-tree authority drifted.');
  }
  return Object.freeze({
    isolationAuthority: Object.freeze({
      format: authority.format,
      launcher: normalizedLauncher,
      acquisitionAuthority,
      sandboxCommandAuthority: normalizedSandboxCommand,
      probe,
    }),
    processTree: Object.freeze({
      provider: 'windows-job-object',
      directCommandCount: input.commands.length,
      totalProcessCount,
      terminatedProcessCount,
      activeProcessCount: 0,
      activeProcessLimit,
      killOnClose: true,
      cleanupVerified: true,
    }),
  });
};
