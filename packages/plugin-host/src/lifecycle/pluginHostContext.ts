import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  type PluginDiagnostic,
} from '@prodivix/plugin-contracts';
import { createPluginAuditDispatcher } from '#host/audit/auditSink';
import type { PluginAuditOutcome } from '#host/audit/audit.types';
import {
  createPermissionSnapshotReader,
  type PermissionSnapshot,
} from '#host/capability/permissionSnapshot';
import {
  createContributionContractRegistry,
  type ContributionContractRegistry,
} from '#host/contribution/contributionContractRegistry';
import {
  createContributionRegistry,
  type ContributionRegistry,
} from '#host/contribution/contributionRegistry';
import {
  loadAndValidateContributionDescriptors,
  normalizeContributionResourceLimits,
  prepareValidatedContributions,
  type PluginContributionResourceLimits,
  type ValidatedContributionDescriptor,
} from '#host/contribution/contributionPreparation';
import {
  createSha256ResourceIntegrityService,
  type PluginResourceIntegrityService,
} from '#host/contribution/resourceIntegrity';
import type {
  HostContributionPointMap,
  PreparedContributionEntry,
} from '#host/contribution/contribution.types';
import {
  isSamePluginOwner,
  pluginOwnerKey,
  type PluginOwnerRef,
} from '#host/identity';
import {
  disposePreparedContributions,
  splitPreparedContributions,
} from '#host/lifecycle/hostContributionOperations';
import { resolveHostPermission } from '#host/lifecycle/hostValidation';
import {
  createPluginOperationCoordinator,
  type PluginOperationCoordinator,
} from '#host/lifecycle/operationCoordinator';
import {
  updatePluginHostSnapshot,
  type PluginHostRecord,
  type PluginOperationKind,
  type PluginOperationLease,
} from '#host/lifecycle/pluginHostRecord';
import type { CreatePluginHostOptions } from '#host/lifecycle/pluginHost';
import type {
  PluginAvailabilityState,
  PluginHostListener,
  PluginHostSnapshot,
  PluginRuntimeState,
} from '#host/host.types';
import { runRuntimeOperation } from '#host/runtime/runtimeSession';
import type { RuntimeDeactivationReason } from '#host/runtime/pluginRuntimeAdapter';
import {
  normalizeRuntimeArtifactLimits,
  type PluginRuntimeArtifactLimits,
} from '#host/runtime/runtimeArtifact';
import {
  asNonEmptyDiagnostics,
  pluginHostFailure,
  pluginHostSuccess,
  type PluginHostResult,
} from '#host/result';

const DEFAULT_RUNTIME_TIMEOUT_MS = 30_000;

export type PreparedPluginPackage<TMap extends HostContributionPointMap> =
  Readonly<{
    descriptors: readonly ValidatedContributionDescriptor<TMap>[];
    installation: readonly PreparedContributionEntry<TMap>[];
    activation: readonly PreparedContributionEntry<TMap>[];
  }>;

