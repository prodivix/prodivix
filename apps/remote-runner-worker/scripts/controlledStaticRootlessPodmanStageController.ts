import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { createRootlessPodmanRunArguments } from '../src/rootlessPodmanSandbox';
import {
  CONTROLLED_STATIC_ROOTLESS_MAXIMUM_OUTPUT_BYTES,
  controlledStaticRootlessDigestBytes,
  type ControlledStaticRootlessEncodedFile,
  type ControlledStaticRootlessRequest,
} from './controlledStaticRootlessRequestProtocol';
import type { ControlledStaticRootlessPackageImportAuthority } from './controlledStaticRootlessStageResult';
import {
  CONTROLLED_STATIC_ROOTLESS_NODE_VERSION,
  controlledStaticRootlessResultAllowlist,
  createControlledStaticRootlessStageCleanupAuthority,
  type ControlledStaticRootlessControllerProcessReceipt,
  type ControlledStaticRootlessProcessOutput,
  type ControlledStaticRootlessStage,
} from './controlledStaticRootlessStageAuthority';

const INSTALL_MARKER = 'PRODIVIX_SANDBOX_INSTALL_COMPLETE_V1';
const CAPTURE_MARKER = 'PRODIVIX_SANDBOX_CAPTURE_READY_V1';
const EXECUTION_PERMISSION_FORMAT = 'prodivix.sandbox-execution-permission.v1';
const CONTINUE_TOKEN = 'PRODIVIX_SANDBOX_CONTINUE_V1';
const CAPTURE_TOKEN = 'PRODIVIX_SANDBOX_CAPTURE_V1';
const CONTAINER_TIMEOUT_MS = 60_000;
const MAXIMUM_CONTROLLER_OUTPUT_BYTES = 1024 * 1024;

type ControllerProcessResult = Readonly<{
  receipt: ControlledStaticRootlessControllerProcessReceipt;
  stdout: Buffer;
  stderr: Buffer;
}>;

export type ControlledStaticRootlessPodmanStageInput = Readonly<{
  request: ControlledStaticRootlessRequest;
  stage: ControlledStaticRootlessStage;
  ordinal: number;
  baseFiles: readonly ControlledStaticRootlessEncodedFile[];
  packageImport?: ControlledStaticRootlessPackageImportAuthority;
  imageReference: string;
  imageDigest: string;
  uid: number;
  gid: number;
  environment: NodeJS.ProcessEnv;
  environmentDigest: string;
}>;

export type ControlledStaticRootlessPodmanStageExecution = Readonly<{
  sandboxResult: Buffer;
  providerFileSetDigest: string;
  providerFileCount: number;
  providerProcess: ControlledStaticRootlessControllerProcessReceipt;
  cleanup: ReturnType<
    typeof createControlledStaticRootlessStageCleanupAuthority
  >;
}>;

const processOutput = (
  contents: Buffer
): ControlledStaticRootlessProcessOutput =>
  Object.freeze({
    digest: controlledStaticRootlessDigestBytes(contents),
    byteLength: contents.byteLength,
    capturedByteLength: contents.byteLength,
    truncated: false,
  });

const sandboxFailureFacts = (
  source: Buffer
): Readonly<{ exitCode: number | null; innerPhase: string | null }> => {
  try {
    const value = JSON.parse(source.toString('utf8')) as {
      exitCode?: unknown;
      stderr?: unknown;
    };
    const exitCode =
      Number.isSafeInteger(value.exitCode) && (value.exitCode as number) >= 0
        ? (value.exitCode as number)
        : null;
    if (
      typeof value.stderr !== 'string' ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
        value.stderr
      )
    ) {
      return Object.freeze({ exitCode, innerPhase: null });
    }
    const stderr = Buffer.from(value.stderr, 'base64').toString('utf8');
    const match =
      /(?:^|\n)PRODIVIX_CONTROLLED_ROOTLESS_STAGE_FAILURE:([a-z-]+)(?:\n|$)/u.exec(
        stderr
      );
    return Object.freeze({
      exitCode,
      innerPhase: match?.[1] ?? null,
    });
  } catch {
    return Object.freeze({ exitCode: null, innerPhase: null });
  }
};

const appendFile = (
  files: ControlledStaticRootlessEncodedFile[],
  file: ControlledStaticRootlessEncodedFile
): void => {
  if (files.some(({ path }) => path === file.path)) {
    throw new TypeError('Rootless sandbox provider file path collided.');
  }
  files.push(file);
};

