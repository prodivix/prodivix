import { describe, expect, it } from 'vitest';
import {
  DATA_RETRY_POLICY_LIMITS,
  DATA_RETRY_RUNTIME_ERROR_CODES,
  isDataRetryPolicyWithinBudget,
  JSON_SCHEMA_2020_12_URI,
  normalizeDataSourceDocument,
  projectedDataRetryCeilingMs,
  validateDataSourceDocument,
  type DataOperation,
  type DataRetryPolicy,
  type DataSourceDocument,
} from './index';
import { resolveDataRetryPolicy } from './dataPolicyRuntime';

const documentWithRetry = (retry: DataRetryPolicy): DataSourceDocument => ({
  source: {
    id: 'catalog',
    adapterId: 'core.http',
    runtimeZone: 'server',
    bindingsById: {},
    configurationByKey: {},
  },
  schemasById: {
    items: {
      id: 'items',
      schema: { $schema: JSON_SCHEMA_2020_12_URI, type: 'array' },
    },
  },
  operationsById: {
    list: {
      id: 'list',
      kind: 'query',
      outputSchemaId: 'items',
      configurationByKey: {},
      policies: { retry },
    },
  },
});

const queryWithRetry = (retry: DataRetryPolicy): DataOperation => ({
  id: 'list',
  kind: 'query',
  outputSchemaId: 'items',
  configurationByKey: {},
  policies: { retry },
});

const retryIssues = (retry: DataRetryPolicy): readonly string[] =>
  validateDataSourceDocument(documentWithRetry(retry), {
    documentId: 'catalog',
  }).issues.map((issue) => issue.path);

describe('Data retry policy budget', () => {
  it('rejects an authored attempt count outside the budget before any ladder is projected', () => {
    const retry: DataRetryPolicy = {
      maxAttempts: Number.MAX_SAFE_INTEGER,
      backoff: 'exponential',
      initialDelayMs: 0,
    };

    const result = validateDataSourceDocument(documentWithRetry(retry), {
      documentId: 'catalog',
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toContain(
      '/operationsById/list/policies/retry/maxAttempts'
    );
    expect(result.issues.every((issue) => issue.code === 'DAT-1001')).toBe(
      true
    );
    expect(() =>
      normalizeDataSourceDocument(documentWithRetry(retry), {
        documentId: 'catalog',
      })
    ).toThrow(TypeError);
  });

  it('rejects an exponential ladder whose projected delay leaves the budget', () => {
    const retry: DataRetryPolicy = {
      maxAttempts: DATA_RETRY_POLICY_LIMITS.maxAttempts,
      backoff: 'exponential',
      initialDelayMs: 60_000,
    };

    expect(retryIssues(retry)).toContain('/operationsById/list/policies/retry');
  });

  it('rejects an explicit delay ceiling outside the budget', () => {
    expect(
      retryIssues({
        maxAttempts: 2,
        backoff: 'fixed',
        initialDelayMs: 0,
        maxDelayMs: DATA_RETRY_POLICY_LIMITS.maxDelayMs + 1,
      })
    ).toContain('/operationsById/list/policies/retry/maxDelayMs');
    expect(
      retryIssues({
        maxAttempts: 2,
        backoff: 'fixed',
        initialDelayMs: DATA_RETRY_POLICY_LIMITS.maxDelayMs + 1,
      })
    ).toContain('/operationsById/list/policies/retry/initialDelayMs');
  });

  it('accepts a ladder inside the budget and keeps runtime resolution in agreement', () => {
    const retry: DataRetryPolicy = {
      maxAttempts: 3,
      backoff: 'exponential',
      initialDelayMs: 10,
    };

    expect(
      validateDataSourceDocument(documentWithRetry(retry), {
        documentId: 'catalog',
      }).valid
    ).toBe(true);
    expect(isDataRetryPolicyWithinBudget(retry)).toBe(true);
    expect(resolveDataRetryPolicy(queryWithRetry(retry), 1)).toEqual(retry);
  });

  it('fails the invocation runtime closed instead of clamping an oversized ladder', () => {
    const retry: DataRetryPolicy = {
      maxAttempts: Number.MAX_SAFE_INTEGER,
      backoff: 'exponential',
      initialDelayMs: 0,
    };

    expect(isDataRetryPolicyWithinBudget(retry)).toBe(false);
    expect(() => resolveDataRetryPolicy(queryWithRetry(retry), 1)).toThrowError(
      expect.objectContaining({
        code: DATA_RETRY_RUNTIME_ERROR_CODES.policyBudgetExceeded,
      })
    );
  });

  it('keeps the ceiling projection closed-form for any authored attempt count', () => {
    for (const maxAttempts of [
      1,
      2,
      DATA_RETRY_POLICY_LIMITS.maxAttempts,
      Number.MAX_SAFE_INTEGER,
    ])
      expect(
        Number.isSafeInteger(
          projectedDataRetryCeilingMs({
            maxAttempts,
            backoff: 'exponential',
            initialDelayMs: 1,
          })
        )
      ).toBe(true);
  });
});
