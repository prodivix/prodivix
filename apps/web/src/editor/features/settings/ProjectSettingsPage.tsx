import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PdxButton, PdxHeading, PdxParagraph } from '@prodivix/ui';
import { GlobalSettingsContent } from './GlobalSettingsContent';
import { ProjectSettingsContent } from './ProjectSettingsContent';
import {
  getGlobalSettingsKeys,
  type GlobalSettingsState,
  type OverrideState,
} from './SettingsDefaults';
import { useSettingsStore } from '@/editor/store/useSettingsStore';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { useAuthStore } from '@/auth/useAuthStore';

const createOverrideDefaults = () => {
  return getGlobalSettingsKeys().reduce((acc, key) => {
    acc[key] = false;
    return acc;
  }, {} as OverrideState);
};
const DEFAULT_OVERRIDES = createOverrideDefaults();

export const ProjectSettingsPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('editor');
  const { projectId } = useParams();
  const token = useAuthStore((state) => state.token);
  const workspaceId = useEditorStore((state) => state.workspace?.id);
  const ensureProjectGlobal = useSettingsStore(
    (state) => state.ensureProjectGlobal
  );
  const toggleProjectOverride = useSettingsStore(
    (state) => state.toggleProjectOverride
  );
  const overrides = useSettingsStore((state) =>
    projectId
      ? (state.projectGlobalById[projectId]?.overrides ?? DEFAULT_OVERRIDES)
      : DEFAULT_OVERRIDES
  );

  useEffect(() => {
    if (!projectId) return;
    ensureProjectGlobal(projectId);
  }, [ensureProjectGlobal, projectId]);

  const handleToggleOverride = (key: keyof GlobalSettingsState) => {
    if (!projectId) return;
    toggleProjectOverride(projectId, key);
  };

  const basePath = projectId ? `/editor/project/${projectId}` : '/editor';

  return (
    <div className="mx-auto flex min-h-screen max-w-350 flex-col px-6 text-(--text-primary)">
      <header className="flex items-center justify-between gap-4 border-b border-b-[rgba(0,0,0,0.06)] px-6 py-4 backdrop-blur-[10px] in-data-[theme='dark']:border-b-[rgba(255,255,255,0.08)]">
        <div>
          <PdxHeading level={2}>{t('settings.projectPage.title')}</PdxHeading>
          <PdxParagraph size="Small" color="Muted">
            {t('settings.projectPage.subtitle')}
          </PdxParagraph>
        </div>
        <div className="flex gap-2.5">
          <PdxButton
            text={t('settings.actions.exit')}
            size="Small"
            variant="Secondary"
            onClick={() => navigate(basePath)}
          />
        </div>
      </header>
      <main className="flex flex-col gap-4.5 px-6 pt-4 pb-8 max-[1100px]:px-4.5 max-[1100px]:pt-3.5 max-[1100px]:pb-6">
        <ProjectSettingsContent token={token} workspaceId={workspaceId} />
        <section className="grid gap-3">
          <div className="flex items-center gap-2.5 rounded-xl bg-[rgba(0,0,0,0.04)] px-3 py-2 text-[12px] text-(--text-secondary) in-data-[theme='dark']:bg-[rgba(255,255,255,0.08)]">
            <span className="font-medium text-(--text-primary)">
              {t('settings.projectPage.overrides.title')}
            </span>
            <span className="text-(--text-muted)">
              {t('settings.projectPage.overrides.body')}
            </span>
          </div>
          <GlobalSettingsContent
            mode="project"
            projectId={projectId}
            overrides={overrides}
            onToggleOverride={handleToggleOverride}
          />
        </section>
      </main>
    </div>
  );
};
