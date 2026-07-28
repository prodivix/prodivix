import { utf8ToBytes } from '@noble/hashes/utils.js';
import { readExactVerificationArtifactDataValues } from './verificationArtifactObjectBoundary';
import type { VerificationArtifactTargetPolicy } from './verificationArtifactPolicy.types';

const SHA256_DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const targetPolicyKeys = new Set([
  'authority',
  'policyDigest',
  'semanticTargetId',
  'capture',
]);

const isAsciiControlCharacter = (value: string): boolean => {
  const codePoint = value.codePointAt(0);
  return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
};

export const readVerificationArtifactTargetPolicy = (
  value: unknown
): VerificationArtifactTargetPolicy => {
  const data = readExactVerificationArtifactDataValues(value, targetPolicyKeys);
  if (
    !data ||
    data.authority !== 'verification-policy' ||
    typeof data.policyDigest !== 'string' ||
    !SHA256_DIGEST_PATTERN.test(data.policyDigest) ||
    typeof data.semanticTargetId !== 'string' ||
    !data.semanticTargetId ||
    data.semanticTargetId !== data.semanticTargetId.normalize('NFC') ||
    utf8ToBytes(data.semanticTargetId).byteLength > 512 ||
    [...data.semanticTargetId].some(isAsciiControlCharacter) ||
    (data.capture !== 'allowed' &&
      data.capture !== 'masked' &&
      data.capture !== 'forbidden-sensitive')
  ) {
    throw new TypeError(
      'Verification artifact target validation policy is invalid.'
    );
  }
  return Object.freeze({
    authority: data.authority,
    policyDigest: data.policyDigest,
    semanticTargetId: data.semanticTargetId,
    capture: data.capture,
  });
};
