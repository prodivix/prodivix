import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  type ActivationEvent,
  type PluginDiagnostic,
} from '@prodivix/plugin-contracts';
import { isCapabilityGranted } from '#host/capability/permissionSnapshot';
import { prepareValidatedContributions } from '#host/contribution/contributionPreparation';
import type {
  HostContributionPointMap,
  PreparedContributionEntry,
} from '#host/contribution/contribution.types';
import type { PluginOwnerRef } from '#host/identity';
import { isSamePluginOwner } from '#host/identity';
import {
  createScopedContributionTransaction,
  disposePreparedContributions,
  stagePreparedContributions,
} from '#host/lifecycle/hostContributionOperations';
import {
  hasErrorDiagnostic,
  operationFailure,
  type PluginHostContext,
} from '#host/lifecycle/pluginHostContext';
import type { PluginHost } from '#host/lifecycle/pluginHost';
import type { PluginHostSnapshot } from '#host/host.types';
import {
  deactivateLateRuntimeSession,
  runRuntimeOperation,
} from '#host/runtime/runtimeSession';
import type {
  PluginRuntimeSession,
  RuntimeDeactivationReason,
  RuntimeTerminationEvent,
} from '#host/runtime/pluginRuntimeAdapter';
import { loadVerifiedRuntimeArtifact } from '#host/runtime/runtimeArtifact';
import {
  pluginHostFailure,
  pluginHostSuccess,
  type PluginHostResult,
} from '#host/result';

export type RuntimeLifecycle<TMap extends HostContributionPointMap> = Readonly<{
  activate: PluginHost<TMap>['activate'];
  deactivate: PluginHost<TMap>['deactivate'];
}>;

const MAX_ACTIVATION_TRANSACTION_ATTEMPTS = 3;

const matchesActivationEvent = (
  declared: ActivationEvent,
  actual: ActivationEvent
): boolean => {
  if (declared.type !== actual.type) return false;
  if (declared.type === 'command' && actual.type === 'command') {
    return declared.commandId === actual.commandId;
  }
  if (
    declared.type === 'contribution.use' &&
    actual.type === 'contribution.use'
  ) {
    return (
      declared.point === actual.point &&
      (declared.contributionId === undefined ||
        declared.contributionId === actual.contributionId)
    );
  }
  return true;
};

