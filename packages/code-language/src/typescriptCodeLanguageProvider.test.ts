import {
  createCodeLanguageSnapshotIdentity,
  createCodeSymbolId,
  type CodeArtifact,
  type CodeLanguagePosition,
  type CodeLanguageSnapshot,
  type SemanticSnapshotIdentity,
} from '@prodivix/authoring';
import { describe, expect, it } from 'vitest';
import {
  createCodeExportLocalSymbolId,
  createTypeScriptCodeLanguageCapabilityProvider,
} from '.';

const mathArtifact: CodeArtifact = {
  id: 'code-math',
  path: '/src/math.ts',
  language: 'ts',
  ownership: 'code-owned',
  owner: { kind: 'workspace-module', documentId: 'code-math' },
  source: [
    '/** Adds two numbers. */',
    'export function add(left: number, right: number): number {',
    '  return left + right;',
    '}',
  ].join('\n'),
  revision: '3',
};

const consumerArtifact: CodeArtifact = {
  id: 'code-consumer',
  path: '/src/consumer.ts',
  language: 'ts',
  ownership: 'code-owned',
  owner: { kind: 'workspace-module', documentId: 'code-consumer' },
  source: [
    "import { add } from './math';",
    'export const total = add(1, 2);',
    'export const label: string = add(3, 4);',
  ].join('\n'),
  revision: '5',
};

const semanticIdentity: SemanticSnapshotIdentity = {
  workspaceRevisions: {
    workspaceId: 'workspace-code-language',
    workspaceRev: 8,
    routeRev: 2,
    opSeq: 13,
    documentRevs: {
      [mathArtifact.id]: { contentRev: 3, metaRev: 1 },
      [consumerArtifact.id]: { contentRev: 5, metaRev: 1 },
    },
  },
  schemaVersion: 'semantic-current',
  providerSetDigest: 'providers-current',
};

const snapshot: CodeLanguageSnapshot = {
  identity: semanticIdentity,
  artifacts: [mathArtifact, consumerArtifact],
};

