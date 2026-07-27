import { describe, expect, it } from 'vitest';
import {
  CURRENT_SEMANTIC_SCHEMA_VERSION,
  type SemanticSnapshotIdentity,
} from '@prodivix/authoring';
import { createDesignTokenSemanticContributionProvider } from './designTokenSemanticContributionProvider';

const identity: SemanticSnapshotIdentity = {
  workspaceRevisions: {
    workspaceId: 'ws',
    workspaceRev: 1,
    routeRev: 1,
    opSeq: 1,
    documentRevs: { doc: { contentRev: 1, metaRev: 1 } },
  },
  schemaVersion: CURRENT_SEMANTIC_SCHEMA_VERSION,
  providerSetDigest: 'design-token-reference-identity',
};

describe('Design Token semantic reference identity', () => {
  it('keeps sibling value references distinct when a $value key contains the path separator', () => {
    const contribution = createDesignTokenSemanticContributionProvider({
      workspaceId: 'ws',
      documents: [
        {
          documentId: 'doc',
          revision: { contentRev: 1, metaRev: 1 },
          content: {
            color: { $type: 'color', base: { $value: '#ffffff' } },
            x: {
              $type: 'custom',
              $value: { 'a/b': '{color.base}', a: { b: '{color.base}' } },
            },
          },
        },
      ],
    }).contribute(identity);

    const referenceIds = (contribution.references ?? []).map(({ id }) => id);

    expect(referenceIds).toHaveLength(2);
    expect(new Set(referenceIds).size).toBe(referenceIds.length);
  });
});
