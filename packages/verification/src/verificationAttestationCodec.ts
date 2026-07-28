import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import { readCanonicalVerificationArtifactPath } from './verificationArtifactPath';
import {
  digestVerificationValue,
  parseVerificationInstant,
} from './verificationCanonical';
import { normalizeVerificationCiIdentity } from './verificationCiIdentity';
import { isVerificationEvidenceUnicodeScalarText } from './verificationEvidenceCodec.primitives';
import {
  VERIFICATION_ATTESTATION_CLAIMS_FORMAT,
  VERIFICATION_ATTESTATION_CLAIMS_VERSION,
  VERIFICATION_ATTESTATION_PRESENTATION_FORMAT,
  VERIFICATION_ATTESTATION_PRESENTATION_VERSION,
  VERIFICATION_EVIDENCE_STATEMENT_FORMAT,
  VERIFICATION_EVIDENCE_STATEMENT_VERSION,
  type VerificationAttestationClaimSet,
  type VerificationAttestationExpectedClaims,
  type VerificationAttestationVerifierClaims,
  type VerificationEvidenceArtifactStatement,
  type VerificationEvidenceExecutionStatement,
  type VerificationEvidenceProducerStatement,
  type VerificationEvidenceStatement,
  type VerificationVerifiedClaims,
} from './verificationAttestation.types';

const digestPattern = /^sha256-[0-9a-f]{64}$/u;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,511}$/u;
const mediaTypePattern =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u;
const localePattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?$/u;
const maximumArtifacts = 256;
const checkKinds = new Set([
  'diagnostics',
  'build',
  'unit',
  'integration',
  'e2e',
  'visual',
  'accessibility',
  'performance',
  'security',
]);
const surfaces = new Set(['preview', 'export', 'ci']);
const browserEngines = new Set(['chromium', 'firefox', 'webkit']);
const colorSchemes = new Set(['light', 'dark']);
const motions = new Set(['full', 'reduced']);

export type NormalizedVerificationAttestationExpectation = Readonly<{
  expected: VerificationAttestationExpectedClaims;
  statement: VerificationEvidenceStatement;
  statementDigest: string;
  artifactSetDigest: string;
  producerDigest: string;
  verificationInstant: number;
}>;

export const exactVerificationAttestationRecord = (
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = []
): Readonly<Record<string, unknown>> | undefined => {
  try {
    if (!isPlainObject(value)) return undefined;
    const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length < requiredKeys.length ||
      ownKeys.length > allowedKeys.size
    )
      return undefined;
    const presentKeys = new Set<string>();
    const entries: [string, unknown][] = [];
    for (const key of ownKeys) {
      if (
        typeof key !== 'string' ||
        isUnsafeObjectKey(key) ||
        !allowedKeys.has(key)
      )
        return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !('value' in descriptor)) return undefined;
      presentKeys.add(key);
      entries.push([key, descriptor.value]);
    }
    if (requiredKeys.some((key) => !presentKeys.has(key))) return undefined;
    return Object.freeze(Object.fromEntries(entries));
  } catch {
    return undefined;
  }
};

const exactVerificationAttestationDataArray = (
  value: unknown,
  maximumLength: number
): readonly unknown[] | undefined => {
  try {
    if (!Array.isArray(value)) return undefined;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      !lengthDescriptor ||
      !('value' in lengthDescriptor) ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0 ||
      lengthDescriptor.value > maximumLength
    )
      return undefined;
    const length = lengthDescriptor.value as number;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== length + 1) return undefined;
    const items: unknown[] = [];
    for (const key of ownKeys) {
      if (key === 'length') continue;
      if (
        typeof key !== 'string' ||
        isUnsafeObjectKey(key) ||
        !/^(0|[1-9][0-9]*)$/u.test(key)
      )
        return undefined;
      const index = Number(key);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= length ||
        !descriptor?.enumerable ||
        !('value' in descriptor)
      )
        return undefined;
      items[index] = descriptor.value;
    }
    if (items.length !== length || items.some((_, index) => !(index in items)))
      return undefined;
    return Object.freeze(items);
  } catch {
    return undefined;
  }
};

const canonicalText = (
  value: unknown,
  maximumBytes = 512
): string | undefined => {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value !== value.trim() ||
    !isVerificationEvidenceUnicodeScalarText(value) ||
    value !== value.normalize('NFC')
  )
    return undefined;
  const bytes = utf8ToBytes(value);
  const containsControl = [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint < 32 || codePoint === 127;
  });
  return bytes.byteLength <= maximumBytes && !containsControl
    ? value
    : undefined;
};

