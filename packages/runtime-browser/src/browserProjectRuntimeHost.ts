import {
  normalizeExecutableProjectPath,
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectCommand,
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

export type BrowserProjectRuntimeHostEvent =
  | Readonly<{
      kind: 'output';
      ownerId: string;
      label: string;
      message: string;
    }>
  | Readonly<{
      kind: 'output-error';
      ownerId: string;
      label: string;
      error: Error;
    }>
  | Readonly<{
      kind: 'server-ready';
      ownerId?: string;
      url: string;
      port: number;
    }>
  | Readonly<{
      kind: 'preview-error';
      ownerId?: string;
      error: BrowserProjectRuntimePreviewError;
    }>
  | Readonly<{
      kind: 'runtime-error';
      error: Error;
    }>;

export type BrowserProjectRuntimeHostProcess = Readonly<{
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
    snapshot: ExecutableProjectSnapshot
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
      `Browser project snapshot cannot change while another owner is running: ${ownerIds.join(', ')}.`
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

const projectFileFingerprint = (snapshot: ExecutableProjectSnapshot): string =>
  JSON.stringify(
    projectExecutableProjectRuntimeFiles(snapshot).map((file) => [
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
  let runtimePromise: Promise<BrowserProjectRuntime> | undefined;
  let runtime: BrowserProjectRuntime | undefined;
  let runtimeUnsubscribers: readonly (() => void)[] = [];
  let mounted = false;
  let managedFiles = new Map<string, string | Uint8Array>();
  let installedDependencyFingerprint: string | undefined;
  let preparedProjectFingerprint: string | undefined;
  let leaseGeneration = 0;
  let activeLease: BrowserProjectRuntimeHostLease | undefined;
  const ownerStopEpochs = new Map<string, number>();
  let serverOwnerId: string | undefined;
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
    runtimeUnsubscribers = Object.freeze([
      value.onServerReady((url, port) => {
        publish({
          kind: 'server-ready',
          ...(serverOwnerId ? { ownerId: serverOwnerId } : {}),
          url,
          port,
        });
      }),
      value.onPreviewError((error) => {
        publish({
          kind: 'preview-error',
          ...(serverOwnerId ? { ownerId: serverOwnerId } : {}),
          error,
        });
      }),
      value.onError((error) => publish({ kind: 'runtime-error', error })),
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
    snapshot: ExecutableProjectSnapshot
  ): Promise<void> => {
    const runtimeFiles = projectExecutableProjectRuntimeFiles(snapshot);
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
    ownerId: string,
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
                publish({ kind: 'output', ownerId, label, message })
              );
          },
          close() {
            if (remainder.trim()) {
              publish({
                kind: 'output',
                ownerId,
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
          ownerId,
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

  const spawnOwnedProcess = async (
    ownerValue: string,
    command: ExecutableProjectCommand,
    spawnOptions: Readonly<{
      label?: string;
      kind?: 'command' | 'server';
    }> = {}
  ): Promise<BrowserProjectRuntimeHostProcess> => {
    const ownerId = normalizeOwnerId(ownerValue);
    const stopEpoch = ownerStopEpochs.get(ownerId) ?? 0;
    if (
      spawnOptions.kind === 'server' &&
      serverOwnerId &&
      serverOwnerId !== ownerId
    ) {
      throw new BrowserProjectRuntimeHostBusyError([serverOwnerId]);
    }
    const value = await resolveRuntime();
    const process = await value.spawn(command);
    if ((ownerStopEpochs.get(ownerId) ?? 0) !== stopEpoch) {
      process.kill();
      throw new Error(
        `Browser project runtime owner ${ownerId} was stopped before its process started.`
      );
    }
    const label = spawnOptions.label?.trim() || command.command;
    let stopRequested = false;
    if (spawnOptions.kind === 'server') serverOwnerId = ownerId;
    let hostProcess: BrowserProjectRuntimeHostProcess;
    const outputCompletion = consumeOutput(ownerId, label, process);
    hostProcess = Object.freeze({
      exit: process.exit,
      outputCompletion,
      kill: () => {
        if (stopRequested) return;
        stopRequested = true;
        process.kill();
      },
      wasStopRequested: () => stopRequested,
    });
    const owned = processesByOwner.get(ownerId) ?? new Set();
    owned.add(hostProcess);
    processesByOwner.set(ownerId, owned);
    void process.exit.finally(() => {
      owned.delete(hostProcess);
      if (!owned.size) processesByOwner.delete(ownerId);
      if (spawnOptions.kind === 'server' && serverOwnerId === ownerId) {
        serverOwnerId = undefined;
      }
    });
    return hostProcess;
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
      const process = await spawnOwnedProcess(ownerId, command, spawnOptions);
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
    processes.forEach((process) => process.kill());
    await Promise.all(
      processes.map((process) =>
        Promise.race([
          process.exit.then(() => undefined),
          new Promise<void>((resolve) => globalThis.setTimeout(resolve, 1_500)),
        ])
      )
    );
  };

  const prepare = (
    ownerValue: string,
    snapshot: ExecutableProjectSnapshot
  ): Promise<BrowserProjectRuntimeHostPrepareResult> => {
    const ownerId = normalizeOwnerId(ownerValue);
    return enqueue(async () => {
      if (disposed) {
        throw new Error('The browser project runtime host has been disposed.');
      }
      activeLease = undefined;
      const dependencyFingerprint = projectDependencyFingerprint(snapshot);
      const fileFingerprint = projectFileFingerprint(snapshot);
      const dependenciesChanged =
        snapshot.cacheHints.dependencyInstall === 'isolated' ||
        dependencyFingerprint !== installedDependencyFingerprint;
      const filesChanged = fileFingerprint !== preparedProjectFingerprint;
      const foreignOwners = [...processesByOwner.keys()].filter(
        (candidate) => candidate !== ownerId
      );
      if ((dependenciesChanged || filesChanged) && foreignOwners.length) {
        throw new BrowserProjectRuntimeHostBusyError(foreignOwners.sort());
      }
      if (dependenciesChanged) {
        await stopOwner(ownerId);
      }
      const value = await resolveRuntime();
      await syncFiles(value, snapshot);
      preparedProjectFingerprint = fileFingerprint;
      if (dependenciesChanged) {
        publish({
          kind: 'output',
          ownerId,
          label: 'install',
          message: 'Installing project dependencies.',
        });
        const installProcess = await spawnOwnedProcess(
          ownerId,
          snapshot.installCommand,
          { label: 'install' }
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
      leaseGeneration += 1;
      const lease = Object.freeze({
        ownerId,
        generation: leaseGeneration,
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
    await Promise.all([...processesByOwner.keys()].map(stopOwner));
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
        serverOwnerId = undefined;
        listeners.clear();
      })();
      return disposePromise;
    },
  });
};
