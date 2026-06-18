import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useEditorStore } from '@/editor/store/useEditorStore';
import {
  generateReactBundle,
  type ReactGeneratorCodeArtifact,
} from '@prodivix/prodivix-compiler';
import { validatePirDocument } from '@/pir/validator/validator';
import {
  isWorkspaceCodeDocumentContent,
  projectWorkspaceToMfeFiles,
  type StableWorkspaceSnapshot,
  type WorkspaceProjectionIssue,
} from '@/workspace';
import { flattenPublicFiles } from '@/editor/features/resources/publicTree';
import { flattenEnabledProjectFiles } from '@/editor/features/resources/projectFileStore';
import { buildPublicResourceTreeFromWorkspace } from '@/editor/features/resources/workspacePublicResources';
import { buildProjectFilesFromWorkspace } from '@/editor/features/resources/workspaceProjectFiles';
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

export function ExportCode() {
  const { t } = useTranslation('export');
  const { projectId } = useParams();
  const pirDoc = useEditorStore((state) => state.pirDoc);
  const projectName = useEditorStore((state) =>
    projectId ? state.projectsById[projectId]?.name : undefined
  );
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
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
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

  const publicTree = useMemo(
    () =>
      buildPublicResourceTreeFromWorkspace(
        workspaceDocumentsById,
        treeRootId,
        treeById
      ),
    [treeById, treeRootId, workspaceDocumentsById]
  );
  const projectFileExportFiles = useMemo<ExportCodeFile[]>(
    () =>
      flattenEnabledProjectFiles(
        buildProjectFilesFromWorkspace(workspaceDocumentsById)
      ).map((file) => ({
        path: file.path,
        language: resolveProjectFileLanguage(file.path),
        content: file.content,
      })),
    [workspaceDocumentsById]
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
  const reactZipBaseName = useMemo(() => {
    const nameSource =
      projectName?.trim() ||
      pirDoc?.metadata?.name?.trim() ||
      'prodivix-react-export';
    return sanitizeExportFileName(nameSource);
  }, [pirDoc?.metadata?.name, projectName]);

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
          Boolean(reactProjectFiles.length) && !hasPirValidationError
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
              hasPirValidationError
            )}
          </div>
        ) : (
          renderCodePreview(activeCode, 'typescript')
        )}
      </div>
    </div>
  );
}
