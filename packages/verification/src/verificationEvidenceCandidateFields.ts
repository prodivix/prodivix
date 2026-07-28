import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  addVerificationEvidenceCodecIssue as addIssue,
  containsVerificationEvidenceControlCodePoint as containsControlCodePoint,
  isVerificationEvidenceCanonicalNfc as isCanonicalNfc,
  readExactVerificationEvidenceRecord as exactRecord,
  verificationEvidenceOwnDataValue as ownDataValue,
  verificationEvidencePointerSegment as pointerSegment,
  verificationEvidenceUtf8Length as utf8Length,
  VERIFICATION_EVIDENCE_CODEC_LIMITS,
} from './verificationEvidenceCodec.primitives';
import {
  ARTIFACT_KINDS,
  ARTIFACT_PATH_SEGMENT_PATTERN,
  CI_COMMIT_PATTERN,
  CI_REF_PATTERN,
  CI_REPOSITORY_PATTERN,
  DIGEST_PATTERN,
  IDENTIFIER_PATTERN,
  MEDIA_TYPE_PATTERN,
} from './verificationEvidenceCandidateSchema';
import { parseVerificationInstant } from './verificationCanonical';
import { normalizeVerificationCiIdentity } from './verificationCiIdentity';
import type {
  VerificationCiRepositoryIdentity,
  VerificationEvidenceCandidateArtifact,
  VerificationEvidenceCandidateIssue,
  VerificationEvidenceTargetPolicy,
  VerificationImplementationIdentity,
  VerificationJsonValue,
  VerificationPartitionRevisions,
  VerificationViewportAxis,
} from './verification.types';

export const ciRepositoryIdentity = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceCandidateIssue[]
): VerificationCiRepositoryIdentity | undefined => {
  const normalized = normalizeVerificationCiIdentity(value);
  if (normalized) return normalized;

  const initialIssueCount = issues.length;
  const record = exactRecord(
    value,
    path,
    ['repository', 'ref', 'commit'],
    [],
    issues
  );
  if (!record) return undefined;
  const repository = canonicalText(
    ownDataValue(record, 'repository'),
    `${path}/repository`,
    issues,
    512
  );
  if (repository && !CI_REPOSITORY_PATTERN.test(repository)) {
    addIssue(
      issues,
      'VER-4002',
      `${path}/repository`,
      'Expected a stable canonical ASCII CI repository identifier.'
    );
  }
  const ref = canonicalText(
    ownDataValue(record, 'ref'),
    `${path}/ref`,
    issues,
    512
  );
  if (ref && !CI_REF_PATTERN.test(ref)) {
    addIssue(
      issues,
      'VER-4002',
      `${path}/ref`,
      'Expected a canonical fully-qualified Git ref.'
    );
  }
  const rawCommit = ownDataValue(record, 'commit');
  const commit =
    typeof rawCommit === 'string' && CI_COMMIT_PATTERN.test(rawCommit)
      ? rawCommit
      : undefined;
  if (!commit) {
    addIssue(
      issues,
      'VER-4002',
      `${path}/commit`,
      'Expected an exact lowercase sha1 or sha256 CI commit identity.'
    );
  }
  if (
    issues.length === initialIssueCount &&
    repository &&
    CI_REPOSITORY_PATTERN.test(repository) &&
    ref &&
    CI_REF_PATTERN.test(ref) &&
    commit
  ) {
    addIssue(
      issues,
      'VER-4002',
      path,
      'CI identity does not satisfy the shared canonical contract.'
    );
  }
  return undefined;
};

export const canonicalText = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceCandidateIssue[],
  maximumBytes: number = VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumTextBytes
): string | undefined => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximumBytes ||
    value !== value.trim() ||
    !isCanonicalNfc(value) ||
    containsControlCodePoint(value) ||
    utf8Length(value) > maximumBytes
  ) {
    addIssue(
      issues,
      'VER-4002',
      path,
      'Expected a canonical NFC non-empty string within the UTF-8 budget.'
    );
    return undefined;
  }
  return value;
};

