import 'fake-indexeddb/auto';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

const changeLanguage = vi.fn();
(
  globalThis as { __i18nChangeLanguage?: typeof changeLanguage }
).__i18nChangeLanguage = changeLanguage;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?: { defaultValue?: string; width?: string; height?: string }
    ) => {
      if (options?.defaultValue) return options.defaultValue;
      if (
        typeof options?.width !== 'undefined' &&
        typeof options?.height !== 'undefined'
      ) {
        return `${options.width}×${options.height}`;
      }
      return key;
    },
    i18n: {
      language: 'en',
      changeLanguage,
    },
  }),
}));

afterEach(() => {
  changeLanguage.mockClear();
  cleanup();
});
