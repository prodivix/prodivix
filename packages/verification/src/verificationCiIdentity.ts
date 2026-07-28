import { utf8ToBytes } from '@noble/hashes/utils.js';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import { isVerificationEvidenceUnicodeScalarText } from './verificationEvidenceCodec.primitives';

const REPOSITORY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}(?::[A-Za-z0-9][A-Za-z0-9._+-]{0,127})?(?:\/[A-Za-z0-9][A-Za-z0-9._+-]{0,127})+$/u;
const COMMIT_PATTERN = /^(?:sha1-[0-9a-f]{40}|sha256-[0-9a-f]{64})$/u;
const MAXIMUM_REPOSITORY_BYTES = 512;
const MAXIMUM_REF_BYTES = 512;

/**
 * Provider-neutral CI source identity. `repository` is a stable repository id,
 * not a credential-bearing URL. `ref` is a fully qualified Git ref. `commit`
 * is an algorithm-qualified lowercase Git object id.
 */
export type VerificationCiIdentity = Readonly<{
  repository: string;
  ref: string;
  commit: string;
}>;

const canonicalText = (
  value: unknown,
  maximumBytes: number
): string | undefined => {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value !== value.trim() ||
    !isVerificationEvidenceUnicodeScalarText(value) ||
    value !== value.normalize('NFC') ||
    utf8ToBytes(value).byteLength > maximumBytes
  )
    return undefined;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint < 32 || codePoint === 127) return undefined;
  }
  return value;
};

const canonicalRef = (value: unknown): string | undefined => {
  const ref = canonicalText(value, MAXIMUM_REF_BYTES);
  if (
    !ref?.startsWith('refs/') ||
    ref.length <= 'refs/'.length ||
    ref.endsWith('/') ||
    ref.endsWith('.') ||
    ref.includes('..') ||
    ref.includes('//') ||
    ref.includes('@{') ||
    ref.includes('\\') ||
    ref.includes(' ') ||
    ref.includes('~') ||
    ref.includes('^') ||
    ref.includes(':') ||
    ref.includes('?') ||
    ref.includes('*') ||
    ref.includes('[')
  )
    return undefined;
  return ref;
};

/**
 * Strictly clones a CI identity without invoking caller-provided accessors.
 */
export const normalizeVerificationCiIdentity = (
  value: unknown
): VerificationCiIdentity | undefined => {
  try {
    if (!isPlainObject(value)) return undefined;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 3) return undefined;
    const expectedKeys = new Set(['repository', 'ref', 'commit']);
    const fields = new Map<string, unknown>();
    for (const key of keys) {
      if (
        typeof key !== 'string' ||
        isUnsafeObjectKey(key) ||
        !expectedKeys.has(key)
      )
        return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !('value' in descriptor)) return undefined;
      fields.set(key, descriptor.value);
    }
    if ([...expectedKeys].some((key) => !fields.has(key))) return undefined;
    const repository = canonicalText(
      fields.get('repository'),
      MAXIMUM_REPOSITORY_BYTES
    );
    const ref = canonicalRef(fields.get('ref'));
    const commit =
      typeof fields.get('commit') === 'string' &&
      COMMIT_PATTERN.test(fields.get('commit') as string)
        ? (fields.get('commit') as string)
        : undefined;
    if (!repository || !REPOSITORY_PATTERN.test(repository) || !ref || !commit)
      return undefined;
    return Object.freeze({ repository, ref, commit });
  } catch {
    return undefined;
  }
};
