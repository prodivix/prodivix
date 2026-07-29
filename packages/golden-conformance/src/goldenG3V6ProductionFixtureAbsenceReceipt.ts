import {
  BROWSER_SECURITY_CORE_RESOLVED_RULE_IDS,
  type BrowserSecurityCoreResolvedRuleId,
} from '@prodivix/verification-browser';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { digestVerificationValue } from '@prodivix/verification';
import {
  GoldenG3V6ProductionSecurityError,
  assertIssuedGoldenG3V6ProductionSecurityAuthority,
  type GoldenG3V6ProductionSecurityAuthority,
  type GoldenG3V6ProductionSecurityResolutionAuditSnapshot,
} from './goldenG3V6ProductionSecurityAuthority';

export const GOLDEN_G3_V6_PRODUCTION_FIXTURE_ABSENCE_RECEIPT_FORMAT =
  'prodivix.golden-g3-v6-production-fixture-absence-receipt.v1' as const;

export type GoldenG3V6ProductionFixtureAbsenceReceipt = Readonly<{
  format: typeof GOLDEN_G3_V6_PRODUCTION_FIXTURE_ABSENCE_RECEIPT_FORMAT;
  cellId: string;
  attemptId: string;
  generation: number;
  executableSnapshotDigest: string;
  runtimeEnvironmentDigest: string;
  controlProfileDigest: string;
  targetBindingDigest: string;
  originDigest: string;
  compilerProductionFixtureAbsenceReceiptDigest: string;
  servedBundleDigest: string;
  scannedBundleDigest: string;
  materializedBundleDigest: string;
  canonicalBundleDigest: string;
  bundleFileSetDigest: string;
  compilerBundleScanDigest: string;
  compilerMarkerSetDigest: string;
  ownerObservations: readonly Readonly<{
    ruleId: BrowserSecurityCoreResolvedRuleId;
    expectedDigest: string;
    observedDigest: string;
    violationCount: 0;
    sourceDigest: string;
  }>[];
  observationSetDigest: string;
  securityEvidenceDigest: string;
  staticEvidenceDigest: string;
  resolutionAuditBindingDigest: string;
  resolutionAuditDigest: string;
  resolutionAuditEvidenceDigest: string;
  receiptDigest: string;
}>;

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;

