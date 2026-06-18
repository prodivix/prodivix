import type {
  AnimationTimeline,
  AnimationTrack,
} from '@prodivix/shared/types/pir';
import { useTranslation } from 'react-i18next';
import { getTrackTitle } from '@/editor/features/animation/animationEditorUi';

export type AnimationEditorTrackRef = {
  timelineId: string;
  bindingId: string;
  trackId: string;
};

type TrackRow = {
  timelineId: string;
  timelineName: string;
  bindingLabel: string;
  durationMs: number;
  track?: AnimationTrack;
  ref?: AnimationEditorTrackRef;
};

type AnimationEditorTimelinePanelProps = {
  timelines: AnimationTimeline[];
  activeTimelineId?: string;
  cursorMs: number;
  onCursorChange: (nextMs: number) => void;
  selectedTrack?: AnimationEditorTrackRef;
  onSelectTimeline?: (timelineId: string) => void;
  onSelectTrack?: (ref: AnimationEditorTrackRef) => void;
};

const clampMs = (value: number, durationMs: number) =>
  Math.min(durationMs, Math.max(0, Math.round(value)));

const buildTrackRows = (
  timelines: AnimationTimeline[],
  resolveTimelineName: (timeline: AnimationTimeline, index: number) => string
): TrackRow[] =>
  timelines.flatMap((timeline, index) => {
    const timelineName = resolveTimelineName(timeline, index);
    const trackRows = timeline.bindings.flatMap((binding) =>
      binding.tracks.map((track) => ({
        timelineId: timeline.id,
        timelineName,
        durationMs: timeline.durationMs,
        bindingLabel: binding.targetNodeId,
        track,
        ref: {
          timelineId: timeline.id,
          bindingId: binding.id,
          trackId: track.id,
        },
      }))
    );
    if (trackRows.length) return trackRows;
    return [
      {
        timelineId: timeline.id,
        timelineName,
        durationMs: timeline.durationMs,
        bindingLabel: '-',
      },
    ];
  });

export const AnimationEditorTimelinePanel = ({
  timelines,
  activeTimelineId,
  cursorMs,
  onCursorChange,
  selectedTrack,
  onSelectTimeline,
  onSelectTrack,
}: AnimationEditorTimelinePanelProps) => {
  const { t } = useTranslation('editor');
  const maxDurationMs = Math.max(
    1,
    ...timelines.map((timeline) => timeline.durationMs)
  );
  const clampedCursor = clampMs(cursorMs, maxDurationMs);
  const rows = buildTrackRows(
    timelines,
    (timeline, index) =>
      timeline.name.trim() ||
      t('animationEditor.common.timelineIndexed', {
        index: index + 1,
      })
  );
  const ticks = 8;

  return (
    <section className="flex h-[var(--anim-timeline-height)] shrink-0 flex-col border-t border-black/8 bg-[rgb(var(--bg-canvas-rgb)_/_0.92)] backdrop-blur-sm">
      <div className="grid h-8 grid-cols-[260px_1fr] items-center border-b border-black/8">
        <div className="px-3 text-[11px] font-medium tracking-[0.14em] text-(--text-muted) uppercase">
          {t('animationEditor.timelinePanel.lanes')}
        </div>
        <div className="relative h-full">
          {Array.from({ length: ticks + 1 }).map((_, index) => {
            const percent = (index / ticks) * 100;
            const ms = Math.round((index / ticks) * maxDurationMs);
            return (
              <div
                key={index}
                className="absolute top-0 flex h-full flex-col justify-center"
                style={{ left: `${percent}%` }}
              >
                <div className="h-2 w-px bg-black/12" />
                <div className="mt-1 -translate-x-1/2 text-[10px] text-(--text-muted)">
                  {ms}ms
                </div>
              </div>
            );
          })}

          <div
            className="absolute top-0 h-full w-px bg-black/30"
            style={{ left: `${(clampedCursor / maxDurationMs) * 100}%` }}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {timelines.length === 0 ? (
          <div className="p-6 text-sm text-(--text-muted)">
            {t('animationEditor.timelinePanel.noTimeline')}
          </div>
        ) : (
          <div className="relative min-h-0">
            <div
              className="absolute top-0 bottom-0 left-[260px] w-px bg-black/8"
              aria-hidden="true"
            />
            {rows.map((row, index) => {
              const isSelected =
                selectedTrack?.timelineId === row.ref?.timelineId &&
                selectedTrack?.bindingId === row.ref?.bindingId &&
                selectedTrack?.trackId === row.ref?.trackId;
              const isActiveTimeline = row.timelineId === activeTimelineId;
              return (
                <div
                  key={`${row.timelineId}-${row.ref?.bindingId ?? 'empty'}-${row.ref?.trackId ?? index}`}
                  className={`grid h-9 grid-cols-[260px_1fr] items-stretch ${
                    isSelected
                      ? 'bg-black/[0.05]'
                      : isActiveTimeline
                        ? 'bg-black/[0.02]'
                        : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTimeline?.(row.timelineId);
                      if (row.ref) {
                        onSelectTrack?.(row.ref);
                      }
                    }}
                    className="flex min-w-0 items-center gap-2 px-3 text-left text-xs text-(--text-secondary)"
                  >
                    <span className="max-w-[82px] truncate text-(--text-muted)">
                      {row.timelineName}
                    </span>
                    <span className="max-w-[72px] truncate text-(--text-muted)">
                      {row.bindingLabel}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {row.track
                        ? getTrackTitle(row.track)
                        : t('animationEditor.timelinePanel.noTracks')}
                    </span>
                  </button>

                  <div
                    className="relative"
                    onPointerDown={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const percent = (event.clientX - rect.left) / rect.width;
                      const nextMs = clampMs(
                        percent * maxDurationMs,
                        maxDurationMs
                      );
                      onCursorChange(nextMs);
                      onSelectTimeline?.(row.timelineId);
                      if (row.ref) {
                        onSelectTrack?.(row.ref);
                      }
                    }}
                  >
                    <div
                      className="absolute inset-y-2 rounded bg-black/[0.04]"
                      style={{
                        width: `${(row.durationMs / maxDurationMs) * 100}%`,
                      }}
                      aria-hidden="true"
                    />
                    <div
                      className="absolute top-0 bottom-0 w-px bg-black/30"
                      style={{
                        left: `${(clampedCursor / maxDurationMs) * 100}%`,
                      }}
                      aria-hidden="true"
                    />
                    {row.track
                      ? row.track.keyframes.map((keyframe, keyframeIndex) => {
                          const left = `${(keyframe.atMs / maxDurationMs) * 100}%`;
                          return (
                            <button
                              key={`${row.ref?.trackId}-${keyframe.atMs}-${keyframeIndex}`}
                              type="button"
                              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/65 transition-transform hover:scale-125"
                              style={{ left }}
                              onClick={(event) => {
                                event.stopPropagation();
                                onCursorChange(keyframe.atMs);
                                onSelectTimeline?.(row.timelineId);
                                if (row.ref) {
                                  onSelectTrack?.(row.ref);
                                }
                              }}
                              aria-label={t(
                                'animationEditor.timelinePanel.keyframe'
                              )}
                              title={t(
                                'animationEditor.timelinePanel.keyframe'
                              )}
                            />
                          );
                        })
                      : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
