import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  AGENT_G4_REQUIRED_CAPABILITY_PROFILE_IDS,
  AGENT_G4_REQUIRED_NATIVE_PROTOCOL_FAMILIES,
  createAgentG4GoldenClosureManifest,
  decodeAgentG4ClosureManifest,
  digestAgentCanonicalValue,
  encodeAgentG4ClosureManifest,
  isAgentEvaluationProductionRunConfigArtifactBinding,
} from '../packages/ai/src/index.ts';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '../packages/shared/src/canonical/index.ts';
import { loadAndVerifyG4ModelEvaluationEvidence } from './g4-model-evaluation-evidence-verifier.mjs';

const requiredPath = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return resolve(value);
};

const inputPath = requiredPath('PRODIVIX_G4_DETERMINISTIC_CLOSURE_EVIDENCE');
const outputPath = requiredPath('PRODIVIX_G4_CLOSURE_EVIDENCE_OUTPUT');
if (inputPath === outputPath) {
  throw new Error(
    'G4 Closure assembly requires distinct input and output paths.'
  );
}

const deterministicWire = JSON.parse(await readFile(inputPath, 'utf8'));
const decoded = decodeAgentG4ClosureManifest(deterministicWire);
if (!decoded.ok) {
  throw new Error('Deterministic G4 Closure evidence failed strict decoding.');
}
const deterministic = decoded.value;
const {
  evidenceIndex,
  evidenceIndexArtifact,
  evidenceRoot,
  evidenceRootArtifact,
  singletons,
  attemptRecordCount,
  repositoryCommit,
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

if (
  deterministic.repositoryCommit !== repositoryCommit ||
  deterministic.worktreeState !== 'clean' ||
  deterministic.goldenVerdict !== 'satisfied' ||
  deterministic.modelEvaluation.status !== 'pending' ||
  deterministic.deterministicGateEvidence.some(
    ({ executionMode, repositoryCommit: gateCommit, runId, jobId }) =>
      executionMode !== 'github-actions' ||
      gateCommit !== repositoryCommit ||
      !runId ||
      !jobId
  )
) {
  throw new Error(
    'Closure assembly requires exact-commit durable deterministic evidence with a pending model-evaluation slot.'
  );
}

const canonicalSet = (values) =>
  Object.freeze([...new Set(values)].sort(compareUnicodeCodePoints));
const runConfigArtifactBinding = evidenceRoot.runConfigArtifactBinding;
if (
  !isAgentEvaluationProductionRunConfigArtifactBinding(
    runConfigArtifactBinding
  ) ||
  !sameCanonicalJson(
    runConfigArtifactBinding,
    evidenceIndex.runConfigArtifactBinding
  ) ||
  !sameCanonicalJson(
    runConfigArtifactBinding,
    evidenceRoot.archiveAttestation.runConfigArtifactBinding
  ) ||
  runConfigArtifactBinding.sourceConfigDigest !==
    evidenceRoot.sourceConfigDigest ||
  runConfigArtifactBinding.frozenRunDigest !== evidenceRoot.frozenRunDigest ||
  runConfigArtifactBinding.planDigest !== plan.planDigest ||
  runConfigArtifactBinding.repositoryCommit !== repositoryCommit
) {
  throw new Error(
    'Closure assembly requires one exact canonical production run-config artifact binding.'
  );
}
const modelEvaluationBase = Object.freeze({
  status: 'satisfied',
  planDigest: plan.planDigest,
  manifestRef: evaluationManifest.manifestId,
  manifestDigest: evaluationManifest.manifestDigest,
  bundleDigest: evidenceIndex.bundleDigest,
  evidenceSetDigest: evidenceIndex.evidenceSetDigest,
  runConfigArtifactBinding,
  sourceConfigDigest: evidenceRoot.sourceConfigDigest,
  frozenRunDigest: evidenceRoot.frozenRunDigest,
  ...evidenceRoot.authorityRoots,
  authorityAttestationDigest: authorityAttestation.attestationDigest,
  archiveAttestationDigest: evidenceRoot.archiveAttestationDigest,
  evidenceRootDigest: evidenceRoot.rootDigest,
  evidenceRootArtifactDigest: evidenceRootArtifact.digest,
  evidenceRootArtifactSize: evidenceRootArtifact.size,
  evidenceIndexDigest: evidenceIndex.indexDigest,
  evidenceIndexArtifactDigest: evidenceIndexArtifact.digest,
  evidenceIndexArtifactSize: evidenceIndexArtifact.size,
  shardSetDigest: evidenceIndex.shardSetDigest,
  totalShardBytes: evidenceIndex.totalShardBytes,
  totalRecordCount: evidenceIndex.totalRecordCount,
  requiredAttemptCount: 11_640,
  actualAttemptCount: attemptRecordCount,
  requiredProtocolFamilies: AGENT_G4_REQUIRED_NATIVE_PROTOCOL_FAMILIES,
  requiredCapabilityProfileIds: AGENT_G4_REQUIRED_CAPABILITY_PROFILE_IDS,
  providerConfigurationIds: canonicalSet(
    plan.providerConfigurations.map(
      ({ providerConfigurationId }) => providerConfigurationId
    )
  ),
  providerOperatorIds: canonicalSet(
    plan.providerConfigurations.map(
      ({ providerOperatorId }) => providerOperatorId
    )
  ),
  modelFamilyOwnerIds: canonicalSet(
    plan.modelConfigurations.map(({ modelFamilyOwnerId }) => modelFamilyOwnerId)
  ),
  qualificationTargetDigests: canonicalSet(
    evaluationManifest.qualificationTargetDigests
  ),
  holdoutReceiptDigest: holdoutExecutionReceipt.receiptDigest,
  metricReportDigest: metricReport.reportDigest,
  graderReportDigest: graderReport.reportDigest,
  humanReviewReportDigest: humanReviewReport.reportDigest,
  completedAt: evaluationManifest.completedAt,
  expiresAt: evaluationManifest.expiresAt,
});
const modelEvaluation = Object.freeze({
  ...modelEvaluationBase,
  summaryDigest: digestAgentCanonicalValue(modelEvaluationBase),
});
const archiveArtifact = ({ artifactId, digest, size, mediaType }) => {
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
const evaluationArtifacts = Object.freeze([
  archiveArtifact({
    artifactId: `g4-model-evaluation-index:${evidenceIndex.indexDigest.slice('sha256-'.length)}`,
    digest: evidenceIndexArtifact.digest,
    size: evidenceIndexArtifact.size,
    mediaType:
      'application/vnd.prodivix.agent-model-evaluation-evidence-index+json',
  }),
  archiveArtifact({
    artifactId: `g4-model-evaluation-root:${evidenceRoot.rootDigest.slice('sha256-'.length)}`,
    digest: evidenceRootArtifact.digest,
    size: evidenceRootArtifact.size,
    mediaType:
      'application/vnd.prodivix.agent-model-evaluation-evidence-root+json',
  }),
]);
const artifacts = Object.freeze(
  [...deterministic.artifacts, ...evaluationArtifacts].sort((left, right) =>
    compareUnicodeCodePoints(left.artifactId, right.artifactId)
  )
);
if (
  new Set(artifacts.map(({ artifactId }) => artifactId)).size !==
  artifacts.length
) {
  throw new Error('G4 Closure artifact identity is duplicated.');
}

const completedAt = new Date(
  Math.max(Date.now(), Date.parse(evaluationManifest.completedAt))
).toISOString();
const {
  goldenVerdict: _goldenVerdict,
  closureVerdict: _closureVerdict,
  manifestDigest: _manifestDigest,
  ...deterministicInput
} = deterministic;
const closure = createAgentG4GoldenClosureManifest({
  ...deterministicInput,
  manifestId: `g4-closure:${repositoryCommit}`,
  modelEvaluation,
  artifacts,
  completedAt,
});
if (closure.closureVerdict !== 'satisfied') {
  throw new Error('Assembled G4 Closure evidence did not reach satisfied.');
}
const wire = encodeAgentG4ClosureManifest(closure);
await writeFile(outputPath, `${canonicalJsonText(wire)}\n`, {
  encoding: 'utf8',
  flag: 'wx',
});

const dirty = execFileSync('git', ['status', '--porcelain'], {
  encoding: 'utf8',
}).trim();
if (dirty) {
  throw new Error('G4 Closure assembly requires a clean exact worktree.');
}
console.log(
  `Assembled satisfied G4 Closure ${closure.manifestId} at ${repositoryCommit}; evidence ${outputPath}.`
);
