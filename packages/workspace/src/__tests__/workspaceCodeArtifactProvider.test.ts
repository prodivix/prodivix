import { describe, expect, it } from 'vitest';
import {
  createWorkspaceCodeArtifactProvider,
  isWorkspaceCodeDocumentContent,
} from '..';

describe('createWorkspaceCodeArtifactProvider', () => {
  it('projects workspace code documents into code artifacts', () => {
    const provider = createWorkspaceCodeArtifactProvider({
      id: 'workspace-1',
      workspaceRev: 1,
      routeRev: 1,
      opSeq: 1,
      treeRootId: 'root',
      treeById: {
        root: {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: ['src', 'pages'],
        },
        src: {
          id: 'src',
          kind: 'dir',
          name: 'src',
          parentId: 'root',
          children: ['open-dialog-node'],
        },
        'open-dialog-node': {
          id: 'open-dialog-node',
          kind: 'doc',
          name: 'openDialog.ts',
          parentId: 'src',
          docId: 'code-open-dialog',
        },
        pages: {
          id: 'pages',
          kind: 'dir',
          name: 'pages',
          parentId: 'root',
          children: ['home-node'],
        },
        'home-node': {
          id: 'home-node',
          kind: 'doc',
          name: 'home.pir.json',
          parentId: 'pages',
          docId: 'page-home',
        },
      },
      docsById: {
        'code-open-dialog': {
          id: 'code-open-dialog',
          type: 'code',
          path: '/src/actions/openDialog.ts',
          contentRev: 7,
          metaRev: 1,
          content: {
            language: 'ts',
            source: 'export function openDialog() {}',
          },
        },
        'page-home': {
          id: 'page-home',
          type: 'pir-page',
          path: '/pages/home.pir.json',
          contentRev: 1,
          metaRev: 1,
          content: {},
        },
      },
      routeManifest: { version: '1', root: { id: 'route-root' } },
    });

    expect(provider.listArtifacts({ surface: 'code-editor' })).toEqual([
      {
        id: 'code-open-dialog',
        path: '/src/actions/openDialog.ts',
        language: 'ts',
        ownership: 'code-owned',
        owner: { kind: 'workspace-module', documentId: 'code-open-dialog' },
        source: 'export function openDialog() {}',
        revision: '7',
      },
    ]);
    expect(provider.getArtifact('code-open-dialog')).toMatchObject({
      id: 'code-open-dialog',
      path: '/src/actions/openDialog.ts',
    });
    expect(provider.getArtifact('missing-code')).toBeNull();
  });

  it('projects only valid canonical shader compile profiles', () => {
    const provider = createWorkspaceCodeArtifactProvider({
      id: 'workspace-shader',
      workspaceRev: 1,
      routeRev: 1,
      opSeq: 1,
      treeRootId: 'root',
      treeById: {
        root: {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: ['shader-node'],
        },
        'shader-node': {
          id: 'shader-node',
          kind: 'doc',
          name: 'main.wgsl',
          parentId: 'root',
          docId: 'shader-main',
        },
      },
      docsById: {
        'shader-main': {
          id: 'shader-main',
          type: 'code',
          path: '/shaders/main.wgsl',
          contentRev: 3,
          metaRev: 1,
          content: {
            language: 'wgsl',
            source: '@compute @workgroup_size(1) fn main() {}',
            metadata: {
              'prodivix.shaderCompile': {
                schemaVersion: '1.0',
                target: 'webgpu',
                stage: 'compute',
                entryPoint: 'main',
              },
            },
          },
        },
      },
      routeManifest: { version: '1', root: { id: 'route-root' } },
    });

    expect(provider.getArtifact('shader-main')).toMatchObject({
      shaderCompileProfile: {
        schemaVersion: '1.0',
        target: 'webgpu',
        stage: 'compute',
        entryPoint: 'main',
      },
    });
    expect(
      isWorkspaceCodeDocumentContent({
        language: 'wgsl',
        source: '',
        metadata: {
          'prodivix.shaderCompile': {
            schemaVersion: '1.0',
            target: 'webgl2',
            stage: 'vertex',
          },
        },
      })
    ).toBe(false);
  });

  it('accepts only strict Server Function metadata on TypeScript/JavaScript documents', () => {
    const profile = {
      schemaVersion: '1.0',
      functionsByExport: {
        loadPrincipal: {
          kind: 'route-loader',
          runtimeZone: 'server',
          adapterId: 'core.auth.current-principal',
          effect: 'read',
          auth: { kind: 'authenticated' },
          inputSchema: true,
          outputSchema: true,
        },
      },
    };
    expect(
      isWorkspaceCodeDocumentContent({
        language: 'ts',
        source: 'export const loadPrincipal = () => undefined;',
        metadata: { 'prodivix.serverRuntime': profile },
      })
    ).toBe(true);
    expect(
      isWorkspaceCodeDocumentContent({
        language: 'ts',
        source: '',
        metadata: {
          'prodivix.serverRuntime': { ...profile, sessionId: 'forbidden' },
        },
      })
    ).toBe(false);
    expect(
      isWorkspaceCodeDocumentContent({
        language: 'css',
        source: '',
        metadata: { 'prodivix.serverRuntime': profile },
      })
    ).toBe(false);
  });
});
