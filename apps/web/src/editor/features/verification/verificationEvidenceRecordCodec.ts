import {
  decodeVerificationEvidenceRetentionProtections,
  decodeVerificationEvidenceSourceTraces,
  digestVerificationValue,
} from '@prodivix/verification';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  ARTIFACT_AVAILABILITIES,
  ARTIFACT_KINDS,
  ATTEMPT_OUTCOMES,
  BROWSER_ENGINES,
  CHECK_KINDS,
  COLOR_SCHEMES,
  MAX_ARTIFACTS,
  MAX_PAGE_RECORDS,
  MOTIONS,
  RETENTION_CLASSES,
  SURFACES,
  TRUST_CLASSES,
  digestArrayAt,
  digestAt,
  enumAt,
  exactKeys,
  fail,
  finiteNumberAt,
  identifierArrayAt,
  identifierAt,
  instantAt,
  jsonValueAt,
  mediaTypeAt,
  nonEmptyStringAt,
  optional,
  partitionRevisionsAt,
  recordAt,
  safeIntegerAt,
} from './verificationEvidenceCodec.shared';
import type {
  VerificationEvidenceArtifactDescriptor,
  VerificationEvidencePage,
  VerificationEvidenceTransportRecord,
} from './verificationEvidenceCodec.shared';
import { decodeVerificationEvidenceVerifiedViewRecordAt } from './verificationEvidenceLifecycleCodec';

const CI_REPOSITORY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,511}$/u;
const CI_COMMIT_PATTERN = /^(?:sha1-[a-f0-9]{40}|sha256-[a-f0-9]{64})$/u;

const implementationIdentityAt = (
  value: unknown,
  path: string
): VerificationEvidenceTransportRecord['evidence']['toolchain'] => {
  const record = recordAt(value, path);
  exactKeys(record, path, [
    'packageName',
    'packageVersion',
    'buildDigest',
    'toolchainDigest',
    'schemaDigest',
  ]);
  return Object.freeze({
    packageName: nonEmptyStringAt(
      record.packageName,
      `${path}/packageName`,
      256
    ),
    packageVersion: nonEmptyStringAt(
      record.packageVersion,
      `${path}/packageVersion`,
      128
    ),
    buildDigest: digestAt(record.buildDigest, `${path}/buildDigest`),
    toolchainDigest: digestAt(
      record.toolchainDigest,
      `${path}/toolchainDigest`
    ),
    schemaDigest: digestAt(record.schemaDigest, `${path}/schemaDigest`),
  });
};

const ciIdentityAt = (
  value: unknown,
  path: string
): NonNullable<
  VerificationEvidenceTransportRecord['evidence']['provenance']['ci']
> => {
  const record = recordAt(value, path);
  exactKeys(record, path, ['repository', 'ref', 'commit']);
  const repository = nonEmptyStringAt(
    record.repository,
    `${path}/repository`,
    512
  );
  const ref = nonEmptyStringAt(record.ref, `${path}/ref`, 512);
  const commit = nonEmptyStringAt(record.commit, `${path}/commit`, 71);
  if (
    repository !== repository.trim() ||
    !CI_REPOSITORY_PATTERN.test(repository) ||
    ref !== ref.trim() ||
    !ref.startsWith('refs/') ||
    ref.length <= 'refs/'.length ||
    ref.endsWith('/') ||
    ref.endsWith('.') ||
    ref.includes('..') ||
    ref.includes('//') ||
    ref.includes('@{') ||
    ['\\', '~', '^', ':', '?', '*', '['].some((character) =>
      ref.includes(character)
    ) ||
    !CI_COMMIT_PATTERN.test(commit)
  ) {
    fail(path, 'expected a canonical credential-free CI repository identity');
  }
  return Object.freeze({ repository, ref, commit });
};

