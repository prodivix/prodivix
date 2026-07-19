import type { ExecutableProjectCommand } from '@prodivix/runtime-core';
import type { BrowserProjectFileTree } from '../browserProjectFileTree';
import type {
  BrowserProjectRuntime,
  BrowserProjectRuntimeProcess,
} from '../browserProjectRuntime';

type Deferred = Readonly<{
  promise: Promise<number>;
  resolve(value: number): void;
}>;

export type RuntimeCommandPlan = Readonly<{
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
    emitPreviewError: (error: {
      message: string;
      stack?: string;
      pathname?: string;
    }) => previewErrorListeners.forEach((listener) => listener(error)),
    emitError: (error: Error) =>
      errorListeners.forEach((listener) => listener(error)),
  };
};
