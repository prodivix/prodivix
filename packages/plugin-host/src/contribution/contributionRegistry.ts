import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  type PluginDiagnostic,
} from '@prodivix/plugin-contracts';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  capabilityIdentityKey,
  compareCapabilityIdentity,
  type CapabilityIdentity,
} from '#host/capability/capabilityIdentity';
import {
  isCapabilityGranted,
  type PermissionSnapshot,
} from '#host/capability/permissionSnapshot';
import type {
  AnyContributionRecord,
  ContributionLifetime,
  ContributionRecord,
  ContributionRegistration,
  ContributionRegistryEvent,
  ContributionRegistryListener,
  HostContributionPoint,
  HostContributionPointMap,
} from '#host/contribution/contribution.types';
import type {
  ContributionTransaction,
  ContributionTransactionContext,
  ContributionTransactionState,
} from '#host/contribution/contributionTransaction';
import {
  contributionIdentityKey,
  isSamePluginOwner,
  type ContributionIdentity,
  type PluginOwnerRef,
} from '#host/identity';
import type { Disposable } from '#host/host.types';
import {
  asNonEmptyDiagnostics,
  pluginHostFailure,
  pluginHostSuccess,
  type PluginHostResult,
} from '#host/result';

export type ContributionRegistryReader<TMap extends HostContributionPointMap> =
  Readonly<{
    get<TPoint extends HostContributionPoint<TMap>>(
      point: TPoint,
      identity: ContributionIdentity
    ): ContributionRecord<TMap[TPoint]> | undefined;
    list<TPoint extends HostContributionPoint<TMap>>(
      point: TPoint
    ): readonly ContributionRecord<TMap[TPoint]>[];
    listByOwner(
      owner: PluginOwnerRef,
      options?: Readonly<{ lifetime?: ContributionLifetime }>
    ): readonly AnyContributionRecord<TMap>[];
    getRevision(): number;
    subscribe(listener: ContributionRegistryListener<TMap>): Disposable;
  }>;

export type ContributionRegistryGuard = Readonly<{
  getCurrentOwner(pluginId: string): PluginOwnerRef | undefined;
  getPermissionSnapshot(owner: PluginOwnerRef): PermissionSnapshot | undefined;
  isOperationCurrent(owner: PluginOwnerRef, operationId: string): boolean;
}>;

export type ContributionRegistry<TMap extends HostContributionPointMap> =
  ContributionRegistryReader<TMap> &
    Readonly<{
      beginTransaction(
        context: ContributionTransactionContext
      ): ContributionTransaction<TMap>;
      disposeByOwner(
        owner: PluginOwnerRef,
        options: Readonly<{
          operationId: string;
          lifetime?: ContributionLifetime;
        }>
      ): Promise<PluginHostResult<ContributionRegistryEvent<TMap>>>;
      disposeByCapabilities(
        owner: PluginOwnerRef,
        capabilities: readonly CapabilityIdentity[],
        operationId: string
      ): Promise<PluginHostResult<ContributionRegistryEvent<TMap>>>;
      close(): void;
    }>;

type DisposeLease = Readonly<{
  dispose(): Promise<void>;
}>;

type StoredContribution<TMap extends HostContributionPointMap> = {
  record: AnyContributionRecord<TMap>;
  order: number;
  lease: DisposeLease;
};

type StagedContribution<TMap extends HostContributionPointMap> =
  StoredContribution<TMap>;

const createDisposeLease = (
  dispose: (() => void | Promise<void>) | undefined
): DisposeLease => {
  let disposed = false;
  return Object.freeze({
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      await dispose?.();
    },
  });
};

const compareStoredContribution = <TMap extends HostContributionPointMap>(
  left: StoredContribution<TMap>,
  right: StoredContribution<TMap>
): number =>
  left.order - right.order ||
  left.record.registrationOrdinal - right.record.registrationOrdinal ||
  compareUnicodeCodePoints(
    left.record.identity.pluginId,
    right.record.identity.pluginId
  ) ||
  compareUnicodeCodePoints(
    left.record.identity.contributionId,
    right.record.identity.contributionId
  );

const freezeEvent = <TMap extends HostContributionPointMap>(
  revision: number,
  operationId: string,
  added: readonly StoredContribution<TMap>[],
  removed: readonly StoredContribution<TMap>[]
): ContributionRegistryEvent<TMap> =>
  Object.freeze({
    revision,
    operationId,
    added: Object.freeze(
      [...added].sort(compareStoredContribution).map((entry) => entry.record)
    ),
    removed: Object.freeze(
      [...removed].sort(compareStoredContribution).map((entry) => entry.record)
    ),
  });

