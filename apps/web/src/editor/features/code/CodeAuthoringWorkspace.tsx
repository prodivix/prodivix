import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import type { EditorView } from '@codemirror/view';
import { useNavigate, useParams } from 'react-router';
import { Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  CodeArtifactBindingRefactorImpact,
  CodeLanguageDefinitionResult,
  CodeLanguageLocation,
  CodeLanguagePosition,
} from '@prodivix/authoring';
import {
  analyzeCodeLanguageRenameImpact,
  decodeShaderCompileProfile,
  hasCodeAuthoringCapability,
  queryCodeArtifactRefactorImpact,
  writeShaderCompileProfile,
  type CodeAuthoringRequest,
  type ShaderCompileProfile,
} from '@prodivix/authoring';
import type { DiagnosticTargetRef } from '@prodivix/diagnostics';
import { CodeFileTree } from './CodeFileTree';
import {
  CodeEditorContextMenu,
  CodeLanguageLocationsOverlay,
  CodeLanguageRenameOverlay,
  type CodeArtifactRelocationOverlayView,
  type CodeLanguageRenameOverlayView,
  type EditorSurfaceAnchor,
} from './CodeEditorActionOverlays';
import {
  glslCodeMirrorLanguage,
  wgslCodeMirrorLanguage,
} from './shaderCodeMirrorLanguage';
import {
  useEditorShortcut,
  useWorkspaceHistoryShortcuts,
} from '@/editor/shortcuts';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { codeMirrorTypographyTheme } from '@/editor/codeMirrorTypography';
import {
  dispatchWorkspaceAuthoringOperation,
  dispatchWorkspaceVfsAuthoringIntent,
} from '@/editor/workspaceSync/workspaceAuthoringOperationDispatcher';
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
import { useWorkspaceShaderCompile } from '@/editor/codeCompile';
import {
  getCodeAuthoringSelectionStorageKey,
  resolveDefaultCodeKindByParentPath,
  resolveTemplateByCodeKind,
  type CodeFileKind,
} from './codeAuthoringModel';
import { isWorkspaceCodeDocumentContent } from '@prodivix/workspace';
import {
  createWorkspaceCodeContentUpdateCommand,
  createWorkspaceCodeArtifactRelocationPlan,
  createWorkspaceCodeLanguageEditTransactionPlan,
  createWorkspaceExternalAdapterBindingTransactionPlan,
  createWorkspaceOrphanCodeArtifactToModuleCommand,
  createWorkspaceDirectoryIntentRequest,
  createWorkspaceCodeDocumentIntentRequest,
  deleteWorkspaceDirectoryIntentRequest,
  deleteWorkspaceCodeDocumentIntentRequest,
  projectWorkspaceCodeArtifactLifecycles,
  renameWorkspaceDirectoryIntentRequest,
  type WorkspaceCodeLanguageEditTransactionPlan,
  type WorkspaceCodeDocumentLanguage,
  type WorkspaceSnapshot,
  type WorkspaceVfsIntentRequest,
} from '@prodivix/workspace';
import {
  buildCodeResourceTreeFromWorkspaceVfs,
  findCodeResourceNodeById,
  flattenCodeResourceFiles,
  normalizeCodeResourcePath,
} from './workspaceCodeArtifacts';
import { useCodeAuthoringSession } from './useCodeAuthoringSession';

type CodeAuthoringWorkspaceProps = {
  request: CodeAuthoringRequest;
  requestedCreateFolder?: 'scripts' | 'styles' | 'shaders' | null;
  onCreateRequestConsumed?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
};

type CodeLanguageRenameState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'preparing' }>
  | Readonly<{
      status: 'editing';
      position: CodeLanguagePosition;
      currentName: string;
      nextName: string;
    }>
  | Readonly<{
      status: 'preview';
      position: CodeLanguagePosition;
      currentName: string;
      nextName: string;
      plan: WorkspaceCodeLanguageEditTransactionPlan;
      affectedBindings: readonly CodeArtifactBindingRefactorImpact[];
      editCount: number;
    }>;

type CodeArtifactRelocationState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{
      status: 'editing';
      artifactId: string;
      currentPath: string;
      nextPath: string;
    }>;

type LatestRequestGate = Readonly<{
  begin(): number;
  isCurrent(requestId: number): boolean;
  invalidate(): void;
}>;

const EMPTY_WORKSPACE_DOCUMENTS: WorkspaceSnapshot['docsById'] = {};
const EMPTY_WORKSPACE_TREE: WorkspaceSnapshot['treeById'] = {};
const EDITOR_CONTEXT_MENU_WIDTH = 230;
const EDITOR_RENAME_OVERLAY_WIDTH = 340;
const EDITOR_LOCATION_OVERLAY_WIDTH = 440;

const resolveEditorSurfaceAnchor = (input: {
  surface: HTMLElement;
  clientX: number;
  clientY: number;
  overlayWidth: number;
}): EditorSurfaceAnchor => {
  const rect = input.surface.getBoundingClientRect();
  const maxLeft = Math.max(8, rect.width - input.overlayWidth - 8);
  return Object.freeze({
    left: Math.max(8, Math.min(input.clientX - rect.left + 4, maxLeft)),
    top: Math.max(8, input.clientY - rect.top + 4),
  });
};

/** Orders asynchronous editor requests without coupling their lifecycle to render state. */
const createLatestRequestGate = (): LatestRequestGate => {
  let currentRequestId = 0;
  return Object.freeze({
    begin: () => {
      currentRequestId += 1;
      return currentRequestId;
    },
    isCurrent: (requestId) => currentRequestId === requestId,
    invalidate: () => {
      currentRequestId += 1;
    },
  });
};

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

