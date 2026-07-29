import { createHash } from 'node:crypto';
import { decodeCanonicalBase64 } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';

const MAXIMUM_CANONICAL_BASE64_BYTES = 384 * 1024 * 1024;

export const controlledStaticSandboxDigestBytes = (
  contents: Uint8Array | string
): string => `sha256-${createHash('sha256').update(contents).digest('hex')}`;

export const controlledStaticSandboxExactRecord = (
  value: unknown,
  required: readonly string[],
  label: string
): Record<string, unknown> => {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const keys = Object.keys(value);
  if (
    required.some((key) => !keys.includes(key)) ||
    keys.some((key) => isUnsafeObjectKey(key) || !required.includes(key))
  ) {
    throw new TypeError(`${label} fields drifted.`);
  }
  return value;
};

export const decodeControlledStaticSandboxCanonicalBase64 = (
  value: unknown,
  label: string
): Uint8Array =>
  decodeCanonicalBase64(value, {
    label,
    maximumBytes: MAXIMUM_CANONICAL_BASE64_BYTES,
  });
