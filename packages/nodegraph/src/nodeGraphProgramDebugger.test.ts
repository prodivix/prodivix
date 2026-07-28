import { describe, expect, it } from 'vitest';
import {
  compileNodeGraphProgram,
  createFirstPartyNodeGraphDescriptorRegistry,
  createNodeGraphDebugController,
  createNodeGraphProgramDebugExecutor,
  createNodeGraphTemporaryStateHost,
  type NodeGraphDocument,
} from './index';
import {
  controlPort,
  dataPort,
  edge,
  node,
} from './__tests__/nodeGraphTestFixtures';

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

const stateGraph: NodeGraphDocument = {
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
};

describe('NodeGraph Program debugger executor', () => {
  it('steps a first-party Program without reading editor projection state', async () => {
    const registry = createFirstPartyNodeGraphDescriptorRegistry();
    const compiled = compileNodeGraphProgram({
      documentId: 'graph',
      documentRevision: 1,
      graph,
      registry,
      runtimeZone: 'client',
      availableCapabilities: [],
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const created = createNodeGraphDebugController({
      program: compiled.program,
      jobId: 'job',
      attemptId: 'attempt',
      leaseId: 'lease',
      executor: createNodeGraphProgramDebugExecutor({
        program: compiled.program,
        requestInput: { value: 1 },
      }),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const initial = created.controller.snapshot();
    expect(initial.status).toBe('paused');
    const completed = await created.controller.command({
      ...initial.identity,
      expectedCommandSequence: 1,
      kind: 'continue',
    });
    expect(completed).toMatchObject({
      accepted: true,
      snapshot: { status: 'completed' },
    });
    expect(Object.keys(completed.snapshot.outputsByNodeId)).toEqual([
      'end',
      'process',
      'start',
    ]);
  });

  it('preserves Program temporary-state actions while stepping', async () => {
    const registry = createFirstPartyNodeGraphDescriptorRegistry();
    const compiled = compileNodeGraphProgram({
      documentId: 'state-graph',
      documentRevision: 1,
      graph: stateGraph,
      registry,
      runtimeZone: 'client',
      availableCapabilities: [],
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const stateHost = createNodeGraphTemporaryStateHost();
    const created = createNodeGraphDebugController({
      program: compiled.program,
      jobId: 'state-job',
      attemptId: 'state-attempt',
      leaseId: 'state-lease',
      executor: createNodeGraphProgramDebugExecutor({
        program: compiled.program,
        requestInput: 7,
        stateHost,
      }),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const initial = created.controller.snapshot();
    const completed = await created.controller.command({
      ...initial.identity,
      expectedCommandSequence: 1,
      kind: 'continue',
    });

    expect(completed).toMatchObject({
      accepted: true,
      snapshot: {
        status: 'completed',
        outputsByNodeId: { read: 7, end: 7 },
      },
    });
    expect(stateHost.snapshot()).toEqual({
      revision: 1,
      values: { counter: 7 },
    });
  });
});
