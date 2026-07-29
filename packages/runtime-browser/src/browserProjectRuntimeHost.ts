import {
  normalizeExecutableProjectPath,
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectCommand,
  type ExecutableProjectEntrypointKind,
  type ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import { createBrowserProjectFileTree } from './browserProjectFileTree';
import {
  createWebContainerRuntime,
  type BrowserProjectRuntime,
  type BrowserProjectRuntimeFactory,
  type BrowserProjectRuntimePreviewError,
  type BrowserProjectRuntimeProcess,
  type WebContainerRuntimeOptions,
} from './browserProjectRuntime';

export type BrowserProjectRuntimeProcessIdentity = Readonly<{
  ownerId: string;
  generation: number;
  processId: string;
}>;

export type BrowserProjectRuntimeHostEvent =
  | Readonly<{
      kind: 'output';
      ownerId: string;
      generation: number;
      processId: string;
      label: string;
      message: string;
    }>
  | Readonly<{
      kind: 'output-error';
      ownerId: string;
      generation: number;
      processId: string;
      label: string;
      error: Error;
    }>
  | Readonly<{
      kind: 'server-ready';
      ownerId: string;
      generation: number;
      processId: string;
      url: string;
      port: number;
    }>
  | Readonly<{
      kind: 'preview-error';
      ownerId: string;
      generation: number;
      processId: string;
      error: BrowserProjectRuntimePreviewError;
    }>
  | Readonly<{
      kind: 'runtime-error';
      ownerId: string;
      generation: number;
      processId: string;
      error: Error;
    }>;

export type BrowserProjectRuntimeHostProcess =
  BrowserProjectRuntimeProcessIdentity &
    Readonly<{
      exit: Promise<number>;
      outputCompletion: Promise<void>;
      kill(): void;
      wasStopRequested(): boolean;
    }>;

export type BrowserProjectRuntimeHostLease = Readonly<{
  ownerId: string;
  generation: number;
  workspaceId: string;
  snapshotId: string;
}>;

export type BrowserProjectRuntimeHostPrepareResult = Readonly<{
  dependenciesInstalled: boolean;
  dependencyFingerprint: string;
  lease: BrowserProjectRuntimeHostLease;
}>;

export type BrowserProjectRuntimeHost = Readonly<{
  prepare(
    ownerId: string,
    snapshot: ExecutableProjectSnapshot,
    operation?: ExecutableProjectEntrypointKind
  ): Promise<BrowserProjectRuntimeHostPrepareResult>;
  spawn(
    ownerId: string,
    command: ExecutableProjectCommand,
    options: Readonly<{
      lease: BrowserProjectRuntimeHostLease;
      label?: string;
      kind?: 'command' | 'server';
    }>
  ): Promise<BrowserProjectRuntimeHostProcess>;
  mkdir(path: string, lease: BrowserProjectRuntimeHostLease): Promise<void>;
  readFile(
    path: string,
    lease: BrowserProjectRuntimeHostLease
  ): Promise<string | Uint8Array>;
  remove(path: string, lease: BrowserProjectRuntimeHostLease): Promise<void>;
  stopOwner(ownerId: string): Promise<void>;
  subscribe(
    listener: (event: BrowserProjectRuntimeHostEvent) => void
  ): () => void;
  dispose(): Promise<void>;
}>;

export type CreateBrowserProjectRuntimeHostOptions = Readonly<{
  createRuntime?: BrowserProjectRuntimeFactory;
  webContainer?: WebContainerRuntimeOptions;
}>;

export class BrowserProjectRuntimeHostBusyError extends Error {
  readonly ownerIds: readonly string[];

  constructor(ownerIds: readonly string[]) {
    super(
      `Browser project snapshot cannot change while runtime processes are still active: ${ownerIds.join(', ')}.`
    );
    this.name = 'BrowserProjectRuntimeHostBusyError';
    this.ownerIds = Object.freeze([...ownerIds]);
  }
}

export class BrowserProjectRuntimeHostLeaseError extends Error {
  constructor() {
    super(
      'Browser project runtime lease is stale or does not belong to this owner.'
    );
    this.name = 'BrowserProjectRuntimeHostLeaseError';
  }
}

export class BrowserProjectCommandError extends Error {
  readonly command: ExecutableProjectCommand;
  readonly exitCode: number;

  constructor(command: ExecutableProjectCommand, exitCode: number) {
    super(
      `Browser project command ${command.command} exited with code ${exitCode}.`
    );
    this.name = 'BrowserProjectCommandError';
    this.command = command;
    this.exitCode = exitCode;
  }
}

const normalizeOwnerId = (value: string): string => {
  const normalized = value.trim();
  if (!normalized) {
    throw new TypeError('Browser project runtime ownerId must not be empty.');
  }
  return normalized;
};

const cloneContents = (contents: string | Uint8Array): string | Uint8Array =>
  typeof contents === 'string' ? contents : new Uint8Array(contents);

const contentsEqual = (
  left: string | Uint8Array,
  right: string | Uint8Array
): boolean => {
  if (typeof left === 'string' || typeof right === 'string') {
    return (
      typeof left === 'string' && typeof right === 'string' && left === right
    );
  }
  return (
    left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index])
  );
};

