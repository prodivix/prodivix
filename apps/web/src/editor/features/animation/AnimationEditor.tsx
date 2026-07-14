import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createDefaultBinding,
  createDefaultSvgFilter,
  createDefaultTimeline,
  createDefaultTrack,
  createEmptyAnimationDefinition,
  type AnimationDefinition,
  type AnimationIdFactory,
} from '@prodivix/animation';
import {
  createWorkspaceDocumentAtPathCommand,
  selectWorkspaceAnimationDocument,
  selectWorkspaceAnimationDocumentResults,
  selectWorkspacePirDocumentResults,
} from '@prodivix/workspace';
import {
  selectActiveDocumentId,
  selectWorkspace,
  useEditorStore,
} from '@/editor/store/useEditorStore';
import { createWorkspaceClientOperationId } from '@/editor/workspaceSync/workspaceOperationIdentity';
import { dispatchWorkspaceAuthoringOperation } from '@/editor/workspaceSync/workspaceAuthoringOperationDispatcher';
import { AnimationEditorContent } from './AnimationEditorContent';
import {
  AnimationDocumentControls,
  type AnimationDocumentOption,
  type AnimationTargetOption,
} from './AnimationDocumentControls';

const fileLabel = (path: string): string =>
  path.split('/').filter(Boolean).at(-1) ?? path;

const createAnimationDocumentIdentity = (
  existingPaths: ReadonlySet<string>
): Readonly<{ documentId: string; path: string }> => {
  let index = 1;
  let path = `/animations/animation-${index}.pir-animation.json`;
  while (existingPaths.has(path)) {
    index += 1;
    path = `/animations/animation-${index}.pir-animation.json`;
  }
  const token = createWorkspaceClientOperationId('animation-document')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .slice(0, 48);
  return { documentId: `animation-${token}`, path };
};

const createUnavailableAnimationAuthoringModel = (input: {
  targetDocumentId: string;
  targetNodeId: string;
}): AnimationDefinition => {
  const idFactory: AnimationIdFactory = (kind) => `unavailable-${kind}`;
  const svgFilter = createDefaultSvgFilter({ idFactory });
  const timeline = createDefaultTimeline({ idFactory });
  const binding = createDefaultBinding({
    idFactory,
    targetNodeId: input.targetNodeId,
  });
  return {
    ...createEmptyAnimationDefinition({
      targetDocumentId: input.targetDocumentId,
    }),
    timelines: [
      {
        ...timeline,
        bindings: [
          {
            ...binding,
            tracks: [
              createDefaultTrack({
                idFactory,
                durationMs: timeline.durationMs,
                svgFilters: [svgFilter],
              }),
            ],
          },
        ],
      },
    ],
    svgFilters: [svgFilter],
    'x-animationEditor': {
      version: 1,
      activeTimelineId: timeline.id,
      cursorMs: 0,
      zoom: 1,
    },
  };
};

