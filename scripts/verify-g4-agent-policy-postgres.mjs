import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.PRODIVIX_BACKEND_POSTGRES_TEST_URL?.trim();
if (!databaseUrl) {
  console.error(
    'PRODIVIX_BACKEND_POSTGRES_TEST_URL is required for the G4 V0 AgentPolicy PostgreSQL Gate.'
  );
  process.exit(1);
}

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const requiredTests = [
  'TestAgentPolicyAtomicCommitPostgreSQLGate',
  'TestAgentPolicyPostgreSQLRoundTripGate',
];
const child = spawn(
  'go',
  [
    'test',
    './internal/modules/workspace',
    './internal/platform/database',
    '-run',
    `^(${requiredTests.join('|')})$`,
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
const observedRuns = new Set();
const observedPasses = new Set();
const forward = (stream, destination) => {
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    destination.write(chunk);
    outputTail = `${outputTail}${chunk}`.slice(-4096);
    for (const testName of requiredTests) {
      if (new RegExp(`^=== RUN\\s+${testName}$`, 'mu').test(outputTail)) {
        observedRuns.add(testName);
      }
      if (new RegExp(`^--- PASS: ${testName}\\b`, 'mu').test(outputTail)) {
        observedPasses.add(testName);
      }
    }
  });
};
forward(child.stdout, process.stdout);
forward(child.stderr, process.stderr);
child.once('error', (error) => {
  console.error(`Unable to start the G4 V0 PostgreSQL Gate: ${error.message}`);
  process.exitCode = 1;
});
child.once('close', (code, signal) => {
  if (signal || code !== 0) {
    process.exitCode = code ?? 1;
    return;
  }
  const missing = requiredTests.filter(
    (testName) =>
      !observedRuns.has(testName) || !observedPasses.has(testName)
  );
  if (missing.length > 0) {
    console.error(
      `The G4 V0 PostgreSQL Gate did not execute and pass: ${missing.join(', ')}.`
    );
    process.exitCode = 1;
  }
});