const artifactManifestAt = (
  value: unknown,
  path: string
): VerificationEvidenceTransportRecord['evidence']['artifacts'][number] => {
  const record = recordAt(value, path);
  exactKeys(
    record,
    path,
    ['id', 'path', 'kind', 'digest', 'size', 'mediaType'],
    ['normalizedDigest', 'sourceTraceDigest']
  );
  const artifactPath = nonEmptyStringAt(record.path, `${path}/path`, 1024);
  if (
    artifactPath.includes('\\') ||
    artifactPath.startsWith('/') ||
    artifactPath.split('/').some((segment) => segment === '..')
  ) {
    fail(`${path}/path`, 'expected a canonical relative artifact path');
  }
  return Object.freeze({
    id: identifierAt(record.id, `${path}/id`),
    path: artifactPath,
    kind: enumAt(record.kind, `${path}/kind`, ARTIFACT_KINDS),
    digest: digestAt(record.digest, `${path}/digest`),
    ...(Object.hasOwn(record, 'normalizedDigest')
      ? {
          normalizedDigest: digestAt(
            record.normalizedDigest,
            `${path}/normalizedDigest`
          ),
        }
      : {}),
    ...(Object.hasOwn(record, 'sourceTraceDigest')
      ? {
          sourceTraceDigest: digestAt(
            record.sourceTraceDigest,
            `${path}/sourceTraceDigest`
          ),
        }
      : {}),
    size: safeIntegerAt(record.size, `${path}/size`, 0, 16 * 1024 * 1024),
    mediaType: mediaTypeAt(record.mediaType, `${path}/mediaType`),
  });
};

const artifactDescriptorAt = (
  value: unknown,
  path: string
): VerificationEvidenceArtifactDescriptor => {
  const record = recordAt(value, path);
  exactKeys(
    record,
    path,
    ['id', 'path', 'kind', 'digest', 'size', 'mediaType', 'availability'],
    ['normalizedDigest', 'sourceTraceDigest']
  );
  const artifactPath = nonEmptyStringAt(record.path, `${path}/path`, 1024);
  if (
    artifactPath.includes('\\') ||
    artifactPath.startsWith('/') ||
    artifactPath.split('/').some((segment) => segment === '..')
  ) {
    fail(`${path}/path`, 'expected a canonical relative artifact path');
  }
  return Object.freeze({
    id: identifierAt(record.id, `${path}/id`),
    path: artifactPath,
    kind: enumAt(record.kind, `${path}/kind`, ARTIFACT_KINDS),
    digest: digestAt(record.digest, `${path}/digest`),
    ...(Object.hasOwn(record, 'normalizedDigest')
      ? {
          normalizedDigest: digestAt(
            record.normalizedDigest,
            `${path}/normalizedDigest`
          ),
        }
      : {}),
    ...(Object.hasOwn(record, 'sourceTraceDigest')
      ? {
          sourceTraceDigest: digestAt(
            record.sourceTraceDigest,
            `${path}/sourceTraceDigest`
          ),
        }
      : {}),
    size: safeIntegerAt(record.size, `${path}/size`, 0, 16 * 1024 * 1024),
    mediaType: mediaTypeAt(record.mediaType, `${path}/mediaType`),
    availability: enumAt(
      record.availability,
      `${path}/availability`,
      ARTIFACT_AVAILABILITIES
    ),
  });
};

