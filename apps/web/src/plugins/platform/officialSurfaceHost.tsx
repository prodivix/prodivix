import {
  createContext,
  createElement,
  useContext,
  useMemo,
  useState,
  type ElementType,
  type ReactNode,
} from 'react';
import {
  OfficialReactSurfaceHostContext,
  type OfficialReactSurfaceHost,
} from '@prodivix/plugin-react-host';
import type { PluginOwnerRef } from '@prodivix/plugin-host';

type OfficialSurfaceLeaseSnapshot = Readonly<{
  owner: PluginOwnerRef;
  leaseCount: number;
}>;

type Lease = Readonly<{
  run(): Promise<void>;
}>;

type CleanupFailure = Readonly<{ reason: unknown }>;

type DrainState = Readonly<{
  promise: Promise<void>;
}>;

const settleCleanupTasks = async (
  tasks: readonly Promise<void>[]
): Promise<CleanupFailure | undefined> => {
  const outcomes = await Promise.allSettled(tasks);
  for (const outcome of outcomes) {
    if (outcome.status === 'rejected') return { reason: outcome.reason };
  }
  return undefined;
};

export type OfficialSurfaceLeaseRegistry = Readonly<{
  register(
    owner: PluginOwnerRef,
    cleanup: () => void | Promise<void>
  ): Readonly<{ dispose(): Promise<void> }>;
  releaseOwner(owner: PluginOwnerRef): Promise<void>;
  releaseAll(): Promise<void>;
  listSnapshots(): readonly OfficialSurfaceLeaseSnapshot[];
}>;

const ownerKey = (owner: PluginOwnerRef) =>
  JSON.stringify([owner.pluginId, owner.installationId, owner.generation]);

export const createOfficialSurfaceLeaseRegistry =
  (): OfficialSurfaceLeaseRegistry => {
    const leasesByOwner = new Map<
      string,
      Readonly<{ owner: PluginOwnerRef; leases: Map<symbol, Lease> }>
    >();
    const ownerDrains = new Map<string, DrainState>();
    const releasedOwners = new Map<string, Promise<void>>();
    const lateGlobalLeases = new Map<symbol, Lease>();
    let globalDrain: DrainState | undefined;
    let closed = false;

    const createLease = (cleanup: () => void | Promise<void>): Lease => {
      let runPromise: Promise<void> | undefined;
      return Object.freeze({
        run: () => {
          if (!runPromise) {
            try {
              runPromise = Promise.resolve(cleanup());
            } catch (error) {
              runPromise = Promise.reject(error);
            }
          }
          return runPromise;
        },
      });
    };

    const registerReleasedLease = (
      cleanup: () => void | Promise<void>,
      joinGlobalDrain: boolean
    ) => {
      const lease = createLease(cleanup);
      if (joinGlobalDrain) lateGlobalLeases.set(Symbol('late'), lease);
      const disposePromise = lease.run();
      void disposePromise.catch(() => undefined);
      return Object.freeze({
        dispose: () => disposePromise,
      });
    };

    const register: OfficialSurfaceLeaseRegistry['register'] = (
      owner,
      cleanup
    ) => {
      const key = ownerKey(owner);
      if (closed) return registerReleasedLease(cleanup, false);
      if (releasedOwners.has(key) && !ownerDrains.has(key)) {
        return registerReleasedLease(cleanup, Boolean(globalDrain));
      }
      const token = Symbol(key);
      const lease = createLease(cleanup);
      const record = leasesByOwner.get(key) ?? {
        owner: Object.freeze({ ...owner }),
        leases: new Map<symbol, Lease>(),
      };
      record.leases.set(token, lease);
      leasesByOwner.set(key, record);
      let disposePromise: Promise<void> | undefined;
      return Object.freeze({
        dispose: () => {
          if (disposePromise) return disposePromise;
          disposePromise = lease.run();
          void disposePromise.then(
            () => {
              const current = leasesByOwner.get(key);
              if (current?.leases.get(token) !== lease) return;
              current.leases.delete(token);
              if (current.leases.size === 0) leasesByOwner.delete(key);
            },
            () => undefined
          );
          return disposePromise;
        },
      });
    };

    const drainOwner = async (key: string, state: DrainState) => {
      let firstFailure: CleanupFailure | undefined;
      while (true) {
        const record = leasesByOwner.get(key);
        if (!record) {
          if (ownerDrains.get(key) === state) ownerDrains.delete(key);
          if (firstFailure) throw firstFailure.reason;
          return;
        }
        leasesByOwner.delete(key);
        const failure = await settleCleanupTasks(
          [...record.leases.values()].map((lease) => lease.run())
        );
        firstFailure ??= failure;
      }
    };

    const releaseOwner = (owner: PluginOwnerRef) => {
      if (globalDrain) return globalDrain.promise;
      const key = ownerKey(owner);
      const released = releasedOwners.get(key);
      if (released) return released;
      if (!leasesByOwner.has(key)) {
        const completed = Promise.resolve();
        releasedOwners.set(key, completed);
        return completed;
      }

      let resolveDrain: () => void;
      let rejectDrain: (reason: unknown) => void;
      const promise = new Promise<void>((resolve, reject) => {
        resolveDrain = resolve;
        rejectDrain = reject;
      });
      const state = Object.freeze({ promise });
      ownerDrains.set(key, state);
      releasedOwners.set(key, promise);
      void drainOwner(key, state).then(resolveDrain!, rejectDrain!);
      return promise;
    };

    const drainAll = async (state: DrainState) => {
      let firstFailure: CleanupFailure | undefined;
      while (true) {
        const activeOwnerDrains = [...ownerDrains.values()];
        const records: Array<
          Readonly<{ owner: PluginOwnerRef; leases: Map<symbol, Lease> }>
        > = [];
        leasesByOwner.forEach((record, key) => {
          if (ownerDrains.has(key)) return;
          leasesByOwner.delete(key);
          records.push(record);
        });
        const queuedLateLeases = [...lateGlobalLeases.values()];
        lateGlobalLeases.clear();
        const tasks = [
          ...activeOwnerDrains.map((drain) => drain.promise),
          ...records.flatMap((record) =>
            [...record.leases.values()].map((lease) => lease.run())
          ),
          ...queuedLateLeases.map((lease) => lease.run()),
        ];
        if (tasks.length === 0) {
          closed = true;
          if (globalDrain !== state) {
            throw new Error(
              'Official surface global drain state was replaced.'
            );
          }
          if (firstFailure) throw firstFailure.reason;
          return;
        }
        const failure = await settleCleanupTasks(tasks);
        firstFailure ??= failure;
      }
    };

    const releaseAll = () => {
      if (globalDrain) return globalDrain.promise;
      let resolveDrain: () => void;
      let rejectDrain: (reason: unknown) => void;
      const promise = new Promise<void>((resolve, reject) => {
        resolveDrain = resolve;
        rejectDrain = reject;
      });
      const state = Object.freeze({ promise });
      globalDrain = state;
      void drainAll(state).then(resolveDrain!, rejectDrain!);
      return promise;
    };

    return Object.freeze({
      register,
      releaseOwner,
      releaseAll,
      listSnapshots: () =>
        Object.freeze(
          [...leasesByOwner.values()]
            .map((record) =>
              Object.freeze({
                owner: record.owner,
                leaseCount: record.leases.size,
              })
            )
            .sort(
              (left, right) =>
                left.owner.pluginId.localeCompare(right.owner.pluginId) ||
                left.owner.installationId.localeCompare(
                  right.owner.installationId
                ) ||
                left.owner.generation - right.owner.generation
            )
        ),
    });
  };

