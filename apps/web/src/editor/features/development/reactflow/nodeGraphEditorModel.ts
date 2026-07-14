import type { Edge, Node } from '@xyflow/react';
import {
  estimateStickyNoteSize,
  normalizeBindingEntries,
  normalizeBranches,
  normalizeCases,
  normalizeStatusCodes,
  type GraphNodeData,
  type GraphNodeKind,
  type PortSemantic,
} from './graphNodeShared';
import { getNodeCatalogItem, getNodePortHandle } from './nodeCatalog';
import type { PortRole } from './graphPortUtils';

export type {
  ContextMenuItem,
  ContextMenuState,
  NodeValidationText,
} from './nodeGraphEditorTypes';
export {
  GROUP_BOX_THEME_OPTIONS,
  MENU_COLUMN_GAP,
  MENU_COLUMN_WIDTH,
  MENU_VIEWPORT_PADDING,
  STICKY_NOTE_THEME_OPTIONS,
} from './nodeGraphEditorConstants';
export {
  clampNumber,
  createBindingId,
  createBranchId,
  createFetchStatusId,
  createNodeId,
  createSwitchCaseId,
  isPlainObject,
  resolveColorModeFromDocument,
} from './nodeGraphEditorUtils';

import type {
  ContextMenuItem,
  NodeValidationText,
} from './nodeGraphEditorTypes';
import {
  clampNumber,
  createBindingId,
  createBranchId,
  createFetchStatusId,
  createNodeId,
  createSwitchCaseId,
} from './nodeGraphEditorUtils';

const NON_NEGATIVE_NUMBER_FIELDS = new Set([
  'timeoutMs',
  'waitMs',
  'maxWaitMs',
  'reconnectMs',
  'heartbeatMs',
  'maxSizeMB',
  'mobileMax',
  'tabletMax',
  'debounceMs',
  'ttlMs',
  'maxSize',
  'iterations',
  'boxWidth',
  'boxHeight',
]);

export const sanitizeFieldValue = (field: string, value: string) => {
  if (NON_NEGATIVE_NUMBER_FIELDS.has(field)) {
    const digitsOnly = value.replace(/[^\d]/g, '');
    if (!digitsOnly) return '';
    const parsed = Number.parseInt(digitsOnly, 10);
    if (!Number.isFinite(parsed)) return '';
    return `${clampNumber(parsed, 0, 1_000_000)}`;
  }
  if (field === 'offset') {
    const normalized = value.replace(/[^\d-]/g, '');
    if (!normalized || normalized === '-') return '';
    const parsed = Number.parseInt(normalized, 10);
    if (!Number.isFinite(parsed)) return '';
    return `${clampNumber(parsed, -100_000, 100_000)}`;
  }
  if (field === 'speed') {
    const normalized = value.replace(/[^\d.]/g, '');
    if (!normalized) return '';
    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed)) return '';
    return `${clampNumber(parsed, 0, 100)}`;
  }
  return value;
};

export const getMenuTreeDepth = (items: ContextMenuItem[]): number => {
  if (!items.length) return 0;
  let depth = 1;
  for (const item of items) {
    if (!item.children?.length) continue;
    depth = Math.max(depth, 1 + getMenuTreeDepth(item.children));
  }
  return depth;
};

export const resolveNodeValidationMessage = (
  node: Node<GraphNodeData>,
  edgesSnapshot: Edge[],
  validationText: NodeValidationText
): string | undefined => {
  const data = node.data;
  if (data.kind === 'playAnimation') {
    if (!data.targetId?.trim() || !data.timelineName?.trim()) {
      return validationText.playAnimationRequired;
    }
    return undefined;
  }
  if (data.kind === 'scrollTo') {
    if (data.target === 'selector' && !data.selector?.trim()) {
      return validationText.scrollToSelectorRequired;
    }
    return undefined;
  }
  if (data.kind === 'focusControl') {
    if (!data.selector?.trim()) {
      return validationText.focusControlSelectorRequired;
    }
    return undefined;
  }
  if (data.kind === 'validate') {
    const hasRulesInput = edgesSnapshot.some(
      (edge) => edge.target === node.id && edge.targetHandle === 'in.data.rules'
    );
    if (!data.schema?.trim() && !data.rules?.trim() && !hasRulesInput) {
      return validationText.validateSchemaOrRulesRequired;
    }
    return undefined;
  }
  if (data.kind === 'envVar') {
    if (!data.key?.trim()) {
      return validationText.envVarKeyRequired;
    }
    return undefined;
  }
  return undefined;
};

