import { beforeEach, describe, expect, it } from 'vitest';
import {
  getGlobalSettingsKeys,
  PROJECT_OVERRIDABLE_SETTINGS,
} from './SettingsDefaults';
import { useSettingsStore } from '@/editor/store/useSettingsStore';
import { resetSettingsStore } from '@/test-utils/editorStore';

describe('settings product contract', () => {
  beforeEach(() => resetSettingsStore());

  it('publishes only settings backed by a current consumer', () => {
    expect(getGlobalSettingsKeys()).toEqual([
      'language',
      'theme',
      'density',
      'fontScale',
      'undoSteps',
      'confirmPrompts',
      'panelLayout',
      'classPxTransformMode',
      'viewportWidth',
      'viewportHeight',
      'zoomStep',
      'assist',
      'panInertia',
      'defaultFramework',
      'diagnostics',
    ]);
    expect(PROJECT_OVERRIDABLE_SETTINGS).toEqual([
      'classPxTransformMode',
      'viewportWidth',
      'viewportHeight',
      'defaultFramework',
    ]);
  });

  it('applies project viewport overrides to the effective consumer value', () => {
    const settings = useSettingsStore.getState();
    settings.setProjectGlobalValue('workspace-1', 'viewportWidth', '1680');
    settings.toggleProjectOverride('workspace-1', 'viewportWidth');

    expect(
      useSettingsStore
        .getState()
        .getEffectiveGlobalValue('workspace-1', 'viewportWidth')
    ).toBe('1680');
    expect(
      useSettingsStore
        .getState()
        .getEffectiveGlobalValue('workspace-2', 'viewportWidth')
    ).toBe('1440');
  });
});
