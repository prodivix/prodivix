import { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { useParams } from 'react-router';
import { Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CodeFileTree } from './CodeFileTree';
import { useAuthStore } from '@/auth/useAuthStore';
import { editorApi } from '@/editor/editorApi';
import {
  useEditorShortcut,
  useWorkspaceHistoryShortcuts,
} from '@/editor/shortcuts';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { isLocalProjectId } from '@/editor/localProjectStore';
import { codeMirrorTypographyTheme } from '@/editor/codeMirrorTypography';
import { executeWorkspaceDocumentMutation } from '@/editor/workspaceSync/workspaceDocumentMutationExecutor';
import {
  getResourceManagerCodeSelectionStorageKey,
  reconcileCodeResourceEditorDraft,
  resolveDefaultCodeKindByParentPath,
  resolveTemplateByCodeKind,
  type CodeFileKind,
} from './codeResourceModel';
import {
  applyWorkspaceCommand,
  isWorkspaceCodeDocumentContent,
} from '@prodivix/workspace';
import {
  createWorkspaceDirectoryIntentRequest,
  createWorkspaceCodeDocumentIntentRequest,
  createWorkspaceCodeSourceUpdateCommand,
  deleteWorkspaceDirectoryIntentRequest,
  deleteWorkspaceCodeDocumentIntentRequest,
  renameWorkspaceDirectoryIntentRequest,
  renameWorkspaceCodeDocumentIntentRequest,
  type WorkspaceCodeDocumentLanguage,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  buildCodeResourceTreeFromWorkspaceVfs,
  findCodeResourceNodeById,
  flattenCodeResourceFiles,
  normalizeCodeResourcePath,
} from './workspaceCodeResources';

type CodeResourcePageProps = {
  embedded?: boolean;
  requestedCreateFolder?: 'scripts' | 'styles' | 'shaders' | null;
  onCreateRequestConsumed?: () => void;
};

const EMPTY_WORKSPACE_DOCUMENTS: WorkspaceSnapshot['docsById'] = {};
const EMPTY_WORKSPACE_TREE: WorkspaceSnapshot['treeById'] = {};

const resolveLanguageExtensionByName = (name: string) => {
  const lower = name.toLowerCase();
  if (
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.js') ||
    lower.endsWith('.jsx') ||
    lower.endsWith('.wgsl') ||
    lower.endsWith('.glsl') ||
    lower.endsWith('.json')
  ) {
    return javascript({ typescript: true, jsx: true });
  }
  if (lower.endsWith('.css') || lower.endsWith('.scss')) {
    return css();
  }
  return javascript({ typescript: true, jsx: true });
};

const createIntentId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `intent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const inferWorkspaceLanguageByPath = (
  path: string
): WorkspaceCodeDocumentLanguage => {
  const lower = path.toLowerCase();
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) return 'js';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.scss')) return 'scss';
  if (lower.endsWith('.wgsl')) return 'wgsl';
  if (lower.endsWith('.glsl')) return 'glsl';
  return 'ts';
};

const resolveBaseFolderByKind = (kind: CodeFileKind) => {
  if (kind === 'css' || kind === 'scss') return 'styles';
  if (kind === 'glsl' || kind === 'wgsl') return 'shaders';
  return 'scripts';
};

const resolveCodeKindByFolder = (
  folder: string | null
): CodeFileKind | undefined => {
  if (folder === 'styles') return 'css';
  if (folder === 'shaders') return 'glsl';
  if (folder === 'scripts') return 'ts';
  return undefined;
};

const isWorkspaceVfsFolder = (
  node: ReturnType<typeof findCodeResourceNodeById>
) => node?.type === 'folder' && node.source === 'workspace-vfs';

export function CodeResourcePage({
  embedded = false,
  requestedCreateFolder,
  onCreateRequestConsumed,
}: CodeResourcePageProps) {
  const { t } = useTranslation('editor');
  const { projectId } = useParams();
  const token = useAuthStore((state) => state.token);
  const workspace = useEditorStore((state) => state.workspace);
  const workspaceId = workspace?.id;
  const workspaceRev = workspace?.workspaceRev;
  const workspaceReadonly = useEditorStore((state) => state.workspaceReadonly);
  const workspaceCapabilities = useEditorStore(
    (state) => state.workspaceCapabilities
  );
  const workspaceCapabilitiesLoaded = useEditorStore(
    (state) => state.workspaceCapabilitiesLoaded
  );
  const workspaceDocumentsById =
    workspace?.docsById ?? EMPTY_WORKSPACE_DOCUMENTS;
  const treeRootId = workspace?.treeRootId;
  const treeById = workspace?.treeById ?? EMPTY_WORKSPACE_TREE;
  const applyWorkspaceMutation = useEditorStore(
    (state) => state.applyWorkspaceMutation
  );
  const dispatchWorkspaceCommand = useEditorStore(
    (state) => state.dispatchWorkspaceCommand
  );
  const acknowledgeWorkspaceCommand = useEditorStore(
    (state) => state.acknowledgeWorkspaceCommand
  );
  const adoptRebasedWorkspaceOperation = useEditorStore(
    (state) => state.adoptRebasedWorkspaceOperation
  );
  const openWorkspaceRevisionConflict = useEditorStore(
    (state) => state.openWorkspaceRevisionConflict
  );
  const localWorkspace = isLocalProjectId(projectId);
  const tree = useMemo(
    () =>
      buildCodeResourceTreeFromWorkspaceVfs(
        workspaceDocumentsById,
        treeRootId,
        treeById
      ),
    [treeById, treeRootId, workspaceDocumentsById]
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string>('code-root');
  const [editorValue, setEditorValue] = useState('');
  const [isSaving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const editorBaselineRef = useRef<
    { documentId: string; source: string } | undefined
  >(undefined);

  const selectedNode = useMemo(
    () => findCodeResourceNodeById(tree, selectedNodeId) ?? tree,
    [selectedNodeId, tree]
  );
  const allFiles = useMemo(() => flattenCodeResourceFiles(tree), [tree]);
  const selectedFile = selectedNode.type === 'file' ? selectedNode : undefined;
  const selectedFileSize =
    selectedFile?.size ?? selectedFile?.textContent?.length ?? 0;
  const isDirty = Boolean(
    selectedFile && editorValue !== (selectedFile.textContent ?? '')
  );
  useWorkspaceHistoryShortcuts({
    workspaceId,
    documentId: selectedFile?.id,
    domain: 'code',
    suspended: isDirty || isSaving,
    shortcutScope: 'resources',
  });

  const canCreateCodeDocument =
    Boolean(token && workspaceId && typeof workspaceRev === 'number') &&
    !workspaceReadonly &&
    (!workspaceCapabilitiesLoaded ||
      workspaceCapabilities['core.workspace.code-document.create@1.0'] ===
        true);
  const canCreateDirectory =
    Boolean(token && workspaceId && typeof workspaceRev === 'number') &&
    !workspaceReadonly &&
    (!workspaceCapabilitiesLoaded ||
      workspaceCapabilities['core.workspace.directory.create@1.0'] === true);
  const canRenameDirectory =
    Boolean(token && workspaceId && typeof workspaceRev === 'number') &&
    !workspaceReadonly &&
    (!workspaceCapabilitiesLoaded ||
      workspaceCapabilities['core.workspace.directory.rename@1.0'] === true);
  const canDeleteDirectory =
    Boolean(token && workspaceId && typeof workspaceRev === 'number') &&
    !workspaceReadonly &&
    (!workspaceCapabilitiesLoaded ||
      workspaceCapabilities['core.workspace.directory.delete@1.0'] === true);
  const canRenameCodeDocument =
    Boolean(token && workspaceId && typeof workspaceRev === 'number') &&
    !workspaceReadonly &&
    (!workspaceCapabilitiesLoaded ||
      workspaceCapabilities['core.workspace.code-document.rename@1.0'] ===
        true);
  const canDeleteCodeDocument =
    Boolean(token && workspaceId && typeof workspaceRev === 'number') &&
    !workspaceReadonly &&
    (!workspaceCapabilitiesLoaded ||
      workspaceCapabilities['core.workspace.code-document.delete@1.0'] ===
        true);
  const canPatchSelectedFile = Boolean(
    (token || localWorkspace) &&
    workspaceId &&
    selectedFile &&
    !workspaceReadonly
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedSelection =
      typeof window === 'undefined'
        ? null
        : window.localStorage.getItem(
            getResourceManagerCodeSelectionStorageKey(projectId)
          );
    if (
      selectedNodeId === 'code-root' &&
      storedSelection &&
      findCodeResourceNodeById(tree, storedSelection)
    ) {
      setSelectedNodeId(storedSelection);
      return;
    }
    if (!findCodeResourceNodeById(tree, selectedNodeId)) {
      const fallbackId = flattenCodeResourceFiles(tree)[0]?.id ?? tree.id;
      setSelectedNodeId(fallbackId);
      return;
    }
    window.localStorage.setItem(
      getResourceManagerCodeSelectionStorageKey(projectId),
      selectedNodeId
    );
  }, [projectId, selectedNodeId, tree]);

  useEffect(() => {
    if (!selectedFile) {
      setEditorValue('');
      editorBaselineRef.current = undefined;
      return;
    }
    const reconciled = reconcileCodeResourceEditorDraft({
      baseline: editorBaselineRef.current,
      editorValue,
      documentId: selectedFile.id,
      source: selectedFile.textContent ?? '',
    });
    editorBaselineRef.current = reconciled.baseline;
    if (reconciled.editorValue !== editorValue) {
      setEditorValue(reconciled.editorValue);
    }
  }, [editorValue, selectedFile]);

  const resolveDefaultKindByParent = (parentId: string): CodeFileKind => {
    const parent = findCodeResourceNodeById(tree, parentId);
    return resolveDefaultCodeKindByParentPath(parent?.path ?? '');
  };

  const handleCreateCodeFile = async (
    parentId: string,
    kind?: CodeFileKind
  ) => {
    if (!token || !workspace || !workspaceId || !workspaceRev) return;
    if (!canCreateCodeDocument) return;
    const resolvedKind = kind ?? resolveDefaultKindByParent(parentId);
    const template = resolveTemplateByCodeKind(resolvedKind);
    const parent = findCodeResourceNodeById(tree, parentId);
    const parentPath =
      parent?.type === 'folder'
        ? parent.path.replace(/^code\/?/, '')
        : resolveBaseFolderByKind(resolvedKind);
    const normalizedParentPath =
      parentPath.trim() || resolveBaseFolderByKind(resolvedKind);
    const basePath = `${normalizedParentPath}/${template.name}`.replace(
      /^\/+/,
      ''
    );
    const existingPaths = new Set(
      Object.values(workspaceDocumentsById).map((document) =>
        normalizeCodeResourcePath(document.path).toLowerCase()
      )
    );
    const dotIndex = template.name.lastIndexOf('.');
    const baseName =
      dotIndex > 0 ? template.name.slice(0, dotIndex) : template.name;
    const extension = dotIndex > 0 ? template.name.slice(dotIndex) : '';
    let candidatePath = basePath;
    let suffix = 1;
    while (existingPaths.has(candidatePath.toLowerCase())) {
      candidatePath = `${normalizedParentPath}/${baseName}-${suffix}${extension}`;
      suffix += 1;
    }
    const baseDocumentId = `code_${candidatePath.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
    let documentId = baseDocumentId;
    let documentIdSuffix = 1;
    while (workspaceDocumentsById[documentId]) {
      documentId = `${baseDocumentId}_${documentIdSuffix}`;
      documentIdSuffix += 1;
    }
    const mutation = await editorApi.applyWorkspaceIntent(
      token,
      workspace,
      createWorkspaceCodeDocumentIntentRequest({
        workspaceRev,
        intentId: createIntentId(),
        issuedAt: new Date().toISOString(),
        documentId,
        parentNodeId: isWorkspaceVfsFolder(parent) ? parent.id : undefined,
        path: candidatePath,
        content: {
          language: inferWorkspaceLanguageByPath(candidatePath),
          source: template.content,
        },
      })
    );
    applyWorkspaceMutation(mutation);
    setSelectedNodeId(documentId);
  };

  const handleCreateFolder = async (parentId: string) => {
    if (!token || !workspace || !workspaceId || !workspaceRev) return;
    if (!canCreateDirectory) return;
    const parent = findCodeResourceNodeById(tree, parentId);
    const resolvedParentId = parent?.type === 'folder' ? parent.id : tree.id;
    const parentNode = findCodeResourceNodeById(tree, resolvedParentId);
    const siblings = parentNode?.children ?? [];
    const usedNames = new Set(
      siblings.map((child) => child.name.toLowerCase())
    );
    let name = 'new-folder';
    let suffix = 1;
    while (usedNames.has(name.toLowerCase())) {
      name = `new-folder-${suffix}`;
      suffix += 1;
    }
    const nodeId = `dir_${createIntentId().replace(/[^a-zA-Z0-9]+/g, '_')}`;
    const mutation = await editorApi.applyWorkspaceIntent(
      token,
      workspace,
      createWorkspaceDirectoryIntentRequest({
        workspaceRev,
        intentId: createIntentId(),
        issuedAt: new Date().toISOString(),
        nodeId,
        parentNodeId: isWorkspaceVfsFolder(parentNode)
          ? resolvedParentId
          : undefined,
        name,
      })
    );
    applyWorkspaceMutation(mutation);
    setSelectedNodeId(nodeId);
  };

  useEffect(() => {
    if (!canCreateCodeDocument) return;
    const requestedKind = resolveCodeKindByFolder(
      requestedCreateFolder ?? null
    );
    if (!requestedKind || !requestedCreateFolder) return;
    const parentId =
      findCodeResourceNodeById(tree, `dir_${requestedCreateFolder}`)?.id ??
      tree.id;
    onCreateRequestConsumed?.();
    void handleCreateCodeFile(parentId, requestedKind);
  }, [
    canCreateCodeDocument,
    onCreateRequestConsumed,
    requestedCreateFolder,
    tree,
  ]);

  const handleRenameCodeFile = async (nodeId: string, nextName: string) => {
    if (!token || !workspace || !workspaceId || !workspaceRev) return;
    const node = findCodeResourceNodeById(tree, nodeId);
    if (node?.type === 'folder') {
      if (!canRenameDirectory || node.id === tree.id) return;
      const mutation = await editorApi.applyWorkspaceIntent(
        token,
        workspace,
        renameWorkspaceDirectoryIntentRequest({
          workspaceRev,
          intentId: createIntentId(),
          issuedAt: new Date().toISOString(),
          nodeId: node.id,
          name: nextName,
        })
      );
      applyWorkspaceMutation(mutation);
      setSelectedNodeId(node.id);
      return;
    }
    if (!canRenameCodeDocument) return;
    const document = workspaceDocumentsById[nodeId];
    if (!document || document.type !== 'code') return;
    const normalizedName = nextName.trim().replaceAll('\\', '/');
    if (!normalizedName || normalizedName.includes('/')) return;
    const currentPath = normalizeCodeResourcePath(document.path);
    const parentPath = currentPath.split('/').slice(0, -1).join('/');
    const nextPath = parentPath
      ? `${parentPath}/${normalizedName}`
      : normalizedName;
    if (nextPath === currentPath) return;
    const mutation = await editorApi.applyWorkspaceIntent(
      token,
      workspace,
      renameWorkspaceCodeDocumentIntentRequest({
        workspaceRev,
        intentId: createIntentId(),
        issuedAt: new Date().toISOString(),
        documentId: document.id,
        path: nextPath,
      })
    );
    applyWorkspaceMutation(mutation);
    setSelectedNodeId(document.id);
  };

  const handleDeleteCodeFile = async (nodeId: string) => {
    if (!token || !workspace || !workspaceId || !workspaceRev) return;
    const node = findCodeResourceNodeById(tree, nodeId);
    if (node?.type === 'folder') {
      if (!canDeleteDirectory || node.id === tree.id) return;
      const mutation = await editorApi.applyWorkspaceIntent(
        token,
        workspace,
        deleteWorkspaceDirectoryIntentRequest({
          workspaceRev,
          intentId: createIntentId(),
          issuedAt: new Date().toISOString(),
          nodeId: node.id,
        })
      );
      applyWorkspaceMutation(mutation);
      setSelectedNodeId(node.parentId ?? tree.id);
      return;
    }
    if (!canDeleteCodeDocument) return;
    const document = workspaceDocumentsById[nodeId];
    if (!document || document.type !== 'code') return;
    const mutation = await editorApi.applyWorkspaceIntent(
      token,
      workspace,
      deleteWorkspaceCodeDocumentIntentRequest({
        workspaceRev,
        intentId: createIntentId(),
        issuedAt: new Date().toISOString(),
        documentId: document.id,
      })
    );
    applyWorkspaceMutation(mutation);
    const fallbackId =
      allFiles.find((file) => file.id !== document.id)?.id ?? tree.id;
    setSelectedNodeId(fallbackId);
  };

  const handleSave = async () => {
    if (isSaving) return;
    if (!selectedFile) return;
    if (!workspace || !workspaceId) return;
    const document = workspaceDocumentsById[selectedFile.id];
    if (
      !document ||
      document.type !== 'code' ||
      !isWorkspaceCodeDocumentContent(document.content)
    ) {
      return;
    }
    const previousSource = document.content.source;
    if (previousSource === editorValue) return;
    const command = createWorkspaceCodeSourceUpdateCommand({
      workspaceId,
      document,
      source: editorValue,
      commandId: createIntentId(),
      issuedAt: new Date().toISOString(),
    });
    if (!command) return;
    setSaveError('');
    if (localWorkspace) {
      const applied = dispatchWorkspaceCommand(command);
      if (!applied?.ok) {
        setSaveError(
          t('resourceManager.code.saveFailed', {
            defaultValue: 'Could not save the code document.',
          })
        );
      }
      return;
    }
    if (!token) return;

    const locallyApplied = applyWorkspaceCommand(workspace, command);
    if ('issues' in locallyApplied) {
      setSaveError(
        locallyApplied.issues[0]?.message ||
          t('resourceManager.code.saveFailed', {
            defaultValue: 'Could not save the code document.',
          })
      );
      return;
    }
    const requestDocumentEditSeq =
      useEditorStore.getState().documentEditSeqById[document.id] ?? 0;
    setSaving(true);
    try {
      const execution = await executeWorkspaceDocumentMutation({
        token,
        baseSnapshot: workspace,
        localSnapshot: locallyApplied.snapshot,
        operation: { kind: 'command', command },
      });
      if (execution.kind === 'conflict') {
        openWorkspaceRevisionConflict(execution.session);
        setSaveError(
          t('revisionConflict.documentSummary', {
            defaultValue: '{{path}} changed both locally and remotely.',
            path: document.path,
          })
        );
        return;
      }
      if (execution.kind === 'already-applied' || execution.rebased) {
        const adoption = adoptRebasedWorkspaceOperation({
          requestSnapshot: workspace,
          serverBaseSnapshot:
            execution.kind === 'already-applied'
              ? execution.snapshot
              : execution.serverBaseSnapshot,
          rebasedSnapshot:
            execution.kind === 'already-applied'
              ? execution.snapshot
              : execution.optimisticSnapshot,
          operation:
            execution.kind === 'already-applied'
              ? { kind: 'command', command }
              : execution.operation,
          ...(execution.kind === 'already-applied'
            ? {}
            : { mutation: execution.mutation }),
          expectedDocumentEditSeqById: {
            [document.id]: requestDocumentEditSeq,
          },
        });
        if (adoption.status === 'conflict') {
          setSaveError(
            t('revisionConflict.documentSummary', {
              defaultValue: '{{path}} changed while it was saving.',
              path: document.path,
            })
          );
          return;
        }
        if (adoption.status === 'rejected') {
          throw new Error(adoption.message);
        }
        return;
      }
      if (!acknowledgeWorkspaceCommand(command, execution.mutation)?.ok) {
        throw new Error('The code save acknowledgement is no longer current.');
      }
    } catch (error) {
      console.warn('[resources] code document save failed', error);
      setSaveError(
        error instanceof Error && error.message
          ? error.message
          : t('resourceManager.code.saveFailed', {
              defaultValue: 'Could not save the code document.',
            })
      );
    } finally {
      setSaving(false);
    }
  };

  useEditorShortcut(
    'Mod+S',
    () => {
      handleSave();
    },
    {
      allowInEditable: true,
    }
  );

  const shellClassName = embedded
    ? 'grid gap-4'
    : 'mx-auto grid w-full max-w-7xl gap-4 px-6 py-6';

  return (
    <section className={shellClassName}>
      <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
        <h2 className="text-base font-medium text-(--text-primary)">
          {t('resourceManager.code.header.title')}
        </h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          {t('resourceManager.code.header.description')}
        </p>
      </article>

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <CodeFileTree
          tree={tree}
          selectedId={selectedNodeId}
          onSelect={(nodeId) => {
            setSelectedNodeId(nodeId);
          }}
          onCreateFolder={handleCreateFolder}
          onCreateCodeFile={handleCreateCodeFile}
          canCreateFolder={canCreateDirectory}
          canCreateCodeFile={canCreateCodeDocument}
          onRename={
            canRenameCodeDocument || canRenameDirectory
              ? handleRenameCodeFile
              : undefined
          }
          onDelete={
            canDeleteCodeDocument || canDeleteDirectory
              ? handleDeleteCodeFile
              : undefined
          }
        />

        <article className="grid gap-3 rounded-xl border border-black/10 bg-(--bg-canvas) p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] tracking-[0.08em] text-(--text-muted) uppercase">
                {t('resourceManager.code.labels.selected')}
              </p>
              <h3 className="text-sm font-medium text-(--text-primary)">
                {selectedNode.type === 'file'
                  ? selectedNode.name
                  : t('resourceManager.code.labels.folder')}
              </h3>
              <p className="text-xs text-(--text-secondary)">
                {selectedNode.path}
              </p>
            </div>
            <div className="text-xs text-(--text-secondary)">
              {t('resourceManager.code.labels.files')}:{' '}
              <strong>{allFiles.length}</strong>
            </div>
          </div>

          {selectedFile ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-(--text-secondary)">
                  {t('resourceManager.code.labels.mime')}: {selectedFile.mime} |{' '}
                  {t('resourceManager.code.labels.size')}: {selectedFileSize}{' '}
                  {t('resourceManager.code.labels.bytes')}
                </p>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg border border-black/12 bg-black px-2.5 py-1.5 text-xs text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handleSave}
                  disabled={!isDirty || !canPatchSelectedFile || isSaving}
                >
                  <Save size={12} />
                  {t('resourceManager.code.actions.save')}
                </button>
              </div>
              {saveError ? (
                <p role="alert" className="text-xs text-red-600">
                  {saveError}
                </p>
              ) : null}
              <CodeMirror
                data-editor-native-history="true"
                value={editorValue}
                onChange={(value) => {
                  setEditorValue(value);
                  if (saveError) setSaveError('');
                }}
                extensions={[
                  resolveLanguageExtensionByName(selectedFile.name),
                  codeMirrorTypographyTheme,
                ]}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: true,
                }}
                className="rounded-lg border border-black/10 bg-black/[0.02] text-[12px] [&_.cm-editor]:min-h-[460px]"
              />
            </>
          ) : (
            <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4 text-sm text-(--text-secondary)">
              {t('resourceManager.code.empty')}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
