import { canonicalJsonText } from '../packages/shared/src/canonical/index.ts';
import {
  AGENT_G4_REQUIRED_CAPABILITY_PROFILE_IDS,
  AGENT_G4_REQUIRED_DETERMINISTIC_GATE_IDS,
  AGENT_G4_REQUIRED_NATIVE_PROTOCOL_FAMILIES,
  AGENT_G4_REQUIRED_NEGATIVE_CASE_IDS,
  AGENT_G4_REQUIRED_RECOVERY_CASE_IDS,
  createAgentG4GoldenClosureManifest,
  digestAgentCanonicalValue,
  encodeAgentG4ClosureManifest,
} from '../packages/ai/src/index.ts';

const commit = '9'.repeat(40);
const digest = (value) => digestAgentCanonicalValue({ vector: 'g4-v9', value });
const withDigest = (value, key) =>
  Object.freeze({ ...value, [key]: digestAgentCanonicalValue(value) });

let cachedVector;

/** Shared TypeScript/Go V9 Golden Closure admission vector. */
export const createG4AgentClosureCanonicalVector = () => {
  if (cachedVector) return cachedVector;
  const journey = withDigest(
    {
      projectId: 'project.golden.catalog',
      workspaceId: 'workspace.golden.catalog',
      baseRevisionDigest: digest('base'),
      targetRevisionDigest: digest('target'),
      taskDigest: digest('task'),
      runDigest: digest('run'),
      contextPackDigest: digest('context'),
      proposalDigest: digest('proposal'),
      previewDigest: digest('preview'),
      approvalDigest: digest('approval'),
      transactionDigest: digest('transaction'),
      reverseTransactionDigest: digest('reverse'),
      commitReceiptDigest: digest('commit'),
      verificationPlanDigest: digest('plan'),
      verificationEvidenceSetDigest: digest('evidence'),
      verificationClosureDigest: digest('closure'),
      auditDigest: digest('audit'),
      productViewDigest: digest('product'),
    },
    'journeyDigest'
  );
  const verification = withDigest(
    {
      planDigest: journey.verificationPlanDigest,
      g3ClosureManifestDigest: digest('g3-manifest'),
      matrixEvidenceDigest: digest('matrix'),
      evidenceSetDigest: journey.verificationEvidenceSetDigest,
      closureDigest: journey.verificationClosureDigest,
      requiredCellCount: 66,
      totalAttemptCount: 80,
      evidenceCount: 66,
      frameworkTargets: Object.freeze(['react-vite', 'vue-vite']),
      surfaces: Object.freeze(['ci', 'export', 'preview']),
      closureVerdict: 'satisfied',
    },
    'summaryDigest'
  );
  const recoveryVerdicts = AGENT_G4_REQUIRED_RECOVERY_CASE_IDS.map((caseId) =>
    withDigest(
      {
        caseId,
        evidenceDigest: digest({ recovery: caseId }),
        outcome: 'reconciled',
        sideEffectCount: 1,
        generationFenced: true,
        workspaceUnchanged: true,
        auditRecorded: true,
      },
      'verdictDigest'
    )
  );
  const negativeVerdicts = AGENT_G4_REQUIRED_NEGATIVE_CASE_IDS.map((caseId) =>
    withDigest(
      {
        caseId,
        evidenceDigest: digest({ negative: caseId }),
        outcome: caseId.includes('state') ? 'fenced' : 'blocked',
        diagnosticCode: 'AI-7005',
        workspaceUnchanged: true,
        authorityUnexpanded: true,
        auditRecorded: true,
        sensitiveDataAbsent: true,
        failurePreserved: true,
      },
      'verdictDigest'
    )
  );
  const productParity = withDigest(
    {
      webViewDigest: journey.productViewDigest,
      cliViewDigest: journey.productViewDigest,
      auditEventCount: 7,
      auditHeadDigest: digest('audit-head'),
      sanitizedAuditDigest: journey.auditDigest,
      parity: 'exact',
    },
    'summaryDigest'
  );
  const deterministicGateEvidence =
    AGENT_G4_REQUIRED_DETERMINISTIC_GATE_IDS.map((gateId) =>
      withDigest(
        {
          gateId,
          command: `pnpm run ${gateId}`,
          repositoryCommit: commit,
          executionMode: 'local',
          status: 'passed',
          remoteModelUnits: 0,
          evidenceDigest: digest({ gateId }),
          completedAt: '2026-08-02T05:00:00.000Z',
        },
        'refDigest'
      )
    );
  const modelEvaluation = withDigest(
    {
      status: 'pending',
      planDigest: digest('evaluation-plan'),
      requiredAttemptCount: 11_640,
      actualAttemptCount: 0,
      requiredProtocolFamilies: AGENT_G4_REQUIRED_NATIVE_PROTOCOL_FAMILIES,
      requiredCapabilityProfileIds:
        AGENT_G4_REQUIRED_CAPABILITY_PROFILE_IDS,
    },
    'summaryDigest'
  );
  const artifacts = ['audit', 'g3-closure', 'product-view'].map((artifactId) =>
    withDigest(
      {
        artifactId: `artifact.${artifactId}`,
        digest: digest({ artifactId }),
        size: 64,
        mediaType: 'application/json',
        availability: 'available',
      },
      'artifactDigest'
    )
  );
  const manifest = createAgentG4GoldenClosureManifest({
    manifestId: 'manifest.golden.g4-v9.vector',
    targetId: 'authenticated-catalog',
    repositoryCommit: commit,
    worktreeState: 'dirty',
    journey,
    verification,
    recoveryVerdicts,
    negativeVerdicts,
    productParity,
    deterministicGateEvidence,
    modelEvaluation,
    artifacts,
    completedAt: '2026-08-02T06:00:00.000Z',
  });
  const fact = encodeAgentG4ClosureManifest(manifest);
  cachedVector = Object.freeze({
    format: 'prodivix.agent-g4-closure-canonical-vector',
    version: 1,
    fact,
    canonicalJson: canonicalJsonText(fact),
    expectedDigest: manifest.manifestDigest,
  });
  return cachedVector;
};
