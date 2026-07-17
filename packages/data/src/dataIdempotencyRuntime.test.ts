import { describe, expect, it } from 'vitest';
import {
  createDataOperationIdempotencyKey,
  createDataOperationInvocation,
  DATA_IDEMPOTENCY_KEY_PREFIX,
} from './index';

const invocation = (attempt: number) =>
  createDataOperationInvocation({
    invocationId: 'mutation-550e8400-e29b-41d4-a716-446655440000',
    sequence: 7,
    attempt,
    startedAt: 100,
    operation: { documentId: 'catalog', operationId: 'create' },
    documentRevision: '12.4',
    runtimeZone: 'client',
    mode: 'live',
    activation: 'event',
    input: { token: 'never-hash-author-input' },
  });

describe('Data operation idempotency key', () => {
  it('is opaque and stable across attempts while remaining identity-bound', () => {
    const first = createDataOperationIdempotencyKey(invocation(1));
    const retry = createDataOperationIdempotencyKey(invocation(2));
    const drifted = createDataOperationIdempotencyKey(
      createDataOperationInvocation({
        ...invocation(1),
        sequence: 8,
      })
    );
    const inputDrifted = createDataOperationIdempotencyKey(
      createDataOperationInvocation({
        ...invocation(1),
        input: { token: 'different-author-input' },
      })
    );

    expect(first).toBe(retry);
    expect(first).not.toBe(drifted);
    expect(first).not.toBe(inputDrifted);
    expect(first).toMatch(
      new RegExp(`^${DATA_IDEMPOTENCY_KEY_PREFIX}[0-9a-f]{64}$`, 'u')
    );
    expect(first).not.toContain('catalog');
    expect(first).not.toContain('never-hash-author-input');
  });
});