export const identifier = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceCandidateIssue[]
): string | undefined => {
  const text = canonicalText(
    value,
    path,
    issues,
    VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumIdentifierBytes
  );
  if (text !== undefined && !IDENTIFIER_PATTERN.test(text)) {
    addIssue(
      issues,
      'VER-4002',
      path,
      'Expected a canonical EvidenceCandidate identifier.'
    );
    return undefined;
  }
  return text;
};

export const digest = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceCandidateIssue[]
): string | undefined => {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    addIssue(
      issues,
      'VER-4002',
      path,
      'Expected a full lowercase sha256 digest.'
    );
    return undefined;
  }
  return value;
};

export const safeInteger = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceCandidateIssue[],
  maximum = Number.MAX_SAFE_INTEGER
): number | undefined => {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > maximum ||
    Object.is(value, -0)
  ) {
    addIssue(
      issues,
      'VER-4002',
      path,
      'Expected a non-negative safe integer within the supported range.'
    );
    return undefined;
  }
  return value;
};

const positiveSafeInteger = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceCandidateIssue[],
  maximum = Number.MAX_SAFE_INTEGER
): number | undefined => {
  const parsed = safeInteger(value, path, issues, maximum);
  if (parsed === 0) {
    addIssue(issues, 'VER-4002', path, 'Expected a positive safe integer.');
    return undefined;
  }
  return parsed;
};

export const finitePositiveNumber = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceCandidateIssue[],
  maximum: number
): number | undefined => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > maximum ||
    Object.is(value, -0)
  ) {
    addIssue(
      issues,
      'VER-4002',
      path,
      'Expected a finite positive number within the supported range.'
    );
    return undefined;
  }
  return value;
};

export const enumValue = <T extends string>(
  value: unknown,
  values: readonly T[],
  path: string,
  issues: VerificationEvidenceCandidateIssue[]
): T | undefined => {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    addIssue(
      issues,
      'VER-4002',
      path,
      'EvidenceCandidate contains an unsupported enum value.'
    );
    return undefined;
  }
  return value as T;
};

export const targetPolicy = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceCandidateIssue[]
): VerificationEvidenceTargetPolicy | undefined => {
  const record = exactRecord(
    value,
    path,
    ['authority', 'policyDigest', 'semanticTargetId', 'capture'],
    [],
    issues
  );
  if (!record) return undefined;
  const authority = ownDataValue(record, 'authority');
  if (authority !== 'verification-policy') {
    addIssue(
      issues,
      'VER-4002',
      `${path}/authority`,
      'Evidence target policy must be owned by verification-policy.'
    );
  }
  const policyDigest = digest(
    ownDataValue(record, 'policyDigest'),
    `${path}/policyDigest`,
    issues
  );
  const semanticTargetId = identifier(
    ownDataValue(record, 'semanticTargetId'),
    `${path}/semanticTargetId`,
    issues
  );
  const capture = enumValue(
    ownDataValue(record, 'capture'),
    ['allowed', 'masked', 'forbidden-sensitive'] as const,
    `${path}/capture`,
    issues
  );
  return authority === 'verification-policy' &&
    policyDigest &&
    semanticTargetId &&
    capture
    ? Object.freeze({
        authority,
        policyDigest,
        semanticTargetId,
        capture,
      })
    : undefined;
};

type ParsedInstant = Readonly<{ value: string; milliseconds: number }>;

export const instant = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceCandidateIssue[]
): ParsedInstant | undefined => {
  if (typeof value !== 'string') {
    addIssue(issues, 'VER-4002', path, 'Expected an explicit UTC instant.');
    return undefined;
  }
  const milliseconds = parseVerificationInstant(value);
  if (milliseconds === undefined) {
    addIssue(
      issues,
      'VER-4002',
      path,
      'Expected a canonical RFC 3339 UTC instant.'
    );
    return undefined;
  }
  return Object.freeze({ value, milliseconds });
};