const identifier = (value: unknown): string | undefined => {
  const normalized = canonicalText(value);
  return normalized && identifierPattern.test(normalized)
    ? normalized
    : undefined;
};

const digest = (value: unknown): string | undefined =>
  typeof value === 'string' && digestPattern.test(value) ? value : undefined;

const positiveInteger = (value: unknown): number | undefined =>
  Number.isSafeInteger(value) && (value as number) > 0
    ? (value as number)
    : undefined;

const nonnegativeInteger = (value: unknown): number | undefined =>
  Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : undefined;

const boundedPositiveInteger = (
  value: unknown,
  maximum: number
): number | undefined =>
  Number.isSafeInteger(value) &&
  (value as number) > 0 &&
  (value as number) <= maximum
    ? (value as number)
    : undefined;

const enumText = <T extends string>(
  value: unknown,
  values: ReadonlySet<string>
): T | undefined =>
  typeof value === 'string' && values.has(value) ? (value as T) : undefined;

const normalizeExecution = (
  value: VerificationEvidenceExecutionStatement
): VerificationEvidenceExecutionStatement => {
  const record = exactVerificationAttestationRecord(
    value,
    [
      'surface',
      'frameworkTarget',
      'runtimeZone',
      'viewport',
      'devicePixelRatio',
      'colorScheme',
      'motion',
      'locale',
      'timezone',
      'fontSetDigest',
    ],
    ['browserEngine', 'operatingSystemIdentity', 'sandboxImageDigest']
  );
  const surface = enumText<VerificationEvidenceExecutionStatement['surface']>(
    record?.surface,
    surfaces
  );
  const frameworkTarget = identifier(record?.frameworkTarget);
  const runtimeZone = identifier(record?.runtimeZone);
  const browserEngine =
    record?.browserEngine === undefined
      ? undefined
      : enumText<
          NonNullable<VerificationEvidenceExecutionStatement['browserEngine']>
        >(record.browserEngine, browserEngines);
  const operatingSystemIdentity =
    record?.operatingSystemIdentity === undefined
      ? undefined
      : canonicalText(record.operatingSystemIdentity, 512);
  const viewportRecord = exactVerificationAttestationRecord(record?.viewport, [
    'id',
    'width',
    'height',
  ]);
  const viewportId = identifier(viewportRecord?.id);
  const viewportWidth = boundedPositiveInteger(viewportRecord?.width, 100_000);
  const viewportHeight = boundedPositiveInteger(
    viewportRecord?.height,
    100_000
  );
  const devicePixelRatio =
    typeof record?.devicePixelRatio === 'number' &&
    Number.isFinite(record.devicePixelRatio) &&
    record.devicePixelRatio > 0 &&
    record.devicePixelRatio <= 16
      ? record.devicePixelRatio
      : undefined;
  const colorScheme = enumText<
    VerificationEvidenceExecutionStatement['colorScheme']
  >(record?.colorScheme, colorSchemes);
  const motion = enumText<VerificationEvidenceExecutionStatement['motion']>(
    record?.motion,
    motions
  );
  const locale = canonicalText(record?.locale, 64);
  const timezone = canonicalText(record?.timezone, 128);
  const fontSetDigest = digest(record?.fontSetDigest);
  const sandboxImageDigest =
    record?.sandboxImageDigest === undefined
      ? undefined
      : digest(record.sandboxImageDigest);
  if (
    !record ||
    !surface ||
    !frameworkTarget ||
    !runtimeZone ||
    (record.browserEngine !== undefined && !browserEngine) ||
    (record.operatingSystemIdentity !== undefined &&
      !operatingSystemIdentity) ||
    !viewportRecord ||
    !viewportId ||
    viewportWidth === undefined ||
    viewportHeight === undefined ||
    devicePixelRatio === undefined ||
    !colorScheme ||
    !motion ||
    !locale ||
    !localePattern.test(locale) ||
    !timezone ||
    !fontSetDigest ||
    (record.sandboxImageDigest !== undefined && !sandboxImageDigest)
  )
    throw new TypeError(
      'Verification Evidence execution statement is invalid.'
    );
  return Object.freeze({
    surface,
    frameworkTarget,
    runtimeZone,
    ...(browserEngine ? { browserEngine } : {}),
    ...(operatingSystemIdentity ? { operatingSystemIdentity } : {}),
    viewport: Object.freeze({
      id: viewportId,
      width: viewportWidth,
      height: viewportHeight,
    }),
    devicePixelRatio,
    colorScheme,
    motion,
    locale,
    timezone,
    fontSetDigest,
    ...(sandboxImageDigest ? { sandboxImageDigest } : {}),
  });
};

