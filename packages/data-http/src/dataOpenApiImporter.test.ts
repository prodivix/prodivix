import { describe, expect, it } from 'vitest';
import {
  decodeDataSourceDocument,
  encodeDataSourceDocument,
  type DataSourceDocument,
} from '@prodivix/data';
import {
  createDataOpenApiImportProposal,
  DATA_OPENAPI_IMPORT_ISSUE_CODES,
} from './dataOpenApiImporter';

const catalogSpec = () => ({
  openapi: '3.1.0',
  info: { title: 'Catalog API', version: '1.0.0' },
  servers: [{ url: 'https://catalog.example.test/v1/' }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
    },
    schemas: {
      Product: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['id', 'name'],
        additionalProperties: false,
      },
    },
  },
  paths: {
    '/products/{id}': {
      get: {
        operationId: 'getProduct',
        summary: 'Get product',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'include',
            in: 'query',
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Product',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Product' },
              },
            },
          },
        },
      },
    },
    '/products': {
      post: {
        operationId: 'createProduct',
        summary: 'Create product',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Product' },
            },
          },
        },
        responses: {
          201: {
            description: 'Created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Product' },
              },
            },
          },
        },
      },
    },
  },
});

const propose = (
  spec: unknown,
  currentDocument?: DataSourceDocument,
  impactApproval?: {
    schemaIds: readonly string[];
    operationIds: readonly string[];
  }
) =>
  createDataOpenApiImportProposal({
    spec,
    documentId: 'data-catalog',
    importId: 'catalog-openapi',
    externalDocumentId: 'https://catalog.example.test/openapi.json',
    sourceId: 'catalog',
    runtimeZone: 'server',
    ...(currentDocument ? { currentDocument } : {}),
    ...(impactApproval ? { impactApproval } : {}),
  });