const contentFingerprint = (contents: string | Uint8Array): string => {
  let hash = 2_166_136_261;
  const update = (value: number) => {
    hash ^= value;
    hash = Math.imul(hash, 16_777_619);
  };
  if (typeof contents === 'string') {
    for (let index = 0; index < contents.length; index += 1) {
      update(contents.charCodeAt(index));
    }
  } else {
    contents.forEach(update);
  }
  return `${contents.length}:${(hash >>> 0).toString(16)}`;
};

const projectDependencyFingerprint = (
  snapshot: ExecutableProjectSnapshot
): string => snapshot.dependencyPlan.installFingerprint;

const projectFileFingerprint = (
  snapshot: ExecutableProjectSnapshot,
  operation?: ExecutableProjectEntrypointKind
): string =>
  JSON.stringify(
    projectExecutableProjectRuntimeFiles(snapshot, operation).map((file) => [
      file.path,
      contentFingerprint(file.contents),
    ])
  );

const parentDirectories = (path: string): string[] => {
  const segments = path.split('/');
  return segments
    .slice(0, -1)
    .map((_, index) => segments.slice(0, index + 1).join('/'));
};

const stripAnsi = (value: string): string =>
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

/**
 * Owns one lazily booted browser Node runtime. Preview, Test, and later
 * Terminal adapters share its filesystem and dependency installation while
 * retaining owner-scoped processes and cancellation.
 */
