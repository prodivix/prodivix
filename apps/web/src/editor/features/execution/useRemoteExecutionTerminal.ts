import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createExecutionTerminalCopyText,
  type ExecutionTerminalAvailability,
  type ExecutionTerminalOutputRecord,
  type ExecutionTerminalReadResult,
} from '@prodivix/runtime-core';
import type {
  RemoteExecutionTerminalAccess,
  RemoteExecutionTerminalClient,
} from '@prodivix/runtime-remote';

export type RemoteExecutionTerminalView = Readonly<{
  phase: 'idle' | 'opening' | 'open' | 'reconnecting' | 'closed' | 'error';
  records: readonly ExecutionTerminalOutputRecord[];
  gap: boolean;
  error?:
    | 'reconnect-rejected'
    | 'transport-disconnected'
    | 'open-rejected'
    | 'input-pending'
    | 'input-unacknowledged'
    | 'resize-unacknowledged';
}>;

const initialView: RemoteExecutionTerminalView = Object.freeze({
  phase: 'idle',
  records: Object.freeze([]),
  gap: false,
});

const maximumLocalRecords = 1_000;
const pollIntervalMs = 250;

/** Keeps the short Terminal bearer outside React state and reconnects by cursor. */
export const useRemoteExecutionTerminal = (input: {
  enabled: boolean;
  availability: ExecutionTerminalAvailability;
  client?: RemoteExecutionTerminalClient;
}) => {
  const [view, setView] = useState<RemoteExecutionTerminalView>(initialView);
  const accessRef = useRef<RemoteExecutionTerminalAccess | undefined>(
    undefined
  );
  const executionIdRef = useRef<string | undefined>(undefined);
  const terminalSessionIdRef = useRef<string | undefined>(undefined);
  const cursorRef = useRef(0);
  const clientSequenceRef = useRef(1);
  const pendingInputRef = useRef<
    Readonly<{ clientSequence: number; data: string }> | undefined
  >(undefined);
  const lastSizeRef = useRef<
    Readonly<{ columns: number; rows: number }> | undefined
  >(undefined);
  const busyRef = useRef(false);

  const clearCredential = useCallback(() => {
    accessRef.current = undefined;
  }, []);

  const resume = useCallback(async (): Promise<boolean> => {
    const client = input.client;
    const executionId = executionIdRef.current;
    const terminalSessionId = terminalSessionIdRef.current;
    if (!client || !executionId || !terminalSessionId) return false;
    try {
      const resumed = await client.resume({ executionId, terminalSessionId });
      accessRef.current = resumed.access;
      lastSizeRef.current = resumed.snapshot.size;
      setView((current) => ({ ...current, phase: 'open', error: undefined }));
      return true;
    } catch {
      clearCredential();
      setView((current) => ({
        ...current,
        phase: 'error',
        error: 'reconnect-rejected',
      }));
      return false;
    }
  }, [clearCredential, input.client]);

  const refresh = useCallback(async (): Promise<void> => {
    if (busyRef.current || !input.client || !input.enabled) return;
    const executionId = executionIdRef.current;
    const terminalSessionId = terminalSessionIdRef.current;
    if (!executionId || !terminalSessionId) return;
    busyRef.current = true;
    try {
      let access = accessRef.current;
      if (!access || access.expiresAt <= Date.now() + 5_000) {
        setView((current) => ({ ...current, phase: 'reconnecting' }));
        if (!(await resume())) return;
        access = accessRef.current;
      }
      if (!access) return;
      for (let page = 0; page < 4; page += 1) {
        const result = await input.client.read({
          executionId,
          terminalSessionId,
          accessToken: access.token,
          afterCursor: cursorRef.current,
        });
        cursorRef.current = result.nextCursor;
        setView((current) => ({
          phase: result.status === 'closed' ? 'closed' : 'open',
          records: Object.freeze(
            [...current.records, ...result.records].slice(-maximumLocalRecords)
          ),
          gap: current.gap || result.gap,
          error: undefined,
        }));
        if (result.status === 'closed') clearCredential();
        if (!result.hasMore) break;
      }
    } catch {
      setView((current) => ({
        ...current,
        phase: 'reconnecting',
        error: 'transport-disconnected',
      }));
      clearCredential();
    } finally {
      busyRef.current = false;
    }
  }, [clearCredential, input.client, input.enabled, resume]);

  const open = useCallback(async (): Promise<boolean> => {
    if (
      !input.client ||
      input.availability.status !== 'available' ||
      busyRef.current
    )
      return false;
    busyRef.current = true;
    const existingExecutionId = executionIdRef.current;
    const existingSessionId = terminalSessionIdRef.current;
    setView((current) => ({
      ...(existingExecutionId && existingSessionId ? current : initialView),
      phase:
        existingExecutionId && existingSessionId ? 'reconnecting' : 'opening',
      error: undefined,
    }));
    try {
      if (existingExecutionId === input.availability.jobId && existingSessionId)
        return await resume();
      const opened = await input.client.open({
        executionId: input.availability.jobId,
        size: { columns: 100, rows: 30 },
      });
      executionIdRef.current = opened.snapshot.executionId;
      terminalSessionIdRef.current = opened.snapshot.terminalSessionId;
      accessRef.current = opened.access;
      cursorRef.current = 0;
      clientSequenceRef.current = 1;
      pendingInputRef.current = undefined;
      lastSizeRef.current = opened.snapshot.size;
      setView({ ...initialView, phase: 'open' });
      return true;
    } catch {
      clearCredential();
      setView({
        ...initialView,
        phase: 'error',
        error: 'open-rejected',
      });
      return false;
    } finally {
      busyRef.current = false;
    }
  }, [clearCredential, input.availability, input.client, resume]);

  const send = useCallback(
    async (data: string): Promise<boolean> => {
      const access = accessRef.current;
      const executionId = executionIdRef.current;
      const terminalSessionId = terminalSessionIdRef.current;
      if (!input.client || !access || !executionId || !terminalSessionId)
        return false;
      const pending = pendingInputRef.current;
      if (pending && pending.data !== data) {
        setView((current) => ({
          ...current,
          error: 'input-pending',
        }));
        return false;
      }
      const clientSequence =
        pending?.clientSequence ?? clientSequenceRef.current;
      pendingInputRef.current = Object.freeze({ clientSequence, data });
      try {
        const result = await input.client.write({
          executionId,
          terminalSessionId,
          accessToken: access.token,
          data,
          clientSequence,
        });
        if (result.status !== 'accepted' && result.status !== 'duplicate')
          return false;
        pendingInputRef.current = undefined;
        clientSequenceRef.current += 1;
        setView((current) => ({ ...current, error: undefined }));
        return true;
      } catch {
        clearCredential();
        setView((current) => ({
          ...current,
          phase: 'reconnecting',
          error: 'input-unacknowledged',
        }));
        return false;
      }
    },
    [clearCredential, input.client]
  );

  const resize = useCallback(
    async (columns: number, rows: number): Promise<boolean> => {
      const access = accessRef.current;
      const executionId = executionIdRef.current;
      const terminalSessionId = terminalSessionIdRef.current;
      const previous = lastSizeRef.current;
      if (
        !input.client ||
        !access ||
        !executionId ||
        !terminalSessionId ||
        (previous?.columns === columns && previous.rows === rows)
      )
        return false;
      try {
        const result = await input.client.resize({
          executionId,
          terminalSessionId,
          accessToken: access.token,
          size: { columns, rows },
        });
        if (result.status !== 'accepted' && result.status !== 'unchanged')
          return false;
        lastSizeRef.current = result.size;
        return true;
      } catch {
        clearCredential();
        setView((current) => ({
          ...current,
          phase: 'reconnecting',
          error: 'resize-unacknowledged',
        }));
        return false;
      }
    },
    [clearCredential, input.client]
  );

  const interrupt = useCallback(async (): Promise<boolean> => {
    const access = accessRef.current;
    const executionId = executionIdRef.current;
    const terminalSessionId = terminalSessionIdRef.current;
    if (!input.client || !access || !executionId || !terminalSessionId)
      return false;
    try {
      const result = await input.client.signal({
        executionId,
        terminalSessionId,
        accessToken: access.token,
        signal: 'interrupt',
      });
      return result.status === 'accepted';
    } catch {
      return false;
    }
  }, [input.client]);

  const close = useCallback(async (): Promise<void> => {
    const access = accessRef.current;
    const executionId = executionIdRef.current;
    const terminalSessionId = terminalSessionIdRef.current;
    clearCredential();
    executionIdRef.current = undefined;
    terminalSessionIdRef.current = undefined;
    pendingInputRef.current = undefined;
    lastSizeRef.current = undefined;
    setView((current) => ({ ...current, phase: 'closed' }));
    if (!input.client || !access || !executionId || !terminalSessionId) return;
    await input.client
      .close({
        executionId,
        terminalSessionId,
        accessToken: access.token,
      })
      .catch(() => undefined);
  }, [clearCredential, input.client]);

  useEffect(() => {
    if (!input.enabled || !['open', 'reconnecting'].includes(view.phase))
      return undefined;
    void refresh();
    const timer = globalThis.setInterval(() => void refresh(), pollIntervalMs);
    return () => globalThis.clearInterval(timer);
  }, [input.enabled, refresh, view.phase]);

  useEffect(
    () => () => {
      clearCredential();
    },
    [clearCredential]
  );

  useEffect(() => {
    if (
      input.availability.status === 'available' &&
      (!executionIdRef.current ||
        executionIdRef.current === input.availability.jobId)
    )
      return;
    clearCredential();
    executionIdRef.current = undefined;
    terminalSessionIdRef.current = undefined;
    pendingInputRef.current = undefined;
    lastSizeRef.current = undefined;
    cursorRef.current = 0;
    clientSequenceRef.current = 1;
    setView(initialView);
  }, [clearCredential, input.availability, input.client]);

  const copyText = useMemo(() => {
    const first = view.records[0];
    const latestCursor = view.records.at(-1)?.cursor ?? 0;
    const result: ExecutionTerminalReadResult = Object.freeze({
      terminalSessionId: first?.terminalSessionId ?? 'unavailable',
      executionId: first?.executionId ?? 'unavailable',
      jobId: first?.jobId ?? 'unavailable',
      status: view.phase === 'closed' ? 'closed' : 'open',
      afterCursor: 0,
      nextCursor: latestCursor,
      latestCursor,
      earliestAvailableCursor: first?.cursor ?? latestCursor,
      gap: view.gap,
      hasMore: false,
      records: view.records,
    });
    return createExecutionTerminalCopyText(result);
  }, [view]);

  return {
    view,
    copyText,
    open,
    refresh,
    resume,
    send,
    resize,
    interrupt,
    close,
  };
};
