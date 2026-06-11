import { useEffect, useState } from 'react';
import {
  Box,
  Check,
  Clock,
  CloudUpload,
  Copy,
  Globe,
  Layers,
  Lock,
  MoreHorizontal,
  Pencil,
  Trash2,
  Workflow,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { truncate } from '@prodivix/shared/safety';
import { isLocalProjectId, isSyncedLocalProject } from './localProjectStore';
import type { ProjectHomeItem } from './EditorHomeTypes';

export function ProjectCard({
  project,
  onOpen,
  onRename,
  onPublish,
  onSync,
  onDuplicate,
  onDelete,
  canSyncLocalProject,
  isRenaming,
  isPublishing,
  isSyncing,
  isDuplicating,
  isDeleting,
}: {
  project: ProjectHomeItem;
  onOpen: (project: ProjectHomeItem) => void;
  onRename: (project: ProjectHomeItem, name: string) => Promise<boolean>;
  onPublish: (project: ProjectHomeItem) => void;
  onSync: (project: ProjectHomeItem) => void;
  onDuplicate: (project: ProjectHomeItem) => void;
  onDelete: (project: ProjectHomeItem) => void;
  canSyncLocalProject: boolean;
  isRenaming: boolean;
  isPublishing: boolean;
  isSyncing: boolean;
  isDuplicating: boolean;
  isDeleting: boolean;
}) {
  const { t } = useTranslation('editor');
  const [isActionsOpen, setActionsOpen] = useState(false);
  const [draftName, setDraftName] = useState(project.name || '');
  const [isEditingName, setEditingName] = useState(false);
  const isClonedProject = /\(copy\)\s*$/i.test(project.name || '');
  const isLocalProject =
    project.source === 'local' || isLocalProjectId(project.id);
  const isReadonlyLocalCache = isSyncedLocalProject(project.localRecord);
  const canRename = !isReadonlyLocalCache;

  useEffect(() => {
    if (isEditingName) return;
    setDraftName(project.name || '');
  }, [project.name, isEditingName]);

  const getIcon = () => {
    switch (project.resourceType) {
      case 'project':
        return <Box size={24} />;
      case 'component':
        return <Layers size={24} />;
      case 'nodegraph':
        return <Workflow size={24} />;
      default:
        return <Box size={24} />;
    }
  };

  const formatTime = (value: string) => {
    const date = new Date(value);
    return (
      date.toLocaleDateString() +
      ' ' +
      date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  };

  const startRename = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!canRename) return;
    setActionsOpen(false);
    setDraftName(project.name || '');
    setEditingName(true);
  };

  const cancelRename = () => {
    setDraftName(project.name || '');
    setEditingName(false);
  };

  const applyRename = async () => {
    if (isRenaming) return;
    const nextName = draftName.trim();
    if (!nextName || nextName === (project.name || '')) {
      cancelRename();
      return;
    }
    const renamed = await onRename(project, nextName);
    if (renamed) setEditingName(false);
  };

  return (
    <div className="group/card relative flex h-full min-h-[280px] w-full flex-col rounded-[16px] border border-(--border-subtle) bg-(--bg-panel) p-[24px] text-left transition-all duration-[300ms] ease-[ease] hover:-translate-y-1 hover:border-(--border-default) hover:bg-(--bg-canvas) hover:shadow-(--shadow-lg)">
      <button
        type="button"
        onClick={() => setActionsOpen((prev) => !prev)}
        aria-label={t('home.card.moreActions', 'More actions')}
        className="absolute top-[14px] right-[14px] z-10 inline-flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-(--border-subtle) bg-(--bg-canvas) text-(--text-secondary) transition-colors hover:border-(--border-default) hover:text-(--text-primary)"
      >
        <MoreHorizontal size={16} />
      </button>

      {isActionsOpen && (
        <div className="absolute top-[48px] right-[14px] z-20 flex min-w-[170px] flex-col gap-[6px] rounded-[12px] border border-(--border-subtle) bg-(--bg-canvas) p-[8px] shadow-(--shadow-lg)">
          {isLocalProject ? (
            !isReadonlyLocalCache ? (
              <button
                type="button"
                onClick={() => onSync(project)}
                disabled={isSyncing || isDeleting || !canSyncLocalProject}
                title={
                  canSyncLocalProject
                    ? undefined
                    : t(
                        'home.card.syncSignInRequired',
                        'Sign in to sync local projects.'
                      )
                }
                className="inline-flex items-center gap-[6px] rounded-[8px] border border-(--border-subtle) bg-(--bg-canvas) px-[10px] py-[7px] text-(length:--font-size-xs) text-(--text-primary) transition-colors hover:border-(--border-default) disabled:cursor-not-allowed disabled:opacity-[0.45]"
              >
                <CloudUpload size={14} />
                {isSyncing
                  ? t('home.card.syncing', 'Syncing...')
                  : t('home.card.syncToCloud', 'Sync to Cloud')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onDuplicate(project)}
                disabled={isDuplicating || isDeleting}
                className="inline-flex items-center gap-[6px] rounded-[8px] border border-(--border-subtle) bg-(--bg-canvas) px-[10px] py-[7px] text-(length:--font-size-xs) text-(--text-primary) transition-colors hover:border-(--border-default) disabled:cursor-not-allowed disabled:opacity-[0.45]"
              >
                <Copy size={14} />
                {isDuplicating
                  ? t('home.card.duplicating', 'Creating copy...')
                  : t('home.card.saveAsLocalCopy', 'Save as Local Copy')}
              </button>
            )
          ) : !project.isPublic ? (
            <button
              type="button"
              onClick={() => onPublish(project)}
              disabled={isPublishing || isDeleting || isClonedProject}
              title={
                isClonedProject
                  ? t(
                      'home.card.publishDisabledReason',
                      'Cloned projects cannot be published.'
                    )
                  : undefined
              }
              className="inline-flex items-center gap-[6px] rounded-[8px] border border-(--border-subtle) bg-(--bg-canvas) px-[10px] py-[7px] text-(length:--font-size-xs) text-(--text-primary) transition-colors hover:border-(--border-default) disabled:cursor-not-allowed disabled:opacity-[0.45]"
            >
              <Globe size={14} />
              {isClonedProject
                ? t('home.card.publishDisabled', 'Publish disabled for copies')
                : isPublishing
                  ? t('home.card.publishing', 'Publishing...')
                  : t('home.card.publish', 'Publish to Community')}
            </button>
          ) : (
            <a
              href={`/community/${project.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-[6px] rounded-[8px] border border-(--border-subtle) bg-(--bg-canvas) px-[10px] py-[7px] text-(length:--font-size-xs) text-(--text-primary) no-underline transition-colors hover:border-(--border-default)"
            >
              <Globe size={14} />
              {t('home.card.openCommunity', 'Open Community')}
            </a>
          )}
          <button
            type="button"
            onClick={() => onDelete(project)}
            disabled={isPublishing || isDeleting}
            className="inline-flex items-center gap-[6px] rounded-[8px] border border-(--danger-subtle) bg-(--bg-canvas) px-[10px] py-[7px] text-(length:--font-size-xs) text-(--danger-color) transition-colors hover:border-(--danger-hover) disabled:cursor-not-allowed disabled:opacity-[0.45]"
          >
            <Trash2 size={14} />
            {isDeleting
              ? t('home.card.deleting', 'Deleting...')
              : t('home.card.delete', 'Delete Project')}
          </button>
        </div>
      )}

      {isEditingName ? (
        <button
          type="button"
          aria-label={t('home.card.renameConfirm', 'Confirm rename')}
          disabled={isRenaming}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            void applyRename();
          }}
          className="absolute top-[70px] right-[14px] z-10 inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[6px] border border-(--border-default) text-(--text-primary) transition hover:border-(--border-strong) hover:text-(--text-primary) disabled:opacity-[0.5]"
        >
          <Check size={14} />
        </button>
      ) : (
        <button
          type="button"
          onClick={startRename}
          disabled={!canRename}
          aria-label={t('home.card.rename', 'Rename project')}
          className="absolute top-[70px] right-[14px] z-10 inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[6px] border border-transparent text-(--text-muted) opacity-0 transition group-hover/card:opacity-100 hover:border-(--border-default) hover:text-(--text-primary) focus:opacity-100 disabled:hidden"
        >
          <Pencil size={14} />
        </button>
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (isActionsOpen) {
            setActionsOpen(false);
            return;
          }
          if (isEditingName) return;
          onOpen(project);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          if (isEditingName || isActionsOpen) return;
          onOpen(project);
        }}
        className="flex flex-1 cursor-pointer flex-col justify-between border-0 bg-transparent p-0 text-left"
      >
        <div className="flex flex-col gap-[12px]">
          <div className="mb-[8px] text-(--accent-color)">{getIcon()}</div>
          <div className="pr-[36px]">
            {isEditingName ? (
              <input
                autoFocus
                value={draftName}
                disabled={isRenaming}
                aria-label={t('home.card.renameInput', 'Rename project')}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={() => {
                  void applyRename();
                }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelRename();
                    return;
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void applyRename();
                  }
                }}
                className="h-[30px] w-full rounded-[8px] border border-(--border-default) bg-(--bg-canvas) px-[8px] text-(length:--font-size-lg) font-medium text-(--text-primary) outline-none"
              />
            ) : (
              <div className="flex min-w-0 items-center gap-[8px]">
                <h3 className="m-0 min-w-0 flex-1 text-(length:--font-size-xl) font-medium text-(--text-primary)">
                  <span className="block truncate">
                    {project.name || t('home.card.untitled', 'Untitled')}
                  </span>
                </h3>
                {isLocalProject && (
                  <span className="inline-flex shrink-0 items-center gap-[4px] rounded-[6px] border border-(--border-subtle) px-[6px] py-[2px] text-(length:--font-size-xs) font-medium text-(--text-muted)">
                    {isReadonlyLocalCache && <Lock size={12} />}
                    {isReadonlyLocalCache
                      ? t('home.card.syncedCache', 'Synced cache')
                      : t('home.card.localOnly', 'Local only')}
                  </span>
                )}
              </div>
            )}
          </div>
          <p className="flex items-center justify-between border-t border-(--border-subtle) pt-[16px] text-(length:--font-size-xs) leading-(--line-height-normal) text-(--text-muted)">
            {truncate(project.description || '', 160) ||
              t('home.card.noDescription', 'No description')}
          </p>
        </div>
        <div className="flex items-center gap-[6px] text-(--text-muted)">
          <Clock size={14} />
          <span className="text-(length:--font-size-xs)">
            {formatTime(project.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}
