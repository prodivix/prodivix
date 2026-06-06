export const createGlobalDefaults = () => ({
  language: 'zh-CN',
  theme: 'home',
  density: 'comfortable',
  fontScale: 100,
  autosaveMode: 'on-change',
  autosaveInterval: 20,
  undoSteps: '80',
  confirmPrompts: ['delete', 'reset', 'leave'],
  panelLayout: 'balanced',
  classPxTransformMode: 'preserve-intent',
  viewportWidth: '1440',
  viewportHeight: '900',
  zoomStep: 5,
  assist: ['grid', 'align', 'snap'],
  panInertia: 30,
  eventTriggerMode: 'selected-only',
  resolverOrder: 'custom>prodivix>native',
  customNamespaces: 'acme, design-system',
  renderMode: 'strict',
  allowExternalProps: 'enabled',
  defaultFramework: 'react',
  formatting: 'prettier',
  outputPath: 'src/generated',
  importStyle: 'auto',
  metadata: 'enabled',
  shortcutPreset: 'default',
  diagnostics: ['selection', 'performance'],
  logLevel: 'info',
  telemetry: 'off',
});

export const createProjectDefaults = () => ({
  ...createGlobalDefaults(),
  viewportWidth: '1280',
  viewportHeight: '720',
  outputPath: 'apps/web/generated',
  customNamespaces: 'project-ui, acme',
});

export type GlobalSettingsState = ReturnType<typeof createGlobalDefaults>;
export type SettingsMode = 'global' | 'project';
export type OverrideState = Record<string, boolean>;

export const PROJECT_OVERRIDABLE_SETTINGS = [
  'classPxTransformMode',
  'viewportWidth',
  'viewportHeight',
  'eventTriggerMode',
  'resolverOrder',
  'customNamespaces',
  'renderMode',
  'allowExternalProps',
  'defaultFramework',
  'formatting',
  'outputPath',
  'importStyle',
  'metadata',
] as const satisfies ReadonlyArray<keyof GlobalSettingsState>;

export const GLOBAL_ONLY_SETTINGS = (
  Object.keys(createGlobalDefaults()) as Array<keyof GlobalSettingsState>
).filter(
  (key) =>
    !PROJECT_OVERRIDABLE_SETTINGS.includes(
      key as (typeof PROJECT_OVERRIDABLE_SETTINGS)[number]
    )
) as Array<keyof GlobalSettingsState>;

export const isProjectOverridableSetting = (key: keyof GlobalSettingsState) =>
  PROJECT_OVERRIDABLE_SETTINGS.includes(
    key as (typeof PROJECT_OVERRIDABLE_SETTINGS)[number]
  );
