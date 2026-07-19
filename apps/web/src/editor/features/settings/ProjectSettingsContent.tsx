import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PdxCheckList,
  PdxInput,
  PdxRadioGroup,
  PdxSelect,
  PdxSlider,
  PdxTextarea,
} from '@prodivix/ui';
import { SettingsPanel, SettingsRow } from './SettingsShared';
import { WorkspaceCollaborationSettings } from './WorkspaceCollaborationSettings';

type ProjectSettingsContentProps = Readonly<{
  token?: string | null;
  workspaceId?: string;
}>;

export const ProjectSettingsContent = ({
  token,
  workspaceId,
}: ProjectSettingsContentProps) => {
  const { t } = useTranslation('editor');
  const [projectValues, setProjectValues] = useState({
    name: 'Marketing Workspace',
    description: 'Landing pages and customer onboarding flows.',
    defaultRoute: '/home',
    timezone: 'UTC+8',
    previewAccess: ['restricted'],
    auditRetention: 30,
    notifications: ['mentions', 'builds'],
    themeTokenSet: 'prodivix-default',
    componentLibraryVersion: 'v1.4.2',
    assetHost: 'https://assets.example.com',
    fontPack: ['mona-sans', 'monaspace-neon'],
    iconSet: 'lucide',
    apiBase: 'https://api.example.com',
    authMode: ['oauth'],
    envPrefix: 'PRODIVIX_',
    deploymentTarget: ['staging'],
    schemaVersion: '1.0',
    strictness: 80,
    customNodes: ['http', 'transform'],
    autoMigrate: ['enabled'],
    buildTarget: ['web'],
    outputDir: 'dist',
    minify: ['enabled'],
    sourceMaps: ['enabled'],
  });

  const updateProjectValue = (
    key: string,
    value: string | number | string[]
  ) => {
    setProjectValues((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="grid gap-4.5">
      <SettingsPanel
        title={t('settings.project.panels.basics.title')}
        description={t('settings.project.panels.basics.description')}
      >
        <SettingsRow
          label={t('settings.project.rows.name.label')}
          description={t('settings.project.rows.name.description')}
          control={
            <PdxInput
              size="Small"
              value={projectValues.name}
              onValueChange={(value) => updateProjectValue('name', value)}
            />
          }
        />
        <SettingsRow
          label={t('settings.project.rows.description.label')}
          description={t('settings.project.rows.description.description')}
          control={
            <PdxTextarea
              size="Small"
              rows={3}
              value={projectValues.description}
              onValueChange={(value) =>
                updateProjectValue('description', value)
              }
            />
          }
        />
        <SettingsRow
          label={t('settings.project.rows.defaultRoute.label')}
          description={t('settings.project.rows.defaultRoute.description')}
          control={
            <PdxInput
              size="Small"
              value={projectValues.defaultRoute}
              onValueChange={(value) =>
                updateProjectValue('defaultRoute', value)
              }
            />
          }
        />
        <SettingsRow
          label={t('settings.project.rows.timezone.label')}
          description={t('settings.project.rows.timezone.description')}
          control={
            <PdxSelect
              size="Small"
              options={[
                {
                  label: t('settings.project.rows.timezone.options.utc'),
                  value: 'UTC',
                },
                {
                  label: t('settings.project.rows.timezone.options.utcMinus5'),
                  value: 'UTC-5',
                },
                {
                  label: t('settings.project.rows.timezone.options.utcPlus1'),
                  value: 'UTC+1',
                },
                {
                  label: t('settings.project.rows.timezone.options.utcPlus8'),
                  value: 'UTC+8',
                },
              ]}
              value={projectValues.timezone}
              onValueChange={(value) => updateProjectValue('timezone', value)}
            />
          }
        />
      </SettingsPanel>
      <SettingsPanel
        title={t('settings.project.panels.collaboration.title')}
        description={t('settings.project.panels.collaboration.description')}
      >
        <WorkspaceCollaborationSettings
          token={token}
          workspaceId={workspaceId}
        />
        <SettingsRow
          label={t('settings.project.rows.previewAccess.label')}
          description={t('settings.project.rows.previewAccess.description')}
          control={
            <PdxRadioGroup
              options={[
                {
                  label: t(
                    'settings.project.rows.previewAccess.options.restricted'
                  ),
                  value: 'restricted',
                },
                {
                  label: t(
                    'settings.project.rows.previewAccess.options.public'
                  ),
                  value: 'public',
                },
              ]}
              value={projectValues.previewAccess[0]}
              onValueChange={(value) =>
                updateProjectValue('previewAccess', [value])
              }
            />
          }
        />
        <SettingsRow
          label={t('settings.project.rows.auditRetention.label')}
          description={t('settings.project.rows.auditRetention.description')}
          control={
            <PdxSlider
              min={7}
              max={120}
              step={7}
              value={projectValues.auditRetention as number}
              onChange={(value) => updateProjectValue('auditRetention', value)}
              size="Small"
            />
          }
        />
        <SettingsRow
          label={t('settings.project.rows.notifications.label')}
          description={t('settings.project.rows.notifications.description')}
          control={
            <PdxCheckList
              items={[
                {
                  label: t(
                    'settings.project.rows.notifications.options.mentions'
                  ),
                  value: 'mentions',
                },
                {
                  label: t(
                    'settings.project.rows.notifications.options.builds'
                  ),
                  value: 'builds',
                },
                {
                  label: t(
                    'settings.project.rows.notifications.options.deployments'
                  ),
                  value: 'deployments',
                },
              ]}
              value={projectValues.notifications}
              onChange={(values) => updateProjectValue('notifications', values)}
            />
          }
        />
      </SettingsPanel>
      <SettingsPanel
        title={t('settings.project.panels.designSystem.title')}
        description={t('settings.project.panels.designSystem.description')}
      >
        <SettingsRow
          label={t('settings.project.rows.themeTokenSet.label')}
          description={t('settings.project.rows.themeTokenSet.description')}
          control={
            <PdxSelect
              size="Small"
              options={[
                {
                  label: t(
                    'settings.project.rows.themeTokenSet.options.prodivixDefault'
                  ),
                  value: 'prodivix-default',
                },
                {
                  label: t(
                    'settings.project.rows.themeTokenSet.options.prodivixMidnight'
                  ),
                  value: 'prodivix-midnight',
                },
                {
                  label: t(
                    'settings.project.rows.themeTokenSet.options.prodivixSunrise'
                  ),
                  value: 'prodivix-sunrise',
                },
              ]}
              value={projectValues.themeTokenSet}
              onValueChange={(value) =>
                updateProjectValue('themeTokenSet', value)
              }
            />
          }
        />
        <SettingsRow
          label={t('settings.project.rows.componentLibraryVersion.label')}
          description={t(
            'settings.project.rows.componentLibraryVersion.description'
          )}
          control={
            <PdxSelect
              size="Small"
              options={[
                {
                  label: t(
                    'settings.project.rows.componentLibraryVersion.options.v142Stable'
                  ),
                  value: 'v1.4.2',
                },
                {
                  label: t(
                    'settings.project.rows.componentLibraryVersion.options.v150Beta'
                  ),
                  value: 'v1.5.0',
                },
              ]}
              value={projectValues.componentLibraryVersion}
              onValueChange={(value) =>
                updateProjectValue('componentLibraryVersion', value)
              }
            />
          }
        />
        <SettingsRow
          label={t('settings.project.rows.assetHost.label')}
          description={t('settings.project.rows.assetHost.description')}
          control={
            <PdxInput
              size="Small"
              value={projectValues.assetHost}
              onValueChange={(value) => updateProjectValue('assetHost', value)}
            />
          }
        />
        <SettingsRow
          label={t('settings.project.rows.fontPack.label')}
          description={t('settings.project.rows.fontPack.description')}
          control={
            <PdxCheckList
              items={[
                { label: 'Mona Sans', value: 'mona-sans' },
                { label: 'Monaspace Neon', value: 'monaspace-neon' },
                { label: 'CJK fallbacks', value: 'cjk-fallbacks' },
              ]}
              value={projectValues.fontPack}
              onChange={(values) => updateProjectValue('fontPack', values)}
            />
          }
        />
        <SettingsRow
          label={t('settings.project.rows.iconSet.label')}
          description={t('settings.project.rows.iconSet.description')}
          control={
            <PdxSelect
              size="Small"
              options={[
                { label: 'Lucide', value: 'lucide' },
                { label: 'Remix', value: 'remix' },
                { label: 'Feather', value: 'feather' },
              ]}
              value={projectValues.iconSet}
              onValueChange={(value) => updateProjectValue('iconSet', value)}
            />
          }
        />
      </SettingsPanel>
      <SettingsPanel
        title={t('settings.project.panels.integrations.title')}
        description={t('settings.project.panels.integrations.description')}
      >
        <SettingsRow
          label={t('settings.project.rows.apiBase.label')}
          description={t('settings.project.rows.apiBase.description')}
          control={
            <PdxInput
              size="Small"
              value={projectValues.apiBase}
              onValueChange={(value) => updateProjectValue('apiBase', value)}
            />
          }
        />
        <SettingsRow
          label={t('settings.project.rows.authMode.label')}
          description={t('settings.project.rows.authMode.description')}
          control={
            <PdxRadioGroup
              options={[
                {
                  label: t('settings.project.rows.authMode.options.oauth'),
                  value: 'oauth',
                },
                {
                  label: t('settings.project.rows.authMode.options.apiKey'),
                  value: 'api-key',
                },
                {
                  label: t('settings.project.rows.authMode.options.none'),
                  value: 'none',
                },
              ]}
              value={projectValues.authMode[0]}
              onValueChange={(value) => updateProjectValue('authMode', [value])}
            />
          }
        />
        <SettingsRow
          label={t('settings.project.rows.envPrefix.label')}
          description={t('settings.project.rows.envPrefix.description')}
          control={
            <PdxInput
              size="Small"
              value={projectValues.envPrefix}
              onValueChange={(value) => updateProjectValue('envPrefix', value)}
            />
          }
        />
        <SettingsRow
          label={t('settings.project.rows.deploymentTarget.label')}
          description={t('settings.project.rows.deploymentTarget.description')}
          control={
            <PdxRadioGroup
              options={[
                {
                  label: t(
                    'settings.project.rows.deploymentTarget.options.staging'
                  ),
                  value: 'staging',
                },
                {
                  label: t(
                    'settings.project.rows.deploymentTarget.options.production'
                  ),
                  value: 'production',
                },
                {
                  label: t(
                    'settings.project.rows.deploymentTarget.options.preview'
                  ),
                  value: 'preview',
                },
              ]}
              value={projectValues.deploymentTarget[0]}
              onValueChange={(value) =>
                updateProjectValue('deploymentTarget', [value])
              }
            />
          }
        />
      </SettingsPanel>
      <SettingsPanel
        title={t('settings.project.panels.pir.title')}
        description={t('settings.project.panels.pir.description')}
      >
        <SettingsRow
          label={t('settings.project.rows.schemaVersion.label')}
          description={t('settings.project.rows.schemaVersion.description')}
          control={
            <PdxSelect
              size="Small"
              options={[
                {
                  label: t(
                    'settings.project.rows.schemaVersion.options.v10Stable'
                  ),
                  value: '1.0',
                },
                {
                  label: t(
                    'settings.project.rows.schemaVersion.options.v11Preview'
                  ),
                  value: '1.1',
                },
              ]}
              value={projectValues.schemaVersion}
              onValueChange={(value) =>
                updateProjectValue('schemaVersion', value)
              }
            />
          }
        />
        <SettingsRow
          label={t('settings.project.rows.strictness.label')}
          description={t('settings.project.rows.strictness.description')}
          control={
            <PdxSlider
              min={0}
              max={100}
              step={5}
              value={projectValues.strictness as number}
              onChange={(value) => updateProjectValue('strictness', value)}
              size="Small"
            />
          }
        />
        <SettingsRow
          label={t('settings.project.rows.customNodes.label')}
          description={t('settings.project.rows.customNodes.description')}
          control={
            <PdxCheckList
              items={[
                {
                  label: t('settings.project.rows.customNodes.options.http'),
                  value: 'http',
                },
                {
                  label: t(
                    'settings.project.rows.customNodes.options.transform'
                  ),
                  value: 'transform',
                },
                {
                  label: t(
                    'settings.project.rows.customNodes.options.condition'
                  ),
                  value: 'condition',
                },
                {
                  label: t('settings.project.rows.customNodes.options.loop'),
                  value: 'loop',
                },
              ]}
              value={projectValues.customNodes}
              onChange={(values) => updateProjectValue('customNodes', values)}
            />
          }
        />
        <SettingsRow
          label={t('settings.project.rows.autoMigrate.label')}
          description={t('settings.project.rows.autoMigrate.description')}
          control={
            <PdxRadioGroup
              options={[
                {
                  label: t('settings.project.rows.autoMigrate.options.enable'),
                  value: 'enabled',
                },
                {
                  label: t('settings.project.rows.autoMigrate.options.disable'),
                  value: 'disabled',
                },
              ]}
              value={projectValues.autoMigrate[0]}
              onValueChange={(value) =>
                updateProjectValue('autoMigrate', [value])
              }
            />
          }
        />
      </SettingsPanel>
      <SettingsPanel
        title={t('settings.project.panels.build.title')}
        description={t('settings.project.panels.build.description')}
      >
        <SettingsRow
          label={t('settings.project.rows.buildTarget.label')}
          description={t('settings.project.rows.buildTarget.description')}
          control={
            <PdxRadioGroup
              options={[
                {
                  label: t('settings.project.rows.buildTarget.options.web'),
                  value: 'web',
                },
                {
                  label: t('settings.project.rows.buildTarget.options.mobile'),
                  value: 'mobile',
                },
                {
                  label: t('settings.project.rows.buildTarget.options.desktop'),
                  value: 'desktop',
                },
              ]}
              value={projectValues.buildTarget[0]}
              onValueChange={(value) =>
                updateProjectValue('buildTarget', [value])
              }
            />
          }
        />
        <SettingsRow
          label={t('settings.project.rows.outputDir.label')}
          description={t('settings.project.rows.outputDir.description')}
          control={
            <PdxInput
              size="Small"
              value={projectValues.outputDir}
              onValueChange={(value) => updateProjectValue('outputDir', value)}
            />
          }
        />
        <SettingsRow
          label={t('settings.project.rows.minify.label')}
          description={t('settings.project.rows.minify.description')}
          control={
            <PdxRadioGroup
              options={[
                {
                  label: t('settings.project.rows.minify.options.enable'),
                  value: 'enabled',
                },
                {
                  label: t('settings.project.rows.minify.options.disable'),
                  value: 'disabled',
                },
              ]}
              value={projectValues.minify[0]}
              onValueChange={(value) => updateProjectValue('minify', [value])}
            />
          }
        />
        <SettingsRow
          label={t('settings.project.rows.sourceMaps.label')}
          description={t('settings.project.rows.sourceMaps.description')}
          control={
            <PdxRadioGroup
              options={[
                {
                  label: t('settings.project.rows.sourceMaps.options.enable'),
                  value: 'enabled',
                },
                {
                  label: t('settings.project.rows.sourceMaps.options.disable'),
                  value: 'disabled',
                },
              ]}
              value={projectValues.sourceMaps[0]}
              onValueChange={(value) =>
                updateProjectValue('sourceMaps', [value])
              }
            />
          }
        />
      </SettingsPanel>
    </div>
  );
};
