import { describe, expect, it } from 'vitest';
import {
  createExecutionNetworkTrace,
  createExecutionJobController,
  createExecutionProviderDescriptor,
  createExecutionRequest,
  createExecutionSessionCoordinator,
  EXECUTION_NETWORK_TRACE_NAME,
  toExecutionNetworkTraceValue,
  type ExecutionSessionStatus,
} from '..';

const descriptor = createExecutionProviderDescriptor({
  id: 'session-conformance',
  version: '1',
  isolation: 'same-context',
  profiles: ['test'],
  runtimeZones: ['test'],
  invocationKinds: ['test'],
});

describe('execution session', () => {
  it('retains completed job history without replaying historical statuses', () => {
    let timestamp = 0;
    const controller = createExecutionJobController({
      jobId: 'completed-job',
      provider: descriptor,
      request: createExecutionRequest({
        requestId: 'completed-request',
        profile: 'test',
        runtimeZone: 'test',
        workspace: {
          workspaceId: 'workspace',
          snapshotId: 'snapshot',
        },
        invocation: {
          kind: 'test',
          targetRef: { kind: 'workspace', workspaceId: 'workspace' },
        },
      }),
      now: () => ++timestamp,
    });
    controller.markStarting();
    controller.markRunning();
    controller.succeed();

    const coordinator = createExecutionSessionCoordinator();
    const observedStatuses: ExecutionSessionStatus[] = [];
    coordinator.subscribe((_sessionId, snapshot) => {
      if (snapshot) observedStatuses.push(snapshot.status);
    });

    const snapshot = coordinator.activate({
      sessionId: 'completed-session',
      job: controller.job,
    });

    expect(observedStatuses).toEqual(
      Array.from({ length: 5 }, () => 'succeeded')
    );
    expect(snapshot.status).toBe('succeeded');
    expect(snapshot.events.map(({ event }) => event.kind)).toEqual([
      'state',
      'state',
      'state',
      'state',
    ]);
    expect(snapshot.updatedAt).toBe(controller.job.getSnapshot().completedAt);
    expect(snapshot.observations).toEqual([]);
  });

  it('retains bounded post-terminal trace observations without mutating the Job', () => {
    let timestamp = 100;
    const controller = createExecutionJobController({
      jobId: 'finite-preview-job',
      provider: descriptor,
      request: createExecutionRequest({
        requestId: 'finite-preview-request',
        profile: 'test',
        runtimeZone: 'test',
        workspace: {
          workspaceId: 'workspace',
          snapshotId: 'snapshot',
        },
        invocation: {
          kind: 'test',
          targetRef: { kind: 'workspace', workspaceId: 'workspace' },
        },
      }),
      now: () => ++timestamp,
    });
    controller.markStarting();
    controller.markRunning();
    controller.succeed();
    const terminalSequence = controller.job.getSnapshot().latestEventSequence;
    const coordinator = createExecutionSessionCoordinator({ maxEvents: 3 });
    coordinator.activate({
      sessionId: 'finite-preview',
      job: controller.job,
    });
    const createTrace = (requestId: string, completedAt: number) => ({
      traceId: `network:${controller.job.id}`,
      spanId: requestId,
      name: EXECUTION_NETWORK_TRACE_NAME,
      phase: 'event' as const,
      detail: toExecutionNetworkTraceValue(
        createExecutionNetworkTrace({
          requestId,
          phase: 'runtime',
          runtimeZone: 'server',
          mode: 'live',
          adapter: 'core.http',
          method: 'GET',
          sanitizedUrl: 'https://api.example.test/',
          protocol: 'https',
          startedAt: completedAt - 5,
          completedAt,
          outcome: 'allowed',
          status: 200,
        })
      ),
    });

    expect(
      coordinator.publishTrace({
        sessionId: 'finite-preview',
        jobId: controller.job.id,
        trace: createTrace('network-1', 200),
        observedAt: 200,
      })
    ).toMatchObject({ status: 'published' });
    expect(
      coordinator.publishTrace({
        sessionId: 'finite-preview',
        jobId: controller.job.id,
        trace: createTrace('network-2', 210),
        observedAt: 210,
      })
    ).toMatchObject({ status: 'published' });

    const snapshot = coordinator.getSnapshot('finite-preview');
    expect(snapshot?.events).toHaveLength(1);
    expect(snapshot?.observations).toHaveLength(2);
    expect(snapshot?.updatedAt).toBe(210);
    expect(controller.job.getSnapshot()).toMatchObject({
      status: 'succeeded',
      latestEventSequence: terminalSequence,
    });
    const canaryTrace = createTrace('network-secret', 220);
    expect(() =>
      coordinator.publishTrace({
        sessionId: 'finite-preview',
        jobId: controller.job.id,
        trace: {
          ...canaryTrace,
          detail: {
            ...(canaryTrace.detail as Record<string, never>),
            authorization: 'secret-canary-session-retention',
          },
        },
        observedAt: 220,
      })
    ).toThrow('Network observation is not canonical');
    expect(
      JSON.stringify(coordinator.getSnapshot('finite-preview'))
    ).not.toContain('secret-canary');
  });

  it('deduplicates exact observations and rejects drift or stale Job ownership', () => {
    const first = createExecutionJobController({
      jobId: 'preview-job-1',
      provider: descriptor,
      request: createExecutionRequest({
        requestId: 'preview-request-1',
        profile: 'test',
        runtimeZone: 'test',
        workspace: { workspaceId: 'workspace', snapshotId: 'snapshot-1' },
        invocation: {
          kind: 'test',
          targetRef: { kind: 'workspace', workspaceId: 'workspace' },
        },
      }),
    });
    const second = createExecutionJobController({
      jobId: 'preview-job-2',
      provider: descriptor,
      request: createExecutionRequest({
        requestId: 'preview-request-2',
        profile: 'test',
        runtimeZone: 'test',
        workspace: { workspaceId: 'workspace', snapshotId: 'snapshot-2' },
        invocation: {
          kind: 'test',
          targetRef: { kind: 'workspace', workspaceId: 'workspace' },
        },
      }),
    });
    const coordinator = createExecutionSessionCoordinator();
    coordinator.activate({ sessionId: 'preview', job: first.job });
    const trace = {
      traceId: 'network:preview-job-1',
      spanId: 'request-1',
      name: 'runtime.observation',
      phase: 'event' as const,
      detail: { redacted: true },
    };
    expect(
      coordinator.publishTrace({
        sessionId: 'preview',
        jobId: first.job.id,
        trace,
        observedAt: 1,
      })
    ).toMatchObject({ status: 'published' });
    expect(
      coordinator.publishTrace({
        sessionId: 'preview',
        jobId: first.job.id,
        trace,
        observedAt: 2,
      })
    ).toMatchObject({ status: 'duplicate' });
    expect(
      coordinator.publishTrace({
        sessionId: 'preview',
        jobId: first.job.id,
        trace: { ...trace, detail: { redacted: true, status: 201 } },
        observedAt: 3,
      })
    ).toEqual({ status: 'conflict' });
    expect(coordinator.getSnapshot('preview')?.observations).toHaveLength(1);

    coordinator.activate({ sessionId: 'preview', job: second.job });
    expect(
      coordinator.publishTrace({
        sessionId: 'preview',
        jobId: first.job.id,
        trace,
        observedAt: 4,
      })
    ).toEqual({ status: 'stale-job' });
  });
});
