import {
  VERIFICATION_EVIDENCE_CANDIDATE_WIRE_VERSION,
  VERIFICATION_EVIDENCE_CODEC_LIMITS,
} from './verificationEvidenceCodec.primitives';
import type {
  VerificationArtifactKind,
  VerificationBrowserEngine,
  VerificationCheckKind,
  VerificationColorScheme,
  VerificationMotion,
  VerificationRetentionClass,
  VerificationSurface,
} from './verification.types';

export const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
export const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
export const ARTIFACT_PATH_SEGMENT_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
export const MEDIA_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u;
export const LOCALE_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?$/u;
export const CI_COMMIT_PATTERN = /^(?:sha1-[a-f0-9]{40}|sha256-[a-f0-9]{64})$/u;
export const CI_REPOSITORY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}(?::[A-Za-z0-9][A-Za-z0-9._+-]{0,127})?(?:\/[A-Za-z0-9][A-Za-z0-9._+-]{0,127})+$/u;
export const CI_REF_PATTERN =
  /^refs\/(?!.*(?:\.\.|\/\/|@\{|[\\ ~^:?*[]))(?!.*[/.]$).+$/u;

export const CHECK_KINDS = Object.freeze([
  'diagnostics',
  'build',
  'unit',
  'integration',
  'e2e',
  'visual',
  'accessibility',
  'performance',
  'security',
] as const satisfies readonly VerificationCheckKind[]);

export const ARTIFACT_KINDS = Object.freeze([
  'screenshot',
  'visual-diff',
  'accessibility-report',
  'trace',
  'network-summary',
  'console-summary',
  'coverage-summary',
  'performance-profile',
  'security-report',
  'build-log',
  'replay-record',
] as const satisfies readonly VerificationArtifactKind[]);

export const SURFACES = Object.freeze([
  'preview',
  'export',
  'ci',
] as const satisfies readonly VerificationSurface[]);
export const BROWSER_ENGINES = Object.freeze([
  'chromium',
  'firefox',
  'webkit',
] as const satisfies readonly VerificationBrowserEngine[]);
export const COLOR_SCHEMES = Object.freeze([
  'light',
  'dark',
] as const satisfies readonly VerificationColorScheme[]);
export const MOTIONS = Object.freeze([
  'full',
  'reduced',
] as const satisfies readonly VerificationMotion[]);
export const OUTCOMES = Object.freeze([
  'passed',
  'failed',
  'blocked',
  'cancelled',
  'infrastructure-error',
] as const);
export const ORIGINS = Object.freeze([
  'local',
  'remote',
  'ci',
  'import',
] as const);
export const RETENTION_CLASSES = Object.freeze([
  'session',
  'change',
  'release',
  'legal-hold',
] as const satisfies readonly VerificationRetentionClass[]);

export const TOP_LEVEL_KEYS = Object.freeze([
  'candidateId',
  'projectId',
  'workspaceId',
  'workspaceRevision',
  'partitionRevisions',
  'executableSnapshotDigest',
  'scenario',
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
  'redaction',
  'requestedRetention',
  'promotion',
  'candidateDigest',
] as const);

export const TOP_LEVEL_REQUIRED_KEYS = TOP_LEVEL_KEYS.filter(
  (key) => key !== 'scenario'
);

export const wireCanonicalIdSchema = {
  type: 'string',
  minLength: 1,
  maxLength: VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumIdentifierBytes,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$',
} as const;

export const wireCanonicalTextSchema = {
  type: 'string',
  minLength: 1,
  maxLength: VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumTextBytes,
  pattern: '^\\S(?:[\\s\\S]*\\S)?$',
} as const;

export const wireDigestSchema = {
  type: 'string',
  pattern: '^sha256-[a-f0-9]{64}$',
} as const;

export const wireInstantSchema = {
  type: 'string',
  pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$',
} as const;

export const wireNonNegativeSafeIntegerSchema = {
  type: 'integer',
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
} as const;

/**
 * Immutable transport schema. JSON Schema owns the versioned shape; the codec
 * adds NFC, byte/depth, exact instant ordering, duplicate identity, and digest
 * chain checks that JSON Schema cannot express portably.
 */
export const verificationEvidenceCandidateWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/verification/evidence-candidate/v1.json',
  title: 'Prodivix VerificationEvidenceCandidate wire document',
  type: 'object',
  required: [...TOP_LEVEL_REQUIRED_KEYS, 'wireVersion'],
  properties: {
    wireVersion: {
      const: VERIFICATION_EVIDENCE_CANDIDATE_WIRE_VERSION,
    },
    candidateId: { $ref: '#/$defs/canonicalId' },
    projectId: { $ref: '#/$defs/canonicalId' },
    workspaceId: { $ref: '#/$defs/canonicalId' },
    workspaceRevision: { $ref: '#/$defs/nonNegativeSafeInteger' },
    partitionRevisions: { $ref: '#/$defs/partitionRevisions' },
    executableSnapshotDigest: { $ref: '#/$defs/digest' },
    scenario: { $ref: '#/$defs/scenario' },
    policyRevision: { $ref: '#/$defs/nonNegativeSafeInteger' },
    policyDigest: { $ref: '#/$defs/digest' },
    impactDigest: { $ref: '#/$defs/digest' },
    planDigest: { $ref: '#/$defs/digest' },
    policyEvaluationInstant: { $ref: '#/$defs/instant' },
    cellId: { $ref: '#/$defs/canonicalId' },
    checkId: { $ref: '#/$defs/canonicalId' },
    checkKind: { enum: CHECK_KINDS },
    targetId: { $ref: '#/$defs/canonicalId' },
    attemptId: { $ref: '#/$defs/canonicalId' },
    run: { $ref: '#/$defs/run' },
    timing: { $ref: '#/$defs/timing' },
    result: { $ref: '#/$defs/result' },
    provenance: { $ref: '#/$defs/provenance' },
    toolchain: { $ref: '#/$defs/toolchain' },
    normalization: { $ref: '#/$defs/toolchain' },
    controls: { $ref: '#/$defs/controls' },
    inputs: { $ref: '#/$defs/inputs' },
    artifacts: {
      type: 'array',
      maxItems: VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumArtifacts,
      items: { $ref: '#/$defs/artifact' },
    },
    sourceTraces: {
      type: 'array',
      minItems: 1,
      maxItems: VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSourceTraces,
      items: { $ref: '#/$defs/sourceTrace' },
    },
    sourceTraceDigest: { $ref: '#/$defs/digest' },
    dependencyLockDigest: { $ref: '#/$defs/digest' },
    redaction: { $ref: '#/$defs/redaction' },
    requestedRetention: {
      enum: ['session', 'change', 'release'],
    },
    promotion: { $ref: '#/$defs/promotion' },
    candidateDigest: { $ref: '#/$defs/digest' },
  },
  additionalProperties: false,
  $defs: {
    canonicalId: wireCanonicalIdSchema,
    canonicalText: wireCanonicalTextSchema,
    digest: wireDigestSchema,
    instant: wireInstantSchema,
    nonNegativeSafeInteger: wireNonNegativeSafeIntegerSchema,
    positiveSafeInteger: {
      ...wireNonNegativeSafeIntegerSchema,
      minimum: 1,
    },
    revisionPair: {
      type: 'object',
      required: ['contentRev', 'metaRev'],
      properties: {
        contentRev: { $ref: '#/$defs/nonNegativeSafeInteger' },
        metaRev: { $ref: '#/$defs/nonNegativeSafeInteger' },
      },
      additionalProperties: false,
    },
    partitionRevisions: {
      type: 'object',
      required: ['workspaceRev', 'routeRev', 'opSeq', 'documentRevisions'],
      properties: {
        workspaceRev: { $ref: '#/$defs/nonNegativeSafeInteger' },
        routeRev: { $ref: '#/$defs/nonNegativeSafeInteger' },
        opSeq: { $ref: '#/$defs/nonNegativeSafeInteger' },
        documentRevisions: {
          type: 'object',
          maxProperties:
            VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumDocumentRevisions,
          propertyNames: { $ref: '#/$defs/canonicalId' },
          additionalProperties: { $ref: '#/$defs/revisionPair' },
        },
      },
      additionalProperties: false,
    },
    scenario: {
      type: 'object',
      required: ['id', 'revision', 'digest', 'programDigest'],
      properties: {
        id: { $ref: '#/$defs/canonicalId' },
        revision: { $ref: '#/$defs/nonNegativeSafeInteger' },
        digest: { $ref: '#/$defs/digest' },
        programDigest: { $ref: '#/$defs/digest' },
      },
      additionalProperties: false,
    },
    viewport: {
      type: 'object',
      required: ['id', 'width', 'height'],
      properties: {
        id: { $ref: '#/$defs/canonicalId' },
        width: {
          allOf: [
            { $ref: '#/$defs/positiveSafeInteger' },
            { maximum: 100_000 },
          ],
        },
        height: {
          allOf: [
            { $ref: '#/$defs/positiveSafeInteger' },
            { maximum: 100_000 },
          ],
        },
      },
      additionalProperties: false,
    },
    run: {
      type: 'object',
      required: [
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
      properties: {
        runId: { $ref: '#/$defs/canonicalId' },
        providerId: { $ref: '#/$defs/canonicalId' },
        jobId: { $ref: '#/$defs/canonicalId' },
        sessionId: { $ref: '#/$defs/canonicalId' },
        parentAttemptId: { $ref: '#/$defs/canonicalId' },
        surface: { enum: SURFACES },
        frameworkTarget: { $ref: '#/$defs/canonicalId' },
        runtimeZone: { $ref: '#/$defs/canonicalId' },
        browserEngine: { enum: BROWSER_ENGINES },
        operatingSystemIdentity: {
          ...wireCanonicalTextSchema,
          maxLength: 512,
        },
        viewport: { $ref: '#/$defs/viewport' },
        devicePixelRatio: {
          type: 'number',
          exclusiveMinimum: 0,
          maximum: 16,
        },
        colorScheme: { enum: COLOR_SCHEMES },
        motion: { enum: MOTIONS },
        locale: {
          type: 'string',
          minLength: 1,
          maxLength: 64,
          pattern: '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?$',
        },
        timezone: {
          ...wireCanonicalTextSchema,
          maxLength: 128,
        },
        fontSetDigest: { $ref: '#/$defs/digest' },
        sandboxImageDigest: { $ref: '#/$defs/digest' },
      },
      additionalProperties: false,
    },
    timing: {
      type: 'object',
      required: ['startedAt', 'completedAt', 'durationMs'],
      properties: {
        startedAt: { $ref: '#/$defs/instant' },
        completedAt: { $ref: '#/$defs/instant' },
        durationMs: { $ref: '#/$defs/nonNegativeSafeInteger' },
      },
      additionalProperties: false,
    },
    jsonValue: {
      anyOf: [
        { type: 'null' },
        { type: 'boolean' },
        { type: 'number' },
        {
          type: 'string',
          maxLength:
            VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSummaryStringBytes,
        },
        {
          type: 'array',
          maxItems: VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSummaryNodes,
          items: { $ref: '#/$defs/jsonValue' },
        },
        {
          type: 'object',
          maxProperties:
            VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSummaryObjectKeys,
          propertyNames: {
            type: 'string',
            maxLength:
              VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSummaryKeyBytes,
          },
          additionalProperties: { $ref: '#/$defs/jsonValue' },
        },
      ],
    },
    canonicalIdSet: {
      type: 'array',
      uniqueItems: true,
      items: { $ref: '#/$defs/canonicalId' },
    },
    digestSet: {
      type: 'array',
      uniqueItems: true,
      items: { $ref: '#/$defs/digest' },
    },
    result: {
      type: 'object',
      required: [
        'outcome',
        'normalizedResultDigest',
        'summary',
        'diagnosticCodes',
        'appliedExemptionIds',
      ],
      properties: {
        outcome: { enum: OUTCOMES },
        normalizedResultDigest: { $ref: '#/$defs/digest' },
        summary: { $ref: '#/$defs/jsonValue' },
        diagnosticCodes: {
          allOf: [
            { $ref: '#/$defs/canonicalIdSet' },
            {
              maxItems:
                VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumDiagnosticCodes,
            },
          ],
        },
        appliedExemptionIds: {
          allOf: [
            { $ref: '#/$defs/canonicalIdSet' },
            {
              maxItems:
                VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumAppliedExemptionIds,
            },
          ],
        },
      },
      additionalProperties: false,
    },
    provenance: {
      type: 'object',
      required: ['origin', 'producerId', 'providerId', 'issuedAt'],
      properties: {
        origin: { enum: ORIGINS },
        producerId: { $ref: '#/$defs/canonicalId' },
        providerId: { $ref: '#/$defs/canonicalId' },
        issuedAt: { $ref: '#/$defs/instant' },
        expiresAt: { $ref: '#/$defs/instant' },
        ci: { $ref: '#/$defs/ciRepositoryIdentity' },
      },
      allOf: [
        {
          if: {
            required: ['origin'],
            properties: { origin: { const: 'ci' } },
          },
          then: { required: ['ci'] },
          else: { not: { required: ['ci'] } },
        },
      ],
      additionalProperties: false,
    },
    ciRepositoryIdentity: {
      type: 'object',
      required: ['repository', 'ref', 'commit'],
      properties: {
        repository: {
          type: 'string',
          minLength: 1,
          maxLength: 512,
          pattern:
            '^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}(?::[A-Za-z0-9][A-Za-z0-9._+-]{0,127})?(?:/[A-Za-z0-9][A-Za-z0-9._+-]{0,127})+$',
        },
        ref: {
          type: 'string',
          minLength: 6,
          maxLength: 512,
          pattern:
            '^refs/(?!.*(?:\\.\\.|//|@\\{|[\\\\ ~^:?*\\[]))(?!.*[/.]$).+$',
        },
        commit: {
          type: 'string',
          pattern: '^(?:sha1-[a-f0-9]{40}|sha256-[a-f0-9]{64})$',
        },
      },
      additionalProperties: false,
    },
    toolchain: {
      type: 'object',
      required: [
        'packageName',
        'packageVersion',
        'buildDigest',
        'toolchainDigest',
        'schemaDigest',
      ],
      properties: {
        packageName: {
          ...wireCanonicalTextSchema,
          maxLength: 512,
        },
        packageVersion: {
          ...wireCanonicalTextSchema,
          maxLength: 128,
        },
        buildDigest: { $ref: '#/$defs/digest' },
        toolchainDigest: { $ref: '#/$defs/digest' },
        schemaDigest: { $ref: '#/$defs/digest' },
      },
      additionalProperties: false,
    },
    controls: {
      type: 'object',
      required: ['profileDigest', 'appliedDigest'],
      properties: {
        profileDigest: { $ref: '#/$defs/digest' },
        appliedDigest: { $ref: '#/$defs/digest' },
      },
      additionalProperties: false,
    },
    inputs: {
      type: 'object',
      required: [
        'executableSnapshotDigest',
        'fixtureSetDigests',
        'inputDigest',
      ],
      properties: {
        executableSnapshotDigest: { $ref: '#/$defs/digest' },
        scenarioProgramDigest: { $ref: '#/$defs/digest' },
        fixtureSetDigests: {
          allOf: [
            { $ref: '#/$defs/digestSet' },
            {
              maxItems:
                VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumFixtureSetDigests,
            },
          ],
        },
        baselineSetDigest: { $ref: '#/$defs/digest' },
        inputDigest: { $ref: '#/$defs/digest' },
      },
      additionalProperties: false,
    },
    sourceTrace: {
      type: 'object',
      required: ['sourceRef'],
      properties: {
        sourceRef: { $ref: '#/$defs/sourceRef' },
        sourceSpan: { $ref: '#/$defs/sourceSpan' },
        label: {
          ...wireCanonicalTextSchema,
          maxLength:
            VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumSourceTraceLabelBytes,
        },
      },
      additionalProperties: false,
    },
    sourceSpan: {
      type: 'object',
      required: [
        'artifactId',
        'startLine',
        'startColumn',
        'endLine',
        'endColumn',
      ],
      properties: {
        artifactId: { $ref: '#/$defs/canonicalId' },
        startLine: { $ref: '#/$defs/positiveSafeInteger' },
        startColumn: { $ref: '#/$defs/positiveSafeInteger' },
        endLine: { $ref: '#/$defs/positiveSafeInteger' },
        endColumn: { $ref: '#/$defs/positiveSafeInteger' },
      },
      additionalProperties: false,
    },
    sourceRef: {
      oneOf: [
        {
          type: 'object',
          required: ['kind', 'workspaceId'],
          properties: {
            kind: { const: 'workspace' },
            workspaceId: { $ref: '#/$defs/canonicalId' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'workspaceId', 'nodeId'],
          properties: {
            kind: { const: 'workspace-node' },
            workspaceId: { $ref: '#/$defs/canonicalId' },
            nodeId: { $ref: '#/$defs/canonicalId' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'documentId'],
          properties: {
            kind: { const: 'document' },
            workspaceId: { $ref: '#/$defs/canonicalId' },
            documentId: { $ref: '#/$defs/canonicalId' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'documentId', 'nodeId'],
          properties: {
            kind: { const: 'pir-node' },
            documentId: { $ref: '#/$defs/canonicalId' },
            nodeId: { $ref: '#/$defs/canonicalId' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'documentId', 'nodeId', 'fieldPath'],
          properties: {
            kind: { const: 'inspector-field' },
            documentId: { $ref: '#/$defs/canonicalId' },
            nodeId: { $ref: '#/$defs/canonicalId' },
            fieldPath: { $ref: '#/$defs/canonicalText' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'routeId'],
          properties: {
            kind: { const: 'route' },
            routeId: { $ref: '#/$defs/canonicalId' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'documentId', 'nodeId'],
          properties: {
            kind: { const: 'nodegraph-node' },
            documentId: { $ref: '#/$defs/canonicalId' },
            nodeId: { $ref: '#/$defs/canonicalId' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'documentId', 'nodeId', 'portId'],
          properties: {
            kind: { const: 'nodegraph-port' },
            documentId: { $ref: '#/$defs/canonicalId' },
            nodeId: { $ref: '#/$defs/canonicalId' },
            portId: { $ref: '#/$defs/canonicalId' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'documentId', 'timelineId'],
          properties: {
            kind: { const: 'animation-timeline' },
            documentId: { $ref: '#/$defs/canonicalId' },
            timelineId: { $ref: '#/$defs/canonicalId' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: [
            'kind',
            'documentId',
            'timelineId',
            'bindingId',
            'trackId',
          ],
          properties: {
            kind: { const: 'animation-track' },
            documentId: { $ref: '#/$defs/canonicalId' },
            timelineId: { $ref: '#/$defs/canonicalId' },
            bindingId: { $ref: '#/$defs/canonicalId' },
            trackId: { $ref: '#/$defs/canonicalId' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'documentId'],
          properties: {
            kind: { const: 'data-source' },
            documentId: { $ref: '#/$defs/canonicalId' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'documentId', 'operationId'],
          properties: {
            kind: { const: 'data-operation' },
            documentId: { $ref: '#/$defs/canonicalId' },
            operationId: { $ref: '#/$defs/canonicalId' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'artifactId'],
          properties: {
            kind: { const: 'code-artifact' },
            artifactId: { $ref: '#/$defs/canonicalId' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'documentId'],
          properties: {
            kind: { const: 'behavior-scenario' },
            documentId: { $ref: '#/$defs/canonicalId' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'documentId', 'stepId'],
          properties: {
            kind: { const: 'behavior-step' },
            documentId: { $ref: '#/$defs/canonicalId' },
            stepId: { $ref: '#/$defs/canonicalId' },
            assertionId: { $ref: '#/$defs/canonicalId' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'planDigest', 'cellId', 'attemptId'],
          properties: {
            kind: { const: 'behavior-replay-record' },
            planDigest: { $ref: '#/$defs/digest' },
            cellId: { $ref: '#/$defs/canonicalId' },
            attemptId: { $ref: '#/$defs/canonicalId' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'documentId'],
          properties: {
            kind: { const: 'verification-policy' },
            documentId: { $ref: '#/$defs/canonicalId' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'planDigest', 'cellId'],
          properties: {
            kind: { const: 'verification-plan-cell' },
            planDigest: { $ref: '#/$defs/digest' },
            cellId: { $ref: '#/$defs/canonicalId' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'planDigest', 'cellId', 'attemptId'],
          properties: {
            kind: { const: 'verification-evidence' },
            planDigest: { $ref: '#/$defs/digest' },
            cellId: { $ref: '#/$defs/canonicalId' },
            attemptId: { $ref: '#/$defs/canonicalId' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'planDigest'],
          properties: {
            kind: { const: 'verification-closure' },
            planDigest: { $ref: '#/$defs/digest' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'operation'],
          properties: {
            kind: { const: 'operation' },
            operation: { $ref: '#/$defs/canonicalText' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'themeId', 'tokenPath'],
          properties: {
            kind: { const: 'theme-token' },
            themeId: { $ref: '#/$defs/canonicalId' },
            tokenPath: { $ref: '#/$defs/canonicalText' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'width', 'height'],
          properties: {
            kind: { const: 'viewport' },
            routeId: { $ref: '#/$defs/canonicalId' },
            width: { $ref: '#/$defs/positiveSafeInteger' },
            height: { $ref: '#/$defs/positiveSafeInteger' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'stablePath'],
          properties: {
            kind: { const: 'runtime-dom' },
            routeId: { $ref: '#/$defs/canonicalId' },
            stablePath: { $ref: '#/$defs/canonicalText' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'documentId', 'nodeId', 'slotName'],
          properties: {
            kind: { const: 'component-slot' },
            documentId: { $ref: '#/$defs/canonicalId' },
            nodeId: { $ref: '#/$defs/canonicalId' },
            slotName: { $ref: '#/$defs/canonicalId' },
          },
          additionalProperties: false,
        },
      ],
    },
    artifact: {
      type: 'object',
      required: [
        'id',
        'path',
        'stagingArtifactId',
        'kind',
        'expectedDigest',
        'expectedSize',
        'expectedMediaType',
      ],
      properties: {
        id: { $ref: '#/$defs/canonicalId' },
        path: {
          type: 'string',
          minLength: 1,
          maxLength: VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumPathBytes,
          pattern:
            '^[A-Za-z0-9][A-Za-z0-9._-]*(?:/[A-Za-z0-9][A-Za-z0-9._-]*)*$',
        },
        stagingArtifactId: { $ref: '#/$defs/canonicalId' },
        kind: { enum: ARTIFACT_KINDS },
        expectedDigest: { $ref: '#/$defs/digest' },
        expectedSize: {
          allOf: [
            { $ref: '#/$defs/nonNegativeSafeInteger' },
            {
              maximum: VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumArtifactBytes,
            },
          ],
        },
        expectedMediaType: {
          type: 'string',
          pattern: '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$',
        },
        sourceTraceDigest: { $ref: '#/$defs/digest' },
      },
      additionalProperties: false,
    },
    redaction: {
      type: 'object',
      required: [
        'policyId',
        'scannerSetDigest',
        'droppedFieldCounts',
        'targetPolicy',
        'safe',
      ],
      properties: {
        policyId: { $ref: '#/$defs/canonicalId' },
        scannerSetDigest: { $ref: '#/$defs/digest' },
        droppedFieldCounts: {
          type: 'object',
          maxProperties:
            VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumDroppedFieldCounts,
          propertyNames: {
            type: 'string',
            minLength: 1,
            maxLength: 512,
          },
          additionalProperties: {
            $ref: '#/$defs/nonNegativeSafeInteger',
          },
        },
        targetPolicy: { $ref: '#/$defs/targetPolicy' },
        safe: { const: true },
      },
      additionalProperties: false,
    },
    targetPolicy: {
      type: 'object',
      required: ['authority', 'policyDigest', 'semanticTargetId', 'capture'],
      properties: {
        authority: { const: 'verification-policy' },
        policyDigest: { $ref: '#/$defs/digest' },
        semanticTargetId: { $ref: '#/$defs/canonicalId' },
        capture: {
          enum: ['allowed', 'masked', 'forbidden-sensitive'],
        },
      },
      additionalProperties: false,
    },
    promotion: {
      type: 'object',
      required: ['idempotencyKey', 'deadline'],
      properties: {
        idempotencyKey: { $ref: '#/$defs/canonicalId' },
        deadline: { $ref: '#/$defs/instant' },
      },
      additionalProperties: false,
    },
  },
} as const;