const evidenceAt = (
  value: unknown,
  path: string
): VerificationEvidenceTransportRecord['evidence'] => {
  const record = recordAt(value, path);
  exactKeys(
    record,
    path,
    [
      'id',
      'projectId',
      'workspaceId',
      'workspaceRevision',
      'partitionRevisions',
      'executableSnapshotDigest',
      'policyRevision',
      'policyDigest',
      'impactDigest',
      'planDigest',
      'policyEvaluationInstant',
      'cellId',
      'checkId',
      'checkKind',
      'targetId',
      'attemptId',
      'run',
      'timing',
      'result',
      'provenance',
      'toolchain',
      'normalization',
      'controls',
      'inputs',
      'artifacts',
      'sourceTraces',
      'sourceTraceDigest',
      'dependencyLockDigest',
      'redactionPolicyId',
      'targetPolicy',
      'createdAt',
      'retention',
      'manifestDigest',
    ],
    ['scenario', 'supersedes']
  );
  const workspaceRevision = safeIntegerAt(
    record.workspaceRevision,
    `${path}/workspaceRevision`,
    1
  );
  const partitionRevisions = partitionRevisionsAt(
    record.partitionRevisions,
    `${path}/partitionRevisions`
  );
  if (partitionRevisions.workspaceRev !== workspaceRevision) {
    fail(
      `${path}/partitionRevisions/workspaceRev`,
      'does not match workspaceRevision'
    );
  }
  const policyDigest = digestAt(record.policyDigest, `${path}/policyDigest`);
  const targetId = identifierAt(record.targetId, `${path}/targetId`);
  const targetPolicyPath = `${path}/targetPolicy`;
  const targetPolicyRecord = recordAt(record.targetPolicy, targetPolicyPath);
  exactKeys(targetPolicyRecord, targetPolicyPath, [
    'authority',
    'policyDigest',
    'semanticTargetId',
    'capture',
  ]);
  if (targetPolicyRecord.authority !== 'verification-policy') {
    fail(
      `${targetPolicyPath}/authority`,
      'expected verification-policy authority'
    );
  }
  const targetPolicy = Object.freeze({
    authority: 'verification-policy' as const,
    policyDigest: digestAt(
      targetPolicyRecord.policyDigest,
      `${targetPolicyPath}/policyDigest`
    ),
    semanticTargetId: identifierAt(
      targetPolicyRecord.semanticTargetId,
      `${targetPolicyPath}/semanticTargetId`
    ),
    capture: enumAt(targetPolicyRecord.capture, `${targetPolicyPath}/capture`, [
      'allowed',
      'masked',
      'forbidden-sensitive',
    ] as const),
  });
  if (
    targetPolicy.policyDigest !== policyDigest ||
    targetPolicy.semanticTargetId !== targetId
  ) {
    fail(targetPolicyPath, 'does not match the Evidence policy and target');
  }

  const scenario = optional(
    record,
    'scenario',
    (candidate, scenarioPath) => {
      const scenarioRecord = recordAt(candidate, scenarioPath);
      exactKeys(scenarioRecord, scenarioPath, [
        'id',
        'revision',
        'digest',
        'programDigest',
      ]);
      return Object.freeze({
        id: identifierAt(scenarioRecord.id, `${scenarioPath}/id`),
        revision: safeIntegerAt(
          scenarioRecord.revision,
          `${scenarioPath}/revision`,
          1
        ),
        digest: digestAt(scenarioRecord.digest, `${scenarioPath}/digest`),
        programDigest: digestAt(
          scenarioRecord.programDigest,
          `${scenarioPath}/programDigest`
        ),
      });
    },
    path
  );

  const runPath = `${path}/run`;
  const runRecord = recordAt(record.run, runPath);
  exactKeys(
    runRecord,
    runPath,
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
    ]
  );
  const viewportPath = `${runPath}/viewport`;
  const viewportRecord = recordAt(runRecord.viewport, viewportPath);
  exactKeys(viewportRecord, viewportPath, ['id', 'width', 'height']);
  const run = Object.freeze({
    runId: identifierAt(runRecord.runId, `${runPath}/runId`),
    providerId: identifierAt(runRecord.providerId, `${runPath}/providerId`),
    ...(Object.hasOwn(runRecord, 'jobId')
      ? { jobId: identifierAt(runRecord.jobId, `${runPath}/jobId`) }
      : {}),
    ...(Object.hasOwn(runRecord, 'sessionId')
      ? {
          sessionId: identifierAt(runRecord.sessionId, `${runPath}/sessionId`),
        }
      : {}),
    ...(Object.hasOwn(runRecord, 'parentAttemptId')
      ? {
          parentAttemptId: identifierAt(
            runRecord.parentAttemptId,
            `${runPath}/parentAttemptId`
          ),
        }
      : {}),
    surface: enumAt(runRecord.surface, `${runPath}/surface`, SURFACES),
    frameworkTarget: identifierAt(
      runRecord.frameworkTarget,
      `${runPath}/frameworkTarget`
    ),
    runtimeZone: identifierAt(runRecord.runtimeZone, `${runPath}/runtimeZone`),
    ...(Object.hasOwn(runRecord, 'browserEngine')
      ? {
          browserEngine: enumAt(
            runRecord.browserEngine,
            `${runPath}/browserEngine`,
            BROWSER_ENGINES
          ),
        }
      : {}),
    ...(Object.hasOwn(runRecord, 'operatingSystemIdentity')
      ? {
          operatingSystemIdentity: nonEmptyStringAt(
            runRecord.operatingSystemIdentity,
            `${runPath}/operatingSystemIdentity`,
            256
          ),
        }
      : {}),
    viewport: Object.freeze({
      id: identifierAt(viewportRecord.id, `${viewportPath}/id`),
      width: safeIntegerAt(
        viewportRecord.width,
        `${viewportPath}/width`,
        1,
        16_384
      ),
      height: safeIntegerAt(
        viewportRecord.height,
        `${viewportPath}/height`,
        1,
        16_384
      ),
    }),
    devicePixelRatio: finiteNumberAt(
      runRecord.devicePixelRatio,
      `${runPath}/devicePixelRatio`,
      0.1,
      16
    ),
    colorScheme: enumAt(
      runRecord.colorScheme,
      `${runPath}/colorScheme`,
      COLOR_SCHEMES
    ),
    motion: enumAt(runRecord.motion, `${runPath}/motion`, MOTIONS),
    locale: nonEmptyStringAt(runRecord.locale, `${runPath}/locale`, 128),
    timezone: nonEmptyStringAt(runRecord.timezone, `${runPath}/timezone`, 128),
    fontSetDigest: digestAt(
      runRecord.fontSetDigest,
      `${runPath}/fontSetDigest`
    ),
    ...(Object.hasOwn(runRecord, 'sandboxImageDigest')
      ? {
          sandboxImageDigest: digestAt(
            runRecord.sandboxImageDigest,
            `${runPath}/sandboxImageDigest`
          ),
        }
      : {}),
  });

  const timingPath = `${path}/timing`;
  const timingRecord = recordAt(record.timing, timingPath);
  exactKeys(timingRecord, timingPath, [
    'startedAt',
    'completedAt',
    'durationMs',
  ]);
  const startedAt = instantAt(
    timingRecord.startedAt,
    `${timingPath}/startedAt`
  );
  const completedAt = instantAt(
    timingRecord.completedAt,
    `${timingPath}/completedAt`
  );
  const durationMs = safeIntegerAt(
    timingRecord.durationMs,
    `${timingPath}/durationMs`,
    0,
    86_400_000
  );
  if (
    Date.parse(completedAt) < Date.parse(startedAt) ||
    Date.parse(completedAt) - Date.parse(startedAt) !== durationMs
  ) {
    fail(timingPath, 'timing order or duration does not match');
  }
  const timing = Object.freeze({
    startedAt,
    completedAt,
    durationMs,
  });

  const resultPath = `${path}/result`;
  const resultRecord = recordAt(record.result, resultPath);
  exactKeys(resultRecord, resultPath, [
    'outcome',
    'normalizedResultDigest',
    'summary',
    'diagnosticCodes',
    'appliedExemptionIds',
  ]);
  const result = Object.freeze({
    outcome: enumAt(
      resultRecord.outcome,
      `${resultPath}/outcome`,
      ATTEMPT_OUTCOMES
    ),
    normalizedResultDigest: digestAt(
      resultRecord.normalizedResultDigest,
      `${resultPath}/normalizedResultDigest`
    ),
    summary: jsonValueAt(resultRecord.summary, `${resultPath}/summary`),
    diagnosticCodes: identifierArrayAt(
      resultRecord.diagnosticCodes,
      `${resultPath}/diagnosticCodes`,
      64
    ),
    appliedExemptionIds: identifierArrayAt(
      resultRecord.appliedExemptionIds,
      `${resultPath}/appliedExemptionIds`,
      64
    ),
  });

  const provenancePath = `${path}/provenance`;
  const provenanceRecord = recordAt(record.provenance, provenancePath);
  exactKeys(
    provenanceRecord,
    provenancePath,
    ['trust', 'producerId', 'issuedAt'],
    ['attestationDigest', 'expiresAt', 'ci']
  );
  const trust = enumAt(
    provenanceRecord.trust,
    `${provenancePath}/trust`,
    TRUST_CLASSES
  );
  const ci = Object.hasOwn(provenanceRecord, 'ci')
    ? ciIdentityAt(provenanceRecord.ci, `${provenancePath}/ci`)
    : undefined;
  if ((trust === 'ci-attested') !== Boolean(ci)) {
    fail(
      `${provenancePath}/ci`,
      'CI identity is required only for ci-attested Evidence'
    );
  }
  const provenanceIdentity = Object.freeze({
    producerId: identifierAt(
      provenanceRecord.producerId,
      `${provenancePath}/producerId`
    ),
    ...(Object.hasOwn(provenanceRecord, 'attestationDigest')
      ? {
          attestationDigest: digestAt(
            provenanceRecord.attestationDigest,
            `${provenancePath}/attestationDigest`
          ),
        }
      : {}),
    issuedAt: instantAt(
      provenanceRecord.issuedAt,
      `${provenancePath}/issuedAt`
    ),
    ...(Object.hasOwn(provenanceRecord, 'expiresAt')
      ? {
          expiresAt: instantAt(
            provenanceRecord.expiresAt,
            `${provenancePath}/expiresAt`
          ),
        }
      : {}),
  });
  const provenance =
    trust === 'ci-attested'
      ? Object.freeze({
          ...provenanceIdentity,
          trust,
          ci: ci!,
        })
      : Object.freeze({
          ...provenanceIdentity,
          trust,
        });

  const toolchain = implementationIdentityAt(
    record.toolchain,
    `${path}/toolchain`
  );
  const normalization = implementationIdentityAt(
    record.normalization,
    `${path}/normalization`
  );

  const controlsPath = `${path}/controls`;
  const controlsRecord = recordAt(record.controls, controlsPath);
  exactKeys(controlsRecord, controlsPath, ['profileDigest', 'appliedDigest']);
  const controls = Object.freeze({
    profileDigest: digestAt(
      controlsRecord.profileDigest,
      `${controlsPath}/profileDigest`
    ),
    appliedDigest: digestAt(
      controlsRecord.appliedDigest,
      `${controlsPath}/appliedDigest`
    ),
  });

  const inputsPath = `${path}/inputs`;
  const inputsRecord = recordAt(record.inputs, inputsPath);
  exactKeys(
    inputsRecord,
    inputsPath,
    ['executableSnapshotDigest', 'fixtureSetDigests', 'inputDigest'],
    ['scenarioProgramDigest', 'baselineSetDigest']
  );
  const inputs = Object.freeze({
    executableSnapshotDigest: digestAt(
      inputsRecord.executableSnapshotDigest,
      `${inputsPath}/executableSnapshotDigest`
    ),
    ...(Object.hasOwn(inputsRecord, 'scenarioProgramDigest')
      ? {
          scenarioProgramDigest: digestAt(
            inputsRecord.scenarioProgramDigest,
            `${inputsPath}/scenarioProgramDigest`
          ),
        }
      : {}),
    fixtureSetDigests: digestArrayAt(
      inputsRecord.fixtureSetDigests,
      `${inputsPath}/fixtureSetDigests`,
      64
    ),
    ...(Object.hasOwn(inputsRecord, 'baselineSetDigest')
      ? {
          baselineSetDigest: digestAt(
            inputsRecord.baselineSetDigest,
            `${inputsPath}/baselineSetDigest`
          ),
        }
      : {}),
    inputDigest: digestAt(
      inputsRecord.inputDigest,
      `${inputsPath}/inputDigest`
    ),
  });

  if (
    !Array.isArray(record.artifacts) ||
    record.artifacts.length > MAX_ARTIFACTS
  ) {
    fail(`${path}/artifacts`, 'expected a bounded artifact array');
  }
  const artifactValues = record.artifacts as unknown[];
  const artifacts = Object.freeze(
    artifactValues.map((artifact, index) =>
      artifactManifestAt(artifact, `${path}/artifacts/${index}`)
    )
  );
  if (new Set(artifacts.map(({ id }) => id)).size !== artifacts.length) {
    fail(`${path}/artifacts`, 'artifact ids must be unique');
  }
  const sourceTraceResult = decodeVerificationEvidenceSourceTraces(
    record.sourceTraces
  );
  const sourceTraces =
    sourceTraceResult.ok === true
      ? sourceTraceResult.value
      : fail(
          `${path}/sourceTraces`,
          sourceTraceResult.issues[0]?.message ??
            'expected bounded canonical source traces'
        );
  if (!sameCanonicalJson(record.sourceTraces, sourceTraces)) {
    fail(`${path}/sourceTraces`, 'expected canonical source trace order');
  }
  const sourceTraceDigest = digestAt(
    record.sourceTraceDigest,
    `${path}/sourceTraceDigest`
  );
  if (digestVerificationValue(sourceTraces) !== sourceTraceDigest) {
    fail(`${path}/sourceTraceDigest`, 'does not match canonical source traces');
  }

  return Object.freeze({
    id: identifierAt(record.id, `${path}/id`),
    projectId: identifierAt(record.projectId, `${path}/projectId`),
    workspaceId: identifierAt(record.workspaceId, `${path}/workspaceId`),
    workspaceRevision,
    partitionRevisions,
    executableSnapshotDigest: digestAt(
      record.executableSnapshotDigest,
      `${path}/executableSnapshotDigest`
    ),
    ...(scenario ? { scenario } : {}),
    policyRevision: safeIntegerAt(
      record.policyRevision,
      `${path}/policyRevision`,
      1
    ),
    policyDigest,
    impactDigest: digestAt(record.impactDigest, `${path}/impactDigest`),
    planDigest: digestAt(record.planDigest, `${path}/planDigest`),
    policyEvaluationInstant: instantAt(
      record.policyEvaluationInstant,
      `${path}/policyEvaluationInstant`
    ),
    cellId: identifierAt(record.cellId, `${path}/cellId`),
    checkId: identifierAt(record.checkId, `${path}/checkId`),
    checkKind: enumAt(record.checkKind, `${path}/checkKind`, CHECK_KINDS),
    targetId,
    attemptId: identifierAt(record.attemptId, `${path}/attemptId`),
    run,
    timing,
    result,
    provenance,
    toolchain,
    normalization,
    controls,
    inputs,
    artifacts,
    sourceTraces,
    sourceTraceDigest,
    dependencyLockDigest: digestAt(
      record.dependencyLockDigest,
      `${path}/dependencyLockDigest`
    ),
    redactionPolicyId: identifierAt(
      record.redactionPolicyId,
      `${path}/redactionPolicyId`
    ),
    targetPolicy,
    createdAt: instantAt(record.createdAt, `${path}/createdAt`),
    retention: enumAt(record.retention, `${path}/retention`, RETENTION_CLASSES),
    ...(Object.hasOwn(record, 'supersedes')
      ? { supersedes: identifierAt(record.supersedes, `${path}/supersedes`) }
      : {}),
    manifestDigest: digestAt(record.manifestDigest, `${path}/manifestDigest`),
  });
};

