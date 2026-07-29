import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  digestVerificationValue,
  type VerificationAdapterInputRef,
} from '@prodivix/verification';
import {
  BROWSER_SECURITY_CORE_OBSERVATION_SOURCES,
  BROWSER_SECURITY_CORE_RESOLVED_RULE_IDS,
  createBrowserCspObservationDigest,
  createBrowserPermissionsPolicyObservationDigest,
  createBrowserSecurityObservationSetInputRef,
  createBrowserVerificationOriginDigest,
  createBrowserVerificationTargetBindingDigest,
  decodeBrowserSecurityObservationSet,
  normalizeBrowserVerificationTargetBinding,
  type BrowserSecurityCoreResolvedRuleId,
  type BrowserSecurityExpectedCheck,
  type BrowserSecurityObservationAuthorityPort,
  type BrowserSecurityObservationSet,
  type BrowserSecurityObservationSetBinding,
  type BrowserSecurityOwnedObservation,
  type BrowserVerificationTargetBinding,
} from '@prodivix/verification-browser';
import { GOLDEN_BROWSER_RESPONSE_POLICIES } from './generatedProjectHarness';
import {
  GoldenG3V6ProductionSecurityError,
  createGoldenG3V6ProductionSecurityBundleOwner,
  type GoldenG3V6ProductionSecurityBundleInspection,
  type GoldenG3V6ProductionSecurityBundleOwner,
  type GoldenG3V6ProductionSecurityBundleOwnerInput,
  type GoldenG3V6ProductionSecurityRuleInspection,
} from './goldenG3V6ProductionSecurityBundle';

export {
  GoldenG3V6ProductionSecurityError,
  digestGoldenG3V6ProductionBuildBundle,
} from './goldenG3V6ProductionSecurityBundle';

export const GOLDEN_G3_V6_CONTENT_SECURITY_POLICY_DIGEST =
  'sha256-02969bcd0232f54083e8d442a6d4c2ed6424c20ea52f84c30614295a77e2cbcf';
export const GOLDEN_G3_V6_PERMISSIONS_POLICY_DIGEST =
  'sha256-ba30c14b6270c077a97da649378c14b1545274d45dd7d21dbf34c1da77a8b47a';

type GoldenG3V6OwnerRuleId = BrowserSecurityCoreResolvedRuleId;
const GOLDEN_G3_V6_OWNER_RULE_IDS = new Set<string>(
  BROWSER_SECURITY_CORE_RESOLVED_RULE_IDS
);

const isGoldenG3V6OwnerRuleId = (
  value: unknown
): value is GoldenG3V6OwnerRuleId =>
  typeof value === 'string' && GOLDEN_G3_V6_OWNER_RULE_IDS.has(value);

type GoldenG3V6SecurityOwnerRecords = Readonly<
  Record<GoldenG3V6OwnerRuleId, BrowserSecurityOwnedObservation>
>;

type GoldenG3V6ResolutionFailureKind =
  | 'aborted'
  | 'duplicate'
  | 'unexpectedRule'
  | 'identityDrift'
  | 'ownerResolutionFailed';

export type GoldenG3V6ProductionSecurityResolutionAuditSnapshot = Readonly<{
  format: 'prodivix.golden-g3-v6-security-resolution-audit';
  version: 1;
  bindingDigest: string;
  status: 'pending' | 'exact' | 'failed';
  expectedRuleIds: readonly GoldenG3V6OwnerRuleId[];
  successfulRuleIds: readonly GoldenG3V6OwnerRuleId[];
  ruleResolutionCounts: readonly Readonly<{
    ruleId: GoldenG3V6OwnerRuleId;
    count: 0 | 1;
  }>[];
  totalResolveCount: number;
  totalAttemptCount: number;
  failureCounts: Readonly<Record<GoldenG3V6ResolutionFailureKind, number>>;
  exact: boolean;
  auditDigest: string;
  evidenceDigest: string;
}>;

export type GoldenG3V6ProductionSecurityResolutionAuditPort = Readonly<{
  snapshot(): GoldenG3V6ProductionSecurityResolutionAuditSnapshot;
  assertExact(): GoldenG3V6ProductionSecurityResolutionAuditSnapshot;
}>;

