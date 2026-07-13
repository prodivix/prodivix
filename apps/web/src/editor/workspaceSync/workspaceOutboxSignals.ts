type WorkspaceOutboxListener = (workspaceId: string) => void;

const listeners = new Set<WorkspaceOutboxListener>();

export const notifyWorkspaceOutboxChanged = (workspaceId: string): void => {
  listeners.forEach((listener) => listener(workspaceId));
};

export const subscribeWorkspaceOutbox = (
  listener: WorkspaceOutboxListener
): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
