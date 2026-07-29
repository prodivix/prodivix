import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type {
  VerificationAbortController,
  VerificationAbortSignal,
  VerificationAdapterCleanupResult,
} from './verificationAdapterRuntime.types';
import {
  VerificationLifecycleCancelledError,
  VerificationLifecycleContractError,
  VerificationLifecycleTimeoutError,
} from './verificationAdapterLifecycleValidation';

declare const setTimeout: (callback: () => void, delayMs: number) => unknown;
declare const clearTimeout: (handle: unknown) => void;

const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

export const createVerificationAbortController =
  (): VerificationAbortController => {
    let aborted = false;
    let reason: string | undefined;
    const listeners = new Set<(reason?: string) => void>();
    const signal: VerificationAbortSignal = Object.freeze({
      get aborted(): boolean {
        return aborted;
      },
      get reason(): string | undefined {
        return reason;
      },
      subscribe(listener: (reason?: string) => void): () => void {
        if (aborted) {
          try {
            listener(reason);
          } catch {
            // One consumer cannot prevent the Core signal from settling.
          }
          return () => undefined;
        }
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    });
    return Object.freeze({
      signal,
      abort(nextReason?: string): void {
        if (aborted) return;
        aborted = true;
        reason =
          nextReason === undefined || !TOKEN_PATTERN.test(nextReason)
            ? 'verification-aborted'
            : nextReason;
        const pendingListeners = [...listeners];
        listeners.clear();
        for (const listener of pendingListeners) {
          try {
            listener(reason);
          } catch {
            // Abort fan-out is best effort per listener and always completes.
          }
        }
      },
    });
  };

export const runGuarded = async <T>(
  operation: () => Promise<T>,
  signal: VerificationAbortSignal,
  controller: VerificationAbortController,
  deadlineAt: number,
  onStarted?: (operation: Promise<T>) => void
): Promise<T> => {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) {
    controller.abort('verification-adapter-timeout');
    throw new VerificationLifecycleTimeoutError();
  }
  if (signal.aborted) {
    throw signal.reason === 'verification-adapter-timeout'
      ? new VerificationLifecycleTimeoutError()
      : new VerificationLifecycleCancelledError();
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timeoutTriggered = false;
    let timer: unknown;
    let unsubscribe = (): void => undefined;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      try {
        unsubscribe();
      } catch {
        // Core-created signal subscriptions are isolated during teardown too.
      }
      callback();
    };
    try {
      const candidate = signal.subscribe(() => {
        if (!timeoutTriggered) {
          finish(() => reject(new VerificationLifecycleCancelledError()));
        }
      });
      if (typeof candidate !== 'function') {
        throw new VerificationLifecycleContractError(
          'VER-4001',
          'Abort signal subscription did not return an unsubscribe function.'
        );
      }
      unsubscribe = candidate;
    } catch (error) {
      finish(() => reject(error));
    }
    if (settled) return;
    timer = setTimeout(() => {
      timeoutTriggered = true;
      controller.abort('verification-adapter-timeout');
      finish(() => reject(new VerificationLifecycleTimeoutError()));
    }, remainingMs);
    let pending: Promise<T>;
    try {
      pending = operation();
    } catch (error) {
      finish(() => reject(error));
      return;
    }
    onStarted?.(pending);
    pending.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error))
    );
  });
};

export const createOperationTracker = (): Readonly<{
  track<T>(operation: Promise<T>): void;
  drain(): Promise<void>;
}> => {
  const pending = new Set<Promise<unknown>>();
  return Object.freeze({
    track<T>(operation: Promise<T>): void {
      pending.add(operation);
      void operation.then(
        () => pending.delete(operation),
        () => pending.delete(operation)
      );
    },
    async drain(): Promise<void> {
      while (pending.size > 0) {
        await Promise.allSettled([...pending]);
      }
    },
  });
};

export const addCleanupResidual = (
  cleanup: VerificationAdapterCleanupResult,
  residualCanaryId: string
): VerificationAdapterCleanupResult =>
  Object.freeze({
    status: 'residual',
    residualCanaryIds: Object.freeze(
      [...new Set([...cleanup.residualCanaryIds, residualCanaryId])].sort(
        compareUnicodeCodePoints
      )
    ),
    diagnosticCodes: Object.freeze(
      [...new Set([...cleanup.diagnosticCodes, 'VER-4002'])].sort(
        compareUnicodeCodePoints
      )
    ),
  });
