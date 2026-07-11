import { describe, expect, it } from 'vitest';
import { createDefaultPirDoc } from '@/pir/resolvePirDocument';
import {
  applyWorkspaceCommand,
  createWorkspaceCodeDocumentCommand,
  createWorkspaceCodeDocumentIntentRequest,
  projectWorkspaceToProdivixFiles,
  type StableWorkspaceSnapshot,
  type WorkspaceCommandEnvelope,
} from '..';

const createWorkspace = (): StableWorkspaceSnapshot => ({
  id: 'workspace-1',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  activeDocumentId: 'page-home',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['pages', 'src'],
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
    src: {
      id: 'src',
      kind: 'dir',
      name: 'src',
      parentId: 'root',
      children: ['code-node'],
    },
    'code-node': {
      id: 'code-node',
      kind: 'doc',
      name: 'openDialog.ts',
      parentId: 'src',
      docId: 'code-open-dialog',
    },
  },
  docsById: {
    'page-home': {
      id: 'page-home',
      type: 'pir-page',
      path: '/pages/home.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createDefaultPirDoc(),
    },
    'code-open-dialog': {
      id: 'code-open-dialog',
      type: 'code',
      path: '/src/openDialog.ts',
      contentRev: 1,
      metaRev: 1,
      content: {
        language: 'ts',
        source: 'export function openDialog() {}',
      },
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'route-root' },
  },
});

const createCommand = (
  overrides: Partial<WorkspaceCommandEnvelope>
): WorkspaceCommandEnvelope => ({
  id: 'command-1',
  namespace: 'core.pir',
  type: 'node.update',
  version: '1.0',
  issuedAt: '2026-05-10T00:00:00.000Z',
  forwardOps: [],
  reverseOps: [],
  target: { workspaceId: 'workspace-1', documentId: 'page-home' },
  ...overrides,
});

