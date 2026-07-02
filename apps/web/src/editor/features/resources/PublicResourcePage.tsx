import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { Download, FileWarning } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ResourceFileTree } from './ResourceFileTree';
import {
  collectBestPracticeHints,
  findNodeById,
  flattenPublicFiles,
  inferCategoryByFile,
  PUBLIC_TREE_ROOT_ID,
  readFileAsDataUrl,
  resolveCategoryLabel,
} from './publicTree';
import {
  createPublicTemplateByKind,
  formatPublicResourceBytes,
  getDefaultPublicFileTemplate,
  getResourceManagerPublicSelectionStorageKey,
  isSvgFileNode,
  isTextLikeNode,
  shouldReadPublicFileText,
  type PublicFileKind,
} from './publicResourceModel';
import { editorApi } from '@/editor/editorApi';
import { useAuthStore } from '@/auth/useAuthStore';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { buildPublicResourceTreeFromWorkspace } from './workspacePublicResources';
import {
  createWorkspaceDirectoryIntentRequest,
  deleteWorkspaceDirectoryIntentRequest,
  renameWorkspaceDirectoryIntentRequest,
} from '@/workspace';
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
  type WorkspaceAssetContent,
} from './workspaceResourceDocuments';

type PublicResourcePageProps = {
  embedded?: boolean;
};

