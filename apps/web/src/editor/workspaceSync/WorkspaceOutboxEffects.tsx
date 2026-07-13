import { useCallback, useEffect, useRef } from 'react';
import { useAuthStore } from '@/auth/useAuthStore';
import { useEditorStore } from '@/editor/store/useEditorStore';
import {
  createWorkspaceHistoryState,
  recordWorkspaceOperation,
  resolveWorkspaceOperationScope,
  undoWorkspaceHistory,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { compareWorkspaceOutboxEntries } from '@prodivix/workspace-sync';
import {
  listWorkspaceOutboxEntries,
  resumeWorkspaceOutbox,
  type WorkspaceOutboxOperationExecutionResult,
} from './workspaceOutboxExecutor';
import { subscribeWorkspaceOutbox } from './workspaceOutboxSignals';
import { adoptWorkspaceRemoteSnapshot } from './workspaceRemoteSnapshotAdoption';
import {
  listWorkspaceSettingsOutboxEntries,
  resumeWorkspaceSettingsOutbox,
} from './workspaceSettingsOutboxExecutor';
import { adoptWorkspaceSettingsOutboxResult } from './workspaceSettingsOutboxAdoption';

const recoverOperationBase = (
  confirmedSnapshot: WorkspaceSnapshot,
  operation: WorkspaceOperation
): WorkspaceSnapshot | null => {
  const history = recordWorkspaceOperation(
    createWorkspaceHistoryState({ maxEntries: 1, mergeWindowMs: 0 }),
    operation
  );
  const reverted = undoWorkspaceHistory(
    confirmedSnapshot,
    history,
    resolveWorkspaceOperationScope(operation)
  );
  return reverted.ok ? reverted.snapshot : null;
};

const adoptResumeResult = (
  result: WorkspaceOutboxOperationExecutionResult,
  resumeBase: WorkspaceSnapshot
): void => {
  const state = useEditorStore.getState();
  const current = state.workspace;
  if (!current || current.id !== resumeBase.id) return;
  if (result.kind === 'conflict') {
    state.openWorkspaceRevisionConflict(result.session);
    return;
  }
  if (result.kind === 'already-applied') {
    const operationBase = result.operation
      ? recoverOperationBase(result.snapshot, result.operation)
      : null;
    if (result.operation && operationBase) {
      state.adoptRebasedWorkspaceOperation({
        requestSnapshot: operationBase,
        serverBaseSnapshot: operationBase,
        rebasedSnapshot: result.snapshot,
        operation: result.operation,
        expectedDocumentEditSeqById: { ...state.documentEditSeqById },
      });
      return;
    }
    adoptWorkspaceRemoteSnapshot(resumeBase, result.snapshot);
    return;
  }
  state.adoptRebasedWorkspaceOperation({
    requestSnapshot: result.serverBaseSnapshot,
    serverBaseSnapshot: result.serverBaseSnapshot,
    rebasedSnapshot: result.optimisticSnapshot,
    operation: result.operation,
    ...(result.kind === 'acknowledged' ? { mutation: result.mutation } : {}),
    expectedDocumentEditSeqById: { ...state.documentEditSeqById },
  });
};

/** Drains persisted operations on load, reconnect and retry deadlines. */
export function WorkspaceOutboxEffects() {
  const token = useAuthStore((state) => state.token);
  const workspaceId = useEditorStore((state) => state.workspace?.id);
  const runningRef = useRef(false);
  const retryTimerRef = useRef<number | undefined>(undefined);

  const run = useCallback(async () => {
    if (!token || !workspaceId || runningRef.current) return;
    const resumeBase = useEditorStore.getState().workspace;
    if (!resumeBase || resumeBase.id !== workspaceId) return;
    runningRef.current = true;
    if (retryTimerRef.current !== undefined) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = undefined;
    }
    try {
      for (let index = 0; index < 32; index += 1) {
        const [operationHead, settingsHead] = await Promise.all([
          listWorkspaceOutboxEntries(workspaceId).then((entries) => entries[0]),
          listWorkspaceSettingsOutboxEntries(workspaceId).then(
            (entries) => entries[0]
          ),
        ]);
        if (!operationHead && !settingsHead) break;
        const runOperation = Boolean(
          operationHead &&
          (!settingsHead ||
            compareWorkspaceOutboxEntries(operationHead, settingsHead) <= 0)
        );
        if (runOperation) {
          const [result] = await resumeWorkspaceOutbox({
            token,
            workspaceId,
            maxEntries: 1,
          });
          if (!result) break;
          adoptResumeResult(result, resumeBase);
          if (result.kind === 'queued' || result.kind === 'conflict') break;
        } else {
          const [result] = await resumeWorkspaceSettingsOutbox({
            token,
            workspaceId,
            maxEntries: 1,
          });
          if (!result) break;
          adoptWorkspaceSettingsOutboxResult(result);
          if (result.kind === 'queued') break;
        }
      }
      const [operationHead, settingsHead] = await Promise.all([
        listWorkspaceOutboxEntries(workspaceId).then((entries) => entries[0]),
        listWorkspaceSettingsOutboxEntries(workspaceId).then(
          (entries) => entries[0]
        ),
      ]);
      const operationIsHead = Boolean(
        operationHead &&
        (!settingsHead ||
          compareWorkspaceOutboxEntries(operationHead, settingsHead) <= 0)
      );
      const head = operationIsHead ? operationHead : settingsHead;
      if (operationIsHead && operationHead?.state.kind === 'conflict') {
        const state = useEditorStore.getState();
        if (
          state.workspaceRevisionConflict?.id !== operationHead.state.session.id
        ) {
          state.setWorkspaceSnapshot(operationHead.state.session.localSnapshot);
          useEditorStore
            .getState()
            .openWorkspaceRevisionConflict(operationHead.state.session);
        }
      } else if (head?.state.kind === 'retry-wait') {
        const delay = Math.max(0, head.state.nextAttemptAt - Date.now());
        retryTimerRef.current = window.setTimeout(() => void run(), delay + 1);
      } else if (head?.state.kind === 'queued') {
        retryTimerRef.current = window.setTimeout(() => void run(), 0);
      } else if (head?.state.kind === 'sending') {
        retryTimerRef.current = window.setTimeout(
          () => void run(),
          Math.max(0, head.state.leaseExpiresAt - Date.now()) + 1
        );
      }
    } catch (error) {
      console.warn('[workspace-outbox] recovery failed', error);
      retryTimerRef.current = window.setTimeout(() => void run(), 5_000);
    } finally {
      runningRef.current = false;
    }
  }, [token, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    void run();
    const unsubscribe = subscribeWorkspaceOutbox((changedWorkspaceId) => {
      if (changedWorkspaceId === workspaceId) void run();
    });
    const handleOnline = () => void run();
    window.addEventListener('online', handleOnline);
    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      if (retryTimerRef.current !== undefined) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = undefined;
      }
    };
  }, [run, workspaceId]);

  return null;
}
