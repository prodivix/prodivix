import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { Download, FileWarning } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ResourceFileTree } from './ResourceFileTree';
import {
  collectBestPracticeHints,
  createFile,
  createFolder,
  findNodeById,
  flattenPublicFiles,
  inferCategoryByFile,
  readFileAsDataUrl,
  readPublicTree,
  removeNodeById,
  renameNode,
  resolveCategoryLabel,
  writePublicTree,
  type PublicResourceNode,
} from './publicTree';

const formatBytes = (value?: number) => {
  if (!value || value <= 0) return '0 B';
  if (value > 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value > 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
};

const isSvgFileNode = (node?: PublicResourceNode) =>
  Boolean(node?.type === 'file' && node.mime?.includes('svg'));

const isTextLikeNode = (node?: PublicResourceNode) =>
  Boolean(
    node?.type === 'file' &&
      (node.mime?.startsWith('text/') ||
        node.mime?.includes('json') ||
        node.mime?.includes('svg'))
  );

const getDefaultNewFileTemplate = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.endsWith('.json')) {
    return {
      mime: 'application/json',
      content: '{\n  "name": "resource"\n}\n',
    };
  }
  if (lower.endsWith('.svg')) {
    return {
      mime: 'image/svg+xml',
      content:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">\n  <circle cx="60" cy="60" r="48" fill="#111"/>\n</svg>\n',
    };
  }
  return { mime: 'text/plain', content: 'new file\n' };
};

const createTemplateByKind = (kind: 'text' | 'json' | 'svg') => {
  if (kind === 'json') {
    return {
      name: 'untitled.json',
      mime: 'application/json',
      content: '{\n}\n',
    };
  }
  if (kind === 'svg') {
    return {
      name: 'untitled.svg',
      mime: 'image/svg+xml',
      content:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">\n  <circle cx="60" cy="60" r="48" fill="#111"/>\n</svg>\n',
    };
  }
  return { name: 'untitled.txt', mime: 'text/plain', content: 'new file\n' };
};

type PublicResourcePageProps = {
  embedded?: boolean;
};

const getResourceManagerPublicSelectionStorageKey = (projectId?: string) =>
  `prodivix.resourceManager.public.selection.${projectId?.trim() || 'default'}`;

export function PublicResourcePage({
  embedded = false,
}: PublicResourcePageProps) {
  const { t } = useTranslation('editor');
  const { projectId } = useParams();
  const [tree, setTree] = useState<PublicResourceNode>(() =>
    readPublicTree(projectId)
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string>(() => {
    const initialTree = readPublicTree(projectId);
    const storedSelection =
      typeof window === 'undefined'
        ? null
        : window.localStorage.getItem(
            getResourceManagerPublicSelectionStorageKey(projectId)
          );
    if (storedSelection && findNodeById(initialTree, storedSelection)) {
      return storedSelection;
    }
    return flattenPublicFiles(initialTree)[0]?.id ?? initialTree.id;
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

  const persistTree = (nextTree: PublicResourceNode) => {
    setTree(nextTree);
    writePublicTree(projectId, nextTree);
  };

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

  const collectNodeIds = (node: PublicResourceNode): Set<string> => {
    const ids = new Set<string>();
    const walk = (current: PublicResourceNode) => {
      ids.add(current.id);
      (current.children ?? []).forEach(walk);
    };
    walk(node);
    return ids;
  };

  const resolveCreatedNodeId = (
    previousTree: PublicResourceNode,
    nextTree: PublicResourceNode
  ) => {
    const beforeIds = collectNodeIds(previousTree);
    let createdId: string | undefined;
    const walk = (current: PublicResourceNode) => {
      if (createdId) return;
      if (!beforeIds.has(current.id)) {
        createdId = current.id;
        return;
      }
      (current.children ?? []).forEach(walk);
    };
    walk(nextTree);
    return createdId;
  };

  const handleCreateFolder = (parentId: string) => {
    const nextTree = createFolder(tree, parentId, 'new-folder');
    const createdId = resolveCreatedNodeId(tree, nextTree);
    persistTree(nextTree);
    if (createdId) {
      setSelectedNodeId(createdId);
      setRequestRenameNodeId(createdId);
    }
  };

  const handleCreateFile = (parentId: string) => {
    const template = getDefaultNewFileTemplate('untitled.txt');
    const dataUrl = `data:${template.mime};charset=utf-8,${encodeURIComponent(template.content)}`;
    const nextTree = createFile(tree, parentId, {
      name: 'untitled.txt',
      category: inferCategoryByFile(
        new File([template.content], 'untitled.txt', { type: template.mime })
      ),
      mime: template.mime,
      size: template.content.length,
      textContent: template.content,
      contentRef: dataUrl,
    });
    const createdId = resolveCreatedNodeId(tree, nextTree);
    persistTree(nextTree);
    if (createdId) {
      setSelectedNodeId(createdId);
      setRequestRenameNodeId(createdId);
    }
  };

  const handleCreateFileByKind = (
    parentId: string,
    kind: 'text' | 'json' | 'svg'
  ) => {
    const template = createTemplateByKind(kind);
    const dataUrl = `data:${template.mime};charset=utf-8,${encodeURIComponent(template.content)}`;
    const nextTree = createFile(tree, parentId, {
      name: template.name,
      category: inferCategoryByFile(
        new File([template.content], template.name, { type: template.mime })
      ),
      mime: template.mime,
      size: template.content.length,
      textContent: template.content,
      contentRef: dataUrl,
    });
    const createdId = resolveCreatedNodeId(tree, nextTree);
    persistTree(nextTree);
    if (createdId) {
      setSelectedNodeId(createdId);
      setRequestRenameNodeId(createdId);
    }
  };

  const handleDeleteNode = (nodeId: string) => {
    const next = removeNodeById(tree, nodeId);
    persistTree(next);
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(next.id);
    }
  };

  const handleImportFiles = async (
    parentId: string,
    files: FileList | null
  ) => {
    if (!files || files.length === 0) return;
    let nextTree = tree;
    for (const file of Array.from(files)) {
      const contentRef = await readFileAsDataUrl(file);
      const textContent =
        file.type.includes('text') ||
        file.type.includes('json') ||
        file.name.toLowerCase().endsWith('.svg')
          ? await file.text()
          : undefined;
      nextTree = createFile(nextTree, parentId, {
        name: file.name,
        category: inferCategoryByFile(file),
        mime: file.type || 'application/octet-stream',
        size: file.size,
        contentRef,
        textContent,
      });
    }
    persistTree(nextTree);
  };

  const handleImportFilesByCategory = async (
    parentId: string,
    forcedCategory: 'image' | 'font' | 'document' | 'other',
    files: FileList | null
  ) => {
    if (!files || files.length === 0) return;
    let nextTree = tree;
    for (const file of Array.from(files)) {
      const contentRef = await readFileAsDataUrl(file);
      const textContent =
        file.type.includes('text') ||
        file.type.includes('json') ||
        file.name.toLowerCase().endsWith('.svg')
          ? await file.text()
          : undefined;
      nextTree = createFile(nextTree, parentId, {
        name: file.name,
        category: forcedCategory,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        contentRef,
        textContent,
      });
    }
    persistTree(nextTree);
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
            onRename={(nodeId, nextName) => {
              persistTree(renameNode(tree, nodeId, nextName));
              setRequestRenameNodeId(undefined);
            }}
            onDelete={handleDeleteNode}
          />
        </aside>
        <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-(--text-primary)">
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
                  {formatBytes(selectedNode.size)}
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