export const createBrowserProjectRuntimeHost = (
  options: CreateBrowserProjectRuntimeHostOptions = {}
): BrowserProjectRuntimeHost => {
  const runtimeFactory =
    options.createRuntime ??
    (() => createWebContainerRuntime(options.webContainer));
  const listeners = new Set<(event: BrowserProjectRuntimeHostEvent) => void>();
  const processesByOwner = new Map<
    string,
    Set<BrowserProjectRuntimeHostProcess>
  >();
  const pendingProcessStartsByOwner = new Map<string, Set<Promise<void>>>();
  let runtimePromise: Promise<BrowserProjectRuntime> | undefined;
  let runtime: BrowserProjectRuntime | undefined;
  let runtimeUnsubscribers: readonly (() => void)[] = [];
  let runtimeEventEpoch = 0;
  let serverRuntimeRestartRequired = false;
  let mounted = false;
  let managedFiles = new Map<string, string | Uint8Array>();
  let installedDependencyFingerprint: string | undefined;
  let preparedProjectFingerprint: string | undefined;
  let leaseGeneration = 0;
  let processSequence = 0;
  let activeLease: BrowserProjectRuntimeHostLease | undefined;
  const ownerStopEpochs = new Map<string, number>();
  let serverIdentity: BrowserProjectRuntimeProcessIdentity | undefined;
  let serverProcess: BrowserProjectRuntimeHostProcess | undefined;
  let operationTail: Promise<void> = Promise.resolve();
  let disposed = false;
  let disposePromise: Promise<void> | undefined;

  const publish = (event: BrowserProjectRuntimeHostEvent): void => {
    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch {
        // Host observation cannot alter runtime or process lifecycle.
      }
    });
  };

  const attachRuntimeEvents = (value: BrowserProjectRuntime): void => {
    runtimeEventEpoch += 1;
    const sourceEpoch = runtimeEventEpoch;
    const isCurrentSource = (): boolean =>
      !disposed && runtime === value && runtimeEventEpoch === sourceEpoch;
    runtimeUnsubscribers = Object.freeze([
      value.onServerReady((url, port) => {
        if (!isCurrentSource()) return;
        const identity = serverIdentity;
        if (!identity) return;
        publish({
          kind: 'server-ready',
          ...identity,
          url,
          port,
        });
      }),
      value.onPreviewError((error) => {
        if (!isCurrentSource()) return;
        const identity = serverIdentity;
        if (!identity) return;
        publish({
          kind: 'preview-error',
          ...identity,
          error,
        });
      }),
      value.onError((error) => {
        if (!isCurrentSource()) return;
        const identities: BrowserProjectRuntimeProcessIdentity[] = [
          ...new Map(
            [...processesByOwner.values()]
              .flatMap((processes) => [...processes])
              .map((process) => [process.processId, process] as const)
          ).values(),
        ].map(({ ownerId, generation, processId }) =>
          Object.freeze({ ownerId, generation, processId })
        );
        if (
          serverIdentity &&
          !identities.some(
            (identity) => identity.processId === serverIdentity?.processId
          )
        ) {
          identities.push(serverIdentity);
        }
        identities.forEach((identity) =>
          publish({ kind: 'runtime-error', ...identity, error })
        );
      }),
    ]);
  };

  const resolveRuntime = async (): Promise<BrowserProjectRuntime> => {
    if (disposed) {
      throw new Error('The browser project runtime host has been disposed.');
    }
    if (!runtimePromise) {
      runtimePromise = runtimeFactory()
        .then((value) => {
          runtime = value;
          attachRuntimeEvents(value);
          return value;
        })
        .catch((error) => {
          runtimePromise = undefined;
          throw error;
        });
    }
    return runtimePromise;
  };

  const restartRuntimeAfterServer = (): void => {
    runtimeEventEpoch += 1;
    runtimeUnsubscribers.forEach((unsubscribe) => unsubscribe());
    runtimeUnsubscribers = [];
    runtime?.dispose();
    runtime = undefined;
    runtimePromise = undefined;
    mounted = false;
    managedFiles = new Map();
    installedDependencyFingerprint = undefined;
    preparedProjectFingerprint = undefined;
    serverIdentity = undefined;
    serverProcess = undefined;
    serverRuntimeRestartRequired = false;
  };

  const enqueue = <Value>(operation: () => Promise<Value>): Promise<Value> => {
    const result = operationTail.then(operation, operation);
    operationTail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };

  const syncFiles = async (
    value: BrowserProjectRuntime,
    snapshot: ExecutableProjectSnapshot,
    operation?: ExecutableProjectEntrypointKind
  ): Promise<void> => {
    const runtimeFiles = projectExecutableProjectRuntimeFiles(
      snapshot,
      operation
    );
    if (!mounted) {
      await value.mount(createBrowserProjectFileTree(runtimeFiles));
      mounted = true;
      managedFiles = new Map(
        runtimeFiles.map((file) => [file.path, cloneContents(file.contents)])
      );
      return;
    }

    const nextFiles = new Map(
      runtimeFiles.map((file) => [file.path, file.contents])
    );
    const deletedPaths = [...managedFiles.keys()]
      .filter((path) => !nextFiles.has(path))
      .sort((left, right) => right.length - left.length);
    for (const path of deletedPaths) await value.remove(path);

    const changedFiles = runtimeFiles.filter((file) => {
      const previous = managedFiles.get(file.path);
      return previous === undefined || !contentsEqual(previous, file.contents);
    });
    const directories = [
      ...new Set(changedFiles.flatMap((file) => parentDirectories(file.path))),
    ].sort((left, right) => left.length - right.length);
    for (const directory of directories) await value.mkdir(directory);
    for (const file of changedFiles) {
      await value.remove(file.path);
      await value.writeFile(file.path, file.contents);
    }
    managedFiles = new Map(
      runtimeFiles.map((file) => [file.path, cloneContents(file.contents)])
    );
  };

  const consumeOutput = (
    identity: BrowserProjectRuntimeProcessIdentity,
    label: string,
    process: BrowserProjectRuntimeProcess
  ): Promise<void> => {
    let remainder = '';
    return process.output
      .pipeTo(
        new WritableStream<string>({
          write(chunk) {
            const lines = `${remainder}${stripAnsi(chunk)}`.split(/\r?\n/);
            remainder = lines.pop() ?? '';
            lines
              .map((line) => line.trimEnd())
              .filter(Boolean)
              .forEach((message) =>
                publish({ kind: 'output', ...identity, label, message })
              );
          },
          close() {
            if (remainder.trim()) {
              publish({
                kind: 'output',
                ...identity,
                label,
                message: remainder.trimEnd(),
              });
            }
          },
        })
      )
      .catch((error) => {
        publish({
          kind: 'output-error',
          ...identity,
          label,
          error: toError(error),
        });
      });
  };

  const assertLease = (
    ownerId: string,
    lease: BrowserProjectRuntimeHostLease
  ): void => {
    if (lease !== activeLease || lease.ownerId !== ownerId) {
      throw new BrowserProjectRuntimeHostLeaseError();
    }
  };

  const waitForProcessCleanup = (
    process: BrowserProjectRuntimeHostProcess
  ): Promise<void> =>
    Promise.race([
      Promise.all([
        process.exit.then(
          () => undefined,
          () => undefined
        ),
        process.outputCompletion,
      ]).then(() => undefined),
      new Promise<void>((resolve) => globalThis.setTimeout(resolve, 1_500)),
    ]);

  const spawnOwnedProcess = async (
    ownerValue: string,
    command: ExecutableProjectCommand,
    spawnOptions: Readonly<{
      label?: string;
      kind?: 'command' | 'server';
    }>,
    generation: number
  ): Promise<BrowserProjectRuntimeHostProcess> => {
    const ownerId = normalizeOwnerId(ownerValue);
    const stopEpoch = ownerStopEpochs.get(ownerId) ?? 0;
    let resolvePendingStart!: () => void;
    const pendingStart = new Promise<void>((resolve) => {
      resolvePendingStart = resolve;
    });
    const pendingStarts =
      pendingProcessStartsByOwner.get(ownerId) ?? new Set<Promise<void>>();
    pendingStarts.add(pendingStart);
    pendingProcessStartsByOwner.set(ownerId, pendingStarts);
    if (spawnOptions.kind === 'server' && serverIdentity) {
      pendingStarts.delete(pendingStart);
      if (!pendingStarts.size) pendingProcessStartsByOwner.delete(ownerId);
      resolvePendingStart();
      throw new BrowserProjectRuntimeHostBusyError([serverIdentity.ownerId]);
    }
    try {
      const value = await resolveRuntime();
      processSequence += 1;
      const identity: BrowserProjectRuntimeProcessIdentity = Object.freeze({
        ownerId,
        generation,
        processId: `browser-process-${processSequence}`,
      });
      if (spawnOptions.kind === 'server') serverIdentity = identity;
      let process: BrowserProjectRuntimeProcess;
      try {
        process = await value.spawn(command);
      } catch (error) {
        if (serverIdentity === identity) {
          serverRuntimeRestartRequired = true;
          serverIdentity = undefined;
        }
        throw error;
      }
      const label = spawnOptions.label?.trim() || command.command;
      let stopRequested = false;
      const outputCompletion = consumeOutput(identity, label, process);
      const hostProcess: BrowserProjectRuntimeHostProcess = Object.freeze({
        ...identity,
        exit: process.exit,
        outputCompletion,
        kill: () => {
          if (stopRequested) return;
          stopRequested = true;
          process.kill();
        },
        wasStopRequested: () => stopRequested,
      });
      if (spawnOptions.kind === 'server') {
        serverProcess = hostProcess;
        const requireRuntimeRestart = (): void => {
          serverRuntimeRestartRequired = true;
        };
        void process.exit.then(requireRuntimeRestart, requireRuntimeRestart);
      }
      const owned = processesByOwner.get(ownerId) ?? new Set();
      owned.add(hostProcess);
      processesByOwner.set(ownerId, owned);
      const releaseProcess = (): void => {
        owned.delete(hostProcess);
        if (!owned.size) processesByOwner.delete(ownerId);
        if (spawnOptions.kind === 'server' && serverProcess === hostProcess) {
          serverIdentity = undefined;
          serverProcess = undefined;
        }
      };
      void Promise.all([
        process.exit.then(
          () => undefined,
          () => undefined
        ),
        outputCompletion,
      ]).then(releaseProcess);
      if ((ownerStopEpochs.get(ownerId) ?? 0) !== stopEpoch) {
        hostProcess.kill();
        await waitForProcessCleanup(hostProcess);
        throw new Error(
          `Browser project runtime owner ${ownerId} was stopped before its process started.`
        );
      }
      return hostProcess;
    } finally {
      pendingStarts.delete(pendingStart);
      if (!pendingStarts.size) pendingProcessStartsByOwner.delete(ownerId);
      resolvePendingStart();
    }
  };

  const spawn = (
    ownerValue: string,
    command: ExecutableProjectCommand,
    spawnOptions: Readonly<{
      lease: BrowserProjectRuntimeHostLease;
      label?: string;
      kind?: 'command' | 'server';
    }>
  ): Promise<BrowserProjectRuntimeHostProcess> => {
    const ownerId = normalizeOwnerId(ownerValue);
    return enqueue(async () => {
      assertLease(ownerId, spawnOptions.lease);
      const process = await spawnOwnedProcess(
        ownerId,
        command,
        spawnOptions,
        spawnOptions.lease.generation
      );
      try {
        assertLease(ownerId, spawnOptions.lease);
      } catch (error) {
        process.kill();
        throw error;
      }
      return process;
    });
  };

  const stopOwner = async (ownerValue: string): Promise<void> => {
    const ownerId = normalizeOwnerId(ownerValue);
    ownerStopEpochs.set(ownerId, (ownerStopEpochs.get(ownerId) ?? 0) + 1);
    if (activeLease?.ownerId === ownerId) activeLease = undefined;
    const processes = [...(processesByOwner.get(ownerId) ?? [])];
    const pendingStarts = [...(pendingProcessStartsByOwner.get(ownerId) ?? [])];
    if (serverProcess && processes.includes(serverProcess)) {
      serverRuntimeRestartRequired = true;
    }
    processes.forEach((process) => process.kill());
    await Promise.all([
      ...processes.map(waitForProcessCleanup),
      ...pendingStarts,
    ]);
  };

  const prepare = (
    ownerValue: string,
    snapshot: ExecutableProjectSnapshot,
    operation?: ExecutableProjectEntrypointKind
  ): Promise<BrowserProjectRuntimeHostPrepareResult> => {
    const ownerId = normalizeOwnerId(ownerValue);
    return enqueue(async () => {
      if (disposed) {
        throw new Error('The browser project runtime host has been disposed.');
      }
      activeLease = undefined;
      if (serverRuntimeRestartRequired) {
        const blockingOwners = [
          ...new Set([
            ...processesByOwner.keys(),
            ...pendingProcessStartsByOwner.keys(),
          ]),
        ].sort();
        if (blockingOwners.length) {
          throw new BrowserProjectRuntimeHostBusyError(blockingOwners);
        }
        restartRuntimeAfterServer();
      }
      const dependencyFingerprint = projectDependencyFingerprint(snapshot);
      const fileFingerprint = projectFileFingerprint(snapshot, operation);
      const dependenciesChanged =
        snapshot.cacheHints.dependencyInstall === 'isolated' ||
        dependencyFingerprint !== installedDependencyFingerprint;
      const filesChanged = fileFingerprint !== preparedProjectFingerprint;
      const foreignOwners = [...processesByOwner.keys()].filter(
        (candidate) => candidate !== ownerId
      );
      const cleanupPending = [...(processesByOwner.get(ownerId) ?? [])].some(
        (process) => process.wasStopRequested()
      );
      if (cleanupPending) {
        throw new BrowserProjectRuntimeHostBusyError([ownerId]);
      }
      if ((dependenciesChanged || filesChanged) && foreignOwners.length) {
        throw new BrowserProjectRuntimeHostBusyError(foreignOwners.sort());
      }
      if (dependenciesChanged) {
        await stopOwner(ownerId);
      }
      leaseGeneration += 1;
      const generation = leaseGeneration;
      const value = await resolveRuntime();
      await syncFiles(value, snapshot, operation);
      preparedProjectFingerprint = fileFingerprint;
      if (dependenciesChanged) {
        const installProcess = await spawnOwnedProcess(
          ownerId,
          snapshot.installCommand,
          { label: 'install' },
          generation
        );
        const exitCode = await installProcess.exit;
        await installProcess.outputCompletion;
        if (exitCode !== 0) {
          throw new BrowserProjectCommandError(
            snapshot.installCommand,
            exitCode
          );
        }
        installedDependencyFingerprint = dependencyFingerprint;
      }
      const lease = Object.freeze({
        ownerId,
        generation,
        workspaceId: snapshot.workspace.workspaceId,
        snapshotId: snapshot.workspace.snapshotId,
      });
      activeLease = lease;
      return Object.freeze({
        dependenciesInstalled: dependenciesChanged,
        dependencyFingerprint,
        lease,
      });
    });
  };

  const stopAll = async (): Promise<void> => {
    await Promise.all(
      [
        ...new Set([
          ...processesByOwner.keys(),
          ...pendingProcessStartsByOwner.keys(),
        ]),
      ].map(stopOwner)
    );
  };

  return Object.freeze({
    prepare,
    spawn,
    mkdir: (path, lease) =>
      enqueue(async () => {
        assertLease(lease.ownerId, lease);
        const normalized = normalizeExecutableProjectPath(path);
        const value = await resolveRuntime();
        await value.mkdir(normalized);
      }),
    readFile: (path, lease) =>
      enqueue(async () => {
        assertLease(lease.ownerId, lease);
        const normalized = normalizeExecutableProjectPath(path);
        const value = await resolveRuntime();
        return value.readFile(normalized);
      }),
    remove: (path, lease) =>
      enqueue(async () => {
        assertLease(lease.ownerId, lease);
        const normalized = normalizeExecutableProjectPath(path);
        if (
          [...managedFiles.keys()].some(
            (candidate) =>
              candidate === normalized || candidate.startsWith(`${normalized}/`)
          )
        ) {
          throw new TypeError(
            `Managed browser project files cannot be removed outside snapshot preparation: ${normalized}`
          );
        }
        const value = await resolveRuntime();
        await value.remove(normalized);
      }),
    stopOwner,
    subscribe: (listener) => {
      if (disposed) {
        throw new Error('The browser project runtime host has been disposed.');
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: async () => {
      if (disposePromise) return disposePromise;
      disposed = true;
      disposePromise = (async () => {
        await stopAll();
        await operationTail;
        runtimeEventEpoch += 1;
        runtimeUnsubscribers.forEach((unsubscribe) => unsubscribe());
        runtimeUnsubscribers = [];
        runtime?.dispose();
        runtime = undefined;
        runtimePromise = undefined;
        mounted = false;
        managedFiles.clear();
        installedDependencyFingerprint = undefined;
        preparedProjectFingerprint = undefined;
        activeLease = undefined;
        ownerStopEpochs.clear();
        pendingProcessStartsByOwner.clear();
        serverIdentity = undefined;
        serverProcess = undefined;
        listeners.clear();
      })();
      return disposePromise;
    },
  });
};
