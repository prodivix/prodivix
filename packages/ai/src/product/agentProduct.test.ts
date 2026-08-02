import { describe, expect, it } from 'vitest';
import {
  V4_REVISION,
  V4_TIME,
  createV4Task,
  v4Command,
} from '../__tests__/agentV4Fixtures';
import type {
  AgentControlEvent,
  AgentRunSnapshot,
  AgentTaskRecord,
} from '../control/agentControl.types';
import {
  createAgentRunControl,
  startAgentRun,
  transitionAgentRunPhase,
} from '../control/agentControlPlane';
import { createAgentAuditExport } from '../control/agentAudit';
import { encodeAgentControlFact } from '../control/agentControlCodec';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  createAgentActionDescriptor,
  createAgentActionRegistrySnapshot,
} from '../proposal/agentActionRegistry';
import {
  decodeAgentProductFact,
  decodeAgentProductView,
  encodeAgentProductFact,
  encodeAgentProductView,
} from './agentProductCodec';
import { decodeAgentProductLedgerBundle } from './agentProductLedgerCodec';
import {
  createAgentProductSupplement,
  createAgentProductView,
  createAgentRunUserCommand,
  isAgentProductView,
} from './agentProduct';

const buildRun = (): Readonly<{
  task: AgentTaskRecord;
  run: AgentRunSnapshot;
  events: readonly AgentControlEvent[];
}> => {
  const task = createV4Task('explain', 'product');
  const events: AgentControlEvent[] = [];
  const accept = (
    result: ReturnType<typeof createAgentRunControl>
  ): AgentRunSnapshot => {
    if (!result.accepted) {
      throw new Error(result.issues.map(({ message }) => message).join('; '));
    }
    events.push(result.event);
    return result.state;
  };
  let run = accept(
    createAgentRunControl(task, {
      runId: 'run.g4-v7.product',
      command: v4Command(
        'event.product.created',
        'idempotency.product.created',
        V4_TIME.run
      ),
    })
  );
  run = accept(
    startAgentRun(task, run, {
      ...v4Command(
        'event.product.started',
        'idempotency.product.started',
        V4_TIME.start
      ),
      attemptId: 'attempt.product.1',
    })
  );
  run = accept(
    transitionAgentRunPhase(task, run, {
      ...v4Command(
        'event.product.running',
        'idempotency.product.running',
        V4_TIME.running
      ),
      phase: 'running',
    })
  );
  return Object.freeze({ task, run, events: Object.freeze(events) });
};

const buildProduct = () => {
  const fixture = buildRun();
  const supplement = createAgentProductSupplement({
    supplementId: 'supplement.g4-v7.product',
    taskId: fixture.task.spec.taskId,
    runId: fixture.run.run.runId,
    generation: fixture.run.run.generation,
    runSnapshotDigest: fixture.run.snapshotDigest,
    runtime: Object.freeze({
      models: Object.freeze([
        Object.freeze({
          invocationId: 'invocation.product.1',
          providerConfigurationId: 'provider-configuration.product',
          protocolFamily: 'openai-responses' as const,
          providerOperatorId: 'provider.product',
          modelId: 'model.product',
          capabilityProfileId: 'capability-profile.product',
          outcome: 'completed' as const,
        }),
      ]),
      tools: Object.freeze([]),
      usage: Object.freeze([]),
      costs: Object.freeze([]),
      budgetLedgerDigest: fixture.run.budgetLedger.ledgerDigest,
    }),
    diagnostics: Object.freeze([]),
    producer: Object.freeze({
      kind: 'service' as const,
      principalId: 'agent.product-projector',
    }),
    projectedAt: V4_TIME.operation,
  });
  return { fixture, supplement };
};

