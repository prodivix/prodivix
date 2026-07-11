import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  type PluginDiagnostic,
} from '@prodivix/plugin-contracts';
import { createPluginOwnerRef, pluginOwnerKey } from '#host/identity';
import {
  disposePreparedContributions,
  stagePreparedContributions,
} from '#host/lifecycle/hostContributionOperations';
import { readAndValidatePluginManifest } from '#host/lifecycle/hostValidation';
import {
  hasErrorDiagnostic,
  operationFailure,
  type PluginHostContext,
} from '#host/lifecycle/pluginHostContext';
import { createPluginHostRecord } from '#host/lifecycle/pluginHostRecord';
import type { PluginHost } from '#host/lifecycle/pluginHost';
import type { HostContributionPointMap } from '#host/contribution/contribution.types';
import type { PluginHostSnapshot } from '#host/host.types';
import {
  pluginHostFailure,
  pluginHostSuccess,
  type PluginHostResult,
} from '#host/result';

export type AvailabilityLifecycle<TMap extends HostContributionPointMap> =
  Readonly<{
    discover: PluginHost<TMap>['discover'];
    enable: PluginHost<TMap>['enable'];
    disable: PluginHost<TMap>['disable'];
  }>;

export const createAvailabilityLifecycle = <
  TMap extends HostContributionPointMap,
