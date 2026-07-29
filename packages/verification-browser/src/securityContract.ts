import {
  compareVerificationText,
  digestVerificationValue,
  VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS,
  VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS,
} from '@prodivix/verification';
import {
  assertUniqueIdentities,
  BROWSER_PRIVATE_PAYLOAD_LIMITS,
  BrowserPrivatePayloadError,
  strictArray,
  strictEnum,
  strictIdentifier,
  strictObject,
  strictSha256Digest,
  strictString,
  throwPartial,
} from './privateBoundary';

export type BrowserSecurityHardRuleId =
  (typeof VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS)[number];

const SECURITY_RULE_METADATA = {
  'security.secret-canary': Object.freeze({
    severity: 'critical',
    failureMessageKey: 'verification.security.secretCanaryDetected',
    blockedMessageKey: 'verification.security.secretCanaryUnobserved',
    diagnosticCode: 'VER-SEC-SECRET-CANARY',
  }),
  'security.unexpected-network': Object.freeze({
    severity: 'critical',
    failureMessageKey: 'verification.security.unexpectedNetwork',
    blockedMessageKey: 'verification.security.networkUnobserved',
    diagnosticCode: 'VER-SEC-UNEXPECTED-NETWORK',
  }),
  'security.csp-policy': Object.freeze({
    severity: 'critical',
    failureMessageKey: 'verification.security.cspPolicyWidened',
    blockedMessageKey: 'verification.security.cspPolicyUnobserved',
    diagnosticCode: 'VER-SEC-CSP',
  }),
  'security.permissions-policy': Object.freeze({
    severity: 'critical',
    failureMessageKey: 'verification.security.permissionsPolicyWidened',
    blockedMessageKey: 'verification.security.permissionsPolicyUnobserved',
    diagnosticCode: 'VER-SEC-PERMISSIONS',
  }),
  'security.sandbox-isolation': Object.freeze({
    severity: 'critical',
    failureMessageKey: 'verification.security.sandboxIsolationFailed',
    blockedMessageKey: 'verification.security.sandboxIsolationUnobserved',
    diagnosticCode: 'VER-SEC-SANDBOX',
  }),
  'security.production-probe-leak': Object.freeze({
    severity: 'critical',
    failureMessageKey: 'verification.security.productionProbeLeak',
    blockedMessageKey: 'verification.security.productionProbeUnobserved',
    diagnosticCode: 'VER-SEC-PROBE-LEAK',
  }),
  'security.artifact-digest-drift': Object.freeze({
    severity: 'critical',
    failureMessageKey: 'verification.security.artifactDigestDrift',
    blockedMessageKey: 'verification.security.artifactDigestUnobserved',
    diagnosticCode: 'VER-SEC-ARTIFACT-DIGEST',
  }),
  'security.cleanup-residual': Object.freeze({
    severity: 'critical',
    failureMessageKey: 'verification.security.cleanupResidual',
    blockedMessageKey: 'verification.security.cleanupUnobserved',
    diagnosticCode: 'VER-SEC-CLEANUP-RESIDUAL',
  }),
  'security.output-artifact-uninspectable': Object.freeze({
    severity: 'critical',
    failureMessageKey: 'verification.security.outputArtifactUninspectable',
    blockedMessageKey: 'verification.security.outputInspectionUnobserved',
    diagnosticCode: 'VER-SEC-OUTPUT-UNINSPECTABLE',
  }),
} as const satisfies Readonly<
  Record<
    BrowserSecurityHardRuleId,
    Readonly<{
      severity: 'critical';
      failureMessageKey: string;
      blockedMessageKey: string;
      diagnosticCode: string;
    }>
  >
>;

export const BROWSER_SECURITY_HARD_RULES = Object.freeze(
  VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS.map((ruleId) =>
    Object.freeze({ ruleId, ...SECURITY_RULE_METADATA[ruleId] })
  )
);

export const BROWSER_SECURITY_NON_EXEMPTIBLE_RULE_IDS = Object.freeze(
  [...VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS].sort(compareVerificationText)
);

export type SecurityCheckObservation =
  | Readonly<{
      ruleId: BrowserSecurityHardRuleId;
      state: 'complete';
      targetId: string;
      expectedDigest: string;
      observedDigest: string;
      violationCount: number;
      diagnosticCodes: readonly string[];
      sourceTraceDigest?: string;
    }>
  | Readonly<{
      ruleId: BrowserSecurityHardRuleId;
      state: 'blocked';
      targetId: string;
      expectedDigest: string;
      reasonCode: string;
      diagnosticCodes: readonly string[];
      sourceTraceDigest?: string;
    }>;

