import {
  createComponentContractMemberSymbolId,
  createComponentScopeId,
  createComponentSlotPropSymbolId,
  createComponentSlotScopeId,
  createComponentSymbolId,
  createComponentVariantOptionSymbolId,
  createPirNodeSymbolId,
  createSemanticId,
  createWorkspaceDocumentScopeId,
  type WorkspaceDependencyContribution,
  type WorkspaceReferenceFact,
  type WorkspaceScopeContribution,
  type WorkspaceSymbolContribution,
} from '@prodivix/authoring';
import type { PIRComponentContract } from '../pir.types';

export type MutablePIRSemanticContribution = {
  scopes: WorkspaceScopeContribution[];
  symbols: WorkspaceSymbolContribution[];
  references: WorkspaceReferenceFact[];
  dependencies: WorkspaceDependencyContribution[];
};

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const sortedEntries = <T>(
  value: Readonly<Record<string, T>>
): Array<[string, T]> =>
  Object.entries(value).sort(([left], [right]) => compareText(left, right));

const createDocumentOwnerRef = (workspaceId: string, documentId: string) =>
  ({ kind: 'document', workspaceId, documentId }) as const;

const createContractDependencyId = (
  workspaceId: string,
  documentId: string,
  kind: string,
  memberId: string
): string =>
  createSemanticId(
    'pir-contract-dependency',
    workspaceId,
    documentId,
    kind,
    memberId
  );

const addContractMember = (
  contribution: MutablePIRSemanticContribution,
  input: {
    workspaceId: string;
    documentId: string;
    componentScopeId: string;
    componentSymbolId: string;
    memberKind: 'prop' | 'event' | 'slot' | 'variant' | 'part';
    memberId: string;
    name: string;
    symbolKind: WorkspaceSymbolContribution['kind'];
    typeRef?: string;
    capabilityIds?: readonly string[];
  }
): string => {
  const symbolId = createComponentContractMemberSymbolId(
    input.workspaceId,
    input.documentId,
    input.memberKind,
    input.memberId
  );
  contribution.symbols.push({
    id: symbolId,
    stability: 'durable',
    kind: input.symbolKind,
    name: input.name,
    qualifiedName: `${input.documentId}.contract.${input.memberKind}.${input.memberId}`,
    scopeId: input.componentScopeId,
    ownerRef: createDocumentOwnerRef(input.workspaceId, input.documentId),
    ...(input.typeRef ? { typeRef: input.typeRef } : {}),
    ...(input.capabilityIds?.length
      ? { capabilityIds: [...input.capabilityIds].sort(compareText) }
      : {}),
  });
  contribution.dependencies.push({
    id: createContractDependencyId(
      input.workspaceId,
      input.documentId,
      input.memberKind,
      input.memberId
    ),
    kind: 'component',
    sourceSymbolId: symbolId,
    targetSymbolId: input.componentSymbolId,
  });
  return symbolId;
};

const addTokenBindingFacts = (
  contribution: MutablePIRSemanticContribution,
  input: {
    workspaceId: string;
    documentId: string;
    componentScopeId: string;
    componentSymbolId: string;
    contract: PIRComponentContract;
  }
): void => {
  for (const tokenBinding of [...(input.contract.tokenBindings ?? [])].sort(
    (left, right) => compareText(left.id, right.id)
  )) {
    contribution.references.push(
      {
        id: createSemanticId(
          'pir-component-token-reference',
          input.workspaceId,
          input.documentId,
          tokenBinding.id
        ),
        kind: 'token-reference',
        sourceRef: createDocumentOwnerRef(input.workspaceId, input.documentId),
        sourceSymbolId: input.componentSymbolId,
        scopeId: input.componentScopeId,
        target: {
          kind: 'name',
          name: tokenBinding.tokenPath,
          symbolKinds: ['token'],
        },
        resolutionMode: 'addressable',
        diagnosticPolicy: 'defer',
      },
      {
        id: createSemanticId(
          'pir-component-token-target-reference',
          input.workspaceId,
          input.documentId,
          tokenBinding.id
        ),
        kind: 'component-member',
        sourceRef: createDocumentOwnerRef(input.workspaceId, input.documentId),
        sourceSymbolId: input.componentSymbolId,
        scopeId: input.componentScopeId,
        target: {
          kind: 'symbol-id',
          symbolId: createComponentContractMemberSymbolId(
            input.workspaceId,
            input.documentId,
            tokenBinding.target.kind,
            tokenBinding.target.memberId
          ),
        },
        resolutionMode: 'addressable',
        requiresDurableTarget: true,
      }
    );
  }
};

