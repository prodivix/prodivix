import { describe, expect, it, vi } from 'vitest';
import type {
  NodeGraphDebugController,
  NodeGraphDebugSnapshot,
} from '@prodivix/nodegraph';
import { nodeGraphDebugSessionEnvironment } from './nodeGraphDebugSession';

const snapshot = (
  commandSequence: number,
  status: NodeGraphDebugSnapshot['status'] = 'paused'
): NodeGraphDebugSnapshot =>
  Object.freeze({
    identity: Object.freeze({
      jobId: 'job',
      attemptId: 'attempt',
      programDigest: `sha256-${'a'.repeat(64)}`,
      generation: 1,
      leaseId: 'lease',
    }),
    status,
    commandSequence,
    eventSequence: commandSequence,
    callStack: Object.freeze([]),
    breakpoints: Object.freeze([]),
    outputsByNodeId: Object.freeze({}),
    events: Object.freeze([]),
    droppedEventCount: 0,
  });

describe('NodeGraph debug session environment', () => {
  it('publishes lease-bound command snapshots to the product bridge', async () => {
    let current = snapshot(0);
    const controller: NodeGraphDebugController = {
      snapshot: () => current,
      command: vi.fn(async () => {
        current = snapshot(1, 'completed');
        return Object.freeze({
          accepted: true as const,
          snapshot: current,
        });
      }),
    };
    const listener = vi.fn();
    const unsubscribe = nodeGraphDebugSessionEnvironment.subscribe(listener);
    nodeGraphDebugSessionEnvironment.activate('session', controller);
    expect(nodeGraphDebugSessionEnvironment.getSnapshot('session')).toBe(
      current
    );

    const result = await nodeGraphDebugSessionEnvironment.command('session', {
      ...current.identity,
      expectedCommandSequence: 1,
      kind: 'continue',
    });
    expect(result).toMatchObject({
      accepted: true,
      snapshot: { status: 'completed', commandSequence: 1 },
    });
    expect(listener).toHaveBeenCalledWith('session');

    nodeGraphDebugSessionEnvironment.dispose('session');
    unsubscribe();
  });
});
