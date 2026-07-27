import type { NodeCatalogItem } from '../nodeCatalog';
import {
  CONTROL_IN,
  CONTROL_OUT,
  CONDITION_IN,
  DATA_IN,
  DATA_OUT,
} from '../nodeCatalogConstants';

export const debugNodeCatalog: NodeCatalogItem[] = [
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
