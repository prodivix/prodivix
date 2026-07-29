import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import {
  digestVerificationValue,
  type VerificationPlanCell,
} from '@prodivix/verification';
import {
  createAccessibilityAnnouncementTextDigest,
  createBrowserCspObservationDigest,
  createBrowserNetworkObservationDigest,
  createBrowserPermissionsPolicyObservationDigest,
  createBrowserSandboxObservationDigest,
  createBrowserSecurityPolicyDigest,
  createPerformancePolicyDigest,
  type BrowserSecurityExpectedCheck,
  type BrowserVerificationCellProfile,
  type BrowserVerificationRuntimeIdentity,
} from '@prodivix/verification-browser';
import { GOLDEN_BROWSER_RESPONSE_POLICIES } from './generatedProjectHarness';
import {
  GOLDEN_G3_CATALOG_IMAGE_SYMBOL_ID,
  GOLDEN_G3_CATALOG_LIVE_STATUS_SYMBOL_ID,
  GOLDEN_G3_CATALOG_ROOT_SYMBOL_ID,
  GOLDEN_G3_CREATE_PRODUCT_SYMBOL_ID,
  GOLDEN_G3_UPDATE_PRODUCT_SYMBOL_ID,
} from './goldenG3ScenarioFixture';
import {
  GOLDEN_G3_V6_VISUAL_BASELINE_ASSET,
  goldenG3V6VisualBaselineEntryForCell,
} from './goldenG3V6VisualBaseline';
import {
  createGoldenG3V6VisualCompatibilityProfile,
  currentGoldenG3V6ControlledPlatform,
} from './goldenG3V6BrowserIdentityFixture';

export type GoldenG3V6SecurityProfileMaterial = Readonly<{
  origin: string;
  observationSetDigest: string;
  coreExpectedChecks: readonly BrowserSecurityExpectedCheck[];
  productionProbeMarkers: readonly string[];
}>;

const targetIdForSymbol = (
  program: BehaviorScenarioProgram,
  semanticSymbolId: string
): string => {
  const matches = program.targetManifest.filter(
    (target) =>
      target.semanticSymbolId === semanticSymbolId &&
      target.instanceScope === undefined
  );
  if (matches.length !== 1) {
    throw new Error(
      `Golden V6 Program must resolve semantic symbol "${semanticSymbolId}" exactly once.`
    );
  }
  return matches[0]!.targetId;
};

const performanceEnvironment = (identity: BrowserVerificationRuntimeIdentity) =>
  Object.freeze({
    machineClass: identity.machineClass,
    operatingSystemImageDigest: identity.operatingSystemImageDigest,
    browserImageDigest: identity.browserImageDigest,
    browserEngine: identity.browserEngine,
    browserVersion: identity.browserVersion,
    fontSetDigest: identity.fontSetDigest,
    viewport: Object.freeze({ ...identity.viewport }),
    colorScheme: identity.colorScheme,
    motionPreference: identity.motionPreference,
    locale: identity.locale,
    cacheClass: identity.cacheClass,
  });

