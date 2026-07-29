import type { ExecutableProjectCommand } from '@prodivix/runtime-core';
import type { BrowserProjectFileTree } from './browserProjectFileTree';

export type BrowserProjectRuntimeProcess = Readonly<{
  exit: Promise<number>;
  output: ReadableStream<string>;
  kill(): void;
}>;

export type BrowserProjectRuntimePreviewError = Readonly<{
  message: string;
  stack?: string;
  pathname?: string;
}>;

export type BrowserProjectRuntime = Readonly<{
  mount(tree: BrowserProjectFileTree): Promise<void>;
  mkdir(path: string): Promise<void>;
  readFile(path: string): Promise<string | Uint8Array>;
  writeFile(path: string, contents: string | Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  spawn(
    command: ExecutableProjectCommand
  ): Promise<BrowserProjectRuntimeProcess>;
  onServerReady(listener: (url: string, port: number) => void): () => void;
  onPreviewError(
    listener: (error: BrowserProjectRuntimePreviewError) => void
  ): () => void;
  onError(listener: (error: Error) => void): () => void;
  dispose(): void;
}>;

export type BrowserProjectRuntimeFactory = () => Promise<BrowserProjectRuntime>;

export type WebContainerRuntimeOptions = Readonly<{
  apiKey?: string;
  coep?: 'require-corp' | 'credentialless';
}>;

export const WEB_CONTAINER_PROJECT_ROOT =
  '/home/projects/prodivix-runner' as const;

const assertWebContainerEnvironment = (): void => {
  if (typeof window === 'undefined') {
    throw new Error(
      'The browser project runner requires a browser environment.'
    );
  }
  if (
    !globalThis.crossOriginIsolated ||
    typeof SharedArrayBuffer === 'undefined'
  ) {
    throw new Error(
      'The browser project runner requires cross-origin isolation. Restart the host with COOP and COEP headers enabled.'
    );
  }
};

const serializePreviewValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

/** Boots the vendor runtime behind a narrow, replaceable browser project port. */
export const createWebContainerRuntime = async (
  options: WebContainerRuntimeOptions = {}
): Promise<BrowserProjectRuntime> => {
  assertWebContainerEnvironment();
  const api = await import('@webcontainer/api');
  if (options.apiKey) api.configureAPIKey(options.apiKey);
  const container = await api.WebContainer.boot({
    coep: options.coep ?? 'credentialless',
    forwardPreviewErrors: true,
    workdirName: WEB_CONTAINER_PROJECT_ROOT.slice(
      WEB_CONTAINER_PROJECT_ROOT.lastIndexOf('/') + 1
    ),
  });

  return Object.freeze({
    mount: (tree) => container.mount(tree),
    mkdir: async (path) => {
      await container.fs.mkdir(path, { recursive: true });
    },
    readFile: (path) => container.fs.readFile(path),
    writeFile: (path, contents) => container.fs.writeFile(path, contents),
    remove: (path) => container.fs.rm(path, { force: true, recursive: true }),
    spawn: async (command) => {
      const process = await container.spawn(command.command, [
        ...(command.args ?? []),
      ]);
      return Object.freeze({
        exit: process.exit,
        output: process.output,
        kill: () => process.kill(),
      });
    },
    onServerReady: (listener) =>
      container.on('server-ready', (port, url) => listener(url, port)),
    onPreviewError: (listener) =>
      container.on('preview-message', (message) => {
        if ('message' in message) {
          listener({
            message: message.message,
            ...(message.stack ? { stack: message.stack } : {}),
            ...(message.pathname ? { pathname: message.pathname } : {}),
          });
          return;
        }
        listener({
          message: message.args.map(serializePreviewValue).join(' '),
          ...(message.stack ? { stack: message.stack } : {}),
          ...(message.pathname ? { pathname: message.pathname } : {}),
        });
      }),
    onError: (listener) =>
      container.on('error', (error) => listener(new Error(error.message))),
    dispose: () => container.teardown(),
  });
};
