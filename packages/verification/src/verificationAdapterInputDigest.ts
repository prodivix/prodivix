import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import { digestVerificationValue } from './verificationCanonical';
import type {
  VerificationAdapterInputRef,
  VerificationAdapterLifecycleContext,
} from './verificationAdapterRuntime.types';

const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const MEDIA_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u;
const INPUT_KINDS = new Set([
  'diagnostic-snapshot',
  'executable-snapshot',
  'scenario-program',
  'test-report',
  'baseline-set',
  'verification-profile',
  'security-observation-set',
]);

export type VerificationAdapterInputSetCoordinates = Pick<
  VerificationAdapterLifecycleContext,
  | 'executableSnapshotDigest'
  | 'runtimeEnvironmentDigest'
  | 'scenarioProgramDigest'
  | 'controlProfileDigest'
  | 'fixtureSetDigests'
  | 'baselineSetDigest'
  | 'controlCapabilityIds'
  | 'controlCapabilitySnapshotDigest'
  | 'appliedControlDigest'
  | 'inputRefs'
>;

const exactRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> => {
  if (!isPlainObject(value)) {
    throw new TypeError('Verification adapter input value must be plain.');
  }
  const keys = Object.keys(value);
  if (
    required.some((key) => !keys.includes(key)) ||
    keys.some(
      (key) =>
        isUnsafeObjectKey(key) ||
        (!required.includes(key) && !optional.includes(key))
    )
  ) {
    throw new TypeError(
      'Verification adapter input value has unknown, missing, or unsafe fields.'
    );
  }
  return value;
};

const token = (value: unknown, label: string): string => {
  if (
    typeof value !== 'string' ||
    value !== value.normalize('NFC') ||
    !TOKEN_PATTERN.test(value)
  ) {
    throw new TypeError(`${label} must be a canonical identifier.`);
  }
  return value;
};

const digest = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a SHA-256 digest.`);
  }
  return value;
};

const sortedUnique = (
  values: unknown,
  label: string,
  reader: (value: unknown, label: string) => string
): readonly string[] => {
  if (!Array.isArray(values) || values.length > 256) {
    throw new TypeError(`${label} must be a bounded array.`);
  }
  const normalized = values.map((value, index) =>
    reader(value, `${label}[${index}]`)
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError(`${label} must not contain duplicates.`);
  }
  return Object.freeze([...normalized].sort(compareUnicodeCodePoints));
};

const normalizeInputRef = (
  value: unknown,
  index: number
): VerificationAdapterInputRef => {
  const ref = exactRecord(
    value,
    ['id', 'kind', 'digest', 'size'],
    ['mediaType']
  );
  const kind = token(ref.kind, `inputRefs[${index}].kind`);
  if (!INPUT_KINDS.has(kind)) {
    throw new TypeError(`inputRefs[${index}].kind is unsupported.`);
  }
  if (
    !Number.isSafeInteger(ref.size) ||
    Object.is(ref.size, -0) ||
    (ref.size as number) < 0 ||
    (ref.size as number) > 1024 * 1024 * 1024
  ) {
    throw new TypeError(`inputRefs[${index}].size is invalid.`);
  }
  if (
    ref.mediaType !== undefined &&
    (typeof ref.mediaType !== 'string' ||
      !MEDIA_TYPE_PATTERN.test(ref.mediaType))
  ) {
    throw new TypeError(`inputRefs[${index}].mediaType is invalid.`);
  }
  return Object.freeze({
    id: token(ref.id, `inputRefs[${index}].id`),
    kind: kind as VerificationAdapterInputRef['kind'],
    digest: digest(ref.digest, `inputRefs[${index}].digest`),
    size: ref.size as number,
    ...(ref.mediaType === undefined ? {} : { mediaType: ref.mediaType }),
  });
};

export const createVerificationAdapterInputDigest = (
  input: VerificationAdapterInputSetCoordinates
): string => {
  const record = exactRecord(
    input,
    [
      'executableSnapshotDigest',
      'runtimeEnvironmentDigest',
      'controlProfileDigest',
      'fixtureSetDigests',
      'controlCapabilityIds',
      'controlCapabilitySnapshotDigest',
      'appliedControlDigest',
      'inputRefs',
    ],
    ['scenarioProgramDigest', 'baselineSetDigest']
  );
  if (!Array.isArray(record.inputRefs) || record.inputRefs.length > 256) {
    throw new TypeError('inputRefs must be a bounded array.');
  }
  const inputRefs = record.inputRefs
    .map(normalizeInputRef)
    .sort(
      (left, right) =>
        compareUnicodeCodePoints(left.id, right.id) ||
        compareUnicodeCodePoints(left.kind, right.kind)
    );
  if (new Set(inputRefs.map(({ id }) => id)).size !== inputRefs.length) {
    throw new TypeError('inputRefs must have unique logical ids.');
  }
  const totalBytes = inputRefs.reduce((total, ref) => total + ref.size, 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes > 1024 * 1024 * 1024) {
    throw new TypeError('inputRefs exceed their aggregate byte budget.');
  }
  return digestVerificationValue(
    Object.freeze({
      format: 'prodivix.verification-resolved-input-set',
      version: 1,
      executableSnapshotDigest: digest(
        record.executableSnapshotDigest,
        'executableSnapshotDigest'
      ),
      runtimeEnvironmentDigest: digest(
        record.runtimeEnvironmentDigest,
        'runtimeEnvironmentDigest'
      ),
      ...(record.scenarioProgramDigest === undefined
        ? {}
        : {
            scenarioProgramDigest: digest(
              record.scenarioProgramDigest,
              'scenarioProgramDigest'
            ),
          }),
      controlProfileDigest: digest(
        record.controlProfileDigest,
        'controlProfileDigest'
      ),
      fixtureSetDigests: sortedUnique(
        record.fixtureSetDigests,
        'fixtureSetDigests',
        digest
      ),
      ...(record.baselineSetDigest === undefined
        ? {}
        : {
            baselineSetDigest: digest(
              record.baselineSetDigest,
              'baselineSetDigest'
            ),
          }),
      controlCapabilityIds: sortedUnique(
        record.controlCapabilityIds,
        'controlCapabilityIds',
        token
      ),
      controlCapabilitySnapshotDigest: digest(
        record.controlCapabilitySnapshotDigest,
        'controlCapabilitySnapshotDigest'
      ),
      appliedControlDigest: digest(
        record.appliedControlDigest,
        'appliedControlDigest'
      ),
      inputRefs: Object.freeze(inputRefs),
    })
  );
};
