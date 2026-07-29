import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  digestVerificationValue,
  parseVerificationInstant,
  uniqueVerificationText,
} from './verificationCanonical';
import { matchVerificationAdapterRegistryEntry } from './verificationAdapterRegistry';
import { createVerificationAdapterInputDigest } from './verificationAdapterInputDigest';
import { normalizeVerificationCheckReportCandidate } from './verificationCheckReportNormalization';
import {
  normalizeVerificationArtifactSecretCanaries,
  scanVerificationArtifactSensitiveText,
} from './verificationArtifactSensitive';
import { validateVerificationEvidenceCandidate } from './verificationEvidenceCandidateCodec';
import { sourceTraces as normalizeVerificationEvidenceSourceTraces } from './verificationEvidenceCandidateSourceTrace';
import { isVerificationEvidenceUnicodeScalarText } from './verificationEvidenceCodec.primitives';
import type { VerificationCheckReportCandidate } from './verificationCheckReport.types';
import type {
  VerificationAdapterInputRef,
  VerificationAdapterStagedArtifactRef,
} from './verificationAdapterRuntime.types';
import type {
  VerificationAdapterRegistrySnapshot,
  VerificationEvidenceCandidate,
  VerificationEvidenceCandidateArtifact,
  VerificationEvidenceCandidateArtifactMetadata,
  VerificationEvidenceCandidateIssue,
  VerificationEvidenceCandidateProvenance,
  VerificationEvidenceCandidateResult,
  VerificationEvidenceSourceTrace,
  VerificationImplementationIdentity,
  VerificationPlan,
} from './verification.types';

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const ARTIFACT_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

const issue = (
  code: VerificationEvidenceCandidateIssue['code'],
  path: string,
  message: string
): VerificationEvidenceCandidateIssue => Object.freeze({ code, path, message });

const isCanonicalString = (value: string): boolean =>
  isVerificationEvidenceUnicodeScalarText(value) &&
  value === value.normalize('NFC');

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

const canonicalArtifactMetadata = (
  artifact: VerificationEvidenceCandidateArtifactMetadata
): VerificationEvidenceCandidateArtifactMetadata =>
  Object.freeze({
    id: artifact.id,
    path: artifact.path,
    ...(artifact.sourceTraceDigest
      ? { sourceTraceDigest: artifact.sourceTraceDigest }
      : {}),
  });

export const VERIFICATION_CORE_NORMALIZATION_IDENTITY: VerificationImplementationIdentity =
  Object.freeze({
    packageName: '@prodivix/verification',
    packageVersion: '0.0.1',
    buildDigest: digestVerificationValue({
      owner: '@prodivix/verification',
      normalizer: 'verification-check-report',
      version: 1,
    }),
    toolchainDigest: digestVerificationValue({
      owner: '@prodivix/verification',
      runtime: 'transport-neutral-core',
      version: 1,
    }),
    schemaDigest: digestVerificationValue({
      schema: 'prodivix.verification-normalized-check-report.v1',
      candidateSchema: 'prodivix.verification-evidence-candidate.v1',
    }),
  });

export type VerificationEvidenceNormalizationContext = Readonly<{
  cell: VerificationPlan['cells'][number];
  attemptId: string;
  resolvedInputSetDigest: string;
  runtimeEnvironmentDigest: string;
  executableSnapshotDigest: string;
  scenarioProgramDigest?: string;
  controlProfileDigest: string;
  fixtureSetDigests: readonly string[];
  baselineSetDigest?: string;
  controlCapabilityIds: readonly string[];
  controlCapabilitySnapshotDigest: string;
  appliedControlDigest: string;
  inputRefs: readonly VerificationAdapterInputRef[];
}>;

