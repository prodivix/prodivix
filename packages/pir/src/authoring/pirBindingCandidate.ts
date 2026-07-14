import {
  createComponentContractMemberSymbolId,
  createComponentScopeId,
  createComponentSlotPropSymbolId,
  createComponentSlotScopeId,
  createPirCollectionErrorScopeId,
  createPirCollectionErrorSymbolId,
  createPirCollectionIndexSymbolId,
  createPirCollectionItemSymbolId,
  createPirCollectionScopeId,
  createPirDataSymbolId,
  createPirNodeScopeId,
  createPirParamSymbolId,
  createPirStateSymbolId,
  createWorkspaceDocumentScopeId,
  type WorkspaceSymbol,
  type WorkspaceSymbolKind,
} from '@prodivix/authoring';
import type { PIRDocument, PIRValueBinding } from '../pir.types';
import { PIR_SEMANTIC_PROVIDER_DESCRIPTOR } from './pirSemanticContributionProvider';

export const PIR_BINDING_CANDIDATE_REASONS = Object.freeze({
  providerMismatch: 'provider-mismatch',
  symbolNotInDocumentRevision: 'symbol-not-in-document-revision',
  symbolFactMismatch: 'symbol-fact-mismatch',
  symbolKindUnsupported: 'symbol-kind-unsupported',
  codeReferenceIncomplete: 'code-reference-incomplete',
} as const);

export type PIRBindingCandidateReason =
  (typeof PIR_BINDING_CANDIDATE_REASONS)[keyof typeof PIR_BINDING_CANDIDATE_REASONS];

export type CreatePIRBindingCandidateInput = Readonly<{
  workspaceId: string;
  documentId: string;
  document: PIRDocument;
  symbol: WorkspaceSymbol;
}>;

export type PIRBindingCandidateResult =
  | Readonly<{
      status: 'available';
      symbolId: string;
      binding: PIRValueBinding;
    }>
  | Readonly<{
      status: 'unavailable';
      symbolId: string;
      symbolKind: WorkspaceSymbolKind;
      reason: Extract<
        PIRBindingCandidateReason,
        | 'provider-mismatch'
        | 'symbol-not-in-document-revision'
        | 'symbol-fact-mismatch'
      >;
    }>
  | Readonly<{
      status: 'unsupported';
      symbolId: string;
      symbolKind: WorkspaceSymbolKind;
      reason: Extract<
        PIRBindingCandidateReason,
        'symbol-kind-unsupported' | 'code-reference-incomplete'
      >;
    }>;

type ExpectedBindingSymbol = Readonly<{
  id: string;
  kind: WorkspaceSymbolKind;
  stability: WorkspaceSymbol['stability'];
  scopeId: string;
  binding: PIRValueBinding;
}>;

const CODE_SYMBOL_KINDS: ReadonlySet<WorkspaceSymbolKind> = new Set([
  'code-artifact',
  'code-module',
  'code-export',
  'code-function',
  'code-type',
  'css-symbol',
  'shader-entry',
]);

const SUPPORTED_SYMBOL_KINDS: ReadonlySet<WorkspaceSymbolKind> = new Set([
  'param',
  'state',
  'data',
  'collection-item',
  'collection-index',
  'collection-error',
  'component-prop',
  'component-variant',
]);

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const sortedEntries = <Value>(
  value: Readonly<Record<string, Value>>
): Array<[string, Value]> =>
  Object.entries(value).sort(([left], [right]) => compareText(left, right));

const freezeBinding = (binding: PIRValueBinding): PIRValueBinding =>
  Object.freeze(binding);

