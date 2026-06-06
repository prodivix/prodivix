import type React from 'react';
import type { ComponentNode } from '@/core/types/engine.types';
import type {
  RendererCodeArtifact,
  RenderState,
  UnsafeRecord,
} from './PIRRenderer.types';

export const VOID_ELEMENTS = new Set([
  'input',
  'img',
  'br',
  'hr',
  'meta',
  'link',
]);

export const buildInitialState = (
  logicState?: Record<string, { initial: unknown }>
) => {
  const result: RenderState = {};
  if (!logicState) return result;
  Object.entries(logicState).forEach(([key, value]) => {
    result[key] = value.initial;
  });
  return result;
};

export const pickIncrementTarget = (state: RenderState) => {
  if (typeof state.count === 'number') return 'count';
  const numericKey = Object.keys(state).find(
    (key) => typeof state[key] === 'number'
  );
  return numericKey || null;
};

export const toReactEventName = (trigger: string) => {
  const normalized = trigger?.trim();
  if (!normalized) return undefined;
  if (/^on[A-Z]/.test(normalized)) return normalized;
  const lower = normalized.toLowerCase();
  if (lower === 'click') return 'onClick';
  if (lower === 'change') return 'onChange';
  if (lower === 'input') return 'onInput';
  if (lower === 'submit') return 'onSubmit';
  if (lower === 'focus') return 'onFocus';
  if (lower === 'blur') return 'onBlur';
  return `on${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
};

type EventLike = unknown;
type Handler = (event: EventLike) => void;

export const mergeHandlers = (first: unknown, second: unknown): unknown => {
  if (typeof first === 'function' && typeof second === 'function') {
    const firstFn = first as Handler;
    const secondFn = second as Handler;
    return (event: EventLike) => {
      firstFn(event);
      secondFn(event);
    };
  }
  return typeof second === 'function' ? second : first;
};

export const isSyntheticEvent = (
  value: unknown
): value is React.SyntheticEvent =>
  typeof value === 'object' && value !== null && 'nativeEvent' in value;

export const isClickTrigger = (trigger: string) =>
  toReactEventName(trigger) === 'onClick';

export const isInteractiveEventTarget = (target: Element | null) => {
  if (!target) return false;
  return Boolean(
    target.closest(
      'button, input, textarea, select, option, a, label, [role="button"], [role="checkbox"], [role="radio"], [role="switch"], [contenteditable="true"]'
    )
  );
};

export const deferSelectionNotification = (callback: () => void) => {
  if (
    typeof window !== 'undefined' &&
    typeof window.setTimeout === 'function'
  ) {
    window.setTimeout(callback, 0);
    return;
  }
  setTimeout(callback, 0);
};

export const collectNodeEvents = (
  node: ComponentNode,
  map: Record<string, ComponentNode['events']> = {}
) => {
  if (node.events && Object.keys(node.events).length > 0) {
    map[node.id] = node.events;
  }
  node.children?.forEach((child) => collectNodeEvents(child, map));
  return map;
};

export const collectNodesById = (
  node: ComponentNode,
  map: Record<string, ComponentNode> = {}
) => {
  map[node.id] = node;
  node.children?.forEach((child) => collectNodesById(child, map));
  return map;
};

const asRecord = (value: unknown): UnsafeRecord | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnsafeRecord)
    : null;

const readMountedCssContent = (value: unknown): string | null => {
  const record = asRecord(value);
  if (!record) return null;
  return typeof record.content === 'string' && record.content.trim()
    ? record.content
    : null;
};

const readMountedCssArtifactIds = (value: unknown): string[] => {
  const candidates = Array.isArray(value) ? value : [value];
  return candidates
    .map((candidate) => {
      const record = asRecord(candidate);
      const reference = asRecord(record?.reference);
      const artifactId = reference?.artifactId;
      return typeof artifactId === 'string' && artifactId.trim()
        ? artifactId.trim()
        : null;
    })
    .filter((artifactId): artifactId is string => Boolean(artifactId));
};

const isCssCodeArtifact = (artifact: RendererCodeArtifact) =>
  artifact.language === 'css' || artifact.path.toLowerCase().endsWith('.css');

export const collectMountedCssFromNode = (
  node: ComponentNode,
  result: Array<{ key: string; content: string }> = [],
  artifactsById: Map<string, RendererCodeArtifact> = new Map()
) => {
  const anyNode = node as ComponentNode & { metadata?: unknown };
  const props = asRecord(anyNode.props);
  const metadata = asRecord(anyNode.metadata);
  const codeBindings = asRecord(props?.codeBindings);
  readMountedCssArtifactIds(codeBindings?.mountedCss).forEach(
    (artifactId, index) => {
      const artifact = artifactsById.get(artifactId);
      if (!artifact || !isCssCodeArtifact(artifact)) return;
      const content = artifact.source.trim();
      if (!content) return;
      result.push({
        key: `${node.id}-code-${artifactId}-${index}`,
        content,
      });
    }
  );

  const mountedCandidates = [
    props?.mountedCss,
    props?.styleMount,
    props?.styleMountCss,
    metadata?.mountedCss,
    metadata?.styleMount,
  ];
  mountedCandidates.forEach((candidate, candidateIndex) => {
    if (Array.isArray(candidate)) {
      candidate.forEach((entry, entryIndex) => {
        const content = readMountedCssContent(entry);
        if (!content) return;
        result.push({
          key: `${node.id}-${candidateIndex}-${entryIndex}`,
          content,
        });
      });
      return;
    }
    const content = readMountedCssContent(candidate);
    if (!content) return;
    result.push({
      key: `${node.id}-${candidateIndex}`,
      content,
    });
  });
  node.children?.forEach((child) =>
    collectMountedCssFromNode(child, result, artifactsById)
  );
  return result;
};

export const collectMountedCssBlocks = (
  rootNode: ComponentNode,
  codeArtifacts: RendererCodeArtifact[] = [],
  extraNodes: ComponentNode[] = []
) => {
  const artifactsById = new Map(
    codeArtifacts.map((artifact) => [artifact.id, artifact])
  );
  const blocks = collectMountedCssFromNode(rootNode, [], artifactsById);
  extraNodes.forEach((node) =>
    collectMountedCssFromNode(node, blocks, artifactsById)
  );
  const seen = new Set<string>();
  return blocks.filter((block) => {
    const dedupeKey = block.content.trim();
    if (!dedupeKey || seen.has(dedupeKey)) return false;
    seen.add(dedupeKey);
    return true;
  });
};

export const stripInternalProps = (props: Record<string, unknown>) => {
  const next = { ...props };
  delete next.codeBindings;
  delete next.mountedCss;
  delete next.styleMount;
  delete next.styleMountCss;
  delete next.textMode;
  return next;
};

const isSelectionDebugEnabled = () =>
  typeof window !== 'undefined' &&
  Boolean(
    (window as unknown as { __PRODIVIX_DEBUG_SELECTION__?: boolean })
      .__PRODIVIX_DEBUG_SELECTION__
  );

export const emitSelectionDebug = (detail: Record<string, unknown>) => {
  if (!isSelectionDebugEnabled() || typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('prodivix:selection-debug', {
      detail,
    })
  );
  console.debug('[prodivix-selection]', detail);
};