export const exactArray = (
  value: unknown,
  path: string,
  maximumCount: number,
  issues: VerificationEvidenceCandidateIssue[]
): readonly unknown[] | undefined => {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    addIssue(issues, 'VER-4002', path, 'Expected a plain array.');
    return undefined;
  }
  if (value.length > maximumCount) {
    addIssue(
      issues,
      'VER-4002',
      path,
      'EvidenceCandidate array exceeds its count budget.'
    );
    return undefined;
  }
  const ownKeys = Reflect.ownKeys(value);
  const expectedOwnKeyCount = value.length + 1;
  if (
    ownKeys.length !== expectedOwnKeyCount ||
    !Object.hasOwn(value, 'length')
  ) {
    addIssue(
      issues,
      'VER-4002',
      path,
      'EvidenceCandidate arrays must be dense and cannot have extra fields.'
    );
    return undefined;
  }
  const output: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      addIssue(
        issues,
        'VER-4002',
        `${path}/${index}`,
        'EvidenceCandidate arrays must contain enumerable data values.'
      );
      return undefined;
    }
    output.push(descriptor.value);
  }
  return output;
};

export const identifierSet = (
  value: unknown,
  path: string,
  maximumCount: number,
  issues: VerificationEvidenceCandidateIssue[]
): readonly string[] | undefined => {
  const values = exactArray(value, path, maximumCount, issues);
  if (!values) return undefined;
  const normalized: string[] = [];
  values.forEach((entry, index) => {
    const parsed = identifier(entry, `${path}/${index}`, issues);
    if (parsed !== undefined) normalized.push(parsed);
  });
  if (new Set(normalized).size !== normalized.length) {
    addIssue(
      issues,
      'VER-4002',
      path,
      'EvidenceCandidate set values must be unique.'
    );
  }
  return Object.freeze(normalized.sort(compareUnicodeCodePoints));
};

export const digestSet = (
  value: unknown,
  path: string,
  maximumCount: number,
  issues: VerificationEvidenceCandidateIssue[]
): readonly string[] | undefined => {
  const values = exactArray(value, path, maximumCount, issues);
  if (!values) return undefined;
  const normalized: string[] = [];
  values.forEach((entry, index) => {
    const parsed = digest(entry, `${path}/${index}`, issues);
    if (parsed !== undefined) normalized.push(parsed);
  });
  if (new Set(normalized).size !== normalized.length) {
    addIssue(
      issues,
      'VER-4002',
      path,
      'EvidenceCandidate digest set values must be unique.'
    );
  }
  return Object.freeze(normalized.sort(compareUnicodeCodePoints));
};

type SummaryBudget = {
  nodes: number;
  objectKeys: number;
};