const collectExpectedBindingSymbols = (
  input: Omit<CreatePIRBindingCandidateInput, 'symbol'>
): readonly ExpectedBindingSymbol[] => {
  const expected: ExpectedBindingSymbol[] = [];
  const baseScopeId = input.document.componentContract
    ? createComponentScopeId(input.workspaceId, input.documentId)
    : createWorkspaceDocumentScopeId(input.workspaceId, input.documentId);

  for (const paramId of Object.keys(input.document.logic?.props ?? {}).sort(
    compareText
  )) {
    expected.push({
      id: createPirParamSymbolId(input.workspaceId, input.documentId, paramId),
      kind: 'param',
      stability: 'durable',
      scopeId: baseScopeId,
      binding: freezeBinding({ kind: 'param', paramId }),
    });
  }
  for (const stateId of Object.keys(input.document.logic?.state ?? {}).sort(
    compareText
  )) {
    expected.push({
      id: createPirStateSymbolId(input.workspaceId, input.documentId, stateId),
      kind: 'state',
      stability: 'durable',
      scopeId: baseScopeId,
      binding: freezeBinding({ kind: 'state', stateId }),
    });
  }

  for (const [nodeId, node] of sortedEntries(
    input.document.ui.graph.nodesById
  )) {
    if (node.kind === 'element' && node.data) {
      expected.push({
        id: createPirDataSymbolId(input.workspaceId, input.documentId, nodeId),
        kind: 'data',
        stability: 'revision-scoped',
        scopeId: createPirNodeScopeId(
          input.workspaceId,
          input.documentId,
          nodeId
        ),
        binding: freezeBinding({ kind: 'data', dataId: nodeId }),
      });
    }
    if (node.kind !== 'collection') continue;
    const collectionScopeId = createPirCollectionScopeId(
      input.workspaceId,
      input.documentId,
      nodeId
    );
    expected.push(
      {
        id: createPirCollectionItemSymbolId(
          input.workspaceId,
          input.documentId,
          nodeId,
          node.symbols.itemId
        ),
        kind: 'collection-item',
        stability: 'durable',
        scopeId: collectionScopeId,
        binding: freezeBinding({
          kind: 'collection-symbol',
          symbolId: node.symbols.itemId,
        }),
      },
      {
        id: createPirCollectionIndexSymbolId(
          input.workspaceId,
          input.documentId,
          nodeId,
          node.symbols.indexId
        ),
        kind: 'collection-index',
        stability: 'durable',
        scopeId: collectionScopeId,
        binding: freezeBinding({
          kind: 'collection-symbol',
          symbolId: node.symbols.indexId,
        }),
      }
    );
    if (node.symbols.errorId) {
      expected.push({
        id: createPirCollectionErrorSymbolId(
          input.workspaceId,
          input.documentId,
          nodeId,
          node.symbols.errorId
        ),
        kind: 'collection-error',
        stability: 'durable',
        scopeId: createPirCollectionErrorScopeId(
          input.workspaceId,
          input.documentId,
          nodeId
        ),
        binding: freezeBinding({
          kind: 'collection-symbol',
          symbolId: node.symbols.errorId,
        }),
      });
    }
  }

  const contract = input.document.componentContract;
  if (contract) {
    const componentScopeId = createComponentScopeId(
      input.workspaceId,
      input.documentId
    );
    for (const memberId of Object.keys(contract.propsById).sort(compareText)) {
      expected.push({
        id: createComponentContractMemberSymbolId(
          input.workspaceId,
          input.documentId,
          'prop',
          memberId
        ),
        kind: 'component-prop',
        stability: 'durable',
        scopeId: componentScopeId,
        binding: freezeBinding({ kind: 'component-prop', memberId }),
      });
    }
    for (const memberId of Object.keys(contract.variantAxesById).sort(
      compareText
    )) {
      expected.push({
        id: createComponentContractMemberSymbolId(
          input.workspaceId,
          input.documentId,
          'variant',
          memberId
        ),
        kind: 'component-variant',
        stability: 'durable',
        scopeId: componentScopeId,
        binding: freezeBinding({ kind: 'component-variant', memberId }),
      });
    }
    for (const [slotMemberId, slot] of sortedEntries(contract.slotsById)) {
      const slotScopeId = createComponentSlotScopeId(
        input.workspaceId,
        input.documentId,
        slotMemberId
      );
      for (const propMemberId of Object.keys(slot.propsById ?? {}).sort(
        compareText
      )) {
        expected.push({
          id: createComponentSlotPropSymbolId(
            input.workspaceId,
            input.documentId,
            slotMemberId,
            propMemberId
          ),
          kind: 'component-prop',
          stability: 'durable',
          scopeId: slotScopeId,
          binding: freezeBinding({ kind: 'slot-prop', memberId: propMemberId }),
        });
      }
    }
  }
  return Object.freeze(expected);
};

const unavailable = (
  symbol: WorkspaceSymbol,
  reason: Extract<
    PIRBindingCandidateReason,
    | 'provider-mismatch'
    | 'symbol-not-in-document-revision'
    | 'symbol-fact-mismatch'
  >
): PIRBindingCandidateResult =>
  Object.freeze({
    status: 'unavailable',
    symbolId: symbol.id,
    symbolKind: symbol.kind,
    reason,
  });

const unsupported = (
  symbol: WorkspaceSymbol,
  reason: Extract<
    PIRBindingCandidateReason,
    'symbol-kind-unsupported' | 'code-reference-incomplete'
  >
): PIRBindingCandidateResult =>
  Object.freeze({
    status: 'unsupported',
    symbolId: symbol.id,
    symbolKind: symbol.kind,
    reason,
  });

/**
 * Converts one revision-bound semantic fact into a typed PIR binding by
 * recomputing domain identities. No semantic id, qualified name, source span,
 * or diagnostic path is parsed to recover persisted authoring identity.
 */
export const createPirBindingCandidate = (
  input: CreatePIRBindingCandidateInput
): PIRBindingCandidateResult => {
  if (CODE_SYMBOL_KINDS.has(input.symbol.kind)) {
    return unsupported(
      input.symbol,
      PIR_BINDING_CANDIDATE_REASONS.codeReferenceIncomplete
    );
  }
  if (!SUPPORTED_SYMBOL_KINDS.has(input.symbol.kind)) {
    return unsupported(
      input.symbol,
      PIR_BINDING_CANDIDATE_REASONS.symbolKindUnsupported
    );
  }
  if (input.symbol.providerId !== PIR_SEMANTIC_PROVIDER_DESCRIPTOR.id) {
    return unavailable(
      input.symbol,
      PIR_BINDING_CANDIDATE_REASONS.providerMismatch
    );
  }

  const expected = collectExpectedBindingSymbols(input).find(
    ({ id }) => id === input.symbol.id
  );
  if (!expected) {
    return unavailable(
      input.symbol,
      PIR_BINDING_CANDIDATE_REASONS.symbolNotInDocumentRevision
    );
  }
  if (
    expected.kind !== input.symbol.kind ||
    expected.stability !== input.symbol.stability ||
    expected.scopeId !== input.symbol.scopeId
  ) {
    return unavailable(
      input.symbol,
      PIR_BINDING_CANDIDATE_REASONS.symbolFactMismatch
    );
  }
  return Object.freeze({
    status: 'available',
    symbolId: input.symbol.id,
    binding: expected.binding,
  });
};