const encodedFileSetDigest = (
  files: readonly ControlledStaticRootlessEncodedFile[]
): string =>
  controlledStaticRootlessDigestBytes(
    canonicalJsonText(
      [...files]
        .map(({ path, size, digest }) => ({ path, size, digest }))
        .sort((left, right) => compareUnicodeCodePoints(left.path, right.path))
    )
  );

const stagePlanFile = (
  request: ControlledStaticRootlessRequest,
  stage: ControlledStaticRootlessStage,
  ordinal: number,
  packageImport: ControlledStaticRootlessPackageImportAuthority | undefined
): ControlledStaticRootlessEncodedFile => {
  const source = canonicalJsonText({
    format: 'prodivix.controlled-static-rootless-stage-plan.v1',
    stage,
    ordinal,
    requestDigest: request.requestDigest,
    snapshotDigest: request.snapshotDigest,
    presetId: (request.target as { presetId?: unknown }).presetId,
    pnpmVersion: request.toolchain.pnpmVersion,
    nodeVersion: CONTROLLED_STATIC_ROOTLESS_NODE_VERSION,
    typescriptVersion: request.toolchain.typescriptVersion,
    vitestVersion: request.toolchain.vitestVersion,
    viteVersion: request.toolchain.viteVersion,
    rollupVersion: request.toolchain.rollupVersion,
    rollupImplementation: request.toolchain.rollupImplementation,
    rollupAliasSpec: request.toolchain.rollupAliasSpec,
    esbuildVersion: request.toolchain.esbuildVersion,
    esbuildImplementation: request.toolchain.esbuildImplementation,
    esbuildAliasSpec: request.toolchain.esbuildAliasSpec,
    manifestDigest: request.toolchain.manifestDigest,
    lockDigest: request.toolchain.lockDigest,
    toolchainFileSetDigest: request.toolchain.toolchainFileSetDigest,
    isolationProbeDigest: request.toolchain.isolationProbeDigest,
    testReportFilePath: request.testReportFilePath,
    coverageSummaryFilePath: request.coverageSummaryFilePath,
    buildOutputDirectoryPath: request.buildOutputDirectoryPath,
    packageImport: packageImport
      ? {
          path: packageImport.archivePath,
          digest: packageImport.archiveDigest,
          byteLength: packageImport.archiveByteLength,
          contentDigest: packageImport.contentDigest,
          manifestDigest: packageImport.manifestDigest,
          fileSetDigest: packageImport.fileSetDigest,
          entryCount: packageImport.entryCount,
          totalFileBytes: packageImport.totalFileBytes,
          maximumDepth: packageImport.maximumDepth,
        }
      : null,
    resultAllowlist: controlledStaticRootlessResultAllowlist(stage),
  });
  const contents = new TextEncoder().encode(source);
  return Object.freeze({
    path: '.prodivix/controlled-static-rootless-stage-plan.json',
    size: contents.byteLength,
    digest: controlledStaticRootlessDigestBytes(contents),
    encoding: 'base64',
    contents: Buffer.from(contents).toString('base64'),
  });
};

const packageImportFile = (
  authority: ControlledStaticRootlessPackageImportAuthority
): ControlledStaticRootlessEncodedFile =>
  Object.freeze({
    path: authority.archivePath,
    size: authority.bytes.byteLength,
    digest: controlledStaticRootlessDigestBytes(authority.bytes),
    encoding: 'base64',
    contents: authority.bytes.toString('base64'),
  });

const assembleStageFiles = (
  input: ControlledStaticRootlessPodmanStageInput
): readonly ControlledStaticRootlessEncodedFile[] => {
  const files = [...input.baseFiles];
  appendFile(
    files,
    stagePlanFile(
      input.request,
      input.stage,
      input.ordinal,
      input.packageImport
    )
  );
  if (input.packageImport) {
    appendFile(files, packageImportFile(input.packageImport));
  }
  return Object.freeze(files);
};

