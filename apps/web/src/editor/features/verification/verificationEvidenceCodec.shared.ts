import {
  MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS,
  VERIFICATION_EVIDENCE_CODEC_LIMITS,
} from '@prodivix/verification';
import { isUnsafeObjectKey } from '@prodivix/shared/safety';
import type {
  VerificationArtifactKind as DomainVerificationArtifactKind,
  VerificationAttemptOutcome as DomainVerificationAttemptOutcome,
  VerificationComparisonMismatchField as DomainVerificationComparisonMismatchField,
  VerificationEvidence as DomainVerificationEvidence,
  VerificationEvidenceArtifactAvailabilityStatus as DomainVerificationEvidenceArtifactAvailability,
  VerificationEvidenceComparison as DomainVerificationEvidenceComparison,
  VerificationEvidenceRetentionProtection as DomainVerificationEvidenceRetentionProtection,
  VerificationEvidenceRetentionState as DomainVerificationEvidenceRetentionState,
  VerificationEvidenceTrust as DomainVerificationEvidenceTrust,
  VerificationEvidenceTrustStatus as DomainVerificationEvidenceTrustStatus,
  VerificationEvidenceVerifiedView as DomainVerificationEvidenceVerifiedView,
  VerificationEvidenceVerifiedViewRecord as DomainVerificationEvidenceVerifiedViewRecord,
  VerificationJsonValue,
  VerificationPartitionRevisions as DomainVerificationPartitionRevisions,
  VerificationRetentionClass as DomainVerificationRetentionClass,
} from '@prodivix/verification';

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const MEDIA_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u;
const UTC_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;

export const MAX_PAGE_RECORDS = 100;
export const MAX_VERIFIED_VIEW_RECORDS =
  MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS;
export const MAX_ARTIFACTS =
  VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumArtifacts;
const MAX_DOCUMENT_REVISIONS = 4096;
const MAX_JSON_DEPTH = 12;
const MAX_JSON_NODES = 2048;
const MAX_JSON_STRING_LENGTH = 8192;
const MAX_JSON_KEYS = 256;

export const TRUST_CLASSES = Object.freeze([
  'local-unattested',
  'remote-attested',
  'ci-attested',
  'imported-untrusted',
] as const);
export const TRUST_STATUSES = Object.freeze([
  'verified',
  'unverified',
  'revoked',
  'expired',
] as const);
export const RETENTION_CLASSES = Object.freeze([
  'session',
  'change',
  'release',
  'legal-hold',
] as const);
export const RETENTION_STATES = Object.freeze([
  'active',
  'tombstoned',
  'references-released',
] as const);
export const ARTIFACT_AVAILABILITIES = Object.freeze([
  'available',
  'missing',
  'deleted',
] as const);
export const ARTIFACT_KINDS = Object.freeze([
  'screenshot',
  'visual-diff',
  'accessibility-report',
  'trace',
  'network-summary',
  'console-summary',
  'coverage-summary',
  'performance-profile',
  'security-report',
  'build-log',
  'replay-record',
] as const);
export const ATTEMPT_OUTCOMES = Object.freeze([
  'passed',
  'failed',
  'blocked',
  'cancelled',
  'infrastructure-error',
] as const);
export const CHECK_KINDS = Object.freeze([
  'diagnostics',
  'build',
  'unit',
  'integration',
  'e2e',
  'visual',
  'accessibility',
  'performance',
  'security',
] as const);
export const SURFACES = Object.freeze(['preview', 'export', 'ci'] as const);
export const BROWSER_ENGINES = Object.freeze([
  'chromium',
  'firefox',
  'webkit',
] as const);
export const COLOR_SCHEMES = Object.freeze(['light', 'dark'] as const);
export const MOTIONS = Object.freeze(['full', 'reduced'] as const);
export const COMPARISON_COMPATIBILITIES = Object.freeze([
  'exact-compatible',
  'policy-compatible',
  'view-only',
  'incompatible',
] as const);
export const COMPARISON_MISMATCH_FIELDS = Object.freeze([
  'adapter-schema',
  'applied-controls',
  'baseline-set',
  'browser-engine',
  'cell-id',
  'check-id',
  'check-kind',
  'color-scheme',
  'control-profile',
  'dependency-lock',
  'device-pixel-ratio',
  'executable-snapshot',
  'fixture-set',
  'font-set',
  'framework-target',
  'impact-digest',
  'input-digest',
  'locale',
  'motion',
  'normalization-build',
  'normalization-package',
  'normalization-schema',
  'normalization-toolchain',
  'normalization-version',
  'operating-system',
  'partition-revisions',
  'plan-digest',
  'policy-digest',
  'policy-revision',
  'project-id',
  'redaction-policy',
  'runtime-zone',
  'sandbox-image',
  'scenario-digest',
  'scenario-id',
  'scenario-program',
  'scenario-revision',
  'surface',
  'target-id',
  'target-policy',
  'timezone',
  'tool-build',
  'tool-major',
  'tool-package',
  'tool-version',
  'toolchain',
  'viewport',
  'workspace-id',
  'workspace-revision',
] as const);

