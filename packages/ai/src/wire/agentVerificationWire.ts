const factTypes = [
  'committed-plan-binding',
  'verification-closure-receipt',
  'repair-round-receipt',
] as const;

export const agentVerificationFactWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/agent-verification-fact@2',
  title: 'Agent Verification, Closure, and Repair Fact Wire',
  type: 'object',
  required: ['wireVersion', 'factType', 'value'],
  properties: {
    wireVersion: { const: 2 },
    factType: { enum: factTypes },
    value: { type: 'object' },
  },
  additionalProperties: false,
} as const;

export const agentVerificationFactWireSchemas = Object.freeze({
  'agent-verification-fact@2': agentVerificationFactWireSchema,
});
