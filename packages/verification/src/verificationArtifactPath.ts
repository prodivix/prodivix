import { utf8ToBytes } from '@noble/hashes/utils.js';
import { VERIFICATION_ARTIFACT_POLICY_DEFAULTS } from './verificationArtifactPolicyConfig';
import type { VerificationArtifactPolicy } from './verificationArtifactPolicy.types';

const WINDOWS_RESERVED_SEGMENT_PATTERN =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

const isAsciiControlCharacter = (value: string): boolean => {
  const codePoint = value.codePointAt(0);
  return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
};

export const readCanonicalVerificationArtifactPath = (
  value: unknown,
  policy: Pick<
    VerificationArtifactPolicy,
    'maximumPathBytes' | 'maximumPathSegments'
  > = VERIFICATION_ARTIFACT_POLICY_DEFAULTS
): string => {
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.normalize('NFC') ||
    utf8ToBytes(value).byteLength > policy.maximumPathBytes ||
    value.startsWith('/') ||
    value.endsWith('/') ||
    value.includes('\\') ||
    value.includes('//') ||
    value.includes(':') ||
    [...value].some(isAsciiControlCharacter)
  ) {
    throw new TypeError('Verification artifact path is not canonical.');
  }
  const segments = value.split('/');
  if (
    segments.length > policy.maximumPathSegments ||
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.endsWith('.') ||
        segment.endsWith(' ') ||
        utf8ToBytes(segment).byteLength > 128 ||
        WINDOWS_RESERVED_SEGMENT_PATTERN.test(segment)
    )
  ) {
    throw new TypeError('Verification artifact path is not canonical.');
  }
  return value;
};
