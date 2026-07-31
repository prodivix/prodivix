const identifier = {
  type: 'string',
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$',
} as const;

const digest = {
  type: 'string',
  pattern: '^sha256-[a-f0-9]{64}$',
} as const;

const instant = {
  type: 'string',
  minLength: 20,
  maxLength: 24,
  pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$',
} as const;

const ciIdentity = {
  type: 'object',
  required: ['repository', 'ref', 'commit'],
  properties: {
    repository: { type: 'string', minLength: 1, maxLength: 512 },
    ref: { type: 'string', minLength: 6, maxLength: 512 },
    commit: {
      type: 'string',
      pattern: '^(?:sha1-[0-9a-f]{40}|sha256-[0-9a-f]{64})$',
    },
  },
  additionalProperties: false,
} as const;

const cellState = {
  type: 'object',
  required: ['cellId', 'attemptId', 'status', 'lastEventCursor'],
  properties: {
    cellId: { $ref: '#/$defs/identifier' },
    attemptId: { $ref: '#/$defs/identifier' },
    status: {
      enum: [
        'queued',
        'running',
        'passed',
        'failed',
        'blocked',
        'unsupported',
        'unstable',
        'not-applicable',
        'cancelled',
        'interrupted',
      ],
    },
    lastEventCursor: {
      type: 'integer',
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
    },
    startedAt: { $ref: '#/$defs/instant' },
    completedAt: { $ref: '#/$defs/instant' },
    candidateDigest: { $ref: '#/$defs/digest' },
    evidenceId: { $ref: '#/$defs/identifier' },
    diagnosticCode: {
      type: 'string',
      pattern: '^(?:BHV|VER)-[0-9]{4}$',
    },
  },
  additionalProperties: false,
} as const;

export const VERIFICATION_RUN_SNAPSHOT_WIRE_VERSION = 1 as const;

export const verificationRunSnapshotWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/verification-run-snapshot.v1.schema.json',
  title: 'VerificationRunSnapshotWire',
  type: 'object',
  required: [
    'wireVersion',
    'runId',
    'workspaceId',
    'workspaceRevision',
    'planDigest',
    'surface',
    'scope',
    'providerId',
    'origin',
    'status',
    'cursor',
    'createdAt',
    'updatedAt',
    'selectedCellIds',
    'cells',
    'snapshotDigest',
  ],
  properties: {
    wireVersion: { const: VERIFICATION_RUN_SNAPSHOT_WIRE_VERSION },
    runId: { $ref: '#/$defs/identifier' },
    workspaceId: { $ref: '#/$defs/identifier' },
    workspaceRevision: {
      type: 'integer',
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
    },
    planDigest: { $ref: '#/$defs/digest' },
    surface: { enum: ['preview', 'export', 'ci'] },
    scope: { enum: ['impacted', 'required', 'all', 'cell'] },
    providerId: { $ref: '#/$defs/identifier' },
    origin: { enum: ['web', 'cli', 'ci'] },
    ci: { $ref: '#/$defs/ciIdentity' },
    status: {
      enum: [
        'queued',
        'running',
        'cancelling',
        'completed',
        'failed',
        'blocked',
        'cancelled',
        'interrupted',
      ],
    },
    cursor: {
      type: 'integer',
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
    },
    createdAt: { $ref: '#/$defs/instant' },
    updatedAt: { $ref: '#/$defs/instant' },
    selectedCellIds: {
      type: 'array',
      minItems: 1,
      maxItems: 10_000,
      uniqueItems: true,
      items: { $ref: '#/$defs/identifier' },
    },
    cells: {
      type: 'array',
      minItems: 1,
      maxItems: 10_000,
      items: { $ref: '#/$defs/cellState' },
    },
    closureDigest: { $ref: '#/$defs/digest' },
    closureVerdict: { enum: ['satisfied', 'unsatisfied', 'stale'] },
    snapshotDigest: { $ref: '#/$defs/digest' },
  },
  allOf: [
    {
      if: { properties: { origin: { const: 'ci' } }, required: ['origin'] },
      then: { required: ['ci'] },
      else: { not: { required: ['ci'] } },
    },
    {
      if: { required: ['closureDigest'] },
      then: { required: ['closureVerdict'] },
      else: { not: { required: ['closureVerdict'] } },
    },
  ],
  additionalProperties: false,
  $defs: {
    identifier,
    digest,
    instant,
    ciIdentity,
    cellState,
  },
} as const;

export const VERIFICATION_RUN_EVENT_WIRE_VERSION = 1 as const;

const eventCommonProperties = {
  wireVersion: { const: VERIFICATION_RUN_EVENT_WIRE_VERSION },
  eventId: { $ref: '#/$defs/identifier' },
  runId: { $ref: '#/$defs/identifier' },
  cursor: {
    type: 'integer',
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER,
  },
  occurredAt: { $ref: '#/$defs/instant' },
  eventDigest: { $ref: '#/$defs/digest' },
} as const;

const eventSchema = (
  kind: string,
  required: readonly string[],
  properties: Readonly<Record<string, unknown>> = {}
) => ({
  type: 'object',
  required: [
    'wireVersion',
    'eventId',
    'runId',
    'cursor',
    'occurredAt',
    'eventDigest',
    'kind',
    ...required,
  ],
  properties: {
    ...eventCommonProperties,
    kind: { const: kind },
    ...properties,
  },
  additionalProperties: false,
});

export const verificationRunEventWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/verification-run-event.v1.schema.json',
  title: 'VerificationRunEventWire',
  oneOf: [
    eventSchema('run-started', []),
    eventSchema('cell-started', ['cellId', 'attemptId'], {
      cellId: { $ref: '#/$defs/identifier' },
      attemptId: { $ref: '#/$defs/identifier' },
    }),
    eventSchema(
      'cell-reported',
      ['cellId', 'attemptId', 'outcome', 'candidateDigest'],
      {
        cellId: { $ref: '#/$defs/identifier' },
        attemptId: { $ref: '#/$defs/identifier' },
        outcome: {
          enum: [
            'passed',
            'failed',
            'blocked',
            'cancelled',
            'infrastructure-error',
          ],
        },
        candidateDigest: { $ref: '#/$defs/digest' },
        diagnosticCode: {
          type: 'string',
          pattern: '^(?:BHV|VER)-[0-9]{4}$',
        },
      }
    ),
    eventSchema(
      'cell-promoted',
      ['cellId', 'attemptId', 'candidateDigest', 'evidenceId'],
      {
        cellId: { $ref: '#/$defs/identifier' },
        attemptId: { $ref: '#/$defs/identifier' },
        candidateDigest: { $ref: '#/$defs/digest' },
        evidenceId: { $ref: '#/$defs/identifier' },
      }
    ),
    eventSchema('run-cancel-requested', ['reason'], {
      reason: { type: 'string', minLength: 1, maxLength: 1_024 },
    }),
    eventSchema('run-interrupted', ['reasonCode'], {
      reasonCode: {
        type: 'string',
        pattern: '^(?:BHV|VER)-[0-9]{4}$',
      },
    }),
    eventSchema('run-completed', []),
    eventSchema('closure-evaluated', ['closureDigest', 'verdict'], {
      closureDigest: { $ref: '#/$defs/digest' },
      verdict: { enum: ['satisfied', 'unsatisfied', 'stale'] },
    }),
  ],
  $defs: {
    identifier,
    digest,
    instant,
  },
} as const;
