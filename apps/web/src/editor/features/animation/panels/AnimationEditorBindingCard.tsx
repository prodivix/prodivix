import type {
  AnimationBinding,
  AnimationTrack,
  SvgFilterDefinition,
} from '@prodivix/animation';
import { useTranslation } from 'react-i18next';
import { AnimationEditorTrackCard } from './AnimationEditorTrackCard';

type NodeTargetOption = { id: string; label: string };

type AnimationEditorBindingCardProps = {
  binding: AnimationBinding;
  nodeTargetOptions: NodeTargetOption[];
  svgFilters: SvgFilterDefinition[];
  expandedTrackIdSet: Set<string>;
  timelineDurationMs: number;
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

export const AnimationEditorBindingCard = ({
  binding,
  nodeTargetOptions,
  svgFilters,
  expandedTrackIdSet,
  timelineDurationMs,
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
}: AnimationEditorBindingCardProps) => {
  const { t } = useTranslation('editor');
  const hasTarget = nodeTargetOptions.some(
    (item) => item.id === binding.targetNodeId
  );

  return (
    <article className="rounded-lg border border-black/10 bg-black/[0.015] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select
          value={binding.targetNodeId}
          onChange={(event) =>
            onUpdateBindingTarget(binding.id, event.target.value)
          }
          className="min-w-[220px] flex-1 rounded border border-black/15 px-2 py-1.5 text-sm"
          aria-label={t('animationEditor.binding.targetNode')}
          title={t('animationEditor.binding.targetNode')}
        >
          {!hasTarget ? (
            <option value={binding.targetNodeId}>{binding.targetNodeId}</option>
          ) : null}
          {nodeTargetOptions.map((node) => (
            <option key={node.id} value={node.id}>
              {node.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onDeleteBinding(binding.id)}
          className="rounded border border-black/15 px-2 py-1 text-xs"
          aria-label={t('animationEditor.binding.delete')}
          title={t('animationEditor.binding.delete')}
        >
          {t('animationEditor.binding.delete')}
        </button>
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onAddTrack(binding.id, 'style')}
          className="rounded border border-black/15 px-2 py-1 text-xs"
        >
          {t('animationEditor.binding.addStyle')}
        </button>
        <button
          type="button"
          onClick={() => onAddTrack(binding.id, 'css-filter')}
          className="rounded border border-black/15 px-2 py-1 text-xs"
        >
          {t('animationEditor.binding.addCssFilter')}
        </button>
        <button
          type="button"
          onClick={() => onAddTrack(binding.id, 'svg-filter-attr')}
          className="rounded border border-black/15 px-2 py-1 text-xs"
        >
          {t('animationEditor.binding.addSvgFilter')}
        </button>
      </div>

      <div className="space-y-2">
        {binding.tracks.map((track) => (
          <AnimationEditorTrackCard
            key={track.id}
            bindingId={binding.id}
            track={track}
            expanded={expandedTrackIdSet.has(track.id)}
            svgFilters={svgFilters}
            timelineDurationMs={timelineDurationMs}
            onToggleExpanded={onToggleTrackExpanded}
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
    </article>
  );
};
