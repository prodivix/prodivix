import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.PRODIVIX_BACKEND_POSTGRES_TEST_URL?.trim();
if (!databaseUrl) {
  console.error(
    'PRODIVIX_BACKEND_POSTGRES_TEST_URL is required for the G3 V5 PostgreSQL Evidence Gate.'
  );
  process.exit(1);
}

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const backendRoot = path.join(repoRoot, 'apps', 'backend');
const child = spawn(
  'go',
  [
    'test',
    './internal/modules/verification',
    '-run',
    '^TestVerificationEvidencePostgreSQLGate$',
    '-count=1',
    '-v',
  ],
  {
    cwd: backendRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);

let outputTail = '';
let observedRun = false;
let observedPass = false;
const forwardOutput = (stream, destination) => {
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    destination.write(chunk);
    outputTail = `${outputTail}${chunk}`.slice(-4096);
    observedRun ||= /^=== RUN\s+TestVerificationEvidencePostgreSQLGate$/mu.test(
      outputTail
    );
    observedPass ||=
      /^--- PASS: TestVerificationEvidencePostgreSQLGate\b/mu.test(outputTail);
  });
};
forwardOutput(child.stdout, process.stdout);
forwardOutput(child.stderr, process.stderr);

child.once('error', (error) => {
  console.error(
    `Unable to start the G3 V5 PostgreSQL Evidence Gate: ${error.message}`
  );
  process.exitCode = 1;
});
child.once('close', (code, signal) => {
  if (signal) {
    console.error(
      `The G3 V5 PostgreSQL Evidence Gate stopped after signal ${signal}.`
    );
    process.exitCode = 1;
    return;
  }
  if (code !== 0) {
    process.exitCode = code ?? 1;
    return;
  }
  if (!observedRun || !observedPass) {
    console.error(
      'The G3 V5 PostgreSQL Evidence Gate did not execute its required exact test.'
    );
    process.exitCode = 1;
  }
});
