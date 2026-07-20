import { useEffect, useRef, type RefObject } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type EditorSurfaceAnchor = Readonly<{
  left: number;
  top: number;
}>;

export type CodeLanguageRenameOverlayView =
  | Readonly<{ status: 'preparing' }>
  | Readonly<{
      status: 'editing';
      currentName: string;
      nextName: string;
    }>
  | Readonly<{
      status: 'preview';
      currentName: string;
      nextName: string;
      editCount: number;
      artifactCount: number;
      affectedOwners: readonly Readonly<{
        slotId: string;
        label: string;
      }>[];
    }>;

export type CodeArtifactRelocationOverlayView = Readonly<{
  currentPath: string;
  nextPath: string;
  bindingCount: number;
  referenceCount: number;
  impactCount: number;
}>;

export type CodeLanguageLocationOverlayItem = Readonly<{
  id: string;
  label: string;
}>;

const menuItemClassName =
  'flex w-full items-center justify-between gap-6 rounded px-2 py-1.5 text-left text-xs text-(--text-primary) hover:bg-black/5 disabled:cursor-not-allowed disabled:text-(--text-muted) disabled:hover:bg-transparent';

const secondaryButtonClassName =
  'rounded border border-black/12 bg-(--bg-canvas) px-2 py-1 text-[11px] text-(--text-primary) hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40';

const primaryButtonClassName =
  'rounded border border-black bg-black px-2 py-1 text-[11px] text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-40';

const useDismissibleOverlay = (
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void
) => {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      onDismiss();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onDismiss();
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onDismiss, ref]);
};

type CodeEditorContextMenuProps = Readonly<{
  anchor: EditorSurfaceAnchor;
  canNavigate: boolean;
  canRename: boolean;
  onGoToDefinition(): void;
  onFindReferences(): void;
  onRename(): void;
  onDismiss(): void;
}>;

export function CodeEditorContextMenu({
  anchor,
  canNavigate,
  canRename,
  onGoToDefinition,
  onFindReferences,
  onRename,
  onDismiss,
}: CodeEditorContextMenuProps) {
  const { t } = useTranslation('editor');
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissibleOverlay(menuRef, onDismiss);

  useEffect(() => {
    menuRef.current
      ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
      ?.focus();
  }, []);

  const run = (action: () => void) => {
    onDismiss();
    action();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t('resourceManager.code.language.actions.contextMenu')}
      className="absolute z-50 min-w-[230px] rounded-md border border-black/12 bg-(--bg-canvas) p-1 shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
      style={{ left: anchor.left, top: anchor.top }}
    >
      <button
        type="button"
        role="menuitem"
        className={menuItemClassName}
        disabled={!canNavigate}
        onClick={() => run(onGoToDefinition)}
      >
        <span>{t('resourceManager.code.language.actions.goToDefinition')}</span>
        <kbd className="text-[10px] text-(--text-muted)">F12</kbd>
      </button>
      <button
        type="button"
        role="menuitem"
        className={menuItemClassName}
        disabled={!canNavigate}
        onClick={() => run(onFindReferences)}
      >
        <span>{t('resourceManager.code.language.actions.findReferences')}</span>
        <kbd className="text-[10px] text-(--text-muted)">Shift+F12</kbd>
      </button>
      <div className="my-1 border-t border-black/8" />
      <button
        type="button"
        role="menuitem"
        className={menuItemClassName}
        disabled={!canRename}
        onClick={() => run(onRename)}
      >
        <span>{t('resourceManager.code.refactor.rename')}</span>
        <kbd className="text-[10px] text-(--text-muted)">F2</kbd>
      </button>
    </div>
  );
}

type CodeLanguageRenameOverlayProps = Readonly<{
  anchor: EditorSurfaceAnchor;
  rename: CodeLanguageRenameOverlayView;
  busy: boolean;
  onNameChange(value: string): void;
  onPreview(): void;
  onApply(): void;
  onBack(): void;
  onCancel(): void;
  onOpenAffectedOwner(slotId: string): void;
}>;