export type GoldenG3V6ProductionSecurityBundleEvidence = Readonly<{
  productionSnapshotDigest: string;
  canarySourceSnapshotDigest: string;
  canarySourceDigest: string;
  servedBundleDigest: string;
  scannedBundleDigest: string;
  materializedBundleDigest: string;
  canonicalBundleDigest: string;
  bundleFileSetDigest: string;
  compilerFixtureAbsenceReceiptDigest: string;
  compilerFixtureAbsenceBundleScanDigest: string;
  compilerFixtureAbsenceMarkerSetDigest: string;
  targetBindingDigest: string;
  originDigest: string;
  sourceDigests: Readonly<Record<GoldenG3V6OwnerRuleId, string>>;
  resolutionAuditBindingDigest: string;
  staticEvidenceDigest: string;
  exactBundleBinding: boolean;
}>;

export type GoldenG3V6ProductionSecurityAuthority = Readonly<{
  observationSet: BrowserSecurityObservationSet;
  authority: BrowserSecurityObservationAuthorityPort;
  input: Readonly<{
    ref: VerificationAdapterInputRef;
    bytes: Uint8Array;
  }>;
  coreExpectedChecks: readonly BrowserSecurityExpectedCheck[];
  productionProbeMarkers: readonly string[];
  resolutionAudit: GoldenG3V6ProductionSecurityResolutionAuditPort;
  evidence: GoldenG3V6ProductionSecurityBundleEvidence;
}>;

const issuedProductionSecurityAuthorities =
  new WeakSet<GoldenG3V6ProductionSecurityAuthority>();

export const assertIssuedGoldenG3V6ProductionSecurityAuthority = (
  authority: GoldenG3V6ProductionSecurityAuthority
): void => {
  const decodedInput = decodeBrowserSecurityObservationSet(
    authority.input.bytes
  );
  const reconstructedInput = createBrowserSecurityObservationSetInputRef(
    authority.input.ref.id,
    decodedInput
  );
  if (
    !issuedProductionSecurityAuthorities.has(authority) ||
    !sameCanonicalJson(decodedInput, authority.observationSet) ||
    !sameCanonicalJson(reconstructedInput.ref, authority.input.ref)
  ) {
    throw new GoldenG3V6ProductionSecurityError(
      'Golden production security authority was not issued by its owner.',
      BROWSER_SECURITY_CORE_RESOLVED_RULE_IDS
    );
  }
};

export type CreateGoldenG3V6ProductionSecurityAuthorityInput =
  GoldenG3V6ProductionSecurityBundleOwnerInput &
    Readonly<{
      origin: string;
      targetBinding: BrowserVerificationTargetBinding;
      targetBindingDigest: string;
      observationBinding: BrowserSecurityObservationSetBinding;
      inputId: string;
    }>;

export const assertGoldenG3V6BrowserResponsePolicyDigests = (): void => {
  const cspDigest = createBrowserCspObservationDigest(
    GOLDEN_BROWSER_RESPONSE_POLICIES.contentSecurityPolicy
  );
  const permissionsDigest = createBrowserPermissionsPolicyObservationDigest(
    GOLDEN_BROWSER_RESPONSE_POLICIES.permissionsPolicy
  );
  if (cspDigest !== GOLDEN_G3_V6_CONTENT_SECURITY_POLICY_DIGEST) {
    throw new GoldenG3V6ProductionSecurityError(
      'Golden Browser CSP drifted from its fixed independently authored expectation.',
      Object.freeze([])
    );
  }
  if (permissionsDigest !== GOLDEN_G3_V6_PERMISSIONS_POLICY_DIGEST) {
    throw new GoldenG3V6ProductionSecurityError(
      'Golden Browser Permissions Policy drifted from its fixed independently authored expectation.',
      Object.freeze([])
    );
  }
};

