import type {
  PIRComponentEventContract,
  PIRComponentInstanceNode,
  PIRComponentPropContract,
  PIRDocument,
  PIRTriggerBinding,
  PIRValueBinding,
} from '../pir.types';

export const PIR_SUBTREE_EXTRACTION_ISSUE_CODES = Object.freeze({
  sourceFormatInvalid: 'PIR_EXTRACTION_SOURCE_FORMAT_INVALID',
  sourceSemanticInvalid: 'PIR_EXTRACTION_SOURCE_SEMANTIC_INVALID',
  resultFormatInvalid: 'PIR_EXTRACTION_RESULT_FORMAT_INVALID',
  resultSemanticInvalid: 'PIR_EXTRACTION_RESULT_SEMANTIC_INVALID',
  invalidId: 'PIR_EXTRACTION_INVALID_ID',
  sameDocument: 'PIR_EXTRACTION_SAME_DOCUMENT',
  subtreeRootNotFound: 'PIR_EXTRACTION_SUBTREE_ROOT_NOT_FOUND',
  instanceIdConflict: 'PIR_EXTRACTION_INSTANCE_ID_CONFLICT',
  unresolvedBoundary: 'PIR_EXTRACTION_UNRESOLVED_BOUNDARY',
  invisibleBoundary: 'PIR_EXTRACTION_INVISIBLE_BOUNDARY',
  externalInboundReference: 'PIR_EXTRACTION_EXTERNAL_INBOUND_REFERENCE',
  unsupportedSlotOutlet: 'PIR_EXTRACTION_UNSUPPORTED_SLOT_OUTLET',
  opaqueExternalBinding: 'PIR_EXTRACTION_OPAQUE_EXTERNAL_BINDING',
} as const);

export type PIRSubtreeExtractionIssueCode =
  (typeof PIR_SUBTREE_EXTRACTION_ISSUE_CODES)[keyof typeof PIR_SUBTREE_EXTRACTION_ISSUE_CODES];

export type PIRSubtreeExtractionIssue = Readonly<{
  code: PIRSubtreeExtractionIssueCode;
  path: string;
  message: string;
  dependencyId?: string;
}>;

export type PIRExtractionOccurrence = Readonly<{
  nodeId: string;
  fieldPath: string;
  sourcePath?: string;
}>;

export type PIRLiftedValueKind = Exclude<
  PIRValueBinding['kind'],
  'literal' | 'code'
>;

export type PIRLiftedValueBoundaryDependency = Readonly<{
  id: string;
  kind: 'value-binding';
  resolution: 'lifted-to-component-prop';
  sourceKind: PIRLiftedValueKind;
  sourceId: string;
  componentProp: PIRComponentPropContract;
  instanceBinding: PIRValueBinding;
  occurrences: readonly PIRExtractionOccurrence[];
}>;

export type PIRLiftedEventBoundaryDependency = Readonly<{
  id: string;
  kind: 'event-binding';
  resolution: 'lifted-to-component-event';
  sourceEventId: string;
  componentEvent: PIRComponentEventContract;
  instanceBinding: Extract<PIRTriggerBinding, { kind: 'emit-component-event' }>;
  occurrences: readonly PIRExtractionOccurrence[];
}>;

export type PIRPreservedReferenceKind =
  | 'code-artifact'
  | 'url'
  | 'route'
  | 'nodegraph'
  | 'animation'
  | 'component-definition'
  | 'component-member'
  | 'component-slot';

export type PIRPreservedReferenceBoundaryDependency = Readonly<{
  id: string;
  kind: 'typed-reference';
  resolution: 'preserved';
  referenceKind: PIRPreservedReferenceKind;
  targetId: string;
  occurrence: PIRExtractionOccurrence;
}>;

export type PIRBlockedBoundaryKind =
  | 'unresolved-value'
  | 'unresolved-component-event'
  | 'invisible-value'
  | 'external-inbound-reference'
  | 'component-slot-outlet'
  | 'component-part-target'
  | 'opaque-nodegraph-input-mapping';

export type PIRBlockedBoundaryDependency = Readonly<{
  id: string;
  kind: 'unsupported-boundary';
  resolution: 'blocked';
  boundaryKind: PIRBlockedBoundaryKind;
  targetId?: string;
  occurrence: PIRExtractionOccurrence;
  reason: string;
}>;

export type PIRSubtreeBoundaryDependency =
  | PIRLiftedValueBoundaryDependency
  | PIRLiftedEventBoundaryDependency
  | PIRPreservedReferenceBoundaryDependency
  | PIRBlockedBoundaryDependency;

export type PIRNodeRelocationFact = Readonly<{
  kind: 'pir-node';
  sourceDocumentId: string;
  sourceNodeId: string;
  definitionDocumentId: string;
  definitionNodeId: string;
}>;

export type PIRExtractionSourcePlacement =
  | Readonly<{
      kind: 'document-root';
      previousRootId: string;
    }>
  | Readonly<{
      kind: 'default-children';
      parentId: string;
      index: number;
    }>
  | Readonly<{
      kind: 'named-region';
      parentId: string;
      regionName: string;
      index: number;
    }>;

export type AnalyzePIRSubtreeExtractionInput = Readonly<{
  sourceDocumentId: string;
  definitionDocumentId: string;
  document: PIRDocument;
  subtreeRootId: string;
  instanceNodeId: string;
}>;

type PIRSubtreeExtractionFacts = Readonly<{
  subtreeNodeIds: readonly string[];
  boundaryDependencies: readonly PIRSubtreeBoundaryDependency[];
  relocationFacts: readonly PIRNodeRelocationFact[];
}>;

export type PIRSubtreeExtractionBlocked = PIRSubtreeExtractionFacts &
  Readonly<{
    ok: false;
    status: 'blocked';
    issues: readonly PIRSubtreeExtractionIssue[];
  }>;

export type PIRSubtreeExtractionReady = PIRSubtreeExtractionFacts &
  Readonly<{
    ok: true;
    status: 'ready';
    sourceDocument: PIRDocument;
    definitionDocument: PIRDocument;
    instance: PIRComponentInstanceNode;
    sourcePlacement: PIRExtractionSourcePlacement;
  }>;

export type PIRSubtreeExtractionAnalysis =
  PIRSubtreeExtractionBlocked | PIRSubtreeExtractionReady;