const summaryValue = (
  value: unknown,
  path: string,
  depth: number,
  budget: SummaryBudget,
  ancestors: Set<object>,
  issues: VerificationEvidenceCandidateIssue[]
): VerificationJsonValue | undefined => {
  budget.nodes += 1;
  if (
    depth > VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSummaryDepth ||
    budget.nodes > VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSummaryNodes
  ) {
    addIssue(
      issues,
      'VER-4002',
      path,
      'EvidenceCandidate summary exceeds its structural budget.'
    );
    return undefined;
  }
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (
      !Number.isFinite(value) ||
      (Number.isInteger(value) && !Number.isSafeInteger(value))
    ) {
      addIssue(
        issues,
        'VER-4002',
        path,
        'EvidenceCandidate summary numbers must be finite and integer values must be safe.'
      );
      return undefined;
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === 'string') {
    if (
      value.length >
        VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSummaryStringBytes ||
      !isCanonicalNfc(value) ||
      utf8Length(value) >
        VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSummaryStringBytes
    ) {
      addIssue(
        issues,
        'VER-4002',
        path,
        'EvidenceCandidate summary string is non-NFC or exceeds its UTF-8 budget.'
      );
      return undefined;
    }
    return value;
  }
  if (value === undefined || typeof value !== 'object') {
    addIssue(
      issues,
      'VER-4002',
      path,
      'EvidenceCandidate summary must contain only JSON values.'
    );
    return undefined;
  }
  if (ancestors.has(value)) {
    addIssue(
      issues,
      'VER-4002',
      path,
      'EvidenceCandidate summary cannot contain cycles.'
    );
    return undefined;
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const values = exactArray(
        value,
        path,
        VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSummaryNodes,
        issues
      );
      if (!values) return undefined;
      const output: VerificationJsonValue[] = [];
      values.forEach((entry, index) => {
        const parsed = summaryValue(
          entry,
          `${path}/${index}`,
          depth + 1,
          budget,
          ancestors,
          issues
        );
        if (parsed !== undefined) output.push(parsed);
      });
      return Object.freeze(output);
    }
    if (!isPlainObject(value)) {
      addIssue(
        issues,
        'VER-4002',
        path,
        'EvidenceCandidate summary objects must be plain objects.'
      );
      return undefined;
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.length > VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSummaryObjectKeys
    ) {
      addIssue(
        issues,
        'VER-4002',
        path,
        'EvidenceCandidate summary exceeds its object-key budget.'
      );
      return undefined;
    }
    budget.objectKeys += keys.length;
    if (
      budget.objectKeys >
      VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSummaryObjectKeys
    ) {
      addIssue(
        issues,
        'VER-4002',
        path,
        'EvidenceCandidate summary exceeds its aggregate object-key budget.'
      );
      return undefined;
    }
    const stringKeys: string[] = [];
    for (const key of keys) {
      const descriptor =
        typeof key === 'string'
          ? Object.getOwnPropertyDescriptor(value, key)
          : undefined;
      if (
        typeof key !== 'string' ||
        isUnsafeObjectKey(key) ||
        key.length >
          VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSummaryKeyBytes ||
        !isCanonicalNfc(key) ||
        utf8Length(key) >
          VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSummaryKeyBytes ||
        !descriptor ||
        !descriptor.enumerable ||
        !('value' in descriptor)
      ) {
        addIssue(
          issues,
          'VER-4002',
          path,
          'EvidenceCandidate summary contains an unsafe, non-NFC, or accessor-backed key.'
        );
        continue;
      }
      stringKeys.push(key);
    }
    const output: Record<string, VerificationJsonValue> = Object.create(null);
    for (const key of stringKeys.sort(compareUnicodeCodePoints)) {
      const parsed = summaryValue(
        ownDataValue(value, key),
        `${path}/${pointerSegment(key)}`,
        depth + 1,
        budget,
        ancestors,
        issues
      );
      if (parsed !== undefined) output[key] = parsed;
    }
    return Object.freeze(output);
  } finally {
    ancestors.delete(value);
  }
};

export const normalizedSummary = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceCandidateIssue[]
): VerificationJsonValue | undefined => {
  const normalized = summaryValue(
    value,
    path,
    0,
    { nodes: 0, objectKeys: 0 },
    new Set<object>(),
    issues
  );
  if (normalized === undefined) return undefined;
  try {
    if (
      utf8Length(canonicalJsonText(normalized)) >
      VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSummaryBytes
    ) {
      addIssue(
        issues,
        'VER-4002',
        path,
        'EvidenceCandidate summary exceeds its canonical UTF-8 budget.'
      );
      return undefined;
    }
  } catch {
    addIssue(
      issues,
      'VER-4002',
      path,
      'EvidenceCandidate summary cannot be canonically serialized.'
    );
    return undefined;
  }
  return normalized;
};