const registryMeta = (
  context: ContributionTransactionContext,
  extra: Record<string, string | number | undefined> = {}
) => ({
  pluginId: context.owner.pluginId,
  installationId: context.owner.installationId,
  generation: context.owner.generation,
  operationId: context.operationId,
  permissionRevision: context.expectedPermissionRevision,
  registryRevision: context.expectedRegistryRevision,
  ...extra,
});

const freezeRegistration = <
  TMap extends HostContributionPointMap,
  TPoint extends HostContributionPoint<TMap>,
>(
  registration: ContributionRegistration<TMap, TPoint>
): StagedContribution<TMap> => {
  const capabilities = new Map<string, CapabilityIdentity>();
  for (const capability of registration.requiredCapabilities) {
    capabilities.set(
      capabilityIdentityKey(capability),
      Object.freeze({ ...capability })
    );
  }
  const record = Object.freeze({
    identity: Object.freeze({ ...registration.identity }),
    owner: Object.freeze({ ...registration.owner }),
    point: registration.point,
    contractVersion: registration.contractVersion,
    lifetime: registration.lifetime,
    registrationOrdinal: registration.registrationOrdinal,
    requiredCapabilities: Object.freeze(
      [...capabilities.values()].sort(compareCapabilityIdentity)
    ),
    value: registration.value,
  }) as AnyContributionRecord<TMap>;
  return {
    record,
    order: registration.order ?? 0,
    lease: createDisposeLease(registration.dispose),
  };
};

export const createContributionRegistry = <
  TMap extends HostContributionPointMap,
