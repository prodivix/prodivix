import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  normalizeVerificationPolicy,
  validateVerificationDocument,
} from './verificationCodec';
import {
  canonicalVerificationComparisonMismatchFields,
  isAllowedVerificationComparisonMismatchField,
  MAXIMUM_VERIFICATION_COMPARISON_ALLOWED_MISMATCH_FIELDS,
  type VerificationComparisonAllowedMismatchField,
} from './verificationComparisonPolicyFields';
import { digestVerificationValue } from './verificationCanonical';
import type { VerificationPolicy } from './verification.types';

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const projectionKeys = new Set([
  'authority',
  'policyId',
  'policyDigest',
  'allowedMismatchFields',
]);
const resolvedPolicies = new WeakSet<object>();
declare const verificationComparisonPolicyBrand: unique symbol;

export type VerificationComparisonPolicy = Readonly<{
  authority: 'verification-policy';
  policyId: string;
  policyDigest: string;
  allowedMismatchFields: readonly VerificationComparisonAllowedMismatchField[];
  readonly [verificationComparisonPolicyBrand]: true;
}>;

const comparisonFieldsFromPolicy = (
  policy: VerificationPolicy
): readonly VerificationComparisonAllowedMismatchField[] => {
  const comparison = policy.comparison;
  if (
    !isPlainObject(comparison) ||
    Reflect.ownKeys(comparison).length !== 1 ||
    !Object.hasOwn(comparison, 'allowedMismatchFields') ||
    !Array.isArray(comparison.allowedMismatchFields) ||
    comparison.allowedMismatchFields.length >
      MAXIMUM_VERIFICATION_COMPARISON_ALLOWED_MISMATCH_FIELDS ||
    comparison.allowedMismatchFields.some(
      (field) => !isAllowedVerificationComparisonMismatchField(field)
    )
  ) {
    throw new TypeError(
      'Verification Policy comparison allowlist is invalid or unsafe.'
    );
  }
  return canonicalVerificationComparisonMismatchFields(
    comparison.allowedMismatchFields
  );
};

/**
 * Resolves the only policy projection accepted by Evidence comparison. The
 * supplied digest must cover the complete normalized Verification Policy.
 */
export const resolveVerificationComparisonPolicy = (
  policy: VerificationPolicy,
  suppliedPolicyDigest: string
): VerificationComparisonPolicy => {
  const validation = validateVerificationDocument(
    'verification-policy',
    policy
  );
  if (!validation.ok) {
    throw new TypeError(
      'Verification comparison requires a valid full Policy.'
    );
  }
  const normalizedPolicy = normalizeVerificationPolicy(validation.value);
  if (
    typeof suppliedPolicyDigest !== 'string' ||
    !DIGEST_PATTERN.test(suppliedPolicyDigest) ||
    digestVerificationValue(normalizedPolicy) !== suppliedPolicyDigest
  ) {
    throw new TypeError(
      'Verification comparison Policy digest does not match the normalized full Policy.'
    );
  }
  const projection = Object.freeze({
    authority: 'verification-policy' as const,
    policyId: normalizedPolicy.id,
    policyDigest: suppliedPolicyDigest,
    allowedMismatchFields: comparisonFieldsFromPolicy(normalizedPolicy),
  }) as VerificationComparisonPolicy;
  resolvedPolicies.add(projection);
  return projection;
};

const hasExactProjectionData = (
  value: unknown
): value is Readonly<Record<string, unknown>> => {
  if (
    !isPlainObject(value) ||
    !Object.isFrozen(value) ||
    Reflect.ownKeys(value).length !== projectionKeys.size
  ) {
    return false;
  }
  for (const key of Reflect.ownKeys(value)) {
    if (
      typeof key !== 'string' ||
      isUnsafeObjectKey(key) ||
      !projectionKeys.has(key)
    ) {
      return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !('value' in descriptor)) return false;
  }
  return true;
};

/**
 * Runtime brand check used by comparison. Structurally similar caller-created
 * objects, including the retired `{id,digest}` shape, are rejected.
 */
export const readResolvedVerificationComparisonPolicy = (
  value: unknown
): VerificationComparisonPolicy | undefined => {
  try {
    const rawAllowedMismatchFields =
      hasExactProjectionData(value) && value.allowedMismatchFields;
    if (
      !hasExactProjectionData(value) ||
      !resolvedPolicies.has(value) ||
      value.authority !== 'verification-policy' ||
      typeof value.policyId !== 'string' ||
      !value.policyId ||
      typeof value.policyDigest !== 'string' ||
      !DIGEST_PATTERN.test(value.policyDigest) ||
      !Array.isArray(rawAllowedMismatchFields) ||
      !Object.isFrozen(rawAllowedMismatchFields) ||
      rawAllowedMismatchFields.length >
        MAXIMUM_VERIFICATION_COMPARISON_ALLOWED_MISMATCH_FIELDS ||
      !rawAllowedMismatchFields.every(
        isAllowedVerificationComparisonMismatchField
      )
    ) {
      return undefined;
    }
    const canonicalFields = canonicalVerificationComparisonMismatchFields(
      rawAllowedMismatchFields
    );
    if (
      canonicalFields.length !== rawAllowedMismatchFields.length ||
      canonicalFields.some(
        (field, index) => field !== rawAllowedMismatchFields[index]
      )
    ) {
      return undefined;
    }
    return value as unknown as VerificationComparisonPolicy;
  } catch {
    return undefined;
  }
};

export type {
  VerificationComparisonAllowedMismatchField,
  VerificationComparisonMismatchField,
} from './verificationComparisonPolicyFields';
