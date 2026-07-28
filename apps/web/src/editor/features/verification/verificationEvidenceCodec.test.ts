import {
  decodeVerificationEvidenceSourceTraces,
  digestVerificationValue,
} from '@prodivix/verification';
import { describe, expect, it } from 'vitest';
import {
  decodeVerificationEvidenceComparison,
  decodeVerificationEvidencePage,
  decodeVerificationEvidenceVerifiedView,
} from './verificationEvidenceCodec';
import {
  createEvidenceRecordPayload,
  createVerifiedEvidenceViewPayload,
  decodeEvidenceRecordFixture,
  evidenceDigest,
} from './__tests__/verificationEvidence.fixture';

const evidenceRecordWithArtifacts = (
  count: number
): Record<string, unknown> => {
  const payload = createEvidenceRecordPayload();
  const evidence = payload.evidence as Record<string, unknown>;
  const descriptors = Array.from({ length: count }, (_, index) => ({
    id: `artifact-${index}`,
    path: `reports/build-${index}.log`,
    kind: 'build-log',
    digest: evidenceDigest('a'),
    size: 4,
    mediaType: 'text/plain',
    availability: 'available',
  }));
  evidence.artifacts = descriptors.map(
    ({ availability: _availability, ...manifest }) => manifest
  );
  payload.artifacts = descriptors;
  const verifiedView = payload.verifiedView as Record<string, unknown>;
  verifiedView.materializedEvidenceDigest = digestVerificationValue(evidence);
  verifiedView.artifacts = descriptors.map((artifact) => ({
    artifactId: artifact.id,
    digest: artifact.digest,
    status: artifact.availability,
  }));
  const { recordDigest: _recordDigest, ...withoutRecordDigest } = verifiedView;
  verifiedView.recordDigest = digestVerificationValue(withoutRecordDigest);
  return payload;
};

