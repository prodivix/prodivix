import type { DiagnosticTargetRef } from '@prodivix/diagnostics';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type {
  BehaviorSemanticTargetRef,
  BehaviorSourceRef,
} from './behavior.types';

export type BehaviorSemanticSymbolView = Readonly<{
  id: string;
  name: string;
  qualifiedName?: string;
  capabilityIds?: readonly string[];
  ownerRef: DiagnosticTargetRef;
}>;

export type BehaviorSemanticIndexView = Readonly<{
  snapshotIdentity: Readonly<{
    providerSetDigest: string;
    schemaVersion: string;
    workspaceRevisions: Readonly<{
      workspaceId: string;
      workspaceRev: number;
    }>;
  }>;
  getSymbol(id: string): BehaviorSemanticSymbolView | null;
  getSymbols(): readonly BehaviorSemanticSymbolView[];
}>;

export type BehaviorTargetResolution =
  | Readonly<{
      status: 'exact' | 'relocated';
      target: BehaviorSemanticTargetRef;
      semanticSymbolId: string;
      source: BehaviorSourceRef;
      symbol: BehaviorSemanticSymbolView;
    }>
  | Readonly<{
      status: 'ambiguous';
      target: BehaviorSemanticTargetRef;
      candidateSymbolIds: readonly string[];
    }>
  | Readonly<{
      status: 'missing';
      target: BehaviorSemanticTargetRef;
      candidateSymbolIds: readonly string[];
    }>
  | Readonly<{
      status: 'incompatible';
      target: BehaviorSemanticTargetRef;
      semanticSymbolId: string;
      availableCapabilities: readonly string[];
    }>;

const escapePointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const ownerDocumentId = (ownerRef: DiagnosticTargetRef): string | undefined => {
  switch (ownerRef.kind) {
    case 'document':
    case 'pir-node':
    case 'inspector-field':
    case 'nodegraph-node':
    case 'nodegraph-port':
    case 'animation-timeline':
    case 'animation-track':
    case 'data-source':
    case 'data-operation':
    case 'behavior-scenario':
    case 'behavior-step':
    case 'verification-policy':
    case 'component-slot':
      return ownerRef.documentId;
    case 'code-artifact':
      return ownerRef.artifactId;
    default:
      return undefined;
  }
};

export const createBehaviorSourceRefForOwner = (
  ownerRef: DiagnosticTargetRef,
  fallbackDocumentId: string
): BehaviorSourceRef => {
  switch (ownerRef.kind) {
    case 'pir-node':
      return Object.freeze({
        workspaceDocumentId: ownerRef.documentId,
        path: `/nodesById/${escapePointerSegment(ownerRef.nodeId)}`,
      });
    case 'data-operation':
      return Object.freeze({
        workspaceDocumentId: ownerRef.documentId,
        path: `/operationsById/${escapePointerSegment(ownerRef.operationId)}`,
      });
    case 'data-source':
      return Object.freeze({
        workspaceDocumentId: ownerRef.documentId,
        path: '/',
      });
    case 'nodegraph-node':
      return Object.freeze({
        workspaceDocumentId: ownerRef.documentId,
        path: `/nodesById/${escapePointerSegment(ownerRef.nodeId)}`,
      });
    case 'nodegraph-port':
      return Object.freeze({
        workspaceDocumentId: ownerRef.documentId,
        path: `/nodesById/${escapePointerSegment(ownerRef.nodeId)}/portsById/${escapePointerSegment(ownerRef.portId)}`,
      });
    case 'animation-timeline':
      return Object.freeze({
        workspaceDocumentId: ownerRef.documentId,
        path: `/timelinesById/${escapePointerSegment(ownerRef.timelineId)}`,
      });
    case 'animation-track':
      return Object.freeze({
        workspaceDocumentId: ownerRef.documentId,
        path:
          `/timelinesById/${escapePointerSegment(ownerRef.timelineId)}` +
          `/bindingsById/${escapePointerSegment(ownerRef.bindingId)}` +
          `/tracksById/${escapePointerSegment(ownerRef.trackId)}`,
      });
    case 'route':
      return Object.freeze({
        workspaceDocumentId: fallbackDocumentId,
        path: `/routes/${escapePointerSegment(ownerRef.routeId)}`,
      });
    case 'behavior-step':
      return Object.freeze({
        workspaceDocumentId: ownerRef.documentId,
        path: `/steps/${escapePointerSegment(ownerRef.stepId)}`,
      });
    default:
      return Object.freeze({
        workspaceDocumentId: ownerDocumentId(ownerRef) ?? fallbackDocumentId,
        path: '/',
      });
  }
};

