import { useTranslation } from 'react-i18next';
import { SettingsPanel } from './SettingsShared';
import { WorkspaceCollaborationSettings } from './WorkspaceCollaborationSettings';

type ProjectSettingsContentProps = Readonly<{
  token?: string | null;
  workspaceId?: string;
}>;

/**
 * Hosts only project settings backed by an active product contract. Visual,
 * export, and runtime preferences are rendered by GlobalSettingsContent below.
 */
export const ProjectSettingsContent = ({
  token,
  workspaceId,
}: ProjectSettingsContentProps) => {
  const { t } = useTranslation('editor');

  return (
    <SettingsPanel
      title={t('settings.project.panels.collaboration.title')}
      description={t('settings.project.panels.collaboration.description')}
    >
      <WorkspaceCollaborationSettings token={token} workspaceId={workspaceId} />
    </SettingsPanel>
  );
};
