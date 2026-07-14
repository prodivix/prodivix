import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  AnimationDefinition,
  AnimationTimeline,
} from '@prodivix/animation';
import { createWorkspaceCodeArtifactProvider } from '@prodivix/workspace';
import { useNavigate, useParams } from 'react-router';
import {
  navigateToWorkspaceCodeSlotDefinition,
  useWorkspaceSemanticNavigationStore,
} from '@/editor/navigation';
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
  const navigate = useNavigate();
  const { projectId } = useParams();
  const workspaceId = useEditorStore(selectWorkspaceId);
  const {
    workspace,
    animation,
    activeTimelineId,
    activeTimeline,
    cursorMs,
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
  } = useAnimationEditorState({
    animationDocumentId,
    persistedAnimation,
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
      if (!projectId || !workspace) return;
      navigateToWorkspaceCodeSlotDefinition({
        projectId,
        workspace,
        slotId,
        navigate,
      });
    },
    [navigate, projectId, workspace]
  );

  useWorkspaceHistoryShortcuts({
    workspaceId,
    documentId: animationDocumentId,
    domain: 'animation',
    shortcutScope: 'animation',
  });

  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [selection, setSelection] = useState<AnimationEditorSelection>({});
  const semanticNavigationRequest = useWorkspaceSemanticNavigationStore(
    (state) => state.navigationRequest
  );
  const consumeSemanticNavigation = useWorkspaceSemanticNavigationStore(
    (state) => state.consumeNavigation
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

  return (
    <div className="relative flex h-full min-h-screen flex-col overflow-hidden text-(--text-primary) [--anim-inspector-width:400px] [--anim-timeline-height:300px] max-[1100px]:[--anim-inspector-width:100%]">
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
              cursorMs={cursorMs}
              onCursorChange={setCursorMs}
              svgFilters={svgFilters}
              zoom={zoom}
              onZoomChange={setZoom}
              selectedNodeId={selectedNodeId}
              onSelectNodeId={setSelectedNodeId}
            />
          </div>

          <AnimationEditorTimelinePanel
            timelines={animation.timelines}
            activeTimelineId={activeTimelineId}
            cursorMs={cursorMs}
            onCursorChange={setCursorMs}
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
          cursorMs={cursorMs}
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
        {diagnostic ? (
          <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex justify-center">
            <div
              role="status"
              className="max-w-2xl rounded-xl border border-black/10 bg-[rgb(var(--bg-canvas-rgb)_/_0.94)] px-4 py-2 text-xs text-(--text-secondary) shadow-(--shadow-md) backdrop-blur"
            >
              {diagnostic}
            </div>
          </div>
        ) : null}
      </fieldset>
    </div>
  );
};
