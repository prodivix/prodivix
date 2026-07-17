import type { ExecutionSessionSnapshot } from '@prodivix/runtime-core';
import { describe, expect, it } from 'vitest';
import {
  createExecutionConsoleCopyText,
  createExecutionConsoleView,
} from './executionConsoleModel';

const session: ExecutionSessionSnapshot = {
  sessionId: 'preview-session',
  revision: 3,
  status: 'failed',
  activeJob: {
    jobId: 'job-1',
    requestId: 'request-1',
    providerId: 'provider-1',
    providerVersion: '1',
    profile: 'preview',
    runtimeZone: 'client',
    invocationKind: 'workspace',
    capabilities: ['console'],
    workspace: { workspaceId: 'workspace-1', snapshotId: 'snapshot-1' },
  },
  events: [
    {
      sessionId: 'preview-session',
      jobId: 'job-1',
      requestId: 'request-1',
      providerId: 'provider-1',
      workspaceId: 'workspace-1',
      snapshotId: 'snapshot-1',
      event: {
        kind: 'state',
        jobId: 'job-1',
        sequence: 1,
        emittedAt: 10,
        snapshot: {
          jobId: 'job-1',
          requestId: 'request-1',
          providerId: 'provider-1',
          status: 'failed',
          latestEventSequence: 1,
          createdAt: 1,
          completedAt: 10,
        },
        reason: 'runtime failed',
      },
    },
  ],
  observations: [],
  consoleObservations: [
    {
      sessionId: 'preview-session',
      jobId: 'job-1',
      requestId: 'request-1',
      providerId: 'provider-1',
      workspaceId: 'workspace-1',
      snapshotId: 'snapshot-1',
      observationId: 'frame-1:1',
      sequence: 1,
      observedAt: 8,
      log: {
        stream: 'console',
        level: 'info',
        category: 'application',
        message: 'created item',
        arguments: ['created item', { id: 'item-1' }],
        redacted: true,
      },
    },
  ],
};

describe('execution Console model', () => {
  it('filters structured application and system records without parsing raw text', () => {
    const application = createExecutionConsoleView({
      session,
      filter: 'application',
    });
    expect(application.lines).toHaveLength(1);
    expect(application.lines[0]).toMatchObject({
      category: 'application',
      message: 'created item',
      detail: '[{"id":"item-1"}]',
      redacted: true,
    });

    const errors = createExecutionConsoleView({ session, filter: 'errors' });
    expect(errors.lines).toHaveLength(1);
    expect(errors.lines[0]).toMatchObject({
      category: 'lifecycle',
      level: 'error',
      message: 'runtime failed',
    });
  });

  it('creates copy-safe text only from bounded projected records', () => {
    const view = createExecutionConsoleView({ session });
    const copied = createExecutionConsoleCopyText(view.lines);

    expect(copied).toContain(
      'INFO application/console [redacted] created item'
    );
    expect(copied).toContain('ERROR lifecycle/failed runtime failed');
    expect(copied).not.toContain('providerVersion');
  });

  it('redacts forged credentials again at the copy boundary', () => {
    const copied = createExecutionConsoleCopyText([
      {
        id: 'forged',
        category: 'application',
        level: 'info',
        label: 'console',
        message: 'Bearer copy-boundary-token',
        detail: 'https://user:password@example.test/?api_key=query-secret',
        redacted: false,
        truncated: false,
      },
    ]);

    expect(copied).toContain('[REDACTED]');
    expect(copied).not.toContain('copy-boundary-token');
    expect(copied).not.toContain('user:password');
    expect(copied).not.toContain('query-secret');
  });
});