const securityProfile = (
  cell: VerificationPlanCell,
  material: GoldenG3V6SecurityProfileMaterial
): BrowserVerificationCellProfile => {
  const targetId = cell.targetId;
  const expectedChecks: readonly BrowserSecurityExpectedCheck[] = Object.freeze(
    [
      ...material.coreExpectedChecks,
      Object.freeze({
        ruleId: 'security.unexpected-network',
        targetId,
        expectedDigest: createBrowserNetworkObservationDigest([
          material.origin,
        ]),
        collector: 'browser-network' as const,
      }),
      Object.freeze({
        ruleId: 'security.csp-policy',
        targetId,
        expectedDigest: createBrowserCspObservationDigest(
          GOLDEN_BROWSER_RESPONSE_POLICIES.contentSecurityPolicy
        ),
        collector: 'response-csp' as const,
      }),
      Object.freeze({
        ruleId: 'security.permissions-policy',
        targetId,
        expectedDigest: createBrowserPermissionsPolicyObservationDigest(
          GOLDEN_BROWSER_RESPONSE_POLICIES.permissionsPolicy
        ),
        collector: 'response-permissions-policy' as const,
      }),
      Object.freeze({
        ruleId: 'security.sandbox-isolation',
        targetId,
        expectedDigest: createBrowserSandboxObservationDigest({
          contextIsolation: 'fresh-nonpersistent',
          serviceWorkerPolicy: 'blocked',
          topLevel: true,
          canReachParent: true,
          sandboxTokens: Object.freeze([]),
        }),
        collector: 'browser-sandbox' as const,
      }),
      Object.freeze({
        ruleId: 'security.artifact-digest-drift',
        targetId,
        expectedDigest: digestVerificationValue({
          format: 'prodivix.golden-g3-v6-core-security-finalization',
          version: 1,
          ruleId: 'security.artifact-digest-drift',
          expectation: 'all-staged-artifact-digests-exact',
        }),
        collector: 'core-finalization' as const,
      }),
      Object.freeze({
        ruleId: 'security.cleanup-residual',
        targetId,
        expectedDigest: digestVerificationValue({
          format: 'prodivix.golden-g3-v6-core-security-finalization',
          version: 1,
          ruleId: 'security.cleanup-residual',
          expectation: 'clean-adapter-and-target-lease',
        }),
        collector: 'core-finalization' as const,
      }),
    ]
  );
  const policy = Object.freeze({
    allowedOrigins: Object.freeze([material.origin]),
    productionProbeMarkers: Object.freeze([...material.productionProbeMarkers]),
    expectedChecks,
  });
  return Object.freeze({
    kind: 'security',
    profileDigest: createBrowserSecurityPolicyDigest(policy),
    observationSetDigest: material.observationSetDigest,
    policy,
  });
};

