import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileJson2,
  FileText,
  Folder,
  FolderOpen,
} from 'lucide-react';
import type { FileTreeNode } from './exportCodeModel';

type ExportFileTreeProps = {
  nodes: FileTreeNode[];
  activeFilePath: string;
  expandedFolders: Record<string, boolean>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
};

export function ExportFileTree({
  nodes,
  activeFilePath,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
}: ExportFileTreeProps) {
  const renderTreeNodes = (items: FileTreeNode[], depth = 0) =>
    items.map((node) => {
      const isFolder = node.children.length > 0 && !node.file;
      const isExpanded = expandedFolders[node.path] ?? true;
      const isActive = Boolean(node.file) && activeFilePath === node.file?.path;
      const fileIcon =
        node.file?.language === 'json' ? (
          <FileJson2 size={13} />
        ) : node.file?.language === 'html' ||
          node.file?.language === 'css' ||
          node.file?.language === 'ignore' ? (
          <FileText size={13} />
        ) : (
          <FileCode2 size={13} />
        );

      return (
        <div key={node.key}>
          <button
            type="button"
            className={`flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-xs ${
              isActive
                ? 'bg-black/10 dark:bg-white/15'
                : 'hover:bg-black/5 dark:hover:bg-white/10'
            }`}
            style={{ paddingLeft: `${depth * 12 + 6}px` }}
            onClick={() => {
              if (isFolder) {
                onToggleFolder(node.path);
                return;
              }
              if (node.file) {
                onSelectFile(node.file.path);
              }
            }}
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
              <span className="shrink-0 text-(--text-secondary)">
                {fileIcon}
              </span>
            )}
            <span className="truncate">{node.name}</span>
          </button>
          {isFolder && isExpanded
            ? renderTreeNodes(node.children, depth + 1)
            : null}
        </div>
      );
    });

  return (
    <aside className="w-52 shrink-0 overflow-auto rounded-md border border-black/10 p-1 dark:border-white/15">
      {renderTreeNodes(nodes)}
    </aside>
  );
}