export type VerificationEvidenceTrust = DomainVerificationEvidenceTrust;
export type VerificationEvidenceTrustStatus =
  DomainVerificationEvidenceTrustStatus;
export type VerificationEvidenceRetentionClass =
  DomainVerificationRetentionClass;
export type VerificationEvidenceRetentionState =
  DomainVerificationEvidenceRetentionState;
export type VerificationEvidenceArtifactAvailability =
  DomainVerificationEvidenceArtifactAvailability;
export type VerificationEvidenceArtifactKind = DomainVerificationArtifactKind;
export type VerificationEvidenceAttemptOutcome =
  DomainVerificationAttemptOutcome;
export type VerificationEvidenceComparisonMismatchField =
  DomainVerificationComparisonMismatchField;

export const isVerificationEvidenceComparisonMismatchField = (
  value: unknown
): value is VerificationEvidenceComparisonMismatchField =>
  typeof value === 'string' &&
  COMPARISON_MISMATCH_FIELDS.includes(
    value as VerificationEvidenceComparisonMismatchField
  );

export type VerificationEvidencePartitionRevisions =
  DomainVerificationPartitionRevisions;

export type VerificationEvidenceArtifactDescriptor = Readonly<{
  id: string;
  path: string;
  kind: VerificationEvidenceArtifactKind;
  digest: string;
  normalizedDigest?: string;
  sourceTraceDigest?: string;
  size: number;
  mediaType: string;
  availability: VerificationEvidenceArtifactAvailability;
}>;

export type VerificationEvidenceTransportRecord = Readonly<{
  evidence: DomainVerificationEvidence;
  artifacts: readonly VerificationEvidenceArtifactDescriptor[];
  verifiedView: VerificationEvidenceVerifiedViewRecord;
  activeProtections: readonly DomainVerificationEvidenceRetentionProtection[];
}>;

export type VerificationEvidencePage = Readonly<{
  records: readonly VerificationEvidenceTransportRecord[];
  nextCursor?: string;
}>;

export type VerificationEvidenceVerifiedViewRecord =
  DomainVerificationEvidenceVerifiedViewRecord;

export type VerificationEvidenceVerifiedView =
  DomainVerificationEvidenceVerifiedView;

export type VerificationEvidenceComparison =
  DomainVerificationEvidenceComparison;

export type VerificationEvidenceRetentionProtection =
  DomainVerificationEvidenceRetentionProtection;

export const fail = (path: string, message: string): never => {
  throw new TypeError(
    `Invalid Verification Evidence response at ${path}: ${message}`
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const recordAt = (
  value: unknown,
  path: string
): Record<string, unknown> => {
  if (!isRecord(value)) fail(path, 'expected an object');
  return value as Record<string, unknown>;
};

export const exactKeys = (
  value: Record<string, unknown>,
  path: string,
  required: readonly string[],
  optional: readonly string[] = []
): void => {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (isUnsafeObjectKey(key) || !allowed.has(key)) {
      fail(path, `unexpected key "${key}"`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(path, `missing key "${key}"`);
  }
};

export const stringAt = (
  value: unknown,
  path: string,
  maximumLength = 8192
): string => {
  if (
    typeof value !== 'string' ||
    value.length > maximumLength ||
    value.normalize('NFC') !== value
  ) {
    fail(path, 'expected bounded NFC text');
  }
  return value as string;
};

export const nonEmptyStringAt = (
  value: unknown,
  path: string,
  maximumLength = 8192
): string => {
  const decoded = stringAt(value, path, maximumLength);
  if (!decoded.trim()) fail(path, 'expected non-empty text');
  return decoded;
};

export const identifierAt = (value: unknown, path: string): string => {
  const decoded = stringAt(value, path, 256);
  if (!IDENTIFIER_PATTERN.test(decoded)) fail(path, 'expected an identifier');
  return decoded;
};

export const digestAt = (value: unknown, path: string): string => {
  const decoded = stringAt(value, path, 71);
  if (!DIGEST_PATTERN.test(decoded)) fail(path, 'expected a SHA-256 digest');
  return decoded;
};

export const mediaTypeAt = (value: unknown, path: string): string => {
  const decoded = stringAt(value, path, 127);
  if (!MEDIA_TYPE_PATTERN.test(decoded)) fail(path, 'expected a media type');
  return decoded;
};

export const instantAt = (value: unknown, path: string): string => {
  const decoded = stringAt(value, path, 40);
  if (
    !UTC_INSTANT_PATTERN.test(decoded) ||
    !Number.isFinite(Date.parse(decoded))
  ) {
    fail(path, 'expected a UTC RFC 3339 instant');
  }
  return decoded;
};

export const safeIntegerAt = (
  value: unknown,
  path: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER
): number => {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail(path, 'expected a bounded safe integer');
  }
  return value as number;
};

export const finiteNumberAt = (
  value: unknown,
  path: string,
  minimum: number,
  maximum: number
): number => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail(path, 'expected a bounded finite number');
  }
  return value as number;
};

