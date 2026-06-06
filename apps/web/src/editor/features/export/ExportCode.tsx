import { type ReactElement, useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileJson2,
  FileText,
  Folder,
  FolderOpen,
} from 'lucide-react';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { generateReactBundle } from '@/pir/generator/pirToReact';
import type { ReactGeneratorCodeArtifact } from '@/pir/generator/react/types';
import { validatePirDocument } from '@/pir/validator/validator';
import {
  isWorkspaceCodeDocumentContent,
  projectWorkspaceToMfeFiles,
  type StableWorkspaceSnapshot,
  type WorkspaceProjectionIssue,
} from '@/workspace';
import {
  flattenPublicFiles,
  readPublicTree,
} from '@/editor/features/resources/publicTree';
import {
  flattenEnabledProjectFiles,
  readProjectFiles,
} from '@/editor/features/resources/projectFileStore';
import { CodeViewer } from './CodeViewer';
import { resolveZipFilePayload } from './exportZip';
import './ExportCode.scss';

type ExportTab = 'react' | 'vfs';
type ExportFileLanguage =
  | 'typescript'
  | 'json'
  | 'html'
  | 'css'
  | 'markdown'
  | 'text';
type ExportCodeFile = {
  path: string;
  language: ExportFileLanguage;
  content: string;
  binaryDataUrl?: string;
};
type FileTreeNode = {
  key: string;
  name: string;
  path: string;
  file?: { path: string; language: ExportFileLanguage };
  children: FileTreeNode[];
};

