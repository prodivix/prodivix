import { describe, expect, it } from 'vitest';
import {
  compileNodeGraphProgram,
  createNodeGraphDebugController,
  createNodeGraphDescriptorRegistry,
  type NodeGraphDebugController,
  type NodeGraphDebugNodeInvocation,
  type NodeGraphDescriptor,
  type NodeGraphDocument,
  type NodeGraphProgram,
} from './index';
import { controlPort, edge, node } from './__tests__/nodeGraphTestFixtures';

const DIGEST = `sha256-${'c'.repeat(64)}`;

const descriptor = (
  id: string,
  lifecycle: Readonly<{ entry?: boolean; terminal?: boolean }> = {}
): NodeGraphDescriptor => ({
  id: `core.${id}`,
  version: '1',
  executorId: `executor.${id}`,
  implementationDigest: DIGEST,
  configurationSchemaDigest: DIGEST,
  effect: 'pure',
  runtimeZones: ['test'],
  requiredCapabilities: [],
  codeSlot: 'forbidden',
  entry: lifecycle.entry ?? false,
  terminal: lifecycle.terminal ?? false,
});

const graph: NodeGraphDocument = {
  nodes: [
    node('start', 'start', [controlPort('out.control.next', 'output')]),
    node('process', 'process', [
      controlPort('in.control.prev', 'input', true),
      controlPort('out.control.next', 'output'),
    ]),
    node('end', 'end', [controlPort('in.control.prev', 'input', true)]),
  ],
  edges: [
    edge(
      'start-process',
      'start',
      'out.control.next',
      'process',
      'in.control.prev'
    ),
    edge(
      'process-end',
      'process',
      'out.control.next',
      'end',
      'in.control.prev'
    ),
  ],
};

const program = (): NodeGraphProgram => {
  const descriptorRegistry = createNodeGraphDescriptorRegistry([
    descriptor('start', { entry: true }),
    descriptor('process'),
    descriptor('end', { terminal: true }),
  ]);
  if (!descriptorRegistry.ok) throw new Error('Invalid test registry.');
  const result = compileNodeGraphProgram({
    documentId: 'graph-document',
    documentRevision: 3,
    graph,
    registry: descriptorRegistry.registry,
    runtimeZone: 'test',
    availableCapabilities: [],
  });
  if (!result.ok) throw new Error('Invalid test Program.');
  return result.program;
};

const commandIdentity = (controller: NodeGraphDebugController) => {
  const snapshot = controller.snapshot();
  return {
    ...snapshot.identity,
    expectedCommandSequence: snapshot.commandSequence + 1,
  };
};

const controller = (
  executor: Parameters<typeof createNodeGraphDebugController>[0]['executor'],
  overrides: Partial<Parameters<typeof createNodeGraphDebugController>[0]> = {}
): NodeGraphDebugController => {
  const result = createNodeGraphDebugController({
    program: program(),
    jobId: 'job',
    attemptId: 'attempt',
    leaseId: 'lease',
    executor,
    ...overrides,
  });
  if (!result.ok) throw new Error(result.issue.safeMessage);
  return result.controller;
};

const deferred = <T>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