export const OfficialSurfaceLeaseRegistryContext =
  // Registry access is private to the trusted Web composition root.
  createContext<OfficialSurfaceLeaseRegistry | null>(null);

type OfficialReactSurfaceBoundaryProps = Readonly<{
  children: ReactNode;
}>;

export function OfficialReactSurfaceBoundary({
  children,
}: OfficialReactSurfaceBoundaryProps) {
  const [styleContainer, setStyleContainer] = useState<HTMLDivElement | null>(
    null
  );
  const [overlayContainer, setOverlayContainer] =
    useState<HTMLDivElement | null>(null);
  const host = useMemo<OfficialReactSurfaceHost>(
    () =>
      Object.freeze({
        getStyleContainer: () => styleContainer,
        getOverlayContainer: () => overlayContainer,
        registerCleanup: () => {
          throw new Error(
            'Official React cleanup must be registered through an owner-scoped projection.'
          );
        },
      }),
    [overlayContainer, styleContainer]
  );
  const ready = Boolean(styleContainer && overlayContainer);

  return (
    <OfficialReactSurfaceHostContext.Provider value={host}>
      <div
        ref={setStyleContainer}
        className="OfficialPluginStyleHost contents"
        aria-hidden="true"
      />
      {ready ? children : null}
      <div
        ref={setOverlayContainer}
        className="OfficialPluginOverlayHost pointer-events-none absolute inset-0 z-20 [&>*]:pointer-events-auto"
        data-official-plugin-overlay-host
      />
    </OfficialReactSurfaceHostContext.Provider>
  );
}

export function OfficialPluginOwnerSurface({
  owner,
  children,
}: Readonly<{ owner: PluginOwnerRef; children?: ReactNode }>) {
  const parentHost = useContext(OfficialReactSurfaceHostContext);
  const registry = useContext(OfficialSurfaceLeaseRegistryContext);
  const scopedHost = useMemo<OfficialReactSurfaceHost | null>(
    () =>
      parentHost && registry
        ? Object.freeze({
            getStyleContainer: parentHost.getStyleContainer,
            getOverlayContainer: parentHost.getOverlayContainer,
            registerCleanup: (cleanup: () => void | Promise<void>) =>
              registry.register(owner, cleanup),
          })
        : null,
    [owner, parentHost, registry]
  );
  if (!scopedHost) {
    throw new Error(
      'Official plugin projection requires a controlled Web surface registry.'
    );
  }
  return (
    <OfficialReactSurfaceHostContext.Provider value={scopedHost}>
      {children}
    </OfficialReactSurfaceHostContext.Provider>
  );
}

export const scopeOfficialPluginNode = (
  owner: PluginOwnerRef,
  node: ReactNode
): ReactNode => createElement(OfficialPluginOwnerSurface, { owner }, node);

export const scopeOfficialPluginComponent = (
  owner: PluginOwnerRef,
  component: ElementType
): ElementType => {
  const ScopedOfficialPluginComponent = (props: Record<string, unknown>) =>
    createElement(
      OfficialPluginOwnerSurface,
      { owner },
      createElement(component, props)
    );
  ScopedOfficialPluginComponent.displayName = `OfficialPluginSurface(${owner.pluginId}@${owner.generation})`;
  return ScopedOfficialPluginComponent;
};