export function CodeLanguageRenameOverlay({
  anchor,
  rename,
  busy,
  onNameChange,
  onPreview,
  onApply,
  onBack,
  onCancel,
  onOpenAffectedOwner,
}: CodeLanguageRenameOverlayProps) {
  const { t } = useTranslation('editor');
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useDismissibleOverlay(overlayRef, onCancel);

  useEffect(() => {
    if (rename.status !== 'editing') return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [rename.status]);

  const hasAffectedOwners =
    rename.status === 'preview' && rename.affectedOwners.length > 0;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-label={t('resourceManager.code.refactor.rename')}
      className="absolute z-40 rounded-md border border-black/15 bg-(--bg-canvas) p-2 shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
      style={{
        left: anchor.left,
        top: anchor.top,
        width: 'min(340px, calc(100% - 16px))',
      }}
    >
      {rename.status === 'preparing' ? (
        <p className="m-0 text-xs text-(--text-secondary)" role="status">
          {t('resourceManager.code.refactor.preparingRename')}
        </p>
      ) : null}

      {rename.status === 'editing' ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onPreview();
          }}
        >
          <input
            ref={inputRef}
            aria-label={t('resourceManager.code.refactor.renameLabel', {
              name: rename.currentName,
            })}
            className="h-7 min-w-0 flex-1 rounded border border-black/20 bg-(--bg-canvas) px-2 font-mono text-xs text-(--text-primary) outline-none focus:border-black/45"
            value={rename.nextName}
            onChange={(event) => onNameChange(event.target.value)}
            disabled={busy}
          />
          <button
            type="submit"
            className={primaryButtonClassName}
            disabled={
              busy ||
              !rename.nextName.trim() ||
              rename.nextName.trim() === rename.currentName
            }
          >
            {t('resourceManager.code.refactor.preview')}
          </button>
        </form>
      ) : null}

      {rename.status === 'preview' ? (
        <div className="grid gap-2 text-xs">
          <p className="m-0 text-(--text-secondary)" role="status">
            {t('resourceManager.code.refactor.renameImpact', {
              edits: rename.editCount,
              artifacts: rename.artifactCount,
            })}
          </p>
          {hasAffectedOwners ? (
            <div className="grid gap-1 rounded border border-amber-300 bg-amber-50 p-2 text-amber-950">
              <p className="m-0 text-[11px]">
                {t('resourceManager.code.refactor.ownerRewriteRequired', {
                  count: rename.affectedOwners.length,
                })}
              </p>
              <div className="flex flex-wrap gap-1">
                {rename.affectedOwners.map((owner) => (
                  <button
                    key={owner.slotId}
                    type="button"
                    className="rounded border border-amber-400 bg-white px-2 py-1 text-[10px] hover:bg-amber-100"
                    onClick={() => onOpenAffectedOwner(owner.slotId)}
                  >
                    {owner.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              className={secondaryButtonClassName}
              onClick={onCancel}
              disabled={busy}
            >
              {t('resourceManager.code.refactor.cancel')}
            </button>
            <button
              type="button"
              className={secondaryButtonClassName}
              onClick={onBack}
              disabled={busy}
            >
              {t('resourceManager.code.refactor.back')}
            </button>
            <button
              type="button"
              className={primaryButtonClassName}
              onClick={onApply}
              disabled={busy || hasAffectedOwners}
            >
              {t('resourceManager.code.refactor.applyRename')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type CodeLanguageLocationsOverlayProps = Readonly<{
  anchor: EditorSurfaceAnchor;
  statusText: string;
  locations: readonly CodeLanguageLocationOverlayItem[];
  onOpen(id: string): void;
  onDismiss(): void;
}>;

export function CodeLanguageLocationsOverlay({
  anchor,
  statusText,
  locations,
  onOpen,
  onDismiss,
}: CodeLanguageLocationsOverlayProps) {
  const { t } = useTranslation('editor');
  const overlayRef = useRef<HTMLDivElement>(null);
  useDismissibleOverlay(overlayRef, onDismiss);

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-label={t('resourceManager.code.language.query.results')}
      className="absolute z-40 grid gap-1 rounded-md border border-black/15 bg-(--bg-canvas) p-2 shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
      style={{
        left: anchor.left,
        top: anchor.top,
        width: 'min(440px, calc(100% - 16px))',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className="m-0 truncate text-[11px] text-(--text-secondary)"
          role="status"
        >
          {statusText}
        </p>
        <button
          type="button"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-(--text-muted) hover:bg-black/5 hover:text-(--text-primary)"
          aria-label={t('resourceManager.code.language.query.close')}
          onClick={onDismiss}
        >
          <X size={12} />
        </button>
      </div>
      {locations.length ? (
        <div className="grid max-h-48 gap-0.5 overflow-auto">
          {locations.map((location) => (
            <button
              key={location.id}
              type="button"
              className="truncate rounded px-2 py-1.5 text-left font-mono text-[11px] text-(--text-primary) hover:bg-black/5"
              onClick={() => onOpen(location.id)}
            >
              {location.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type CodeArtifactRelocationOverlayProps = Readonly<{
  anchor: EditorSurfaceAnchor;
  relocation: CodeArtifactRelocationOverlayView;
  busy: boolean;
  onPathChange(value: string): void;
  onApply(): void;
  onCancel(): void;
}>;

export function CodeArtifactRelocationOverlay({
  anchor,
  relocation,
  busy,
  onPathChange,
  onApply,
  onCancel,
}: CodeArtifactRelocationOverlayProps) {
  const { t } = useTranslation('editor');
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useDismissibleOverlay(overlayRef, onCancel);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-label={t('resourceManager.code.refactor.move')}
      className="fixed z-[60] grid gap-2 rounded-md border border-black/15 bg-(--bg-canvas) p-2 shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
      style={{
        left: anchor.left,
        top: anchor.top,
        width: 'min(380px, calc(100vw - 16px))',
      }}
    >
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onApply();
        }}
      >
        <label className="grid gap-1 text-[11px] text-(--text-secondary)">
          {t('resourceManager.code.refactor.pathLabel')}
          <input
            ref={inputRef}
            className="h-7 rounded border border-black/20 bg-(--bg-canvas) px-2 font-mono text-xs text-(--text-primary) outline-none focus:border-black/45"
            value={relocation.nextPath}
            onChange={(event) => onPathChange(event.target.value)}
            disabled={busy}
          />
        </label>
        <p className="m-0 text-[10px] text-(--text-muted)">
          {t('resourceManager.code.refactor.moveImpact', {
            bindings: relocation.bindingCount,
            references: relocation.referenceCount,
            impacted: relocation.impactCount,
          })}
        </p>
        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            className={secondaryButtonClassName}
            onClick={onCancel}
            disabled={busy}
          >
            {t('resourceManager.code.refactor.cancel')}
          </button>
          <button
            type="submit"
            className={primaryButtonClassName}
            disabled={
              busy ||
              !relocation.nextPath.trim() ||
              relocation.nextPath.trim() === relocation.currentPath
            }
          >
            {t('resourceManager.code.refactor.applyMove')}
          </button>
        </div>
      </form>
    </div>
  );
}