function AnimationEditor() {
  const workspace = useEditorStore(selectWorkspace);
  const activeDocumentId = useEditorStore(selectActiveDocumentId);
  const workspaceReadonly = useEditorStore((state) => state.workspaceReadonly);
  const setActiveDocumentId = useEditorStore(
    (state) => state.setActiveDocumentId
  );
  const [targetDocumentId, setTargetDocumentId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string>();

  const animationResults = useMemo(
    () => (workspace ? selectWorkspaceAnimationDocumentResults(workspace) : []),
    [workspace]
  );
  const targetResults = useMemo(
    () => (workspace ? selectWorkspacePirDocumentResults(workspace) : []),
    [workspace]
  );
  const targetOptions = useMemo<readonly AnimationTargetOption[]>(
    () =>
      targetResults
        .filter((result) => result.status === 'valid')
        .map((result) => ({
          id: result.document.id,
          label: fileLabel(result.document.path),
        })),
    [targetResults]
  );
  const documentOptions = useMemo<readonly AnimationDocumentOption[]>(
    () =>
      animationResults.map((result) => ({
        id: result.document.id,
        label: fileLabel(result.document.path),
        valid: result.status === 'valid',
      })),
    [animationResults]
  );

  const selection = useMemo(() => {
    if (!workspace) return undefined;
    const activeDocument = activeDocumentId
      ? workspace.docsById[activeDocumentId]
      : undefined;
    const activeRead = selectWorkspaceAnimationDocument(
      workspace,
      activeDocumentId
    );
    if (activeDocument?.type === 'pir-animation') return activeRead;
    return (
      animationResults.find(
        (result) =>
          result.status === 'valid' &&
          result.decodedContent.target.documentId === activeDocumentId
      ) ?? animationResults.find((result) => result.status === 'valid')
    );
  }, [activeDocumentId, animationResults, workspace]);

  const suggestedTargetDocumentId = useMemo(() => {
    if (
      activeDocumentId &&
      targetOptions.some((target) => target.id === activeDocumentId)
    ) {
      return activeDocumentId;
    }
    if (selection?.status === 'valid') {
      return selection.decodedContent.target.documentId;
    }
    return targetOptions[0]?.id ?? '';
  }, [activeDocumentId, selection, targetOptions]);

  useEffect(() => {
    setTargetDocumentId((current) =>
      targetOptions.some((target) => target.id === current)
        ? current
        : suggestedTargetDocumentId
    );
  }, [suggestedTargetDocumentId, targetOptions]);

  useEffect(() => {
    if (
      selection?.status === 'valid' &&
      selection.document.id !== activeDocumentId
    ) {
      setActiveDocumentId(selection.document.id);
    }
  }, [activeDocumentId, selection, setActiveDocumentId]);

  const handleCreate = useCallback(async () => {
    if (!workspace || !targetDocumentId || creating || workspaceReadonly) {
      return;
    }
    setCreating(true);
    setCreateError(undefined);
    try {
      const identity = createAnimationDocumentIdentity(
        new Set(
          Object.values(workspace.docsById).map((document) => document.path)
        )
      );
      const command = createWorkspaceDocumentAtPathCommand({
        workspace,
        document: {
          id: identity.documentId,
          type: 'pir-animation',
          path: identity.path,
          contentRev: 1,
          metaRev: 1,
          content: createEmptyAnimationDefinition({ targetDocumentId }),
        },
        commandId: createWorkspaceClientOperationId('animation-create'),
        issuedAt: new Date().toISOString(),
        label: `Create ${identity.path}`,
      });
      const outcome = await dispatchWorkspaceAuthoringOperation({
        workspace,
        readonly: workspaceReadonly,
        operation: { kind: 'command', command },
      });
      if (outcome.status === 'rejected') {
        setCreateError(outcome.message);
        return;
      }
      setActiveDocumentId(identity.documentId);
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : 'Could not create the Animation document.'
      );
    } finally {
      setCreating(false);
    }
  }, [
    creating,
    setActiveDocumentId,
    targetDocumentId,
    workspace,
    workspaceReadonly,
  ]);

  const selectedDocumentId =
    workspace?.docsById[activeDocumentId ?? '']?.type === 'pir-animation'
      ? activeDocumentId
      : selection?.document.id;
  const documentControls = (
    <AnimationDocumentControls
      documents={documentOptions}
      selectedDocumentId={selectedDocumentId}
      targets={targetOptions}
      targetDocumentId={targetDocumentId}
      creating={creating}
      readonly={workspaceReadonly}
      error={createError}
      onSelectDocument={(documentId) => {
        if (!documentId) return;
        setCreateError(undefined);
        setActiveDocumentId(documentId);
      }}
      onSelectTarget={(documentId) => {
        setCreateError(undefined);
        setTargetDocumentId(documentId);
      }}
      onCreate={() => void handleCreate()}
    />
  );

  const isValidSelection = selection?.status === 'valid';
  const emptyTargetDocumentId =
    targetDocumentId || targetOptions[0]?.id || 'unavailable-pir-document';
  const emptyTargetRead = targetResults.find(
    (result) => result.document.id === emptyTargetDocumentId
  );
  const emptyTargetNodeId =
    emptyTargetRead?.status === 'valid'
      ? emptyTargetRead.decodedContent.ui.graph.rootId
      : 'unavailable-pir-node';
  const emptyAnimation = createUnavailableAnimationAuthoringModel({
    targetDocumentId: emptyTargetDocumentId,
    targetNodeId: emptyTargetNodeId,
  });
  const diagnostic =
    selection?.status === 'invalid'
      ? (selection.issues[0]?.message ??
        'This Animation document is invalid. Open Issues for details or create another standalone document.')
      : !workspace
        ? 'Open a Workspace to author Animation documents.'
        : targetOptions.length === 0
          ? 'Create or open a canonical PIR page, layout, or Component before adding an Animation document.'
          : 'Choose a PIR target and create a standalone Animation document. The complete editor remains available here.';
  return (
    <AnimationEditorContent
      key={isValidSelection ? selection.document.id : 'animation-empty'}
      animationDocumentId={
        isValidSelection ? selection.document.id : 'animation-unavailable'
      }
      persistedAnimation={
        isValidSelection ? selection.decodedContent : emptyAnimation
      }
      documentControls={documentControls}
      disabled={!isValidSelection || workspaceReadonly}
      diagnostic={isValidSelection ? undefined : diagnostic}
    />
  );
}

export default AnimationEditor;