const normalizedBindingContext = (
  input: CreateGoldenG3V6ProductionSecurityAuthorityInput,
  productionSnapshotDigest: string
): Readonly<{
  targetBinding: BrowserVerificationTargetBinding;
  targetBindingDigest: string;
  originDigest: string;
}> => {
  const targetBinding = normalizeBrowserVerificationTargetBinding(
    input.targetBinding
  );
  const targetBindingDigest =
    createBrowserVerificationTargetBindingDigest(targetBinding);
  const originDigest = createBrowserVerificationOriginDigest(input.origin);
  if (
    targetBindingDigest !== input.targetBindingDigest ||
    targetBinding.originDigest !== originDigest ||
    targetBinding.executableSnapshotDigest !== productionSnapshotDigest ||
    targetBinding.attemptId !== input.observationBinding.attemptId ||
    targetBinding.generation !== input.observationBinding.generation ||
    targetBinding.runtimeEnvironmentDigest !==
      input.observationBinding.runtimeEnvironmentDigest ||
    input.observationBinding.executableSnapshotDigest !==
      productionSnapshotDigest
  ) {
    throw new GoldenG3V6ProductionSecurityError(
      'Golden security authority drifted from the exact Browser target binding, origin, or attempt.',
      Object.freeze([])
    );
  }
  return Object.freeze({
    targetBinding,
    targetBindingDigest,
    originDigest,
  });
};

type OwnerEvaluationContext = Readonly<{
  bundleOwner: GoldenG3V6ProductionSecurityBundleOwner;
  targetBinding: BrowserVerificationTargetBinding;
  targetBindingDigest: string;
  observationBinding: BrowserSecurityObservationSetBinding;
  originDigest: string;
}>;

type OwnerEvaluation = Readonly<{
  records: GoldenG3V6SecurityOwnerRecords;
  sourceDigests: Readonly<Record<GoldenG3V6OwnerRuleId, string>>;
  inspection: GoldenG3V6ProductionSecurityBundleInspection;
}>;

const completeObservation = (
  ruleId: GoldenG3V6OwnerRuleId,
  targetId: string,
  inspection: GoldenG3V6ProductionSecurityRuleInspection,
  sourceDigest: string
): BrowserSecurityOwnedObservation => {
  const source = BROWSER_SECURITY_CORE_OBSERVATION_SOURCES[ruleId];
  return Object.freeze({
    source: Object.freeze({ ...source, sourceDigest }),
    observation: Object.freeze({
      ruleId,
      state: 'complete' as const,
      targetId,
      expectedDigest: inspection.expectedDigest,
      observedDigest: inspection.observedDigest,
      violationCount: inspection.violationCount,
      diagnosticCodes: Object.freeze([...inspection.diagnosticCodes]),
      sourceTraceDigest: sourceDigest,
    }),
  });
};

const blockedObservation = (
  ruleId: GoldenG3V6OwnerRuleId,
  targetId: string,
  inspection: GoldenG3V6ProductionSecurityRuleInspection,
  sourceDigest: string
): BrowserSecurityOwnedObservation => {
  const source = BROWSER_SECURITY_CORE_OBSERVATION_SOURCES[ruleId];
  return Object.freeze({
    source: Object.freeze({ ...source, sourceDigest }),
    observation: Object.freeze({
      ruleId,
      state: 'blocked' as const,
      targetId,
      expectedDigest: inspection.expectedDigest,
      reasonCode:
        inspection.blockedReasonCode ?? 'runtime-core-artifact-uninspectable',
      diagnosticCodes: Object.freeze([...inspection.diagnosticCodes]),
      sourceTraceDigest: sourceDigest,
    }),
  });
};

const sourceDigest = (
  context: OwnerEvaluationContext,
  inspection: GoldenG3V6ProductionSecurityBundleInspection,
  ruleId: GoldenG3V6OwnerRuleId,
  result: unknown
): string =>
  digestVerificationValue({
    format: 'prodivix.golden-g3-v6-production-security-owner-source',
    version: 1,
    ruleId,
    owner: BROWSER_SECURITY_CORE_OBSERVATION_SOURCES[ruleId],
    productionSnapshotDigest: inspection.productionSnapshotDigest,
    canarySourceSnapshotDigest: inspection.canarySourceSnapshotDigest,
    canarySourceDigest: inspection.canarySourceDigest,
    targetBinding: context.targetBinding,
    targetBindingDigest: context.targetBindingDigest,
    originDigest: context.originDigest,
    observationBinding: context.observationBinding,
    canonicalBundleDigest: inspection.canonicalBundleDigest,
    materializedBundleDigest: inspection.materializedBundleDigest,
    bundleFileSetDigest: inspection.bundleFileSetDigest,
    compilerFixtureAbsenceReceiptDigest:
      inspection.compilerFixtureAbsenceReceiptDigest,
    compilerFixtureAbsenceBundleScanDigest:
      inspection.compilerFixtureAbsenceBundleScanDigest,
    compilerFixtureAbsenceMarkerSetDigest:
      inspection.compilerFixtureAbsenceMarkerSetDigest,
    result,
  });

