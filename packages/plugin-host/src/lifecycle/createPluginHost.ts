import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  type PluginDiagnostic,
} from '@prodivix/plugin-contracts';
import type { HostContributionPointMap } from '#host/contribution/contribution.types';
import { createAvailabilityLifecycle } from '#host/lifecycle/availabilityLifecycle';
import {
  createPluginHostContext,
  hasErrorDiagnostic,
  type PluginHostContext,
} from '#host/lifecycle/pluginHostContext';
import { createPermissionLifecycle } from '#host/lifecycle/permissionLifecycle';
import { createRuntimeLifecycle } from '#host/lifecycle/runtimeLifecycle';
import type {
  CreatePluginHostOptions,
  PluginHost,
} from '#host/lifecycle/pluginHost';
import {
  asNonEmptyDiagnostics,
  pluginHostFailure,
  pluginHostSuccess,
  type PluginHostResult,
} from '#host/result';

const createRetry =
  <TMap extends HostContributionPointMap>(
    context: PluginHostContext<TMap>,
    discover: PluginHost<TMap>['discover'],
    activate: PluginHost<TMap>['activate'],
    deactivate: PluginHost<TMap>['deactivate']
  ): PluginHost<TMap>['retry'] =>
  async (pluginId) => {
    const record = context.records.get(pluginId);
    if (!record) {
      return context.invalidOperation(pluginId, 'Plugin is not discovered.');
    }
    if (
      record.snapshot.availability === 'failed' ||
      record.snapshot.availability === 'blocked' ||
      record.snapshot.availability === 'disabled'
    ) {
      return discover(record.source);
    }
    if (record.snapshot.runtime === 'failed') {
      const deactivated = await deactivate(pluginId, 'manual');
      if (!deactivated.ok) return deactivated;
      return activate(
        pluginId,
        record.lastActivationEvent ?? { type: 'manual' }
      );
    }
    return pluginHostSuccess(record.snapshot);
  };

export const createPluginHost = <TMap extends HostContributionPointMap>(
  options: CreatePluginHostOptions<TMap>
): PluginHostResult<PluginHost<TMap>> => {
  const contextResult = createPluginHostContext(options);
  if (!contextResult.ok) return contextResult;
  const context = contextResult.value;
  const availability = createAvailabilityLifecycle(context);
  const runtime = createRuntimeLifecycle(context);
  const permission = createPermissionLifecycle(context);
  const retry = createRetry(
    context,
    availability.discover,
    runtime.activate,
    runtime.deactivate
  );

  let state: 'running' | 'shutting-down' | 'shutdown' = 'running';
  let shutdownPromise: Promise<PluginHostResult<void>> | undefined;

  const rejectAfterShutdown = <T>(pluginId?: string): PluginHostResult<T> =>
    pluginHostFailure([
      createPluginDiagnostic(
        PLUGIN_DIAGNOSTIC_CODES.INVALID_HOST_TRANSITION,
        state === 'shutting-down'
          ? 'Plugin Host is shutting down and does not accept new operations.'
          : 'Plugin Host has shut down and does not accept new operations.',
        { pluginId }
      ),
    ]);

  const shutdown: PluginHost<TMap>['shutdown'] = () => {
    if (shutdownPromise) return shutdownPromise;
    state = 'shutting-down';
    context.beginShutdown();
    shutdownPromise = (async () => {
      const diagnostics: PluginDiagnostic[] = [];
      const pluginIds = [...context.records.keys()].sort((left, right) =>
        left.localeCompare(right)
      );
      for (const pluginId of pluginIds) {
        try {
          const deactivated = await runtime.deactivate(
            pluginId,
            'host-shutdown'
          );
          diagnostics.push(...deactivated.diagnostics);
          const disabled = await availability.disable(pluginId);
          diagnostics.push(...disabled.diagnostics);
        } catch {
          diagnostics.push(
            createPluginDiagnostic(
              PLUGIN_DIAGNOSTIC_CODES.OWNER_CLEANUP_FAILED,
              'Plugin Host shutdown failed unexpectedly while cleaning a plugin owner.',
              { pluginId, reasonCode: 'host-shutdown' }
            )
          );
        }
      }

      context.registry.close();
      context.listeners.clear();
      context.records.clear();
      context.currentOwners.clear();
      context.permissionsByOwner.clear();
      context.operations.clear();
      context.generations.clear();
      state = 'shutdown';

      if (hasErrorDiagnostic(diagnostics)) {
        return pluginHostFailure(
          asNonEmptyDiagnostics(diagnostics) ?? [
            createPluginDiagnostic(
              PLUGIN_DIAGNOSTIC_CODES.OWNER_CLEANUP_FAILED,
              'Plugin Host shutdown failed without a cleanup diagnostic.'
            ),
          ]
        );
      }
      return pluginHostSuccess(undefined, diagnostics);
    })();
    return shutdownPromise;
  };

  return pluginHostSuccess(
    Object.freeze({
      discover: (source, signal) =>
        state === 'running'
          ? availability.discover(source, signal)
          : Promise.resolve(rejectAfterShutdown()),
      enable: (pluginId) =>
        state === 'running'
          ? availability.enable(pluginId)
          : Promise.resolve(rejectAfterShutdown(pluginId)),
      disable: (pluginId) =>
        state === 'running'
          ? availability.disable(pluginId)
          : Promise.resolve(rejectAfterShutdown(pluginId)),
      activate: (pluginId, event) =>
        state === 'running'
          ? runtime.activate(pluginId, event)
          : Promise.resolve(rejectAfterShutdown(pluginId)),
      deactivate: (pluginId, reason) =>
        state === 'running'
          ? runtime.deactivate(pluginId, reason)
          : Promise.resolve(rejectAfterShutdown(pluginId)),
      reconcilePermissions: (pluginId) =>
        state === 'running'
          ? permission.reconcilePermissions(pluginId)
          : Promise.resolve(rejectAfterShutdown(pluginId)),
      retry: (pluginId) =>
        state === 'running'
          ? retry(pluginId)
          : Promise.resolve(rejectAfterShutdown(pluginId)),
      shutdown,
      getSnapshot: (pluginId) => context.records.get(pluginId)?.snapshot,
      listSnapshots: () =>
        Object.freeze(
          [...context.records.values()]
            .map((record) => record.snapshot)
            .sort((left, right) => left.pluginId.localeCompare(right.pluginId))
        ),
      subscribe: (listener) => {
        if (state !== 'running') {
          return Object.freeze({ dispose: () => {} });
        }
        context.listeners.add(listener);
        let disposed = false;
        return Object.freeze({
          dispose: () => {
            if (disposed) return;
            disposed = true;
            context.listeners.delete(listener);
          },
        });
      },
      contributions: context.registry,
    })
  );
};
