import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';

const allowedCommands = new Set([
  'npm',
  'pnpm',
  'yarn',
  'bun',
  'corepack',
  'node',
]);
const resultProtocol = 'prodivix.sandbox-result.v1';
const buildBundleFormat = 'prodivix.execution-build-bundle.v1';
const previewBundleFormat = 'prodivix.execution-preview-bundle.v1';
const vitestReportMediaType = 'application/vnd.vitest.report+json';
const maximumResultFiles = 20_000;
const installCompleteMarker = 'PRODIVIX_SANDBOX_INSTALL_COMPLETE_V1';
const continueExecutionToken = 'PRODIVIX_SANDBOX_CONTINUE_V1';
const controlLines = createInterface({ input: process.stdin, terminal: false });
const controlIterator = controlLines[Symbol.asyncIterator]();

const readPayload = async () => {
  const line = await controlIterator.next();
  if (line.done || Buffer.byteLength(line.value, 'utf8') > 384 * 1024 * 1024)
    throw new TypeError('Sandbox payload is missing or too large.');
  const value = JSON.parse(line.value);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Sandbox payload must be an object.');
  return value;
};

const awaitExecutionPermission = async () => {
  process.stderr.write(`${installCompleteMarker}\n`);
  const line = await controlIterator.next();
  if (line.done || line.value !== continueExecutionToken)
    throw new TypeError('Sandbox execution permission was not granted.');
  controlLines.close();
};

const childPath = (path) => {
  if (typeof path !== 'string' || !path || path.includes('\\'))
    throw new TypeError('Sandbox file path is invalid.');
  const target = resolve('/workspace', ...path.split('/'));
  const child = relative('/workspace', target);
  if (
    !child ||
    child === '..' ||
    child.startsWith(`..${sep}`) ||
    isAbsolute(child)
  )
    throw new TypeError('Sandbox file path escaped the workspace.');
  return target;
};

const command = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Sandbox command is invalid.');
  if (!allowedCommands.has(value.command))
    throw new TypeError('Sandbox command is not allowlisted.');
  if (
    !Array.isArray(value.args) ||
    value.args.length > 256 ||
    value.args.some(
      (argument) => typeof argument !== 'string' || argument.length > 16_384
    )
  )
    throw new TypeError('Sandbox command arguments are invalid.');
  return { command: value.command, args: value.args };
};

const positiveInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError(`${label} must be a positive integer.`);
  return value;
};

const createOutputCollector = (maximumBytes) => {
  const output = {
    stdout: [],
    stderr: [],
    usedBytes: 0,
    truncated: false,
  };
  const append = (stream, chunk) => {
    const remaining = Math.max(0, maximumBytes - output.usedBytes);
    const accepted = chunk.subarray(0, remaining);
    if (accepted.byteLength) output[stream].push(accepted);
    output.usedBytes += accepted.byteLength;
    if (accepted.byteLength < chunk.byteLength) output.truncated = true;
  };
  return { output, append };
};

const run = async (value, environment, append) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(value.command, value.args, {
      cwd: '/workspace',
      env: environment,
      shell: false,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => append('stdout', chunk));
    child.stderr.on('data', (chunk) => append('stderr', chunk));
    child.once('error', rejectRun);
    child.once('exit', () => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // The isolated process group already exited.
      }
    });
    child.once('close', (code, signal) => {
      if (signal) resolveRun(128);
      else resolveRun(code ?? 1);
    });
  });

const sha256Digest = (contents) =>
  `sha256-${createHash('sha256').update(contents).digest('hex')}`;

const collectBuildFiles = async (root, maximumBytes) => {
  const rootStats = await lstat(root);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink())
    throw new TypeError('Build output must be a real directory.');
  const files = [];
  let totalBytes = 0;
  const visit = async (directory, prefix) => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = resolve(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new TypeError('Build output cannot contain symbolic links.');
      if (entry.isDirectory()) {
        await visit(absolutePath, path);
        continue;
      }
      if (!entry.isFile())
        throw new TypeError('Build output contains an unsupported file type.');
      if (files.length >= maximumResultFiles)
        throw new TypeError('Build output contains too many files.');
      const contents = await readFile(absolutePath);
      totalBytes += contents.byteLength;
      if (totalBytes > maximumBytes)
        throw new TypeError('Build output exceeds the artifact budget.');
      files.push({
        path,
        size: contents.byteLength,
        digest: sha256Digest(contents),
        encoding: 'base64',
        contents: contents.toString('base64'),
      });
    }
  };
  await visit(root, '');
  if (!files.length) throw new TypeError('Build output directory is empty.');
  return { files, totalBytes };
};

const createBuildArtifact = async (payload, maximumArtifactBytes) => {
  const outputDirectoryPath = payload.buildPlan?.outputDirectoryPath;
  const root = childPath(outputDirectoryPath);
  const { files, totalBytes } = await collectBuildFiles(
    root,
    maximumArtifactBytes
  );
  const bundle = Buffer.from(
    JSON.stringify({
      format: buildBundleFormat,
      snapshotDigest: payload.snapshotDigest,
      target: payload.target,
      files,
    }),
    'utf8'
  );
  if (bundle.byteLength > maximumArtifactBytes)
    throw new TypeError('Serialized build bundle exceeds the artifact budget.');
  return {
    artifactId: `build-bundle:${payload.snapshotDigest}`,
    kind: 'bundle',
    label: 'Remote build bundle',
    mediaType: 'application/vnd.prodivix.execution-build-bundle+json',
    metadata: {
      format: buildBundleFormat,
      snapshotDigest: payload.snapshotDigest,
      presetId: payload.target.presetId,
      fileCount: String(files.length),
      unpackedBytes: String(totalBytes),
    },
    contents: bundle.toString('base64'),
  };
};

