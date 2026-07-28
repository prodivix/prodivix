import type { VerificationEvidence } from './verification.types';
import {
  compareVerificationText,
  digestVerificationValue,
  serializeVerificationValue,
  uniqueVerificationText,
} from './verificationCanonical';
import {
  readResolvedVerificationComparisonPolicy,
  resolveVerificationComparisonPolicy,
  type VerificationComparisonPolicy,
} from './verificationComparisonPolicy';
import {
  VERIFICATION_COMPARISON_FORBIDDEN_MISMATCH_FIELDS,
  VERIFICATION_COMPARISON_MISMATCH_FIELDS,
  type VerificationComparisonAllowedMismatchField,
  type VerificationComparisonMismatchField,
} from './verificationComparisonPolicyFields';

export {
  resolveVerificationComparisonPolicy,
  type VerificationComparisonAllowedMismatchField,
  type VerificationComparisonMismatchField,
  type VerificationComparisonPolicy,
};

export type VerificationComparisonCompatibility =
  'exact-compatible' | 'policy-compatible' | 'view-only' | 'incompatible';

export type VerificationEvidenceComparison = Readonly<{
  compatibility: VerificationComparisonCompatibility;
  leftEvidenceId: string;
  rightEvidenceId: string;
  mismatchFields: readonly VerificationComparisonMismatchField[];
  policyId?: string;
  policyDigest?: string;
  comparisonDigest: string;
}>;

type ComparableIdentity = Readonly<
  Record<VerificationComparisonMismatchField, unknown>
>;

const packageMajor = (version: string): string => {
  const match = /^(?:v)?(\d+)(?:\.|$)/u.exec(version.trim());
  return match?.[1] ?? '';
};

const comparableIdentity = (
  evidence: VerificationEvidence
): ComparableIdentity =>
  Object.freeze({
    'project-id': evidence.projectId,
    'workspace-id': evidence.workspaceId,
    'workspace-revision': evidence.workspaceRevision,
    'partition-revisions': evidence.partitionRevisions,
    'executable-snapshot': evidence.executableSnapshotDigest,
    'scenario-id': evidence.scenario?.id ?? null,
    'scenario-revision': evidence.scenario?.revision ?? null,
    'scenario-digest': evidence.scenario?.digest ?? null,
    'scenario-program': evidence.scenario?.programDigest ?? null,
    'policy-revision': evidence.policyRevision,
    'policy-digest': evidence.policyDigest,
    'impact-digest': evidence.impactDigest,
    'plan-digest': evidence.planDigest,
    'cell-id': evidence.cellId,
    'check-id': evidence.checkId,
    'check-kind': evidence.checkKind,
    'target-id': evidence.targetId,
    surface: evidence.run.surface,
    'framework-target': evidence.run.frameworkTarget,
    'runtime-zone': evidence.run.runtimeZone,
    'browser-engine': evidence.run.browserEngine ?? null,
    'operating-system': evidence.run.operatingSystemIdentity ?? null,
    viewport: evidence.run.viewport,
    'device-pixel-ratio': evidence.run.devicePixelRatio,
    'color-scheme': evidence.run.colorScheme,
    motion: evidence.run.motion,
    locale: evidence.run.locale,
    timezone: evidence.run.timezone,
    'font-set': evidence.run.fontSetDigest,
    'sandbox-image': evidence.run.sandboxImageDigest ?? null,
    'tool-package': evidence.toolchain.packageName,
    'tool-version': evidence.toolchain.packageVersion,
    'tool-major': packageMajor(evidence.toolchain.packageVersion),
    'tool-build': evidence.toolchain.buildDigest,
    toolchain: evidence.toolchain.toolchainDigest,
    'adapter-schema': evidence.toolchain.schemaDigest,
    'normalization-package': evidence.normalization.packageName,
    'normalization-version': evidence.normalization.packageVersion,
    'normalization-build': evidence.normalization.buildDigest,
    'normalization-toolchain': evidence.normalization.toolchainDigest,
    'normalization-schema': evidence.normalization.schemaDigest,
    'control-profile': evidence.controls.profileDigest,
    'applied-controls': evidence.controls.appliedDigest,
    'fixture-set': uniqueVerificationText(evidence.inputs.fixtureSetDigests),
    'baseline-set': evidence.inputs.baselineSetDigest ?? null,
    'input-digest': evidence.inputs.inputDigest,
    'dependency-lock': evidence.dependencyLockDigest,
    'redaction-policy': evidence.redactionPolicyId,
    'target-policy': evidence.targetPolicy,
  });

const fields = Object.freeze(
  [...VERIFICATION_COMPARISON_MISMATCH_FIELDS].sort(compareVerificationText)
);

const incompatibleFields = new Set<VerificationComparisonMismatchField>([
  ...VERIFICATION_COMPARISON_FORBIDDEN_MISMATCH_FIELDS,
]);

const mismatchFields = (
  left: ComparableIdentity,
  right: ComparableIdentity
): readonly VerificationComparisonMismatchField[] =>
  Object.freeze(
    fields.filter(
      (field) =>
        serializeVerificationValue(left[field]) !==
        serializeVerificationValue(right[field])
    )
  );

const normalizePolicy = (
  policy: VerificationComparisonPolicy | undefined
): VerificationComparisonPolicy | undefined => {
  if (!policy) return undefined;
  const resolved = readResolvedVerificationComparisonPolicy(policy);
  if (!resolved) {
    throw new TypeError(
      'Verification comparison policy must be an exact resolver-owned projection.'
    );
  }
  return resolved;
};

/**
 * Performs compatibility preflight only. Result or artifact bytes are not
 * compared until this function has established an exact or policy-approved
 * identity relationship.
 */
export const compareVerificationEvidenceCompatibility = (
  left: VerificationEvidence,
  right: VerificationEvidence,
  policy?: VerificationComparisonPolicy
): VerificationEvidenceComparison => {
  const normalizedPolicy = normalizePolicy(policy);
  const mismatches = mismatchFields(
    comparableIdentity(left),
    comparableIdentity(right)
  );
  const allowedMismatchFields = normalizedPolicy
    ? new Set<VerificationComparisonMismatchField>(
        normalizedPolicy.allowedMismatchFields
      )
    : undefined;
  let compatibility: VerificationComparisonCompatibility;
  if (mismatches.length === 0) {
    compatibility = 'exact-compatible';
  } else if (mismatches.some((field) => incompatibleFields.has(field))) {
    compatibility = 'incompatible';
  } else if (
    allowedMismatchFields &&
    mismatches.every((field) => allowedMismatchFields.has(field))
  ) {
    compatibility = 'policy-compatible';
  } else {
    compatibility = 'view-only';
  }

  const evidencePair = [left.manifestDigest, right.manifestDigest].sort(
    compareVerificationText
  );
  const comparisonWithoutDigest = Object.freeze({
    compatibility,
    evidenceDigests: Object.freeze(evidencePair),
    mismatchFields: mismatches,
    ...(normalizedPolicy
      ? {
          policyId: normalizedPolicy.policyId,
          policyDigest: normalizedPolicy.policyDigest,
          allowedMismatchFields: normalizedPolicy.allowedMismatchFields,
        }
      : {}),
  });
  return Object.freeze({
    compatibility,
    leftEvidenceId: left.id,
    rightEvidenceId: right.id,
    mismatchFields: mismatches,
    ...(normalizedPolicy
      ? {
          policyId: normalizedPolicy.policyId,
          policyDigest: normalizedPolicy.policyDigest,
        }
      : {}),
    comparisonDigest: digestVerificationValue(comparisonWithoutDigest),
  });
};