const positionAt = (
  artifact: CodeArtifact,
  needle: string,
  occurrence: number,
  characterOffset = 0
): CodeLanguagePosition => {
  let offset = -1;
  for (let index = 0; index <= occurrence; index += 1) {
    offset = artifact.source.indexOf(needle, offset + 1);
    if (offset < 0)
      throw new Error(`Could not find occurrence ${occurrence} of ${needle}.`);
  }
  const prefix = artifact.source.slice(0, offset + characterOffset);
  const lines = prefix.split(/\r\n?|\n/);
  return {
    artifactId: artifact.id,
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
};

describe('TypeScript code language capability provider', () => {
  it('serves one revision-bound cross-file authoring journey', async () => {
    const provider = createTypeScriptCodeLanguageCapabilityProvider();
    const session = await provider.openSession(snapshot);
    const expectedSnapshotIdentity = session.snapshotIdentity;
    const addUsage = positionAt(consumerArtifact, 'add', 1, 1);

    const definition = await session.getDefinition({
      expectedSnapshotIdentity,
      position: addUsage,
    });
    expect(definition.status).toBe('resolved');
    if (definition.status !== 'resolved') return;
    expect(definition.value).toEqual([
      expect.objectContaining({
        targetRef: { kind: 'code-artifact', artifactId: mathArtifact.id },
        sourceSpan: expect.objectContaining({ artifactId: mathArtifact.id }),
      }),
    ]);

    const references = await session.getReferences({
      expectedSnapshotIdentity,
      position: addUsage,
      includeDeclaration: true,
    });
    expect(references.status).toBe('resolved');
    if (references.status !== 'resolved') return;
    expect(
      new Set(references.value.map(({ sourceSpan }) => sourceSpan.artifactId))
    ).toEqual(new Set([mathArtifact.id, consumerArtifact.id]));

    const completions = await session.getCompletions({
      expectedSnapshotIdentity,
      position: addUsage,
      trigger: { kind: 'invoked' },
    });
    expect(completions.status).toBe('resolved');
    if (completions.status !== 'resolved') return;
    expect(completions.value).toContainEqual(
      expect.objectContaining({ label: 'add', kind: 'symbol' })
    );

    const hover = await session.getHover({
      expectedSnapshotIdentity,
      position: addUsage,
    });
    expect(hover.status).toBe('resolved');
    if (hover.status !== 'resolved') return;
    expect(hover.value.contents.map(({ value }) => value).join('\n')).toMatch(
      /add.*number/s
    );
    expect(hover.value.sourceSpan?.artifactId).toBe(consumerArtifact.id);

    const diagnostics = await session.getDiagnostics({
      expectedSnapshotIdentity,
      artifactId: consumerArtifact.id,
    });
    expect(diagnostics.status).toBe('resolved');
    if (diagnostics.status !== 'resolved') return;
    expect(diagnostics.value).toContainEqual(
      expect.objectContaining({
        code: 'COD-2003',
        targetRef: { kind: 'code-artifact', artifactId: consumerArtifact.id },
        sourceSpan: expect.objectContaining({
          artifactId: consumerArtifact.id,
        }),
      })
    );

    const prepareRename = await session.prepareRename({
      expectedSnapshotIdentity,
      position: addUsage,
    });
    expect(prepareRename).toMatchObject({
      status: 'resolved',
      value: {
        placeholder: 'add',
        sourceSpan: { artifactId: consumerArtifact.id },
      },
    });

    const rename = await session.getRenameEdits({
      expectedSnapshotIdentity,
      position: positionAt(mathArtifact, 'add', 0, 1),
      newName: 'sum',
    });
    expect(rename.status).toBe('resolved');
    if (rename.status !== 'resolved') return;
    expect(rename.value.snapshotIdentity).toEqual(expectedSnapshotIdentity);
    expect(
      new Set(rename.value.edits.map(({ artifactId }) => artifactId))
    ).toEqual(new Set([mathArtifact.id, consumerArtifact.id]));
    expect(rename.value.edits.every(({ newText }) => newText === 'sum')).toBe(
      true
    );
    expect(
      rename.value.edits.every(
        ({ artifactId, expectedRevision }) =>
          expectedRevision ===
          snapshot.artifacts.find(({ id }) => id === artifactId)?.revision
      )
    ).toBe(true);

    const semanticContribution = await session.getSemanticContribution({
      expectedSnapshotIdentity,
    });
    expect(semanticContribution.status).toBe('resolved');
    if (semanticContribution.status !== 'resolved') return;
    const addSymbolId = createCodeSymbolId(
      semanticIdentity.workspaceRevisions.workspaceId,
      mathArtifact.id,
      createCodeExportLocalSymbolId('add')
    );
    expect(semanticContribution.value.symbols).toContainEqual(
      expect.objectContaining({
        id: addSymbolId,
        name: 'add',
        kind: 'code-function',
        stability: 'durable',
      })
    );
    expect(semanticContribution.value.references).toContainEqual(
      expect.objectContaining({
        sourceRef: { kind: 'code-artifact', artifactId: consumerArtifact.id },
        target: { kind: 'symbol-id', symbolId: addSymbolId },
      })
    );

    session.dispose();
  });

  it('returns explicit stale and disposed-session results', async () => {
    const session =
      await createTypeScriptCodeLanguageCapabilityProvider().openSession(
        snapshot
      );
    const addUsage = positionAt(consumerArtifact, 'add', 1, 1);
    const staleIdentity = {
      ...createCodeLanguageSnapshotIdentity(snapshot),
      artifactRevisions: {
        ...createCodeLanguageSnapshotIdentity(snapshot).artifactRevisions,
        [consumerArtifact.id]: '6',
      },
    };

    await expect(
      session.getDefinition({
        expectedSnapshotIdentity: staleIdentity,
        position: addUsage,
      })
    ).resolves.toMatchObject({ status: 'stale' });

    session.dispose();
    await expect(
      session.getHover({
        expectedSnapshotIdentity: session.snapshotIdentity,
        position: addUsage,
      })
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'The code language session has been disposed.',
    });
  });
});
