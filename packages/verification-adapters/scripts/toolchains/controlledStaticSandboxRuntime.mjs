import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const SHA256_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const MAXIMUM_CAPTURE_BYTES = 8 * 1024 * 1024;
const MAXIMUM_ARGUMENTS = 256;

export const sha256 = (contents) =>
  `sha256-${createHash('sha256').update(contents).digest('hex')}`;

const exactRecord = (value, required, optional = []) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Controlled sandbox record is invalid.');
  }
  const keys = Object.keys(value);
  if (
    required.some((key) => !keys.includes(key)) ||
    keys.some((key) => !required.includes(key) && !optional.includes(key))
  ) {
    throw new TypeError('Controlled sandbox record fields drifted.');
  }
  return value;
};

const relativePath = (value) => {
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.trim() ||
    value !== value.normalize('NFC') ||
    value.includes('\\') ||
    value.startsWith('/') ||
    value.split('/').some(
      (segment) =>
        !segment || segment === '.' || segment === '..' || segment.includes(':')
    )
  ) {
    throw new TypeError('Controlled sandbox path is invalid.');
  }
  return value;
};

const exactString = (value) => {
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.trim() ||
    // eslint-disable-next-line no-control-regex -- command controls are forbidden
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new TypeError('Controlled sandbox string is invalid.');
  }
  return value;
};

export const readControlledSandboxPlan = async () => {
  const value = JSON.parse(
    await readFile('.prodivix/controlled-static-sandbox-plan.json', 'utf8')
  );
  const plan = exactRecord(value, [
    'format',
    'requestDigest',
    'snapshotDigest',
    'presetId',
    'pnpmVersion',
    'nodeVersion',
    'typescriptVersion',
    'vitestVersion',
    'viteVersion',
    'manifestDigest',
    'lockDigest',
    'toolchainFileSetDigest',
    'testReportFilePath',
    'coverageSummaryFilePath',
    'buildOutputDirectoryPath',
    'isolationProbeDigest',
  ]);
  if (
    plan.format !== 'prodivix.controlled-static-sandbox-plan.v1' ||
    ![
      plan.requestDigest,
      plan.snapshotDigest,
      plan.manifestDigest,
      plan.lockDigest,
      plan.toolchainFileSetDigest,
      plan.isolationProbeDigest,
    ].every((digest) => typeof digest === 'string' && SHA256_PATTERN.test(digest)) ||
    (plan.presetId !== 'react-vite' && plan.presetId !== 'vue-vite') ||
    ![
      plan.pnpmVersion,
      plan.nodeVersion,
      plan.typescriptVersion,
      plan.vitestVersion,
      plan.viteVersion,
    ].every(
      (version) =>
        typeof version === 'string' &&
        /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(version)
    )
  ) {
    throw new TypeError('Controlled sandbox plan identity drifted.');
  }
  if (process.versions.node !== plan.nodeVersion) {
    throw new TypeError(
      'Controlled sandbox executed under an unexpected Node binary.'
    );
  }
  return Object.freeze({
    ...plan,
    testReportFilePath: relativePath(plan.testReportFilePath),
    coverageSummaryFilePath: relativePath(plan.coverageSummaryFilePath),
    buildOutputDirectoryPath: relativePath(plan.buildOutputDirectoryPath),
  });
};

const assertEnvironment = (allowedKeys) => {
  const keys = Object.keys(process.env).sort();
  if (
    keys.some((key) => !allowedKeys.includes(key)) ||
    keys.some((key) =>
      /(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE_KEY|ACCESS_KEY|SESSION)/iu.test(
        key
      )
    )
  ) {
    throw new TypeError('Controlled sandbox inherited forbidden environment.');
  }
  const values = Object.fromEntries(
    keys.map((key) => [key, process.env[key] ?? ''])
  );
  return Object.freeze({
    keys: Object.freeze(keys),
    digest: sha256(Buffer.from(JSON.stringify(values), 'utf8')),
  });
};

export const controlledInstallEnvironment = () =>
  assertEnvironment([
    'HOME',
    'PATH',
    'npm_config_cache',
    'npm_config_store_dir',
    'YARN_CACHE_FOLDER',
    'BUN_INSTALL_CACHE_DIR',
  ]);

