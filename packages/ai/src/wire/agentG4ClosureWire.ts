export const agentG4ClosureManifestWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/agent-g4-closure-manifest@1',
  title: 'Agent G4 Golden Closure Manifest Wire',
  type: 'object',
  required: ['wireVersion', 'factType', 'value'],
  properties: {
    wireVersion: { const: 1 },
    factType: { const: 'g4-golden-closure-manifest' },
    value: { type: 'object' },
  },
  additionalProperties: false,
} as const;

export const agentG4ClosureManifestWireSchemas = Object.freeze({
  'agent-g4-closure-manifest@1': agentG4ClosureManifestWireSchema,
});
