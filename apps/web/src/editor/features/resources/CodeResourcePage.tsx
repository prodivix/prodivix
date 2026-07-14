import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import type { EditorView } from '@codemirror/view';
import { useNavigate, useParams } from 'react-router';
import { Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  CodeLanguageDefinitionResult,
  CodeLanguageLocation,
} from '@prodivix/authoring';
import { queryCodeSlotSemanticRelations } from '@prodivix/authoring';
import type { DiagnosticTargetRef } from '@prodivix/diagnostics';
import { CodeFileTree } from './CodeFileTree';
import {
  glslCodeMirrorLanguage,
  wgslCodeMirrorLanguage,
} from './shaderCodeMirrorLanguage';
import { useAuthStore } from '@/auth/useAuthStore';
import {
  useEditorShortcut,
  useWorkspaceHistoryShortcuts,
} from '@/editor/shortcuts';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { isLocalProjectId } from '@/editor/localProjectStore';
import { codeMirrorTypographyTheme } from '@/editor/codeMirrorTypography';
import { executeWorkspaceDocumentMutation } from '@/editor/workspaceSync/workspaceDocumentMutationExecutor';
import { executeWorkspaceVfsOutboxIntent } from '@/editor/workspaceSync/workspaceVfsOutboxExecutor';
import {
  navigateToWorkspaceSemanticTarget,
  navigateToWorkspaceCodeSlotOwner,
  resolveWorkspaceSemanticIndex,
  resolveSourceSpanOffsets,
  useWorkspaceSemanticNavigationStore,
} from '@/editor/navigation';
import {
  EMPTY_CODE_LANGUAGE_LOCATION_QUERY,
  createWorkspaceCodeLanguageEnvironment,
  createCodeLanguageCodeMirrorExtensions,
  createCodeLanguagePositionAtOffset,
  createLoadingCodeLanguageLocationQuery,
  projectCodeLanguageLocationQuery,
  requestCodeLanguageDefinition,
  useWorkspaceCodeLanguageSession,
  type CodeLanguageLocationQueryKind,
  type CodeLanguageLocationQueryView,
} from '@/editor/codeLanguage';
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
  type WorkspaceVfsIntentRequest,
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
    lower.endsWith('.json')
  ) {
    return javascript({ typescript: true, jsx: true });
  }
  if (lower.endsWith('.wgsl')) return wgslCodeMirrorLanguage;
  if (lower.endsWith('.glsl')) return glslCodeMirrorLanguage;
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

const describeCodeSlotOwner = (owner: DiagnosticTargetRef): string => {
  switch (owner.kind) {
    case 'pir-node':
      return `Blueprint ${owner.documentId}/${owner.nodeId}`;
    case 'nodegraph-node':
      return `NodeGraph ${owner.documentId}/${owner.nodeId}`;
    case 'animation-timeline':
      return `Animation ${owner.documentId}/${owner.timelineId}`;
    case 'route':
      return `Route ${owner.routeId}`;
    default:
      return owner.kind;
  }
};

