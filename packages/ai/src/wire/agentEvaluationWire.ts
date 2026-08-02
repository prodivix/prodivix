const factTypes = [
  'evaluation-plan',
  'evaluation-attempt',
  'evaluation-checkpoint',
  'evaluation-metric-report',
  'evaluation-grader-report',
  'evaluation-human-review-report',
  'evaluation-holdout-receipt',
  'evaluation-manifest',
] as const;

export const agentEvaluationFactWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/agent-evaluation-fact@1',
  title: 'Agent Model Evaluation and Release Qualification Fact Wire',
  type: 'object',
  required: ['wireVersion', 'factType', 'value'],
  properties: {
    wireVersion: { const: 1 },
    factType: { enum: factTypes },
    value: { type: 'object' },
  },
  additionalProperties: false,
} as const;

export const agentEvaluationFactWireSchemas = Object.freeze({
  'agent-evaluation-fact@1': agentEvaluationFactWireSchema,
});
