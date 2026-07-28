import {
  VERIFICATION_ARTIFACT_ENVELOPE_FORMAT,
  VERIFICATION_ARTIFACT_ENVELOPE_VERSION,
  VERIFICATION_STRUCTURED_ARTIFACT_LIMITS,
} from './verificationArtifactEnvelope.types';

const {
  maximumAccessibilityViolations,
  maximumConsoleEvents,
  maximumCount,
  maximumDiagnosticsPerEntry,
  maximumDurationMs,
  maximumFieldBytes,
  maximumNetworkOperations,
  maximumPathTemplateBytes,
  maximumSecurityFindings,
  maximumTraceEvents,
} = VERIFICATION_STRUCTURED_ARTIFACT_LIMITS;

const exactObject = (
  required: readonly string[],
  properties: Readonly<Record<string, unknown>>
) =>
  Object.freeze({
    type: 'object',
    required,
    properties,
    additionalProperties: false,
  });

const baseProperties = <K extends string>(kind: K) =>
  Object.freeze({
    format: { const: VERIFICATION_ARTIFACT_ENVELOPE_FORMAT },
    version: { const: VERIFICATION_ARTIFACT_ENVELOPE_VERSION },
    kind: { const: kind },
  });

const diagnosticCodes = {
  type: 'array',
  maxItems: maximumDiagnosticsPerEntry,
  uniqueItems: true,
  items: { $ref: '#/$defs/identifier' },
} as const;

const sourceTraceDigest = { $ref: '#/$defs/digest' } as const;

