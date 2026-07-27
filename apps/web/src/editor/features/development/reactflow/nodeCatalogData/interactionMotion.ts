import type { NodeCatalogItem } from '../nodeCatalog';
import { CONTROL_IN } from '../nodeCatalogConstants';

export const interactionMotionNodeCatalog: NodeCatalogItem[] = [
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
];