const normalizeArtifact = (
  value: VerificationEvidenceArtifactStatement
): VerificationEvidenceArtifactStatement => {
  const record = exactVerificationAttestationRecord(
    value,
    ['id', 'path', 'kind', 'digest', 'size', 'mediaType'],
    ['sourceTraceDigest']
  );
  const id = identifier(record?.id);
  let path: string | undefined;
  try {
    path = readCanonicalVerificationArtifactPath(record?.path);
  } catch {
    path = undefined;
  }
  const kind = identifier(record?.kind);
  const contentDigest = digest(record?.digest);
  const sourceTraceDigest =
    record?.sourceTraceDigest === undefined
      ? undefined
      : digest(record.sourceTraceDigest);
  const size = nonnegativeInteger(record?.size);
  const mediaType = canonicalText(record?.mediaType, 127);
  if (
    !id ||
    !path ||
    !kind ||
    !contentDigest ||
    (record?.sourceTraceDigest !== undefined && !sourceTraceDigest) ||
    size === undefined ||
    !mediaType ||
    !mediaTypePattern.test(mediaType)
  )
    throw new TypeError('Verification Evidence artifact statement is invalid.');
  return Object.freeze({
    id,
    path,
    kind,
    digest: contentDigest,
    ...(sourceTraceDigest ? { sourceTraceDigest } : {}),
    size,
    mediaType,
  });
};

const optionalProducerKeys = Object.freeze([
  'jobId',
  'sessionId',
  'workerId',
  'workerAttempt',
  'sandboxImageDigest',
  'ci',
] as const);

