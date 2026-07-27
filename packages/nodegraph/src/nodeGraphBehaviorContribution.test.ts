import { describe, expect, it } from 'vitest';
import type { BehaviorRuntimeInvocation } from '@prodivix/behavior';
import {
  NODEGRAPH_BEHAVIOR_REGISTRY_CONTRIBUTION,
  compileNodeGraphProgram,
  createFirstPartyNodeGraphDescriptorRegistry,
  createNodeGraphBehaviorRuntimeAdapters,
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
    node('start', 'start', [
      controlPort('out.control.next', 'output'),
      dataPort('out.data.value', 'output', 'json'),
    ]),
    node('end', 'end', [
      controlPort('in.control.prev', 'input', true),
      dataPort('in.data.value', 'input', 'json', true),
    ]),
  ],
  edges: [
    edge('control', 'start', 'out.control.next', 'end', 'in.control.prev'),
    edge('data', 'start', 'out.data.value', 'end', 'in.data.value'),
  ],
};
const compiled = compileNodeGraphProgram({
  documentId: 'graph-document',
  documentRevision: 9,
  graph,
  registry: createFirstPartyNodeGraphDescriptorRegistry(),
  runtimeZone: 'test',
  availableCapabilities: [],
});
if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
const program = compiled.program;

const target = Object.freeze({
  targetId: 'graph-target',
  semanticSymbolId: 'graph-symbol',
  capability: 'behavior:nodegraph:invoke',
  source: Object.freeze({
    workspaceDocumentId: 'graph-document',
    path: '/',
  }),
});

const invocation = (
  capabilityId: string,
  overrides: Partial<BehaviorRuntimeInvocation> = {}
): BehaviorRuntimeInvocation =>
  Object.freeze({
    invocationId: `attempt:${capabilityId}`,
    attemptId: 'attempt',
    mode: capabilityId.endsWith('output') ? 'observation' : 'action',
    workspaceRevision: 9,
    programDigest: `sha256-${'1'.repeat(64)}`,
    instructionId: `instruction:${capabilityId}`,
    stepId: capabilityId,
    operation: capabilityId,
    capabilityId,
    input: Object.freeze({ count: 2 }),
    target,
    source: target.source,
    signal: Object.freeze({ aborted: false }),
    readStepOutput: () => undefined,
    ...overrides,
  });

describe('NodeGraph Behavior contribution', () => {
  it('registers the compiled Program trigger/action/observation contract', () => {
    expect(
      NODEGRAPH_BEHAVIOR_REGISTRY_CONTRIBUTION.triggers.map(({ kind }) => kind)
    ).toEqual([
      'nodegraph.graph-input',
      'nodegraph.event',
      'nodegraph.checkpoint-trigger',
    ]);
    expect(
      NODEGRAPH_BEHAVIOR_REGISTRY_CONTRIBUTION.actions.map(({ kind }) => kind)
    ).toEqual(['nodegraph.invoke', 'nodegraph.resume', 'nodegraph.cancel']);
    expect(
      NODEGRAPH_BEHAVIOR_REGISTRY_CONTRIBUTION.observations.map(
        ({ kind }) => kind
      )
    ).toEqual([
      'nodegraph.node-enter',
      'nodegraph.node-exit',
      'nodegraph.port-output',
      'nodegraph.checkpoint',
      'nodegraph.graph-result',
      'nodegraph.graph-error',
      'nodegraph.graph-cancel',
      'nodegraph.nodegraph-output',
    ]);
  });

  it('invokes the compiled Program and observes correlated attempt-local output', async () => {
    const adapters = createNodeGraphBehaviorRuntimeAdapters({
      resolveTarget: () => ({
        program,
        workspaceRevision: 9,
      }),
    });
    const adapter = (capabilityId: string) =>
      adapters.find((candidate) => candidate.capabilityId === capabilityId)!;
    await expect(
      adapter('nodegraph.invoke').invoke(invocation('nodegraph.invoke'))
    ).resolves.toEqual({
      status: 'succeeded',
      output: { count: 2 },
    });
    expect(
      await adapter('nodegraph.nodegraph-output').invoke(
        invocation('nodegraph.nodegraph-output', {
          target: {
            ...target,
            capability: 'behavior:nodegraph:output',
          },
        })
      )
    ).toEqual({
      status: 'succeeded',
      output: { count: 2 },
    });
    expect(
      await adapter('nodegraph.node-enter').invoke(
        invocation('nodegraph.node-enter', {
          input: { nodeId: 'start' },
          target: {
            ...target,
            capability: 'behavior:nodegraph:node',
          },
        })
      )
    ).toMatchObject({
      status: 'succeeded',
      output: {
        nodeId: 'start',
        sourcePath: '/nodesById/start',
      },
    });
    expect(
      await adapter('nodegraph.graph-result').invoke(
        invocation('nodegraph.graph-result', {
          target: {
            ...target,
            capability: 'behavior:nodegraph:result',
          },
        })
      )
    ).toMatchObject({
      status: 'succeeded',
      output: { status: 'completed', output: { count: 2 } },
    });
    expect(
      await adapter('nodegraph.nodegraph-output').invoke(
        invocation('nodegraph.nodegraph-output', {
          attemptId: 'other-attempt',
          target: {
            ...target,
            capability: 'behavior:nodegraph:output',
          },
        })
      )
    ).toMatchObject({
      status: 'failed',
      error: { code: 'nodegraph-observation-unavailable' },
    });
  });

  it('fails closed when the revision-bound target cannot be resolved', async () => {
    const adapters = createNodeGraphBehaviorRuntimeAdapters({
      resolveTarget: () => null,
    });
    const adapter = adapters.find(
      (candidate) => candidate.capabilityId === 'nodegraph.invoke'
    )!;
    await expect(
      adapter.invoke(invocation('nodegraph.invoke'))
    ).resolves.toMatchObject({
      status: 'failed',
      error: { code: 'nodegraph-target-missing' },
    });
  });
});
