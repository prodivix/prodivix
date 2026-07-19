import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Download, FileWarning } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { classifyBinaryAssetDelivery } from '@prodivix/assets';
import { createAssetSymbolId } from '@prodivix/authoring';
import { ResourceFileTree } from './ResourceFileTree';
import {
  collectBestPracticeHints,
  findNodeById,
  flattenPublicFiles,
  inferCategoryByFile,
  PUBLIC_TREE_ROOT_ID,
  resolveCategoryLabel,
  type PublicFileCategory,
} from './publicTree';
import {
  createPublicTemplateByKind,
  formatPublicResourceBytes,
  getDefaultPublicFileTemplate,
  getResourceManagerPublicSelectionStorageKey,
  isSvgFileNode,
  isTextLikeNode,
  type PublicFileKind,
} from './publicResourceModel';
import { useAuthStore } from '@/auth/useAuthStore';
import { editorApi } from '@/editor/editorApi';
import type { WorkspaceAssetDeliverySession } from '@/editor/editorApi';
import { isLocalProjectId } from '@/editor/localProjectStore';
import {
  getLocalWorkspaceAssetBlob,
  putLocalWorkspaceAssetBlob,
} from '@/editor/localWorkspaceAssetBlobStore';
import { useEditorStore } from '@/editor/store/useEditorStore';
import {
  navigateToWorkspaceSemanticTarget,
  resolveWorkspaceSemanticIndex,
} from '@/editor/navigation';
import { dispatchWorkspaceVfsAuthoringIntent } from '@/editor/workspaceSync/workspaceAuthoringOperationDispatcher';
import {
  buildPublicResourceTreeFromWorkspace,
  createPublicResourceAssetDeliveryRequest,
} from './workspacePublicResources';
import {
  createWorkspaceDirectoryIntentRequest,
  deleteWorkspaceDirectoryIntentRequest,
  renameWorkspaceDirectoryIntentRequest,
  type WorkspaceSnapshot,
  type WorkspaceVfsIntentRequest,
} from '@prodivix/workspace';
import {
  createResourceIntentId,
  createWorkspaceResourceDocumentId,
  createWorkspaceResourceDocumentRequest,
  deleteWorkspaceResourceDocumentRequest,
  findWorkspaceDocumentByPath,
  findWorkspaceNodeByPath,
  isWorkspaceDocumentReferencedByRoute,
  normalizeWorkspaceResourcePath,
  renameWorkspaceResourceDocumentRequest,
  RESOURCE_ROOTS,
} from './workspaceResourceDocuments';

type PublicResourcePageProps = {
  embedded?: boolean;
};

const EMPTY_WORKSPACE_DOCUMENTS: WorkspaceSnapshot['docsById'] = {};
const EMPTY_WORKSPACE_TREE: WorkspaceSnapshot['treeById'] = {};

