import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRemoteExecutionClient } from './remoteExecutionClient';
import { InMemoryRemoteExecutionControlPlane } from './__tests__/inMemoryRemoteExecutionControlPlane';
import {
  createRemoteFixtureRequest,
  createRemoteFixtureSnapshot,
} from './__tests__/remoteExecutionFixtures';

const createHarness = () => {
  const controlPlane = new InMemoryRemoteExecutionControlPlane();
  const client = createRemoteExecutionClient({
    transport: controlPlane,
    retryPolicy: {
      maxAttempts: 3,
      initialDelayMs: 0,
      maxDelayMs: 0,
      jitterRatio: 0,
    },
    delay: async () => undefined,
    random: () => 0.5,
  });
  return { client, controlPlane };
};

describe('remote execution protocol state-machine properties', () => {
  it('creates one execution across bounded transport loss and arbitrary duplicate starts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 1, max: 12 }),
        async (transportFailures, duplicateCount) => {
          const { client, controlPlane } = createHarness();
          controlPlane.failTransportAttempts(transportFailures);
          const request = createRemoteFixtureRequest();
          const snapshot = createRemoteFixtureSnapshot();
          const executionIds: string[] = [];
          for (let index = 0; index < duplicateCount; index += 1) {
            const result = await client.create({
              request,
              snapshot: { kind: 'upload', snapshot },
            });
            executionIds.push(result.execution.executionId);
          }

          expect(new Set(executionIds).size).toBe(1);
          expect(controlPlane.createMutationCount).toBe(1);
        }
      ),
      { numRuns: 40 }
    );
  });

  it('keeps cursor replay contiguous for arbitrary confirmed cursors and read repetition', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 1, max: 16 }),
        async (afterCursor, repetitions) => {
          const { client } = createHarness();
          const created = await client.create({
            request: createRemoteFixtureRequest(),
            snapshot: {
              kind: 'upload',
              snapshot: createRemoteFixtureSnapshot(),
            },
          });
          for (let index = 0; index < repetitions; index += 1) {
            const page = await client.readEvents({
              executionId: created.execution.executionId,
              afterCursor,
            });
            expect(page.events.map((event) => event.cursor)).toEqual(
              Array.from(
                { length: 2 - afterCursor },
                (_, offset) => afterCursor + offset + 1
              )
            );
          }
        }
      ),
      { numRuns: 40 }
    );
  });

  it('preserves one monotonic terminal state across arbitrary get/read/cancel schedules', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('get', 'read', 'cancel'), {
          minLength: 1,
          maxLength: 32,
        }),
        async (operations) => {
          const { client, controlPlane } = createHarness();
          const created = await client.create({
            request: createRemoteFixtureRequest(),
            snapshot: {
              kind: 'upload',
              snapshot: createRemoteFixtureSnapshot(),
            },
          });
          let cancelled = false;
          for (const operation of operations) {
            if (operation === 'cancel') {
              await client.cancel({
                executionId: created.execution.executionId,
                cancellationId: 'property-cancel',
                reason: 'property schedule',
              });
              cancelled = true;
            } else if (operation === 'get') {
              const status = await client.get(created.execution.executionId);
              expect(status.status).toBe(cancelled ? 'cancelled' : 'running');
            } else {
              const page = await client.readEvents({
                executionId: created.execution.executionId,
                afterCursor: 0,
              });
              expect(
                page.events.every((event, index) => event.cursor === index + 1)
              ).toBe(true);
            }
          }
          const terminal = await client.get(created.execution.executionId);
          expect(terminal.status).toBe(cancelled ? 'cancelled' : 'running');
          expect(controlPlane.cancelMutationCount).toBe(cancelled ? 1 : 0);
        }
      ),
      { numRuns: 60 }
    );
  });
});
