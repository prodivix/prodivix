import { createI18nInstance } from '@prodivix/i18n';
import { initReactI18next } from 'react-i18next';
import en from './resources/en/index';
import zhCN from './resources/zh-CN/index';

const appResources = {
  en,
  'zh-CN': zhCN,
} as const;

const appNamespaces = Object.keys(en);

const getInitialLanguage = (): 'en' | 'zh-CN' => {
  // Check localStorage first
  const stored =
    typeof window !== 'undefined' ? localStorage.getItem('i18nextLng') : null;
  if (stored && (stored === 'en' || stored === 'zh-CN')) {
    return stored;
  }

  // Detect from browser language
  if (typeof navigator !== 'undefined') {
    const browserLang =
      navigator.language ||
      (navigator as { userLanguage?: string }).userLanguage;
    if (browserLang?.startsWith('zh')) {
      return 'zh-CN';
    }
  }

  // Default to English
  return 'en';
};

export const initI18n = async () => {
  const instance = await createI18nInstance({
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    namespaces: appNamespaces,
    plugins: [initReactI18next],
  });

  Object.entries(appResources).forEach(([lng, resource]) => {
    Object.entries(resource).forEach(([namespace, data]) => {
      instance.addResourceBundle(lng, namespace, data, true, true);
    });
  });

  await instance.loadNamespaces(appNamespaces);
  return instance;
};
