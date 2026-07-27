import { describe, expect, it } from 'vitest';
import {
  createDataAsyncApiImportProposal,
  DATA_ASYNCAPI_IMPORT_ISSUE_CODES,
} from './dataAsyncApiImporter';

const spec = () => ({
  asyncapi: '3.0.0',
  info: { title: 'Catalog Events', version: '1.0.0' },
  channels: {
    productEvents: {
      address: '/events/products',
      messages: {
        ProductCreated: {
          payload: {
            type: 'object',
            properties: { id: { type: 'string' }, name: { type: 'string' } },
            required: ['id', 'name'],
            additionalProperties: false,
          },
        },
      },
    },
    productCommands: {
      address: '/commands/products',
      messages: {
        ProductLookup: {
          payload: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
            additionalProperties: false,
          },
        },
      },
    },
    productReplies: {
      address: '/replies/products',
      messages: {
        Product: {
          payload: {
            type: 'object',
            properties: { id: { type: 'string' }, name: { type: 'string' } },
            required: ['id', 'name'],
            additionalProperties: false,
          },
        },
      },
    },
  },
  operations: {
    publishProduct: {
      action: 'send',
      channel: { $ref: '#/channels/productEvents' },
      messages: [{ $ref: '#/channels/productEvents/messages/ProductCreated' }],
    },
    lookupProduct: {
      action: 'send',
      channel: { $ref: '#/channels/productCommands' },
      messages: [{ $ref: '#/channels/productCommands/messages/ProductLookup' }],
      reply: {
        channel: { $ref: '#/channels/productReplies' },
        messages: [{ $ref: '#/channels/productReplies/messages/Product' }],
      },
    },
  },
});

const propose = (
  overrides: Partial<
    Parameters<typeof createDataAsyncApiImportProposal>[0]
  > = {}
) =>
  createDataAsyncApiImportProposal({
    spec: spec(),
    documentId: 'data-events',
    importId: 'catalog-asyncapi',
    externalDocumentId: 'catalog.asyncapi.json',
    sourceId: 'catalog-events',
    endpoint: 'https://events.example.test/v1/',
    runtimeZone: 'server',
    ...overrides,
  });

describe('AsyncAPI 3.0 finite Data import proposal', () => {
  it('projects publish and request-reply without creating a stream runtime', () => {
    const proposal = propose();
    expect(proposal.status, JSON.stringify(proposal.issues)).toBe('ready');
    if (proposal.status !== 'ready') return;
    expect(proposal.document.source).toMatchObject({
      adapterId: 'core.asyncapi',
      runtimeZone: 'server',
    });
    expect(proposal.document.operationsById.publishproduct).toMatchObject({
      kind: 'mutation',
      configurationByKey: {
        action: { kind: 'literal', value: 'publish' },
        path: { kind: 'literal', value: '/events/products' },
      },
    });
    expect(proposal.document.operationsById.lookupproduct).toMatchObject({
      kind: 'query',
      configurationByKey: {
        action: { kind: 'literal', value: 'request-reply' },
      },
    });
    expect(
      proposal.document.importProvenanceById?.['catalog-asyncapi']
    ).toMatchObject({ kind: 'asyncapi-3.0' });
  });

  it('returns a stable unsupported issue for receive operations', () => {
    const receive = spec();
    (receive as unknown as { operations: Record<string, unknown> }).operations =
      {
        receiveProduct: {
          action: 'receive',
          channel: { $ref: '#/channels/productEvents' },
          messages: [
            { $ref: '#/channels/productEvents/messages/ProductCreated' },
          ],
        },
      };
    const proposal = propose({ spec: receive });
    expect(proposal.status).toBe('invalid');
    expect(proposal.issues).toContainEqual(
      expect.objectContaining({
        code: DATA_ASYNCAPI_IMPORT_ISSUE_CODES.unsupportedAction,
      })
    );
  });

  it('returns a blocked proposal instead of throwing for non-canonical operation keys', () => {
    const whitespace = spec();
    (
      whitespace as unknown as { operations: Record<string, unknown> }
    ).operations = {
      ' sendProduct': {
        action: 'send',
        channel: { $ref: '#/channels/productEvents' },
        messages: [
          { $ref: '#/channels/productEvents/messages/ProductCreated' },
        ],
      },
    };

    const proposal = propose({ spec: whitespace });
    expect(proposal.status).toBe('invalid');
    expect(
      proposal.issues.filter(
        (entry) =>
          entry.code === DATA_ASYNCAPI_IMPORT_ISSUE_CODES.invalidDocument &&
          entry.path === '/operations/ sendProduct'
      )
    ).toHaveLength(1);
  });

  it('requires exact impact approval when a managed message schema changes', () => {
    const initial = propose();
    expect(initial.status).toBe('ready');
    if (initial.status !== 'ready') return;
    const changed = spec();
    const payload = changed.channels.productEvents.messages.ProductCreated
      .payload as unknown as { properties: Record<string, unknown> };
    payload.properties = { ...payload.properties, sku: { type: 'string' } };
    const preview = propose({
      spec: changed,
      currentDocument: initial.document,
    });
    expect(preview.status).toBe('impact-required');
    if (preview.status !== 'impact-required') return;
    const approved = propose({
      spec: changed,
      currentDocument: initial.document,
      impactApproval: preview.impact,
    });
    expect(approved.status, JSON.stringify(approved.issues)).toBe('ready');
  });
});
