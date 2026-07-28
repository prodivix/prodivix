import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  addVerificationEvidenceCodecIssue as addIssue,
  readExactVerificationEvidenceRecord as exactRecord,
  verificationEvidenceOwnDataValue as ownDataValue,
  verificationEvidenceUtf8Length as utf8Length,
  VERIFICATION_EVIDENCE_CODEC_LIMITS,
  type VerificationEvidenceCandidateWire,
} from './verificationEvidenceCodec.primitives';
import {
  BROWSER_ENGINES,
  CHECK_KINDS,
  COLOR_SCHEMES,
  LOCALE_PATTERN,
  MOTIONS,
  ORIGINS,
  OUTCOMES,
  RETENTION_CLASSES,
  SURFACES,
  TOP_LEVEL_REQUIRED_KEYS,
} from './verificationEvidenceCandidateSchema';
import {
  artifacts,
  canonicalText,
  ciRepositoryIdentity,
  digest,
  digestSet,
  droppedFieldCounts,
  enumValue,
  finitePositiveNumber,
  identifier,
  identifierSet,
  implementationIdentity,
  instant,
  normalizedSummary,
  partitionRevisions,
  safeInteger,
  targetPolicy as normalizeTargetPolicy,
  viewport,
} from './verificationEvidenceCandidateFields';
import { sourceTraces } from './verificationEvidenceCandidateSourceTrace';
import { digestVerificationValue } from './verificationCanonical';
import type {
  VerificationEvidenceCandidate,
  VerificationEvidenceCandidateIssue,
  VerificationEvidenceCandidateProvenance,
  VerificationEvidenceCandidateResult,
} from './verification.types';

export { verificationEvidenceCandidateWireSchema } from './verificationEvidenceCandidateSchema';

const invalidResult = (
  issues: VerificationEvidenceCandidateIssue[]
): VerificationEvidenceCandidateResult =>
  Object.freeze({
    status: 'invalid',
    issues: Object.freeze(
      issues.length
        ? [...issues]
        : [
            Object.freeze({
              code: 'VER-4002' as const,
              path: '/',
              message: 'EvidenceCandidate failed strict validation.',
            }),
          ]
    ),
  });

