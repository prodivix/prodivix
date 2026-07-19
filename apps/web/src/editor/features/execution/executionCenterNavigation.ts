import { useEffect, useState } from 'react';
import { create } from 'zustand';

export type ExecutionNetworkOperationTarget = Readonly<{
  workspaceId: string;
  documentId: string;
  operationId: string;
}>;

export type ExecutionDiagnosticTarget = Readonly<{
  workspaceId: string;
  sessionId: string;
  diagnosticCode: string;
}>;

export type ExecutionCenterNavigationRequest =
  | (ExecutionNetworkOperationTarget &
      Readonly<{
        id: number;
        surface: 'network';
      }>)
  | (ExecutionDiagnosticTarget &
      Readonly<{
        id: number;
        surface: 'console';
      }>);

type ExecutionCenterNavigationStore = Readonly<{
  request: ExecutionCenterNavigationRequest | null;
  openNetworkOperation(target: ExecutionNetworkOperationTarget): void;
  openExecutionDiagnostic(target: ExecutionDiagnosticTarget): void;
  consume(requestId: number): void;
  clear(workspaceId?: string): void;
}>;

let nextRequestId = 0;

const nextNavigationRequestId = (): number => {
  nextRequestId += 1;
  return nextRequestId;
};

/** Carries only ephemeral UI focus; execution traces remain owned by the Session coordinator. */
export const useExecutionCenterNavigationStore =
  create<ExecutionCenterNavigationStore>()((set) => ({
    request: null,
    openNetworkOperation: (target) => {
      set({
        request: Object.freeze({
          ...target,
          id: nextNavigationRequestId(),
          surface: 'network',
        }),
      });
    },
    openExecutionDiagnostic: (target) => {
      set({
        request: Object.freeze({
          ...target,
          id: nextNavigationRequestId(),
          surface: 'console',
        }),
      });
    },
    consume: (requestId) =>
      set((state) =>
        state.request?.id === requestId ? { request: null } : state
      ),
    clear: (workspaceId) =>
      set((state) =>
        !state.request ||
        (workspaceId && state.request.workspaceId !== workspaceId)
          ? state
          : { request: null }
      ),
  }));

/*
 * The visibility latch intentionally reacts to both Network and diagnostic
 * requests while leaving their session/filter details in the one-shot store.
 */
export const useExecutionCenterNavigationVisibility = (
  workspaceId: string | undefined
): boolean => {
  const request = useExecutionCenterNavigationStore((state) => state.request);
  const [openedWorkspaceId, setOpenedWorkspaceId] = useState<string>();
  useEffect(() => {
    if (request && request.workspaceId === workspaceId) {
      setOpenedWorkspaceId(workspaceId);
    }
  }, [request, workspaceId]);
  return Boolean(workspaceId && openedWorkspaceId === workspaceId);
};
