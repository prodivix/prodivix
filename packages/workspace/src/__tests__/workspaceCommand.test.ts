import { describe, expect, it } from 'vitest';
import { createDefaultPirDoc } from '@prodivix/pir';
import {
  applyWorkspaceCommand,
  createWorkspaceCodeDocumentCommand,
  createWorkspaceCodeDocumentIntentRequest,
  createWorkspaceCodeSourceUpdateCommand,
  projectWorkspaceToProdivixFiles,
  type WorkspaceSnapshot,
  type WorkspaceCommandEnvelope,
} from '..';

const createWorkspace = (): WorkspaceSnapshot => ({
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
  it('applies document-scoped PIR graph commands without forging server contentRev', () => {
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

    expect(result.snapshot.docsById['page-home'].contentRev).toBe(1);
    expect(result.snapshot.docsById['page-home'].content).toHaveProperty(
      'ui.graph.nodesById.root.props.title',
      'Home'
    );
  });

  it('uses strict RFC6901 pointers and canonical array indices', () => {
    const invalidPointers = [
      '/metadata/~2invalid',
      '/metadata/list/01',
      '/metadata/list/1e0',
    ];
    invalidPointers.forEach((path) => {
      const workspace = createWorkspace();
      workspace.docsById['code-open-dialog']!.content = {
        language: 'ts',
        source: 'export function openDialog() {}',
        metadata: { list: ['a', 'b'] },
      };
      const result = applyWorkspaceCommand(
        workspace,
        createCommand({
          namespace: 'core.code',
          type: 'metadata.update',
          domainHint: 'code',
          target: {
            workspaceId: workspace.id,
            documentId: 'code-open-dialog',
          },
          forwardOps: [{ op: 'replace', path, value: 'changed' }],
          reverseOps: [{ op: 'replace', path, value: 'before' }],
        })
      );
      expect(result.ok).toBe(false);
    });
  });

  it('treats prototype-shaped pointer segments as safe own JSON keys', () => {
    const workspace = createWorkspace();
    workspace.docsById['code-open-dialog']!.content = {
      language: 'ts',
      source: 'export function openDialog() {}',
      metadata: {},
    };
    const result = applyWorkspaceCommand(
      workspace,
      createCommand({
        namespace: 'core.code',
        type: 'metadata.update',
        domainHint: 'code',
        target: {
          workspaceId: workspace.id,
          documentId: 'code-open-dialog',
        },
        forwardOps: [
          {
            op: 'add',
            path: '/metadata/__proto__',
            value: { polluted: true },
          },
        ],
        reverseOps: [{ op: 'remove', path: '/metadata/__proto__' }],
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const content = result.snapshot.docsById['code-open-dialog']!.content as {
      metadata: Record<string, unknown>;
    };
    expect(Object.hasOwn(content.metadata, '__proto__')).toBe(true);
    expect(content.metadata['__proto__']).toEqual({ polluted: true });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();

    const inheritedReplace = applyWorkspaceCommand(
      workspace,
      createCommand({
        namespace: 'core.code',
        type: 'metadata.update',
        domainHint: 'code',
        target: {
          workspaceId: workspace.id,
          documentId: 'code-open-dialog',
        },
        forwardOps: [
          { op: 'replace', path: '/metadata/toString', value: 'unsafe' },
        ],
        reverseOps: [{ op: 'remove', path: '/metadata/toString' }],
      })
    );
    expect(inheritedReplace.ok).toBe(false);
  });

  it('rejects workspace and route domains on document-targeted commands', () => {
    for (const domainHint of ['workspace', 'route'] as const) {
      const result = applyWorkspaceCommand(
        createWorkspace(),
        createCommand({
          domainHint,
          forwardOps: [
            {
              op: 'add',
              path: '/ui/graph/nodesById/root/props',
              value: { title: 'Home' },
            },
          ],
          reverseOps: [
            { op: 'remove', path: '/ui/graph/nodesById/root/props' },
          ],
        })
      );

      expect(result).toMatchObject({
        ok: false,
        issues: [
          {
            code: 'WKS_COMMAND_INVALID_ENVELOPE',
            path: '/domainHint',
          },
        ],
      });
    }
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
    expect(result.snapshot.docsById['code-open-dialog'].contentRev).toBe(1);
    expect(result.snapshot.docsById['code-open-dialog'].content).toHaveProperty(
      'source',
      'export function openDialog(id: string) { return id; }'
    );
  });

  it('builds a reusable code source command with history merge semantics', () => {
    const workspace = createWorkspace();
    const command = createWorkspaceCodeSourceUpdateCommand({
      workspaceId: workspace.id,
      document: workspace.docsById['code-open-dialog'],
      source: 'export function openDialog(id: string) { return id; }',
      commandId: 'update-open-dialog',
      issuedAt: '2026-07-12T00:00:00.000Z',
    });

    expect(command).toMatchObject({
      namespace: 'core.code',
      type: 'source.update',
      domainHint: 'code',
      mergeKey: 'code-source:code-open-dialog',
    });
    expect(command && applyWorkspaceCommand(workspace, command)).toMatchObject({
      ok: true,
      snapshot: {
        docsById: {
          'code-open-dialog': {
            content: {
              source: 'export function openDialog(id: string) { return id; }',
            },
          },
        },
      },
    });
    expect(
      createWorkspaceCodeSourceUpdateCommand({
        workspaceId: workspace.id,
        document: workspace.docsById['code-open-dialog'],
        source: 'export function openDialog() {}',
        commandId: 'noop',
        issuedAt: '2026-07-12T00:00:00.000Z',
      })
    ).toBeNull();
  });

  it('keeps code documents inside the language/source wrapper', () => {
    const result = applyWorkspaceCommand(
      createWorkspace(),
      createCommand({
        namespace: 'core.code',
        type: 'source.remove',
        target: {
          workspaceId: 'workspace-1',
          documentId: 'code-open-dialog',
        },
        forwardOps: [{ op: 'remove', path: '/source' }],
        reverseOps: [
          {
            op: 'add',
            path: '/source',
            value: 'export function openDialog() {}',
          },
        ],
      })
    );

    expect(result.ok).toBe(false);
    if (result.ok !== false) return;
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'WKS_COMMAND_VALIDATION_FAILED' })
    );
  });

  it('selects the document patch whitelist from document.type, not domainHint', () => {
    const workspace = createWorkspace();
    workspace.docsById['page-home'] = {
      ...workspace.docsById['page-home'],
      type: 'pir-graph',
      content: {
        nodesById: {},
        edgesById: {},
        groupsById: {},
      },
    };

    const result = applyWorkspaceCommand(
      workspace,
      createCommand({
        domainHint: 'pir',
        forwardOps: [
          {
            op: 'add',
            path: '/nodesById/validateCart',
            value: { id: 'validateCart' },
          },
        ],
        reverseOps: [{ op: 'remove', path: '/nodesById/validateCart' }],
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.docsById['page-home'].content).toHaveProperty(
      'nodesById.validateCart.id',
      'validateCart'
    );
  });

  it('allows embedded logic and animation paths on combined PIR documents', () => {
    const result = applyWorkspaceCommand(
      createWorkspace(),
      createCommand({
        namespace: 'core.nodegraph',
        domainHint: 'nodegraph',
        forwardOps: [
          { op: 'add', path: '/logic', value: { nodesById: {} } },
          { op: 'add', path: '/animation', value: { timelinesById: {} } },
        ],
        reverseOps: [
          { op: 'remove', path: '/animation' },
          { op: 'remove', path: '/logic' },
        ],
      })
    );

    expect(result.ok).toBe(true);
  });

  it('does not let a domainHint bypass the actual document type', () => {
    const result = applyWorkspaceCommand(
      createWorkspace(),
      createCommand({
        namespace: 'core.nodegraph',
        domainHint: 'nodegraph',
        forwardOps: [
          {
            op: 'add',
            path: '/nodesById/validateCart',
            value: { id: 'validateCart' },
          },
        ],
        reverseOps: [{ op: 'remove', path: '/nodesById/validateCart' }],
      })
    );

    expect(result.ok).toBe(false);
    if (result.ok !== false) return;
    expect(result.issues.map((issue) => issue.code)).toContain(
      'WKS_COMMAND_PATCH_PATH_FORBIDDEN'
    );
  });

  it('keeps standalone animation commands at the animation document root', () => {
    const workspace = createWorkspace();
    workspace.docsById['page-home'] = {
      ...workspace.docsById['page-home'],
      type: 'pir-animation',
      content: { timelinesById: {} },
    };

    const accepted = applyWorkspaceCommand(
      workspace,
      createCommand({
        forwardOps: [
          {
            op: 'add',
            path: '/timelinesById/hero',
            value: { id: 'hero' },
          },
        ],
        reverseOps: [{ op: 'remove', path: '/timelinesById/hero' }],
      })
    );
    expect(accepted.ok).toBe(true);

    const rejected = applyWorkspaceCommand(
      workspace,
      createCommand({
        forwardOps: [
          { op: 'add', path: '/animation', value: { timelinesById: {} } },
        ],
        reverseOps: [{ op: 'remove', path: '/animation' }],
      })
    );
    expect(rejected.ok).toBe(false);
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
    const workspace: WorkspaceSnapshot = {
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
