import type { NodeCatalogItem } from '../nodeCatalog';
import { CONTROL_IN } from '../nodeCatalogConstants';

export const systemEnvironmentNodeCatalog: NodeCatalogItem[] = [
  {
    kind: 'envVar',
    label: 'Env Var',
    icon: '■',
    groupId: 'system-environment',
    groupLabel: 'System & Environment',
    ports: {
      dataIn: 'in.data.key',
      dataOut: 'out.data.value',
    },
    defaults: {
      key: 'API_BASE_URL',
      fallback: '',
      parse: 'string',
    },
  },
  {
    kind: 'theme',
    label: 'Theme',
    icon: '○',
    groupId: 'system-environment',
    groupLabel: 'System & Environment',
    ports: {
      controlIn: CONTROL_IN,
      dataIn: 'in.data.theme',
      dataOut: 'out.data.theme',
      controlOut: 'out.control.done',
    },
    defaults: {
      action: 'set',
      theme: 'light',
      persist: 'true',
    },
  },
  {
    kind: 'i18n',
    label: 'I18n',
    icon: '■',
    groupId: 'system-environment',
    groupLabel: 'System & Environment',
    ports: {
      dataIn: 'in.data.key',
      dataOut: 'out.data.value',
      controlOut: 'out.control.missing',
    },
    defaults: {
      key: 'app.title',
      locale: 'zh-CN',
      namespace: 'common',
      fallbackLocale: 'en-US',
    },
  },
  {
    kind: 'mediaQuery',
    label: 'Media Query',
    icon: '◇',
    groupId: 'system-environment',
    groupLabel: 'System & Environment',
    ports: {
      dataOut: 'out.data.current',
      controlOut: 'out.control.changed',
    },
    defaults: {
      mobileMax: '767',
      tabletMax: '1023',
      debounceMs: '120',
    },
  },
];