const normalizeProducer = (
  value: VerificationEvidenceProducerStatement
): VerificationEvidenceProducerStatement => {
  const required = ['origin', 'producerId', 'providerId', 'runId'] as const;
  const record = exactVerificationAttestationRecord(
    value,
    required,
    optionalProducerKeys
  );
  if (!record)
    throw new TypeError('Verification Evidence producer statement is invalid.');
  const origin =
    record.origin === 'local' ||
    record.origin === 'remote' ||
    record.origin === 'ci' ||
    record.origin === 'import'
      ? record.origin
      : undefined;
  const producerId = identifier(record.producerId);
  const providerId = identifier(record.providerId);
  const runId = identifier(record.runId);
  const jobId =
    record.jobId === undefined ? undefined : identifier(record.jobId);
  const sessionId =
    record.sessionId === undefined ? undefined : identifier(record.sessionId);
  const workerId =
    record.workerId === undefined ? undefined : identifier(record.workerId);
  const workerAttempt =
    record.workerAttempt === undefined
      ? undefined
      : positiveInteger(record.workerAttempt);
  const sandboxImageDigest =
    record.sandboxImageDigest === undefined
      ? undefined
      : digest(record.sandboxImageDigest);
  const ci =
    record.ci === undefined
      ? undefined
      : normalizeVerificationCiIdentity(record.ci);
  if (
    !origin ||
    !producerId ||
    !providerId ||
    !runId ||
    (record.jobId !== undefined && !jobId) ||
    (record.sessionId !== undefined && !sessionId) ||
    (record.workerId !== undefined && !workerId) ||
    (record.workerAttempt !== undefined && workerAttempt === undefined) ||
    (record.sandboxImageDigest !== undefined && !sandboxImageDigest) ||
    (origin === 'ci') !== Boolean(ci) ||
    (workerId === undefined) !== (workerAttempt === undefined)
  )
    throw new TypeError('Verification Evidence producer statement is invalid.');
  const common = {
    producerId,
    providerId,
    runId,
    ...(jobId ? { jobId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(workerId ? { workerId, workerAttempt: workerAttempt! } : {}),
    ...(sandboxImageDigest ? { sandboxImageDigest } : {}),
  };
  return origin === 'ci'
    ? Object.freeze({ ...common, origin, ci: ci! })
    : Object.freeze({ ...common, origin });
};

export const normalizeVerificationEvidenceStatement = (
  value: VerificationEvidenceStatement
): VerificationEvidenceStatement => {
  const record = exactVerificationAttestationRecord(value, [
    'evidenceId',
    'candidateId',
    'candidateDigest',
    'evidenceCoreDigest',
    'projectId',
    'workspaceId',
    'workspaceRevision',
    'partitionRevisionsDigest',
    'executableSnapshotDigest',
    'policyDigest',
    'planDigest',
    'cellId',
    'checkId',
    'checkKind',
    'targetId',
    'targetPolicyDigest',
    'attemptId',
    'producer',
    'execution',
    'toolchainDigest',
    'normalizationDigest',
    'controlDigest',
    'inputDigest',
    'resultDigest',
    'sourceTraceDigest',
    'createdAt',
    'retention',
    'artifacts',
  ]);
  const evidenceId = identifier(record?.evidenceId);
  const candidateId = identifier(record?.candidateId);
  const candidateDigest = digest(record?.candidateDigest);
  const evidenceCoreDigest = digest(record?.evidenceCoreDigest);
  const projectId = identifier(record?.projectId);
  const workspaceId = identifier(record?.workspaceId);
  const workspaceRevision = nonnegativeInteger(record?.workspaceRevision);
  const partitionRevisionsDigest = digest(record?.partitionRevisionsDigest);
  const executableSnapshotDigest = digest(record?.executableSnapshotDigest);
  const policyDigest = digest(record?.policyDigest);
  const planDigest = digest(record?.planDigest);
  const cellId = identifier(record?.cellId);
  const checkId = identifier(record?.checkId);
  const checkKind = enumText<VerificationEvidenceStatement['checkKind']>(
    record?.checkKind,
    checkKinds
  );
  const targetId = identifier(record?.targetId);
  const targetPolicyDigest = digest(record?.targetPolicyDigest);
  const attemptId = identifier(record?.attemptId);
  const toolchainDigest = digest(record?.toolchainDigest);
  const normalizationDigest = digest(record?.normalizationDigest);
  const controlDigest = digest(record?.controlDigest);
  const inputDigest = digest(record?.inputDigest);
  const resultDigest = digest(record?.resultDigest);
  const sourceTraceDigest = digest(record?.sourceTraceDigest);
  const createdAt =
    typeof record?.createdAt === 'string' &&
    parseVerificationInstant(record.createdAt) !== undefined
      ? record.createdAt
      : undefined;
  const retention =
    record?.retention === 'session' ||
    record?.retention === 'change' ||
    record?.retention === 'release' ||
    record?.retention === 'legal-hold'
      ? record.retention
      : undefined;
  const artifactValues = exactVerificationAttestationDataArray(
    record?.artifacts,
    maximumArtifacts
  );
  if (
    !record ||
    !evidenceId ||
    !candidateId ||
    !candidateDigest ||
    !evidenceCoreDigest ||
    !projectId ||
    !workspaceId ||
    workspaceRevision === undefined ||
    !partitionRevisionsDigest ||
    !executableSnapshotDigest ||
    !policyDigest ||
    !planDigest ||
    !cellId ||
    !checkId ||
    !checkKind ||
    !targetId ||
    !targetPolicyDigest ||
    !attemptId ||
    !toolchainDigest ||
    !normalizationDigest ||
    !controlDigest ||
    !inputDigest ||
    !resultDigest ||
    !sourceTraceDigest ||
    !createdAt ||
    !retention ||
    !artifactValues
  )
    throw new TypeError('Verification Evidence statement is invalid.');
  const artifacts = (artifactValues as VerificationEvidenceArtifactStatement[])
    .map(normalizeArtifact)
    .sort(
      (left, right) =>
        compareUnicodeCodePoints(left.id, right.id) ||
        compareUnicodeCodePoints(left.kind, right.kind) ||
        compareUnicodeCodePoints(left.digest, right.digest)
    );
  if (new Set(artifacts.map(({ id }) => id)).size !== artifacts.length)
    throw new TypeError('Verification Evidence artifact ids must be unique.');
  const producer = normalizeProducer(
    record.producer as VerificationEvidenceProducerStatement
  );
  const execution = normalizeExecution(
    record.execution as VerificationEvidenceExecutionStatement
  );
  return Object.freeze({
    evidenceId,
    candidateId,
    candidateDigest,
    evidenceCoreDigest,
    projectId,
    workspaceId,
    workspaceRevision,
    partitionRevisionsDigest,
    executableSnapshotDigest,
    policyDigest,
    planDigest,
    cellId,
    checkId,
    checkKind,
    targetId,
    targetPolicyDigest,
    attemptId,
    producer,
    execution,
    toolchainDigest,
    normalizationDigest,
    controlDigest,
    inputDigest,
    resultDigest,
    sourceTraceDigest,
    createdAt,
    retention,
    artifacts: Object.freeze(artifacts),
  });
};

export const createVerificationArtifactSetDigest = (
  artifacts: readonly VerificationEvidenceArtifactStatement[]
): string => {
  const artifactValues = exactVerificationAttestationDataArray(
    artifacts,
    maximumArtifacts
  );
  if (!artifactValues)
    throw new TypeError('Verification Evidence artifact set is invalid.');
  const normalized = (artifactValues as VerificationEvidenceArtifactStatement[])
    .map(normalizeArtifact)
    .sort(
      (left, right) =>
        compareUnicodeCodePoints(left.id, right.id) ||
        compareUnicodeCodePoints(left.kind, right.kind) ||
        compareUnicodeCodePoints(left.digest, right.digest)
    );
  if (new Set(normalized.map(({ id }) => id)).size !== normalized.length)
    throw new TypeError('Verification Evidence artifact ids must be unique.');
  return digestVerificationValue(
    Object.freeze({
      format: 'prodivix.verification-artifact-set',
      version: 1,
      artifacts: normalized,
    })
  );
};

export const createVerificationEvidenceStatementDigest = (
  value: VerificationEvidenceStatement
): string =>
  digestVerificationValue(
    Object.freeze({
      format: VERIFICATION_EVIDENCE_STATEMENT_FORMAT,
      version: VERIFICATION_EVIDENCE_STATEMENT_VERSION,
      statement: normalizeVerificationEvidenceStatement(value),
    })
  );

export const serializeVerificationEvidenceStatement = (
  value: VerificationEvidenceStatement
): string =>
  canonicalJsonText(
    Object.freeze({
      format: VERIFICATION_EVIDENCE_STATEMENT_FORMAT,
      version: VERIFICATION_EVIDENCE_STATEMENT_VERSION,
      statement: normalizeVerificationEvidenceStatement(value),
    })
  );

export const normalizeVerificationAttestationExpectedClaims = (
  value: VerificationAttestationExpectedClaims
): NormalizedVerificationAttestationExpectation | undefined => {
  const record = exactVerificationAttestationRecord(value, [
    'trust',
    'issuer',
    'audience',
    'subject',
    'nonce',
    'policyGeneration',
    'verificationInstant',
    'maximumLifetimeMs',
    'statement',
  ]);
  if (
    !record ||
    (record.trust !== 'remote-attested' && record.trust !== 'ci-attested')
  )
    return undefined;
  const issuer = canonicalText(record.issuer);
  const audience = canonicalText(record.audience);
  const subject = canonicalText(record.subject);
  const nonce = canonicalText(record.nonce);
  const policyGeneration = positiveInteger(record.policyGeneration);
  const verificationInstantText =
    typeof record.verificationInstant === 'string'
      ? record.verificationInstant
      : '';
  const verificationInstant = parseVerificationInstant(verificationInstantText);
  const maximumLifetimeMs = positiveInteger(record.maximumLifetimeMs);
  if (
    !issuer ||
    !audience ||
    !subject ||
    !nonce ||
    policyGeneration === undefined ||
    verificationInstant === undefined ||
    maximumLifetimeMs === undefined
  )
    return undefined;
  let statement: VerificationEvidenceStatement;
  try {
    statement = normalizeVerificationEvidenceStatement(
      record.statement as VerificationEvidenceStatement
    );
  } catch {
    return undefined;
  }
  if (
    (record.trust === 'ci-attested' && statement.producer.origin !== 'ci') ||
    (record.trust === 'remote-attested' &&
      statement.producer.origin !== 'remote')
  )
    return undefined;
  return Object.freeze({
    expected: Object.freeze({
      trust: record.trust,
      issuer,
      audience,
      subject,
      nonce,
      policyGeneration,
      verificationInstant: verificationInstantText,
      maximumLifetimeMs,
      statement,
    }),
    statement,
    statementDigest: createVerificationEvidenceStatementDigest(statement),
    artifactSetDigest: createVerificationArtifactSetDigest(statement.artifacts),
    producerDigest: digestVerificationValue(statement.producer),
    verificationInstant,
  });
};

export const createVerificationAttestationClaimSet = (
  input: Readonly<{
    expected: VerificationAttestationExpectedClaims;
    issuedAt: string;
    notBefore: string;
    expiresAt: string;
  }>
): VerificationAttestationClaimSet => {
  const record = exactVerificationAttestationRecord(input, [
    'expected',
    'issuedAt',
    'notBefore',
    'expiresAt',
  ]);
  if (!record)
    throw new TypeError('Verification attestation expectation is invalid.');
  const normalized = normalizeVerificationAttestationExpectedClaims(
    record.expected as VerificationAttestationExpectedClaims
  );
  if (!normalized)
    throw new TypeError('Verification attestation expectation is invalid.');
  const issuedAt = typeof record.issuedAt === 'string' ? record.issuedAt : '';
  const notBefore =
    typeof record.notBefore === 'string' ? record.notBefore : '';
  const expiresAt =
    typeof record.expiresAt === 'string' ? record.expiresAt : '';
  if (
    parseVerificationInstant(issuedAt) === undefined ||
    parseVerificationInstant(notBefore) === undefined ||
    parseVerificationInstant(expiresAt) === undefined
  )
    throw new TypeError('Verification attestation time is invalid.');
  const { expected, statement } = normalized;
  const common = {
    format: VERIFICATION_ATTESTATION_CLAIMS_FORMAT,
    version: VERIFICATION_ATTESTATION_CLAIMS_VERSION,
    issuer: expected.issuer,
    audience: expected.audience,
    subject: expected.subject,
    nonce: expected.nonce,
    issuedAt,
    notBefore,
    expiresAt,
    policyGeneration: expected.policyGeneration,
    statementDigest: normalized.statementDigest,
    candidateDigest: statement.candidateDigest,
    evidenceCoreDigest: statement.evidenceCoreDigest,
    artifactSetDigest: normalized.artifactSetDigest,
    projectId: statement.projectId,
    workspaceId: statement.workspaceId,
    workspaceRevision: statement.workspaceRevision,
    executableSnapshotDigest: statement.executableSnapshotDigest,
    planDigest: statement.planDigest,
    cellId: statement.cellId,
    checkId: statement.checkId,
    checkKind: statement.checkKind,
    targetId: statement.targetId,
    targetPolicyDigest: statement.targetPolicyDigest,
    attemptId: statement.attemptId,
    producerDigest: normalized.producerDigest,
    executionDigest: digestVerificationValue(statement.execution),
    toolchainDigest: statement.toolchainDigest,
    normalizationDigest: statement.normalizationDigest,
  };
  if (expected.trust === 'ci-attested') {
    if (statement.producer.origin !== 'ci')
      throw new TypeError('Verification attestation expectation is invalid.');
    return Object.freeze({
      ...common,
      trust: expected.trust,
      ci: statement.producer.ci,
    });
  }
  return Object.freeze({ ...common, trust: expected.trust });
};

export const createVerificationAttestationClaimsDigest = (
  claims: VerificationAttestationClaimSet
): string => digestVerificationValue(claims);

/**
 * Hashes the exact canonical proof bytes verified by the adapter. Transport
 * encodings must be decoded before they cross this boundary.
 */
export const createVerificationAttestationProofDigest = (
  proof: Uint8Array
): string => `sha256-${bytesToHex(sha256(proof))}`;

export const createVerificationAttestationPresentationDigest = (
  input: Readonly<{
    algorithm: string;
    keyId: string;
    claimsDigest: string;
    proofDigest: string;
  }>
): string =>
  digestVerificationValue(
    Object.freeze({
      format: VERIFICATION_ATTESTATION_PRESENTATION_FORMAT,
      version: VERIFICATION_ATTESTATION_PRESENTATION_VERSION,
      algorithm: input.algorithm,
      keyId: input.keyId,
      claimsDigest: input.claimsDigest,
      proofDigest: input.proofDigest,
    })
  );

const requiredClaimKeys = Object.freeze([
  'format',
  'version',
  'trust',
  'issuer',
  'audience',
  'subject',
  'nonce',
  'issuedAt',
  'notBefore',
  'expiresAt',
  'policyGeneration',
  'statementDigest',
  'candidateDigest',
  'evidenceCoreDigest',
  'artifactSetDigest',
  'projectId',
  'workspaceId',
  'workspaceRevision',
  'executableSnapshotDigest',
  'planDigest',
  'cellId',
  'checkId',
  'checkKind',
  'targetId',
  'targetPolicyDigest',
  'attemptId',
  'producerDigest',
  'executionDigest',
  'toolchainDigest',
  'normalizationDigest',
] as const);

const optionalClaimKeys = Object.freeze(['ci'] as const);

const requiredVerifiedKeys = Object.freeze([
  ...requiredClaimKeys,
  'claimsDigest',
  'proofDigest',
  'algorithm',
  'keyId',
  'verifierId',
  'verifierVersion',
  'verifiedAt',
]);

const readClaimSet = (
  value: unknown
): VerificationAttestationClaimSet | undefined => {
  const record = exactVerificationAttestationRecord(
    value,
    requiredClaimKeys,
    optionalClaimKeys
  );
  if (
    !record ||
    record.format !== VERIFICATION_ATTESTATION_CLAIMS_FORMAT ||
    record.version !== VERIFICATION_ATTESTATION_CLAIMS_VERSION ||
    (record.trust !== 'remote-attested' && record.trust !== 'ci-attested')
  )
    return undefined;
  const issuer = canonicalText(record.issuer);
  const audience = canonicalText(record.audience);
  const subject = canonicalText(record.subject);
  const nonce = canonicalText(record.nonce);
  const issuedAt =
    typeof record.issuedAt === 'string' &&
    parseVerificationInstant(record.issuedAt) !== undefined
      ? record.issuedAt
      : undefined;
  const notBefore =
    typeof record.notBefore === 'string' &&
    parseVerificationInstant(record.notBefore) !== undefined
      ? record.notBefore
      : undefined;
  const expiresAt =
    typeof record.expiresAt === 'string' &&
    parseVerificationInstant(record.expiresAt) !== undefined
      ? record.expiresAt
      : undefined;
  const policyGeneration = positiveInteger(record.policyGeneration);
  const statementDigest = digest(record.statementDigest);
  const candidateDigest = digest(record.candidateDigest);
  const evidenceCoreDigest = digest(record.evidenceCoreDigest);
  const artifactSetDigest = digest(record.artifactSetDigest);
  const projectId = identifier(record.projectId);
  const workspaceId = identifier(record.workspaceId);
  const workspaceRevision = nonnegativeInteger(record.workspaceRevision);
  const executableSnapshotDigest = digest(record.executableSnapshotDigest);
  const planDigest = digest(record.planDigest);
  const cellId = identifier(record.cellId);
  const checkId = identifier(record.checkId);
  const checkKind = enumText<VerificationAttestationClaimSet['checkKind']>(
    record.checkKind,
    checkKinds
  );
  const targetId = identifier(record.targetId);
  const targetPolicyDigest = digest(record.targetPolicyDigest);
  const attemptId = identifier(record.attemptId);
  const producerDigest = digest(record.producerDigest);
  const executionDigest = digest(record.executionDigest);
  const toolchainDigest = digest(record.toolchainDigest);
  const normalizationDigest = digest(record.normalizationDigest);
  const ci =
    record.ci === undefined
      ? undefined
      : normalizeVerificationCiIdentity(record.ci);
  if (
    !issuer ||
    !audience ||
    !subject ||
    !nonce ||
    !issuedAt ||
    !notBefore ||
    !expiresAt ||
    policyGeneration === undefined ||
    !statementDigest ||
    !candidateDigest ||
    !evidenceCoreDigest ||
    !artifactSetDigest ||
    !projectId ||
    !workspaceId ||
    workspaceRevision === undefined ||
    !executableSnapshotDigest ||
    !planDigest ||
    !cellId ||
    !checkId ||
    !checkKind ||
    !targetId ||
    !targetPolicyDigest ||
    !attemptId ||
    !producerDigest ||
    !executionDigest ||
    !toolchainDigest ||
    !normalizationDigest ||
    (record.trust === 'ci-attested') !== Boolean(ci)
  )
    return undefined;
  const common = {
    format: VERIFICATION_ATTESTATION_CLAIMS_FORMAT,
    version: VERIFICATION_ATTESTATION_CLAIMS_VERSION,
    issuer,
    audience,
    subject,
    nonce,
    issuedAt,
    notBefore,
    expiresAt,
    policyGeneration,
    statementDigest,
    candidateDigest,
    evidenceCoreDigest,
    artifactSetDigest,
    projectId,
    workspaceId,
    workspaceRevision,
    executableSnapshotDigest,
    planDigest,
    cellId,
    checkId,
    checkKind,
    targetId,
    targetPolicyDigest,
    attemptId,
    producerDigest,
    executionDigest,
    toolchainDigest,
    normalizationDigest,
  };
  return record.trust === 'ci-attested'
    ? Object.freeze({ ...common, trust: record.trust, ci: ci! })
    : Object.freeze({ ...common, trust: record.trust });
};

const projectClaimRecord = (
  record: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> =>
  Object.freeze(
    Object.fromEntries([
      ...requiredClaimKeys.map((key) => [key, record[key]] as const),
      ...(Object.hasOwn(record, 'ci') ? ([['ci', record.ci]] as const) : []),
    ])
  );

export const readVerificationAttestationVerifierClaims = (
  value: unknown
): VerificationAttestationVerifierClaims | undefined => {
  const record = exactVerificationAttestationRecord(
    value,
    requiredVerifiedKeys,
    optionalClaimKeys
  );
  if (!record) return undefined;
  const claims = readClaimSet(projectClaimRecord(record));
  const claimsDigest = digest(record.claimsDigest);
  const proofDigest = digest(record.proofDigest);
  const algorithm = identifier(record.algorithm);
  const keyId = identifier(record.keyId);
  const verifierId = identifier(record.verifierId);
  const verifierVersion = identifier(record.verifierVersion);
  const verifiedAt =
    typeof record.verifiedAt === 'string' &&
    parseVerificationInstant(record.verifiedAt) !== undefined
      ? record.verifiedAt
      : undefined;
  if (
    !claims ||
    !claimsDigest ||
    !proofDigest ||
    !algorithm ||
    !keyId ||
    !verifierId ||
    !verifierVersion ||
    !verifiedAt ||
    claimsDigest !== createVerificationAttestationClaimsDigest(claims)
  )
    return undefined;
  return Object.freeze({
    ...claims,
    claimsDigest,
    proofDigest,
    algorithm,
    keyId,
    verifierId,
    verifierVersion,
    verifiedAt,
  });
};

export const matchesVerificationAttestationExpectedClaims = (
  claims: VerificationAttestationVerifierClaims,
  normalized: NormalizedVerificationAttestationExpectation
): boolean => {
  const expectedClaims = createVerificationAttestationClaimSet({
    expected: normalized.expected,
    issuedAt: claims.issuedAt,
    notBefore: claims.notBefore,
    expiresAt: claims.expiresAt,
  });
  const issuedAt = parseVerificationInstant(claims.issuedAt)!;
  const notBefore = parseVerificationInstant(claims.notBefore)!;
  const expiresAt = parseVerificationInstant(claims.expiresAt)!;
  const returnedClaimSet = readClaimSet(
    projectClaimRecord(claims as unknown as Readonly<Record<string, unknown>>)
  );
  return (
    returnedClaimSet !== undefined &&
    utf8ToBytes(canonicalJsonText(claims)).byteLength <= 64 * 1_024 &&
    canonicalJsonText(returnedClaimSet) === canonicalJsonText(expectedClaims) &&
    claims.verifiedAt === normalized.expected.verificationInstant &&
    issuedAt <= notBefore &&
    issuedAt <= normalized.verificationInstant &&
    notBefore <= normalized.verificationInstant &&
    normalized.verificationInstant < expiresAt &&
    expiresAt - issuedAt <= normalized.expected.maximumLifetimeMs
  );
};

export const projectVerificationVerifiedClaims = (
  claims: VerificationAttestationVerifierClaims
): VerificationVerifiedClaims => {
  const nonceDigest = digestVerificationValue(
    Object.freeze({
      format: 'prodivix.verification-attestation-nonce',
      version: 1,
      nonce: claims.nonce,
    })
  );
  const replayKey = digestVerificationValue(
    Object.freeze({
      format: 'prodivix.verification-attestation-replay-key',
      version: 1,
      issuer: claims.issuer,
      audience: claims.audience,
      nonceDigest,
    })
  );
  const common = {
    issuer: claims.issuer,
    audience: claims.audience,
    subject: claims.subject,
    keyId: claims.keyId,
    algorithm: claims.algorithm,
    issuedAt: claims.issuedAt,
    notBefore: claims.notBefore,
    expiresAt: claims.expiresAt,
    nonceDigest,
    replayKey,
    claimsDigest: claims.claimsDigest,
    proofDigest: claims.proofDigest,
    attestationDigest: createVerificationAttestationPresentationDigest({
      algorithm: claims.algorithm,
      keyId: claims.keyId,
      claimsDigest: claims.claimsDigest,
      proofDigest: claims.proofDigest,
    }),
    verifierId: claims.verifierId,
    verifierVersion: claims.verifierVersion,
    verifiedAt: claims.verifiedAt,
    policyGeneration: claims.policyGeneration,
    statementDigest: claims.statementDigest,
    candidateDigest: claims.candidateDigest,
    evidenceCoreDigest: claims.evidenceCoreDigest,
    artifactSetDigest: claims.artifactSetDigest,
    projectId: claims.projectId,
    workspaceId: claims.workspaceId,
    workspaceRevision: claims.workspaceRevision,
    executableSnapshotDigest: claims.executableSnapshotDigest,
    planDigest: claims.planDigest,
    cellId: claims.cellId,
    checkId: claims.checkId,
    checkKind: claims.checkKind,
    targetId: claims.targetId,
    targetPolicyDigest: claims.targetPolicyDigest,
    attemptId: claims.attemptId,
    producerDigest: claims.producerDigest,
    executionDigest: claims.executionDigest,
    toolchainDigest: claims.toolchainDigest,
    normalizationDigest: claims.normalizationDigest,
  };
  return claims.trust === 'ci-attested'
    ? Object.freeze({ ...common, trust: claims.trust, ci: claims.ci })
    : Object.freeze({ ...common, trust: claims.trust });
};