const buildFileTree = (
  files: Array<{
    path: string;
    language: ExportFileLanguage;
  }>
): FileTreeNode[] => {
  const root: FileTreeNode = {
    key: 'root',
    name: 'root',
    path: '',
    children: [],
  };

  files.forEach((file) => {
    const segments = file.path.split('/').filter(Boolean);
    let cursor = root;
    segments.forEach((segment, index) => {
      const nodePath = segments.slice(0, index + 1).join('/');
      let next = cursor.children.find((item) => item.path === nodePath);
      if (!next) {
        next = {
          key: nodePath,
          name: segment,
          path: nodePath,
          children: [],
        };
        cursor.children.push(next);
      }
      if (index === segments.length - 1) {
        next.file = file;
      }
      cursor = next;
    });
  });

  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] =>
    nodes
      .map((node) => ({ ...node, children: sortNodes(node.children) }))
      .sort((a, b) => {
        const aIsDir = a.children.length > 0 && !a.file;
        const bIsDir = b.children.length > 0 && !b.file;
        if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

  return sortNodes(root.children);
};

const sanitizeFileName = (value: string) =>
  value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'prodivix-react-export';

const resolveProjectFileLanguage = (path: string): ExportFileLanguage => {
  const lower = path.toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.md')) return 'markdown';
  return 'text';
};

const resolveCodeViewerLanguage = (language?: ExportFileLanguage) => {
  if (language === 'json') return 'json';
  if (language === 'html') return 'html';
  if (language === 'css') return 'css';
  if (language === 'markdown') return 'markdown';
  if (language === 'text') return 'text';
  return 'typescript';
};

export function ExportCode() {
  const { t } = useTranslation('export');
  const { projectId } = useParams();
  const pirDoc = useEditorStore((state) => state.pirDoc);
  const projectType = useEditorStore(
    (state) =>
      (projectId ? state.projectsById[projectId]?.type : undefined) ?? 'project'
  );
  const workspaceId = useEditorStore((state) => state.workspaceId);
  const workspaceRev = useEditorStore((state) => state.workspaceRev);
  const routeRev = useEditorStore((state) => state.routeRev);
  const opSeq = useEditorStore((state) => state.opSeq);
  const treeRootId = useEditorStore((state) => state.treeRootId);
  const treeById = useEditorStore((state) => state.treeById);
  const workspaceDocumentsById = useEditorStore(
    (state) => state.workspaceDocumentsById
  );
  const routeManifest = useEditorStore((state) => state.routeManifest);
  const activeDocumentId = useEditorStore((state) => state.activeDocumentId);
  const activeRouteNodeId = useEditorStore((state) => state.activeRouteNodeId);
  const [copied, setCopied] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [activeTab, setActiveTab] = useState<ExportTab>('vfs');
  const [activeReactFile, setActiveReactFile] = useState('');
  const [activeVfsFile, setActiveVfsFile] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<
    Record<string, boolean>
  >({});
  const pirValidation = useMemo(() => validatePirDocument(pirDoc), [pirDoc]);
  const hasPirValidationError = pirValidation.hasError;
  const validatedPirDoc = pirValidation.document;
  const codeArtifacts = useMemo<ReactGeneratorCodeArtifact[]>(() => {
    const artifacts: ReactGeneratorCodeArtifact[] = [];
    Object.values(workspaceDocumentsById).forEach((document) => {
      if (
        document.type !== 'code' ||
        !isWorkspaceCodeDocumentContent(document.content)
      ) {
        return;
      }
      artifacts.push({
        id: document.id,
        path: document.path,
        language: document.content.language,
        source: document.content.source,
      });
    });
    return artifacts;
  }, [workspaceDocumentsById]);

  const reactBundle = useMemo(() => {
    if (!validatedPirDoc?.ui?.graph) return null;
    if (hasPirValidationError) {
      return {
        entryFilePath: 'validation-error.ts',
        type: projectType,
        files: [],
        diagnostics: pirValidation.issues.map((item) => ({
          code: item.code,
          severity: 'error' as const,
          source: 'canonical-ir' as const,
          message: item.message,
          path: item.path,
        })),
      };
    }
    try {
      return generateReactBundle(validatedPirDoc, {
        resourceType: projectType,
        packageResolver: {
          strategy: 'npm',
        },
        codeArtifacts,
      });
    } catch (error) {
      const message = t('react.error', {
        defaultValue: 'React 代码生成失败',
      });
      return {
        entryFilePath: 'error.ts',
        type: projectType,
        files: [
          {
            path: 'error.ts',
            language: 'typescript' as const,
            content: `// ${message}\n${String(error)}`,
          },
        ],
        diagnostics: [],
      };
    }
  }, [
    validatedPirDoc,
    hasPirValidationError,
    pirValidation.issues,
    projectType,
    codeArtifacts,
    t,
  ]);

  const publicTree = useMemo(() => readPublicTree(projectId), [projectId]);
  const projectFileExportFiles = useMemo<ExportCodeFile[]>(
    () =>
      flattenEnabledProjectFiles(readProjectFiles(projectId)).map((file) => ({
        path: file.path,
        language: resolveProjectFileLanguage(file.path),
        content: file.content,
      })),
    [projectId]
  );
  const publicExportFiles = useMemo<ExportCodeFile[]>(
    () =>
      flattenPublicFiles(publicTree).map((file) => {
        const lowerName = file.name.toLowerCase();
        const isJson = Boolean(
          file.mime?.includes('json') || lowerName.endsWith('.json')
        );
        const isHtml = Boolean(
          file.mime?.includes('html') || /\.(html?)$/i.test(lowerName)
        );
        const isCss = Boolean(
          file.mime?.includes('css') || lowerName.endsWith('.css')
        );
        const content =
          file.textContent ??
          `// Binary file\n// path: ${file.path}\n// mime: ${
            file.mime || 'unknown'
          }\n// size: ${file.size || 0} bytes`;
        return {
          path: file.path,
          language: isJson
            ? 'json'
            : isHtml
              ? 'html'
              : isCss
                ? 'css'
                : 'typescript',
          content,
          binaryDataUrl:
            file.textContent == null && file.contentRef?.startsWith('data:')
              ? file.contentRef
              : undefined,
        };
      }),
    [publicTree]
  );
  const reactProjectFiles = useMemo<ExportCodeFile[]>(
    () => [
      ...projectFileExportFiles,
      ...(reactBundle?.files ?? []),
      ...publicExportFiles,
    ],
    [projectFileExportFiles, publicExportFiles, reactBundle?.files]
  );
  const reactFileTree = useMemo(
    () => buildFileTree(reactProjectFiles),
    [reactProjectFiles]
  );
  const workspaceSnapshot = useMemo<StableWorkspaceSnapshot | null>(() => {
    if (!workspaceId || !treeRootId) return null;
    return {
      id: workspaceId,
      workspaceRev: workspaceRev ?? 0,
      routeRev: routeRev ?? 0,
      opSeq: opSeq ?? 0,
      treeRootId,
      treeById,
      docsById: workspaceDocumentsById,
      routeManifest,
      ...(activeDocumentId ? { activeDocumentId } : {}),
      ...(activeRouteNodeId ? { activeRouteNodeId } : {}),
    };
  }, [
    activeDocumentId,
    activeRouteNodeId,
    opSeq,
    routeManifest,
    routeRev,
    treeById,
    treeRootId,
    workspaceDocumentsById,
    workspaceId,
    workspaceRev,
  ]);
  const vfsProjection = useMemo<
    { files: ExportCodeFile[]; issues: WorkspaceProjectionIssue[] } | undefined
  >(() => {
    if (!workspaceSnapshot) return undefined;
    const projected = projectWorkspaceToMfeFiles(workspaceSnapshot);
    if (projected.ok === false) {
      return { files: [], issues: projected.issues };
    }
    return {
      files: projected.files.map((file) => ({
        path: file.path,
        language: resolveProjectFileLanguage(file.path),
        content: file.content,
      })),
      issues: [],
    };
  }, [workspaceSnapshot]);
  const vfsProjectFiles = vfsProjection?.files ?? [];
  const vfsProjectionIssues = vfsProjection?.issues ?? [];
  const vfsFileTree = useMemo(
    () => buildFileTree(vfsProjectFiles),
    [vfsProjectFiles]
  );
  const activeReactFileRecord = useMemo(
    () =>
      reactProjectFiles.find((file) => file.path === activeReactFile) ??
      reactProjectFiles[0],
    [activeReactFile, reactProjectFiles]
  );
  const activeReactFileContent = activeReactFileRecord?.content ?? '';
  const activeVfsFileRecord = useMemo(
    () =>
      vfsProjectFiles.find((file) => file.path === activeVfsFile) ??
      vfsProjectFiles[0],
    [activeVfsFile, vfsProjectFiles]
  );
  const activeVfsFileContent = activeVfsFileRecord?.content ?? '';
  const reactZipBaseName = useMemo(
    () =>
      sanitizeFileName(
        pirDoc?.metadata?.name || projectId || 'prodivix-react-export'
      ),
    [pirDoc?.metadata?.name, projectId]
  );

  useEffect(() => {
    if (!reactProjectFiles.length) {
      setActiveReactFile('');
      return;
    }
    const hasActiveFile = reactProjectFiles.some(
      (file) => file.path === activeReactFile
    );
    if (hasActiveFile) return;
    if (
      reactBundle?.entryFilePath &&
      reactProjectFiles.some((file) => file.path === reactBundle.entryFilePath)
    ) {
      setActiveReactFile(reactBundle.entryFilePath);
      return;
    }
    setActiveReactFile(reactProjectFiles[0].path);
  }, [activeReactFile, reactBundle?.entryFilePath, reactProjectFiles]);

  useEffect(() => {
    if (!vfsProjectFiles.length) {
      setActiveVfsFile('');
      return;
    }
    const hasActiveFile = vfsProjectFiles.some(
      (file) => file.path === activeVfsFile
    );
    if (hasActiveFile) return;
    setActiveVfsFile(vfsProjectFiles[0].path);
  }, [activeVfsFile, vfsProjectFiles]);

  const activeCode =
    activeTab === 'vfs' ? activeVfsFileContent : activeReactFileContent;
  const activeFiles = activeTab === 'vfs' ? vfsProjectFiles : reactProjectFiles;
  const activeTitle =
    activeTab === 'vfs'
      ? t('vfs.title', { defaultValue: 'VFS' })
      : t('react.title', { defaultValue: 'React' });
  const activeDescription =
    activeTab === 'vfs'
      ? t('vfs.description', {
          defaultValue: '当前 Workspace VFS 的完整文件树',
        })
      : t('react.description', {
          defaultValue: '基于当前 PIR 生成的 React 项目代码（含 public/*）',
        });
  const activeEmpty =
    activeTab === 'vfs'
      ? t('vfs.empty', {
          defaultValue: '暂无 Workspace VFS 文件',
        })
      : t('react.empty', {
          defaultValue: '暂无 React 代码（先生成 PIR）',
        });

  useEffect(() => {
    setCopied(false);
  }, [activeTab]);

  useEffect(() => {
    const files = activeTab === 'vfs' ? vfsProjectFiles : reactProjectFiles;
    if (!files.length) {
      setExpandedFolders({});
      return;
    }
    const next: Record<string, boolean> = {};
    files.forEach((file) => {
      const segments = file.path.split('/').filter(Boolean);
      for (let index = 0; index < segments.length - 1; index += 1) {
        next[segments.slice(0, index + 1).join('/')] = true;
      }
    });
    setExpandedFolders(next);
  }, [activeTab, reactProjectFiles, vfsProjectFiles]);

  const toggleFolder = (path: string) => {
    setExpandedFolders((current) => ({
      ...current,
      [path]: !current[path],
    }));
  };

  const renderTreeNodes = (nodes: FileTreeNode[], depth = 0): ReactElement[] =>
    nodes.map((node) => {
      const isFolder = node.children.length > 0 && !node.file;
      const isExpanded = expandedFolders[node.path] ?? true;
      const activeFilePath =
        activeTab === 'vfs' ? activeVfsFile : activeReactFile;
      const isActive = Boolean(node.file) && activeFilePath === node.file?.path;
      const fileIcon =
        node.file?.language === 'json' ? (
          <FileJson2 size={13} />
        ) : node.file?.language === 'html' || node.file?.language === 'css' ? (
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
                toggleFolder(node.path);
                return;
              }
              if (node.file) {
                if (activeTab === 'vfs') {
                  setActiveVfsFile(node.file.path);
                } else {
                  setActiveReactFile(node.file.path);
                }
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
    <div className="ExportCode">
      <div className="ExportCodeHeader">
        <div className="ExportCodeTitle">
          <h1>{activeTitle}</h1>
          <p>{activeDescription}</p>
        </div>
        <div className="ExportCodeActions">
          <div
            className="ExportCodeTabs"
            role="tablist"
            aria-label={t('title', { defaultValue: '导出代码' })}
          >
            <button
              type="button"
              className={`ExportCodeTab ${activeTab === 'react' ? 'Active' : ''}`}
              onClick={() => setActiveTab('react')}
              role="tab"
              aria-selected={activeTab === 'react'}
            >
              {t('tabs.react', { defaultValue: 'React' })}
            </button>
            <button
              type="button"
              className={`ExportCodeTab ${activeTab === 'vfs' ? 'Active' : ''}`}
              onClick={() => setActiveTab('vfs')}
              role="tab"
              aria-selected={activeTab === 'vfs'}
            >
              {t('tabs.vfs', { defaultValue: 'VFS' })}
            </button>
          </div>
          <button
            type="button"
            className="ExportCodeCopy"
            disabled={
              !activeCode || (activeTab === 'react' && hasPirValidationError)
            }
            onClick={async () => {
              if (!activeCode) return;
              await navigator.clipboard.writeText(activeCode);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 900);
            }}
          >
            {copied
              ? t('copySuccess', { defaultValue: '已复制' })
              : t('copy', { defaultValue: '复制' })}
          </button>
          {activeTab === 'react' ? (
            <button
              type="button"
              className="ExportCodeCopy"
              disabled={
                !reactProjectFiles.length ||
                downloadingZip ||
                hasPirValidationError
              }
              onClick={async () => {
                if (!reactProjectFiles.length) return;
                setDownloadingZip(true);
                try {
                  const { default: JSZip } = await import('jszip');
                  const zip = new JSZip();
                  const rootFolder = zip.folder(reactZipBaseName) ?? zip;
                  reactProjectFiles.forEach((file) => {
                    const payload = resolveZipFilePayload(file);
                    if (payload instanceof Uint8Array) {
                      rootFolder.file(file.path, payload, { binary: true });
                    } else {
                      rootFolder.file(file.path, payload);
                    }
                  });
                  const blob = await zip.generateAsync({ type: 'blob' });
                  const downloadUrl = URL.createObjectURL(blob);
                  const anchor = document.createElement('a');
                  anchor.href = downloadUrl;
                  anchor.download = `${reactZipBaseName}.zip`;
                  document.body.append(anchor);
                  anchor.click();
                  anchor.remove();
                  URL.revokeObjectURL(downloadUrl);
                } finally {
                  setDownloadingZip(false);
                }
              }}
            >
              {downloadingZip
                ? t('downloading', { defaultValue: 'Downloading...' })
                : t('downloadZip', { defaultValue: 'Download ZIP' })}
            </button>
          ) : null}
        </div>
      </div>

      <div className="ExportCodeBody">
        {activeTab === 'react' && hasPirValidationError ? (
          <div className="mb-2 rounded-md border border-red-300/60 bg-red-100/40 px-2 py-1 text-xs text-red-900 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-100">
            {pirValidation.issues.map((item) => (
              <p key={`${item.code}:${item.path}`} className="m-0">
                [{item.code}] {item.path}: {item.message}
              </p>
            ))}
          </div>
        ) : null}
        {activeTab === 'react' && reactBundle?.diagnostics?.length ? (
          <div className="mb-2 rounded-md border border-amber-300/60 bg-amber-100/40 px-2 py-1 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100">
            {reactBundle.diagnostics.map((item) => (
              <p key={`${item.code}:${item.path}`} className="m-0">
                [{item.severity}] {item.code}: {item.message}
              </p>
            ))}
          </div>
        ) : null}
        {activeTab === 'vfs' && vfsProjectionIssues.length ? (
          <div className="mb-2 rounded-md border border-red-300/60 bg-red-100/40 px-2 py-1 text-xs text-red-900 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-100">
            {vfsProjectionIssues.map((item, index) => (
              <p key={`${item.code}:${item.path}:${index}`} className="m-0">
                [{item.code}] {item.path}: {item.message}
              </p>
            ))}
          </div>
        ) : null}
        {!activeFiles.length ? (
          <div className="ExportCodeEmpty">{activeEmpty}</div>
        ) : activeTab === 'vfs' && vfsProjectFiles.length ? (
          <div className="flex h-full min-h-0 gap-2">
            <aside className="w-52 shrink-0 overflow-auto rounded-md border border-black/10 p-1 dark:border-white/15">
              {renderTreeNodes(vfsFileTree)}
            </aside>
            <CodeViewer
              code={activeVfsFileContent}
              lang={resolveCodeViewerLanguage(activeVfsFileRecord?.language)}
            />
          </div>
        ) : activeTab === 'react' && reactProjectFiles.length ? (
          <div className="flex h-full min-h-0 gap-2">
            <aside className="w-52 shrink-0 overflow-auto rounded-md border border-black/10 p-1 dark:border-white/15">
              {renderTreeNodes(reactFileTree)}
            </aside>
            <CodeViewer
              code={activeReactFileContent}
              lang={resolveCodeViewerLanguage(activeReactFileRecord?.language)}
            />
          </div>
        ) : (
          <CodeViewer code={activeCode} lang="typescript" />
        )}
      </div>
    </div>
  );
}
