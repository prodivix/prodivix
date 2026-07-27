import type { NodeCatalogItem } from '../nodeCatalog';
import {
  CONTROL_IN,
  CONTROL_OUT,
  DATA_IN,
  DATA_OUT,
} from '../nodeCatalogConstants';

export const networkNodeCatalog: NodeCatalogItem[] = [
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
];
