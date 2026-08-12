import type { ControlledStaticToolchainAuthorityReceipt } from '../src/controlledStaticToolchainProtocol';

export type ControlledStaticToolchainSandboxAuthority = Readonly<{
  pnpmVersion: string;
  nodeVersion: string;
  typescriptVersion: string;
  vitestVersion: string;
  viteVersion: string;
  rollupVersion: string;
  rollupImplementation: '@rollup/wasm-node';
  rollupAliasSpec: 'npm:@rollup/wasm-node@4.62.3';
  esbuildVersion: string;
  esbuildImplementation: 'esbuild-wasm';
  esbuildAliasSpec: 'npm:esbuild-wasm@0.27.7';
  manifestDigest: string;
  lockDigest: string;
  toolchainFileSetDigest: string;
  isolationProbeDigest: string;
}>;

export type ControlledStaticToolchainSandboxExecution = Readonly<{
  testProviderRoot: string;
  buildProviderRoot: string;
  buildFiles: readonly Readonly<{
    path: string;
    size: number;
    digest: string;
    contents: Uint8Array;
  }>[];
  testReport: Uint8Array;
  coverageSummary: Uint8Array;
  buildLog: string;
  authorityReceipt: ControlledStaticToolchainAuthorityReceipt;
}>;
