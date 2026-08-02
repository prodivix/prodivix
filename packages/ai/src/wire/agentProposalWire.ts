const factTypes = [
  'proposal',
  'preview',
  'planning',
  'approval',
  'workspace-mutation-receipt',
] as const;

export const agentProposalFactWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/agent-proposal-fact@1',
  title: 'Agent Proposal Approval and Workspace Mutation Fact Wire',
  type: 'object',
  required: ['wireVersion', 'factType', 'value'],
  properties: {
    wireVersion: { const: 1 },
    factType: { enum: factTypes },
    value: { type: 'object' },
  },
  additionalProperties: false,
} as const;

export const agentProposalFactWireSchemas = Object.freeze({
  'agent-proposal-fact@1': agentProposalFactWireSchema,
});
