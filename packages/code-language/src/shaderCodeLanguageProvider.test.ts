import type {
  CodeArtifact,
  CodeLanguagePosition,
  CodeLanguageSnapshot,
  SemanticSnapshotIdentity,
} from '@prodivix/authoring';
import { describe, expect, it } from 'vitest';
import { createShaderCodeLanguageCapabilityProvider } from '.';

const artifacts: readonly CodeArtifact[] = [
  {
    id: 'code-glsl-vertex',
    path: '/shaders/vertex.glsl',
    language: 'glsl',
    owner: { kind: 'workspace-module', documentId: 'code-glsl-vertex' },
    source: [
      '#version 300 es',
      'precision highp float;',
      'uniform float time;',
      'float wave(float value) { return sin(value + time); }',
      'void main() { gl_Position = vec4(wave(time)); }',
    ].join('\n'),
    revision: '2',
  },
  {
    id: 'code-wgsl-fragment',
    path: '/shaders/fragment.wgsl',
    language: 'wgsl',
    owner: { kind: 'workspace-module', documentId: 'code-wgsl-fragment' },
    source: [
      'fn shade(value: f32) -> f32 { return sin(value); }',
      '@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {',
      '  let intensity = shade(uv.x);',
      '  return vec4f(intensity);',
      '}',
    ].join('\n'),
    revision: '4',
  },
  {
    id: 'code-wgsl-invalid',
    path: '/shaders/invalid.wgsl',
    language: 'wgsl',
    owner: { kind: 'workspace-module', documentId: 'code-wgsl-invalid' },
    source: '@vertex fn broken( {',
    revision: '1',
  },
];

const semanticIdentity: SemanticSnapshotIdentity = {
  workspaceRevisions: {
    workspaceId: 'workspace-shader-language',
    workspaceRev: 9,
    routeRev: 1,
    opSeq: 12,
    documentRevs: Object.fromEntries(
      artifacts.map((artifact) => [
        artifact.id,
        { contentRev: Number(artifact.revision), metaRev: 1 },
      ])
    ),
  },
  schemaVersion: 'semantic-current',
  providerSetDigest: 'providers-current',
};

const snapshot: CodeLanguageSnapshot = {
  identity: semanticIdentity,
  artifacts,
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
    if (offset < 0) throw new Error(`Could not find ${needle}.`);
  }
  const lines = artifact.source
    .slice(0, offset + characterOffset)
    .split(/\r\n?|\n/u);
  return {
    artifactId: artifact.id,
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
};

describe('Shader code language capability provider', () => {
  it('serves GLSL and WGSL authoring from one revision-bound session', async () => {
    const session =
      await createShaderCodeLanguageCapabilityProvider().openSession(snapshot);
    const expectedSnapshotIdentity = session.snapshotIdentity;
    const glsl = artifacts[0]!;
    const wgsl = artifacts[1]!;

    await expect(
      session.getDefinition({
        expectedSnapshotIdentity,
        position: positionAt(glsl, 'time', 2, 2),
      })
    ).resolves.toMatchObject({
      status: 'resolved',
      value: [
        {
          targetRef: { kind: 'code-artifact', artifactId: glsl.id },
          sourceSpan: { artifactId: glsl.id, startLine: 3 },
        },
      ],
    });

    const helperUsage = positionAt(wgsl, 'shade', 1, 2);
    const references = await session.getReferences({
      expectedSnapshotIdentity,
      position: helperUsage,
      includeDeclaration: true,
    });
    expect(references.status).toBe('resolved');
    if (references.status !== 'resolved') return;
    expect(references.value).toHaveLength(2);

    const completions = await session.getCompletions({
      expectedSnapshotIdentity,
      position: positionAt(wgsl, 'return vec4f', 0),
      trigger: { kind: 'invoked' },
    });
    expect(completions.status).toBe('resolved');
    if (completions.status !== 'resolved') return;
    expect(completions.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'shade', kind: 'symbol' }),
        expect.objectContaining({ label: 'textureSample', kind: 'symbol' }),
      ])
    );

    const hover = await session.getHover({
      expectedSnapshotIdentity,
      position: positionAt(wgsl, 'fs_main', 0, 2),
    });
    expect(hover.status).toBe('resolved');
    if (hover.status !== 'resolved') return;
    expect(hover.value.contents.map(({ value }) => value).join('\n')).toMatch(
      /fragment shader entry point/i
    );

    const rename = await session.getRenameEdits({
      expectedSnapshotIdentity,
      position: helperUsage,
      newName: 'toneMap',
    });
    expect(rename.status).toBe('resolved');
    if (rename.status !== 'resolved') return;
    expect(rename.value.edits).toHaveLength(2);
    expect(
      rename.value.edits.every(({ newText }) => newText === 'toneMap')
    ).toBe(true);

    const diagnostics = await session.getDiagnostics({
      expectedSnapshotIdentity,
      artifactId: artifacts[2]!.id,
    });
    expect(diagnostics.status).toBe('resolved');
    if (diagnostics.status !== 'resolved') return;
    expect(diagnostics.value).toContainEqual(
      expect.objectContaining({
        code: 'COD-1001',
        targetRef: {
          kind: 'code-artifact',
          artifactId: artifacts[2]!.id,
        },
      })
    );

    const semanticContribution = await session.getSemanticContribution({
      expectedSnapshotIdentity,
    });
    expect(semanticContribution.status).toBe('resolved');
    if (semanticContribution.status !== 'resolved') return;
    expect(semanticContribution.value.symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'shader-entry',
          name: 'main',
          typeRef: 'shader-entry:glsl:unknown',
        }),
        expect.objectContaining({
          kind: 'shader-entry',
          name: 'fs_main',
          typeRef: 'shader-entry:wgsl:fragment',
        }),
      ])
    );

    session.dispose();
  });
});
