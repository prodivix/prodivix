import {
  createBrowserProjectRunner,
  createBrowserProjectRuntimeHost,
  createBrowserProjectTestRunner,
  type BrowserProjectFileTree,
  type BrowserProjectRuntime,
  type BrowserProjectRuntimeProcess,
} from '@prodivix/runtime-browser';
import {
  EXECUTION_TEST_REPORT_MEDIA_TYPE,
  EXECUTION_TEST_REPORT_TRACE_NAME,
  readExecutionTestReportValue,
  type ExecutableProjectCommand,
  type ExecutableProjectSnapshot,
  type ExecutionArtifact,
  type ExecutionJob,
  type ExecutionJobEvent,
  type ExecutionJobResult,
  type ExecutionProviderDescriptor,
  type ExecutionTestReport,
} from '@prodivix/runtime-core';
import {
  GOLDEN_G2_BROWSER_PREVIEW_URL,
  GOLDEN_G2_REPORT_PATH,
  GOLDEN_G2_VITEST_REPORT,
  createGoldenG2ExecutionRequest,
} from './goldenG2ExecutionFixture';

type Deferred = Readonly<{
  promise: Promise<number>;
  resolve(value: number): void;
}>;

const deferred = (): Deferred => {
  let resolve: (value: number) => void = () => undefined;
  const promise = new Promise<number>((settle) => {
    resolve = settle;
  });
  return Object.freeze({ promise, resolve });
};

const emptyOutput = (): ReadableStream<string> =>
  new ReadableStream({ start: (controller) => controller.close() });

const cloneContents = (contents: string | Uint8Array): string | Uint8Array =>
  typeof contents === 'string' ? contents : new Uint8Array(contents);

const flattenFileTree = (
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
    flattenFileTree(node.directory, files, path);
  });
};

const createGoldenBrowserRuntime = () => {
  const files = new Map<string, string | Uint8Array>();
  const commands: ExecutableProjectCommand[] = [];
  const serverReadyListeners = new Set<(url: string, port: number) => void>();
  let installCount = 0;
  const runtime: BrowserProjectRuntime = {
    mount: async (tree) => flattenFileTree(tree, files),
    mkdir: async () => undefined,
    readFile: async (path) => {
      const contents = files.get(path);
      if (contents === undefined)
        throw new Error(`Golden browser runtime file is missing: ${path}`);
      return cloneContents(contents);
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
      if (command.args?.includes('install')) {
        installCount += 1;
        return { exit: Promise.resolve(0), output: emptyOutput(), kill() {} };
      }
      if (command.args?.includes('test')) {
        files.set(GOLDEN_G2_REPORT_PATH, GOLDEN_G2_VITEST_REPORT);
        return { exit: Promise.resolve(0), output: emptyOutput(), kill() {} };
      }
      const server = deferred();
      queueMicrotask(() => {
        serverReadyListeners.forEach((listener) =>
          listener(GOLDEN_G2_BROWSER_PREVIEW_URL, 5173)
        );
      });
      return {
        exit: server.promise,
        output: emptyOutput(),
        kill: () => server.resolve(0),
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
  return Object.freeze({
    runtime,
    files,
    commands,
    installCount: () => installCount,
  });
};

const waitForArtifact = (job: ExecutionJob): Promise<ExecutionArtifact> =>
  new Promise((resolve, reject) => {
    const unsubscribe = job.subscribe((event) => {
      if (event.kind === 'artifact') {
        unsubscribe();
        resolve(event.artifact);
      }
      if (event.kind === 'state' && event.snapshot.status === 'failed') {
        unsubscribe();
        reject(new Error(event.reason ?? 'Golden Browser execution failed.'));
      }
    });
  });

const reportFromEvents = (
  events: readonly ExecutionJobEvent[]
): ExecutionTestReport => {
  const event = events.find(
    (candidate) =>
      candidate.kind === 'trace' &&
      candidate.trace.name === EXECUTION_TEST_REPORT_TRACE_NAME
  );
  if (event?.kind !== 'trace')
    throw new Error('Golden Browser Test did not publish a report trace.');
  const report = readExecutionTestReportValue(event.trace.detail);
  if (!report) throw new Error('Golden Browser Test report trace is invalid.');
  return report;
};

export type GoldenG2BrowserMatrixResult = Readonly<{
  resolvedDigests: readonly string[];
  mountedFilePaths: readonly string[];
  installCount: number;
  commandCount: number;
  preview: Readonly<{
    provider: ExecutionProviderDescriptor;
    artifact: ExecutionArtifact;
    terminal: ExecutionJobResult;
  }>;
  test: Readonly<{
    provider: ExecutionProviderDescriptor;
    artifact: ExecutionArtifact;
    result: ExecutionJobResult;
    report: ExecutionTestReport;
  }>;
  build: Readonly<{ availability: 'unsupported' }>;
}>;

/** Runs Golden Preview and Test against one shared Browser Runtime Host. */
export const runGoldenG2BrowserMatrix = async (
  snapshot: ExecutableProjectSnapshot
): Promise<GoldenG2BrowserMatrixResult> => {
  const harness = createGoldenBrowserRuntime();
  const resolvedDigests: string[] = [];
  const resolveSnapshot = () => {
    resolvedDigests.push(snapshot.contentDigest);
    return snapshot;
  };
  const runtimeHost = createBrowserProjectRuntimeHost({
    createRuntime: async () => harness.runtime,
  });
  const preview = createBrowserProjectRunner({
    runtimeHost,
    createJobId: () => 'golden-browser-preview',
    createOwnerId: () => 'golden-browser-preview-owner',
    resolveProject: resolveSnapshot,
  });
  const test = createBrowserProjectTestRunner({
    runtimeHost,
    createJobId: () => 'golden-browser-test',
    createOwnerId: () => 'golden-browser-test-owner',
    now: () => 2_000,
    resolveProject: resolveSnapshot,
  });

  try {
    const previewJob = await preview.provider.start(
      createGoldenG2ExecutionRequest(snapshot, 'preview')
    );
    const previewArtifact = await waitForArtifact(previewJob);
    const mountedFilePaths = Object.freeze([...harness.files.keys()].sort());
    await preview.stop('Golden Preview contract captured.');
    const previewTerminal = await previewJob.completion;

    const testJob = await test.provider.start(
      createGoldenG2ExecutionRequest(snapshot, 'test')
    );
    const testEvents: ExecutionJobEvent[] = [];
    testJob.subscribe((event) => testEvents.push(event));
    const testResult = await testJob.completion;
    const testArtifact = testResult.artifacts.find(
      (artifact) => artifact.mediaType === EXECUTION_TEST_REPORT_MEDIA_TYPE
    );
    if (!testArtifact)
      throw new Error('Golden Browser Test did not publish a report artifact.');

    return Object.freeze({
      resolvedDigests: Object.freeze(resolvedDigests),
      mountedFilePaths,
      installCount: harness.installCount(),
      commandCount: harness.commands.length,
      preview: Object.freeze({
        provider: preview.provider.descriptor,
        artifact: previewArtifact,
        terminal: previewTerminal,
      }),
      test: Object.freeze({
        provider: test.provider.descriptor,
        artifact: testArtifact,
        result: testResult,
        report: reportFromEvents(testEvents),
      }),
      build: Object.freeze({ availability: 'unsupported' }),
    });
  } finally {
    await preview.dispose();
    await test.dispose();
    await runtimeHost.dispose();
  }
};
