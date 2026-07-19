import { describe, expect, it } from 'vitest';
import {
  createExecutionRequest,
  type ExecutionJobEvent,
} from '@prodivix/runtime-core';
import {
  createNodeGraphExecutionProvider,
  readNodeGraphExecutionJobOutput,
} from '..';
import type { NodeGraphDocument } from '..';

const graph: NodeGraphDocument = {
  version: 1,
  nodes: [
    { id: 'start', data: { kind: 'start' } },
    {
      id: 'switch',
      data: {
        kind: 'switch',
        cases: [{ id: 'selected', label: 'selected' }],
      },
    },
    { id: 'process', data: { kind: 'process' } },
    { id: 'log-first', data: { kind: 'log', value: 'first' } },
    { id: 'log-second', data: { kind: 'log', value: 'second' } },
    { id: 'end', data: { kind: 'end' } },
  ],
  edges: [
    {
      id: 'edge-start-first',
      source: 'start',
      target: 'switch',
      sourceHandle: 'out.control.next',
      targetHandle: 'in.control.prev',
    },
    {
      id: 'edge-switch-process',
      source: 'switch',
      target: 'process',
      sourceHandle: 'out.control.default',
      targetHandle: 'in.control.prev',
    },
    {
      id: 'edge-process-first',
      source: 'process',
      target: 'log-first',
      sourceHandle: 'out.control.next',
      targetHandle: 'in.control.prev',
    },
    {
      id: 'edge-first-second',
      source: 'log-first',
      target: 'log-second',
      sourceHandle: 'out.control.next',
      targetHandle: 'in.control.prev',
    },
    {
      id: 'edge-second-end',
      source: 'log-second',
      target: 'end',
      sourceHandle: 'out.control.next',
      targetHandle: 'in.control.prev',
    },
  ],
};

const executionRequest = (requestId: string, timeoutMs?: number) =>
  createExecutionRequest({
    requestId,
    profile: 'preview',
    runtimeZone: 'client',
    workspace: {
      workspaceId: 'workspace',
      snapshotId: `snapshot:${requestId}`,
    },
    invocation: {
      kind: 'nodegraph',
      targetRef: {
        kind: 'document',
        workspaceId: 'workspace',
        documentId: 'graph-document',
      },
    },
    requiredCapabilities: [
      'cancellation',
      'diagnostics',
      'source-trace',
      'streaming-logs',
      ...(timeoutMs === undefined ? [] : (['timeout'] as const)),
    ],
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });

