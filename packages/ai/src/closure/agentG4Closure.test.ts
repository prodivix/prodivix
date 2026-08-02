import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  AGENT_G4_REQUIRED_CAPABILITY_PROFILE_IDS,
  AGENT_G4_REQUIRED_DETERMINISTIC_GATE_IDS,
  AGENT_G4_REQUIRED_NATIVE_PROTOCOL_FAMILIES,
  AGENT_G4_REQUIRED_NEGATIVE_CASE_IDS,
  AGENT_G4_REQUIRED_RECOVERY_CASE_IDS,
  type AgentG4GoldenClosureManifest,
} from './agentG4Closure.types';
import { createAgentG4GoldenClosureManifest } from './agentG4Closure';
import {
  decodeAgentG4ClosureManifest,
  encodeAgentG4ClosureManifest,
} from './agentG4ClosureCodec';

const repositoryCommit = 'a'.repeat(40);
const digest = (value: unknown) => digestAgentCanonicalValue({ v9: value });
const withDigest = <T extends object, K extends string>(
  value: T,
  key: K
): T & Readonly<Record<K, string>> =>
  Object.freeze({ ...value, [key]: digestAgentCanonicalValue(value) }) as T &
    Readonly<Record<K, string>>;

const createManifest = (
  options: Readonly<{
    durable?: boolean;
    evaluation?: 'pending' | 'satisfied';
    completedAt?: string;
    evaluationCompletedAt?: string;
    evaluationExpiresAt?: string;
  }> = {}
): AgentG4GoldenClosureManifest => {
  const completedAt = options.completedAt ?? '2026-08-02T06:00:00.000Z';
  const journey = withDigest(
    {
      projectId: 'project.golden.catalog',
      workspaceId: 'workspace.golden.catalog',
      baseRevisionDigest: digest('base-revision'),
      targetRevisionDigest: digest('target-revision'),
      taskDigest: digest('task'),
      runDigest: digest('run'),
      contextPackDigest: digest('context'),
      proposalDigest: digest('proposal'),
      previewDigest: digest('preview'),
      approvalDigest: digest('approval'),
      transactionDigest: digest('transaction'),
      reverseTransactionDigest: digest('reverse-transaction'),
      commitReceiptDigest: digest('commit'),
      verificationPlanDigest: digest('plan'),
      verificationEvidenceSetDigest: digest('evidence'),
      verificationClosureDigest: digest('closure'),
      auditDigest: digest('audit'),
      productViewDigest: digest('product-view'),
    },
    'journeyDigest'
  );
  const verification = withDigest(
    {
      planDigest: journey.verificationPlanDigest,
      g3ClosureManifestDigest: digest('g3-closure-manifest'),
      matrixEvidenceDigest: digest('matrix-evidence'),
      evidenceSetDigest: journey.verificationEvidenceSetDigest,
      closureDigest: journey.verificationClosureDigest,
      requiredCellCount: 66 as const,
      totalAttemptCount: 80,
      evidenceCount: 66 as const,
      frameworkTargets: Object.freeze(['react-vite', 'vue-vite'] as const),
      surfaces: Object.freeze(['ci', 'export', 'preview'] as const),
      closureVerdict: 'satisfied' as const,
    },
    'summaryDigest'
  );
  const recoveryVerdicts = AGENT_G4_REQUIRED_RECOVERY_CASE_IDS.map((caseId) =>
    withDigest(
      {
        caseId,
        evidenceDigest: digest({ recovery: caseId }),
        outcome: 'reconciled' as const,
        sideEffectCount: 1 as const,
        generationFenced: true as const,
        workspaceUnchanged: true as const,
        auditRecorded: true as const,
      },
      'verdictDigest'
    )
  );
  const negativeVerdicts = AGENT_G4_REQUIRED_NEGATIVE_CASE_IDS.map((caseId) =>
    withDigest(
      {
        caseId,
        evidenceDigest: digest({ negative: caseId }),
        outcome: caseId.includes('late')
          ? ('fenced' as const)
          : ('blocked' as const),
        diagnosticCode: 'AI-7005',
        workspaceUnchanged: true as const,
        authorityUnexpanded: true as const,
        auditRecorded: true as const,
        sensitiveDataAbsent: true as const,
        failurePreserved: true as const,
      },
      'verdictDigest'
    )
  );
  const productParity = withDigest(
    {
      webViewDigest: journey.productViewDigest,
      cliViewDigest: journey.productViewDigest,
      auditEventCount: 4,
      auditHeadDigest: digest('audit-head'),
      sanitizedAuditDigest: journey.auditDigest,
      parity: 'exact' as const,
    },
    'summaryDigest'
  );
  const deterministicGateEvidence =
    AGENT_G4_REQUIRED_DETERMINISTIC_GATE_IDS.map((gateId) =>
      withDigest(
        {
          gateId,
          command: gateId,
          repositoryCommit,
          executionMode: options.durable
            ? ('github-actions' as const)
            : ('local' as const),
          ...(options.durable
            ? { runId: `run.${gateId}`, jobId: `job.${gateId}` }
            : {}),
          status: 'passed' as const,
          remoteModelUnits: 0 as const,
          evidenceDigest: digest({ gateId }),
          completedAt: '2026-08-02T05:00:00.000Z',
        },
        'refDigest'
      )
    );
  const modelEvaluation =
    options.evaluation === 'satisfied'
      ? withDigest(
          {
            status: 'satisfied' as const,
            planDigest: digest('evaluation-plan'),
            manifestRef: 'evaluation-manifest.g4-v9',
            manifestDigest: digest('evaluation-manifest'),
            requiredAttemptCount: 11_640 as const,
            actualAttemptCount: 11_640,
            requiredProtocolFamilies:
              AGENT_G4_REQUIRED_NATIVE_PROTOCOL_FAMILIES,
            requiredCapabilityProfileIds:
              AGENT_G4_REQUIRED_CAPABILITY_PROFILE_IDS,
            providerConfigurationIds: Object.freeze([
              'configuration.anthropic',
              'configuration.gemini',
              'configuration.openai',
            ]),
            providerOperatorIds: Object.freeze([
              'operator.anthropic',
              'operator.google',
              'operator.openai',
            ]),
            modelFamilyOwnerIds: Object.freeze([
              'owner.anthropic',
              'owner.google',
              'owner.openai',
            ]),
            qualificationTargetDigests: Object.freeze(
              [
                digest('qualification.a'),
                digest('qualification.b'),
                digest('qualification.c'),
              ].sort()
            ),
            holdoutReceiptDigest: digest('holdout'),
            metricReportDigest: digest('metrics'),
            graderReportDigest: digest('graders'),
            humanReviewReportDigest: digest('human'),
            completedAt:
              options.evaluationCompletedAt ?? '2026-08-02T05:30:00.000Z',
            expiresAt:
              options.evaluationExpiresAt ?? '2026-08-09T00:00:00.000Z',
          },
          'summaryDigest'
        )
      : withDigest(
          {
            status: 'pending' as const,
            planDigest: digest('evaluation-plan'),
            requiredAttemptCount: 11_640 as const,
            actualAttemptCount: 0 as const,
            requiredProtocolFamilies:
              AGENT_G4_REQUIRED_NATIVE_PROTOCOL_FAMILIES,
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
        availability: 'available' as const,
      },
      'artifactDigest'
    )
  );
  return createAgentG4GoldenClosureManifest({
    manifestId: 'manifest.golden.g4-v9.catalog',
    targetId: 'authenticated-catalog',
    repositoryCommit,
    worktreeState: options.durable ? 'clean' : 'dirty',
    journey,
    verification,
    recoveryVerdicts,
    negativeVerdicts,
    productParity,
    deterministicGateEvidence,
    modelEvaluation,
    artifacts,
    completedAt,
  });
};

