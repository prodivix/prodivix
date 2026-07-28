import { utf8ToBytes } from '@noble/hashes/utils.js';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  digestVerificationValue,
  parseVerificationInstant,
  uniqueVerificationText,
} from './verificationCanonical';
import { validateVerificationEvidenceCandidate } from './verificationEvidenceCandidateCodec';
import { sourceTraces as normalizeVerificationEvidenceSourceTraces } from './verificationEvidenceCandidateSourceTrace';
import { isVerificationEvidenceUnicodeScalarText } from './verificationEvidenceCodec.primitives';
import type {
  VerificationCheckReportCandidate,
  VerificationEvidenceCandidate,
  VerificationEvidenceCandidateArtifact,
  VerificationEvidenceCandidateIssue,
  VerificationEvidenceCandidateProvenance,
  VerificationEvidenceCandidateResult,
  VerificationEvidenceSourceTrace,
  VerificationImplementationIdentity,
  VerificationJsonValue,
  VerificationPlan,
  VerificationRunContext,
} from './verification.types';

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const ARTIFACT_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const MAXIMUM_REPORT_DEPTH = 32;
const MAXIMUM_REPORT_NODES = 16_384;
const MAXIMUM_REPORT_BYTES = 512 * 1024;
const MAXIMUM_REPORT_STRING_BYTES = 64 * 1024;
const MAXIMUM_REPORT_OBJECT_KEYS = 2_048;

type ReportState = {
  nodes: number;
  objectKeys: number;
};

const issue = (
  code: VerificationEvidenceCandidateIssue['code'],
  path: string,
  message: string
): VerificationEvidenceCandidateIssue => Object.freeze({ code, path, message });

const isCanonicalString = (value: string): boolean =>
  isVerificationEvidenceUnicodeScalarText(value) &&
  value === value.normalize('NFC');

const normalizeReportValue = (
  value: unknown,
  path: string,
  depth: number,
  state: ReportState,
  issues: VerificationEvidenceCandidateIssue[]
): VerificationJsonValue | undefined => {
  state.nodes += 1;
  if (depth > MAXIMUM_REPORT_DEPTH || state.nodes > MAXIMUM_REPORT_NODES) {
    issues.push(
      issue('VER-4002', path, 'The normalized report exceeds its shape budget.')
    );
    return undefined;
  }
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (
      !Number.isFinite(value) ||
      (Number.isInteger(value) && !Number.isSafeInteger(value))
    ) {
      issues.push(
        issue(
          'VER-4002',
          path,
          'The normalized report contains a non-finite or unsafe integer.'
        )
      );
      return undefined;
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === 'string') {
    if (
      !isCanonicalString(value) ||
      utf8ToBytes(value).byteLength > MAXIMUM_REPORT_STRING_BYTES
    ) {
      issues.push(
        issue(
          'VER-4002',
          path,
          'The normalized report string is non-canonical or over budget.'
        )
      );
      return undefined;
    }
    return value;
  }
  if (Array.isArray(value)) {
    const normalized: VerificationJsonValue[] = [];
    value.forEach((entry, index) => {
      const result = normalizeReportValue(
        entry,
        `${path}/${index}`,
        depth + 1,
        state,
        issues
      );
      if (result !== undefined) normalized.push(result);
    });
    return Object.freeze(normalized);
  }
  if (!isPlainObject(value)) {
    issues.push(
      issue(
        'VER-4002',
        path,
        'The normalized report must contain only plain JSON values.'
      )
    );
    return undefined;
  }
  const keys = Object.keys(value).sort(compareUnicodeCodePoints);
  state.objectKeys += keys.length;
  if (
    state.objectKeys > MAXIMUM_REPORT_OBJECT_KEYS ||
    keys.some(
      (key) =>
        !isCanonicalString(key) ||
        isUnsafeObjectKey(key) ||
        utf8ToBytes(key).byteLength > 512
    )
  ) {
    issues.push(
      issue(
        'VER-4002',
        path,
        'The normalized report contains unsafe, non-canonical, or excessive object keys.'
      )
    );
    return undefined;
  }
  const normalized: Record<string, VerificationJsonValue> = Object.create(
    null
  ) as Record<string, VerificationJsonValue>;
  for (const key of keys) {
    const result = normalizeReportValue(
      value[key],
      `${path}/${key}`,
      depth + 1,
      state,
      issues
    );
    if (result !== undefined) normalized[key] = result;
  }
  return Object.freeze(normalized);
};