const normalizeCandidate = (
  value: unknown,
  wire: boolean
): VerificationEvidenceCandidateResult => {
  const issues: VerificationEvidenceCandidateIssue[] = [];
  const record = exactRecord(
    value,
    '/',
    wire
      ? [...TOP_LEVEL_REQUIRED_KEYS, 'wireVersion']
      : TOP_LEVEL_REQUIRED_KEYS,
    wire ? ['scenario'] : ['scenario'],
    issues
  );
  if (!record) return invalidResult(issues);
  if (wire && ownDataValue(record, 'wireVersion') !== 1) {
    addIssue(
      issues,
      'VER-4002',
      '/wireVersion',
      'Unsupported EvidenceCandidate wire version; expected wireVersion 1.'
    );
  }

  const candidateId = identifier(
    ownDataValue(record, 'candidateId'),
    '/candidateId',
    issues
  );
  const projectId = identifier(
    ownDataValue(record, 'projectId'),
    '/projectId',
    issues
  );
  const workspaceId = identifier(
    ownDataValue(record, 'workspaceId'),
    '/workspaceId',
    issues
  );
  const workspaceRevision = safeInteger(
    ownDataValue(record, 'workspaceRevision'),
    '/workspaceRevision',
    issues
  );
  const normalizedPartitionRevisions = partitionRevisions(
    ownDataValue(record, 'partitionRevisions'),
    '/partitionRevisions',
    issues
  );
  const executableSnapshotDigest = digest(
    ownDataValue(record, 'executableSnapshotDigest'),
    '/executableSnapshotDigest',
    issues
  );

  let scenario:
    | Readonly<{
        id: string;
        revision: number;
        digest: string;
        programDigest: string;
      }>
    | undefined;
  if (Object.hasOwn(record, 'scenario')) {
    const scenarioRecord = exactRecord(
      ownDataValue(record, 'scenario'),
      '/scenario',
      ['id', 'revision', 'digest', 'programDigest'],
      [],
      issues
    );
    if (scenarioRecord) {
      const id = identifier(
        ownDataValue(scenarioRecord, 'id'),
        '/scenario/id',
        issues
      );
      const revision = safeInteger(
        ownDataValue(scenarioRecord, 'revision'),
        '/scenario/revision',
        issues
      );
      const scenarioDigest = digest(
        ownDataValue(scenarioRecord, 'digest'),
        '/scenario/digest',
        issues
      );
      const programDigest = digest(
        ownDataValue(scenarioRecord, 'programDigest'),
        '/scenario/programDigest',
        issues
      );
      if (id && revision !== undefined && scenarioDigest && programDigest) {
        scenario = Object.freeze({
          id,
          revision,
          digest: scenarioDigest,
          programDigest,
        });
      }
    }
  }

  const policyRevision = safeInteger(
    ownDataValue(record, 'policyRevision'),
    '/policyRevision',
    issues
  );
  const policyDigest = digest(
    ownDataValue(record, 'policyDigest'),
    '/policyDigest',
    issues
  );
  const impactDigest = digest(
    ownDataValue(record, 'impactDigest'),
    '/impactDigest',
    issues
  );
  const planDigest = digest(
    ownDataValue(record, 'planDigest'),
    '/planDigest',
    issues
  );
  const policyEvaluationInstant = instant(
    ownDataValue(record, 'policyEvaluationInstant'),
    '/policyEvaluationInstant',
    issues
  );
  const cellId = identifier(ownDataValue(record, 'cellId'), '/cellId', issues);
  const checkId = identifier(
    ownDataValue(record, 'checkId'),
    '/checkId',
    issues
  );
  const checkKind = enumValue(
    ownDataValue(record, 'checkKind'),
    CHECK_KINDS,
    '/checkKind',
    issues
  );
  const targetId = identifier(
    ownDataValue(record, 'targetId'),
    '/targetId',
    issues
  );
  const attemptId = identifier(
    ownDataValue(record, 'attemptId'),
    '/attemptId',
    issues
  );

  const runRecord = exactRecord(
    ownDataValue(record, 'run'),
    '/run',
    [
      'runId',
      'providerId',
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
    [
      'jobId',
      'sessionId',
      'parentAttemptId',
      'browserEngine',
      'operatingSystemIdentity',
      'sandboxImageDigest',
    ],
    issues
  );
  const runId = runRecord
    ? identifier(ownDataValue(runRecord, 'runId'), '/run/runId', issues)
    : undefined;
  const runProviderId = runRecord
    ? identifier(
        ownDataValue(runRecord, 'providerId'),
        '/run/providerId',
        issues
      )
    : undefined;
  const jobId =
    runRecord && Object.hasOwn(runRecord, 'jobId')
      ? identifier(ownDataValue(runRecord, 'jobId'), '/run/jobId', issues)
      : undefined;
  const sessionId =
    runRecord && Object.hasOwn(runRecord, 'sessionId')
      ? identifier(
          ownDataValue(runRecord, 'sessionId'),
          '/run/sessionId',
          issues
        )
      : undefined;
  const parentAttemptId =
    runRecord && Object.hasOwn(runRecord, 'parentAttemptId')
      ? identifier(
          ownDataValue(runRecord, 'parentAttemptId'),
          '/run/parentAttemptId',
          issues
        )
      : undefined;
  const surface = runRecord
    ? enumValue(
        ownDataValue(runRecord, 'surface'),
        SURFACES,
        '/run/surface',
        issues
      )
    : undefined;
  const frameworkTarget = runRecord
    ? identifier(
        ownDataValue(runRecord, 'frameworkTarget'),
        '/run/frameworkTarget',
        issues
      )
    : undefined;
  const runtimeZone = runRecord
    ? identifier(
        ownDataValue(runRecord, 'runtimeZone'),
        '/run/runtimeZone',
        issues
      )
    : undefined;
  const browserEngine =
    runRecord && Object.hasOwn(runRecord, 'browserEngine')
      ? enumValue(
          ownDataValue(runRecord, 'browserEngine'),
          BROWSER_ENGINES,
          '/run/browserEngine',
          issues
        )
      : undefined;
  const operatingSystemIdentity =
    runRecord && Object.hasOwn(runRecord, 'operatingSystemIdentity')
      ? canonicalText(
          ownDataValue(runRecord, 'operatingSystemIdentity'),
          '/run/operatingSystemIdentity',
          issues,
          512
        )
      : undefined;
  const normalizedViewport = runRecord
    ? viewport(ownDataValue(runRecord, 'viewport'), '/run/viewport', issues)
    : undefined;
  const devicePixelRatio = runRecord
    ? finitePositiveNumber(
        ownDataValue(runRecord, 'devicePixelRatio'),
        '/run/devicePixelRatio',
        issues,
        16
      )
    : undefined;
  const colorScheme = runRecord
    ? enumValue(
        ownDataValue(runRecord, 'colorScheme'),
        COLOR_SCHEMES,
        '/run/colorScheme',
        issues
      )
    : undefined;
  const motion = runRecord
    ? enumValue(
        ownDataValue(runRecord, 'motion'),
        MOTIONS,
        '/run/motion',
        issues
      )
    : undefined;
  const locale =
    runRecord &&
    canonicalText(ownDataValue(runRecord, 'locale'), '/run/locale', issues, 64);
  if (locale && !LOCALE_PATTERN.test(locale)) {
    addIssue(
      issues,
      'VER-4002',
      '/run/locale',
      'Expected a canonical locale identifier.'
    );
  }
  const timezone = runRecord
    ? canonicalText(
        ownDataValue(runRecord, 'timezone'),
        '/run/timezone',
        issues,
        128
      )
    : undefined;
  const fontSetDigest = runRecord
    ? digest(
        ownDataValue(runRecord, 'fontSetDigest'),
        '/run/fontSetDigest',
        issues
      )
    : undefined;
  const sandboxImageDigest =
    runRecord && Object.hasOwn(runRecord, 'sandboxImageDigest')
      ? digest(
          ownDataValue(runRecord, 'sandboxImageDigest'),
          '/run/sandboxImageDigest',
          issues
        )
      : undefined;
  const run =
    runRecord &&
    runId &&
    runProviderId &&
    surface &&
    frameworkTarget &&
    runtimeZone &&
    normalizedViewport &&
    devicePixelRatio !== undefined &&
    colorScheme &&
    motion &&
    locale &&
    LOCALE_PATTERN.test(locale) &&
    timezone &&
    fontSetDigest &&
    (!Object.hasOwn(runRecord, 'jobId') || jobId) &&
    (!Object.hasOwn(runRecord, 'sessionId') || sessionId) &&
    (!Object.hasOwn(runRecord, 'parentAttemptId') || parentAttemptId) &&
    (!Object.hasOwn(runRecord, 'browserEngine') || browserEngine) &&
    (!Object.hasOwn(runRecord, 'operatingSystemIdentity') ||
      operatingSystemIdentity) &&
    (!Object.hasOwn(runRecord, 'sandboxImageDigest') || sandboxImageDigest)
      ? Object.freeze({
          runId,
          providerId: runProviderId,
          ...(jobId ? { jobId } : {}),
          ...(sessionId ? { sessionId } : {}),
          ...(parentAttemptId ? { parentAttemptId } : {}),
          surface,
          frameworkTarget,
          runtimeZone,
          ...(browserEngine ? { browserEngine } : {}),
          ...(operatingSystemIdentity ? { operatingSystemIdentity } : {}),
          viewport: normalizedViewport,
          devicePixelRatio,
          colorScheme,
          motion,
          locale,
          timezone,
          fontSetDigest,
          ...(sandboxImageDigest ? { sandboxImageDigest } : {}),
        })
      : undefined;

  const timingRecord = exactRecord(
    ownDataValue(record, 'timing'),
    '/timing',
    ['startedAt', 'completedAt', 'durationMs'],
    [],
    issues
  );
  const startedAt = timingRecord
    ? instant(
        ownDataValue(timingRecord, 'startedAt'),
        '/timing/startedAt',
        issues
      )
    : undefined;
  const completedAt = timingRecord
    ? instant(
        ownDataValue(timingRecord, 'completedAt'),
        '/timing/completedAt',
        issues
      )
    : undefined;
  const durationMs = timingRecord
    ? safeInteger(
        ownDataValue(timingRecord, 'durationMs'),
        '/timing/durationMs',
        issues
      )
    : undefined;
  if (
    startedAt &&
    completedAt &&
    durationMs !== undefined &&
    (completedAt.milliseconds < startedAt.milliseconds ||
      completedAt.milliseconds - startedAt.milliseconds !== durationMs)
  ) {
    addIssue(
      issues,
      'VER-5001',
      '/timing',
      'EvidenceCandidate timing order or duration does not match.'
    );
  }
  const timing =
    startedAt &&
    completedAt &&
    durationMs !== undefined &&
    completedAt.milliseconds >= startedAt.milliseconds &&
    completedAt.milliseconds - startedAt.milliseconds === durationMs
      ? Object.freeze({
          startedAt: startedAt.value,
          completedAt: completedAt.value,
          durationMs,
        })
      : undefined;

  const resultRecord = exactRecord(
    ownDataValue(record, 'result'),
    '/result',
    [
      'outcome',
      'normalizedResultDigest',
      'summary',
      'diagnosticCodes',
      'appliedExemptionIds',
    ],
    [],
    issues
  );
  const outcome = resultRecord
    ? enumValue(
        ownDataValue(resultRecord, 'outcome'),
        OUTCOMES,
        '/result/outcome',
        issues
      )
    : undefined;
  const summary = resultRecord
    ? normalizedSummary(
        ownDataValue(resultRecord, 'summary'),
        '/result/summary',
        issues
      )
    : undefined;
  const diagnosticCodes = resultRecord
    ? identifierSet(
        ownDataValue(resultRecord, 'diagnosticCodes'),
        '/result/diagnosticCodes',
        VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumDiagnosticCodes,
        issues
      )
    : undefined;
  const appliedExemptionIds = resultRecord
    ? identifierSet(
        ownDataValue(resultRecord, 'appliedExemptionIds'),
        '/result/appliedExemptionIds',
        VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumAppliedExemptionIds,
        issues
      )
    : undefined;
  const normalizedResultDigest = resultRecord
    ? digest(
        ownDataValue(resultRecord, 'normalizedResultDigest'),
        '/result/normalizedResultDigest',
        issues
      )
    : undefined;
  let result: VerificationEvidenceCandidate['result'] | undefined;
  if (
    outcome &&
    summary !== undefined &&
    diagnosticCodes &&
    appliedExemptionIds &&
    normalizedResultDigest
  ) {
    const resultWithoutDigest = Object.freeze({
      outcome,
      summary,
      diagnosticCodes,
      appliedExemptionIds,
    });
    if (
      digestVerificationValue(resultWithoutDigest) !== normalizedResultDigest
    ) {
      addIssue(
        issues,
        'VER-5001',
        '/result/normalizedResultDigest',
        'EvidenceCandidate normalized result digest does not match.'
      );
    }
    result = Object.freeze({
      outcome,
      normalizedResultDigest,
      summary,
      diagnosticCodes,
      appliedExemptionIds,
    });
  }

  const provenanceRecord = exactRecord(
    ownDataValue(record, 'provenance'),
    '/provenance',
    ['origin', 'producerId', 'providerId', 'issuedAt'],
    ['expiresAt', 'ci'],
    issues
  );
  const origin = provenanceRecord
    ? enumValue(
        ownDataValue(provenanceRecord, 'origin'),
        ORIGINS,
        '/provenance/origin',
        issues
      )
    : undefined;
  const producerId = provenanceRecord
    ? identifier(
        ownDataValue(provenanceRecord, 'producerId'),
        '/provenance/producerId',
        issues
      )
    : undefined;
  const provenanceProviderId = provenanceRecord
    ? identifier(
        ownDataValue(provenanceRecord, 'providerId'),
        '/provenance/providerId',
        issues
      )
    : undefined;
  const issuedAt = provenanceRecord
    ? instant(
        ownDataValue(provenanceRecord, 'issuedAt'),
        '/provenance/issuedAt',
        issues
      )
    : undefined;
  const expiresAt =
    provenanceRecord && Object.hasOwn(provenanceRecord, 'expiresAt')
      ? instant(
          ownDataValue(provenanceRecord, 'expiresAt'),
          '/provenance/expiresAt',
          issues
        )
      : undefined;
  const ci =
    provenanceRecord && Object.hasOwn(provenanceRecord, 'ci')
      ? ciRepositoryIdentity(
          ownDataValue(provenanceRecord, 'ci'),
          '/provenance/ci',
          issues
        )
      : undefined;
  if (
    issuedAt &&
    expiresAt &&
    expiresAt.milliseconds <= issuedAt.milliseconds
  ) {
    addIssue(
      issues,
      'VER-5001',
      '/provenance/expiresAt',
      'EvidenceCandidate provenance expiry must be after issuance.'
    );
  }
  if (
    origin &&
    ((origin === 'ci' && !ci) ||
      (origin !== 'ci' && Object.hasOwn(provenanceRecord!, 'ci')))
  ) {
    addIssue(
      issues,
      'VER-5001',
      '/provenance/ci',
      'CI repository identity is required only for CI candidates.'
    );
  }
  const provenance: VerificationEvidenceCandidateProvenance | undefined =
    provenanceRecord &&
    origin &&
    producerId &&
    provenanceProviderId &&
    issuedAt &&
    (!Object.hasOwn(provenanceRecord, 'expiresAt') || expiresAt) &&
    (!Object.hasOwn(provenanceRecord, 'ci') || ci) &&
    ((origin === 'ci' && Boolean(ci)) ||
      (origin !== 'ci' && !Object.hasOwn(provenanceRecord, 'ci')))
      ? origin === 'ci'
        ? Object.freeze({
            origin,
            producerId,
            providerId: provenanceProviderId,
            issuedAt: issuedAt.value,
            ...(expiresAt ? { expiresAt: expiresAt.value } : {}),
            ci: ci!,
          })
        : Object.freeze({
            origin,
            producerId,
            providerId: provenanceProviderId,
            issuedAt: issuedAt.value,
            ...(expiresAt ? { expiresAt: expiresAt.value } : {}),
          })
      : undefined;

  const toolchain = implementationIdentity(
    ownDataValue(record, 'toolchain'),
    '/toolchain',
    issues
  );
  const normalization = implementationIdentity(
    ownDataValue(record, 'normalization'),
    '/normalization',
    issues
  );

  const controlsRecord = exactRecord(
    ownDataValue(record, 'controls'),
    '/controls',
    ['profileDigest', 'appliedDigest'],
    [],
    issues
  );
  const profileDigest = controlsRecord
    ? digest(
        ownDataValue(controlsRecord, 'profileDigest'),
        '/controls/profileDigest',
        issues
      )
    : undefined;
  const appliedDigest = controlsRecord
    ? digest(
        ownDataValue(controlsRecord, 'appliedDigest'),
        '/controls/appliedDigest',
        issues
      )
    : undefined;
  const controls =
    profileDigest && appliedDigest
      ? Object.freeze({ profileDigest, appliedDigest })
      : undefined;

  const inputsRecord = exactRecord(
    ownDataValue(record, 'inputs'),
    '/inputs',
    ['executableSnapshotDigest', 'fixtureSetDigests', 'inputDigest'],
    ['scenarioProgramDigest', 'baselineSetDigest'],
    issues
  );
  const inputExecutableSnapshotDigest = inputsRecord
    ? digest(
        ownDataValue(inputsRecord, 'executableSnapshotDigest'),
        '/inputs/executableSnapshotDigest',
        issues
      )
    : undefined;
  const scenarioProgramDigest =
    inputsRecord && Object.hasOwn(inputsRecord, 'scenarioProgramDigest')
      ? digest(
          ownDataValue(inputsRecord, 'scenarioProgramDigest'),
          '/inputs/scenarioProgramDigest',
          issues
        )
      : undefined;
  const fixtureSetDigests = inputsRecord
    ? digestSet(
        ownDataValue(inputsRecord, 'fixtureSetDigests'),
        '/inputs/fixtureSetDigests',
        VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumFixtureSetDigests,
        issues
      )
    : undefined;
  const baselineSetDigest =
    inputsRecord && Object.hasOwn(inputsRecord, 'baselineSetDigest')
      ? digest(
          ownDataValue(inputsRecord, 'baselineSetDigest'),
          '/inputs/baselineSetDigest',
          issues
        )
      : undefined;
  const inputDigest = inputsRecord
    ? digest(
        ownDataValue(inputsRecord, 'inputDigest'),
        '/inputs/inputDigest',
        issues
      )
    : undefined;
  const inputs =
    inputsRecord &&
    inputExecutableSnapshotDigest &&
    fixtureSetDigests &&
    inputDigest &&
    (!Object.hasOwn(inputsRecord, 'scenarioProgramDigest') ||
      scenarioProgramDigest) &&
    (!Object.hasOwn(inputsRecord, 'baselineSetDigest') || baselineSetDigest)
      ? Object.freeze({
          executableSnapshotDigest: inputExecutableSnapshotDigest,
          ...(scenarioProgramDigest ? { scenarioProgramDigest } : {}),
          fixtureSetDigests,
          ...(baselineSetDigest ? { baselineSetDigest } : {}),
          inputDigest,
        })
      : undefined;

  const normalizedArtifacts = artifacts(
    ownDataValue(record, 'artifacts'),
    '/artifacts',
    issues
  );
  const normalizedSourceTraces = sourceTraces(
    ownDataValue(record, 'sourceTraces'),
    '/sourceTraces',
    issues
  );
  const sourceTraceDigest = digest(
    ownDataValue(record, 'sourceTraceDigest'),
    '/sourceTraceDigest',
    issues
  );
  if (
    normalizedSourceTraces &&
    sourceTraceDigest &&
    digestVerificationValue(normalizedSourceTraces) !== sourceTraceDigest
  ) {
    addIssue(
      issues,
      'VER-5001',
      '/sourceTraceDigest',
      'EvidenceCandidate source trace digest does not match its canonical source traces.'
    );
  }
  if (normalizedArtifacts && normalizedSourceTraces) {
    const sourceTraceDigests = new Set(
      normalizedSourceTraces.map((trace) => digestVerificationValue(trace))
    );
    normalizedArtifacts.forEach((artifact, index) => {
      if (
        artifact.sourceTraceDigest !== undefined &&
        !sourceTraceDigests.has(artifact.sourceTraceDigest)
      ) {
        addIssue(
          issues,
          'VER-5001',
          `/artifacts/${index}/sourceTraceDigest`,
          'EvidenceCandidate artifact source trace digest does not identify one canonical source trace.'
        );
      }
    });
  }
  const dependencyLockDigest = digest(
    ownDataValue(record, 'dependencyLockDigest'),
    '/dependencyLockDigest',
    issues
  );

  const redactionRecord = exactRecord(
    ownDataValue(record, 'redaction'),
    '/redaction',
    [
      'policyId',
      'scannerSetDigest',
      'droppedFieldCounts',
      'targetPolicy',
      'safe',
    ],
    [],
    issues
  );
  const redactionPolicyId = redactionRecord
    ? identifier(
        ownDataValue(redactionRecord, 'policyId'),
        '/redaction/policyId',
        issues
      )
    : undefined;
  const scannerSetDigest = redactionRecord
    ? digest(
        ownDataValue(redactionRecord, 'scannerSetDigest'),
        '/redaction/scannerSetDigest',
        issues
      )
    : undefined;
  const normalizedDroppedFieldCounts = redactionRecord
    ? droppedFieldCounts(
        ownDataValue(redactionRecord, 'droppedFieldCounts'),
        '/redaction/droppedFieldCounts',
        issues
      )
    : undefined;
  const normalizedTargetPolicy = redactionRecord
    ? normalizeTargetPolicy(
        ownDataValue(redactionRecord, 'targetPolicy'),
        '/redaction/targetPolicy',
        issues
      )
    : undefined;
  if (
    normalizedTargetPolicy &&
    policyDigest &&
    normalizedTargetPolicy.policyDigest !== policyDigest
  ) {
    addIssue(
      issues,
      'VER-5001',
      '/redaction/targetPolicy/policyDigest',
      'Evidence target policy digest must match the candidate Policy.'
    );
  }
  if (
    normalizedTargetPolicy &&
    targetId &&
    normalizedTargetPolicy.semanticTargetId !== targetId
  ) {
    addIssue(
      issues,
      'VER-5001',
      '/redaction/targetPolicy/semanticTargetId',
      'Evidence target policy must match the candidate semantic target.'
    );
  }
  if (redactionRecord && ownDataValue(redactionRecord, 'safe') !== true) {
    addIssue(
      issues,
      'VER-5002',
      '/redaction/safe',
      'EvidenceCandidate redaction must fail closed unless explicitly safe.'
    );
  }
  const redaction =
    redactionPolicyId &&
    scannerSetDigest &&
    normalizedDroppedFieldCounts &&
    normalizedTargetPolicy &&
    redactionRecord &&
    ownDataValue(redactionRecord, 'safe') === true
      ? Object.freeze({
          policyId: redactionPolicyId,
          scannerSetDigest,
          droppedFieldCounts: normalizedDroppedFieldCounts,
          targetPolicy: normalizedTargetPolicy,
          safe: true as const,
        })
      : undefined;

  const requestedRetention = enumValue(
    ownDataValue(record, 'requestedRetention'),
    RETENTION_CLASSES,
    '/requestedRetention',
    issues
  );
  if (requestedRetention === 'legal-hold') {
    addIssue(
      issues,
      'VER-5001',
      '/requestedRetention',
      'EvidenceCandidate cannot request legal-hold retention.'
    );
  }

  const promotionRecord = exactRecord(
    ownDataValue(record, 'promotion'),
    '/promotion',
    ['idempotencyKey', 'deadline'],
    [],
    issues
  );
  const idempotencyKey = promotionRecord
    ? identifier(
        ownDataValue(promotionRecord, 'idempotencyKey'),
        '/promotion/idempotencyKey',
        issues
      )
    : undefined;
  const deadline = promotionRecord
    ? instant(
        ownDataValue(promotionRecord, 'deadline'),
        '/promotion/deadline',
        issues
      )
    : undefined;
  const promotion =
    idempotencyKey && deadline
      ? Object.freeze({ idempotencyKey, deadline: deadline.value })
      : undefined;

  const candidateDigest = digest(
    ownDataValue(record, 'candidateDigest'),
    '/candidateDigest',
    issues
  );

  if (
    executableSnapshotDigest &&
    inputExecutableSnapshotDigest &&
    executableSnapshotDigest !== inputExecutableSnapshotDigest
  ) {
    addIssue(
      issues,
      'VER-5001',
      '/inputs/executableSnapshotDigest',
      'EvidenceCandidate executable snapshot identities do not match.'
    );
  }
  if (
    runProviderId &&
    provenanceProviderId &&
    runProviderId !== provenanceProviderId
  ) {
    addIssue(
      issues,
      'VER-5001',
      '/provenance/providerId',
      'EvidenceCandidate run and provenance providers do not match.'
    );
  }
  if (
    (scenario === undefined) !== (scenarioProgramDigest === undefined) ||
    (scenario &&
      scenarioProgramDigest &&
      scenario.programDigest !== scenarioProgramDigest)
  ) {
    addIssue(
      issues,
      'VER-5001',
      '/inputs/scenarioProgramDigest',
      'EvidenceCandidate scenario and Program identities do not match.'
    );
  }
  if (
    policyEvaluationInstant &&
    startedAt &&
    policyEvaluationInstant.milliseconds > startedAt.milliseconds
  ) {
    addIssue(
      issues,
      'VER-5001',
      '/policyEvaluationInstant',
      'EvidenceCandidate policy evaluation must not follow run start.'
    );
  }
  if (
    completedAt &&
    issuedAt &&
    issuedAt.milliseconds < completedAt.milliseconds
  ) {
    addIssue(
      issues,
      'VER-5001',
      '/provenance/issuedAt',
      'EvidenceCandidate provenance issuance must not precede run completion.'
    );
  }
  if (
    deadline &&
    ((completedAt && deadline.milliseconds <= completedAt.milliseconds) ||
      (issuedAt && deadline.milliseconds <= issuedAt.milliseconds))
  ) {
    addIssue(
      issues,
      'VER-5001',
      '/promotion/deadline',
      'EvidenceCandidate promotion deadline must follow completion and issuance.'
    );
  }

  const requiredValues = [
    candidateId,
    projectId,
    workspaceId,
    workspaceRevision,
    normalizedPartitionRevisions,
    executableSnapshotDigest,
    policyRevision,
    policyDigest,
    impactDigest,
    planDigest,
    policyEvaluationInstant,
    cellId,
    checkId,
    checkKind,
    targetId,
    attemptId,
    run,
    timing,
    result,
    provenance,
    toolchain,
    normalization,
    controls,
    inputs,
    normalizedArtifacts,
    normalizedSourceTraces,
    sourceTraceDigest,
    dependencyLockDigest,
    redaction,
    requestedRetention,
    promotion,
    candidateDigest,
  ];
  if (
    issues.length > 0 ||
    requiredValues.some((entry) => entry === undefined) ||
    requestedRetention === 'legal-hold'
  ) {
    return invalidResult(issues);
  }

  const candidateWithoutDigest = Object.freeze({
    candidateId: candidateId!,
    projectId: projectId!,
    workspaceId: workspaceId!,
    workspaceRevision: workspaceRevision!,
    partitionRevisions: normalizedPartitionRevisions!,
    executableSnapshotDigest: executableSnapshotDigest!,
    ...(scenario ? { scenario } : {}),
    policyRevision: policyRevision!,
    policyDigest: policyDigest!,
    impactDigest: impactDigest!,
    planDigest: planDigest!,
    policyEvaluationInstant: policyEvaluationInstant!.value,
    cellId: cellId!,
    checkId: checkId!,
    checkKind: checkKind!,
    targetId: targetId!,
    attemptId: attemptId!,
    run: run!,
    timing: timing!,
    result: result!,
    provenance: provenance!,
    toolchain: toolchain!,
    normalization: normalization!,
    controls: controls!,
    inputs: inputs!,
    artifacts: normalizedArtifacts!,
    sourceTraces: normalizedSourceTraces!,
    sourceTraceDigest: sourceTraceDigest!,
    dependencyLockDigest: dependencyLockDigest!,
    redaction: redaction!,
    requestedRetention: requestedRetention!,
    promotion: promotion!,
  });
  const recomputedCandidateDigest = digestVerificationValue(
    candidateWithoutDigest
  );
  if (recomputedCandidateDigest !== candidateDigest) {
    addIssue(
      issues,
      'VER-5001',
      '/candidateDigest',
      'EvidenceCandidate digest does not match its canonical current model.'
    );
    return invalidResult(issues);
  }
  const candidate: VerificationEvidenceCandidate = Object.freeze({
    ...candidateWithoutDigest,
    candidateDigest: candidateDigest!,
  });
  try {
    if (
      utf8Length(canonicalJsonText(candidate)) >
      VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumCandidateBytes
    ) {
      addIssue(
        issues,
        'VER-4002',
        '/',
        'EvidenceCandidate exceeds its canonical UTF-8 byte budget.'
      );
      return invalidResult(issues);
    }
  } catch {
    addIssue(
      issues,
      'VER-4002',
      '/',
      'EvidenceCandidate cannot be canonically serialized.'
    );
    return invalidResult(issues);
  }
  return Object.freeze({ status: 'ready', candidate });
};

/**
 * Decodes only immutable v1 wire candidates. Missing, legacy, and future wire
 * versions fail closed instead of being treated as current domain objects.
 */
export const decodeVerificationEvidenceCandidate = (
  value: unknown
): VerificationEvidenceCandidateResult => normalizeCandidate(value, true);

export const validateVerificationEvidenceCandidate = (
  value: unknown
): VerificationEvidenceCandidateResult => normalizeCandidate(value, false);

export const normalizeVerificationEvidenceCandidate = (
  value: VerificationEvidenceCandidate
): VerificationEvidenceCandidate => {
  const validation = validateVerificationEvidenceCandidate(value);
  if (validation.status === 'invalid') {
    throw new TypeError(
      validation.issues
        .map((entry) => `${entry.path}: ${entry.message}`)
        .join('; ')
    );
  }
  return validation.candidate;
};

export const encodeVerificationEvidenceCandidate = (
  value: VerificationEvidenceCandidate
): VerificationEvidenceCandidateWire => {
  const candidate = normalizeVerificationEvidenceCandidate(value);
  return Object.freeze({
    wireVersion: 1 as const,
    ...candidate,
  });
};
