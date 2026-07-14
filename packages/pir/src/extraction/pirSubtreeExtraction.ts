import { tryNormalizePirDocument } from '../codec/pirCodec';
import type {
  PIRComponentInstanceNode,
  PIRDocument,
  PIRUiGraph,
} from '../pir.types';
import { PIR_VALIDATION_CODES, validatePirDocument } from '../pirValidator';
import { replacePirSubtreeGraph } from '../mutations/pirMutationGraph';
import { createPirExtractionBoundaryAnalyzer } from './pirExtractionBoundary';
import {
  collectPirExtractionSubtreeNodeIds,
  createPirCollectionSymbolOwners,
  createPirExtractionParentEdges,
  createPirNodeRelocationFacts,
  resolvePirExtractionSourcePlacement,
} from './pirExtractionGraph';
import {
  inspectPirExternalInboundBindings,
  rewritePirExtractionSubtreeGraph,
} from './pirExtractionNodeRewrite';
import {
  PIR_SUBTREE_EXTRACTION_ISSUE_CODES,
  type AnalyzePIRSubtreeExtractionInput,
  type PIRExtractionSourcePlacement,
  type PIRSubtreeBoundaryDependency,
  type PIRSubtreeExtractionAnalysis,
  type PIRSubtreeExtractionIssue,
} from './pirSubtreeExtraction.types';

export { PIR_SUBTREE_EXTRACTION_ISSUE_CODES } from './pirSubtreeExtraction.types';
export type {
  AnalyzePIRSubtreeExtractionInput,
  PIRBlockedBoundaryDependency,
  PIRBlockedBoundaryKind,
  PIRExtractionOccurrence,
  PIRExtractionSourcePlacement,
  PIRLiftedValueBoundaryDependency,
  PIRLiftedEventBoundaryDependency,
  PIRLiftedValueKind,
  PIRNodeRelocationFact,
  PIRPreservedReferenceBoundaryDependency,
  PIRPreservedReferenceKind,
  PIRSubtreeBoundaryDependency,
  PIRSubtreeExtractionAnalysis,
  PIRSubtreeExtractionBlocked,
  PIRSubtreeExtractionIssue,
  PIRSubtreeExtractionIssueCode,
  PIRSubtreeExtractionReady,
} from './pirSubtreeExtraction.types';

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const escapePointerToken = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const sortIssues = (
  issues: readonly PIRSubtreeExtractionIssue[]
): readonly PIRSubtreeExtractionIssue[] =>
  Object.freeze(
    [...issues].sort(
      (left, right) =>
        compareText(left.path, right.path) ||
        compareText(left.code, right.code) ||
        compareText(left.message, right.message)
    )
  );

const blocked = (
  subtreeNodeIds: readonly string[],
  boundaryDependencies: readonly PIRSubtreeBoundaryDependency[],
  sourceDocumentId: string,
  definitionDocumentId: string,
  issues: readonly PIRSubtreeExtractionIssue[]
): PIRSubtreeExtractionAnalysis =>
  Object.freeze({
    ok: false,
    status: 'blocked',
    subtreeNodeIds: Object.freeze([...subtreeNodeIds]),
    boundaryDependencies: Object.freeze([...boundaryDependencies]),
    relocationFacts: createPirNodeRelocationFacts(
      sourceDocumentId,
      definitionDocumentId,
      subtreeNodeIds
    ),
    issues: sortIssues(issues),
  });

const createIssue = (
  code: PIRSubtreeExtractionIssue['code'],
  path: string,
  message: string
): PIRSubtreeExtractionIssue => Object.freeze({ code, path, message });

const validateSource = (
  document: PIRDocument
):
  | Readonly<{ ok: true; document: PIRDocument }>
  | Readonly<{
      ok: false;
      issues: readonly PIRSubtreeExtractionIssue[];
    }> => {
  const decoded = tryNormalizePirDocument(document);
  if (!decoded.ok) {
    return {
      ok: false,
      issues: decoded.issues.map(({ path, message }) =>
        createIssue(
          PIR_SUBTREE_EXTRACTION_ISSUE_CODES.sourceFormatInvalid,
          path,
          message
        )
      ),
    };
  }
  const validation = validatePirDocument(decoded.value);
  const blockingIssues = validation.issues.filter(
    ({ code }) => code !== PIR_VALIDATION_CODES.componentEventEmission
  );
  if (blockingIssues.length > 0) {
    return {
      ok: false,
      issues: blockingIssues.map(({ code, path, message }) =>
        createIssue(
          PIR_SUBTREE_EXTRACTION_ISSUE_CODES.sourceSemanticInvalid,
          path,
          `${code}: ${message}`
        )
      ),
    };
  }
  return { ok: true, document: decoded.value };
};

