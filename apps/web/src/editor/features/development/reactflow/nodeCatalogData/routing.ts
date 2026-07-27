import type { NodeCatalogItem } from '../nodeCatalog';
import {
  CONTROL_IN,
  CONTROL_OUT,
  CONDITION_IN,
  DATA_IN,
  DATA_OUT,
} from '../nodeCatalogConstants';

export const routingNodeCatalog: NodeCatalogItem[] = [
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
];
