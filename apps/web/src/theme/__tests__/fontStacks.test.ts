import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_THEME_FONT_FACES,
  THEME_FONT_STACKS,
  createThemeFontFaceCss,
  isSafeFontSourceUrl,
  officialMonochromeDarkHighContrastTheme,
  officialMonochromeDarkTheme,
  officialMonochromeLightHighContrastTheme,
  officialMonochromeLightTheme,
  validateThemeManifest,
} from '@prodivix/themes';

const officialThemes = [
  officialMonochromeLightTheme,
  officialMonochromeDarkTheme,
  officialMonochromeLightHighContrastTheme,
  officialMonochromeDarkHighContrastTheme,
];

const fontStackCss = readFileSync(
  resolve(process.cwd(), '../../packages/themes/src/css/font-stacks.css'),
  'utf8'
);

describe('official theme font stacks', () => {
  it('reuse the shared UI, mono, and canvas font stacks', () => {
    for (const theme of officialThemes) {
      expect(theme.typography?.fontFamily).toMatchObject(THEME_FONT_STACKS);
    }
  });

  it('keeps the shared CSS variables aligned with the theme font stacks', () => {
    expect(readCssVariable(fontStackCss, '--font-family-ui')).toBe(
      THEME_FONT_STACKS.ui
    );
    expect(readCssVariable(fontStackCss, '--font-family-mono')).toBe(
      THEME_FONT_STACKS.mono
    );
  });

  it('reuses the official controlled font registry', () => {
    for (const theme of officialThemes) {
      expect(theme.fonts?.faces).toEqual(OFFICIAL_THEME_FONT_FACES);
      expect(validateThemeManifest(theme).valid).toBe(true);
    }
  });

  it('generates safe font-face CSS from the controlled registry', () => {
    const cssText = createThemeFontFaceCss(officialThemes[0].fonts);

    expect(cssText).toContain('@font-face');
    expect(cssText).toContain("font-family: 'Mona Sans Variable'");
    expect(cssText).toContain(
      "url('@fontsource-variable/mona-sans/files/mona-sans-latin-standard-normal.woff2') format('woff2')"
    );
    expect(cssText).not.toContain('@import');
  });

  it('rejects unsafe font source URLs', () => {
    expect(isSafeFontSourceUrl('https://example.com/fonts/ui.woff2')).toBe(
      true
    );
    expect(
      isSafeFontSourceUrl(
        '@fontsource-variable/mona-sans/files/mona-sans-latin-standard-normal.woff2'
      )
    ).toBe(true);
    expect(isSafeFontSourceUrl('javascript:alert(1).woff2')).toBe(false);
    expect(isSafeFontSourceUrl('https://example.com/fonts/ui.ttf')).toBe(false);
    expect(isSafeFontSourceUrl('data:text/css;base64,AAAA')).toBe(false);
  });
});

const readCssVariable = (cssText: string, variableName: string) => {
  const match = cssText.match(
    new RegExp(`${escapeRegExp(variableName)}:\\s*([\\s\\S]*?);`)
  );

  return match?.[1].replace(/\s+/g, ' ').trim();
};

const escapeRegExp = (value: string) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
