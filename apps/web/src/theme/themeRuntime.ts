import {
  createThemeStyleText,
  officialMonochromeDarkTheme,
  officialMonochromeLightTheme,
  type ThemeManifest,
  validateThemeManifest,
} from '@prodivix/themes';

export type ThemePreference = 'home' | 'light' | 'dark';

type ApplyThemePreferenceOptions = {
  persist?: boolean;
};

const THEME_STYLE_ELEMENT_ID = 'prodivix-theme-runtime';
const THEME_PREFERENCE_STORAGE_KEY = 'prodivix.theme.preference';
const LEGACY_THEME_STORAGE_KEY = 'theme';

const OFFICIAL_THEME_BY_MODE = {
  light: officialMonochromeLightTheme,
  dark: officialMonochromeDarkTheme,
} as const satisfies Record<'light' | 'dark', ThemeManifest>;

export const normalizeThemePreference = (
  value: unknown
): ThemePreference | undefined => {
  return value === 'home' || value === 'light' || value === 'dark'
    ? value
    : undefined;
};

export const getStoredThemePreference = (): ThemePreference | undefined => {
  if (typeof localStorage === 'undefined') return undefined;

  return (
    normalizeThemePreference(
      localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)
    ) ??
    normalizeThemePreference(localStorage.getItem(LEGACY_THEME_STORAGE_KEY))
  );
};

export const resolveThemeMode = (
  preference: ThemePreference
): 'light' | 'dark' => {
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }

  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
};

export const applyThemePreference = (
  preference: ThemePreference,
  options: ApplyThemePreferenceOptions = {}
) => {
  if (typeof document === 'undefined') return;

  const mode = resolveThemeMode(preference);
  const manifest = OFFICIAL_THEME_BY_MODE[mode];

  applyThemeManifest(manifest);

  if (options.persist ?? true) {
    persistThemePreference(preference);
  }
};

export const applyThemeManifest = (manifest: ThemeManifest) => {
  const validation = validateThemeManifest(manifest);

  if (!validation.valid) {
    throw new Error(
      `Invalid theme manifest "${manifest.id}": ${validation.errors
        .map((error) => `${error.path} ${error.message}`)
        .join('; ')}`
    );
  }

  const root = document.documentElement;
  const styleElement = ensureThemeStyleElement();

  styleElement.textContent = createThemeStyleText(manifest);
  root.dataset.theme = manifest.mode === 'dark' ? 'dark' : 'light';
  root.dataset.themeId = manifest.id;
  root.style.colorScheme = root.dataset.theme;
};

export const watchSystemThemePreference = (callback: () => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => undefined;
  }

  const query = window.matchMedia('(prefers-color-scheme: dark)');
  query.addEventListener('change', callback);

  return () => query.removeEventListener('change', callback);
};

const ensureThemeStyleElement = () => {
  const existingElement = document.getElementById(THEME_STYLE_ELEMENT_ID);

  if (existingElement instanceof HTMLStyleElement) {
    return existingElement;
  }

  const styleElement = document.createElement('style');
  styleElement.id = THEME_STYLE_ELEMENT_ID;
  styleElement.dataset.prodivixThemeRuntime = 'true';
  document.head.appendChild(styleElement);

  return styleElement;
};

const persistThemePreference = (preference: ThemePreference) => {
  if (typeof localStorage === 'undefined') return;

  localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference);
  localStorage.setItem(LEGACY_THEME_STORAGE_KEY, preference);
};
