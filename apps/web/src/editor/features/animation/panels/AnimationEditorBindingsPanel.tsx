import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  AnimationTimeline,
  AnimationTrack,
  SvgFilterDefinition,
} from '@prodivix/animation';
import { AnimationEditorBindingCard } from './AnimationEditorBindingCard';

type NodeTargetOption = { id: string; label: string };

type AnimationEditorBindingsPanelProps = {
  activeTimeline: AnimationTimeline | undefined;
  activeTimelineDisplayName: string;
  cursorMs: number;
  nodeTargetOptions: NodeTargetOption[];
  svgFilters: SvgFilterDefinition[];
  expandedTrackIdSet: Set<string>;
  onUpdateTimelineName: (name: string) => void;
  onUpdateTimelineDuration: (rawMs: string) => void;
  onSetCursorMs: (ms: number) => void;
  onAddBinding: () => void;
  onDeleteBinding: (bindingId: string) => void;
  onUpdateBindingTarget: (bindingId: string, targetNodeId: string) => void;
  onAddTrack: (bindingId: string, kind: AnimationTrack['kind']) => void;
  onToggleTrackExpanded: (trackId: string) => void;
  onDeleteTrack: (bindingId: string, trackId: string) => void;
  onUpdateTrackKind: (
    bindingId: string,
    trackId: string,
    kind: AnimationTrack['kind']
  ) => void;
  onUpdateStyleTrackProperty: (
    bindingId: string,
    trackId: string,
    property: Extract<AnimationTrack, { kind: 'style' }>['property']
  ) => void;
  onUpdateCssTrackFn: (
    bindingId: string,
    trackId: string,
    fn: Extract<AnimationTrack, { kind: 'css-filter' }>['fn']
  ) => void;
  onUpdateCssTrackUnit: (
    bindingId: string,
    trackId: string,
    unit: NonNullable<Extract<AnimationTrack, { kind: 'css-filter' }>['unit']>
  ) => void;
  onUpdateSvgTrackFilter: (
    bindingId: string,
    trackId: string,
    filterId: string
  ) => void;
  onUpdateSvgTrackPrimitive: (
    bindingId: string,
    trackId: string,
    primitiveId: string
  ) => void;
  onUpdateSvgTrackAttr: (
    bindingId: string,
    trackId: string,
    attr: string
  ) => void;
  onAddKeyframe: (bindingId: string, trackId: string) => void;
  onDeleteKeyframe: (bindingId: string, trackId: string, index: number) => void;
  onUpdateKeyframeAtMs: (
    bindingId: string,
    trackId: string,
    index: number,
    rawMs: string
  ) => void;
  onUpdateKeyframeValue: (
    bindingId: string,
    trackId: string,
    index: number,
    rawValue: string
  ) => void;
  onUpdateKeyframeEasing: (
    bindingId: string,
    trackId: string,
    index: number,
    easing: string
  ) => void;
  onUpdateKeyframeHold: (
    bindingId: string,
    trackId: string,
    index: number,
    hold: boolean
  ) => void;
};

