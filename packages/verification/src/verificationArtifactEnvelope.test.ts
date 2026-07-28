import { describe, expect, it } from 'vitest';
import {
  decodeVerificationArtifactEnvelope,
  VERIFICATION_ARTIFACT_ENVELOPE_FORMAT,
  VERIFICATION_ARTIFACT_ENVELOPE_SCHEMA_DIGEST,
  VERIFICATION_ARTIFACT_ENVELOPE_VERSION,
  VERIFICATION_STRUCTURED_ARTIFACT_KINDS,
  verificationArtifactEnvelopeWireSchema,
  type VerificationStructuredArtifactKind,
} from './verificationArtifactEnvelope';
import {
  computeVerificationArtifactContentDigest,
  evaluateVerificationArtifactPromotion,
} from './verificationArtifactPolicy';

const encoder = new TextEncoder();
const sha = (value: string): string =>
  `sha256-${value.padEnd(64, value).slice(0, 64)}`;
const sourceTraceDigest = sha('6');

const envelopeBase = (kind: VerificationStructuredArtifactKind) => ({
  format: VERIFICATION_ARTIFACT_ENVELOPE_FORMAT,
  version: VERIFICATION_ARTIFACT_ENVELOPE_VERSION,
  kind,
});

const artifactFixtures = (): Readonly<
  Record<VerificationStructuredArtifactKind, Record<string, unknown>>
> => ({
  'accessibility-report': {
    ...envelopeBase('accessibility-report'),
    summary: {
      passed: 4,
      failed: 1,
      incomplete: 0,
      violations: [
        {
          ruleId: 'a11y.color-contrast',
          impact: 'serious',
          nodeCount: 1,
          diagnosticCodes: ['A11Y_COLOR_CONTRAST'],
          sourceTraceDigest,
        },
      ],
    },
  },
  trace: {
    ...envelopeBase('trace'),
    sourceTraceDigest,
    events: [
      {
        sequence: 0,
        eventId: 'trace.navigation.0',
        category: 'navigation',
        timestampOffsetMs: 12.5,
        durationMs: 4.25,
        diagnosticCodes: [],
        sourceTraceDigest,
      },
    ],
  },
  'network-summary': {
    ...envelopeBase('network-summary'),
    operations: [
      {
        method: 'GET',
        host: 'api.example.invalid',
        pathTemplate: '/catalog/{itemId}',
        status: 200,
        timing: {
          startOffsetMs: 25.5,
          durationMs: 31.75,
        },
        operationId: 'catalog.read',
      },
    ],
  },
  'console-summary': {
    ...envelopeBase('console-summary'),
    sourceTraceDigest,
    events: [
      {
        sequence: 0,
        eventId: 'console.error.0',
        level: 'error',
        timestampOffsetMs: 48.5,
        diagnosticCodes: ['RUNTIME_CONSOLE_ERROR'],
        sourceTraceDigest,
      },
    ],
  },
  'coverage-summary': {
    ...envelopeBase('coverage-summary'),
    summary: {
      lines: { covered: 90, total: 100 },
      functions: { covered: 18, total: 20 },
      branches: { covered: 42, total: 50 },
      statements: { covered: 95, total: 110 },
    },
  },
  'performance-profile': {
    ...envelopeBase('performance-profile'),
    summary: {
      durationMs: 2500.25,
      sampleCount: 250,
      largestContentfulPaintMs: 1200.5,
      cumulativeLayoutShift: 0.025,
      interactionToNextPaintMs: null,
      totalBlockingTimeMs: 45.75,
    },
  },
  'security-report': {
    ...envelopeBase('security-report'),
    summary: {
      passed: 7,
      failed: 1,
      findings: [
        {
          ruleId: 'security.mixed-content',
          severity: 'high',
          count: 1,
          diagnosticCodes: ['SEC_MIXED_CONTENT'],
          sourceTraceDigest,
        },
      ],
    },
  },
  'replay-record': {
    ...envelopeBase('replay-record'),
    sourceTraceDigest,
    summary: {
      eventCount: 12,
      assertionCount: 3,
      durationMs: 1800.5,
      outcome: 'passed',
      diagnosticCodes: [],
    },
  },
});

const cloneFixture = <K extends VerificationStructuredArtifactKind>(
  kind: K
): Record<string, unknown> =>
  structuredClone(artifactFixtures()[kind]) as Record<string, unknown>;

