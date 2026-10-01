import { createCodeSymbolId, type CodeArtifact } from '@prodivix/authoring';
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
  ownership: 'code-owned',
  owner: { kind: 'workspace-module', documentId: 'code-definition' },
  source: 'export const calculate = (value: number) => value * 2;',
  revision: '2',
};
const consumerArtifact: CodeArtifact = {
  id: 'code-consumer',
  path: '/src/consumer.ts',
  language: 'ts',
  ownership: 'code-owned',
  owner: { kind: 'workspace-module', documentId: 'code-consumer' },
  source: [
    "import { calculate } from './definition';",
    'export const result = calculate(21);',
  ].join('\n'),
  revision: '4',
};
const canonicalArtifacts = [definitionArtifact, consumerArtifact] as const;

describe('TypeScript semantic contribution properties', () => {
  it('publishes destructured, namespace and transitive star exports under each module identity', () => {
    const artifact = (id: string, source: string): CodeArtifact => ({
      ...definitionArtifact,
      id,
      path: `/src/${id}.ts`,
      owner: { kind: 'workspace-module', documentId: id },
      source,
    });
    const artifacts = [
      artifact(
        'definition',
        'export const { value, nested: { label } } = { value: 1, nested: { label: "ready" } }; export const [first, ...rest] = [1, 2]; export default 3;'
      ),
      artifact(
        'barrel',
        'export * from "./definition"; export * as values from "./definition";'
      ),
      artifact('outer', 'export * from "./barrel";'),
    ];
    const contribution = createTypeScriptSemanticContribution({
      workspaceId,
      artifacts,
    });
    for (const module of ['definition', 'barrel', 'outer']) {
      for (const name of ['value', 'label', 'first', 'rest'])
        expect(contribution.symbols).toContainEqual(
          expect.objectContaining({
            id: createCodeSymbolId(
              workspaceId,
              module,
              createCodeExportLocalSymbolId(name)
            ),
            name,
            stability: 'durable',
          })
        );
    }
    expect(contribution.symbols).toContainEqual(
      expect.objectContaining({
        id: createCodeSymbolId(
          workspaceId,
          'barrel',
          createCodeExportLocalSymbolId('values')
        ),
        name: 'values',
      })
    );
    expect(
      contribution.symbols?.some(
        ({ id }) =>
          id ===
          createCodeSymbolId(
            workspaceId,
            'barrel',
            createCodeExportLocalSymbolId('default')
          )
      )
    ).toBe(false);
    expect(contribution.diagnostics).toEqual([]);
  });
  it('is invariant to CodeArtifact input order', () => {
    const contributions = [
      canonicalArtifacts,
      [...canonicalArtifacts].reverse(),
    ].map((artifacts) =>
      createTypeScriptSemanticContribution({ workspaceId, artifacts })
    );

    expect(contributions[1]).toEqual(contributions[0]);
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
