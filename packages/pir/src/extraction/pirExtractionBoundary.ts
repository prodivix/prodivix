import type {
  PIRComponentEventContract,
  PIRComponentPropContract,
  PIRDocument,
  PIRTriggerBinding,
  PIRValueBinding,
} from '../pir.types';
import {
  isPirCollectionSymbolVisible,
  isPirNodeAncestorOrSelf,
  type PIRCollectionSymbolOwner,
  type PIRExtractionParentEdge,
} from './pirExtractionGraph';
import {
  getPirExtractionBindingIdentity,
  resolvePirExtractionComponentProp,
  withoutPirExtractionBindingPath,
} from './pirExtractionValueBoundary';
import {
  PIR_SUBTREE_EXTRACTION_ISSUE_CODES,
  type PIRBlockedBoundaryDependency,
  type PIRBlockedBoundaryKind,
  type PIRExtractionOccurrence,
  type PIRLiftedEventBoundaryDependency,
  type PIRLiftedValueBoundaryDependency,
  type PIRLiftedValueKind,
  type PIRPreservedReferenceBoundaryDependency,
  type PIRPreservedReferenceKind,
  type PIRSubtreeBoundaryDependency,
  type PIRSubtreeExtractionIssue,
  type PIRSubtreeExtractionIssueCode,
} from './pirSubtreeExtraction.types';

export type PIRValueOccurrenceKind =
  'node' | 'collection-key' | 'collection-source';

export type PIRExtractionBoundaryContext = Readonly<{
  document: PIRDocument;
  subtreeNodeIds: ReadonlySet<string>;
  parentEdges: ReadonlyMap<string, PIRExtractionParentEdge>;
  collectionSymbolOwners: ReadonlyMap<string, PIRCollectionSymbolOwner>;
}>;

export type PIRExtractionBoundaryResult = Readonly<{
  dependencies: readonly PIRSubtreeBoundaryDependency[];
  issues: readonly PIRSubtreeExtractionIssue[];
  componentPropsById: Readonly<Record<string, PIRComponentPropContract>>;
  componentEventsById: Readonly<Record<string, PIRComponentEventContract>>;
  instancePropBindings: Readonly<Record<string, PIRValueBinding>>;
  instanceEventBindings: Readonly<Record<string, PIRTriggerBinding>>;
}>;

export type PIRExtractionBoundaryAnalyzer = Readonly<{
  rewriteValueBinding(
    value: PIRValueBinding,
    occurrence: PIRExtractionOccurrence,
    occurrenceKind?: PIRValueOccurrenceKind
  ): PIRValueBinding;
  inspectExternalValueBinding(
    value: PIRValueBinding,
    occurrence: PIRExtractionOccurrence
  ): void;
  rewriteTrigger(
    trigger: PIRTriggerBinding,
    occurrence: PIRExtractionOccurrence
  ): PIRTriggerBinding;
  recordComponentReference(
    referenceKind: Extract<
      PIRPreservedReferenceKind,
      'component-definition' | 'component-member' | 'component-slot'
    >,
    targetId: string,
    occurrence: PIRExtractionOccurrence
  ): void;
  recordSlotOutlet(
    slotMemberId: string,
    occurrence: PIRExtractionOccurrence
  ): void;
  recordComponentPartTarget(
    partMemberId: string,
    occurrence: PIRExtractionOccurrence
  ): void;
  finish(): PIRExtractionBoundaryResult;
}>;

type MutableLiftedDependency = {
  sourceKind: PIRLiftedValueKind;
  sourceId: string;
  componentProp: PIRComponentPropContract;
  instanceBinding: PIRValueBinding;
  occurrences: PIRExtractionOccurrence[];
};

type MutableLiftedEventDependency = {
  sourceEventId: string;
  componentEvent: PIRComponentEventContract;
  instanceBinding: Extract<PIRTriggerBinding, { kind: 'emit-component-event' }>;
  occurrences: PIRExtractionOccurrence[];
};

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const stableId = (prefix: string, ...parts: readonly string[]): string =>
  `${prefix}:${parts.map((part) => `${part.length}:${part}`).join('|')}`;

const createLiftedEventContract = (
  sourceEventId: string,
  sourceEvent: PIRComponentEventContract
): PIRComponentEventContract =>
  Object.freeze({
    ...sourceEvent,
    id: `extracted-event:${sourceEventId.length}:${sourceEventId}`,
    ...(sourceEvent.capabilityIds
      ? { capabilityIds: Object.freeze([...sourceEvent.capabilityIds]) }
      : {}),
  });

const createIncomingPayloadForwardingBinding = (
  sourceEventId: string
): Extract<PIRTriggerBinding, { kind: 'emit-component-event' }> =>
  Object.freeze({ kind: 'emit-component-event', memberId: sourceEventId });

