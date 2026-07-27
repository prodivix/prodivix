import type { NodeCatalogItem } from '../nodeCatalog';

export const annotationNodeCatalog: NodeCatalogItem[] = [
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
];
