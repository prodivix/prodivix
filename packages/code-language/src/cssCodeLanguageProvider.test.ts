import type {
  CodeArtifact,
  CodeLanguagePosition,
  CodeLanguageSnapshot,
  SemanticSnapshotIdentity,
} from '@prodivix/authoring';
import { describe, expect, it } from 'vitest';
import { createCssCodeLanguageCapabilityProvider } from '.';

const cssArtifact: CodeArtifact = {
  id: 'code-theme',
  path: '/styles/theme.css',
  language: 'css',
  owner: { kind: 'workspace-module', documentId: 'code-theme' },
  source: [
    ':root { --brand: #7c3aed; }',
    '.card {',
    '  color: var(--brand);',
    '  display: fl;',
    '  animation: fade 120ms ease;',
    '}',
    '@keyframes fade { from { opacity: 0; } to { opacity: 1; } }',
  ].join('\n'),
  revision: '3',
};

const semanticIdentity: SemanticSnapshotIdentity = {
  workspaceRevisions: {
    workspaceId: 'workspace-css-language',
    workspaceRev: 5,
    routeRev: 1,
    opSeq: 8,
    documentRevs: {
      [cssArtifact.id]: { contentRev: 3, metaRev: 1 },
    },
  },
  schemaVersion: 'semantic-current',
  providerSetDigest: 'providers-current',
};

const snapshot: CodeLanguageSnapshot = {
  identity: semanticIdentity,
  artifacts: [cssArtifact],
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
    if (offset < 0) {
      throw new Error(`Could not find occurrence ${occurrence} of ${needle}.`);
    }
  }
  const prefix = artifact.source.slice(0, offset + characterOffset);
  const lines = prefix.split(/\r\n?|\n/);
  return {
    artifactId: artifact.id,
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
};

describe('CSS code language capability provider', () => {
  it('serves CSS authoring and rename from one revision-bound session', async () => {
    const session =
      await createCssCodeLanguageCapabilityProvider().openSession(snapshot);
    const expectedSnapshotIdentity = session.snapshotIdentity;
    const customPropertyUsage = positionAt(cssArtifact, '--brand', 1, 2);

    await expect(
      session.getDefinition({
        expectedSnapshotIdentity,
        position: customPropertyUsage,
      })
    ).resolves.toMatchObject({
      status: 'resolved',
      value: [
        {
          targetRef: { kind: 'code-artifact', artifactId: cssArtifact.id },
          sourceSpan: { artifactId: cssArtifact.id, startLine: 1 },
        },
      ],
    });

    const references = await session.getReferences({
      expectedSnapshotIdentity,
      position: customPropertyUsage,
      includeDeclaration: true,
    });
    expect(references.status).toBe('resolved');
    if (references.status !== 'resolved') return;
    expect(references.value).toHaveLength(2);

    const completions = await session.getCompletions({
      expectedSnapshotIdentity,
      position: positionAt(cssArtifact, 'fl;', 0, 2),
      trigger: { kind: 'invoked' },
    });
    expect(completions.status).toBe('resolved');
    if (completions.status !== 'resolved') return;
    expect(completions.value).toContainEqual(
      expect.objectContaining({ label: 'flex', kind: 'symbol' })
    );

    const hover = await session.getHover({
      expectedSnapshotIdentity,
      position: positionAt(cssArtifact, 'display', 0, 2),
    });
    expect(hover.status).toBe('resolved');
    if (hover.status !== 'resolved') return;
    expect(hover.value.contents.map(({ value }) => value).join('\n')).toMatch(
      /display/i
    );

    const rename = await session.getRenameEdits({
      expectedSnapshotIdentity,
      position: customPropertyUsage,
      newName: '--accent',
    });
    expect(rename.status).toBe('resolved');
    if (rename.status !== 'resolved') return;
    expect(rename.value.edits).toHaveLength(2);
    expect(
      rename.value.edits.every(({ newText }) => newText === '--accent')
    ).toBe(true);

    const semanticContribution = await session.getSemanticContribution({
      expectedSnapshotIdentity,
    });
    expect(semanticContribution.status).toBe('resolved');
    if (semanticContribution.status !== 'resolved') return;
    expect(semanticContribution.value.symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'css-symbol',
          name: '.card',
          stability: 'durable',
          typeRef: 'css-symbol:selector',
        }),
        expect.objectContaining({
          kind: 'css-symbol',
          name: 'fade',
          stability: 'durable',
          typeRef: 'css-symbol:keyframes',
        }),
      ])
    );

    session.dispose();
  });
});
