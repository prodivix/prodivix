import { utf8ToBytes } from '@noble/hashes/utils.js';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import Ajv2020, {
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';
import { isVerificationEvidenceUnicodeScalarText } from './verificationEvidenceCodec.primitives';

export type VerificationEvidenceWireIssue = Readonly<{
  code: 'VER-5001';
  path: string;
  message: string;
}>;

export type VerificationEvidenceWireDecodeResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly VerificationEvidenceWireIssue[] }>;

const MAXIMUM_WIRE_BYTES = 4 * 1_024 * 1_024;
const MAXIMUM_DEPTH = 48;
const MAXIMUM_NODES = 65_536;
const MAXIMUM_STRING_BYTES = 64 * 1_024;

const invalid = (
  path: string,
  message: string
): VerificationEvidenceWireDecodeResult<never> =>
  Object.freeze({
    ok: false,
    issues: Object.freeze([
      Object.freeze({ code: 'VER-5001' as const, path, message }),
    ]),
  });

const inspectCanonicalValue = (
  value: unknown,
  depth: number,
  state: { nodes: number; seen: WeakSet<object> }
): boolean => {
  state.nodes += 1;
  if (depth > MAXIMUM_DEPTH || state.nodes > MAXIMUM_NODES) return false;
  if (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' &&
      Number.isFinite(value) &&
      (!Number.isInteger(value) || Number.isSafeInteger(value)))
  ) {
    return true;
  }
  if (typeof value === 'string') {
    return (
      isVerificationEvidenceUnicodeScalarText(value) &&
      value === value.normalize('NFC') &&
      utf8ToBytes(value).byteLength <= MAXIMUM_STRING_BYTES
    );
  }
  if (typeof value !== 'object' || state.seen.has(value)) return false;
  state.seen.add(value);
  if (Array.isArray(value)) {
    const allowedKeys = new Set([
      'length',
      ...Array.from({ length: value.length }, (_, index) => String(index)),
    ]);
    if (
      Reflect.ownKeys(value).some(
        (key) =>
          typeof key !== 'string' ||
          !allowedKeys.has(key) ||
          (key !== 'length' &&
            (!Object.getOwnPropertyDescriptor(value, key)?.enumerable ||
              !(
                'value' in (Object.getOwnPropertyDescriptor(value, key) ?? {})
              )))
      )
    ) {
      return false;
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        !descriptor ||
        !('value' in descriptor) ||
        !inspectCanonicalValue(descriptor.value, depth + 1, state)
      ) {
        return false;
      }
    }
    return true;
  }
  if (!isPlainObject(value)) return false;
  for (const key of Reflect.ownKeys(value)) {
    if (
      typeof key !== 'string' ||
      isUnsafeObjectKey(key) ||
      !isVerificationEvidenceUnicodeScalarText(key) ||
      key !== key.normalize('NFC') ||
      utf8ToBytes(key).byteLength > 512
    ) {
      return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !('value' in descriptor) ||
      !inspectCanonicalValue(descriptor.value, depth + 1, state)
    ) {
      return false;
    }
  }
  return true;
};

export const cloneCanonicalVerificationEvidenceWire = (
  value: unknown
): VerificationEvidenceWireDecodeResult<Readonly<Record<string, unknown>>> => {
  if (
    !inspectCanonicalValue(value, 0, {
      nodes: 0,
      seen: new WeakSet<object>(),
    })
  ) {
    return invalid(
      '/',
      'Evidence wire value is not bounded canonical plain JSON.'
    );
  }
  try {
    const text = canonicalJsonText(value);
    if (utf8ToBytes(text).byteLength > MAXIMUM_WIRE_BYTES) {
      return invalid('/', 'Evidence wire value exceeds its byte budget.');
    }
    const cloned = JSON.parse(text) as unknown;
    return isPlainObject(cloned)
      ? Object.freeze({ ok: true, value: cloned })
      : invalid('/', 'Evidence wire document must be an object.');
  } catch {
    return invalid('/', 'Evidence wire value cannot be serialized.');
  }
};

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: false,
});

export const compileVerificationEvidenceWireSchema = (
  schema: object
): ValidateFunction => ajv.compile(schema);

const issuePath = (error: ErrorObject): string =>
  error.instancePath ||
  (error.params && 'missingProperty' in error.params
    ? `/${String(error.params.missingProperty)}`
    : '/');

export const verificationEvidenceWireSchemaFailure = (
  errors: readonly ErrorObject[] | null | undefined
): VerificationEvidenceWireDecodeResult<never> =>
  Object.freeze({
    ok: false,
    issues: Object.freeze(
      (errors?.length ? errors : [undefined]).slice(0, 128).map((error) =>
        Object.freeze({
          code: 'VER-5001' as const,
          path: error ? issuePath(error) : '/',
          message: error?.message
            ? `Evidence wire schema ${error.message}.`
            : 'Evidence wire schema validation failed.',
        })
      )
    ),
  });
