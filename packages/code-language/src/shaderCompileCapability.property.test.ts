import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type {
  CodeArtifact,
  CodeLanguageSnapshot,
  SemanticSnapshotIdentity,
  ShaderCompilerBackend,
} from '@prodivix/authoring';
import { createShaderCompileCapabilityProvider } from '.';

const artifact: CodeArtifact = {
  id: 'shader-main',
  path: '/shaders/main.glsl',
  language: 'glsl',
  ownership: 'code-owned',
  owner: { kind: 'workspace-module', documentId: 'shader-main' },
  source: 'void main() {\n  gl_Position = vec4(0.0);\n}\n',
  revision: '7',
  shaderCompileProfile: {
    schemaVersion: '1.0',
    target: 'webgl2',
    stage: 'vertex',
  },
};

const semanticIdentity: SemanticSnapshotIdentity = {
  workspaceRevisions: {
    workspaceId: 'workspace-shader-compile',
    workspaceRev: 9,
    routeRev: 1,
    opSeq: 4,
    documentRevs: {
      [artifact.id]: { contentRev: 7, metaRev: 1 },
    },
  },
  schemaVersion: 'semantic-current',
  providerSetDigest: 'providers-current',
};

const snapshot: CodeLanguageSnapshot = {
  identity: semanticIdentity,
  artifacts: [artifact],
};

describe('shader compile capability properties', () => {
  it('maps bounded backend ranges to revision-bound COD-5002 diagnostics', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: artifact.source.length }),
        fc.string({ minLength: 1, maxLength: 80 }),
        async (offset, message) => {
          const backend: ShaderCompilerBackend = {
            id: 'fake-webgl2',
            target: 'webgl2',
            async compile() {
              return {
                status: 'compiled',
                success: false,
                messages: [
                  {
                    severity: 'error',
                    message: `C:\\private\\shader.glsl ${message}`,
                    offset,
                    length: 1,
                    upstreamCode: 'GLSL-COMPILE',
                  },
                ],
              };
            },
          };
          const session = await createShaderCompileCapabilityProvider({
            backend,
          }).openSession(snapshot);
          const result = await session.compile({
            artifactId: artifact.id,
            expectedSnapshotIdentity: session.snapshotIdentity,
          });
          expect(result.status).toBe('resolved');
          if (result.status !== 'resolved') return;
          expect(result.value.success).toBe(false);
          expect(result.value.diagnostics).toEqual([
            expect.objectContaining({
              code: 'COD-5002',
              sourceSpan: expect.objectContaining({
                artifactId: artifact.id,
              }),
              meta: expect.objectContaining({
                target: 'webgl2',
                shaderStage: 'vertex',
              }),
            }),
          ]);
          expect(result.value.diagnostics[0]?.message).not.toContain(
            'C:\\private'
          );
          session.dispose();
        }
      ),
      { numRuns: 60 }
    );
  });

  it('rejects stale and disposed requests without invoking the backend', async () => {
    let compileCount = 0;
    const backend: ShaderCompilerBackend = {
      id: 'fake-webgl2',
      target: 'webgl2',
      async compile() {
        compileCount += 1;
        return { status: 'compiled', success: true, messages: [] };
      },
    };
    const session = await createShaderCompileCapabilityProvider({
      backend,
    }).openSession(snapshot);
    await expect(
      session.compile({
        artifactId: artifact.id,
        expectedSnapshotIdentity: {
          ...session.snapshotIdentity,
          artifactRevisions: { [artifact.id]: '8' },
        },
      })
    ).resolves.toMatchObject({ status: 'stale' });
    session.dispose();
    await expect(
      session.compile({
        artifactId: artifact.id,
        expectedSnapshotIdentity: session.snapshotIdentity,
      })
    ).resolves.toMatchObject({ status: 'unavailable' });
    expect(compileCount).toBe(0);
  });

  it('validates a persisted WGSL entry profile before invoking WebGPU', async () => {
    let compileCount = 0;
    const wgslArtifact: CodeArtifact = {
      ...artifact,
      id: 'shader-wgsl',
      path: '/shaders/main.wgsl',
      language: 'wgsl',
      source: '@compute @workgroup_size(1) fn compute_main() {}',
      shaderCompileProfile: {
        schemaVersion: '1.0',
        target: 'webgpu',
        stage: 'compute',
        entryPoint: 'missing_main',
      },
    };
    const backend: ShaderCompilerBackend = {
      id: 'fake-webgpu',
      target: 'webgpu',
      async compile() {
        compileCount += 1;
        return { status: 'compiled', success: true, messages: [] };
      },
    };
    const session = await createShaderCompileCapabilityProvider({
      backend,
    }).openSession({
      identity: {
        ...semanticIdentity,
        workspaceRevisions: {
          ...semanticIdentity.workspaceRevisions,
          documentRevs: {
            [wgslArtifact.id]: { contentRev: 7, metaRev: 1 },
          },
        },
      },
      artifacts: [wgslArtifact],
    });
    const result = await session.compile({
      artifactId: wgslArtifact.id,
      expectedSnapshotIdentity: session.snapshotIdentity,
    });
    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') return;
    expect(result.value.diagnostics).toEqual([
      expect.objectContaining({
        code: 'COD-5002',
        message: expect.stringContaining('missing_main'),
        meta: expect.objectContaining({
          upstreamCode: 'profile-entry-missing',
        }),
      }),
    ]);
    expect(compileCount).toBe(0);
  });
});
