import {
  createExecutionNetworkTrace,
  toExecutionNetworkTraceValue,
  type ExecutionSessionSnapshot,
} from '@prodivix/runtime-core';
import { describe, expect, it } from 'vitest';
import { createExecutionNetworkEntries } from './executionNetworkModel';

describe('execution Network model', () => {
  it('consumes only canonical sanitized trace details', () => {
    const detail = toExecutionNetworkTraceValue(
      createExecutionNetworkTrace({
        requestId: 'install-1',
        phase: 'dependency-install',
        runtimeZone: 'build',
        mode: 'live',
        adapter: 'remote-install-egress-proxy',
        method: 'CONNECT',
        sanitizedUrl: 'https://registry.npmjs.org/',
        protocol: 'https',
        startedAt: 100,
        completedAt: 125,
        outcome: 'allowed',
        status: 200,
        correlation: {
          kind: 'data-operation',
          documentId: 'data-products',
          operationId: 'list',
          invocationId: 'invocation-1',
          sequence: 1,
          attempt: 1,
        },
      })
    );
    const session: ExecutionSessionSnapshot = {
      sessionId: 'session-1',
      revision: 1,
      status: 'succeeded',
      events: [
        {
          sessionId: 'session-1',
          jobId: 'job-1',
          requestId: 'request-1',
          providerId: 'remote-build',
          workspaceId: 'workspace-1',
          snapshotId: 'snapshot-1',
          event: {
            jobId: 'job-1',
            sequence: 1,
            emittedAt: 125,
            kind: 'trace',
            trace: {
              traceId: 'network:job-1',
              spanId: 'install-1',
              name: 'network.request',
              phase: 'event',
              detail,
            },
          },
        },
        {
          sessionId: 'session-1',
          jobId: 'job-1',
          requestId: 'request-1',
          providerId: 'remote-build',
          workspaceId: 'workspace-1',
          snapshotId: 'snapshot-1',
          event: {
            jobId: 'job-1',
            sequence: 2,
            emittedAt: 126,
            kind: 'trace',
            trace: {
              traceId: 'network:job-1',
              spanId: 'private-1',
              name: 'network.request',
              phase: 'event',
              detail: {
                ...(detail as unknown as Record<string, never>),
                headers: { authorization: 'secret' },
              },
            },
          },
        },
      ],
    };

    const entries = createExecutionNetworkEntries(session);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      providerId: 'remote-build',
      snapshotId: 'snapshot-1',
      trace: {
        sanitizedUrl: 'https://registry.npmjs.org/',
        durationMs: 25,
        redacted: true,
        correlation: { operationId: 'list', invocationId: 'invocation-1' },
      },
    });
    expect(JSON.stringify(entries)).not.toContain('authorization');
  });
});
