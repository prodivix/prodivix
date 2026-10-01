const identity = {
  type: 'string',
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$',
  maxLength: 256,
} as const;
const digest = { type: 'string', pattern: '^sha256-[a-f0-9]{64}$' } as const;
const strings = (items: unknown) => ({
  type: 'array',
  items,
  uniqueItems: true,
  maxItems: 1_024,
});
export const agentRepairTaskRequestWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/agent-repair-task-request@1',
  title: 'Failure-bound derived Agent Task request',
  type: 'object',
  additionalProperties: false,
  required: ['wireVersion', 'factType', 'value'],
  properties: {
    wireVersion: { const: 1 },
    factType: { const: 'repair-task-request' },
    value: {
      type: 'object',
      additionalProperties: false,
      required: [
        'requestId',
        'parentTaskId',
        'parentTaskDigest',
        'parentRunId',
        'failedClosureReceiptId',
        'failedClosureDigest',
        'counterexamples',
        'expectedParentSnapshotDigest',
        'expectedParentLedgerDigest',
        'currentRevision',
        'requestedAt',
        'requestedTask',
        'requestDigest',
      ],
      properties: {
        requestId: identity,
        parentTaskId: identity,
        parentTaskDigest: digest,
        parentRunId: identity,
        failedClosureReceiptId: identity,
        failedClosureDigest: digest,
        expectedParentSnapshotDigest: digest,
        expectedParentLedgerDigest: digest,
        requestDigest: digest,
        requestedAt: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$',
        },
        requestedTask: {
          type: 'object',
          additionalProperties: false,
          required: ['wireVersion', 'factType', 'value'],
          properties: {
            wireVersion: { const: 1 },
            factType: { const: 'task-record' },
            value: { type: 'object' },
          },
        },
        currentRevision: {
          type: 'object',
          additionalProperties: false,
          required: ['workspaceRev', 'routeRev', 'opSeq', 'documents'],
          properties: {
            workspaceRev: { type: 'integer', minimum: 0 },
            routeRev: { type: 'integer', minimum: 0 },
            opSeq: { type: 'integer', minimum: 0 },
            documents: {
              type: 'array',
              maxItems: 10_000,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['documentId', 'contentRev', 'metaRev'],
                properties: {
                  documentId: identity,
                  contentRev: { type: 'integer', minimum: 0 },
                  metaRev: { type: 'integer', minimum: 0 },
                },
              },
            },
          },
        },
        counterexamples: {
          type: 'object',
          additionalProperties: false,
          required: [
            'failedClosureDigest',
            'requirements',
            'counterexampleSetDigest',
            'regressionRequirementSetDigest',
          ],
          properties: {
            failedClosureDigest: digest,
            counterexampleSetDigest: digest,
            regressionRequirementSetDigest: digest,
            requirements: {
              type: 'array',
              minItems: 1,
              maxItems: 1_024,
              items: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'sourceCellId',
                  'stableCellDigest',
                  'checkId',
                  'targetId',
                  'evidenceManifestDigests',
                  'sourceTraceDigests',
                  'diagnosticCodes',
                  'requirementDigest',
                ],
                properties: {
                  sourceCellId: identity,
                  stableCellDigest: digest,
                  checkId: identity,
                  targetId: identity,
                  evidenceManifestDigests: strings(digest),
                  sourceTraceDigests: strings(digest),
                  diagnosticCodes: strings(identity),
                  requirementDigest: digest,
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
export const agentRepairTaskWireSchemas = Object.freeze({
  'agent-repair-task-request@1': agentRepairTaskRequestWireSchema,
});