const canonicalArtifactPath = (value: string): boolean => {
  if (
    value.length < 1 ||
    value.length > 512 ||
    value.includes('\\') ||
    value.startsWith('/') ||
    value.endsWith('/') ||
    value.includes('\0') ||
    !isCanonicalString(value)
  ) {
    return false;
  }
  const segments = value.split('/');
  return (
    segments.length <= 16 &&
    segments.every(
      (segment) =>
        segment !== '.' &&
        segment !== '..' &&
        ARTIFACT_PATH_SEGMENT_PATTERN.test(segment)
    )
  );
};

const canonicalArtifact = (
  artifact: VerificationEvidenceCandidateArtifact
): VerificationEvidenceCandidateArtifact =>
  Object.freeze({
    id: artifact.id,
    path: artifact.path,
    stagingArtifactId: artifact.stagingArtifactId,
    kind: artifact.kind,
    expectedDigest: artifact.expectedDigest,
    expectedSize: artifact.expectedSize,
    expectedMediaType: artifact.expectedMediaType,
    ...(artifact.sourceTraceDigest
      ? { sourceTraceDigest: artifact.sourceTraceDigest }
      : {}),
  });

const validateArtifactDescriptors = (
  report: VerificationCheckReportCandidate,
  artifacts: readonly VerificationEvidenceCandidateArtifact[],
  issues: VerificationEvidenceCandidateIssue[]
): readonly VerificationEvidenceCandidateArtifact[] => {
  if (artifacts.length > 128) {
    issues.push(
      issue('VER-4002', '/artifacts', 'The candidate has too many artifacts.')
    );
  }
  const normalized = [...artifacts]
    .map(canonicalArtifact)
    .sort((left, right) => compareUnicodeCodePoints(left.id, right.id));
  const identities = [
    ['id', normalized.map(({ id }) => id)],
    ['path', normalized.map(({ path }) => path)],
    [
      'stagingArtifactId',
      normalized.map(({ stagingArtifactId }) => stagingArtifactId),
    ],
  ] as const;
  for (const [label, values] of identities) {
    if (new Set(values).size !== values.length) {
      issues.push(
        issue(
          'VER-4002',
          '/artifacts',
          `Candidate artifact ${label} values must be unique.`
        )
      );
    }
  }
  normalized.forEach((artifact, index) => {
    const path = `/artifacts/${index}`;
    if (
      !ID_PATTERN.test(artifact.id) ||
      !ID_PATTERN.test(artifact.stagingArtifactId) ||
      !canonicalArtifactPath(artifact.path) ||
      !DIGEST_PATTERN.test(artifact.expectedDigest) ||
      !Number.isSafeInteger(artifact.expectedSize) ||
      artifact.expectedSize < 0 ||
      artifact.expectedSize > 512 * 1024 * 1024 ||
      artifact.expectedMediaType !==
        artifact.expectedMediaType.trim().toLowerCase() ||
      !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u.test(
        artifact.expectedMediaType
      ) ||
      (artifact.sourceTraceDigest !== undefined &&
        !DIGEST_PATTERN.test(artifact.sourceTraceDigest))
    ) {
      issues.push(
        issue(
          'VER-4002',
          path,
          'Candidate artifact identity, path, digest, size, or media type is invalid.'
        )
      );
    }
  });
  const reportById = new Map(
    report.artifacts.map((artifact) => [artifact.id, artifact])
  );
  if (
    reportById.size !== report.artifacts.length ||
    report.artifacts.length !== normalized.length
  ) {
    issues.push(
      issue(
        'VER-5001',
        '/artifacts',
        'Adapter and staged artifact identities do not form a one-to-one set.'
      )
    );
  }
  for (const artifact of normalized) {
    const claimed = reportById.get(artifact.id);
    if (
      !claimed ||
      claimed.kind !== artifact.kind ||
      claimed.digest !== artifact.expectedDigest ||
      claimed.size !== artifact.expectedSize ||
      claimed.mediaType !== artifact.expectedMediaType
    ) {
      issues.push(
        issue(
          'VER-5001',
          `/artifacts/${artifact.id}`,
          'Adapter and staged artifact descriptors do not match exactly.'
        )
      );
    }
  }
  return Object.freeze(normalized);
};