const validateResult = (
  document: PIRDocument,
  label: 'source' | 'definition'
):
  | Readonly<{ ok: true; document: PIRDocument }>
  | Readonly<{
      ok: false;
      issues: readonly PIRSubtreeExtractionIssue[];
    }> => {
  const decoded = tryNormalizePirDocument(document);
  if (!decoded.ok) {
    return {
      ok: false,
      issues: decoded.issues.map(({ path, message }) =>
        createIssue(
          PIR_SUBTREE_EXTRACTION_ISSUE_CODES.resultFormatInvalid,
          `/${label}${path}`,
          message
        )
      ),
    };
  }
  const validation = validatePirDocument(decoded.value);
  if (!validation.valid) {
    return {
      ok: false,
      issues: validation.issues.map(({ code, path, message }) =>
        createIssue(
          PIR_SUBTREE_EXTRACTION_ISSUE_CODES.resultSemanticInvalid,
          `/${label}${path}`,
          `${code}: ${message}`
        )
      ),
    };
  }
  return { ok: true, document: decoded.value };
};

const replaceSourceGraph = (
  graph: PIRUiGraph,
  subtreeNodeIds: readonly string[],
  instance: PIRComponentInstanceNode,
  placement: PIRExtractionSourcePlacement
): PIRUiGraph => {
  if (placement.kind === 'document-root') {
    return {
      rootId: instance.id,
      nodesById: { [instance.id]: instance },
      childIdsById: { [instance.id]: [] },
      ...(graph.order ? { order: graph.order } : {}),
    };
  }
  return replacePirSubtreeGraph(graph, subtreeNodeIds, instance, {
    parentId: placement.parentId,
    index: placement.index,
    ...(placement.kind === 'named-region'
      ? { regionName: placement.regionName }
      : {}),
  });
};

const validateInputIds = (
  input: AnalyzePIRSubtreeExtractionInput
): readonly PIRSubtreeExtractionIssue[] => {
  const issues: PIRSubtreeExtractionIssue[] = [];
  for (const [field, value, label] of [
    ['sourceDocumentId', input.sourceDocumentId, 'Source document id'],
    [
      'definitionDocumentId',
      input.definitionDocumentId,
      'Definition document id',
    ],
    ['subtreeRootId', input.subtreeRootId, 'Subtree root id'],
    ['instanceNodeId', input.instanceNodeId, 'Instance node id'],
  ] as const) {
    if (value.length > 0 && value === value.trim()) continue;
    issues.push(
      createIssue(
        PIR_SUBTREE_EXTRACTION_ISSUE_CODES.invalidId,
        `/${field}`,
        `${label} must be non-empty and trimmed.`
      )
    );
  }
  if (
    input.sourceDocumentId.trim().length > 0 &&
    input.sourceDocumentId === input.definitionDocumentId
  ) {
    issues.push(
      createIssue(
        PIR_SUBTREE_EXTRACTION_ISSUE_CODES.sameDocument,
        '/definitionDocumentId',
        'Definition document id must differ from the source document id.'
      )
    );
  }
  return sortIssues(issues);
};

/**
 * Produces a reviewable, immutable PIR-only extraction plan. Cross-domain
 * reference owners consume its relocation facts before a Workspace Transaction
 * may atomically commit both documents.
 */
