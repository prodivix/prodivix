import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  resolveAnimationMotionPolicy,
  type AnimationDefinition,
  type AnimationMotionMode,
  type AnimationTimeline,
} from '@prodivix/animation';
import { createBrowserAnimationEffectStore } from '@prodivix/runtime-browser';
import { createWorkspaceCodeArtifactProvider } from '@prodivix/workspace';
import { openWorkspaceCodeSlotDefinition } from '@/editor/features/code';
import {
  ExecutionCenter,
  getWorkspaceAnimationExecutionSessionId,
  startWorkspaceAnimationExecution,
  stopWorkspaceAnimationExecution,
  useExecutionSession,
  useWorkspaceExecutionSourceNavigation,
} from '@/editor/features/execution';
import { useWorkspaceSemanticNavigationStore } from '@/editor/navigation';
import { useWorkspaceHistoryShortcuts } from '@/editor/shortcuts';
import {
  selectWorkspaceId,
  useEditorStore,
} from '@/editor/store/useEditorStore';
import { AnimationEditorInspectorPanel } from './panels/AnimationEditorInspectorPanel';
import type { AnimationEditorSelection } from './panels/AnimationEditorInspectorPanel';
import { AnimationEditorPreviewCanvas } from './panels/AnimationEditorPreviewCanvas';
import { AnimationEditorTimelinePanel } from './panels/AnimationEditorTimelinePanel';
import type { AnimationEditorTrackRef } from './panels/AnimationEditorTimelinePanel';
import { AnimationEditorTopBar } from './panels/AnimationEditorTopBar';
import { useAnimationEditorState } from './useAnimationEditorState';

const ACTIVE_EXECUTION_STATUSES = new Set([
  'queued',
  'starting',
  'running',
  'cancelling',
]);

type AnimationEditorContentProps = Readonly<{
  animationDocumentId: string;
  persistedAnimation: AnimationDefinition;
  documentControls?: ReactNode;
  disabled?: boolean;
  diagnostic?: string;
}>;