describe('applyWorkspaceCommand', () => {
  it('applies document-scoped PIR graph commands and increments contentRev', () => {
    const result = applyWorkspaceCommand(
      createWorkspace(),
      createCommand({
        forwardOps: [
          {
            op: 'add',
            path: '/ui/graph/nodesById/root/props',
            value: { title: 'Home' },
          },
        ],
        reverseOps: [{ op: 'remove', path: '/ui/graph/nodesById/root/props' }],
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.snapshot.docsById['page-home'].contentRev).toBe(2);
    expect(result.snapshot.docsById['page-home'].content).toHaveProperty(
      'ui.graph.nodesById.root.props.title',
      'Home'
    );
  });

  it('rejects document commands that patch legacy ui.root', () => {
    const result = applyWorkspaceCommand(
      createWorkspace(),
      createCommand({
        forwardOps: [{ op: 'add', path: '/ui/root', value: {} }],
        reverseOps: [{ op: 'remove', path: '/ui/root' }],
      })
    );

    expect(result.ok).toBe(false);
    if (result.ok !== false) return;
    expect(result.issues.map((issue) => issue.code)).toContain(
      'WKS_COMMAND_PATCH_PATH_FORBIDDEN'
    );
  });

  it('applies code document commands without PIR graph validation', () => {
    const result = applyWorkspaceCommand(
      createWorkspace(),
      createCommand({
        namespace: 'core.code',
        type: 'source.update',
        target: {
          workspaceId: 'workspace-1',
          documentId: 'code-open-dialog',
        },
        forwardOps: [
          {
            op: 'replace',
            path: '/source',
            value: 'export function openDialog(id: string) { return id; }',
          },
        ],
        reverseOps: [
          {
            op: 'replace',
            path: '/source',
            value: 'export function openDialog() {}',
          },
        ],
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.docsById['code-open-dialog'].contentRev).toBe(2);
    expect(result.snapshot.docsById['code-open-dialog'].content).toHaveProperty(
      'source',
      'export function openDialog(id: string) { return id; }'
    );
  });

  it('rejects workspace commands that break VFS invariants', () => {
    const result = applyWorkspaceCommand(
      createWorkspace(),
      createCommand({
        target: { workspaceId: 'workspace-1' },
        namespace: 'core.workspace',
        type: 'document.move',
        forwardOps: [
          { op: 'replace', path: '/treeById/root/children', value: [] },
        ],
        reverseOps: [
          {
            op: 'replace',
            path: '/treeById/root/children',
            value: ['pages', 'src'],
          },
        ],
      })
    );

    expect(result.ok).toBe(false);
    if (result.ok !== false) return;
    expect(result.issues.map((issue) => issue.code)).toContain(
      'WKS_COMMAND_VALIDATION_FAILED'
    );
  });

  it('rejects deleting documents that are still referenced by the route graph', () => {
    const workspace: StableWorkspaceSnapshot = {
      ...createWorkspace(),
      routeManifest: {
        version: '1',
        root: {
          id: 'route-root',
          children: [
            {
              id: 'route-home',
              segment: '',
              pageDocId: 'page-home',
            },
          ],
        },
        modules: {
          account: {
            moduleId: 'account',
            version: '1',
            root: {
              id: 'module-account-root',
              layoutDocId: 'layout-account',
            },
          },
        },
      },
      docsById: {
        ...createWorkspace().docsById,
        'layout-account': {
          id: 'layout-account',
          type: 'pir-layout',
          path: '/layouts/account.pir.json',
          contentRev: 1,
          metaRev: 1,
          content: createDefaultPirDoc(),
        },
      },
    };

    const result = applyWorkspaceCommand(
      workspace,
      createCommand({
        target: { workspaceId: 'workspace-1' },
        namespace: 'core.workspace',
        type: 'document.delete',
        forwardOps: [{ op: 'remove', path: '/docsById/layout-account' }],
        reverseOps: [
          {
            op: 'add',
            path: '/docsById/layout-account',
            value: workspace.docsById['layout-account'],
          },
        ],
      })
    );

    expect(result.ok).toBe(false);
    if (result.ok !== false) return;
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'WKS_COMMAND_VALIDATION_FAILED',
        documentId: 'layout-account',
        message:
          'Workspace document is referenced by the route graph and cannot be deleted.',
      })
    );
  });

  it('creates code documents through a workspace command with a stable VFS path', () => {
    const workspace = createWorkspace();
    const command = createWorkspaceCodeDocumentCommand({
      workspace,
      commandId: 'command-create-code',
      issuedAt: '2026-05-10T00:00:00.000Z',
      parentNodeId: 'src',
      documentId: 'code-fetch-user',
      nodeId: 'code-fetch-user-node',
      name: 'fetchUser.ts',
      content: {
        language: 'ts',
        source: 'export async function fetchUser() { return null; }',
      },
    });

    const result = applyWorkspaceCommand(workspace, command);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.snapshot.treeById.src.children).toEqual([
      'code-node',
      'code-fetch-user-node',
    ]);
    expect(result.snapshot.treeById['code-fetch-user-node']).toMatchObject({
      kind: 'doc',
      parentId: 'src',
      docId: 'code-fetch-user',
    });
    expect(result.snapshot.docsById['code-fetch-user']).toMatchObject({
      id: 'code-fetch-user',
      type: 'code',
      path: '/src/fetchUser.ts',
      content: {
        language: 'ts',
        source: 'export async function fetchUser() { return null; }',
      },
    });

    const projected = projectWorkspaceToProdivixFiles(result.snapshot);
    expect(projected.ok).toBe(true);
    if (!projected.ok) return;

    expect(projected.files).toContainEqual(
      expect.objectContaining({
        path: 'src/fetchUser.ts',
        content: 'export async function fetchUser() { return null; }',
        documentId: 'code-fetch-user',
      })
    );
  });

  it('creates a backend intent request for persistent code document creation', () => {
    const request = createWorkspaceCodeDocumentIntentRequest({
      workspaceRev: 9,
      intentId: 'intent-code-create',
      issuedAt: '2026-05-10T00:00:00.000Z',
      documentId: 'code-mounted-css-button-1',
      nodeId: 'node-code-mounted-css-button-1',
      path: '/styles/mounted/button-1.css',
      content: {
        language: 'css',
        source: '/* Mounted CSS */\n',
        metadata: {
          slotKind: 'mounted-css',
        },
      },
      clientMutationId: 'mutation-code-create',
    });

    expect(request).toEqual({
      expectedWorkspaceRev: 9,
      clientMutationId: 'mutation-code-create',
      intent: {
        id: 'intent-code-create',
        namespace: 'core.workspace',
        type: 'code-document.create',
        version: '1.0',
        payload: {
          documentId: 'code-mounted-css-button-1',
          nodeId: 'node-code-mounted-css-button-1',
          path: '/styles/mounted/button-1.css',
          content: {
            language: 'css',
            source: '/* Mounted CSS */\n',
            metadata: {
              slotKind: 'mounted-css',
            },
          },
        },
        issuedAt: '2026-05-10T00:00:00.000Z',
      },
    });
  });
});
