import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.PRODIVIX_BACKEND_POSTGRES_TEST_URL?.trim();
if (!databaseUrl) {
  console.error(
    'PRODIVIX_BACKEND_POSTGRES_TEST_URL is required for the G4 V5 PostgreSQL proposal/approval Gate.'
  );
  process.exit(1);
}

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const requiredTest = 'TestAgentProposalApprovalPostgreSQLGate';
const child = spawn(
  'go',
  [
    'test',
    './internal/modules/agent',
    '-run',
    `^${requiredTest}$`,
    '-count=1',
    '-v',
  ],
  {
    cwd: path.join(repoRoot, 'apps', 'backend'),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);

let outputTail = '';
let observedRun = false;
let observedPass = false;
const forward = (stream, destination) => {
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    destination.write(chunk);
    outputTail = `${outputTail}${chunk}`.slice(-4096);
    observedRun ||= new RegExp(`^=== RUN\\s+${requiredTest}$`, 'mu').test(
      outputTail
    );
    observedPass ||= new RegExp(`^--- PASS: ${requiredTest}\\b`, 'mu').test(
      outputTail
    );
  });
};
forward(child.stdout, process.stdout);
forward(child.stderr, process.stderr);
child.once('error', (error) => {
  console.error(
    `Unable to start the G4 V5 PostgreSQL proposal/approval Gate: ${error.message}`
  );
  process.exitCode = 1;
});
child.once('close', (code, signal) => {
  if (signal || code !== 0) {
    process.exitCode = code ?? 1;
    return;
  }
  if (!observedRun || !observedPass) {
    console.error(
      `The G4 V5 PostgreSQL Gate did not execute and pass ${requiredTest}.`
    );
    process.exitCode = 1;
  }
});
