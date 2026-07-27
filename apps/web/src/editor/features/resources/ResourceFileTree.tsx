import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PublicFileCategory, PublicResourceNode } from './publicTree';
import { ResourceFileTreeContextMenu } from './ResourceFileTreeContextMenu';
import type { PublicFileKind } from './publicResourceModel';
import { useEditorShortcut } from '@/editor/shortcuts';

type ResourceFileTreeMode = 'readonly' | 'editable';

type ResourceFileTreeProps = {
  tree: PublicResourceNode;
  mode: ResourceFileTreeMode;
  selectedId?: string;
  requestRenameNodeId?: string;
  onSelect?: (nodeId: string) => void;
  onCreateFolder?: (parentId: string) => void;
  onCreateFile?: (parentId: string) => void;
  onCreateFileByKind?: (parentId: string, kind: PublicFileKind) => void;
  onImport?: (parentId: string, files: FileList | null) => void;
  onImportByCategory?: (
    parentId: string,
    category: PublicFileCategory,
    files: FileList | null
  ) => void;
  onRename?: (nodeId: string, nextName: string) => void;
  onDelete?: (nodeId: string) => void;
};

const buildInitialExpandedState = (node: PublicResourceNode) => {
  const expanded: Record<string, boolean> = {};
  const walk = (current: PublicResourceNode) => {
    if (current.type !== 'folder') return;
    expanded[current.id] = true;
    (current.children ?? []).forEach(walk);
  };
  walk(node);
  return expanded;
};

const findNodeById = (
  node: PublicResourceNode,
  nodeId: string
): PublicResourceNode | undefined => {
  if (node.id === nodeId) return node;
  for (const child of node.children ?? []) {
    const found = findNodeById(child, nodeId);
    if (found) return found;
  }
  return undefined;
};

const RENAME_RECLICK_MIN_MS = 250;
const RENAME_RECLICK_MAX_MS = 1200;
const IMPORT_ACCEPTS: Record<PublicFileCategory, string> = {
  image: '.png,.jpg,.jpeg,.webp,.svg',
  font: '.woff,.woff2,.ttf,.otf',
  document: '.txt,.md,.json,.svg',
  other: '*',
};

