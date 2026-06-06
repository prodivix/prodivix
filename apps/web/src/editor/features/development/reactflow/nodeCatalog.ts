import type {
  GraphNodeData,
  GraphNodeKind,
  PortSemantic,
} from './graphNodeShared';

type NodePortProfile = {
  controlIn?: string;
  controlOut?: string;
  dataIn?: string;
  dataOut?: string;
  conditionIn?: string;
  conditionOut?: string;
};

export type NodeCatalogItem = {
  kind: GraphNodeKind;
  label: string;
  icon: string;
  groupId: string;
  groupLabel: string;
  ports: NodePortProfile;
  defaults?: Partial<GraphNodeData>;
};

type NodeMenuEntry = Pick<NodeCatalogItem, 'kind' | 'label' | 'icon'>;

export type NodeMenuGroup = {
  id: string;
  label: string;
  items: NodeMenuEntry[];
};

const CONTROL_IN = 'in.control.prev';
const CONTROL_OUT = 'out.control.next';
const DATA_IN = 'in.data.value';
const DATA_OUT = 'out.data.value';
const CONDITION_IN = 'in.condition.value';
const CONDITION_OUT = 'out.condition.result';

const NODE_CATALOG: NodeCatalogItem[] = [
  {
    kind: 'start',
    label: 'Start',
    icon: '○',
    groupId: 'flow-control',
    groupLabel: 'Flow Control',
    ports: { controlOut: CONTROL_OUT },
  },
  {
    kind: 'end',
    label: 'End',
    icon: '○',
    groupId: 'flow-control',
    groupLabel: 'Flow Control',
    ports: { controlIn: CONTROL_IN },
  },
  {
    kind: 'process',
    label: 'Process',
    icon: '○',
    groupId: 'flow-control',
    groupLabel: 'Flow Control',
    ports: { controlIn: CONTROL_IN, controlOut: CONTROL_OUT },
  },
  {
    kind: 'if',
    label: 'If',
    icon: '◇',
    groupId: 'flow-control',
    groupLabel: 'Flow Control',
    ports: {
      controlIn: CONTROL_IN,
      controlOut: 'out.control.true',
      conditionIn: 'in.condition.guard',
    },
  },
  {
    kind: 'switch',
    label: 'Switch',
    icon: '◇',
    groupId: 'flow-control',
    groupLabel: 'Flow Control',
    ports: {
      controlIn: CONTROL_IN,
      dataIn: 'in.data.value',
      conditionIn: 'in.condition.case',
      controlOut: 'out.control.default',
    },
    defaults: { collapsed: false },
  },
  {
    kind: 'forEach',
    label: 'ForEach',
    icon: '○',
    groupId: 'flow-control',
    groupLabel: 'Flow Control',
    ports: {
      controlIn: CONTROL_IN,
      controlOut: 'out.control.body',
      dataIn: 'in.data.items',
      dataOut: 'out.data.item',
    },
    defaults: { value: 'item' },
  },
  {
    kind: 'tryCatch',
    label: 'Try/Catch',
    icon: '○',
    groupId: 'flow-control',
    groupLabel: 'Flow Control',
    ports: { controlIn: CONTROL_IN, controlOut: 'out.control.try' },
  },
  {
    kind: 'delay',
    label: 'Delay',
    icon: '○',
    groupId: 'flow-control',
    groupLabel: 'Flow Control',
    ports: {
      controlIn: CONTROL_IN,
      controlOut: CONTROL_OUT,
      dataIn: 'in.data.ms',
    },
    defaults: { timeoutMs: '300' },
  },
  {
    kind: 'parallel',
    label: 'Parallel',
    icon: '○',
    groupId: 'flow-control',
    groupLabel: 'Flow Control',
    ports: { controlIn: CONTROL_IN, controlOut: 'out.control.branch' },
    defaults: {
      branches: [
        { id: 'branch-a', label: 'branch-1' },
        { id: 'branch-b', label: 'branch-2' },
      ],
    },
  },
  {
    kind: 'race',
    label: 'Race',
    icon: '○',
    groupId: 'flow-control',
    groupLabel: 'Flow Control',
    ports: { controlIn: CONTROL_IN, controlOut: 'out.control.branch' },
    defaults: {
      branches: [
        { id: 'branch-a', label: 'branch-1' },
        { id: 'branch-b', label: 'branch-2' },
      ],
    },
  },

  {
    kind: 'onMount',
    label: 'On Mount',
    icon: '○',
    groupId: 'events',
    groupLabel: 'Events',
    ports: { controlOut: CONTROL_OUT },
    defaults: { description: 'fire once after mount' },
  },
  {
    kind: 'onClick',
    label: 'On Click',
    icon: '○',
    groupId: 'events',
    groupLabel: 'Events',
    ports: { controlOut: CONTROL_OUT },
    defaults: { selector: '#button' },
  },
  {
    kind: 'onInput',
    label: 'On Input',
    icon: '○',
    groupId: 'events',
    groupLabel: 'Events',
    ports: { controlOut: CONTROL_OUT },
    defaults: { selector: 'input' },
  },
  {
    kind: 'onSubmit',
    label: 'On Submit',
    icon: '○',
    groupId: 'events',
    groupLabel: 'Events',
    ports: { controlOut: CONTROL_OUT },
    defaults: { selector: 'form' },
  },
  {
    kind: 'onRouteEnter',
    label: 'On Route Enter',
    icon: '○',
    groupId: 'events',
    groupLabel: 'Events',
    ports: { controlOut: CONTROL_OUT },
    defaults: { routePath: '/' },
  },
  {
    kind: 'onTimer',
    label: 'On Timer',
    icon: '○',
    groupId: 'events',
    groupLabel: 'Events',
    ports: { controlOut: CONTROL_OUT },
    defaults: { timeoutMs: '1000' },
  },

  {
    kind: 'string',
    label: 'String',
    icon: '■',
    groupId: 'data-input',
    groupLabel: 'Data Input',
    ports: { dataOut: DATA_OUT },
    defaults: { value: 'hello', collapsed: false },
  },
  {
    kind: 'number',
    label: 'Number',
    icon: '■',
    groupId: 'data-input',
    groupLabel: 'Data Input',
    ports: { dataOut: DATA_OUT },
    defaults: { value: '42', collapsed: false },
  },
  {
    kind: 'boolean',
    label: 'Boolean',
    icon: '■',
    groupId: 'data-input',
    groupLabel: 'Data Input',
    ports: { dataOut: DATA_OUT },
    defaults: { value: 'true', collapsed: false },
  },
  {
    kind: 'object',
    label: 'Object',
    icon: '■',
    groupId: 'data-input',
    groupLabel: 'Data Input',
    ports: { dataOut: DATA_OUT },
    defaults: { value: '{\"key\":\"value\"}', collapsed: false },
  },
  {
    kind: 'array',
    label: 'Array',
    icon: '■',
    groupId: 'data-input',
    groupLabel: 'Data Input',
    ports: { dataOut: DATA_OUT },
    defaults: { value: '[1,2,3]', collapsed: false },
  },
  {
    kind: 'expression',
    label: 'Expression',
    icon: '◇',
    groupId: 'data-input',
    groupLabel: 'Data Input',
    ports: { dataOut: DATA_OUT, conditionOut: CONDITION_OUT },
    defaults: { expression: 'a > b', collapsed: false },
  },
  {
    kind: 'code',
    label: 'Code',
    icon: '○',
    groupId: 'data-input',
    groupLabel: 'Data Input',
    ports: { controlIn: CONTROL_IN, controlOut: CONTROL_OUT },
    defaults: {
      code: "console.log('hello prodivix');",
      codeLanguage: 'tsx',
      codeSize: 'md',
      collapsed: false,
    },
  },

  {
    kind: 'compare',
    label: 'Compare',
    icon: '◇',
    groupId: 'data-transform',
    groupLabel: 'Data Transform',
    ports: { dataIn: DATA_IN, dataOut: DATA_OUT, conditionOut: CONDITION_OUT },
    defaults: { operator: '===', value: '0' },
  },
  {
    kind: 'math',
    label: 'Math',
    icon: '■',
    groupId: 'data-transform',
    groupLabel: 'Data Transform',
    ports: { dataIn: DATA_IN, dataOut: DATA_OUT },
    defaults: { operator: '+', value: '0' },
  },
  {
    kind: 'templateString',
    label: 'Template String',
    icon: '■',
    groupId: 'data-transform',
    groupLabel: 'Data Transform',
    ports: { dataIn: DATA_IN, dataOut: DATA_OUT },
    defaults: { expression: 'Hello ${name}' },
  },
  {
    kind: 'jsonParse',
    label: 'JSON Parse',
    icon: '■',
    groupId: 'data-transform',
    groupLabel: 'Data Transform',
    ports: { dataIn: DATA_IN, dataOut: DATA_OUT },
    defaults: { value: '{"ok":true}' },
  },
  {
    kind: 'jsonStringify',
    label: 'JSON Stringify',
    icon: '■',
    groupId: 'data-transform',
    groupLabel: 'Data Transform',
    ports: { dataIn: DATA_IN, dataOut: DATA_OUT },
    defaults: { value: '{"ok":true}' },
  },
  {
    kind: 'map',
    label: 'Map',
    icon: '■',
    groupId: 'data-transform',
    groupLabel: 'Data Transform',
    ports: { dataIn: DATA_IN, dataOut: DATA_OUT },
    defaults: { expression: '(item) => item' },
  },
  {
    kind: 'filter',
    label: 'Filter',
    icon: '◇',
    groupId: 'data-transform',
    groupLabel: 'Data Transform',
    ports: { dataIn: DATA_IN, dataOut: DATA_OUT, conditionIn: CONDITION_IN },
    defaults: { expression: '(item) => true' },
  },
  {
    kind: 'reduce',
    label: 'Reduce',
    icon: '■',
    groupId: 'data-transform',
    groupLabel: 'Data Transform',
    ports: { dataIn: DATA_IN, dataOut: DATA_OUT },
    defaults: { expression: '(acc, item) => acc + item', value: '0' },
  },

  {
    kind: 'getState',
    label: 'Get State',
    icon: '■',
    groupId: 'state',
    groupLabel: 'State',
    ports: { dataOut: DATA_OUT },
    defaults: { stateKey: 'count' },
  },
  {
    kind: 'setState',
    label: 'Set State',
    icon: '○',
    groupId: 'state',
    groupLabel: 'State',
    ports: { controlIn: CONTROL_IN, controlOut: CONTROL_OUT, dataIn: DATA_IN },
    defaults: {
      stateKey: 'count',
      expression: 'count + 1',
      keyValueEntries: [{ id: 'dep-1', key: 'count', value: 'state.count' }],
    },
  },
  {
    kind: 'computed',
    label: 'Computed',
    icon: '■',
    groupId: 'state',
    groupLabel: 'State',
    ports: { dataIn: DATA_IN, dataOut: DATA_OUT },
    defaults: {
      stateKey: 'doubleCount',
      expression: '(state) => state.count * 2',
      keyValueEntries: [{ id: 'dep-1', key: 'count', value: 'state.count' }],
    },
  },
  {
    kind: 'watchState',
    label: 'Watch State',
    icon: '○',
    groupId: 'state',
    groupLabel: 'State',
    ports: { controlOut: CONTROL_OUT, dataIn: DATA_IN },
    defaults: { stateKey: 'count' },
  },
  {
    kind: 'localStorageRead',
    label: 'LocalStorage Read',
    icon: '■',
    groupId: 'state',
    groupLabel: 'State',
    ports: { dataIn: DATA_IN, dataOut: DATA_OUT },
    defaults: { stateKey: 'auth.token' },
  },
  {
    kind: 'localStorageWrite',
    label: 'LocalStorage Write',
    icon: '○',
    groupId: 'state',
    groupLabel: 'State',
    ports: { controlIn: CONTROL_IN, controlOut: CONTROL_OUT, dataIn: DATA_IN },
    defaults: { stateKey: 'auth.token', expression: 'value' },
  },

  {
    kind: 'fetch',
    label: 'Fetch',
    icon: '○',
    groupId: 'network',
    groupLabel: 'Network',
    ports: {
      controlIn: CONTROL_IN,
      dataIn: 'in.data.url',
      controlOut: 'out.control.error-request',
    },
    defaults: { method: 'GET', value: '', collapsed: false },
  },
  {
    kind: 'retry',
    label: 'Retry',
    icon: '○',
    groupId: 'network',
    groupLabel: 'Network',
    ports: { controlIn: CONTROL_IN, controlOut: CONTROL_OUT },
    defaults: { value: '3' },
  },
  {
    kind: 'timeout',
    label: 'Timeout',
    icon: '○',
    groupId: 'network',
    groupLabel: 'Network',
    ports: { controlIn: CONTROL_IN, controlOut: CONTROL_OUT, dataIn: DATA_IN },
    defaults: { timeoutMs: '3000' },
  },
  {
    kind: 'cancel',
    label: 'Cancel',
    icon: '○',
    groupId: 'network',
    groupLabel: 'Network',
    ports: { controlIn: CONTROL_IN, controlOut: CONTROL_OUT },
    defaults: { description: 'cancel request' },
  },
  {
    kind: 'cacheRead',
    label: 'Cache Read',
    icon: '■',
    groupId: 'network',
    groupLabel: 'Network',
    ports: { dataIn: DATA_IN, dataOut: DATA_OUT },
    defaults: { stateKey: 'cache:user:list' },
  },
  {
    kind: 'cacheWrite',
    label: 'Cache Write',
    icon: '○',
    groupId: 'network',
    groupLabel: 'Network',
    ports: { controlIn: CONTROL_IN, controlOut: CONTROL_OUT, dataIn: DATA_IN },
    defaults: { stateKey: 'cache:user:list' },
  },

  {
    kind: 'navigate',
    label: 'Navigate',
    icon: '○',
    groupId: 'routing',
    groupLabel: 'Routing',
    ports: { controlIn: CONTROL_IN, controlOut: CONTROL_OUT, dataIn: DATA_IN },
    defaults: { routePath: '/dashboard' },
  },
  {
    kind: 'routeParams',
    label: 'Route Params',
    icon: '■',
    groupId: 'routing',
    groupLabel: 'Routing',
    ports: { dataOut: DATA_OUT },
    defaults: { routePath: '/orders/:id' },
  },
  {
    kind: 'routeQuery',
    label: 'Route Query',
    icon: '■',
    groupId: 'routing',
    groupLabel: 'Routing',
    ports: { dataOut: DATA_OUT },
    defaults: { routePath: '/orders?status=paid' },
  },
  {
    kind: 'routeGuard',
    label: 'Route Guard',
    icon: '◇',
    groupId: 'routing',
    groupLabel: 'Routing',
    ports: {
      controlIn: CONTROL_IN,
      controlOut: CONTROL_OUT,
      conditionIn: CONDITION_IN,
    },
    defaults: { routePath: '/admin' },
  },

  {
    kind: 'renderComponent',
    label: 'Render Component',
    icon: '○',
    groupId: 'ui',
    groupLabel: 'UI',
    ports: { controlIn: CONTROL_IN, controlOut: CONTROL_OUT, dataIn: DATA_IN },
    defaults: {
      value: 'Card',
      keyValueEntries: [{ id: 'prop-1', key: 'title', value: 'state.title' }],
    },
  },
  {
    kind: 'conditionalRender',
    label: 'Conditional Render',
    icon: '◇',
    groupId: 'ui',
    groupLabel: 'UI',
    ports: {
      controlIn: CONTROL_IN,
      controlOut: CONTROL_OUT,
      dataIn: DATA_IN,
      conditionIn: CONDITION_IN,
    },
    defaults: {
      value: 'ProtectedPanel',
      keyValueEntries: [{ id: 'prop-1', key: 'user', value: 'state.user' }],
    },
  },
  {
    kind: 'listRender',
    label: 'List Render',
    icon: '○',
    groupId: 'ui',
    groupLabel: 'UI',
    ports: { controlIn: CONTROL_IN, controlOut: CONTROL_OUT, dataIn: DATA_IN },
    defaults: {
      value: 'ListItem',
      keyValueEntries: [{ id: 'prop-1', key: 'item', value: 'item' }],
    },
  },
  {
    kind: 'toast',
    label: 'Toast',
    icon: '○',
    groupId: 'ui',
    groupLabel: 'UI',
    ports: { controlIn: CONTROL_IN, controlOut: CONTROL_OUT, dataIn: DATA_IN },
    defaults: { description: 'Saved successfully' },
  },
  {
    kind: 'modal',
    label: 'Modal',
    icon: '○',
    groupId: 'ui',
    groupLabel: 'UI',
    ports: { controlIn: CONTROL_IN, controlOut: CONTROL_OUT, dataIn: DATA_IN },
    defaults: { value: 'settings-modal' },
  },

  {
    kind: 'playAnimation',
    label: 'Play Animation',
    icon: '○',
    groupId: 'interaction-motion',
    groupLabel: 'Interaction & Motion',
    ports: {
      controlIn: CONTROL_IN,
      dataIn: 'in.data.target',
      controlOut: 'out.control.complete',
    },
    defaults: {
      targetId: 'hero-banner',
      timelineName: 'fade-in',
      action: 'play',
      speed: '1',
      iterations: '1',
    },
  },
  {
    kind: 'scrollTo',
    label: 'Scroll To',
    icon: '○',
    groupId: 'interaction-motion',
    groupLabel: 'Interaction & Motion',
    ports: {
      controlIn: CONTROL_IN,
      dataIn: 'in.data.target',
      controlOut: 'out.control.done',
    },
    defaults: {
      target: 'top',
      selector: '#section-anchor',
      behavior: 'smooth',
      offset: '0',
    },
  },
  {
    kind: 'focusControl',
    label: 'Focus Control',
    icon: '○',
    groupId: 'interaction-motion',
    groupLabel: 'Interaction & Motion',
    ports: {
      controlIn: CONTROL_IN,
      dataIn: 'in.data.target',
      controlOut: 'out.control.done',
    },
    defaults: {
      action: 'focus',
      selector: '#email-input',
    },
  },
  {
    kind: 'clipboard',
    label: 'Clipboard',
    icon: '○',
    groupId: 'interaction-motion',
    groupLabel: 'Interaction & Motion',
    ports: {
      controlIn: CONTROL_IN,
      dataIn: 'in.data.value',
      dataOut: 'out.data.value',
      controlOut: 'out.control.done',
    },
    defaults: {
      mode: 'copy',
      value: 'copied text',
    },
  },

  {
    kind: 'validate',
    label: 'Validate',
    icon: '◇',
    groupId: 'advanced-forms',
    groupLabel: 'Advanced Forms',
    ports: {
      controlIn: CONTROL_IN,
      dataIn: 'in.data.value',
      dataOut: 'out.data.cleaned',
      controlOut: 'out.control.valid',
    },
    defaults: {
      ruleType: 'schema',
      schema: '',
      stopAtFirstError: 'false',
      rules: '',
    },
  },
  {
    kind: 'rateLimit',
    label: 'Rate Limit',
    icon: '○',
    groupId: 'advanced-forms',
    groupLabel: 'Advanced Forms',
    ports: {
      controlIn: CONTROL_IN,
      dataIn: 'in.data.value',
      dataOut: 'out.data.value',
      controlOut: 'out.control.fire',
    },
    defaults: {
      mode: 'debounce',
      waitMs: '300',
      leading: 'false',
      trailing: 'true',
      maxWaitMs: '0',
    },
  },
  {
    kind: 'formContext',
    label: 'Form Context',
    icon: '○',
    groupId: 'advanced-forms',
    groupLabel: 'Advanced Forms',
    ports: {
      controlIn: CONTROL_IN,
      dataOut: 'out.data.form',
      controlOut: 'out.control.changed',
    },
    defaults: {
      formId: 'checkout-form',
      autoCreate: 'true',
      resetOnSubmit: 'false',
    },
  },
  {
    kind: 'formField',
    label: 'Form Field',
    icon: '○',
    groupId: 'advanced-forms',
    groupLabel: 'Advanced Forms',
    ports: {
      controlIn: CONTROL_IN,
      dataIn: 'in.data.value',
      dataOut: 'out.data.value',
      controlOut: 'out.control.changed',
    },
    defaults: {
      fieldName: 'email',
      action: 'bind',
      defaultValue: '',
    },
  },

  {
    kind: 'webSocket',
    label: 'WebSocket',
    icon: '○',
    groupId: 'realtime-files',
    groupLabel: 'Real-time & Files',
    ports: {
      controlIn: 'in.control.connect',
      dataIn: 'in.data.url',
      dataOut: 'out.data.message',
      controlOut: 'out.control.open',
    },
    defaults: {
      autoReconnect: 'true',
      reconnectMs: '1500',
      heartbeatMs: '30000',
      protocols: '',
      value: 'wss://echo.websocket.events',
    },
  },
  {
    kind: 'uploadFile',
    label: 'Upload File',
    icon: '○',
    groupId: 'realtime-files',
    groupLabel: 'Real-time & Files',
    ports: {
      controlIn: CONTROL_IN,
      dataIn: 'in.data.file',
      dataOut: 'out.data.response',
      controlOut: 'out.control.success',
    },
    defaults: {
      endpoint: '/api/upload',
      method: 'POST',
      fieldName: 'file',
      accept: '*/*',
      maxSizeMB: '10',
    },
  },
  {
    kind: 'download',
    label: 'Download',
    icon: '○',
    groupId: 'realtime-files',
    groupLabel: 'Real-time & Files',
    ports: {
      controlIn: CONTROL_IN,
      dataIn: 'in.data.url',
      controlOut: 'out.control.done',
    },
    defaults: {
      filename: 'download.bin',
      mimeType: 'application/octet-stream',
      openMode: 'save',
    },
  },

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

  {
    kind: 'subFlowCall',
    label: 'SubFlow Call',
    icon: '○',
    groupId: 'abstraction',
    groupLabel: 'Abstraction',
    ports: {
      controlIn: CONTROL_IN,
      dataIn: 'in.data.args',
      dataOut: 'out.data.result',
      controlOut: 'out.control.done',
    },
    defaults: {
      subGraphId: 'flow-main',
      timeoutMs: '3000',
      inputBindings: [{ id: 'input-1', key: 'payload', value: 'in.data.args' }],
      outputBindings: [
        { id: 'output-1', key: 'result', value: 'out.data.result' },
      ],
    },
  },
  {
    kind: 'subFlowInput',
    label: 'SubFlow Input',
    icon: '■',
    groupId: 'abstraction',
    groupLabel: 'Abstraction',
    ports: {
      dataOut: 'out.data.value',
    },
    defaults: {
      name: 'payload',
      type: 'any',
      required: 'false',
      defaultValue: '',
    },
  },
  {
    kind: 'subFlowOutput',
    label: 'SubFlow Output',
    icon: '○',
    groupId: 'abstraction',
    groupLabel: 'Abstraction',
    ports: {
      controlIn: CONTROL_IN,
      dataIn: 'in.data.value',
      controlOut: 'out.control.done',
    },
    defaults: {
      name: 'result',
      type: 'any',
    },
  },
  {
    kind: 'memoCache',
    label: 'Memo Cache',
    icon: '○',
    groupId: 'abstraction',
    groupLabel: 'Abstraction',
    ports: {
      controlIn: CONTROL_IN,
      dataIn: 'in.data.key',
      dataOut: 'out.data.value',
      controlOut: 'out.control.hit',
    },
    defaults: {
      strategy: 'memory',
      ttlMs: '60000',
      maxSize: '128',
    },
  },
  {
    kind: 'groupBox',
    label: 'Group Box',
    icon: '▭',
    groupId: 'annotation',
    groupLabel: 'Annotations',
    ports: {},
    defaults: {
      value: '',
      color: 'minimal',
    },
  },
  {
    kind: 'stickyNote',
    label: 'Sticky Note',
    icon: '✎',
    groupId: 'annotation',
    groupLabel: 'Annotations',
    ports: {},
    defaults: {
      value: '',
      description: '',
      color: 'minimal',
    },
  },

  {
    kind: 'log',
    label: 'Log',
    icon: '○',
    groupId: 'debug',
    groupLabel: 'Debug',
    ports: { controlIn: CONTROL_IN, controlOut: CONTROL_OUT, dataIn: DATA_IN },
    defaults: { description: 'node graph log' },
  },
  {
    kind: 'assert',
    label: 'Assert',
    icon: '◇',
    groupId: 'debug',
    groupLabel: 'Debug',
    ports: {
      controlIn: CONTROL_IN,
      controlOut: CONTROL_OUT,
      conditionIn: CONDITION_IN,
    },
    defaults: { description: 'assert should pass' },
  },
  {
    kind: 'breakpoint',
    label: 'Breakpoint',
    icon: '○',
    groupId: 'debug',
    groupLabel: 'Debug',
    ports: { controlIn: CONTROL_IN, controlOut: CONTROL_OUT },
    defaults: { description: 'manual pause' },
  },
  {
    kind: 'mockData',
    label: 'Mock Data',
    icon: '■',
    groupId: 'debug',
    groupLabel: 'Debug',
    ports: { dataOut: DATA_OUT },
    defaults: { value: '{"mock":true}' },
  },
  {
    kind: 'perfMark',
    label: 'Perf Mark',
    icon: '○',
    groupId: 'debug',
    groupLabel: 'Debug',
    ports: { controlIn: CONTROL_IN, controlOut: CONTROL_OUT, dataIn: DATA_IN },
    defaults: { description: 'render-start' },
  },
];