/** Adds Component-owned scopes and members against Workspace-owned identity. */
export const addPirComponentContractFacts = (
  contribution: MutablePIRSemanticContribution,
  workspaceId: string,
  documentId: string,
  contract: PIRComponentContract
): void => {
  const componentScopeId = createComponentScopeId(workspaceId, documentId);
  const componentSymbolId = createComponentSymbolId(workspaceId, documentId);
  contribution.scopes.push({
    id: componentScopeId,
    kind: 'component',
    ownerRef: createDocumentOwnerRef(workspaceId, documentId),
    parentId: createWorkspaceDocumentScopeId(workspaceId, documentId),
  });

  for (const [memberId, member] of sortedEntries(contract.propsById)) {
    addContractMember(contribution, {
      workspaceId,
      documentId,
      componentScopeId,
      componentSymbolId,
      memberKind: 'prop',
      memberId,
      name: member.name,
      symbolKind: 'component-prop',
      typeRef: member.typeRef,
      capabilityIds: member.capabilityIds,
    });
  }
  for (const [memberId, member] of sortedEntries(contract.eventsById)) {
    addContractMember(contribution, {
      workspaceId,
      documentId,
      componentScopeId,
      componentSymbolId,
      memberKind: 'event',
      memberId,
      name: member.name,
      symbolKind: 'component-event',
      typeRef: member.payloadTypeRef,
      capabilityIds: member.capabilityIds,
    });
  }
  for (const [memberId, member] of sortedEntries(contract.slotsById)) {
    const slotSymbolId = addContractMember(contribution, {
      workspaceId,
      documentId,
      componentScopeId,
      componentSymbolId,
      memberKind: 'slot',
      memberId,
      name: member.name,
      symbolKind: 'component-slot',
      capabilityIds: member.capabilityIds,
    });
    const slotScopeId = createComponentSlotScopeId(
      workspaceId,
      documentId,
      memberId
    );
    contribution.scopes.push({
      id: slotScopeId,
      kind: 'component-slot',
      ownerRef: createDocumentOwnerRef(workspaceId, documentId),
      parentId: componentScopeId,
    });
    for (const [propId, prop] of sortedEntries(member.propsById ?? {})) {
      const propSymbolId = createComponentSlotPropSymbolId(
        workspaceId,
        documentId,
        memberId,
        propId
      );
      contribution.symbols.push({
        id: propSymbolId,
        stability: 'durable',
        kind: 'component-prop',
        name: prop.name,
        qualifiedName: `${documentId}.contract.slot.${memberId}.prop.${propId}`,
        scopeId: slotScopeId,
        ownerRef: createDocumentOwnerRef(workspaceId, documentId),
        typeRef: prop.typeRef,
        ...(prop.capabilityIds?.length
          ? { capabilityIds: [...prop.capabilityIds].sort(compareText) }
          : {}),
      });
      contribution.dependencies.push({
        id: createContractDependencyId(
          workspaceId,
          documentId,
          `slot-prop:${memberId}`,
          propId
        ),
        kind: 'component',
        sourceSymbolId: propSymbolId,
        targetSymbolId: slotSymbolId,
      });
    }
  }
  for (const [memberId, member] of sortedEntries(contract.variantAxesById)) {
    const variantSymbolId = addContractMember(contribution, {
      workspaceId,
      documentId,
      componentScopeId,
      componentSymbolId,
      memberKind: 'variant',
      memberId,
      name: member.name,
      symbolKind: 'component-variant',
    });
    for (const [optionId, option] of sortedEntries(member.optionsById)) {
      const optionSymbolId = createComponentVariantOptionSymbolId(
        workspaceId,
        documentId,
        memberId,
        optionId
      );
      contribution.symbols.push({
        id: optionSymbolId,
        stability: 'durable',
        kind: 'component-variant-option',
        name: option.name,
        qualifiedName: `${documentId}.contract.variant.${memberId}.${optionId}`,
        scopeId: componentScopeId,
        ownerRef: createDocumentOwnerRef(workspaceId, documentId),
      });
      contribution.dependencies.push({
        id: createContractDependencyId(
          workspaceId,
          documentId,
          `variant-option:${memberId}`,
          optionId
        ),
        kind: 'component',
        sourceSymbolId: optionSymbolId,
        targetSymbolId: variantSymbolId,
      });
    }
  }
  for (const [memberId, member] of sortedEntries(contract.partsById ?? {})) {
    const partSymbolId = addContractMember(contribution, {
      workspaceId,
      documentId,
      componentScopeId,
      componentSymbolId,
      memberKind: 'part',
      memberId,
      name: member.name,
      symbolKind: 'component-part',
      capabilityIds: member.capabilityIds,
    });
    contribution.references.push({
      id: createSemanticId(
        'pir-contract-part-reference',
        workspaceId,
        documentId,
        memberId
      ),
      kind: 'component-member',
      sourceRef: createDocumentOwnerRef(workspaceId, documentId),
      sourceSymbolId: partSymbolId,
      scopeId: componentScopeId,
      target: {
        kind: 'symbol-id',
        symbolId: createPirNodeSymbolId(
          workspaceId,
          documentId,
          member.targetNodeId
        ),
      },
      resolutionMode: 'addressable',
      requiresDurableTarget: true,
    });
  }
  addTokenBindingFacts(contribution, {
    workspaceId,
    documentId,
    componentScopeId,
    componentSymbolId,
    contract,
  });
};