const evidenceRecordAt = (
  value: unknown,
  path: string
): VerificationEvidenceTransportRecord => {
  const record = recordAt(value, path);
  exactKeys(record, path, [
    'evidence',
    'artifacts',
    'verifiedView',
    'activeProtections',
  ]);
  if (
    !Array.isArray(record.artifacts) ||
    record.artifacts.length > MAX_ARTIFACTS
  ) {
    fail(`${path}/artifacts`, 'expected a bounded artifact array');
  }
  const artifactValues = record.artifacts as unknown[];
  const artifacts = Object.freeze(
    artifactValues.map((artifact, index) =>
      artifactDescriptorAt(artifact, `${path}/artifacts/${index}`)
    )
  );
  if (new Set(artifacts.map(({ id }) => id)).size !== artifacts.length) {
    fail(`${path}/artifacts`, 'artifact ids must be unique');
  }
  const evidence = evidenceAt(record.evidence, `${path}/evidence`);
  const manifestsById = new Map(
    evidence.artifacts.map((manifest) => [manifest.id, manifest])
  );
  if (
    evidence.artifacts.length !== artifacts.length ||
    artifacts.some((descriptor) => {
      const manifest = manifestsById.get(descriptor.id);
      return (
        !manifest ||
        descriptor.path !== manifest.path ||
        descriptor.kind !== manifest.kind ||
        descriptor.digest !== manifest.digest ||
        descriptor.normalizedDigest !== manifest.normalizedDigest ||
        descriptor.sourceTraceDigest !== manifest.sourceTraceDigest ||
        descriptor.size !== manifest.size ||
        descriptor.mediaType !== manifest.mediaType
      );
    })
  ) {
    fail(
      `${path}/artifacts`,
      'artifact descriptors do not match their signed Evidence manifests'
    );
  }
  const sourceTraceDigests = new Set(
    evidence.sourceTraces.map((sourceTrace) =>
      digestVerificationValue(sourceTrace)
    )
  );
  if (
    [...evidence.artifacts, ...artifacts].some(
      ({ sourceTraceDigest }) =>
        sourceTraceDigest !== undefined &&
        !sourceTraceDigests.has(sourceTraceDigest)
    )
  ) {
    fail(
      `${path}/artifacts`,
      'artifact sourceTraceDigest does not identify a persisted source trace'
    );
  }
  const activeProtectionsResult =
    decodeVerificationEvidenceRetentionProtections(record.activeProtections);
  const activeProtections =
    activeProtectionsResult.ok === true
      ? activeProtectionsResult.value
      : fail(
          `${path}/activeProtections`,
          activeProtectionsResult.issues[0]?.message ??
            'expected bounded active retention protections'
        );
  if (
    !sameCanonicalJson(record.activeProtections, activeProtections) ||
    activeProtections.some(({ evidenceId }) => evidenceId !== evidence.id)
  ) {
    fail(
      `${path}/activeProtections`,
      'expected canonical active protections for this Evidence'
    );
  }
  const verifiedView = decodeVerificationEvidenceVerifiedViewRecordAt(
    record.verifiedView,
    `${path}/verifiedView`
  );
  const descriptorsById = new Map(
    artifacts.map((artifact) => [artifact.id, artifact])
  );
  if (
    verifiedView.evidenceId !== evidence.id ||
    verifiedView.manifestDigest !== evidence.manifestDigest ||
    verifiedView.materializedEvidenceDigest !==
      digestVerificationValue(evidence) ||
    verifiedView.artifacts.length !== artifacts.length ||
    verifiedView.artifacts.some((availability) => {
      const descriptor = descriptorsById.get(availability.artifactId);
      return (
        descriptor?.digest !== availability.digest ||
        (descriptor.availability !== availability.status &&
          !(
            descriptor.availability === 'missing' &&
            availability.status === 'deleted'
          ))
      );
    })
  ) {
    fail(
      `${path}/verifiedView`,
      'does not match its materialized Evidence record'
    );
  }
  return Object.freeze({
    evidence,
    artifacts,
    verifiedView,
    activeProtections,
  });
};

