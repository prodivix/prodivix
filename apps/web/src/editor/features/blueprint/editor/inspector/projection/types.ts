import type { PIRDocument, PIRNode, PIRValidationIssue } from '@prodivix/pir';

export type InspectorListView = {
  collectionId?: string;
  arrayField?: string;
  itemAs?: string;
  indexAs?: string;
  keyBy?: string;
  emptyNodeId?: string;
};

export type InspectorEventView = {
  trigger: string;
  action?: string;
  params: Record<string, unknown>;
  editable?: boolean;
  diagnostic?: string;
};

/**
 * Literal-binding authoring view layered over the canonical Blueprint tree
 * projection. It is ephemeral and can only be committed through the reverse
 * projection into a validated PIR-current document.
 */
export type BlueprintInspectorNodeView = {
  id: string;
  type: string;
  kind?: PIRNode['kind'];
  regionName?: string;
  text?: unknown;
  style?: Record<string, unknown>;
  props?: Record<string, unknown>;
  data?: Record<string, unknown>;
  list?: InspectorListView;
  children?: BlueprintInspectorNodeView[];
  events?: Record<string, InspectorEventView>;
};

export type BlueprintInspectorProjectionResult =
  | Readonly<{
      ok: true;
      document: PIRDocument;
      node: BlueprintInspectorNodeView;
    }>
  | Readonly<{
      ok: false;
      issues: readonly PIRValidationIssue[];
    }>;
