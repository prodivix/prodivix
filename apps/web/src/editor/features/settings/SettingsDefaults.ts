export const createGlobalDefaults = () => ({
  language: 'zh-CN',
  theme: 'home',
  density: 'comfortable',
  fontScale: 100,
  undoSteps: '80',
  confirmPrompts: ['leave'],
  panelLayout: 'balanced',
  classPxTransformMode: 'preserve-intent',
  viewportWidth: '1440',
  viewportHeight: '900',
  zoomStep: 5,
  assist: ['grid'],
  panInertia: 30,
  defaultFramework: 'react',
  diagnostics: ['selection'],
});

export const createProjectDefaults = () => ({
  ...createGlobalDefaults(),
  viewportWidth: '1280',
  viewportHeight: '720',
});

export type GlobalSettingsState = ReturnType<typeof createGlobalDefaults>;
export type SettingsMode = 'global' | 'project';
export type OverrideState = Partial<Record<keyof GlobalSettingsState, boolean>>;

export const getGlobalSettingsKeys = () =>
  Object.keys(createGlobalDefaults()) as Array<keyof GlobalSettingsState>;

export const PROJECT_OVERRIDABLE_SETTINGS = [
  'classPxTransformMode',
  'viewportWidth',
  'viewportHeight',
  'defaultFramework',
] as const satisfies ReadonlyArray<keyof GlobalSettingsState>;

export const GLOBAL_ONLY_SETTINGS = getGlobalSettingsKeys().filter(
  (key) =>
    !PROJECT_OVERRIDABLE_SETTINGS.includes(
      key as (typeof PROJECT_OVERRIDABLE_SETTINGS)[number]
    )
) as Array<keyof GlobalSettingsState>;

export const isProjectOverridableSetting = (key: keyof GlobalSettingsState) =>
  PROJECT_OVERRIDABLE_SETTINGS.includes(
    key as (typeof PROJECT_OVERRIDABLE_SETTINGS)[number]
  );
