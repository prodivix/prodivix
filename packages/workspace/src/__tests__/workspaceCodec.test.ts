import { describe, expect, it } from 'vitest';
import { createDefaultPirDoc } from '@prodivix/pir';
import {
  WorkspaceCodecError,
  applyWorkspaceMutation,
  decodeWorkspaceMutation,
  decodeWorkspaceRouteManifest,
  decodeWorkspaceSnapshot,
  encodeWorkspaceSnapshot,
  normalizeWorkspaceTree,
  type WorkspaceSnapshotWireDto,
} from '..';

const createWireSnapshot = (): WorkspaceSnapshotWireDto => ({
  id: 'workspace-1',
  workspaceRev: 3,
  routeRev: 2,
  opSeq: 7,
  tree: {
    treeRootId: 'root',
    treeById: {
      root: {
        id: 'root',
        kind: 'dir',
        name: '/',
        parentId: null,
        children: ['root-document'],
      },
      'root-document': {
        id: 'root-document',
        kind: 'doc',
        name: 'pir.json',
        parentId: 'root',
        docId: 'page-root',
      },
    },
  },
  documents: [
    {
      id: 'page-root',
      type: 'pir-page',
      path: '/pir.json',
      contentRev: 4,
      metaRev: 1,
      content: createDefaultPirDoc(),
      updatedAt: '2026-07-12T00:00:00.000Z',
    },
  ],
  routeManifest: {
    version: '1',
    root: {
      id: 'root',
      children: [
        {
          id: 'route-home',
          index: true,
          pageDocId: 'page-root',
        },
      ],
    },
  },
  settings: { global: { eventTriggerMode: 'selected-only' } },
  activeRouteNodeId: 'route-home',
});

const createCanonicalRouteManifest = () => ({
  version: '1',
  root: {
    id: 'root',
    children: [
      {
        id: 'home',
        segment: '',
        outletBindings: {
          default: {
            outletNodeId: 'outlet-home',
            pageDocId: 'page-home',
          },
        },
        runtime: {
          loaderRef: {
            artifactId: 'artifact-loader',
            exportName: 'loader',
          },
        },
      },
    ],
  },
  modules: {
    account: {
      moduleId: 'account',
      version: '1',
      root: { id: 'account-root' },
    },
  },
  mounts: [
    {
      mountId: 'account-mount',
      moduleRef: 'account',
      mountPath: '',
      parentRouteNodeId: 'home',
    },
  ],
});

