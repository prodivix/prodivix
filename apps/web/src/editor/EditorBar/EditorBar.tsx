import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PdxIcon, PdxIconLink } from '@prodivix/ui';
import { useNavigate, useParams } from 'react-router';
import { useEditorShortcut } from '@/editor/shortcuts';
import { useSettingsStore } from '@/editor/store/useSettingsStore';
import {
  LogIn,
  LayoutGrid,
  GitBranch,
  Box,
  Sparkles,
  TestTube,
  FileCode,
  Rocket,
  Settings,
  Folder,
  Home,
  CircleAlert,
} from 'lucide-react';
import { useWorkspaceIssuesStore } from '@/editor/features/issues/workspaceIssuesStore';
import { EditorBarExitModal } from './EditorBarExitModal';

function EditorBar() {
  const { t } = useTranslation(['editor', 'routes']);
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [isExitOpen, setExitOpen] = useState(false);
  const blockingIssueCount = useWorkspaceIssuesStore(
    (state) =>
      state.collection?.issues.filter(
        (issue) =>
          issue.status !== 'resolved' &&
          (issue.diagnostic.severity === 'fatal' ||
            issue.diagnostic.severity === 'error')
      ).length ?? 0
  );
  const confirmPrompts = useSettingsStore(
    (state) => state.global.confirmPrompts
  );
  const basePath = projectId ? `/editor/project/${projectId}` : '/editor';
  const exitTarget = projectId ? '/editor' : '/';
  const exitLabel = projectId ? t('bar.exitToEditor') : t('bar.exitToHome');
  const settingsLabel = projectId
    ? t('projectHome.actions.settings.label')
    : t('editorSettings', { ns: 'routes' });
  const barIconGroupClassName =
    'flex flex-col items-center gap-[14px] [--icon-link-color:var(--editor-bar-icon)] [--icon-link-hover-color:var(--editor-bar-icon-hover)]';
  const barEdgeGroupClassName =
    'flex flex-col items-center gap-[12px] [--icon-link-color:var(--editor-bar-icon)] [--icon-link-hover-color:var(--editor-bar-icon-hover)]';

  useEditorShortcut(
    'Escape',
    () => {
      setExitOpen(true);
    },
    { enabled: Boolean(projectId) }
  );

  return (
    <>
      <nav className="flex max-h-screen min-h-screen w-[72px] flex-col items-center justify-between bg-(--editor-bar-bg) px-[14px] py-[20px]">
        <section className={barEdgeGroupClassName}>
          <button
            className="inline-flex cursor-pointer items-center justify-center rounded-[10px] border-0 bg-transparent p-[6px] text-(--editor-bar-icon) transition-[color,background-color] duration-[150ms] ease-[ease] hover:bg-(--editor-bar-icon-hover-bg) hover:text-(--editor-bar-icon-hover)"
            aria-label={t('bar.exitAria')}
            title={t('bar.exitAria')}
            onClick={() => {
              if (confirmPrompts.includes('leave')) {
                setExitOpen(true);
                return;
              }
              navigate(exitTarget);
            }}
          >
            <PdxIcon icon={<LogIn size={26} />} size={26} />
          </button>
        </section>
        <section
          className={`flex flex-1 flex-col items-center justify-center ${barIconGroupClassName}`}
        >
          {projectId && (
            <>
              <PdxIconLink
                icon={<Home size={22} />}
                label={t('bar.projectHome')}
                size={22}
                title={t('bar.projectHome')}
                to={`/editor/project/${projectId}`}
              />
              <PdxIconLink
                icon={<LayoutGrid size={22} />}
                label={t('projectHome.actions.blueprint.label')}
                size={22}
                title={t('projectHome.actions.blueprint.label')}
                to={`${basePath}/blueprint`}
              />
              <PdxIconLink
                icon={<GitBranch size={22} />}
                label={t('projectHome.actions.nodegraph.label')}
                size={22}
                title={t('projectHome.actions.nodegraph.label')}
                to={`${basePath}/nodegraph`}
              />
              <PdxIconLink
                icon={<Sparkles size={22} />}
                label={t('projectHome.actions.animation.label')}
                size={22}
                title={t('projectHome.actions.animation.label')}
                to={`${basePath}/animation`}
              />
              <PdxIconLink
                icon={<Box size={22} />}
                label={t('projectHome.actions.component.label')}
                size={22}
                title={t('projectHome.actions.component.label')}
                to={`${basePath}/component`}
              />
              <PdxIconLink
                icon={<Folder size={22} />}
                label={t('projectHome.actions.resources.label')}
                size={22}
                title={t('projectHome.actions.resources.label')}
                to={`${basePath}/resources`}
              />
              <div className="relative">
                <PdxIconLink
                  icon={<CircleAlert size={22} />}
                  label={t('bar.issues')}
                  size={22}
                  title={`${t('bar.issues')} · Alt+0`}
                  to={`${basePath}/issues`}
                />
                {blockingIssueCount > 0 && (
                  <span className="pointer-events-none absolute -top-1 -right-2 min-w-4 rounded-full bg-(--text-primary) px-1 text-center text-[9px] leading-4 text-(--editor-bar-bg)">
                    {blockingIssueCount > 99 ? '99+' : blockingIssueCount}
                  </span>
                )}
              </div>
              <PdxIconLink
                icon={<TestTube size={22} />}
                label={t('projectHome.actions.testing.label')}
                size={22}
                title={t('projectHome.actions.testing.label')}
                to={`${basePath}/test`}
              />
              <PdxIconLink
                icon={<FileCode size={22} />}
                label={t('projectHome.actions.export.label')}
                size={22}
                title={t('projectHome.actions.export.label')}
                to={`${basePath}/export`}
              />
              <PdxIconLink
                icon={<Rocket size={22} />}
                label={t('projectHome.actions.deployment.label')}
                size={22}
                title={t('projectHome.actions.deployment.label')}
                to={`${basePath}/deployment`}
              />
            </>
          )}
        </section>
        <section className={barEdgeGroupClassName}>
          <PdxIconLink
            icon={<Settings size={22} />}
            label={settingsLabel}
            size={22}
            title={settingsLabel}
            to={`${basePath}/settings`}
          />
        </section>
      </nav>
      <EditorBarExitModal
        isOpen={isExitOpen}
        exitLabel={exitLabel}
        cancelLabel={t('bar.cancel')}
        exitText={t('bar.exit')}
        title={t('bar.exitTitle')}
        onClose={() => setExitOpen(false)}
        onConfirm={() => {
          setExitOpen(false);
          navigate(exitTarget);
        }}
      />
    </>
  );
}

export default EditorBar;
