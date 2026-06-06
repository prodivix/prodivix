import type { I18nResources, defaultNS } from '@prodivix/i18n';
import type en from './resources/en/index';

type AppResources = typeof en;
type CombinedResources = Record<string, unknown>;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: CombinedResources;
  }
}

export {};
