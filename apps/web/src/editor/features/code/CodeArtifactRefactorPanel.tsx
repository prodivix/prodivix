import { useTranslation } from 'react-i18next';

export type CodeLanguageRenameRefactorView =
  | Readonly<{ status: 'idle' }>
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

export type CodeArtifactRelocationRefactorView =
  | Readonly<{ status: 'idle' }>
  | Readonly<{
      status: 'editing';
      currentPath: string;
      nextPath: string;
      bindingCount: number;
      referenceCount: number;
      impactCount: number;
    }>;

type CodeArtifactRefactorPanelProps = Readonly<{
  rename: CodeLanguageRenameRefactorView;
  relocation: CodeArtifactRelocationRefactorView;
  busy: boolean;
  canRename: boolean;
  canRelocate: boolean;
  onStartRename(): void;
  onRenameNameChange(value: string): void;
  onPreviewRename(): void;
  onApplyRename(): void;
  onBackRename(): void;
  onCancelRename(): void;
  onOpenAffectedOwner(slotId: string): void;
  onStartRelocation(): void;
  onRelocationPathChange(value: string): void;
  onApplyRelocation(): void;
  onCancelRelocation(): void;
}>;

const secondaryButtonClass =
  'rounded-md border border-black/12 bg-(--bg-canvas) px-2.5 py-1.5 text-xs text-(--text-primary) hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40';

const primaryButtonClass =
  'rounded-md border border-black bg-black px-2.5 py-1.5 text-xs text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-40';

export function CodeArtifactRefactorPanel({
  rename,
  relocation,
  busy,
  canRename,
  canRelocate,
  onStartRename,
  onRenameNameChange,
  onPreviewRename,
  onApplyRename,
  onBackRename,
  onCancelRename,
  onOpenAffectedOwner,
  onStartRelocation,
  onRelocationPathChange,
  onApplyRelocation,
  onCancelRelocation,
}: CodeArtifactRefactorPanelProps) {
  const { t } = useTranslation('editor');
  const hasAffectedOwners =
    rename.status === 'preview' && rename.affectedOwners.length > 0;

  return (
    <div className="grid gap-2 rounded-lg border border-black/10 bg-black/[0.02] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="m-0 text-xs font-medium text-(--text-primary)">
            {t('resourceManager.code.refactor.title')}
          </p>
          <p className="m-0 mt-0.5 text-[11px] text-(--text-muted)">
            {t('resourceManager.code.refactor.description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={!canRename || busy || rename.status !== 'idle'}
            onClick={onStartRename}
            title={t('resourceManager.code.refactor.renameShortcut')}
          >
            {t('resourceManager.code.refactor.rename')}
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={!canRelocate || busy || relocation.status !== 'idle'}
            onClick={onStartRelocation}
          >
            {t('resourceManager.code.refactor.move')}
          </button>
        </div>
      </div>

      {rename.status === 'preparing' ? (
        <p className="m-0 text-xs text-(--text-secondary)" role="status">
          {t('resourceManager.code.refactor.preparingRename')}
        </p>
      ) : null}

      {rename.status === 'editing' ? (
        <form
          className="grid gap-2 rounded-md border border-black/10 bg-(--bg-canvas) p-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            onPreviewRename();
          }}
        >
          <label className="grid gap-1 text-[11px] text-(--text-secondary)">
            {t('resourceManager.code.refactor.renameLabel', {
              name: rename.currentName,
            })}
            <input
              autoFocus
              className="rounded-md border border-black/15 bg-(--bg-canvas) px-2 py-1.5 text-xs text-(--text-primary) outline-none focus:border-black/35"
              value={rename.nextName}
              onChange={(event) => onRenameNameChange(event.target.value)}
              disabled={busy}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={onCancelRename}
              disabled={busy}
            >
              {t('resourceManager.code.refactor.cancel')}
            </button>
            <button
              type="submit"
              className={primaryButtonClass}
              disabled={
                busy ||
                !rename.nextName.trim() ||
                rename.nextName.trim() === rename.currentName
              }
            >
              {t('resourceManager.code.refactor.preview')}
            </button>
          </div>
        </form>
      ) : null}

      {rename.status === 'preview' ? (
        <div className="grid gap-2 rounded-md border border-black/10 bg-(--bg-canvas) p-2.5 text-xs">
          <p className="m-0 text-(--text-secondary)">
            {t('resourceManager.code.refactor.renameImpact', {
              edits: rename.editCount,
              artifacts: rename.artifactCount,
            })}
          </p>
          {hasAffectedOwners ? (
            <div className="grid gap-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-950">
              <p className="m-0 text-[11px]">
                {t('resourceManager.code.refactor.ownerRewriteRequired', {
                  count: rename.affectedOwners.length,
                })}
              </p>
              <div className="flex flex-wrap gap-1.5">
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
          ) : (
            <p className="m-0 text-[11px] text-(--text-muted)">
              {t('resourceManager.code.refactor.renameSafe')}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={onBackRename}
              disabled={busy}
            >
              {t('resourceManager.code.refactor.back')}
            </button>
            <button
              type="button"
              className={primaryButtonClass}
              onClick={onApplyRename}
              disabled={busy || hasAffectedOwners}
            >
              {t('resourceManager.code.refactor.applyRename')}
            </button>
          </div>
        </div>
      ) : null}

      {relocation.status === 'editing' ? (
        <form
          className="grid gap-2 rounded-md border border-black/10 bg-(--bg-canvas) p-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            onApplyRelocation();
          }}
        >
          <label className="grid gap-1 text-[11px] text-(--text-secondary)">
            {t('resourceManager.code.refactor.pathLabel')}
            <input
              autoFocus
              className="rounded-md border border-black/15 bg-(--bg-canvas) px-2 py-1.5 font-mono text-xs text-(--text-primary) outline-none focus:border-black/35"
              value={relocation.nextPath}
              onChange={(event) => onRelocationPathChange(event.target.value)}
              disabled={busy}
            />
          </label>
          <p className="m-0 text-[11px] text-(--text-muted)">
            {t('resourceManager.code.refactor.moveImpact', {
              bindings: relocation.bindingCount,
              references: relocation.referenceCount,
              impacted: relocation.impactCount,
            })}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={onCancelRelocation}
              disabled={busy}
            >
              {t('resourceManager.code.refactor.cancel')}
            </button>
            <button
              type="submit"
              className={primaryButtonClass}
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
      ) : null}
    </div>
  );
}
