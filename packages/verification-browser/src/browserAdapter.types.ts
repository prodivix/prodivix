import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import type {
  VerificationAbortSignal,
  VerificationBrowserEngine,
  VerificationColorScheme,
  VerificationMotion,
  VerificationPlanCell,
  VerificationBaselineEntry,
  VerificationSurface,
} from '@prodivix/verification';
import type { KeyboardFocusJourneySpec } from './accessibility';
import type { PerformancePolicyProfile } from './performance';
import type { BrowserSecurityPolicyProfile } from './security';
import type {
  BrowserSecurityObservationAuthorityPort,
  BrowserSecurityObservationSet,
} from './securityObservationSet';
import type { BrowserRuntimeControlPort } from './browserRuntimeControlPort';
import type {
  AuthoredSemanticMask,
  RgbaImage,
  VisualBaselineCompatibilityProfile,
  VisualDifferenceThreshold,
} from './visualComparison';

export const BROWSER_VERIFICATION_CELL_INPUT_FORMAT =
  'prodivix.browser-verification-cell-input' as const;
export const BROWSER_VERIFICATION_CELL_INPUT_VERSION = 1 as const;
export const BROWSER_VERIFICATION_PROFILE_MEDIA_TYPE =
  'application/vnd.prodivix.browser-verification-profile+json' as const;
export const BROWSER_SCENARIO_PROGRAM_MEDIA_TYPE =
  'application/vnd.prodivix.behavior-scenario-program+json' as const;
export const BROWSER_BASELINE_SET_MEDIA_TYPE =
  'application/vnd.prodivix.verification-baseline-set+json' as const;

export const BROWSER_VERIFICATION_TARGET_BINDING_FORMAT =
  'prodivix.browser-verification-target-binding' as const;
export const BROWSER_VERIFICATION_TARGET_BINDING_VERSION = 1 as const;

/**
 * Provider-observed and provider-attested runtime facts. Expected baseline or
 * performance policy values never populate this identity.
 */
export type BrowserVerificationRuntimeIdentity = Readonly<{
  machineClass: string;
  operatingSystemImageDigest: string;
  browserImageDigest: string;
  browserEngine: VerificationBrowserEngine;
  browserVersion: string;
  fontSetDigest: string;
  viewport: Readonly<{
    widthCssPixels: number;
    heightCssPixels: number;
    devicePixelRatio: number;
  }>;
  colorScheme: VerificationColorScheme;
  motionPreference: VerificationMotion;
  locale: string;
  cacheClass: 'cold' | 'warm';
  rendererGeneration: string;
  normalizer: Readonly<{
    id: string;
    version: string;
  }>;
}>;

export type BrowserVerificationTargetBinding = Readonly<{
  format: typeof BROWSER_VERIFICATION_TARGET_BINDING_FORMAT;
  version: typeof BROWSER_VERIFICATION_TARGET_BINDING_VERSION;
  originDigest: string;
  attemptId: string;
  generation: number;
  executableSnapshotDigest: string;
  targetId: string;
  frameworkTarget: string;
  surface: VerificationSurface;
  browserEngine: VerificationBrowserEngine;
  viewport: Readonly<{
    width: number;
    height: number;
  }>;
  colorScheme: VerificationColorScheme;
  motion: VerificationMotion;
  locale: string;
  runtimeEnvironmentDigest: string;
}>;

export type BrowserVerificationTargetLease = Readonly<{
  leaseId: string;
  origin: string;
  binding: BrowserVerificationTargetBinding;
  bindingDigest: string;
  runtimeIdentity: BrowserVerificationRuntimeIdentity;
}>;

export type BrowserVerificationTargetLeasePort = Readonly<{
  acquire(
    input: Readonly<{
      cell: VerificationPlanCell;
      attemptId: string;
      generation: number;
      executableSnapshotDigest: string;
      expectedBindingDigest: string;
    }>,
    signal: VerificationAbortSignal
  ): Promise<BrowserVerificationTargetLease>;
  release(
    lease: BrowserVerificationTargetLease,
    signal: VerificationAbortSignal
  ): Promise<
    Readonly<{
      status: 'clean' | 'residual' | 'failed';
      residualCanaryIds: readonly string[];
      diagnosticCodes: readonly string[];
    }>
  >;
}>;

export type BrowserE2eCellProfile = Readonly<{
  kind: 'e2e';
  scenarioId: string;
  programDigest: string;
}>;

