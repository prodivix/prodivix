import type { NodeCatalogItem } from '../nodeCatalog';
import { CONTROL_IN } from '../nodeCatalogConstants';

export const abstractionNodeCatalog: NodeCatalogItem[] = [
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
];
