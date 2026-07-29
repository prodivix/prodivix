import { createHash } from 'node:crypto';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';

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
): Uint8Array => {
  if (
    typeof value !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value
    )
  ) {
    throw new TypeError(`${label} must be canonical base64.`);
  }
  return new Uint8Array(Buffer.from(value, 'base64'));
};