describe('Agent product projection', () => {
  it('projects one strict Web/CLI view with exact identities and audit lineage', () => {
    const { fixture, supplement } = buildProduct();
    const audit = createAgentAuditExport(fixture.events, V4_TIME.export);
    const view = createAgentProductView({
      task: fixture.task,
      run: fixture.run,
      events: fixture.events,
      mutations: Object.freeze([]),
      verificationBindings: Object.freeze([]),
      verificationClosures: Object.freeze([]),
      repairRounds: Object.freeze([]),
      supplement,
      commands: Object.freeze([]),
      audit,
      currentRevision: V4_REVISION,
      actorAuthorized: true,
    });

    expect(view.identity).toMatchObject({
      taskId: fixture.task.spec.taskId,
      runId: fixture.run.run.runId,
      runSnapshotDigest: fixture.run.snapshotDigest,
      latestEventDigest: fixture.events.at(-1)?.eventDigest,
    });
    expect(view.timeline.map(({ sequence }) => sequence)).toEqual([1, 2, 3]);
    expect(view.availableActions).toEqual(['cancel', 'export-audit']);
    expect(view.runtime.models[0]?.modelId).toBe('model.product');
    expect(decodeAgentProductView(encodeAgentProductView(view))).toEqual({
      ok: true,
      value: view,
    });
  });

  it('persists cancel intent separately and suppresses duplicate commands', () => {
    const { fixture, supplement } = buildProduct();
    const command = createAgentRunUserCommand({
      commandId: 'command.product.cancel',
      taskId: fixture.task.spec.taskId,
      runId: fixture.run.run.runId,
      kind: 'cancel',
      actor: Object.freeze({
        kind: 'user' as const,
        principalId: fixture.task.spec.actor.principalId,
      }),
      expectedGeneration: fixture.run.run.generation,
      expectedSnapshotDigest: fixture.run.snapshotDigest,
      idempotencyKey: 'idempotency.product.cancel',
      reason: 'Stop before any additional provider invocation.',
      requestedAt: V4_TIME.operation,
    });
    const view = createAgentProductView({
      task: fixture.task,
      run: fixture.run,
      events: fixture.events,
      mutations: Object.freeze([]),
      verificationBindings: Object.freeze([]),
      verificationClosures: Object.freeze([]),
      repairRounds: Object.freeze([]),
      supplement,
      commands: Object.freeze([command]),
      currentRevision: V4_REVISION,
      actorAuthorized: true,
    });

    expect(view.availableActions).not.toContain('cancel');
    expect(
      decodeAgentProductFact(
        encodeAgentProductFact({ factType: 'run-user-command', value: command })
      )
    ).toEqual({
      ok: true,
      value: { factType: 'run-user-command', value: command },
    });
  });

  it('fails closed for a missing event and a recomputed inconsistent identity', () => {
    const { fixture, supplement } = buildProduct();
    expect(() =>
      createAgentProductView({
        task: fixture.task,
        run: fixture.run,
        events: fixture.events.slice(1),
        mutations: Object.freeze([]),
        verificationBindings: Object.freeze([]),
        verificationClosures: Object.freeze([]),
        repairRounds: Object.freeze([]),
        supplement,
        commands: Object.freeze([]),
        currentRevision: V4_REVISION,
        actorAuthorized: true,
      })
    ).toThrow(/event ledger/u);

    const view = createAgentProductView({
      task: fixture.task,
      run: fixture.run,
      events: fixture.events,
      mutations: Object.freeze([]),
      verificationBindings: Object.freeze([]),
      verificationClosures: Object.freeze([]),
      repairRounds: Object.freeze([]),
      supplement,
      commands: Object.freeze([]),
      currentRevision: V4_REVISION,
      actorAuthorized: true,
    });
    const tampered = structuredClone(view) as unknown as {
      identity: { runId: string };
      viewDigest: string;
      [key: string]: unknown;
    };
    tampered.identity.runId = 'run.foreign';
    const { viewDigest: _viewDigest, ...tamperedBase } = tampered;
    tampered.viewDigest = digestAgentCanonicalValue(tamperedBase);
    expect(isAgentProductView(tampered)).toBe(false);
  });

  it('decodes one exact authenticated ledger shape for Web and CLI', () => {
    const { fixture, supplement } = buildProduct();
    const registry = createAgentActionRegistrySnapshot(
      'registry.product.test',
      Object.freeze([
        createAgentActionDescriptor({
          descriptorId: 'descriptor.product.test',
          ownerId: 'owner.product.test',
          actionType: 'action.product.test',
          inputSchemaId: 'schema.product.test',
          requiredCapabilities: Object.freeze(['read']),
          allowedTargetKinds: Object.freeze(['workspace']),
          maximumInputBytes: 1_024,
          risk: Object.freeze({
            id: 'risk.product.test',
            level: 'low',
            message: 'Read-only product test action.',
          }),
        }),
      ])
    );
    const response = {
      ledger: {
        task: encodeAgentControlFact({
          factType: 'task-record',
          value: fixture.task,
        }),
        run: encodeAgentControlFact({
          factType: 'run-snapshot',
          value: fixture.run,
        }),
        events: fixture.events.map((value) =>
          encodeAgentControlFact({ factType: 'run-event', value })
        ),
        mutations: [],
        verificationBindings: [],
        verificationClosures: [],
        repairRounds: [],
        supplement: encodeAgentProductFact({
          factType: 'product-supplement',
          value: supplement,
        }),
        commands: [],
        currentRevision: V4_REVISION,
        actorAuthorized: true,
      },
    };
    const decoded = decodeAgentProductLedgerBundle(registry, response);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.identity.runId).toBe(fixture.run.run.runId);
    }
    expect(
      decodeAgentProductLedgerBundle(registry, {
        ledger: { ...response.ledger, hiddenApproval: true },
      }).ok
    ).toBe(false);
  });
});
