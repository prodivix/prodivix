import type { ExecutableProjectCommand } from '@prodivix/runtime-core';
import type { BrowserProjectFileTree } from '../browserProjectFileTree';
import type {
  BrowserProjectRuntime,
  BrowserProjectRuntimeProcess,
} from '../browserProjectRuntime';
import type {
  BrowserProjectRuntimeHost,
  BrowserProjectRuntimeHostEvent,
  BrowserProjectRuntimeHostProcess,
} from '../browserProjectRuntimeHost';

type Deferred = Readonly<{
  promise: Promise<number>;
  resolve(value: number): void;
}>;

export type RuntimeCommandPlan = Readonly<{
  beforeSpawn?: () => void | Promise<void>;
  exitCode?: number;
  output?: string;
  pending?: boolean;
  writeFiles?: Readonly<Record<string, string | Uint8Array>>;
}>;

export type RuntimeHarnessProcess = Readonly<{
  command: ExecutableProjectCommand;
  killed(): boolean;
  settle(exitCode: number): void;
}>;

export type RuntimeHostHarnessProcess = BrowserProjectRuntimeHostProcess &
  Readonly<{
    command: ExecutableProjectCommand;
    killed(): boolean;
    settle(exitCode: number): void;
  }>;

const createDeferred = (): Deferred => {
  let resolve: (value: number) => void = () => undefined;
  const promise = new Promise<number>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

const outputStream = (value = ''): ReadableStream<string> =>
  new ReadableStream({
    start(controller) {
      if (value) controller.enqueue(value);
      controller.close();
    },
  });

const cloneContents = (contents: string | Uint8Array): string | Uint8Array =>
  typeof contents === 'string' ? contents : new Uint8Array(contents);

const flattenTree = (
  tree: BrowserProjectFileTree,
  files: Map<string, string | Uint8Array>,
  prefix = ''
): void => {
  Object.entries(tree).forEach(([name, node]) => {
    const path = prefix ? `${prefix}/${name}` : name;
    if ('file' in node) {
      files.set(path, cloneContents(node.file.contents));
      return;
    }
    flattenTree(node.directory, files, path);
  });
};

export const createBrowserProjectRuntimeHarness = () => {
  const files = new Map<string, string | Uint8Array>();
  const commands: ExecutableProjectCommand[] = [];
  const installPlans: RuntimeCommandPlan[] = [];
  const commandPlans: RuntimeCommandPlan[] = [];
  const processes: RuntimeHarnessProcess[] = [];
  const serverReadyListeners = new Set<(url: string, port: number) => void>();
  const previewErrorListeners = new Set<
    (error: { message: string; stack?: string; pathname?: string }) => void
  >();
  const errorListeners = new Set<(error: Error) => void>();
  let bootCount = 0;
  let disposeCount = 0;

  const runtime: BrowserProjectRuntime = {
    mount: async (tree) => {
      flattenTree(tree, files);
    },
    mkdir: async () => undefined,
    readFile: async (path) => {
      const value = files.get(path);
      if (value === undefined) throw new Error(`Missing runtime file: ${path}`);
      return cloneContents(value);
    },
    writeFile: async (path, contents) => {
      files.set(path, cloneContents(contents));
    },
    remove: async (path) => {
      files.delete(path);
      [...files.keys()]
        .filter((candidate) => candidate.startsWith(`${path}/`))
        .forEach((candidate) => files.delete(candidate));
    },
    spawn: async (command): Promise<BrowserProjectRuntimeProcess> => {
      commands.push(command);
      const isInstall = command.args?.includes('install');
      const plan = isInstall
        ? (installPlans.shift() ??
          ({ exitCode: 0 } satisfies RuntimeCommandPlan))
        : (commandPlans.shift() ?? { exitCode: 0 });
      await plan.beforeSpawn?.();
      Object.entries(plan.writeFiles ?? {}).forEach(([path, contents]) => {
        files.set(path, cloneContents(contents));
      });
      const deferred = createDeferred();
      let killed = false;
      let settled = false;
      const settle = (exitCode: number) => {
        if (settled) return;
        settled = true;
        deferred.resolve(exitCode);
      };
      const record: RuntimeHarnessProcess = Object.freeze({
        command,
        killed: () => killed,
        settle,
      });
      processes.push(record);
      if (!plan.pending) queueMicrotask(() => settle(plan.exitCode ?? 0));
      return {
        exit: deferred.promise,
        output: outputStream(plan.output),
        kill: () => {
          killed = true;
          settle(143);
        },
      };
    },
    onServerReady: (listener) => {
      serverReadyListeners.add(listener);
      return () => {
        serverReadyListeners.delete(listener);
      };
    },
    onPreviewError: (listener) => {
      previewErrorListeners.add(listener);
      return () => {
        previewErrorListeners.delete(listener);
      };
    },
    onError: (listener) => {
      errorListeners.add(listener);
      return () => {
        errorListeners.delete(listener);
      };
    },
    dispose: () => {
      disposeCount += 1;
    },
  };

  return {
    runtime,
    files,
    commands,
    processes,
    queueInstallCommand: (plan: RuntimeCommandPlan) => installPlans.push(plan),
    queueCommand: (plan: RuntimeCommandPlan) => commandPlans.push(plan),
    createRuntime: async () => {
      bootCount += 1;
      return runtime;
    },
    bootCount: () => bootCount,
    disposeCount: () => disposeCount,
    emitServerReady: (url: string, port = 5173) =>
      serverReadyListeners.forEach((listener) => listener(url, port)),
    captureServerReadyListeners: () => [...serverReadyListeners],
    emitPreviewError: (error: {
      message: string;
      stack?: string;
      pathname?: string;
    }) => previewErrorListeners.forEach((listener) => listener(error)),
    capturePreviewErrorListeners: () => [...previewErrorListeners],
    emitError: (error: Error) =>
      errorListeners.forEach((listener) => listener(error)),
  };
};

export const createBrowserProjectRuntimeHostHarness = (
  options: Readonly<{ beforeStop?: () => void | Promise<void> }> = {}
) => {
  const listeners = new Set<(event: BrowserProjectRuntimeHostEvent) => void>();
  const processes: RuntimeHostHarnessProcess[] = [];
  let generation = 0;
  let processSequence = 0;

  const host: BrowserProjectRuntimeHost = Object.freeze({
    async prepare(ownerId, snapshot) {
      generation += 1;
      return Object.freeze({
        dependenciesInstalled: false,
        dependencyFingerprint: snapshot.dependencyPlan.installFingerprint,
        lease: Object.freeze({
          ownerId,
          generation,
          workspaceId: snapshot.workspace.workspaceId,
          snapshotId: snapshot.workspace.snapshotId,
        }),
      });
    },
    async spawn(ownerId, command, { lease }) {
      processSequence += 1;
      const completion = createDeferred();
      let killed = false;
      const settle = (exitCode: number) => completion.resolve(exitCode);
      const process: RuntimeHostHarnessProcess = Object.freeze({
        ownerId,
        generation: lease.generation,
        processId: `host-process-${processSequence}`,
        command,
        exit: completion.promise,
        outputCompletion: Promise.resolve(),
        kill() {
          if (killed) return;
          killed = true;
          settle(143);
        },
        wasStopRequested: () => killed,
        killed: () => killed,
        settle,
      });
      processes.push(process);
      return process;
    },
    mkdir: async () => undefined,
    readFile: async (path) => {
      throw new Error(`Missing runtime file: ${path}`);
    },
    remove: async () => undefined,
    async stopOwner(ownerId) {
      await options.beforeStop?.();
      const owned = processes.filter(
        (process) => process.ownerId === ownerId && !process.killed()
      );
      owned.forEach((process) => process.kill());
      await Promise.all(owned.map((process) => process.exit));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async dispose() {
      await Promise.all(
        [...new Set(processes.map((process) => process.ownerId))].map(
          host.stopOwner
        )
      );
      listeners.clear();
    },
  });

  return Object.freeze({
    host,
    processes,
    emit(event: BrowserProjectRuntimeHostEvent) {
      listeners.forEach((listener) => listener(event));
    },
  });
};