export const AnimationEditorBindingsPanel = ({
  activeTimeline,
  activeTimelineDisplayName,
  cursorMs,
  nodeTargetOptions,
  svgFilters,
  expandedTrackIdSet,
  onUpdateTimelineName,
  onUpdateTimelineDuration,
  onSetCursorMs,
  onAddBinding,
  onDeleteBinding,
  onUpdateBindingTarget,
  onAddTrack,
  onToggleTrackExpanded,
  onDeleteTrack,
  onUpdateTrackKind,
  onUpdateStyleTrackProperty,
  onUpdateCssTrackFn,
  onUpdateCssTrackUnit,
  onUpdateSvgTrackFilter,
  onUpdateSvgTrackPrimitive,
  onUpdateSvgTrackAttr,
  onAddKeyframe,
  onDeleteKeyframe,
  onUpdateKeyframeAtMs,
  onUpdateKeyframeValue,
  onUpdateKeyframeEasing,
  onUpdateKeyframeHold,
}: AnimationEditorBindingsPanelProps) => {
  const { t } = useTranslation('editor');

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-black/8 bg-(--bg-canvas) p-4">
      <div className="border-b border-black/8 pb-3">
        <p className="text-sm font-medium text-(--text-primary)">
          {activeTimelineDisplayName}
        </p>
        <p className="mt-1 text-xs text-(--text-muted)">
          {activeTimeline
            ? t('animationEditor.bindings.summary', {
                count: activeTimeline.bindings.length,
                cursorMs,
                durationMs: activeTimeline.durationMs,
              })
            : t('animationEditor.bindings.createTimelineFirst')}
        </p>

        {activeTimeline ? (
          <div className="mt-3 grid grid-cols-2 gap-2 max-[720px]:grid-cols-1">
            <input
              value={activeTimeline.name}
              onChange={(event) => onUpdateTimelineName(event.target.value)}
              className="rounded border border-black/15 px-2 py-1.5 text-sm"
              placeholder={t('animationEditor.bindings.timelineName')}
              aria-label={t('animationEditor.bindings.timelineName')}
              title={t('animationEditor.bindings.timelineName')}
            />
            <input
              type="number"
              min={1}
              value={activeTimeline.durationMs}
              onChange={(event) => onUpdateTimelineDuration(event.target.value)}
              className="rounded border border-black/15 px-2 py-1.5 text-sm"
              aria-label={t('animationEditor.bindings.timelineDuration')}
              title={t('animationEditor.bindings.timelineDuration')}
            />
            <input
              className="col-span-2 max-[720px]:col-span-1"
              type="range"
              min={0}
              max={activeTimeline.durationMs}
              value={cursorMs}
              onChange={(event) =>
                onSetCursorMs(Number.parseInt(event.target.value, 10) || 0)
              }
            />
          </div>
        ) : null}
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-auto pr-2">
        {!activeTimeline ? null : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">
                {t('animationEditor.bindings.title')}
              </h3>
              <button
                type="button"
                onClick={onAddBinding}
                className="inline-flex items-center gap-1 rounded border border-black/15 px-2 py-1 text-xs"
                aria-label={t('animationEditor.bindings.addBinding')}
                title={t('animationEditor.bindings.addBinding')}
              >
                <Plus size={12} />
                {t('animationEditor.bindings.addBinding')}
              </button>
            </div>

            {activeTimeline.bindings.map((binding) => (
              <AnimationEditorBindingCard
                key={binding.id}
                binding={binding}
                nodeTargetOptions={nodeTargetOptions}
                svgFilters={svgFilters}
                expandedTrackIdSet={expandedTrackIdSet}
                timelineDurationMs={activeTimeline.durationMs}
                onDeleteBinding={onDeleteBinding}
                onUpdateBindingTarget={onUpdateBindingTarget}
                onAddTrack={onAddTrack}
                onToggleTrackExpanded={onToggleTrackExpanded}
                onDeleteTrack={onDeleteTrack}
                onUpdateTrackKind={onUpdateTrackKind}
                onUpdateStyleTrackProperty={onUpdateStyleTrackProperty}
                onUpdateCssTrackFn={onUpdateCssTrackFn}
                onUpdateCssTrackUnit={onUpdateCssTrackUnit}
                onUpdateSvgTrackFilter={onUpdateSvgTrackFilter}
                onUpdateSvgTrackPrimitive={onUpdateSvgTrackPrimitive}
                onUpdateSvgTrackAttr={onUpdateSvgTrackAttr}
                onAddKeyframe={onAddKeyframe}
                onDeleteKeyframe={onDeleteKeyframe}
                onUpdateKeyframeAtMs={onUpdateKeyframeAtMs}
                onUpdateKeyframeValue={onUpdateKeyframeValue}
                onUpdateKeyframeEasing={onUpdateKeyframeEasing}
                onUpdateKeyframeHold={onUpdateKeyframeHold}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
};
