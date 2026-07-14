import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
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
  type WorkspaceSymbol,
} from '@prodivix/authoring';
import type { PIRDocument, PIRValueBinding } from '../pir.types';
import {
  PIR_BINDING_CANDIDATE_REASONS,
  createPirBindingCandidate,
} from './pirBindingCandidate';
import { PIR_SEMANTIC_PROVIDER_DESCRIPTOR } from './pirSemanticContributionProvider';

const propertyParameters = Object.freeze({
  numRuns: 30,
  seed: 0x14_07_2026,
});

const workspaceId = 'workspace';
const documentId = 'component-card';

const createDocument = (suffix: string): PIRDocument => ({
  componentContract: {
    propsById: {
      [`prop-${suffix}`]: {
        id: `prop-${suffix}`,
        name: 'Title',
        typeRef: 'string',
      },
    },
    eventsById: {},
    slotsById: {
      [`slot-${suffix}`]: {
        id: `slot-${suffix}`,
        name: 'Content',
        propsById: {
          [`slot-prop-${suffix}`]: {
            id: `slot-prop-${suffix}`,
            name: 'Tone',
            typeRef: 'string',
          },
        },
      },
    },
    variantAxesById: {
      [`variant-${suffix}`]: {
        id: `variant-${suffix}`,
        name: 'Size',
        optionsById: {
          compact: { id: 'compact', name: 'Compact' },
        },
      },
    },
  },
  logic: {
    props: {
      [`param-${suffix}`]: { typeRef: 'string' },
    },
    state: {
      [`state-${suffix}`]: { typeRef: 'number', initial: 0 },
    },
  },
  ui: {
    graph: {
      rootId: 'root',
      nodesById: {
        root: {
          id: 'root',
          kind: 'element',
          type: 'main',
          data: { value: { kind: 'literal', value: {} } },
        },
        collection: {
          id: 'collection',
          kind: 'collection',
          source: { kind: 'literal', value: [] },
          key: { kind: 'index' },
          symbols: {
            itemId: `item-${suffix}`,
            itemName: 'item',
            indexId: `index-${suffix}`,
            indexName: 'index',
            errorId: `error-${suffix}`,
          },
        },
      },
      childIdsById: { root: ['collection'], collection: [] },
      regionsById: { collection: { item: [] } },
      order: { strategy: 'childIdsById' },
    },
  },
});

type SupportedCase = Readonly<{
  id: string;
  kind: WorkspaceSymbol['kind'];
  stability: WorkspaceSymbol['stability'];
  scopeId: string;
  binding: PIRValueBinding;
}>;

const createSupportedCase = (
  category:
    | 'param'
    | 'state'
    | 'data'
    | 'item'
    | 'index'
    | 'error'
    | 'component-prop'
    | 'component-variant'
    | 'slot-prop',
  suffix: string
): SupportedCase => {
  const componentScopeId = createComponentScopeId(workspaceId, documentId);
  const collectionScopeId = createPirCollectionScopeId(
    workspaceId,
    documentId,
    'collection'
  );
  switch (category) {
    case 'param':
      return {
        id: createPirParamSymbolId(workspaceId, documentId, `param-${suffix}`),
        kind: 'param',
        stability: 'durable',
        scopeId: componentScopeId,
        binding: { kind: 'param', paramId: `param-${suffix}` },
      };
    case 'state':
      return {
        id: createPirStateSymbolId(workspaceId, documentId, `state-${suffix}`),
        kind: 'state',
        stability: 'durable',
        scopeId: componentScopeId,
        binding: { kind: 'state', stateId: `state-${suffix}` },
      };
    case 'data':
      return {
        id: createPirDataSymbolId(workspaceId, documentId, 'root'),
        kind: 'data',
        stability: 'revision-scoped',
        scopeId: createPirNodeScopeId(workspaceId, documentId, 'root'),
        binding: { kind: 'data', dataId: 'root' },
      };
    case 'item':
      return {
        id: createPirCollectionItemSymbolId(
          workspaceId,
          documentId,
          'collection',
          `item-${suffix}`
        ),
        kind: 'collection-item',
        stability: 'durable',
        scopeId: collectionScopeId,
        binding: {
          kind: 'collection-symbol',
          symbolId: `item-${suffix}`,
        },
      };
    case 'index':
      return {
        id: createPirCollectionIndexSymbolId(
          workspaceId,
          documentId,
          'collection',
          `index-${suffix}`
        ),
        kind: 'collection-index',
        stability: 'durable',
        scopeId: collectionScopeId,
        binding: {
          kind: 'collection-symbol',
          symbolId: `index-${suffix}`,
        },
      };
    case 'error':
      return {
        id: createPirCollectionErrorSymbolId(
          workspaceId,
          documentId,
          'collection',
          `error-${suffix}`
        ),
        kind: 'collection-error',
        stability: 'durable',
        scopeId: createPirCollectionErrorScopeId(
          workspaceId,
          documentId,
          'collection'
        ),
        binding: {
          kind: 'collection-symbol',
          symbolId: `error-${suffix}`,
        },
      };
    case 'component-prop':
      return {
        id: createComponentContractMemberSymbolId(
          workspaceId,
          documentId,
          'prop',
          `prop-${suffix}`
        ),
        kind: 'component-prop',
        stability: 'durable',
        scopeId: componentScopeId,
        binding: { kind: 'component-prop', memberId: `prop-${suffix}` },
      };
    case 'component-variant':
      return {
        id: createComponentContractMemberSymbolId(
          workspaceId,
          documentId,
          'variant',
          `variant-${suffix}`
        ),
        kind: 'component-variant',
        stability: 'durable',
        scopeId: componentScopeId,
        binding: {
          kind: 'component-variant',
          memberId: `variant-${suffix}`,
        },
      };
    case 'slot-prop':
      return {
        id: createComponentSlotPropSymbolId(
          workspaceId,
          documentId,
          `slot-${suffix}`,
          `slot-prop-${suffix}`
        ),
        kind: 'component-prop',
        stability: 'durable',
        scopeId: createComponentSlotScopeId(
          workspaceId,
          documentId,
          `slot-${suffix}`
        ),
        binding: { kind: 'slot-prop', memberId: `slot-prop-${suffix}` },
      };
  }
};

