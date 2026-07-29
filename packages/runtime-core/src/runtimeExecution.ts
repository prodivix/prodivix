export type RuntimeStatePatch = Record<string, unknown>;

export type RuntimeExecutionSource = {
  ownerId: string;
  trigger: string;
  eventKey: string;
};

export type RuntimeExecutionRequest<
  TParams extends Record<string, unknown> = Record<string, unknown>,
> = {
  requestId: string;
  source: RuntimeExecutionSource;
  params?: TParams;
  input?: unknown;
};

export type RuntimeCancellationListener = (reason: unknown) => void;

export type RuntimeCancellationSignal = Readonly<{
  readonly aborted: boolean;
  readonly reason?: unknown;
}>;

export type RuntimeLiveCancellationSignal = RuntimeCancellationSignal &
  Readonly<{
    subscribe(listener: RuntimeCancellationListener): () => void;
    throwIfAborted(): void;
  }>;

export type RuntimeCancellationController = Readonly<{
  signal: RuntimeLiveCancellationSignal;
  abort(reason?: unknown): boolean;
}>;

export type CreateRuntimeCancellationControllerInput = Readonly<{
  onListenerError?: (error: unknown) => void;
}>;

export class RuntimeCancellationError extends Error {
  readonly reason?: unknown;

  constructor(reason?: unknown) {
    super(
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string' && reason
          ? reason
          : 'Runtime execution was cancelled.'
    );
    this.name = 'RuntimeCancellationError';
    if (reason !== undefined) this.reason = reason;
  }
}

/**
 * Creates the transport-neutral cancellation primitive shared by local,
 * browser, worker, and remote runtime adapters. Cancellation is monotonic and
 * idempotent; late subscribers observe the already committed reason
 * synchronously.
 */
export const createRuntimeCancellationController = (
  input: CreateRuntimeCancellationControllerInput = {}
): RuntimeCancellationController => {
  const listeners = new Set<RuntimeCancellationListener>();
  let aborted = false;
  let reason: unknown;

  const reportListenerError = (error: unknown): void => {
    try {
      input.onListenerError?.(error);
    } catch {
      // Listener diagnostics are observational and cannot alter cancellation.
    }
  };

  const signal: RuntimeLiveCancellationSignal = Object.freeze({
    get aborted() {
      return aborted;
    },
    get reason() {
      return reason;
    },
    subscribe(listener) {
      if (aborted) {
        try {
          listener(reason);
        } catch (error) {
          reportListenerError(error);
        }
        return () => undefined;
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    throwIfAborted() {
      if (aborted) throw new RuntimeCancellationError(reason);
    },
  });

  return Object.freeze({
    signal,
    abort(abortReason) {
      if (aborted) return false;
      aborted = true;
      reason = abortReason;
      const pending = [...listeners];
      listeners.clear();
      pending.forEach((listener) => {
        try {
          listener(reason);
        } catch (error) {
          reportListenerError(error);
        }
      });
      return true;
    },
  });
};

export type RuntimeTraceEvent<
  TKind extends string = string,
  TDetail extends Record<string, unknown> = Record<string, unknown>,
> = {
  sequence: number;
  kind: TKind;
  detail: TDetail;
};

export const mergeRuntimeStatePatch = (
  current: RuntimeStatePatch,
  next: RuntimeStatePatch | undefined
): RuntimeStatePatch =>
  next && Object.keys(next).length ? { ...current, ...next } : current;