>(
  guard: ContributionRegistryGuard,
  onDiagnostic?: (diagnostic: PluginDiagnostic) => void
): ContributionRegistry<TMap> => {
  let revision = 0;
  let stored = new Map<string, StoredContribution<TMap>>();
  const listeners = new Set<ContributionRegistryListener<TMap>>();
  let closed = false;

  const reportDiagnostic = (diagnostic: PluginDiagnostic): void => {
    try {
      onDiagnostic?.(diagnostic);
    } catch {
      return;
    }
  };

  const notify = (
    event: ContributionRegistryEvent<TMap>,
    owner: PluginOwnerRef
  ): PluginDiagnostic[] => {
    const diagnostics: PluginDiagnostic[] = [];
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        const diagnostic = createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.HOST_SUBSCRIBER_FAILED,
          'A contribution registry subscriber failed while handling a committed batch.',
          {
            pluginId: owner.pluginId,
            installationId: owner.installationId,
            generation: owner.generation,
            operationId: event.operationId,
            registryRevision: event.revision,
          }
        );
        diagnostics.push(diagnostic);
        reportDiagnostic(diagnostic);
      }
    }
    return diagnostics;
  };

  const cleanupEntries = async (
    entries: readonly StoredContribution<TMap>[],
    owner: PluginOwnerRef,
    operationId: string
  ): Promise<PluginDiagnostic[]> => {
    const diagnostics: PluginDiagnostic[] = [];
    for (const entry of [...entries]
      .sort(compareStoredContribution)
      .reverse()) {
      try {
        await entry.lease.dispose();
      } catch {
        const diagnostic = createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.OWNER_CLEANUP_FAILED,
          `Contribution ${JSON.stringify(entry.record.identity.contributionId)} could not be disposed.`,
          {
            pluginId: owner.pluginId,
            installationId: owner.installationId,
            generation: owner.generation,
            operationId,
            contributionId: entry.record.identity.contributionId,
            contributionPoint: entry.record.point,
            contractVersion: entry.record.contractVersion,
            registryRevision: revision,
          }
        );
        diagnostics.push(diagnostic);
        reportDiagnostic(diagnostic);
      }
    }
    return diagnostics;
  };

  const createTransaction = (
    context: ContributionTransactionContext
  ): ContributionTransaction<TMap> => {
    let state: ContributionTransactionState = 'open';
    const staged: StagedContribution<TMap>[] = [];
    const stagedKeys = new Set<string>();
    let committedResult:
      PluginHostResult<ContributionRegistryEvent<TMap>> | undefined;
    let rollbackResult: PluginHostResult<void> | undefined;

    const rollbackStaged = async (): Promise<PluginDiagnostic[]> => {
      state = 'rolled-back';
      return cleanupEntries(staged, context.owner, context.operationId);
    };

    const failCommit = async (
      diagnostic: PluginDiagnostic
    ): Promise<PluginHostResult<ContributionRegistryEvent<TMap>>> => {
      const cleanupDiagnostics = await rollbackStaged();
      return pluginHostFailure([diagnostic, ...cleanupDiagnostics]);
    };

    const stage = <TPoint extends HostContributionPoint<TMap>>(
      registration: ContributionRegistration<TMap, TPoint>
    ): PluginHostResult<void> => {
      if (state !== 'open') {
        return pluginHostFailure([
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.INVALID_HOST_TRANSITION,
            `Cannot stage a contribution after the transaction is ${state}.`,
            registryMeta(context, {
              contributionId: registration.identity.contributionId,
            })
          ),
        ]);
      }
      if (
        !isSamePluginOwner(registration.owner, context.owner) ||
        registration.identity.pluginId !== context.owner.pluginId ||
        registration.lifetime !== context.lifetime
      ) {
        return pluginHostFailure([
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.STALE_PLUGIN_OWNER,
            'Contribution registration does not belong to the transaction owner and lifetime.',
            registryMeta(context, {
              contributionId: registration.identity.contributionId,
            })
          ),
        ]);
      }
      if (
        !Number.isSafeInteger(registration.registrationOrdinal) ||
        registration.registrationOrdinal < 0 ||
        (registration.order !== undefined &&
          !Number.isSafeInteger(registration.order))
      ) {
        return pluginHostFailure([
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_RESOLVER_FAILED,
            'Contribution registration has an invalid deterministic order.',
            registryMeta(context, {
              contributionId: registration.identity.contributionId,
            })
          ),
        ]);
      }
      const key = contributionIdentityKey(registration.identity);
      if (stagedKeys.has(key)) {
        return pluginHostFailure([
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_IDENTITY_CONFLICT,
            `Contribution identity ${JSON.stringify(registration.identity.contributionId)} is staged more than once.`,
            registryMeta(context, {
              contributionId: registration.identity.contributionId,
            })
          ),
        ]);
      }
      stagedKeys.add(key);
      staged.push(freezeRegistration(registration));
      return pluginHostSuccess(undefined);
    };

    const commit = async (): Promise<
      PluginHostResult<ContributionRegistryEvent<TMap>>
    > => {
      if (committedResult) return committedResult;
      if (state === 'rolled-back') {
        return pluginHostFailure([
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.INVALID_HOST_TRANSITION,
            'Cannot commit a rolled-back contribution transaction.',
            registryMeta(context)
          ),
        ]);
      }

      const currentOwner = guard.getCurrentOwner(context.owner.pluginId);
      if (!currentOwner || !isSamePluginOwner(currentOwner, context.owner)) {
        return failCommit(
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.STALE_PLUGIN_OWNER,
            'Contribution transaction owner is no longer the current generation.',
            registryMeta(context)
          )
        );
      }
      if (revision !== context.expectedRegistryRevision) {
        return failCommit(
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.TRANSACTION_CONFLICT,
            'Contribution registry changed before the transaction could commit.',
            {
              ...registryMeta(context),
              registryRevision: revision,
            }
          )
        );
      }
      const permission = guard.getPermissionSnapshot(context.owner);
      if (
        !permission ||
        permission.permissionRevision !== context.expectedPermissionRevision
      ) {
        return failCommit(
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.TRANSACTION_CONFLICT,
            'Plugin permissions changed before the transaction could commit.',
            {
              ...registryMeta(context),
              permissionRevision: permission?.permissionRevision,
            }
          )
        );
      }
      if (!guard.isOperationCurrent(context.owner, context.operationId)) {
        return failCommit(
          createPluginDiagnostic(
            PLUGIN_DIAGNOSTIC_CODES.OPERATION_SUPERSEDED,
            'Contribution transaction was superseded by a newer Host operation.',
            registryMeta(context)
          )
        );
      }
      for (const entry of staged) {
        const denied = entry.record.requiredCapabilities.find(
          (capability) => !isCapabilityGranted(permission, capability)
        );
        if (denied) {
          return failCommit(
            createPluginDiagnostic(
              PLUGIN_DIAGNOSTIC_CODES.TRANSACTION_CONFLICT,
              'A contribution capability was revoked before commit.',
              {
                ...registryMeta(context),
                contributionId: entry.record.identity.contributionId,
                capabilityId: denied.id,
                capabilityScope: denied.scope,
              }
            )
          );
        }
      }

      const removed = context.replaceOwner
        ? [...stored.values()].filter(
            (entry) =>
              isSamePluginOwner(entry.record.owner, context.replaceOwner!) &&
              entry.record.lifetime === context.lifetime
          )
        : [];
      const removedKeys = new Set(
        removed.map((entry) => contributionIdentityKey(entry.record.identity))
      );
      for (const entry of staged) {
        const key = contributionIdentityKey(entry.record.identity);
        if (stored.has(key) && !removedKeys.has(key)) {
          return failCommit(
            createPluginDiagnostic(
              PLUGIN_DIAGNOSTIC_CODES.CONTRIBUTION_IDENTITY_CONFLICT,
              `Contribution identity ${JSON.stringify(entry.record.identity.contributionId)} is already registered.`,
              {
                ...registryMeta(context),
                contributionId: entry.record.identity.contributionId,
                contributionPoint: entry.record.point,
                contractVersion: entry.record.contractVersion,
              }
            )
          );
        }
      }

      const next = new Map(stored);
      for (const entry of removed) {
        next.delete(contributionIdentityKey(entry.record.identity));
      }
      for (const entry of staged) {
        next.set(contributionIdentityKey(entry.record.identity), entry);
      }
      if (removed.length > 0 || staged.length > 0) revision += 1;
      stored = next;
      state = 'committed';
      const event = freezeEvent(revision, context.operationId, staged, removed);
      const listenerDiagnostics =
        removed.length > 0 || staged.length > 0
          ? notify(event, context.owner)
          : [];
      const cleanupDiagnostics = await cleanupEntries(
        removed,
        context.replaceOwner ?? context.owner,
        context.operationId
      );
      const cleanupFailure = asNonEmptyDiagnostics(cleanupDiagnostics);
      committedResult = cleanupFailure
        ? pluginHostFailure(cleanupFailure)
        : pluginHostSuccess(event, listenerDiagnostics);
      return committedResult;
    };

    const rollback = async (): Promise<PluginHostResult<void>> => {
      if (rollbackResult) return rollbackResult;
      if (state === 'committed') return pluginHostSuccess(undefined);
      const diagnostics = await rollbackStaged();
      const failure = asNonEmptyDiagnostics(diagnostics);
      rollbackResult = failure
        ? pluginHostFailure(failure)
        : pluginHostSuccess(undefined);
      return rollbackResult;
    };

    return Object.freeze({
      stage,
      commit,
      rollback,
      getState: () => state,
    });
  };

  const removeEntries = async (
    owner: PluginOwnerRef,
    operationId: string,
    predicate: (entry: StoredContribution<TMap>) => boolean
  ): Promise<PluginHostResult<ContributionRegistryEvent<TMap>>> => {
    const removed = [...stored.values()].filter(predicate);
    if (removed.length === 0) {
      return pluginHostSuccess(freezeEvent(revision, operationId, [], []));
    }
    const next = new Map(stored);
    for (const entry of removed) {
      next.delete(contributionIdentityKey(entry.record.identity));
    }
    stored = next;
    revision += 1;
    const event = freezeEvent(revision, operationId, [], removed);
    const listenerDiagnostics = notify(event, owner);
    const cleanupDiagnostics = await cleanupEntries(
      removed,
      owner,
      operationId
    );
    const failure = asNonEmptyDiagnostics(cleanupDiagnostics);
    return failure
      ? pluginHostFailure(failure)
      : pluginHostSuccess(event, listenerDiagnostics);
  };

  const reader: ContributionRegistry<TMap> = Object.freeze({
    get: <TPoint extends HostContributionPoint<TMap>>(
      point: TPoint,
      identity: ContributionIdentity
    ): ContributionRecord<TMap[TPoint]> | undefined => {
      const record = stored.get(contributionIdentityKey(identity))?.record;
      return record?.point === point
        ? (record as ContributionRecord<TMap[TPoint]>)
        : undefined;
    },
    list: <TPoint extends HostContributionPoint<TMap>>(
      point: TPoint
    ): readonly ContributionRecord<TMap[TPoint]>[] =>
      Object.freeze(
        [...stored.values()]
          .filter((entry) => entry.record.point === point)
          .sort(compareStoredContribution)
          .map((entry) => entry.record as ContributionRecord<TMap[TPoint]>)
      ),
    listByOwner: (owner, options) =>
      Object.freeze(
        [...stored.values()]
          .filter(
            (entry) =>
              isSamePluginOwner(entry.record.owner, owner) &&
              (options?.lifetime === undefined ||
                entry.record.lifetime === options.lifetime)
          )
          .sort(compareStoredContribution)
          .map((entry) => entry.record)
      ),
    getRevision: () => revision,
    subscribe: (listener) => {
      if (closed) return Object.freeze({ dispose: () => {} });
      listeners.add(listener);
      let disposed = false;
      return Object.freeze({
        dispose: () => {
          if (disposed) return;
          disposed = true;
          listeners.delete(listener);
        },
      });
    },
    beginTransaction: createTransaction,
    disposeByOwner: (owner, options) =>
      removeEntries(
        owner,
        options.operationId,
        (entry) =>
          isSamePluginOwner(entry.record.owner, owner) &&
          (options.lifetime === undefined ||
            entry.record.lifetime === options.lifetime)
      ),
    disposeByCapabilities: (owner, capabilities, operationId) => {
      const keys = new Set(capabilities.map(capabilityIdentityKey));
      return removeEntries(
        owner,
        operationId,
        (entry) =>
          isSamePluginOwner(entry.record.owner, owner) &&
          entry.record.requiredCapabilities.some((capability) =>
            keys.has(capabilityIdentityKey(capability))
          )
      );
    },
    close: () => {
      if (closed) return;
      closed = true;
      listeners.clear();
    },
  });

  return reader;
};