describe('verification structured artifact envelope', () => {
  it('publishes one exact schema and decodes every structured artifact kind', () => {
    expect(verificationArtifactEnvelopeWireSchema).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://prodivix.dev/schemas/verification/artifact-envelope/v1.json',
    });
    expect(VERIFICATION_ARTIFACT_ENVELOPE_SCHEMA_DIGEST).toBe(
      'sha256-bf05571db9ce02115025e01635c298222b87a389341879c1f6b36ae261fb3eaa'
    );
    expect(Object.keys(artifactFixtures()).sort()).toEqual(
      [...VERIFICATION_STRUCTURED_ARTIFACT_KINDS].sort()
    );

    for (const kind of VERIFICATION_STRUCTURED_ARTIFACT_KINDS) {
      const input = cloneFixture(kind);
      const decoded = decodeVerificationArtifactEnvelope(input, kind, {
        expectedSourceTraceDigest: sourceTraceDigest,
      });
      expect(decoded, kind).toMatchObject({
        ok: true,
        value: {
          format: 'prodivix.verification-artifact',
          version: 1,
          kind,
        },
      });
      if (!decoded.ok) throw new Error(`Expected ${kind} to decode.`);
      expect(decoded.value).not.toBe(input);
      expect(Object.isFrozen(decoded.value)).toBe(true);
      input.kind = 'security-report';
      expect(decoded.value.kind).toBe(kind);
    }
  });

  it('rejects format, version, kind, class, and unknown-field drift', () => {
    const mutations: ReadonlyArray<
      readonly [string, (value: Record<string, unknown>) => void]
    > = [
      ['format', (value) => void (value.format = 'prodivix.other')],
      ['version', (value) => void (value.version = 2)],
      ['kind', (value) => void (value.kind = 'security-report')],
      ['unknown', (value) => void (value.rawPayload = 'private')],
      ['missing', (value) => void delete value.summary],
    ];
    for (const [name, mutate] of mutations) {
      const value = cloneFixture('accessibility-report');
      mutate(value);
      expect(
        decodeVerificationArtifactEnvelope(value, 'accessibility-report'),
        name
      ).toMatchObject({ ok: false });
    }

    expect(
      decodeVerificationArtifactEnvelope(
        cloneFixture('security-report'),
        'accessibility-report'
      )
    ).toMatchObject({
      ok: false,
      issues: [{ path: '/kind' }],
    });
  });

  it('rejects nested shape drift and invalid bounded canonical JSON', () => {
    const nestedUnknown = cloneFixture('coverage-summary');
    (
      (nestedUnknown.summary as Record<string, unknown>).lines as Record<
        string,
        unknown
      >
    ).raw = 10;
    expect(
      decodeVerificationArtifactEnvelope(nestedUnknown, 'coverage-summary')
    ).toMatchObject({ ok: false });

    const unsafeInteger = cloneFixture('security-report');
    (unsafeInteger.summary as Record<string, unknown>).passed =
      Number.MAX_SAFE_INTEGER + 1;
    expect(
      decodeVerificationArtifactEnvelope(unsafeInteger, 'security-report')
    ).toMatchObject({ ok: false });

    const negativeZero = cloneFixture('security-report');
    (negativeZero.summary as Record<string, unknown>).passed = -0;
    expect(
      decodeVerificationArtifactEnvelope(negativeZero, 'security-report')
    ).toMatchObject({ ok: false });

    const nonNfc = cloneFixture('network-summary');
    (
      (nonNfc.operations as Record<string, unknown>[])[0] as Record<
        string,
        unknown
      >
    ).pathTemplate = '/e\u0301';
    expect(
      decodeVerificationArtifactEnvelope(nonNfc, 'network-summary')
    ).toMatchObject({ ok: false });

    const loneSurrogate = cloneFixture('network-summary');
    (
      (loneSurrogate.operations as Record<string, unknown>[])[0] as Record<
        string,
        unknown
      >
    ).pathTemplate = '/\ud800';
    expect(
      decodeVerificationArtifactEnvelope(loneSurrogate, 'network-summary')
    ).toMatchObject({ ok: false });
  });

  it('never invokes hostile object code and rejects unsafe keys', () => {
    const accessor = cloneFixture('security-report');
    let getterCalls = 0;
    Object.defineProperty(accessor, 'kind', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        throw new Error('must not execute');
      },
    });
    expect(
      decodeVerificationArtifactEnvelope(accessor, 'security-report')
    ).toMatchObject({ ok: false });
    expect(getterCalls).toBe(0);

    const unsafe = cloneFixture('security-report');
    Object.defineProperty(unsafe.summary, '__proto__', {
      enumerable: true,
      value: { polluted: true },
    });
    expect(
      decodeVerificationArtifactEnvelope(unsafe, 'security-report')
    ).toMatchObject({ ok: false });
  });

  it('enforces cross-field ordering, uniqueness, totals, and trace authority', () => {
    const diagnostics = cloneFixture('security-report');
    (
      (
        (diagnostics.summary as Record<string, unknown>).findings as Record<
          string,
          unknown
        >[]
      )[0] as Record<string, unknown>
    ).diagnosticCodes = ['SEC_Z', 'SEC_A'];
    expect(
      decodeVerificationArtifactEnvelope(diagnostics, 'security-report')
    ).toMatchObject({
      ok: false,
      issues: [{ path: '/summary/findings/0/diagnosticCodes' }],
    });

    const events = cloneFixture('trace');
    (events.events as Record<string, unknown>[]).push({
      sequence: 0,
      eventId: 'trace.navigation.0',
      category: 'navigation',
      timestampOffsetMs: 20,
      durationMs: 1,
      diagnosticCodes: [],
    });
    expect(decodeVerificationArtifactEnvelope(events, 'trace')).toMatchObject({
      ok: false,
    });

    const operations = cloneFixture('network-summary');
    (operations.operations as Record<string, unknown>[]).push({
      method: 'GET',
      host: 'api.example.invalid',
      pathTemplate: '/https://forbidden',
      status: 200,
      timing: { startOffsetMs: 1, durationMs: 1 },
      operationId: 'catalog.read',
    });
    expect(
      decodeVerificationArtifactEnvelope(operations, 'network-summary')
    ).toMatchObject({ ok: false });

    const coverage = cloneFixture('coverage-summary');
    (
      (coverage.summary as Record<string, unknown>).lines as Record<
        string,
        unknown
      >
    ).covered = 101;
    expect(
      decodeVerificationArtifactEnvelope(coverage, 'coverage-summary')
    ).toMatchObject({
      ok: false,
      issues: [{ path: '/summary/lines/covered' }],
    });

    expect(
      decodeVerificationArtifactEnvelope(cloneFixture('trace'), 'trace', {
        expectedSourceTraceDigest: sha('7'),
      })
    ).toMatchObject({
      ok: false,
      issues: [{ path: '/sourceTraceDigest' }],
    });
  });

  it('makes the exact envelope mandatory in artifact promotion', () => {
    const valid = encoder.encode(
      JSON.stringify(cloneFixture('security-report'))
    );
    const candidate = {
      id: 'security-report',
      path: 'reports/security.json',
      kind: 'security-report' as const,
      digest: computeVerificationArtifactContentDigest(valid),
      size: valid.byteLength,
      mediaType: 'application/vnd.prodivix.security-report+json',
      contents: valid,
    };
    expect(
      evaluateVerificationArtifactPromotion({ artifacts: [candidate] })
    ).toMatchObject({ status: 'accepted' });

    const privatePayload = encoder.encode(
      JSON.stringify({ status: 'passed', findings: [] })
    );
    expect(
      evaluateVerificationArtifactPromotion({
        artifacts: [
          {
            ...candidate,
            digest: computeVerificationArtifactContentDigest(privatePayload),
            size: privatePayload.byteLength,
            contents: privatePayload,
          },
        ],
      })
    ).toMatchObject({
      status: 'rejected',
      diagnostics: [{ reason: 'invalid-json' }],
    });

    const wrongClass = encoder.encode(
      JSON.stringify(cloneFixture('coverage-summary'))
    );
    expect(
      evaluateVerificationArtifactPromotion({
        artifacts: [
          {
            ...candidate,
            digest: computeVerificationArtifactContentDigest(wrongClass),
            size: wrongClass.byteLength,
            contents: wrongClass,
          },
        ],
      })
    ).toMatchObject({
      status: 'rejected',
      diagnostics: [{ reason: 'invalid-json' }],
    });
  });
});
