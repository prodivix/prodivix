import type { NodeCatalogItem } from '../nodeCatalog';
import { CONTROL_OUT } from '../nodeCatalogConstants';

export const eventsNodeCatalog: NodeCatalogItem[] = [
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
];
