import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  canReachExecutionJobStatus,
  createExecutionJobController,
  createExecutionProviderDescriptor,
  createExecutionRequest,
  getExecutionProviderCompatibility,
  type ExecutionJobEvent,
  type ExecutionProviderCapability,
} from '..';

const propertyParameters = Object.freeze({
  numRuns: 120,
  seed: 0x15_07_2026,
});

const createRequest = (
  requiredCapabilities: readonly ExecutionProviderCapability[] = []
) =>
  createExecutionRequest({
    requestId: 'request-1',
    profile: 'preview',
    runtimeZone: 'client',
    workspace: {
      workspaceId: 'workspace-1',
      snapshotId: 'snapshot-1',
    },
    invocation: {
      kind: 'workspace',
      targetRef: { kind: 'workspace', workspaceId: 'workspace-1' },
    },
    requiredCapabilities,
  });

describe('execution job properties', () => {
  it('allows summaries to skip legal intermediate states without permitting regression', () => {
    expect(canReachExecutionJobStatus('queued', 'succeeded')).toBe(true);
    expect(canReachExecutionJobStatus('starting', 'timed-out')).toBe(true);
    expect(canReachExecutionJobStatus('running', 'queued')).toBe(false);
    expect(canReachExecutionJobStatus('succeeded', 'running')).toBe(false);
  });

  it('keeps event replay ordered and settles once for arbitrary log streams', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string(), { maxLength: 40 }),
        fc.nat({ max: 80 }),
        async (messages, requestedCursor) => {
          let timestamp = 0;
          const descriptor = createExecutionProviderDescriptor({
            id: 'inline',
            version: '1',
            isolation: 'same-context',
            profiles: ['preview'],
            runtimeZones: ['client'],
            invocationKinds: ['workspace'],
            capabilities: ['streaming-logs'],
          });
          const controller = createExecutionJobController({
            jobId: 'job-1',
            request: createRequest(['streaming-logs']),
            provider: descriptor,
            now: () => ++timestamp,
          });

          controller.markStarting();
          controller.markRunning();
          messages.forEach((message) => {
            controller.emitLog({
              stream: 'stdout',
              level: 'info',
              message,
            });
          });
          const result = controller.succeed({ output: messages.length });

          const allEvents: ExecutionJobEvent[] = [];
          controller.job.subscribe((event) => allEvents.push(event));
          expect(allEvents.map((event) => event.sequence)).toEqual(
            Array.from({ length: allEvents.length }, (_, index) => index + 1)
          );

          const cursor = requestedCursor % (allEvents.length + 1);
          const replayed: ExecutionJobEvent[] = [];
          controller.job.subscribe((event) => replayed.push(event), {
            afterSequence: cursor,
          });
          expect(replayed).toEqual(
            allEvents.filter((event) => event.sequence > cursor)
          );
          await expect(controller.job.completion).resolves.toEqual(result);
          expect(controller.job.getSnapshot().status).toBe('succeeded');
        }
      ),
      propertyParameters
    );
  });

  it('makes cancellation idempotent while preserving a terminal result', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), async (reason) => {
        let cancellationRequests = 0;
        const descriptor = createExecutionProviderDescriptor({
          id: 'cancellable',
          version: '1',
          isolation: 'worker',
          profiles: ['preview'],
          runtimeZones: ['client'],
          invocationKinds: ['workspace'],
          capabilities: ['cancellation'],
        });
        const controller = createExecutionJobController({
          jobId: 'job-1',
          request: createRequest(),
          provider: descriptor,
          requestCancellation: async (): Promise<'accepted'> => {
            cancellationRequests += 1;
            await Promise.resolve();
            return 'accepted';
          },
        });
        controller.markRunning();

        const [first, second] = await Promise.all([
          controller.job.cancel({ reason }),
          controller.job.cancel({ reason }),
        ]);
        expect([first.status, second.status].sort()).toEqual([
          'accepted',
          'already-requested',
        ]);
        expect(cancellationRequests).toBe(1);

        controller.finishCancelled(reason);
        await expect(controller.job.completion).resolves.toMatchObject({
          status: 'cancelled',
          reason,
        });
        await expect(controller.job.cancel()).resolves.toEqual({
          status: 'already-terminal',
        });
      }),
      propertyParameters
    );
  });

  it('matches providers exactly against arbitrary capability subsets', () => {
    fc.assert(
      fc.property(
        fc.subarray([
          'streaming-logs',
          'diagnostics',
          'artifacts',
          'source-trace',
        ] as const),
        fc.subarray([
          'streaming-logs',
          'diagnostics',
          'artifacts',
          'source-trace',
        ] as const),
        (provided, required) => {
          const descriptor = createExecutionProviderDescriptor({
            id: 'provider',
            version: '1',
            isolation: 'remote-isolated',
            profiles: ['preview'],
            runtimeZones: ['client'],
            invocationKinds: ['workspace'],
            capabilities: provided,
          });
          const request = createRequest(required);
          const compatibility = getExecutionProviderCompatibility(
            descriptor,
            request
          );

          expect(compatibility.compatible).toBe(
            required.every((capability) => provided.includes(capability))
          );
        }
      ),
      propertyParameters
    );
  });
});
