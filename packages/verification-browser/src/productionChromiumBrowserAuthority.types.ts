import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import type {
  DeterministicRuntimeProvider,
  DeterministicRuntimeProviderHooks,
  ExecutableProjectSnapshot,
  ExecutionBuildBundle,
} from '@prodivix/runtime-core';
import type {
  VerificationAbortSignal,
  VerificationPlanCell,
} from '@prodivix/verification';
import type {
  BrowserVerificationRuntimeIdentity,
  BrowserVerificationTargetLease,
  BrowserVerificationTargetLeasePort,
} from './browserAdapter.types';
import type { PlaywrightBrowserImageAuthorityReceipt } from './browserImageAuthority';
import type {
  BrowserRuntimeControlPort,
  BrowserRuntimeControlRemoteBinding,
} from './browserRuntimeControlPort';
import type { FirstPartyBrowserVerificationAdapterFactory } from './firstPartyBrowserVerificationAdapterFactory';
import type {
  BrowserSecurityObservationAuthorityPort,
  BrowserSecurityObservationSet,
} from './securityObservationSet';

export const PRODUCTION_CHROMIUM_RUNTIME_AUTHORITY_FORMAT =
  'prodivix.production-chromium-runtime-authority' as const;
export const PRODUCTION_CHROMIUM_RUNTIME_AUTHORITY_VERSION = 1 as const;
export const PRODUCTION_BROWSER_CANARY_SCAN_RECEIPT_FORMAT =
  'prodivix.production-browser-canary-scan-receipt' as const;
export const PRODUCTION_BROWSER_CANARY_SCAN_RECEIPT_VERSION = 1 as const;
export const PRODUCTION_BROWSER_EXECUTABLE_SNAPSHOT_RECEIPT_FORMAT =
  'prodivix.production-browser-executable-snapshot-receipt' as const;
export const PRODUCTION_BROWSER_EXECUTABLE_SNAPSHOT_RECEIPT_VERSION =
  1 as const;
export const PRODUCTION_CHROMIUM_BROWSER_RUNTIME_RECEIPT_FORMAT =
  'prodivix.production-chromium-browser-runtime-receipt' as const;
export const PRODUCTION_CHROMIUM_BROWSER_RUNTIME_RECEIPT_VERSION = 1 as const;

export type ProductionChromiumRuntimeAuthority = Readonly<{
  format: typeof PRODUCTION_CHROMIUM_RUNTIME_AUTHORITY_FORMAT;
  version: typeof PRODUCTION_CHROMIUM_RUNTIME_AUTHORITY_VERSION;
  browserEngine: 'chromium';
  machineClass: string;
  operatingSystemImageDigest: string;
  browserVersion: string;
  fontSetDigest: string;
  devicePixelRatio: number;
  cacheClass: 'cold' | 'warm';
  rendererGeneration: string;
  normalizer: Readonly<{ id: string; version: string }>;
  browserImageAuthority: PlaywrightBrowserImageAuthorityReceipt;
  executablePathBindingDigest: string;
  authorityDigest: string;
}>;

export type ProductionChromiumRuntimeAuthorityInput = Omit<
  ProductionChromiumRuntimeAuthority,
  | 'format'
  | 'version'
  | 'browserEngine'
  | 'executablePathBindingDigest'
  | 'authorityDigest'
> &
  Readonly<{
    executablePath: string;
  }>;

export type ProductionBrowserCanaryScanSourceKind =
  | 'executable-source'
  | 'behavior-program'
  | 'production-bundle'
  | 'security-observation-set';

export type ProductionBrowserCanaryScanReceipt = Readonly<{
  format: typeof PRODUCTION_BROWSER_CANARY_SCAN_RECEIPT_FORMAT;
  version: typeof PRODUCTION_BROWSER_CANARY_SCAN_RECEIPT_VERSION;
  contentDigest: string;
  byteLength: number;
  scannerAuthorityDigest: string;
  verdict: 'clean';
  receiptDigest: string;
}>;

/**
 * Binds the compiler-owned ExecutableProjectSnapshot projection receipt to the
 * exact current-model snapshot bytes consumed by this authority.
 */
export type ProductionBrowserExecutableSnapshotReceipt = Readonly<{
  format: typeof PRODUCTION_BROWSER_EXECUTABLE_SNAPSHOT_RECEIPT_FORMAT;
  version: typeof PRODUCTION_BROWSER_EXECUTABLE_SNAPSHOT_RECEIPT_VERSION;
  digest: string;
  artifactDigest: string;
  size: number;
  mediaType: 'application/vnd.prodivix.executable-project-snapshot+json';
  codecSchemaDigest: string;
  sourceRef: string;
  compilerProjectionReceiptDigest: string;
  receiptDigest: string;
}>;

export type ProductionChromiumBrowserRuntimeReceipt = Readonly<{
  format: typeof PRODUCTION_CHROMIUM_BROWSER_RUNTIME_RECEIPT_FORMAT;
  version: typeof PRODUCTION_CHROMIUM_BROWSER_RUNTIME_RECEIPT_VERSION;
  attemptId: string;
  generation: number;
  cellId: string;
  executableSnapshotReceiptDigest: string;
  browserImageDigest: string;
  runtimeAuthorityDigest: string;
  targetBindingDigest: string;
  remoteBindingDigest: string;
  runtimeEnvironmentDigest: string;
  controlCapabilitySnapshotDigest: string;
  appliedControlDigest: string;
  canaryScanReceiptSetDigest: string;
  receiptDigest: string;
}>;

