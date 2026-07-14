import { describe, expect, it } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import {
  validateWorkspaceVfs,
  type WorkspaceDocument,
  type WorkspaceVfsNode,
} from '..';

const createDocument = (id: string, path: string): WorkspaceDocument => ({
  id,
  type: 'pir-page',
  name: id,
  path,
  contentRev: 1,
  metaRev: 1,
  content: createEmptyPirDocument(),
});

describe('validateWorkspaceVfs', () => {
  it('accepts a valid workspace tree', () => {
    const result = validateWorkspaceVfs({
      treeRootId: 'root',
      activeDocumentId: 'doc-home',
      docsById: {
        'doc-home': createDocument('doc-home', '/pages/home.pir.json'),
      },
      treeById: {
        root: {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: ['pages'],
        },
        pages: {
          id: 'pages',
          kind: 'dir',
          name: 'pages',
          parentId: 'root',
          children: ['node-home'],
        },
        'node-home': {
          id: 'node-home',
          kind: 'doc',
          name: 'home.pir.json',
          parentId: 'pages',
          docId: 'doc-home',
        },
      },
    });

    expect(result).toEqual({ valid: true, issues: [] });
  });

  it('rejects missing roots and stops before walking the tree', () => {
    const result = validateWorkspaceVfs({
      treeRootId: 'missing-root',
      docsById: {},
      treeById: {},
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'WKS_ROOT_MISSING',
    ]);
  });

  it('rejects a treeRootId with outer whitespace', () => {
    const result = validateWorkspaceVfs({
      treeRootId: ' root ',
      docsById: {},
      treeById: {
        ' root ': {
          id: ' root ',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: [],
        },
      },
    });

    expect(result.issues.map((issue) => issue.code)).toContain(
      'WKS_ROOT_ID_INVALID'
    );
  });

  it('rejects a workspace without any documents', () => {
    const result = validateWorkspaceVfs({
      treeRootId: 'root',
      docsById: {},
      treeById: {
        root: {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: [],
        },
      },
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'WKS_DOCUMENTS_EMPTY',
        path: '/docsById',
      })
    );
  });

  it('rejects outer whitespace in every non-root VFS identity field', () => {
    const result = validateWorkspaceVfs({
      treeRootId: 'root',
      docsById: {
        'doc-home': createDocument('doc-home', '/home.pir.json'),
      },
      treeById: {
        root: {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: [' node-home '],
        },
        ' node-home ': {
          id: ' node-home ',
          kind: 'doc',
          name: 'home.pir.json',
          parentId: ' root ',
          docId: ' doc-home ',
        },
      },
    });
    const codes = result.issues.map((issue) => issue.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        'WKS_NODE_ID_INVALID',
        'WKS_NODE_PARENT_ID_INVALID',
        'WKS_DIR_CHILD_ID_INVALID',
        'WKS_DOC_REF_ID_INVALID',
      ])
    );
    expect(
      result.issues
        .filter((issue) => issue.code === 'WKS_NODE_ID_INVALID')
        .map((issue) => issue.path)
    ).toEqual(
      expect.arrayContaining([
        '/treeById/ node-home ',
        '/treeById/ node-home /id',
      ])
    );
  });

  it('reports broken document refs, duplicate document mounts, and orphan documents', () => {
    const result = validateWorkspaceVfs({
      treeRootId: 'root',
      docsById: {
        'doc-home': createDocument('doc-home', '/home.pir.json'),
        'doc-unused': createDocument('doc-unused', '/unused.pir.json'),
      },
      treeById: {
        root: {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: ['home-a', 'home-b', 'broken'],
        },
        'home-a': {
          id: 'home-a',
          kind: 'doc',
          name: 'home-a.pir.json',
          parentId: 'root',
          docId: 'doc-home',
        },
        'home-b': {
          id: 'home-b',
          kind: 'doc',
          name: 'home-b.pir.json',
          parentId: 'root',
          docId: 'doc-home',
        },
        broken: {
          id: 'broken',
          kind: 'doc',
          name: 'broken.pir.json',
          parentId: 'root',
          docId: 'missing-doc',
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'WKS_DOC_REF_DUPLICATE',
        'WKS_DOC_REF_MISSING',
        'WKS_DOCUMENT_ORPHANED',
      ])
    );
  });

  it('reports parent-child drift, duplicate sibling names, cycles, and orphan nodes', () => {
    const result = validateWorkspaceVfs({
      treeRootId: 'root',
      docsById: {},
      treeById: {
        root: {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: ['alpha', 'beta', 'loop-a'],
        },
        alpha: {
          id: 'alpha',
          kind: 'dir',
          name: 'same',
          parentId: 'root',
          children: [],
        },
        beta: {
          id: 'beta',
          kind: 'dir',
          name: 'same',
          parentId: 'missing-parent',
          children: [],
        },
        'loop-a': {
          id: 'loop-a',
          kind: 'dir',
          name: 'loop-a',
          parentId: 'loop-b',
          children: ['loop-b'],
        },
        'loop-b': {
          id: 'loop-b',
          kind: 'dir',
          name: 'loop-b',
          parentId: 'loop-a',
          children: ['loop-a'],
        },
        orphan: {
          id: 'orphan',
          kind: 'dir',
          name: 'orphan',
          parentId: null,
          children: [],
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'WKS_DIR_DUPLICATE_NAME',
        'WKS_NODE_PARENT_MISSING',
        'WKS_DIR_CHILD_PARENT_MISMATCH',
        'WKS_TREE_CYCLE',
        'WKS_TREE_ORPHANED_NODE',
      ])
    );
  });

  it('requires document paths to match the derived VFS path', () => {
    const result = validateWorkspaceVfs({
      treeRootId: 'root',
      docsById: {
        'doc-home': createDocument('doc-home', '/wrong/home.pir.json'),
      },
      treeById: {
        root: {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: ['pages'],
        },
        pages: {
          id: 'pages',
          kind: 'dir',
          name: 'pages',
          parentId: 'root',
          children: ['home'],
        },
        home: {
          id: 'home',
          kind: 'doc',
          name: 'home.pir.json',
          parentId: 'pages',
          docId: 'doc-home',
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain(
      'WKS_DOCUMENT_PATH_MISMATCH'
    );
  });

  it('validates document identity, type, revisions, and type-owned content at runtime', () => {
    const invalidDocument = {
      ...createDocument('different-id', '/main.ts'),
      type: 'unknown',
      contentRev: 0,
      name: null,
      updatedAt: '2026-02-30T00:00:00Z',
    } as unknown as WorkspaceDocument;
    const result = validateWorkspaceVfs({
      treeRootId: 'root',
      docsById: { 'doc-code': invalidDocument },
      treeById: {
        root: {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: ['node-code'],
        },
        'node-code': {
          id: 'node-code',
          kind: 'doc',
          name: 'main.ts',
          parentId: 'root',
          docId: 'doc-code',
        },
      },
    });

    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'WKS_DOCUMENT_ID_MISMATCH',
        'WKS_DOCUMENT_TYPE_INVALID',
        'WKS_DOCUMENT_REVISION_INVALID',
        'WKS_DOCUMENT_NAME_INVALID',
        'WKS_DOCUMENT_UPDATED_AT_INVALID',
      ])
    );

    const invalidCodeContent = {
      ...createDocument('doc-code', '/main.ts'),
      type: 'code' as const,
      content: { language: 'ts', source: '', metadata: [] },
    };
    const contentResult = validateWorkspaceVfs({
      treeRootId: 'root',
      docsById: { 'doc-code': invalidCodeContent },
      treeById: {
        root: {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: ['node-code'],
        },
        'node-code': {
          id: 'node-code',
          kind: 'doc',
          name: 'main.ts',
          parentId: 'root',
          docId: 'doc-code',
        },
      },
    });
    expect(contentResult.issues.map((issue) => issue.code)).toContain(
      'WKS_DOCUMENT_CONTENT_INVALID'
    );

    const nullDocumentResult = validateWorkspaceVfs({
      treeRootId: 'root',
      docsById: {
        'doc-null': null,
      } as unknown as Record<string, WorkspaceDocument>,
      treeById: {
        root: {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: ['node-null'],
        },
        'node-null': {
          id: 'node-null',
          kind: 'doc',
          name: 'null.json',
          parentId: 'root',
          docId: 'doc-null',
        },
      },
    });
    expect(nullDocumentResult.issues.map((issue) => issue.code)).toContain(
      'WKS_DOCUMENT_TYPE_INVALID'
    );
  });

  it('rejects an explicit whitespace-only document name but allows omission', () => {
    const treeById: Record<string, WorkspaceVfsNode> = {
      root: {
        id: 'root',
        kind: 'dir',
        name: '/',
        parentId: null,
        children: ['home'],
      },
      home: {
        id: 'home',
        kind: 'doc',
        name: 'home.pir.json',
        parentId: 'root',
        docId: 'doc-home',
      },
    };
    const namedDocument = {
      ...createDocument('doc-home', '/home.pir.json'),
      name: '   ',
    };
    const invalid = validateWorkspaceVfs({
      treeRootId: 'root',
      docsById: { 'doc-home': namedDocument },
      treeById,
    });
    const unnamedDocument = createDocument('doc-home', '/home.pir.json');
    delete unnamedDocument.name;

    expect(invalid.issues.map((issue) => issue.code)).toContain(
      'WKS_DOCUMENT_NAME_INVALID'
    );
    expect(
      validateWorkspaceVfs({
        treeRootId: 'root',
        docsById: { 'doc-home': unnamedDocument },
        treeById,
      })
    ).toEqual({ valid: true, issues: [] });
  });

  it('requires capabilities to use the same canonical Unicode ordering as the server', () => {
    const capabilities = ['𐀀', 'é'];
    const result = validateWorkspaceVfs({
      treeRootId: 'root',
      docsById: {
        'doc-home': {
          ...createDocument('doc-home', '/home.pir.json'),
          capabilities,
        },
      },
      treeById: {
        root: {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: ['home'],
        },
        home: {
          id: 'home',
          kind: 'doc',
          name: 'home.pir.json',
          parentId: 'root',
          docId: 'doc-home',
        },
      },
    });
    expect(result.issues.map((issue) => issue.code)).toContain(
      'WKS_DOCUMENT_CAPABILITIES_INVALID'
    );

    capabilities.splice(0, capabilities.length, 'é', '𐀀');
    expect(
      validateWorkspaceVfs({
        treeRootId: 'root',
        docsById: {
          'doc-home': {
            ...createDocument('doc-home', '/home.pir.json'),
            capabilities,
          },
        },
        treeById: {
          root: {
            id: 'root',
            kind: 'dir',
            name: '/',
            parentId: null,
            children: ['home'],
          },
          home: {
            id: 'home',
            kind: 'doc',
            name: 'home.pir.json',
            parentId: 'root',
            docId: 'doc-home',
          },
        },
      }).valid
    ).toBe(true);
  });

  it.each([
    ['empty list', []],
    ['surrounding whitespace', [' code.author ']],
    ['empty value', ['']],
    ['duplicate value', ['code.author', 'code.author']],
  ])('rejects %s in document capabilities', (_name, capabilities) => {
    const result = validateWorkspaceVfs({
      treeRootId: 'root',
      docsById: {
        'doc-home': {
          ...createDocument('doc-home', '/home.pir.json'),
          capabilities,
        },
      },
      treeById: {
        root: {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: ['home'],
        },
        home: {
          id: 'home',
          kind: 'doc',
          name: 'home.pir.json',
          parentId: 'root',
          docId: 'doc-home',
        },
      },
    });
    expect(result.issues.map((issue) => issue.code)).toContain(
      'WKS_DOCUMENT_CAPABILITIES_INVALID'
    );
  });

  it('rejects path-normalizing node names and document paths', () => {
    const result = validateWorkspaceVfs({
      treeRootId: 'root',
      docsById: {
        'doc-home': createDocument('doc-home', '/pages/inner/home.pir.json/'),
      },
      treeById: {
        root: {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: ['pages'],
        },
        pages: {
          id: 'pages',
          kind: 'dir',
          name: 'pages/inner',
          parentId: 'root',
          children: ['home'],
        },
        home: {
          id: 'home',
          kind: 'doc',
          name: 'home.pir.json',
          parentId: 'pages',
          docId: 'doc-home',
        },
      },
    });
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'WKS_NODE_NAME_INVALID',
        'WKS_DOCUMENT_PATH_INVALID',
        'WKS_DOCUMENT_PATH_MISMATCH',
      ])
    );
  });

  it('requires the workspace root to be a directory', () => {
    const result = validateWorkspaceVfs({
      treeRootId: 'root',
      docsById: {},
      treeById: {
        root: {
          id: 'root',
          kind: 'doc',
          name: '/',
          parentId: null,
        },
      },
    });
    expect(result.issues.map((issue) => issue.code)).toContain(
      'WKS_ROOT_KIND_INVALID'
    );
  });

  it('enforces the closed document and discriminated VFS node wire shapes', () => {
    const document = {
      ...createDocument('doc-home', '/home.pir.json'),
      serverOnly: true,
    } as WorkspaceDocument;
    const result = validateWorkspaceVfs({
      treeRootId: 'root',
      docsById: { 'doc-home': document },
      treeById: {
        root: {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: ['home'],
          docId: 'not-valid-on-dir',
        } as unknown as WorkspaceVfsNode,
        home: {
          id: 'home',
          kind: 'doc',
          name: 'home.pir.json',
          parentId: 'root',
          docId: 'doc-home',
          children: [],
        } as unknown as WorkspaceVfsNode,
      },
    });
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'WKS_DOCUMENT_FIELD_INVALID',
        'WKS_NODE_FIELD_INVALID',
        'WKS_DOC_NODE_CHILDREN_INVALID',
      ])
    );

    const missingChildren = validateWorkspaceVfs({
      treeRootId: 'root',
      docsById: {},
      treeById: {
        root: {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: null,
        } as unknown as WorkspaceVfsNode,
      },
    });
    expect(missingChildren.issues.map((issue) => issue.code)).toContain(
      'WKS_DIR_CHILDREN_MISSING'
    );

    const malformedChildrenInput = {
      treeRootId: 'root',
      docsById: {},
      treeById: {
        root: {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: {},
        } as unknown as WorkspaceVfsNode,
      },
    };
    expect(() => validateWorkspaceVfs(malformedChildrenInput)).not.toThrow();
    expect(
      validateWorkspaceVfs(malformedChildrenInput).issues.map(
        (issue) => issue.code
      )
    ).toContain('WKS_DIR_CHILDREN_MISSING');
  });
});
