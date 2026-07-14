import { Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AnimationTimeline } from '@prodivix/animation';

type AnimationEditorTopBarProps = {
  timelines: AnimationTimeline[];
  activeTimelineId?: string;
  onSelectTimeline: (timelineId: string) => void;
  onAddTimeline: () => void;
  onDeleteTimeline: (timelineId: string) => void;
  disabled?: boolean;
  documentControls?: ReactNode;
};

export const AnimationEditorTopBar = ({
  timelines,
  activeTimelineId,
  onSelectTimeline,
  onAddTimeline,
  onDeleteTimeline,
  disabled = false,
  documentControls,
}: AnimationEditorTopBarProps) => {
  const { t } = useTranslation('editor');

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-black/8 bg-[rgb(var(--bg-canvas-rgb)_/_0.92)] px-3 backdrop-blur-sm">
      <div className="shrink-0 text-xs font-medium tracking-[0.02em] text-(--text-primary)">
        {t('animationEditor.topBar.title')}
      </div>

      {documentControls}

      <div className="flex min-w-0 flex-1 [scrollbar-width:none] items-center gap-1 overflow-auto [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {timelines.map((timeline, index) => {
          const active = timeline.id === activeTimelineId;
          return (
            <button
              key={timeline.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelectTimeline(timeline.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-xs transition-colors ${
                active
                  ? 'bg-black text-white'
                  : 'bg-black/[0.04] text-(--text-secondary) hover:bg-black/[0.07]'
              }`}
            >
              <span className="max-w-[160px] truncate">
                {timeline.name.trim() ||
                  t('animationEditor.common.timelineIndexed', {
                    index: index + 1,
                  })}
              </span>
              {timelines.length > 1 ? (
                <span
                  className={`inline-flex h-4 w-4 items-center justify-center rounded-full ${
                    active ? 'hover:bg-white/15' : 'hover:bg-black/10'
                  } disabled:cursor-not-allowed disabled:opacity-35`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteTimeline(timeline.id);
                  }}
                  role="button"
                  aria-label={t('animationEditor.topBar.closeTimeline')}
                  title={t('animationEditor.topBar.closeTimeline')}
                >
                  <Trash2 size={12} />
                </span>
              ) : null}
            </button>
          );
        })}

        <button
          type="button"
          onClick={onAddTimeline}
          disabled={disabled}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-(--text-secondary) transition-colors hover:border-black/15 hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-35"
        >
          <Plus size={12} />
          {t('animationEditor.topBar.new')}
        </button>
      </div>
    </header>
  );
};
