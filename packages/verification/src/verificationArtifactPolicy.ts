import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import {
  computeVerificationArtifactContentDigest,
  readVerificationArtifactPolicyCandidate,
} from './verificationArtifactDescriptor';
import {
  isVerificationArtifactJsonMediaType,
  sniffVerificationArtifactMediaType,
} from './verificationArtifactMedia';
import { readCanonicalVerificationArtifactPath } from './verificationArtifactPath';
import { validateVerificationArtifactMediaAndStructure } from './verificationArtifactPayload';
import {
  createVerificationArtifactPolicy,
  VERIFICATION_ARTIFACT_POLICY_DEFAULTS,
} from './verificationArtifactPolicyConfig';
import type {
  VerificationArtifactPolicyAcceptedArtifact,
  VerificationArtifactPolicyDecision,
  VerificationArtifactPolicyDiagnostic,
  VerificationArtifactPolicyDiagnosticReason,
  VerificationArtifactPromotionInput,
} from './verificationArtifactPolicy.types';
import {
  normalizeVerificationArtifactSecretCanaries,
  scanVerificationArtifactSensitiveText,
} from './verificationArtifactSensitive';
import type { VerificationArtifactSensitiveReason } from './verificationArtifactSensitive';
import { readVerificationArtifactTargetPolicy } from './verificationArtifactTarget';

export {
  computeVerificationArtifactContentDigest,
  createVerificationArtifactPolicy,
  isVerificationArtifactJsonMediaType,
  readCanonicalVerificationArtifactPath,
  readVerificationArtifactTargetPolicy,
  sniffVerificationArtifactMediaType,
  VERIFICATION_ARTIFACT_POLICY_DEFAULTS,
};
export type {
  VerificationArtifactDetectedMediaType,
  VerificationArtifactPolicy,
  VerificationArtifactPolicyAcceptedArtifact,
  VerificationArtifactPolicyCandidate,
  VerificationArtifactPolicyDecision,
  VerificationArtifactPolicyDiagnostic,
  VerificationArtifactPolicyDiagnosticReason,
  VerificationArtifactPromotionInput,
  VerificationArtifactTargetPolicy,
} from './verificationArtifactPolicy.types';

const diagnosticCode = (
  reason: VerificationArtifactPolicyDiagnosticReason
): VerificationArtifactPolicyDiagnostic['code'] => {
  if (
    reason === 'secret-canary' ||
    reason === 'authorization' ||
    reason === 'cookie' ||
    reason === 'environment-secret' ||
    reason === 'credential' ||
    reason === 'pii'
  ) {
    return 'VER-5002';
  }
  if (reason === 'digest-mismatch' || reason === 'size-mismatch') {
    return 'VER-5001';
  }
  return 'VER-5005';
};

export const evaluateVerificationArtifactPromotion = (
  input: VerificationArtifactPromotionInput
): VerificationArtifactPolicyDecision => {
  if (!Array.isArray(input.artifacts)) {
    throw new TypeError('Verification artifact candidates must be an array.');
  }
  const policy = createVerificationArtifactPolicy(input.policy);
  const secretCanaries = normalizeVerificationArtifactSecretCanaries(
    input.secretCanaries
  );
  const targetPolicy =
    input.targetPolicy === undefined
      ? undefined
      : readVerificationArtifactTargetPolicy(input.targetPolicy);
  const diagnostics: VerificationArtifactPolicyDiagnostic[] = [];
  const accepted: VerificationArtifactPolicyAcceptedArtifact[] = [];
  const ids = new Set<string>();
  const paths = new Set<string>();
  let totalBytes = 0;

  const reject = (
    artifactIndex: number,
    reason: VerificationArtifactPolicyDiagnosticReason
  ): void => {
    if (diagnostics.length >= policy.maximumDiagnostics) return;
    diagnostics.push(
      Object.freeze({
        code: diagnosticCode(reason),
        reason,
        artifactIndex,
      })
    );
  };

  if (input.artifacts.length > policy.maximumArtifacts) {
    reject(policy.maximumArtifacts, 'budget-exceeded');
  }
  const candidates = input.artifacts.slice(0, policy.maximumArtifacts);
  candidates.forEach((value, artifactIndex) => {
    const candidateRead = readVerificationArtifactPolicyCandidate(
      value,
      policy
    );
    if (candidateRead.status === 'rejected') {
      reject(artifactIndex, candidateRead.reason);
      return;
    }
    const { candidate } = candidateRead;
    if (ids.has(candidate.id)) {
      reject(artifactIndex, 'duplicate-id');
      return;
    }
    ids.add(candidate.id);
    if (paths.has(candidate.path)) {
      reject(artifactIndex, 'duplicate-path');
      return;
    }
    paths.add(candidate.path);

    if (
      candidate.contents.byteLength !== candidate.size ||
      candidate.size > policy.maximumSingleArtifactBytes
    ) {
      reject(
        artifactIndex,
        candidate.contents.byteLength !== candidate.size
          ? 'size-mismatch'
          : 'budget-exceeded'
      );
      return;
    }
    totalBytes += candidate.size;
    if (totalBytes > policy.maximumTotalArtifactBytes) {
      reject(artifactIndex, 'budget-exceeded');
      return;
    }
    if (
      computeVerificationArtifactContentDigest(candidate.contents) !==
      candidate.digest
    ) {
      reject(artifactIndex, 'digest-mismatch');
      return;
    }

    const detectedMediaType = sniffVerificationArtifactMediaType(
      candidate.contents
    );
    const structure = validateVerificationArtifactMediaAndStructure(
      candidate,
      detectedMediaType,
      policy,
      targetPolicy
    );
    if (!structure.accepted) {
      reject(artifactIndex, structure.reason);
      return;
    }

    const descriptorText = canonicalJsonText({
      id: candidate.id,
      path: candidate.path,
      kind: candidate.kind,
      digest: candidate.digest,
      size: candidate.size,
      mediaType: candidate.mediaType,
    });
    const sensitiveReasons = new Set<VerificationArtifactSensitiveReason>([
      ...scanVerificationArtifactSensitiveText(descriptorText, secretCanaries),
      ...scanVerificationArtifactSensitiveText(
        structure.inspectionText,
        secretCanaries
      ),
    ]);
    if (sensitiveReasons.size) {
      for (const reason of [...sensitiveReasons].sort(
        compareUnicodeCodePoints
      )) {
        reject(artifactIndex, reason);
      }
      return;
    }

    accepted.push(
      Object.freeze({
        descriptor: Object.freeze({
          id: candidate.id,
          path: candidate.path,
          kind: candidate.kind,
          digest: candidate.digest,
          size: candidate.size,
          mediaType: candidate.mediaType,
        }),
        contents: new Uint8Array(candidate.contents),
        detectedMediaType,
        ...(structure.imageMetadata
          ? { imageMetadata: structure.imageMetadata }
          : {}),
      })
    );
  });

  return diagnostics.length
    ? Object.freeze({
        status: 'rejected',
        diagnostics: Object.freeze(diagnostics),
      })
    : Object.freeze({
        status: 'accepted',
        artifacts: Object.freeze(accepted),
        totalBytes,
      });
};
