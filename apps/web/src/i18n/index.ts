import {
  createI18nInstance,
  supportedLngs,
  type SupportedLanguage,
} from '@prodivix/i18n';
import type { i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

export const appNamespaces = [
  'auth',
  'blueprint',
  'community',
  'editor',
  'export',
  'home',
  'profile',
  'routes',
] as const;

export type AppNamespace = (typeof appNamespaces)[number];

type NamespaceResource = Record<string, unknown>;
type NamespaceModule = { default: NamespaceResource };
type NamespaceLoader = () => Promise<NamespaceModule>;

const appResourceLoaders = {
  en: {
    auth: () => import('./resources/en/auth.json'),
    blueprint: () => import('./resources/en/blueprint.json'),
    community: () => import('./resources/en/community.json'),
    editor: () => import('./resources/en/editor.json'),
    export: () => import('./resources/en/export.json'),
    home: () => import('./resources/en/home.json'),
    profile: () => import('./resources/en/profile.json'),
    routes: () => import('./resources/en/routes.json'),
  },
  'zh-CN': {
    auth: () => import('./resources/zh-CN/auth.json'),
    blueprint: () => import('./resources/zh-CN/blueprint.json'),
    community: () => import('./resources/zh-CN/community.json'),
    editor: () => import('./resources/zh-CN/editor.json'),
    export: () => import('./resources/zh-CN/export.json'),
    home: () => import('./resources/zh-CN/home.json'),
    profile: () => import('./resources/zh-CN/profile.json'),
    routes: () => import('./resources/zh-CN/routes.json'),
  },
} as const satisfies Record<
  SupportedLanguage,
  Record<AppNamespace, NamespaceLoader>
>;

const namespaceLoadsByInstance = new WeakMap<
  i18n,
  Map<AppNamespace, Promise<void>>
>();

const loadAppNamespace = (instance: i18n, namespace: AppNamespace) => {
  if (
    supportedLngs.every((language) =>
      instance.hasResourceBundle(language, namespace)
    )
  ) {
    return Promise.resolve();
  }

  const instanceLoads =
    namespaceLoadsByInstance.get(instance) ??
    new Map<AppNamespace, Promise<void>>();
  namespaceLoadsByInstance.set(instance, instanceLoads);

  const existingLoad = instanceLoads.get(namespace);
  if (existingLoad) return existingLoad;

  const load = Promise.all(
    supportedLngs.map(async (language) => {
      const module = await appResourceLoaders[language][namespace]();
      return [language, module.default] as const;
    })
  ).then(async (resources) => {
    resources.forEach(([language, resource]) => {
      instance.addResourceBundle(language, namespace, resource, true, true);
    });
    await instance.loadNamespaces(namespace);
  });

  const trackedLoad = load.catch((error: unknown) => {
    instanceLoads.delete(namespace);
    throw error;
  });
  instanceLoads.set(namespace, trackedLoad);
  return trackedLoad;
};

/**
 * Loads both supported languages for a route namespace once, keeping the
 * in-product language switch synchronous after that route has opened.
 */
export const loadAppNamespaces = async (
  instance: i18n,
  namespaces: readonly AppNamespace[]
) => {
  await Promise.all(
    [...new Set(namespaces)].map((namespace) =>
      loadAppNamespace(instance, namespace)
    )
  );
};

const getInitialLanguage = (): 'en' | 'zh-CN' => {
  const stored =
    typeof window !== 'undefined'
      ? window.localStorage?.getItem('i18nextLng')
      : null;
  if (stored && (stored === 'en' || stored === 'zh-CN')) {
    return stored;
  }

  if (typeof navigator !== 'undefined') {
    const browserLang =
      navigator.language ||
      (navigator as { userLanguage?: string }).userLanguage;
    if (browserLang?.startsWith('zh')) {
      return 'zh-CN';
    }
  }

  return 'en';
};

export const initI18n = async () => {
  const instance = await createI18nInstance({
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    plugins: [initReactI18next],
  });

  await loadAppNamespaces(instance, ['home', 'routes']);
  return instance;
};
