import type {
  WINDOWS_CONTROLLED_ROOT_ENVIRONMENT_NAMES,
  WINDOWS_VITE_COMPATIBILITY_RECEIPT_FORMAT,
  WINDOWS_VITE_COMPATIBILITY_RECEIPT_PATHS,
} from './controlledStaticToolchainWindowsRuntimeSources';

export type WindowsLauncherAuthority = Readonly<{
  sourceDigest: string;
  assemblyDigest: string;
  dotnetVersion: string;
  assemblyPath: string;
  dotnetPath: string;
}>;

export type WindowsSandboxRuntime = Readonly<{
  nodePath: string;
  nodeLogicalPath: '.prodivix/windows-runtime/node.exe';
  nodeVersion: string;
  nodeBinaryDigest: string;
  pnpmBootstrapLogicalPath: '.prodivix/windows-runtime/pnpm-bootstrap.mjs';
  pnpmBootstrapDigest: string;
  esbuildRegisterLogicalPath: '.prodivix/windows-runtime/esbuild-register.mjs';
  esbuildInProcessSourceAuthority: WindowsEsbuildInProcessSourceAuthority;
  acquisitionAuthorityBase: WindowsPackageAcquisitionAuthorityBase;
  sandboxEnvironmentAuthorityDigest: string;
  environment: Readonly<Record<string, string>>;
}>;

export type WindowsEsbuildInProcessSourceAuthority = Readonly<{
  format: 'prodivix.windows-esbuild-inprocess-authority.v1';
  implementation: 'esbuild-wasm';
  version: '0.27.7';
  aliasSpec: 'npm:esbuild-wasm@0.27.7';
  executionMode: 'in-process';
  api: 'browser';
  worker: false;
  registerLogicalPath: '.prodivix/windows-runtime/esbuild-register.mjs';
  registerDigest: string;
  loaderLogicalPath: '.prodivix/windows-runtime/esbuild-loader.mjs';
  loaderDigest: string;
  wrapperLogicalPath: '.prodivix/windows-runtime/esbuild-wrapper.mjs';
  wrapperDigest: string;
  wasmModuleSpecifier: 'esbuild/esbuild.wasm';
  nodeImportArguments: readonly [
    '--import=./.prodivix/windows-runtime/esbuild-register.mjs',
  ];
  filesystemRealpathMode: 'bounded-identity-no-reparse';
  networkDriveProbeCommand: 'net use';
  networkDriveProbeDisposition: 'denied-without-spawn';
  compatibilityReceiptFormat: typeof WINDOWS_VITE_COMPATIBILITY_RECEIPT_FORMAT;
  controlledRootEnvironmentNames: typeof WINDOWS_CONTROLLED_ROOT_ENVIRONMENT_NAMES;
  compatibilityReceiptPaths: typeof WINDOWS_VITE_COMPATIBILITY_RECEIPT_PATHS;
}>;

export type WindowsEsbuildInProcessAuthority = Readonly<
  WindowsEsbuildInProcessSourceAuthority & {
    wasmDigest: string;
    wasmByteLength: number;
  }
>;

export type WindowsPackageAcquisitionAuthority = Readonly<{
  format: 'prodivix.windows-package-acquisition-authority.v1';
  provider: 'windows-trusted-host-fetch';
  environment: Readonly<{
    keys: readonly string[];
    digest: string;
  }>;
  command: Readonly<{
    stage: 'fetch';
    application: 'node';
    args: readonly string[];
    cwd: 'controller:/';
    environmentDigest: string;
    tool: Readonly<{
      binary: string;
      version: string;
      subjectBinary?: string;
      subjectVersion?: string;
    }>;
    startedAtEpochMs: number;
    completedAtEpochMs: number;
    stdout: Readonly<{ digest: string; byteLength: number }>;
    stderr: Readonly<{ digest: string; byteLength: number }>;
  }>;
  packageManager: 'pnpm@11.9.0';
  manifestDigest: string;
  lockDigest: string;
  registryPolicy: Readonly<{
    format: 'prodivix.windows-registry-policy.v1';
    registry: 'https://registry.npmjs.org/';
    hostFetchBoundary: 'trusted-controller';
    hostNetworkIsolationClaimed: false;
    sandboxInstallNetworkMode: 'offline';
    resolutionPolicy: 'registry-integrity-only';
    lockfileVersion: '9.0';
    integrityAlgorithm: 'sha512';
    packageCount: number;
    packageResolutionSetDigest: string;
    prohibitedSourceSchemes: readonly [
      'file:',
      'link:',
      'workspace:',
      'git:',
      'git+',
      'github:',
      'http:',
      'https:',
    ];
    maximumLockfileBytes: 4_194_304;
  }>;
  esbuildInProcess: WindowsEsbuildInProcessAuthority;
  compatibilityOmission: Readonly<{
    format: 'prodivix.windows-pnpm-compatibility-omission.v1';
    platform: 'win32-x64';
    omittedPath: 'dist/node_modules/@reflink/reflink-win32-x64-msvc';
    originalPnpmFileSetDigest: string;
    omittedFileSetDigest: string;
    nativeModuleAbsent: true;
  }>;
  nodeVersion: string;
  nodeBinaryDigest: string;
  pnpmVersion: string;
  pnpmBootstrapDigest: string;
  runtimeFileSetDigest: string;
  storeFileSetDigest: string;
  virtualStoreFileSetDigest: string;
  receiptDigest: string;
}>;

export type WindowsPackageAcquisitionAuthorityBase = Readonly<
  Omit<WindowsPackageAcquisitionAuthority, 'esbuildInProcess' | 'receiptDigest'>
>;

export type FinalizedWindowsSandboxRuntimeAuthority = Readonly<{
  esbuildInProcessAuthority: WindowsEsbuildInProcessAuthority;
  acquisitionAuthority: WindowsPackageAcquisitionAuthority;
  packageImportDigest: string;
}>;

export type WindowsAppContainerLaunchReceipt = Readonly<{
  requestDigest: string;
  startedAtEpochMs: number;
  completedAtEpochMs: number;
  profileRoot: string;
  appContainer: Readonly<{
    profileName: string;
    profileSid: string;
    tokenIsAppContainer: true;
    tokenSidMatched: true;
    tokenCapabilityCount: 0;
    capabilities: readonly [];
    profileStorageBound: true;
  }>;
  job: Readonly<{
    killOnClose: true;
    activeProcessLimit: number;
    totalProcesses: number;
    activeProcesses: 0;
    terminatedProcesses: number;
    processTreeClean: true;
  }>;
  process: Readonly<{
    environmentDigest: string;
    exitCode: number;
    signal: null;
    timedOut: boolean;
    stdout: Readonly<{
      text: string;
      digest: string;
      byteLength: number;
      truncated: false;
    }>;
    stderr: Readonly<{
      text: string;
      digest: string;
      byteLength: number;
      truncated: false;
    }>;
  }>;
}>;
