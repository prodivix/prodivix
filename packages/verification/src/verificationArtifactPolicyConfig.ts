import type { VerificationArtifactPolicy } from './verificationArtifactPolicy.types';

export const VERIFICATION_ARTIFACT_POLICY_DEFAULTS: VerificationArtifactPolicy =
  Object.freeze({
    maximumArtifacts: 128,
    maximumSingleArtifactBytes: 16 * 1024 * 1024,
    maximumTotalArtifactBytes: 64 * 1024 * 1024,
    maximumPathBytes: 512,
    maximumPathSegments: 16,
    maximumJsonBytes: 8 * 1024 * 1024,
    maximumTextBytes: 8 * 1024 * 1024,
    maximumJsonDepth: 64,
    maximumJsonNodes: 100_000,
    maximumJsonStringBytes: 1024 * 1024,
    maximumImageWidth: 8_192,
    maximumImageHeight: 8_192,
    maximumImagePixels: 40_000_000,
    maximumImageStructuralEntries: 4_096,
    maximumDiagnostics: 128,
  });

const positiveSafeInteger = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer.`);
  }
  return value;
};

export const createVerificationArtifactPolicy = (
  overrides: Partial<VerificationArtifactPolicy> = {}
): VerificationArtifactPolicy => {
  const policy = Object.freeze({
    maximumArtifacts: positiveSafeInteger(
      overrides.maximumArtifacts ??
        VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumArtifacts,
      'Verification artifact count limit'
    ),
    maximumSingleArtifactBytes: positiveSafeInteger(
      overrides.maximumSingleArtifactBytes ??
        VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumSingleArtifactBytes,
      'Verification single artifact byte limit'
    ),
    maximumTotalArtifactBytes: positiveSafeInteger(
      overrides.maximumTotalArtifactBytes ??
        VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumTotalArtifactBytes,
      'Verification total artifact byte limit'
    ),
    maximumPathBytes: positiveSafeInteger(
      overrides.maximumPathBytes ??
        VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumPathBytes,
      'Verification artifact path byte limit'
    ),
    maximumPathSegments: positiveSafeInteger(
      overrides.maximumPathSegments ??
        VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumPathSegments,
      'Verification artifact path segment limit'
    ),
    maximumJsonBytes: positiveSafeInteger(
      overrides.maximumJsonBytes ??
        VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumJsonBytes,
      'Verification artifact JSON byte limit'
    ),
    maximumTextBytes: positiveSafeInteger(
      overrides.maximumTextBytes ??
        VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumTextBytes,
      'Verification artifact text byte limit'
    ),
    maximumJsonDepth: positiveSafeInteger(
      overrides.maximumJsonDepth ??
        VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumJsonDepth,
      'Verification artifact JSON depth limit'
    ),
    maximumJsonNodes: positiveSafeInteger(
      overrides.maximumJsonNodes ??
        VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumJsonNodes,
      'Verification artifact JSON node limit'
    ),
    maximumJsonStringBytes: positiveSafeInteger(
      overrides.maximumJsonStringBytes ??
        VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumJsonStringBytes,
      'Verification artifact JSON string byte limit'
    ),
    maximumImageWidth: positiveSafeInteger(
      overrides.maximumImageWidth ??
        VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumImageWidth,
      'Verification artifact image width limit'
    ),
    maximumImageHeight: positiveSafeInteger(
      overrides.maximumImageHeight ??
        VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumImageHeight,
      'Verification artifact image height limit'
    ),
    maximumImagePixels: positiveSafeInteger(
      overrides.maximumImagePixels ??
        VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumImagePixels,
      'Verification artifact image pixel limit'
    ),
    maximumImageStructuralEntries: positiveSafeInteger(
      overrides.maximumImageStructuralEntries ??
        VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumImageStructuralEntries,
      'Verification artifact image structure limit'
    ),
    maximumDiagnostics: positiveSafeInteger(
      overrides.maximumDiagnostics ??
        VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumDiagnostics,
      'Verification artifact diagnostic limit'
    ),
  });
  if (
    policy.maximumSingleArtifactBytes > policy.maximumTotalArtifactBytes ||
    policy.maximumJsonBytes > policy.maximumSingleArtifactBytes ||
    policy.maximumTextBytes > policy.maximumSingleArtifactBytes
  ) {
    throw new TypeError('Verification artifact policy limits conflict.');
  }
  return policy;
};