>(
  context: PluginHostContext<TMap>
): AvailabilityLifecycle<TMap> => {
  const publishFailedCandidate = async (
    candidate: ReturnType<typeof createPluginHostRecord<TMap>>,
    previous: ReturnType<typeof createPluginHostRecord<TMap>> | undefined,
    operation: Parameters<PluginHostContext<TMap>['endOperation']>[0],
    diagnostics: readonly PluginDiagnostic[]
  ): Promise<PluginHostResult<PluginHostSnapshot>> => {
    const cleanup = await context.disposePendingActivation(
      candidate,
      operation.operationId
    );
    context.permissionsByOwner.delete(pluginOwnerKey(candidate.owner));
    const allDiagnostics = [...diagnostics, ...cleanup];
    if (!previous && operation.superseded) {
      if (context.records.get(candidate.owner.pluginId) === candidate) {
        context.records.delete(candidate.owner.pluginId);
      }
      if (
        context.currentOwners.get(candidate.owner.pluginId) === candidate.owner
      ) {
        context.currentOwners.delete(candidate.owner.pluginId);
      }
    } else if (!previous) {
      context.records.set(candidate.owner.pluginId, candidate);
      context.currentOwners.set(candidate.owner.pluginId, candidate.owner);
      context.publishSnapshot(candidate, {
        availability: 'failed',
        runtime: candidate.manifest.entrypoints?.runtime
          ? 'failed'
          : 'not-applicable',
        diagnostics: allDiagnostics,
      });
    }
    const auditDiagnostics = await context.appendAudit(
      candidate,
      operation.operationId,
      'validation',
      'discover',
      operation.superseded ? 'canceled' : 'failed',
      allDiagnostics
    );
    return operationFailure([...allDiagnostics, ...auditDiagnostics]);
  };

  const canceledDiscovery = (pluginId?: string) =>
    pluginHostFailure([
      createPluginDiagnostic(
        PLUGIN_DIAGNOSTIC_CODES.OPERATION_SUPERSEDED,
        'Plugin discovery was canceled before it could commit.',
        { pluginId }
      ),
    ]);

  const discover: PluginHost<TMap>['discover'] = async (source, signal) => {
    if (signal?.aborted) return canceledDiscovery();
    const discoverySignal = signal
      ? AbortSignal.any([context.hostSignal, signal])
      : context.hostSignal;
    const manifestResult = await readAndValidatePluginManifest(source, {
      hostVersion: context.options.hostVersion,
      knownCommandIds: context.options.knownCommandIds,
      signal: discoverySignal,
    });
    if (signal?.aborted) return canceledDiscovery();
    if (!manifestResult.ok) return manifestResult;
    const manifest = manifestResult.value;
    if (context.hostSignal.aborted) {
      return context.invalidOperation(
        manifest.id,
        'Plugin Host is shutting down and no longer accepts discovery.'
      );
    }
    context.supersedeOperation(manifest.id);

    return context.coordinator.run(manifest.id, async () => {
      if (signal?.aborted) return canceledDiscovery(manifest.id);
      if (context.hostSignal.aborted) {
        return context.invalidOperation(
          manifest.id,
          'Plugin Host is shutting down and no longer accepts discovery.'
        );
      }
      const previous = context.records.get(manifest.id);
      const generation = (context.generations.get(manifest.id) ?? 0) + 1;
      context.generations.set(manifest.id, generation);
      const owner = createPluginOwnerRef(
        manifest.id,
        source.installationId,
        generation
      );
      const candidate = createPluginHostRecord<TMap>({
        source,
        owner,
        manifest,
      });
      const operation = context.beginOperation(owner, 'discover');
      const abortOperation = () => {
        operation.superseded = true;
        if (!operation.controller.signal.aborted) {
          operation.controller.abort(
            typeof signal?.reason === 'string'
              ? signal.reason
              : 'discovery-canceled'
          );
        }
      };
      signal?.addEventListener('abort', abortOperation, { once: true });
      if (signal?.aborted) abortOperation();
      const diagnostics: PluginDiagnostic[] = [...manifestResult.diagnostics];

      if (!previous) {
        context.records.set(manifest.id, candidate);
        context.currentOwners.set(manifest.id, owner);
        context.notifySnapshot(candidate);
      }
      context.publishSnapshot(candidate, {
        availability: 'validating',
        diagnostics: [],
      });

      try {
        const permissionResult = await context.resolveRecordPermission(
          candidate,
          operation,
          previous?.permission
        );
        if (!permissionResult.ok) {
          return publishFailedCandidate(candidate, previous, operation, [
            ...diagnostics,
            ...permissionResult.diagnostics,
          ]);
        }
        candidate.permission = permissionResult.value;
        context.permissionsByOwner.set(
          pluginOwnerKey(candidate.owner),
          permissionResult.value
        );
        diagnostics.push(...permissionResult.diagnostics);

        if (!context.operationIsCurrent(operation)) {
          return publishFailedCandidate(candidate, previous, operation, [
            ...diagnostics,
            context.supersededDiagnostic(candidate, operation),
          ]);
        }

        if (candidate.permission.deniedRequired.length > 0) {
          const cleanupDiagnostics = previous
            ? await context.cleanupRecord(
                previous,
                operation.operationId,
                'generation-replaced',
                true
              )
            : [];
          diagnostics.push(...cleanupDiagnostics);
          context.currentOwners.set(manifest.id, candidate.owner);
          context.records.set(manifest.id, candidate);
          if (previous) {
            context.permissionsByOwner.delete(pluginOwnerKey(previous.owner));
          }
          const availability = hasErrorDiagnostic(cleanupDiagnostics)
            ? 'failed'
            : 'blocked';
          diagnostics.push(
            ...context.publishSnapshot(candidate, {
              availability,
              runtime: manifest.entrypoints?.runtime
                ? 'inactive'
                : 'not-applicable',
              diagnostics,
            })
          );
          diagnostics.push(
            ...(await context.appendAudit(
              candidate,
              operation.operationId,
              'permission',
              'resolve',
              availability === 'blocked' ? 'denied' : 'failed',
              diagnostics
            ))
          );
          return availability === 'blocked'
            ? pluginHostSuccess(candidate.snapshot, diagnostics)
            : operationFailure(diagnostics);
        }

        const preparedResult = await context.prepareRecordPackage(
          candidate,
          operation
        );
        if (!preparedResult.ok) {
          return publishFailedCandidate(candidate, previous, operation, [
            ...diagnostics,
            ...preparedResult.diagnostics,
          ]);
        }
        diagnostics.push(...preparedResult.diagnostics);
        candidate.descriptors = preparedResult.value.descriptors;
        candidate.pendingActivation = preparedResult.value.activation;
        candidate.activationContributionIds = new Set(
          preparedResult.value.activation.map((entry) => entry.declaration.id)
        );

        if (!context.operationIsCurrent(operation)) {
          const preparedCleanup = await disposePreparedContributions(
            preparedResult.value.installation,
            candidate.owner,
            operation.operationId
          );
          return publishFailedCandidate(candidate, previous, operation, [
            ...diagnostics,
            context.supersededDiagnostic(candidate, operation),
            ...preparedCleanup,
          ]);
        }

        if (previous) {
          const retirementDiagnostics = await context.cleanupRecord(
            previous,
            operation.operationId,
            'generation-replaced',
            false
          );
          diagnostics.push(...retirementDiagnostics);
          if (hasErrorDiagnostic(retirementDiagnostics)) {
            const preparedCleanup = await disposePreparedContributions(
              preparedResult.value.installation,
              candidate.owner,
              operation.operationId
            );
            return publishFailedCandidate(candidate, previous, operation, [
              ...diagnostics,
              ...preparedCleanup,
            ]);
          }
        }

        context.currentOwners.set(manifest.id, candidate.owner);
        const transaction = context.registry.beginTransaction({
          owner: candidate.owner,
          expectedRegistryRevision: context.registry.getRevision(),
          expectedPermissionRevision: candidate.permission.permissionRevision,
          lifetime: 'installation',
          operationId: operation.operationId,
          replaceOwner: previous?.owner,
        });
        const staged = await stagePreparedContributions(
          transaction,
          candidate.owner,
          preparedResult.value.installation,
          operation.operationId,
          'installation'
        );
        if (!staged.ok) {
          if (previous) context.currentOwners.set(manifest.id, previous.owner);
          return publishFailedCandidate(candidate, previous, operation, [
            ...diagnostics,
            ...staged.diagnostics,
          ]);
        }
        const committed = await transaction.commit();
        diagnostics.push(...committed.diagnostics);
        if (!committed.ok) {
          if (transaction.getState() !== 'committed' && previous) {
            context.currentOwners.set(manifest.id, previous.owner);
          } else {
            context.records.set(manifest.id, candidate);
            await context.cleanupRecord(
              candidate,
              operation.operationId,
              'activation-rollback',
              true
            );
          }
          return publishFailedCandidate(
            candidate,
            transaction.getState() === 'committed' ? undefined : previous,
            operation,
            diagnostics
          );
        }

        context.records.set(manifest.id, candidate);
        context.currentOwners.set(manifest.id, candidate.owner);
        if (previous) {
          context.permissionsByOwner.delete(pluginOwnerKey(previous.owner));
        }
        diagnostics.push(
          ...context.publishSnapshot(candidate, {
            availability: 'ready',
            runtime: manifest.entrypoints?.runtime
              ? 'inactive'
              : 'not-applicable',
            diagnostics,
          })
        );
        diagnostics.push(
          ...(await context.appendAudit(
            candidate,
            operation.operationId,
            'registry',
            'discover-commit',
            'success',
            diagnostics
          ))
        );
        return pluginHostSuccess(candidate.snapshot, diagnostics);
      } finally {
        signal?.removeEventListener('abort', abortOperation);
        context.endOperation(operation);
      }
    });
  };

  const disable: PluginHost<TMap>['disable'] = (pluginId) => {
    context.supersedeOperation(pluginId);
    return context.coordinator.run(pluginId, async () => {
      const record = context.records.get(pluginId);
      if (!record) {
        return context.invalidOperation(pluginId, 'Plugin is not discovered.');
      }
      if (record.snapshot.availability === 'disabled') {
        return pluginHostSuccess(record.snapshot);
      }
      const operation = context.beginOperation(record.owner, 'disable');
      try {
        const diagnostics = [
          ...(await context.cleanupRecord(
            record,
            operation.operationId,
            'disable',
            true
          )),
        ];
        const failed = hasErrorDiagnostic(diagnostics);
        diagnostics.push(
          ...context.publishSnapshot(record, {
            availability: failed ? 'failed' : 'disabled',
            runtime: record.manifest.entrypoints?.runtime
              ? failed
                ? 'failed'
                : 'inactive'
              : 'not-applicable',
            diagnostics,
          })
        );
        diagnostics.push(
          ...(await context.appendAudit(
            record,
            operation.operationId,
            'cleanup',
            'disable',
            failed ? 'failed' : 'success',
            diagnostics
          ))
        );
        return failed
          ? operationFailure(diagnostics)
          : pluginHostSuccess(record.snapshot, diagnostics);
      } finally {
        context.endOperation(operation);
      }
    });
  };

  const enable: PluginHost<TMap>['enable'] = async (pluginId) => {
    const record = context.records.get(pluginId);
    if (!record) {
      return context.invalidOperation(pluginId, 'Plugin is not discovered.');
    }
    if (record.snapshot.availability === 'ready') {
      return pluginHostSuccess(record.snapshot);
    }
    return discover(record.source);
  };

  return Object.freeze({ discover, enable, disable });
};
