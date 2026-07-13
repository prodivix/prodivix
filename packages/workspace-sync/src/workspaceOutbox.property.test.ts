import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  codeCommand,
  createWorkspace,
} from './__tests__/workspaceOperationCommit.fixture';
import {
  canAcknowledgeWorkspaceOutboxEntry,
  claimWorkspaceOutboxEntry,
  computeWorkspaceOutboxRetryDelay,
  createMemoryWorkspaceOutboxStore,
  createWorkspaceOutboxEntry,
  retryWorkspaceOutboxEntry,
  selectWorkspaceOutboxClaimCandidate,
  type WorkspaceOutboxEntry,
} from './workspaceOutbox';

const propertyParameters = Object.freeze({
  numRuns: 500,
  seed: 0x0_07_2026,
});

const createEntry = (
  id = 'operation-1',
  createdAt = 0
): WorkspaceOutboxEntry => {
  const workspace = createWorkspace();
  const created = createWorkspaceOutboxEntry({
    baseSnapshot: workspace,
    operation: {
      kind: 'command',
      command: codeCommand(
        id,
        'export const value = 1;',
        `export const value = ${createdAt + 2};`
      ),
    },
    now: createdAt,
  });
  if (!created.ok) throw new Error(created.issues[0]?.message);
  return created.entry;
};

describe('workspace outbox properties', () => {
  it('preserves operation identity and exact request across arbitrary retries', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            elapsed: fc.nat({ max: 120_000 }),
            entropy: fc.double({ min: 0, max: 1, noNaN: true }),
          }),
          { maxLength: 40 }
        ),
        (retries) => {
          let entry = createEntry();
          const request = entry.request;
          const operation = entry.operation;
          let now = entry.createdAt;

          for (const retry of retries) {
            now = Math.max(now, entry.updatedAt) + retry.elapsed;
            if (entry.state.kind === 'retry-wait') {
              now = Math.max(now, entry.state.nextAttemptAt);
            }
            const claimed = claimWorkspaceOutboxEntry(entry, {
              leaseOwnerId: 'tab-a',
              now,
              leaseDurationMs: 30_000,
            });
            expect(claimed).not.toBeNull();
            if (!claimed) return;
            const scheduled = retryWorkspaceOutboxEntry(claimed, {
              leaseOwnerId: 'tab-a',
              now,
              entropy: retry.entropy,
              failure: {
                code: 'NETWORK_ERROR',
                message: 'offline',
                retryable: true,
              },
            });
            expect(scheduled).not.toBeNull();
            if (!scheduled) return;
            entry = scheduled;
          }

          expect(entry.id).toBe('operation-1');
          expect(entry.request).toEqual(request);
          expect(entry.operation).toEqual(operation);
          expect(entry.attemptCount).toBe(retries.length);
        }
      ),
      propertyParameters
    );
  });

  it('never lets a later operation cross a non-claimable causal head', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat({ max: 10_000 }), {
          minLength: 2,
          maxLength: 30,
        }),
        fc.nat({ max: 10_000 }),
        (timestamps, now) => {
          const entries = timestamps.map((timestamp, index) =>
            createEntry(`operation-${index}`, timestamp)
          );
          const ordered = [...entries].sort(
            (left, right) =>
              left.createdAt - right.createdAt ||
              left.causalOrderId.localeCompare(right.causalOrderId) ||
              left.id.localeCompare(right.id)
          );
          const head = ordered[0]!;
          const blockedHead: WorkspaceOutboxEntry = {
            ...head,
            state: {
              kind: 'retry-wait',
              nextAttemptAt: now + 1,
              failure: {
                code: 'NETWORK_ERROR',
                message: 'offline',
                retryable: true,
              },
            },
          };
          const candidate = selectWorkspaceOutboxClaimCandidate(
            entries.map((entry) =>
              entry.id === head.id ? blockedHead : entry
            ),
            head.workspaceId,
            now
          );
          expect(candidate).toBeNull();
        }
      ),
      propertyParameters
    );
  });

  it('keeps a fresh recovery operation at the original causal head', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: 10_000 }),
        fc.boolean(),
        async (createdAt, sameTimestamp) => {
          const head = createEntry('operation-head', createdAt);
          const follower = createEntry(
            'operation-tail',
            sameTimestamp ? createdAt : createdAt + 1
          );
          const store = createMemoryWorkspaceOutboxStore([head, follower]);
          const claimed = await store.claim({
            entryId: head.id,
            leaseOwnerId: 'tab-a',
            now: createdAt,
            leaseDurationMs: 30_000,
          });
          expect(claimed).not.toBeNull();
          if (!claimed) return;
          const replacement = createEntry('zz-resolution', createdAt + 60_000);
          expect(await store.replace(claimed.id, replacement, 'tab-a')).toBe(
            true
          );

          const reclaimedAfterRestart = await store.claimNext({
            workspaceId: head.workspaceId,
            leaseOwnerId: 'tab-b',
            now: createdAt + 60_000,
            leaseDurationMs: 30_000,
          });
          expect(reclaimedAfterRestart?.id).toBe(replacement.id);
          expect(reclaimedAfterRestart?.causalOrderId).toBe(head.id);
          expect(reclaimedAfterRestart?.createdAt).toBe(head.createdAt);
        }
      ),
      propertyParameters
    );
  });

  it('bounds retry delays and accepts ACK only from the current lease and operation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        (attempt, entropy) => {
          const delay = computeWorkspaceOutboxRetryDelay(attempt, entropy);
          expect(delay).toBeGreaterThanOrEqual(0);
          expect(delay).toBeLessThanOrEqual(60_000);
          const claimed = claimWorkspaceOutboxEntry(createEntry(), {
            leaseOwnerId: 'tab-a',
            now: 0,
            leaseDurationMs: 30_000,
          });
          expect(claimed).not.toBeNull();
          if (!claimed) return;
          expect(
            canAcknowledgeWorkspaceOutboxEntry(claimed, {
              leaseOwnerId: 'tab-a',
              acceptedOperationId: claimed.id,
            })
          ).toBe(true);
          expect(
            canAcknowledgeWorkspaceOutboxEntry(claimed, {
              leaseOwnerId: 'tab-b',
              acceptedOperationId: claimed.id,
            })
          ).toBe(false);
          expect(
            canAcknowledgeWorkspaceOutboxEntry(claimed, {
              leaseOwnerId: 'tab-a',
              acceptedOperationId: `${claimed.id}-other`,
            })
          ).toBe(false);
        }
      ),
      propertyParameters
    );
  });
});
