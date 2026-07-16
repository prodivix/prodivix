import { describe, expect, it } from 'vitest';
import {
  createExecutableProjectSnapshot,
  createExecutionRequest,
  createExecutionNetworkTrace,
  type ExecutionJob,
} from '@prodivix/runtime-core';
import type {
  BrowserProjectRuntime,
  BrowserProjectRuntimeProcess,
} from './browserProjectRuntime';
import { createBrowserProjectRunner } from './browserProjectRunner';

type Deferred = Readonly<{
  promise: Promise<number>;
  resolve(value: number): void;
}>;

const createDeferred = (): Deferred => {
  let resolve: (value: number) => void = () => undefined;
  const promise = new Promise<number>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

const emptyOutput = (): ReadableStream<string> =>
  new ReadableStream({
    start(controller) {
      controller.close();
    },
  });

const createRuntimeHarness = () => {
  const commands: string[] = [];
  const writes: string[] = [];
  const serverReadyListeners = new Set<(url: string, port: number) => void>();
  let serverExit: Deferred | undefined;
  const runtime: BrowserProjectRuntime = {
    mount: async () => undefined,
    mkdir: async () => undefined,
    readFile: async () => new Uint8Array(),
    writeFile: async (path) => {
      writes.push(path);
    },
    remove: async () => undefined,
    spawn: async (command): Promise<BrowserProjectRuntimeProcess> => {
      commands.push([command.command, ...(command.args ?? [])].join(' '));
      if (command.args?.includes('install')) {
        return {
          exit: Promise.resolve(0),
          output: emptyOutput(),
          kill: () => undefined,
        };
      }
      serverExit = createDeferred();
      queueMicrotask(() => {
        serverReadyListeners.forEach((listener) =>
          listener('https://preview.local', 5173)
        );
      });
      return {
        exit: serverExit.promise,
        output: emptyOutput(),
        kill: () => serverExit?.resolve(0),
      };
    },
    onServerReady: (listener) => {
      serverReadyListeners.add(listener);
      return () => serverReadyListeners.delete(listener);
    },
    onPreviewError: () => () => undefined,
    onError: () => () => undefined,
    dispose: () => undefined,
  };
  return { runtime, commands, writes };
};

const waitForPreview = (job: ExecutionJob): Promise<string> =>
  new Promise((resolve, reject) => {
    const unsubscribe = job.subscribe((event) => {
      if (event.kind === 'artifact' && event.artifact.uri) {
        unsubscribe();
        resolve(event.artifact.uri);
      }
      if (event.kind === 'state' && event.snapshot.status === 'failed') {
        unsubscribe();
        reject(new Error(event.reason ?? 'Execution failed.'));
      }
    });
  });

const request = (snapshotId: string) =>
  createExecutionRequest({
    requestId: `request-${snapshotId}`,
    profile: 'preview',
    runtimeZone: 'client',
    workspace: { workspaceId: 'workspace', snapshotId },
    invocation: {
      kind: 'workspace',
      targetRef: { kind: 'workspace', workspaceId: 'workspace' },
    },
    requiredCapabilities: ['filesystem', 'hmr'],
  });

describe('browser project runner conformance', () => {
  it('publishes an isolated preview and reuses the live server for source-only revisions', async () => {
    const harness = createRuntimeHarness();
    const runner = createBrowserProjectRunner({
      createRuntime: async () => harness.runtime,
      createJobId: (input) => `job-${input.requestId}`,
      resolveProject: (input) =>
        createExecutableProjectSnapshot({
          workspace: input.workspace,
          target: {
            presetId: 'react-vite',
            framework: 'react',
            runtime: 'vite',
          },
          files: [
            {
              path: 'package.json',
              contents: JSON.stringify({
                scripts: { dev: 'vite' },
                dependencies: {},
              }),
            },
            {
              path: 'src/main.tsx',
              contents: `export const revision = '${input.workspace.snapshotId}';`,
            },
          ],
          dependencyPlan: { manifestFilePath: 'package.json' },
          entrypoints: [{ kind: 'preview', path: 'src/main.tsx' }],
          capabilityRequirements: {
            preview: ['filesystem', 'hmr'],
            build: ['filesystem', 'build'],
            test: ['filesystem', 'test'],
          },
        }),
    });

    const first = await runner.provider.start(request('one'));
    await expect(waitForPreview(first)).resolves.toBe('https://preview.local');
    const observed: string[] = [];
    const unsubscribe = first.subscribe((event) => {
      if (event.kind === 'trace') observed.push(event.trace.name);
    });
    expect(
      runner.publishNetworkTrace(
        createExecutionNetworkTrace({
          requestId: 'data-request-1',
          phase: 'runtime',
          runtimeZone: 'client',
          mode: 'live',
          adapter: 'core.http',
          method: 'GET',
          sanitizedUrl: 'https://api.example.test/',
          protocol: 'https',
          startedAt: 1,
          completedAt: 2,
          outcome: 'allowed',
          status: 200,
        })
      )
    ).toBe(true);
    expect(observed).toEqual(['network.request']);
    unsubscribe();
    const second = await runner.provider.start(request('two'));
    await expect(waitForPreview(second)).resolves.toBe('https://preview.local');

    await expect(first.completion).resolves.toMatchObject({
      status: 'cancelled',
    });
    expect(harness.commands).toEqual([
      'npm install',
      'npm run dev -- --host 0.0.0.0',
    ]);
    expect(harness.writes).toContain('src/main.tsx');

    await runner.dispose();
  });
});
