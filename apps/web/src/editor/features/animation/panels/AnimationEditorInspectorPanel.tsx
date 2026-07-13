import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  AnimationBinding,
  AnimationTimeline,
  AnimationTrack,
  SvgFilterDefinition,
} from '@prodivix/animation';
import { AnimationEditorKeyframesEditor } from './AnimationEditorKeyframesEditor';
import { AnimationEditorSvgFilterLibrarySection } from './AnimationEditorSvgFilterLibrarySection';
import {
  CSS_FILTER_FNS,
  CSS_FILTER_UNITS,
  STYLE_PROPERTIES,
  TRACK_KINDS,
} from '@/editor/features/animation/animationEditorUi';

type TimelineDirection = NonNullable<AnimationTimeline['direction']>;
type TimelineFillMode = NonNullable<AnimationTimeline['fillMode']>;
type TimelineIterations = NonNullable<AnimationTimeline['iterations']>;

const DIRECTION_OPTIONS: TimelineDirection[] = [
  'normal',
  'reverse',
  'alternate',
  'alternate-reverse',
];

const FILL_MODE_OPTIONS: TimelineFillMode[] = [
  'none',
  'forwards',
  'backwards',
  'both',
];

export type AnimationEditorSelection = {
  timelineId?: string;
  bindingId?: string;
  trackId?: string;
};

type AnimationEditorInspectorPanelProps = {
  timeline: AnimationTimeline | undefined;
  cursorMs: number;
  svgFilters: SvgFilterDefinition[];
  canRemoveSvgFilter: boolean;
  selection: AnimationEditorSelection;
  onSelectionChange: (next: AnimationEditorSelection) => void;

  onUpdateTimelineName: (name: string) => void;
  onUpdateTimelineDuration: (rawMs: string) => void;
  onUpdateTimelineDelayMs: (rawMs: string) => void;
  onUpdateTimelineIterations: (value: string) => void;
  onUpdateTimelineDirection: (direction: TimelineDirection | undefined) => void;
  onUpdateTimelineFillMode: (fillMode: TimelineFillMode | undefined) => void;
  onUpdateTimelineEasing: (easing: string) => void;

  onAddTrack: (
    bindingId: string,
    kind: AnimationTrack['kind']
  ) => string | null;
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

  onAddSvgFilter: () => void;
  onDeleteSvgFilter: (filterId: string) => void;
  onUpdateSvgFilterUnits: (
    filterId: string,
    units: NonNullable<SvgFilterDefinition['units']> | undefined
  ) => void;
  onAddSvgPrimitive: (filterId: string) => void;
  onDeleteSvgPrimitive: (filterId: string, primitiveId: string) => void;
  onUpdateSvgPrimitiveType: (
    filterId: string,
    primitiveId: string,
    type: SvgFilterDefinition['primitives'][number]['type']
  ) => void;
};

const getBindingLabel = (binding: AnimationBinding) =>
  binding.targetNodeId.trim() ? binding.targetNodeId : binding.id;

const getTrackLabel = (track: AnimationTrack) => {
  if (track.kind === 'style') return `style.${track.property}`;
  if (track.kind === 'css-filter') return `filter.${track.fn}`;
  return `svg.${track.filterId}.${track.primitiveId}.${track.attr}`;
};

