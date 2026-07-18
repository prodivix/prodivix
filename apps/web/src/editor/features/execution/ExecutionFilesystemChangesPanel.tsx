import { FileDiff, LoaderCircle, RefreshCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ExecutionFilesystemChangesController } from './useExecutionFilesystemChanges';

export const ExecutionFilesystemChangesPanel = ({
  controller,
}: Readonly<{ controller: ExecutionFilesystemChangesController }>) => {
  const { t } = useTranslation('editor');
  if (controller.status === 'unavailable' || controller.status === 'idle') {
    return (
      <div className="flex h-full items-center justify-center font-sans">
        <div className="flex max-w-xl items-start gap-3 rounded-lg border border-(--border-default) bg-(--bg-canvas) px-4 py-3">
          <FileDiff className="mt-0.5 shrink-0 text-(--text-muted)" size={16} />
          <span className="text-[10px] leading-4 text-(--text-secondary)">
            {t(
              controller.status === 'unavailable'
                ? 'execution.files.unavailable'
                : 'execution.files.waiting'
            )}
          </span>
        </div>
      </div>
    );
  }
  if (controller.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center gap-2 font-sans text-[10px] text-(--text-muted)">
        <LoaderCircle className="animate-spin" size={14} />
        {t('execution.files.loading')}
      </div>
    );
  }
  if (controller.status === 'error' && !controller.entries.length) {
    return (
      <div className="flex h-full items-center justify-center font-sans">
        <div className="max-w-xl rounded-lg border border-(--border-default) bg-(--bg-canvas) px-4 py-3 text-[10px] text-(--text-secondary)">
          <p>{controller.message ?? t('execution.files.loadFailed')}</p>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-(--border-default) px-2 py-1 text-(--text-primary) hover:bg-(--bg-raised)"
            onClick={controller.retry}
          >
            <RefreshCcw size={11} />
            {t('execution.files.retry')}
          </button>
        </div>
      </div>
    );
  }

  const selected = new Set(controller.selectedChangeIds);
  return (
    <div className="flex min-h-full flex-col gap-2 font-sans">
      <div className="flex items-center gap-2 text-[10px] text-(--text-muted)">
        <span>
          {controller.complete
            ? t('execution.files.complete')
            : t('execution.files.incomplete')}
        </span>
        {controller.status === 'applied' ? (
          <span className="text-(--text-primary)">
            {t('execution.files.applied')}
          </span>
        ) : null}
        {controller.status === 'error' && controller.message ? (
          <span className="text-(--danger-color)">{controller.message}</span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-(--border-subtle) bg-(--bg-canvas)">
        {controller.entries.length ? (
          controller.entries.map((entry) => {
            const eligible = entry.status === 'eligible';
            const target =
              entry.kind === 'added' ? `/${entry.path}` : entry.documentId;
            const detail = eligible
              ? entry.documentType
                ? `${t(`execution.files.documentType.${entry.documentType}`)} · ${target}`
                : target
              : t(`execution.files.reason.${entry.reason}`);
            return (
              <label
                key={entry.changeId}
                className="grid grid-cols-[18px_70px_minmax(140px,1fr)_minmax(120px,1fr)] items-center gap-2 border-b border-(--border-subtle) px-2 py-1.5 text-[10px] last:border-b-0"
              >
                <input
                  type="checkbox"
                  aria-label={t('execution.files.select', { path: entry.path })}
                  checked={selected.has(entry.changeId)}
                  disabled={
                    !eligible ||
                    controller.readonly ||
                    controller.status === 'applying'
                  }
                  onChange={() => controller.toggle(entry.changeId)}
                />
                <span className="text-(--text-muted)">
                  {t(`execution.files.kind.${entry.kind}`)}
                </span>
                <span
                  className="truncate font-mono text-(--text-primary)"
                  title={entry.path}
                >
                  {entry.path}
                </span>
                <span
                  className={`truncate ${
                    eligible
                      ? 'text-(--text-secondary)'
                      : 'text-(--warning-color)'
                  }`}
                  title={detail}
                >
                  {detail}
                </span>
              </label>
            );
          })
        ) : (
          <div className="flex h-full min-h-16 items-center justify-center text-[10px] text-(--text-muted)">
            {t('execution.files.empty')}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-(--text-muted)">
          {controller.readonly
            ? t('execution.files.readonly')
            : t('execution.files.selected', {
                count: controller.selectedChangeIds.length,
              })}
        </span>
        <button
          type="button"
          className="rounded-md border border-(--border-default) bg-(--bg-raised) px-2.5 py-1 font-medium text-(--text-primary) hover:border-(--border-strong) disabled:cursor-not-allowed disabled:opacity-40"
          disabled={
            controller.readonly ||
            !controller.selectedChangeIds.length ||
            controller.status === 'applying'
          }
          onClick={() => void controller.apply()}
        >
          {t(
            controller.status === 'applying'
              ? 'execution.files.applying'
              : 'execution.files.apply'
          )}
        </button>
      </div>
    </div>
  );
};
