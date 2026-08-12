import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.PRODIVIX_BACKEND_POSTGRES_TEST_URL?.trim();
if (!databaseUrl) {
  console.error(
    'PRODIVIX_BACKEND_POSTGRES_TEST_URL is required for the G4 V8 PostgreSQL model-evaluation Gate.'
  );
  process.exit(1);
}

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const requiredTests = [
  'TestAgentModelEvaluationPostgreSQLGate',
  'TestEvaluationFinalizationIntentAndIncompleteTransactionPostgreSQL',
  'TestAgentEvaluationFinalizationAuthorityMigrationPostgreSQLV43Upgrade',
  'TestAgentEvaluationFinalizationAuthorityMigrationPostgreSQLRejectsPopulatedV43',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLV41Upgrade',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLQuarantinesLegacyV41Facts',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLFreshV45',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLRunConfigArtifactBinding',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLRejectsPathOnlyClosureUpgrade',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLCapabilityProbeAdmission',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLCapabilityProbeProviderResource',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLCapabilityProbeProviderResourceCleanup',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLCapabilityEffectInputAuthority',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLOptionalFactAuthorityUnavailableLifecycle',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLOptionalFactAuthority',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLNativeOptionalBootstrapSource',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLNativeProviderStateVault',
  'TestAgentEvaluationAttemptAuthorityMigrationPostgreSQLOwnerStateLifecycle',
];
const requiredTestPattern = `^(${requiredTests.join('|')})$`;
const child = spawn(
  'go',
  [
    'test',
    './internal/modules/agent',
    './internal/platform/database',
    '-run',
    requiredTestPattern,
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
    outputTail = `${outputTail}${chunk}`.slice(-16_384);
    for (const requiredTest of requiredTests) {
      if (new RegExp(`^=== RUN\\s+${requiredTest}$`, 'mu').test(outputTail)) {
        observedRuns.add(requiredTest);
      }
      if (new RegExp(`^--- PASS: ${requiredTest}\\b`, 'mu').test(outputTail)) {
        observedPasses.add(requiredTest);
      }
    }
  });
};
forward(child.stdout, process.stdout);
forward(child.stderr, process.stderr);
child.once('error', (error) => {
  console.error(`Unable to start the G4 V8 PostgreSQL Gate: ${error.message}`);
  process.exitCode = 1;
});
child.once('close', (code, signal) => {
  if (signal || code !== 0) {
    process.exitCode = code ?? 1;
    return;
  }
  const missing = requiredTests.filter(
    (test) => !observedRuns.has(test) || !observedPasses.has(test)
  );
  if (missing.length > 0) {
    console.error(
      `The G4 V8 PostgreSQL Gate did not execute and pass: ${missing.join(', ')}.`
    );
    process.exitCode = 1;
  }
});
