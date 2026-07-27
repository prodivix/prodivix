import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createExecutionTerminalEmulator,
  createExecutionTerminalEmulatorCopyText,
  EXECUTION_TERMINAL_LIMITS,
  type ExecutionTerminalAvailability,
  type ExecutionTerminalEmulator,
  type ExecutionTerminalEmulatorSnapshot,
  type ExecutionTerminalOutputRecord,
  type ExecutionTerminalSize,
  type ExecutionTerminalWriteResult,
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
    | 'input-rejected'
    | 'input-desynchronized'
    | 'input-unacknowledged'
    | 'resize-unacknowledged'
    | 'output-invalid';
}>;

/**
 * A successful output read only proves the transport is alive, which says
 * nothing about a write the Broker refused, so the polling loop must not clear
 * the errors the input path owns. Only an acknowledged write does.
 */
const inputOwnedErrors: ReadonlySet<
  NonNullable<RemoteExecutionTerminalView['error']>
> = new Set(['input-pending', 'input-rejected', 'input-desynchronized']);

const initialView: RemoteExecutionTerminalView = Object.freeze({
  phase: 'idle',
  records: Object.freeze([]),
  gap: false,
});

const maximumLocalRecords = 1_000;
const maximumQueuedInputBytes = EXECUTION_TERMINAL_LIMITS.maximumInputBytes * 2;
const maximumQueuedInputChunks = 256;
const pollIntervalMs = 250;
const defaultTerminalSize = Object.freeze({ columns: 100, rows: 30 });

type QueuedTerminalInput = {
  data: string;
  byteLength: number;
  resynchronized: boolean;
  resolve(value: boolean): void;
};

