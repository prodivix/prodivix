import type { CodeArtifact } from '@prodivix/authoring';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createCssSemanticContribution } from '.';

const artifacts: readonly CodeArtifact[] = [
  {
    id: 'code-css',
    path: '/styles/theme.css',
    language: 'css',
    owner: { kind: 'workspace-module', documentId: 'code-css' },
    source:
      '.button { animation: reveal 1s; } @keyframes reveal { to { opacity: 1; } }',
    revision: '2',
  },
  {
    id: 'code-scss',
    path: '/styles/tokens.scss',
    language: 'scss',
    owner: { kind: 'workspace-module', documentId: 'code-scss' },
    source:
      '$gap: 4px; @mixin padded { padding: $gap; } .panel { @include padded; }',
    revision: '4',
  },
];

describe('CSS semantic contribution properties', () => {
  it('is invariant to CSS/SCSS artifact input order', () => {
    const expected = createCssSemanticContribution({
      workspaceId: 'workspace-css-order',
      artifacts,
    });

    fc.assert(
      fc.property(fc.boolean(), (reverse) => {
        expect(
          createCssSemanticContribution({
            workspaceId: 'workspace-css-order',
            artifacts: reverse ? [...artifacts].reverse() : [...artifacts],
          })
        ).toEqual(expected);
      }),
      { numRuns: 8 }
    );
  });
});