export const controlledExecutionEnvironment = () =>
  assertEnvironment(['HOME', 'PATH']);

const commandArguments = (value) => {
  if (
    !Array.isArray(value) ||
    value.length > MAXIMUM_ARGUMENTS ||
    value.some(
      (argument) =>
        typeof argument !== 'string' ||
        argument.length > 16_384 ||
        // eslint-disable-next-line no-control-regex -- command controls are forbidden
        /[\u0000-\u001f\u007f]/u.test(argument)
    )
  ) {
    throw new TypeError('Controlled sandbox command arguments are invalid.');
  }
  return Object.freeze(value.map((argument) => exactString(argument)));
};

const outputCollector = () => {
  const hash = createHash('sha256');
  const captured = [];
  let byteLength = 0;
  let capturedByteLength = 0;
  let truncated = false;
  return Object.freeze({
    append(chunk) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      hash.update(bytes);
      byteLength += bytes.byteLength;
      const remaining = Math.max(
        0,
        MAXIMUM_CAPTURE_BYTES - capturedByteLength
      );
      const accepted = bytes.subarray(0, remaining);
      if (accepted.byteLength) {
        captured.push(accepted);
        capturedByteLength += accepted.byteLength;
      }
      if (accepted.byteLength !== bytes.byteLength) truncated = true;
    },
    finish() {
      return Object.freeze({
        digest: `sha256-${hash.digest('hex')}`,
        byteLength,
        capturedByteLength,
        truncated,
        captured: Buffer.concat(captured),
      });
    },
  });
};

export const runControlledSandboxStage = async ({
  stage,
  application,
  args,
  environmentDigest,
  tool,
  timeoutMs,
}) => {
  exactString(stage);
  exactString(application);
  const argv = commandArguments(args);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new TypeError('Controlled sandbox command timeout is invalid.');
  }
  const stdout = outputCollector();
  const stderr = outputCollector();
  const startedAtEpochMs = Date.now();
  const result = await new Promise((resolveRun, rejectRun) => {
    const child = spawn(application, argv, {
      cwd: '/workspace',
      env: process.env,
      detached: true,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let timedOut = false;
    child.stdout.on('data', (chunk) => stdout.append(chunk));
    child.stderr.on('data', (chunk) => stderr.append(chunk));
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
    }, timeoutMs);
    child.once('error', rejectRun);
    child.once('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolveRun({ exitCode, signal, timedOut });
    });
  });
  const completedAtEpochMs = Date.now();
  const stdoutResult = stdout.finish();
  const stderrResult = stderr.finish();
  const receipt = Object.freeze({
    stage,
    application,
    args: argv,
    cwd: 'workspace:/',
    executionBoundary: 'sandbox',
    environmentDigest,
    tool: Object.freeze({ ...tool }),
    startedAtEpochMs,
    completedAtEpochMs,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    stdout: Object.freeze({
      digest: stdoutResult.digest,
      byteLength: stdoutResult.byteLength,
      capturedByteLength: stdoutResult.capturedByteLength,
      truncated: stdoutResult.truncated,
    }),
    stderr: Object.freeze({
      digest: stderrResult.digest,
      byteLength: stderrResult.byteLength,
      capturedByteLength: stderrResult.capturedByteLength,
      truncated: stderrResult.truncated,
    }),
  });
  return Object.freeze({
    receipt,
    stdout: stdoutResult.captured,
    stderr: stderrResult.captured,
  });
};

export const assertControlledStageSucceeded = (stageResult) => {
  if (
    stageResult.receipt.exitCode !== 0 ||
    stageResult.receipt.signal !== null ||
    stageResult.receipt.timedOut ||
    stageResult.receipt.stdout.truncated ||
    stageResult.receipt.stderr.truncated
  ) {
    throw new Error('Controlled sandbox command did not complete exactly.');
  }
};

export const writeControlledJson = (path, value) =>
  writeFile(path, `${JSON.stringify(value)}\n`, {
    encoding: 'utf8',
    flag: 'w',
    mode: 0o600,
  });
