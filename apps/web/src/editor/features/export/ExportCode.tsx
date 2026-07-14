import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { selectWorkspace, useEditorStore } from '@/editor/store/useEditorStore';
import {
  generateWorkspaceReactViteBundle,
  type ReactExportFile,
} from '@prodivix/prodivix-compiler';
import {
  projectWorkspaceToProdivixFiles,
  type WorkspaceProjectionIssue,
} from '@prodivix/workspace';
import { useCodegenPolicySnapshot } from '@/plugins/platform';
import { ExportCodeHeader } from './ExportCodeHeader';
import { ExportCodePreview } from './ExportCodePreview';
import { ExportFileTree } from './ExportFileTree';
import {
  buildFileTree,
  resolveCodeViewerLanguage,
  resolveProjectFileLanguage,
  sanitizeExportFileName,
  type ExportCodeFile,
  type ExportTab,
} from './exportCodeModel';
import { resolveZipFilePayload } from './exportZip';
import './ExportCode.scss';

const resolveReactExportLanguage = (
  file: ReactExportFile
): ExportCodeFile['language'] => {
  if (file.language === 'json') return 'json';
  if (file.language === 'html') return 'html';
  if (file.language === 'css') return 'css';
  if (file.language === 'yaml' || file.language === 'yml') return 'yaml';
  if (file.language === 'md' || file.language === 'markdown') {
    return 'markdown';
  }
  if (
    file.language === 'ts' ||
    file.language === 'tsx' ||
    file.language === 'js' ||
    file.language === 'jsx'
  ) {
    return 'typescript';
  }
  return resolveProjectFileLanguage(file.path);
};

const reactExportFileToCodeFile = (file: ReactExportFile): ExportCodeFile => {
  const binaryContents =
    file.contents instanceof Uint8Array ? file.contents : undefined;
  const textContents =
    typeof file.contents === 'string' ? file.contents : undefined;
  return {
    path: file.path,
    language: resolveReactExportLanguage(file),
    content: binaryContents
      ? `// Binary file\n// path: ${file.path}\n// mime: ${
          file.mimeType || 'unknown'
        }\n// size: ${binaryContents.byteLength} bytes`
      : (textContents ?? ''),
    binaryContent: binaryContents,
  };
};

