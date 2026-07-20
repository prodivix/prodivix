import { type ReactElement, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  Folder,
  FolderOpen,
  FolderPlus,
  Plus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  CODE_FILE_KINDS,
  type CodeFileKind,
  type CodeResourceNode,
} from './codeAuthoringModel';
import {
  CodeArtifactRelocationOverlay,
  type CodeArtifactRelocationOverlayView,
  type EditorSurfaceAnchor,
} from './CodeEditorActionOverlays';
import { useEditorShortcut } from '@/editor/shortcuts';

type CodeFileTreeProps = {
  tree: CodeResourceNode;
  selectedId?: string;
  requestRenameNodeId?: string;
  onSelect?: (nodeId: string) => void;
  onCreateFolder?: (parentId: string) => void;
  onCreateCodeFile?: (parentId: string, kind?: CodeFileKind) => void;
  onRename?: (nodeId: string, nextName: string) => void;
  onMove?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  relocation?: CodeArtifactRelocationOverlayView;
  relocationBusy?: boolean;
  onRelocationPathChange?: (value: string) => void;
  onApplyRelocation?: () => void;
  onCancelRelocation?: () => void;
  canCreateFolder?: boolean;
  canCreateCodeFile?: boolean;
  canMove?: boolean;
};

const buildInitialExpandedState = (node: CodeResourceNode) => {
  const expanded: Record<string, boolean> = {};
  const walk = (current: CodeResourceNode) => {
    if (current.type !== 'folder') return;
    expanded[current.id] = true;
    (current.children ?? []).forEach(walk);
  };
  walk(node);
  return expanded;
};

const findNodeById = (
  node: CodeResourceNode,
  nodeId: string
): CodeResourceNode | undefined => {
  if (node.id === nodeId) return node;
  for (const child of node.children ?? []) {
    const found = findNodeById(child, nodeId);
    if (found) return found;
  }
  return undefined;
};