export function PublicResourcePage({
  embedded = false,
}: PublicResourcePageProps) {
  const { t } = useTranslation('editor');
  const { projectId } = useParams();
  const token = useAuthStore((state) => state.token);
  const workspaceId = useEditorStore((state) => state.workspaceId);
  const workspaceRev = useEditorStore((state) => state.workspaceRev);
  const workspaceDocumentsById = useEditorStore(
    (state) => state.workspaceDocumentsById
  );
  const routeManifest = useEditorStore((state) => state.routeManifest);
  const treeRootId = useEditorStore((state) => state.treeRootId);
  const treeById = useEditorStore((state) => state.treeById);
  const applyWorkspaceMutation = useEditorStore(
    (state) => state.applyWorkspaceMutation
  );
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

  const selectedNode = useMemo(
    () => findNodeById(tree, selectedNodeId) ?? tree,
    [selectedNodeId, tree]
  );
  const selectedHints = useMemo(
    () => collectBestPracticeHints(selectedNode),
    [selectedNode]
  );
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

  const resolveWorkspaceParentNodeId = (parentId: string) => {
    if (parentId === PUBLIC_TREE_ROOT_ID) {
      return treeRootId;
    }
    return treeById[parentId]?.kind === 'dir' ? parentId : undefined;
  };

  const applyIntent = async (
    data: Parameters<typeof editorApi.applyWorkspaceIntent>[2]
  ) => {
    if (!token || !workspaceId || !workspaceRev) return null;
    const mutation = await editorApi.applyWorkspaceIntent(
      token,
      workspaceId,
      data
    );
    applyWorkspaceMutation(mutation);
    return mutation;
  };

  const handleCreateFolder = async (parentId: string) => {
    if (!token || !workspaceId || !workspaceRev) return;
    let parentNodeId = resolveWorkspaceParentNodeId(parentId);
    if (!parentNodeId) return;
    if (
      parentId === PUBLIC_TREE_ROOT_ID &&
      !findWorkspaceNodeByPath(treeRootId, treeById, RESOURCE_ROOTS.public)
    ) {
      const rootMutation = await editorApi.applyWorkspaceIntent(
        token,
        workspaceId,
        createWorkspaceDirectoryIntentRequest({
          workspaceRev,
          intentId: createResourceIntentId(),
          issuedAt: new Date().toISOString(),
          nodeId: 'dir_public',
          parentNodeId,
          name: RESOURCE_ROOTS.public.replace(/^\//, ''),
        })
      );
      applyWorkspaceMutation(rootMutation);
      parentNodeId = rootMutation.tree
        ? Object.values(rootMutation.tree.treeById).find(
            (node) =>
              node.name === RESOURCE_ROOTS.public.replace(/^\//, '') &&
              node.parentId === treeRootId
          )?.id
        : undefined;
      if (!parentNodeId) return;
    }
    const name = 'new-folder';
    const request = createWorkspaceDirectoryIntentRequest({
      workspaceRev: useEditorStore.getState().workspaceRev ?? workspaceRev,
      intentId: createResourceIntentId(),
      issuedAt: new Date().toISOString(),
      nodeId: `dir_public_${Date.now().toString(36)}`,
      parentNodeId,
      name,
    });
    const mutation = await editorApi.applyWorkspaceIntent(
      token,
      workspaceId,
      request
    );
    applyWorkspaceMutation(mutation);
    const createdId = mutation.tree
      ? Object.values(mutation.tree.treeById).find(
          (node) => node.name === name && node.parentId === parentNodeId
        )?.id
      : undefined;
    if (createdId) {
      setSelectedNodeId(createdId);
      setRequestRenameNodeId(createdId);
    }
  };

  const createAssetDocument = async (
    parentId: string,
    name: string,
    content: WorkspaceAssetContent
  ) => {
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
    if (existing) return;
    const mutation = await applyIntent(
      createWorkspaceResourceDocumentRequest({
        workspaceRev: workspaceRev ?? 0,
        documentId,
        path,
        type: 'asset',
        content,
      })
    );
    if (mutation) setSelectedNodeId(documentId);
  };

  const handleCreateFile = async (parentId: string) => {
    const template = getDefaultPublicFileTemplate('untitled.txt');
    const dataUrl = `data:${template.mime};charset=utf-8,${encodeURIComponent(template.content)}`;
    await createAssetDocument(parentId, 'untitled.txt', {
      kind: 'asset',
      category: inferCategoryByFile(
        new File([template.content], 'untitled.txt', { type: template.mime })
      ),
      mime: template.mime,
      size: template.content.length,
      text: template.content,
      dataUrl,
    });
  };

  const handleCreateFileByKind = async (
    parentId: string,
    kind: PublicFileKind
  ) => {
    const template = createPublicTemplateByKind(kind);
    const dataUrl = `data:${template.mime};charset=utf-8,${encodeURIComponent(template.content)}`;
    await createAssetDocument(parentId, template.name, {
      kind: 'asset',
      category: inferCategoryByFile(
        new File([template.content], template.name, { type: template.mime })
      ),
      mime: template.mime,
      size: template.content.length,
      text: template.content,
      dataUrl,
    });
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
      if (isWorkspaceDocumentReferencedByRoute(routeManifest, nodeId)) {
        window.alert(
          t('publicResource.routeReferencedDeleteBlocked', {
            defaultValue:
              'This document is referenced by the route graph and cannot be deleted.',
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
    if (selectedNodeId === nodeId) setSelectedNodeId(tree.id);
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
    for (const file of Array.from(files)) {
      const contentRef = await readFileAsDataUrl(file);
      const textContent = shouldReadPublicFileText(file)
        ? await file.text()
        : undefined;
      await createAssetDocument(parentId, file.name, {
        kind: 'asset',
        category: inferCategoryByFile(file),
        mime: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl: contentRef,
        text: textContent,
      });
    }
  };

  const handleImportFilesByCategory = async (
    parentId: string,
    forcedCategory: 'image' | 'font' | 'document' | 'other',
    files: FileList | null
  ) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const contentRef = await readFileAsDataUrl(file);
      const textContent = shouldReadPublicFileText(file)
        ? await file.text()
        : undefined;
      await createAssetDocument(parentId, file.name, {
        kind: 'asset',
        category: forcedCategory,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl: contentRef,
        text: textContent,
      });
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
            onSelect={setSelectedNodeId}
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
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-(--text-primary)">
                {selectedNode.name}
              </h2>
              <p className="text-xs text-(--text-muted)">{selectedNode.path}</p>
            </div>
            {selectedNode.type === 'file' && selectedNode.contentRef ? (
              <a
                href={selectedNode.contentRef}
                download={selectedNode.name}
                className="inline-flex items-center gap-1 rounded-lg border border-black/12 px-2.5 py-1.5 text-xs text-(--text-secondary)"
              >
                <Download size={12} />
                {t('resourceManager.public.actions.download')}
              </a>
            ) : null}
          </div>
          {selectedNode.type === 'file' ? (
            <div className="grid gap-4">
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
              </div>
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
                  {svgPreviewMode === 'preview' && selectedNode.contentRef ? (
                    <img
                      src={selectedNode.contentRef}
                      alt={selectedNode.name}
                      className="max-h-[340px] w-full rounded-lg object-contain"
                    />
                  ) : (
                    <pre className="max-h-[340px] overflow-auto rounded-lg bg-black px-3 py-2 text-[11px] text-white">
                      {selectedNode.textContent || ''}
                    </pre>
                  )}
                </div>
              ) : null}
              {selectedNode.category === 'image' &&
              !isSvgFileNode(selectedNode) &&
              selectedNode.contentRef ? (
                <div className="rounded-xl border border-black/8 p-3">
                  <img
                    src={selectedNode.contentRef}
                    alt={selectedNode.name}
                    className="max-h-[380px] w-full rounded-lg object-contain"
                  />
                </div>
              ) : null}
              {selectedNode.category === 'font' && selectedNode.contentRef ? (
                <div className="rounded-xl border border-black/8 p-3">
                  <style>{`@font-face{font-family:${fontFamilyName};src:url(${selectedNode.contentRef});}`}</style>
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
                  {selectedNode.textContent || ''}
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