export const resolveGroupBoxSize = (nodeData: GraphNodeData) => ({
  width: clampNumber(
    Number.parseInt(
      `${nodeData.autoBoxWidth ?? nodeData.boxWidth ?? ''}` || '360',
      10
    ) || 360,
    160,
    2200
  ),
  height: clampNumber(
    Number.parseInt(
      `${nodeData.autoBoxHeight ?? nodeData.boxHeight ?? ''}` || '220',
      10
    ) || 220,
    120,
    1800
  ),
});

export const GROUP_BOX_HEADER_HEIGHT = 34;

export const GROUP_BOX_PADDING = {
  top: 16,
  right: 34,
  bottom: 24,
  left: 34,
} as const;

export const resolveNodeSize = (
  node: Node<GraphNodeData>,
  sizeOverride?: { width: number; height: number }
) => {
  if (node.data.kind === 'groupBox') {
    const fallback = resolveGroupBoxSize(node.data);
    return {
      width: clampNumber(
        Math.round(sizeOverride?.width ?? node.width ?? fallback.width),
        220,
        2200
      ),
      height: clampNumber(
        Math.round(sizeOverride?.height ?? node.height ?? fallback.height),
        140,
        1800
      ),
    };
  }
  if (node.data.kind === 'stickyNote') {
    const noteContent = node.data.description ?? node.data.value ?? '';
    const estimated = estimateStickyNoteSize(noteContent);
    return {
      width: clampNumber(
        Math.round(sizeOverride?.width ?? node.width ?? estimated.width),
        24,
        1200
      ),
      height: clampNumber(
        Math.round(sizeOverride?.height ?? node.height ?? estimated.height),
        30,
        1200
      ),
    };
  }
  return {
    width: clampNumber(Math.round(node.width ?? 220), 120, 2200),
    height: clampNumber(Math.round(node.height ?? 96), 64, 1800),
  };
};

export const resolveNodeBounds = (
  node: Node<GraphNodeData>,
  sizeOverride?: { width: number; height: number }
) => {
  const size = resolveNodeSize(node, sizeOverride);
  return {
    left: node.position.x,
    top: node.position.y,
    right: node.position.x + size.width,
    bottom: node.position.y + size.height,
    ...size,
  };
};

export const resolveGroupBodyBounds = (
  groupNode: Node<GraphNodeData>,
  sizeOverride?: { width: number; height: number }
) => {
  const groupSize = resolveNodeSize(groupNode, sizeOverride);
  const left = groupNode.position.x + GROUP_BOX_PADDING.left;
  const right = Math.max(
    left + 1,
    groupNode.position.x + groupSize.width - GROUP_BOX_PADDING.right
  );
  const top =
    groupNode.position.y + GROUP_BOX_HEADER_HEIGHT + GROUP_BOX_PADDING.top;
  const bottom = Math.max(
    top + 1,
    groupNode.position.y + groupSize.height - GROUP_BOX_PADDING.bottom
  );
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
  };
};

const isNodeCenterInsideGroupBody = (
  node: Node<GraphNodeData>,
  groupNode: Node<GraphNodeData>,
  groupSizeOverride?: { width: number; height: number }
) => {
  if (node.id === groupNode.id) return false;
  const nodeBounds = resolveNodeBounds(node);
  const bodyBounds = resolveGroupBodyBounds(groupNode, groupSizeOverride);
  const centerX = (nodeBounds.left + nodeBounds.right) / 2;
  const centerY = (nodeBounds.top + nodeBounds.bottom) / 2;
  return (
    centerX >= bodyBounds.left &&
    centerX <= bodyBounds.right &&
    centerY >= bodyBounds.top &&
    centerY <= bodyBounds.bottom
  );
};