export const createRuntimeLifecycle = <TMap extends HostContributionPointMap>(
  context: PluginHostContext<TMap>
): RuntimeLifecycle<TMap> => {
  const activationPromises = new Map<
    string,
    Promise<PluginHostResult<PluginHostSnapshot>>
  >();

  const prepareActivationEntries = async (
    record: NonNullable<ReturnType<typeof context.records.get>>,
    operation: Parameters<PluginHostContext<TMap>['endOperation']>[0]
  ): Promise<PluginHostResult<readonly PreparedContributionEntry<TMap>[]>> => {
    if (record.pendingActivation.length > 0) {
      const pending = record.pendingActivation;
      record.pendingActivation = Object.freeze([]);
      return pluginHostSuccess(pending);
    }
    if (record.activationContributionIds.size === 0 || !record.permission) {
      return pluginHostSuccess(Object.freeze([]));
    }
    const descriptors = record.descriptors.filter((descriptor) =>
      record.activationContributionIds.has(descriptor.declaration.id)
    );
    const prepared = await prepareValidatedContributions({
      owner: record.owner,
      attestation: record.source.attestation,
      manifest: record.manifest,
      permission: record.permission,
      descriptors,
      operationId: operation.operationId,
      signal: operation.controller.signal,
    });
    if (!prepared.ok) return prepared;
    const invalid = prepared.value.find(
      (entry) => entry.prepared.lifetime !== 'activation'
    );
    if (invalid) {
      const cleanup = await disposePreparedContributions(
        prepared.value,
        record.owner,
        operation.operationId
      );
      return pluginHostFailure([
        createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOLVER_FAILED,
          `Contribution ${JSON.stringify(invalid.declaration.id)} changed lifetime between activations.`,
          {
            pluginId: record.owner.pluginId,
            pluginVersion: record.manifest.version,
            installationId: record.owner.installationId,
            generation: record.owner.generation,
            operationId: operation.operationId,
            contributionId: invalid.declaration.id,
            contributionPoint: invalid.declaration.point,
          }
        ),
        ...cleanup,
      ]);
    }
    return prepared;
  };

  const handleRuntimeTermination = (
    pluginId: string,
    owner: PluginOwnerRef,
    sessionToken: string,
    event: RuntimeTerminationEvent
  ): void => {
    void context.coordinator.run(pluginId, async () => {
      const record = context.records.get(pluginId);
      if (
        !record ||
        !isSamePluginOwner(record.owner, owner) ||
        record.runtimeSession?.token !== sessionToken ||
        event.sessionToken !== sessionToken
      ) {
        return;
      }
      const operation = context.beginOperation(
        record.owner,
        'runtime-termination'
      );
      try {
        const managed = record.runtimeSession;
        record.runtimeSession = undefined;
        try {
          await managed?.terminationSubscription.dispose();
        } catch {
          // The session is already terminating; a failing unsubscribe must not stop
          // the owner-scoped contribution cleanup that follows.
        }
        const cleanup = await context.registry.disposeByOwner(record.owner, {
          operationId: operation.operationId,
          lifetime: 'activation',
        });
        const diagnostic = createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.RUNTIME_TERMINATED,
          'Plugin runtime transport terminated unexpectedly.',
          {
            pluginId: record.owner.pluginId,
            pluginVersion: record.manifest.version,
            installationId: record.owner.installationId,
            generation: record.owner.generation,
            operationId: operation.operationId,
            reasonCode: event.reasonCode,
          }
        );
        const diagnostics = [diagnostic, ...cleanup.diagnostics];
        context.publishSnapshot(record, {
          runtime: 'failed',
          diagnostics,
        });
        await context.appendAudit(
          record,
          operation.operationId,
          'runtime',
          'terminated',
          'failed',
          diagnostics
        );
      } finally {
        context.endOperation(operation);
      }
    });
  };

  const activateInternal = (
    pluginId: string,
    event: ActivationEvent
  ): Promise<PluginHostResult<PluginHostSnapshot>> =>
    context.coordinator.run(pluginId, async () => {
      const record = context.records.get(pluginId);
      if (!record) {
        return context.invalidOperation(pluginId, 'Plugin is not discovered.');
      }
      if (record.snapshot.availability !== 'ready') {
        return context.invalidOperation(
          pluginId,
          'Only a ready plugin can activate its runtime.',
          record
        );
      }
      if (!record.manifest.entrypoints?.runtime) {
        return context.invalidOperation(
          pluginId,
          'Declarative plugins do not have an activatable runtime.',
          record
        );
      }
      const runtimeEntrypoint = record.manifest.entrypoints.runtime;
      if (record.snapshot.runtime === 'active') {
        return pluginHostSuccess(record.snapshot);
      }
      if (record.snapshot.runtime === 'failed') {
        return context.invalidOperation(
          pluginId,
          'Failed runtimes require an explicit retry.',
          record
        );
      }
      if (
        event.type !== 'manual' &&
        !record.manifest.activationEvents?.some((declared) =>
          matchesActivationEvent(declared, event)
        )
      ) {
        return context.invalidOperation(
          pluginId,
          'Activation event is not declared by the plugin.',
          record
        );
      }
      if (!record.permission) {
        return context.invalidOperation(
          pluginId,
          'Plugin has no current permission snapshot.',
          record
        );
      }

      const operation = context.beginOperation(record.owner, 'activate');
      const diagnostics: PluginDiagnostic[] = [];
      context.publishSnapshot(record, {
        runtime: 'activating',
        diagnostics: [],
      });
      try {
        const activationEntries = await prepareActivationEntries(
          record,
          operation
        );
        if (!activationEntries.ok) {
          diagnostics.push(...activationEntries.diagnostics);
          context.publishSnapshot(record, { runtime: 'failed', diagnostics });
          return operationFailure(diagnostics);
        }
        diagnostics.push(...activationEntries.diagnostics);
        if (!context.operationIsCurrent(operation)) {
          diagnostics.push(
            context.supersededDiagnostic(record, operation),
            ...(await disposePreparedContributions(
              activationEntries.value,
              record.owner,
              operation.operationId
            ))
          );
          return operationFailure(diagnostics);
        }

        const runtimeArtifactOutcome = await runRuntimeOperation(
          {
            owner: record.owner,
            pluginVersion: record.manifest.version,
            operationId: operation.operationId,
            timeoutMs: context.runtimeTimeoutMs,
            controller: operation.controller,
          },
          () =>
            loadVerifiedRuntimeArtifact({
              owner: record.owner,
              pluginVersion: record.manifest.version,
              artifact: runtimeEntrypoint,
              attestation: record.source.attestation,
              reader: record.source.reader,
              integrityService: context.integrityService,
              limits: context.runtimeArtifactLimits,
              operationId: operation.operationId,
              signal: operation.controller.signal,
            })
        );
        if (runtimeArtifactOutcome.kind !== 'completed') {
          diagnostics.push(
            runtimeArtifactOutcome.diagnostic,
            ...(await disposePreparedContributions(
              activationEntries.value,
              record.owner,
              operation.operationId
            ))
          );
          if (
            runtimeArtifactOutcome.kind === 'timed-out' &&
            context.operationCanPublish(operation)
          ) {
            context.publishSnapshot(record, {
              runtime: 'failed',
              diagnostics,
            });
          }
          return operationFailure(diagnostics);
        }
        const runtimeArtifact = runtimeArtifactOutcome.result;
        diagnostics.push(...runtimeArtifact.diagnostics);
        if (!context.operationIsCurrent(operation)) {
          diagnostics.push(
            context.supersededDiagnostic(record, operation),
            ...(await disposePreparedContributions(
              activationEntries.value,
              record.owner,
              operation.operationId
            ))
          );
          return operationFailure(diagnostics);
        }
        if (!runtimeArtifact.ok) {
          diagnostics.push(
            ...(await disposePreparedContributions(
              activationEntries.value,
              record.owner,
              operation.operationId
            ))
          );
          context.publishSnapshot(record, { runtime: 'failed', diagnostics });
          return operationFailure(diagnostics);
        }

        let entriesForAttempt = activationEntries.value;
        let session: PluginRuntimeSession | undefined;
        let sessionToken = '';
        const livePermission = Object.freeze({
          getSnapshot: () => {
            const current = context.records.get(pluginId);
            return current && isSamePluginOwner(current.owner, record.owner)
              ? current.permission
              : undefined;
          },
          isGranted: (
            capability: Parameters<typeof isCapabilityGranted>[1]
          ) => {
            const current = context.records.get(pluginId);
            return Boolean(
              current?.permission &&
              isSamePluginOwner(current.owner, record.owner) &&
              isCapabilityGranted(current.permission, capability)
            );
          },
          subscribe: (
            listener: Parameters<typeof context.subscribePermission>[1]
          ) => context.subscribePermission(record.owner, listener),
        });
        for (
          let attempt = 0;
          attempt < MAX_ACTIVATION_TRANSACTION_ATTEMPTS;
          attempt += 1
        ) {
          const currentRecord = context.records.get(pluginId);
          const currentPermission =
            currentRecord &&
            isSamePluginOwner(currentRecord.owner, record.owner)
              ? currentRecord.permission
              : undefined;
          if (!currentPermission || !context.operationIsCurrent(operation)) {
            diagnostics.push(
              context.supersededDiagnostic(record, operation),
              ...(await disposePreparedContributions(
                entriesForAttempt,
                record.owner,
                operation.operationId
              ))
            );
            return operationFailure(diagnostics);
          }

          const transaction = context.registry.beginTransaction({
            owner: record.owner,
            expectedRegistryRevision: context.registry.getRevision(),
            expectedPermissionRevision: currentPermission.permissionRevision,
            lifetime: 'activation',
            operationId: operation.operationId,
          });
          const staged = await stagePreparedContributions(
            transaction,
            record.owner,
            entriesForAttempt,
            operation.operationId,
            'activation'
          );
          if (!staged.ok) {
            diagnostics.push(...staged.diagnostics);
            context.publishSnapshot(record, { runtime: 'failed', diagnostics });
            return operationFailure(diagnostics);
          }

          const candidateSessionToken = context.createId('runtime-session');
          const scopedTransaction = createScopedContributionTransaction({
            transaction,
            owner: record.owner,
            permission: currentPermission,
            contracts: context.contracts,
            operationId: operation.operationId,
          });
          const runtimeOutcome = await runRuntimeOperation(
            {
              owner: record.owner,
              pluginVersion: record.manifest.version,
              operationId: operation.operationId,
              timeoutMs: context.runtimeTimeoutMs,
              controller: operation.controller,
            },
            () =>
              context.options.runtimeAdapter.activate(
                {
                  owner: record.owner,
                  manifest: record.manifest,
                  runtimeArtifact: runtimeArtifact.value,
                  event,
                  operationId: operation.operationId,
                  sessionToken: candidateSessionToken,
                  permission: livePermission,
                  contributions: scopedTransaction,
                },
                operation.controller.signal
              ),
            (lateSession) =>
              deactivateLateRuntimeSession(
                lateSession,
                context.runtimeTimeoutMs
              )
          );
          if (runtimeOutcome.kind !== 'completed') {
            diagnostics.push(runtimeOutcome.diagnostic);
            const rollback = await transaction.rollback();
            diagnostics.push(...rollback.diagnostics);
            if (
              runtimeOutcome.kind === 'timed-out'
                ? context.operationCanPublish(operation)
                : context.operationIsCurrent(operation)
            ) {
              context.publishSnapshot(record, {
                runtime: 'failed',
                diagnostics,
              });
            }
            return operationFailure(diagnostics);
          }
          diagnostics.push(...runtimeOutcome.result.diagnostics);
          if (!runtimeOutcome.result.ok) {
            const rollback = await transaction.rollback();
            diagnostics.push(...rollback.diagnostics);
            context.publishSnapshot(record, {
              runtime: 'failed',
              diagnostics,
            });
            return operationFailure(diagnostics);
          }
          const candidateSession = runtimeOutcome.result.value;
          const committed = await transaction.commit();
          if (committed.ok) {
            diagnostics.push(...committed.diagnostics);
            session = candidateSession;
            sessionToken = candidateSessionToken;
            break;
          }

          await deactivateLateRuntimeSession(
            candidateSession,
            context.runtimeTimeoutMs
          );
          const retryableConflict =
            committed.diagnostics.length === 1 &&
            committed.diagnostics[0]?.code ===
              PLUGIN_DIAGNOSTIC_CODES.TRANSACTION_CONFLICT &&
            committed.diagnostics[0].retryable &&
            attempt + 1 < MAX_ACTIVATION_TRANSACTION_ATTEMPTS &&
            context.operationIsCurrent(operation);
          if (!retryableConflict) {
            diagnostics.push(...committed.diagnostics);
            if (context.operationIsCurrent(operation)) {
              context.publishSnapshot(record, {
                runtime: 'failed',
                diagnostics,
              });
            }
            return operationFailure(diagnostics);
          }

          const refreshedEntries = await prepareActivationEntries(
            record,
            operation
          );
          if (!refreshedEntries.ok) {
            diagnostics.push(
              ...committed.diagnostics,
              ...refreshedEntries.diagnostics
            );
            context.publishSnapshot(record, {
              runtime: 'failed',
              diagnostics,
            });
            return operationFailure(diagnostics);
          }
          diagnostics.push(...refreshedEntries.diagnostics);
          entriesForAttempt = refreshedEntries.value;
        }

        if (!session || !sessionToken) {
          const diagnostic = createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.TRANSACTION_CONFLICT,
            'Plugin activation exhausted its contribution transaction retries.',
            {
              pluginId: record.owner.pluginId,
              pluginVersion: record.manifest.version,
              installationId: record.owner.installationId,
              generation: record.owner.generation,
              operationId: operation.operationId,
            }
          );
          diagnostics.push(diagnostic);
          context.publishSnapshot(record, { runtime: 'failed', diagnostics });
          return operationFailure(diagnostics);
        }

        try {
          const terminationSubscription = session.onDidTerminate(
            (terminationEvent) =>
              handleRuntimeTermination(
                pluginId,
                record.owner,
                sessionToken,
                terminationEvent
              )
          );
          record.runtimeSession = {
            token: sessionToken,
            session,
            terminationSubscription,
          };
        } catch {
          const diagnostic = createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.RUNTIME_ACTIVATION_FAILED,
            'Plugin runtime termination listener could not be attached.',
            {
              pluginId,
              pluginVersion: record.manifest.version,
              installationId: record.owner.installationId,
              generation: record.owner.generation,
              operationId: operation.operationId,
            }
          );
          diagnostics.push(diagnostic);
          await deactivateLateRuntimeSession(session, context.runtimeTimeoutMs);
          const cleanup = await context.registry.disposeByOwner(record.owner, {
            operationId: operation.operationId,
            lifetime: 'activation',
          });
          diagnostics.push(...cleanup.diagnostics);
          context.publishSnapshot(record, { runtime: 'failed', diagnostics });
          return operationFailure(diagnostics);
        }

        record.lastActivationEvent = event;
        diagnostics.push(
          ...context.publishSnapshot(record, {
            runtime: 'active',
            diagnostics,
          })
        );
        diagnostics.push(
          ...(await context.appendAudit(
            record,
            operation.operationId,
            'runtime',
            'activate',
            'success',
            diagnostics,
            {
              packageDigest: runtimeArtifact.value.packageDigest,
              runtimeArtifactPath: runtimeArtifact.value.path,
              runtimeArtifactDigest: runtimeArtifact.value.digest,
            }
          ))
        );
        return pluginHostSuccess(record.snapshot, diagnostics);
      } finally {
        context.endOperation(operation);
      }
    });

  const activate: PluginHost<TMap>['activate'] = (pluginId, event) => {
    const existing = activationPromises.get(pluginId);
    if (existing) return existing;
    const promise = activateInternal(pluginId, event);
    activationPromises.set(pluginId, promise);
    void promise.finally(() => {
      if (activationPromises.get(pluginId) === promise) {
        activationPromises.delete(pluginId);
      }
    });
    return promise;
  };

  const deactivate: PluginHost<TMap>['deactivate'] = (
    pluginId,
    reason: RuntimeDeactivationReason
  ) => {
    context.supersedeOperation(pluginId);
    return context.coordinator.run(pluginId, async () => {
      const record = context.records.get(pluginId);
      if (!record) {
        return context.invalidOperation(pluginId, 'Plugin is not discovered.');
      }
      if (
        record.snapshot.runtime === 'inactive' ||
        record.snapshot.runtime === 'not-applicable'
      ) {
        return pluginHostSuccess(record.snapshot);
      }
      const operation = context.beginOperation(record.owner, 'deactivate');
      try {
        const diagnostics = [
          ...(await context.deactivateRecordRuntime(
            record,
            reason,
            operation.operationId,
            operation.controller
          )),
        ];
        const failed = hasErrorDiagnostic(diagnostics);
        diagnostics.push(
          ...(await context.appendAudit(
            record,
            operation.operationId,
            'runtime',
            'deactivate',
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

  return Object.freeze({ activate, deactivate });
};