export function CodeResourcePage({
  embedded = false,
  requestedCreateFolder,
  onCreateRequestConsumed,
}: CodeResourcePageProps) {
  const { t } = useTranslation('editor');
  const navigate = useNavigate();
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
  const dispatchWorkspaceCommand = useEditorStore(
    (state) => state.dispatchWorkspaceCommand
  );
  const setActiveDocumentId = useEditorStore(
    (state) => state.setActiveDocumentId
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
  const [codeEditorView, setCodeEditorView] = useState<EditorView | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [locationQuery, setLocationQuery] =
    useState<CodeLanguageLocationQueryView>(EMPTY_CODE_LANGUAGE_LOCATION_QUERY);
  const locationQueryRequestIdRef = useRef(0);
  const editorBaselineRef = useRef<
    { documentId: string; source: string } | undefined
  >(undefined);
  const lastActivatedCodeDocumentIdRef = useRef<string | undefined>(undefined);
  const semanticNavigationRequest = useWorkspaceSemanticNavigationStore(
    (state) => state.navigationRequest
  );
  const consumeSemanticNavigation = useWorkspaceSemanticNavigationStore(
    (state) => state.consumeNavigation
  );

  const selectedNode = useMemo(
    () => findCodeResourceNodeById(tree, selectedNodeId) ?? tree,
    [selectedNodeId, tree]
  );
  const allFiles = useMemo(() => flattenCodeResourceFiles(tree), [tree]);
  const selectedFile = selectedNode.type === 'file' ? selectedNode : undefined;
  const selectedFileSize =
    selectedFile?.size ?? selectedFile?.textContent?.length ?? 0;
  const codeLanguageSource = useMemo(
    () => editorValue.replaceAll(/\r\n?/g, '\n'),
    [editorValue]
  );
  const codeLanguageSession = useWorkspaceCodeLanguageSession({
    workspace: workspace ?? null,
    artifactId: selectedFile?.id,
    source: codeLanguageSource,
  });
  const codeSlotUsages = useMemo(() => {
    if (!workspace || !selectedFile) return [];
    const environment = createWorkspaceCodeLanguageEnvironment(workspace);
    if (!environment.codeSlotRegistry || !environment.semanticIndex) return [];
    return environment.codeSlotRegistry
      .listBindingProjectionsByArtifact(selectedFile.id)
      .map((projection) => {
        const relations = queryCodeSlotSemanticRelations({
          registry: environment.codeSlotRegistry!,
          semanticIndex: environment.semanticIndex!,
          slotId: projection.binding.slotId,
        });
        const slot = environment.codeSlotRegistry!.getSlot(
          projection.binding.slotId
        );
        return slot
          ? {
              slot,
              projection,
              referenceCount:
                relations.status === 'resolved'
                  ? relations.references.length
                  : 0,
              impactCount:
                relations.status === 'resolved'
                  ? relations.impact.impactedSymbolIds.length
                  : 0,
            }
          : null;
      })
      .filter((usage): usage is NonNullable<typeof usage> => Boolean(usage));
  }, [selectedFile, workspace]);
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

  useEffect(() => {
    locationQueryRequestIdRef.current += 1;
    setLocationQuery(EMPTY_CODE_LANGUAGE_LOCATION_QUERY);
  }, [codeLanguageSource, selectedFile?.id]);

  const openCodeLanguageLocation = useCallback(
    (location: CodeLanguageLocation, view?: EditorView | null) => {
      if (
        view &&
        selectedFile?.id === location.sourceSpan.artifactId &&
        view.state.doc.toString() === codeLanguageSource
      ) {
        const range = resolveSourceSpanOffsets(
          codeLanguageSource,
          location.sourceSpan
        );
        if (range) {
          view.dispatch({
            selection: { anchor: range.from, head: range.to },
            scrollIntoView: true,
          });
          view.focus();
          return;
        }
      }
      if (!projectId) return;
      navigateToWorkspaceSemanticTarget({
        projectId,
        navigate,
        target: { kind: 'source-span', sourceSpan: location.sourceSpan },
        resolveSemanticIndex: resolveWorkspaceSemanticIndex,
      });
    },
    [codeLanguageSource, navigate, projectId, selectedFile?.id]
  );

  const handleDefinitionResult = useCallback(
    (result: CodeLanguageDefinitionResult | null) => {
      setLocationQuery(
        projectCodeLanguageLocationQuery({ kind: 'definition', result })
      );
    },
    []
  );

  const codeLanguageExtensions = useMemo(
    () =>
      codeLanguageSession.status === 'ready'
        ? createCodeLanguageCodeMirrorExtensions({
            session: codeLanguageSession.session,
            artifactId: codeLanguageSession.artifact.id,
            source: codeLanguageSession.source,
            onOpenLocation: (location, view) =>
              openCodeLanguageLocation(location, view),
            onDefinitionResult: handleDefinitionResult,
          })
        : Object.freeze([]),
    [codeLanguageSession, handleDefinitionResult, openCodeLanguageLocation]
  );

  const runCodeLanguageLocationQuery = useCallback(
    async (kind: CodeLanguageLocationQueryKind) => {
      if (codeLanguageSession.status !== 'ready' || !codeEditorView) return;
      if (codeEditorView.state.doc.toString() !== codeLanguageSession.source) {
        setLocationQuery({
          status: 'unavailable',
          kind,
          locations: Object.freeze([]),
        });
        return;
      }
      const requestId = locationQueryRequestIdRef.current + 1;
      locationQueryRequestIdRef.current = requestId;
      setLocationQuery(createLoadingCodeLanguageLocationQuery(kind));
      const offset = codeEditorView.state.selection.main.head;
      const result =
        kind === 'definition'
          ? await requestCodeLanguageDefinition({
              session: codeLanguageSession.session,
              artifactId: codeLanguageSession.artifact.id,
              source: codeLanguageSession.source,
              offset,
            })
          : await (async () => {
              const position = createCodeLanguagePositionAtOffset({
                artifactId: codeLanguageSession.artifact.id,
                source: codeLanguageSession.source,
                offset,
              });
              return position
                ? codeLanguageSession.session.getReferences({
                    expectedSnapshotIdentity:
                      codeLanguageSession.session.snapshotIdentity,
                    position,
                    includeDeclaration: true,
                  })
                : null;
            })();
      if (locationQueryRequestIdRef.current !== requestId) return;
      const projected = projectCodeLanguageLocationQuery({ kind, result });
      setLocationQuery(projected);
      if (kind === 'definition' && projected.locations[0]) {
        openCodeLanguageLocation(projected.locations[0], codeEditorView);
      }
    },
    [codeEditorView, codeLanguageSession, openCodeLanguageLocation]
  );

  const codeLanguageStatusText = useMemo(() => {
    if (codeLanguageSession.status === 'ready') {
      return t('resourceManager.code.language.status.ready');
    }
    if (codeLanguageSession.status === 'loading') {
      return t('resourceManager.code.language.status.loading');
    }
    if (codeLanguageSession.status === 'unsupported') {
      return t('resourceManager.code.language.status.unsupported');
    }
    if (codeLanguageSession.status === 'unavailable') {
      return t('resourceManager.code.language.status.unavailable', {
        reason: codeLanguageSession.reason,
      });
    }
    return '';
  }, [codeLanguageSession, t]);

  const locationQueryStatusText = useMemo(() => {
    if (locationQuery.status === 'loading') {
      return t(
        locationQuery.kind === 'definition'
          ? 'resourceManager.code.language.query.resolvingDefinition'
          : 'resourceManager.code.language.query.findingReferences'
      );
    }
    if (locationQuery.status === 'resolved') {
      return t(
        locationQuery.kind === 'definition'
          ? 'resourceManager.code.language.query.definitionCount'
          : 'resourceManager.code.language.query.referenceCount',
        { count: locationQuery.locations.length }
      );
    }
    if (locationQuery.status === 'missing') {
      return t(
        locationQuery.kind === 'definition'
          ? 'resourceManager.code.language.query.definitionMissing'
          : 'resourceManager.code.language.query.referencesMissing'
      );
    }
    if (locationQuery.status === 'unavailable') {
      return t('resourceManager.code.language.query.unavailable');
    }
    return '';
  }, [locationQuery, t]);

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

  const executeVfsIntent = async (
    request: WorkspaceVfsIntentRequest
  ): Promise<boolean> => {
    if (!token || !workspace) return false;
    const outcome = await executeWorkspaceVfsOutboxIntent({
      token,
      workspace,
      request,
    });
    if (outcome.status === 'rejected') throw new Error(outcome.message);
    return outcome.status === 'applied';
  };

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

  useEffect(() => {
    const activeDocumentId = workspace?.activeDocumentId;
    if (
      !activeDocumentId ||
      workspaceDocumentsById[activeDocumentId]?.type !== 'code'
    ) {
      lastActivatedCodeDocumentIdRef.current = undefined;
      return;
    }
    const activeFile = findCodeResourceNodeById(tree, activeDocumentId);
    if (activeFile?.type !== 'file') return;
    if (lastActivatedCodeDocumentIdRef.current === activeDocumentId) return;
    lastActivatedCodeDocumentIdRef.current = activeDocumentId;
    if (selectedNodeId === activeDocumentId) return;
    setSelectedNodeId(activeDocumentId);
  }, [
    selectedNodeId,
    tree,
    workspace?.activeDocumentId,
    workspaceDocumentsById,
  ]);

  useEffect(() => {
    const location = semanticNavigationRequest?.location;
    if (
      !semanticNavigationRequest ||
      semanticNavigationRequest.workspaceId !== workspaceId ||
      semanticNavigationRequest.projectId !== projectId ||
      location?.kind !== 'source-span'
    ) {
      return;
    }
    const targetFile = findCodeResourceNodeById(
      tree,
      location.sourceSpan.artifactId
    );
    if (targetFile?.type !== 'file') return;
    if (selectedNodeId !== targetFile.id) {
      setSelectedNodeId(targetFile.id);
      if (workspace?.activeDocumentId !== targetFile.id) {
        setActiveDocumentId(targetFile.id);
      }
      return;
    }
    if (selectedFile?.id !== targetFile.id || !codeEditorView) return;
    const viewSource = codeEditorView.state.doc.toString();
    const normalizedEditorSource = editorValue.replaceAll(/\r\n?/g, '\n');
    const normalizedCanonicalSource = (
      selectedFile.textContent ?? ''
    ).replaceAll(/\r\n?/g, '\n');
    if (
      viewSource !== normalizedEditorSource ||
      normalizedEditorSource !== normalizedCanonicalSource
    ) {
      return;
    }
    const range = resolveSourceSpanOffsets(viewSource, location.sourceSpan);
    if (!range) return;
    codeEditorView.dispatch({
      selection: { anchor: range.from, head: range.to },
      scrollIntoView: true,
    });
    codeEditorView.focus();
    consumeSemanticNavigation(semanticNavigationRequest.id);
  }, [
    codeEditorView,
    consumeSemanticNavigation,
    editorValue,
    projectId,
    selectedNodeId,
    selectedFile?.id,
    selectedFile?.textContent,
    semanticNavigationRequest,
    setActiveDocumentId,
    tree,
    workspace?.activeDocumentId,
    workspaceId,
  ]);

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
    const applied = await executeVfsIntent(
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
    if (!applied) return;
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
    const applied = await executeVfsIntent(
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
    if (!applied) return;
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
      const applied = await executeVfsIntent(
        renameWorkspaceDirectoryIntentRequest({
          workspaceRev,
          intentId: createIntentId(),
          issuedAt: new Date().toISOString(),
          nodeId: node.id,
          name: nextName,
        })
      );
      if (!applied) return;
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
    const applied = await executeVfsIntent(
      renameWorkspaceCodeDocumentIntentRequest({
        workspaceRev,
        intentId: createIntentId(),
        issuedAt: new Date().toISOString(),
        documentId: document.id,
        path: nextPath,
      })
    );
    if (!applied) return;
    setSelectedNodeId(document.id);
  };

  const handleDeleteCodeFile = async (nodeId: string) => {
    if (!token || !workspace || !workspaceId || !workspaceRev) return;
    const node = findCodeResourceNodeById(tree, nodeId);
    if (node?.type === 'folder') {
      if (!canDeleteDirectory || node.id === tree.id) return;
      const applied = await executeVfsIntent(
        deleteWorkspaceDirectoryIntentRequest({
          workspaceRev,
          intentId: createIntentId(),
          issuedAt: new Date().toISOString(),
          nodeId: node.id,
        })
      );
      if (!applied) return;
      setSelectedNodeId(node.parentId ?? tree.id);
      return;
    }
    if (!canDeleteCodeDocument) return;
    const document = workspaceDocumentsById[nodeId];
    if (!document || document.type !== 'code') return;
    const applied = await executeVfsIntent(
      deleteWorkspaceCodeDocumentIntentRequest({
        workspaceRev,
        intentId: createIntentId(),
        issuedAt: new Date().toISOString(),
        documentId: document.id,
      })
    );
    if (!applied) return;
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
      if (execution.kind === 'queued') {
        if (execution.rebased) {
          const adoption = adoptRebasedWorkspaceOperation({
            requestSnapshot: workspace,
            serverBaseSnapshot: execution.serverBaseSnapshot,
            rebasedSnapshot: execution.optimisticSnapshot,
            operation: execution.operation,
            expectedDocumentEditSeqById: {
              [document.id]: requestDocumentEditSeq,
            },
          });
          if (adoption.status !== 'adopted') {
            throw new Error(
              adoption.status === 'rejected'
                ? adoption.message
                : 'The queued code save conflicts with newer edits.'
            );
          }
        } else if (!dispatchWorkspaceCommand(command)?.ok) {
          throw new Error('Could not apply the queued code save locally.');
        }
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
            if (findCodeResourceNodeById(tree, nodeId)?.type === 'file') {
              setActiveDocumentId(nodeId);
            }
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-(--text-secondary)">
                  {t('resourceManager.code.labels.mime')}: {selectedFile.mime} |{' '}
                  {t('resourceManager.code.labels.size')}: {selectedFileSize}{' '}
                  {t('resourceManager.code.labels.bytes')}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-black/12 px-2.5 py-1.5 text-xs text-(--text-primary) hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() =>
                      void runCodeLanguageLocationQuery('definition')
                    }
                    disabled={codeLanguageSession.status !== 'ready'}
                    title={t(
                      'resourceManager.code.language.actions.definitionShortcut'
                    )}
                  >
                    {t('resourceManager.code.language.actions.goToDefinition')}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-black/12 px-2.5 py-1.5 text-xs text-(--text-primary) hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() =>
                      void runCodeLanguageLocationQuery('references')
                    }
                    disabled={codeLanguageSession.status !== 'ready'}
                  >
                    {t('resourceManager.code.language.actions.findReferences')}
                  </button>
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
              </div>
              {codeLanguageStatusText ? (
                <p className="text-xs text-(--text-muted)" role="status">
                  {codeLanguageStatusText}
                </p>
              ) : null}
              {saveError ? (
                <p role="alert" className="text-xs text-red-600">
                  {saveError}
                </p>
              ) : null}
              {codeSlotUsages.length ? (
                <div className="grid gap-2 rounded-lg border border-black/10 bg-black/[0.02] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="m-0 text-xs font-medium text-(--text-primary)">
                      CodeSlot usages
                    </p>
                    <span className="text-[10px] text-(--text-muted)">
                      {codeSlotUsages.length} bound
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {codeSlotUsages.map((usage) => (
                      <button
                        key={usage.projection.binding.slotId}
                        type="button"
                        className="rounded-md border border-black/10 bg-(--bg-canvas) px-2 py-1.5 text-left text-[10px] text-(--text-secondary) hover:bg-black/5 hover:text-(--text-primary)"
                        onClick={() => {
                          if (!projectId || !workspace) return;
                          navigateToWorkspaceCodeSlotOwner({
                            projectId,
                            workspace,
                            slotId: usage.projection.binding.slotId,
                            navigate,
                          });
                        }}
                      >
                        <span className="block font-medium text-(--text-primary)">
                          {usage.slot.kind} ·{' '}
                          {describeCodeSlotOwner(usage.slot.ownerRef)}
                        </span>
                        <span>
                          {usage.referenceCount} references ·{' '}
                          {usage.impactCount} impacted symbols
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <CodeMirror
                data-editor-native-history="true"
                value={editorValue}
                onCreateEditor={setCodeEditorView}
                onChange={(value) => {
                  setEditorValue(value);
                  if (saveError) setSaveError('');
                }}
                extensions={[
                  resolveLanguageExtensionByName(selectedFile.name),
                  codeMirrorTypographyTheme,
                  ...codeLanguageExtensions,
                ]}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: true,
                  autocompletion: codeLanguageSession.status !== 'ready',
                }}
                className="rounded-lg border border-black/10 bg-black/[0.02] text-[12px] [&_.cm-editor]:min-h-[460px]"
              />
              {locationQuery.status !== 'idle' ? (
                <div className="grid gap-2 rounded-lg border border-black/10 bg-black/[0.02] p-3">
                  <p className="text-xs text-(--text-secondary)" role="status">
                    {locationQueryStatusText}
                  </p>
                  {locationQuery.locations.length ? (
                    <div className="flex flex-wrap gap-2">
                      {locationQuery.locations.map((location, index) => {
                        const span = location.sourceSpan;
                        const path =
                          workspaceDocumentsById[span.artifactId]?.path ??
                          span.artifactId;
                        return (
                          <button
                            key={`${span.artifactId}:${span.startLine}:${span.startColumn}:${index}`}
                            type="button"
                            className="rounded-md border border-black/10 bg-(--bg-canvas) px-2 py-1 text-left text-xs text-(--text-primary) hover:bg-black/5"
                            onClick={() =>
                              openCodeLanguageLocation(location, codeEditorView)
                            }
                          >
                            {path}:{span.startLine}:{span.startColumn}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
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
