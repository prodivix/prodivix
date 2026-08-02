import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  decodeAgentEvaluationFact,
  validateAgentModelEvaluationManifest,
} from '../packages/ai/src/index.ts';

const evidencePath = process.env.PRODIVIX_G4_MODEL_EVAL_EVIDENCE?.trim();
if (!evidencePath) {
  console.error(
    'PRODIVIX_G4_MODEL_EVAL_EVIDENCE is required; deterministic V8 conformance cannot substitute for real-model evidence.'
  );
  process.exit(1);
}

const absolutePath = resolve(evidencePath);
const bundle = JSON.parse(await readFile(absolutePath, 'utf8'));
if (
  bundle?.format !== 'prodivix.agent-model-evaluation-evidence' ||
  bundle?.version !== 1 ||
  !Array.isArray(bundle.attempts)
) {
  throw new Error('Real-model evidence bundle identity is unsupported.');
}

const decode = (wire, expectedType) => {
  const result = decodeAgentEvaluationFact(wire);
  if (!result.ok || result.value.factType !== expectedType) {
    throw new Error(
      `Real-model evidence ${expectedType} failed strict evaluation decoding.`
    );
  }
  return result.value.value;
};

const plan = decode(bundle.plan, 'evaluation-plan');
const attempts = bundle.attempts.map((entry) =>
  decode(entry, 'evaluation-attempt')
);
const metricReport = decode(bundle.metricReport, 'evaluation-metric-report');
const graderReport = decode(bundle.graderReport, 'evaluation-grader-report');
const humanReviewReport = decode(
  bundle.humanReviewReport,
  'evaluation-human-review-report'
);
const holdoutExecutionReceipt = decode(
  bundle.holdoutExecutionReceipt,
  'evaluation-holdout-receipt'
);
const manifest = decode(bundle.manifest, 'evaluation-manifest');

const issues = validateAgentModelEvaluationManifest({
  manifest,
  plan,
  attempts,
  metricReport,
  graderReport,
  humanReviewReport,
  holdoutExecutionReceipt,
});
if (issues.length > 0) {
  throw new Error(issues.map(({ code, message }) => `${code}: ${message}`).join('; '));
}
if (
  manifest.outcome !== 'satisfied' ||
  attempts.length < 11_640 ||
  attempts.length !== plan.plannedJourneyCount ||
  Date.now() >= Date.parse(manifest.expiresAt)
) {
  throw new Error(
    'Real-model evidence is incomplete, unsatisfied, below the journey floor, or expired.'
  );
}

const repositoryCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], {
  encoding: 'utf8',
}).trim();
if (dirty || plan.repositoryCommit !== repositoryCommit) {
  throw new Error(
    'Real-model evidence must bind the current exact clean repository commit.'
  );
}

console.log(
  `Verified satisfied G4 model-evaluation manifest ${manifest.manifestId} at ${repositoryCommit} with ${attempts.length} attempts; expires ${manifest.expiresAt}.`
);