export const createGoldenG3V6BrowserCellProfile = (
  input: Readonly<{
    cell: VerificationPlanCell;
    program: BehaviorScenarioProgram;
    runtimeIdentity: BrowserVerificationRuntimeIdentity;
    security?: GoldenG3V6SecurityProfileMaterial;
  }>
): BrowserVerificationCellProfile => {
  const { cell, program, runtimeIdentity } = input;
  switch (cell.checkKind) {
    case 'e2e':
      return Object.freeze({
        kind: 'e2e',
        scenarioId: program.scenarioId,
        programDigest: program.programDigest,
      });
    case 'visual': {
      const compatibilityProfile = createGoldenG3V6VisualCompatibilityProfile(
        cell,
        currentGoldenG3V6ControlledPlatform()
      );
      const baselineEntry = goldenG3V6VisualBaselineEntryForCell(cell);
      if (
        baselineEntry.asset.digest !==
        GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.assetDigest
      ) {
        throw new Error('Golden V6 visual baseline asset identity drifted.');
      }
      return Object.freeze({
        kind: 'visual',
        observationId: 'catalog-image-visible',
        stepId: 'catalog-image-visible',
        targetId: cell.targetId,
        captureTargetId: targetIdForSymbol(
          program,
          GOLDEN_G3_CATALOG_IMAGE_SYMBOL_ID
        ),
        baseline: Object.freeze({
          rasterDigest: GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.rasterDigest,
          profile: compatibilityProfile,
        }),
        threshold: Object.freeze({
          maximumChannelDelta: 0,
          maximumChangedPixels: 0,
          maximumChangedRatio: 0,
        }),
        masks: Object.freeze([]),
      });
    }
    case 'accessibility':
      return Object.freeze({
        kind: 'accessibility',
        scanTargetId: targetIdForSymbol(
          program,
          GOLDEN_G3_CATALOG_ROOT_SYMBOL_ID
        ),
        keyboardFocusJourney: Object.freeze({
          journeyId: 'catalog-keyboard-and-live-region',
          steps: Object.freeze([
            Object.freeze({
              stepId: 'focus-create-product',
              key: 'Tab',
              expectedTargetId: targetIdForSymbol(
                program,
                GOLDEN_G3_CREATE_PRODUCT_SYMBOL_ID
              ),
              assertionCode: 'focus-visible',
            }),
            Object.freeze({
              stepId: 'focus-update-product',
              key: 'Tab',
              expectedTargetId: targetIdForSymbol(
                program,
                GOLDEN_G3_UPDATE_PRODUCT_SYMBOL_ID
              ),
              assertionCode: 'focus-visible',
            }),
            Object.freeze({
              stepId: 'announce-update-product',
              key: 'Enter',
              assertionCode: 'dynamic-announcement',
              triggerTargetId: targetIdForSymbol(
                program,
                GOLDEN_G3_UPDATE_PRODUCT_SYMBOL_ID
              ),
              announcementTargetId: targetIdForSymbol(
                program,
                GOLDEN_G3_CATALOG_LIVE_STATUS_SYMBOL_ID
              ),
              expectedRole: 'status',
              expectedLive: 'polite',
              expectedTextDigest:
                createAccessibilityAnnouncementTextDigest('AlphaBeta Updated'),
            }),
          ]),
        }),
      });
    case 'performance': {
      const policy = Object.freeze({
        expectedEnvironment: performanceEnvironment(runtimeIdentity),
        sampling: Object.freeze({
          warmupRuns: 1,
          sampleCount: 3,
          statistic: 'p75' as const,
        }),
        thresholds: Object.freeze([
          Object.freeze({
            metricId: 'navigation-lcp' as const,
            unit: 'ms' as const,
            operator: 'less-than-or-equal' as const,
            threshold: 2_500,
          }),
          Object.freeze({
            metricId: 'layout-shift' as const,
            unit: 'ratio' as const,
            operator: 'less-than-or-equal' as const,
            threshold: 0.1,
          }),
          Object.freeze({
            metricId: 'interaction-inp' as const,
            unit: 'ms' as const,
            operator: 'less-than-or-equal' as const,
            threshold: 500,
          }),
          Object.freeze({
            metricId: 'total-blocking-time' as const,
            unit: 'ms' as const,
            operator: 'less-than-or-equal' as const,
            threshold: 500,
          }),
          Object.freeze({
            metricId: 'long-task-count' as const,
            unit: 'count' as const,
            operator: 'less-than-or-equal' as const,
            threshold: 5,
          }),
          Object.freeze({
            metricId: 'resource-count' as const,
            unit: 'count' as const,
            operator: 'less-than-or-equal' as const,
            threshold: 50,
          }),
          Object.freeze({
            metricId: 'resource-bytes' as const,
            unit: 'bytes' as const,
            operator: 'less-than-or-equal' as const,
            threshold: 5_000_000,
          }),
          Object.freeze({
            metricId: 'scenario-duration' as const,
            unit: 'ms' as const,
            operator: 'less-than-or-equal' as const,
            threshold: 5_000,
          }),
          Object.freeze({
            metricId: 'animation-missed-frame-count' as const,
            unit: 'count' as const,
            operator: 'less-than-or-equal' as const,
            threshold: 5,
          }),
          Object.freeze({
            metricId: 'animation-frame-rate' as const,
            unit: 'fps' as const,
            operator: 'greater-than-or-equal' as const,
            threshold: 30,
          }),
        ]),
      });
      return Object.freeze({
        kind: 'performance',
        profileDigest: createPerformancePolicyDigest(policy),
        policy,
      });
    }
    case 'security':
      if (!input.security) {
        throw new Error(
          `Golden V6 security cell "${cell.id}" has no production authority material.`
        );
      }
      return securityProfile(cell, input.security);
    default:
      throw new Error(
        `Golden V6 browser profile cannot represent "${cell.checkKind}".`
      );
  }
};
