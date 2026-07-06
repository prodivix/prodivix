import { AlertTriangle, Check, CloudOff, Loader2, Save } from 'lucide-react';
import type {
  SaveIndicatorTone,
  SaveStatus,
  SaveTransport,
} from '@/editor/features/blueprint/editor/model/autosave';

type BlueprintEditorSaveIndicatorProps = {
  status: SaveStatus;
  transport: SaveTransport;
  label: string;
  tone: SaveIndicatorTone;
  isWorkspaceSaveDisabled: boolean;
  hasPendingChanges: boolean;
  isManualSave: boolean;
  onSaveNow?: () => void;
};

export function BlueprintEditorSaveIndicator({
  status,
  transport,
  label,
  tone,
  isWorkspaceSaveDisabled,
  hasPendingChanges,
  isManualSave,
  onSaveNow,
}: BlueprintEditorSaveIndicatorProps) {
  const canManualSave =
    isManualSave && hasPendingChanges && status !== 'saving';
  const icon =
    status === 'error' ? (
      <AlertTriangle size={14} />
    ) : status === 'saving' ? (
      <Loader2 size={14} className="animate-spin" />
    ) : isWorkspaceSaveDisabled ? (
      <CloudOff size={14} />
    ) : canManualSave ? (
      <Save size={14} />
    ) : (
      <Check size={14} />
    );
  const className = `inline-flex h-7 w-7 items-center justify-center rounded-full border ${
    tone === 'error'
      ? 'border-(--danger-color) bg-(--danger-subtle) text-(--danger-color)'
      : tone === 'warning'
        ? 'border-(--warning-color) bg-(--warning-subtle) text-(--warning-color)'
        : tone === 'success'
          ? 'border-(--success-color) bg-(--success-subtle) text-(--success-color)'
          : 'border-(--border-default) bg-(--bg-raised) text-(--text-secondary)'
  }`;

  if (canManualSave) {
    return (
      <button
        type="button"
        data-testid="blueprint-save-indicator"
        data-status={status}
        data-transport={transport ?? 'none'}
        title={label}
        aria-label={label}
        className={`${className} hover:bg-(--bg-panel) hover:text-(--text-primary)`}
        onClick={onSaveNow}
      >
        {icon}
      </button>
    );
  }

  return (
    <div
      data-testid="blueprint-save-indicator"
      data-status={status}
      data-transport={transport ?? 'none'}
      title={label}
      aria-live="polite"
      className={className}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </div>
  );
}