describe('workspace wire codec', () => {
  it('round-trips the complete canonical route manifest without dropping fields', () => {
    const manifest = createCanonicalRouteManifest();

    expect(decodeWorkspaceRouteManifest(manifest)).toEqual(manifest);
  });

  it('validates page and layout document roles in root and module routes', () => {
    const manifest = createCanonicalRouteManifest();
    Object.assign(manifest.root.children[0], {
      pageDocId: 'page-home',
      layoutDocId: 'layout-shell',
    });
    Object.assign(manifest.modules.account.root, {
      pageDocId: 'component-account',
    });
    const documentTypes = {
      'page-home': 'pir-page',
      'layout-shell': 'pir-layout',
      'component-account': 'pir-component',
    } as const;
    const resolveDocumentType = (documentId: string) =>
      documentTypes[documentId as keyof typeof documentTypes];

    expect(
      decodeWorkspaceRouteManifest(manifest, { resolveDocumentType })
    ).toEqual(manifest);

    const invalidCases: Array<{
      expectedPath: string;
      mutate: (
        candidate: ReturnType<typeof createCanonicalRouteManifest>
      ) => void;
    }> = [
      {
        expectedPath: '/routeManifest/root/children/0/layoutDocId',
        mutate: (candidate) => {
          Object.assign(candidate.root.children[0], {
            layoutDocId: 'page-home',
          });
        },
      },
      {
        expectedPath: '/routeManifest/root/children/0/pageDocId',
        mutate: (candidate) => {
          Object.assign(candidate.root.children[0], {
            pageDocId: 'layout-shell',
          });
        },
      },
      {
        expectedPath:
          '/routeManifest/root/children/0/outletBindings/default/pageDocId',
        mutate: (candidate) => {
          candidate.root.children[0].outletBindings.default.pageDocId =
            'layout-shell';
        },
      },
      {
        expectedPath: '/routeManifest/modules/account/root/pageDocId',
        mutate: (candidate) => {
          Object.assign(candidate.modules.account.root, {
            pageDocId: 'layout-shell',
          });
        },
      },
    ];
    invalidCases.forEach(({ expectedPath, mutate }) => {
      const candidate = structuredClone(manifest);
      mutate(candidate);
      expect(() =>
        decodeWorkspaceRouteManifest(candidate, { resolveDocumentType })
      ).toThrow(expectedPath);
    });
  });

  it('rejects unknown route manifest fields at every closed object boundary', () => {
    const mutations: Array<{
      name: string;
      mutate: (
        manifest: ReturnType<typeof createCanonicalRouteManifest>
      ) => void;
    }> = [
      {
        name: 'manifest',
        mutate: (manifest) => Object.assign(manifest, { future: true }),
      },
      {
        name: 'route node',
        mutate: (manifest) => Object.assign(manifest.root, { seo: {} }),
      },
      {
        name: 'outlet binding',
        mutate: (manifest) =>
          Object.assign(manifest.root.children[0].outletBindings.default, {
            future: true,
          }),
      },
      {
        name: 'runtime',
        mutate: (manifest) =>
          Object.assign(manifest.root.children[0].runtime, { future: true }),
      },
      {
        name: 'code reference',
        mutate: (manifest) =>
          Object.assign(manifest.root.children[0].runtime.loaderRef, {
            future: true,
          }),
      },
      {
        name: 'module',
        mutate: (manifest) =>
          Object.assign(manifest.modules.account, { future: true }),
      },
      {
        name: 'mount',
        mutate: (manifest) =>
          Object.assign(manifest.mounts[0], { future: true }),
      },
    ];

    mutations.forEach(({ name, mutate }) => {
      const manifest = createCanonicalRouteManifest();
      mutate(manifest);
      expect(() => decodeWorkspaceRouteManifest(manifest), name).toThrow(
        /Unknown route manifest field/
      );
    });
  });

  it('rejects route identity and module graph ambiguity', () => {
    const cases: Array<{
      name: string;
      mutate: (
        manifest: ReturnType<typeof createCanonicalRouteManifest>
      ) => void;
    }> = [
      {
        name: 'module key mismatch',
        mutate: (manifest) => {
          manifest.modules.account.moduleId = 'renamed';
        },
      },
      {
        name: 'noncanonical identifier',
        mutate: (manifest) => {
          manifest.root.children[0].id = ' home ';
        },
      },
      {
        name: 'wrong root identity',
        mutate: (manifest) => {
          manifest.root.id = 'route-root';
        },
      },
      {
        name: 'duplicate route identity',
        mutate: (manifest) => {
          manifest.modules.account.root.id = 'home';
        },
      },
      {
        name: 'missing module',
        mutate: (manifest) => {
          manifest.mounts[0].moduleRef = 'missing';
        },
      },
      {
        name: 'missing parent',
        mutate: (manifest) => {
          manifest.mounts[0].parentRouteNodeId = 'missing';
        },
      },
      {
        name: 'duplicate mount identity',
        mutate: (manifest) => {
          manifest.mounts.push({ ...manifest.mounts[0] });
        },
      },
    ];

    cases.forEach(({ name, mutate }) => {
      const manifest = createCanonicalRouteManifest();
      mutate(manifest);
      expect(() => decodeWorkspaceRouteManifest(manifest), name).toThrow(
        WorkspaceCodecError
      );
    });
  });

  it('rejects explicit null route fields instead of treating them as absent', () => {
    const manifest = createCanonicalRouteManifest();
    Object.assign(manifest.root.children[0], { children: null });

    expect(() => decodeWorkspaceRouteManifest(manifest)).toThrow(
      /Expected an array/
    );
  });

  it('strictly decodes the Go wire shape into the canonical snapshot', () => {
    const decoded = decodeWorkspaceSnapshot(createWireSnapshot());

    expect(decoded.workspace).toMatchObject({
      id: 'workspace-1',
      treeRootId: 'root',
      activeDocumentId: 'page-root',
      activeRouteNodeId: 'route-home',
    });
    expect(Object.keys(decoded.workspace.docsById)).toEqual(['page-root']);
    expect(decoded.settings).toEqual({
      global: { eventTriggerMode: 'selected-only' },
    });
  });

  it('rejects noncanonical VFS roots and document metadata at decode time', () => {
    const invalidRoot = createWireSnapshot();
    invalidRoot.tree.treeRootId = ' root ';
    invalidRoot.tree.treeById[' root '] = {
      ...invalidRoot.tree.treeById.root,
      id: ' root ',
    };
    delete invalidRoot.tree.treeById.root;
    expect(() => decodeWorkspaceSnapshot(invalidRoot)).toThrow(
      '/workspace/tree/treeRootId'
    );

    const invalidName = createWireSnapshot();
    Object.assign(invalidName.documents[0], { name: 42 });
    expect(() => decodeWorkspaceSnapshot(invalidName)).toThrow(
      '/workspace/documents/0/name'
    );

    const invalidUpdatedAt = createWireSnapshot();
    invalidUpdatedAt.documents[0].updatedAt = '2026-02-30T00:00:00Z';
    expect(() => decodeWorkspaceSnapshot(invalidUpdatedAt)).toThrow(
      '/workspace/documents/0/updatedAt'
    );
  });

  it('rejects every noncanonical VFS identity at the exported tree decoder boundary', () => {
    const cases: Array<{
      name: string;
      mutate: (tree: WorkspaceSnapshotWireDto['tree']) => void;
    }> = [
      {
        name: 'node map key',
        mutate: (tree) => {
          tree.treeById[' root-document '] = tree.treeById['root-document']!;
          delete tree.treeById['root-document'];
        },
      },
      {
        name: 'node id',
        mutate: (tree) => {
          tree.treeById['root-document']!.id = ' root-document ';
        },
      },
      {
        name: 'parent id',
        mutate: (tree) => {
          tree.treeById['root-document']!.parentId = ' root ';
        },
      },
      {
        name: 'missing non-root parent id',
        mutate: (tree) => {
          tree.treeById['root-document']!.parentId = null;
        },
      },
      {
        name: 'non-null root parent id',
        mutate: (tree) => {
          tree.treeById.root!.parentId = 'root';
        },
      },
      {
        name: 'child id',
        mutate: (tree) => {
          tree.treeById.root!.children = [' root-document '];
        },
      },
      {
        name: 'document reference id',
        mutate: (tree) => {
          tree.treeById['root-document']!.docId = ' page-root ';
        },
      },
    ];

    cases.forEach(({ name, mutate }) => {
      const tree = structuredClone(createWireSnapshot().tree);
      mutate(tree);
      expect(() => normalizeWorkspaceTree(tree), name).toThrow(
        WorkspaceCodecError
      );
    });
  });

  it('requires positive safe integers for every snapshot and mutation revision', () => {
    for (const field of ['workspaceRev', 'routeRev', 'opSeq'] as const) {
      const snapshot = createWireSnapshot();
      snapshot[field] = Number.MAX_SAFE_INTEGER + 1;
      expect(() => decodeWorkspaceSnapshot(snapshot), field).toThrow(
        /positive safe integer/
      );
    }

    for (const field of ['contentRev', 'metaRev'] as const) {
      const snapshot = createWireSnapshot();
      snapshot.documents[0][field] = Number.MAX_SAFE_INTEGER + 1;
      expect(() => decodeWorkspaceSnapshot(snapshot), field).toThrow(
        /positive safe integer/
      );
    }

    const { workspace } = decodeWorkspaceSnapshot(createWireSnapshot());
    for (const field of ['workspaceRev', 'routeRev', 'opSeq'] as const) {
      expect(() =>
        decodeWorkspaceMutation(
          {
            workspaceId: workspace.id,
            workspaceRev: 4,
            routeRev: 2,
            opSeq: 8,
            [field]: Number.MAX_SAFE_INTEGER + 1,
          },
          workspace
        )
      ).toThrow(/positive safe integer/);
    }

    workspace.workspaceRev = Number.MAX_SAFE_INTEGER + 1;
    expect(() => encodeWorkspaceSnapshot(workspace, {})).toThrow(
      /WKS_SNAPSHOT_REVISION_INVALID/
    );
  });

  it('rejects unknown snapshot fields at every closed workspace boundary', () => {
    const cases: Array<{
      name: string;
      expectedPath: string;
      mutate: (snapshot: WorkspaceSnapshotWireDto) => void;
    }> = [
      {
        name: 'snapshot root',
        expectedPath: '/workspace/future',
        mutate: (snapshot) => Object.assign(snapshot, { future: true }),
      },
      {
        name: 'tree root',
        expectedPath: '/workspace/tree/future',
        mutate: (snapshot) => Object.assign(snapshot.tree, { future: true }),
      },
      {
        name: 'directory node',
        expectedPath: '/workspace/tree/treeById/root/docId',
        mutate: (snapshot) =>
          Object.assign(snapshot.tree.treeById.root, { docId: 'page-root' }),
      },
      {
        name: 'document node',
        expectedPath: '/workspace/tree/treeById/root-document/children',
        mutate: (snapshot) =>
          Object.assign(snapshot.tree.treeById['root-document'], {
            children: [],
          }),
      },
      {
        name: 'workspace document',
        expectedPath: '/workspace/documents/0/future',
        mutate: (snapshot) =>
          Object.assign(snapshot.documents[0], { future: true }),
      },
    ];

    cases.forEach(({ name, expectedPath, mutate }) => {
      const snapshot = createWireSnapshot();
      mutate(snapshot);

      expect(() => decodeWorkspaceSnapshot(snapshot), name).toThrow(
        expectedPath
      );
    });
  });

  it('rejects unknown mutation fields without silently narrowing payloads', () => {
    const { workspace } = decodeWorkspaceSnapshot(createWireSnapshot());
    const createMutation = () => {
      const snapshot = createWireSnapshot();
      return {
        workspaceId: workspace.id,
        workspaceRev: 4,
        routeRev: 2,
        opSeq: 8,
        tree: snapshot.tree,
        updatedDocuments: snapshot.documents,
      };
    };
    const cases: Array<{
      name: string;
      expectedPath: string;
      mutate: (mutation: ReturnType<typeof createMutation>) => void;
    }> = [
      {
        name: 'mutation root',
        expectedPath: '/mutation/future',
        mutate: (mutation) => Object.assign(mutation, { future: true }),
      },
      {
        name: 'mutation tree root',
        expectedPath: '/mutation/tree/future',
        mutate: (mutation) => Object.assign(mutation.tree, { future: true }),
      },
      {
        name: 'mutation tree node',
        expectedPath: '/mutation/tree/treeById/root/future',
        mutate: (mutation) =>
          Object.assign(mutation.tree.treeById.root, { future: true }),
      },
      {
        name: 'updated workspace document',
        expectedPath: '/mutation/updatedDocuments/0/future',
        mutate: (mutation) =>
          Object.assign(mutation.updatedDocuments[0], { future: true }),
      },
    ];

    cases.forEach(({ name, expectedPath, mutate }) => {
      const mutation = createMutation();
      mutate(mutation);

      expect(() => decodeWorkspaceMutation(mutation, workspace), name).toThrow(
        expectedPath
      );
    });
  });

  it('encodes documents in stable path and id order', () => {
    const decoded = decodeWorkspaceSnapshot(createWireSnapshot());
    const workspace = decoded.workspace;
    workspace.treeById.root.children = ['source', 'root-document'];
    workspace.treeById.source = {
      id: 'source',
      kind: 'dir',
      name: 'src',
      parentId: 'root',
      children: ['source-document'],
    };
    workspace.treeById['source-document'] = {
      id: 'source-document',
      kind: 'doc',
      name: 'index.ts',
      parentId: 'source',
      docId: 'code-index',
    };
    workspace.docsById['code-index'] = {
      id: 'code-index',
      type: 'code',
      path: '/src/index.ts',
      contentRev: 1,
      metaRev: 1,
      content: { language: 'ts', source: 'export const value = 1;' },
    };

    const encoded = encodeWorkspaceSnapshot(workspace, decoded.settings);

    expect(encoded.documents.map((document) => document.id)).toEqual([
      'page-root',
      'code-index',
    ]);
    expect(encoded.tree).toEqual({
      treeRootId: workspace.treeRootId,
      treeById: workspace.treeById,
    });
  });

  it('rejects duplicate document ids instead of silently overwriting', () => {
    const wire = createWireSnapshot();
    wire.documents.push({ ...wire.documents[0] });

    expect(() => decodeWorkspaceSnapshot(wire)).toThrowError(
      WorkspaceCodecError
    );
  });

  it('rejects a damaged VFS instead of synthesizing a fallback tree', () => {
    const wire = createWireSnapshot();
    wire.tree.treeRootId = 'missing-root';

    expect(() => decodeWorkspaceSnapshot(wire)).toThrow(/WKS_ROOT_MISSING/);
  });

  it('rejects invalid code wrappers and missing route documents', () => {
    const invalidCode = createWireSnapshot();
    invalidCode.documents[0] = {
      ...invalidCode.documents[0],
      type: 'code',
      content: 'export default 1',
    };
    expect(() => decodeWorkspaceSnapshot(invalidCode)).toThrow(
      /code content wrapper/
    );

    const invalidRoute = createWireSnapshot();
    const root = invalidRoute.routeManifest as {
      root: { children: Array<{ pageDocId: string }> };
    };
    root.root.children[0].pageDocId = 'missing-page';
    expect(() => decodeWorkspaceSnapshot(invalidRoute)).toThrow(/RTE-2001/);

    const invalidRouteRole = createWireSnapshot();
    invalidRouteRole.documents[0] = {
      ...invalidRouteRole.documents[0],
      type: 'code',
      content: { language: 'ts', source: '' },
    };
    expect(() => decodeWorkspaceSnapshot(invalidRouteRole)).toThrow(
      /must reference pir-page or pir-component/
    );
  });

  it('applies server mutations as the sole owner of confirmed revisions', () => {
    const { workspace } = decodeWorkspaceSnapshot(createWireSnapshot());
    const nextPir = createDefaultPirDoc();
    nextPir.metadata = { name: 'Confirmed' };
    const mutation = decodeWorkspaceMutation(
      {
        workspaceId: workspace.id,
        workspaceRev: 4,
        routeRev: 2,
        opSeq: 8,
        updatedDocuments: [
          {
            ...workspace.docsById['page-root'],
            contentRev: 5,
            content: nextPir,
          },
        ],
      },
      workspace
    );

    const nextWorkspace = applyWorkspaceMutation(workspace, mutation);

    expect(nextWorkspace.workspaceRev).toBe(4);
    expect(nextWorkspace.opSeq).toBe(8);
    expect(nextWorkspace.docsById['page-root'].contentRev).toBe(5);
    expect(nextWorkspace.docsById['page-root'].content).toHaveProperty(
      'metadata.name',
      'Confirmed'
    );
  });

  it('rejects mutations for another workspace', () => {
    const { workspace } = decodeWorkspaceSnapshot(createWireSnapshot());

    expect(() =>
      decodeWorkspaceMutation(
        {
          workspaceId: 'workspace-2',
          workspaceRev: 4,
          routeRev: 2,
          opSeq: 8,
        },
        workspace
      )
    ).toThrow(/does not match/);
  });
});