describe('G4 V9 Golden Closure manifest', () => {
  it('keeps a satisfied deterministic Golden incomplete without real-model evidence', () => {
    expect(createManifest()).toMatchObject({
      goldenVerdict: 'satisfied',
      closureVerdict: 'incomplete',
      modelEvaluation: { status: 'pending', actualAttemptCount: 0 },
    });
  });

  it('allows final satisfaction only for clean durable Gates and fresh evaluation', () => {
    expect(
      createManifest({ durable: true, evaluation: 'satisfied' })
    ).toMatchObject({
      worktreeState: 'clean',
      goldenVerdict: 'satisfied',
      closureVerdict: 'satisfied',
    });
    expect(
      createManifest({
        durable: true,
        evaluation: 'satisfied',
        completedAt: '2026-08-09T00:00:00.000Z',
        evaluationExpiresAt: '2026-08-09T00:00:00.000Z',
      })
    ).toMatchObject({ closureVerdict: 'expired' });
    expect(() =>
      createManifest({
        durable: true,
        evaluation: 'satisfied',
        completedAt: '2026-08-02T05:15:00.000Z',
      })
    ).toThrow('cannot predate');
  });

  it('round-trips canonical wire and rejects nested or envelope drift', () => {
    const manifest = createManifest();
    const wire = encodeAgentG4ClosureManifest(manifest);
    expect(decodeAgentG4ClosureManifest(wire)).toEqual({
      ok: true,
      value: manifest,
    });
    expect(
      decodeAgentG4ClosureManifest({ ...wire, hiddenAuthority: true })
    ).toMatchObject({ ok: false });
    const tampered = structuredClone(wire) as unknown as {
      value: { productParity: { auditEventCount: number } };
    };
    tampered.value.productParity.auditEventCount += 1;
    expect(decodeAgentG4ClosureManifest(tampered)).toMatchObject({ ok: false });
  });

  it('rejects an incomplete required negative or Gate set', () => {
    const manifest = createManifest();
    const {
      goldenVerdict: _goldenVerdict,
      closureVerdict: _closureVerdict,
      manifestDigest: _manifestDigest,
      ...input
    } = manifest;
    expect(() =>
      createAgentG4GoldenClosureManifest({
        ...input,
        negativeVerdicts: input.negativeVerdicts.slice(1),
      })
    ).toThrow(/required evidence set is incomplete/u);
    expect(() =>
      createAgentG4GoldenClosureManifest({
        ...input,
        deterministicGateEvidence: input.deterministicGateEvidence.slice(1),
      })
    ).toThrow(/required evidence set is incomplete/u);
  });
});
