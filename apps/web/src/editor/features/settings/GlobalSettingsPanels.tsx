import type { ReactNode } from 'react';
import {
  PdxCheckList,
  PdxInput,
  PdxRadioGroup,
  PdxSelect,
  PdxSlider,
} from '@prodivix/ui';
import type { GlobalSettingsState } from './SettingsDefaults';
import { SettingsPanel, SettingsRow, withDisabled } from './SettingsShared';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type GlobalSettingsPanelController = {
  t: Translate;
  canEditValue: (key: keyof GlobalSettingsState) => boolean;
  renderMeta: (key: keyof GlobalSettingsState) => ReactNode;
  resolveValue: (
    key: keyof GlobalSettingsState
  ) => GlobalSettingsState[keyof GlobalSettingsState];
  updateValue: (
    key: keyof GlobalSettingsState,
    value: GlobalSettingsState[keyof GlobalSettingsState]
  ) => void;
};

type GlobalSettingsPanelProps = {
  controller: GlobalSettingsPanelController;
};

function AppearanceSettingsPanel({ controller }: GlobalSettingsPanelProps) {
  const { t, canEditValue, renderMeta, resolveValue, updateValue } = controller;

  return (
    <SettingsPanel
      title={t('settings.global.panels.appearance.title')}
      description={t('settings.global.panels.appearance.description')}
    >
      <SettingsRow
        label={t('settings.global.rows.language.label')}
        description={t('settings.global.rows.language.description')}
        meta={renderMeta('language')}
        control={
          <PdxSelect
            size="Small"
            options={[
              {
                label: t('settings.global.rows.language.options.en'),
                value: 'en',
              },
              {
                label: t('settings.global.rows.language.options.zhCN'),
                value: 'zh-CN',
              },
            ]}
            value={String(resolveValue('language'))}
            onValueChange={(value) => updateValue('language', value)}
            disabled={!canEditValue('language')}
          />
        }
      />
      <SettingsRow
        label={t('settings.global.rows.theme.label')}
        description={t('settings.global.rows.theme.description')}
        meta={renderMeta('theme')}
        control={
          <PdxRadioGroup
            options={[
              {
                label: t('settings.global.rows.theme.options.home'),
                value: 'home',
              },
              {
                label: t('settings.global.rows.theme.options.light'),
                value: 'light',
              },
              {
                label: t('settings.global.rows.theme.options.dark'),
                value: 'dark',
              },
            ].map((option) => ({
              ...option,
              disabled: !canEditValue('theme'),
            }))}
            value={String(resolveValue('theme'))}
            onValueChange={(value) => updateValue('theme', value)}
          />
        }
      />
      <SettingsRow
        label={t('settings.global.rows.density.label')}
        description={t('settings.global.rows.density.description')}
        meta={renderMeta('density')}
        control={
          <PdxRadioGroup
            options={[
              {
                label: t('settings.global.rows.density.options.comfortable'),
                value: 'comfortable',
              },
              {
                label: t('settings.global.rows.density.options.compact'),
                value: 'compact',
              },
            ].map((option) => ({
              ...option,
              disabled: !canEditValue('density'),
            }))}
            value={String(resolveValue('density'))}
            onValueChange={(value) => updateValue('density', value)}
          />
        }
      />
      <SettingsRow
        label={t('settings.global.rows.fontScale.label')}
        description={t('settings.global.rows.fontScale.description')}
        meta={renderMeta('fontScale')}
        control={
          <PdxSlider
            min={90}
            max={120}
            step={1}
            value={resolveValue('fontScale') as number}
            onChange={(value) => updateValue('fontScale', value)}
            showValue
            size="Small"
            disabled={!canEditValue('fontScale')}
          />
        }
      />
    </SettingsPanel>
  );
}

function BehaviorSettingsPanel({ controller }: GlobalSettingsPanelProps) {
  const { t, canEditValue, renderMeta, resolveValue, updateValue } = controller;

  return (
    <SettingsPanel
      title={t('settings.global.panels.behavior.title')}
      description={t('settings.global.panels.behavior.description')}
    >
      <SettingsRow
        label={t('settings.global.rows.undoSteps.label')}
        description={t('settings.global.rows.undoSteps.description')}
        meta={renderMeta('undoSteps')}
        control={
          <PdxInput
            size="Small"
            value={String(resolveValue('undoSteps'))}
            onValueChange={(value) => updateValue('undoSteps', value)}
            disabled={!canEditValue('undoSteps')}
          />
        }
      />
      <SettingsRow
        label={t('settings.global.rows.confirmPrompts.label')}
        description={t('settings.global.rows.confirmPrompts.description')}
        meta={renderMeta('confirmPrompts')}
        control={
          <PdxCheckList
            items={withDisabled(
              [
                {
                  label: t('settings.global.rows.confirmPrompts.options.leave'),
                  value: 'leave',
                },
              ],
              !canEditValue('confirmPrompts')
            )}
            value={resolveValue('confirmPrompts') as string[]}
            onChange={(values) => updateValue('confirmPrompts', values)}
          />
        }
      />
      <SettingsRow
        label={t('settings.global.rows.panelLayout.label')}
        description={t('settings.global.rows.panelLayout.description')}
        meta={renderMeta('panelLayout')}
        control={
          <PdxSelect
            size="Small"
            options={[
              {
                label: t('settings.global.rows.panelLayout.options.balanced'),
                value: 'balanced',
              },
              {
                label: t('settings.global.rows.panelLayout.options.focus'),
                value: 'focus',
              },
              {
                label: t('settings.global.rows.panelLayout.options.wide'),
                value: 'wide',
              },
            ]}
            value={String(resolveValue('panelLayout'))}
            onValueChange={(value) => updateValue('panelLayout', value)}
            disabled={!canEditValue('panelLayout')}
          />
        }
      />
    </SettingsPanel>
  );
}