describe('OpenAPI 3.1 Data import proposal', () => {
  it('creates a bounded canonical HTTP proposal with stable provenance and auth placeholders', () => {
    const proposal = propose(catalogSpec());
    expect(proposal.status, JSON.stringify(proposal.issues)).toBe('ready');
    if (proposal.status !== 'ready') return;

    expect(proposal.target).toEqual({
      documentId: 'data-catalog',
      importId: 'catalog-openapi',
      externalDocumentId: 'https://catalog.example.test/openapi.json',
      sourceId: 'catalog',
    });
    expect(proposal.document.source).toMatchObject({
      id: 'catalog',
      adapterId: 'core.http',
      runtimeZone: 'server',
      configurationByKey: {
        baseUrl: { kind: 'literal', value: 'https://catalog.example.test' },
      },
    });
    expect(proposal.document.source.bindingsById).toEqual({
      'openapi-auth-bearerauth': {
        kind: 'secret-ref',
        reference: { bindingId: 'openapi-auth-bearerauth' },
      },
    });
    expect(proposal.document.operationsById['getproduct']).toMatchObject({
      kind: 'query',
      configurationByKey: {
        method: { kind: 'literal', value: 'GET' },
        path: { kind: 'literal', value: '/v1/products/{id}' },
        parameterMappings: {
          kind: 'literal',
          value: {
            path: { id: '/id' },
            query: { include: '/include' },
          },
        },
        authorization: {
          kind: 'secret-ref',
          reference: { bindingId: 'openapi-auth-bearerauth' },
        },
      },
    });
    expect(
      proposal.document.operationsById['createproduct']?.configurationByKey
        .bodyInputPath
    ).toEqual({ kind: 'literal', value: '/body' });
    expect(Object.keys(proposal.document.importProvenanceById ?? {})).toEqual([
      'catalog-openapi',
    ]);
    expect(
      proposal.document.importProvenanceById?.['catalog-openapi']?.sourceDigest
    ).toMatch(/^sha256-[0-9a-f]{64}$/u);

    const wire = encodeDataSourceDocument(proposal.document, {
      documentId: 'data-catalog',
    });
    const decoded = decodeDataSourceDocument(wire, {
      documentId: 'data-catalog',
    });
    expect(decoded).toEqual({ ok: true, value: proposal.document });
    expect(JSON.stringify(wire)).not.toContain('bearer-token');
  });

  it('preserves local policies while requiring exact impact approval for upstream contract changes', () => {
    const initial = propose(catalogSpec());
    expect(initial.status).toBe('ready');
    if (initial.status !== 'ready') return;
    const current: DataSourceDocument = {
      ...initial.document,
      operationsById: {
        ...initial.document.operationsById,
        getproduct: {
          ...initial.document.operationsById.getproduct!,
          policies: {
            cache: { strategy: 'cache-first', ttlMs: 5_000 },
          },
        },
      },
    };
    const changed = catalogSpec();
    changed.paths['/products/{id}'].get.summary = 'Read product';

    const blocked = propose(changed, current);
    expect(blocked.status).toBe('impact-required');
    expect(blocked.impact.operationIds).toEqual(['getproduct']);

    const accepted = propose(changed, current, blocked.impact);
    expect(accepted.status).toBe('ready');
    if (accepted.status !== 'ready') return;
    expect(accepted.document.operationsById.getproduct).toMatchObject({
      name: 'Read product',
      policies: { cache: { strategy: 'cache-first', ttlMs: 5_000 } },
    });
  });

  it('preserves a local managed edit when upstream is unchanged and conflicts when both sides change', () => {
    const initial = propose(catalogSpec());
    expect(initial.status).toBe('ready');
    if (initial.status !== 'ready') return;
    const current: DataSourceDocument = {
      ...initial.document,
      operationsById: {
        ...initial.document.operationsById,
        getproduct: {
          ...initial.document.operationsById.getproduct!,
          name: 'Local product label',
        },
      },
    };

    const preserved = propose(catalogSpec(), current);
    expect(preserved.status).toBe('ready');
    if (preserved.status === 'ready') {
      expect(preserved.document.operationsById.getproduct?.name).toBe(
        'Local product label'
      );
      expect(
        preserved.changes.some(
          (entry) =>
            entry.entity === 'operation' &&
            entry.targetId === 'getproduct' &&
            entry.change === 'preserve-local'
        )
      ).toBe(true);
    }

    const changed = catalogSpec();
    changed.paths['/products/{id}'].get.summary = 'Upstream product label';
    const conflict = propose(changed, current);
    expect(conflict.status).toBe('conflict');
    expect(conflict.issues).toContainEqual(
      expect.objectContaining({
        code: DATA_OPENAPI_IMPORT_ISSUE_CODES.reimportConflict,
        path: '/operationsById/getproduct',
      })
    );
  });

  it('requires impact approval before removing imported operations and their generated schemas', () => {
    const initial = propose(catalogSpec());
    expect(initial.status).toBe('ready');
    if (initial.status !== 'ready') return;
    const changed = catalogSpec();
    delete (changed.paths as Record<string, unknown>)['/products'];

    const blocked = propose(changed, initial.document);
    expect(blocked.status).toBe('impact-required');
    expect(blocked.impact.operationIds).toEqual(['createproduct']);
    expect(blocked.impact.schemaIds).toContain('createproduct-input');

    const accepted = propose(changed, initial.document, blocked.impact);
    expect(accepted.status).toBe('ready');
    if (accepted.status === 'ready') {
      expect(accepted.document.operationsById.createproduct).toBeUndefined();
      expect(
        accepted.document.schemasById['createproduct-input']
      ).toBeUndefined();
    }
  });

  it('fails closed for unsupported versions, external schema refs, and client Secret projection', () => {
    const version = catalogSpec();
    version.openapi = '3.0.3';
    expect(propose(version).status).toBe('invalid');

    const external = catalogSpec();
    external.paths['/products/{id}'].get.responses[200].content[
      'application/json'
    ].schema = { $ref: 'https://schemas.example.test/product.json' };
    expect(propose(external).status).toBe('invalid');

    const client = createDataOpenApiImportProposal({
      spec: catalogSpec(),
      documentId: 'data-catalog',
      importId: 'catalog-openapi',
      externalDocumentId: 'https://catalog.example.test/openapi.json',
      sourceId: 'catalog',
      runtimeZone: 'client',
    });
    expect(client.status).toBe('invalid');
    expect(client.issues).toContainEqual(
      expect.objectContaining({
        code: DATA_OPENAPI_IMPORT_ISSUE_CODES.securityUnsupported,
      })
    );
  });

  it('returns bounded diagnostics instead of throwing for malformed schemas and GET bodies', () => {
    const malformed = catalogSpec();
    (malformed.components.schemas as Record<string, unknown>).Product = null;
    expect(() => propose(malformed)).not.toThrow();
    expect(propose(malformed)).toMatchObject({
      status: 'invalid',
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: DATA_OPENAPI_IMPORT_ISSUE_CODES.invalidDocument,
        }),
      ]),
    });

    const getBody = catalogSpec();
    (
      getBody.paths['/products/{id}'].get as Record<string, unknown>
    ).requestBody = {
      required: true,
      content: {
        'application/json': { schema: { type: 'object' } },
      },
    };
    expect(propose(getBody)).toMatchObject({
      status: 'invalid',
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: DATA_OPENAPI_IMPORT_ISSUE_CODES.unsupportedShape,
          path: '/paths/~1products~1{id}/get/requestBody',
        }),
      ]),
    });
  });

  it('attaches only transitively reachable component definitions', () => {
    const spec = catalogSpec();
    (spec.components.schemas as Record<string, unknown>).Unused = {
      type: 'object',
      properties: { ignored: { type: 'string' } },
    };
    const proposal = propose(spec);
    expect(proposal.status, JSON.stringify(proposal.issues)).toBe('ready');
    if (proposal.status !== 'ready') return;

    const operation = proposal.document.operationsById.getproduct!;
    const schema = proposal.document.schemasById[operation.outputSchemaId]!
      .schema as { $defs?: Record<string, unknown> };
    expect(Object.keys(schema.$defs ?? {})).toEqual([
      '__prodivix_openapi__Product',
    ]);
  });

  it('reports an invalid component schema once instead of once per projection', () => {
    const spec = catalogSpec();
    (spec.components.schemas as Record<string, unknown>).Invalid = {
      $ref: 'https://schemas.example.test/invalid.json',
    };

    const proposal = propose(spec);
    expect(proposal.status).toBe('invalid');
    expect(
      proposal.issues.filter(
        (entry) => entry.path === '/components/schemas/Invalid/$ref'
      )
    ).toHaveLength(1);
  });
});
