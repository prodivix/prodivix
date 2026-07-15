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
  decodeControlledSourceManifest,
  decodeShaderCompileProfile,
  queryCodeArtifactRefactorImpact,
  writeShaderCompileProfile,
  type ShaderCompileProfile,
} from '@prodivix/authoring';
import { createControlledCodeEditPlan } from '@prodivix/prodivix-compiler';
import type { DiagnosticTargetRef } from '@prodivix/diagnostics';
import { CodeFileTree } from './CodeFileTree';
import {
  CodeArtifactRefactorPanel,
  type CodeArtifactRelocationRefactorView,
  type CodeLanguageRenameRefactorView,
} from './CodeArtifactRefactorPanel';
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
  reconcileCodeResourceEditorDraft,
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
  createWorkspaceCodeSourceUpdateCommand,
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

export type CodeAuthoringPresentation =
  'page' | 'embedded' | 'compact' | 'maximized';

type CodeAuthoringWorkspaceProps = {
  presentation?: CodeAuthoringPresentation;
  requestedDocumentId?: string;
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
  | Readonly<{ status: 'editing'; currentPath: string; nextPath: string }>;

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

export function CodeAuthoringWorkspace({
  presentation = 'page',
  requestedDocumentId,
  requestedCreateFolder,
  onCreateRequestConsumed,
  onDirtyChange,
}: CodeAuthoringWorkspaceProps) {
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
  const [editorValue, setEditorValue] = useState('');
  const [codeEditorView, setCodeEditorView] = useState<EditorView | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [renameState, setRenameState] = useState<CodeLanguageRenameState>({
    status: 'idle',
  });
  const [relocationState, setRelocationState] =
    useState<CodeArtifactRelocationState>({ status: 'idle' });
  const [locationQuery, setLocationQuery] =
    useState<CodeLanguageLocationQueryView>(EMPTY_CODE_LANGUAGE_LOCATION_QUERY);
  const locationQueryRequestIdRef = useRef(0);
  const renameRequestIdRef = useRef(0);
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
  const shaderCompile = useWorkspaceShaderCompile({
    workspace: workspace ?? null,
    artifactId: selectedFile?.id,
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
  const isSourceDirty = Boolean(
    selectedFile && editorValue !== (selectedFile.textContent ?? '')
  );
  const isDirty = isSourceDirty;
  const isCompact = presentation === 'compact';
  const isOverlay = presentation === 'compact' || presentation === 'maximized';
  const controlledSourceManifest = useMemo(() => {
    if (!selectedFile) return { status: 'absent' as const };
    const document = workspaceDocumentsById[selectedFile.id];
    return document?.type === 'code' &&
      isWorkspaceCodeDocumentContent(document.content)
      ? decodeControlledSourceManifest(document.content.metadata)
      : { status: 'absent' as const };
  }, [selectedFile, workspaceDocumentsById]);
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
    locationQueryRequestIdRef.current += 1;
    setLocationQuery(EMPTY_CODE_LANGUAGE_LOCATION_QUERY);
  }, [codeLanguageSource, selectedFile?.id]);

  useEffect(() => {
    renameRequestIdRef.current += 1;
    setRenameState({ status: 'idle' });
  }, [codeLanguageSource, selectedFile?.id, workspace?.workspaceRev]);

  useEffect(() => {
    setRelocationState({ status: 'idle' });
  }, [selectedFile?.id, workspace?.workspaceRev]);

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

  const beginCodeLanguageRename = useCallback(
    async (view: EditorView | null = codeEditorView) => {
      if (
        !view ||
        !workspace ||
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
      const requestId = renameRequestIdRef.current + 1;
      renameRequestIdRef.current = requestId;
      setSaveError('');
      setRenameState({ status: 'preparing' });
      const result = await codeLanguageSession.session.prepareRename({
        expectedSnapshotIdentity: codeLanguageSession.session.snapshotIdentity,
        position,
      });
      if (renameRequestIdRef.current !== requestId) return;
      if (result.status !== 'resolved') {
        setRenameState({ status: 'idle' });
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
      codeLanguageSession,
      isSaving,
      isSourceDirty,
      t,
      workspace,
      workspaceReadonly,
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
            onRenameRequest: (view) => void beginCodeLanguageRename(view),
          })
        : Object.freeze([]),
    [
      codeLanguageSession,
      beginCodeLanguageRename,
      handleDefinitionResult,
      isSourceDirty,
      openCodeLanguageLocation,
      shaderCompile,
    ]
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
    Boolean(workspaceId && typeof workspaceRev === 'number') &&
    !workspaceReadonly &&
    (!workspaceCapabilitiesLoaded ||
      workspaceCapabilities['core.workspace.code-document.create@1.0'] ===
        true);
  const canCreateDirectory =
    Boolean(workspaceId && typeof workspaceRev === 'number') &&
    !workspaceReadonly &&
    (!workspaceCapabilitiesLoaded ||
      workspaceCapabilities['core.workspace.directory.create@1.0'] === true);
  const canRenameDirectory =
    Boolean(workspaceId && typeof workspaceRev === 'number') &&
    !workspaceReadonly &&
    (!workspaceCapabilitiesLoaded ||
      workspaceCapabilities['core.workspace.directory.rename@1.0'] === true);
  const canDeleteDirectory =
    Boolean(workspaceId && typeof workspaceRev === 'number') &&
    !workspaceReadonly &&
    (!workspaceCapabilitiesLoaded ||
      workspaceCapabilities['core.workspace.directory.delete@1.0'] === true);
  const canRenameCodeDocument =
    Boolean(workspaceId && typeof workspaceRev === 'number') &&
    !workspaceReadonly &&
    (!workspaceCapabilitiesLoaded ||
      workspaceCapabilities['core.workspace.code-document.rename@1.0'] ===
        true);
  const canDeleteCodeDocument =
    Boolean(workspaceId && typeof workspaceRev === 'number') &&
    !workspaceReadonly &&
    (!workspaceCapabilitiesLoaded ||
      workspaceCapabilities['core.workspace.code-document.delete@1.0'] ===
        true);
  const canPatchSelectedFile = Boolean(
    workspace && workspaceId && selectedFile && !workspaceReadonly
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
    const requestedFile = findCodeResourceNodeById(tree, requestedDocumentId);
    if (requestedFile?.type !== 'file') return;
    if (selectedNodeId !== requestedFile.id) {
      setSelectedNodeId(requestedFile.id);
    }
  }, [requestedDocumentId, selectedNodeId, tree]);

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
    setSaving(true);
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
      setSaving(false);
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
    const requestId = renameRequestIdRef.current + 1;
    renameRequestIdRef.current = requestId;
    setSaveError('');
    setSaving(true);
    try {
      const proposal = await codeLanguageSession.session.getRenameEdits({
        expectedSnapshotIdentity: codeLanguageSession.session.snapshotIdentity,
        position: renameState.position,
        newName: nextName,
      });
      if (renameRequestIdRef.current !== requestId) return;
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
      setSaving(false);
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
    setSaving(true);
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
        editorBaselineRef.current = {
          documentId: selectedFile.id,
          source: nextSelectedSource,
        };
        setEditorValue(nextSelectedSource);
      }
      setRenameState({ status: 'idle' });
    } finally {
      setSaving(false);
    }
  };

  const startCodeArtifactRelocation = () => {
    if (
      !selectedCodeDocument ||
      selectedCodeDocument.type !== 'code' ||
      workspaceReadonly ||
      isSourceDirty ||
      isSaving
    ) {
      return;
    }
    setSaveError('');
    setRelocationState({
      status: 'editing',
      currentPath: selectedCodeDocument.path,
      nextPath: selectedCodeDocument.path,
    });
  };

  const applySelectedCodeArtifactRelocation = async () => {
    if (relocationState.status !== 'editing' || !selectedFile) return;
    const applied = await applyCodeArtifactRelocation(
      selectedFile.id,
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
    setSaving(true);
    try {
      const outcome = await dispatchWorkspaceAuthoringOperation({
        workspace,
        readonly: workspaceReadonly,
        operation: { kind: 'transaction', transaction: plan.transaction },
      });
      if (outcome.status === 'rejected') setSaveError(outcome.message);
    } finally {
      setSaving(false);
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
    setSaving(true);
    try {
      const outcome = await dispatchWorkspaceAuthoringOperation({
        workspace,
        readonly: workspaceReadonly,
        operation: { kind: 'command', command: plan.command },
      });
      if (outcome.status === 'rejected') setSaveError(outcome.message);
    } finally {
      setSaving(false);
    }
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
    const controlledManifest = decodeControlledSourceManifest(
      document.content.metadata
    );
    if (controlledManifest.status !== 'absent') {
      if (controlledManifest.status === 'invalid') {
        setSaveError(
          controlledManifest.issues[0]?.message ||
            'The controlled source manifest is invalid.'
        );
        return;
      }
      const plan = createControlledCodeEditPlan({
        workspace,
        baseRevision: workspace.workspaceRev,
        codeDocumentId: document.id,
        source: editorValue,
        operationId: createIntentId(),
        issuedAt: new Date().toISOString(),
      });
      if (plan.status === 'rejected') {
        setSaveError(
          plan.issues[0]?.message ||
            'The controlled visual/code update was rejected.'
        );
        return;
      }
      if (plan.status === 'unchanged') return;
      setSaveError('');
      setSaving(true);
      try {
        const outcome = await dispatchWorkspaceAuthoringOperation({
          workspace,
          readonly: workspaceReadonly,
          operation: plan.operation,
        });
        if (outcome.status === 'rejected') setSaveError(outcome.message);
      } finally {
        setSaving(false);
      }
      return;
    }
    const command = createWorkspaceCodeSourceUpdateCommand({
      workspaceId,
      document,
      source: editorValue,
      commandId: createIntentId(),
      issuedAt: new Date().toISOString(),
    });
    if (!command) return;
    setSaveError('');
    setSaving(true);
    try {
      const outcome = await dispatchWorkspaceAuthoringOperation({
        workspace,
        readonly: workspaceReadonly,
        operation: { kind: 'command', command },
      });
      if (outcome.status === 'rejected') setSaveError(outcome.message);
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
    setSaving(true);
    try {
      const outcome = await dispatchWorkspaceAuthoringOperation({
        workspace,
        readonly: workspaceReadonly,
        operation: { kind: 'command', command },
      });
      if (outcome.status === 'rejected') setSaveError(outcome.message);
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

  const renameRefactorView: CodeLanguageRenameRefactorView =
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
        : renameState;
  const relocationRefactorView: CodeArtifactRelocationRefactorView =
    relocationState.status === 'editing'
      ? {
          ...relocationState,
          bindingCount: selectedRefactorImpact?.bindings.length ?? 0,
          referenceCount: selectedRefactorImpact?.referenceIds.length ?? 0,
          impactCount: selectedRefactorImpact?.impactedSymbolIds.length ?? 0,
        }
      : relocationState;
  const canStartCodeLanguageRename = Boolean(
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
    canRenameCodeDocument &&
    selectedCodeDocument?.type === 'code' &&
    !isSourceDirty &&
    renameState.status === 'idle' &&
    relocationState.status === 'idle'
  );

  const shellClassName =
    presentation === 'page'
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
      {presentation === 'page' ? (
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
        {!isCompact ? (
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
        ) : null}

        <article className={editorArticleClassName}>
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
              {controlledSourceManifest.status === 'valid' ? (
                <p className="mt-1 text-[10px] text-(--text-muted)">
                  Controlled visual/code ·{' '}
                  {controlledSourceManifest.manifest.regions.length}{' '}
                  {controlledSourceManifest.manifest.regions.length === 1
                    ? 'region'
                    : 'regions'}
                </p>
              ) : null}
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
              {!isCompact ? (
                <CodeArtifactRefactorPanel
                  rename={renameRefactorView}
                  relocation={relocationRefactorView}
                  busy={isSaving}
                  canRename={canStartCodeLanguageRename}
                  canRelocate={canStartCodeArtifactRelocation}
                  onStartRename={() => void beginCodeLanguageRename()}
                  onRenameNameChange={(nextName) =>
                    setRenameState((current) =>
                      current.status === 'editing'
                        ? { ...current, nextName }
                        : current
                    )
                  }
                  onPreviewRename={() => void previewCodeLanguageRename()}
                  onApplyRename={() => void applyCodeLanguageRename()}
                  onBackRename={() =>
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
                  onCancelRename={() => {
                    renameRequestIdRef.current += 1;
                    setRenameState({ status: 'idle' });
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
                  onStartRelocation={startCodeArtifactRelocation}
                  onRelocationPathChange={(nextPath) =>
                    setRelocationState((current) =>
                      current.status === 'editing'
                        ? { ...current, nextPath }
                        : current
                    )
                  }
                  onApplyRelocation={() =>
                    void applySelectedCodeArtifactRelocation()
                  }
                  onCancelRelocation={() =>
                    setRelocationState({ status: 'idle' })
                  }
                />
              ) : null}
              {isShaderFile && !isCompact ? (
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
              {!isCompact && selectedArtifactLifecycle?.status === 'orphan' ? (
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
              {!isCompact && codeSlotUsages.length ? (
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
                height={
                  isCompact
                    ? 'min(52dvh, 480px)'
                    : isOverlay
                      ? 'max(480px, calc(100dvh - 390px))'
                      : undefined
                }
                className={`rounded-lg border border-black/10 bg-black/[0.02] text-[12px] ${isOverlay ? '' : '[&_.cm-editor]:min-h-[460px]'}`}
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
