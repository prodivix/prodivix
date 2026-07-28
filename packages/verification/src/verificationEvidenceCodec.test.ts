import { describe, expect, it } from 'vitest';
import { digestVerificationValue } from './verificationCanonical';
import {
  decodeVerificationEvidenceCandidate,
  encodeVerificationEvidenceCandidate,
  normalizeVerificationEvidenceCandidate,
  validateVerificationEvidenceCandidate,
  VERIFICATION_EVIDENCE_CANDIDATE_WIRE_VERSION,
  VERIFICATION_EVIDENCE_CODEC_LIMITS,
  verificationEvidenceCandidateWireSchema,
  type VerificationEvidenceCandidateWire,
} from './verificationEvidenceCodec';
import type {
  VerificationEvidenceCandidate,
  VerificationEvidenceSourceTrace,
} from './verification.types';

type Mutable<T> = T extends readonly (infer Entry)[]
  ? Mutable<Entry>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

const sha = (hex: string): string => `sha256-${hex.repeat(64)}`;

const resultWithDigest = (): VerificationEvidenceCandidate['result'] => {
  const resultWithoutDigest = {
    outcome: 'failed' as const,
    summary: {
      ordered: ['second', 'first'],
      detail: { z: 2, a: 1 },
    },
    diagnosticCodes: ['BHV-4001', 'VER-4002'],
    appliedExemptionIds: ['exemption:a', 'exemption:b'],
  };
  return {
    outcome: resultWithoutDigest.outcome,
    normalizedResultDigest: digestVerificationValue(resultWithoutDigest),
    summary: resultWithoutDigest.summary,
    diagnosticCodes: resultWithoutDigest.diagnosticCodes,
    appliedExemptionIds: resultWithoutDigest.appliedExemptionIds,
  };
};