export type PluginHostContext<TMap extends HostContributionPointMap> =
  Readonly<{
    options: CreatePluginHostOptions<TMap>;
    contracts: ContributionContractRegistry<TMap>;
    resourceLimits: PluginContributionResourceLimits;
    integrityService: PluginResourceIntegrityService;
    runtimeArtifactLimits: PluginRuntimeArtifactLimits;
    runtimeTimeoutMs: number;
    coordinator: PluginOperationCoordinator;
    records: Map<string, PluginHostRecord<TMap>>;
    generations: Map<string, number>;
    currentOwners: Map<string, PluginOwnerRef>;
    permissionsByOwner: Map<string, PermissionSnapshot>;
    subscribePermission(
      owner: PluginOwnerRef,
      listener: (snapshot: PermissionSnapshot | undefined) => void
    ): Readonly<{ dispose(): void }>;
    notifyPermissionChanged(owner: PluginOwnerRef): void;
    operations: Map<string, PluginOperationLease>;
    listeners: Set<PluginHostListener>;
    registry: ContributionRegistry<TMap>;
    hostSignal: AbortSignal;
    beginShutdown(): void;
    createId(kind: 'operation' | 'audit-event' | 'runtime-session'): string;
    appendAudit(
      record: PluginHostRecord<TMap>,
      operationId: string,
      category:
        'validation' | 'permission' | 'registry' | 'runtime' | 'cleanup',
      action: string,
      outcome: PluginAuditOutcome,
      diagnostics?: readonly PluginDiagnostic[],
      metadata?: Readonly<{
        packageDigest?: string;
        runtimeArtifactPath?: string;
        runtimeArtifactDigest?: string;
      }>
    ): Promise<readonly PluginDiagnostic[]>;
    notifySnapshot(record: PluginHostRecord<TMap>): readonly PluginDiagnostic[];
    isPublishedRecord(record: PluginHostRecord<TMap>): boolean;
    publishSnapshot(
      record: PluginHostRecord<TMap>,
      update: Readonly<{
        availability?: PluginAvailabilityState;
        runtime?: PluginRuntimeState;
        diagnostics?: readonly PluginDiagnostic[];
      }>
    ): readonly PluginDiagnostic[];
    beginOperation(
      owner: PluginOwnerRef,
      kind: PluginOperationKind,
      operationId?: string
    ): PluginOperationLease;
    endOperation(operation: PluginOperationLease): void;
    supersedeOperation(pluginId: string, reason?: string): void;
    operationIsCurrent(operation: PluginOperationLease): boolean;
    operationCanPublish(operation: PluginOperationLease): boolean;
    invalidOperation(
      pluginId: string,
      message: string,
      record?: PluginHostRecord<TMap>
    ): PluginHostResult<PluginHostSnapshot>;
    supersededDiagnostic(
      record: PluginHostRecord<TMap>,
      operation: PluginOperationLease
    ): PluginDiagnostic;
    disposePendingActivation(
      record: PluginHostRecord<TMap>,
      operationId: string
    ): Promise<readonly PluginDiagnostic[]>;
    deactivateRecordRuntime(
      record: PluginHostRecord<TMap>,
      reason: RuntimeDeactivationReason,
      operationId: string,
      controller?: AbortController
    ): Promise<readonly PluginDiagnostic[]>;
    cleanupRecord(
      record: PluginHostRecord<TMap>,
      operationId: string,
      reason: RuntimeDeactivationReason,
      includeInstallation: boolean
    ): Promise<readonly PluginDiagnostic[]>;
    prepareRecordPackage(
      record: PluginHostRecord<TMap>,
      operation: PluginOperationLease
    ): Promise<PluginHostResult<PreparedPluginPackage<TMap>>>;
    resolveRecordPermission(
      record: PluginHostRecord<TMap>,
      operation: PluginOperationLease,
      previous?: PermissionSnapshot
    ): Promise<PluginHostResult<PermissionSnapshot>>;
  }>;

export const hasErrorDiagnostic = (
  diagnostics: readonly PluginDiagnostic[]
): boolean =>
  diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === 'error' || diagnostic.severity === 'fatal'
  );

export const operationFailure = <T>(
  diagnostics: readonly PluginDiagnostic[]
): PluginHostResult<T> => {
  const nonEmpty = asNonEmptyDiagnostics(diagnostics);
  return pluginHostFailure(
    nonEmpty ?? [
      createPluginDiagnostic(
        PLUGIN_DIAGNOSTIC_CODES.INVALID_HOST_TRANSITION,
        'Plugin Host operation failed without a diagnostic.'
      ),
    ]
  );
};

const normalizeRuntimeTimeout = (value: number | undefined): number =>
  Number.isSafeInteger(value) && (value ?? 0) > 0
    ? (value as number)
    : DEFAULT_RUNTIME_TIMEOUT_MS;

