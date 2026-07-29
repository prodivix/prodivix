import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import type {
  VerificationArtifactConsoleEvent,
  VerificationArtifactNetworkOperation,
  VerificationBrowserEngine,
  VerificationPlanCell,
} from '@prodivix/verification';
import type { KeyboardFocusJourneySpec } from './accessibility';
import type {
  BrowserVerificationRuntimeIdentity,
  BrowserVisualCellProfile,
} from './browserAdapter.types';
import type {
  BrowserRuntimeControlAttestation,
  BrowserRuntimeControlLease,
  BrowserRuntimeControlProviderKind,
} from './browserRuntimeControlPort';
import type { PerformancePolicyProfile } from './performance';
import type { BrowserSecurityPolicyProfile } from './security';
import type {
  RgbaImage,
  VisualBaselineCompatibilityProfile,
} from './visualComparison';

export type BrowserToolVisualCapture = Readonly<{
  image: RgbaImage;
  pngBytes: Uint8Array;
  digest: string;
  profile: VisualBaselineCompatibilityProfile;
}>;

/**
 * Package-private execution seam. It carries only bounded reporter payloads
 * and raster bytes; Playwright Browser/Page/Locator handles never cross it.
 */
export type BrowserToolSession = Readonly<{
  observedRuntimeIdentity: BrowserVerificationRuntimeIdentity;
  runtimeControlAttestation: BrowserRuntimeControlAttestation;
  executeBehavior(program: BehaviorScenarioProgram): Promise<unknown>;
  scanAccessibility(
    scanTargetId: string,
    targetManifest: BehaviorScenarioProgram['targetManifest']
  ): Promise<unknown>;
  executeKeyboardFocusJourney(
    spec: KeyboardFocusJourneySpec,
    targetManifest: BehaviorScenarioProgram['targetManifest'],
    settleMs: number
  ): Promise<unknown>;
  captureVisual(
    profile: BrowserVisualCellProfile,
    targetManifest: BehaviorScenarioProgram['targetManifest']
  ): Promise<BrowserToolVisualCapture>;
  collectPerformance(
    policy: PerformancePolicyProfile,
    profileDigest: string,
    program: BehaviorScenarioProgram
  ): Promise<unknown>;
  collectSecurity(profile: BrowserSecurityPolicyProfile): Promise<unknown>;
  collectNetworkSummary(): Promise<
    readonly VerificationArtifactNetworkOperation[]
  >;
  collectConsoleSummary(): Promise<readonly VerificationArtifactConsoleEvent[]>;
  finalizeRuntimeControls(): Promise<BrowserRuntimeControlAttestation>;
  close(): Promise<void>;
}>;

export type BrowserToolPoolAcquireInput = Readonly<{
  engine: VerificationBrowserEngine;
  origin: string;
  cell: VerificationPlanCell;
  runtimeIdentity: BrowserVerificationRuntimeIdentity;
  providerKind: BrowserRuntimeControlProviderKind;
  runtimeControlLease: BrowserRuntimeControlLease;
  launch: Readonly<{
    headless: true;
    executablePath?: string;
  }>;
}>;

export type BrowserToolPool = Readonly<{
  acquire(input: BrowserToolPoolAcquireInput): Promise<BrowserToolSession>;
  dispose(): Promise<void>;
}>;

export type BrowserToolPoolFactory = () => BrowserToolPool;