export const analyzePirSubtreeExtraction = (
  input: AnalyzePIRSubtreeExtractionInput
): PIRSubtreeExtractionAnalysis => {
  const idIssues = validateInputIds(input);
  if (idIssues.length > 0) {
    return blocked(
      [],
      [],
      input.sourceDocumentId,
      input.definitionDocumentId,
      idIssues
    );
  }

  const source = validateSource(input.document);
  if (!source.ok) {
    return blocked(
      [],
      [],
      input.sourceDocumentId,
      input.definitionDocumentId,
      source.issues
    );
  }
  const graph = source.document.ui.graph;
  if (!graph.nodesById[input.subtreeRootId]) {
    return blocked([], [], input.sourceDocumentId, input.definitionDocumentId, [
      createIssue(
        PIR_SUBTREE_EXTRACTION_ISSUE_CODES.subtreeRootNotFound,
        '/subtreeRootId',
        'Subtree root does not exist in the source PIR graph.'
      ),
    ]);
  }

  const subtreeNodeIds = collectPirExtractionSubtreeNodeIds(
    graph,
    input.subtreeRootId
  );
  if (
    graph.nodesById[input.instanceNodeId] &&
    input.instanceNodeId !== input.subtreeRootId
  ) {
    return blocked(
      subtreeNodeIds,
      [],
      input.sourceDocumentId,
      input.definitionDocumentId,
      [
        createIssue(
          PIR_SUBTREE_EXTRACTION_ISSUE_CODES.instanceIdConflict,
          '/instanceNodeId',
          'Instance node id already belongs to a source node outside the replaceable subtree root identity.'
        ),
      ]
    );
  }

  const subtreeSet = new Set(subtreeNodeIds);
  const parentEdges = createPirExtractionParentEdges(graph);
  const sourcePlacement = resolvePirExtractionSourcePlacement(
    graph,
    input.subtreeRootId,
    parentEdges
  );
  if (!sourcePlacement) {
    return blocked(
      subtreeNodeIds,
      [],
      input.sourceDocumentId,
      input.definitionDocumentId,
      [
        createIssue(
          PIR_SUBTREE_EXTRACTION_ISSUE_CODES.sourceSemanticInvalid,
          '/subtreeRootId',
          'Subtree root has no canonical source placement.'
        ),
      ]
    );
  }

  const analyzer = createPirExtractionBoundaryAnalyzer({
    document: source.document,
    subtreeNodeIds: subtreeSet,
    parentEdges,
    collectionSymbolOwners: createPirCollectionSymbolOwners(graph),
  });
  const definitionGraph = rewritePirExtractionSubtreeGraph(
    graph,
    input.subtreeRootId,
    subtreeNodeIds,
    analyzer
  );
  inspectPirExternalInboundBindings(source.document, subtreeSet, analyzer);
  for (const [partMemberId, part] of Object.entries(
    source.document.componentContract?.partsById ?? {}
  ).sort(([left], [right]) => compareText(left, right))) {
    if (!subtreeSet.has(part.targetNodeId)) continue;
    analyzer.recordComponentPartTarget(partMemberId, {
      nodeId: part.targetNodeId,
      fieldPath: `/componentContract/partsById/${escapePointerToken(partMemberId)}/targetNodeId`,
    });
  }
  const boundary = analyzer.finish();
  if (boundary.issues.length > 0) {
    return blocked(
      subtreeNodeIds,
      boundary.dependencies,
      input.sourceDocumentId,
      input.definitionDocumentId,
      boundary.issues
    );
  }

  const instance: PIRComponentInstanceNode = {
    id: input.instanceNodeId,
    kind: 'component-instance',
    componentDocumentId: input.definitionDocumentId,
    bindings: {
      props: boundary.instancePropBindings,
      events: boundary.instanceEventBindings,
      variants: {},
    },
  };
  const definitionDocument: PIRDocument = {
    componentContract: {
      propsById: boundary.componentPropsById,
      eventsById: boundary.componentEventsById,
      slotsById: {},
      variantAxesById: {},
    },
    ui: { graph: definitionGraph },
  };
  const sourceDocument: PIRDocument = {
    ...source.document,
    ui: {
      ...source.document.ui,
      graph: replaceSourceGraph(
        graph,
        subtreeNodeIds,
        instance,
        sourcePlacement
      ),
    },
  };
  const definitionValidation = validateResult(definitionDocument, 'definition');
  const sourceValidation = validateResult(sourceDocument, 'source');
  if (!definitionValidation.ok || !sourceValidation.ok) {
    return blocked(
      subtreeNodeIds,
      boundary.dependencies,
      input.sourceDocumentId,
      input.definitionDocumentId,
      [
        ...(definitionValidation.ok ? [] : definitionValidation.issues),
        ...(sourceValidation.ok ? [] : sourceValidation.issues),
      ]
    );
  }

  return Object.freeze({
    ok: true,
    status: 'ready',
    subtreeNodeIds,
    boundaryDependencies: boundary.dependencies,
    relocationFacts: createPirNodeRelocationFacts(
      input.sourceDocumentId,
      input.definitionDocumentId,
      subtreeNodeIds
    ),
    sourceDocument: sourceValidation.document,
    definitionDocument: definitionValidation.document,
    instance: Object.freeze(instance),
    sourcePlacement,
  });
};
