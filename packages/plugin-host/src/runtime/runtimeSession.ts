import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  type PluginDiagnostic,
  type PluginDiagnosticCode,
} from '@prodivix/plugin-contracts';
import type { PluginOwnerRef } from '#host/identity';
import type {
  PluginRuntimeSession,
  RuntimeDeactivationReason,
} from '#host/runtime/pluginRuntimeAdapter';
import type { PluginHostResult } from '#host/result';

export type RuntimeOperationOutcome<T> =
  | Readonly<{ kind: 'completed'; result: PluginHostResult<T> }>
  | Readonly<{ kind: 'timed-out'; diagnostic: PluginDiagnostic }>
  | Readonly<{ kind: 'superseded'; diagnostic: PluginDiagnostic }>;

export type RuntimeOperationContext = Readonly<{
  owner: PluginOwnerRef;
  pluginVersion: string;
  operationId: string;
  timeoutMs: number;
  controller: AbortController;
  failureCode?: PluginDiagnosticCode;
  failureMessage?: string;
}>;

const runtimeMeta = (context: RuntimeOperationContext) => ({
  pluginId: context.owner.pluginId,
  pluginVersion: context.pluginVersion,
  installationId: context.owner.installationId,
  generation: context.owner.generation,
  operationId: context.operationId,
});

export const runRuntimeOperation = async <T>(
  context: RuntimeOperationContext,
  operation: () => Promise<PluginHostResult<T>>,
  onLateSuccess?: (value: T) => void | Promise<void>
): Promise<RuntimeOperationOutcome<T>> => {
  let removeAbortListener = () => {};
  const abortOutcome = new Promise<'timed-out' | 'superseded'>((resolve) => {
    const onAbort = () =>
      resolve(
        context.controller.signal.reason === 'runtime-timeout'
          ? 'timed-out'
          : 'superseded'
      );
    if (context.controller.signal.aborted) {
      onAbort();
      return;
    }
    context.controller.signal.addEventListener('abort', onAbort, {
      once: true,
    });
    removeAbortListener = () =>
      context.controller.signal.removeEventListener('abort', onAbort);
  });
  const operationPromise = Promise.resolve()
    .then(operation)
    .catch((): PluginHostResult<T> => ({
      ok: false,
      diagnostics: [
        createPluginDiagnostic(
          context.failureCode ??
            PLUGIN_DIAGNOSTIC_CODES.RUNTIME_ACTIVATION_FAILED,
          context.failureMessage ??
            'Plugin runtime adapter failed unexpectedly.',
          runtimeMeta(context)
        ),
      ],
    }));
  const timeoutId = setTimeout(
    () => context.controller.abort('runtime-timeout'),
    context.timeoutMs
  );

  const outcome = await Promise.race([
    operationPromise.then((result) => ({ kind: 'completed' as const, result })),
    abortOutcome.then((kind) => ({ kind })),
  ]);
  clearTimeout(timeoutId);
  removeAbortListener();
  if (outcome.kind === 'completed') return outcome;

  void operationPromise.then(async (result) => {
    if (result.ok && onLateSuccess) {
      try {
        await onLateSuccess(result.value);
      } catch {
        return;
      }
    }
  });
  if (outcome.kind === 'timed-out') {
    return {
      kind: 'timed-out',
      diagnostic: createPluginDiagnostic(
        PLUGIN_DIAGNOSTIC_CODES.RUNTIME_TIMEOUT,
        `Plugin runtime operation exceeded the ${context.timeoutMs} ms timeout.`,
        { ...runtimeMeta(context), limit: context.timeoutMs }
      ),
    };
  }
  return {
    kind: 'superseded',
    diagnostic: createPluginDiagnostic(
      PLUGIN_DIAGNOSTIC_CODES.OPERATION_SUPERSEDED,
      'Plugin runtime operation was superseded by a newer Host operation.',
      runtimeMeta(context)
    ),
  };
};

export const deactivateLateRuntimeSession = async (
  session: PluginRuntimeSession,
  timeoutMs: number,
  reason: RuntimeDeactivationReason = 'activation-rollback'
): Promise<void> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort('runtime-timeout'),
    timeoutMs
  );
  try {
    await Promise.race([
      session.deactivate(reason, controller.signal),
      new Promise<void>((resolve) =>
        controller.signal.addEventListener('abort', () => resolve(), {
          once: true,
        })
      ),
    ]);
  } catch {
    return;
  } finally {
    clearTimeout(timeoutId);
  }
};
