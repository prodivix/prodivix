import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  decodeAgentG4ClosureManifest,
  digestAgentCanonicalValue,
  isAgentEvaluationProductionRunConfigArtifactBinding,
} from '../packages/ai/src/index.ts';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '../packages/shared/src/canonical/index.ts';
import { loadAndVerifyG4ModelEvaluationEvidence } from './g4-model-evaluation-evidence-verifier.mjs';

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

const {
  evidenceIndex,
  evidenceIndexArtifact,
  evidenceRoot,
  evidenceRootArtifact,
  singletons,
  attemptRecordCount,
  repositoryCommit: verifiedRepositoryCommit,
} = await loadAndVerifyG4ModelEvaluationEvidence();
const {
  plan,
  metricReport,
  graderReport,
  humanReviewReport,
  holdoutExecutionReceipt,
  authorityAttestation,
  manifest: evaluationManifest,
} = singletons;

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
const expectedArtifact = ({ artifactId, digest, size, mediaType }) => {
  const base = Object.freeze({
    artifactId,
    digest,
    size,
    mediaType,
    availability: 'available',
  });
  return Object.freeze({
    ...base,
    artifactDigest: digestAgentCanonicalValue(base),
  });
};
const expectedEvaluationArtifacts = Object.freeze([
  expectedArtifact({
    artifactId: `g4-model-evaluation-index:${evidenceIndex.indexDigest.slice('sha256-'.length)}`,
    digest: evidenceIndexArtifact.digest,
    size: evidenceIndexArtifact.size,
    mediaType:
      'application/vnd.prodivix.agent-model-evaluation-evidence-index+json',
  }),
  expectedArtifact({
    artifactId: `g4-model-evaluation-root:${evidenceRoot.rootDigest.slice('sha256-'.length)}`,
    digest: evidenceRootArtifact.digest,
    size: evidenceRootArtifact.size,
    mediaType:
      'application/vnd.prodivix.agent-model-evaluation-evidence-root+json',
  }),
]);
const boundEvaluationArtifacts = expectedEvaluationArtifacts.map((expected) =>
  closure.artifacts.filter(
    ({ artifactId }) => artifactId === expected.artifactId
  )
);
const authorityRootDrift = Object.entries(evidenceRoot.authorityRoots).some(
  ([key, digest]) => modelEvaluation[key] !== digest
);
const runConfigArtifactBinding = modelEvaluation.runConfigArtifactBinding;
const runConfigArtifactBindingDrift =
  !isAgentEvaluationProductionRunConfigArtifactBinding(
    runConfigArtifactBinding
  ) ||
  !sameCanonicalJson(
    runConfigArtifactBinding,
    evidenceIndex.runConfigArtifactBinding
  ) ||
  !sameCanonicalJson(
    runConfigArtifactBinding,
    evidenceRoot.runConfigArtifactBinding
  ) ||
  !sameCanonicalJson(
    runConfigArtifactBinding,
    evidenceRoot.archiveAttestation.runConfigArtifactBinding
  ) ||
  runConfigArtifactBinding.sourceConfigDigest !==
    modelEvaluation.sourceConfigDigest ||
  runConfigArtifactBinding.frozenRunDigest !==
    modelEvaluation.frozenRunDigest ||
  runConfigArtifactBinding.planDigest !== plan.planDigest ||
  runConfigArtifactBinding.repositoryCommit !== verifiedRepositoryCommit;
if (
  modelEvaluation.planDigest !== plan.planDigest ||
  modelEvaluation.manifestRef !== evaluationManifest.manifestId ||
  modelEvaluation.manifestDigest !== evaluationManifest.manifestDigest ||
  modelEvaluation.bundleDigest !== evidenceIndex.bundleDigest ||
  modelEvaluation.evidenceSetDigest !== evidenceIndex.evidenceSetDigest ||
  runConfigArtifactBindingDrift ||
  modelEvaluation.sourceConfigDigest !== evidenceRoot.sourceConfigDigest ||
  modelEvaluation.frozenRunDigest !== evidenceRoot.frozenRunDigest ||
  evidenceIndex.sourceConfigDigest !== evidenceRoot.sourceConfigDigest ||
  evidenceIndex.frozenRunDigest !== evidenceRoot.frozenRunDigest ||
  authorityRootDrift ||
  modelEvaluation.authorityAttestationDigest !==
    authorityAttestation.attestationDigest ||
  modelEvaluation.archiveAttestationDigest !==
    evidenceRoot.archiveAttestationDigest ||
  modelEvaluation.evidenceRootDigest !== evidenceRoot.rootDigest ||
  modelEvaluation.evidenceRootArtifactDigest !== evidenceRootArtifact.digest ||
  modelEvaluation.evidenceRootArtifactSize !== evidenceRootArtifact.size ||
  modelEvaluation.evidenceIndexDigest !== evidenceIndex.indexDigest ||
  modelEvaluation.evidenceIndexArtifactDigest !==
    evidenceIndexArtifact.digest ||
  modelEvaluation.evidenceIndexArtifactSize !== evidenceIndexArtifact.size ||
  modelEvaluation.shardSetDigest !== evidenceIndex.shardSetDigest ||
  modelEvaluation.totalShardBytes !== evidenceIndex.totalShardBytes ||
  modelEvaluation.totalRecordCount !== evidenceIndex.totalRecordCount ||
  modelEvaluation.actualAttemptCount !== attemptRecordCount ||
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
  modelEvaluation.holdoutExecutionReceiptDigest !==
    evidenceRoot.authorityRoots.holdoutExecutionReceiptDigest ||
  modelEvaluation.secretCanarySetDigest !==
    evidenceRoot.authorityRoots.secretCanarySetDigest ||
  modelEvaluation.protectedHoldoutCanarySetDigest !==
    evidenceRoot.authorityRoots.protectedHoldoutCanarySetDigest ||
  modelEvaluation.metricReportDigest !== metricReport.reportDigest ||
  modelEvaluation.graderReportDigest !== graderReport.reportDigest ||
  modelEvaluation.humanReviewReportDigest !== humanReviewReport.reportDigest ||
  modelEvaluation.completedAt !== evaluationManifest.completedAt ||
  modelEvaluation.expiresAt !== evaluationManifest.expiresAt ||
  boundEvaluationArtifacts.some(
    (matches, index) =>
      matches.length !== 1 ||
      !sameCanonicalJson(matches[0], expectedEvaluationArtifacts[index])
  )
) {
  throw new Error(
    'G4 Golden evidence model-evaluation summary does not match the exact validated evidence archive.'
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
  verifiedRepositoryCommit !== repositoryCommit ||
  plan.repositoryCommit !== repositoryCommit ||
  evaluationManifest.outcome !== 'satisfied' ||
  attemptRecordCount < 11_640 ||
  attemptRecordCount !== plan.plannedJourneyCount ||
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
  `Verified durable G4 Closure ${closure.manifestId} at ${repositoryCommit} with ${attemptRecordCount} real-model attempts.`
);
