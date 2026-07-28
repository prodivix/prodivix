import type {
  NodeGraphDebugCommand,
  NodeGraphDebugCommandResult,
  NodeGraphDebugController,
  NodeGraphDebugSnapshot,
} from '@prodivix/nodegraph';

type DebugEntry = {
  readonly controller: NodeGraphDebugController;
  snapshot: NodeGraphDebugSnapshot;
};

const entries = new Map<string, DebugEntry>();
const listeners = new Set<(sessionId: string) => void>();

const notify = (sessionId: string): void =>
  listeners.forEach((listener) => listener(sessionId));

export const nodeGraphDebugSessionEnvironment = Object.freeze({
  activate(sessionId: string, controller: NodeGraphDebugController): void {
    entries.set(sessionId, {
      controller,
      snapshot: controller.snapshot(),
    });
    notify(sessionId);
  },
  getSnapshot(sessionId: string): NodeGraphDebugSnapshot | undefined {
    return entries.get(sessionId)?.snapshot;
  },
  async command(
    sessionId: string,
    command: NodeGraphDebugCommand
  ): Promise<NodeGraphDebugCommandResult> {
    const entry = entries.get(sessionId);
    if (!entry) {
      throw new Error('NodeGraph debug session is unavailable.');
    }
    const result = await entry.controller.command(command);
    entry.snapshot = result.snapshot;
    notify(sessionId);
    return result;
  },
  dispose(sessionId: string): void {
    if (entries.delete(sessionId)) notify(sessionId);
  },
  subscribe(listener: (sessionId: string) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
});