function BlueprintSettingsPanel({ controller }: GlobalSettingsPanelProps) {
  const { t, canEditValue, renderMeta, resolveValue, updateValue } = controller;

  return (
    <SettingsPanel
      title={t('settings.global.panels.blueprint.title')}
      description={t('settings.global.panels.blueprint.description')}
    >
      <SettingsRow
        label={t('settings.global.rows.viewportSize.label')}
        description={t('settings.global.rows.viewportSize.description')}
        meta={renderMeta('viewportWidth')}
        control={
          <div className="inline-flex items-center gap-1.5">
            <PdxInput
              size="Small"
              value={String(resolveValue('viewportWidth'))}
              onValueChange={(value) => updateValue('viewportWidth', value)}
              disabled={!canEditValue('viewportWidth')}
            />
            <span className="text-[12px] text-(--text-muted)">×</span>
            <PdxInput
              size="Small"
              value={String(resolveValue('viewportHeight'))}
              onValueChange={(value) => updateValue('viewportHeight', value)}
              disabled={!canEditValue('viewportHeight')}
            />
          </div>
        }
      />
      <SettingsRow
        label={t('settings.global.rows.zoomStep.label')}
        description={t('settings.global.rows.zoomStep.description')}
        meta={renderMeta('zoomStep')}
        control={
          <PdxSlider
            min={1}
            max={20}
            step={1}
            value={resolveValue('zoomStep') as number}
            onChange={(value) => updateValue('zoomStep', value)}
            size="Small"
            disabled={!canEditValue('zoomStep')}
          />
        }
      />
      <SettingsRow
        label={t('settings.global.rows.assist.label')}
        description={t('settings.global.rows.assist.description')}
        meta={renderMeta('assist')}
        control={
          <PdxCheckList
            items={withDisabled(
              [
                {
                  label: t('settings.global.rows.assist.options.grid'),
                  value: 'grid',
                },
              ],
              !canEditValue('assist')
            )}
            value={resolveValue('assist') as string[]}
            onChange={(values) => updateValue('assist', values)}
          />
        }
      />
      <SettingsRow
        label={t('settings.global.rows.panInertia.label')}
        description={t('settings.global.rows.panInertia.description')}
        meta={renderMeta('panInertia')}
        control={
          <PdxSlider
            min={0}
            max={100}
            step={5}
            value={resolveValue('panInertia') as number}
            onChange={(value) => updateValue('panInertia', value)}
            size="Small"
            disabled={!canEditValue('panInertia')}
          />
        }
      />
      <SettingsRow
        label={t('settings.global.rows.classPxTransformMode.label')}
        description={t('settings.global.rows.classPxTransformMode.description')}
        meta={renderMeta('classPxTransformMode')}
        control={
          <PdxRadioGroup
            options={[
              {
                label: t(
                  'settings.global.rows.classPxTransformMode.options.preserveIntent'
                ),
                value: 'preserve-intent',
              },
              {
                label: t(
                  'settings.global.rows.classPxTransformMode.options.preferScaleToken'
                ),
                value: 'prefer-scale-token',
              },
            ].map((option) => ({
              ...option,
              disabled: !canEditValue('classPxTransformMode'),
            }))}
            value={String(resolveValue('classPxTransformMode'))}
            onValueChange={(value) =>
              updateValue('classPxTransformMode', value)
            }
          />
        }
      />
      <SettingsRow
        label={t('settings.global.rows.defaultFramework.label')}
        description={t('settings.global.rows.defaultFramework.description')}
        meta={renderMeta('defaultFramework')}
        control={
          <PdxSelect
            size="Small"
            options={[
              {
                label: t('settings.global.rows.defaultFramework.options.react'),
                value: 'react',
              },
              {
                label: t('settings.global.rows.defaultFramework.options.vue'),
                value: 'vue',
              },
            ]}
            value={String(resolveValue('defaultFramework'))}
            onValueChange={(value) => updateValue('defaultFramework', value)}
            disabled={!canEditValue('defaultFramework')}
          />
        }
      />
      <SettingsRow
        label={t('settings.global.rows.diagnostics.label')}
        description={t('settings.global.rows.diagnostics.description')}
        meta={renderMeta('diagnostics')}
        control={
          <PdxCheckList
            items={withDisabled(
              [
                {
                  label: t(
                    'settings.global.rows.diagnostics.options.selectionBounds'
                  ),
                  value: 'selection',
                },
              ],
              !canEditValue('diagnostics')
            )}
            value={resolveValue('diagnostics') as string[]}
            onChange={(values) => updateValue('diagnostics', values)}
          />
        }
      />
    </SettingsPanel>
  );
}

export function GlobalSettingsPanels({ controller }: GlobalSettingsPanelProps) {
  return (
    <div className="grid gap-4.5">
      <AppearanceSettingsPanel controller={controller} />
      <BehaviorSettingsPanel controller={controller} />
      <BlueprintSettingsPanel controller={controller} />
    </div>
  );
}
