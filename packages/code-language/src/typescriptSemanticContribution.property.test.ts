import { createCodeSymbolId, type CodeArtifact } from '@prodivix/authoring';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createCodeExportLocalSymbolId,
  createTypeScriptSemanticContribution,
} from '.';

const workspaceId = 'workspace-semantic-order';
const definitionArtifact: CodeArtifact = {
  id: 'code-definition',
  path: '/src/definition.ts',
  language: 'ts',
  owner: { kind: 'workspace-module', documentId: 'code-definition' },
  source: 'export const calculate = (value: number) => value * 2;',
  revision: '2',
};
const consumerArtifact: CodeArtifact = {
  id: 'code-consumer',
  path: '/src/consumer.ts',
  language: 'ts',
  owner: { kind: 'workspace-module', documentId: 'code-consumer' },
  source: [
    "import { calculate } from './definition';",
    'export const result = calculate(21);',
  ].join('\n'),
  revision: '4',
};
const canonicalArtifacts = [definitionArtifact, consumerArtifact] as const;

describe('TypeScript semantic contribution properties', () => {
  it('is invariant to CodeArtifact input order', () => {
    const expected = createTypeScriptSemanticContribution({
      workspaceId,
      artifacts: canonicalArtifacts,
    });

    fc.assert(
      fc.property(fc.boolean(), (reverse) => {
        const artifacts = reverse
          ? [...canonicalArtifacts].reverse()
          : [...canonicalArtifacts];
        expect(
          createTypeScriptSemanticContribution({ workspaceId, artifacts })
        ).toEqual(expected);
      }),
      { numRuns: 8 }
    );
  });

  it('uses export:<name> local identities for durable exported symbols', () => {
    const localSymbolId = createCodeExportLocalSymbolId('calculate');
    const contribution = createTypeScriptSemanticContribution({
      workspaceId,
      artifacts: canonicalArtifacts,
    });

    expect(localSymbolId).toBe('export:calculate');
    expect(contribution.symbols).toContainEqual(
      expect.objectContaining({
        id: createCodeSymbolId(
          workspaceId,
          definitionArtifact.id,
          localSymbolId
        ),
        name: 'calculate',
        stability: 'durable',
      })
    );
  });
});