const evaluateOwnerRecords = (
  context: OwnerEvaluationContext
): OwnerEvaluation => {
  const inspection = context.bundleOwner.inspect();
  const secretSourceDigest = sourceDigest(
    context,
    inspection,
    'security.secret-canary',
    inspection.rules.secret.sourceResult
  );
  const probeSourceDigest = sourceDigest(
    context,
    inspection,
    'security.production-probe-leak',
    inspection.rules.productionProbe.sourceResult
  );
  const outputSourceDigest = sourceDigest(
    context,
    inspection,
    'security.output-artifact-uninspectable',
    inspection.rules.outputArtifact.sourceResult
  );
  const targetId = context.targetBinding.targetId;
  const records: GoldenG3V6SecurityOwnerRecords = Object.freeze({
    'security.secret-canary': completeObservation(
      'security.secret-canary',
      targetId,
      inspection.rules.secret,
      secretSourceDigest
    ),
    'security.production-probe-leak': completeObservation(
      'security.production-probe-leak',
      targetId,
      inspection.rules.productionProbe,
      probeSourceDigest
    ),
    'security.output-artifact-uninspectable':
      inspection.rules.outputArtifact.blockedReasonCode === undefined
        ? completeObservation(
            'security.output-artifact-uninspectable',
            targetId,
            inspection.rules.outputArtifact,
            outputSourceDigest
          )
        : blockedObservation(
            'security.output-artifact-uninspectable',
            targetId,
            inspection.rules.outputArtifact,
            outputSourceDigest
          ),
  });
  return Object.freeze({
    records,
    sourceDigests: Object.freeze({
      'security.secret-canary': secretSourceDigest,
      'security.production-probe-leak': probeSourceDigest,
      'security.output-artifact-uninspectable': outputSourceDigest,
    }),
    inspection,
  });
};

type ResolutionAuditController = Readonly<{
  port: GoldenG3V6ProductionSecurityResolutionAuditPort;
  hasSucceeded(ruleId: GoldenG3V6OwnerRuleId): boolean;
  recordSuccess(ruleId: GoldenG3V6OwnerRuleId): void;
  recordFailure(kind: GoldenG3V6ResolutionFailureKind): void;
}>;

const incrementBounded = (value: number): number =>
  Math.min(Number.MAX_SAFE_INTEGER, value + 1);

