import { describe, expect, it } from 'vitest';
import { digestVerificationValue } from './verificationCanonical';
import {
  createInMemoryVerificationEvidenceRepository,
  type VerificationEvidencePromotionAcquireInput,
} from './verificationEvidenceRepository';

const digest = (value: string): string => digestVerificationValue(value);

const acquireInput = (
  overrides: Partial<VerificationEvidencePromotionAcquireInput> = {}
): VerificationEvidencePromotionAcquireInput =>
  Object.freeze({
    idempotencyKey: 'idempotency:repository:1',
    candidateId: 'candidate:repository:1',
    candidateDigest: digest('candidate:repository:1'),
    promotionIntentDigest: digest('promotion-intent:repository:1'),
    workspaceId: 'workspace:repository:1',
    planDigest: digest('plan:repository:1'),
    cellId: 'cell:repository:1',
    attemptId: 'attempt:repository:1',
    deadline: '2026-07-28T01:00:00.000Z',
    ...overrides,
  });

describe('in-memory Verification Evidence repository identity', () => {
  it('replays only the exact identity bound to the original idempotency key', async () => {
    let allocations = 0;
    const repository = createInMemoryVerificationEvidenceRepository({
      now: () => '2026-07-28T00:00:00.000Z',
      allocatePromotionId: () => `promotion:repository:${++allocations}`,
      allocateEvidenceId: () => `evidence:repository:${allocations}`,
    });
    const input = acquireInput();

    const acquired = await repository.acquirePromotion(input);
    const replay = await repository.acquirePromotion(input);
    const drift = await repository.acquirePromotion(
      acquireInput({ planDigest: digest('plan:repository:drift') })
    );

    expect(acquired).toMatchObject({
      status: 'acquired',
      promotion: { promotionId: 'promotion:repository:1' },
    });
    expect(replay).toMatchObject({
      status: 'resumed',
      promotion: { promotionId: 'promotion:repository:1' },
    });
    expect(drift).toMatchObject({
      status: 'conflict',
      reasonCode: 'VER-5001',
    });
    expect(allocations).toBe(1);
  });

  it.each([
    [
      'idempotency key',
      {
        idempotencyKey: 'idempotency:repository:other',
      },
    ],
    [
      'candidate digest',
      {
        idempotencyKey: 'idempotency:repository:digest',
        candidateDigest: digest('candidate:repository:other'),
      },
    ],
    [
      'promotion payload',
      {
        idempotencyKey: 'idempotency:repository:payload',
        promotionIntentDigest: digest('promotion-intent:repository:other'),
      },
    ],
  ] as const)(
    'hard-conflicts when the same Workspace candidate id changes its %s',
    async (_label, overrides) => {
      let allocations = 0;
      const repository = createInMemoryVerificationEvidenceRepository({
        now: () => '2026-07-28T00:00:00.000Z',
        allocatePromotionId: () => `promotion:repository:${++allocations}`,
        allocateEvidenceId: () => `evidence:repository:${allocations}`,
      });
      const acquired = await repository.acquirePromotion(acquireInput());
      const conflict = await repository.acquirePromotion(
        acquireInput(overrides)
      );

      expect(acquired.status).toBe('acquired');
      expect(conflict).toMatchObject({
        status: 'conflict',
        reasonCode: 'VER-5001',
        message:
          'The candidate id is already bound to another promotion identity.',
      });
      expect(allocations).toBe(1);
    }
  );

  it('scopes candidate identity to its Workspace even when allocators return distinct ids', async () => {
    let allocations = 0;
    const repository = createInMemoryVerificationEvidenceRepository({
      now: () => '2026-07-28T00:00:00.000Z',
      allocatePromotionId: () => `promotion:repository:${++allocations}`,
      allocateEvidenceId: () => `evidence:repository:${allocations}`,
    });

    const first = await repository.acquirePromotion(acquireInput());
    const otherWorkspace = await repository.acquirePromotion(
      acquireInput({
        workspaceId: 'workspace:repository:2',
        idempotencyKey: 'idempotency:repository:2',
      })
    );

    expect(first.status).toBe('acquired');
    expect(otherWorkspace.status).toBe('acquired');
    expect(allocations).toBe(2);
  });
});