const RENAME_RECLICK_MIN_MS = 20;
const RENAME_RECLICK_MAX_MS = 200;
export function CodeFileTree({
  tree,
  selectedId,
  requestRenameNodeId,
  onSelect,
  onCreateFolder,
  onCreateCodeFile,
  onRename,
  onMove,
  onDelete,
  relocation,
  relocationBusy = false,
  onRelocationPathChange,
  onApplyRelocation,
  onCancelRelocation,
  canCreateFolder = Boolean(onCreateFolder),
  canCreateCodeFile = Boolean(onCreateCodeFile),
  canMove = Boolean(onMove),
}: CodeFileTreeProps) {
  const { t } = useTranslation('editor');
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    buildInitialExpandedState(tree)
  );
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);
  const [relocationAnchor, setRelocationAnchor] =
    useState<EditorSurfaceAnchor | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const lastClickRef = useRef<{ nodeId: string; at: number } | null>(null);

  const selectedNode = selectedId ? findNodeById(tree, selectedId) : undefined;
  const toolbarParentId =
    selectedNode?.type === 'folder'
      ? selectedNode.id
      : (selectedNode?.parentId ?? tree.id);

  const toggleExpanded = (nodeId: string) => {
    setExpanded((current) => ({ ...current, [nodeId]: !current[nodeId] }));
  };

  const startRenaming = (node: CodeResourceNode) => {
    if (node.id === tree.id) return;
    onSelect?.(node.id);
    setRenamingNodeId(node.id);
    setRenamingValue(node.name);
  };

  useEffect(() => {
    if (!requestRenameNodeId) return;
    const targetNode = findNodeById(tree, requestRenameNodeId);
    if (!targetNode || targetNode.id === tree.id) return;
    onSelect?.(targetNode.id);
    setRenamingNodeId(targetNode.id);
    setRenamingValue(targetNode.name);
  }, [onSelect, requestRenameNodeId, tree, tree.id]);

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

  useEffect(() => {
    if (relocation) return;
    setRelocationAnchor(null);
  }, [relocation]);

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

  const renderNode = (node: CodeResourceNode, depth = 0): ReactElement => {
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
            event.preventDefault();
            onSelect?.(node.id);
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
              if (node.id === tree.id) return;
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
              <FileCode2
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
          <div className="hidden items-center gap-1 group-hover:inline-flex">
            {isFolder ? (
              <>
                {canCreateFolder ? (
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-(--text-secondary) hover:border-black/12 hover:text-(--text-primary)"
                    aria-label={`create-folder-${node.id}`}
                    title={t('resourceManager.tree.actions.newFolder')}
                    onClick={() => {
                      setExpanded((current) => ({
                        ...current,
                        [node.id]: true,
                      }));
                      onCreateFolder?.(node.id);
                    }}
                  >
                    <FolderPlus size={12} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-(--text-secondary) hover:border-black/12 hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`create-code-file-${node.id}`}
                  title={t('resourceManager.tree.actions.newCodeFile')}
                  disabled={!canCreateCodeFile}
                  onClick={() => {
                    setExpanded((current) => ({ ...current, [node.id]: true }));
                    onCreateCodeFile?.(node.id);
                  }}
                >
                  <Plus size={12} />
                </button>
              </>
            ) : null}
          </div>
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
          {t('resourceManager.tree.codeTree')}
        </p>
        <div className="inline-flex items-center gap-1">
          {canCreateFolder ? (
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-(--text-secondary) hover:border-black/12 hover:text-(--text-primary)"
              aria-label="toolbar-create-folder"
              title={t('resourceManager.tree.actions.newFolder')}
              onClick={() => {
                setExpanded((current) => ({
                  ...current,
                  [toolbarParentId]: true,
                }));
                onCreateFolder?.(toolbarParentId);
              }}
            >
              <FolderPlus size={12} />
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-(--text-secondary) hover:border-black/12 hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="toolbar-create-code-file"
            title={t('resourceManager.tree.actions.newCodeFile')}
            disabled={!canCreateCodeFile}
            onClick={() => {
              setExpanded((current) => ({
                ...current,
                [toolbarParentId]: true,
              }));
              onCreateCodeFile?.(toolbarParentId);
            }}
          >
            <Plus size={12} />
          </button>
        </div>
      </div>
      <div className="max-h-[65vh] overflow-auto">{renderNode(tree)}</div>
      {contextMenu ? (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[220px] rounded-md border border-black/12 bg-white p-1 text-xs shadow-[0_8px_30px_rgba(0,0,0,0.15)]"
          style={{ left: contextMenu.x + 4, top: contextMenu.y + 4 }}
        >
          {(() => {
            const node = findNodeById(tree, contextMenu.nodeId);
            if (!node) return null;
            const targetParentId =
              node.type === 'folder' ? node.id : (node.parentId ?? tree.id);
            return (
              <>
                {node.type === 'folder'
                  ? CODE_FILE_KINDS.map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-black/5 disabled:cursor-not-allowed disabled:text-(--text-muted)"
                        disabled={!canCreateCodeFile}
                        onClick={() => {
                          if (!canCreateCodeFile) return;
                          setExpanded((current) => ({
                            ...current,
                            [targetParentId]: true,
                          }));
                          onCreateCodeFile?.(targetParentId, kind);
                          setContextMenu(null);
                        }}
                      >
                        <span>
                          {t(`resourceManager.tree.codeKinds.${kind}`)}
                        </span>
                        <span>.{kind}</span>
                      </button>
                    ))
                  : null}
                {node.type === 'folder' && node.id !== tree.id ? (
                  <div className="my-1 border-t border-black/8" />
                ) : null}
                {node.type === 'file' && onMove ? (
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-black/5 disabled:cursor-not-allowed disabled:text-(--text-muted)"
                    disabled={!canMove}
                    onClick={() => {
                      if (!canMove) return;
                      const viewportWidth = window.innerWidth;
                      const viewportHeight = window.innerHeight;
                      setRelocationAnchor({
                        left: Math.max(
                          8,
                          Math.min(contextMenu.x + 4, viewportWidth - 388)
                        ),
                        top: Math.max(
                          8,
                          Math.min(contextMenu.y + 4, viewportHeight - 180)
                        ),
                      });
                      onMove(node.id);
                      setContextMenu(null);
                    }}
                  >
                    {t('resourceManager.code.refactor.move')}
                  </button>
                ) : null}
                {node.id !== tree.id && onRename ? (
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-black/5"
                    onClick={() => {
                      startRenaming(node);
                      setContextMenu(null);
                    }}
                  >
                    <span>{t('resourceManager.tree.menu.rename')}</span>
                    <kbd className="text-[10px] text-(--text-muted)">F2</kbd>
                  </button>
                ) : null}
                {node.id !== tree.id && onDelete ? (
                  <>
                    <div className="my-1 border-t border-black/8" />
                    <button
                      type="button"
                      className="flex w-full items-center rounded px-2 py-1.5 text-left text-red-600 hover:bg-red-50"
                      onClick={() => {
                        onDelete(node.id);
                        setContextMenu(null);
                      }}
                    >
                      {t('resourceManager.tree.menu.delete')}
                    </button>
                  </>
                ) : null}
              </>
            );
          })()}
        </div>
      ) : null}
      {relocation && relocationAnchor ? (
        <CodeArtifactRelocationOverlay
          anchor={relocationAnchor}
          relocation={relocation}
          busy={relocationBusy}
          onPathChange={(value) => onRelocationPathChange?.(value)}
          onApply={() => onApplyRelocation?.()}
          onCancel={() => {
            setRelocationAnchor(null);
            onCancelRelocation?.();
          }}
        />
      ) : null}
    </div>
  );
}
