import type { NodeCatalogItem } from '../nodeCatalog';
import {
  CONTROL_IN,
  CONTROL_OUT,
  DATA_IN,
  DATA_OUT,
} from '../nodeCatalogConstants';

export const stateNodeCatalog: NodeCatalogItem[] = [
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
];