export const booleanAt = (value: unknown, path: string): boolean => {
  if (typeof value !== 'boolean') fail(path, 'expected a boolean');
  return value as boolean;
};

export const enumAt = <TValue extends string>(
  value: unknown,
  path: string,
  values: readonly TValue[]
): TValue => {
  if (typeof value !== 'string' || !values.includes(value as TValue)) {
    fail(path, `expected one of ${values.join(', ')}`);
  }
  return value as TValue;
};

export const optional = <TValue>(
  value: Record<string, unknown>,
  key: string,
  read: (candidate: unknown, path: string) => TValue,
  path: string
): TValue | undefined =>
  Object.hasOwn(value, key) ? read(value[key], `${path}/${key}`) : undefined;

export const identifierArrayAt = (
  value: unknown,
  path: string,
  maximum = 128
): readonly string[] => {
  if (!Array.isArray(value) || value.length > maximum) {
    fail(path, 'expected a bounded identifier array');
  }
  const candidates = value as unknown[];
  const decoded = candidates.map((candidate, index) =>
    identifierAt(candidate, `${path}/${index}`)
  );
  if (new Set(decoded).size !== decoded.length) {
    fail(path, 'expected unique identifiers');
  }
  return Object.freeze(decoded);
};

export const digestArrayAt = (
  value: unknown,
  path: string,
  maximum = 128
): readonly string[] => {
  if (!Array.isArray(value) || value.length > maximum) {
    fail(path, 'expected a bounded digest array');
  }
  const candidates = value as unknown[];
  const decoded = candidates.map((candidate, index) =>
    digestAt(candidate, `${path}/${index}`)
  );
  if (new Set(decoded).size !== decoded.length) {
    fail(path, 'expected unique digests');
  }
  return Object.freeze(decoded);
};

type JsonBudget = { nodes: number };

export const jsonValueAt = (
  value: unknown,
  path: string,
  depth = 0,
  budget: JsonBudget = { nodes: 0 }
): VerificationJsonValue => {
  budget.nodes += 1;
  if (budget.nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) {
    fail(path, 'JSON value exceeds its structural budget');
  }
  if (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (typeof value === 'string') {
    return stringAt(value, path, MAX_JSON_STRING_LENGTH);
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_JSON_KEYS)
      fail(path, 'array exceeds its item budget');
    return Object.freeze(
      value.map((candidate, index) =>
        jsonValueAt(candidate, `${path}/${index}`, depth + 1, budget)
      )
    );
  }
  if (!isRecord(value)) fail(path, 'expected JSON-compatible data');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length > MAX_JSON_KEYS) fail(path, 'object exceeds its key budget');
  const decoded: Record<string, VerificationJsonValue> = Object.create(null);
  for (const key of keys) {
    if (
      isUnsafeObjectKey(key) ||
      key.length > 256 ||
      key.normalize('NFC') !== key
    ) {
      fail(path, 'object contains an unsafe key');
    }
    decoded[key] = jsonValueAt(
      record[key],
      `${path}/${key}`,
      depth + 1,
      budget
    );
  }
  return Object.freeze(decoded);
};

export const partitionRevisionsAt = (
  value: unknown,
  path: string
): VerificationEvidencePartitionRevisions => {
  const record = recordAt(value, path);
  exactKeys(record, path, [
    'workspaceRev',
    'routeRev',
    'opSeq',
    'documentRevisions',
  ]);
  const documents = recordAt(
    record.documentRevisions,
    `${path}/documentRevisions`
  );
  const documentIds = Object.keys(documents);
  if (documentIds.length > MAX_DOCUMENT_REVISIONS) {
    fail(`${path}/documentRevisions`, 'too many document revisions');
  }
  const decodedDocuments: Record<
    string,
    Readonly<{ contentRev: number; metaRev: number }>
  > = Object.create(null);
  for (const documentId of documentIds) {
    if (isUnsafeObjectKey(documentId) || !IDENTIFIER_PATTERN.test(documentId)) {
      fail(`${path}/documentRevisions`, 'contains an unsafe document id');
    }
    const revisionPath = `${path}/documentRevisions/${documentId}`;
    const revision = recordAt(documents[documentId], revisionPath);
    exactKeys(revision, revisionPath, ['contentRev', 'metaRev']);
    decodedDocuments[documentId] = Object.freeze({
      contentRev: safeIntegerAt(
        revision.contentRev,
        `${revisionPath}/contentRev`
      ),
      metaRev: safeIntegerAt(revision.metaRev, `${revisionPath}/metaRev`),
    });
  }
  return Object.freeze({
    workspaceRev: safeIntegerAt(record.workspaceRev, `${path}/workspaceRev`, 1),
    routeRev: safeIntegerAt(record.routeRev, `${path}/routeRev`),
    opSeq: safeIntegerAt(record.opSeq, `${path}/opSeq`),
    documentRevisions: Object.freeze(decodedDocuments),
  });
};
