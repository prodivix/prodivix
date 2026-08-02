import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  decodeAgentEvaluationFact,
  decodeAgentG4ClosureManifest,
  validateAgentModelEvaluationManifest,
} from '../packages/ai/src/index.ts';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '../packages/shared/src/canonical/index.ts';

const requiredPath = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for durable G4 Closure.`);
  return resolve(value);
};

const closureWire = JSON.parse(
  await readFile(requiredPath('PRODIVIX_G4_GOLDEN_EVIDENCE'), 'utf8')
);
const closureResult = decodeAgentG4ClosureManifest(closureWire);
if (!closureResult.ok) {
  throw new Error('G4 Golden evidence failed strict Closure decoding.');
}
const closure = closureResult.value;

const evaluationBundle = JSON.parse(
  await readFile(requiredPath('PRODIVIX_G4_MODEL_EVAL_EVIDENCE'), 'utf8')
);
if (
  evaluationBundle?.format !== 'prodivix.agent-model-evaluation-evidence' ||
  evaluationBundle?.version !== 1 ||
  !Array.isArray(evaluationBundle.attempts)
) {
  throw new Error('G4 model-evaluation evidence identity is unsupported.');
}
const decodeEvaluation = (wire, expectedType) => {
  const result = decodeAgentEvaluationFact(wire);
  if (!result.ok || result.value.factType !== expectedType) {
    throw new Error(`G4 ${expectedType} evidence failed strict decoding.`);
  }
  return result.value.value;
};
const plan = decodeEvaluation(evaluationBundle.plan, 'evaluation-plan');
const attempts = evaluationBundle.attempts.map((wire) =>
  decodeEvaluation(wire, 'evaluation-attempt')
);
const metricReport = decodeEvaluation(
  evaluationBundle.metricReport,
  'evaluation-metric-report'
);
const graderReport = decodeEvaluation(
  evaluationBundle.graderReport,
  'evaluation-grader-report'
);
const humanReviewReport = decodeEvaluation(
  evaluationBundle.humanReviewReport,
  'evaluation-human-review-report'
);
const holdoutExecutionReceipt = decodeEvaluation(
  evaluationBundle.holdoutExecutionReceipt,
  'evaluation-holdout-receipt'
);
const evaluationManifest = decodeEvaluation(
  evaluationBundle.manifest,
  'evaluation-manifest'
);
const evaluationIssues = validateAgentModelEvaluationManifest({
  manifest: evaluationManifest,
  plan,
  attempts,
  metricReport,
  graderReport,
  humanReviewReport,
  holdoutExecutionReceipt,
});
if (evaluationIssues.length > 0) {
  throw new Error(
    evaluationIssues
      .map(({ code, message }) => `${code}: ${message}`)
      .join('; ')
  );
}

if (closure.modelEvaluation.status !== 'satisfied') {
  throw new Error(
    'G4 Golden evidence does not bind a satisfied real-model evaluation.'
  );
}
const modelEvaluation = closure.modelEvaluation;
const canonicalIdentitySet = (values) =>
  [...new Set(values)].sort(compareUnicodeCodePoints);
const expectedProviderConfigurationIds = canonicalIdentitySet(
  plan.providerConfigurations.map(
    ({ providerConfigurationId }) => providerConfigurationId
  )
);
const expectedProviderOperatorIds = canonicalIdentitySet(
  plan.providerConfigurations.map(
    ({ providerOperatorId }) => providerOperatorId
  )
);
const expectedModelFamilyOwnerIds = canonicalIdentitySet(
  plan.modelConfigurations.map(({ modelFamilyOwnerId }) => modelFamilyOwnerId)
);
const expectedQualificationTargetDigests = canonicalIdentitySet(
  evaluationManifest.qualificationTargetDigests
);
if (
  modelEvaluation.planDigest !== plan.planDigest ||
  modelEvaluation.manifestRef !== evaluationManifest.manifestId ||
  modelEvaluation.manifestDigest !== evaluationManifest.manifestDigest ||
  modelEvaluation.actualAttemptCount !== attempts.length ||
  !sameCanonicalJson(
    modelEvaluation.providerConfigurationIds,
    expectedProviderConfigurationIds
  ) ||
  !sameCanonicalJson(
    modelEvaluation.providerOperatorIds,
    expectedProviderOperatorIds
  ) ||
  !sameCanonicalJson(
    modelEvaluation.modelFamilyOwnerIds,
    expectedModelFamilyOwnerIds
  ) ||
  !sameCanonicalJson(
    modelEvaluation.qualificationTargetDigests,
    expectedQualificationTargetDigests
  ) ||
  modelEvaluation.holdoutReceiptDigest !==
    holdoutExecutionReceipt.receiptDigest ||
  modelEvaluation.metricReportDigest !== metricReport.reportDigest ||
  modelEvaluation.graderReportDigest !== graderReport.reportDigest ||
  modelEvaluation.humanReviewReportDigest !== humanReviewReport.reportDigest ||
  modelEvaluation.completedAt !== evaluationManifest.completedAt ||
  modelEvaluation.expiresAt !== evaluationManifest.expiresAt
) {
  throw new Error(
    'G4 Golden evidence model-evaluation summary does not match the exact validated evidence bundle.'
  );
}

const repositoryCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], {
  encoding: 'utf8',
}).trim();
if (
  dirty ||
  closure.repositoryCommit !== repositoryCommit ||
  closure.worktreeState !== 'clean' ||
  closure.goldenVerdict !== 'satisfied' ||
  closure.closureVerdict !== 'satisfied' ||
  plan.repositoryCommit !== repositoryCommit ||
  evaluationManifest.outcome !== 'satisfied' ||
  attempts.length < 11_640 ||
  attempts.length !== plan.plannedJourneyCount ||
  Date.now() >= Date.parse(evaluationManifest.expiresAt) ||
  Date.now() >= Date.parse(modelEvaluation.expiresAt) ||
  closure.deterministicGateEvidence.some(
    ({ executionMode, repositoryCommit: gateCommit, runId, jobId }) =>
      executionMode !== 'github-actions' ||
      gateCommit !== repositoryCommit ||
      !runId ||
      !jobId
  )
) {
  throw new Error(
    'G4 Closure requires one exact clean commit, durable Gates, and fresh satisfied real-model evidence.'
  );
}

console.log(
  `Verified durable G4 Closure ${closure.manifestId} at ${repositoryCommit} with ${attempts.length} real-model attempts.`
);
