import { readFileSync } from 'node:fs';
import {
  createAgentBudgetLedger,
  createAgentHoldoutExecutionReceipt,
  digestAgentCanonicalValue,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_COORDINATOR_ERROR_CODES,
  type AgentEvaluationCoordinatorLedger,
  type AgentEvaluationDurableSnapshot,
} from './coordinator';
import { createAgentEvaluationDurableHoldoutSealer } from './holdoutSealer';

const vector = JSON.parse(
  readFileSync(
    new URL(
      '../../../apps/backend/internal/platform/agentcontract/testdata/agent-evaluation-vector.json',
      import.meta.url
    ),
    'utf8'
  )
) as { facts: { plan: { value: AgentModelEvaluationPlan } } };
const plan = vector.facts.plan.value;

const snapshot = (
  holdoutExecutionReceipt?: AgentEvaluationDurableSnapshot['holdoutExecutionReceipt']
): AgentEvaluationDurableSnapshot =>
  Object.freeze({
    partition: Object.freeze({
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
    }),
    plan,
    attempts: Object.freeze([]),
    checkpoints: Object.freeze([]),
    budgetLedger: createAgentBudgetLedger(plan.budget.budget),
    endpointSmokeDispatchIntents: Object.freeze([]),
    endpointSmokeTransportReceipts: Object.freeze([]),
    endpointSmokeResultSpoolReceipts: Object.freeze([]),
    endpointSmokeResultSpoolDispositionReceipts: Object.freeze([]),
    endpointSmokeValidationFailureReceipts: Object.freeze([]),
    endpointSmokeReceipts: Object.freeze([]),
    preDispatchFailureReceipts: Object.freeze([]),
    transportDispatchIntents: Object.freeze([]),
    transportReceipts: Object.freeze([]),
    providerResultSpoolReceipts: Object.freeze([]),
    providerResultSpoolDispositionReceipts: Object.freeze([]),
    invocationTurnReceipts: Object.freeze([]),
    invocationTurnSetReceipts: Object.freeze([]),
    resultSubmissionReceipts: Object.freeze([]),
    controlledRuntimeReceipts: Object.freeze([]),
    capabilityExecutionReceipts: Object.freeze([]),
    capabilitySpecificReceipts: Object.freeze([]),
    providerCapabilityObservationReceipts: Object.freeze([]),
    attemptAuthorityOwnerReceipts: Object.freeze([]),
    verificationAttemptGrantReceipts: Object.freeze([]),
    sourceReceipts: Object.freeze([]),
    executionReceipts: Object.freeze([]),
    reviewRasterScanReceipts: Object.freeze([]),
    reviewCandidateRefs: Object.freeze([]),
    blindReviewMappingRefs: Object.freeze([]),
    validatedHumanReviewArtifacts: Object.freeze([]),
    validatedHumanMetricObservations: Object.freeze([]),
    ...(holdoutExecutionReceipt ? { holdoutExecutionReceipt } : {}),
  });

const ledgerFor = (value: AgentEvaluationDurableSnapshot) =>
  ({
    snapshot: vi.fn(async () => value),
    putHoldoutExecutionReceipt: vi.fn(async () => undefined),
  }) as unknown as AgentEvaluationCoordinatorLedger;

const protectedCaseIds = Object.freeze(
  plan.concreteCases
    .filter(({ access }) => access === 'protected-holdout')
    .map(({ caseId }) => caseId)
    .sort(compareUnicodeCodePoints)
);

describe('AgentEvaluationDurableHoldoutSealer', () => {
  it('stays pending without invoking the authority until exact evidence is complete', async () => {
    const authority = { seal: vi.fn() };
    const ledger = ledgerFor(snapshot());
    const sealer = createAgentEvaluationDurableHoldoutSealer({ authority });

    await expect(sealer.sealIfComplete({ plan, ledger })).resolves.toBe(
      'pending'
    );
    expect(authority.seal).not.toHaveBeenCalled();
    expect(ledger.putHoldoutExecutionReceipt).not.toHaveBeenCalled();
  });

  it('accepts an exact immutable replay without re-running the authority', async () => {
    const receipt = createAgentHoldoutExecutionReceipt({
      receiptId: `holdout-receipt:${plan.planDigest.slice('sha256-'.length)}`,
      planDigest: plan.planDigest,
      protectedHoldoutManifestDigest: plan.protectedHoldoutManifestDigest,
      accessPolicyDigest: digestAgentCanonicalValue('access-policy'),
      encryptedCorpusDigest: digestAgentCanonicalValue('encrypted-corpus'),
      executedCaseIds: protectedCaseIds,
      publicArtifactScanDigest: digestAgentCanonicalValue('scan'),
      leakedCaseIds: Object.freeze([]),
      executorPrincipalId: 'evaluation-holdout-runner',
      executedAt: plan.plannedAt,
    });
    const authority = { seal: vi.fn() };
    const ledger = ledgerFor(snapshot(receipt));
    const sealer = createAgentEvaluationDurableHoldoutSealer({ authority });

    await expect(sealer.sealIfComplete({ plan, ledger })).resolves.toBe(
      'sealed'
    );
    expect(authority.seal).not.toHaveBeenCalled();
    expect(ledger.putHoldoutExecutionReceipt).not.toHaveBeenCalled();
  });

  it('fails closed when an existing seal omits a protected case', async () => {
    const receipt = createAgentHoldoutExecutionReceipt({
      receiptId: `holdout-receipt:${plan.planDigest.slice('sha256-'.length)}`,
      planDigest: plan.planDigest,
      protectedHoldoutManifestDigest: plan.protectedHoldoutManifestDigest,
      accessPolicyDigest: digestAgentCanonicalValue('access-policy'),
      encryptedCorpusDigest: digestAgentCanonicalValue('encrypted-corpus'),
      executedCaseIds: protectedCaseIds.slice(1),
      publicArtifactScanDigest: digestAgentCanonicalValue('scan'),
      leakedCaseIds: Object.freeze([]),
      executorPrincipalId: 'evaluation-holdout-runner',
      executedAt: plan.plannedAt,
    });
    const ledger = ledgerFor(snapshot(receipt));
    const sealer = createAgentEvaluationDurableHoldoutSealer({
      authority: { seal: vi.fn() },
    });

    await expect(sealer.sealIfComplete({ plan, ledger })).rejects.toMatchObject(
      { code: AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid }
    );
  });
});