export type BrowserVisualCellProfile = Readonly<{
  kind: 'visual';
  observationId: string;
  stepId: string;
  /** Matrix/product target used by Plan and Baseline Set compatibility. */
  targetId: string;
  /** Semantic DOM target resolved only through the exact Scenario Program. */
  captureTargetId: string;
  sourceTraceDigest?: string;
  baseline: Readonly<{
    rasterDigest: string;
    profile: VisualBaselineCompatibilityProfile;
  }>;
  threshold: VisualDifferenceThreshold;
  masks: readonly AuthoredSemanticMask[];
}>;

export type BrowserAccessibilityCellProfile = Readonly<{
  kind: 'accessibility';
  scanTargetId: string;
  keyboardFocusJourney: KeyboardFocusJourneySpec;
}>;

export type BrowserPerformanceCellProfile = Readonly<{
  kind: 'performance';
  profileDigest: string;
  policy: PerformancePolicyProfile;
}>;

export type BrowserSecurityCellProfile = Readonly<{
  kind: 'security';
  profileDigest: string;
  observationSetDigest: string;
  policy: BrowserSecurityPolicyProfile;
}>;

export type BrowserVerificationCellProfile =
  | BrowserE2eCellProfile
  | BrowserVisualCellProfile
  | BrowserAccessibilityCellProfile
  | BrowserPerformanceCellProfile
  | BrowserSecurityCellProfile;

/**
 * Canonical JSON stored in the required `verification-profile` input ref.
 * Heavy material stays in its canonical owner and is checked against the
 * digests carried here.
 */
export type BrowserVerificationCellInput = Readonly<{
  format: typeof BROWSER_VERIFICATION_CELL_INPUT_FORMAT;
  version: typeof BROWSER_VERIFICATION_CELL_INPUT_VERSION;
  cellId: string;
  checkKind: BrowserVerificationCellProfile['kind'];
  scenarioId: string;
  targetId: string;
  frameworkTarget: string;
  surface: VerificationSurface;
  browserEngine: VerificationBrowserEngine;
  viewport: Readonly<{ width: number; height: number }>;
  colorScheme: VerificationColorScheme;
  motion: VerificationMotion;
  locale: string;
  executableSnapshotDigest: string;
  scenarioProgramDigest: string;
  controlProfileDigest: string;
  fixtureSetDigests: readonly string[];
  baselineSetDigest?: string;
  targetLeaseBindingDigest: string;
  profile: BrowserVerificationCellProfile;
}>;

export type BrowserE2eCellPolicy = Readonly<{
  kind: 'e2e';
  program: BehaviorScenarioProgram;
}>;

export type BrowserVisualCellPolicy = Readonly<{
  kind: 'visual';
  program: BehaviorScenarioProgram;
  baselineEntry: VerificationBaselineEntry;
  baselineImage: RgbaImage;
}>;

export type BrowserAccessibilityCellPolicy = Readonly<{
  kind: 'accessibility';
  program: BehaviorScenarioProgram;
}>;

export type BrowserPerformanceCellPolicy = Readonly<{
  kind: 'performance';
  program: BehaviorScenarioProgram;
}>;

export type BrowserSecurityCellPolicy = Readonly<{
  kind: 'security';
  program: BehaviorScenarioProgram;
  observationSet: BrowserSecurityObservationSet;
}>;

/**
 * Resolves only material that cannot live in the bounded JSON profile. Every
 * returned value is checked against the profile's content address.
 */
export type BrowserVerificationCellPolicy =
  | BrowserE2eCellPolicy
  | BrowserVisualCellPolicy
  | BrowserAccessibilityCellPolicy
  | BrowserPerformanceCellPolicy
  | BrowserSecurityCellPolicy;

export type BrowserVerificationBaselineAssetPort = Readonly<{
  read(
    input: VerificationBaselineEntry,
    signal: VerificationAbortSignal
  ): Promise<Uint8Array | undefined>;
}>;

export type FirstPartyBrowserVerificationAdapterOptions = Readonly<{
  targetLease: BrowserVerificationTargetLeasePort;
  runtimeControls: BrowserRuntimeControlPort;
  securityObservationAuthority: BrowserSecurityObservationAuthorityPort;
  baselineAssets?: BrowserVerificationBaselineAssetPort;
}>;
