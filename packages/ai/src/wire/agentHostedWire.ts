const factTypes = [
  'tool-descriptor',
  'tool-registry-snapshot',
  'tool-discovery-receipt',
  'tool-call-receipt',
  'external-source-result',
  'retrieval-query-receipt',
  'retrieval-index-identity',
  'retrieval-index-deletion-receipt',
  'hosted-sandbox-descriptor',
  'mcp-server-identity',
  'computer-use-session',
  'parallel-tool-join-receipt',
] as const;

export const agentHostedFactWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/agent-hosted-fact@1',
  title: 'Agent Hosted Capability Fact Wire',
  type: 'object',
  required: ['wireVersion', 'factType', 'value'],
  properties: {
    wireVersion: { const: 1 },
    factType: { enum: factTypes },
    value: { type: 'object' },
  },
  additionalProperties: false,
} as const;

export const agentHostedFactWireSchemas = Object.freeze({
  'agent-hosted-fact@1': agentHostedFactWireSchema,
});