const nodeCatalogMap = Object.fromEntries(
  NODE_CATALOG.map((item) => [item.kind, item] as const)
) as Partial<Record<GraphNodeKind, NodeCatalogItem>>;

export const getNodeCatalogItem = (kind: GraphNodeKind): NodeCatalogItem => {
  const entry = nodeCatalogMap[kind];
  if (!entry) {
    return {
      kind,
      label: kind[0].toUpperCase() + kind.slice(1),
      icon: '○',
      groupId: 'misc',
      groupLabel: 'Misc',
      ports: { controlIn: CONTROL_IN, controlOut: CONTROL_OUT },
    };
  }
  return entry;
};

export const NODE_MENU_GROUPS: NodeMenuGroup[] = (() => {
  const grouped = new Map<string, NodeMenuGroup>();
  for (const item of NODE_CATALOG) {
    const existing = grouped.get(item.groupId);
    if (existing) {
      existing.items.push({
        kind: item.kind,
        label: item.label,
        icon: item.icon,
      });
      continue;
    }
    grouped.set(item.groupId, {
      id: item.groupId,
      label: item.groupLabel,
      items: [{ kind: item.kind, label: item.label, icon: item.icon }],
    });
  }
  return [...grouped.values()];
})();

export const getNodePortHandle = (
  kind: GraphNodeKind,
  role: 'in' | 'out',
  semantic: PortSemantic
): string | null => {
  const profile = getNodeCatalogItem(kind).ports;
  if (role === 'in') {
    if (semantic === 'control') return profile.controlIn ?? null;
    if (semantic === 'data') return profile.dataIn ?? null;
    return profile.conditionIn ?? null;
  }
  if (semantic === 'control') return profile.controlOut ?? null;
  if (semantic === 'data') return profile.dataOut ?? null;
  return profile.conditionOut ?? null;
};

export const supportsPortSemantic = (
  kind: GraphNodeKind,
  role: 'in' | 'out',
  semantic: PortSemantic
) => Boolean(getNodePortHandle(kind, role, semantic));