/** Keeps the short Terminal bearer outside React state and reconnects by cursor. */
export const useRemoteExecutionTerminal = (input: {
  enabled: boolean;
  availability: ExecutionTerminalAvailability;
  client?: RemoteExecutionTerminalClient;
}) => {
  const [view, setView] = useState<RemoteExecutionTerminalView>(initialView);
  const [emulatorController] = useState<ExecutionTerminalEmulator>(() =>
    createExecutionTerminalEmulator(defaultTerminalSize)
  );
  const [emulator, setEmulator] = useState<ExecutionTerminalEmulatorSnapshot>(
    () => emulatorController.getSnapshot()
  );
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
  const inputQueueRef = useRef<QueuedTerminalInput[]>([]);
  const queuedInputBytesRef = useRef(0);
  const drainingInputRef = useRef(false);
  const lastSizeRef = useRef<
    Readonly<{ columns: number; rows: number }> | undefined
  >(undefined);
  const busyRef = useRef(false);
  const busyOperationRef = useRef(0);
  const sessionGenerationRef = useRef(0);
  const latestAvailabilityRef = useRef(input.availability);
  const availabilityIdentityRef = useRef(
    input.availability.status === 'available'
      ? `available:${input.availability.jobId}`
      : input.availability.status
  );

  const clearCredential = useCallback(() => {
    accessRef.current = undefined;
  }, []);

  const resetEmulator = useCallback(
    (size: ExecutionTerminalSize = defaultTerminalSize) => {
      const snapshot = emulatorController.reset(size);
      setEmulator(snapshot);
      return snapshot;
    },
    [emulatorController]
  );

  const rejectQueuedInputs = useCallback(() => {
    inputQueueRef.current.splice(0).forEach((entry) => entry.resolve(false));
    queuedInputBytesRef.current = 0;
    pendingInputRef.current = undefined;
  }, []);

  const resume = useCallback(async (): Promise<boolean> => {
    const client = input.client;
    const executionId = executionIdRef.current;
    const terminalSessionId = terminalSessionIdRef.current;
    if (!client || !executionId || !terminalSessionId) return false;
    const generation = sessionGenerationRef.current;
    try {
      const resumed = await client.resume({ executionId, terminalSessionId });
      if (
        generation !== sessionGenerationRef.current ||
        executionIdRef.current !== executionId ||
        terminalSessionIdRef.current !== terminalSessionId
      ) {
        return false;
      }
      accessRef.current = resumed.access;
      lastSizeRef.current = resumed.snapshot.size;
      setEmulator(emulatorController.resize(resumed.snapshot.size));
      setView((current) => ({ ...current, phase: 'open', error: undefined }));
      return true;
    } catch {
      if (generation !== sessionGenerationRef.current) return false;
      clearCredential();
      setView((current) => ({
        ...current,
        phase: 'error',
        error: 'reconnect-rejected',
      }));
      return false;
    }
  }, [clearCredential, emulatorController, input.client]);

  const refresh = useCallback(async (): Promise<void> => {
    if (busyRef.current || !input.client || !input.enabled) return;
    const executionId = executionIdRef.current;
    const terminalSessionId = terminalSessionIdRef.current;
    if (!executionId || !terminalSessionId) return;
    const generation = sessionGenerationRef.current;
    const busyOperation = ++busyOperationRef.current;
    busyRef.current = true;
    try {
      let access = accessRef.current;
      if (!access || access.expiresAt <= Date.now() + 5_000) {
        setView((current) => ({ ...current, phase: 'reconnecting' }));
        if (!(await resume())) return;
        if (generation !== sessionGenerationRef.current) return;
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
        if (
          generation !== sessionGenerationRef.current ||
          executionIdRef.current !== executionId ||
          terminalSessionIdRef.current !== terminalSessionId
        ) {
          return;
        }
        let emulatorSnapshot: ExecutionTerminalEmulatorSnapshot;
        try {
          emulatorSnapshot = emulatorController.consume({
            records: result.records,
            gap: result.gap,
          });
        } catch {
          clearCredential();
          setView((current) => ({
            ...current,
            phase: 'error',
            error: 'output-invalid',
          }));
          return;
        }
        cursorRef.current = result.nextCursor;
        setEmulator(emulatorSnapshot);
        setView((current) => ({
          phase: result.status === 'closed' ? 'closed' : 'open',
          records: Object.freeze(
            [...current.records, ...result.records].slice(-maximumLocalRecords)
          ),
          gap:
            current.gap ||
            result.gap ||
            current.records.length + result.records.length >
              maximumLocalRecords,
          error:
            current.error && inputOwnedErrors.has(current.error)
              ? current.error
              : undefined,
        }));
        if (result.status === 'closed') clearCredential();
        if (!result.hasMore) break;
      }
    } catch {
      if (generation !== sessionGenerationRef.current) return;
      setView((current) => ({
        ...current,
        phase: 'reconnecting',
        error: 'transport-disconnected',
      }));
      clearCredential();
    } finally {
      if (busyOperationRef.current === busyOperation) {
        busyRef.current = false;
      }
    }
  }, [
    clearCredential,
    emulatorController,
    input.client,
    input.enabled,
    resume,
  ]);

  const open = useCallback(async (): Promise<boolean> => {
    if (
      !input.client ||
      input.availability.status !== 'available' ||
      busyRef.current
    )
      return false;
    const requestedExecutionId = input.availability.jobId;
    const generation = sessionGenerationRef.current;
    const busyOperation = ++busyOperationRef.current;
    const client = input.client;
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
      const opened = await client.open({
        executionId: requestedExecutionId,
        size: { columns: 100, rows: 30 },
      });
      const latestAvailability = latestAvailabilityRef.current;
      if (
        generation !== sessionGenerationRef.current ||
        latestAvailability.status !== 'available' ||
        latestAvailability.jobId !== requestedExecutionId
      ) {
        await client
          .close({
            executionId: opened.snapshot.executionId,
            terminalSessionId: opened.snapshot.terminalSessionId,
            accessToken: opened.access.token,
          })
          .catch(() => undefined);
        return false;
      }
      executionIdRef.current = opened.snapshot.executionId;
      terminalSessionIdRef.current = opened.snapshot.terminalSessionId;
      accessRef.current = opened.access;
      cursorRef.current = 0;
      clientSequenceRef.current = 1;
      rejectQueuedInputs();
      lastSizeRef.current = opened.snapshot.size;
      resetEmulator(opened.snapshot.size);
      setView({ ...initialView, phase: 'open' });
      return true;
    } catch {
      if (generation !== sessionGenerationRef.current) return false;
      clearCredential();
      setView({
        ...initialView,
        phase: 'error',
        error: 'open-rejected',
      });
      return false;
    } finally {
      if (busyOperationRef.current === busyOperation) {
        busyRef.current = false;
      }
    }
  }, [
    clearCredential,
    input.availability,
    input.client,
    rejectQueuedInputs,
    resetEmulator,
    resume,
  ]);

  const drainInputQueue = useCallback(async (): Promise<void> => {
    if (drainingInputRef.current) return;
    drainingInputRef.current = true;
    try {
      while (inputQueueRef.current.length) {
        const queued = inputQueueRef.current[0]!;
        const access = accessRef.current;
        const executionId = executionIdRef.current;
        const terminalSessionId = terminalSessionIdRef.current;
        if (!input.client || !access || !executionId || !terminalSessionId)
          return;
        const pending = pendingInputRef.current;
        if (pending && pending.data !== queued.data) {
          setView((current) => ({ ...current, error: 'input-pending' }));
          return;
        }
        const clientSequence =
          pending?.clientSequence ?? clientSequenceRef.current;
        pendingInputRef.current = Object.freeze({
          clientSequence,
          data: queued.data,
        });
        let result: ExecutionTerminalWriteResult;
        try {
          result = await input.client.write({
            executionId,
            terminalSessionId,
            accessToken: access.token,
            data: queued.data,
            clientSequence,
          });
        } catch {
          clearCredential();
          setView((current) => ({
            ...current,
            phase: 'reconnecting',
            error: 'input-unacknowledged',
          }));
          return;
        }
        if (result.status === 'accepted' || result.status === 'duplicate') {
          inputQueueRef.current.shift();
          queuedInputBytesRef.current -= queued.byteLength;
          pendingInputRef.current = undefined;
          clientSequenceRef.current += 1;
          queued.resolve(true);
          setView((current) => ({ ...current, error: undefined }));
          continue;
        }
        if (result.status === 'out-of-order' && !queued.resynchronized) {
          // The Broker's expected sequence is authoritative. Adopting it once
          // and resending the exact chunk is what keeps a session usable after
          // a controller checkpoint rewind; pinning the local sequence would
          // silently discard every later keystroke.
          queued.resynchronized = true;
          clientSequenceRef.current = result.expectedClientSequence;
          pendingInputRef.current = Object.freeze({
            clientSequence: result.expectedClientSequence,
            data: queued.data,
          });
          continue;
        }
        // Every remaining status drops this chunk, and a dropped chunk breaks
        // the ordered input stream, so the queue behind it is abandoned instead
        // of being applied out of order. The loss has to reach the author.
        rejectQueuedInputs();
        if (result.status === 'closed') {
          clearCredential();
          setView((current) => ({ ...current, phase: 'closed' }));
          return;
        }
        setView((current) => ({
          ...current,
          error:
            result.status === 'rejected'
              ? 'input-rejected'
              : 'input-desynchronized',
        }));
        return;
      }
    } finally {
      drainingInputRef.current = false;
    }
  }, [clearCredential, input.client, rejectQueuedInputs]);

  const send = useCallback(
    (data: string): Promise<boolean> => {
      const byteLength = new TextEncoder().encode(data).byteLength;
      const access = accessRef.current;
      const executionId = executionIdRef.current;
      const terminalSessionId = terminalSessionIdRef.current;
      if (
        !data ||
        byteLength > EXECUTION_TERMINAL_LIMITS.maximumInputBytes ||
        !input.client ||
        !access ||
        !executionId ||
        !terminalSessionId ||
        inputQueueRef.current.length >= maximumQueuedInputChunks ||
        queuedInputBytesRef.current + byteLength > maximumQueuedInputBytes
      ) {
        setView((current) => ({
          ...current,
          error: 'input-pending',
        }));
        return Promise.resolve(false);
      }
      const queued = new Promise<boolean>((resolve) => {
        inputQueueRef.current.push({
          data,
          byteLength,
          resynchronized: false,
          resolve,
        });
        queuedInputBytesRef.current += byteLength;
      });
      void drainInputQueue();
      return queued;
    },
    [drainInputQueue, input.client]
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
        setEmulator(emulatorController.resize(result.size));
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
    [clearCredential, emulatorController, input.client]
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
    sessionGenerationRef.current += 1;
    busyOperationRef.current += 1;
    busyRef.current = false;
    clearCredential();
    executionIdRef.current = undefined;
    terminalSessionIdRef.current = undefined;
    rejectQueuedInputs();
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
  }, [clearCredential, input.client, rejectQueuedInputs]);

  useEffect(() => {
    latestAvailabilityRef.current = input.availability;
  }, [input.availability]);

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
      rejectQueuedInputs();
    },
    [clearCredential, rejectQueuedInputs]
  );

  useEffect(() => {
    if (view.phase === 'open') void drainInputQueue();
  }, [drainInputQueue, view.phase]);

  useEffect(() => {
    const nextAvailabilityIdentity =
      input.availability.status === 'available'
        ? `available:${input.availability.jobId}`
        : input.availability.status;
    if (availabilityIdentityRef.current !== nextAvailabilityIdentity) {
      availabilityIdentityRef.current = nextAvailabilityIdentity;
      sessionGenerationRef.current += 1;
      busyOperationRef.current += 1;
      busyRef.current = false;
    }
    if (
      input.availability.status === 'available' &&
      (!executionIdRef.current ||
        executionIdRef.current === input.availability.jobId)
    )
      return;
    clearCredential();
    sessionGenerationRef.current += 1;
    busyOperationRef.current += 1;
    busyRef.current = false;
    executionIdRef.current = undefined;
    terminalSessionIdRef.current = undefined;
    rejectQueuedInputs();
    lastSizeRef.current = undefined;
    cursorRef.current = 0;
    clientSequenceRef.current = 1;
    resetEmulator();
    setView(initialView);
  }, [
    clearCredential,
    input.availability,
    input.client,
    rejectQueuedInputs,
    resetEmulator,
  ]);

  const copyText = useMemo(
    () => createExecutionTerminalEmulatorCopyText(emulator),
    [emulator]
  );

  return {
    view,
    emulator,
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
