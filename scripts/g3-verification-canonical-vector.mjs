import {
  createVerificationEvidenceManifest,
  digestVerificationValue,
  projectVerificationEvidenceManifest,
  serializeVerificationValue,
  validateVerificationEvidenceCandidate,
} from '../packages/verification/src/index.ts';

const repeatedDigest = (character) => `sha256-${character.repeat(64)}`;

/**
 * One secret-free current-model vector shared by the TypeScript contract and
 * the Go persistence boundary. Keep the values explicit so field additions
 * cannot silently inherit implementation defaults on either side.
 */
export const createG3VerificationCanonicalVector = () => {
  const summary = Object.freeze({
    decimal: 1.25,
    integer: 9_007_199_254_740_991,
    tiny: 0.000001,
    é: 'café',
    '😀': '雪',
  });
  const resultWithoutDigest = Object.freeze({
    outcome: 'passed',
    summary,
    diagnosticCodes: Object.freeze([]),
    appliedExemptionIds: Object.freeze([]),
  });
  const result = Object.freeze({
    ...resultWithoutDigest,
    normalizedResultDigest: digestVerificationValue(resultWithoutDigest),
  });
  const sourceTraces = Object.freeze([
    Object.freeze({
      sourceRef: Object.freeze({
        kind: 'verification-plan-cell',
        planDigest: repeatedDigest('d'),
        cellId: 'cell-vector',
      }),
      label: '向量',
    }),
  ]);
  const candidateWithoutDigest = Object.freeze({
    candidateId: 'candidate-vector',
    projectId: 'project-vector',
    workspaceId: 'workspace-vector',
    workspaceRevision: 0,
    partitionRevisions: Object.freeze({
      workspaceRev: 0,
      routeRev: 0,
      opSeq: 0,
      documentRevisions: Object.freeze({}),
    }),
    executableSnapshotDigest: repeatedDigest('a'),
    policyRevision: 0,
    policyDigest: repeatedDigest('b'),
    impactDigest: repeatedDigest('c'),
    planDigest: repeatedDigest('d'),
    policyEvaluationInstant: '2026-07-28T00:00:00.000Z',
    cellId: 'cell-vector',
    checkId: 'check-vector',
    checkKind: 'unit',
    targetId: 'target-vector',
    attemptId: 'attempt-vector',
    run: Object.freeze({
      runId: 'run-vector',
      providerId: 'provider-vector',
      surface: 'preview',
      frameworkTarget: 'react-vite',
      runtimeZone: 'browser',
      viewport: Object.freeze({
        id: 'viewport-vector',
        width: 1280,
        height: 720,
      }),
      devicePixelRatio: 1.25,
      colorScheme: 'dark',
      motion: 'reduced',
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      fontSetDigest: repeatedDigest('e'),
    }),
    timing: Object.freeze({
      startedAt: '2026-07-28T00:00:00.000Z',
      completedAt: '2026-07-28T00:00:01.250Z',
      durationMs: 1250,
    }),
    result,
    provenance: Object.freeze({
      origin: 'local',
      producerId: 'producer-vector',
      providerId: 'provider-vector',
      issuedAt: '2026-07-28T00:00:01.250Z',
      expiresAt: '2026-07-29T00:00:00.000Z',
    }),
    toolchain: Object.freeze({
      packageName: '@prodivix/vector',
      packageVersion: '1.2.3',
      buildDigest: repeatedDigest('f'),
      toolchainDigest: repeatedDigest('1'),
      schemaDigest: repeatedDigest('2'),
    }),
    normalization: Object.freeze({
      packageName: '@prodivix/verification-normalizer',
      packageVersion: '1.0.0',
      buildDigest: repeatedDigest('9'),
      toolchainDigest: repeatedDigest('a'),
      schemaDigest: repeatedDigest('b'),
    }),
    controls: Object.freeze({
      profileDigest: repeatedDigest('3'),
      appliedDigest: repeatedDigest('4'),
    }),
    inputs: Object.freeze({
      executableSnapshotDigest: repeatedDigest('a'),
      fixtureSetDigests: Object.freeze([]),
      inputDigest: repeatedDigest('5'),
    }),
    artifacts: Object.freeze([
      Object.freeze({
        id: 'artifact-vector',
        path: 'traces/vector.json',
        stagingArtifactId: 'staging-vector',
        kind: 'trace',
        expectedDigest: repeatedDigest('6'),
        expectedSize: 128,
        expectedMediaType: 'application/json',
        sourceTraceDigest: digestVerificationValue(sourceTraces[0]),
      }),
    ]),
    sourceTraces,
    sourceTraceDigest: digestVerificationValue(sourceTraces),
    dependencyLockDigest: repeatedDigest('7'),
    redaction: Object.freeze({
      policyId: 'redaction-vector',
      scannerSetDigest: repeatedDigest('8'),
      droppedFieldCounts: Object.freeze({ 字段: 1 }),
      targetPolicy: Object.freeze({
        authority: 'verification-policy',
        policyDigest: repeatedDigest('b'),
        semanticTargetId: 'target-vector',
        capture: 'allowed',
      }),
      safe: true,
    }),
    requestedRetention: 'session',
    promotion: Object.freeze({
      idempotencyKey: 'idempotency-key-1',
      deadline: '2026-07-28T00:10:00.000Z',
    }),
  });
  const candidate = Object.freeze({
    ...candidateWithoutDigest,
    candidateDigest: digestVerificationValue(candidateWithoutDigest),
  });
  const validation = validateVerificationEvidenceCandidate(candidate);
  if (validation.status !== 'ready') {
    throw new Error(
      `Backend canonical Candidate is invalid: ${JSON.stringify(validation.issues)}`
    );
  }

  const evidenceId = 'evidence-vector';
  const createdAt = '2026-07-28T00:00:02.000Z';
  const retention = candidate.requestedRetention;
  const artifacts = Object.freeze([
    Object.freeze({
      id: 'artifact-vector',
      path: 'traces/vector.json',
      kind: 'trace',
      digest: repeatedDigest('6'),
      normalizedDigest: repeatedDigest('0'),
      sourceTraceDigest: digestVerificationValue(sourceTraces[0]),
      size: 128,
      mediaType: 'application/json',
    }),
  ]);
  const manifestResult = createVerificationEvidenceManifest({
    candidate,
    evidenceId,
    createdAt,
    artifacts,
  });
  if (manifestResult.status !== 'ready') {
    throw new Error(
      `Backend canonical manifest is invalid: ${manifestResult.reasonCode} ${manifestResult.message}`
    );
  }
  const evidence = projectVerificationEvidenceManifest(manifestResult.manifest);
  return Object.freeze({
    format: 'prodivix.verification-canonical-vector',
    version: 1,
    evidenceId,
    createdAt,
    retention,
    canonicalJson: serializeVerificationValue(summary),
    candidate,
    artifacts,
    expected: Object.freeze({
      normalizedResultDigest: result.normalizedResultDigest,
      candidateDigest: candidate.candidateDigest,
      statementDigest: manifestResult.manifest.statementDigest,
      manifestDigest: manifestResult.manifest.manifestDigest,
      materializedEvidenceDigest: digestVerificationValue(evidence),
    }),
  });
};