const createSymbol = (value: SupportedCase): WorkspaceSymbol => {
  const { binding: _binding, ...fact } = value;
  return {
    ...fact,
    providerId: PIR_SEMANTIC_PROVIDER_DESCRIPTOR.id,
    name: 'candidate',
    ownerRef: { kind: 'document', workspaceId, documentId },
  };
};

describe('PIR-current binding candidate properties', () => {
  it('matches stable semantic identities to typed bindings without parsing', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'param',
          'state',
          'data',
          'item',
          'index',
          'error',
          'component-prop',
          'component-variant',
          'slot-prop'
        ),
        fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/),
        (category, suffix) => {
          const expected = createSupportedCase(category, suffix);
          expect(
            createPirBindingCandidate({
              workspaceId,
              documentId,
              document: createDocument(suffix),
              symbol: createSymbol(expected),
            })
          ).toEqual({
            status: 'available',
            symbolId: expected.id,
            binding: expected.binding,
          });
        }
      ),
      propertyParameters
    );
  });

  it('fails closed for stale, mismatched, unsupported, and incomplete code facts', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('stale', 'mismatch', 'route', 'code'),
        fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/),
        (violation, suffix) => {
          const param = createSupportedCase('param', suffix);
          const base = createSymbol(param);
          const symbol: WorkspaceSymbol =
            violation === 'stale'
              ? {
                  ...base,
                  id: createPirParamSymbolId(
                    workspaceId,
                    documentId,
                    `missing-${suffix}`
                  ),
                }
              : violation === 'mismatch'
                ? { ...base, scopeId: 'foreign-scope' }
                : violation === 'route'
                  ? { ...base, kind: 'route', id: `route-${suffix}` }
                  : {
                      ...base,
                      providerId: 'core.code',
                      kind: 'code-function',
                      id: `code-${suffix}`,
                    };
          const result = createPirBindingCandidate({
            workspaceId,
            documentId,
            document: createDocument(suffix),
            symbol,
          });
          expect(result.status).toBe(
            violation === 'stale' || violation === 'mismatch'
              ? 'unavailable'
              : 'unsupported'
          );
          if (result.status === 'available') return;
          expect(result.reason).toBe(
            violation === 'stale'
              ? PIR_BINDING_CANDIDATE_REASONS.symbolNotInDocumentRevision
              : violation === 'mismatch'
                ? PIR_BINDING_CANDIDATE_REASONS.symbolFactMismatch
                : violation === 'route'
                  ? PIR_BINDING_CANDIDATE_REASONS.symbolKindUnsupported
                  : PIR_BINDING_CANDIDATE_REASONS.codeReferenceIncomplete
          );
        }
      ),
      propertyParameters
    );
  });
});
