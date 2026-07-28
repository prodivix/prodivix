import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { VerificationArtifactKind } from './verification.types';
import {
  normalizeVerificationArtifactMediaType,
  SUPPORTED_VERIFICATION_ARTIFACT_KINDS,
} from './verificationArtifactMedia';
import { readExactVerificationArtifactDataValues } from './verificationArtifactObjectBoundary';
import { readCanonicalVerificationArtifactPath } from './verificationArtifactPath';
import type {
  VerificationArtifactPolicy,
  VerificationArtifactPolicyCandidate,
} from './verificationArtifactPolicy.types';

const SHA256_DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const ARTIFACT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const exactCandidateKeys = new Set([
  'id',
  'path',
  'kind',
  'digest',
  'size',
  'mediaType',
  'contents',
]);
const exactCandidateWithSourceTraceKeys = new Set([
  ...exactCandidateKeys,
  'sourceTraceDigest',
]);

export type VerificationArtifactPolicyCandidateRead =
  | Readonly<{
      status: 'accepted';
      candidate: VerificationArtifactPolicyCandidate;
    }>
  | Readonly<{
      status: 'rejected';
      reason: 'invalid-candidate' | 'invalid-path';
    }>;

const copyBytes = (value: unknown): Uint8Array | undefined => {
  try {
    return value instanceof Uint8Array && ArrayBuffer.isView(value)
      ? new Uint8Array(value)
      : undefined;
  } catch {
    return undefined;
  }
};

export const computeVerificationArtifactContentDigest = (
  contents: Uint8Array
): string => {
  const snapshot = copyBytes(contents);
  if (!snapshot) {
    throw new TypeError('Verification artifact contents must be bytes.');
  }
  return `sha256-${bytesToHex(sha256(snapshot))}`;
};

export const readVerificationArtifactPolicyCandidate = (
  value: unknown,
  policy: VerificationArtifactPolicy
): VerificationArtifactPolicyCandidateRead => {
  const data =
    readExactVerificationArtifactDataValues(value, exactCandidateKeys) ??
    readExactVerificationArtifactDataValues(
      value,
      exactCandidateWithSourceTraceKeys
    );
  if (!data) {
    return Object.freeze({
      status: 'rejected',
      reason: 'invalid-candidate',
    });
  }
  const contents = copyBytes(data.contents);
  if (!contents) {
    return Object.freeze({
      status: 'rejected',
      reason: 'invalid-candidate',
    });
  }
  let path: string;
  try {
    path = readCanonicalVerificationArtifactPath(data.path, policy);
  } catch {
    return Object.freeze({ status: 'rejected', reason: 'invalid-path' });
  }
  if (
    typeof data.id !== 'string' ||
    !ARTIFACT_ID_PATTERN.test(data.id) ||
    data.id.length > 128 ||
    !SUPPORTED_VERIFICATION_ARTIFACT_KINDS.has(
      data.kind as VerificationArtifactKind
    ) ||
    typeof data.digest !== 'string' ||
    !SHA256_DIGEST_PATTERN.test(data.digest) ||
    (data.sourceTraceDigest !== undefined &&
      (typeof data.sourceTraceDigest !== 'string' ||
        !SHA256_DIGEST_PATTERN.test(data.sourceTraceDigest))) ||
    typeof data.size !== 'number' ||
    !Number.isSafeInteger(data.size) ||
    data.size < 0
  ) {
    return Object.freeze({
      status: 'rejected',
      reason: 'invalid-candidate',
    });
  }
  const mediaType = normalizeVerificationArtifactMediaType(data.mediaType);
  if (!mediaType) {
    return Object.freeze({
      status: 'rejected',
      reason: 'invalid-candidate',
    });
  }
  return Object.freeze({
    status: 'accepted',
    candidate: Object.freeze({
      id: data.id,
      path,
      kind: data.kind as VerificationArtifactKind,
      digest: data.digest,
      size: data.size,
      mediaType,
      ...(typeof data.sourceTraceDigest === 'string'
        ? { sourceTraceDigest: data.sourceTraceDigest }
        : {}),
      contents,
    }),
  });
};