describe('Verification Evidence transport decoder', () => {
  it('decodes a bounded page into an immutable projection', () => {
    const decoded = decodeVerificationEvidencePage({
      records: [createEvidenceRecordPayload()],
      nextCursor: 'cursor-a',
    });

    expect(decoded.records).toHaveLength(1);
    expect(decoded.records[0]?.evidence.attemptId).toBe('attempt-a');
    expect(decoded.nextCursor).toBe('cursor-a');
    expect(Object.isFrozen(decoded.records[0]?.evidence)).toBe(true);
  });

  it.each([33, 128])(
    'accepts %s artifacts up to the canonical promotion limit',
    (artifactCount) => {
      const decoded = decodeVerificationEvidencePage({
        records: [evidenceRecordWithArtifacts(artifactCount)],
      });
      expect(decoded.records[0]?.artifacts).toHaveLength(artifactCount);
    }
  );

  it('rejects 129 artifacts above the canonical promotion limit', () => {
    expect(() =>
      decodeVerificationEvidencePage({
        records: [evidenceRecordWithArtifacts(129)],
      })
    ).toThrow(/bounded artifact array/u);
  });

  it('requires canonical persisted SourceTraces and their exact digest', () => {
    const missingSourceTraces = createEvidenceRecordPayload();
    delete (missingSourceTraces.evidence as Record<string, unknown>)
      .sourceTraces;
    expect(() =>
      decodeVerificationEvidencePage({
        records: [missingSourceTraces],
      })
    ).toThrow(/sourceTraces/u);

    const emptySourceTraces = createEvidenceRecordPayload();
    (emptySourceTraces.evidence as Record<string, unknown>).sourceTraces = [];
    expect(() =>
      decodeVerificationEvidencePage({
        records: [emptySourceTraces],
      })
    ).toThrow(/sourceTraces|count budget/u);

    const mismatchedDigest = createEvidenceRecordPayload();
    (mismatchedDigest.evidence as Record<string, unknown>).sourceTraceDigest =
      evidenceDigest('0');
    expect(() =>
      decodeVerificationEvidencePage({
        records: [mismatchedDigest],
      })
    ).toThrow(/sourceTraceDigest/u);

    const unknownSourceRefField = createEvidenceRecordPayload();
    const sourceTraces = (
      unknownSourceRefField.evidence as Record<string, unknown>
    ).sourceTraces as readonly Record<string, unknown>[];
    (unknownSourceRefField.evidence as Record<string, unknown>).sourceTraces = [
      {
        ...sourceTraces[0],
        sourceRef: {
          ...(sourceTraces[0]?.sourceRef as Record<string, unknown>),
          unsafeExtra: true,
        },
      },
    ];
    expect(() =>
      decodeVerificationEvidencePage({
        records: [unknownSourceRefField],
      })
    ).toThrow(/source reference|sourceTraces/u);

    const nonCanonicalOrder = createEvidenceRecordPayload();
    const evidence = nonCanonicalOrder.evidence as Record<string, unknown>;
    const decoded = decodeVerificationEvidenceSourceTraces([
      {
        sourceRef: { kind: 'code-artifact', artifactId: 'code-a' },
      },
      {
        sourceRef: {
          kind: 'verification-plan-cell',
          planDigest: evidenceDigest('a'),
          cellId: 'cell-a',
        },
      },
    ]);
    if (!decoded.ok) throw new Error('Expected canonical SourceTrace fixture.');
    evidence.sourceTraces = [...decoded.value].reverse();
    evidence.sourceTraceDigest = digestVerificationValue(evidence.sourceTraces);
    expect(() =>
      decodeVerificationEvidencePage({
        records: [nonCanonicalOrder],
      })
    ).toThrow(/canonical source trace order/u);

    const tooManySourceTraces = createEvidenceRecordPayload();
    (tooManySourceTraces.evidence as Record<string, unknown>).sourceTraces =
      Array.from({ length: 257 }, (_, index) => ({
        sourceRef: { kind: 'code-artifact', artifactId: `code-${index}` },
      }));
    expect(() =>
      decodeVerificationEvidencePage({
        records: [tooManySourceTraces],
      })
    ).toThrow(/sourceTraces|count budget/u);
  });

  it('binds every artifact descriptor to its signed manifest and one persisted source trace', () => {
    const decoded = decodeEvidenceRecordFixture();
    expect(decoded.artifacts[0]?.sourceTraceDigest).toBe(
      digestVerificationValue(decoded.evidence.sourceTraces[0])
    );

    const mismatchedTrace = createEvidenceRecordPayload();
    (
      (mismatchedTrace.artifacts as Record<string, unknown>[])[0] as Record<
        string,
        unknown
      >
    ).sourceTraceDigest = evidenceDigest('0');
    expect(() =>
      decodeVerificationEvidencePage({ records: [mismatchedTrace] })
    ).toThrow(/signed Evidence manifests|sourceTraceDigest/u);

    const driftedPath = createEvidenceRecordPayload();
    (
      (driftedPath.artifacts as Record<string, unknown>[])[0] as Record<
        string,
        unknown
      >
    ).path = 'reports/drifted.log';
    expect(() =>
      decodeVerificationEvidencePage({ records: [driftedPath] })
    ).toThrow(/signed Evidence manifests/u);
  });

  it('decodes only canonical active Backend retention projections for this Evidence', () => {
    const decoded = decodeEvidenceRecordFixture({
      activeProtections: [
        {
          id: 'protection-a',
          evidenceId: 'evidence-a',
          kind: 'change',
          externalRef: 'change:7',
          active: true,
          version: 1,
        },
      ],
    });
    expect(decoded.activeProtections).toEqual([
      expect.objectContaining({
        id: 'protection-a',
        active: true,
      }),
    ]);

    const inactive = createEvidenceRecordPayload();
    inactive.activeProtections = [
      {
        id: 'protection-a',
        evidenceId: 'evidence-a',
        kind: 'change',
        externalRef: 'change:7',
        active: false,
        version: 1,
      },
    ];
    expect(() =>
      decodeVerificationEvidencePage({ records: [inactive] })
    ).toThrow(/active|protection/u);

    const wrongEvidence = createEvidenceRecordPayload();
    wrongEvidence.activeProtections = [
      {
        id: 'protection-a',
        evidenceId: 'evidence-other',
        kind: 'legal-hold',
        externalRef: 'hold:1',
        active: true,
        version: 1,
      },
    ];
    expect(() =>
      decodeVerificationEvidencePage({ records: [wrongEvidence] })
    ).toThrow(/this Evidence/u);

    const nonCanonical = createEvidenceRecordPayload();
    nonCanonical.activeProtections = [
      {
        id: 'protection-b',
        evidenceId: 'evidence-a',
        kind: 'release',
        externalRef: 'release:1',
        active: true,
        version: 1,
      },
      {
        id: 'protection-a',
        evidenceId: 'evidence-a',
        kind: 'change',
        externalRef: 'change:1',
        active: true,
        version: 1,
      },
    ];
    expect(() =>
      decodeVerificationEvidencePage({ records: [nonCanonical] })
    ).toThrow(/canonical active protections/u);
  });

  it('rejects unknown transport fields and oversized result data', () => {
    expect(() =>
      decodeVerificationEvidencePage({
        records: [
          {
            ...createEvidenceRecordPayload(),
            unexpected: true,
          },
        ],
      })
    ).toThrow(/unexpected key/u);

    const oversized = createEvidenceRecordPayload();
    const evidence = oversized.evidence as Record<string, unknown>;
    const result = evidence.result as Record<string, unknown>;
    result.summary = 'x'.repeat(8193);
    expect(() =>
      decodeVerificationEvidencePage({ records: [oversized] })
    ).toThrow(/bounded NFC text/u);

    const subMillisecond = createEvidenceRecordPayload();
    const subMillisecondEvidence = subMillisecond.evidence as Record<
      string,
      unknown
    >;
    subMillisecondEvidence.createdAt = '2026-07-28T01:00:02.1234Z';
    expect(() =>
      decodeVerificationEvidencePage({ records: [subMillisecond] })
    ).toThrow(/UTC RFC 3339 instant/u);

    for (const invalidId of ['evidence/unsafe', `e${'x'.repeat(256)}`]) {
      const invalidIdentifier = createEvidenceRecordPayload();
      const invalidEvidence = invalidIdentifier.evidence as Record<
        string,
        unknown
      >;
      invalidEvidence.id = invalidId;
      expect(() =>
        decodeVerificationEvidencePage({ records: [invalidIdentifier] })
      ).toThrow(/expected an identifier|bounded NFC text/u);
    }

    const missingCoreIdentity = createEvidenceRecordPayload();
    delete (missingCoreIdentity.evidence as Record<string, unknown>).checkKind;
    expect(() =>
      decodeVerificationEvidencePage({ records: [missingCoreIdentity] })
    ).toThrow(/checkKind/u);

    const missingCiIdentity = createEvidenceRecordPayload();
    delete (
      (missingCiIdentity.evidence as Record<string, unknown>)
        .provenance as Record<string, unknown>
    ).ci;
    expect(() =>
      decodeVerificationEvidencePage({ records: [missingCiIdentity] })
    ).toThrow(/CI identity/u);

    const malformedCiCommit = createEvidenceRecordPayload();
    const malformedProvenance = (
      malformedCiCommit.evidence as Record<string, unknown>
    ).provenance as Record<string, unknown>;
    (malformedProvenance.ci as Record<string, unknown>).commit = 'ABC123';
    expect(() =>
      decodeVerificationEvidencePage({ records: [malformedCiCommit] })
    ).toThrow(/CI repository identity/u);
  });

  it('requires the compact digest-bound Backend-verified Evidence view', () => {
    const record = decodeEvidenceRecordFixture();
    const payload = createVerifiedEvidenceViewPayload([record]);
    const decoded = decodeVerificationEvidenceVerifiedView(payload);

    expect(decoded.records[0]).toMatchObject({
      evidenceId: record.evidence.id,
      manifestDigest: record.evidence.manifestDigest,
    });
    expect(decoded.records[0]?.materializedEvidenceDigest).toMatch(
      /^sha256-[a-f0-9]{64}$/u
    );

    const invalid = structuredClone(payload);
    const verifiedView = invalid.verifiedEvidenceView as Record<
      string,
      unknown
    >;
    const records = verifiedView.records as Record<string, unknown>[];
    delete records[0]?.materializedEvidenceDigest;
    expect(() => decodeVerificationEvidenceVerifiedView(invalid)).toThrow(
      /materializedEvidenceDigest/u
    );

    expect(() =>
      decodeVerificationEvidenceVerifiedView({
        closureView: payload.verifiedEvidenceView,
      })
    ).toThrow(/unexpected key|verifiedEvidenceView/u);
  });

  it('strictly decodes all four comparison compatibility states', () => {
    const cases = [
      ['exact-compatible', []],
      ['view-only', ['workspace-revision']],
      ['incompatible', ['project-id']],
      ['policy-compatible', ['tool-version']],
    ] as const;
    for (const [compatibility, mismatchFields] of cases) {
      const decoded = decodeVerificationEvidenceComparison({
        comparison: {
          compatibility,
          leftEvidenceId: 'evidence-a',
          rightEvidenceId: 'evidence-b',
          mismatchFields,
          ...(compatibility === 'policy-compatible'
            ? {
                policyId: 'policy-a',
                policyDigest: evidenceDigest('e'),
              }
            : {}),
          comparisonDigest: evidenceDigest('f'),
        },
      });
      expect(decoded.compatibility).toBe(compatibility);
      expect(decoded.mismatchFields).toEqual(mismatchFields);
    }

    expect(() =>
      decodeVerificationEvidenceComparison({
        comparison: {
          status: 'exact-compatible',
          leftEvidenceId: 'evidence-a',
          rightEvidenceId: 'evidence-b',
          mismatches: {},
        },
      })
    ).toThrow(/unexpected key/u);
    expect(() =>
      decodeVerificationEvidenceComparison({
        comparison: {
          compatibility: 'policy-compatible',
          leftEvidenceId: 'evidence-a',
          rightEvidenceId: 'evidence-b',
          mismatchFields: ['tool-version'],
          comparisonDigest: evidenceDigest('f'),
        },
      })
    ).toThrow(/internally inconsistent/u);
  });
});