const createResolutionAuditController = (
  bindingDigest: string,
  staticEvidenceDigest: string
): ResolutionAuditController => {
  const successful = new Set<GoldenG3V6OwnerRuleId>();
  const failureCounts: Record<GoldenG3V6ResolutionFailureKind, number> = {
    aborted: 0,
    duplicate: 0,
    unexpectedRule: 0,
    identityDrift: 0,
    ownerResolutionFailed: 0,
  };
  const snapshot = (): GoldenG3V6ProductionSecurityResolutionAuditSnapshot => {
    const expectedRuleIds = Object.freeze([
      ...BROWSER_SECURITY_CORE_RESOLVED_RULE_IDS,
    ]);
    const successfulRuleIds = Object.freeze(
      expectedRuleIds.filter((ruleId) => successful.has(ruleId))
    );
    const ruleResolutionCounts = Object.freeze(
      expectedRuleIds.map((ruleId) =>
        Object.freeze({
          ruleId,
          count: successful.has(ruleId) ? (1 as const) : (0 as const),
        })
      )
    );
    const frozenFailureCounts = Object.freeze({ ...failureCounts });
    const totalResolveCount = successfulRuleIds.length;
    const failureCount = Object.values(frozenFailureCounts).reduce(
      (total, count) => total + count,
      0
    );
    const totalAttemptCount = totalResolveCount + failureCount;
    const exact =
      totalResolveCount === expectedRuleIds.length && failureCount === 0;
    const status = failureCount > 0 ? 'failed' : exact ? 'exact' : 'pending';
    const auditValue = Object.freeze({
      format: 'prodivix.golden-g3-v6-security-resolution-audit' as const,
      version: 1 as const,
      bindingDigest,
      status,
      expectedRuleIds,
      successfulRuleIds,
      ruleResolutionCounts,
      totalResolveCount,
      totalAttemptCount,
      failureCounts: frozenFailureCounts,
      exact,
    });
    const auditDigest = digestVerificationValue(auditValue);
    return Object.freeze({
      ...auditValue,
      auditDigest,
      evidenceDigest: digestVerificationValue({
        format: 'prodivix.golden-g3-v6-production-security-evidence' as const,
        version: 1,
        staticEvidenceDigest,
        resolutionAuditDigest: auditDigest,
      }),
    });
  };
  const port: GoldenG3V6ProductionSecurityResolutionAuditPort = Object.freeze({
    snapshot,
    assertExact: () => {
      const current = snapshot();
      if (!current.exact) {
        const missing = current.ruleResolutionCounts.flatMap(
          ({ ruleId, count }) => (count === 1 ? [] : [ruleId])
        );
        throw new GoldenG3V6ProductionSecurityError(
          'Golden production security authority did not resolve each owner exactly once.',
          missing.length > 0
            ? missing
            : [...BROWSER_SECURITY_CORE_RESOLVED_RULE_IDS]
        );
      }
      return current;
    },
  });
  return Object.freeze({
    port,
    hasSucceeded: (ruleId) => successful.has(ruleId),
    recordSuccess: (ruleId) => {
      successful.add(ruleId);
    },
    recordFailure: (kind) => {
      failureCounts[kind] = incrementBounded(failureCounts[kind]);
    },
  });
};

const failedOwnerRules = (
  result: GoldenG3V6ProductionSecurityAuthority
): readonly GoldenG3V6OwnerRuleId[] =>
  Object.freeze(
    result.observationSet.observations.flatMap(({ observation }) =>
      observation.state === 'blocked' ||
      observation.violationCount > 0 ||
      observation.expectedDigest !== observation.observedDigest
        ? [observation.ruleId]
        : []
    )
  );

export const assertGoldenG3V6ProductionSecurityAuthorityClean = (
  result: GoldenG3V6ProductionSecurityAuthority
): void => {
  const failedRuleIds = failedOwnerRules(result);
  if (!result.evidence.exactBundleBinding || failedRuleIds.length > 0) {
    throw new GoldenG3V6ProductionSecurityError(
      'Golden production security authority rejected dirty, uninspectable, or identity-drifted output.',
      failedRuleIds
    );
  }
};

