import type { Page } from 'playwright-core';

export type PlaywrightPreAuthorRuntimeObservation = Readonly<{
  widthCssPixels: number;
  heightCssPixels: number;
  devicePixelRatio: number;
  colorScheme: 'light' | 'dark';
  motionPreference: 'full' | 'reduced';
  locale: string;
}>;

/**
 * Reads the provider-created about:blank document before author navigation.
 * No value is re-read from the mutable author realm after navigation.
 */
export const observePlaywrightPreAuthorRuntime = (
  page: Page
): Promise<PlaywrightPreAuthorRuntimeObservation> =>
  page.evaluate(() => ({
    widthCssPixels: window.innerWidth,
    heightCssPixels: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    colorScheme: matchMedia('(prefers-color-scheme: dark)').matches
      ? ('dark' as const)
      : ('light' as const),
    motionPreference: matchMedia('(prefers-reduced-motion: reduce)').matches
      ? ('reduced' as const)
      : ('full' as const),
    locale: navigator.language,
  }));