const escapePointerToken = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const occurrencePath = (occurrence: PIRExtractionOccurrence): string =>
  occurrence.fieldPath.startsWith('/componentContract/')
    ? occurrence.fieldPath
    : `/ui/graph/nodesById/${escapePointerToken(occurrence.nodeId)}${occurrence.fieldPath}`;

const freezeOccurrence = (
  occurrence: PIRExtractionOccurrence
): PIRExtractionOccurrence =>
  Object.freeze({
    nodeId: occurrence.nodeId,
    fieldPath: occurrence.fieldPath,
    ...(occurrence.sourcePath === undefined
      ? {}
      : { sourcePath: occurrence.sourcePath }),
  });

const sortOccurrences = (
  occurrences: readonly PIRExtractionOccurrence[]
): readonly PIRExtractionOccurrence[] =>
  Object.freeze(
    [...occurrences]
      .sort(
        (left, right) =>
          compareText(left.nodeId, right.nodeId) ||
          compareText(left.fieldPath, right.fieldPath) ||
          compareText(left.sourcePath ?? '', right.sourcePath ?? '')
      )
      .map(freezeOccurrence)
  );

/** Classifies extraction boundaries without mutating the source document. */
export const createPirExtractionBoundaryAnalyzer = (
  context: PIRExtractionBoundaryContext
): PIRExtractionBoundaryAnalyzer => {
  const liftedByIdentity = new Map<string, MutableLiftedDependency>();
  const liftedEventsBySourceId = new Map<
    string,
    MutableLiftedEventDependency
  >();
  const preserved: PIRPreservedReferenceBoundaryDependency[] = [];
  const blocked: PIRBlockedBoundaryDependency[] = [];
  const issues: PIRSubtreeExtractionIssue[] = [];

  const recordIssue = (
    code: PIRSubtreeExtractionIssueCode,
    occurrence: PIRExtractionOccurrence,
    message: string,
    dependencyId?: string
  ): void => {
    issues.push(
      Object.freeze({
        code,
        path: occurrencePath(occurrence),
        message,
        ...(dependencyId === undefined ? {} : { dependencyId }),
      })
    );
  };

  const recordBlocked = (
    boundaryKind: PIRBlockedBoundaryKind,
    occurrence: PIRExtractionOccurrence,
    reason: string,
    code: PIRSubtreeExtractionIssueCode,
    targetId?: string
  ): void => {
    const id = stableId(
      'pir14-extraction-blocked',
      boundaryKind,
      occurrence.nodeId,
      occurrence.fieldPath,
      targetId ?? ''
    );
    if (!blocked.some((dependency) => dependency.id === id)) {
      blocked.push(
        Object.freeze({
          id,
          kind: 'unsupported-boundary',
          resolution: 'blocked',
          boundaryKind,
          ...(targetId === undefined ? {} : { targetId }),
          occurrence: freezeOccurrence(occurrence),
          reason,
        })
      );
      recordIssue(code, occurrence, reason, id);
    }
  };

  const recordPreserved = (
    referenceKind: PIRPreservedReferenceKind,
    targetId: string,
    occurrence: PIRExtractionOccurrence
  ): void => {
    const id = stableId(
      'pir14-extraction-preserved',
      referenceKind,
      targetId,
      occurrence.nodeId,
      occurrence.fieldPath
    );
    if (preserved.some((dependency) => dependency.id === id)) return;
    preserved.push(
      Object.freeze({
        id,
        kind: 'typed-reference',
        resolution: 'preserved',
        referenceKind,
        targetId,
        occurrence: freezeOccurrence(occurrence),
      })
    );
  };

  const isVisible = (
    kind: PIRLiftedValueKind,
    sourceId: string,
    occurrence: PIRExtractionOccurrence,
    occurrenceKind: PIRValueOccurrenceKind
  ): boolean => {
    if (kind === 'data') {
      return isPirNodeAncestorOrSelf(
        sourceId,
        occurrence.nodeId,
        context.parentEdges
      );
    }
    if (kind === 'collection-symbol') {
      const owner = context.collectionSymbolOwners.get(sourceId);
      return (
        !!owner &&
        isPirCollectionSymbolVisible(
          owner,
          occurrence.nodeId,
          occurrenceKind,
          context.parentEdges
        )
      );
    }
    return true;
  };

  const rewriteValueBinding = (
    value: PIRValueBinding,
    occurrence: PIRExtractionOccurrence,
    occurrenceKind: PIRValueOccurrenceKind = 'node'
  ): PIRValueBinding => {
    if (value.kind === 'literal') return value;
    if (value.kind === 'code') {
      recordPreserved(
        'code-artifact',
        value.reference.symbolId
          ? `${value.reference.artifactId}#${value.reference.symbolId}`
          : value.reference.artifactId,
        occurrence
      );
      return value;
    }

    const identity = getPirExtractionBindingIdentity(value);
    const componentProp = resolvePirExtractionComponentProp(
      context.document,
      context.collectionSymbolOwners,
      identity.kind,
      identity.id
    );
    if (!componentProp) {
      recordBlocked(
        'unresolved-value',
        occurrence,
        `Cannot derive a Component prop because ${identity.kind} "${identity.id}" has no canonical source definition.`,
        PIR_SUBTREE_EXTRACTION_ISSUE_CODES.unresolvedBoundary,
        identity.id
      );
      return value;
    }
    if (!isVisible(identity.kind, identity.id, occurrence, occurrenceKind)) {
      recordBlocked(
        'invisible-value',
        occurrence,
        `Cannot lift ${identity.kind} "${identity.id}" because it is not visible at this binding site.`,
        PIR_SUBTREE_EXTRACTION_ISSUE_CODES.invisibleBoundary,
        identity.id
      );
      return value;
    }

    const ownerNodeId =
      identity.kind === 'collection-symbol'
        ? context.collectionSymbolOwners.get(identity.id)?.nodeId
        : identity.kind === 'data'
          ? identity.id
          : undefined;
    if (ownerNodeId && context.subtreeNodeIds.has(ownerNodeId)) {
      return value;
    }

    const identityKey = stableId(
      'pir14-extraction-value',
      identity.kind,
      identity.id
    );
    const existing = liftedByIdentity.get(identityKey);
    if (existing) {
      existing.occurrences.push(freezeOccurrence(occurrence));
    } else {
      liftedByIdentity.set(identityKey, {
        sourceKind: identity.kind,
        sourceId: identity.id,
        componentProp,
        instanceBinding: withoutPirExtractionBindingPath(value),
        occurrences: [freezeOccurrence(occurrence)],
      });
    }
    return {
      kind: 'component-prop',
      memberId: componentProp.id,
      ...(value.path === undefined ? {} : { path: value.path }),
    };
  };

  const inspectExternalValueBinding = (
    value: PIRValueBinding,
    occurrence: PIRExtractionOccurrence
  ): void => {
    let targetId: string | undefined;
    if (value.kind === 'data' && context.subtreeNodeIds.has(value.dataId)) {
      targetId = value.dataId;
    } else if (value.kind === 'collection-symbol') {
      const owner = context.collectionSymbolOwners.get(value.symbolId);
      if (owner && context.subtreeNodeIds.has(owner.nodeId)) {
        targetId = value.symbolId;
      }
    }
    if (!targetId) return;
    recordBlocked(
      'external-inbound-reference',
      occurrence,
      `A value binding outside the selected subtree targets moved internal identity "${targetId}".`,
      PIR_SUBTREE_EXTRACTION_ISSUE_CODES.externalInboundReference,
      targetId
    );
  };

  const rewriteTrigger = (
    trigger: PIRTriggerBinding,
    occurrence: PIRExtractionOccurrence
  ): PIRTriggerBinding => {
    switch (trigger.kind) {
      case 'open-url':
        recordPreserved('url', trigger.href, occurrence);
        return trigger;
      case 'navigate-route':
        recordPreserved('route', trigger.routeId, occurrence);
        return trigger;
      case 'run-nodegraph':
        if (trigger.inputMapping !== undefined) {
          recordBlocked(
            'opaque-nodegraph-input-mapping',
            occurrence,
            'NodeGraph inputMapping is opaque and cannot be safely classified or rewritten during extraction.',
            PIR_SUBTREE_EXTRACTION_ISSUE_CODES.opaqueExternalBinding,
            trigger.documentId
          );
          return trigger;
        }
        recordPreserved('nodegraph', trigger.documentId, occurrence);
        return trigger;
      case 'play-animation':
        recordPreserved(
          'animation',
          `${trigger.documentId}#${trigger.timelineId}`,
          occurrence
        );
        return trigger;
      case 'call-code':
        recordPreserved(
          'code-artifact',
          trigger.reference.symbolId
            ? `${trigger.reference.artifactId}#${trigger.reference.symbolId}`
            : trigger.reference.artifactId,
          occurrence
        );
        return trigger;
      case 'emit-component-event': {
        const sourceEvent =
          context.document.componentContract?.eventsById[trigger.memberId];
        if (!sourceEvent) {
          recordBlocked(
            'unresolved-component-event',
            occurrence,
            `Cannot lift Component event "${trigger.memberId}" because it is not declared by the source Definition Contract.`,
            PIR_SUBTREE_EXTRACTION_ISSUE_CODES.unresolvedBoundary,
            trigger.memberId
          );
          return trigger;
        }
        const existing = liftedEventsBySourceId.get(trigger.memberId);
        const componentEvent =
          existing?.componentEvent ??
          createLiftedEventContract(trigger.memberId, sourceEvent);
        if (existing) {
          existing.occurrences.push(freezeOccurrence(occurrence));
        } else {
          liftedEventsBySourceId.set(trigger.memberId, {
            sourceEventId: trigger.memberId,
            componentEvent,
            instanceBinding: createIncomingPayloadForwardingBinding(
              trigger.memberId
            ),
            occurrences: [freezeOccurrence(occurrence)],
          });
        }
        return {
          kind: 'emit-component-event',
          memberId: componentEvent.id,
          ...(trigger.payload
            ? {
                payload: rewriteValueBinding(trigger.payload, {
                  ...occurrence,
                  fieldPath: `${occurrence.fieldPath}/payload`,
                }),
              }
            : {}),
        };
      }
    }
  };

  const recordSlotOutlet = (
    slotMemberId: string,
    occurrence: PIRExtractionOccurrence
  ): void => {
    recordBlocked(
      'component-slot-outlet',
      occurrence,
      'A Component Slot Outlet cannot be moved without an explicit consumer-content forwarding plan.',
      PIR_SUBTREE_EXTRACTION_ISSUE_CODES.unsupportedSlotOutlet,
      slotMemberId
    );
  };

  const recordComponentPartTarget = (
    partMemberId: string,
    occurrence: PIRExtractionOccurrence
  ): void => {
    recordBlocked(
      'component-part-target',
      occurrence,
      'A source Component part cannot keep targeting a node moved behind a nested Component Instance.',
      PIR_SUBTREE_EXTRACTION_ISSUE_CODES.externalInboundReference,
      partMemberId
    );
  };

  const finish = (): PIRExtractionBoundaryResult => {
    const lifted = [...liftedByIdentity.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([, dependency]): PIRLiftedValueBoundaryDependency =>
        Object.freeze({
          id: stableId(
            'pir14-extraction-lifted',
            dependency.sourceKind,
            dependency.sourceId
          ),
          kind: 'value-binding',
          resolution: 'lifted-to-component-prop',
          sourceKind: dependency.sourceKind,
          sourceId: dependency.sourceId,
          componentProp: Object.freeze(dependency.componentProp),
          instanceBinding: Object.freeze(dependency.instanceBinding),
          occurrences: sortOccurrences(dependency.occurrences),
        })
      );
    const liftedEvents = [...liftedEventsBySourceId.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([, dependency]): PIRLiftedEventBoundaryDependency =>
        Object.freeze({
          id: stableId(
            'pir14-extraction-lifted-event',
            dependency.sourceEventId
          ),
          kind: 'event-binding',
          resolution: 'lifted-to-component-event',
          sourceEventId: dependency.sourceEventId,
          componentEvent: dependency.componentEvent,
          instanceBinding: dependency.instanceBinding,
          occurrences: sortOccurrences(dependency.occurrences),
        })
      );
    const dependencies = [
      ...lifted,
      ...liftedEvents,
      ...preserved,
      ...blocked,
    ].sort((left, right) => compareText(left.id, right.id));
    const sortedIssues = [...issues].sort(
      (left, right) =>
        compareText(left.path, right.path) ||
        compareText(left.code, right.code) ||
        compareText(left.message, right.message)
    );
    const props = Object.fromEntries(
      lifted.map((dependency) => [
        dependency.componentProp.id,
        dependency.componentProp,
      ])
    );
    const bindings = Object.fromEntries(
      lifted.map((dependency) => [
        dependency.componentProp.id,
        dependency.instanceBinding,
      ])
    );
    const events = Object.fromEntries(
      liftedEvents.map((dependency) => [
        dependency.componentEvent.id,
        dependency.componentEvent,
      ])
    );
    const eventBindings = Object.fromEntries(
      liftedEvents.map((dependency) => [
        dependency.componentEvent.id,
        dependency.instanceBinding,
      ])
    );
    return Object.freeze({
      dependencies: Object.freeze(dependencies),
      issues: Object.freeze(sortedIssues),
      componentPropsById: Object.freeze(props),
      componentEventsById: Object.freeze(events),
      instancePropBindings: Object.freeze(bindings),
      instanceEventBindings: Object.freeze(eventBindings),
    });
  };

  return Object.freeze({
    rewriteValueBinding,
    inspectExternalValueBinding,
    rewriteTrigger,
    recordComponentReference: recordPreserved,
    recordSlotOutlet,
    recordComponentPartTarget,
    finish,
  });
};
