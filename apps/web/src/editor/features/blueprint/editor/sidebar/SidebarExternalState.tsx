import { RotateCw } from 'lucide-react';
import type { PluginDiagnostic } from '@prodivix/plugin-contracts';

type SidebarExternalStateProps = {
  diagnostics: readonly PluginDiagnostic[];
  hasExternalItems: boolean;
  isLoading: boolean;
  onReloadExternalLibraries?: () => Promise<void> | void;
};

export function SidebarExternalState({
  diagnostics,
  hasExternalItems,
  isLoading,
  onReloadExternalLibraries,
}: SidebarExternalStateProps) {
  return (
    <>
      {diagnostics.length > 0 && (
        <div className="px-3 pb-2">
          <div className="grid max-h-24 gap-1 overflow-auto rounded-md border border-(--border-default) bg-(--bg-raised) p-1.5 text-[10px]">
            {diagnostics.map((item, index) => (
              <div
                key={`${item.code}-${item.meta.pluginId ?? 'global'}-${index}`}
                className="rounded px-1.5 py-1 text-(--text-muted)"
                title={item.hint}
              >
                <span className="mr-1 font-medium text-(--text-secondary)">
                  [{item.code}]
                </span>
                <span>{item.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {isLoading && (
        <div className="px-3 pb-2">
          <div className="rounded-md border border-(--border-default) bg-(--bg-raised) px-2 py-1.5 text-[10px] text-(--text-muted)">
            Loading external components...
          </div>
        </div>
      )}
      {!isLoading && !hasExternalItems && (
        <div className="px-3 pb-2">
          <div className="flex items-center justify-between gap-2 rounded-md border border-(--border-default) bg-(--bg-raised) px-2 py-1.5 text-[10px] text-(--text-muted)">
            <span>No external components available.</span>
            <button
              type="button"
              className="inline-flex h-4 w-4 items-center justify-center rounded border border-(--border-default) text-(--text-muted) transition-colors hover:border-(--border-strong) hover:text-(--text-primary) disabled:cursor-default disabled:opacity-40"
              onClick={() => {
                void onReloadExternalLibraries?.();
              }}
              aria-label="Reload external components"
              title="Reload external components"
              disabled={!onReloadExternalLibraries}
            >
              <RotateCw size={10} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
