import { canonicalJsonText } from '../packages/shared/src/canonical/index.ts';
import {
  createAgentBudgetLedger,
  createAgentEvaluationShardCheckpoint,
  encodeAgentEvaluationFact,
} from '../packages/ai/src/index.ts';
import {
  createPassingV8Attempts,
  createV8EvaluationPlan,
  createV8HoldoutReceipt,
} from '../packages/ai/src/__tests__/agentV8Fixtures.ts';

let cachedVector;

/** Shared TypeScript/Go/PostgreSQL V8 evaluation admission vector. */
export const createG4AgentEvaluationCanonicalVector = () => {
  if (cachedVector) return cachedVector;
  const plan = createV8EvaluationPlan();
  const attempt = createPassingV8Attempts(plan)[0];
  const checkpoint = createAgentEvaluationShardCheckpoint({
    planDigest: plan.planDigest,
    shardId: attempt.descriptor.shardId,
    revision: 0,
    leaseOwnerId: 'evaluation-worker.vector',
    leaseGeneration: 1,
    state: 'running',
    completedAttemptRefs: Object.freeze([
      Object.freeze({
        attemptId: attempt.descriptor.attemptId,
        descriptorDigest: attempt.descriptor.descriptorDigest,
        attemptDigest: attempt.attemptDigest,
      }),
    ]),
    missingAttemptRefs: Object.freeze([]),
    budgetLedger: createAgentBudgetLedger(plan.budget.budget),
    updatedAt: '2026-08-02T03:00:00.000Z',
  });
  const holdout = createV8HoldoutReceipt(plan);
  const values = Object.freeze({ plan, attempt, checkpoint, holdout });
  const factTypes = Object.freeze({
    plan: 'evaluation-plan',
    attempt: 'evaluation-attempt',
    checkpoint: 'evaluation-checkpoint',
    holdout: 'evaluation-holdout-receipt',
  });
  const facts = Object.freeze(
    Object.fromEntries(
      Object.entries(values).map(([name, value]) => [
        name,
        encodeAgentEvaluationFact({ factType: factTypes[name], value }),
      ])
    )
  );
  cachedVector = Object.freeze({
    format: 'prodivix.agent-evaluation-canonical-vector',
    version: 1,
    facts,
    canonicalJson: Object.freeze(
      Object.fromEntries(
        Object.entries(facts).map(([name, fact]) => [
          name,
          canonicalJsonText(fact),
        ])
      )
    ),
    expectedDigests: Object.freeze({
      plan: plan.planDigest,
      attempt: attempt.attemptDigest,
      checkpoint: checkpoint.checkpointDigest,
      holdout: holdout.receiptDigest,
    }),
  });
  return cachedVector;
};
