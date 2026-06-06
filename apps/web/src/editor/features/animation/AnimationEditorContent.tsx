import { useEffect, useMemo, useState } from 'react';
import type { AnimationTimeline } from '@/core/types/engine.types';
import { AnimationEditorInspectorPanel } from './panels/AnimationEditorInspectorPanel';
import type { AnimationEditorSelection } from './panels/AnimationEditorInspectorPanel';
import { AnimationEditorPreviewCanvas } from './panels/AnimationEditorPreviewCanvas';
import { AnimationEditorTimelinePanel } from './panels/AnimationEditorTimelinePanel';
import type { AnimationEditorTrackRef } from './panels/AnimationEditorTimelinePanel';
import { AnimationEditorTopBar } from './panels/AnimationEditorTopBar';
import { useAnimationEditorState } from './useAnimationEditorState';

export const AnimationEditorContent = () => {
  const {
    pirDoc,
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
  } = useAnimationEditorState();

  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [selection, setSelection] = useState<AnimationEditorSelection>({});

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
          activeTimeline.bindings.some(
            (binding) => binding.id === prev.bindingId
          )
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
      />

      <div className="flex min-h-0 flex-1 overflow-hidden max-[1100px]:flex-col">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 p-3">
            <AnimationEditorPreviewCanvas
              pirDoc={pirDoc}
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
      </div>
    </div>
  );
};