export function ResourceFileTree({
  tree,
  mode,
  selectedId,
  requestRenameNodeId,
  onSelect,
  onCreateFolder,
  onCreateFile,
  onCreateFileByKind,
  onImport,
  onImportByCategory,
  onRename,
  onDelete,
}: ResourceFileTreeProps) {
  const { t } = useTranslation('editor');
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    buildInitialExpandedState(tree)
  );
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const [importTargetId, setImportTargetId] = useState<string>(tree.id);
  const [importCategory, setImportCategory] =
    useState<PublicFileCategory | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const lastClickRef = useRef<{ nodeId: string; at: number } | null>(null);
  const editable = mode === 'editable';

  const selectedNode = useMemo(
    () => (selectedId ? findNodeById(tree, selectedId) : undefined),
    [selectedId, tree]
  );
  const toolbarParentId =
    selectedNode?.type === 'folder'
      ? selectedNode.id
      : (selectedNode?.parentId ?? tree.id);
  const contextMenuNode = contextMenu
    ? findNodeById(tree, contextMenu.nodeId)
    : undefined;

  const toggleExpanded = (nodeId: string) => {
    setExpanded((current) => ({ ...current, [nodeId]: !current[nodeId] }));
  };

  const startRenaming = (node: PublicResourceNode) => {
    if (!editable || node.id === tree.id) return;
    onSelect?.(node.id);
    setRenamingNodeId(node.id);
    setRenamingValue(node.name);
  };

  // The owner keeps its request set until the rename commits, and its callbacks
  // are new on every render, so the request has to be consumed exactly once:
  // otherwise each parent render reopens a cancelled rename and overwrites the
  // name the author is typing.
  const consumedRenameRequestRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!editable || !requestRenameNodeId) {
      consumedRenameRequestRef.current = undefined;
      return;
    }
    if (consumedRenameRequestRef.current === requestRenameNodeId) return;
    const targetNode = findNodeById(tree, requestRenameNodeId);
    if (!targetNode || targetNode.id === tree.id) return;
    consumedRenameRequestRef.current = requestRenameNodeId;
    onSelect?.(targetNode.id);
    setRenamingNodeId(targetNode.id);
    setRenamingValue(targetNode.name);
  }, [editable, onSelect, requestRenameNodeId, tree, tree.id]);

  const cancelRenaming = () => {
    setRenamingNodeId(null);
    setRenamingValue('');
  };

  const commitRenaming = () => {
    const targetId = renamingNodeId;
    const value = renamingValue.trim();
    if (!targetId || !value) {
      cancelRenaming();
      return;
    }
    onRename?.(targetId, value);
    cancelRenaming();
  };

  const triggerImport = (parentId: string) => {
    setImportTargetId(parentId);
    setImportCategory(null);
    fileInputRef.current?.click();
  };

  const triggerImportByCategory = (
    parentId: string,
    category: PublicFileCategory
  ) => {
    setImportTargetId(parentId);
    setImportCategory(category);
    fileInputRef.current?.click();
  };

  useEffect(() => {
    if (!contextMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (contextMenuRef.current?.contains(event.target as Node)) return;
      setContextMenu(null);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [contextMenu]);

  useEditorShortcut(
    'Escape',
    () => {
      setContextMenu(null);
    },
    {
      enabled: Boolean(contextMenu),
      priority: 20,
    }
  );

  const renderNode = (node: PublicResourceNode, depth = 0): ReactElement => {
    const isFolder = node.type === 'folder';
    const isExpanded = expanded[node.id] ?? true;
    const isActive = selectedId === node.id;
    const isRenaming = renamingNodeId === node.id;
    return (
      <div key={node.id}>
        <div
          className={`group flex items-center gap-1 rounded-md pr-1 ${
            isActive ? 'bg-black/8' : 'hover:bg-black/4'
          }`}
          onContextMenu={(event) => {
            if (!editable) return;
            event.preventDefault();
            setContextMenu({
              nodeId: node.id,
              x: event.clientX,
              y: event.clientY,
            });
          }}
        >
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1 py-1 text-left text-xs"
            style={{ paddingLeft: `${depth * 12 + 6}px` }}
            onClick={() => {
              const now = Date.now();
              const lastClick = lastClickRef.current;
              lastClickRef.current = { nodeId: node.id, at: now };

              const isSecondClickOnSameNode =
                lastClick?.nodeId === node.id &&
                now - lastClick.at >= RENAME_RECLICK_MIN_MS &&
                now - lastClick.at <= RENAME_RECLICK_MAX_MS;
              const shouldRename =
                editable &&
                node.id !== tree.id &&
                selectedId === node.id &&
                isSecondClickOnSameNode;

              if (shouldRename) {
                startRenaming(node);
                return;
              }

              if (isFolder) {
                toggleExpanded(node.id);
              }
              onSelect?.(node.id);
            }}
            onKeyDown={(event) => {
              if (!editable || node.id === tree.id) return;
              if (event.key === 'F2') {
                event.preventDefault();
                startRenaming(node);
              }
            }}
            title={node.path}
          >
            {isFolder ? (
              isExpanded ? (
                <ChevronDown
                  size={12}
                  className="shrink-0 text-(--text-muted)"
                />
              ) : (
                <ChevronRight
                  size={12}
                  className="shrink-0 text-(--text-muted)"
                />
              )
            ) : (
              <span className="inline-block w-3 shrink-0" />
            )}
            {isFolder ? (
              isExpanded ? (
                <FolderOpen
                  size={13}
                  className="shrink-0 text-(--text-secondary)"
                />
              ) : (
                <Folder
                  size={13}
                  className="shrink-0 text-(--text-secondary)"
                />
              )
            ) : (
              <FileText
                size={13}
                className="shrink-0 text-(--text-secondary)"
              />
            )}
            {isRenaming ? (
              <input
                autoFocus
                value={renamingValue}
                onChange={(event) => setRenamingValue(event.target.value)}
                onBlur={commitRenaming}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitRenaming();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelRenaming();
                  }
                }}
                className="h-6 min-w-0 flex-1 rounded border border-black/20 bg-white px-1.5 text-xs outline-none"
              />
            ) : (
              <span className="truncate text-(--text-primary)">
                {node.name}
              </span>
            )}
          </button>
          {editable ? (
            <div className="hidden items-center gap-1 group-hover:inline-flex">
              {isFolder ? (
                <>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-(--text-secondary) hover:border-black/12 hover:text-(--text-primary)"
                    aria-label={`create-folder-${node.id}`}
                    title={t('resourceManager.tree.actions.newFolder')}
                    onClick={() => onCreateFolder?.(node.id)}
                  >
                    <FolderPlus size={12} />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-(--text-secondary) hover:border-black/12 hover:text-(--text-primary)"
                    aria-label={`create-file-${node.id}`}
                    title={t('resourceManager.tree.actions.newFile')}
                    onClick={() => onCreateFile?.(node.id)}
                  >
                    <Plus size={12} />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-(--text-secondary) hover:border-black/12 hover:text-(--text-primary)"
                    aria-label={`import-${node.id}`}
                    title={t('resourceManager.tree.actions.importFiles')}
                    onClick={() => triggerImport(node.id)}
                  >
                    <Upload size={12} />
                  </button>
                </>
              ) : null}
              {node.id !== tree.id ? (
                <>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-(--text-secondary) hover:border-black/12 hover:text-(--text-primary)"
                    aria-label={`rename-${node.id}`}
                    title={t('resourceManager.tree.actions.renameF2')}
                    onClick={() => startRenaming(node)}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-(--text-secondary) hover:border-black/12 hover:text-(--text-primary)"
                    aria-label={`delete-${node.id}`}
                    title={t('resourceManager.tree.actions.delete')}
                    onClick={() => onDelete?.(node.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        {isFolder && isExpanded
          ? (node.children ?? []).map((child) => renderNode(child, depth + 1))
          : null}
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-black/10 bg-white/90 p-2">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-[11px] font-medium tracking-[0.08em] text-(--text-muted) uppercase">
          {mode === 'editable'
            ? t('resourceManager.tree.publicEditable')
            : t('resourceManager.tree.fileReadonly')}
        </p>
        {editable ? (
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-(--text-secondary) hover:border-black/12 hover:text-(--text-primary)"
              aria-label="toolbar-create-folder"
              title={t('resourceManager.tree.actions.newFolder')}
              onClick={() => onCreateFolder?.(toolbarParentId)}
            >
              <FolderPlus size={12} />
            </button>
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-(--text-secondary) hover:border-black/12 hover:text-(--text-primary)"
              aria-label="toolbar-create-file"
              title={t('resourceManager.tree.actions.newFile')}
              onClick={() => onCreateFile?.(toolbarParentId)}
            >
              <Plus size={12} />
            </button>
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-(--text-secondary) hover:border-black/12 hover:text-(--text-primary)"
              aria-label="toolbar-import"
              title={t('resourceManager.tree.actions.importFiles')}
              onClick={() => triggerImport(toolbarParentId)}
            >
              <Upload size={12} />
            </button>
          </div>
        ) : null}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={importCategory ? IMPORT_ACCEPTS[importCategory] : undefined}
        className="hidden"
        onChange={(event) => {
          if (importCategory) {
            onImportByCategory?.(
              importTargetId,
              importCategory,
              event.target.files
            );
          } else {
            onImport?.(importTargetId, event.target.files);
          }
          setImportCategory(null);
          event.currentTarget.value = '';
        }}
      />
      <div className="max-h-[65vh] overflow-auto">{renderNode(tree)}</div>
      {contextMenu && contextMenuNode ? (
        <ResourceFileTreeContextMenu
          menuRef={contextMenuRef}
          node={contextMenuNode}
          rootId={tree.id}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCreateFolder={onCreateFolder}
          onCreateFile={onCreateFile}
          onCreateFileByKind={onCreateFileByKind}
          onImport={triggerImport}
          onImportByCategory={triggerImportByCategory}
          onRename={startRenaming}
          onDelete={onDelete}
        />
      ) : null}
    </div>
  );
}