const ownerIdentityParts = (ownerRef: DiagnosticTargetRef): readonly string[] =>
  Object.values(ownerRef).filter(
    (value): value is string => typeof value === 'string'
  );

const matchesPublicIdentity = (
  symbol: BehaviorSemanticSymbolView,
  target: BehaviorSemanticTargetRef,
  workspaceId: string
): boolean => {
  if (
    symbol.id !== target.id &&
    symbol.name !== target.id &&
    symbol.qualifiedName !== target.id &&
    !ownerIdentityParts(symbol.ownerRef).includes(target.id)
  ) {
    return false;
  }
  const documentId = ownerDocumentId(symbol.ownerRef);
  return (documentId ?? workspaceId) === target.workspaceDocumentId;
};

const resolveCandidates = (
  target: BehaviorSemanticTargetRef,
  index: BehaviorSemanticIndexView
): readonly BehaviorSemanticSymbolView[] => {
  const workspaceId = index.snapshotIdentity.workspaceRevisions.workspaceId;
  if (target.kind === 'semantic-symbol') {
    const symbol = index.getSymbol(target.id);
    return symbol && matchesPublicIdentity(symbol, target, workspaceId)
      ? Object.freeze([symbol])
      : Object.freeze([]);
  }
  return Object.freeze(
    index
      .getSymbols()
      .filter((symbol) => matchesPublicIdentity(symbol, target, workspaceId))
      .sort((left, right) => compareUnicodeCodePoints(left.id, right.id))
  );
};

/**
 * Resolves a persisted target only through revision-bound semantic facts.
 * Missing or changed capabilities never fall back to selectors or DOM state.
 */
export const resolveBehaviorSemanticTarget = (
  input: Readonly<{
    target: BehaviorSemanticTargetRef;
    index: BehaviorSemanticIndexView;
    authoredSource?: BehaviorSourceRef;
  }>
): BehaviorTargetResolution => {
  const candidates = resolveCandidates(input.target, input.index);
  if (!candidates.length) {
    return Object.freeze({
      status: 'missing',
      target: input.target,
      candidateSymbolIds: Object.freeze([]),
    });
  }
  if (candidates.length > 1) {
    return Object.freeze({
      status: 'ambiguous',
      target: input.target,
      candidateSymbolIds: Object.freeze(candidates.map(({ id }) => id)),
    });
  }

  const symbol = candidates[0]!;
  const capabilities = Object.freeze(
    [...(symbol.capabilityIds ?? [])].sort(compareUnicodeCodePoints)
  );
  if (!capabilities.includes(input.target.capability)) {
    return Object.freeze({
      status: 'incompatible',
      target: input.target,
      semanticSymbolId: symbol.id,
      availableCapabilities: capabilities,
    });
  }
  const source = createBehaviorSourceRefForOwner(
    symbol.ownerRef,
    input.target.workspaceDocumentId
  );
  const relocated =
    input.authoredSource !== undefined &&
    (input.authoredSource.workspaceDocumentId !== source.workspaceDocumentId ||
      input.authoredSource.path !== source.path);
  return Object.freeze({
    status: relocated ? 'relocated' : 'exact',
    target: input.target,
    semanticSymbolId: symbol.id,
    source,
    symbol,
  });
};