const recordsAt = (
  value: unknown,
  path: string
): readonly VerificationEvidenceTransportRecord[] => {
  if (!Array.isArray(value) || value.length > MAX_PAGE_RECORDS) {
    fail(path, 'expected a bounded Evidence record array');
  }
  const candidates = value as unknown[];
  const records = candidates.map((record, index) =>
    evidenceRecordAt(record, `${path}/${index}`)
  );
  const ids = records.map(({ evidence }) => evidence.id);
  if (new Set(ids).size !== ids.length) {
    fail(path, 'Evidence ids must be unique');
  }
  return Object.freeze(records);
};

export const decodeVerificationEvidencePage = (
  value: unknown
): VerificationEvidencePage => {
  const record = recordAt(value, '/');
  exactKeys(record, '/', ['records'], ['nextCursor']);
  return Object.freeze({
    records: recordsAt(record.records, '/records'),
    ...(Object.hasOwn(record, 'nextCursor')
      ? {
          nextCursor: nonEmptyStringAt(record.nextCursor, '/nextCursor', 2048),
        }
      : {}),
  });
};

export const decodeVerificationEvidenceDetail = (
  value: unknown
): VerificationEvidenceTransportRecord => {
  const record = recordAt(value, '/');
  exactKeys(record, '/', ['record']);
  return evidenceRecordAt(record.record, '/record');
};
