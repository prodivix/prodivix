import { useCallback, useSyncExternalStore } from 'react';
import { nodeGraphDebugSessionEnvironment } from './nodeGraphDebugSession';

export const useNodeGraphDebugSession = (sessionId: string) => {
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      nodeGraphDebugSessionEnvironment.subscribe((changedSessionId) => {
        if (changedSessionId === sessionId) onStoreChange();
      }),
    [sessionId]
  );
  const getSnapshot = useCallback(
    () => nodeGraphDebugSessionEnvironment.getSnapshot(sessionId),
    [sessionId]
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
