import type { NodeCatalogItem } from '../nodeCatalog';
import {
  CONTROL_IN,
  CONTROL_OUT,
  CONDITION_IN,
  DATA_IN,
} from '../nodeCatalogConstants';

export const uiNodeCatalog: NodeCatalogItem[] = [
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
];
