import type {
  PIRComponentContract,
  PIRComponentInstanceBindings,
  PIRComponentInstanceNode,
  PIRComponentPropContract,
  PIRJsonValue,
  PIRTriggerBinding,
  PIRValueBinding,
} from '@prodivix/pir';
import type { PIRRenderLocation } from '@prodivix/pir-react-renderer';
import {
  decodeWorkspacePirDocument,
  validateWorkspaceComponentGraph,
  type WorkspaceComponentGraphIssue,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';

export type ComponentInstanceInspectorDiagnostic = Readonly<{
  code: string;
  message: string;
  path: string;
}>;

export type ComponentInstanceInspectorProp = Readonly<{
  id: string;
  name: string;
  typeRef: string;
  required: boolean;
  defaultValue?: PIRJsonValue;
  binding?: PIRValueBinding;
  bindingKind: 'unbound' | 'literal' | 'reference';
  bindingSummary: string;
  codeArtifactId?: string;
  diagnostics: readonly ComponentInstanceInspectorDiagnostic[];
}>;

export type ComponentInstanceInspectorEvent = Readonly<{
  id: string;
  name: string;
  payloadTypeRef?: string;
  binding?: PIRTriggerBinding;
  bindingSummary: string;
  codeArtifactId?: string;
  codeSlotId?: string;
  diagnostics: readonly ComponentInstanceInspectorDiagnostic[];
}>;

export type ComponentInstanceInspectorSlot = Readonly<{
  id: string;
  name: string;
  required: boolean;
  minChildren?: number;
  maxChildren?: number;
  regionNodeIds: readonly string[];
  childCount: number;
  missingChildCount: number;
  diagnostics: readonly ComponentInstanceInspectorDiagnostic[];
}>;

export type ComponentInstanceInspectorVariantOption = Readonly<{
  id: string;
  name: string;
}>;

export type ComponentInstanceInspectorVariant = Readonly<{
  id: string;
  name: string;
  required: boolean;
  selectedOptionId?: string;
  effectiveOptionId?: string;
  defaultOptionId?: string;
  options: readonly ComponentInstanceInspectorVariantOption[];
  diagnostics: readonly ComponentInstanceInspectorDiagnostic[];
}>;

export type ComponentInstanceInspectorReadyModel = Readonly<{
  status: 'ready';
  location: PIRRenderLocation;
  sourceDocumentId: string;
  instanceNodeId: string;
  instancePath: string;
  definition: Readonly<{
    documentId: string;
    name: string;
    path: string;
    contract: PIRComponentContract;
  }>;
  bindings: PIRComponentInstanceBindings;
  props: readonly ComponentInstanceInspectorProp[];
  events: readonly ComponentInstanceInspectorEvent[];
  slots: readonly ComponentInstanceInspectorSlot[];
  variants: readonly ComponentInstanceInspectorVariant[];
  diagnostics: readonly ComponentInstanceInspectorDiagnostic[];
}>;

export type ComponentInstanceInspectorProjection =
  | Readonly<{
      status: 'hidden';
      reason: 'selection-missing' | 'selection-not-component-instance';
    }>
  | Readonly<{
      status: 'blocked';
      reason:
        | 'source-document-unavailable'
        | 'definition-unavailable'
        | 'definition-contract-unavailable';
      sourceDocumentId?: string;
      instanceNodeId?: string;
      definitionDocumentId?: string;
      diagnostics: readonly ComponentInstanceInspectorDiagnostic[];
    }>
  | ComponentInstanceInspectorReadyModel;

export type ComponentInstanceBindingsUpdate = Readonly<{
  documentId: string;
  instanceNodeId: string;
  bindings: PIRComponentInstanceBindings;
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const sortedEntries = <Value>(
  value: Readonly<Record<string, Value>>
): readonly (readonly [string, Value])[] =>
  Object.entries(value).sort(([left], [right]) => compareText(left, right));

const escapeJsonPointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const toDiagnostic = (
  issue: Pick<WorkspaceComponentGraphIssue, 'code' | 'message' | 'path'>
): ComponentInstanceInspectorDiagnostic =>
  Object.freeze({
    code: issue.code,
    message: issue.message,
    path: issue.path,
  });

const readDiagnostics = (
  read: ReturnType<typeof decodeWorkspacePirDocument>
): readonly ComponentInstanceInspectorDiagnostic[] => {
  if (read.status !== 'decode-invalid' && read.status !== 'semantic-invalid') {
    return Object.freeze([]);
  }
  return Object.freeze(
    read.issues.map((issue) =>
      Object.freeze({
        code: issue.code ?? 'PIR_DOCUMENT_INVALID',
        message: issue.message,
        path: issue.path,
      })
    )
  );
};

const issueTargetsBinding = (
  issue: WorkspaceComponentGraphIssue,
  section: 'props' | 'events' | 'variants',
  memberId: string
): boolean =>
  issue.path.includes(
    `/bindings/${section}/${escapeJsonPointerSegment(memberId)}`
  );

const issueTargetsSlot = (
  issue: WorkspaceComponentGraphIssue,
  nodeId: string,
  slotId: string
): boolean =>
  issue.path.includes(
    `/regionsById/${escapeJsonPointerSegment(nodeId)}/${escapeJsonPointerSegment(slotId)}`
  );

export const describeComponentPropBinding = (
  binding: PIRValueBinding | undefined
): string => {
  if (!binding) return 'Not bound';
  switch (binding.kind) {
    case 'literal':
      return `Literal · ${JSON.stringify(binding.value)}`;
    case 'param':
      return `Parameter · ${binding.paramId}${binding.path ? `.${binding.path}` : ''}`;
    case 'state':
      return `State · ${binding.stateId}${binding.path ? `.${binding.path}` : ''}`;
    case 'data':
      return `Data · ${binding.dataId}${binding.path ? `.${binding.path}` : ''}`;
    case 'collection-symbol':
      return `Collection · ${binding.symbolId}${binding.path ? `.${binding.path}` : ''}`;
    case 'component-prop':
      return `Component prop · ${binding.memberId}${binding.path ? `.${binding.path}` : ''}`;
    case 'component-variant':
      return `Component variant · ${binding.memberId}${binding.path ? `.${binding.path}` : ''}`;
    case 'slot-prop':
      return `Slot prop · ${binding.memberId}${binding.path ? `.${binding.path}` : ''}`;
    case 'code':
      return `Code · ${binding.reference.artifactId}${binding.reference.exportName ? `#${binding.reference.exportName}` : ''}`;
  }
};

export const describeComponentEventBinding = (
  binding: PIRTriggerBinding | undefined
): string => {
  if (!binding) return 'Not bound';
  switch (binding.kind) {
    case 'open-url':
      return `Open URL · ${binding.href}`;
    case 'navigate-route':
      return `Navigate route · ${binding.routeId}`;
    case 'run-nodegraph':
      return `Run NodeGraph · ${binding.documentId}`;
    case 'play-animation':
      return `Animation · ${binding.documentId}/${binding.timelineId} · ${binding.command}`;
    case 'call-code':
      return `Code · ${binding.reference.artifactId}${binding.reference.exportName ? `#${binding.reference.exportName}` : ''}`;
    case 'emit-component-event':
      return `Emit component event · ${binding.memberId}`;
  }
};

const propCodeArtifactId = (
  binding: PIRValueBinding | undefined
): string | undefined =>
  binding?.kind === 'code' ? binding.reference.artifactId : undefined;

const eventCodeArtifactId = (
  binding: PIRTriggerBinding | undefined
): string | undefined =>
  binding?.kind === 'call-code' ? binding.reference.artifactId : undefined;

const createPropModel = (
  member: PIRComponentPropContract,
  binding: PIRValueBinding | undefined,
  issues: readonly WorkspaceComponentGraphIssue[]
): ComponentInstanceInspectorProp =>
  Object.freeze({
    id: member.id,
    name: member.name,
    typeRef: member.typeRef,
    required: Boolean(member.required),
    ...(member.defaultValue !== undefined
      ? { defaultValue: member.defaultValue }
      : {}),
    ...(binding ? { binding } : {}),
    bindingKind: !binding
      ? 'unbound'
      : binding.kind === 'literal'
        ? 'literal'
        : 'reference',
    bindingSummary: describeComponentPropBinding(binding),
    ...(propCodeArtifactId(binding)
      ? { codeArtifactId: propCodeArtifactId(binding) }
      : {}),
    diagnostics: Object.freeze(
      issues
        .filter((issue) => issueTargetsBinding(issue, 'props', member.id))
        .map(toDiagnostic)
    ),
  });

const definitionDisplayName = (input: {
  documentId: string;
  documentName?: string;
  documentPath: string;
  metadataName?: string;
}): string =>
  input.documentName?.trim() ||
  input.metadataName?.trim() ||
  input.documentPath.split('/').filter(Boolean).at(-1) ||
  input.documentId;

/**
 * Projects one selected canonical Component Instance without consulting editor
 * stores. Contract members come exclusively from the target Definition while
 * binding and region state come exclusively from the selected source document.
 */
export const createComponentInstanceInspectorModel = (
  workspace: WorkspaceSnapshot,
  location: PIRRenderLocation | undefined
): ComponentInstanceInspectorProjection => {
  if (!location) {
    return Object.freeze({ status: 'hidden', reason: 'selection-missing' });
  }

  const sourceDocument = workspace.docsById[location.documentId];
  if (!sourceDocument) {
    return Object.freeze({
      status: 'blocked',
      reason: 'source-document-unavailable',
      sourceDocumentId: location.documentId,
      instanceNodeId: location.nodeId,
      diagnostics: Object.freeze([
        Object.freeze({
          code: 'WKS_COMPONENT_SOURCE_MISSING',
          message: 'The selected Component Instance document is unavailable.',
          path: `/docsById/${escapeJsonPointerSegment(location.documentId)}`,
        }),
      ]),
    });
  }

  const sourceRead = decodeWorkspacePirDocument(sourceDocument, {
    workspaceId: workspace.id,
  });
  if (sourceRead.status !== 'valid') {
    return Object.freeze({
      status: 'blocked',
      reason: 'source-document-unavailable',
      sourceDocumentId: location.documentId,
      instanceNodeId: location.nodeId,
      diagnostics: readDiagnostics(sourceRead),
    });
  }

  const selectedNode =
    sourceRead.decodedContent.ui.graph.nodesById[location.nodeId];
  if (!selectedNode || selectedNode.kind !== 'component-instance') {
    return Object.freeze({
      status: 'hidden',
      reason: 'selection-not-component-instance',
    });
  }

  const definitionDocument =
    workspace.docsById[selectedNode.componentDocumentId];
  if (!definitionDocument || definitionDocument.type !== 'pir-component') {
    return Object.freeze({
      status: 'blocked',
      reason: 'definition-unavailable',
      sourceDocumentId: location.documentId,
      instanceNodeId: selectedNode.id,
      definitionDocumentId: selectedNode.componentDocumentId,
      diagnostics: Object.freeze([
        Object.freeze({
          code: 'WKS_COMPONENT_TARGET_MISSING',
          message:
            'The Component Instance target Definition is unavailable or is not a Component document.',
          path: `/docsById/${escapeJsonPointerSegment(location.documentId)}/content/ui/graph/nodesById/${escapeJsonPointerSegment(selectedNode.id)}/componentDocumentId`,
        }),
      ]),
    });
  }

  const definitionRead = decodeWorkspacePirDocument(definitionDocument, {
    workspaceId: workspace.id,
  });
  if (definitionRead.status !== 'valid') {
    return Object.freeze({
      status: 'blocked',
      reason: 'definition-unavailable',
      sourceDocumentId: location.documentId,
      instanceNodeId: selectedNode.id,
      definitionDocumentId: selectedNode.componentDocumentId,
      diagnostics: readDiagnostics(definitionRead),
    });
  }

  const contract = definitionRead.decodedContent.componentContract;
  if (!contract) {
    return Object.freeze({
      status: 'blocked',
      reason: 'definition-contract-unavailable',
      sourceDocumentId: location.documentId,
      instanceNodeId: selectedNode.id,
      definitionDocumentId: selectedNode.componentDocumentId,
      diagnostics: Object.freeze([
        Object.freeze({
          code: 'WKS_COMPONENT_TARGET_CONTRACT_MISSING',
          message: 'The target Component Definition has no Public Contract.',
          path: `/docsById/${escapeJsonPointerSegment(selectedNode.componentDocumentId)}/content/componentContract`,
        }),
      ]),
    });
  }

  const graphIssues = validateWorkspaceComponentGraph(workspace).issues.filter(
    (issue) =>
      issue.documentId === location.documentId &&
      issue.nodeId === selectedNode.id
  );
  const regions =
    sourceRead.decodedContent.ui.graph.regionsById?.[selectedNode.id] ?? {};

  const props = sortedEntries(contract.propsById).map(([, member]) =>
    createPropModel(member, selectedNode.bindings.props[member.id], graphIssues)
  );
  const events = sortedEntries(contract.eventsById).map(
    ([memberId, member]): ComponentInstanceInspectorEvent => {
      const binding = selectedNode.bindings.events[memberId];
      const codeArtifactId = eventCodeArtifactId(binding);
      const codeSlotId =
        binding?.kind === 'call-code' ? binding.slotId : undefined;
      return Object.freeze({
        id: member.id,
        name: member.name,
        ...(member.payloadTypeRef
          ? { payloadTypeRef: member.payloadTypeRef }
          : {}),
        ...(binding ? { binding } : {}),
        bindingSummary: describeComponentEventBinding(binding),
        ...(codeArtifactId ? { codeArtifactId } : {}),
        ...(codeSlotId ? { codeSlotId } : {}),
        diagnostics: Object.freeze(
          graphIssues
            .filter((issue) => issueTargetsBinding(issue, 'events', member.id))
            .map(toDiagnostic)
        ),
      });
    }
  );
  const slots = sortedEntries(contract.slotsById).map(
    ([slotId, slot]): ComponentInstanceInspectorSlot => {
      const regionNodeIds = Object.freeze([...(regions[slotId] ?? [])]);
      const minimum = slot.minChildren ?? 0;
      return Object.freeze({
        id: slot.id,
        name: slot.name,
        required: minimum > 0,
        ...(slot.minChildren !== undefined
          ? { minChildren: slot.minChildren }
          : {}),
        ...(slot.maxChildren !== undefined
          ? { maxChildren: slot.maxChildren }
          : {}),
        regionNodeIds,
        childCount: regionNodeIds.length,
        missingChildCount: Math.max(0, minimum - regionNodeIds.length),
        diagnostics: Object.freeze(
          graphIssues
            .filter((issue) => issueTargetsSlot(issue, selectedNode.id, slotId))
            .map(toDiagnostic)
        ),
      });
    }
  );
  const variants = sortedEntries(contract.variantAxesById).map(
    ([axisId, axis]): ComponentInstanceInspectorVariant => {
      const selectedOptionId = selectedNode.bindings.variants[axisId];
      return Object.freeze({
        id: axis.id,
        name: axis.name,
        required: Boolean(axis.required),
        ...(selectedOptionId ? { selectedOptionId } : {}),
        ...(selectedOptionId || axis.defaultOptionId
          ? { effectiveOptionId: selectedOptionId ?? axis.defaultOptionId }
          : {}),
        ...(axis.defaultOptionId
          ? { defaultOptionId: axis.defaultOptionId }
          : {}),
        options: Object.freeze(
          sortedEntries(axis.optionsById).map(([, option]) =>
            Object.freeze({ id: option.id, name: option.name })
          )
        ),
        diagnostics: Object.freeze(
          graphIssues
            .filter((issue) => issueTargetsBinding(issue, 'variants', axis.id))
            .map(toDiagnostic)
        ),
      });
    }
  );

  return Object.freeze({
    status: 'ready',
    location,
    sourceDocumentId: location.documentId,
    instanceNodeId: selectedNode.id,
    instancePath: location.instancePath,
    definition: Object.freeze({
      documentId: definitionDocument.id,
      name: definitionDisplayName({
        documentId: definitionDocument.id,
        documentName: definitionDocument.name,
        documentPath: definitionDocument.path,
        metadataName: definitionRead.decodedContent.metadata?.name,
      }),
      path: definitionDocument.path,
      contract,
    }),
    bindings: selectedNode.bindings,
    props: Object.freeze(props),
    events: Object.freeze(events),
    slots: Object.freeze(slots),
    variants: Object.freeze(variants),
    diagnostics: Object.freeze(graphIssues.map(toDiagnostic)),
  });
};

const createBindingsUpdate = (
  model: ComponentInstanceInspectorReadyModel,
  bindings: PIRComponentInstanceBindings
): ComponentInstanceBindingsUpdate =>
  Object.freeze({
    documentId: model.sourceDocumentId,
    instanceNodeId: model.instanceNodeId,
    bindings,
  });

export const setComponentInstanceLiteralPropBinding = (
  model: ComponentInstanceInspectorReadyModel,
  memberId: string,
  value: PIRJsonValue
): ComponentInstanceBindingsUpdate | null => {
  const member = model.props.find((candidate) => candidate.id === memberId);
  if (!member || member.bindingKind === 'reference') return null;
  return createBindingsUpdate(model, {
    props: {
      ...model.bindings.props,
      [memberId]: { kind: 'literal', value },
    },
    events: model.bindings.events,
    variants: model.bindings.variants,
  });
};

export const clearComponentInstancePropBinding = (
  model: ComponentInstanceInspectorReadyModel,
  memberId: string
): ComponentInstanceBindingsUpdate | null => {
  const member = model.props.find((candidate) => candidate.id === memberId);
  if (!member || member.bindingKind === 'reference') return null;
  const { [memberId]: _removed, ...props } = model.bindings.props;
  return createBindingsUpdate(model, {
    props,
    events: model.bindings.events,
    variants: model.bindings.variants,
  });
};

export const setComponentInstanceVariantBinding = (
  model: ComponentInstanceInspectorReadyModel,
  axisId: string,
  optionId: string | undefined
): ComponentInstanceBindingsUpdate | null => {
  const axis = model.variants.find((candidate) => candidate.id === axisId);
  if (!axis) return null;
  if (optionId && !axis.options.some((option) => option.id === optionId)) {
    return null;
  }
  const variants = { ...model.bindings.variants };
  if (optionId) variants[axisId] = optionId;
  else delete variants[axisId];
  return createBindingsUpdate(model, {
    props: model.bindings.props,
    events: model.bindings.events,
    variants,
  });
};