export type DecodedBrowserSecurityPayload = Readonly<{
  format: 'prodivix.browser-security-pre-finalization-report';
  version: 1;
  tool: Readonly<{
    name: 'prodivix-security-aggregate';
    version: string;
    schemaDigest: string;
  }>;
  checks: readonly SecurityCheckObservation[];
}>;

export type DecodedBrowserOwnedSecurityPayload = Readonly<{
  format: 'prodivix.browser-owned-security-report';
  version: 1;
  tool: Readonly<{
    name: 'playwright';
    version: string;
    schemaDigest: string;
  }>;
  checks: readonly SecurityCheckObservation[];
}>;

export type BrowserSecurityFinding = Readonly<{
  ruleId: BrowserSecurityHardRuleId;
  severity: 'critical';
  targetId: string;
  messageKey: string;
  count: number;
  diagnosticCodes: readonly string[];
  sourceTraceDigest?: string;
  disposition: 'failed' | 'blocked';
  nonExemptible: true;
}>;

export type BrowserSecurityEvaluation = Readonly<{
  verdict: 'passed' | 'failed' | 'blocked';
  findings: readonly BrowserSecurityFinding[];
  checks: readonly SecurityCheckObservation[];
  nonExemptibleRuleIds: readonly BrowserSecurityHardRuleId[];
  pendingFinalizationRuleIds: readonly BrowserSecurityHardRuleId[];
  tool: DecodedBrowserSecurityPayload['tool'];
}>;

export type BrowserSecurityExemption = Readonly<{
  exemptionId: string;
  ruleId: BrowserSecurityHardRuleId;
  reasonCode: string;
}>;

export type BrowserSecurityExpectedCheck = Readonly<{
  ruleId: BrowserSecurityHardRuleId;
  targetId: string;
  expectedDigest: string;
  collector:
    | 'browser-network'
    | 'response-csp'
    | 'response-permissions-policy'
    | 'browser-sandbox'
    | 'core-resolved-observation'
    | 'core-finalization';
}>;

export type BrowserSecurityPolicyProfile = Readonly<{
  allowedOrigins: readonly string[];
  productionProbeMarkers: readonly string[];
  expectedChecks: readonly BrowserSecurityExpectedCheck[];
}>;

export const BROWSER_SECURITY_RULE_IDS = Object.freeze(
  [...VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS].sort(compareVerificationText)
);

const REQUIRED_SECURITY_COLLECTOR: Readonly<
  Record<BrowserSecurityHardRuleId, BrowserSecurityExpectedCheck['collector']>
> = Object.freeze({
  'security.secret-canary': 'core-resolved-observation',
  'security.unexpected-network': 'browser-network',
  'security.csp-policy': 'response-csp',
  'security.permissions-policy': 'response-permissions-policy',
  'security.sandbox-isolation': 'browser-sandbox',
  'security.production-probe-leak': 'core-resolved-observation',
  'security.artifact-digest-drift': 'core-finalization',
  'security.cleanup-residual': 'core-finalization',
  'security.output-artifact-uninspectable': 'core-resolved-observation',
});

export const BROWSER_SECURITY_CORE_RESOLVED_RULE_IDS = Object.freeze([
  'security.output-artifact-uninspectable',
  'security.production-probe-leak',
  'security.secret-canary',
] as const satisfies readonly BrowserSecurityHardRuleId[]);

export type BrowserSecurityCoreResolvedRuleId =
  (typeof BROWSER_SECURITY_CORE_RESOLVED_RULE_IDS)[number];

export const BROWSER_SECURITY_BROWSER_OWNED_RULE_IDS = Object.freeze([
  'security.csp-policy',
  'security.permissions-policy',
  'security.sandbox-isolation',
  'security.unexpected-network',
] as const satisfies readonly BrowserSecurityHardRuleId[]);

export const BROWSER_SECURITY_POST_CLEANUP_RULE_IDS = Object.freeze([
  'security.artifact-digest-drift',
  'security.cleanup-residual',
] as const satisfies readonly BrowserSecurityHardRuleId[]);

export const BROWSER_SECURITY_ADAPTER_OBSERVED_RULE_IDS =
  VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS;

const normalizeOrigin = (value: unknown, path: string): string => {
  const source = strictString(value, path, 2_048);
  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch (error) {
    throw new BrowserPrivatePayloadError(
      'invalid-field',
      path,
      `${path} must be an absolute HTTP(S) origin.`,
      { cause: error }
    );
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    source !== parsed.origin
  ) {
    throw new BrowserPrivatePayloadError(
      'invalid-field',
      path,
      `${path} must contain an origin only, without credentials, path, query, or fragment.`
    );
  }
  return parsed.origin;
};