export const partitionRevisions = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceCandidateIssue[]
): VerificationPartitionRevisions | undefined => {
  const record = exactRecord(
    value,
    path,
    ['workspaceRev', 'routeRev', 'opSeq', 'documentRevisions'],
    [],
    issues
  );
  if (!record) return undefined;
  const workspaceRev = safeInteger(
    ownDataValue(record, 'workspaceRev'),
    `${path}/workspaceRev`,
    issues
  );
  const routeRev = safeInteger(
    ownDataValue(record, 'routeRev'),
    `${path}/routeRev`,
    issues
  );
  const opSeq = safeInteger(
    ownDataValue(record, 'opSeq'),
    `${path}/opSeq`,
    issues
  );
  const revisionsValue = ownDataValue(record, 'documentRevisions');
  if (!isPlainObject(revisionsValue)) {
    addIssue(
      issues,
      'VER-4002',
      `${path}/documentRevisions`,
      'EvidenceCandidate document revisions must be a plain map.'
    );
    return undefined;
  }
  const revisionKeys = Reflect.ownKeys(revisionsValue);
  if (
    revisionKeys.length >
    VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumDocumentRevisions
  ) {
    addIssue(
      issues,
      'VER-4002',
      `${path}/documentRevisions`,
      'EvidenceCandidate document revisions exceed their count budget.'
    );
    return undefined;
  }
  const documentRevisions: Record<
    string,
    Readonly<{ contentRev: number; metaRev: number }>
  > = Object.create(null);
  for (const key of revisionKeys) {
    if (typeof key !== 'string') {
      addIssue(
        issues,
        'VER-4002',
        `${path}/documentRevisions`,
        'EvidenceCandidate document revision keys must be strings.'
      );
      continue;
    }
    const keyPath = `${path}/documentRevisions/${pointerSegment(key)}`;
    const descriptor = Object.getOwnPropertyDescriptor(revisionsValue, key);
    const normalizedKey = identifier(key, keyPath, issues);
    if (
      isUnsafeObjectKey(key) ||
      !descriptor ||
      !descriptor.enumerable ||
      !('value' in descriptor)
    ) {
      addIssue(
        issues,
        'VER-4002',
        keyPath,
        'EvidenceCandidate document revision key is unsafe or accessor-backed.'
      );
      continue;
    }
    const revision = exactRecord(
      descriptor.value,
      keyPath,
      ['contentRev', 'metaRev'],
      [],
      issues
    );
    if (!revision || !normalizedKey) continue;
    const contentRev = safeInteger(
      ownDataValue(revision, 'contentRev'),
      `${keyPath}/contentRev`,
      issues
    );
    const metaRev = safeInteger(
      ownDataValue(revision, 'metaRev'),
      `${keyPath}/metaRev`,
      issues
    );
    if (contentRev !== undefined && metaRev !== undefined) {
      documentRevisions[normalizedKey] = Object.freeze({
        contentRev,
        metaRev,
      });
    }
  }
  if (
    workspaceRev === undefined ||
    routeRev === undefined ||
    opSeq === undefined
  ) {
    return undefined;
  }
  const sortedDocumentRevisions: typeof documentRevisions = Object.create(null);
  for (const key of Object.keys(documentRevisions).sort(
    compareUnicodeCodePoints
  )) {
    sortedDocumentRevisions[key] = documentRevisions[key]!;
  }
  return Object.freeze({
    workspaceRev,
    routeRev,
    opSeq,
    documentRevisions: Object.freeze(sortedDocumentRevisions),
  });
};

export const viewport = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceCandidateIssue[]
): VerificationViewportAxis | undefined => {
  const record = exactRecord(
    value,
    path,
    ['id', 'width', 'height'],
    [],
    issues
  );
  if (!record) return undefined;
  const id = identifier(ownDataValue(record, 'id'), `${path}/id`, issues);
  const width = positiveSafeInteger(
    ownDataValue(record, 'width'),
    `${path}/width`,
    issues,
    100_000
  );
  const height = positiveSafeInteger(
    ownDataValue(record, 'height'),
    `${path}/height`,
    issues,
    100_000
  );
  return id !== undefined && width !== undefined && height !== undefined
    ? Object.freeze({ id, width, height })
    : undefined;
};