const runPodmanControllerCommand = async (
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  environmentDigest: string
): Promise<ControllerProcessResult> => {
  const startedAtEpochMs = Date.now();
  const child = spawn('podman', [...args], {
    env: environment,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let outputBytes = 0;
  const append = (chunks: Buffer[], chunk: Buffer): void => {
    outputBytes += chunk.byteLength;
    if (outputBytes > MAXIMUM_CONTROLLER_OUTPUT_BYTES) {
      child.kill('SIGKILL');
      return;
    }
    chunks.push(chunk);
  };
  child.stdout.on('data', (chunk: Buffer) => append(stdoutChunks, chunk));
  child.stderr.on('data', (chunk: Buffer) => append(stderrChunks, chunk));
  const result = await new Promise<{
    exitCode: number | null;
    signal: NodeJS.Signals | null;
  }>((resolveProcess, rejectProcess) => {
    child.once('error', rejectProcess);
    child.once('close', (exitCode, signal) =>
      resolveProcess({ exitCode, signal })
    );
  });
  const completedAtEpochMs = Date.now();
  if (
    outputBytes > MAXIMUM_CONTROLLER_OUTPUT_BYTES ||
    result.exitCode === null ||
    result.signal !== null
  ) {
    throw new Error('Rootless Podman controller command failed closed.');
  }
  const stdout = Buffer.concat(stdoutChunks);
  const stderr = Buffer.concat(stderrChunks);
  return Object.freeze({
    receipt: Object.freeze({
      application: 'podman',
      args: Object.freeze([...args]),
      cwd: 'repository:/',
      environmentDigest,
      startedAtEpochMs,
      completedAtEpochMs,
      exitCode: result.exitCode,
      signal: null,
      timedOut: false,
      stdout: processOutput(stdout),
      stderr: processOutput(stderr),
    }),
    stdout,
    stderr,
  });
};

const terminateContainer = async (
  name: string,
  environment: NodeJS.ProcessEnv,
  child: ChildProcess
): Promise<void> => {
  const cleanup = spawn('podman', ['rm', '--force', '--ignore', name], {
    env: environment,
    shell: false,
    windowsHide: true,
    stdio: 'ignore',
  });
  await new Promise<void>((resolveCleanup) => {
    cleanup.once('error', () => resolveCleanup());
    cleanup.once('close', () => resolveCleanup());
  });
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
  }
};

export const runControlledStaticRootlessPodmanStage = async (
  input: ControlledStaticRootlessPodmanStageInput
): Promise<ControlledStaticRootlessPodmanStageExecution> => {
  const files = assembleStageFiles(input);
  const providerFileSetDigest = encodedFileSetDigest(files);
  const controlNonce = randomBytes(32).toString('base64url');
  const installCompleteMarker = `${INSTALL_MARKER}:${controlNonce}`;
  const captureReadyMarker = `${CAPTURE_MARKER}:${controlNonce}`;
  const wirePayload = canonicalJsonText({
    profile: 'build',
    controlNonce,
    snapshotDigest: input.request.snapshotDigest,
    workspace: input.request.workspace,
    target: input.request.target,
    buildPlan: {
      outputDirectoryPath: '.prodivix/controlled-output',
    },
    testPlan: {
      reportFilePath: input.request.testReportFilePath,
    },
    maximumOutputBytes: 1024,
    maximumArtifactBytes: 320 * 1024 * 1024,
    files: files.map(({ path, contents }) => ({
      path,
      contents,
      capture: false,
    })),
    ignoredPaths: [],
    ignoredDirectories: [
      '.git',
      '.cache',
      '.vite',
      'coverage',
      'node_modules',
      input.request.buildOutputDirectoryPath,
      '.prodivix',
    ],
    publicEnvironment: [],
    installCommand: {
      command: 'node',
      args: ['.prodivix/controlled-static-rootless-stage-worker.mjs'],
    },
    command: {
      command: 'node',
      args: ['--eval', ''],
    },
  });
  const executionPermission = canonicalJsonText({
    format: EXECUTION_PERMISSION_FORMAT,
    token: CONTINUE_TOKEN,
    controlNonce,
  });
  const name = `prodivix-g3-v6-static-${input.stage}-${randomUUID().slice(0, 8)}`;
  const executionId = `g3-v6-${input.request.snapshotDigest.slice(7, 23)}-${input.stage}-${input.ordinal}`;
  const args = createRootlessPodmanRunArguments({
    name,
    imageReference: input.imageReference,
    uid: input.uid,
    gid: input.gid,
    cpuCores: 2,
    memoryMb: 2_048,
    diskMb: 1_024,
    pids: 256,
    openFiles: 4_096,
    temporaryDirectoryMb: 1_024,
    executionId,
  });
  const startedAtEpochMs = Date.now();
  const child = spawn('podman', [...args], {
    env: input.environment,
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let controlBuffer = '';
  let executionGranted = false;
  let captureGranted = false;
  let timedOut = false;
  const stop = (): void => {
    void terminateContainer(name, input.environment, child);
  };
  child.stdout.on('data', (chunk: Buffer) => {
    stdoutBytes += chunk.byteLength;
    if (stdoutBytes > CONTROLLED_STATIC_ROOTLESS_MAXIMUM_OUTPUT_BYTES) {
      timedOut = true;
      stop();
      return;
    }
    stdoutChunks.push(chunk);
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderrBytes += chunk.byteLength;
    if (stderrBytes > MAXIMUM_CONTROLLER_OUTPUT_BYTES) {
      timedOut = true;
      stop();
      return;
    }
    stderrChunks.push(chunk);
    controlBuffer = `${controlBuffer}${chunk.toString('utf8')}`.slice(
      -Math.max(installCompleteMarker.length, captureReadyMarker.length) * 4
    );
    if (!executionGranted && controlBuffer.includes(installCompleteMarker)) {
      executionGranted = true;
      child.stdin.write(`${executionPermission}\n`);
    }
    if (!captureGranted && controlBuffer.includes(captureReadyMarker)) {
      captureGranted = true;
      child.stdin.end(`${CAPTURE_TOKEN}:${controlNonce}\n`);
    }
  });
  child.stdin.on('error', () => undefined);
  child.stdin.write(`${wirePayload}\n`);
  const timeout = setTimeout(() => {
    timedOut = true;
    stop();
  }, CONTAINER_TIMEOUT_MS);
  const processResult = await new Promise<{
    exitCode: number | null;
    signal: NodeJS.Signals | null;
  }>((resolveProcess, rejectProcess) => {
    child.once('error', rejectProcess);
    child.once('close', (exitCode, signal) =>
      resolveProcess({ exitCode, signal })
    );
  }).finally(() => clearTimeout(timeout));
  const completedAtEpochMs = Date.now();
  const sandboxResult = Buffer.concat(stdoutChunks);
  const stderr = Buffer.concat(stderrChunks);
  const providerProcess =
    processResult.exitCode === null || processResult.signal !== null
      ? undefined
      : Object.freeze({
          application: 'podman' as const,
          args,
          cwd: 'repository:/' as const,
          environmentDigest: input.environmentDigest,
          startedAtEpochMs,
          completedAtEpochMs,
          exitCode: processResult.exitCode,
          signal: null,
          timedOut: false as const,
          stdout: processOutput(sandboxResult),
          stderr: processOutput(stderr),
        });
  const remove = await runPodmanControllerCommand(
    ['rm', '--force', '--ignore', name],
    input.environment,
    input.environmentDigest
  );
  const absence = await runPodmanControllerCommand(
    ['container', 'exists', name],
    input.environment,
    input.environmentDigest
  );
  const residualQuery = await runPodmanControllerCommand(
    [
      'ps',
      '--all',
      '--filter',
      `label=prodivix.remote-execution=${executionId}`,
      '--format',
      '{{.ID}}',
    ],
    input.environment,
    input.environmentDigest
  );
  const cleanup = createControlledStaticRootlessStageCleanupAuthority({
    stage: input.stage,
    ordinal: input.ordinal,
    containerName: name,
    executionId,
    imageDigest: input.imageDigest,
    remove: remove.receipt,
    absence: absence.receipt,
    residualQuery: residualQuery.receipt,
  });
  if (
    timedOut ||
    processResult.exitCode !== 0 ||
    processResult.signal !== null ||
    !executionGranted ||
    !captureGranted ||
    !providerProcess
  ) {
    const innerFailure = sandboxFailureFacts(sandboxResult);
    throw new Error(
      `Controlled rootless stage failed closed: ${canonicalJsonText({
        stage: input.stage,
        timedOut,
        processExitCode: processResult.exitCode,
        processSignal: processResult.signal,
        executionGranted,
        captureGranted,
        providerProcessCaptured: providerProcess !== undefined,
        sandboxExitCode: innerFailure.exitCode,
        innerPhase: innerFailure.innerPhase,
      })}`
    );
  }
  return Object.freeze({
    sandboxResult,
    providerFileSetDigest,
    providerFileCount: files.length,
    providerProcess,
    cleanup,
  });
};
