import { describe, expect, it } from 'vitest';
import {
  createExecutionNetworkTrace,
  EXECUTION_NETWORK_TRACE_NAME,
  readExecutionNetworkTraceValue,
  toExecutionNetworkTraceValue,
} from '../executionNetworkTrace';

describe('execution Network trace', () => {
  it('publishes metadata-only sanitized request facts', () => {
    const trace = createExecutionNetworkTrace({
      requestId: 'install-1',
      phase: 'dependency-install',
      runtimeZone: 'build',
      mode: 'live',
      adapter: 'remote-install-egress-proxy',
      method: 'connect',
      sanitizedUrl: 'https://registry.npmjs.org/',
      protocol: 'https',
      startedAt: 100,
      completedAt: 125,
      outcome: 'allowed',
      status: 200,
      requestBytes: 12,
      responseBytes: 24,
      correlation: {
        kind: 'data-operation',
        documentId: 'data-products',
        operationId: 'list',
        invocationId: 'invocation-1',
        sequence: 2,
        attempt: 1,
      },
    });

    expect(EXECUTION_NETWORK_TRACE_NAME).toBe('network.request');
    expect(trace).toMatchObject({
      method: 'CONNECT',
      durationMs: 25,
      redacted: true,
      correlation: { operationId: 'list', invocationId: 'invocation-1' },
    });
    expect(toExecutionNetworkTraceValue(trace)).not.toHaveProperty('headers');
    expect(
      readExecutionNetworkTraceValue(toExecutionNetworkTraceValue(trace))
    ).toEqual(trace);
  });

  it('rejects credentials, paths, queries, and fragments', () => {
    for (const sanitizedUrl of [
      'https://token@registry.npmjs.org/',
      'https://registry.npmjs.org/package',
      'https://registry.npmjs.org/?token=secret',
      'https://registry.npmjs.org/#secret',
    ]) {
      expect(() =>
        createExecutionNetworkTrace({
          requestId: 'install-1',
          phase: 'dependency-install',
          runtimeZone: 'build',
          mode: 'live',
          adapter: 'proxy',
          method: 'GET',
          sanitizedUrl,
          protocol: 'https',
          startedAt: 1,
          completedAt: 2,
          outcome: 'allowed',
        })
      ).toThrow(/sanitizedUrl/u);
    }
  });

  it('fails closed on transport field injection or duration drift', () => {
    const value = toExecutionNetworkTraceValue(
      createExecutionNetworkTrace({
        requestId: 'install-1',
        phase: 'dependency-install',
        runtimeZone: 'build',
        mode: 'live',
        adapter: 'proxy',
        method: 'CONNECT',
        sanitizedUrl: 'https://registry.npmjs.org/',
        protocol: 'https',
        startedAt: 1,
        completedAt: 2,
        outcome: 'allowed',
      })
    ) as Record<string, unknown>;
    expect(
      readExecutionNetworkTraceValue({ ...value, durationMs: 99 })
    ).toBeUndefined();
    expect(
      readExecutionNetworkTraceValue({
        ...value,
        headers: { authorization: 'secret' },
      })
    ).toBeUndefined();
  });
});