export const createPluginHostContext = <TMap extends HostContributionPointMap>(
  options: CreatePluginHostOptions<TMap>
): PluginHostResult<PluginHostContext<TMap>> => {
  const contractRegistryResult = createContributionContractRegistry(
    options.contracts
  );
  if (!contractRegistryResult.ok) return contractRegistryResult;

  const contracts = contractRegistryResult.value;
  const resourceLimits = normalizeContributionResourceLimits(
    options.contributionResourceLimits
  );
  const integrityService =
    options.integrityService ?? createSha256ResourceIntegrityService();
  const runtimeArtifactLimits = normalizeRuntimeArtifactLimits(
    options.runtimeArtifactLimits
  );
  const runtimeTimeoutMs = normalizeRuntimeTimeout(options.runtimeTimeoutMs);
  const coordinator = createPluginOperationCoordinator();
  const records = new Map<string, PluginHostRecord<TMap>>();
  const generations = new Map<string, number>();
  const currentOwners = new Map<string, PluginOwnerRef>();
  const permissionsByOwner = new Map<string, PermissionSnapshot>();
  const permissionListeners = new Map<
    string,
    Set<(snapshot: PermissionSnapshot | undefined) => void>
  >();
  const operations = new Map<string, PluginOperationLease>();
  const listeners = new Set<PluginHostListener>();
  const hostController = new AbortController();
  const audit = createPluginAuditDispatcher(
    options.auditSink,
    options.clock,
    options.idFactory
  );
  let fallbackId = 0;
  let registry: ContributionRegistry<TMap>;

  const subscribePermission: PluginHostContext<TMap>['subscribePermission'] = (
    owner,
    listener
  ) => {
    const key = pluginOwnerKey(owner);
    const ownerListeners = permissionListeners.get(key) ?? new Set();
    ownerListeners.add(listener);
    permissionListeners.set(key, ownerListeners);
    let disposed = false;
    return Object.freeze({
      dispose: () => {
        if (disposed) return;
        disposed = true;
        ownerListeners.delete(listener);
        if (ownerListeners.size === 0) permissionListeners.delete(key);
      },
    });
  };

  const notifyPermissionChanged: PluginHostContext<TMap>['notifyPermissionChanged'] =
    (owner) => {
      const key = pluginOwnerKey(owner);
      const snapshot = permissionsByOwner.get(key);
      for (const listener of [...(permissionListeners.get(key) ?? [])]) {
        try {
          listener(snapshot);
        } catch {
          continue;
        }
      }
    };

  const createId = (
    kind: 'operation' | 'audit-event' | 'runtime-session'
  ): string => {
    try {
      const id = options.idFactory.createId(kind);
      if (id.trim()) return id;
    } catch {}
    fallbackId += 1;
    return `plugin-host-${kind}-${fallbackId}`;
  };

  const appendAudit = async (
    record: PluginHostRecord<TMap>,
    operationId: string,
    category: 'validation' | 'permission' | 'registry' | 'runtime' | 'cleanup',
    action: string,
    outcome: PluginAuditOutcome,
    diagnostics: readonly PluginDiagnostic[] = [],
    metadata: Readonly<{
      packageDigest?: string;
      runtimeArtifactPath?: string;
      runtimeArtifactDigest?: string;
    }> = {}
  ): Promise<readonly PluginDiagnostic[]> =>
    audit.append([
      {
        operationId,
        owner: record.owner,
        pluginVersion: record.manifest.version,
        permissionRevision: record.permission?.permissionRevision,
        registryRevision: registry?.getRevision(),
        category,
        action,
        outcome,
        diagnostics,
        packageDigest: record.source.attestation.packageDigest,
        ...metadata,
      },
    ]);

  const notifySnapshot = (
    record: PluginHostRecord<TMap>
  ): readonly PluginDiagnostic[] => {
    const diagnostics: PluginDiagnostic[] = [];
    for (const listener of [...listeners]) {
      try {
        listener(record.snapshot);
      } catch {
        const diagnostic = createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.HOST_SUBSCRIBER_FAILED,
          'A Plugin Host subscriber failed while handling a committed snapshot.',
          {
            pluginId: record.owner.pluginId,
            pluginVersion: record.manifest.version,
            installationId: record.owner.installationId,
            generation: record.owner.generation,
            permissionRevision: record.snapshot.permissionRevision,
            availabilityState: record.snapshot.availability,
            runtimeState: record.snapshot.runtime,
          }
        );
        diagnostics.push(diagnostic);
        void appendAudit(
          record,
          operations.get(record.owner.pluginId)?.operationId ??
            createId('operation'),
          'registry',
          'host-subscriber',
          'failed',
          [diagnostic]
        );
      }
    }
    return Object.freeze(diagnostics);
  };

  const isPublishedRecord = (record: PluginHostRecord<TMap>): boolean =>
    records.get(record.owner.pluginId) === record;

  const publishSnapshot: PluginHostContext<TMap>['publishSnapshot'] = (
    record,
    update
  ) => {
    updatePluginHostSnapshot(record, update);
    return isPublishedRecord(record) ? notifySnapshot(record) : [];
  };

  const beginOperation: PluginHostContext<TMap>['beginOperation'] = (
    owner,
    kind,
    operationId = createId('operation')
  ) => {
    const existing = operations.get(owner.pluginId);
    if (existing) {
      existing.superseded = true;
      existing.controller.abort('operation-superseded');
    }
    const operation: PluginOperationLease = {
      operationId,
      owner,
      kind,
      controller: new AbortController(),
      superseded: false,
    };
    operations.set(owner.pluginId, operation);
    return operation;
  };

  const endOperation = (operation: PluginOperationLease): void => {
    if (operations.get(operation.owner.pluginId) === operation) {
      operations.delete(operation.owner.pluginId);
    }
  };

  const supersedeOperation = (
    pluginId: string,
    reason = 'operation-superseded'
  ): void => {
    const operation = operations.get(pluginId);
    if (!operation) return;
    operation.superseded = true;
    operation.controller.abort(reason);
  };

  const beginShutdown = (): void => {
    if (!hostController.signal.aborted) {
      hostController.abort('host-shutdown');
    }
    for (const pluginId of [...operations.keys()]) {
      supersedeOperation(pluginId, 'host-shutdown');
    }
  };

  const operationIsCurrent = (operation: PluginOperationLease): boolean =>
    operations.get(operation.owner.pluginId) === operation &&
    !operation.superseded &&
    !operation.controller.signal.aborted;

  const operationCanPublish = (operation: PluginOperationLease): boolean =>
    operations.get(operation.owner.pluginId) === operation &&
    !operation.superseded;

  const invalidOperation: PluginHostContext<TMap>['invalidOperation'] = (
    pluginId,
    message,
    record
  ) =>
    pluginHostFailure([
      createPluginDiagnostic(
        PLUGIN_DIAGNOSTIC_CODES.INVALID_HOST_TRANSITION,
        message,
        {
          pluginId,
          pluginVersion: record?.manifest.version,
          installationId: record?.owner.installationId,
          generation: record?.owner.generation,
          availabilityState: record?.snapshot.availability,
          runtimeState: record?.snapshot.runtime,
        }
      ),
    ]);

  const supersededDiagnostic: PluginHostContext<TMap>['supersededDiagnostic'] =
    (record, operation) =>
      createPluginDiagnostic(
        PLUGIN_DIAGNOSTIC_CODES.OPERATION_SUPERSEDED,
        'Plugin Host operation was superseded before it could commit.',
        {
          pluginId: record.owner.pluginId,
          pluginVersion: record.manifest.version,
          installationId: record.owner.installationId,
          generation: record.owner.generation,
          operationId: operation.operationId,
        }
      );

  const disposePendingActivation: PluginHostContext<TMap>['disposePendingActivation'] =
    async (record, operationId) => {
      const pending = record.pendingActivation;
      record.pendingActivation = Object.freeze([]);
      return disposePreparedContributions(pending, record.owner, operationId);
    };

  const deactivateRecordRuntime: PluginHostContext<TMap>['deactivateRecordRuntime'] =
    async (record, reason, operationId, controller = new AbortController()) => {
      const diagnostics: PluginDiagnostic[] = [];
      const managed = record.runtimeSession;
      record.runtimeSession = undefined;
      if (managed) {
        if (isPublishedRecord(record)) {
          diagnostics.push(
            ...publishSnapshot(record, {
              runtime: 'deactivating',
              diagnostics: [],
            })
          );
        } else {
          updatePluginHostSnapshot(record, {
            runtime: 'deactivating',
            diagnostics: [],
          });
        }
        try {
          await managed.terminationSubscription.dispose();
        } catch {
          diagnostics.push(
            createPluginDiagnostic(
              PLUGIN_DIAGNOSTIC_CODES.OWNER_CLEANUP_FAILED,
              'Runtime termination subscription could not be disposed.',
              {
                pluginId: record.owner.pluginId,
                pluginVersion: record.manifest.version,
                installationId: record.owner.installationId,
                generation: record.owner.generation,
                operationId,
                reasonCode: reason,
              }
            )
          );
        }
        const outcome = await runRuntimeOperation(
          {
            owner: record.owner,
            pluginVersion: record.manifest.version,
            operationId,
            timeoutMs: runtimeTimeoutMs,
            controller,
            failureCode: PLUGIN_DIAGNOSTIC_CODES.OWNER_CLEANUP_FAILED,
            failureMessage: 'Plugin runtime deactivation failed unexpectedly.',
          },
          () => managed.session.deactivate(reason, controller.signal)
        );
        diagnostics.push(
          ...(outcome.kind === 'completed'
            ? outcome.result.diagnostics
            : [outcome.diagnostic])
        );
      }

      const cleanup = await registry.disposeByOwner(record.owner, {
        operationId,
        lifetime: 'activation',
      });
      diagnostics.push(...cleanup.diagnostics);
      const nextRuntime = hasErrorDiagnostic(diagnostics)
        ? 'failed'
        : record.manifest.entrypoints?.runtime
          ? 'inactive'
          : 'not-applicable';
      if (isPublishedRecord(record)) {
        diagnostics.push(
          ...publishSnapshot(record, {
            runtime: nextRuntime,
            diagnostics,
          })
        );
      } else {
        updatePluginHostSnapshot(record, {
          runtime: nextRuntime,
          diagnostics,
        });
      }
      return Object.freeze(diagnostics);
    };

  const cleanupRecord: PluginHostContext<TMap>['cleanupRecord'] = async (
    record,
    operationId,
    reason,
    includeInstallation
  ) => {
    const diagnostics = [
      ...(await deactivateRecordRuntime(record, reason, operationId)),
      ...(await disposePendingActivation(record, operationId)),
    ];
    if (includeInstallation) {
      const installationCleanup = await registry.disposeByOwner(record.owner, {
        operationId,
        lifetime: 'installation',
      });
      diagnostics.push(...installationCleanup.diagnostics);
    }
    return Object.freeze(diagnostics);
  };

  const prepareRecordPackage: PluginHostContext<TMap>['prepareRecordPackage'] =
    async (record, operation) => {
      if (!record.permission) {
        return pluginHostFailure([
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.CAPABILITY_POLICY_FAILED,
            'Plugin contributions cannot be prepared without permissions.',
            {
              pluginId: record.owner.pluginId,
              pluginVersion: record.manifest.version,
              installationId: record.owner.installationId,
              generation: record.owner.generation,
              operationId: operation.operationId,
            }
          ),
        ]);
      }
      const loaded = await loadAndValidateContributionDescriptors({
        owner: record.owner,
        manifest: record.manifest,
        permission: record.permission,
        reader: record.source.reader,
        contracts,
        integrityService,
        limits: resourceLimits,
        operationId: operation.operationId,
        signal: operation.controller.signal,
      });
      if (!loaded.ok) return loaded;
      let batchValidation: PluginHostResult<void> =
        pluginHostSuccess(undefined);
      if (options.validateContributionBatch) {
        try {
          batchValidation = await options.validateContributionBatch({
            owner: record.owner,
            attestation: record.source.attestation,
            manifest: record.manifest,
            permission: createPermissionSnapshotReader(record.permission),
            descriptors: loaded.value,
            operationId: operation.operationId,
            signal: operation.controller.signal,
          });
        } catch {
          batchValidation = pluginHostFailure([
            createPluginDiagnostic(
              PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_SCHEMA_VIOLATION,
              'Contribution batch semantic validation failed unexpectedly.',
              {
                pluginId: record.owner.pluginId,
                pluginVersion: record.manifest.version,
                installationId: record.owner.installationId,
                generation: record.owner.generation,
                operationId: operation.operationId,
              }
            ),
          ]);
        }
        if (!batchValidation.ok) return batchValidation;
      }
      const prepared = await prepareValidatedContributions({
        owner: record.owner,
        attestation: record.source.attestation,
        manifest: record.manifest,
        permission: record.permission,
        descriptors: loaded.value,
        operationId: operation.operationId,
        signal: operation.controller.signal,
      });
      if (!prepared.ok) return prepared;
      const split = splitPreparedContributions(prepared.value);
      return pluginHostSuccess(
        Object.freeze({
          descriptors: loaded.value,
          installation: split.installation,
          activation: split.activation,
        }),
        [
          ...loaded.diagnostics,
          ...batchValidation.diagnostics,
          ...prepared.diagnostics,
        ]
      );
    };

  const resolveRecordPermission: PluginHostContext<TMap>['resolveRecordPermission'] =
    (record, operation, previous) =>
      resolveHostPermission(
        options.capabilityPolicy,
        {
          owner: record.owner,
          manifest: record.manifest,
          attestation: record.source.attestation,
          nextPermissionRevision: (previous?.permissionRevision ?? 0) + 1,
          previous,
        },
        operation.controller.signal
      );

  registry = createContributionRegistry(
    {
      getCurrentOwner: (pluginId) => currentOwners.get(pluginId),
      getPermissionSnapshot: (owner) =>
        permissionsByOwner.get(pluginOwnerKey(owner)),
      isOperationCurrent: (owner, operationId) => {
        const operation = operations.get(owner.pluginId);
        return Boolean(
          operation &&
          operation.operationId === operationId &&
          isSamePluginOwner(operation.owner, owner) &&
          !operation.superseded &&
          !operation.controller.signal.aborted
        );
      },
    },
    (diagnostic) => {
      const pluginId = diagnostic.meta.pluginId;
      const record = pluginId ? records.get(pluginId) : undefined;
      if (!record) return;
      void appendAudit(
        record,
        diagnostic.meta.operationId ?? createId('operation'),
        diagnostic.code === PLUGIN_DIAGNOSTIC_CODES.OWNER_CLEANUP_FAILED
          ? 'cleanup'
          : 'registry',
        'host-callback',
        'failed',
        [diagnostic]
      );
    }
  );

  return pluginHostSuccess(
    Object.freeze({
      options,
      contracts,
      resourceLimits,
      integrityService,
      runtimeArtifactLimits,
      runtimeTimeoutMs,
      coordinator,
      records,
      generations,
      currentOwners,
      permissionsByOwner,
      subscribePermission,
      notifyPermissionChanged,
      operations,
      listeners,
      registry,
      hostSignal: hostController.signal,
      beginShutdown,
      createId,
      appendAudit,
      notifySnapshot,
      isPublishedRecord,
      publishSnapshot,
      beginOperation,
      endOperation,
      supersedeOperation,
      operationIsCurrent,
      operationCanPublish,
      invalidOperation,
      supersededDiagnostic,
      disposePendingActivation,
      deactivateRecordRuntime,
      cleanupRecord,
      prepareRecordPackage,
      resolveRecordPermission,
    })
  );
};
