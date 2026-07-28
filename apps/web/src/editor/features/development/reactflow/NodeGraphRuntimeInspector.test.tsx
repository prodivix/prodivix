import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NodeGraphDebugSnapshot } from '@prodivix/nodegraph';
import { NodeGraphRuntimeInspector } from './NodeGraphRuntimeInspector';
import { createNodeGraphRuntimeInspectorModel } from './nodeGraphRuntimeInspectorModel';

const snapshot: NodeGraphDebugSnapshot = Object.freeze({
  identity: Object.freeze({
    jobId: 'job-1',
    attemptId: 'attempt-1',
    programDigest:
      'sha256-f7d9e519a2f90f529be1bce0e5cc6f6acb0e01c86664ad295c38b93b0919c925',
    generation: 3,
    leaseId: 'lease-1',
  }),
  status: 'paused',
  commandSequence: 4,
  eventSequence: 2,
  current: Object.freeze({
    nodeId: 'derive-state',
    waveIndex: 1,
    sourcePath: '/nodesById/derive-state',
  }),
  callStack: Object.freeze([
    Object.freeze({
      frameId: 'root:catalog',
      documentId: 'catalog',
      nodeId: 'derive-state',
      sourcePath: '/nodesById/derive-state',
    }),
  ]),
  breakpoints: Object.freeze(['derive-state']),
  outputsByNodeId: Object.freeze({
    'auth-session': Object.freeze({
      redacted: true,
      type: 'sensitive',
    }),
  }),
  events: Object.freeze([
    Object.freeze({
      sequence: 1,
      kind: 'attached',
      commandSequence: 0,
      generation: 3,
    }),
    Object.freeze({
      sequence: 2,
      kind: 'breakpoint-hit',
      commandSequence: 4,
      generation: 3,
      nodeId: 'derive-state',
      sourcePath: '/nodesById/derive-state',
    }),
  ]),
  droppedEventCount: 0,
});

describe('NodeGraph Runtime Inspector', () => {
  it('projects only bounded domain debug values and semantic trace', () => {
    const model = createNodeGraphRuntimeInspectorModel({ debug: snapshot });
    expect(model.currentNodeId).toBe('derive-state');
    expect(model.variables).toEqual([
      expect.objectContaining({
        nodeId: 'auth-session',
        redacted: true,
        text: '{"redacted":true,"type":"sensitive"}',
      }),
    ]);
    expect(model.trace.map(({ label }) => label)).toEqual([
      'attached',
      'breakpoint-hit',
    ]);
  });

  it('emits an exact lease- and sequence-bound command', () => {
    const onCommand = vi.fn().mockResolvedValue({
      accepted: true,
      snapshot,
    });
    render(
      <NodeGraphRuntimeInspector debug={snapshot} onCommand={onCommand} />
    );

    expect(screen.getByLabelText('Call stack').textContent).toContain(
      'derive-state'
    );
    expect(screen.getByLabelText('Variables').textContent).toContain(
      '[redacted]'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onCommand).toHaveBeenCalledWith({
      ...snapshot.identity,
      expectedCommandSequence: 5,
      kind: 'continue',
    });
  });

  it('offers a fresh replay instead of pretending to rewind runtime effects', () => {
    const onFreshReplay = vi.fn();
    render(
      <NodeGraphRuntimeInspector
        debug={snapshot}
        onFreshReplay={onFreshReplay}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fresh replay' }));
    expect(onFreshReplay).toHaveBeenCalledOnce();
  });
});
