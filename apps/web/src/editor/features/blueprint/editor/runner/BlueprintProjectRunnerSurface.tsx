import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CircleStop,
  LoaderCircle,
  RefreshCcw,
  TriangleAlert,
} from 'lucide-react';
import type { BlueprintProjectRunnerState } from './useBlueprintProjectRunner';

export type BlueprintProjectRunnerSurfaceController = Readonly<{
  state: BlueprintProjectRunnerState;
  frameRevision: number;
  onRetry(): void;
}>;

type BlueprintProjectRunnerSurfaceProps = Readonly<{
  currentPath: string;
  runner: BlueprintProjectRunnerSurfaceController;
}>;

export const resolveProjectPreviewUrl = (
  previewUrl: string,
  currentPath: string
): string => {
  const url = new URL(previewUrl);
  const route = currentPath.startsWith('/') ? currentPath : `/${currentPath}`;
  url.pathname = route;
  url.search = '';
  url.hash = '';
  return url.href;
};

export function BlueprintProjectRunnerSurface({
  currentPath,
  runner,
}: BlueprintProjectRunnerSurfaceProps) {
  const { t } = useTranslation('blueprint');
  const { state, frameRevision, onRetry } = runner;
  const iframeUrl = useMemo(
    () =>
      state.previewUrl
        ? resolveProjectPreviewUrl(state.previewUrl, currentPath)
        : undefined,
    [currentPath, state.previewUrl]
  );
  const isPending = ['queued', 'starting', 'compiling'].includes(state.status);
  const isFailure = state.status === 'failed' || state.status === 'blocked';
  const isStopped = ['idle', 'cancelled', 'timed-out'].includes(state.status);

  return (
    <div className="relative h-full w-full overflow-hidden bg-white">
      {iframeUrl ? (
        <iframe
          key={`${iframeUrl}:${frameRevision}`}
          className="h-full w-full border-0 bg-white"
          src={iframeUrl}
          title={t('runner.previewTitle')}
          sandbox={
            state.provider === 'remote'
              ? 'allow-scripts'
              : 'allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts'
          }
          allow={
            state.provider === 'remote'
              ? undefined
              : 'clipboard-read; clipboard-write'
          }
          referrerPolicy="no-referrer"
        />
      ) : null}
      {!iframeUrl || isFailure ? (
        <div className="absolute inset-0 flex items-center justify-center bg-(--bg-canvas)/96 p-8">
          <div className="flex max-w-md flex-col items-center gap-3 text-center">
            {isFailure ? (
              <TriangleAlert size={22} className="text-(--danger-color)" />
            ) : isStopped ? (
              <CircleStop size={22} className="text-(--text-muted)" />
            ) : (
              <LoaderCircle
                size={22}
                className="animate-spin text-(--text-muted)"
              />
            )}
            <div className="text-sm font-medium text-(--text-primary)">
              {isFailure
                ? t('runner.failedTitle')
                : isStopped
                  ? t('runner.stoppedTitle')
                  : t('runner.preparingTitle')}
            </div>
            <div className="text-xs leading-5 text-(--text-muted)">
              {state.message ?? t('runner.preparingDescription')}
            </div>
            {isFailure || isStopped ? (
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-(--border-default) bg-(--bg-canvas) px-3 text-xs text-(--text-primary) hover:bg-(--bg-raised)"
                onClick={onRetry}
              >
                <RefreshCcw size={13} />
                {isStopped ? t('runner.start') : t('runner.retry')}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {iframeUrl && isPending ? (
        <div className="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-(--border-default) bg-(--bg-canvas)/92 px-3 py-1.5 text-[11px] text-(--text-muted) shadow-(--shadow-sm) backdrop-blur">
          <LoaderCircle size={12} className="animate-spin" />
          {state.message ?? t('runner.updating')}
        </div>
      ) : null}
    </div>
  );
}
