import { loadAndVerifyG4ModelEvaluationEvidence } from './g4-model-evaluation-evidence-verifier.mjs';

const { singletons, attemptRecordCount, repositoryCommit } =
  await loadAndVerifyG4ModelEvaluationEvidence();
const { manifest } = singletons;

console.log(
  `Verified signed G4 model-evaluation manifest ${manifest.manifestId} at ${repositoryCommit} with ${attemptRecordCount} attempts; expires ${manifest.expiresAt}.`
);