const normalizeOpaqueProbeMarker = (value: unknown, path: string): string => {
  const marker = strictString(value, path, 256);
  if (new TextEncoder().encode(marker).byteLength > 256) {
    throw new BrowserPrivatePayloadError(
      'budget-exceeded',
      path,
      `${path} exceeds the 256 byte opaque marker limit.`
    );
  }
  return marker;
};

const normalizeExpectedChecks = (
  input: readonly BrowserSecurityExpectedCheck[]
): readonly BrowserSecurityExpectedCheck[] => {
  const checks = strictArray(
    input,
    '$.expectedChecks',
    BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumSecurityChecks
  ).map((value, index) => {
    const path = `$.expectedChecks[${index}]`;
    const discriminant = strictObject(value, path, [
      'ruleId',
      'targetId',
      'expectedDigest',
      'collector',
    ]);
    const collector = strictEnum(discriminant.collector, `${path}.collector`, [
      'browser-network',
      'response-csp',
      'response-permissions-policy',
      'browser-sandbox',
      'core-resolved-observation',
      'core-finalization',
    ] as const);
    const base = {
      ruleId: strictEnum(
        discriminant.ruleId,
        `${path}.ruleId`,
        BROWSER_SECURITY_RULE_IDS
      ),
      targetId: strictIdentifier(discriminant.targetId, `${path}.targetId`),
      expectedDigest: strictSha256Digest(
        discriminant.expectedDigest,
        `${path}.expectedDigest`
      ),
    };
    if (collector !== REQUIRED_SECURITY_COLLECTOR[base.ruleId]) {
      throw new BrowserPrivatePayloadError(
        'invalid-field',
        `${path}.collector`,
        `${path}.collector cannot replace the fixed owner of hard rule "${base.ruleId}".`
      );
    }
    return Object.freeze({ ...base, collector });
  });
  assertUniqueIdentities(checks, ({ ruleId }) => ruleId, '$.expectedChecks');
  const observed = new Set(checks.map(({ ruleId }) => ruleId));
  const missing = BROWSER_SECURITY_RULE_IDS.filter(
    (ruleId) => !observed.has(ruleId)
  );
  if (missing.length > 0) {
    throwPartial(
      '$.expectedChecks',
      `Security policy is missing hard rules: ${missing.join(', ')}.`
    );
  }
  return Object.freeze(
    [...checks].sort((left, right) =>
      compareVerificationText(left.ruleId, right.ruleId)
    )
  );
};

export const createBrowserSecurityPolicyDigest = (
  profile: BrowserSecurityPolicyProfile
): string => {
  const value = strictObject(profile, '$', [
    'allowedOrigins',
    'productionProbeMarkers',
    'expectedChecks',
  ]);
  const allowedOrigins = strictArray(
    value.allowedOrigins,
    '$.allowedOrigins',
    256
  ).map((origin, index) =>
    normalizeOrigin(origin, `$.allowedOrigins[${index}]`)
  );
  assertUniqueIdentities(
    allowedOrigins,
    (origin) => origin,
    '$.allowedOrigins'
  );
  const productionProbeMarkers = strictArray(
    value.productionProbeMarkers,
    '$.productionProbeMarkers',
    256
  ).map((marker, index) =>
    normalizeOpaqueProbeMarker(marker, `$.productionProbeMarkers[${index}]`)
  );
  if (productionProbeMarkers.length === 0) {
    throwPartial(
      '$.productionProbeMarkers',
      'Security policy must declare at least one production probe marker.'
    );
  }
  assertUniqueIdentities(
    productionProbeMarkers,
    (marker) => marker,
    '$.productionProbeMarkers'
  );
  const expectedChecks = normalizeExpectedChecks(
    value.expectedChecks as readonly BrowserSecurityExpectedCheck[]
  );
  return digestVerificationValue({
    kind: 'browser-security-policy',
    version: 1,
    allowedOrigins: [...allowedOrigins].sort(compareVerificationText),
    productionProbeMarkers: [...productionProbeMarkers].sort(
      compareVerificationText
    ),
    expectedChecks: expectedChecks.map(
      ({ ruleId, targetId, expectedDigest, collector }) => ({
        ruleId,
        targetId,
        expectedDigest,
        collector,
      })
    ),
  });
};