export const implementationIdentity = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceCandidateIssue[]
): VerificationImplementationIdentity | undefined => {
  const record = exactRecord(
    value,
    path,
    [
      'packageName',
      'packageVersion',
      'buildDigest',
      'toolchainDigest',
      'schemaDigest',
    ],
    [],
    issues
  );
  if (!record) return undefined;
  const packageName = canonicalText(
    ownDataValue(record, 'packageName'),
    `${path}/packageName`,
    issues,
    512
  );
  const packageVersion = canonicalText(
    ownDataValue(record, 'packageVersion'),
    `${path}/packageVersion`,
    issues,
    128
  );
  const buildDigest = digest(
    ownDataValue(record, 'buildDigest'),
    `${path}/buildDigest`,
    issues
  );
  const toolchainDigest = digest(
    ownDataValue(record, 'toolchainDigest'),
    `${path}/toolchainDigest`,
    issues
  );
  const schemaDigest = digest(
    ownDataValue(record, 'schemaDigest'),
    `${path}/schemaDigest`,
    issues
  );
  return packageName &&
    packageVersion &&
    buildDigest &&
    toolchainDigest &&
    schemaDigest
    ? Object.freeze({
        packageName,
        packageVersion,
        buildDigest,
        toolchainDigest,
        schemaDigest,
      })
    : undefined;
};

const candidateArtifact = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceCandidateIssue[]
): VerificationEvidenceCandidateArtifact | undefined => {
  const record = exactRecord(
    value,
    path,
    [
      'id',
      'path',
      'stagingArtifactId',
      'kind',
      'expectedDigest',
      'expectedSize',
      'expectedMediaType',
    ],
    ['sourceTraceDigest'],
    issues
  );
  if (!record) return undefined;
  const id = identifier(ownDataValue(record, 'id'), `${path}/id`, issues);
  const stagingArtifactId = identifier(
    ownDataValue(record, 'stagingArtifactId'),
    `${path}/stagingArtifactId`,
    issues
  );
  const rawPath = ownDataValue(record, 'path');
  const artifactPath =
    typeof rawPath === 'string' &&
    rawPath.length <= VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumPathBytes &&
    utf8Length(rawPath) <=
      VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumPathBytes &&
    isCanonicalNfc(rawPath) &&
    !rawPath.includes('\\') &&
    !rawPath.startsWith('/') &&
    !rawPath.endsWith('/') &&
    rawPath.split('/').length <=
      VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumPathSegments &&
    rawPath
      .split('/')
      .every(
        (segment) =>
          segment !== '.' &&
          segment !== '..' &&
          ARTIFACT_PATH_SEGMENT_PATTERN.test(segment)
      )
      ? rawPath
      : undefined;
  if (!artifactPath) {
    addIssue(
      issues,
      'VER-4002',
      `${path}/path`,
      'Expected a canonical package-relative artifact path without traversal.'
    );
  }
  const kind = enumValue(
    ownDataValue(record, 'kind'),
    ARTIFACT_KINDS,
    `${path}/kind`,
    issues
  );
  const expectedDigest = digest(
    ownDataValue(record, 'expectedDigest'),
    `${path}/expectedDigest`,
    issues
  );
  const expectedSize = safeInteger(
    ownDataValue(record, 'expectedSize'),
    `${path}/expectedSize`,
    issues,
    VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumArtifactBytes
  );
  const rawMediaType = ownDataValue(record, 'expectedMediaType');
  const expectedMediaType =
    typeof rawMediaType === 'string' &&
    rawMediaType === rawMediaType.trim().toLowerCase() &&
    MEDIA_TYPE_PATTERN.test(rawMediaType)
      ? rawMediaType
      : undefined;
  if (!expectedMediaType) {
    addIssue(
      issues,
      'VER-4002',
      `${path}/expectedMediaType`,
      'Expected a canonical lowercase media type.'
    );
  }
  const sourceTraceDigest = Object.hasOwn(record, 'sourceTraceDigest')
    ? digest(
        ownDataValue(record, 'sourceTraceDigest'),
        `${path}/sourceTraceDigest`,
        issues
      )
    : undefined;
  if (
    !id ||
    !artifactPath ||
    !stagingArtifactId ||
    !kind ||
    !expectedDigest ||
    expectedSize === undefined ||
    !expectedMediaType ||
    (Object.hasOwn(record, 'sourceTraceDigest') && !sourceTraceDigest)
  ) {
    return undefined;
  }
  return Object.freeze({
    id,
    path: artifactPath,
    stagingArtifactId,
    kind,
    expectedDigest,
    expectedSize,
    expectedMediaType,
    ...(sourceTraceDigest ? { sourceTraceDigest } : {}),
  });
};

