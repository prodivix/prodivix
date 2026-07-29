import { describe, expect, it } from 'vitest';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  digestVerificationValue,
  VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS,
} from '@prodivix/verification';
import {
  BROWSER_VERIFICATION_CELL_INPUT_FORMAT,
  BROWSER_VERIFICATION_CELL_INPUT_VERSION,
  type BrowserVerificationCellInput,
} from './browserAdapter.types';
import {
  createBrowserVerificationProfileInputRef,
  decodeBrowserVerificationCellInput,
  encodeBrowserVerificationCellInput,
} from './browserVerificationCellInput';
import {
  createPerformancePolicyDigest,
  type PerformancePolicyProfile,
} from './performance';
import {
  createBrowserSecurityPolicyDigest,
  type BrowserSecurityHardRuleId,
  type BrowserSecurityPolicyProfile,
} from './security';

const sha = (value: unknown): string => digestVerificationValue(value);

const profile = (): BrowserVerificationCellInput =>
  Object.freeze({
    format: BROWSER_VERIFICATION_CELL_INPUT_FORMAT,
    version: BROWSER_VERIFICATION_CELL_INPUT_VERSION,
    cellId: 'cell:e2e',
    checkKind: 'e2e',
    scenarioId: 'scenario:catalog',
    targetId: 'target:catalog',
    frameworkTarget: 'react-vite',
    surface: 'ci',
    browserEngine: 'chromium',
    viewport: Object.freeze({ width: 1280, height: 720 }),
    colorScheme: 'light',
    motion: 'reduced',
    locale: 'en-US',
    executableSnapshotDigest: sha('snapshot'),
    scenarioProgramDigest: sha('program'),
    controlProfileDigest: sha('controls'),
    fixtureSetDigests: Object.freeze([sha('fixture')]),
    targetLeaseBindingDigest: sha('lease'),
    profile: Object.freeze({
      kind: 'e2e',
      scenarioId: 'scenario:catalog',
      programDigest: sha('program'),
    }),
  });

const performancePolicy = (): PerformancePolicyProfile =>
  Object.freeze({
    expectedEnvironment: Object.freeze({
      machineClass: 'ci.standard-4',
      operatingSystemImageDigest: sha('os'),
      browserImageDigest: sha('browser'),
      browserEngine: 'chromium',
      browserVersion: '123.0.0',
      fontSetDigest: sha('fonts'),
      viewport: Object.freeze({
        widthCssPixels: 1280,
        heightCssPixels: 720,
        devicePixelRatio: 1,
      }),
      colorScheme: 'light',
      motionPreference: 'reduced',
      locale: 'en-US',
      cacheClass: 'warm',
    }),
    sampling: Object.freeze({
      warmupRuns: 1,
      sampleCount: 3,
      statistic: 'median',
    }),
    thresholds: Object.freeze([
      Object.freeze({
        metricId: 'navigation-lcp',
        unit: 'ms',
        operator: 'less-than-or-equal',
        threshold: 100,
      }),
    ]),
  });

const collectorFor = (
  ruleId: BrowserSecurityHardRuleId
): BrowserSecurityPolicyProfile['expectedChecks'][number]['collector'] =>
  (
    ({
      'security.secret-canary': 'core-resolved-observation',
      'security.unexpected-network': 'browser-network',
      'security.csp-policy': 'response-csp',
      'security.permissions-policy': 'response-permissions-policy',
      'security.sandbox-isolation': 'browser-sandbox',
      'security.production-probe-leak': 'core-resolved-observation',
      'security.artifact-digest-drift': 'core-finalization',
      'security.cleanup-residual': 'core-finalization',
      'security.output-artifact-uninspectable': 'core-resolved-observation',
    }) as const
  )[ruleId];

const securityPolicy = (): BrowserSecurityPolicyProfile =>
  Object.freeze({
    allowedOrigins: Object.freeze(['https://app.example.test']),
    productionProbeMarkers: Object.freeze(['verification-probe-canary']),
    expectedChecks: Object.freeze(
      VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS.map((ruleId) =>
        Object.freeze({
          ruleId,
          targetId: `target:${ruleId}`,
          expectedDigest: sha(ruleId),
          collector: collectorFor(ruleId),
        })
      )
    ),
  });

