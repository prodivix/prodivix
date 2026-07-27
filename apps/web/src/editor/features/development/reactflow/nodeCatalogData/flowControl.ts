import type { NodeCatalogItem } from '../nodeCatalog';
import { CONTROL_IN, CONTROL_OUT } from '../nodeCatalogConstants';

export const flowControlNodeCatalog: NodeCatalogItem[] = [
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
];
