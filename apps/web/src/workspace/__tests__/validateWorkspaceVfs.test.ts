import { describe, expect, it } from 'vitest';
import { createDefaultPirDoc } from '@/pir/resolvePirDocument';
import { validateWorkspaceVfs, type StableWorkspaceDocument } from '..';

const createDocument = (id: string, path: string): StableWorkspaceDocument => ({
  id,
  type: 'pir-page',
  name: id,
  path,
  contentRev: 1,
  metaRev: 1,
  content: createDefaultPirDoc(),
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
});