describe('NodeGraph debugger protocol', () => {
  it('stops at stable node breakpoints and steps without React Flow state', async () => {
    const debug = controller(({ node, inputsByDependencyNodeId }) => {
      if (node.id === 'start') return { output: { count: 1 } };
      if (node.id === 'process') {
        const previous = inputsByDependencyNodeId.start as {
          readonly count: number;
        };
        return { output: { count: previous.count + 1 } };
      }
      return { output: inputsByDependencyNodeId.process };
    });

    await expect(
      debug.command({
        ...commandIdentity(debug),
        kind: 'set-breakpoints',
        nodeIds: ['process'],
      })
    ).resolves.toMatchObject({ accepted: true });
    const continued = await debug.command({
      ...commandIdentity(debug),
      kind: 'continue',
    });
    expect(continued).toMatchObject({
      accepted: true,
      snapshot: {
        status: 'paused',
        current: { nodeId: 'process', waveIndex: 1 },
        outputsByNodeId: { start: { count: 1 } },
      },
    });
    expect(continued.snapshot.events.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining([
        'attached',
        'node-entered',
        'node-exited',
        'breakpoint-hit',
      ])
    );

    const stepped = await debug.command({
      ...commandIdentity(debug),
      kind: 'step-over',
    });
    expect(stepped).toMatchObject({
      accepted: true,
      snapshot: {
        status: 'paused',
        current: { nodeId: 'end', waveIndex: 2 },
        outputsByNodeId: { process: { count: 2 } },
      },
    });
    await expect(
      debug.command({
        ...commandIdentity(debug),
        kind: 'continue',
      })
    ).resolves.toMatchObject({
      accepted: true,
      snapshot: {
        status: 'completed',
        outputsByNodeId: { end: { count: 2 } },
        callStack: [],
      },
    });
  });

  it('redacts sensitive values and fails closed on oversized output', async () => {
    const debug = controller(
      ({ node }) =>
        node.id === 'start'
          ? {
              output: { credential: 'secret-canary' },
              sensitiveOutput: true,
            }
          : { output: 'x'.repeat(1_000) },
      { maximumValueUtf8Bytes: 64 }
    );

    await debug.command({
      ...commandIdentity(debug),
      kind: 'step-into',
    });
    expect(debug.snapshot().outputsByNodeId).toEqual({
      start: { redacted: true, type: 'sensitive' },
    });
    expect(JSON.stringify(debug.snapshot())).not.toContain('secret-canary');

    const failed = await debug.command({
      ...commandIdentity(debug),
      kind: 'step-over',
    });
    expect(failed).toMatchObject({
      accepted: true,
      snapshot: {
        status: 'failed',
        issue: { code: 'invalid-output', nodeId: 'process' },
      },
    });
  });

  it('rejects stale commands and expires a bounded command lease', async () => {
    const debug = controller(() => ({}), { maximumCommands: 1 });
    await expect(
      debug.command({
        ...debug.snapshot().identity,
        expectedCommandSequence: 2,
        kind: 'step-over',
      })
    ).resolves.toMatchObject({
      accepted: false,
      issue: { code: 'stale-command' },
      snapshot: { commandSequence: 0 },
    });

    await expect(
      debug.command({
        ...commandIdentity(debug),
        kind: 'step-over',
      })
    ).resolves.toMatchObject({ accepted: true });
    await expect(
      debug.command({
        ...commandIdentity(debug),
        kind: 'step-over',
      })
    ).resolves.toMatchObject({
      accepted: false,
      issue: { code: 'lease-expired' },
      snapshot: { commandSequence: 1 },
    });
  });

  it('cancels an active generation and discards its late completion', async () => {
    const pending = deferred<{ output: { late: boolean } }>();
    let activeInvocation: NodeGraphDebugNodeInvocation | undefined;
    const debug = controller((invocation) => {
      activeInvocation = invocation;
      return pending.promise;
    });

    const running = debug.command({
      ...commandIdentity(debug),
      kind: 'continue',
    });
    await Promise.resolve();
    expect(debug.snapshot().status).toBe('running');
    expect(activeInvocation?.signal.aborted).toBe(false);

    const cancelled = await debug.command({
      ...commandIdentity(debug),
      kind: 'cancel',
    });
    expect(cancelled).toMatchObject({
      accepted: true,
      snapshot: { status: 'cancelled', identity: { generation: 2 } },
    });
    expect(activeInvocation?.signal.aborted).toBe(true);

    pending.resolve({ output: { late: true } });
    await running;
    expect(debug.snapshot()).toMatchObject({
      status: 'cancelled',
      outputsByNodeId: {},
    });
    expect(debug.snapshot().events.at(-1)).toMatchObject({
      kind: 'late-completion-discarded',
      nodeId: 'start',
    });
  });

  it('honors a concurrent pause request at the next safe node boundary', async () => {
    const pending = deferred<{ output: number }>();
    const debug = controller(() => pending.promise);

    const running = debug.command({
      ...commandIdentity(debug),
      kind: 'continue',
    });
    await Promise.resolve();
    await expect(
      debug.command({
        ...commandIdentity(debug),
        kind: 'pause',
      })
    ).resolves.toMatchObject({
      accepted: true,
      snapshot: { status: 'running' },
    });
    pending.resolve({ output: 1 });
    await expect(running).resolves.toMatchObject({
      accepted: true,
      snapshot: {
        status: 'paused',
        current: { nodeId: 'process' },
        outputsByNodeId: { start: 1 },
      },
    });
  });
});