export const verificationArtifactEnvelopeWireSchema = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/verification/artifact-envelope/v1.json',
  title: 'Prodivix structured verification artifact envelope',
  oneOf: [
    { $ref: '#/$defs/accessibilityReport' },
    { $ref: '#/$defs/trace' },
    { $ref: '#/$defs/networkSummary' },
    { $ref: '#/$defs/consoleSummary' },
    { $ref: '#/$defs/coverageSummary' },
    { $ref: '#/$defs/performanceProfile' },
    { $ref: '#/$defs/securityReport' },
    { $ref: '#/$defs/replayRecord' },
  ],
  $defs: {
    identifier: {
      type: 'string',
      minLength: 1,
      maxLength: maximumFieldBytes,
      pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$',
    },
    digest: {
      type: 'string',
      pattern: '^sha256-[a-f0-9]{64}$',
    },
    count: {
      type: 'integer',
      minimum: 0,
      maximum: maximumCount,
    },
    positiveCount: {
      type: 'integer',
      minimum: 1,
      maximum: maximumCount,
    },
    duration: {
      type: 'number',
      minimum: 0,
      maximum: maximumDurationMs,
    },
    nullableDuration: {
      type: ['number', 'null'],
      minimum: 0,
      maximum: maximumDurationMs,
    },
    diagnosticCodes,
    timing: exactObject(['startOffsetMs', 'durationMs'], {
      startOffsetMs: { $ref: '#/$defs/duration' },
      durationMs: { $ref: '#/$defs/duration' },
    }),
    accessibilityViolation: exactObject(
      ['ruleId', 'impact', 'nodeCount', 'diagnosticCodes'],
      {
        ruleId: { $ref: '#/$defs/identifier' },
        impact: {
          enum: ['minor', 'moderate', 'serious', 'critical'],
        },
        nodeCount: { $ref: '#/$defs/positiveCount' },
        diagnosticCodes,
        sourceTraceDigest,
      }
    ),
    accessibilitySummary: exactObject(
      ['passed', 'failed', 'incomplete', 'violations'],
      {
        passed: { $ref: '#/$defs/count' },
        failed: { $ref: '#/$defs/count' },
        incomplete: { $ref: '#/$defs/count' },
        violations: {
          type: 'array',
          maxItems: maximumAccessibilityViolations,
          items: { $ref: '#/$defs/accessibilityViolation' },
        },
      }
    ),
    accessibilityReport: exactObject(['format', 'version', 'kind', 'summary'], {
      ...baseProperties('accessibility-report'),
      summary: { $ref: '#/$defs/accessibilitySummary' },
    }),
    traceEvent: exactObject(
      [
        'sequence',
        'eventId',
        'category',
        'timestampOffsetMs',
        'durationMs',
        'diagnosticCodes',
      ],
      {
        sequence: { $ref: '#/$defs/count' },
        eventId: { $ref: '#/$defs/identifier' },
        category: { $ref: '#/$defs/identifier' },
        timestampOffsetMs: { $ref: '#/$defs/duration' },
        durationMs: { $ref: '#/$defs/duration' },
        diagnosticCodes,
        sourceTraceDigest,
      }
    ),
    trace: exactObject(
      ['format', 'version', 'kind', 'sourceTraceDigest', 'events'],
      {
        ...baseProperties('trace'),
        sourceTraceDigest,
        events: {
          type: 'array',
          maxItems: maximumTraceEvents,
          items: { $ref: '#/$defs/traceEvent' },
        },
      }
    ),
    networkOperation: exactObject(
      ['method', 'host', 'pathTemplate', 'status', 'timing', 'operationId'],
      {
        method: {
          enum: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        },
        host: {
          type: 'string',
          minLength: 1,
          maxLength: 253,
          pattern:
            '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$',
        },
        pathTemplate: {
          type: 'string',
          minLength: 1,
          maxLength: maximumPathTemplateBytes,
          pattern: '^/[^?#\\\\\\x00-\\x1f\\x7f]*$',
        },
        status: {
          type: 'integer',
          anyOf: [{ const: 0 }, { minimum: 100, maximum: 599 }],
        },
        timing: { $ref: '#/$defs/timing' },
        operationId: { $ref: '#/$defs/identifier' },
      }
    ),
    networkSummary: exactObject(['format', 'version', 'kind', 'operations'], {
      ...baseProperties('network-summary'),
      operations: {
        type: 'array',
        maxItems: maximumNetworkOperations,
        items: { $ref: '#/$defs/networkOperation' },
      },
    }),
    consoleEvent: exactObject(
      ['sequence', 'eventId', 'level', 'timestampOffsetMs', 'diagnosticCodes'],
      {
        sequence: { $ref: '#/$defs/count' },
        eventId: { $ref: '#/$defs/identifier' },
        level: { enum: ['debug', 'info', 'warning', 'error'] },
        timestampOffsetMs: { $ref: '#/$defs/duration' },
        diagnosticCodes,
        sourceTraceDigest,
      }
    ),
    consoleSummary: exactObject(
      ['format', 'version', 'kind', 'sourceTraceDigest', 'events'],
      {
        ...baseProperties('console-summary'),
        sourceTraceDigest,
        events: {
          type: 'array',
          maxItems: maximumConsoleEvents,
          items: { $ref: '#/$defs/consoleEvent' },
        },
      }
    ),
    coverageMetric: exactObject(['covered', 'total'], {
      covered: { $ref: '#/$defs/count' },
      total: { $ref: '#/$defs/count' },
    }),
    coverageSummaryBody: exactObject(
      ['lines', 'functions', 'branches', 'statements'],
      {
        lines: { $ref: '#/$defs/coverageMetric' },
        functions: { $ref: '#/$defs/coverageMetric' },
        branches: { $ref: '#/$defs/coverageMetric' },
        statements: { $ref: '#/$defs/coverageMetric' },
      }
    ),
    coverageSummary: exactObject(['format', 'version', 'kind', 'summary'], {
      ...baseProperties('coverage-summary'),
      summary: { $ref: '#/$defs/coverageSummaryBody' },
    }),
    performanceSummary: exactObject(
      [
        'durationMs',
        'sampleCount',
        'largestContentfulPaintMs',
        'cumulativeLayoutShift',
        'interactionToNextPaintMs',
        'totalBlockingTimeMs',
      ],
      {
        durationMs: { $ref: '#/$defs/duration' },
        sampleCount: { $ref: '#/$defs/count' },
        largestContentfulPaintMs: {
          $ref: '#/$defs/nullableDuration',
        },
        cumulativeLayoutShift: {
          type: ['number', 'null'],
          minimum: 0,
          maximum: 1_000,
        },
        interactionToNextPaintMs: {
          $ref: '#/$defs/nullableDuration',
        },
        totalBlockingTimeMs: {
          $ref: '#/$defs/nullableDuration',
        },
      }
    ),
    performanceProfile: exactObject(['format', 'version', 'kind', 'summary'], {
      ...baseProperties('performance-profile'),
      summary: { $ref: '#/$defs/performanceSummary' },
    }),
    securityFinding: exactObject(
      ['ruleId', 'severity', 'count', 'diagnosticCodes'],
      {
        ruleId: { $ref: '#/$defs/identifier' },
        severity: {
          enum: ['info', 'low', 'medium', 'high', 'critical'],
        },
        count: { $ref: '#/$defs/positiveCount' },
        diagnosticCodes,
        sourceTraceDigest,
      }
    ),
    securitySummary: exactObject(['passed', 'failed', 'findings'], {
      passed: { $ref: '#/$defs/count' },
      failed: { $ref: '#/$defs/count' },
      findings: {
        type: 'array',
        maxItems: maximumSecurityFindings,
        items: { $ref: '#/$defs/securityFinding' },
      },
    }),
    securityReport: exactObject(['format', 'version', 'kind', 'summary'], {
      ...baseProperties('security-report'),
      summary: { $ref: '#/$defs/securitySummary' },
    }),
    replaySummary: exactObject(
      [
        'eventCount',
        'assertionCount',
        'durationMs',
        'outcome',
        'diagnosticCodes',
      ],
      {
        eventCount: { $ref: '#/$defs/count' },
        assertionCount: { $ref: '#/$defs/count' },
        durationMs: { $ref: '#/$defs/duration' },
        outcome: {
          enum: [
            'passed',
            'failed',
            'blocked',
            'cancelled',
            'infrastructure-error',
          ],
        },
        diagnosticCodes,
      }
    ),
    replayRecord: exactObject(
      ['format', 'version', 'kind', 'sourceTraceDigest', 'summary'],
      {
        ...baseProperties('replay-record'),
        sourceTraceDigest,
        summary: { $ref: '#/$defs/replaySummary' },
      }
    ),
  },
} as const);
