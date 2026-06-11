import type { ReactNode } from 'react';
import {
  PdxCheckList,
  PdxInput,
  PdxRadioGroup,
  PdxSelect,
  PdxSlider,
  PdxTextarea,
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
            onChange={(value) => updateValue('language', value)}
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
            onChange={(value) => updateValue('theme', value)}
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
            onChange={(value) => updateValue('density', value)}
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
        label={t('settings.global.rows.autosaveMode.label')}
        description={t('settings.global.rows.autosaveMode.description')}
        meta={renderMeta('autosaveMode')}
        control={
          <PdxRadioGroup
            options={[
              {
                label: t('settings.global.rows.autosaveMode.options.manual'),
                value: 'manual',
              },
              {
                label: t('settings.global.rows.autosaveMode.options.onChange'),
                value: 'on-change',
              },
              {
                label: t('settings.global.rows.autosaveMode.options.interval'),
                value: 'interval',
              },
            ].map((option) => ({
              ...option,
              disabled: !canEditValue('autosaveMode'),
            }))}
            value={String(resolveValue('autosaveMode'))}
            onChange={(value) => updateValue('autosaveMode', value)}
          />
        }
      />
      <SettingsRow
        label={t('settings.global.rows.autosaveInterval.label')}
        description={t('settings.global.rows.autosaveInterval.description')}
        meta={renderMeta('autosaveInterval')}
        control={
          <PdxSlider
            min={5}
            max={60}
            step={5}
            value={resolveValue('autosaveInterval') as number}
            onChange={(value) => updateValue('autosaveInterval', value)}
            size="Small"
            disabled={!canEditValue('autosaveInterval')}
          />
        }
      />
      <SettingsRow
        label={t('settings.global.rows.undoSteps.label')}
        description={t('settings.global.rows.undoSteps.description')}
        meta={renderMeta('undoSteps')}
        control={
          <PdxInput
            size="Small"
            value={String(resolveValue('undoSteps'))}
            onChange={(value) => updateValue('undoSteps', value)}
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
                  label: t(
                    'settings.global.rows.confirmPrompts.options.delete'
                  ),
                  value: 'delete',
                },
                {
                  label: t('settings.global.rows.confirmPrompts.options.reset'),
                  value: 'reset',
                },
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
            onChange={(value) => updateValue('panelLayout', value)}
            disabled={!canEditValue('panelLayout')}
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
            onChange={(value) => updateValue('classPxTransformMode', value)}
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
              onChange={(value) => updateValue('viewportWidth', value)}
              disabled={!canEditValue('viewportWidth')}
            />
            <span className="text-[12px] text-(--text-muted)">×</span>
            <PdxInput
              size="Small"
              value={String(resolveValue('viewportHeight'))}
              onChange={(value) => updateValue('viewportHeight', value)}
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
                {
                  label: t('settings.global.rows.assist.options.alignment'),
                  value: 'align',
                },
                {
                  label: t('settings.global.rows.assist.options.snap'),
                  value: 'snap',
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
        label={t('settings.global.rows.eventTriggerMode.label')}
        description={t('settings.global.rows.eventTriggerMode.description')}
        meta={renderMeta('eventTriggerMode')}
        control={
          <PdxRadioGroup
            options={[
              {
                label: t(
                  'settings.global.rows.eventTriggerMode.options.selectedOnly'
                ),
                value: 'selected-only',
              },
              {
                label: t(
                  'settings.global.rows.eventTriggerMode.options.always'
                ),
                value: 'always',
              },
            ].map((option) => ({
              ...option,
              disabled: !canEditValue('eventTriggerMode'),
            }))}
            value={String(resolveValue('eventTriggerMode'))}
            onChange={(value) => updateValue('eventTriggerMode', value)}
          />
        }
      />
    </SettingsPanel>
  );
}

