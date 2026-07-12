import { describe, expect, it } from 'vitest';
import {
  WorkspaceDocumentFactoryError,
  applyWorkspaceCommand,
  createWorkspaceDocumentAtPathCommand,
  type WorkspaceCommandEnvelope,
  type WorkspaceDocument,
  type WorkspaceSnapshot,
} from '..';

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-1',
  workspaceRev: 5,
  routeRev: 2,
  opSeq: 8,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['src'],
    },
    src: {
      id: 'src',
      kind: 'dir',
      name: 'src',
      parentId: 'root',
      children: ['code-existing-node'],
    },
    'code-existing-node': {
      id: 'code-existing-node',
      kind: 'doc',
      name: 'existing.ts',
      parentId: 'src',
      docId: 'code-existing',
    },
  },
  docsById: {
    'code-existing': {
      id: 'code-existing',
      type: 'code',
      path: '/src/existing.ts',
      contentRev: 3,
      metaRev: 1,
      content: { language: 'ts', source: 'export const existing = true;' },
    },
  },
  routeManifest: { version: '1', root: { id: 'route-root' } },
});

const createMountedCssDocument = (
  overrides: Partial<WorkspaceDocument> = {}
): WorkspaceDocument => ({
  id: 'code-mounted-button',
  type: 'code',
  path: '/styles/mounted/button.css',
  contentRev: 1,
  metaRev: 1,
  content: { language: 'css', source: '.button {}' },
  ...overrides,
});

const reverseCommand = (
  command: WorkspaceCommandEnvelope
): WorkspaceCommandEnvelope => ({
  ...command,
  id: `${command.id}:reverse`,
  forwardOps: command.reverseOps,
  reverseOps: command.forwardOps,
});

describe('createWorkspaceDocumentAtPathCommand', () => {
  it('creates missing directories and a reversible document mount command', () => {
    const workspace = createWorkspace();
    const command = createWorkspaceDocumentAtPathCommand({
      workspace,
      document: createMountedCssDocument(),
      commandId: 'command-create-mounted-css',
      issuedAt: '2026-07-12T09:00:00.000Z',
    });

    const applied = applyWorkspaceCommand(workspace, command);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.snapshot.docsById['code-mounted-button']).toMatchObject({
      path: '/styles/mounted/button.css',
      contentRev: 1,
    });
    expect(applied.snapshot.treeById).toMatchObject({
      dir_styles: {
        kind: 'dir',
        parentId: 'root',
        children: ['dir_styles_mounted'],
      },
      dir_styles_mounted: {
        kind: 'dir',
        parentId: 'dir_styles',
        children: ['doc_code-mounted-button'],
      },
      'doc_code-mounted-button': {
        kind: 'doc',
        parentId: 'dir_styles_mounted',
        docId: 'code-mounted-button',
      },
    });

    const restored = applyWorkspaceCommand(
      applied.snapshot,
      reverseCommand(command)
    );
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.snapshot).toEqual(workspace);
  });

  it('rejects duplicate document ids and canonical paths', () => {
    const workspace = createWorkspace();

    expect(() =>
      createWorkspaceDocumentAtPathCommand({
        workspace,
        document: createMountedCssDocument({
          id: 'code-existing',
          path: '/styles/existing.css',
        }),
        commandId: 'duplicate-id',
        issuedAt: '2026-07-12T09:00:00.000Z',
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'WKS_DOCUMENT_FACTORY_DUPLICATE_ID',
      })
    );

    expect(() =>
      createWorkspaceDocumentAtPathCommand({
        workspace,
        document: createMountedCssDocument({ path: '/src/existing.ts' }),
        commandId: 'duplicate-path',
        issuedAt: '2026-07-12T09:00:00.000Z',
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'WKS_DOCUMENT_FACTORY_DUPLICATE_PATH',
      })
    );
  });

  it('rejects paths that traverse an existing document node', () => {
    expect(() =>
      createWorkspaceDocumentAtPathCommand({
        workspace: createWorkspace(),
        document: createMountedCssDocument({
          path: '/src/existing.ts/nested.css',
        }),
        commandId: 'path-conflict',
        issuedAt: '2026-07-12T09:00:00.000Z',
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'WKS_DOCUMENT_FACTORY_VFS_CONFLICT',
      })
    );
  });

  it('rejects canonical VFS node id collisions instead of inventing suffixes', () => {
    const workspace = createWorkspace();
    workspace.treeById.dir_styles = {
      id: 'dir_styles',
      kind: 'dir',
      name: 'unrelated',
      parentId: 'root',
      children: [],
    };

    expect(() =>
      createWorkspaceDocumentAtPathCommand({
        workspace,
        document: createMountedCssDocument(),
        commandId: 'canonical-id-conflict',
        issuedAt: '2026-07-12T09:00:00.000Z',
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'WKS_DOCUMENT_FACTORY_NODE_ID_COLLISION',
      })
    );
  });

  it('uses an injected node id factory and escapes JSON pointer ids', () => {
    const generatedIds: string[] = [];
    const command = createWorkspaceDocumentAtPathCommand({
      workspace: createWorkspace(),
      document: createMountedCssDocument({
        id: 'code/button~theme',
        path: '/themes/button.css',
      }),
      commandId: 'custom-node-ids',
      issuedAt: '2026-07-12T09:00:00.000Z',
      idFactory: (preferredId) => {
        const id = `custom-${generatedIds.length + 1}-${preferredId}`;
        generatedIds.push(id);
        return id;
      },
    });

    const applied = applyWorkspaceCommand(createWorkspace(), command);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(generatedIds).toHaveLength(2);
    expect(applied.snapshot.docsById['code/button~theme']).toBeDefined();
    expect(applied.snapshot.treeById[generatedIds[1]]).toMatchObject({
      docId: 'code/button~theme',
    });
  });

  it('reports typed factory errors', () => {
    expect(() =>
      createWorkspaceDocumentAtPathCommand({
        workspace: createWorkspace(),
        document: createMountedCssDocument({ path: 'relative/button.css' }),
        commandId: 'invalid-path',
        issuedAt: '2026-07-12T09:00:00.000Z',
      })
    ).toThrow(WorkspaceDocumentFactoryError);
  });
});