export const createGoldenG3V6ProductionSecurityAuthority = (
  input: CreateGoldenG3V6ProductionSecurityAuthorityInput
): GoldenG3V6ProductionSecurityAuthority => {
  assertGoldenG3V6BrowserResponsePolicyDigests();
  const bundleOwner = createGoldenG3V6ProductionSecurityBundleOwner(input);
  const binding = normalizedBindingContext(
    input,
    bundleOwner.productionSnapshotDigest
  );
  const context: OwnerEvaluationContext = Object.freeze({
    bundleOwner,
    targetBinding: binding.targetBinding,
    targetBindingDigest: binding.targetBindingDigest,
    observationBinding: Object.freeze({ ...input.observationBinding }),
    originDigest: binding.originDigest,
  });
  const evaluation = evaluateOwnerRecords(context);
  const observationSet: BrowserSecurityObservationSet = Object.freeze({
    format: 'prodivix.security-observation-set',
    version: 1,
    complete: true,
    binding: context.observationBinding,
    observations: Object.freeze(Object.values(evaluation.records)),
  });
  const createdInput = createBrowserSecurityObservationSetInputRef(
    input.inputId,
    observationSet
  );
  const normalizedObservationSet: BrowserSecurityObservationSet = Object.freeze(
    {
      ...observationSet,
      observations: Object.freeze(
        Object.values(evaluation.records).sort((left, right) =>
          compareUnicodeCodePoints(
            left.observation.ruleId,
            right.observation.ruleId
          )
        )
      ),
    }
  );
  const coreExpectedChecks = Object.freeze(
    normalizedObservationSet.observations.map(({ observation }) =>
      Object.freeze({
        ruleId: observation.ruleId,
        targetId: observation.targetId,
        expectedDigest: observation.expectedDigest,
        collector: 'core-resolved-observation' as const,
      })
    )
  );
  const inspection = evaluation.inspection;
  const evidenceBase = Object.freeze({
    productionSnapshotDigest: inspection.productionSnapshotDigest,
    canarySourceSnapshotDigest: inspection.canarySourceSnapshotDigest,
    canarySourceDigest: inspection.canarySourceDigest,
    servedBundleDigest: inspection.servedBundleDigest,
    scannedBundleDigest: inspection.scannedBundleDigest,
    materializedBundleDigest: inspection.materializedBundleDigest,
    canonicalBundleDigest: inspection.canonicalBundleDigest,
    bundleFileSetDigest: inspection.bundleFileSetDigest,
    compilerFixtureAbsenceReceiptDigest:
      inspection.compilerFixtureAbsenceReceiptDigest,
    compilerFixtureAbsenceBundleScanDigest:
      inspection.compilerFixtureAbsenceBundleScanDigest,
    compilerFixtureAbsenceMarkerSetDigest:
      inspection.compilerFixtureAbsenceMarkerSetDigest,
    targetBindingDigest: binding.targetBindingDigest,
    originDigest: binding.originDigest,
    sourceDigests: evaluation.sourceDigests,
    exactBundleBinding: inspection.exactBundleBinding,
  });
  const resolutionAuditBindingDigest = digestVerificationValue({
    format: 'prodivix.golden-g3-v6-security-resolution-audit-binding',
    version: 1,
    observationBinding: context.observationBinding,
    targetBindingDigest: binding.targetBindingDigest,
    originDigest: binding.originDigest,
    expectedRuleIds: BROWSER_SECURITY_CORE_RESOLVED_RULE_IDS,
    sourceDigests: evaluation.sourceDigests,
  });
  const staticEvidenceDigest = digestVerificationValue({
    format: 'prodivix.golden-g3-v6-production-security-static-evidence',
    version: 1,
    ...evidenceBase,
    resolutionAuditBindingDigest,
  });
  const resolutionAudit = createResolutionAuditController(
    resolutionAuditBindingDigest,
    staticEvidenceDigest
  );
  const authority: BrowserSecurityObservationAuthorityPort = Object.freeze({
    resolve: async (request, signal) => {
      if (signal.aborted) {
        resolutionAudit.recordFailure('aborted');
        return undefined;
      }
      if (!isGoldenG3V6OwnerRuleId(request.ruleId)) {
        resolutionAudit.recordFailure('unexpectedRule');
        return undefined;
      }
      if (resolutionAudit.hasSucceeded(request.ruleId)) {
        resolutionAudit.recordFailure('duplicate');
        return undefined;
      }
      const expected = evaluation.records[request.ruleId];
      try {
        if (
          !sameCanonicalJson(request.binding, context.observationBinding) ||
          !sameCanonicalJson(request.source, expected.source)
        ) {
          resolutionAudit.recordFailure('identityDrift');
          return undefined;
        }
      } catch {
        resolutionAudit.recordFailure('identityDrift');
        return undefined;
      }
      try {
        const fresh = evaluateOwnerRecords(context).records[request.ruleId];
        if (!sameCanonicalJson(fresh.source, request.source)) {
          resolutionAudit.recordFailure('identityDrift');
          return undefined;
        }
        resolutionAudit.recordSuccess(request.ruleId);
        return fresh;
      } catch {
        resolutionAudit.recordFailure('ownerResolutionFailed');
        return undefined;
      }
    },
  });
  const result: GoldenG3V6ProductionSecurityAuthority = Object.freeze({
    observationSet: normalizedObservationSet,
    authority,
    input: Object.freeze({
      ref: createdInput.ref,
      bytes: new Uint8Array(createdInput.bytes),
    }),
    coreExpectedChecks,
    productionProbeMarkers: bundleOwner.productionProbeMarkers,
    resolutionAudit: resolutionAudit.port,
    evidence: Object.freeze({
      ...evidenceBase,
      resolutionAuditBindingDigest,
      staticEvidenceDigest,
    }),
  });
  issuedProductionSecurityAuthorities.add(result);
  return result;
};