function ComponentSettingsPanel({ controller }: GlobalSettingsPanelProps) {
  const { t, canEditValue, renderMeta, resolveValue, updateValue } = controller;

  return (
    <SettingsPanel
      title={t('settings.global.panels.components.title')}
      description={t('settings.global.panels.components.description')}
    >
      <SettingsRow
        label={t('settings.global.rows.resolverOrder.label')}
        description={t('settings.global.rows.resolverOrder.description')}
        meta={renderMeta('resolverOrder')}
        control={
          <PdxSelect
            size="Small"
            options={[
              {
                label: t(
                  'settings.global.rows.resolverOrder.options.customPdxNative'
                ),
                value: 'custom>prodivix>native',
              },
              {
                label: t(
                  'settings.global.rows.resolverOrder.options.prodivixNative'
                ),
                value: 'prodivix>native',
              },
              {
                label: t(
                  'settings.global.rows.resolverOrder.options.nativeOnly'
                ),
                value: 'native',
              },
            ]}
            value={String(resolveValue('resolverOrder'))}
            onChange={(value) => updateValue('resolverOrder', value)}
            disabled={!canEditValue('resolverOrder')}
          />
        }
      />
      <SettingsRow
        label={t('settings.global.rows.customNamespaces.label')}
        description={t('settings.global.rows.customNamespaces.description')}
        meta={renderMeta('customNamespaces')}
        control={
          <PdxTextarea
            size="Small"
            rows={3}
            value={String(resolveValue('customNamespaces'))}
            onChange={(value) => updateValue('customNamespaces', value)}
            disabled={!canEditValue('customNamespaces')}
          />
        }
      />
      <SettingsRow
        label={t('settings.global.rows.renderMode.label')}
        description={t('settings.global.rows.renderMode.description')}
        meta={renderMeta('renderMode')}
        control={
          <PdxRadioGroup
            options={[
              {
                label: t('settings.global.rows.renderMode.options.strict'),
                value: 'strict',
              },
              {
                label: t('settings.global.rows.renderMode.options.tolerant'),
                value: 'tolerant',
              },
            ].map((option) => ({
              ...option,
              disabled: !canEditValue('renderMode'),
            }))}
            value={String(resolveValue('renderMode'))}
            onChange={(value) => updateValue('renderMode', value)}
          />
        }
      />
      <SettingsRow
        label={t('settings.global.rows.externalProps.label')}
        description={t('settings.global.rows.externalProps.description')}
        meta={renderMeta('allowExternalProps')}
        control={
          <PdxRadioGroup
            options={[
              {
                label: t('settings.global.rows.externalProps.options.allow'),
                value: 'enabled',
              },
              {
                label: t('settings.global.rows.externalProps.options.disable'),
                value: 'disabled',
              },
            ].map((option) => ({
              ...option,
              disabled: !canEditValue('allowExternalProps'),
            }))}
            value={String(resolveValue('allowExternalProps'))}
            onChange={(value) => updateValue('allowExternalProps', value)}
          />
        }
      />
    </SettingsPanel>
  );
}

function CodegenSettingsPanel({ controller }: GlobalSettingsPanelProps) {
  const { t, canEditValue, renderMeta, resolveValue, updateValue } = controller;

  return (
    <SettingsPanel
      title={t('settings.global.panels.codegen.title')}
      description={t('settings.global.panels.codegen.description')}
    >
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
              {
                label: t('settings.global.rows.defaultFramework.options.html'),
                value: 'html',
              },
            ]}
            value={String(resolveValue('defaultFramework'))}
            onChange={(value) => updateValue('defaultFramework', value)}
            disabled={!canEditValue('defaultFramework')}
          />
        }
      />
      <SettingsRow
        label={t('settings.global.rows.formatting.label')}
        description={t('settings.global.rows.formatting.description')}
        meta={renderMeta('formatting')}
        control={
          <PdxRadioGroup
            options={[
              {
                label: t('settings.global.rows.formatting.options.prettier'),
                value: 'prettier',
              },
              {
                label: t('settings.global.rows.formatting.options.none'),
                value: 'none',
              },
            ].map((option) => ({
              ...option,
              disabled: !canEditValue('formatting'),
            }))}
            value={String(resolveValue('formatting'))}
            onChange={(value) => updateValue('formatting', value)}
          />
        }
      />
      <SettingsRow
        label={t('settings.global.rows.outputPath.label')}
        description={t('settings.global.rows.outputPath.description')}
        meta={renderMeta('outputPath')}
        control={
          <PdxInput
            size="Small"
            value={String(resolveValue('outputPath'))}
            onChange={(value) => updateValue('outputPath', value)}
            disabled={!canEditValue('outputPath')}
          />
        }
      />
      <SettingsRow
        label={t('settings.global.rows.importStyle.label')}
        description={t('settings.global.rows.importStyle.description')}
        meta={renderMeta('importStyle')}
        control={
          <PdxSelect
            size="Small"
            options={[
              {
                label: t('settings.global.rows.importStyle.options.auto'),
                value: 'auto',
              },
              {
                label: t('settings.global.rows.importStyle.options.grouped'),
                value: 'grouped',
              },
              {
                label: t('settings.global.rows.importStyle.options.single'),
                value: 'single',
              },
            ]}
            value={String(resolveValue('importStyle'))}
            onChange={(value) => updateValue('importStyle', value)}
            disabled={!canEditValue('importStyle')}
          />
        }
      />
      <SettingsRow
        label={t('settings.global.rows.metadata.label')}
        description={t('settings.global.rows.metadata.description')}
        meta={renderMeta('metadata')}
        control={
          <PdxRadioGroup
            options={[
              {
                label: t('settings.global.rows.metadata.options.include'),
                value: 'enabled',
              },
              {
                label: t('settings.global.rows.metadata.options.skip'),
                value: 'disabled',
              },
            ].map((option) => ({
              ...option,
              disabled: !canEditValue('metadata'),
            }))}
            value={String(resolveValue('metadata'))}
            onChange={(value) => updateValue('metadata', value)}
          />
        }
      />
    </SettingsPanel>
  );
}