export const AnimationEditorContent = ({
  animationDocumentId,
  persistedAnimation,
  documentControls,
  disabled = false,
  diagnostic,
}: AnimationEditorContentProps) => {
  const workspaceId = useEditorStore(selectWorkspaceId);
  const {
    workspace,
    animation,
    activeTimelineId,
    activeTimeline,
    cursorMs,
    nodeTargetOptions,
    svgFilters,
    zoom,
    addTimeline,
    selectTimeline,
    deleteTimeline,
    updateActiveTimelineName,
    updateActiveTimelineDuration,
    updateActiveTimelineDelayMs,
    updateActiveTimelineIterations,
    updateActiveTimelineDirection,
    updateActiveTimelineFillMode,
    updateActiveTimelineEasing,
    updateActiveTimelineCodeSlot,
    addComposition,
    updateCompositionName,
    setEntryComposition,
    deleteComposition,
    setCursorMs,
    setZoom,
    addTrack,
    deleteTrack,
    updateTrackKind,
    updateStyleTrackProperty,
    updateCssTrackFn,
    updateCssTrackUnit,
    updateSvgTrackFilter,
    updateSvgTrackPrimitive,
    updateSvgTrackAttr,
    addKeyframe,
    deleteKeyframe,
    updateKeyframeAtMs,
    updateKeyframeValue,
    updateKeyframeEasing,
    updateKeyframeHold,
    addSvgFilter,
    deleteSvgFilter,
    updateSvgFilterUnits,
    addSvgPrimitive,
    deleteSvgPrimitive,
    updateSvgPrimitiveType,
    canRemoveSvgFilter,
    persistenceDiagnostic,
    flushPendingPersistence,
  } = useAnimationEditorState({
    animationDocumentId,
    persistedAnimation,
  });
  const sourceNavigation = useWorkspaceExecutionSourceNavigation({
    workspace,
    originSurface: 'animation-timeline',
  });
  const codeArtifacts = useMemo(
    () =>
      workspace
        ? createWorkspaceCodeArtifactProvider(workspace).listArtifacts({
            surface: 'animation-timeline',
          })
        : [],
    [workspace]
  );
  const openCodeSlotDefinition = useCallback(
    (slotId: string) => {
      if (!workspace) return;
      openWorkspaceCodeSlotDefinition({
        workspace,
        slotId,
        origin: { surface: 'animation-timeline' },
      });
    },
    [workspace]
  );

  useWorkspaceHistoryShortcuts({
    workspaceId,
    documentId: animationDocumentId,
    domain: 'animation',
    shortcutScope: 'animation',
  });

  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [selection, setSelection] = useState<AnimationEditorSelection>({});
  const [executionDiagnostic, setExecutionDiagnostic] = useState<
    string | undefined
  >();
  const [systemMotionMode, setSystemMotionMode] = useState<AnimationMotionMode>(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'reduced'
        : 'full'
  );
  const [motionOverride, setMotionOverride] = useState<
    'inherit' | AnimationMotionMode
  >('inherit');
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const update = () =>
      setSystemMotionMode(media.matches ? 'reduced' : 'full');
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const motionPolicy = useMemo(
    () =>
      resolveAnimationMotionPolicy({
        system: systemMotionMode,
        verification: motionOverride,
      }),
    [motionOverride, systemMotionMode]
  );
  const targetNodeIdsSignature = useMemo(
    () =>
      nodeTargetOptions
        .map((option) => option.id)
        .sort()
        .join('\u0000'),
    [nodeTargetOptions]
  );
  const effectStore = useMemo(
    () =>
      createBrowserAnimationEffectStore({
        targetDocumentId: animation.target.documentId,
        targetNodeIds: targetNodeIdsSignature
          ? targetNodeIdsSignature.split('\u0000')
          : [],
      }),
    [
      animation.target.documentId,
      animationDocumentId,
      targetNodeIdsSignature,
      workspaceId,
    ]
  );
  const effectSnapshot = useSyncExternalStore(
    effectStore.subscribe,
    effectStore.getSnapshot,
    effectStore.getSnapshot
  );
  const executionSessionId = workspaceId
    ? getWorkspaceAnimationExecutionSessionId(workspaceId, animationDocumentId)
    : undefined;
  const executionSession = useExecutionSession(
    executionSessionId ?? 'animation:unavailable'
  );
  const isExecuting = Boolean(
    executionSession && ACTIVE_EXECUTION_STATUSES.has(executionSession.status)
  );
  const semanticNavigationRequest = useWorkspaceSemanticNavigationStore(
    (state) => state.navigationRequest
  );
  const consumeSemanticNavigation = useWorkspaceSemanticNavigationStore(
    (state) => state.consumeNavigation
  );

  useEffect(
    () => () => {
      effectStore.dispose();
      if (workspaceId) {
        void stopWorkspaceAnimationExecution(
          workspaceId,
          animationDocumentId,
          'Animation effect surface was replaced.'
        );
      }
    },
    [animationDocumentId, effectStore, workspaceId]
  );

  useEffect(() => {
    if (!activeTimeline) {
      setSelection({});
      return;
    }

    setSelection((prev) => {
      const nextTimelineId = activeTimeline.id;
      const bindingExists = Boolean(
        prev.timelineId === nextTimelineId &&
        prev.bindingId &&
        activeTimeline.bindings.some((binding) => binding.id === prev.bindingId)
      );
      const nextBindingId = bindingExists
        ? prev.bindingId
        : activeTimeline.bindings[0]?.id;

      const nextBinding = nextBindingId
        ? activeTimeline.bindings.find(
            (binding) => binding.id === nextBindingId
          )
        : undefined;

      const trackExists = Boolean(
        prev.trackId &&
        nextBinding?.tracks.some((track) => track.id === prev.trackId)
      );
      const nextTrackId = trackExists
        ? prev.trackId
        : nextBinding?.tracks[0]?.id;

      if (
        nextTimelineId === prev.timelineId &&
        nextBindingId === prev.bindingId &&
        nextTrackId === prev.trackId
      ) {
        return prev;
      }
      return {
        timelineId: nextTimelineId,
        bindingId: nextBindingId,
        trackId: nextTrackId,
      };
    });
  }, [activeTimeline]);

  useEffect(() => {
    const location = semanticNavigationRequest?.location;
    if (
      !semanticNavigationRequest ||
      semanticNavigationRequest.workspaceId !== workspaceId ||
      location?.kind !== 'diagnostic-target' ||
      (location.targetRef.kind !== 'animation-timeline' &&
        location.targetRef.kind !== 'animation-track') ||
      location.targetRef.documentId !== animationDocumentId
    ) {
      return;
    }
    const targetRef = location.targetRef;
    const timeline = animation.timelines.find(
      (candidate) => candidate.id === targetRef.timelineId
    );
    if (targetRef.kind === 'animation-timeline') {
      if (!timeline) return;
      selectTimeline(targetRef.timelineId);
      setSelection({ timelineId: targetRef.timelineId });
      consumeSemanticNavigation(semanticNavigationRequest.id);
      return;
    }
    const binding = timeline?.bindings.find(
      (candidate) => candidate.id === targetRef.bindingId
    );
    if (
      !binding?.tracks.some((candidate) => candidate.id === targetRef.trackId)
    ) {
      return;
    }
    selectTimeline(targetRef.timelineId);
    setSelection({
      timelineId: targetRef.timelineId,
      bindingId: targetRef.bindingId,
      trackId: targetRef.trackId,
    });
    consumeSemanticNavigation(semanticNavigationRequest.id);
  }, [
    animationDocumentId,
    animation.timelines,
    consumeSemanticNavigation,
    selectTimeline,
    semanticNavigationRequest,
    workspaceId,
  ]);

  const selectedTrackRef = useMemo<AnimationEditorTrackRef | undefined>(() => {
    if (!selection.timelineId || !selection.bindingId || !selection.trackId) {
      return undefined;
    }
    return {
      timelineId: selection.timelineId,
      bindingId: selection.bindingId,
      trackId: selection.trackId,
    };
  }, [selection.timelineId, selection.bindingId, selection.trackId]);

  const activeTimelineForInspector = useMemo<
    AnimationTimeline | undefined
  >(() => {
    return activeTimeline ?? animation.timelines[0];
  }, [activeTimeline, animation.timelines]);
  const previewNodeId = useMemo(() => {
    if (!activeTimeline) return undefined;
    if (selection.bindingId) {
      const selectedBinding = activeTimeline.bindings.find(
        (binding) => binding.id === selection.bindingId
      );
      if (selectedBinding?.targetNodeId.trim()) {
        return selectedBinding.targetNodeId.trim();
      }
    }
    const firstBindingId = activeTimeline.bindings[0]?.targetNodeId.trim();
    return firstBindingId || undefined;
  }, [activeTimeline, selection.bindingId]);

  const stopPlayback = useCallback(() => {
    if (!workspaceId) return;
    void stopWorkspaceAnimationExecution(workspaceId, animationDocumentId);
  }, [animationDocumentId, workspaceId]);

  const runActiveTimeline = useCallback(async () => {
    if (!activeTimeline) return;
    setExecutionDiagnostic(undefined);
    if (!(await flushPendingPersistence())) {
      setExecutionDiagnostic(
        'Save the current Animation revision before running it.'
      );
      return;
    }
    const currentWorkspace = useEditorStore.getState().workspace;
    if (!currentWorkspace) {
      setExecutionDiagnostic('The current Workspace is unavailable.');
      return;
    }
    effectStore.reset();
    try {
      await startWorkspaceAnimationExecution({
        workspace: currentWorkspace,
        documentId: animationDocumentId,
        timelineId: activeTimeline.id,
        runtime: effectStore.createRuntimePort(),
      });
    } catch (error) {
      setExecutionDiagnostic(
        error instanceof Error ? error.message : String(error)
      );
    }
  }, [
    activeTimeline,
    animationDocumentId,
    effectStore,
    flushPendingPersistence,
  ]);

  const changeCursor = useCallback(
    (nextMs: number, targetDurationMs?: number) => {
      if (isExecuting) stopPlayback();
      effectStore.reset();
      setCursorMs(nextMs, targetDurationMs);
    },
    [effectStore, isExecuting, setCursorMs, stopPlayback]
  );
  const runtimePreview =
    effectSnapshot.status === 'idle' || effectSnapshot.status === 'disposed'
      ? undefined
      : effectSnapshot.preview;
  const displayedCursorMs =
    runtimePreview && effectSnapshot.cursorMs !== null
      ? effectSnapshot.cursorMs
      : cursorMs;
  const visibleDiagnostic =
    diagnostic ?? persistenceDiagnostic ?? executionDiagnostic;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden text-(--text-primary) [--anim-inspector-width:400px] [--anim-timeline-height:300px] max-[1100px]:[--anim-inspector-width:100%]">
      <AnimationEditorTopBar
        timelines={animation.timelines}
        activeTimelineId={activeTimelineId}
        onSelectTimeline={selectTimeline}
        onAddTimeline={addTimeline}
        onDeleteTimeline={deleteTimeline}
        disabled={disabled}
        documentControls={documentControls}
      />

      <fieldset
        disabled={disabled}
        className="relative m-0 flex min-h-0 min-w-0 flex-1 overflow-hidden border-0 p-0 max-[1100px]:flex-col"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 p-3">
            <AnimationEditorPreviewCanvas
              workspace={workspace}
              entryDocumentId={animation.target.documentId}
              previewNodeId={previewNodeId}
              timeline={activeTimeline}
              cursorMs={displayedCursorMs}
              onCursorChange={changeCursor}
              svgFilters={svgFilters}
              zoom={zoom}
              onZoomChange={setZoom}
              selectedNodeId={selectedNodeId}
              onSelectNodeId={setSelectedNodeId}
              executionRunning={isExecuting}
              runtimePreview={runtimePreview}
              onPlay={() => void runActiveTimeline()}
              onStop={stopPlayback}
            />
          </div>

          <AnimationEditorTimelinePanel
            timelines={animation.timelines}
            activeTimelineId={activeTimelineId}
            cursorMs={displayedCursorMs}
            onCursorChange={changeCursor}
            selectedTrack={selectedTrackRef}
            onSelectTimeline={(timelineId) => {
              selectTimeline(timelineId);
              setSelection((prev) =>
                prev.timelineId === timelineId ? prev : { timelineId }
              );
            }}
            onSelectTrack={(ref) => {
              selectTimeline(ref.timelineId);
              setSelection(ref);
            }}
          />
        </div>

        <AnimationEditorInspectorPanel
          timeline={activeTimelineForInspector}
          compositions={animation.compositions}
          entryCompositionId={animation.entryCompositionId}
          motionPolicy={motionPolicy}
          motionOverride={motionOverride}
          conflictContributors={[]}
          conflictIssues={[]}
          cursorMs={displayedCursorMs}
          svgFilters={svgFilters}
          canRemoveSvgFilter={canRemoveSvgFilter}
          selection={selection}
          onSelectionChange={(next) => {
            setSelection((prev) => ({
              timelineId:
                next.timelineId ??
                activeTimelineForInspector?.id ??
                prev.timelineId,
              bindingId: next.bindingId,
              trackId: next.trackId,
            }));
          }}
          onMotionOverrideChange={setMotionOverride}
          onAddComposition={() => {
            addComposition();
          }}
          onUpdateCompositionName={updateCompositionName}
          onSetEntryComposition={setEntryComposition}
          onDeleteComposition={deleteComposition}
          onUpdateTimelineName={updateActiveTimelineName}
          onUpdateTimelineDuration={updateActiveTimelineDuration}
          onUpdateTimelineDelayMs={updateActiveTimelineDelayMs}
          onUpdateTimelineIterations={updateActiveTimelineIterations}
          onUpdateTimelineDirection={updateActiveTimelineDirection}
          onUpdateTimelineFillMode={updateActiveTimelineFillMode}
          onUpdateTimelineEasing={updateActiveTimelineEasing}
          codeArtifacts={codeArtifacts}
          onUpdateTimelineCodeSlot={updateActiveTimelineCodeSlot}
          onOpenCodeSlotDefinition={openCodeSlotDefinition}
          onAddTrack={addTrack}
          onDeleteTrack={deleteTrack}
          onUpdateTrackKind={updateTrackKind}
          onUpdateStyleTrackProperty={updateStyleTrackProperty}
          onUpdateCssTrackFn={updateCssTrackFn}
          onUpdateCssTrackUnit={updateCssTrackUnit}
          onUpdateSvgTrackFilter={updateSvgTrackFilter}
          onUpdateSvgTrackPrimitive={updateSvgTrackPrimitive}
          onUpdateSvgTrackAttr={updateSvgTrackAttr}
          onAddKeyframe={addKeyframe}
          onDeleteKeyframe={deleteKeyframe}
          onUpdateKeyframeAtMs={updateKeyframeAtMs}
          onUpdateKeyframeValue={updateKeyframeValue}
          onUpdateKeyframeEasing={updateKeyframeEasing}
          onUpdateKeyframeHold={updateKeyframeHold}
          onAddSvgFilter={addSvgFilter}
          onDeleteSvgFilter={deleteSvgFilter}
          onUpdateSvgFilterUnits={updateSvgFilterUnits}
          onAddSvgPrimitive={addSvgPrimitive}
          onDeleteSvgPrimitive={deleteSvgPrimitive}
          onUpdateSvgPrimitiveType={updateSvgPrimitiveType}
        />
        {visibleDiagnostic ? (
          <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex justify-center">
            <div
              role="status"
              className="max-w-2xl rounded-xl border border-black/10 bg-[rgb(var(--bg-canvas-rgb)_/_0.94)] px-4 py-2 text-xs text-(--text-secondary) shadow-(--shadow-md) backdrop-blur"
            >
              {visibleDiagnostic}
            </div>
          </div>
        ) : null}
      </fieldset>
      {executionSessionId && executionSession ? (
        <ExecutionCenter
          sessionId={executionSessionId}
          workspace={workspace ?? undefined}
          onOpenSourceTrace={sourceNavigation.openSourceTrace}
          onOpenDataOperation={sourceNavigation.openDataOperation}
          onRestart={() => void runActiveTimeline()}
          onStop={stopPlayback}
        />
      ) : null}
    </div>
  );
};
