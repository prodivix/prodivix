import { describe, expect, it } from 'vitest';
import { decodeNodeGraphDocuments, selectNodeGraphDocument } from '..';

describe('NodeGraph codec', () => {
  it('decodes domain documents without canvas-owned types', () => {
    const decoded = decodeNodeGraphDocuments([
      {
        id: 'main',
        name: 'Main',
        nodes: [{ id: 'start', type: 'graphNode', data: { kind: 'start' } }],
        edges: [],
      },
    ]);

    expect(decoded).toEqual({
      ok: true,
      value: [
        {
          id: 'main',
          name: 'Main',
          nodes: [{ id: 'start', type: 'graphNode', data: { kind: 'start' } }],
          edges: [],
        },
      ],
    });
  });

  it('rejects duplicate ids and dangling edges as one invalid graph set', () => {
    const decoded = decodeNodeGraphDocuments([
      {
        id: 'main',
        nodes: [
          { id: 'same', data: { kind: 'start' } },
          { id: 'same', data: { kind: 'end' } },
        ],
        edges: [
          { id: 'edge', source: 'same', target: 'missing' },
          { id: 'edge', source: 'same', target: 'same' },
        ],
      },
    ]);

    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        'Duplicate node id: same',
        'Duplicate edge id: edge',
        'Unknown target node: missing',
      ])
    );
  });

  it('never falls back to another graph when an explicit selection is missing', () => {
    const documents = [{ id: 'main', name: 'Main', nodes: [], edges: [] }];

    expect(
      selectNodeGraphDocument(documents, { graphId: 'missing' })
    ).toBeNull();
    expect(selectNodeGraphDocument(documents, {})).toBe(documents[0]);
  });
});