export type NormalizeVerificationCheckReportInput = Readonly<{
  projectId: string;
  plan: VerificationPlan;
  cellId: string;
  context: Omit<VerificationRunContext, 'abortSignal'>;
  report: VerificationCheckReportCandidate;
  scenario?: Readonly<{
    id: string;
    revision: number;
    digest: string;
    programDigest: string;
  }>;
  run: Readonly<{
    runId: string;
    providerId: string;
    jobId?: string;
    sessionId?: string;
    parentAttemptId?: string;
    runtimeZone: string;
    operatingSystemIdentity?: string;
    devicePixelRatio: number;
    timezone: string;
    fontSetDigest: string;
    sandboxImageDigest?: string;
  }>;
  timing: Readonly<{
    startedAt: string;
    completedAt: string;
    durationMs: number;
  }>;
  toolchain: VerificationImplementationIdentity;
  normalization: VerificationImplementationIdentity;
  appliedControlDigest: string;
  artifacts: readonly VerificationEvidenceCandidateArtifact[];
  sourceTraces: readonly VerificationEvidenceSourceTrace[];
  dependencyLockDigest: string;
  provenance: VerificationEvidenceCandidateProvenance;
  redaction: Readonly<{
    policyId: string;
    scannerSetDigest: string;
    droppedFieldCounts: Readonly<Record<string, number>>;
    safe: true;
  }>;
  promotion: Readonly<{
    idempotencyKey: string;
    deadline: string;
  }>;
}>;

const invalidInput = (
  path: string,
  message: string,
  issues: VerificationEvidenceCandidateIssue[]
): void => {
  issues.push(issue('VER-5001', path, message));
};

/**
 * Converts the bounded adapter report into the only candidate shape accepted by
 * Evidence intake. Adapters cannot choose trust, retention escalation, Plan
 * identity, or canonical result bytes.
 */
