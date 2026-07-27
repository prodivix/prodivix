import { describe, expect, it } from 'vitest';
import { decodeNodeGraphDocument, encodeNodeGraphDocument } from '..';
import { nodeGraphCurrentWireSchema } from '../wire';

describe('NodeGraph current wire conformance', () => {
  it('decodes every canonical schema example through the current model', () => {
    for (const example of nodeGraphCurrentWireSchema.examples) {
      const decoded = decodeNodeGraphDocument(example);
      expect(decoded).toEqual({
        ok: true,
        value: {
          nodes: example.nodes,
          edges: example.edges,
        },
        sourceWireVersion: 2,
        appliedMigrations: [],
      });
      if (decoded.ok) {
        expect(encodeNodeGraphDocument(decoded.value)).toEqual(example);
      }
    }
  });
});
