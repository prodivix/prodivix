import { canonicalJsonText } from '../packages/shared/src/canonical/index.ts';
import {
  createAgentProductSupplement,
  createAgentProductView,
  createAgentRunUserCommand,
  encodeAgentProductFact,
  encodeAgentProductView,
} from '../packages/ai/src/index.ts';
import { V4_TIME } from '../packages/ai/src/__tests__/agentV4Fixtures.ts';
import { createG4AgentControlCanonicalVector } from './g4-agent-control-canonical-vector.mjs';

/** Shared TypeScript/Go/PostgreSQL V7 product identity vector. */
export const createG4AgentProductCanonicalVector = () => {
  const control = createG4AgentControlCanonicalVector();
  const task = control.facts.task.value;
  const finalRecovery = control.recoverySequence.at(-1);
  const run = finalRecovery.run.value;
  const events = control.recoverySequence.map(({ event }) => event.value);
  const supplement = createAgentProductSupplement({
    supplementId: 'supplement.g4-v7.vector',
    taskId: task.spec.taskId,
    runId: run.run.runId,
    generation: run.run.generation,
    runSnapshotDigest: run.snapshotDigest,
    runtime: Object.freeze({
      models: Object.freeze([
        Object.freeze({
          invocationId: 'invocation.g4-v7.vector',
          providerConfigurationId: 'provider-configuration.g4-v7.vector',
          protocolFamily: 'openai-responses',
          providerOperatorId: 'provider.g4-v7.vector',
          modelId: 'model.g4-v7.vector',
          capabilityProfileId: 'capability-profile.g4-v7.vector',
          outcome: 'failed',
        }),
      ]),
      tools: Object.freeze([]),
      usage: Object.freeze([]),
      costs: Object.freeze([]),
      budgetLedgerDigest: run.budgetLedger.ledgerDigest,
    }),
    diagnostics: Object.freeze([
      Object.freeze({
        code: 'AI-6004',
        severity: 'warning',
        state: 'resolved',
        message: 'The disconnected model stream was fenced before recovery.',
        identityRefs: Object.freeze([run.run.runId]),
      }),
    ]),
    producer: Object.freeze({
      kind: 'service',
      principalId: 'agent.product-projector',
    }),
    projectedAt: V4_TIME.terminal,
  });
  const command = createAgentRunUserCommand({
    commandId: 'command.g4-v7.vector.cancel',
    taskId: task.spec.taskId,
    runId: run.run.runId,
    kind: 'cancel',
    actor: Object.freeze({
      kind: 'user',
      principalId: task.spec.actor.principalId,
    }),
    expectedGeneration: run.run.generation,
    expectedSnapshotDigest: run.snapshotDigest,
    idempotencyKey: 'idempotency.g4-v7.vector.cancel',
    reason: 'Stop the recovered Run before another invocation.',
    requestedAt: V4_TIME.terminal,
  });
  const view = createAgentProductView({
    task,
    run,
    events,
    mutations: Object.freeze([]),
    verificationBindings: Object.freeze([]),
    verificationClosures: Object.freeze([]),
    repairRounds: Object.freeze([]),
    supplement,
    commands: Object.freeze([command]),
    currentRevision: task.spec.baseRevision,
    actorAuthorized: true,
  });
  const facts = Object.freeze({
    supplement: encodeAgentProductFact({
      factType: 'product-supplement',
      value: supplement,
    }),
    command: encodeAgentProductFact({
      factType: 'run-user-command',
      value: command,
    }),
  });
  const viewWire = encodeAgentProductView(view);
  return Object.freeze({
    format: 'prodivix.agent-product-canonical-vector',
    version: 1,
    control: Object.freeze({ task: control.facts.task, run: finalRecovery.run }),
    facts,
    view: viewWire,
    canonicalJson: Object.freeze({
      supplement: canonicalJsonText(facts.supplement),
      command: canonicalJsonText(facts.command),
      view: canonicalJsonText(viewWire),
    }),
    expectedDigests: Object.freeze({
      supplement: supplement.supplementDigest,
      command: command.commandDigest,
      view: view.viewDigest,
    }),
  });
};