export function ExportCode() {
  const { t } = useTranslation('export');
  const { projectId } = useParams();
  const codegenPolicySnapshot = useCodegenPolicySnapshot();
  const projectName = useEditorStore((state) =>
    projectId ? state.projectsById[projectId]?.name : undefined
  );
  const workspaceSnapshot = useEditorStore(selectWorkspace);
  const [copied, setCopied] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ExportTab>('vfs');
  const [activeReactFile, setActiveReactFile] = useState('');
  const [activeVfsFile, setActiveVfsFile] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<
    Record<string, boolean>
  >({});

  const reactBundle = useMemo(() => {
    if (!workspaceSnapshot) return null;
    try {
      return generateWorkspaceReactViteBundle(workspaceSnapshot, {
        projectName: projectName?.trim() || workspaceSnapshot.name,
        packageResolver: {
          strategy: 'npm',
        },
        codegenPolicySnapshot,
      });
    } catch (error) {
      const message = t('react.error', {
        defaultValue: 'React 代码生成失败',
      });
      return {
        entryFilePath: 'error.ts',
        type: 'project' as const,
        files: [
          {
            path: 'error.ts',
            kind: 'source-module' as const,
            language: 'ts',
            mimeType: 'text/typescript',
            contents: `// ${message}\n${String(error)}`,
            sourceTrace: [
              {
                sourceRef: {
                  domain: 'codegen',
                  id: 'error',
                  path: 'error.ts',
                },
              },
            ],
          },
        ],
        diagnostics: [
          {
            code: 'WKS-EXPORT-UNEXPECTED',
            severity: 'error' as const,
            source: 'export' as const,
            message,
            path: '/',
          },
        ],
        dependencies: [],
        target: {
          framework: 'react' as const,
          preset: 'vite',
        },
        metadata: undefined,
      };
    }
  }, [codegenPolicySnapshot, projectName, t, workspaceSnapshot]);

  const reactProjectFiles = useMemo<ExportCodeFile[]>(
    () => reactBundle?.files.map(reactExportFileToCodeFile) ?? [],
    [reactBundle?.files]
  );
  const reactFileTree = useMemo(
    () => buildFileTree(reactProjectFiles),
    [reactProjectFiles]
  );
  const vfsProjection = useMemo<
    { files: ExportCodeFile[]; issues: WorkspaceProjectionIssue[] } | undefined
  >(() => {
    if (!workspaceSnapshot) return undefined;
    const projected = projectWorkspaceToProdivixFiles(workspaceSnapshot);
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
  const reactMainDiagnostics = useMemo(
    () => reactBundle?.diagnostics ?? [],
    [reactBundle?.diagnostics]
  );
  const hasBlockingReactDiagnostics = useMemo(
    () =>
      reactMainDiagnostics.some(
        (diagnostic) => diagnostic.severity === 'error'
      ),
    [reactMainDiagnostics]
  );
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
  const reactZipBaseName = useMemo(() => {
    const nameSource =
      projectName?.trim() ||
      workspaceSnapshot?.name?.trim() ||
      'prodivix-react-export';
    return sanitizeExportFileName(nameSource);
  }, [projectName, workspaceSnapshot?.name]);

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
  const exportViewOptions: Array<{ value: ExportTab; label: string }> = [
    { value: 'react', label: t('tabs.react', { defaultValue: 'React' }) },
    { value: 'vfs', label: t('tabs.vfs', { defaultValue: 'VFS' }) },
  ];

  useEffect(() => {
    setCopied(false);
  }, [activeReactFile, activeTab, activeVfsFile]);

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

  const copyActiveFile = async () => {
    if (!activeCode) return;
    await navigator.clipboard.writeText(activeCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 900);
  };

  const downloadReactZip = async () => {
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
  };

  const renderCodePreview = (
    code: string,
    language: string,
    disabled = false
  ) => (
    <ExportCodePreview
      code={code}
      language={language}
      copied={copied}
      disabled={disabled}
      copyLabel={t('copy', { defaultValue: '复制' })}
      copySuccessLabel={t('copySuccess', { defaultValue: '已复制' })}
      onCopy={copyActiveFile}
    />
  );

  return (
    <div className="ExportCode">
      <ExportCodeHeader
        activeTab={activeTab}
        title={activeTitle}
        description={activeDescription}
        viewMenuOpen={viewMenuOpen}
        viewOptions={exportViewOptions}
        titleLabel={t('title', { defaultValue: '导出代码' })}
        downloadingZip={downloadingZip}
        canDownloadReactZip={
          Boolean(reactProjectFiles.length) && !hasBlockingReactDiagnostics
        }
        downloadingLabel={t('downloading', {
          defaultValue: 'Downloading...',
        })}
        downloadZipLabel={t('downloadZip', {
          defaultValue: 'Download ZIP',
        })}
        onOpenViewMenuChange={setViewMenuOpen}
        onSelectTab={setActiveTab}
        onDownloadReactZip={downloadReactZip}
      />

      <div className="ExportCodeBody">
        {activeTab === 'react' && reactMainDiagnostics.length ? (
          <div className="mb-2 rounded-md border border-amber-300/60 bg-amber-100/40 px-2 py-1 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100">
            {reactMainDiagnostics.map((item) => (
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
            <ExportFileTree
              nodes={vfsFileTree}
              activeFilePath={activeVfsFile}
              expandedFolders={expandedFolders}
              onToggleFolder={toggleFolder}
              onSelectFile={setActiveVfsFile}
            />
            {renderCodePreview(
              activeVfsFileContent,
              resolveCodeViewerLanguage(activeVfsFileRecord?.language)
            )}
          </div>
        ) : activeTab === 'react' && reactProjectFiles.length ? (
          <div className="flex h-full min-h-0 gap-2">
            <ExportFileTree
              nodes={reactFileTree}
              activeFilePath={activeReactFile}
              expandedFolders={expandedFolders}
              onToggleFolder={toggleFolder}
              onSelectFile={setActiveReactFile}
            />
            {renderCodePreview(
              activeReactFileContent,
              resolveCodeViewerLanguage(activeReactFileRecord?.language),
              hasBlockingReactDiagnostics
            )}
          </div>
        ) : (
          renderCodePreview(activeCode, 'typescript')
        )}
      </div>
    </div>
  );
}