export function CodeAuthoringWorkspace({
  request,
  requestedCreateFolder,
  onCreateRequestConsumed,
  onDirtyChange,
}: CodeAuthoringWorkspaceProps) {
  const presentation = request.presentation;
  const requestedDocumentId = request.artifactId;
  const { t } = useTranslation('editor');
  const navigate = useNavigate();
  const { projectId } = useParams();
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
  const setActiveDocumentId = useEditorStore(
    (state) => state.setActiveDocumentId
  );
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
  const [codeEditorView, setCodeEditorView] = useState<EditorView | null>(null);
  const [editorSurface, setEditorSurface] = useState<HTMLDivElement | null>(
    null
  );
  const [editorContextMenuAnchor, setEditorContextMenuAnchor] =
    useState<EditorSurfaceAnchor | null>(null);
  const [renameOverlayAnchor, setRenameOverlayAnchor] =
    useState<EditorSurfaceAnchor | null>(null);
  const [locationOverlayAnchor, setLocationOverlayAnchor] =
    useState<EditorSurfaceAnchor | null>(null);
  const [isMutating, setMutating] = useState(false);
  const [renameState, setRenameState] = useState<CodeLanguageRenameState>({
    status: 'idle',
  });
  const [relocationState, setRelocationState] =
    useState<CodeArtifactRelocationState>({ status: 'idle' });
  const [locationQuery, setLocationQuery] =
    useState<CodeLanguageLocationQueryView>(EMPTY_CODE_LANGUAGE_LOCATION_QUERY);
  const [locationQueryRequestGate] = useState(createLatestRequestGate);
  const [renameRequestGate] = useState(createLatestRequestGate);
  const requestedArtifactSelectionRef = useRef<string | undefined>(undefined);
  const requestSourceSpanFocusRef = useRef<string | undefined>(undefined);
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
  const canEditSource = hasCodeAuthoringCapability(request, 'edit-source');
  const canSaveSource = hasCodeAuthoringCapability(request, 'save-source');
  const canNavigateSemantics = hasCodeAuthoringCapability(
    request,
    'semantic-navigation'
  );
  const canRefactorSymbol = hasCodeAuthoringCapability(
    request,
    'refactor-symbol'
  );
  const canRelocateArtifact = hasCodeAuthoringCapability(
    request,
    'relocate-artifact'
  );
  const canConfigureCompile = hasCodeAuthoringCapability(
    request,
    'configure-compile'
  );
  const canManageArtifacts = hasCodeAuthoringCapability(
    request,
    'manage-artifacts'
  );
  const canInspectBindings = hasCodeAuthoringCapability(
    request,
    'inspect-bindings'
  );
  const authoringSession = useCodeAuthoringSession({
    request,
    workspace: workspace ?? null,
    artifactId: selectedFile?.id,
    readonly: workspaceReadonly,
  });
  const editorValue = authoringSession.source;
  const setEditorValue = authoringSession.setSource;
  const isSourceDirty = authoringSession.activeDirty;
  const isDirty = authoringSession.dirty;
  const isSaving = authoringSession.isSaving || isMutating;
  const saveError = authoringSession.error;
  const setSaveError = useCallback(
    (message: string) => {
      if (message) authoringSession.reportError(message);
      else authoringSession.clearError();
    },
    [authoringSession.clearError, authoringSession.reportError]
  );
  const selectedCodeDocument = selectedFile
    ? workspaceDocumentsById[selectedFile.id]
    : undefined;
  const selectedCodeLanguage =
    selectedCodeDocument?.type === 'code' &&
    isWorkspaceCodeDocumentContent(selectedCodeDocument.content)
      ? selectedCodeDocument.content.language
      : undefined;
  const isShaderFile =
    selectedCodeLanguage === 'glsl' || selectedCodeLanguage === 'wgsl';
  const selectedShaderProfileResult = useMemo(
    () =>
      selectedCodeDocument?.type === 'code' &&
      isWorkspaceCodeDocumentContent(selectedCodeDocument.content)
        ? decodeShaderCompileProfile(
            selectedCodeDocument.content.metadata,
            selectedCodeDocument.content.language
          )
        : ({ status: 'absent' } as const),
    [selectedCodeDocument]
  );
  const selectedShaderProfile =
    selectedShaderProfileResult.status === 'valid'
      ? selectedShaderProfileResult.profile
      : null;
  const codeLanguageSource = useMemo(
    () => editorValue.replaceAll(/\r\n?/g, '\n'),
    [editorValue]
  );
  const codeLanguageSession = useWorkspaceCodeLanguageSession({
    workspace: workspace ?? null,
    artifactId: selectedFile?.id,
    source: codeLanguageSource,
  });
  const shaderCompile = useWorkspaceShaderCompile({
    workspace: workspace ?? null,
    artifactId: canConfigureCompile ? selectedFile?.id : undefined,
  });
  const codeAuthoringEnvironment = useMemo(
    () =>
      workspace ? createWorkspaceCodeLanguageEnvironment(workspace) : null,
    [workspace]
  );
  const selectedRefactorImpact = useMemo(() => {
    if (!selectedFile || !codeAuthoringEnvironment) return null;
    const environment = codeAuthoringEnvironment;
    if (!environment.codeSlotRegistry || !environment.semanticIndex) {
      return null;
    }
    return queryCodeArtifactRefactorImpact({
      artifactId: selectedFile.id,
      registry: environment.codeSlotRegistry,
      semanticIndex: environment.semanticIndex,
    });
  }, [codeAuthoringEnvironment, selectedFile]);
  const codeSlotUsages = useMemo(
    () =>
      selectedRefactorImpact
        ? selectedRefactorImpact.bindings.flatMap((impact) =>
            impact.slot
              ? [
                  {
                    slot: impact.slot,
                    projection: impact.projection,
                    referenceCount: impact.references.length,
                    impactCount: impact.impactedSymbolIds.length,
                  },
                ]
              : []
          )
        : [],
    [selectedRefactorImpact]
  );
  const lifecycleProjection = useMemo(
    () =>
      workspace ? projectWorkspaceCodeArtifactLifecycles(workspace) : null,
    [workspace]
  );
  const selectedArtifactLifecycle = useMemo(() => {
    if (!selectedFile || lifecycleProjection?.status !== 'ready') return null;
    return (
      lifecycleProjection.records.find(
        ({ artifact }) => artifact.id === selectedFile.id
      )?.lifecycle ?? null
    );
  }, [lifecycleProjection, selectedFile]);
  const availableExternalAdapterSlots = useMemo(() => {
    const registry = codeAuthoringEnvironment?.codeSlotRegistry;
    if (!registry) return [];
    return registry
      .listProviders()
      .flatMap((provider) => {
        const source = provider.source;
        if (source.kind !== 'external-library') return [];
        return provider
          .listSlots({ surface: 'code-editor' })
          .filter(
            (slot) =>
              slot.kind === 'external-adapter' &&
              !registry.getBindingProjection(slot.id)
          )
          .map((slot) => ({
            libraryId: source.libraryId,
            slotId: slot.id,
          }));
      })
      .sort((left, right) => left.libraryId.localeCompare(right.libraryId));
  }, [codeAuthoringEnvironment]);
  const isCompact = presentation === 'compact';
  const isOverlay = presentation === 'compact' || presentation === 'maximized';
  useWorkspaceHistoryShortcuts({
    workspaceId,
    documentId: selectedFile?.id,
    domain: 'code',
    suspended: isDirty || isSaving,
    shortcutScope: isOverlay ? 'modal' : 'code',
  });

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(
    () => () => {
      onDirtyChange?.(false);
    },
    [onDirtyChange]
  );

  useEffect(() => {
    locationQueryRequestGate.invalidate();
    setLocationQuery(EMPTY_CODE_LANGUAGE_LOCATION_QUERY);
    setLocationOverlayAnchor(null);
    setEditorContextMenuAnchor(null);
  }, [codeLanguageSource, locationQueryRequestGate, selectedFile?.id]);

  useEffect(() => {
    renameRequestGate.invalidate();
    setRenameState({ status: 'idle' });
    setRenameOverlayAnchor(null);
  }, [
    codeLanguageSource,
    renameRequestGate,
    selectedFile?.id,
    workspace?.workspaceRev,
  ]);

  useEffect(() => {
    setRelocationState((current) =>
      current.status === 'editing' && current.artifactId === selectedFile?.id
        ? current
        : { status: 'idle' }
    );
  }, [selectedFile?.id]);

  useEffect(() => {
    setRelocationState({ status: 'idle' });
  }, [workspace?.workspaceRev]);

  const resolveOverlayAnchorAtCursor = useCallback(
    (view: EditorView, overlayWidth: number) => {
      const cursor = view.coordsAtPos(view.state.selection.main.head);
      if (!editorSurface) return null;
      if (!cursor) return Object.freeze({ left: 8, top: 8 });
      return resolveEditorSurfaceAnchor({
        surface: editorSurface,
        clientX: cursor.left,
        clientY: cursor.bottom,
        overlayWidth,
      });
    },
    [editorSurface]
  );

  const openCodeLanguageLocation = useCallback(
    (location: CodeLanguageLocation, view?: EditorView | null) => {
      if (!canNavigateSemantics) return;
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
      const targetFile = findCodeResourceNodeById(
        tree,
        location.sourceSpan.artifactId
      );
      if (workspace && targetFile?.type === 'file') {
        useWorkspaceSemanticNavigationStore
          .getState()
          .requestSurfaceNavigation({
            projectId,
            workspaceId: workspace.id,
            location: { kind: 'source-span', sourceSpan: location.sourceSpan },
          });
        setSelectedNodeId(targetFile.id);
        if (!isOverlay && workspace.activeDocumentId !== targetFile.id) {
          setActiveDocumentId(targetFile.id);
        }
        return;
      }
      navigateToWorkspaceSemanticTarget({
        projectId,
        navigate,
        target: { kind: 'source-span', sourceSpan: location.sourceSpan },
        resolveSemanticIndex: resolveWorkspaceSemanticIndex,
      });
    },
    [
      canNavigateSemantics,
      codeLanguageSource,
      navigate,
      projectId,
      selectedFile?.id,
      isOverlay,
      setActiveDocumentId,
      tree,
      workspace,
    ]
  );

  const handleDefinitionResult = useCallback(
    (result: CodeLanguageDefinitionResult | null, view: EditorView) => {
      const projected = projectCodeLanguageLocationQuery({
        kind: 'definition',
        result,
      });
      if (projected.status === 'resolved' && projected.locations[0]) {
        setLocationQuery(EMPTY_CODE_LANGUAGE_LOCATION_QUERY);
        setLocationOverlayAnchor(null);
        return;
      }
      setLocationOverlayAnchor(
        resolveOverlayAnchorAtCursor(view, EDITOR_LOCATION_OVERLAY_WIDTH)
      );
      setLocationQuery(projected);
    },
    [resolveOverlayAnchorAtCursor]
  );

  const beginCodeLanguageRename = useCallback(
    async (view: EditorView | null = codeEditorView) => {
      if (
        !canRefactorSymbol ||
        !view ||
        !workspace ||
        !codeAuthoringEnvironment?.codeSlotRegistry ||
        !codeAuthoringEnvironment.semanticIndex ||
        workspaceReadonly ||
        isSaving ||
        codeLanguageSession.status !== 'ready'
      ) {
        return;
      }
      if (
        isSourceDirty ||
        view.state.doc.toString() !== codeLanguageSession.source
      ) {
        setSaveError(t('resourceManager.code.refactor.saveBeforeRename'));
        return;
      }
      const position = createCodeLanguagePositionAtOffset({
        artifactId: codeLanguageSession.artifact.id,
        source: codeLanguageSession.source,
        offset: view.state.selection.main.head,
      });
      if (!position) return;
      const requestId = renameRequestGate.begin();
      setSaveError('');
      setEditorContextMenuAnchor(null);
      setLocationQuery(EMPTY_CODE_LANGUAGE_LOCATION_QUERY);
      setLocationOverlayAnchor(null);
      setRenameOverlayAnchor(
        resolveOverlayAnchorAtCursor(view, EDITOR_RENAME_OVERLAY_WIDTH)
      );
      setRenameState({ status: 'preparing' });
      const result = await codeLanguageSession.session.prepareRename({
        expectedSnapshotIdentity: codeLanguageSession.session.snapshotIdentity,
        position,
      });
      if (!renameRequestGate.isCurrent(requestId)) return;
      if (result.status !== 'resolved') {
        setRenameState({ status: 'idle' });
        setRenameOverlayAnchor(null);
        setSaveError(t('resourceManager.code.refactor.renameUnavailable'));
        return;
      }
      setRenameState({
        status: 'editing',
        position,
        currentName: result.value.placeholder,
        nextName: result.value.placeholder,
      });
    },
    [
      codeEditorView,
      codeAuthoringEnvironment,
      codeLanguageSession,
      canRefactorSymbol,
      isSaving,
      isSourceDirty,
      renameRequestGate,
      resolveOverlayAnchorAtCursor,
      t,
      workspace,
      workspaceReadonly,
    ]
  );

  const runCodeLanguageLocationQuery = useCallback(
    async (
      kind: CodeLanguageLocationQueryKind,
      view: EditorView | null = codeEditorView
    ) => {
      if (
        !canNavigateSemantics ||
        codeLanguageSession.status !== 'ready' ||
        !view
      ) {
        return;
      }
      setEditorContextMenuAnchor(null);
      setLocationOverlayAnchor(
        resolveOverlayAnchorAtCursor(view, EDITOR_LOCATION_OVERLAY_WIDTH)
      );
      if (view.state.doc.toString() !== codeLanguageSession.source) {
        setLocationQuery({
          status: 'unavailable',
          kind,
          locations: Object.freeze([]),
        });
        return;
      }
      const requestId = locationQueryRequestGate.begin();
      setLocationQuery(createLoadingCodeLanguageLocationQuery(kind));
      const offset = view.state.selection.main.head;
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
      if (!locationQueryRequestGate.isCurrent(requestId)) return;
      const projected = projectCodeLanguageLocationQuery({ kind, result });
      if (kind === 'definition' && projected.locations[0]) {
        setLocationQuery(EMPTY_CODE_LANGUAGE_LOCATION_QUERY);
        setLocationOverlayAnchor(null);
        openCodeLanguageLocation(projected.locations[0], view);
        return;
      }
      setLocationQuery(projected);
    },
    [
      canNavigateSemantics,
      codeEditorView,
      codeLanguageSession,
      locationQueryRequestGate,
      openCodeLanguageLocation,
      resolveOverlayAnchorAtCursor,
    ]
  );

  const codeLanguageExtensions = useMemo(
    () =>
      codeLanguageSession.status === 'ready'
        ? createCodeLanguageCodeMirrorExtensions({
            session: codeLanguageSession.session,
            artifactId: codeLanguageSession.artifact.id,
            source: codeLanguageSession.source,
            additionalDiagnostics:
              !isSourceDirty && shaderCompile.status === 'resolved'
                ? shaderCompile.output.diagnostics
                : Object.freeze([]),
            onOpenLocation: (location, view) =>
              openCodeLanguageLocation(location, view),
            onDefinitionResult: handleDefinitionResult,
            onReferencesRequest: (view) =>
              void runCodeLanguageLocationQuery('references', view),
            onRenameRequest: (view) => void beginCodeLanguageRename(view),
          })
        : Object.freeze([]),
    [
      codeLanguageSession,
      beginCodeLanguageRename,
      handleDefinitionResult,
      isSourceDirty,
      openCodeLanguageLocation,
      runCodeLanguageLocationQuery,
      shaderCompile,
    ]
  );

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
    canManageArtifacts &&
    Boolean(workspaceId && typeof workspaceRev === 'number') &&
    !workspaceReadonly &&
    (!workspaceCapabilitiesLoaded ||
      workspaceCapabilities['core.workspace.code-document.create@1.0'] ===
        true);
  const canCreateDirectory =
    canManageArtifacts &&
    Boolean(workspaceId && typeof workspaceRev === 'number') &&
    !workspaceReadonly &&
    (!workspaceCapabilitiesLoaded ||
      workspaceCapabilities['core.workspace.directory.create@1.0'] === true);
  const canRenameDirectory =
    canManageArtifacts &&
    Boolean(workspaceId && typeof workspaceRev === 'number') &&
    !workspaceReadonly &&
    (!workspaceCapabilitiesLoaded ||
      workspaceCapabilities['core.workspace.directory.rename@1.0'] === true);
  const canDeleteDirectory =
    canManageArtifacts &&
    Boolean(workspaceId && typeof workspaceRev === 'number') &&
    !workspaceReadonly &&
    (!workspaceCapabilitiesLoaded ||
      workspaceCapabilities['core.workspace.directory.delete@1.0'] === true);
  const canRenameCodeDocument =
    canManageArtifacts &&
    Boolean(workspaceId && typeof workspaceRev === 'number') &&
    !workspaceReadonly &&
    (!workspaceCapabilitiesLoaded ||
      workspaceCapabilities['core.workspace.code-document.rename@1.0'] ===
        true);
  const canDeleteCodeDocument =
    canManageArtifacts &&
    Boolean(workspaceId && typeof workspaceRev === 'number') &&
    !workspaceReadonly &&
    (!workspaceCapabilitiesLoaded ||
      workspaceCapabilities['core.workspace.code-document.delete@1.0'] ===
        true);
  const canPatchSelectedFile = Boolean(
    canEditSource &&
    canSaveSource &&
    workspace &&
    workspaceId &&
    selectedFile &&
    !workspaceReadonly
  );

  const executeVfsIntent = async (
    request: WorkspaceVfsIntentRequest
  ): Promise<boolean> => {
    if (!workspace || workspaceReadonly) return false;
    const outcome = await dispatchWorkspaceVfsAuthoringIntent({
      workspace,
      readonly: workspaceReadonly,
      request,
    });
    if (outcome.status === 'rejected') throw new Error(outcome.message);
    return outcome.status === 'applied';
  };

  useEffect(() => {
    if (!requestedDocumentId) return;
    const selectionKey = `${request.requestId}:${requestedDocumentId}`;
    if (requestedArtifactSelectionRef.current === selectionKey) return;
    const requestedFile = findCodeResourceNodeById(tree, requestedDocumentId);
    if (requestedFile?.type !== 'file') return;
    requestedArtifactSelectionRef.current = selectionKey;
    if (selectedNodeId !== requestedFile.id) {
      setSelectedNodeId(requestedFile.id);
    }
  }, [request.requestId, requestedDocumentId, selectedNodeId, tree]);

  useEffect(() => {
    requestSourceSpanFocusRef.current = undefined;
  }, [request.requestId]);

  useEffect(() => {
    const sourceSpan = request.sourceSpan;
    if (!sourceSpan) return;
    const focusKey = `${request.requestId}:${sourceSpan.artifactId}:${sourceSpan.startLine}:${sourceSpan.startColumn}:${sourceSpan.endLine}:${sourceSpan.endColumn}`;
    if (requestSourceSpanFocusRef.current === focusKey) return;
    const targetFile = findCodeResourceNodeById(tree, sourceSpan.artifactId);
    if (targetFile?.type !== 'file') return;
    if (selectedNodeId !== targetFile.id) {
      setSelectedNodeId(targetFile.id);
      if (!isOverlay && workspace?.activeDocumentId !== targetFile.id) {
        setActiveDocumentId(targetFile.id);
      }
      return;
    }
    if (!codeEditorView || selectedFile?.id !== targetFile.id) return;
    const viewSource = codeEditorView.state.doc.toString();
    if (viewSource !== editorValue) return;
    const range = resolveSourceSpanOffsets(viewSource, sourceSpan);
    if (!range) return;
    codeEditorView.dispatch({
      selection: { anchor: range.from, head: range.to },
      scrollIntoView: true,
    });
    codeEditorView.focus();
    requestSourceSpanFocusRef.current = focusKey;
  }, [
    codeEditorView,
    editorValue,
    isOverlay,
    request.requestId,
    request.sourceSpan,
    selectedFile?.id,
    selectedNodeId,
    setActiveDocumentId,
    tree,
    workspace?.activeDocumentId,
  ]);

  useEffect(() => {
    if (isOverlay || typeof window === 'undefined') return;
    const storedSelection =
      typeof window === 'undefined'
        ? null
        : window.localStorage.getItem(
            getCodeAuthoringSelectionStorageKey(projectId)
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
      getCodeAuthoringSelectionStorageKey(projectId),
      selectedNodeId
    );
  }, [isOverlay, projectId, selectedNodeId, tree]);

  useEffect(() => {
    if (requestedDocumentId) return;
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
    requestedDocumentId,
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
      if (!isOverlay && workspace?.activeDocumentId !== targetFile.id) {
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
    isOverlay,
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
    if (!workspace || !workspaceId || !workspaceRev) return;
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
          ...(template.metadata ? { metadata: template.metadata } : {}),
        },
      })
    );
    if (!applied) return;
    setSelectedNodeId(documentId);
  };

  const handleCreateFolder = async (parentId: string) => {
    if (!workspace || !workspaceId || !workspaceRev) return;
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

  const applyCodeArtifactRelocation = async (
    artifactId: string,
    path: string
  ): Promise<boolean> => {
    if (!workspace || workspaceReadonly || isSaving) return false;
    const result = createWorkspaceCodeArtifactRelocationPlan({
      workspace,
      artifactId,
      path,
      operationId: createIntentId(),
      issuedAt: new Date().toISOString(),
    });
    if (result.status === 'rejected') {
      setSaveError(
        result.issues[0]?.message ||
          t('resourceManager.code.refactor.moveRejected')
      );
      return false;
    }
    if (result.status === 'unchanged') return true;
    setSaveError('');
    setMutating(true);
    try {
      const outcome = await dispatchWorkspaceAuthoringOperation({
        workspace,
        readonly: workspaceReadonly,
        operation: result.plan.operation,
      });
      if (outcome.status === 'rejected') {
        setSaveError(outcome.message);
        return false;
      }
      return true;
    } finally {
      setMutating(false);
    }
  };

  const handleRenameCodeFile = async (nodeId: string, nextName: string) => {
    if (!workspace || !workspaceId || !workspaceRev) return;
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
    const applied = await applyCodeArtifactRelocation(document.id, nextPath);
    if (!applied) return;
    setSelectedNodeId(document.id);
  };

  const previewCodeLanguageRename = async () => {
    if (
      renameState.status !== 'editing' ||
      codeLanguageSession.status !== 'ready' ||
      !workspace ||
      !codeAuthoringEnvironment?.codeSlotRegistry ||
      !codeAuthoringEnvironment.semanticIndex ||
      isSourceDirty ||
      isSaving
    ) {
      return;
    }
    const nextName = renameState.nextName.trim();
    if (!nextName || nextName === renameState.currentName) return;
    const requestId = renameRequestGate.begin();
    setSaveError('');
    setMutating(true);
    try {
      const proposal = await codeLanguageSession.session.getRenameEdits({
        expectedSnapshotIdentity: codeLanguageSession.session.snapshotIdentity,
        position: renameState.position,
        newName: nextName,
      });
      if (!renameRequestGate.isCurrent(requestId)) return;
      if (proposal.status !== 'resolved') {
        setSaveError(t('resourceManager.code.refactor.renameUnavailable'));
        return;
      }
      const plan = createWorkspaceCodeLanguageEditTransactionPlan({
        workspace,
        transactionId: createIntentId(),
        issuedAt: new Date().toISOString(),
        edits: proposal.value.edits,
        label: `Rename ${renameState.currentName} to ${nextName}`,
      });
      if (plan.status === 'rejected') {
        setSaveError(
          plan.issues[0]?.message ||
            t('resourceManager.code.refactor.renameRejected')
        );
        return;
      }
      const impact = analyzeCodeLanguageRenameImpact({
        currentName: renameState.currentName,
        proposal: proposal.value,
        registry: codeAuthoringEnvironment.codeSlotRegistry,
        semanticIndex: codeAuthoringEnvironment.semanticIndex,
      });
      if (impact.status === 'stale') {
        setSaveError(t('resourceManager.code.refactor.renameStale'));
        return;
      }
      setRenameState({
        status: 'preview',
        position: renameState.position,
        currentName: renameState.currentName,
        nextName,
        plan: plan.plan,
        affectedBindings: impact.affectedBindings,
        editCount: impact.editCount,
      });
    } finally {
      setMutating(false);
    }
  };

  const applyCodeLanguageRename = async () => {
    if (
      renameState.status !== 'preview' ||
      renameState.affectedBindings.length > 0 ||
      !workspace ||
      workspaceReadonly ||
      isSaving
    ) {
      return;
    }
    setSaveError('');
    setMutating(true);
    try {
      const outcome = await dispatchWorkspaceAuthoringOperation({
        workspace,
        readonly: workspaceReadonly,
        operation: {
          kind: 'transaction',
          transaction: renameState.plan.transaction,
        },
      });
      if (outcome.status === 'rejected') {
        setSaveError(outcome.message);
        return;
      }
      const nextSelectedSource = selectedFile
        ? renameState.plan.nextSources[selectedFile.id]
        : undefined;
      if (selectedFile && nextSelectedSource !== undefined) {
        setEditorValue(nextSelectedSource);
      }
      setRenameState({ status: 'idle' });
      setRenameOverlayAnchor(null);
    } finally {
      setMutating(false);
    }
  };

  const startCodeArtifactRelocation = (artifactId: string) => {
    const document = workspaceDocumentsById[artifactId];
    if (
      !document ||
      document.type !== 'code' ||
      workspaceReadonly ||
      isSourceDirty ||
      isSaving
    ) {
      return;
    }
    setSaveError('');
    setRelocationState({
      status: 'editing',
      artifactId: document.id,
      currentPath: document.path,
      nextPath: document.path,
    });
  };

  const applySelectedCodeArtifactRelocation = async () => {
    if (relocationState.status !== 'editing') return;
    const applied = await applyCodeArtifactRelocation(
      relocationState.artifactId,
      relocationState.nextPath
    );
    if (applied) setRelocationState({ status: 'idle' });
  };

  const handleDeleteCodeFile = async (nodeId: string) => {
    if (!workspace || !workspaceId || !workspaceRev) return;
    const node = findCodeResourceNodeById(tree, nodeId);
    if (node?.type === 'folder') {
      if (!canDeleteDirectory || node.id === tree.id) return;
      if (
        lifecycleProjection?.status === 'ready' &&
        flattenCodeResourceFiles(node).some((file) =>
          lifecycleProjection.records.some(
            ({ artifact, lifecycle }) =>
              artifact.id === file.id && lifecycle.status === 'active'
          )
        )
      ) {
        setSaveError(t('resourceManager.code.lifecycle.deleteActiveBlocked'));
        return;
      }
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
    const lifecycle =
      lifecycleProjection?.status === 'ready'
        ? lifecycleProjection.records.find(
            ({ artifact }) => artifact.id === document.id
          )?.lifecycle
        : undefined;
    if (lifecycle?.status === 'active') {
      setSaveError(t('resourceManager.code.lifecycle.deleteActiveBlocked'));
      return;
    }
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

  const handleRebindExternalAdapter = async (libraryId: string) => {
    if (!workspace || !selectedFile || workspaceReadonly || isSaving) return;
    const transactionId = createIntentId();
    const plan = createWorkspaceExternalAdapterBindingTransactionPlan({
      workspace,
      libraryId,
      reference: { artifactId: selectedFile.id, exportName: 'default' },
      transactionId,
      issuedAt: new Date().toISOString(),
    });
    if (plan.status === 'rejected') {
      setSaveError(
        plan.issues[0]?.message ||
          t('resourceManager.code.lifecycle.rebindFailed')
      );
      return;
    }
    if (plan.status === 'unchanged') return;
    setMutating(true);
    try {
      const outcome = await dispatchWorkspaceAuthoringOperation({
        workspace,
        readonly: workspaceReadonly,
        operation: { kind: 'transaction', transaction: plan.transaction },
      });
      if (outcome.status === 'rejected') setSaveError(outcome.message);
    } finally {
      setMutating(false);
    }
  };

  const handleConvertOrphanToModule = async () => {
    if (!workspace || !selectedFile || workspaceReadonly || isSaving) return;
    const plan = createWorkspaceOrphanCodeArtifactToModuleCommand({
      workspace,
      artifactId: selectedFile.id,
      commandId: createIntentId(),
      issuedAt: new Date().toISOString(),
    });
    if (plan.status === 'rejected') {
      setSaveError(plan.message);
      return;
    }
    if (plan.status === 'unchanged') return;
    setMutating(true);
    try {
      const outcome = await dispatchWorkspaceAuthoringOperation({
        workspace,
        readonly: workspaceReadonly,
        operation: { kind: 'command', command: plan.command },
      });
      if (outcome.status === 'rejected') setSaveError(outcome.message);
    } finally {
      setMutating(false);
    }
  };

  const handleShaderCompileProfileChange = async (
    profile: ShaderCompileProfile
  ) => {
    if (
      isSaving ||
      isSourceDirty ||
      !workspace ||
      !workspaceId ||
      !selectedCodeDocument ||
      selectedCodeDocument.type !== 'code' ||
      !isWorkspaceCodeDocumentContent(selectedCodeDocument.content)
    ) {
      return;
    }
    const metadata = writeShaderCompileProfile(
      selectedCodeDocument.content.metadata,
      profile
    );
    const command = createWorkspaceCodeContentUpdateCommand({
      workspaceId,
      document: selectedCodeDocument,
      content: {
        ...selectedCodeDocument.content,
        ...(metadata ? { metadata } : { metadata: undefined }),
      },
      commandId: createIntentId(),
      issuedAt: new Date().toISOString(),
      mergeKey: `shader-compile-profile:${selectedCodeDocument.id}`,
      label: `Configure ${selectedCodeDocument.path} shader target`,
    });
    if (!command) return;
    setSaveError('');
    setMutating(true);
    try {
      const outcome = await dispatchWorkspaceAuthoringOperation({
        workspace,
        readonly: workspaceReadonly,
        operation: { kind: 'command', command },
      });
      if (outcome.status === 'rejected') setSaveError(outcome.message);
    } finally {
      setMutating(false);
    }
  };

  useEditorShortcut(
    'Mod+S',
    () => {
      if (isMutating) return;
      void authoringSession.save();
    },
    {
      allowInEditable: true,
    }
  );

  const renameOverlayView: CodeLanguageRenameOverlayView | null =
    renameState.status === 'preview'
      ? {
          status: 'preview',
          currentName: renameState.currentName,
          nextName: renameState.nextName,
          editCount: renameState.editCount,
          artifactCount: renameState.plan.documentIds.length,
          affectedOwners: renameState.affectedBindings.map((impact) => ({
            slotId: impact.projection.binding.slotId,
            label: `${impact.slot?.kind ?? 'CodeSlot'} · ${describeCodeSlotOwner(impact.projection.ownerRef)}`,
          })),
        }
      : renameState.status === 'editing'
        ? {
            status: 'editing',
            currentName: renameState.currentName,
            nextName: renameState.nextName,
          }
        : renameState.status === 'preparing'
          ? renameState
          : null;
  const relocationOverlayView: CodeArtifactRelocationOverlayView | null =
    relocationState.status === 'editing'
      ? {
          currentPath: relocationState.currentPath,
          nextPath: relocationState.nextPath,
          bindingCount: selectedRefactorImpact?.bindings.length ?? 0,
          referenceCount: selectedRefactorImpact?.referenceIds.length ?? 0,
          impactCount: selectedRefactorImpact?.impactedSymbolIds.length ?? 0,
        }
      : null;
  const canUseCodeLanguageNavigation = Boolean(
    canNavigateSemantics &&
    codeLanguageSession.status === 'ready' &&
    codeEditorView?.state.doc.toString() === codeLanguageSession.source
  );
  const canStartCodeLanguageRename = Boolean(
    canRefactorSymbol &&
    codeLanguageSession.status === 'ready' &&
    codeEditorView &&
    workspace &&
    codeAuthoringEnvironment?.codeSlotRegistry &&
    codeAuthoringEnvironment.semanticIndex &&
    !workspaceReadonly &&
    !isSourceDirty &&
    renameState.status === 'idle' &&
    relocationState.status === 'idle'
  );
  const canStartCodeArtifactRelocation = Boolean(
    canRelocateArtifact &&
    canRenameCodeDocument &&
    selectedCodeDocument?.type === 'code' &&
    !isSourceDirty &&
    renameState.status === 'idle' &&
    relocationState.status === 'idle'
  );
  const locationOverlayItems = locationQuery.locations.map(
    (location, index) => {
      const span = location.sourceSpan;
      const path =
        workspaceDocumentsById[span.artifactId]?.path ?? span.artifactId;
      return Object.freeze({
        id: String(index),
        label: `${path}:${span.startLine}:${span.startColumn}`,
      });
    }
  );

  const shellClassName =
    presentation === 'workspace'
      ? 'mx-auto grid w-full max-w-7xl gap-4 px-6 py-6'
      : presentation === 'embedded'
        ? 'grid gap-4'
        : 'grid h-full min-h-0 gap-3';
  const workspaceGridClassName = isCompact
    ? 'grid min-h-0'
    : isOverlay
      ? 'grid min-h-0 gap-3 lg:grid-cols-[320px_minmax(0,1fr)]'
      : 'grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]';
  const editorArticleClassName = isOverlay
    ? 'grid min-h-0 content-start gap-3 overflow-auto rounded-xl border border-black/10 bg-(--bg-canvas) p-4'
    : 'grid gap-3 rounded-xl border border-black/10 bg-(--bg-canvas) p-4';

  return (
    <section className={shellClassName}>
      {presentation === 'workspace' ? (
        <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
          <h2 className="text-base font-medium text-(--text-primary)">
            {t('resourceManager.code.header.title')}
          </h2>
          <p className="mt-1 text-sm text-(--text-secondary)">
            {t('resourceManager.code.header.description')}
          </p>
        </article>
      ) : null}

      <div className={workspaceGridClassName}>
        {canManageArtifacts ? (
          <CodeFileTree
            tree={tree}
            selectedId={selectedNodeId}
            onSelect={(nodeId) => {
              setSelectedNodeId(nodeId);
              if (
                !isOverlay &&
                findCodeResourceNodeById(tree, nodeId)?.type === 'file'
              ) {
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
            onMove={
              canRelocateArtifact
                ? (nodeId) => startCodeArtifactRelocation(nodeId)
                : undefined
            }
            canMove={canStartCodeArtifactRelocation}
            relocation={relocationOverlayView ?? undefined}
            relocationBusy={isSaving}
            onRelocationPathChange={(nextPath) =>
              setRelocationState((current) =>
                current.status === 'editing'
                  ? { ...current, nextPath }
                  : current
              )
            }
            onApplyRelocation={() => void applySelectedCodeArtifactRelocation()}
            onCancelRelocation={() => setRelocationState({ status: 'idle' })}
            onDelete={
              canDeleteCodeDocument || canDeleteDirectory
                ? handleDeleteCodeFile
                : undefined
            }
          />
        ) : null}

        <article className={editorArticleClassName}>
          <div className="flex min-h-8 items-center justify-between gap-2 border-b border-black/8 pb-2">
            <div className="flex min-w-0 items-center gap-2">
              <h3
                className="truncate font-mono text-xs font-medium text-(--text-primary)"
                title={selectedNode.path}
              >
                {selectedNode.path}
              </h3>
              {isSourceDirty ? (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-(--text-primary)"
                  title={t('resourceManager.code.actions.unsaved')}
                />
              ) : null}
              {isCompact &&
              request.artifactId &&
              selectedFile?.id !== request.artifactId ? (
                <button
                  type="button"
                  className="shrink-0 text-[10px] font-medium text-(--text-primary) underline underline-offset-2"
                  onClick={() => {
                    if (request.artifactId) {
                      setSelectedNodeId(request.artifactId);
                    }
                  }}
                >
                  {t('codeAuthoring.session.returnToRequestedArtifact')}
                </button>
              ) : null}
            </div>
            {selectedFile ? (
              <button
                type="button"
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-35 ${
                  isSourceDirty
                    ? 'border-black bg-black text-white hover:bg-black/90'
                    : 'border-transparent hover:border-black/10 hover:bg-black/5'
                }`}
                aria-label={t('resourceManager.code.actions.save')}
                title={t('resourceManager.code.actions.saveShortcut')}
                onClick={() => void authoringSession.save()}
                disabled={
                  !isSourceDirty ||
                  !canPatchSelectedFile ||
                  isSaving ||
                  authoringSession.stale
                }
              >
                <Save size={13} />
              </button>
            ) : null}
          </div>

          {selectedFile ? (
            <>
              {isShaderFile && canConfigureCompile ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2">
                  <div>
                    <p className="m-0 text-xs font-medium text-(--text-primary)">
                      {t('resourceManager.code.compile.title')}
                    </p>
                    <p
                      className={
                        shaderCompile.status === 'resolved' &&
                        !shaderCompile.output.success &&
                        !isSourceDirty
                          ? 'm-0 mt-0.5 text-[11px] text-red-600'
                          : 'm-0 mt-0.5 text-[11px] text-(--text-muted)'
                      }
                      role="status"
                    >
                      {isSourceDirty
                        ? t('resourceManager.code.compile.pendingSave')
                        : shaderCompile.status === 'loading'
                          ? t('resourceManager.code.compile.loading')
                          : shaderCompile.status === 'not-configured'
                            ? t('resourceManager.code.compile.notConfigured')
                            : shaderCompile.status === 'unavailable'
                              ? t('resourceManager.code.compile.unavailable', {
                                  reason:
                                    shaderCompile.reason ??
                                    t(
                                      'resourceManager.code.compile.unknownReason'
                                    ),
                                })
                              : shaderCompile.status === 'resolved' &&
                                  shaderCompile.output.success
                                ? t('resourceManager.code.compile.success')
                                : shaderCompile.status === 'resolved'
                                  ? t('resourceManager.code.compile.failed', {
                                      count:
                                        shaderCompile.output.diagnostics.length,
                                    })
                                  : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedCodeLanguage === 'glsl' ? (
                      <select
                        aria-label={t(
                          'resourceManager.code.compile.stageLabel'
                        )}
                        className="rounded-md border border-black/10 bg-(--bg-canvas) px-2 py-1 text-[10px] text-(--text-primary) disabled:opacity-50"
                        value={
                          selectedShaderProfile?.target === 'webgl2'
                            ? selectedShaderProfile.stage
                            : ''
                        }
                        disabled={
                          !canPatchSelectedFile || isSourceDirty || isSaving
                        }
                        onChange={(event) => {
                          const stage = event.target.value;
                          if (stage !== 'vertex' && stage !== 'fragment') {
                            return;
                          }
                          void handleShaderCompileProfileChange({
                            schemaVersion: '1.0',
                            target: 'webgl2',
                            stage,
                          });
                        }}
                      >
                        <option value="" disabled>
                          {t('resourceManager.code.compile.selectStage')}
                        </option>
                        <option value="vertex">vertex</option>
                        <option value="fragment">fragment</option>
                      </select>
                    ) : selectedCodeLanguage === 'wgsl' &&
                      !selectedShaderProfile ? (
                      <button
                        type="button"
                        className="rounded-md border border-black/10 bg-(--bg-canvas) px-2 py-1 text-[10px] text-(--text-primary) hover:bg-black/5 disabled:opacity-50"
                        disabled={
                          !canPatchSelectedFile || isSourceDirty || isSaving
                        }
                        onClick={() =>
                          void handleShaderCompileProfileChange({
                            schemaVersion: '1.0',
                            target: 'webgpu',
                          })
                        }
                      >
                        {t('resourceManager.code.compile.enableWebGpu')}
                      </button>
                    ) : null}
                    {'profile' in shaderCompile ? (
                      <span className="rounded-md border border-black/10 bg-(--bg-canvas) px-2 py-1 text-[10px] text-(--text-secondary)">
                        {shaderCompile.profile.target}
                        {shaderCompile.profile.stage
                          ? ` · ${shaderCompile.profile.stage}`
                          : ''}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {saveError ? (
                <p role="alert" className="text-xs text-red-600">
                  {saveError}
                </p>
              ) : null}
              {authoringSession.stale ? (
                <div
                  role="alert"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                >
                  <span>{t('codeAuthoring.session.staleDraft')}</span>
                  <button
                    type="button"
                    className="rounded-md border border-amber-400 bg-white px-2 py-1 text-[10px] hover:bg-amber-100"
                    onClick={authoringSession.discard}
                  >
                    {t('codeAuthoring.session.discardDraft')}
                  </button>
                </div>
              ) : null}
              {canInspectBindings &&
              selectedArtifactLifecycle?.status === 'orphan' ? (
                <div className="grid gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                  <div>
                    <p className="font-medium">
                      {t('resourceManager.code.lifecycle.orphanTitle')}
                    </p>
                    <p className="mt-1 text-amber-800">
                      {t('resourceManager.code.lifecycle.orphanDescription', {
                        slotKind:
                          selectedArtifactLifecycle.previousSlot.slotKind,
                      })}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedArtifactLifecycle.previousSlot.slotKind ===
                    'external-adapter'
                      ? availableExternalAdapterSlots.map((target) => (
                          <button
                            key={target.slotId}
                            type="button"
                            className="rounded-md border border-amber-400 bg-white px-2 py-1 text-[10px] hover:bg-amber-100 disabled:opacity-50"
                            disabled={isSaving || workspaceReadonly}
                            onClick={() =>
                              void handleRebindExternalAdapter(target.libraryId)
                            }
                          >
                            {t('resourceManager.code.lifecycle.rebind', {
                              libraryId: target.libraryId,
                            })}
                          </button>
                        ))
                      : null}
                    <button
                      type="button"
                      className="rounded-md border border-amber-400 bg-white px-2 py-1 text-[10px] hover:bg-amber-100 disabled:opacity-50"
                      disabled={isSaving || workspaceReadonly}
                      onClick={() => void handleConvertOrphanToModule()}
                    >
                      {t('resourceManager.code.lifecycle.convertToModule')}
                    </button>
                  </div>
                </div>
              ) : null}
              {canInspectBindings && codeSlotUsages.length ? (
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
              <div ref={setEditorSurface} className="relative">
                <div
                  onContextMenu={(event) => {
                    if (!codeEditorView) return;
                    event.preventDefault();
                    const offset = codeEditorView.posAtCoords({
                      x: event.clientX,
                      y: event.clientY,
                    });
                    if (offset !== null) {
                      codeEditorView.dispatch({
                        selection: { anchor: offset },
                      });
                    }
                    codeEditorView.focus();
                    renameRequestGate.invalidate();
                    setRenameState({ status: 'idle' });
                    setRenameOverlayAnchor(null);
                    locationQueryRequestGate.invalidate();
                    setLocationQuery(EMPTY_CODE_LANGUAGE_LOCATION_QUERY);
                    setLocationOverlayAnchor(null);
                    setEditorContextMenuAnchor(
                      resolveEditorSurfaceAnchor({
                        surface: event.currentTarget,
                        clientX: event.clientX,
                        clientY: event.clientY,
                        overlayWidth: EDITOR_CONTEXT_MENU_WIDTH,
                      })
                    );
                  }}
                >
                  <CodeMirror
                    data-editor-native-history="true"
                    value={editorValue}
                    editable={canEditSource && !workspaceReadonly}
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
                    height={
                      isCompact
                        ? 'min(52dvh, 480px)'
                        : isOverlay
                          ? 'max(480px, calc(100dvh - 390px))'
                          : undefined
                    }
                    className={`rounded-lg border border-black/10 bg-black/[0.02] text-[12px] ${isOverlay ? '' : '[&_.cm-editor]:min-h-[460px]'}`}
                  />
                </div>
                {editorContextMenuAnchor ? (
                  <CodeEditorContextMenu
                    anchor={editorContextMenuAnchor}
                    canNavigate={canUseCodeLanguageNavigation}
                    canRename={canStartCodeLanguageRename}
                    onGoToDefinition={() =>
                      void runCodeLanguageLocationQuery(
                        'definition',
                        codeEditorView
                      )
                    }
                    onFindReferences={() =>
                      void runCodeLanguageLocationQuery(
                        'references',
                        codeEditorView
                      )
                    }
                    onRename={() =>
                      void beginCodeLanguageRename(codeEditorView)
                    }
                    onDismiss={() => setEditorContextMenuAnchor(null)}
                  />
                ) : null}
                {renameOverlayView && renameOverlayAnchor ? (
                  <CodeLanguageRenameOverlay
                    anchor={renameOverlayAnchor}
                    rename={renameOverlayView}
                    busy={isSaving}
                    onNameChange={(nextName) =>
                      setRenameState((current) =>
                        current.status === 'editing'
                          ? { ...current, nextName }
                          : current
                      )
                    }
                    onPreview={() => void previewCodeLanguageRename()}
                    onApply={() => void applyCodeLanguageRename()}
                    onBack={() =>
                      setRenameState((current) =>
                        current.status === 'preview'
                          ? {
                              status: 'editing',
                              position: current.position,
                              currentName: current.currentName,
                              nextName: current.nextName,
                            }
                          : current
                      )
                    }
                    onCancel={() => {
                      renameRequestGate.invalidate();
                      setRenameState({ status: 'idle' });
                      setRenameOverlayAnchor(null);
                    }}
                    onOpenAffectedOwner={(slotId) => {
                      if (!projectId || !workspace) return;
                      navigateToWorkspaceCodeSlotOwner({
                        projectId,
                        workspace,
                        slotId,
                        navigate,
                      });
                    }}
                  />
                ) : null}
                {locationQuery.status !== 'idle' && locationOverlayAnchor ? (
                  <CodeLanguageLocationsOverlay
                    anchor={locationOverlayAnchor}
                    statusText={locationQueryStatusText}
                    locations={locationOverlayItems}
                    onOpen={(id) => {
                      const location = locationQuery.locations[Number(id)];
                      if (!location) return;
                      openCodeLanguageLocation(location, codeEditorView);
                      setLocationQuery(EMPTY_CODE_LANGUAGE_LOCATION_QUERY);
                      setLocationOverlayAnchor(null);
                    }}
                    onDismiss={() => {
                      locationQueryRequestGate.invalidate();
                      setLocationQuery(EMPTY_CODE_LANGUAGE_LOCATION_QUERY);
                      setLocationOverlayAnchor(null);
                    }}
                  />
                ) : null}
              </div>
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
