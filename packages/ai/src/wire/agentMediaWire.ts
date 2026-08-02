const mediaFactEnvelope = (factType: string) =>
  ({
    type: 'object',
    additionalProperties: false,
    required: ['wireVersion', 'factType', 'value'],
    properties: {
      wireVersion: { const: 1 },
      factType: { const: factType },
      value: { type: 'object' },
    },
  }) as const;

/** Strict service/audit envelope; semantic exactness is enforced by the codec. */
export const agentMediaFactWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/agent-media-fact.v1.json',
  title: 'Prodivix Agent media normalized fact wire',
  oneOf: [
    mediaFactEnvelope('media-source-descriptor'),
    mediaFactEnvelope('media-transformation-receipt'),
    mediaFactEnvelope('media-representation'),
    mediaFactEnvelope('generated-artifact-candidate'),
    mediaFactEnvelope('generated-asset-proposal'),
  ],
} as const;

export const agentMediaWireSchemas = Object.freeze({
  'agent-media-fact@1': agentMediaFactWireSchema,
});