describe('NodeGraph ExecutionProvider conformance', () => {
  it('maps domain trace, logs and completion into one canonical job', async () => {
    const provider = createNodeGraphExecutionProvider({
      resolveDocument: () => graph,
      createJobId: () => 'nodegraph-job',
    });
    const request = createExecutionRequest({
      requestId: 'nodegraph-request',
      profile: 'preview',
      runtimeZone: 'client',
      workspace: {
        workspaceId: 'workspace',
        snapshotId: 'snapshot',
      },
      invocation: {
        kind: 'nodegraph',
        targetRef: {
          kind: 'document',
          workspaceId: 'workspace',
          documentId: 'graph-document',
        },
      },
      requiredCapabilities: [
        'cancellation',
        'diagnostics',
        'source-trace',
        'streaming-logs',
      ],
    });

    const job = await provider.start(request);
    const events: ExecutionJobEvent[] = [];
    job.subscribe((event) => events.push(event));
    const result = await job.completion;

    expect(events.filter((event) => event.kind === 'log')).toMatchObject([
      { log: { stream: 'console', message: 'first' } },
      { log: { stream: 'console', message: 'second' } },
    ]);
    expect(
      events
        .filter((event) => event.kind === 'trace')
        .some((event) =>
          event.trace.sourceTrace?.some(
            (trace) =>
              trace.sourceRef.kind === 'nodegraph-node' &&
              trace.sourceRef.nodeId === 'log-first'
          )
        )
    ).toBe(true);
    expect(result.status).toBe('succeeded');
    expect(readNodeGraphExecutionJobOutput(result)).toEqual({
      status: 'completed',
      steps: 6,
      statePatch: {},
      output: 'second',
    });
  });

  it('settles a cooperative cancellation while document resolution is pending', async () => {
    let enterResolution: () => void = () => undefined;
    let releaseResolution: () => void = () => undefined;
    const resolutionEntered = new Promise<void>((resolve) => {
      enterResolution = resolve;
    });
    const resolutionGate = new Promise<void>((resolve) => {
      releaseResolution = resolve;
    });
    const provider = createNodeGraphExecutionProvider({
      resolveDocument: async () => {
        enterResolution();
        await resolutionGate;
        return graph;
      },
      createJobId: () => 'cancelled-nodegraph-job',
    });
    const request = createExecutionRequest({
      requestId: 'cancelled-nodegraph-request',
      profile: 'preview',
      runtimeZone: 'client',
      workspace: {
        workspaceId: 'workspace',
        snapshotId: 'snapshot',
      },
      invocation: {
        kind: 'nodegraph',
        targetRef: {
          kind: 'document',
          workspaceId: 'workspace',
          documentId: 'graph-document',
        },
      },
      requiredCapabilities: ['cancellation'],
    });

    const job = await provider.start(request);
    await resolutionEntered;
    expect(await job.cancel({ reason: 'cancelled by conformance' })).toEqual({
      status: 'accepted',
    });
    releaseResolution();

    await expect(job.completion).resolves.toMatchObject({
      status: 'cancelled',
      reason: 'cancelled by conformance',
    });
  });

  it('maps an unavailable executor to a stable node diagnostic', async () => {
    const provider = createNodeGraphExecutionProvider({
      resolveDocument: () => ({
        version: 1,
        nodes: [{ id: 'unknown', data: { kind: 'not-registered' } }],
        edges: [],
      }),
      createJobId: () => 'unsupported-nodegraph-job',
    });
    const job = await provider.start(executionRequest('unsupported-node'));
    const events: ExecutionJobEvent[] = [];
    job.subscribe((event) => events.push(event));

    await expect(job.completion).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'NODEGRAPH_UNSUPPORTED_NODE' },
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: 'diagnostic',
        diagnostic: expect.objectContaining({
          code: 'NGR-1001',
          targetRef: {
            kind: 'nodegraph-node',
            documentId: 'graph-document',
            nodeId: 'unknown',
          },
        }),
      })
    );
  });

  it('timeout is terminal and does not leak into an independent job', async () => {
    let releaseTimedDocument: () => void = () => undefined;
    const timedDocument = new Promise<NodeGraphDocument>((resolve) => {
      releaseTimedDocument = () => resolve(graph);
    });
    let fireTimeout: () => void = () => undefined;
    const provider = createNodeGraphExecutionProvider({
      resolveDocument: (request) =>
        request.requestId === 'timed-job' ? timedDocument : graph,
      scheduleTimeout: (callback) => {
        fireTimeout = callback;
        return () => undefined;
      },
    });
    const timedJob = await provider.start(executionRequest('timed-job', 25));
    const independentJob = await provider.start(
      executionRequest('independent-job')
    );

    fireTimeout();
    releaseTimedDocument();

    await expect(timedJob.completion).resolves.toMatchObject({
      status: 'timed-out',
      timeoutMs: 25,
    });
    await expect(independentJob.completion).resolves.toMatchObject({
      status: 'succeeded',
    });
  });

  it('cancelling one provider instance does not affect another instance', async () => {
    let releaseFirst: () => void = () => undefined;
    const firstDocument = new Promise<NodeGraphDocument>((resolve) => {
      releaseFirst = () => resolve(graph);
    });
    const firstProvider = createNodeGraphExecutionProvider({
      resolveDocument: () => firstDocument,
      createJobId: () => 'isolated-first-job',
    });
    const secondProvider = createNodeGraphExecutionProvider({
      resolveDocument: () => graph,
      createJobId: () => 'isolated-second-job',
    });
    const firstJob = await firstProvider.start(executionRequest('first'));
    const secondJob = await secondProvider.start(executionRequest('second'));

    await firstJob.cancel({ reason: 'stop only first instance' });
    releaseFirst();

    await expect(firstJob.completion).resolves.toMatchObject({
      status: 'cancelled',
    });
    await expect(secondJob.completion).resolves.toMatchObject({
      status: 'succeeded',
    });
  });
});
