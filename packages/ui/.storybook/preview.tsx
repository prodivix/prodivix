import type { Preview } from '@storybook/react';
import { MemoryRouter } from 'react-router';
import {
  createThemeFontFaceCss,
  createThemeStyleText,
  officialMonochromeDarkHighContrastTheme,
  officialMonochromeDarkTheme,
  officialMonochromeLightHighContrastTheme,
  officialMonochromeLightTheme,
  type ThemeManifest,
} from '@prodivix/themes';
import '@prodivix/themes/css/font-stacks.css';

const STORYBOOK_THEME_STYLE_ELEMENT_ID = 'prodivix-storybook-theme-runtime';

const STORYBOOK_THEMES = {
  light: officialMonochromeLightTheme,
  dark: officialMonochromeDarkTheme,
  lightHighContrast: officialMonochromeLightHighContrastTheme,
  darkHighContrast: officialMonochromeDarkHighContrastTheme,
} as const satisfies Record<string, ThemeManifest>;

type StorybookThemeKey = keyof typeof STORYBOOK_THEMES;

function getStorybookTheme(value: unknown) {
  return typeof value === 'string' && value in STORYBOOK_THEMES
    ? STORYBOOK_THEMES[value as StorybookThemeKey]
    : officialMonochromeLightTheme;
}

function applyStorybookTheme(manifest: ThemeManifest) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const themeScopes = [
    document.getElementById('storybook-root'),
    ...document.querySelectorAll<HTMLElement>('.sbdocs-preview, .docs-story'),
  ].filter((element): element is HTMLElement => Boolean(element));
  let styleElement = document.getElementById(STORYBOOK_THEME_STYLE_ELEMENT_ID);

  if (!(styleElement instanceof HTMLStyleElement)) {
    styleElement = document.createElement('style');
    styleElement.id = STORYBOOK_THEME_STYLE_ELEMENT_ID;
    styleElement.dataset.prodivixStorybookThemeRuntime = 'true';
    document.head.appendChild(styleElement);
  }

  styleElement.textContent = [
    createThemeStyleText(manifest, {
      selector: '.prodivix-storybook-theme-scope',
    }),
    createThemeFontFaceCss(manifest.fonts),
    createStorybookPreviewSurfaceCss(),
  ]
    .filter(Boolean)
    .join('\n\n');
  root.removeAttribute('data-theme');
  root.removeAttribute('data-theme-id');
  root.style.removeProperty('color-scheme');

  document
    .querySelectorAll<HTMLElement>('.prodivix-storybook-theme-scope')
    .forEach((element) => {
      if (!themeScopes.includes(element)) {
        element.classList.remove('prodivix-storybook-theme-scope');
        delete element.dataset.theme;
        delete element.dataset.themeId;
        element.style.removeProperty('color-scheme');
      }
    });

  themeScopes.forEach((element) => {
    element.classList.add('prodivix-storybook-theme-scope');
    element.dataset.theme = manifest.mode;
    element.dataset.themeId = manifest.id;
    element.style.colorScheme = manifest.mode;
  });
}

function createStorybookPreviewSurfaceCss() {
  return `
.sb-main-centered #storybook-root,
.sb-main-fullscreen #storybook-root,
.sb-main-padded #storybook-root,
.sbdocs-preview,
.docs-story {
  background: var(--bg-canvas) !important;
  color: var(--text-primary);
}

.sbdocs-preview,
.docs-story {
  background: var(--bg-canvas) !important;
  color: var(--text-primary) !important;
}

.sbdocs-preview,
.docs-story {
  border-color: var(--border-default) !important;
}
`;
}

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Prodivix theme',
      defaultValue: 'light',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
          { value: 'lightHighContrast', title: 'Light High Contrast' },
          { value: 'darkHighContrast', title: 'Dark High Contrast' },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    (Story, context) => {
      applyStorybookTheme(getStorybookTheme(context.globals.theme));

      return (
        <MemoryRouter initialEntries={['/']}>
          <Story />
        </MemoryRouter>
      );
    },
  ],
};

export default preview;
