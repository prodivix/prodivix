const identity = {
  type: 'string',
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$',
  maxLength: 256,
} as const;
const digest = { type: 'string', pattern: '^sha256-[a-f0-9]{64}$' } as const;

export const agentTaskOutputWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/agent-task-output@1',
  title: 'Bounded Agent Task User Output Wire',
  type: 'object',
  required: ['wireVersion', 'factType', 'value'],
  properties: {
    wireVersion: { const: 1 },
    factType: { const: 'task-output' },
    value: {
      type: 'object',
      additionalProperties: false,
      required: [
        'outputId',
        'taskId',
        'runId',
        'generation',
        'modelInvocationId',
        'contextPackDigest',
        'projectPolicyDigest',
        'effectivePolicyDigest',
        'kind',
        'text',
        'contentDigest',
        'recordedAt',
        'outputDigest',
      ],
      properties: {
        outputId: identity,
        taskId: identity,
        runId: identity,
        modelInvocationId: identity,
        generation: {
          type: 'integer',
          minimum: 1,
          maximum: 9_007_199_254_740_991,
        },
        contextPackDigest: digest,
        projectPolicyDigest: digest,
        effectivePolicyDigest: digest,
        kind: { enum: ['answer', 'plan'] },
        text: { type: 'string', minLength: 1, maxLength: 65_536 },
        contentDigest: digest,
        outputDigest: digest,
        recordedAt: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$',
        },
      },
    },
  },
  additionalProperties: false,
} as const;
export const agentTaskOutputWireSchemas = Object.freeze({
  'agent-task-output@1': agentTaskOutputWireSchema,
});