const createPreviewArtifact = async (payload, maximumArtifactBytes) => {
  if (payload.previewPlan?.mode !== 'static-bundle')
    throw new TypeError('Remote Preview plan is unsupported.');
  const root = childPath(payload.previewPlan.outputDirectoryPath);
  const { files, totalBytes } = await collectBuildFiles(
    root,
    maximumArtifactBytes
  );
  if (!files.some((file) => file.path === payload.previewPlan.entryFilePath))
    throw new TypeError('Remote Preview entrypoint is missing.');
  const bundle = Buffer.from(
    JSON.stringify({
      format: previewBundleFormat,
      entryFilePath: payload.previewPlan.entryFilePath,
      bundle: {
        format: buildBundleFormat,
        snapshotDigest: payload.snapshotDigest,
        target: payload.target,
        files,
      },
    }),
    'utf8'
  );
  if (bundle.byteLength > maximumArtifactBytes)
    throw new TypeError(
      'Serialized preview bundle exceeds the artifact budget.'
    );
  return {
    artifactId: `preview-bundle:${payload.snapshotDigest}`,
    kind: 'bundle',
    label: 'Remote static preview bundle',
    mediaType: 'application/vnd.prodivix.execution-preview-bundle+json',
    metadata: {
      format: previewBundleFormat,
      snapshotDigest: payload.snapshotDigest,
      presetId: payload.target.presetId,
      readiness: 'ready',
      health: 'healthy',
      entryFilePath: payload.previewPlan.entryFilePath,
      fileCount: String(files.length),
      unpackedBytes: String(totalBytes),
    },
    contents: bundle.toString('base64'),
  };
};

const createTestArtifact = async (payload, maximumArtifactBytes) => {
  const reportPath = childPath(payload.testPlan?.reportFilePath);
  const reportStats = await lstat(reportPath);
  if (!reportStats.isFile() || reportStats.isSymbolicLink())
    throw new TypeError('Test report must be a real file.');
  const contents = await readFile(reportPath);
  if (!contents.byteLength || contents.byteLength > maximumArtifactBytes)
    throw new TypeError('Test report exceeds the artifact budget.');
  return {
    artifactId: `vitest-report:${payload.snapshotDigest}`,
    kind: 'report',
    label: 'Vitest private report',
    mediaType: vitestReportMediaType,
    metadata: { adapter: 'vitest' },
    contents: contents.toString('base64'),
  };
};

const emitResult = (exitCode, output, artifacts = []) => {
  process.stdout.write(
    JSON.stringify({
      protocol: resultProtocol,
      exitCode,
      stdout: Buffer.concat(output.stdout).toString('base64'),
      stderr: Buffer.concat(output.stderr).toString('base64'),
      outputTruncated: output.truncated,
      artifacts,
    })
  );
};

const fallbackOutput = {
  stdout: [],
  stderr: [],
  usedBytes: 0,
  truncated: false,
};

try {
  const payload = await readPayload();
  const maximumOutputBytes = positiveInteger(
    payload.maximumOutputBytes,
    'Maximum output bytes'
  );
  const maximumArtifactBytes = positiveInteger(
    payload.maximumArtifactBytes,
    'Maximum artifact bytes'
  );
  const { output, append } = createOutputCollector(maximumOutputBytes);
  if (!Array.isArray(payload.files) || payload.files.length > 20_000)
    throw new TypeError('Sandbox files are invalid.');
  for (const file of payload.files) {
    if (!file || typeof file !== 'object' || typeof file.contents !== 'string')
      throw new TypeError('Sandbox file is invalid.');
    const target = childPath(file.path);
    const contents = Buffer.from(file.contents, 'base64');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, { flag: 'wx', mode: 0o600 });
  }
  const environment = { PATH: process.env.PATH, HOME: '/tmp' };
  if (!Array.isArray(payload.publicEnvironment))
    throw new TypeError('Sandbox public environment is invalid.');
  for (const entry of payload.publicEnvironment) {
    if (
      !entry ||
      typeof entry.name !== 'string' ||
      typeof entry.value !== 'string' ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(entry.name)
    )
      throw new TypeError('Sandbox public environment entry is invalid.');
    environment[entry.name] = entry.value;
  }
  const installExitCode = await run(
    command(payload.installCommand),
    environment,
    append
  );
  if (installExitCode !== 0) {
    controlLines.close();
    emitResult(installExitCode, output);
  } else {
    await awaitExecutionPermission();
    const exitCode = await run(command(payload.command), environment, append);
    const artifacts =
      payload.profile === 'preview' && exitCode === 0
        ? [await createPreviewArtifact(payload, maximumArtifactBytes)]
        : payload.profile === 'build' && exitCode === 0
          ? [await createBuildArtifact(payload, maximumArtifactBytes)]
          : payload.profile === 'test'
            ? [await createTestArtifact(payload, maximumArtifactBytes)]
            : [];
    emitResult(exitCode, output, artifacts);
  }
} catch {
  controlLines.close();
  emitResult(125, fallbackOutput);
}
