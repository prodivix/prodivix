import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AnimationTimeline } from '@prodivix/animation';

type AnimationEditorTimelinesPanelProps = {
  timelines: AnimationTimeline[];
  activeTimelineId?: string;
  onAddTimeline: () => void;
  onSelectTimeline: (timelineId: string) => void;
  onDeleteTimeline: (timelineId: string) => void;
};

export const AnimationEditorTimelinesPanel = ({
  timelines,
  activeTimelineId,
  onAddTimeline,
  onSelectTimeline,
  onDeleteTimeline,
}: AnimationEditorTimelinesPanelProps) => {
  const { t } = useTranslation('editor');

  return (
    <aside className="w-[260px] shrink-0 rounded-2xl border border-black/8 bg-(--bg-canvas) p-3 max-[1280px]:w-full">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-(--text-primary)">
          {t('animationEditor.timelines.title')}
        </h2>
        <button
          type="button"
          onClick={onAddTimeline}
          className="inline-flex items-center gap-1 rounded border border-black/15 px-2 py-1 text-xs"
          aria-label={t('animationEditor.timelines.add')}
          title={t('animationEditor.timelines.add')}
        >
          <Plus size={12} />
          {t('animationEditor.timelines.add')}
        </button>
      </div>

      <div className="flex max-h-[70vh] flex-col gap-2 overflow-auto pr-1">
        {timelines.map((timeline, index) => {
          const isActive = timeline.id === activeTimelineId;
          return (
            <div
              key={timeline.id}
              className={`flex items-center gap-2 rounded-lg border px-2 py-2 ${
                isActive
                  ? 'border-black/20 bg-black text-white'
                  : 'border-black/10 bg-black/[0.015]'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectTimeline(timeline.id)}
                className="min-w-0 flex-1 text-left text-sm"
              >
                <span className="block truncate">
                  {timeline.name.trim() ||
                    t('animationEditor.common.timelineIndexed', {
                      index: index + 1,
                    })}
                </span>
                <span className="block text-[11px] opacity-75">
                  {timeline.durationMs}ms
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDeleteTimeline(timeline.id)}
                className={isActive ? 'text-white/80' : 'text-(--text-muted)'}
                aria-label={t('animationEditor.timelines.deleteTimeline')}
                title={t('animationEditor.timelines.deleteTimeline')}
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
