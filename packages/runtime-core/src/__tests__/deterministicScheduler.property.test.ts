import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createDeterministicScheduler } from '../deterministicScheduler';

describe('deterministic scheduler properties', () => {
  it('orders arbitrary tasks by time, lane, and stable submission sequence', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(
          fc.record({
            id: fc.stringMatching(/^[a-z][a-z0-9]{0,8}$/),
            lane: fc.constantFrom('animation', 'data', 'route', 'scenario'),
            readyAt: fc.integer({ min: 0, max: 50 }),
          }),
          {
            minLength: 1,
            maxLength: 40,
            selector: ({ id }) => id,
          }
        ),
        async (tasks) => {
          const run = async (insertion: typeof tasks) => {
            const order: string[] = [];
            const scheduler = createDeterministicScheduler({
              maximumTurns: 100,
              maximumTasks: 100,
            });
            insertion.forEach((task) =>
              scheduler.enqueue({
                ...task,
                run: () => {
                  order.push(task.id);
                },
              })
            );
            await scheduler.runUntilIdle();
            return order;
          };
          const first = await run(tasks);
          const second = await run([...tasks].reverse());
          const expected = [...tasks]
            .map((task, sequence) => ({ ...task, sequence }))
            .sort(
              (left, right) =>
                left.readyAt - right.readyAt ||
                (left.lane < right.lane
                  ? -1
                  : left.lane > right.lane
                    ? 1
                    : 0) ||
                left.sequence - right.sequence
            )
            .map(({ id }) => id);
          expect(first).toEqual(expected);
          expect(new Set(first)).toEqual(new Set(second));
        }
      ),
      { numRuns: 100 }
    );
  });
});