export const AnimationEditorInspectorPanel = ({
  timeline,
  cursorMs,
  svgFilters,
  canRemoveSvgFilter,
  selection,
  onSelectionChange,
  onUpdateTimelineName,
  onUpdateTimelineDuration,
  onUpdateTimelineDelayMs,
  onUpdateTimelineIterations,
  onUpdateTimelineDirection,
  onUpdateTimelineFillMode,
  onUpdateTimelineEasing,
  onAddTrack,
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
  onAddSvgFilter,
  onDeleteSvgFilter,
  onUpdateSvgFilterUnits,
  onAddSvgPrimitive,
  onDeleteSvgPrimitive,
  onUpdateSvgPrimitiveType,
}: AnimationEditorInspectorPanelProps) => {
  const { t } = useTranslation('editor');
  const bindings = timeline?.bindings ?? [];
  const binding =
    bindings.find((item) => item.id === selection.bindingId) ?? bindings[0];
  const tracks = binding?.tracks ?? [];
  const track =
    tracks.find((item) => item.id === selection.trackId) ?? tracks[0];

  return (
    <aside className="flex h-full w-[var(--anim-inspector-width)] shrink-0 flex-col border-l border-black/8 bg-[rgb(var(--bg-canvas-rgb)_/_0.92)] backdrop-blur-sm">
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium tracking-[0.08em] text-(--text-secondary)">
              {t('animationEditor.inspector.timeline.title')}
            </h2>
            <div className="text-[11px] text-(--text-muted) tabular-nums">
              {cursorMs}ms
            </div>
          </div>
          <input
            value={timeline?.name ?? ''}
            onChange={(event) => onUpdateTimelineName(event.target.value)}
            placeholder={t('animationEditor.inspector.timeline.name')}
            aria-label={t('animationEditor.inspector.timeline.name')}
            title={t('animationEditor.inspector.timeline.name')}
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-(--text-primary) outline-none"
            disabled={!timeline}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={1}
              value={timeline?.durationMs ?? 0}
              onChange={(event) => onUpdateTimelineDuration(event.target.value)}
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-(--text-primary) outline-none"
              disabled={!timeline}
              placeholder={t('animationEditor.inspector.timeline.durationMs')}
              aria-label={t('animationEditor.inspector.timeline.durationMs')}
              title={t('animationEditor.inspector.timeline.durationMs')}
            />
            <input
              type="number"
              min={0}
              value={timeline?.delayMs ?? 0}
              onChange={(event) => onUpdateTimelineDelayMs(event.target.value)}
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-(--text-primary) outline-none"
              disabled={!timeline}
              placeholder={t('animationEditor.inspector.timeline.delayMs')}
              aria-label={t('animationEditor.inspector.timeline.delayMs')}
              title={t('animationEditor.inspector.timeline.delayMs')}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={
                timeline?.direction
                  ? timeline.direction
                  : ('' as TimelineDirection | '')
              }
              onChange={(event) =>
                onUpdateTimelineDirection(
                  event.target.value
                    ? (event.target.value as TimelineDirection)
                    : undefined
                )
              }
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-(--text-primary) outline-none"
              disabled={!timeline}
              aria-label={t('animationEditor.inspector.timeline.direction')}
              title={t('animationEditor.inspector.timeline.direction')}
            >
              <option value="">
                {t('animationEditor.inspector.timeline.direction')}
              </option>
              {DIRECTION_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {t('animationEditor.inspector.timeline.directionOption', {
                    value,
                  })}
                </option>
              ))}
            </select>
            <select
              value={
                timeline?.fillMode
                  ? timeline.fillMode
                  : ('' as TimelineFillMode | '')
              }
              onChange={(event) =>
                onUpdateTimelineFillMode(
                  event.target.value
                    ? (event.target.value as TimelineFillMode)
                    : undefined
                )
              }
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-(--text-primary) outline-none"
              disabled={!timeline}
              aria-label={t('animationEditor.inspector.timeline.fillMode')}
              title={t('animationEditor.inspector.timeline.fillMode')}
            >
              <option value="">
                {t('animationEditor.inspector.timeline.fillMode')}
              </option>
              {FILL_MODE_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {t('animationEditor.inspector.timeline.fillModeOption', {
                    value,
                  })}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={
                timeline?.iterations === 'infinite'
                  ? 'infinite'
                  : typeof timeline?.iterations === 'number'
                    ? String(timeline.iterations)
                    : ''
              }
              onChange={(event) =>
                onUpdateTimelineIterations(event.target.value)
              }
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-(--text-primary) outline-none"
              disabled={!timeline}
              aria-label={t('animationEditor.inspector.timeline.iterations')}
              title={t('animationEditor.inspector.timeline.iterations')}
            >
              <option value="">
                {t('animationEditor.inspector.timeline.iterations')}
              </option>
              <option value="infinite">
                {t('animationEditor.inspector.timeline.infinite')}
              </option>
              {Array.from({ length: 8 }).map((_, index) => (
                <option key={index + 1} value={String(index + 1)}>
                  {index + 1}
                </option>
              ))}
            </select>
            <input
              value={timeline?.easing ?? ''}
              onChange={(event) => onUpdateTimelineEasing(event.target.value)}
              placeholder={t('animationEditor.inspector.timeline.easing')}
              aria-label={t('animationEditor.inspector.timeline.easing')}
              title={t('animationEditor.inspector.timeline.easing')}
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-(--text-primary) outline-none"
              disabled={!timeline}
            />
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium tracking-[0.08em] text-(--text-secondary)">
              {t('animationEditor.inspector.binding.title')}
            </h2>
            <span className="text-[11px] text-(--text-muted) tabular-nums">
              {bindings.length}
            </span>
          </div>

          <select
            value={binding?.id ?? ''}
            onChange={(event) =>
              onSelectionChange({
                bindingId: event.target.value || undefined,
                trackId: undefined,
              })
            }
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-(--text-primary) outline-none"
            disabled={!timeline || bindings.length === 0}
            aria-label={t('animationEditor.inspector.binding.select')}
            title={t('animationEditor.inspector.binding.select')}
          >
            {bindings.map((item) => (
              <option key={item.id} value={item.id}>
                {getBindingLabel(item)}
              </option>
            ))}
          </select>

          {binding ? (
            <div className="space-y-1.5 rounded-xl bg-black/[0.03] p-3">
              <div className="text-[10px] tracking-[0.08em] text-(--text-muted) uppercase">
                {t('animationEditor.inspector.binding.targetNode')}
              </div>
              <div className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs text-(--text-primary)">
                {binding.targetNodeId}
              </div>
              <p className="m-0 text-[10px] text-(--text-muted)">
                {t('animationEditor.inspector.binding.targetHint')}
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-black/[0.03] px-3 py-2 text-[11px] text-(--text-muted)">
              {t('animationEditor.inspector.binding.empty')}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium tracking-[0.08em] text-(--text-secondary)">
              {t('animationEditor.inspector.track.title')}
            </h2>
            <div className="flex items-center gap-1">
              {binding ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const nextId = onAddTrack(binding.id, 'style');
                      if (nextId)
                        onSelectionChange({
                          bindingId: binding.id,
                          trackId: nextId,
                        });
                    }}
                    className="rounded-full border border-black/10 bg-white px-2 py-1 text-[11px] hover:bg-black/[0.03]"
                    title={t('animationEditor.inspector.track.addStyle')}
                  >
                    {t('animationEditor.inspector.track.addStyle')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextId = onAddTrack(binding.id, 'css-filter');
                      if (nextId)
                        onSelectionChange({
                          bindingId: binding.id,
                          trackId: nextId,
                        });
                    }}
                    className="rounded-full border border-black/10 bg-white px-2 py-1 text-[11px] hover:bg-black/[0.03]"
                    title={t('animationEditor.inspector.track.addFilter')}
                  >
                    {t('animationEditor.inspector.track.addFilter')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextId = onAddTrack(binding.id, 'svg-filter-attr');
                      if (nextId)
                        onSelectionChange({
                          bindingId: binding.id,
                          trackId: nextId,
                        });
                    }}
                    className="rounded-full border border-black/10 bg-white px-2 py-1 text-[11px] hover:bg-black/[0.03]"
                    title={t('animationEditor.inspector.track.addSvg')}
                  >
                    {t('animationEditor.inspector.track.addSvg')}
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <select
            value={track?.id ?? ''}
            onChange={(event) =>
              onSelectionChange({
                bindingId: binding?.id,
                trackId: event.target.value || undefined,
              })
            }
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-(--text-primary) outline-none"
            disabled={!binding || tracks.length === 0}
            aria-label={t('animationEditor.inspector.track.select')}
            title={t('animationEditor.inspector.track.select')}
          >
            {tracks.map((item) => (
              <option key={item.id} value={item.id}>
                {getTrackLabel(item)}
              </option>
            ))}
          </select>

          {binding && track ? (
            <div className="space-y-2 rounded-xl bg-black/[0.03] p-3">
              <select
                value={track.kind}
                onChange={(event) =>
                  onUpdateTrackKind(
                    binding.id,
                    track.id,
                    event.target.value as AnimationTrack['kind']
                  )
                }
                className="w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs text-(--text-primary) outline-none"
                aria-label={t('animationEditor.inspector.track.kind')}
                title={t('animationEditor.inspector.track.kind')}
              >
                {TRACK_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t('animationEditor.inspector.track.kindOption', { kind })}
                  </option>
                ))}
              </select>

              {track.kind === 'style' ? (
                <select
                  value={track.property}
                  onChange={(event) =>
                    onUpdateStyleTrackProperty(
                      binding.id,
                      track.id,
                      event.target.value as Extract<
                        AnimationTrack,
                        { kind: 'style' }
                      >['property']
                    )
                  }
                  className="w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs text-(--text-primary) outline-none"
                  aria-label={t('animationEditor.inspector.track.styleProp')}
                  title={t('animationEditor.inspector.track.styleProp')}
                >
                  {STYLE_PROPERTIES.map((property) => (
                    <option key={property} value={property}>
                      {t('animationEditor.inspector.track.stylePropOption', {
                        property,
                      })}
                    </option>
                  ))}
                </select>
              ) : null}

              {track.kind === 'css-filter' ? (
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={track.fn}
                    onChange={(event) =>
                      onUpdateCssTrackFn(
                        binding.id,
                        track.id,
                        event.target.value as Extract<
                          AnimationTrack,
                          { kind: 'css-filter' }
                        >['fn']
                      )
                    }
                    className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs text-(--text-primary) outline-none"
                    aria-label={t('animationEditor.inspector.track.filterFn')}
                    title={t('animationEditor.inspector.track.filterFn')}
                  >
                    {CSS_FILTER_FNS.map((fn) => (
                      <option key={fn} value={fn}>
                        {t('animationEditor.inspector.track.filterFnOption', {
                          fn,
                        })}
                      </option>
                    ))}
                  </select>
                  <select
                    value={track.unit ?? 'px'}
                    onChange={(event) =>
                      onUpdateCssTrackUnit(
                        binding.id,
                        track.id,
                        event.target.value as NonNullable<
                          Extract<
                            AnimationTrack,
                            { kind: 'css-filter' }
                          >['unit']
                        >
                      )
                    }
                    className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs text-(--text-primary) outline-none"
                    aria-label={t('animationEditor.inspector.track.unit')}
                    title={t('animationEditor.inspector.track.unit')}
                  >
                    {CSS_FILTER_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {t('animationEditor.inspector.track.unitOption', {
                          unit,
                        })}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {track.kind === 'svg-filter-attr' ? (
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={track.filterId}
                    onChange={(event) =>
                      onUpdateSvgTrackFilter(
                        binding.id,
                        track.id,
                        event.target.value
                      )
                    }
                    className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs text-(--text-primary) outline-none"
                    aria-label={t('animationEditor.inspector.track.svgFilter')}
                    title={t('animationEditor.inspector.track.svgFilter')}
                  >
                    {svgFilters.map((filter) => (
                      <option key={filter.id} value={filter.id}>
                        {t('animationEditor.inspector.track.svgFilterOption', {
                          id: filter.id,
                        })}
                      </option>
                    ))}
                  </select>
                  <select
                    value={track.primitiveId}
                    onChange={(event) =>
                      onUpdateSvgTrackPrimitive(
                        binding.id,
                        track.id,
                        event.target.value
                      )
                    }
                    className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs text-(--text-primary) outline-none"
                    aria-label={t(
                      'animationEditor.inspector.track.svgPrimitive'
                    )}
                    title={t('animationEditor.inspector.track.svgPrimitive')}
                  >
                    {(
                      svgFilters.find((filter) => filter.id === track.filterId)
                        ?.primitives ??
                      svgFilters[0]?.primitives ??
                      []
                    ).map((primitive) => (
                      <option key={primitive.id} value={primitive.id}>
                        {t(
                          'animationEditor.inspector.track.svgPrimitiveOption',
                          { id: primitive.id }
                        )}
                      </option>
                    ))}
                  </select>
                  <input
                    value={track.attr}
                    onChange={(event) =>
                      onUpdateSvgTrackAttr(
                        binding.id,
                        track.id,
                        event.target.value
                      )
                    }
                    className="col-span-2 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs text-(--text-primary) outline-none"
                    placeholder={t('animationEditor.inspector.track.attr')}
                    aria-label={t('animationEditor.inspector.track.attr')}
                    title={t('animationEditor.inspector.track.attr')}
                  />
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => onDeleteTrack(binding.id, track.id)}
                className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] text-(--text-secondary) hover:bg-black/[0.03]"
              >
                <Trash2 size={12} />
                {t('animationEditor.inspector.track.delete')}
              </button>
            </div>
          ) : null}
        </section>

        {binding && track && timeline ? (
          <AnimationEditorKeyframesEditor
            bindingId={binding.id}
            track={track}
            timelineDurationMs={timeline.durationMs}
            onAddKeyframe={onAddKeyframe}
            onDeleteKeyframe={onDeleteKeyframe}
            onUpdateKeyframeAtMs={onUpdateKeyframeAtMs}
            onUpdateKeyframeValue={onUpdateKeyframeValue}
            onUpdateKeyframeEasing={onUpdateKeyframeEasing}
            onUpdateKeyframeHold={onUpdateKeyframeHold}
          />
        ) : null}

        <AnimationEditorSvgFilterLibrarySection
          svgFilters={svgFilters}
          canRemoveSvgFilter={canRemoveSvgFilter}
          onAddSvgFilter={onAddSvgFilter}
          onDeleteSvgFilter={onDeleteSvgFilter}
          onUpdateSvgFilterUnits={onUpdateSvgFilterUnits}
          onAddSvgPrimitive={onAddSvgPrimitive}
          onDeleteSvgPrimitive={onDeleteSvgPrimitive}
          onUpdateSvgPrimitiveType={onUpdateSvgPrimitiveType}
        />
      </div>
    </aside>
  );
};