/** Secret values remain callback-bound inside this owner. */
export type ProductionBrowserCanaryScannerPort = Readonly<{
  authorityDigest: string;
  scan(
    input: Readonly<{
      sourceKind: ProductionBrowserCanaryScanSourceKind;
      sourceId: string;
      contents: Uint8Array;
    }>,
    signal: VerificationAbortSignal
  ): Promise<ProductionBrowserCanaryScanReceipt>;
}>;

export type ProductionBrowserPreviewResource = Readonly<{
  path: string;
  kind: 'control-host' | 'entry' | 'bundle';
  contentDigest: string;
  contents: Uint8Array;
}>;

export type ProductionBrowserRemoteExecutionEvidence = Readonly<{
  attemptId: string;
  generation: number;
  requestId: string;
  executionId: string;
  snapshotDigest: string;
  materializedBundleDigest: string;
  materializedOrigin: string;
  materializedEntryUrl: string;
  materializedEntryFilePath: string;
  materializedEntryDigest: string;
  materializedFileCount: number;
  evidenceDigest: string;
}>;

export type ProductionBrowserPreviewHostReleaseResult = Readonly<{
  status: 'clean' | 'residual' | 'failed';
  residualCanaryIds: readonly string[];
  diagnosticCodes: readonly string[];
}>;

export type ProductionBrowserPreviewHostLease = Readonly<{
  leaseId: string;
  origin: string;
  servingMode: 'route-verified-content-addressed';
  remoteExecution: ProductionBrowserRemoteExecutionEvidence;
  retire(
    signal: VerificationAbortSignal
  ): Promise<ProductionBrowserPreviewHostReleaseResult>;
}>;

/**
 * Browser Runtime Host stays with its production owner. This port receives an
 * exact byte manifest and returns independently bound loopback materialization.
 */
export type ProductionBrowserPreviewHostPort = Readonly<{
  authorityDigest: string;
  materialize(
    input: Readonly<{
      attemptId: string;
      generation: number;
      snapshotDigest: string;
      buildBundleDigest: string;
      requestId: string;
      executionId: string;
      entryFilePath: string;
      entryDigest: string;
      buildFileCount: number;
      entryRoutes: readonly string[];
      resources: readonly ProductionBrowserPreviewResource[];
    }>,
    signal: VerificationAbortSignal
  ): Promise<ProductionBrowserPreviewHostLease>;
}>;

/**
 * The caller implements this port with runtime-remote's current
 * `createRemoteDeterministicReplayProvider`; this package cannot own that
 * package's provider semantics without violating the canonical dependency DAG.
 */
export type ProductionBrowserRemoteRuntimeProviderPort = Readonly<{
  providerId: string;
  providerVersion: string;
  implementationDigest: string;
  create(
    hooks: Required<DeterministicRuntimeProviderHooks>
  ): DeterministicRuntimeProvider;
}>;

export type ProductionChromiumBrowserAuthorityOptions = Readonly<{
  runtimeAuthority: ProductionChromiumRuntimeAuthorityInput;
  previewHost: ProductionBrowserPreviewHostPort;
  runtimeProvider: ProductionBrowserRemoteRuntimeProviderPort;
  canaryScanner: ProductionBrowserCanaryScannerPort;
  resourceVerificationTimeoutMs?: number;
}>;

export type ProductionChromiumBrowserRegistrationInput = Readonly<{
  cell: VerificationPlanCell;
  attemptId: string;
  generation: number;
  providerKind: 'remote';
  snapshot: ExecutableProjectSnapshot;
  buildBundle: ExecutionBuildBundle;
  program: BehaviorScenarioProgram;
  runtimeAuthority: ProductionChromiumRuntimeAuthority;
  remoteExecution: ProductionBrowserRemoteExecutionEvidence;
  executableSnapshotReceipt: ProductionBrowserExecutableSnapshotReceipt;
  projectionAuthorityDigest: string;
  securityObservationSet?: BrowserSecurityObservationSet;
}>;

export type ProductionChromiumBrowserRegistration = Readonly<{
  lease: BrowserVerificationTargetLease;
  runtimeIdentity: BrowserVerificationRuntimeIdentity;
  runtimeAuthority: ProductionChromiumRuntimeAuthority;
  runtimeEnvironmentDigest: string;
  controlCapabilitySnapshotDigest: string;
  appliedControlDigest: string;
  controlCapabilityIds: readonly string[];
  origin: string;
  remoteBinding: BrowserRuntimeControlRemoteBinding;
  browserImageAuthority: PlaywrightBrowserImageAuthorityReceipt;
  executableSnapshotReceipt: ProductionBrowserExecutableSnapshotReceipt;
  runtimeReceipt: ProductionChromiumBrowserRuntimeReceipt;
  canaryScanReceiptSetDigest: string;
  retire(): Promise<ProductionBrowserPreviewHostReleaseResult>;
}>;

export type ProductionChromiumBrowserAuthoritySnapshot = Readonly<{
  state: 'accepting' | 'draining' | 'closed';
  registered: number;
  acquiredTargetLeases: number;
  acquiredRuntimeLeases: number;
  activeRuntimeSessions: number;
}>;

export type ProductionChromiumBrowserAuthority = Readonly<{
  runtimeAuthority: ProductionChromiumRuntimeAuthority;
  targetLease: BrowserVerificationTargetLeasePort;
  runtimeControls: BrowserRuntimeControlPort;
  securityObservationAuthority: BrowserSecurityObservationAuthorityPort;
  adapterFactory: FirstPartyBrowserVerificationAdapterFactory;
  register(
    input: ProductionChromiumBrowserRegistrationInput,
    signal: VerificationAbortSignal
  ): Promise<ProductionChromiumBrowserRegistration>;
  snapshot(): ProductionChromiumBrowserAuthoritySnapshot;
  drainAndDispose(): Promise<ProductionBrowserPreviewHostReleaseResult>;
}>;
