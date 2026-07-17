import { describe, expect, it } from 'vitest';
import {
  createExecutionConsoleSnapshot,
  createExecutionJobController,
  createExecutionProviderDescriptor,
  createExecutionRequest,
  createExecutionSessionCoordinator,
  readExecutionConsoleBridgeMessage,
} from '..';

const descriptor = createExecutionProviderDescriptor({
  id: 'console-provider',
  version: '1',
  isolation: 'same-context',
  profiles: ['preview'],
  runtimeZones: ['client'],
  invocationKinds: ['workspace'],
  capabilities: ['console'],
});

const createController = (jobId: string) =>
  createExecutionJobController({
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
  });

describe('execution Console', () => {
  it('strictly decodes bounded application and runtime bridge records', () => {
    const decoded = readExecutionConsoleBridgeMessage({
      type: 'prodivix.execution-console-bridge.v1',
      messageId: 'frame-1:1',
      log: {
        level: 'error',
        category: 'runtime',
        message: 'Unhandled rejection',
        arguments: [{ reason: 'network unavailable' }],
        redacted: false,
        truncated: false,
      },
    });

    expect(decoded).toMatchObject({
      messageId: 'frame-1:1',
      log: {
        stream: 'console',
        level: 'error',
        category: 'runtime',
        message: 'Unhandled rejection',
      },
    });
    expect(Object.isFrozen(decoded?.log.arguments)).toBe(true);

    const forgedCredentialLog = readExecutionConsoleBridgeMessage({
      type: 'prodivix.execution-console-bridge.v1',
      messageId: 'frame-1:credential',
      log: {
        level: 'info',
        category: 'application',
        message: 'Authorization: Bearer forged-token-value',
        arguments: [
          {
            password: 'hunter2',
            nested: { accessToken: 'nested-token-value' },
            url: 'https://admin:password@example.test/items?access_token=query-token-value',
          },
          'payload={"password":"json-string-secret"}',
          'Cookie: first=cookie-one; second=cookie-two',
        ],
        redacted: false,
        truncated: false,
      },
    });
    const safeCredentialLog = JSON.stringify(forgedCredentialLog);
    expect(forgedCredentialLog?.log.redacted).toBe(true);
    expect(safeCredentialLog).toContain('[REDACTED]');
    expect(safeCredentialLog).not.toContain('forged-token-value');
    expect(safeCredentialLog).not.toContain('hunter2');
    expect(safeCredentialLog).not.toContain('nested-token-value');
    expect(safeCredentialLog).not.toContain('query-token-value');
    expect(safeCredentialLog).not.toContain('admin:password');
    expect(safeCredentialLog).not.toContain('json-string-secret');
    expect(safeCredentialLog).not.toContain('cookie-one');
    expect(safeCredentialLog).not.toContain('cookie-two');

    expect(
      readExecutionConsoleBridgeMessage({
        type: 'prodivix.execution-console-bridge.v1',
        messageId: 'frame-1:2',
        log: {
          level: 'info',
          category: 'application',
          message: 'safe',
          arguments: [],
          redacted: false,
          truncated: false,
          authorization: 'not-allowed',
        },
      })
    ).toBeUndefined();
    expect(
      readExecutionConsoleBridgeMessage({
        type: 'prodivix.execution-console-bridge.v1',
        messageId: 'frame-1:3',
        log: {
          level: 'info',
          category: 'application',
          message: 'x'.repeat(9 * 1024),
          arguments: [],
          redacted: false,
          truncated: false,
        },
      })
    ).toBeUndefined();
  });

  it('retains exact-frame Console observations after a finite Job and rejects replay drift', async () => {
    const controller = createController('finite-console-job');
    const coordinator = createExecutionSessionCoordinator({ maxEvents: 8 });
    coordinator.activate({ sessionId: 'preview-console', job: controller.job });
    controller.markStarting();
    controller.markRunning();
    controller.emitLog({
      stream: 'stdout',
      level: 'info',
      category: 'process',
      message: 'server ready',
    });
    controller.succeed();
    await controller.job.completion;
    await Promise.resolve();

    const applicationLog = {
      stream: 'console' as const,
      level: 'info' as const,
      category: 'application' as const,
      message: 'saved',
      arguments: [{ id: 'item-1' }],
    };
    expect(
      coordinator.publishConsole({
        sessionId: 'preview-console',
        jobId: controller.job.id,
        observationId: 'frame-1:1',
        observedAt: 100,
        log: applicationLog,
      })
    ).toMatchObject({ status: 'published' });
    expect(
      coordinator.publishConsole({
        sessionId: 'preview-console',
        jobId: controller.job.id,
        observationId: 'frame-1:1',
        observedAt: 101,
        log: applicationLog,
      })
    ).toMatchObject({ status: 'duplicate' });
    expect(
      coordinator.publishConsole({
        sessionId: 'preview-console',
        jobId: controller.job.id,
        observationId: 'frame-1:1',
        observedAt: 102,
        log: { ...applicationLog, message: 'drifted' },
      })
    ).toEqual({ status: 'conflict' });

    const session = coordinator.getSnapshot('preview-console');
    expect(session?.terminal).toMatchObject({
      jobId: controller.job.id,
      status: 'succeeded',
    });
    expect(session?.consoleObservations).toHaveLength(1);
    const consoleSnapshot = createExecutionConsoleSnapshot({
      session: session!,
    });
    expect(
      consoleSnapshot.records.map(({ category, message }) => ({
        category,
        message,
      }))
    ).toEqual(
      expect.arrayContaining([
        { category: 'process', message: 'server ready' },
        { category: 'application', message: 'saved' },
      ])
    );
    expect(controller.job.getSnapshot().status).toBe('succeeded');
  });

  it('applies independent record and byte retention budgets', () => {
    const controller = createController('bounded-console-job');
    const coordinator = createExecutionSessionCoordinator();
    coordinator.activate({ sessionId: 'bounded-console', job: controller.job });
    for (let index = 0; index < 6; index += 1) {
      controller.emitLog({
        stream: 'console',
        level: 'info',
        message: `record-${index}`,
        data: { payload: 'x'.repeat(256) },
      });
    }
    const projection = createExecutionConsoleSnapshot({
      session: coordinator.getSnapshot('bounded-console')!,
      maximumRecords: 2,
      maximumRetainedBytes: 4 * 1024,
    });

    expect(projection.records).toHaveLength(2);
    expect(projection.records.map(({ message }) => message)).toEqual([
      'record-4',
      'record-5',
    ]);
    expect(projection.droppedRecords).toBeGreaterThan(0);
    expect(projection.truncated).toBe(true);
  });
});