const makeCandidate = (): VerificationEvidenceCandidate => {
  const sourceTraces = [
    {
      sourceRef: {
        kind: 'code-artifact',
        artifactId: 'artifact:checkout',
      },
      sourceSpan: {
        artifactId: 'artifact:checkout',
        startLine: 10,
        startColumn: 3,
        endLine: 12,
        endColumn: 8,
      },
      label: 'Checkout assertion',
    },
    {
      sourceRef: {
        kind: 'verification-plan-cell',
        planDigest: sha('f'),
        cellId: 'cell:checkout',
      },
      label: 'Verification plan cell',
    },
  ] satisfies readonly VerificationEvidenceSourceTrace[];
  const candidateWithoutDigest = {
    candidateId: 'candidate:1',
    projectId: 'project:1',
    workspaceId: 'workspace:1',
    workspaceRevision: 42,
    partitionRevisions: {
      workspaceRev: 42,
      routeRev: 8,
      opSeq: 99,
      documentRevisions: {
        'document:a': { contentRev: 3, metaRev: 1 },
        'document:b': { contentRev: 5, metaRev: 2 },
      },
    },
    executableSnapshotDigest: sha('a'),
    scenario: {
      id: 'scenario:checkout',
      revision: 7,
      digest: sha('b'),
      programDigest: sha('c'),
    },
    policyRevision: 4,
    policyDigest: sha('d'),
    impactDigest: sha('e'),
    planDigest: sha('f'),
    policyEvaluationInstant: '2026-07-28T00:00:00.000Z',
    cellId: 'cell:checkout',
    checkId: 'check:e2e',
    checkKind: 'e2e' as const,
    targetId: 'target:react-vite',
    attemptId: 'attempt:1',
    run: {
      runId: 'run:1',
      providerId: 'provider:ci',
      jobId: 'job:1',
      sessionId: 'session:1',
      surface: 'ci' as const,
      frameworkTarget: 'react-vite',
      runtimeZone: 'browser',
      browserEngine: 'chromium' as const,
      operatingSystemIdentity: 'linux-x64',
      viewport: { id: 'desktop', width: 1_440, height: 900 },
      devicePixelRatio: 2,
      colorScheme: 'dark' as const,
      motion: 'reduced' as const,
      locale: 'en-US',
      timezone: 'Etc/UTC',
      fontSetDigest: sha('1'),
      sandboxImageDigest: sha('2'),
    },
    timing: {
      startedAt: '2026-07-28T00:01:00.000Z',
      completedAt: '2026-07-28T00:01:02.000Z',
      durationMs: 2_000,
    },
    result: resultWithDigest(),
    provenance: {
      origin: 'ci' as const,
      producerId: 'producer:ci',
      providerId: 'provider:ci',
      issuedAt: '2026-07-28T00:01:03.000Z',
      expiresAt: '2026-07-29T00:01:03.000Z',
      ci: {
        repository: 'prodivix/prodivix',
        ref: 'refs/heads/main',
        commit: sha('a'),
      },
    },
    toolchain: {
      packageName: '@prodivix/verification-adapter',
      packageVersion: '1.2.3',
      buildDigest: sha('4'),
      toolchainDigest: sha('5'),
      schemaDigest: sha('6'),
    },
    normalization: {
      packageName: '@prodivix/verification',
      packageVersion: '0.0.1',
      buildDigest: sha('1'),
      toolchainDigest: sha('2'),
      schemaDigest: sha('3'),
    },
    controls: {
      profileDigest: sha('7'),
      appliedDigest: sha('8'),
    },
    inputs: {
      executableSnapshotDigest: sha('a'),
      scenarioProgramDigest: sha('c'),
      fixtureSetDigests: [sha('9'), sha('a')],
      baselineSetDigest: sha('b'),
      inputDigest: sha('c'),
    },
    artifacts: [
      {
        id: 'artifact:a',
        path: 'screenshots/actual.png',
        stagingArtifactId: 'staging:a',
        kind: 'screenshot' as const,
        expectedDigest: sha('d'),
        expectedSize: 1_024,
        expectedMediaType: 'image/png',
        sourceTraceDigest: digestVerificationValue(sourceTraces[0]),
      },
      {
        id: 'artifact:b',
        path: 'reports/accessibility.json',
        stagingArtifactId: 'staging:b',
        kind: 'accessibility-report' as const,
        expectedDigest: sha('f'),
        expectedSize: 2_048,
        expectedMediaType: 'application/json',
      },
    ],
    sourceTraces,
    sourceTraceDigest: digestVerificationValue(sourceTraces),
    dependencyLockDigest: sha('f'),
    redaction: {
      policyId: 'redaction:default',
      scannerSetDigest: sha('0'),
      droppedFieldCounts: {
        '/headers/authorization': 1,
        '/headers/cookie': 2,
      },
      targetPolicy: {
        authority: 'verification-policy' as const,
        policyDigest: sha('d'),
        semanticTargetId: 'target:react-vite',
        capture: 'masked' as const,
      },
      safe: true as const,
    },
    requestedRetention: 'change' as const,
    promotion: {
      idempotencyKey: 'promotion:attempt-1',
      deadline: '2026-07-28T00:10:00.000Z',
    },
  } satisfies Omit<VerificationEvidenceCandidate, 'candidateDigest'>;
  return {
    ...candidateWithoutDigest,
    candidateDigest: digestVerificationValue(candidateWithoutDigest),
  };
};

const mutableWire = (): Mutable<VerificationEvidenceCandidateWire> =>
  structuredClone(
    encodeVerificationEvidenceCandidate(makeCandidate())
  ) as unknown as Mutable<VerificationEvidenceCandidateWire>;

const recomputeCandidateDigest = (
  candidate: Mutable<VerificationEvidenceCandidateWire>
): void => {
  const {
    candidateDigest: _candidateDigest,
    wireVersion: _wireVersion,
    ...withoutDigest
  } = candidate;
  candidate.candidateDigest = digestVerificationValue(withoutDigest);
};