export const normalizeVerificationCheckReport = (
  input: NormalizeVerificationCheckReportInput
): VerificationEvidenceCandidateResult => {
  const issues: VerificationEvidenceCandidateIssue[] = [];
  const { planDigest, ...planWithoutDigest } = input.plan;
  if (digestVerificationValue(planWithoutDigest) !== planDigest) {
    invalidInput(
      '/plan/planDigest',
      'The VerificationPlan digest does not match its canonical content.',
      issues
    );
  }
  const cell = input.plan.cells.find(({ id }) => id === input.cellId);
  if (
    !cell ||
    input.plan.cells.filter(({ id }) => id === input.cellId).length !== 1
  ) {
    return Object.freeze({
      status: 'invalid',
      issues: Object.freeze([
        issue(
          'VER-5001',
          '/cellId',
          'The candidate cell is not unique in the Plan.'
        ),
      ]),
    });
  }
  if (input.plan.status !== 'ready' || cell.preflight.status !== 'supported') {
    invalidInput(
      '/cellId',
      'Only a supported cell from a ready Plan can produce Evidence.',
      issues
    );
  }
  if (
    cell.targetPolicy.authority !== 'verification-policy' ||
    cell.targetPolicy.policyDigest !== input.plan.policyDigest ||
    cell.targetPolicy.semanticTargetId !== cell.targetId
  ) {
    invalidInput(
      '/cellId/targetPolicy',
      'The Plan cell target policy is not bound to its Policy and semantic target.',
      issues
    );
  }
  if (
    input.report.cellId !== cell.id ||
    input.report.attemptId !== input.context.attemptId ||
    input.report.normalizedInputDigest !== cell.inputDigest
  ) {
    invalidInput(
      '/report',
      'The adapter report does not match the exact cell, attempt, or input digest.',
      issues
    );
  }
  if (
    input.context.cell.id !== cell.id ||
    input.context.executableSnapshotDigest !==
      input.context.executableSnapshotDigest.trim() ||
    input.context.controlProfileDigest !==
      input.context.controlProfileDigest.trim()
  ) {
    invalidInput(
      '/context',
      'The run context does not match the selected Plan cell.',
      issues
    );
  }
  if (
    input.toolchain.toolchainDigest !== cell.adapter.toolchainDigest ||
    input.provenance.providerId !== input.run.providerId
  ) {
    invalidInput(
      '/toolchain',
      'Toolchain or provider identity drifted from the Plan/run context.',
      issues
    );
  }
  if (
    cell.controlProfileRef.digest !== undefined &&
    cell.controlProfileRef.digest !== input.context.controlProfileDigest
  ) {
    invalidInput(
      '/controls/profileDigest',
      'The control profile digest drifted from the Plan cell.',
      issues
    );
  }
  const fixtureSetDigests = uniqueVerificationText(
    input.context.fixtureSetDigests
  );
  const expectedFixtureSetDigests = cell.fixtureSetRef?.digest
    ? [cell.fixtureSetRef.digest]
    : [];
  if (
    canonicalJsonText(fixtureSetDigests) !==
      canonicalJsonText(expectedFixtureSetDigests) ||
    input.context.baselineSetDigest !== cell.baselineSetRef?.digest
  ) {
    invalidInput(
      '/inputs',
      'Fixture or baseline identity drifted from the Plan cell.',
      issues
    );
  }
  if (
    cell.scenarioId === undefined
      ? input.scenario !== undefined ||
        input.context.scenarioProgramDigest !== undefined
      : input.scenario?.id !== cell.scenarioId ||
        input.scenario.programDigest !== input.context.scenarioProgramDigest
  ) {
    invalidInput(
      '/scenario',
      'Scenario identity or Program digest drifted from the Plan cell.',
      issues
    );
  }
  const startedAt = parseVerificationInstant(input.timing.startedAt);
  const completedAt = parseVerificationInstant(input.timing.completedAt);
  const issuedAt = parseVerificationInstant(input.provenance.issuedAt);
  const expiresAt = input.provenance.expiresAt
    ? parseVerificationInstant(input.provenance.expiresAt)
    : undefined;
  const deadline = parseVerificationInstant(input.promotion.deadline);
  if (
    startedAt === undefined ||
    completedAt === undefined ||
    issuedAt === undefined ||
    deadline === undefined ||
    completedAt < startedAt ||
    issuedAt < completedAt ||
    deadline <= completedAt ||
    input.timing.durationMs !== completedAt - startedAt ||
    (input.provenance.expiresAt !== undefined &&
      (expiresAt === undefined || expiresAt <= issuedAt))
  ) {
    invalidInput(
      '/timing',
      'Run, provenance, expiry, or promotion instants are invalid.',
      issues
    );
  }
  const report = normalizeReportValue(
    input.report.report,
    '/result/summary',
    0,
    { nodes: 0, objectKeys: 0 },
    issues
  );
  if (
    report !== undefined &&
    utf8ToBytes(canonicalJsonText(report)).byteLength > MAXIMUM_REPORT_BYTES
  ) {
    issues.push(
      issue(
        'VER-4002',
        '/result/summary',
        'The normalized report is over budget.'
      )
    );
  }
  const artifacts = validateArtifactDescriptors(
    input.report,
    input.artifacts,
    issues
  );
  const sourceTraces = normalizeVerificationEvidenceSourceTraces(
    input.sourceTraces,
    '/sourceTraces',
    issues
  );
  if (sourceTraces) {
    const sourceTraceDigests = new Set(
      sourceTraces.map((trace) => digestVerificationValue(trace))
    );
    artifacts.forEach((artifact, index) => {
      if (
        artifact.sourceTraceDigest !== undefined &&
        !sourceTraceDigests.has(artifact.sourceTraceDigest)
      ) {
        issues.push(
          issue(
            'VER-5001',
            `/artifacts/${index}/sourceTraceDigest`,
            'The artifact source trace digest does not identify one canonical source trace.'
          )
        );
      }
    });
  }
  if (issues.length > 0 || report === undefined || !sourceTraces) {
    return Object.freeze({
      status: 'invalid',
      issues: Object.freeze(issues),
    });
  }
  const diagnosticCodes = uniqueVerificationText(input.report.diagnosticCodes);
  const normalizedResultWithoutDigest = Object.freeze({
    outcome: input.report.outcome,
    summary: report,
    diagnosticCodes,
    appliedExemptionIds: Object.freeze([...cell.appliedExemptionIds]),
  });
  const normalizedResultDigest = digestVerificationValue(
    normalizedResultWithoutDigest
  );
  const droppedFieldCounts = Object.freeze(
    Object.fromEntries(
      Object.entries(input.redaction.droppedFieldCounts).sort(
        ([left], [right]) => compareUnicodeCodePoints(left, right)
      )
    )
  );
  const candidateWithoutDigest = Object.freeze({
    candidateId: input.report.candidateId,
    projectId: input.projectId,
    workspaceId: input.plan.workspaceId,
    workspaceRevision: input.plan.targetRevision,
    partitionRevisions: input.plan.targetPartitionRevisions,
    executableSnapshotDigest: input.context.executableSnapshotDigest,
    ...(input.scenario
      ? { scenario: Object.freeze({ ...input.scenario }) }
      : {}),
    policyRevision: input.plan.policyRevision,
    policyDigest: input.plan.policyDigest,
    impactDigest: input.plan.impactDigest,
    planDigest: input.plan.planDigest,
    policyEvaluationInstant: input.plan.policyEvaluationInstant,
    cellId: cell.id,
    checkId: cell.checkId,
    checkKind: cell.checkKind,
    targetId: cell.targetId,
    attemptId: input.context.attemptId,
    run: Object.freeze({
      runId: input.run.runId,
      providerId: input.run.providerId,
      ...(input.run.jobId ? { jobId: input.run.jobId } : {}),
      ...(input.run.sessionId ? { sessionId: input.run.sessionId } : {}),
      ...(input.run.parentAttemptId
        ? { parentAttemptId: input.run.parentAttemptId }
        : {}),
      surface: cell.surface,
      frameworkTarget: cell.frameworkTarget,
      runtimeZone: input.run.runtimeZone,
      ...(cell.browserEngine ? { browserEngine: cell.browserEngine } : {}),
      ...(input.run.operatingSystemIdentity
        ? {
            operatingSystemIdentity: input.run.operatingSystemIdentity,
          }
        : {}),
      viewport: Object.freeze({ ...cell.viewport }),
      devicePixelRatio: input.run.devicePixelRatio,
      colorScheme: cell.colorScheme,
      motion: cell.motion,
      locale: cell.locale,
      timezone: input.run.timezone,
      fontSetDigest: input.run.fontSetDigest,
      ...(input.run.sandboxImageDigest
        ? { sandboxImageDigest: input.run.sandboxImageDigest }
        : {}),
    }),
    timing: Object.freeze({ ...input.timing }),
    result: Object.freeze({
      ...normalizedResultWithoutDigest,
      normalizedResultDigest,
    }),
    provenance: Object.freeze({ ...input.provenance }),
    toolchain: Object.freeze({ ...input.toolchain }),
    normalization: Object.freeze({ ...input.normalization }),
    controls: Object.freeze({
      profileDigest: input.context.controlProfileDigest,
      appliedDigest: input.appliedControlDigest,
    }),
    inputs: Object.freeze({
      executableSnapshotDigest: input.context.executableSnapshotDigest,
      ...(input.context.scenarioProgramDigest
        ? { scenarioProgramDigest: input.context.scenarioProgramDigest }
        : {}),
      fixtureSetDigests,
      ...(input.context.baselineSetDigest
        ? { baselineSetDigest: input.context.baselineSetDigest }
        : {}),
      inputDigest: input.report.normalizedInputDigest,
    }),
    artifacts,
    sourceTraces,
    sourceTraceDigest: digestVerificationValue(sourceTraces),
    dependencyLockDigest: input.dependencyLockDigest,
    redaction: Object.freeze({
      policyId: input.redaction.policyId,
      scannerSetDigest: input.redaction.scannerSetDigest,
      droppedFieldCounts,
      targetPolicy: Object.freeze({ ...cell.targetPolicy }),
      safe: true as const,
    }),
    requestedRetention:
      input.report.outcome === 'passed'
        ? input.plan.retentionRequest.successful
        : input.plan.retentionRequest.failed,
    promotion: Object.freeze({ ...input.promotion }),
  });
  const candidate: VerificationEvidenceCandidate = Object.freeze({
    ...candidateWithoutDigest,
    candidateDigest: digestVerificationValue(candidateWithoutDigest),
  });
  return validateVerificationEvidenceCandidate(candidate);
};