export const artifacts = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceCandidateIssue[]
): readonly VerificationEvidenceCandidateArtifact[] | undefined => {
  const values = exactArray(
    value,
    path,
    VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumArtifacts,
    issues
  );
  if (!values) return undefined;
  const normalized: VerificationEvidenceCandidateArtifact[] = [];
  let totalBytes = 0;
  values.forEach((entry, index) => {
    const artifact = candidateArtifact(entry, `${path}/${index}`, issues);
    if (artifact) {
      normalized.push(artifact);
      totalBytes += artifact.expectedSize;
    }
  });
  for (const [field, fieldValues] of [
    ['id', normalized.map((artifact) => artifact.id)],
    ['path', normalized.map((artifact) => artifact.path)],
    [
      'stagingArtifactId',
      normalized.map((artifact) => artifact.stagingArtifactId),
    ],
  ] as const) {
    if (new Set(fieldValues).size !== fieldValues.length) {
      addIssue(
        issues,
        'VER-4002',
        path,
        `EvidenceCandidate artifact ${field} values must be unique.`
      );
    }
  }
  if (
    !Number.isSafeInteger(totalBytes) ||
    totalBytes > VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumArtifactBytes
  ) {
    addIssue(
      issues,
      'VER-4002',
      path,
      'EvidenceCandidate artifacts exceed their aggregate byte budget.'
    );
  }
  return Object.freeze(
    normalized.sort((left, right) =>
      compareUnicodeCodePoints(left.id, right.id)
    )
  );
};

export const droppedFieldCounts = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceCandidateIssue[]
): Readonly<Record<string, number>> | undefined => {
  if (!isPlainObject(value)) {
    addIssue(
      issues,
      'VER-4002',
      path,
      'EvidenceCandidate dropped-field counts must be a plain map.'
    );
    return undefined;
  }
  const keys = Reflect.ownKeys(value);
  if (
    keys.length > VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumDroppedFieldCounts
  ) {
    addIssue(
      issues,
      'VER-4002',
      path,
      'EvidenceCandidate dropped-field counts exceed their count budget.'
    );
    return undefined;
  }
  const output: Record<string, number> = Object.create(null);
  for (const key of keys) {
    const descriptor =
      typeof key === 'string'
        ? Object.getOwnPropertyDescriptor(value, key)
        : undefined;
    const keyPath =
      typeof key === 'string' ? `${path}/${pointerSegment(key)}` : path;
    if (
      typeof key !== 'string' ||
      isUnsafeObjectKey(key) ||
      !descriptor ||
      !descriptor.enumerable ||
      !('value' in descriptor) ||
      canonicalText(key, keyPath, issues, 512) === undefined
    ) {
      addIssue(
        issues,
        'VER-4002',
        keyPath,
        'EvidenceCandidate dropped-field key is unsafe or accessor-backed.'
      );
      continue;
    }
    const count = safeInteger(descriptor.value, keyPath, issues);
    if (count !== undefined) output[key] = count;
  }
  const sorted: Record<string, number> = Object.create(null);
  for (const key of Object.keys(output).sort(compareUnicodeCodePoints)) {
    sorted[key] = output[key]!;
  }
  return Object.freeze(sorted);
};