const issuePaths = (
  result: ReturnType<typeof decodeVerificationEvidenceCandidate>
): readonly string[] =>
  result.status === 'invalid' ? result.issues.map(({ path }) => path) : [];

describe('VerificationEvidenceCandidate codec', () => {
  it('exports the immutable v1 schema and keeps its canonical schema digest stable', () => {
    expect(VERIFICATION_EVIDENCE_CANDIDATE_WIRE_VERSION).toBe(1);
    expect(verificationEvidenceCandidateWireSchema).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://prodivix.dev/schemas/verification/evidence-candidate/v1.json',
      required: expect.arrayContaining([
        'wireVersion',
        'normalization',
        'sourceTraces',
        'candidateDigest',
      ]),
      properties: {
        wireVersion: { const: 1 },
      },
      additionalProperties: false,
    });
    expect(
      digestVerificationValue(verificationEvidenceCandidateWireSchema)
    ).toBe(
      'sha256-20cd48d26478de2474c9928eedab1b6706e3b5c89820d50aa2dbba8bbbed47da'
    );
  });

  it('round-trips the strict wire model and strips wireVersion from current domain state', () => {
    const candidate = makeCandidate();
    const wire = encodeVerificationEvidenceCandidate(candidate);
    expect(wire.wireVersion).toBe(1);

    const decoded = decodeVerificationEvidenceCandidate(wire);
    expect(decoded.status).toBe('ready');
    if (decoded.status !== 'ready') return;
    expect(decoded.candidate).toEqual(candidate);
    expect(Object.hasOwn(decoded.candidate, 'wireVersion')).toBe(false);
    expect(Object.isFrozen(decoded.candidate)).toBe(true);
    expect(validateVerificationEvidenceCandidate(decoded.candidate)).toEqual(
      decoded
    );
    expect(normalizeVerificationEvidenceCandidate(decoded.candidate)).toEqual(
      candidate
    );
  });

  it('sorts only semantic sets/maps and the artifact manifest while preserving report arrays', () => {
    const wire = mutableWire();
    wire.result.diagnosticCodes.reverse();
    wire.result.appliedExemptionIds.reverse();
    wire.inputs.fixtureSetDigests.reverse();
    wire.artifacts.reverse();
    wire.sourceTraces.reverse();
    wire.partitionRevisions.documentRevisions = {
      'document:b': { contentRev: 5, metaRev: 2 },
      'document:a': { contentRev: 3, metaRev: 1 },
    };
    wire.redaction.droppedFieldCounts = {
      '/headers/cookie': 2,
      '/headers/authorization': 1,
    };

    const decoded = decodeVerificationEvidenceCandidate(wire);
    expect(decoded.status).toBe('ready');
    if (decoded.status !== 'ready') return;
    expect(decoded.candidate.result.diagnosticCodes).toEqual([
      'BHV-4001',
      'VER-4002',
    ]);
    expect(decoded.candidate.result.appliedExemptionIds).toEqual([
      'exemption:a',
      'exemption:b',
    ]);
    expect(decoded.candidate.inputs.fixtureSetDigests).toEqual([
      sha('9'),
      sha('a'),
    ]);
    expect(decoded.candidate.artifacts.map(({ id }) => id)).toEqual([
      'artifact:a',
      'artifact:b',
    ]);
    expect(
      decoded.candidate.sourceTraces.map(({ sourceRef }) => sourceRef.kind)
    ).toEqual(['code-artifact', 'verification-plan-cell']);
    expect(
      (
        decoded.candidate.result.summary as {
          readonly ordered: readonly string[];
        }
      ).ordered
    ).toEqual(['second', 'first']);
    expect(
      Object.keys(decoded.candidate.partitionRevisions.documentRevisions)
    ).toEqual(['document:a', 'document:b']);
    expect(Object.keys(decoded.candidate.redaction.droppedFieldCounts)).toEqual(
      ['/headers/authorization', '/headers/cookie']
    );
  });

  it('binds confirmed source traces to their canonical digest', () => {
    const tampered = mutableWire();
    tampered.sourceTraces[0]!.label = 'Tampered assertion';
    expect(issuePaths(decodeVerificationEvidenceCandidate(tampered))).toContain(
      '/sourceTraceDigest'
    );

    const reversedSpan = mutableWire();
    reversedSpan.sourceTraces[0]!.sourceSpan!.endLine = 9;
    expect(
      issuePaths(decodeVerificationEvidenceCandidate(reversedSpan))
    ).toContain('/sourceTraces/0/sourceSpan/endLine');

    const missingArtifactTrace = mutableWire();
    missingArtifactTrace.artifacts[0]!.sourceTraceDigest = sha('0');
    recomputeCandidateDigest(missingArtifactTrace);
    expect(
      issuePaths(decodeVerificationEvidenceCandidate(missingArtifactTrace))
    ).toContain('/artifacts/0/sourceTraceDigest');
  });

  it('rejects source excerpts, unknown fields, unsafe keys, and non-NFC labels', () => {
    const excerpt = mutableWire();
    const trace = excerpt.sourceTraces[0] as (typeof excerpt.sourceTraces)[0] &
      Record<string, unknown>;
    trace.excerpt = 'const secret = process.env.TOKEN';
    expect(issuePaths(decodeVerificationEvidenceCandidate(excerpt))).toContain(
      '/sourceTraces/0/excerpt'
    );

    const rawSource = mutableWire();
    const sourceRef = rawSource.sourceTraces[0]!
      .sourceRef as (typeof rawSource.sourceTraces)[0]['sourceRef'] &
      Record<string, unknown>;
    sourceRef.source = 'raw source text';
    expect(
      issuePaths(decodeVerificationEvidenceCandidate(rawSource))
    ).toContain('/sourceTraces/0/sourceRef/source');

    const unsafe = mutableWire();
    Object.defineProperty(unsafe.sourceTraces[0]!.sourceRef, '__proto__', {
      configurable: true,
      enumerable: true,
      value: 'blocked',
    });
    expect(issuePaths(decodeVerificationEvidenceCandidate(unsafe))).toContain(
      '/sourceTraces/0/sourceRef/__proto__'
    );

    const nonNfc = mutableWire();
    nonNfc.sourceTraces[0]!.label = 'Cafe\u0301';
    expect(issuePaths(decodeVerificationEvidenceCandidate(nonNfc))).toContain(
      '/sourceTraces/0/label'
    );

    const loneSurrogate = mutableWire();
    loneSurrogate.sourceTraces[0]!.label = '\ud800';
    expect(
      issuePaths(decodeVerificationEvidenceCandidate(loneSurrogate))
    ).toContain('/sourceTraces/0/label');
  });

  it('enforces source trace count and UTF-8 byte budgets', () => {
    const empty = mutableWire();
    empty.sourceTraces = [];
    empty.sourceTraceDigest = digestVerificationValue(empty.sourceTraces);
    recomputeCandidateDigest(empty);
    expect(issuePaths(decodeVerificationEvidenceCandidate(empty))).toContain(
      '/sourceTraces'
    );

    const count = mutableWire();
    const trace = structuredClone(count.sourceTraces[0]!);
    count.sourceTraces = Array.from(
      {
        length: VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSourceTraces + 1,
      },
      () => structuredClone(trace)
    );
    expect(issuePaths(decodeVerificationEvidenceCandidate(count))).toContain(
      '/sourceTraces'
    );

    const labelBytes = mutableWire();
    labelBytes.sourceTraces[0]!.label = '界'.repeat(
      Math.floor(
        VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSourceTraceLabelBytes / 3
      ) + 1
    );
    expect(
      issuePaths(decodeVerificationEvidenceCandidate(labelBytes))
    ).toContain('/sourceTraces/0/label');

    const totalBytes = mutableWire();
    const largeTrace = structuredClone(totalBytes.sourceTraces[0]!);
    largeTrace.label = 'x'.repeat(
      VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSourceTraceLabelBytes - 24
    );
    totalBytes.sourceTraces = Array.from(
      { length: VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSourceTraces },
      () => structuredClone(largeTrace)
    );
    expect(
      issuePaths(decodeVerificationEvidenceCandidate(totalBytes))
    ).toContain('/sourceTraces');
  });

  it('rejects missing, legacy, and future wire versions plus unknown fields', () => {
    const missingVersion = mutableWire() as Partial<
      Mutable<VerificationEvidenceCandidateWire>
    >;
    delete missingVersion.wireVersion;
    expect(
      issuePaths(decodeVerificationEvidenceCandidate(missingVersion))
    ).toContain('/wireVersion');

    const future = mutableWire();
    future.wireVersion = 2 as 1;
    expect(issuePaths(decodeVerificationEvidenceCandidate(future))).toContain(
      '/wireVersion'
    );

    const unknown =
      mutableWire() as Mutable<VerificationEvidenceCandidateWire> &
        Record<string, unknown>;
    unknown.legacyPassed = true;
    expect(issuePaths(decodeVerificationEvidenceCandidate(unknown))).toContain(
      '/legacyPassed'
    );
  });

  it('rejects unknown nested keys and accessor-backed fields', () => {
    const unknown = mutableWire();
    const viewport = unknown.run.viewport as typeof unknown.run.viewport &
      Record<string, unknown>;
    viewport.depth = 10;
    expect(issuePaths(decodeVerificationEvidenceCandidate(unknown))).toContain(
      '/run/viewport/depth'
    );

    const accessor = mutableWire();
    Object.defineProperty(accessor.run, 'runtimeZone', {
      enumerable: true,
      get: () => 'browser',
    });
    expect(issuePaths(decodeVerificationEvidenceCandidate(accessor))).toContain(
      '/run/runtimeZone'
    );

    const unknownNormalization = mutableWire();
    const normalization =
      unknownNormalization.normalization as typeof unknownNormalization.normalization &
        Record<string, unknown>;
    normalization.runtime = 'node';
    expect(
      issuePaths(decodeVerificationEvidenceCandidate(unknownNormalization))
    ).toContain('/normalization/runtime');
  });

  it('requires full lowercase sha256 values and recomputes the candidate digest', () => {
    const malformed = mutableWire();
    malformed.policyDigest = 'sha256-short';
    expect(
      issuePaths(decodeVerificationEvidenceCandidate(malformed))
    ).toContain('/policyDigest');

    const mismatch = mutableWire();
    mismatch.candidateId = 'candidate:other';
    expect(issuePaths(decodeVerificationEvidenceCandidate(mismatch))).toContain(
      '/candidateDigest'
    );

    const normalizationTamper = mutableWire();
    normalizationTamper.normalization.schemaDigest = sha('0');
    expect(
      issuePaths(decodeVerificationEvidenceCandidate(normalizationTamper))
    ).toContain('/candidateDigest');
  });

  it('recomputes the normalized result digest independently of candidateDigest', () => {
    const wire = mutableWire();
    wire.result.normalizedResultDigest = sha('0');
    recomputeCandidateDigest(wire);
    expect(issuePaths(decodeVerificationEvidenceCandidate(wire))).toContain(
      '/result/normalizedResultDigest'
    );
  });

  it.each([
    ['id', 'artifact:a'],
    ['path', 'screenshots/actual.png'],
    ['stagingArtifactId', 'staging:a'],
  ] as const)(
    'rejects duplicate artifact %s identities',
    (field, duplicate) => {
      const wire = mutableWire();
      wire.artifacts[1]![field] = duplicate;
      expect(decodeVerificationEvidenceCandidate(wire)).toMatchObject({
        status: 'invalid',
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: 'VER-4002',
            path: '/artifacts',
          }),
        ]),
      });
    }
  );

  it.each([
    '../secret.txt',
    '/absolute/report.json',
    'reports\\windows.json',
    'reports/./report.json',
    'reports//report.json',
  ])('rejects non-canonical artifact path %s', (path) => {
    const wire = mutableWire();
    wire.artifacts[0]!.path = path;
    expect(issuePaths(decodeVerificationEvidenceCandidate(wire))).toContain(
      '/artifacts/0/path'
    );
  });

  it('rejects non-NFC strings and unsafe dynamic object keys', () => {
    const nonNfc = mutableWire();
    nonNfc.toolchain.packageName = 'adapter-e\u0301';
    expect(issuePaths(decodeVerificationEvidenceCandidate(nonNfc))).toContain(
      '/toolchain/packageName'
    );

    const unsafe = mutableWire();
    unsafe.redaction.droppedFieldCounts = JSON.parse(
      '{"__proto__":1}'
    ) as Record<string, number>;
    expect(issuePaths(decodeVerificationEvidenceCandidate(unsafe))).toContain(
      '/redaction/droppedFieldCounts/__proto__'
    );

    const unsafeSummary = mutableWire();
    unsafeSummary.result.summary = JSON.parse(
      '{"__proto__":"blocked"}'
    ) as unknown as typeof unsafeSummary.result.summary;
    expect(decodeVerificationEvidenceCandidate(unsafeSummary)).toMatchObject({
      status: 'invalid',
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'VER-4002' }),
      ]),
    });

    const loneSurrogateValue = mutableWire();
    loneSurrogateValue.result.summary = '\ud800';
    expect(
      issuePaths(decodeVerificationEvidenceCandidate(loneSurrogateValue))
    ).toContain('/result/summary');

    const loneSurrogateKey = mutableWire();
    const summaryWithInvalidKey: Record<string, string> = Object.create(null);
    summaryWithInvalidKey['\ud800'] = 'blocked';
    loneSurrogateKey.result.summary =
      summaryWithInvalidKey as typeof loneSurrogateKey.result.summary;
    expect(
      issuePaths(decodeVerificationEvidenceCandidate(loneSurrogateKey))
    ).toContain('/result/summary');

    const astral = mutableWire();
    astral.result.summary = { '😀': '雪' };
    astral.result.normalizedResultDigest = digestVerificationValue({
      outcome: astral.result.outcome,
      summary: astral.result.summary,
      diagnosticCodes: astral.result.diagnosticCodes,
      appliedExemptionIds: astral.result.appliedExemptionIds,
    });
    recomputeCandidateDigest(astral);
    expect(decodeVerificationEvidenceCandidate(astral)).toMatchObject({
      status: 'ready',
    });
  });

  it('enforces count, depth, string, and canonical byte budgets', () => {
    const count = mutableWire();
    count.result.diagnosticCodes = Array.from(
      {
        length: VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumDiagnosticCodes + 1,
      },
      (_value, index) => `D-${index}`
    );
    expect(decodeVerificationEvidenceCandidate(count)).toMatchObject({
      status: 'invalid',
    });

    const depth = mutableWire();
    let nested: unknown = 'leaf';
    for (
      let index = 0;
      index < VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSummaryDepth + 2;
      index += 1
    ) {
      nested = [nested];
    }
    depth.result.summary = nested as typeof depth.result.summary;
    expect(decodeVerificationEvidenceCandidate(depth)).toMatchObject({
      status: 'invalid',
    });

    const string = mutableWire();
    string.result.summary = 'a'.repeat(
      VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSummaryStringBytes + 1
    );
    expect(decodeVerificationEvidenceCandidate(string)).toMatchObject({
      status: 'invalid',
    });

    const bytes = mutableWire();
    bytes.result.summary = Array.from({ length: 9 }, () =>
      'a'.repeat(VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSummaryStringBytes)
    );
    expect(decodeVerificationEvidenceCandidate(bytes)).toMatchObject({
      status: 'invalid',
    });
  });

  it('rejects non-finite numbers, unsafe integers, and inconsistent duration', () => {
    const nonFinite = mutableWire();
    nonFinite.run.devicePixelRatio = Number.POSITIVE_INFINITY;
    expect(
      issuePaths(decodeVerificationEvidenceCandidate(nonFinite))
    ).toContain('/run/devicePixelRatio');

    const unsafe = mutableWire();
    unsafe.artifacts[0]!.expectedSize = Number.MAX_SAFE_INTEGER + 1;
    expect(issuePaths(decodeVerificationEvidenceCandidate(unsafe))).toContain(
      '/artifacts/0/expectedSize'
    );

    const unsafeSummary = mutableWire();
    unsafeSummary.result.summary = {
      unsafeInteger: Number.MAX_SAFE_INTEGER + 1,
    };
    expect(
      issuePaths(decodeVerificationEvidenceCandidate(unsafeSummary))
    ).toContain('/result/summary/unsafeInteger');

    const duration = mutableWire();
    duration.timing.durationMs = 1;
    expect(issuePaths(decodeVerificationEvidenceCandidate(duration))).toContain(
      '/timing'
    );
  });

  it('rejects reversed run, provenance, expiry, and promotion instants', () => {
    const run = mutableWire();
    run.timing.completedAt = '2026-07-27T23:59:59.000Z';
    expect(issuePaths(decodeVerificationEvidenceCandidate(run))).toContain(
      '/timing'
    );

    const issued = mutableWire();
    issued.provenance.issuedAt = '2026-07-28T00:00:59.000Z';
    expect(issuePaths(decodeVerificationEvidenceCandidate(issued))).toContain(
      '/provenance/issuedAt'
    );

    const expiry = mutableWire();
    expiry.provenance.expiresAt = '2026-07-28T00:01:03.000Z';
    expect(issuePaths(decodeVerificationEvidenceCandidate(expiry))).toContain(
      '/provenance/expiresAt'
    );

    const deadline = mutableWire();
    deadline.promotion.deadline = '2026-07-28T00:01:03.000Z';
    expect(issuePaths(decodeVerificationEvidenceCandidate(deadline))).toContain(
      '/promotion/deadline'
    );
  });

  it('rejects snapshot, provider, and scenario identity drift', () => {
    const snapshot = mutableWire();
    snapshot.inputs.executableSnapshotDigest = sha('0');
    expect(issuePaths(decodeVerificationEvidenceCandidate(snapshot))).toContain(
      '/inputs/executableSnapshotDigest'
    );

    const provider = mutableWire();
    provider.provenance.providerId = 'provider:other';
    expect(issuePaths(decodeVerificationEvidenceCandidate(provider))).toContain(
      '/provenance/providerId'
    );

    const scenario = mutableWire();
    scenario.inputs.scenarioProgramDigest = sha('0');
    expect(issuePaths(decodeVerificationEvidenceCandidate(scenario))).toContain(
      '/inputs/scenarioProgramDigest'
    );
  });

  it('rejects attestation presentation digests as unknown Candidate provenance', () => {
    for (const origin of ['ci', 'remote'] as const) {
      const candidate = mutableWire();
      candidate.provenance.origin = origin;
      if (origin === 'remote') delete candidate.provenance.ci;
      const provenance = candidate.provenance as typeof candidate.provenance &
        Record<string, unknown>;
      provenance.attestationPresentationDigest = sha('3');
      expect(
        issuePaths(decodeVerificationEvidenceCandidate(candidate))
      ).toContain('/provenance/attestationPresentationDigest');
    }

    const remote = mutableWire();
    remote.provenance.origin = 'remote';
    delete remote.provenance.ci;
    recomputeCandidateDigest(remote);
    expect(decodeVerificationEvidenceCandidate(remote)).toMatchObject({
      status: 'ready',
    });
  });

  it('binds exact CI repository identity only to CI provenance', () => {
    const sha1 = mutableWire();
    sha1.provenance.ci!.commit = `sha1-${'a'.repeat(40)}`;
    recomputeCandidateDigest(sha1);
    expect(decodeVerificationEvidenceCandidate(sha1)).toMatchObject({
      status: 'ready',
    });

    const missing = mutableWire();
    delete missing.provenance.ci;
    expect(issuePaths(decodeVerificationEvidenceCandidate(missing))).toContain(
      '/provenance/ci'
    );

    const nonCi = mutableWire();
    nonCi.provenance.origin = 'remote';
    expect(issuePaths(decodeVerificationEvidenceCandidate(nonCi))).toContain(
      '/provenance/ci'
    );

    const malformedCommit = mutableWire();
    malformedCommit.provenance.ci!.commit = 'sha1-ABC';
    expect(
      issuePaths(decodeVerificationEvidenceCandidate(malformedCommit))
    ).toContain('/provenance/ci/commit');

    const nonCanonicalRef = mutableWire();
    nonCanonicalRef.provenance.ci!.ref = ' refs/heads/main';
    expect(
      issuePaths(decodeVerificationEvidenceCandidate(nonCanonicalRef))
    ).toContain('/provenance/ci/ref');

    const shortRef = mutableWire();
    shortRef.provenance.ci!.ref = 'main';
    expect(issuePaths(decodeVerificationEvidenceCandidate(shortRef))).toContain(
      '/provenance/ci/ref'
    );

    for (const ref of [
      'refs/heads/a..b',
      'refs/heads/a@{b',
      'refs/heads/a b',
      'refs/heads/a/',
    ]) {
      const invalidRef = mutableWire();
      invalidRef.provenance.ci!.ref = ref;
      expect(
        issuePaths(decodeVerificationEvidenceCandidate(invalidRef))
      ).toContain('/provenance/ci/ref');
    }

    const invalidRepository = mutableWire();
    invalidRepository.provenance.ci!.repository = 'prodivix';
    expect(
      issuePaths(decodeVerificationEvidenceCandidate(invalidRepository))
    ).toContain('/provenance/ci/repository');

    const tampered = mutableWire();
    tampered.provenance.ci!.ref = 'refs/heads/release';
    expect(issuePaths(decodeVerificationEvidenceCandidate(tampered))).toContain(
      '/candidateDigest'
    );
  });

  it('binds the exact target capture policy to policy and semantic target identity', () => {
    const policyMismatch = mutableWire();
    policyMismatch.redaction.targetPolicy.policyDigest = sha('0');
    expect(
      issuePaths(decodeVerificationEvidenceCandidate(policyMismatch))
    ).toContain('/redaction/targetPolicy/policyDigest');

    const targetMismatch = mutableWire();
    targetMismatch.redaction.targetPolicy.semanticTargetId = 'target:vue-vite';
    expect(
      issuePaths(decodeVerificationEvidenceCandidate(targetMismatch))
    ).toContain('/redaction/targetPolicy/semanticTargetId');

    const unknown = mutableWire();
    const targetPolicy = unknown.redaction
      .targetPolicy as typeof unknown.redaction.targetPolicy &
      Record<string, unknown>;
    targetPolicy.legacyMask = true;
    expect(issuePaths(decodeVerificationEvidenceCandidate(unknown))).toContain(
      '/redaction/targetPolicy/legacyMask'
    );
  });

  it('fails closed on unsafe retention and redaction state', () => {
    const retention = mutableWire();
    retention.requestedRetention =
      'legal-hold' as typeof retention.requestedRetention;
    expect(
      issuePaths(decodeVerificationEvidenceCandidate(retention))
    ).toContain('/requestedRetention');

    const redaction = mutableWire();
    redaction.redaction.safe = false as true;
    expect(
      issuePaths(decodeVerificationEvidenceCandidate(redaction))
    ).toContain('/redaction/safe');
    expect(decodeVerificationEvidenceCandidate(redaction)).toMatchObject({
      status: 'invalid',
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'VER-5002' }),
      ]),
    });
  });
});
