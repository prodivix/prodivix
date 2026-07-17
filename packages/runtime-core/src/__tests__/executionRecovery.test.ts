import { describe, expect, it } from 'vitest';
import {
  createExecutionJobController,
  createExecutionProviderDescriptor,
  createExecutionRequest,
  createExecutionSessionCoordinator,
  createExecutionSessionRecoveryPlan,
} from '..';

const descriptor = createExecutionProviderDescriptor({
  id: 'recovery-provider',
  version: '1',
  isolation: 'same-context',
  profiles: ['preview'],
  runtimeZones: ['client'],
  invocationKinds: ['workspace'],
  capabilities: ['cancellation'],
});

const createController = (jobId: string) => {
  let controller: ReturnType<typeof createExecutionJobController>;
  controller = createExecutionJobController({
    jobId,
    provider: descriptor,
    request: createExecutionRequest({
      requestId: `${jobId}-request`,
      profile: 'preview',
      runtimeZone: 'client',
      workspace: { workspaceId: 'workspace', snapshotId: 'snapshot' },
      invocation: {
        kind: 'workspace',
        targetRef: { kind: 'workspace', workspaceId: 'workspace' },
      },
    }),
    requestCancellation: () => 'accepted',
  });
  return controller;
};

describe('execution recovery', () => {
  it('requires a new request and never authorizes automatic mutation replay', async () => {
    const controller = createController('failed-job');
    const coordinator = createExecutionSessionCoordinator();
    coordinator.activate({ sessionId: 'preview', job: controller.job });
    controller.markStarting();
    controller.fail({
      code: 'CONFIGURATION_INVALID',
      message: 'Configuration must change.',
      retryable: false,
    });
    await controller.job.completion;
    await Promise.resolve();

    expect(
      createExecutionSessionRecoveryPlan(coordinator.getSnapshot('preview'))
    ).toEqual({
      status: 'restart',
      reason: 'failed',
      previousJobId: 'failed-job',
      previousRequestId: 'failed-job-request',
      providerId: 'recovery-provider',
      workspaceId: 'workspace',
      snapshotId: 'snapshot',
      requestStrategy: 'new-request',
      automatic: false,
      preserveEvents: true,
      replayMutations: false,
      requiresChange: true,
      failureCode: 'CONFIGURATION_INVALID',
    });
  });

  it('waits for cancellation acknowledgement before exposing recovery', async () => {
    const controller = createController('cancelled-job');
    const coordinator = createExecutionSessionCoordinator();
    coordinator.activate({ sessionId: 'preview', job: controller.job });
    controller.markStarting();
    controller.markRunning();

    await controller.job.cancel({ reason: 'User stopped the run.' });
    expect(
      createExecutionSessionRecoveryPlan(coordinator.getSnapshot('preview'))
    ).toMatchObject({
      status: 'waiting',
      reason: 'cancellation-pending',
      jobId: 'cancelled-job',
    });

    controller.finishCancelled('User stopped the run.');
    await controller.job.completion;
    await Promise.resolve();
    expect(
      createExecutionSessionRecoveryPlan(coordinator.getSnapshot('preview'))
    ).toMatchObject({
      status: 'restart',
      reason: 'cancelled',
      requestStrategy: 'new-request',
      replayMutations: false,
    });
  });
});