export function PublicResourcePage({
  embedded = false,
}: PublicResourcePageProps) {
  const { t } = useTranslation('editor');
  const { projectId } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const workspace = useEditorStore((state) => state.workspace);
  const workspaceReadonly = useEditorStore((state) => state.workspaceReadonly);
  const setActiveDocumentId = useEditorStore(
    (state) => state.setActiveDocumentId
  );
  const workspaceId = workspace?.id;
  const localWorkspace = isLocalProjectId(workspaceId);
  const workspaceRev = workspace?.workspaceRev;
  const activeDocumentId = workspace?.activeDocumentId;
  const workspaceDocumentsById =
    workspace?.docsById ?? EMPTY_WORKSPACE_DOCUMENTS;
  const routeManifest = workspace?.routeManifest;
  const treeRootId = workspace?.treeRootId;
  const treeById = workspace?.treeById ?? EMPTY_WORKSPACE_TREE;
  const tree = useMemo(
    () =>
      buildPublicResourceTreeFromWorkspace(
        workspaceDocumentsById,
        treeRootId,
        treeById
      ),
    [treeById, treeRootId, workspaceDocumentsById]
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string>(() => {
    const storedSelection =
      typeof window === 'undefined'
        ? null
        : window.localStorage.getItem(
            getResourceManagerPublicSelectionStorageKey(projectId)
          );
    return storedSelection ?? PUBLIC_TREE_ROOT_ID;
  });
  const [svgPreviewMode, setSvgPreviewMode] = useState<'preview' | 'source'>(
    'preview'
  );
  const [requestRenameNodeId, setRequestRenameNodeId] = useState<string>();
  const [selectedContentUrl, setSelectedContentUrl] = useState<string>();
  const [selectedTextContent, setSelectedTextContent] = useState<string>();
  const [assetMaterializationError, setAssetMaterializationError] =
    useState<string>();
  const [assetOperationError, setAssetOperationError] = useState<string>();
  const [assetDelivery, setAssetDelivery] =
    useState<WorkspaceAssetDeliverySession>();
  const [assetDeliveryError, setAssetDeliveryError] = useState<string>();
  const [assetDeliveryPending, setAssetDeliveryPending] = useState(false);

  const selectedNode = useMemo(
    () => findNodeById(tree, selectedNodeId) ?? tree,
    [selectedNodeId, tree]
  );
  const selectedHints = useMemo(
    () => collectBestPracticeHints(selectedNode, selectedTextContent),
    [selectedNode, selectedTextContent]
  );
  const selectedDeliveryClass = useMemo(
    () =>
      selectedNode.type === 'file' && selectedNode.mime
        ? classifyBinaryAssetDelivery(selectedNode.mime)
        : undefined,
    [selectedNode.mime, selectedNode.type]
  );
  const semanticIndex = useMemo(
    () => (workspace ? resolveWorkspaceSemanticIndex(workspace) : null),
    [workspace]
  );
  const selectedAssetRelations = useMemo(() => {
    if (!workspace || !semanticIndex || selectedNode.type !== 'file') {
      return null;
    }
    const symbolId = createAssetSymbolId(workspace.id, selectedNode.id);
    const references = semanticIndex.getReferences(symbolId, {
      expectedSnapshotIdentity: semanticIndex.snapshotIdentity,
    });
    const impact = semanticIndex.getImpact([symbolId], {
      expectedSnapshotIdentity: semanticIndex.snapshotIdentity,
    });
    return {
      references: references.status === 'resolved' ? references.references : [],
      impactedSymbolCount:
        impact.status === 'resolved'
          ? impact.impact.impactedSymbolIds.length
          : 0,
    };
  }, [selectedNode, semanticIndex, workspace]);
  const hintSummary = useMemo(() => {
    return flattenPublicFiles(tree).reduce(
      (acc, file) => {
        const hints = collectBestPracticeHints(file);
        acc.warnings += hints.filter((hint) => hint.level === 'warning').length;
        acc.info += hints.filter((hint) => hint.level === 'info').length;
        return acc;
      },
      { warnings: 0, info: 0 }
    );
  }, [tree]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!findNodeById(tree, selectedNodeId)) {
      const fallbackId = flattenPublicFiles(tree)[0]?.id ?? tree.id;
      setSelectedNodeId(fallbackId);
      return;
    }
    window.localStorage.setItem(
      getResourceManagerPublicSelectionStorageKey(projectId),
      selectedNodeId
    );
  }, [projectId, selectedNodeId, tree]);

  useEffect(() => {
    if (
      !activeDocumentId ||
      workspaceDocumentsById[activeDocumentId]?.type !== 'asset' ||
      !findNodeById(tree, activeDocumentId) ||
      selectedNodeId === activeDocumentId
    ) {
      return;
    }
    setSelectedNodeId(activeDocumentId);
  }, [activeDocumentId, selectedNodeId, tree, workspaceDocumentsById]);

  useEffect(() => {
    setSelectedContentUrl(undefined);
    setSelectedTextContent(undefined);
    setAssetMaterializationError(undefined);
    setAssetDelivery(undefined);
    setAssetDeliveryError(undefined);
    setAssetDeliveryPending(false);
    if (
      selectedNode.type !== 'file' ||
      !selectedNode.blobReference ||
      !workspaceId
    ) {
      return;
    }
    if (!localWorkspace && !token) {
      setAssetMaterializationError(
        'AST-3001: Sign in to materialize this Workspace asset.'
      );
      return;
    }
    const controller = new AbortController();
    let active = true;
    let objectUrl: string | undefined;
    const materialization = localWorkspace
      ? getLocalWorkspaceAssetBlob({
          workspaceId,
          assetDocumentId: selectedNode.id,
          reference: selectedNode.blobReference,
          signal: controller.signal,
        })
      : editorApi.getWorkspaceAssetBlob(
          token!,
          workspaceId,
          selectedNode.id,
          selectedNode.blobReference,
          { signal: controller.signal }
        );
    void materialization
      .then((materialization) => {
        if (!active) return;
        if (!materialization) {
          throw new Error(
            `AST-1001: Local asset ${selectedNode.id} is unavailable.`
          );
        }
        const bytes = new Uint8Array(materialization.contents.byteLength);
        bytes.set(materialization.contents);
        objectUrl = URL.createObjectURL(
          new Blob([bytes.buffer], {
            type: materialization.reference.mediaType,
          })
        );
        setSelectedContentUrl(objectUrl);
        if (isTextLikeNode(selectedNode)) {
          setSelectedTextContent(new TextDecoder().decode(bytes));
        }
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        setAssetMaterializationError(
          error instanceof Error ? error.message : String(error)
        );
      });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    selectedNode.blobReference,
    selectedNode.id,
    selectedNode.type,
    localWorkspace,
    token,
    workspaceId,
  ]);

  const handleSelectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    const node = findNodeById(tree, nodeId);
    if (node?.type === 'file') setActiveDocumentId(node.id);
  };

  const handleCreateIsolatedDelivery = async () => {
    if (
      !workspaceId ||
      selectedNode.type !== 'file' ||
      !selectedNode.blobReference
    ) {
      setAssetDeliveryError(
        'AST-3001: Sign in to create an isolated asset delivery session.'
      );
      return;
    }
    if (localWorkspace) {
      setAssetDeliveryError(
        'AST-3101: Isolated delivery requires a synced, authorized Workspace.'
      );
      return;
    }
    if (!token) {
      setAssetDeliveryError(
        'AST-3001: Sign in to create an isolated asset delivery session.'
      );
      return;
    }
    setAssetDelivery(undefined);
    setAssetDeliveryError(undefined);
    setAssetDeliveryPending(true);
    try {
      const delivery = await editorApi.createWorkspaceAssetDeliverySession(
        token,
        workspaceId,
        selectedNode.blobReference,
        createPublicResourceAssetDeliveryRequest(selectedNode.mime)
      );
      setAssetDelivery(delivery);
    } catch (error) {
      setAssetDeliveryError(
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setAssetDeliveryPending(false);
    }
  };

  const openAssetReference = (referenceId: string) => {
    if (!projectId || !workspace) return;
    navigateToWorkspaceSemanticTarget({
      projectId,
      navigate,
      resolveSemanticIndex: resolveWorkspaceSemanticIndex,
      target: {
        kind: 'semantic-reference',
        referenceId,
        destination: 'source',
      },
    });
  };

  const resolveWorkspaceParentNodeId = (parentId: string) => {
    if (parentId === PUBLIC_TREE_ROOT_ID) {
      return (
        findWorkspaceNodeByPath(treeRootId, treeById, RESOURCE_ROOTS.public)
          ?.id ?? treeRootId
      );
    }
    return treeById[parentId]?.kind === 'dir' ? parentId : undefined;
  };

  const applyIntent = async (request: WorkspaceVfsIntentRequest) => {
    const currentWorkspace = useEditorStore.getState().workspace;
    if (!currentWorkspace || workspaceReadonly) return false;
    const outcome = await dispatchWorkspaceVfsAuthoringIntent({
      workspace: currentWorkspace,
      readonly: workspaceReadonly,
      request,
    });
    if (outcome.status === 'rejected') throw new Error(outcome.message);
    return outcome.status === 'applied';
  };

  const handleCreateFolder = async (parentId: string) => {
    if (!workspace || workspaceReadonly || !workspaceId || !workspaceRev) {
      return;
    }
    let parentNodeId = resolveWorkspaceParentNodeId(parentId);
    if (!parentNodeId) return;
    if (
      parentId === PUBLIC_TREE_ROOT_ID &&
      !findWorkspaceNodeByPath(treeRootId, treeById, RESOURCE_ROOTS.public)
    ) {
      const created = await applyIntent(
        createWorkspaceDirectoryIntentRequest({
          workspaceRev,
          intentId: createResourceIntentId(),
          issuedAt: new Date().toISOString(),
          nodeId: 'dir_public',
          parentNodeId,
          name: RESOURCE_ROOTS.public.replace(/^\//, ''),
        })
      );
      if (!created) return;
      parentNodeId = 'dir_public';
    }
    const name = 'new-folder';
    const currentWorkspace = useEditorStore.getState().workspace;
    if (!currentWorkspace) return;
    const nodeId = `dir_public_${Date.now().toString(36)}`;
    const request = createWorkspaceDirectoryIntentRequest({
      workspaceRev: currentWorkspace.workspaceRev,
      intentId: createResourceIntentId(),
      issuedAt: new Date().toISOString(),
      nodeId,
      parentNodeId,
      name,
    });
    if (await applyIntent(request)) {
      setSelectedNodeId(nodeId);
      setRequestRenameNodeId(nodeId);
    }
  };

  const createAssetDocument = async (
    parentId: string,
    name: string,
    input: Readonly<{
      contents: Uint8Array;
      mediaType: string;
      category: PublicFileCategory;
    }>
  ) => {
    if (!workspaceId) {
      throw new Error('AST-3001: No Workspace is available for asset upload.');
    }
    if (!localWorkspace && !token) {
      throw new Error('AST-3001: Sign in before uploading a Workspace asset.');
    }
    const parentNode = findNodeById(tree, parentId);
    const parentPath = parentNode?.path
      ? `/${parentNode.path}`
      : RESOURCE_ROOTS.public;
    const path = normalizeWorkspaceResourcePath(`${parentPath}/${name}`);
    const documentId = createWorkspaceResourceDocumentId('asset', path);
    const existing = findWorkspaceDocumentByPath(
      workspaceDocumentsById,
      path,
      'asset'
    );
    if (existing) return false;
    const uploaded = localWorkspace
      ? await putLocalWorkspaceAssetBlob({
          workspaceId,
          contents: input.contents,
          mediaType: input.mediaType,
        })
      : await editorApi.putWorkspaceAssetBlob(
          token!,
          workspaceId,
          input.contents,
          input.mediaType
        );
    const currentWorkspace = useEditorStore.getState().workspace;
    if (!currentWorkspace || currentWorkspace.id !== workspaceId) {
      throw new Error(
        'AST-3001: Workspace changed before the asset reference could be committed.'
      );
    }
    const created = await applyIntent(
      createWorkspaceResourceDocumentRequest({
        workspaceRev: currentWorkspace.workspaceRev,
        documentId,
        path,
        type: 'asset',
        content: {
          kind: 'asset',
          category: input.category,
          mime: uploaded.reference.mediaType,
          size: uploaded.reference.byteLength,
          blob: uploaded.reference,
          metadata: { originalFileName: name },
        },
      })
    );
    if (created) {
      setSelectedNodeId(documentId);
      setActiveDocumentId(documentId);
    }
    return created;
  };

  const handleCreateFile = async (parentId: string) => {
    const template = getDefaultPublicFileTemplate('untitled.txt');
    const file = new File([template.content], 'untitled.txt', {
      type: template.mime,
    });
    setAssetOperationError(undefined);
    try {
      await createAssetDocument(parentId, file.name, {
        contents: new TextEncoder().encode(template.content),
        mediaType: template.mime,
        category: inferCategoryByFile(file),
      });
    } catch (error) {
      setAssetOperationError(
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  const handleCreateFileByKind = async (
    parentId: string,
    kind: PublicFileKind
  ) => {
    const template = createPublicTemplateByKind(kind);
    const file = new File([template.content], template.name, {
      type: template.mime,
    });
    setAssetOperationError(undefined);
    try {
      await createAssetDocument(parentId, file.name, {
        contents: new TextEncoder().encode(template.content),
        mediaType: template.mime,
        category: inferCategoryByFile(file),
      });
    } catch (error) {
      setAssetOperationError(
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  const handleDeleteNode = async (nodeId: string) => {
    const node = findNodeById(tree, nodeId);
    if (!node) return;
    if (node.type === 'folder') {
      await applyIntent(
        deleteWorkspaceDirectoryIntentRequest({
          workspaceRev: workspaceRev ?? 0,
          intentId: createResourceIntentId(),
          issuedAt: new Date().toISOString(),
          nodeId,
        })
      );
    } else {
      if (
        routeManifest &&
        isWorkspaceDocumentReferencedByRoute(routeManifest, nodeId)
      ) {
        window.alert(
          t('publicResource.routeReferencedDeleteBlocked', {
            defaultValue:
              'This document is referenced by the route graph and cannot be deleted.',
          })
        );
        return;
      }
      const references = semanticIndex
        ? semanticIndex.getReferences(
            createAssetSymbolId(
              semanticIndex.snapshotIdentity.workspaceRevisions.workspaceId,
              nodeId
            ),
            { expectedSnapshotIdentity: semanticIndex.snapshotIdentity }
          )
        : null;
      if (
        references?.status === 'resolved' &&
        references.references.length > 0
      ) {
        window.alert(
          t('resourceManager.public.semanticReferencedDeleteBlocked', {
            count: references.references.length,
          })
        );
        return;
      }
      await applyIntent(
        deleteWorkspaceResourceDocumentRequest({
          workspaceRev: workspaceRev ?? 0,
          documentId: nodeId,
          type: 'asset',
        })
      );
    }
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(tree.id);
      if (activeDocumentId === nodeId) setActiveDocumentId(undefined);
    }
  };

  const handleRenameNode = async (nodeId: string, nextName: string) => {
    const node = findNodeById(tree, nodeId);
    const name = nextName.trim();
    if (!node || !name || nodeId === tree.id) return;
    if (node.type === 'folder') {
      await applyIntent(
        renameWorkspaceDirectoryIntentRequest({
          workspaceRev: workspaceRev ?? 0,
          intentId: createResourceIntentId(),
          issuedAt: new Date().toISOString(),
          nodeId,
          name,
        })
      );
    } else {
      const parentPath = node.path.split('/').slice(0, -1).join('/');
      await applyIntent(
        renameWorkspaceResourceDocumentRequest({
          workspaceRev: workspaceRev ?? 0,
          documentId: nodeId,
          path: normalizeWorkspaceResourcePath(`${parentPath}/${name}`),
          type: 'asset',
        })
      );
    }
    setRequestRenameNodeId(undefined);
  };

  const handleImportFiles = async (
    parentId: string,
    files: FileList | null
  ) => {
    if (!files || files.length === 0) return;
    setAssetOperationError(undefined);
    try {
      for (const file of Array.from(files)) {
        await createAssetDocument(parentId, file.name, {
          contents: new Uint8Array(await file.arrayBuffer()),
          mediaType: file.type || 'application/octet-stream',
          category: inferCategoryByFile(file),
        });
      }
    } catch (error) {
      setAssetOperationError(
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  const handleImportFilesByCategory = async (
    parentId: string,
    forcedCategory: 'image' | 'font' | 'document' | 'other',
    files: FileList | null
  ) => {
    if (!files || files.length === 0) return;
    setAssetOperationError(undefined);
    try {
      for (const file of Array.from(files)) {
        await createAssetDocument(parentId, file.name, {
          contents: new Uint8Array(await file.arrayBuffer()),
          mediaType: file.type || 'application/octet-stream',
          category: forcedCategory,
        });
      }
    } catch (error) {
      setAssetOperationError(
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  const fontFamilyName =
    selectedNode.type === 'file' ? `prodivix-font-${selectedNode.id}` : '';

  return (
    <section
      className={
        embedded
          ? 'flex w-full flex-col gap-4'
          : 'mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-6'
      }
    >
      {!embedded ? (
        <header className="rounded-2xl border border-black/8 bg-white/92 p-5 shadow-[0_10px_28px_rgba(0,0,0,0.06)]">
          <h1 className="text-2xl font-semibold text-(--text-primary)">
            {t('resourceManager.public.header.title')}
          </h1>
          <p className="mt-2 text-sm text-(--text-secondary)">
            {t('resourceManager.public.header.description')}
          </p>
        </header>
      ) : null}
      <div className="grid min-h-[72vh] grid-cols-1 gap-4 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.4fr)]">
        <aside className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-3">
          <ResourceFileTree
            tree={tree}
            mode="editable"
            selectedId={selectedNodeId}
            requestRenameNodeId={requestRenameNodeId}
            onSelect={handleSelectNode}
            onCreateFolder={handleCreateFolder}
            onCreateFile={handleCreateFile}
            onCreateFileByKind={handleCreateFileByKind}
            onImport={handleImportFiles}
            onImportByCategory={handleImportFilesByCategory}
            onRename={handleRenameNode}
            onDelete={handleDeleteNode}
          />
        </aside>
        <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-4">
          {assetOperationError ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {assetOperationError}
            </div>
          ) : null}
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-(--text-primary)">
                {selectedNode.name}
              </h2>
              <p className="text-xs text-(--text-muted)">{selectedNode.path}</p>
            </div>
            {selectedNode.type === 'file' ? (
              <div className="flex flex-wrap items-center gap-2">
                {selectedNode.blobReference ? (
                  <button
                    type="button"
                    disabled={assetDeliveryPending || localWorkspace}
                    title={
                      localWorkspace
                        ? 'Sync this Workspace before requesting isolated delivery.'
                        : undefined
                    }
                    onClick={() => void handleCreateIsolatedDelivery()}
                    className="inline-flex items-center gap-1 rounded-lg border border-black/12 px-2.5 py-1.5 text-xs text-(--text-secondary) disabled:cursor-wait disabled:opacity-60"
                  >
                    {localWorkspace
                      ? 'Sync for isolated delivery'
                      : assetDeliveryPending
                        ? 'Preparing…'
                        : selectedNode.mime === 'image/png' ||
                            selectedNode.mime === 'image/jpeg'
                          ? 'Re-encode & isolate'
                          : 'Isolated download'}
                  </button>
                ) : null}
                {assetDelivery?.disposition === 'attachment' ? (
                  <a
                    href={assetDelivery.deliveryUrl}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800"
                  >
                    <Download size={12} />
                    Download isolated copy
                  </a>
                ) : selectedContentUrl ? (
                  <a
                    href={selectedContentUrl}
                    download={selectedNode.name}
                    className="inline-flex items-center gap-1 rounded-lg border border-black/12 px-2.5 py-1.5 text-xs text-(--text-secondary)"
                  >
                    <Download size={12} />
                    {t('resourceManager.public.actions.download')}
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
          {selectedNode.type === 'file' ? (
            <div className="grid gap-4">
              {assetMaterializationError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {assetMaterializationError}
                </div>
              ) : null}
              {assetDeliveryError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {assetDeliveryError}
                </div>
              ) : null}
              {assetDelivery ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  Isolated delivery ready · {assetDelivery.cacheStatus} ·
                  expires{' '}
                  {new Date(assetDelivery.expiresAt).toLocaleTimeString()}
                </div>
              ) : null}
              <div className="rounded-xl border border-black/8 bg-black/[0.015] p-3 text-xs">
                <p>
                  {t('resourceManager.public.labels.kind')}:{' '}
                  <strong>
                    {resolveCategoryLabel(selectedNode.category ?? 'other')}
                  </strong>
                </p>
                <p>
                  {t('resourceManager.public.labels.mime')}:{' '}
                  {selectedNode.mime ||
                    t('resourceManager.public.labels.unknown')}
                </p>
                <p>
                  {t('resourceManager.public.labels.size')}:{' '}
                  {formatPublicResourceBytes(selectedNode.size)}
                </p>
                <p>
                  {t('resourceManager.public.labels.references')}:{' '}
                  {selectedAssetRelations?.references.length ?? 0}
                </p>
                <p>
                  {t('resourceManager.public.labels.impactedSymbols')}:{' '}
                  {selectedAssetRelations?.impactedSymbolCount ?? 0}
                </p>
              </div>
              {selectedAssetRelations?.references.length ? (
                <section className="rounded-xl border border-black/8 p-3">
                  <p className="text-xs font-semibold text-(--text-primary)">
                    {t('resourceManager.public.references.title')}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedAssetRelations.references.map(
                      (reference, index) => (
                        <button
                          key={reference.id}
                          type="button"
                          onClick={() => openAssetReference(reference.id)}
                          className="rounded-lg border border-black/10 px-2.5 py-1.5 text-[10px] text-(--text-secondary)"
                        >
                          {t('resourceManager.public.references.open', {
                            index: index + 1,
                          })}
                        </button>
                      )
                    )}
                  </div>
                </section>
              ) : null}
              {isSvgFileNode(selectedNode) ? (
                <div className="rounded-xl border border-black/8 p-3">
                  <div className="mb-2 inline-flex rounded-lg border border-black/10 p-1 text-xs">
                    <button
                      type="button"
                      className={`rounded px-2 py-1 ${
                        svgPreviewMode === 'preview'
                          ? 'bg-black text-white'
                          : 'text-(--text-secondary)'
                      }`}
                      onClick={() => setSvgPreviewMode('preview')}
                    >
                      {t('resourceManager.public.preview.preview')}
                    </button>
                    <button
                      type="button"
                      className={`rounded px-2 py-1 ${
                        svgPreviewMode === 'source'
                          ? 'bg-black text-white'
                          : 'text-(--text-secondary)'
                      }`}
                      onClick={() => setSvgPreviewMode('source')}
                    >
                      {t('resourceManager.public.preview.source')}
                    </button>
                  </div>
                  {svgPreviewMode === 'preview' ? (
                    selectedDeliveryClass === 'active-content' ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        Active content is never rendered inline. A configured
                        clean scanner may expose it only as an attachment from
                        the isolated capability origin.
                      </div>
                    ) : selectedContentUrl ? (
                      <img
                        src={selectedContentUrl}
                        alt={selectedNode.name}
                        className="max-h-[340px] w-full rounded-lg object-contain"
                      />
                    ) : null
                  ) : (
                    <pre className="max-h-[340px] overflow-auto rounded-lg bg-black px-3 py-2 text-[11px] text-white">
                      {selectedTextContent || ''}
                    </pre>
                  )}
                </div>
              ) : null}
              {selectedNode.category === 'image' &&
              !isSvgFileNode(selectedNode) &&
              selectedContentUrl ? (
                <div className="rounded-xl border border-black/8 p-3">
                  <img
                    src={
                      assetDelivery?.disposition === 'inline'
                        ? assetDelivery.deliveryUrl
                        : selectedContentUrl
                    }
                    alt={selectedNode.name}
                    className="max-h-[380px] w-full rounded-lg object-contain"
                  />
                </div>
              ) : null}
              {selectedNode.category === 'font' && selectedContentUrl ? (
                <div className="rounded-xl border border-black/8 p-3">
                  <style>{`@font-face{font-family:${fontFamilyName};src:url(${selectedContentUrl});}`}</style>
                  <p className="text-xs text-(--text-muted)">
                    {t('resourceManager.public.preview.fontSample')}
                  </p>
                  <p
                    className="mt-2"
                    style={{ fontFamily: fontFamilyName, fontSize: '24px' }}
                  >
                    ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz
                    0123456789 !@#$%^&amp;*()_+-=[]{};:'&quot;,.&lt;&gt;/?\|`~
                  </p>
                  <p
                    className="mt-2"
                    style={{ fontFamily: fontFamilyName, fontSize: '16px' }}
                  >
                    ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz
                    0123456789 !@#$%^&amp;*()_+-=[]{};:'&quot;,.&lt;&gt;/?\|`~
                  </p>
                  <p
                    className="mt-2"
                    style={{ fontFamily: fontFamilyName, fontSize: '12px' }}
                  >
                    ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz
                    0123456789 !@#$%^&amp;*()_+-=[]{};:'&quot;,.&lt;&gt;/?\|`~
                  </p>
                </div>
              ) : null}
              {isTextLikeNode(selectedNode) && !isSvgFileNode(selectedNode) ? (
                <pre className="max-h-[360px] overflow-auto rounded-xl bg-black px-3 py-3 text-[11px] text-white">
                  {selectedTextContent || ''}
                </pre>
              ) : null}
              {!isSvgFileNode(selectedNode) &&
              !isTextLikeNode(selectedNode) &&
              selectedNode.category !== 'image' &&
              selectedNode.category !== 'font' ? (
                <div className="rounded-xl border border-black/8 bg-black/[0.02] p-4 text-sm text-(--text-secondary)">
                  {t('resourceManager.public.preview.noInline')}
                </div>
              ) : null}
              {selectedHints.length > 0 ? (
                <section className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
                  <p className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
                    <FileWarning size={12} />
                    {t('resourceManager.public.hints.title')}
                  </p>
                  <ul className="mt-2 grid gap-1 text-xs text-amber-900">
                    {selectedHints.map((hint) => (
                      <li key={`${hint.code}-${hint.message}`}>
                        [{hint.level}] {hint.message}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-black/8 bg-black/[0.02] p-4 text-sm text-(--text-secondary)">
              {t('resourceManager.public.preview.selectFile')}
            </div>
          )}
        </article>
      </div>
      <footer className="rounded-xl border border-black/8 bg-(--bg-canvas) px-4 py-3 text-xs text-(--text-secondary)">
        <strong>{t('resourceManager.public.hints.pageHintsLabel')}</strong>{' '}
        {t('resourceManager.public.hints.pageHints', {
          warnings: hintSummary.warnings,
          suggestions: hintSummary.info,
        })}
      </footer>
    </section>
  );
}
