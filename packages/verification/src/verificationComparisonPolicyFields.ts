import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';

export const VERIFICATION_COMPARISON_MISMATCH_FIELDS = Object.freeze([
  'project-id',
  'workspace-id',
  'workspace-revision',
  'partition-revisions',
  'executable-snapshot',
  'scenario-id',
  'scenario-revision',
  'scenario-digest',
  'scenario-program',
  'policy-revision',
  'policy-digest',
  'impact-digest',
  'plan-digest',
  'cell-id',
  'check-id',
  'check-kind',
  'target-id',
  'surface',
  'framework-target',
  'runtime-zone',
  'browser-engine',
  'operating-system',
  'viewport',
  'device-pixel-ratio',
  'color-scheme',
  'motion',
  'locale',
  'timezone',
  'font-set',
  'sandbox-image',
  'tool-package',
  'tool-version',
  'tool-major',
  'tool-build',
  'toolchain',
  'adapter-schema',
  'normalization-package',
  'normalization-version',
  'normalization-build',
  'normalization-toolchain',
  'normalization-schema',
  'control-profile',
  'applied-controls',
  'fixture-set',
  'baseline-set',
  'input-digest',
  'dependency-lock',
  'redaction-policy',
  'target-policy',
] as const);

export type VerificationComparisonMismatchField =
  (typeof VERIFICATION_COMPARISON_MISMATCH_FIELDS)[number];

export const VERIFICATION_COMPARISON_FORBIDDEN_MISMATCH_FIELDS = Object.freeze([
  'project-id',
  'workspace-id',
  'scenario-id',
  'scenario-revision',
  'scenario-digest',
  'scenario-program',
  'check-id',
  'check-kind',
  'target-id',
] as const satisfies readonly VerificationComparisonMismatchField[]);

export type VerificationComparisonForbiddenMismatchField =
  (typeof VERIFICATION_COMPARISON_FORBIDDEN_MISMATCH_FIELDS)[number];

export type VerificationComparisonAllowedMismatchField = Exclude<
  VerificationComparisonMismatchField,
  VerificationComparisonForbiddenMismatchField
>;

const forbiddenMismatchFields = new Set<VerificationComparisonMismatchField>(
  VERIFICATION_COMPARISON_FORBIDDEN_MISMATCH_FIELDS
);

export const VERIFICATION_COMPARISON_ALLOWED_MISMATCH_FIELDS = Object.freeze(
  VERIFICATION_COMPARISON_MISMATCH_FIELDS.filter(
    (field) => !forbiddenMismatchFields.has(field)
  )
) as readonly VerificationComparisonAllowedMismatchField[];

export const MAXIMUM_VERIFICATION_COMPARISON_ALLOWED_MISMATCH_FIELDS =
  VERIFICATION_COMPARISON_ALLOWED_MISMATCH_FIELDS.length;

const allowedMismatchFields =
  new Set<VerificationComparisonAllowedMismatchField>(
    VERIFICATION_COMPARISON_ALLOWED_MISMATCH_FIELDS
  );

export const isVerificationComparisonMismatchField = (
  value: unknown
): value is VerificationComparisonMismatchField =>
  typeof value === 'string' &&
  (VERIFICATION_COMPARISON_MISMATCH_FIELDS as readonly string[]).includes(
    value
  );

export const isAllowedVerificationComparisonMismatchField = (
  value: unknown
): value is VerificationComparisonAllowedMismatchField =>
  isVerificationComparisonMismatchField(value) &&
  allowedMismatchFields.has(
    value as VerificationComparisonAllowedMismatchField
  );

export const canonicalVerificationComparisonMismatchFields = (
  values: readonly VerificationComparisonAllowedMismatchField[]
): readonly VerificationComparisonAllowedMismatchField[] =>
  Object.freeze([...new Set(values)].sort(compareUnicodeCodePoints));
