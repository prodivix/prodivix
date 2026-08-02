export const agentProductFactWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/agent-product-fact@1',
  title: 'Agent Product Supplement and User Command Fact Wire',
  type: 'object',
  required: ['wireVersion', 'factType', 'value'],
  properties: {
    wireVersion: { const: 1 },
    factType: { enum: ['product-supplement', 'run-user-command'] },
    value: { type: 'object' },
  },
  additionalProperties: false,
} as const;

export const agentProductViewWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/agent-product-view@1',
  title: 'Agent Product Web and CLI View Wire',
  type: 'object',
  required: ['wireVersion', 'kind', 'value'],
  properties: {
    wireVersion: { const: 1 },
    kind: { const: 'agent-product-view' },
    value: { type: 'object' },
  },
  additionalProperties: false,
} as const;

export const agentProductWireSchemas = Object.freeze({
  'agent-product-fact@1': agentProductFactWireSchema,
  'agent-product-view@1': agentProductViewWireSchema,
});
