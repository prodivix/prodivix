import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  createDataLifecycleSnapshot,
  decodeDataSourceDocument,
  encodeDataSourceDocument,
  isDataSourceDocument,
  JSON_SCHEMA_2020_12_URI,
  normalizeDataSourceDocument,
  validateDataSourceDocument,
  type DataSourceDocument,
} from './index';

const identifierArbitrary = fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/);

const createDocument = (
  documentId: string,
  sourceId: string
): DataSourceDocument => ({
  source: {
    id: sourceId,
    adapterId: 'core.http',
    runtimeZone: 'server',
    bindingsById: {
      apiUrl: {
        kind: 'environment-ref',
        reference: { bindingId: 'apiUrl' },
      },
      apiToken: {
        kind: 'secret-ref',
        reference: { bindingId: 'apiToken' },
      },
    },
    configurationByKey: {
      baseUrl: {
        kind: 'environment-ref',
        reference: { bindingId: 'apiUrl' },
      },
      timeoutMs: { kind: 'literal', value: 5_000 },
    },
  },
  schemasById: {
    items: {
      id: 'items',
      schema: {
        $schema: JSON_SCHEMA_2020_12_URI,
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    },
  },
  operationsById: {
    list: {
      id: 'list',
      kind: 'query',
      outputSchemaId: 'items',
      configurationByKey: {},
      policies: {
        cache: { strategy: 'cache-first', ttlMs: 1_000 },
        pagination: {
          kind: 'offset',
          offsetInput: 'offset',
          limitInput: 'limit',
          defaultLimit: 20,
          maxLimit: 100,
        },
      },
    },
    create: {
      id: 'create',
      kind: 'mutation',
      outputSchemaId: 'items',
      configurationByKey: {
        authorization: {
          kind: 'secret-ref',
          reference: { bindingId: 'apiToken' },
        },
      },
      policies: {
        optimistic: {
          kind: 'crud',
          action: 'create',
          target: { documentId, operationId: 'list' },
          valueInputPath: '/item',
          valueOutputPath: '/item',
          placement: 'start',
          rollback: 'on-error',
        },
      },
    },
  },
});

describe('Data source document properties', () => {
  it('round-trips the strict wire shape into one deeply immutable current model', () => {
    fc.assert(
      fc.property(
        identifierArbitrary,
        identifierArbitrary,
        (documentId, sourceId) => {
          const current = createDocument(documentId, sourceId);
          const wire = encodeDataSourceDocument(current, { documentId });
          const decoded = decodeDataSourceDocument(wire, { documentId });

          expect(decoded.ok).toBe(true);
          if (!decoded.ok) return;
          expect(decoded.value).toEqual(
            normalizeDataSourceDocument(current, { documentId })
          );
          expect(Object.isFrozen(decoded.value)).toBe(true);
          expect(
            Object.isFrozen(decoded.value.operationsById.create!.policies)
          ).toBe(true);
          expect(Object.isFrozen(decoded.value.schemasById.items!.schema)).toBe(
            true
          );
          expect(isDataSourceDocument(decoded.value, { documentId })).toBe(
            true
          );
          expect(decodeDataSourceDocument(decoded.value).ok).toBe(false);
        }
      ),
      { numRuns: 30 }
    );
  });

  it('rejects undeclared or client-visible secrets and unknown domain fields', () => {
    const document = createDocument('data-doc', 'api');
    const invalid = {
      ...document,
      source: {
        ...document.source,
        runtimeZone: 'client',
        unknown: true,
      },
    };

    const result = validateDataSourceDocument(invalid, {
      documentId: 'data-doc',
    });
    expect(result.valid).toBe(false);
    expect(result.issues.every((entry) => entry.code === 'DAT-1001')).toBe(
      true
    );
    expect(
      result.issues.some((entry) => entry.path === '/source/unknown')
    ).toBe(true);
    expect(
      result.issues.some((entry) => entry.message.includes('Secret references'))
    ).toBe(true);
  });

  it('rejects mutation replay and ambiguous pagination input fields', () => {
    const document = createDocument('data-doc', 'api');
    const result = validateDataSourceDocument({
      ...document,
      operationsById: {
        ...document.operationsById,
        list: {
          ...document.operationsById.list!,
          policies: {
            pagination: {
              kind: 'offset',
              offsetInput: 'page',
              limitInput: 'page',
              defaultLimit: 20,
            },
          },
        },
        create: {
          ...document.operationsById.create!,
          policies: {
            retry: {
              maxAttempts: 2,
              backoff: 'fixed',
              initialDelayMs: 10,
            },
          },
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/operationsById/list/policies/pagination/limitInput',
        }),
        expect.objectContaining({
          path: '/operationsById/create/policies/retry',
        }),
      ])
    );
  });

  it('round-trips explicit mutation idempotency and rejects query misuse', () => {
    const document = createDocument('data-doc', 'api');
    const accepted = normalizeDataSourceDocument(
      {
        ...document,
        operationsById: {
          ...document.operationsById,
          create: {
            ...document.operationsById.create!,
            policies: {
              ...document.operationsById.create!.policies,
              idempotency: { kind: 'invocation-key' },
              retry: {
                maxAttempts: 3,
                backoff: 'fixed',
                initialDelayMs: 10,
              },
            },
          },
        },
      },
      { documentId: 'data-doc' }
    );
    expect(accepted.operationsById.create?.policies).toMatchObject({
      idempotency: { kind: 'invocation-key' },
      retry: { maxAttempts: 3 },
    });

    const rejected = validateDataSourceDocument({
      ...document,
      operationsById: {
        ...document.operationsById,
        list: {
          ...document.operationsById.list!,
          policies: {
            ...document.operationsById.list!.policies,
            idempotency: { kind: 'invocation-key' },
          },
        },
      },
    });
    expect(rejected.valid).toBe(false);
    expect(rejected.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/operationsById/list/policies/idempotency',
        }),
      ])
    );
  });

  it('round-trips bounded subscription recovery and requires exact Secret renewal and collection policy', () => {
    const document = createDocument('data-doc', 'api');
    const watch = {
      id: 'watch',
      kind: 'subscription' as const,
      outputSchemaId: 'items',
      configurationByKey: {
        authorization: {
          kind: 'secret-ref' as const,
          reference: { bindingId: 'apiToken' },
        },
      },
      policies: {
        stream: {
          reconnect: {
            resume: 'sse-last-event-id' as const,
            maxReconnectAttempts: 3,
            backoff: 'exponential' as const,
            initialDelayMs: 25,
            maxDelayMs: 200,
          },
          credentialRenewal: 'per-connection' as const,
          collection: {
            kind: 'keyed-event-v1' as const,
            entityIdPath: '/id',
            maxItems: 100,
          },
        },
      },
    };
    const accepted = normalizeDataSourceDocument({
      ...document,
      operationsById: { ...document.operationsById, watch },
    });
    expect(accepted.operationsById.watch?.policies.stream).toEqual(
      watch.policies.stream
    );

    const withoutRenewal = validateDataSourceDocument({
      ...document,
      operationsById: {
        ...document.operationsById,
        watch: {
          ...watch,
          policies: {
            stream: {
              ...watch.policies.stream,
              credentialRenewal: undefined,
            },
          },
        },
      },
    });
    const queryMisuse = validateDataSourceDocument({
      ...document,
      operationsById: {
        ...document.operationsById,
        list: {
          ...document.operationsById.list!,
          policies: { stream: watch.policies.stream },
        },
      },
    });
    const invalidCollection = validateDataSourceDocument({
      ...document,
      operationsById: {
        ...document.operationsById,
        watch: {
          ...watch,
          policies: {
            stream: {
              ...watch.policies.stream,
              collection: {
                ...watch.policies.stream.collection,
                entityIdPath: 'id',
                maxItems: 10_001,
              },
            },
          },
        },
      },
    });

    expect(withoutRenewal.valid).toBe(false);
    expect(
      withoutRenewal.issues.some((issue) =>
        issue.path.endsWith('/policies/stream')
      )
    ).toBe(true);
    expect(queryMisuse.valid).toBe(false);
    expect(
      queryMisuse.issues.some((issue) =>
        issue.path.includes('/policies/stream')
      )
    ).toBe(true);
    expect(invalidCollection.valid).toBe(false);
    expect(
      invalidCollection.issues.some((issue) =>
        issue.path.includes('/policies/stream/collection')
      )
    ).toBe(true);
  });

  it('rejects ambiguous cache lifetime and non-JSON-Pointer key selection', () => {
    const document = createDocument('data-doc', 'api');
    const invalidPolicies = [
      {
        strategy: 'stale-while-revalidate',
        staleWhileRevalidateMs: 1_000,
        keyInputPaths: ['filters.tenant', '/filters/~2tenant'],
      },
      { strategy: 'no-store', ttlMs: 1_000 },
      { strategy: 'cache-first', ttlMs: 1_000, staleWhileRevalidateMs: 500 },
    ];

    for (const cache of invalidPolicies) {
      const result = validateDataSourceDocument({
        ...document,
        operationsById: {
          ...document.operationsById,
          list: {
            ...document.operationsById.list!,
            policies: { cache },
          },
        },
      });
      expect(result.valid).toBe(false);
      expect(
        result.issues.some(
          (issue) =>
            issue.path.includes('/policies/cache') &&
            (issue.message.includes('ttlMs') ||
              issue.message.includes('JSON Pointers') ||
              issue.message.includes('no-store') ||
              issue.message.includes('cache-first'))
        )
      ).toBe(true);
    }
  });

  it('rejects optimistic effects without explicit identity and value mappings', () => {
    const document = createDocument('data-doc', 'api');
    const result = validateDataSourceDocument({
      ...document,
      operationsById: {
        ...document.operationsById,
        create: {
          ...document.operationsById.create!,
          policies: {
            optimistic: {
              kind: 'crud',
              action: 'update',
              target: { documentId: 'data-doc', operationId: 'list' },
              entityIdPath: 'id',
              valueInputPath: '/item',
              rollback: 'on-error',
            },
          },
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/operationsById/create/policies/optimistic/entityIdPath',
        }),
        expect.objectContaining({
          path: '/operationsById/create/policies/optimistic',
        }),
      ])
    );
  });

  it('preserves lifecycle time ordering for arbitrary valid timestamps', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10_000 }),
        fc.nat({ max: 10_000 }),
        (startedAt, duration) => {
          const snapshot = createDataLifecycleSnapshot({
            status: 'success',
            operation: { documentId: 'data-doc', operationId: 'list' },
            sequence: 1,
            invocationId: 'invocation-1',
            attempt: 1,
            startedAt,
            completedAt: startedAt + duration,
            value: [{ id: 'item-1' }],
          });

          expect(snapshot.completedAt).toBeGreaterThanOrEqual(
            snapshot.startedAt
          );
          expect(Object.isFrozen(snapshot.value)).toBe(true);
        }
      ),
      { numRuns: 30 }
    );
  });
});
