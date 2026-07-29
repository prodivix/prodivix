import { createHash } from 'node:crypto';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';

const SHA256_PATTERN = /^sha256-[a-f0-9]{64}$/u;

export const goldenAuthorityCanonicalDigest = (value: unknown): string =>
  `sha256-${createHash('sha256')
    .update(canonicalJsonText(value))
    .digest('hex')}`;

export const goldenAuthorityExactRecord = (
  value: unknown,
  keys: readonly string[],
  label: string
): Record<string, unknown> => {
  if (!isPlainObject(value)) {
    throw new Error(`${label} is not a plain object.`);
  }
  const actualKeys = Object.keys(value);
  if (
    keys.some((key) => !actualKeys.includes(key)) ||
    actualKeys.some((key) => isUnsafeObjectKey(key) || !keys.includes(key))
  ) {
    throw new Error(`${label} has unknown, missing, or unsafe fields.`);
  }
  return value;
};

export const goldenAuthorityExactDigest = (
  value: unknown,
  label: string
): string => {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} is not canonical SHA-256.`);
  }
  return value;
};

export const goldenAuthorityExactInteger = (
  value: unknown,
  label: string
): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} is not a non-negative integer.`);
  }
  return value as number;
};

export const goldenAuthorityWithoutDigest = (
  value: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== 'authorityDigest')
    )
  );

export const assertGoldenAuthorityDigest = (
  value: Readonly<Record<string, unknown>>,
  label: string
): void => {
  if (
    goldenAuthorityExactDigest(value.authorityDigest, `${label} digest`) !==
    goldenAuthorityCanonicalDigest(goldenAuthorityWithoutDigest(value))
  ) {
    throw new Error(`${label} digest drifted.`);
  }
};