describe('browser verification cell input codec', () => {
  it('emits one canonical content-addressed verification-profile ref', () => {
    const value = profile();
    const bytes = encodeBrowserVerificationCellInput(value);
    expect(new TextDecoder().decode(bytes)).toBe(canonicalJsonText(value));
    expect(decodeBrowserVerificationCellInput(bytes)).toEqual(value);
    const input = createBrowserVerificationProfileInputRef(
      'input:profile',
      value
    );
    expect(input.ref).toMatchObject({
      kind: 'verification-profile',
      size: bytes.byteLength,
    });
    expect(input.bytes).toEqual(bytes);
  });

  it('rejects non-canonical bytes, unknown fields, symbols, and accessors without invoking them', () => {
    const value = profile();
    expect(() =>
      decodeBrowserVerificationCellInput(JSON.stringify(value, null, 2))
    ).toThrow(/canonical JSON/u);
    expect(() =>
      decodeBrowserVerificationCellInput({
        ...value,
        unknownField: 'not-allowed',
      })
    ).toThrow(/unknown|missing/u);
    expect(() =>
      decodeBrowserVerificationCellInput({
        ...value,
        [Symbol('hidden')]: true,
      })
    ).toThrow(/symbols/u);

    let invoked = false;
    const accessor = { ...value } as Record<string, unknown>;
    Object.defineProperty(accessor, 'scenarioId', {
      enumerable: true,
      get: () => {
        invoked = true;
        return value.scenarioId;
      },
    });
    expect(() => decodeBrowserVerificationCellInput(accessor)).toThrow(
      /data properties/u
    );
    expect(invoked).toBe(false);
  });

  it('keeps performance and security profile schemas owner-exact', () => {
    const base = profile();
    const performance = performancePolicy();
    const performanceInput = {
      ...base,
      cellId: 'cell:performance',
      checkKind: 'performance',
      profile: {
        kind: 'performance',
        profileDigest: createPerformancePolicyDigest(performance),
        policy: performance,
      },
    };
    expect(
      decodeBrowserVerificationCellInput(performanceInput).profile
    ).toEqual(performanceInput.profile);
    expect(() =>
      decodeBrowserVerificationCellInput({
        ...performanceInput,
        profile: {
          ...performanceInput.profile,
          observationSetDigest: sha('not-performance-owned'),
        },
      })
    ).toThrow(/unknown|missing/u);

    const security = securityPolicy();
    const securityInput = {
      ...base,
      cellId: 'cell:security',
      checkKind: 'security',
      profile: {
        kind: 'security',
        profileDigest: createBrowserSecurityPolicyDigest(security),
        observationSetDigest: sha('security-observations'),
        policy: security,
      },
    };
    expect(decodeBrowserVerificationCellInput(securityInput).profile).toEqual(
      securityInput.profile
    );
    const { observationSetDigest: _, ...incompleteSecurityProfile } =
      securityInput.profile;
    expect(() =>
      decodeBrowserVerificationCellInput({
        ...securityInput,
        profile: incompleteSecurityProfile,
      })
    ).toThrow(/unknown|missing/u);
  });

  it('keeps dynamic accessibility announcement journeys owner-exact', () => {
    const base = profile();
    const accessibilityInput = {
      ...base,
      cellId: 'cell:accessibility',
      checkKind: 'accessibility',
      profile: {
        kind: 'accessibility',
        scanTargetId: 'target:catalog',
        keyboardFocusJourney: {
          journeyId: 'journey:catalog',
          steps: [
            {
              stepId: 'step:focus',
              key: 'Tab',
              expectedTargetId: 'target:create',
              assertionCode: 'focus-target',
            },
            {
              stepId: 'step:announce',
              key: 'Enter',
              assertionCode: 'dynamic-announcement',
              triggerTargetId: 'target:create',
              announcementTargetId: 'target:status',
              expectedRole: 'status',
              expectedLive: 'polite',
              expectedTextDigest: sha('Product created'),
            },
          ],
        },
      },
    } satisfies BrowserVerificationCellInput;

    expect(
      decodeBrowserVerificationCellInput(accessibilityInput).profile
    ).toEqual(accessibilityInput.profile);
    expect(() =>
      decodeBrowserVerificationCellInput({
        ...accessibilityInput,
        profile: {
          ...accessibilityInput.profile,
          keyboardFocusJourney: {
            ...accessibilityInput.profile.keyboardFocusJourney,
            steps: [
              accessibilityInput.profile.keyboardFocusJourney.steps[0],
              {
                ...accessibilityInput.profile.keyboardFocusJourney.steps[1],
                expectedTargetId: 'target:not-dynamic-owned',
              },
            ],
          },
        },
      })
    ).toThrow(/unknown/u);
  });
});
