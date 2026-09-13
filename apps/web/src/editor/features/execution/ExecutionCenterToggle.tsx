import { ChevronDown, ChevronUp, SquareTerminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type ExecutionCenterToggleProps = Readonly<{
  panelId: string;
  collapsed: boolean;
  disabled?: boolean;
  onToggle(): void;
}>;

export function ExecutionCenterToggle({
  panelId,
  collapsed,
  disabled,
  onToggle,
}: ExecutionCenterToggleProps) {
  const { t } = useTranslation('editor');
  const label = t(collapsed ? 'execution.expand' : 'execution.collapse');
  return (
    <button
      type="button"
      className="inline-flex h-6 flex-none items-center gap-1 rounded-full border border-(--border-default) bg-(--bg-canvas) px-2 text-[11px] leading-none whitespace-nowrap text-(--text-secondary) transition-colors hover:bg-(--bg-raised) disabled:cursor-not-allowed disabled:opacity-40"
      aria-label={label}
      aria-controls={panelId}
      aria-expanded={!collapsed}
      title={label}
      disabled={disabled}
      onClick={onToggle}
    >
      <SquareTerminal size={12} aria-hidden="true" />
      <span>{t('execution.title')}</span>
      {collapsed ? (
        <ChevronUp size={12} aria-hidden="true" />
      ) : (
        <ChevronDown size={12} aria-hidden="true" />
      )}
    </button>
  );
}
