import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createProjectDefaults,
  type GlobalSettingsState,
  type OverrideState,
  type SettingsMode,
  isProjectOverridableSetting,
} from './SettingsDefaults';
import { formatValue } from './SettingsShared';
import { GlobalSettingsPanels } from './GlobalSettingsPanels';
import { useSettingsStore } from '@/editor/store/useSettingsStore';

export type GlobalSettingsContentProps = {
  mode?: SettingsMode;
  overrides?: OverrideState;
  onToggleOverride?: (key: keyof GlobalSettingsState) => void;
  projectId?: string;
};

export const GlobalSettingsContent = ({
  mode = 'global',
  overrides = {},
  onToggleOverride,
  projectId,
}: GlobalSettingsContentProps) => {
  const { t } = useTranslation('editor');
  const globalValues = useSettingsStore((state) => state.global);
  const setGlobalValue = useSettingsStore((state) => state.setGlobalValue);
  const setProjectGlobalValue = useSettingsStore(
    (state) => state.setProjectGlobalValue
  );
  const projectValues = useSettingsStore((state) =>
    projectId ? state.projectGlobalById[projectId]?.values : undefined
  );
  const projectFallback = useMemo(() => createProjectDefaults(), []);
  const isProjectMode = mode === 'project';

  const canOverrideInProject = (key: keyof GlobalSettingsState) =>
    isProjectMode && isProjectOverridableSetting(key);

  const isOverrideEnabled = (key: keyof GlobalSettingsState) =>
    canOverrideInProject(key) ? Boolean(overrides[key]) : false;

  const canEditValue = (key: keyof GlobalSettingsState) =>
    !canOverrideInProject(key) || isOverrideEnabled(key);

  const resolveValue = (key: keyof GlobalSettingsState) => {
    if (!isProjectMode) return globalValues[key];
    if (!canOverrideInProject(key)) return globalValues[key];
    const projectValue = projectValues?.[key] ?? projectFallback[key];
    return isOverrideEnabled(key) ? projectValue : globalValues[key];
  };

  const updateValue = <K extends keyof GlobalSettingsState>(
    key: K,
    value: GlobalSettingsState[K]
  ) => {
    if (isProjectMode) {
      if (!canOverrideInProject(key)) {
        setGlobalValue(key, value);
        return;
      }
      if (!projectId || !isOverrideEnabled(key)) return;
      setProjectGlobalValue(projectId, key, value);
      return;
    }
    setGlobalValue(key, value);
  };

  const renderMeta = (key: keyof GlobalSettingsState) => {
    if (!isProjectMode) return undefined;
    if (!canOverrideInProject(key)) {
      return (
        <span className="rounded-full border border-[rgba(0,0,0,0.12)] bg-(--bg-panel) px-2.5 py-1 text-[11px] leading-[1.2] text-(--text-secondary) in-data-[theme='dark']:border-[rgba(255,255,255,0.16)] in-data-[theme='dark']:bg-[rgba(255,255,255,0.08)]">
          {t('settings.overrides.labels.globalOnly')}
        </span>
      );
    }
    const enabled = isOverrideEnabled(key);
    const globalValue = formatValue(globalValues[key]);
    const effectiveValue = formatValue(resolveValue(key));
    return (
      <>
        <button
          type="button"
          className={`rounded-full border px-2.5 py-1 text-[11px] transition-all duration-150 ease-[ease] ${
            enabled
              ? 'border-transparent bg-(--text-primary) text-(--bg-canvas)'
              : "border-[rgba(0,0,0,0.12)] bg-(--bg-panel) text-(--text-secondary) hover:border-[rgba(0,0,0,0.2)] hover:text-(--text-primary) in-data-[theme='dark']:border-[rgba(255,255,255,0.16)] in-data-[theme='dark']:bg-[rgba(255,255,255,0.08)]"
          }`}
          aria-pressed={enabled}
          onClick={() => onToggleOverride?.(key)}
        >
          {enabled
            ? t('settings.overrides.toggle.on')
            : t('settings.overrides.toggle.off')}
        </button>
        <span className="leading-[1.2]">
          {t('settings.overrides.labels.global', {
            value: globalValue,
          })}
        </span>
        <span className="leading-[1.2]">
          {t('settings.overrides.labels.effective', {
            value: effectiveValue,
          })}
        </span>
      </>
    );
  };

  return (
    <GlobalSettingsPanels
      controller={{
        t,
        canEditValue,
        renderMeta,
        resolveValue,
        updateValue,
      }}
    />
  );
};
