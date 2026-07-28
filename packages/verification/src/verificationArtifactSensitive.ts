import { utf8ToBytes } from '@noble/hashes/utils.js';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type { VerificationArtifactPolicyDiagnosticReason } from './verificationArtifactPolicy.types';

export type VerificationArtifactSensitiveReason = Extract<
  VerificationArtifactPolicyDiagnosticReason,
  | 'authorization'
  | 'cookie'
  | 'credential'
  | 'environment-secret'
  | 'pii'
  | 'secret-canary'
>;

const REDACTED_VALUE_PATTERN =
  /^(?:\[redacted\]|<redacted>|redacted|\*{3,})$/iu;
const DIRECT_CREDENTIAL_PATTERNS = [
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/u,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/u,
];
const EMAIL_PATTERN =
  /\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+\b/iu;
const GOVERNMENT_ID_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/u;
const MINIMUM_ENTROPY_TOKEN_LENGTH = 24;
const MAXIMUM_ENTROPY_TOKEN_SAMPLE = 512;
const MINIMUM_ENTROPY_UNIQUE_CHARACTERS = 16;
const MINIMUM_ENTROPY_BITS_PER_CHARACTER = 4.25;

const isEntropyTokenCharacter = (character: string): boolean => {
  const codePoint = character.codePointAt(0) ?? -1;
  return (
    (codePoint >= 48 && codePoint <= 57) ||
    (codePoint >= 65 && codePoint <= 90) ||
    (codePoint >= 97 && codePoint <= 122) ||
    character === '+' ||
    character === '/' ||
    character === '_' ||
    character === '=' ||
    character === '-'
  );
};

const isHighEntropyCredentialToken = (token: string): boolean => {
  if (
    REDACTED_VALUE_PATTERN.test(token) ||
    /^sha(?:1|256|384|512)-[a-f0-9]+$/iu.test(token) ||
    /^[a-f0-9]{32,128}$/iu.test(token)
  ) {
    return false;
  }
  let hasUppercase = false;
  let hasLowercase = false;
  let hasDigit = false;
  let hasSymbol = false;
  const frequencies = new Map<string, number>();
  for (const character of token) {
    const codePoint = character.codePointAt(0) ?? -1;
    hasUppercase ||= codePoint >= 65 && codePoint <= 90;
    hasLowercase ||= codePoint >= 97 && codePoint <= 122;
    hasDigit ||= codePoint >= 48 && codePoint <= 57;
    hasSymbol ||= !(
      (codePoint >= 48 && codePoint <= 57) ||
      (codePoint >= 65 && codePoint <= 90) ||
      (codePoint >= 97 && codePoint <= 122)
    );
    frequencies.set(character, (frequencies.get(character) ?? 0) + 1);
  }
  const characterClasses = [
    hasUppercase,
    hasLowercase,
    hasDigit,
    hasSymbol,
  ].filter(Boolean).length;
  if (
    characterClasses < 3 ||
    frequencies.size < MINIMUM_ENTROPY_UNIQUE_CHARACTERS
  ) {
    return false;
  }
  let entropy = 0;
  for (const count of frequencies.values()) {
    const probability = count / token.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy >= MINIMUM_ENTROPY_BITS_PER_CHARACTER;
};

const containsHighEntropyCredential = (text: string): boolean => {
  let offset = 0;
  while (offset < text.length) {
    if (!isEntropyTokenCharacter(text[offset] as string)) {
      offset += 1;
      continue;
    }
    const start = offset;
    while (
      offset < text.length &&
      isEntropyTokenCharacter(text[offset] as string)
    ) {
      offset += 1;
    }
    if (offset - start < MINIMUM_ENTROPY_TOKEN_LENGTH) continue;
    const token = text.slice(
      start,
      Math.min(offset, start + MAXIMUM_ENTROPY_TOKEN_SAMPLE)
    );
    if (isHighEntropyCredentialToken(token)) return true;
  }
  return false;
};

const capturedSensitiveValue = (text: string, pattern: RegExp): boolean => {
  pattern.lastIndex = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const value = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (value && !REDACTED_VALUE_PATTERN.test(value)) return true;
    if (match[0].length === 0) pattern.lastIndex += 1;
  }
  return false;
};

export const scanVerificationArtifactSensitiveText = (
  text: string,
  secretCanaries: readonly string[]
): readonly VerificationArtifactSensitiveReason[] => {
  const reasons = new Set<VerificationArtifactSensitiveReason>();
  if (secretCanaries.some((canary) => text.includes(canary))) {
    reasons.add('secret-canary');
  }
  if (
    capturedSensitiveValue(
      text,
      /\bauthorization\s*[:=]\s*(?:"([^"\r\n]{1,1024})"|'([^'\r\n]{1,1024})'|([^\s,;\r\n]{1,1024}))/giu
    )
  ) {
    reasons.add('authorization');
  }
  if (
    capturedSensitiveValue(
      text,
      /\b(?:cookie|set-cookie)\s*[:=]\s*(?:"([^"\r\n]{1,1024})"|'([^'\r\n]{1,1024})'|([^\r\n]{1,1024}))/giu
    )
  ) {
    reasons.add('cookie');
  }
  if (
    capturedSensitiveValue(
      text,
      /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|private[_-]?key|secret)\b\s*[:=]\s*(?:"([^"\r\n]{1,1024})"|'([^'\r\n]{1,1024})'|([^\s,;\r\n]{1,1024}))/giu
    )
  ) {
    reasons.add('environment-secret');
  }
  if (
    DIRECT_CREDENTIAL_PATTERNS.some((pattern) => pattern.test(text)) ||
    containsHighEntropyCredential(text)
  ) {
    reasons.add('credential');
  }
  if (EMAIL_PATTERN.test(text) || GOVERNMENT_ID_PATTERN.test(text)) {
    reasons.add('pii');
  }
  return Object.freeze([...reasons].sort(compareUnicodeCodePoints));
};

export const normalizeVerificationArtifactSecretCanaries = (
  values: readonly string[] | undefined
): readonly string[] => {
  if (values === undefined) return Object.freeze([]);
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== 'string' || value.length < 4)
  ) {
    throw new TypeError('Verification artifact Secret canaries are invalid.');
  }
  const normalized = [...new Set(values)].sort(compareUnicodeCodePoints);
  if (
    normalized.length > 64 ||
    normalized.reduce(
      (total, value) => total + utf8ToBytes(value).byteLength,
      0
    ) >
      64 * 1024
  ) {
    throw new TypeError('Verification artifact Secret canaries exceed limits.');
  }
  return Object.freeze(normalized);
};
