import type {
  PIRComponentPropContract,
  PIRDocument,
  PIRValueBinding,
} from '../pir.types';
import type { PIRCollectionSymbolOwner } from './pirExtractionGraph';
import type { PIRLiftedValueKind } from './pirSubtreeExtraction.types';

export const getPirExtractionBindingIdentity = (
  value: Exclude<PIRValueBinding, { kind: 'literal' | 'code' }>
): Readonly<{ kind: PIRLiftedValueKind; id: string }> => {
  switch (value.kind) {
    case 'param':
      return { kind: value.kind, id: value.paramId };
    case 'state':
      return { kind: value.kind, id: value.stateId };
    case 'data':
      return { kind: value.kind, id: value.dataId };
    case 'collection-symbol':
      return { kind: value.kind, id: value.symbolId };
    case 'component-prop':
      return { kind: value.kind, id: value.memberId };
    case 'component-variant':
      return { kind: value.kind, id: value.memberId };
    case 'slot-prop':
      return { kind: value.kind, id: value.memberId };
  }
};

export const withoutPirExtractionBindingPath = (
  value: Exclude<PIRValueBinding, { kind: 'literal' | 'code' }>
): PIRValueBinding => {
  switch (value.kind) {
    case 'param':
      return { kind: 'param', paramId: value.paramId };
    case 'state':
      return { kind: 'state', stateId: value.stateId };
    case 'data':
      return { kind: 'data', dataId: value.dataId };
    case 'collection-symbol':
      return { kind: 'collection-symbol', symbolId: value.symbolId };
    case 'component-prop':
      return { kind: 'component-prop', memberId: value.memberId };
    case 'component-variant':
      return { kind: 'component-variant', memberId: value.memberId };
    case 'slot-prop':
      return { kind: 'slot-prop', memberId: value.memberId };
  }
};

export const resolvePirExtractionComponentProp = (
  document: PIRDocument,
  collectionSymbolOwners: ReadonlyMap<string, PIRCollectionSymbolOwner>,
  kind: PIRLiftedValueKind,
  sourceId: string
): PIRComponentPropContract | undefined => {
  const id = `extracted-prop:${kind}:${sourceId.length}:${sourceId}`;
  switch (kind) {
    case 'param': {
      const definition = document.logic?.props?.[sourceId];
      return definition
        ? {
            id,
            name: definition.name?.trim() || sourceId,
            typeRef: definition.typeRef,
            required: true,
          }
        : undefined;
    }
    case 'state': {
      const definition = document.logic?.state?.[sourceId];
      return definition
        ? {
            id,
            name: definition.name?.trim() || sourceId,
            typeRef: definition.typeRef?.trim() || 'unknown',
            required: true,
          }
        : undefined;
    }
    case 'data': {
      const node = document.ui.graph.nodesById[sourceId];
      return node?.kind === 'element' && node.data
        ? {
            id,
            name: `data-${sourceId}`,
            typeRef: 'unknown',
            required: true,
          }
        : undefined;
    }
    case 'collection-symbol': {
      const owner = collectionSymbolOwners.get(sourceId);
      if (!owner) return undefined;
      const node = document.ui.graph.nodesById[owner.nodeId];
      if (node?.kind !== 'collection') return undefined;
      const name =
        owner.role === 'item'
          ? node.symbols.itemName
          : owner.role === 'index'
            ? node.symbols.indexName
            : 'error';
      return {
        id,
        name,
        typeRef: owner.role === 'index' ? 'number' : 'unknown',
        required: true,
      };
    }
    case 'component-prop': {
      const definition = document.componentContract?.propsById[sourceId];
      return definition
        ? {
            id,
            name: definition.name,
            typeRef: definition.typeRef,
            required: true,
            ...(definition.capabilityIds
              ? { capabilityIds: definition.capabilityIds }
              : {}),
          }
        : undefined;
    }
    case 'component-variant': {
      const definition = document.componentContract?.variantAxesById[sourceId];
      return definition
        ? {
            id,
            name: definition.name,
            typeRef: 'string',
            required: true,
          }
        : undefined;
    }
    case 'slot-prop':
      return {
        id,
        name: sourceId,
        typeRef: 'unknown',
        required: true,
      };
  }
};
