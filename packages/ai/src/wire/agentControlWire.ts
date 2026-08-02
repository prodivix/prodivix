const factTypes = [
  'task-record',
  'run-snapshot',
  'run-event',
  'audit-export',
] as const;

export const agentControlFactWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/agent-control-fact@1',
  title: 'Agent Task and Run Control Plane Fact Wire',
  type: 'object',
  required: ['wireVersion', 'factType', 'value'],
  properties: {
    wireVersion: { const: 1 },
    factType: { enum: factTypes },
    value: { type: 'object' },
  },
  additionalProperties: false,
} as const;

export const agentControlFactWireSchemas = Object.freeze({
  'agent-control-fact@1': agentControlFactWireSchema,
});
