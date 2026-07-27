import { describe, expect, it } from 'vitest';
import {
  compileNodeGraphProgram,
  createFirstPartyNodeGraphDescriptorRegistry,
  createFirstPartyNodeGraphProgramExecutorRegistry,
  createNodeGraphProgramCancellationController,
  createNodeGraphTemporaryStateHost,
  executeNodeGraphProgram,
  type NodeGraphDocument,
  type NodeGraphProgram,
  type NodeGraphProgramCancellationSignal,
  type NodeGraphProgramNodeExecutor,
} from '.';
import {
  controlPort,
  dataPort,
  edge,
  node,
} from './__tests__/nodeGraphTestFixtures';

const compile = (
  graph: NodeGraphDocument,
  availableCapabilities: readonly string[] = [],
  overrides: Partial<Parameters<typeof compileNodeGraphProgram>[0]> = {}
): NodeGraphProgram => {
  const result = compileNodeGraphProgram({
    documentId: 'runtime-graph',
    documentRevision: 7,
    graph,
    registry: createFirstPartyNodeGraphDescriptorRegistry(),
    runtimeZone: 'test',
    availableCapabilities,
    ...overrides,
  });
  if (!result.ok) {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.program;
};

const pureParallelGraph = (): NodeGraphDocument => ({
  nodes: [
    node('merge', 'merge', [
      controlPort('in.control.prev', 'input', true),
      dataPort('in.data.a', 'input', 'json', true),
      dataPort('in.data.b', 'input', 'json', true),
      controlPort('out.control.next', 'output'),
      dataPort('out.data.value', 'output', 'json'),
    ]),
    node(
      'constant-b',
      'constant',
      [dataPort('out.data.value', 'output', 'json')],
      { value: 2 }
    ),
    node('end', 'end', [
      controlPort('in.control.prev', 'input', true),
      dataPort('in.data.value', 'input', 'json', true),
    ]),
    node('start', 'start', [controlPort('out.control.next', 'output')]),
    node(
      'constant-a',
      'constant',
      [dataPort('out.data.value', 'output', 'json')],
      { value: 1 }
    ),
  ],
  edges: [
    edge(
      'control-start-merge',
      'start',
      'out.control.next',
      'merge',
      'in.control.prev'
    ),
    edge('data-a-merge', 'constant-a', 'out.data.value', 'merge', 'in.data.a'),
    edge('data-b-merge', 'constant-b', 'out.data.value', 'merge', 'in.data.b'),
    edge(
      'control-merge-end',
      'merge',
      'out.control.next',
      'end',
      'in.control.prev'
    ),
    edge('data-merge-end', 'merge', 'out.data.value', 'end', 'in.data.value'),
  ],
});

const stateCommitGraph = (): NodeGraphDocument => ({
  nodes: [
    node('start', 'start', [
      controlPort('out.control.next', 'output'),
      dataPort('out.data.value', 'output', 'json'),
    ]),
    node(
      'update',
      'state.update',
      [
        controlPort('in.control.prev', 'input', true),
        dataPort('in.data.value', 'input', 'json', true),
        controlPort('out.control.next', 'output'),
        dataPort('out.data.value', 'output', 'json'),
      ],
      { key: 'counter' }
    ),
    node(
      'read',
      'state.read',
      [
        controlPort('in.control.prev', 'input', true),
        controlPort('out.control.next', 'output'),
        dataPort('out.data.value', 'output', 'json'),
      ],
      { key: 'counter' }
    ),
    node('end', 'end', [
      controlPort('in.control.prev', 'input', true),
      dataPort('in.data.value', 'input', 'json', true),
    ]),
  ],
  edges: [
    edge(
      'start-update-control',
      'start',
      'out.control.next',
      'update',
      'in.control.prev'
    ),
    edge(
      'start-update-data',
      'start',
      'out.data.value',
      'update',
      'in.data.value'
    ),
    edge(
      'update-read-control',
      'update',
      'out.control.next',
      'read',
      'in.control.prev'
    ),
    edge(
      'read-end-control',
      'read',
      'out.control.next',
      'end',
      'in.control.prev'
    ),
    edge('read-end-data', 'read', 'out.data.value', 'end', 'in.data.value'),
  ],
});

const stateRollbackGraph = (): NodeGraphDocument => ({
  nodes: [
    node(
      'start',
      'start',
      [
        controlPort('out.control.next', 'output'),
        dataPort('out.data.condition', 'output', 'boolean'),
      ],
      { value: false }
    ),
    node('begin', 'state.transaction.begin', [
      controlPort('in.control.prev', 'input', true),
      controlPort('out.control.next', 'output'),
    ]),
    node(
      'update',
      'state.update',
      [
        controlPort('in.control.prev', 'input', true),
        controlPort('out.control.next', 'output'),
      ],
      { key: 'counter', value: 99 }
    ),
    node('assert', 'assert', [
      controlPort('in.control.prev', 'input', true),
      dataPort('in.data.condition', 'input', 'boolean', true),
      controlPort('out.control.next', 'output'),
    ]),
    node('end', 'end', [controlPort('in.control.prev', 'input', true)]),
  ],
  edges: [
    edge(
      'start-begin',
      'start',
      'out.control.next',
      'begin',
      'in.control.prev'
    ),
    edge(
      'begin-update',
      'begin',
      'out.control.next',
      'update',
      'in.control.prev'
    ),
    edge(
      'update-assert',
      'update',
      'out.control.next',
      'assert',
      'in.control.prev'
    ),
    edge(
      'condition-assert',
      'start',
      'out.data.condition',
      'assert',
      'in.data.condition'
    ),
    edge('assert-end', 'assert', 'out.control.next', 'end', 'in.control.prev'),
  ],
});

const effectGraph = (
  descriptorId: string,
  configuration: Record<string, unknown>,
  codeSlot = false
): NodeGraphDocument => ({
  nodes: [
    node('start', 'start', [
      controlPort('out.control.next', 'output'),
      dataPort('out.data.value', 'output', 'json'),
    ]),
    {
      ...node(
        'effect',
        descriptorId,
        [
          controlPort('in.control.prev', 'input', true),
          dataPort('in.data.value', 'input', 'json', true),
          controlPort('out.control.next', 'output'),
          dataPort('out.data.value', 'output', 'json'),
        ],
        configuration
      ),
      ...(codeSlot
        ? {
            codeSlot: {
              slotId: 'graph.effect.code',
              reference: { artifactId: 'artifact-effect' },
            },
          }
        : {}),
    },
    node('end', 'end', [
      controlPort('in.control.prev', 'input', true),
      dataPort('in.data.value', 'input', 'json', true),
    ]),
  ],
  edges: [
    edge(
      'start-effect-control',
      'start',
      'out.control.next',
      'effect',
      'in.control.prev'
    ),
    edge(
      'start-effect-data',
      'start',
      'out.data.value',
      'effect',
      'in.data.value'
    ),
    edge(
      'effect-end-control',
      'effect',
      'out.control.next',
      'end',
      'in.control.prev'
    ),
    edge('effect-end-data', 'effect', 'out.data.value', 'end', 'in.data.value'),
  ],
});

describe('NodeGraph Program runtime', () => {
  it('executes parallel waves with stable merge and trace order', async () => {
    const constantExecutor: NodeGraphProgramNodeExecutor = async ({
      node: programNode,
    }) => {
      await new Promise((resolve) =>
        setTimeout(resolve, programNode.id === 'constant-a' ? 8 : 1)
      );
      const value = programNode.id === 'constant-a' ? 1 : 2;
      return {
        outputs: { 'out.data.value': value },
        primaryOutput: value,
        controlPortIds: [],
      };
    };
    const result = await executeNodeGraphProgram({
      program: compile(pureParallelGraph()),
      invocationId: 'parallel-invocation',
      executors: createFirstPartyNodeGraphProgramExecutorRegistry({
        'core.nodegraph.executor.constant': constantExecutor,
      }),
      maximumConcurrency: 4,
    });

    expect(result).toMatchObject({
      status: 'completed',
      output: [1, 2],
    });
    expect(
      result.trace
        .filter(
          (event) =>
            event.kind === 'node-completed' &&
            event.nodeId?.startsWith('constant-')
        )
        .map(({ nodeId }) => nodeId)
    ).toEqual(['constant-a', 'constant-b']);
  });

  it('commits invocation state, rolls back failures, and enforces CAS', async () => {
    const stateHost = createNodeGraphTemporaryStateHost();
    const committed = await executeNodeGraphProgram({
      program: compile(stateCommitGraph()),
      invocationId: 'state-commit',
      input: 42,
      stateHost,
    });

    expect(committed).toMatchObject({
      status: 'completed',
      output: 42,
      stateRevision: 1,
    });
    expect(stateHost.snapshot()).toMatchObject({
      revision: 1,
      values: { counter: 42 },
    });

    const rollbackHost = createNodeGraphTemporaryStateHost();
    const rolledBack = await executeNodeGraphProgram({
      program: compile(stateRollbackGraph()),
      invocationId: 'state-rollback',
      stateHost: rollbackHost,
    });
    expect(rolledBack).toMatchObject({
      status: 'failed',
      error: { code: 'NODEGRAPH_ASSERTION_FAILED' },
    });
    expect(rollbackHost.snapshot()).toEqual({
      revision: 0,
      values: {},
    });

    const casHost = createNodeGraphTemporaryStateHost({ counter: 1 });
    const first = casHost.begin('cas-first');
    const second = casHost.begin('cas-second');
    first.stage('counter', 2, 0);
    second.stage('counter', 3, 0);
    expect(first.commit()).toEqual({ ok: true, revision: 1 });
    expect(second.commit()).toEqual({
      ok: false,
      conflictKey: 'counter',
      expectedVersion: 0,
      actualVersion: 1,
    });
  });

  it('uses typed domain gateways with bounded idempotent retry', async () => {
    const program = compile(
      effectGraph('data.query', {
        operationId: 'catalog.list',
        retry: { maxAttempts: 3 },
      }),
      ['data:query']
    );
    const unavailable = await executeNodeGraphProgram({
      program,
      invocationId: 'data-unavailable',
      input: { page: 1 },
      grantedCapabilities: ['data:query'],
    });
    expect(unavailable).toMatchObject({
      status: 'failed',
      error: { code: 'NODEGRAPH_GATEWAY_UNAVAILABLE' },
    });

    let attempts = 0;
    const completed = await executeNodeGraphProgram({
      program,
      invocationId: 'data-retry',
      input: { page: 1 },
      grantedCapabilities: ['data:query'],
      gateways: {
        data: {
          async dispatch() {
            attempts += 1;
            if (attempts < 3) throw new Error('provider detail');
            return { items: ['a', 'b'] };
          },
        },
      },
    });
    expect(completed).toMatchObject({
      status: 'completed',
      output: { items: ['a', 'b'] },
    });
    expect(attempts).toBe(3);
    expect(
      completed.trace.filter((event) => event.kind === 'node-retried')
    ).toHaveLength(2);
    expect(JSON.stringify(completed)).not.toContain('provider detail');
  });

  it('cancels aggregate execution and fences late domain completion', async () => {
    const controller = createNodeGraphProgramCancellationController();
    let release: (value: unknown) => void = () => {};
    let started: () => void = () => {};
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = new Promise<unknown>((resolve) => {
      release = resolve;
    });
    const execution = executeNodeGraphProgram({
      program: compile(
        effectGraph('data.query', { operationId: 'catalog.list' }),
        ['data:query']
      ),
      invocationId: 'cancelled-domain',
      input: { page: 1 },
      grantedCapabilities: ['data:query'],
      signal: controller.signal,
      gateways: {
        data: {
          dispatch() {
            started();
            return pending;
          },
        },
      },
    });

    await startedPromise;
    controller.abort('test-cancel');
    const result = await execution;
    release({ secret: 'late-result' });

    expect(result.status).toBe('cancelled');
    expect(result.trace).toContainEqual(
      expect.objectContaining({
        kind: 'late-completion-discarded',
        nodeId: 'effect',
      })
    );
    expect(JSON.stringify(result)).not.toContain('late-result');
  });

  it('fails closed for CodeSlot and subgraph gateway/capability drift', async () => {
    const codeProgram = compile(effectGraph('code', {}, true), [
      'code:execute',
    ]);
    expect(
      await executeNodeGraphProgram({
        program: codeProgram,
        invocationId: 'code-missing-gateway',
        input: { value: 1 },
        grantedCapabilities: ['code:execute'],
      })
    ).toMatchObject({
      status: 'failed',
      error: { code: 'NODEGRAPH_GATEWAY_UNAVAILABLE' },
    });
    expect(
      await executeNodeGraphProgram({
        program: codeProgram,
        invocationId: 'code-execute',
        input: { value: 1 },
        grantedCapabilities: ['code:execute'],
        gateways: {
          codeSlot: {
            async invoke({ codeSlotId, value }) {
              return { codeSlotId, value };
            },
          },
        },
      })
    ).toMatchObject({
      status: 'completed',
      output: {
        codeSlotId: 'graph.effect.code',
        value: { value: 1 },
      },
    });

    const subgraphProgram = compile(
      effectGraph('subgraph.call', {
        documentId: 'child-graph',
        expectedDocumentRevision: 3,
        expectedContractDigest: `sha256-${'a'.repeat(64)}`,
        requiredCapabilities: ['server:invoke'],
      }),
      ['nodegraph:invoke'],
      {
        resolvedSubgraphs: [
          {
            documentId: 'child-graph',
            documentRevision: 3,
            contractDigest: `sha256-${'a'.repeat(64)}`,
            programDigest: `sha256-${'b'.repeat(64)}`,
            requiredCapabilities: [],
            dependencyDocumentIds: [],
          },
        ],
      }
    );
    expect(
      await executeNodeGraphProgram({
        program: subgraphProgram,
        invocationId: 'subgraph-escalation',
        input: { value: 1 },
        grantedCapabilities: ['nodegraph:invoke'],
        gateways: {
          subgraph: {
            async invoke() {
              return { unexpected: true };
            },
          },
        },
      })
    ).toMatchObject({
      status: 'failed',
      error: { code: 'NODEGRAPH_SUBGRAPH_CONTRACT_INVALID' },
    });
  });

  it('executes an explicit bounded CodeSlot loop and fails closed at its budget', async () => {
    const program = compile(
      effectGraph(
        'loop.bounded',
        { iterations: 3, maxIterations: 3, untilDone: true },
        true
      ),
      ['code:execute']
    );
    const completed = await executeNodeGraphProgram({
      program,
      invocationId: 'bounded-loop',
      input: 0,
      grantedCapabilities: ['code:execute'],
      gateways: {
        codeSlot: {
          async invoke({ value }) {
            const iteration = (value as { iteration: number }).iteration;
            return {
              done: iteration === 2,
              value: iteration + 1,
            };
          },
        },
      },
    });
    expect(completed).toMatchObject({ status: 'completed', output: 3 });
    expect(
      completed.trace.filter(
        (event) =>
          event.kind === 'frame-entered' &&
          event.frameKind === 'codeslot' &&
          event.nodeId === 'effect'
      )
    ).toHaveLength(3);

    const exceeded = await executeNodeGraphProgram({
      program,
      invocationId: 'bounded-loop-exceeded',
      input: 0,
      grantedCapabilities: ['code:execute'],
      gateways: {
        codeSlot: {
          async invoke({ value }) {
            return { done: false, value };
          },
        },
      },
    });
    expect(exceeded).toMatchObject({
      status: 'failed',
      error: { code: 'NODEGRAPH_LOOP_BUDGET_EXCEEDED' },
    });
  });

  it('settles explicit first-success early and cancels losing child scopes', async () => {
    let losingSignal: NodeGraphProgramCancellationSignal | undefined;
    const program = compile(
      effectGraph('parallel.first-success', {
        branches: [
          { branchId: 'loser', observationId: 'slow' },
          { branchId: 'winner', observationId: 'ready' },
        ],
      }),
      ['observation:wait']
    );
    const completed = await executeNodeGraphProgram({
      program,
      invocationId: 'first-success',
      input: {},
      grantedCapabilities: ['observation:wait'],
      gateways: {
        observation: {
          wait({ observationId, signal }) {
            if (observationId === 'ready') {
              return Promise.resolve({ itemId: 'catalog-1' });
            }
            losingSignal = signal;
            return new Promise(() => undefined);
          },
        },
      },
    });
    expect(completed).toMatchObject({
      status: 'completed',
      output: {
        branchId: 'winner',
        reason: 'first-success',
        value: { itemId: 'catalog-1' },
      },
    });
    expect(losingSignal?.aborted).toBe(true);
    expect(losingSignal?.reasonCode).toBe('first-success-loser');
  });

  it('uses typed Auth and deterministic timeout gateways', async () => {
    const authProgram = compile(
      effectGraph('auth.require-permission', {
        permissionId: 'catalog:edit',
      }),
      ['auth:permission']
    );
    await expect(
      executeNodeGraphProgram({
        program: authProgram,
        invocationId: 'auth-permission',
        input: { itemId: 'catalog-1' },
        grantedCapabilities: ['auth:permission'],
        gateways: {
          auth: {
            async dispatch({ kind, permissionId, value }) {
              return { kind, permissionId, value, granted: true };
            },
          },
        },
      })
    ).resolves.toMatchObject({
      status: 'completed',
      output: {
        kind: 'require-permission',
        permissionId: 'catalog:edit',
        granted: true,
      },
    });

    const timeoutProgram = compile(
      effectGraph('data.query', {
        operationId: 'catalog.list',
        timeoutTicks: 5,
      }),
      ['data:query']
    );
    const timedOut = await executeNodeGraphProgram({
      program: timeoutProgram,
      invocationId: 'deterministic-timeout',
      input: { page: 1 },
      grantedCapabilities: ['data:query'],
      gateways: {
        data: {
          dispatch() {
            return new Promise(() => undefined);
          },
        },
        scheduler: {
          async wait({ ticks }) {
            expect(ticks).toBe(5);
          },
        },
      },
    });
    expect(timedOut).toMatchObject({
      status: 'failed',
      error: { code: 'NODEGRAPH_NODE_TIMEOUT', category: 'timeout' },
    });
    expect(timedOut.trace).toContainEqual(
      expect.objectContaining({
        kind: 'node-timed-out',
        nodeId: 'effect',
        detail: { timeoutTicks: 5 },
      })
    );
  });
});