export const resolveDropTargetGroup = (
  node: Node<GraphNodeData>,
  nodesSnapshot: Node<GraphNodeData>[]
) => {
  if (node.data.kind === 'groupBox') return undefined;
  const candidates = nodesSnapshot
    .filter((item) => item.data.kind === 'groupBox' && item.id !== node.id)
    .filter((groupNode) => isNodeCenterInsideGroupBody(node, groupNode));
  if (!candidates.length) return undefined;
  return candidates.reduce((best, current) => {
    const bestArea =
      resolveGroupBodyBounds(best).width * resolveGroupBodyBounds(best).height;
    const currentArea =
      resolveGroupBodyBounds(current).width *
      resolveGroupBodyBounds(current).height;
    return currentArea < bestArea ? current : best;
  });
};

export const resolveAttachedGroupBoxId = (
  node: Node<GraphNodeData>,
  nodesSnapshot: Node<GraphNodeData>[]
) => {
  if (node.data.kind === 'groupBox') return undefined;
  if (!node.data.groupBoxId) return undefined;
  return nodesSnapshot.some(
    (item) => item.data.kind === 'groupBox' && item.id === node.data.groupBoxId
  )
    ? node.data.groupBoxId
    : undefined;
};

export const getDefaultHandleForNode = (
  node: Node<GraphNodeData>,
  role: PortRole,
  semantic: PortSemantic
): string | null => {
  const switchCases = normalizeCases(node.data.cases);
  const fetchStatusCodes = normalizeStatusCodes(node.data.statusCodes);
  if (role === 'in') {
    if (semantic === 'condition' && node.data.kind === 'switch') {
      if (!switchCases.length) return null;
      return `in.condition.case-${switchCases[0].id}`;
    }
    return getNodePortHandle(node.data.kind, role, semantic);
  }

  if (semantic === 'control') {
    if (node.data.kind === 'if') return 'out.control.true';
    if (node.data.kind === 'tryCatch') return 'out.control.try';
    if (node.data.kind === 'forEach') return 'out.control.body';
    if (node.data.kind === 'parallel' || node.data.kind === 'race') {
      const branches = normalizeBranches(node.data.branches);
      if (branches.length) return `out.control.branch-${branches[0].id}`;
      return 'out.control.done';
    }
    if (node.data.kind === 'switch') {
      if (!switchCases.length) return 'out.control.default';
      return `out.control.case-${switchCases[0].id}`;
    }
    if (node.data.kind === 'fetch') {
      if (fetchStatusCodes.length)
        return `out.control.status-${fetchStatusCodes[0].id}`;
      return 'out.control.error-request';
    }
    return getNodePortHandle(node.data.kind, role, semantic);
  }

  if (semantic === 'data') {
    return getNodePortHandle(node.data.kind, role, semantic);
  }

  return getNodePortHandle(node.data.kind, role, semantic);
};

export const createNode = (
  kind: GraphNodeKind,
  position: { x: number; y: number }
): Node<GraphNodeData> => {
  const catalogItem = getNodeCatalogItem(kind);
  const baseData: GraphNodeData = {
    label: catalogItem.label,
    kind,
    ...catalogItem.defaults,
  };

  if (kind === 'switch') {
    return {
      id: createNodeId(),
      type: 'graphNode',
      position,
      data: {
        ...baseData,
        collapsed: false,
        cases: [
          { id: createSwitchCaseId(), label: 'case-1' },
          { id: createSwitchCaseId(), label: 'case-2' },
        ],
      },
    };
  }
  if (kind === 'fetch') {
    return {
      id: createNodeId(),
      type: 'graphNode',
      position,
      data: {
        ...baseData,
        collapsed: false,
        value: '',
        method: 'GET',
        statusCodes: [
          { id: createFetchStatusId(), code: '200' },
          { id: createFetchStatusId(), code: '201' },
        ],
      },
    };
  }
  if (kind === 'parallel' || kind === 'race') {
    return {
      id: createNodeId(),
      type: 'graphNode',
      position,
      data: {
        ...baseData,
        collapsed: false,
        branches: [
          { id: createBranchId(), label: 'branch-1' },
          { id: createBranchId(), label: 'branch-2' },
        ],
      },
    };
  }
  if (kind === 'subFlowCall') {
    return {
      id: createNodeId(),
      type: 'graphNode',
      position,
      data: {
        ...baseData,
        inputBindings: [{ id: createBindingId(), key: 'payload', value: '' }],
        outputBindings: [{ id: createBindingId(), key: 'result', value: '' }],
      },
    };
  }
  return {
    id: createNodeId(),
    type: 'graphNode',
    position,
    data: baseData,
  };
};