const receiptBase = (
  authority: GoldenG3V6ProductionSecurityAuthority,
  audit: GoldenG3V6ProductionSecurityResolutionAuditSnapshot
): Omit<GoldenG3V6ProductionFixtureAbsenceReceipt, 'receiptDigest'> => {
  assertIssuedGoldenG3V6ProductionSecurityAuthority(authority);
  const binding = authority.observationSet.binding;
  const evidence = authority.evidence;
  const {
    auditDigest,
    evidenceDigest: auditEvidenceDigest,
    ...auditIdentity
  } = audit;
  const currentAudit = authority.resolutionAudit.snapshot();
  const resolutionAuditBindingDigest = digestVerificationValue({
    format: 'prodivix.golden-g3-v6-security-resolution-audit-binding',
    version: 1,
    observationBinding: binding,
    targetBindingDigest: evidence.targetBindingDigest,
    originDigest: evidence.originDigest,
    expectedRuleIds: BROWSER_SECURITY_CORE_RESOLVED_RULE_IDS,
    sourceDigests: evidence.sourceDigests,
  });
  const { staticEvidenceDigest, ...staticEvidenceIdentity } = evidence;
  const recomputedStaticEvidenceDigest = digestVerificationValue({
    format: 'prodivix.golden-g3-v6-production-security-static-evidence',
    version: 1,
    ...staticEvidenceIdentity,
  });
  const ownerObservations = Object.freeze(
    authority.observationSet.observations
      .map(({ source, observation }) => {
        if (
          observation.state !== 'complete' ||
          observation.violationCount !== 0 ||
          observation.expectedDigest !== observation.observedDigest ||
          source.sourceDigest !== evidence.sourceDigests[observation.ruleId] ||
          observation.sourceTraceDigest !== source.sourceDigest
        ) {
          throw new GoldenG3V6ProductionSecurityError(
            'Golden production fixture-absence receipt requires complete zero-violation owner observations.',
            Object.freeze([observation.ruleId])
          );
        }
        return Object.freeze({
          ruleId: observation.ruleId,
          expectedDigest: observation.expectedDigest,
          observedDigest: observation.observedDigest,
          violationCount: 0 as const,
          sourceDigest: source.sourceDigest,
        });
      })
      .sort((left, right) =>
        compareUnicodeCodePoints(left.ruleId, right.ruleId)
      )
  );
  const expectedRuleIds = [...BROWSER_SECURITY_CORE_RESOLVED_RULE_IDS].sort(
    compareUnicodeCodePoints
  );
  if (
    !evidence.exactBundleBinding ||
    evidence.servedBundleDigest !== evidence.scannedBundleDigest ||
    evidence.scannedBundleDigest !== evidence.materializedBundleDigest ||
    evidence.materializedBundleDigest !== evidence.canonicalBundleDigest ||
    binding.executableSnapshotDigest !== evidence.productionSnapshotDigest ||
    authority.observationSet.complete !== true ||
    ownerObservations.length !== expectedRuleIds.length ||
    !sameCanonicalJson(
      ownerObservations.map(({ ruleId }) => ruleId),
      expectedRuleIds
    ) ||
    audit.status !== 'exact' ||
    audit.exact !== true ||
    audit.totalResolveCount !== expectedRuleIds.length ||
    audit.totalAttemptCount !== expectedRuleIds.length ||
    audit.bindingDigest !== evidence.resolutionAuditBindingDigest ||
    resolutionAuditBindingDigest !== evidence.resolutionAuditBindingDigest ||
    recomputedStaticEvidenceDigest !== staticEvidenceDigest ||
    !sameCanonicalJson(audit, currentAudit) ||
    digestVerificationValue(auditIdentity) !== auditDigest ||
    digestVerificationValue({
      format: 'prodivix.golden-g3-v6-production-security-evidence',
      version: 1,
      staticEvidenceDigest: evidence.staticEvidenceDigest,
      resolutionAuditDigest: auditDigest,
    }) !== auditEvidenceDigest ||
    !sameCanonicalJson(audit.successfulRuleIds, audit.expectedRuleIds) ||
    Object.values(audit.failureCounts).some((count) => count !== 0)
  ) {
    throw new GoldenG3V6ProductionSecurityError(
      'Golden production fixture-absence receipt requires exact bundle identity and exact-once owner resolution.',
      BROWSER_SECURITY_CORE_RESOLVED_RULE_IDS
    );
  }
  const digests = [
    binding.executableSnapshotDigest,
    binding.runtimeEnvironmentDigest,
    binding.controlProfileDigest,
    evidence.targetBindingDigest,
    evidence.originDigest,
    evidence.compilerFixtureAbsenceReceiptDigest,
    evidence.servedBundleDigest,
    evidence.scannedBundleDigest,
    evidence.materializedBundleDigest,
    evidence.canonicalBundleDigest,
    evidence.bundleFileSetDigest,
    evidence.compilerFixtureAbsenceBundleScanDigest,
    evidence.compilerFixtureAbsenceMarkerSetDigest,
    evidence.staticEvidenceDigest,
    evidence.resolutionAuditBindingDigest,
    audit.auditDigest,
    audit.evidenceDigest,
    ...ownerObservations.flatMap(
      ({ expectedDigest, observedDigest, sourceDigest }) => [
        expectedDigest,
        observedDigest,
        sourceDigest,
      ]
    ),
  ];
  if (digests.some((digest) => !DIGEST_PATTERN.test(digest))) {
    throw new GoldenG3V6ProductionSecurityError(
      'Golden production fixture-absence receipt contains a non-canonical digest.',
      BROWSER_SECURITY_CORE_RESOLVED_RULE_IDS
    );
  }
  return Object.freeze({
    format: GOLDEN_G3_V6_PRODUCTION_FIXTURE_ABSENCE_RECEIPT_FORMAT,
    cellId: binding.cellId,
    attemptId: binding.attemptId,
    generation: binding.generation,
    executableSnapshotDigest: binding.executableSnapshotDigest,
    runtimeEnvironmentDigest: binding.runtimeEnvironmentDigest,
    controlProfileDigest: binding.controlProfileDigest,
    targetBindingDigest: evidence.targetBindingDigest,
    originDigest: evidence.originDigest,
    compilerProductionFixtureAbsenceReceiptDigest:
      evidence.compilerFixtureAbsenceReceiptDigest,
    servedBundleDigest: evidence.servedBundleDigest,
    scannedBundleDigest: evidence.scannedBundleDigest,
    materializedBundleDigest: evidence.materializedBundleDigest,
    canonicalBundleDigest: evidence.canonicalBundleDigest,
    bundleFileSetDigest: evidence.bundleFileSetDigest,
    compilerBundleScanDigest: evidence.compilerFixtureAbsenceBundleScanDigest,
    compilerMarkerSetDigest: evidence.compilerFixtureAbsenceMarkerSetDigest,
    ownerObservations,
    observationSetDigest: digestVerificationValue(authority.observationSet),
    securityEvidenceDigest: digestVerificationValue(evidence),
    staticEvidenceDigest: evidence.staticEvidenceDigest,
    resolutionAuditBindingDigest: evidence.resolutionAuditBindingDigest,
    resolutionAuditDigest: audit.auditDigest,
    resolutionAuditEvidenceDigest: audit.evidenceDigest,
  });
};

export const issueGoldenG3V6ProductionFixtureAbsenceReceipt = (
  authority: GoldenG3V6ProductionSecurityAuthority,
  audit: GoldenG3V6ProductionSecurityResolutionAuditSnapshot
): GoldenG3V6ProductionFixtureAbsenceReceipt => {
  const base = receiptBase(authority, audit);
  return Object.freeze({
    ...base,
    receiptDigest: digestVerificationValue(base),
  });
};

export const assertGoldenG3V6ProductionFixtureAbsenceReceipt = (
  receipt: GoldenG3V6ProductionFixtureAbsenceReceipt,
  authority: GoldenG3V6ProductionSecurityAuthority,
  audit: GoldenG3V6ProductionSecurityResolutionAuditSnapshot
): void => {
  const expected = issueGoldenG3V6ProductionFixtureAbsenceReceipt(
    authority,
    audit
  );
  if (!sameCanonicalJson(receipt, expected)) {
    throw new GoldenG3V6ProductionSecurityError(
      'Golden production fixture-absence receipt drifted from its exact attempt authority.',
      BROWSER_SECURITY_CORE_RESOLVED_RULE_IDS
    );
  }
};
