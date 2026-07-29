export type GoldenControlledStaticToolchainCommandReceipt = Readonly<{
  stage: 'version' | 'install' | 'isolation' | 'typecheck' | 'test' | 'build';
  application: string;
  args: readonly string[];
  cwd: 'workspace:/';
  executionBoundary: 'sandbox';
  environmentDigest: string;
  tool: Readonly<{
    binary: string;
    version: string;
    subjectBinary?: string;
    subjectVersion?: string;
  }>;
  startedAtEpochMs: number;
  completedAtEpochMs: number;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: Readonly<{
    digest: string;
    byteLength: number;
    capturedByteLength: number;
    truncated: boolean;
  }>;
  stderr: Readonly<{
    digest: string;
    byteLength: number;
    capturedByteLength: number;
    truncated: boolean;
  }>;
}>;

export type GoldenControlledStaticToolchainAuthorityReceipt = Readonly<{
  format: 'prodivix.controlled-static-toolchain-authority-receipt.v1';
  provider: 'windows-appcontainer' | 'linux-rootless-podman';
  requestDigest: string;
  snapshotDigest: string;
  environment: Readonly<{
    install: Readonly<{ keys: readonly string[]; digest: string }>;
    execution: Readonly<{ keys: readonly string[]; digest: string }>;
  }>;
  commands: readonly GoldenControlledStaticToolchainCommandReceipt[];
  isolation: Readonly<{
    provider: 'windows-appcontainer' | 'linux-rootless-podman';
    networkMode: 'none';
    liveEgressAttemptCount: number;
    liveEgressSuccessCount: 0;
    hostMountCount: 0;
    rootFilesystem: 'read-only' | 'appcontainer-lowbox';
    authority: unknown;
  }>;
  processTree: unknown;
  toolchain: Readonly<{
    pnpmVersion: string;
    nodeVersion: string;
    nodeBinaryDigest: string;
    typescriptVersion: string;
    vitestVersion: string;
    viteVersion: string;
    rollupVersion: '4.62.3';
    rollupImplementation: '@rollup/wasm-node';
    rollupAliasSpec: 'npm:@rollup/wasm-node@4.62.3';
    esbuildVersion: '0.27.7';
    esbuildImplementation: 'esbuild-wasm';
    esbuildAliasSpec: 'npm:esbuild-wasm@0.27.7';
    manifestDigest: string;
    lockDigest: string;
    toolchainFileSetDigest: string;
  }>;
  artifacts: Readonly<{
    testReportDigest: string;
    coverageSummaryDigest: string;
    buildLogDigest: string;
    buildFileSetDigest: string;
    buildFileCount: number;
  }>;
  sandboxResultDigest: string;
  receiptDigest: string;
}>;