function ShortcutSettingsPanel({ controller }: GlobalSettingsPanelProps) {
  const { t, canEditValue, renderMeta, resolveValue, updateValue } = controller;

  return (
    <SettingsPanel
      title={t('settings.global.panels.shortcuts.title')}
      description={t('settings.global.panels.shortcuts.description')}
    >
      <SettingsRow
        label={t('settings.global.rows.shortcutPreset.label')}
        description={t('settings.global.rows.shortcutPreset.description')}
        meta={renderMeta('shortcutPreset')}
        control={
          <PdxSelect
            size="Small"
            options={[
              {
                label: t('settings.global.rows.shortcutPreset.options.default'),
                value: 'default',
              },
              {
                label: t('settings.global.rows.shortcutPreset.options.vim'),
                value: 'vim',
              },
              {
                label: t('settings.global.rows.shortcutPreset.options.vscode'),
                value: 'vscode',
              },
            ]}
            value={String(resolveValue('shortcutPreset'))}
            onChange={(value) => updateValue('shortcutPreset', value)}
            disabled={!canEditValue('shortcutPreset')}
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
                {
                  label: t(
                    'settings.global.rows.diagnostics.options.perfHints'
                  ),
                  value: 'performance',
                },
                {
                  label: t(
                    'settings.global.rows.diagnostics.options.eventsLog'
                  ),
                  value: 'events',
                },
              ],
              !canEditValue('diagnostics')
            )}
            value={resolveValue('diagnostics') as string[]}
            onChange={(values) => updateValue('diagnostics', values)}
          />
        }
      />
      <SettingsRow
        label={t('settings.global.rows.logLevel.label')}
        description={t('settings.global.rows.logLevel.description')}
        meta={renderMeta('logLevel')}
        control={
          <PdxSelect
            size="Small"
            options={[
              {
                label: t('settings.global.rows.logLevel.options.error'),
                value: 'error',
              },
              {
                label: t('settings.global.rows.logLevel.options.warn'),
                value: 'warn',
              },
              {
                label: t('settings.global.rows.logLevel.options.info'),
                value: 'info',
              },
            ]}
            value={String(resolveValue('logLevel'))}
            onChange={(value) => updateValue('logLevel', value)}
            disabled={!canEditValue('logLevel')}
          />
        }
      />
      <SettingsRow
        label={t('settings.global.rows.telemetry.label')}
        description={t('settings.global.rows.telemetry.description')}
        meta={renderMeta('telemetry')}
        control={
          <PdxRadioGroup
            options={[
              {
                label: t('settings.global.rows.telemetry.options.allow'),
                value: 'on',
              },
              {
                label: t('settings.global.rows.telemetry.options.disable'),
                value: 'off',
              },
            ].map((option) => ({
              ...option,
              disabled: !canEditValue('telemetry'),
            }))}
            value={String(resolveValue('telemetry'))}
            onChange={(value) => updateValue('telemetry', value)}
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
      <ComponentSettingsPanel controller={controller} />
      <CodegenSettingsPanel controller={controller} />
      <ShortcutSettingsPanel controller={controller} />
    </div>
  );
}
