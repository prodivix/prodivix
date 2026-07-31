import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  encodeVerificationPlan,
  serializeVerificationValue,
} from '@prodivix/verification';
import {
  GOLDEN_G3_V4_EXPLANATION,
  GOLDEN_G3_V4_PLAN,
  GOLDEN_G3_V4_PLAN_INPUT,
} from '../src/goldenG3VerificationPlanFixture';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const cliEntrypoint = join(repositoryRoot, 'apps', 'cli', 'dist', 'cli.js');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'prodivix-g3-v4-cli-'));

const writeJson = (name: string, value: unknown): string => {
  const path = join(temporaryDirectory, name);
  writeFileSync(path, `${serializeVerificationValue(value)}\n`, 'utf8');
  return path;
};

try {
  const inputPath = writeJson('planning-input.json', GOLDEN_G3_V4_PLAN_INPUT);
  const planPath = join(temporaryDirectory, 'plan.json');
  execFileSync(
    process.execPath,
    [
      cliEntrypoint,
      'verify',
      'plan',
      '--input',
      inputPath,
      '--output',
      planPath,
    ],
    { cwd: repositoryRoot, stdio: 'pipe' }
  );
  const cliPlan = readFileSync(planPath, 'utf8').trim();
  const canonicalPlan = serializeVerificationValue(
    encodeVerificationPlan(GOLDEN_G3_V4_PLAN)
  );
  if (cliPlan !== canonicalPlan) {
    throw new Error('CLI and canonical planner produced different Plan bytes.');
  }

  const explanationPath = join(temporaryDirectory, 'explanation.json');
  execFileSync(
    process.execPath,
    [
      cliEntrypoint,
      'verify',
      'explain',
      '--plan',
      planPath,
      '--output',
      explanationPath,
    ],
    { cwd: repositoryRoot, stdio: 'pipe' }
  );
  const cliExplanation = readFileSync(explanationPath, 'utf8').trim();
  const canonicalExplanation = serializeVerificationValue(
    GOLDEN_G3_V4_EXPLANATION
  );
  if (cliExplanation !== canonicalExplanation) {
    throw new Error(
      'CLI and shared Web/CI projector produced different explanation bytes.'
    );
  }
  process.stdout.write(
    `G3 V4 CLI parity passed: ${GOLDEN_G3_V4_PLAN.planDigest}\n`
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