const validateArtifactDescriptors = (
  report: VerificationCheckReportCandidate,
  artifactMetadata: readonly VerificationEvidenceCandidateArtifactMetadata[],
  stagedArtifacts: readonly VerificationAdapterStagedArtifactRef[],
  issues: VerificationEvidenceCandidateIssue[]
): readonly VerificationEvidenceCandidateArtifact[] => {
  if (artifactMetadata.length > 128 || stagedArtifacts.length > 128) {
    issues.push(
      issue('VER-4002', '/artifacts', 'The candidate has too many artifacts.')
    );
  }
  const metadata = [...artifactMetadata]
    .map(canonicalArtifactMetadata)
    .sort((left, right) => compareUnicodeCodePoints(left.id, right.id));
  const identities = [
    ['id', metadata.map(({ id }) => id)],
    ['path', metadata.map(({ path }) => path)],
    [
      'stagingArtifactId',
      stagedArtifacts.map(({ stagingArtifactId }) => stagingArtifactId),
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
  metadata.forEach((artifact, index) => {
    const path = `/artifacts/${index}`;
    if (
      !ID_PATTERN.test(artifact.id) ||
      !canonicalArtifactPath(artifact.path) ||
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
  const stagedById = new Map(
    stagedArtifacts.map((artifact) => [artifact.id, artifact])
  );
  const reportById = new Map(
    report.artifacts.map((artifact) => [artifact.id, artifact])
  );
  if (
    reportById.size !== report.artifacts.length ||
    stagedById.size !== stagedArtifacts.length ||
    report.artifacts.length !== metadata.length ||
    stagedArtifacts.length !== metadata.length
  ) {
    issues.push(
      issue(
        'VER-5001',
        '/artifacts',
        'Adapter and staged artifact identities do not form a one-to-one set.'
      )
    );
  }
  const normalized: VerificationEvidenceCandidateArtifact[] = [];
  for (const artifact of metadata) {
    const claimed = reportById.get(artifact.id);
    const staged = stagedById.get(artifact.id);
    if (
      !claimed ||
      !staged ||
      !ID_PATTERN.test(staged.stagingArtifactId) ||
      !DIGEST_PATTERN.test(staged.digest) ||
      !Number.isSafeInteger(staged.size) ||
      staged.size < 0 ||
      staged.size > 512 * 1024 * 1024 ||
      staged.mediaType !== staged.mediaType.trim().toLowerCase() ||
      !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u.test(
        staged.mediaType
      ) ||
      claimed.kind !== staged.kind ||
      claimed.digest !== staged.digest ||
      claimed.size !== staged.size ||
      claimed.mediaType !== staged.mediaType
    ) {
      issues.push(
        issue(
          'VER-5001',
          `/artifacts/${artifact.id}`,
          'Adapter and staged artifact descriptors do not match exactly.'
        )
      );
      continue;
    }
    normalized.push(
      Object.freeze({
        id: artifact.id,
        path: artifact.path,
        stagingArtifactId: staged.stagingArtifactId,
        kind: staged.kind,
        expectedDigest: staged.digest,
        expectedSize: staged.size,
        expectedMediaType: staged.mediaType,
        ...(artifact.sourceTraceDigest
          ? { sourceTraceDigest: artifact.sourceTraceDigest }
          : {}),
      })
    );
  }
  return Object.freeze(normalized);
};

export type NormalizeVerificationCheckReportInput = Readonly<{
  projectId: string;
  plan: VerificationPlan;
  adapterRegistry: VerificationAdapterRegistrySnapshot;
  cellId: string;
  context: VerificationEvidenceNormalizationContext;
  report: unknown;
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
  artifacts: readonly VerificationEvidenceCandidateArtifactMetadata[];
  stagedArtifacts: readonly VerificationAdapterStagedArtifactRef[];
  sourceTraces: readonly VerificationEvidenceSourceTrace[];
  dependencyLockDigest: string;
  provenance: VerificationEvidenceCandidateProvenance;
  redaction: Readonly<{
    policyId: string;
    scannerSetDigest: string;
    droppedFieldCounts: Readonly<Record<string, number>>;
    secretCanaries?: readonly string[];
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

const reportSourceTraceDigests = (
  payload: VerificationCheckReportCandidate['payload']
): readonly string[] => {
  switch (payload.kind) {
    case 'diagnostics':
    case 'build':
    case 'security':
      return payload.findings.flatMap(({ sourceTraceDigest }) =>
        sourceTraceDigest ? [sourceTraceDigest] : []
      );
    case 'unit':
    case 'integration':
      return payload.suites.flatMap(({ cases }) =>
        cases.flatMap(({ sourceTraceDigest }) =>
          sourceTraceDigest ? [sourceTraceDigest] : []
        )
      );
    case 'e2e':
      return payload.steps.flatMap(({ sourceTraceDigest }) =>
        sourceTraceDigest ? [sourceTraceDigest] : []
      );
    case 'visual':
      return payload.comparisons.flatMap(({ sourceTraceDigest }) =>
        sourceTraceDigest ? [sourceTraceDigest] : []
      );
    case 'accessibility':
      return [...payload.findings, ...payload.journeys].flatMap(
        ({ sourceTraceDigest }) =>
          sourceTraceDigest ? [sourceTraceDigest] : []
      );
    case 'performance':
      return [];
  }
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
  const normalizedCheckReport = normalizeVerificationCheckReportCandidate(
    input.report
  );
  if (normalizedCheckReport.status === 'invalid') {
    return Object.freeze({
      status: 'invalid',
      issues: Object.freeze(
        normalizedCheckReport.issues.map((entry) =>
          issue(
            entry.code === 'VER-5002' ? 'VER-5002' : 'VER-4002',
            `/report${entry.path}`,
            entry.message
          )
        )
      ),
    });
  }
  const reportCandidate = normalizedCheckReport.candidate;
  const normalizedReport = normalizedCheckReport.report;
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
  let registryEntry:
    VerificationAdapterRegistrySnapshot['entries'][number] | undefined;
  try {
    if (
      input.adapterRegistry.snapshotDigest !== input.plan.adapterRegistryDigest
    ) {
      invalidInput(
        '/adapterRegistry/snapshotDigest',
        'The adapter registry snapshot does not match the Plan.',
        issues
      );
    } else {
      registryEntry = matchVerificationAdapterRegistryEntry(
        input.adapterRegistry,
        cell.adapter
      );
      if (!registryEntry) {
        invalidInput(
          '/adapterRegistry',
          'The Plan cell adapter identity is absent or drifted in the registry snapshot.',
          issues
        );
      }
    }
  } catch {
    invalidInput(
      '/adapterRegistry',
      'The adapter registry snapshot is malformed or non-canonical.',
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
    reportCandidate.cellId !== cell.id ||
    reportCandidate.attemptId !== input.context.attemptId ||
    reportCandidate.checkKind !== cell.checkKind ||
    reportCandidate.inputDigest !== cell.inputDigest ||
    !sameCanonicalJson(reportCandidate.adapter, cell.adapter) ||
    (registryEntry !== undefined &&
      !sameCanonicalJson(reportCandidate.tool, registryEntry.tool))
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
  if (input.provenance.providerId !== input.run.providerId) {
    invalidInput(
      '/provenance/providerId',
      'Provider identity drifted from the run context.',
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
  if (!DIGEST_PATTERN.test(input.context.appliedControlDigest)) {
    invalidInput(
      '/controls/appliedDigest',
      'The Core-applied control digest is invalid.',
      issues
    );
  }
  let recomputedResolvedInputSetDigest: string | undefined;
  try {
    recomputedResolvedInputSetDigest = createVerificationAdapterInputDigest({
      runtimeEnvironmentDigest: input.context.runtimeEnvironmentDigest,
      executableSnapshotDigest: input.context.executableSnapshotDigest,
      ...(input.context.scenarioProgramDigest === undefined
        ? {}
        : { scenarioProgramDigest: input.context.scenarioProgramDigest }),
      controlProfileDigest: input.context.controlProfileDigest,
      fixtureSetDigests: input.context.fixtureSetDigests,
      ...(input.context.baselineSetDigest === undefined
        ? {}
        : { baselineSetDigest: input.context.baselineSetDigest }),
      controlCapabilityIds: input.context.controlCapabilityIds,
      controlCapabilitySnapshotDigest:
        input.context.controlCapabilitySnapshotDigest,
      appliedControlDigest: input.context.appliedControlDigest,
      inputRefs: input.context.inputRefs,
    });
  } catch {
    invalidInput(
      '/context/resolvedInputSetDigest',
      'The resolved adapter input set is malformed.',
      issues
    );
  }
  if (
    recomputedResolvedInputSetDigest !== undefined &&
    recomputedResolvedInputSetDigest !== input.context.resolvedInputSetDigest
  ) {
    invalidInput(
      '/context/resolvedInputSetDigest',
      'The resolved adapter input set digest drifted.',
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
  const artifacts = validateArtifactDescriptors(
    reportCandidate,
    input.artifacts,
    input.stagedArtifacts,
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
    reportSourceTraceDigests(reportCandidate.payload).forEach(
      (sourceTraceDigest, index) => {
        if (!sourceTraceDigests.has(sourceTraceDigest)) {
          issues.push(
            issue(
              'VER-5001',
              `/report/sourceTraceDigests/${index}`,
              'The report source trace digest does not identify one canonical source trace.'
            )
          );
        }
      }
    );
    let secretCanaries: readonly string[] = [];
    try {
      secretCanaries = normalizeVerificationArtifactSecretCanaries(
        input.redaction.secretCanaries
      );
    } catch {
      issues.push(
        issue(
          'VER-5002',
          '/redaction/secretCanaries',
          'The secret canary set is invalid or over budget.'
        )
      );
    }
    const freeTextFields = [
      ...sourceTraces.flatMap(({ label }, index) =>
        label ? [{ path: `/sourceTraces/${index}/label`, value: label }] : []
      ),
      ...(input.run.operatingSystemIdentity
        ? [
            {
              path: '/run/operatingSystemIdentity',
              value: input.run.operatingSystemIdentity,
            },
          ]
        : []),
    ];
    for (const field of freeTextFields) {
      if (
        scanVerificationArtifactSensitiveText(field.value, secretCanaries)
          .length > 0
      ) {
        issues.push(
          issue(
            'VER-5002',
            field.path,
            'A free-text Evidence field contains sensitive content.'
          )
        );
      }
    }
  }
  const droppedFieldEntries = Object.entries(
    input.redaction.droppedFieldCounts
  );
  if (
    droppedFieldEntries.some(
      ([key, count]) =>
        !isCanonicalString(key) ||
        isUnsafeObjectKey(key) ||
        !Number.isSafeInteger(count) ||
        count < 0
    )
  ) {
    issues.push(
      issue(
        'VER-4002',
        '/redaction/droppedFieldCounts',
        'Dropped-field counts are unsafe or non-canonical.'
      )
    );
  }
  if (issues.length > 0 || !sourceTraces || !registryEntry) {
    return Object.freeze({
      status: 'invalid',
      issues: Object.freeze(issues),
    });
  }
  const diagnosticCodes = uniqueVerificationText(
    normalizedReport.diagnosticCodes
  );
  const normalizedResultWithoutDigest = Object.freeze({
    outcome: normalizedReport.outcome,
    summary: Object.freeze({
      schema: 'prodivix.verification-evidence-bound-report.v1',
      resolvedInputSetDigest: input.context.resolvedInputSetDigest,
      report: normalizedReport.summary,
    }),
    diagnosticCodes,
    appliedExemptionIds: Object.freeze([...cell.appliedExemptionIds]),
  });
  const normalizedResultDigest = digestVerificationValue(
    normalizedResultWithoutDigest
  );
  const droppedFieldCounts = Object.freeze(
    Object.fromEntries(
      droppedFieldEntries.sort(([left], [right]) =>
        compareUnicodeCodePoints(left, right)
      )
    )
  );
  const candidateWithoutDigest = Object.freeze({
    candidateId: `candidate:${digestVerificationValue({
      checkReportCandidateId: normalizedReport.candidateId,
      resolvedInputSetDigest: input.context.resolvedInputSetDigest,
    })}`,
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
    toolchain: registryEntry.descriptor.implementation,
    normalization: VERIFICATION_CORE_NORMALIZATION_IDENTITY,
    controls: Object.freeze({
      profileDigest: input.context.controlProfileDigest,
      appliedDigest: input.context.appliedControlDigest,
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
      inputDigest: reportCandidate.inputDigest,
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
      normalizedReport.outcome === 'passed'
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
