import type {
  ComponentNode,
  NodeDataScope,
  NodeListRender,
  PIRDocument,
  ValueOrRef,
} from '@prodivix/shared/types/pir';
import { materializePirRoot } from '#src/graph/materialize';
import type { DiagnosticBag } from '#src/core/diagnostics';

export type CanonicalText = ValueOrRef | undefined;

export interface CanonicalEvent {
  trigger: string;
  action?: string;
  params: Record<string, unknown>;
}

export interface CanonicalNode {
  id: string;
  type: string;
  path: string;
  text: CanonicalText;
  style: Record<string, unknown>;
  props: Record<string, unknown>;
  data?: NodeDataScope;
  list?: NodeListRender;
  events: Record<string, CanonicalEvent>;
  children: CanonicalNode[];
}

export interface CanonicalIRDocument {
  version: string;
  metadata?: PIRDocument['metadata'];
  logic?: PIRDocument['logic'];
  root: CanonicalNode;
}

const normalizeEventMap = (
  events: ComponentNode['events'],
  path: string,
  bag: DiagnosticBag
): Record<string, CanonicalEvent> => {
  if (!events) return {};
  const result: Record<string, CanonicalEvent> = {};

  Object.entries(events).forEach(([key, eventDef]) => {
    if (!eventDef || typeof eventDef !== 'object') {
      bag.push({
        code: 'CANONICAL_EVENT_INVALID',
        severity: 'warning',
        source: 'canonical-ir',
        message: `Ignored invalid event definition "${key}".`,
        path,
        suggestion: 'Use { trigger, action?, params? } for event nodes.',
      });
      return;
    }

    const trigger =
      typeof eventDef.trigger === 'string' && eventDef.trigger.trim()
        ? eventDef.trigger
        : key;
    const action =
      typeof eventDef.action === 'string' ? eventDef.action : undefined;
    const params =
      eventDef.params && typeof eventDef.params === 'object'
        ? (eventDef.params as Record<string, unknown>)
        : {};

    result[key] = { trigger, action, params };
  });

  return result;
};

const normalizeNode = (
  node: ComponentNode,
  path: string,
  bag: DiagnosticBag
): CanonicalNode => {
  const fallbackId = path.replace(/[^a-zA-Z0-9_]/g, '_');
  const id =
    typeof node.id === 'string' && node.id.trim() ? node.id : fallbackId;
  const type =
    typeof node.type === 'string' && node.type.trim() ? node.type : 'div';

  if (id === fallbackId) {
    bag.push({
      code: 'CANONICAL_NODE_MISSING_ID',
      severity: 'warning',
      source: 'canonical-ir',
      message: 'Node id is missing; generated a stable fallback id.',
      path,
      suggestion: 'Provide a stable node id in PIR for better diffs.',
    });
  }

  if (type === 'div' && (!node.type || !String(node.type).trim())) {
    bag.push({
      code: 'CANONICAL_NODE_MISSING_TYPE',
      severity: 'warning',
      source: 'canonical-ir',
      message: 'Node type is missing; defaulted to "div".',
      path,
      suggestion: 'Provide an explicit component type.',
    });
  }

  const children = (node.children ?? []).map((child, index) =>
    normalizeNode(child, `${path}.children[${index}]`, bag)
  );

  return {
    id,
    type,
    path,
    text: node.text as CanonicalText,
    style: node.style ? { ...node.style } : {},
    props: node.props ? { ...node.props } : {},
    data: node.data ? { ...node.data } : undefined,
    list: node.list ? { ...node.list } : undefined,
    events: normalizeEventMap(node.events, path, bag),
    children,
  };
};

export const buildCanonicalIR = (
  pirDoc: PIRDocument,
  bag: DiagnosticBag
): CanonicalIRDocument => ({
  version: pirDoc.version,
  metadata: pirDoc.metadata,
  logic: pirDoc.logic,
  root: normalizeNode(materializePirRoot(pirDoc), 'ui.graph', bag),
});
