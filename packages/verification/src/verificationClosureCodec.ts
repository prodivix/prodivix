import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  digestVerificationValue,
  parseVerificationInstant,
} from './verificationCanonical';
import {
  cloneCanonicalVerificationEvidenceWire,
  compileVerificationEvidenceWireSchema,
  verificationEvidenceWireSchemaFailure,
} from './verificationEvidenceWireCodec.shared';
import {
  VERIFICATION_CLOSURE_WIRE_VERSION,
  verificationClosureWireSchema,
} from './verificationClosureSchema';
import type {
  VerificationClosure,
  VerificationClosureIssue,
} from './verification.types';

export type VerificationClosureWire = VerificationClosure &
  Readonly<{ wireVersion: typeof VERIFICATION_CLOSURE_WIRE_VERSION }>;

export type VerificationClosureWireIssue = Readonly<{
  code: 'VER-5001';
  path: string;
  message: string;
}>;

export type VerificationClosureDecodeResult =
  | Readonly<{ ok: true; value: VerificationClosure }>
  | Readonly<{ ok: false; issues: readonly VerificationClosureWireIssue[] }>;

const validateWire = compileVerificationEvidenceWireSchema(
  verificationClosureWireSchema
);

const invalid = (
  path: string,
  message: string
): VerificationClosureDecodeResult =>
  Object.freeze({
    ok: false,
    issues: Object.freeze([
      Object.freeze({ code: 'VER-5001' as const, path, message }),
    ]),
  });

const sortedText = (values: readonly string[]): readonly string[] =>
  Object.freeze(
    [...values].sort((left, right) => compareUnicodeCodePoints(left, right))
  );

const compareIssue = (
  left: VerificationClosureIssue,
  right: VerificationClosureIssue
): number =>
  compareUnicodeCodePoints(left.cellId ?? '', right.cellId ?? '') ||
  compareUnicodeCodePoints(left.status, right.status) ||
  compareUnicodeCodePoints(left.message, right.message);

const normalize = (closure: VerificationClosure): VerificationClosure => {
  const cellStatuses = Object.freeze(
    Object.fromEntries(
      Object.entries(closure.cellStatuses).sort(([left], [right]) =>
        compareUnicodeCodePoints(left, right)
      )
    )
  );
  return Object.freeze({
    ...closure,
    targetPartitionRevisions: Object.freeze({
      ...closure.targetPartitionRevisions,
      documentRevisions: Object.freeze(
        Object.fromEntries(
          Object.entries(
            closure.targetPartitionRevisions.documentRevisions
          ).sort(([left], [right]) => compareUnicodeCodePoints(left, right))
        )
      ),
    }),
    baselineSetDigests: sortedText(closure.baselineSetDigests),
    cellStatuses,
    evidenceDigests: sortedText(closure.evidenceDigests),
    appliedExemptionIds: sortedText(closure.appliedExemptionIds),
    issues: Object.freeze(
      [...closure.issues]
        .map((issue) =>
          Object.freeze({
            ...issue,
            evidenceIds: sortedText(issue.evidenceIds),
          })
        )
        .sort(compareIssue)
    ),
  });
};

const semanticValidation = (
  closure: VerificationClosure
): VerificationClosureDecodeResult => {
  if (
    parseVerificationInstant(closure.policyEvaluationInstant) === undefined ||
    parseVerificationInstant(closure.closureEvaluationInstant) === undefined
  ) {
    return invalid('/', 'Verification Closure instant is invalid.');
  }
  const normalized = normalize(closure);
  const { closureDigest, ...withoutDigest } = normalized;
  if (
    digestVerificationValue(withoutDigest) !== closureDigest ||
    !sameCanonicalJson(normalized, closure)
  ) {
    return invalid(
      '/closureDigest',
      'Verification Closure is not canonical or its digest does not match.'
    );
  }
  return Object.freeze({ ok: true, value: normalized });
};

export const decodeVerificationClosure = (
  value: unknown
): VerificationClosureDecodeResult => {
  const cloned = cloneCanonicalVerificationEvidenceWire(value);
  if (!cloned.ok) return cloned;
  if (!validateWire(cloned.value)) {
    return verificationEvidenceWireSchemaFailure(
      validateWire.errors
    ) as VerificationClosureDecodeResult;
  }
  const { wireVersion: _wireVersion, ...current } = cloned.value;
  return semanticValidation(current as unknown as VerificationClosure);
};

export const validateVerificationClosure = (
  value: unknown
): VerificationClosureDecodeResult => {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.hasOwn(value, 'wireVersion') ||
    Object.hasOwn(value, 'version')
  ) {
    return invalid(
      '/',
      'Verification Closure current model exposes a wire version or is invalid.'
    );
  }
  try {
    const current = JSON.parse(canonicalJsonText(value)) as Readonly<
      Record<string, unknown>
    >;
    return decodeVerificationClosure({
      ...current,
      wireVersion: VERIFICATION_CLOSURE_WIRE_VERSION,
    });
  } catch {
    return invalid('/', 'Verification Closure cannot be encoded.');
  }
};

export const encodeVerificationClosure = (
  closure: VerificationClosure
): VerificationClosureWire => {
  const validated = validateVerificationClosure(closure);
  if (!validated.ok) {
    throw new TypeError(
      validated.issues.map(({ message }) => message).join('; ')
    );
  }
  return Object.freeze({
    ...validated.value,
    wireVersion: VERIFICATION_CLOSURE_WIRE_VERSION,
  });
};
