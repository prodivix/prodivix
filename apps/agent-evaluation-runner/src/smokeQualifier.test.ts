import { readFileSync } from 'node:fs';
import {
  createAgentEvaluationEndpointSmokeResultSpoolId,
  createAgentEvaluationProviderResultSpoolEnvelope,
  createAgentEvaluationSourceReceipt,
  createAgentEvaluationTransportReceipt,
  createAgentUsageVector,
  digestAgentCanonicalValue,
  digestAgentEvaluationEndpointSmokeResultSpoolAad,
  type AgentBudgetDemand,
  type AgentBudgetReservation,
  type AgentEvaluationEndpointSmokeResultSpoolAad,
  type AgentEvaluationProviderResultSpoolEnvelope,
  type AgentModelEvaluationPlan,
  type AgentUsageUnit,
} from '@prodivix/ai';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import { describe, expect, it } from 'vitest';
import { createAgentEvaluationPlanPricingSourceReceipt } from './attemptAccounting';
import {
  createAgentEvaluationAesGcmEndpointSmokeResultSpoolCipher,
  EnvironmentAgentEvaluationEndpointSmokeResultSpoolKeyResolver,
} from './endpointSmokeResultSpoolCipher';
import type { AgentEvaluationEndpointSmokeResponseSpoolEncryptionProfile } from './runConfig';
import { decodeAgentEvaluationFrozenRunConfig } from './runConfig';
import { materializeAgentEvaluationTestProductionRunConfig } from './runConfig.fixture';
import {
  createAgentEvaluationFrozenRunConfigSmokeAuthorityResolver,
  createAgentEvaluationEndpointSmokeJournalTurn,
  createAgentEvaluationEndpointSmokeNormalizedResult,
  createAgentEvaluationEndpointSmokeQualifier,
  type AgentEvaluationEndpointSmokeEncryptedResultSpool,
  type AgentEvaluationEndpointSmokeEvidenceCommit,
  type AgentEvaluationEndpointSmokeJournal,
  type AgentEvaluationEndpointSmokeJournalTurn,
  type AgentEvaluationEndpointSmokePreparedTransport,
  type AgentEvaluationEndpointSmokeResultSpoolCipher,
  type AgentEvaluationEndpointSmokeTransportFactory,
} from './smokeQualifier';

const digest = (label: string) => digestAgentCanonicalValue({ label });
const exampleText = readFileSync(
  new URL(
    '../../../specs/evaluation/g4-real-model-evaluation.example.json',
    import.meta.url
  ),
  'utf8'
);
const productionExampleConfig = (): unknown => {
  const value = JSON.parse(exampleText) as Record<string, unknown>;
  return materializeAgentEvaluationTestProductionRunConfig(value);
};
const fixedInstant = '2026-08-08T00:00:00.000Z';
const exactCommit = '0123456789abcdef0123456789abcdef01234567';
const productionSmokeConfigurationInput = productionExampleConfig();
const frozenSmokeConfiguration = decodeAgentEvaluationFrozenRunConfig(
  productionSmokeConfigurationInput,
  {
    clock: () => fixedInstant,
    expectedRepositoryCommit: exactCommit,
  }
);
const frozenSmokePlan = frozenSmokeConfiguration.plan;
const resolvedSmokeQualification =
  createAgentEvaluationFrozenRunConfigSmokeAuthorityResolver().resolve({
    config: productionSmokeConfigurationInput,
    plan: frozenSmokePlan,
  });
if (resolvedSmokeQualification instanceof Promise) {
  throw new Error(
    'The frozen endpoint-smoke resolver must remain synchronous.'
  );
}
const smokePlan = (): AgentModelEvaluationPlan => frozenSmokePlan;

const after = (instant: string, milliseconds: number): string =>
  new Date(Date.parse(instant) + milliseconds).toISOString();

class FakeCipher implements AgentEvaluationEndpointSmokeResultSpoolCipher {
  readonly plaintext = new Map<string, Uint8Array>();

  async encrypt(
    input: Parameters<
      AgentEvaluationEndpointSmokeResultSpoolCipher['encrypt']
    >[0]
  ) {
    const spoolId = createAgentEvaluationEndpointSmokeResultSpoolId(input.aad);
    this.plaintext.set(spoolId, new Uint8Array(input.canonicalResultBytes));
    return createAgentEvaluationProviderResultSpoolEnvelope({
      spoolId,
      algorithm: 'aes-256-gcm',
      keyId: input.profile.keyId,
      keyVersion: input.profile.keyVersion,
      keyRefDigest: input.profile.keyRefDigest,
      encryptionProfileDigest: input.profile.encryptionProfileDigest,
      nonceBase64Url: 'AAAAAAAAAAAAAAAA',
      authenticationTagBase64Url: 'AAAAAAAAAAAAAAAAAAAAAA',
      ciphertextBase64Url: 'AQID',
      aadDigest: digestAgentEvaluationEndpointSmokeResultSpoolAad(input.aad),
    });
  }

  async useDecrypted<T>(
    input: Readonly<{
      profile: AgentEvaluationEndpointSmokeResponseSpoolEncryptionProfile;
      aad: Parameters<
        AgentEvaluationEndpointSmokeResultSpoolCipher['encrypt']
      >[0]['aad'];
      envelope: AgentEvaluationProviderResultSpoolEnvelope;
    }>,
    callback: (canonicalResultBytes: Uint8Array) => Promise<T>
  ): Promise<T> {
    const bytes = this.plaintext.get(input.envelope.spoolId);
    if (!bytes) throw new Error('missing encrypted fixture');
    const copy = new Uint8Array(bytes);
    try {
      return await callback(copy);
    } finally {
      copy.fill(0);
    }
  }
}

class FakeJournal implements AgentEvaluationEndpointSmokeJournal {
  readonly trace: string[] = [];
  readonly turns = new Map<string, AgentEvaluationEndpointSmokeJournalTurn>();
  readonly spools = new Map<
    string,
    AgentEvaluationEndpointSmokeEncryptedResultSpool
  >();
  reservation?: AgentBudgetReservation;
  commit?: AgentEvaluationEndpointSmokeEvidenceCommit;
  failCloseBeforeStoreTarget?: string;
  failCloseAfterStoreTarget?: string;
  failCommitAfterStore = false;
  driftIntentAcknowledgement = false;
  #failedCloseBefore = false;
  #failedCloseAfter = false;
  #failedCommit = false;

  constructor(readonly plannedAt: string) {}

  async loadCommit() {
    return this.commit;
  }

  async reserveBudget(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      reservationId: string;
      demand: AgentBudgetDemand;
      demandDigest: string;
    }>
  ) {
    this.trace.push('reserve');
    if (!this.reservation) {
      this.reservation = Object.freeze({
        reservationId: input.reservationId,
        demand: input.demand,
        demandDigest: input.demandDigest,
        reservedAt: after(this.plannedAt, 1_000),
        status: 'reserved',
      });
    }
    return this.reservation;
  }

  async listTurns() {
    return Object.freeze([...this.turns.values()]);
  }

  async putDispatchIntent(
    input: Parameters<
      AgentEvaluationEndpointSmokeJournal['putDispatchIntent']
    >[0]
  ) {
    this.trace.push(`intent:${input.target.smokeTargetId}`);
    const turn = createAgentEvaluationEndpointSmokeJournalTurn({
      state: 'intent-recorded',
      intent: input.intent,
    });
    this.turns.set(input.target.smokeTargetId, turn);
    if (!this.driftIntentAcknowledgement) return turn;
    return createAgentEvaluationEndpointSmokeJournalTurn({
      state: 'intent-recorded',
      intent: Object.freeze({
        ...input.intent,
        requestDigest: digest('drifted.request'),
        intentDigest: digest('drifted.intent'),
      }) as never,
    });
  }

  async closeTransport(
    input: Parameters<AgentEvaluationEndpointSmokeJournal['closeTransport']>[0]
  ) {
    const targetId = input.target.smokeTargetId;
    if (
      this.failCloseBeforeStoreTarget === targetId &&
      !this.#failedCloseBefore
    ) {
      this.#failedCloseBefore = true;
      throw new Error('simulated close before store');
    }
    const turn = createAgentEvaluationEndpointSmokeJournalTurn({
      state: 'closed',
      intent: input.intent,
      transportReceipt: input.transportReceipt,
      ...(input.encryptedResultSpool
        ? { resultSpoolReceipt: input.encryptedResultSpool.receipt }
        : {}),
      closedAt: input.closedAt,
    });
    this.turns.set(targetId, turn);
    if (input.encryptedResultSpool) {
      this.spools.set(
        input.encryptedResultSpool.receipt.receiptDigest,
        input.encryptedResultSpool
      );
    }
    this.trace.push(`close:${targetId}`);
    if (
      this.failCloseAfterStoreTarget === targetId &&
      !this.#failedCloseAfter
    ) {
      this.#failedCloseAfter = true;
      throw new Error('simulated close ACK loss');
    }
    return turn;
  }

  async readEncryptedResultSpool(
    input: Parameters<
      AgentEvaluationEndpointSmokeJournal['readEncryptedResultSpool']
    >[0]
  ) {
    const spool = this.spools.get(input.expectedSpoolReceiptDigest);
    if (!spool) throw new Error('missing spool');
    return spool;
  }

  async commitEvidence(input: AgentEvaluationEndpointSmokeEvidenceCommit) {
    this.commit = input;
    this.reservation = input.reservation;
    this.trace.push('commit');
    if (this.failCommitAfterStore && !this.#failedCommit) {
      this.#failedCommit = true;
      throw new Error('simulated commit ACK loss');
    }
    return input;
  }
}

type TransportMode =
  | 'passed'
  | 'not-dispatched'
  | 'post-dispatch-unknown'
  | 'transport-failed'
  | 'output-invalid'
  | 'model-drift'
  | 'usage-unavailable'
  | 'cost-unavailable'
  | 'hang';

const transportFactoryFor = (
  plan: AgentModelEvaluationPlan,
  journal: FakeJournal,
  modes: ReadonlyMap<string, TransportMode>,
  calls: Map<string, number>
): AgentEvaluationEndpointSmokeTransportFactory => ({
  prepare({ authority }) {
    const { target } = authority;
    return Object.freeze({
      endpointId: `endpoint.${target.smokeTargetId}`,
      requestDigest: digest(`request.${target.smokeTargetId}`),
      requestBodyDigest: digest(`request-body.${target.smokeTargetId}`),
      requestBytes: 128,
      async execute({
        intent,
        signal,
      }: Parameters<
        AgentEvaluationEndpointSmokePreparedTransport['execute']
      >[0]) {
        expect(journal.trace[0]).toBe('reserve');
        expect(journal.trace).toContain(`intent:${target.smokeTargetId}`);
        calls.set(
          target.smokeTargetId,
          (calls.get(target.smokeTargetId) ?? 0) + 1
        );
        const mode = modes.get(target.smokeTargetId) ?? 'passed';
        const startedAt = intent.createdAt;
        const completedAt = after(startedAt, 500);
        if (mode === 'hang') {
          return new Promise<never>((_resolve, reject) => {
            signal?.addEventListener(
              'abort',
              () => reject(new Error('aborted by bounded smoke policy')),
              { once: true }
            );
          });
        }
        const transportBase = Object.freeze({
          receiptId: `transport.${target.smokeTargetId}`,
          protocolFamily: target.protocolFamily,
          providerConfigurationId: target.providerConfigurationId,
          invocationId: intent.invocationId,
          dispatchIntentDigest: intent.intentDigest,
          requestDigest: intent.requestDigest,
          endpointId: intent.endpointId,
          endpointClass: intent.endpointClass,
          requestBodyDigest: intent.requestBodyDigest,
          requestBytes: intent.requestBytes,
          responseBytes: 0,
          sseEventCount: 0,
          startedAt,
          completedAt,
        });
        if (mode === 'not-dispatched') {
          return Object.freeze({
            kind: 'failed' as const,
            receipt: createAgentEvaluationTransportReceipt({
              ...transportBase,
              dispatchState: 'not-dispatched',
              outcome: 'failed',
              errorCategory: 'G4_RUNNER_SECRET_UNAVAILABLE',
            }),
          });
        }
        if (mode === 'post-dispatch-unknown') {
          return Object.freeze({
            kind: 'failed' as const,
            receipt: createAgentEvaluationTransportReceipt({
              ...transportBase,
              dispatchState: 'dispatched',
              outcome: 'post-dispatch-unknown',
              errorCategory: 'G4_RUNNER_TRANSPORT_FAILED',
            }),
          });
        }
        if (mode === 'transport-failed') {
          return Object.freeze({
            kind: 'failed' as const,
            receipt: createAgentEvaluationTransportReceipt({
              ...transportBase,
              dispatchState: 'dispatched',
              outcome: 'failed',
              errorCategory: 'G4_RUNNER_TRANSPORT_FAILED',
            }),
          });
        }
        const resolvedModelId =
          mode === 'model-drift' ? 'model.drifted' : target.modelId;
        const resolvedModelVersion =
          target.protocolFamily === 'gemini-interactions'
            ? target.immutableModelVersion
            : undefined;
        const receipt = createAgentEvaluationTransportReceipt({
          ...transportBase,
          responseBytes: 256,
          httpStatus: 200,
          responseHeaderDigest: digest(`headers.${target.smokeTargetId}`),
          responseBodyDigest: digest(`body.${target.smokeTargetId}`),
          providerRequestId: `provider-request.${target.smokeTargetId}`,
          providerIdentityKind: 'response-id',
          providerResponseId: `provider-response.${target.smokeTargetId}`,
          resolvedModelId,
          ...(resolvedModelVersion ? { resolvedModelVersion } : {}),
          sseEventCount: 1,
          dispatchState: 'dispatched',
          outcome: 'completed',
        });
        const usageUnit: AgentUsageUnit =
          mode === 'cost-unavailable' ? 'reasoning-token' : 'text-token-input';
        const usage =
          mode === 'usage-unavailable'
            ? createAgentUsageVector([])
            : createAgentUsageVector([
                Object.freeze({
                  unit: usageUnit,
                  logicalAmount: '4',
                  billableAmount: '4',
                  confidence: 'reported',
                }),
              ]);
        return Object.freeze({
          kind: 'normalized' as const,
          receipt,
          result: createAgentEvaluationEndpointSmokeNormalizedResult({
            smokeTargetId: target.smokeTargetId,
            invocationId: intent.invocationId,
            transportReceiptDigest: receipt.receiptDigest,
            responseDigest: digest(`response.${target.smokeTargetId}`),
            normalizedEventSetDigest: digest(`events.${target.smokeTargetId}`),
            outputText:
              mode === 'output-invalid'
                ? 'UNEXPECTED_OUTPUT'
                : 'PRODIVIX_G4_SMOKE_OK',
            resolvedModelId,
            ...(resolvedModelVersion ? { resolvedModelVersion } : {}),
            reportedUsage: usage,
            observedAt: after(plan.plannedAt, 2_000),
          }),
        });
      },
    });
  },
});

const createHarness = (
  modes: ReadonlyMap<string, TransportMode> = new Map(),
  maximumElapsedMs?: number
) => {
  const plan = smokePlan();
  const config = productionSmokeConfigurationInput;
  const journal = new FakeJournal(plan.plannedAt);
  const cipher = new FakeCipher();
  const calls = new Map<string, number>();
  let tick = 2_000;
  const qualifier = createAgentEvaluationEndpointSmokeQualifier({
    authorityResolver: {
      resolve: () =>
        maximumElapsedMs === undefined
          ? resolvedSmokeQualification
          : Object.freeze({
              ...resolvedSmokeQualification,
              targets: Object.freeze(
                resolvedSmokeQualification.targets.map((authority) =>
                  Object.freeze({ ...authority, maximumElapsedMs })
                )
              ),
            }),
    },
    transportFactory: transportFactoryFor(plan, journal, modes, calls),
    spoolCipher: cipher,
    journal,
    now: () => after(plan.plannedAt, (tick += 100)),
  });
  return { plan, config, journal, cipher, calls, qualifier };
};

describe('production endpoint-smoke qualifier', () => {
  it('reserves before dispatch and atomically commits five priced, encrypted, exact model facts', async () => {
    const { plan, config, journal, cipher, calls, qualifier } = createHarness();
    const report = await qualifier.qualify({ config, plan });

    expect(report.outcome).toBe('completed');
    expect(report.qualifiedTargetCount).toBe(5);
    expect(journal.trace[0]).toBe('reserve');
    expect([...calls.values()]).toEqual([1, 1, 1, 1, 1]);
    expect(journal.commit?.endpointSmokeReceipts).toHaveLength(5);
    expect(
      journal.commit?.endpointSmokeReceipts.every(
        ({ outcome }) => outcome === 'passed'
      )
    ).toBe(true);
    expect(journal.commit?.resultSpoolReceipts).toHaveLength(5);
    expect(journal.commit?.resultSpoolDispositionReceipts).toHaveLength(5);
    expect(journal.commit?.sourceReceipts).toHaveLength(15);
    const openAiTarget = plan.endpointSmokeTargets.find(
      ({ protocolFamily }) => protocolFamily === 'openai-responses'
    )!;
    const canonicalPricingSource =
      createAgentEvaluationPlanPricingSourceReceipt({
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        modelLineageDigest: openAiTarget.modelLineageDigest,
        authority: frozenSmokeConfiguration.pricingAuthorities.openaiResponses,
      });
    expect(
      journal.commit?.sourceReceipts.find(
        (receipt) =>
          receipt.sourceKind === 'pricing-snapshot' &&
          receipt.providerConfigurationId ===
            openAiTarget.providerConfigurationId
      )
    ).toEqual(canonicalPricingSource);
    expect(cipher.plaintext.size).toBe(5);
    expect(journal.commit?.settlement.requiresReconciliation).toBe(false);
    expect(journal.commit?.settlement.actual.modelInvocations).toBe(5);
    expect(
      journal.commit?.endpointSmokeReceipts.every(
        (receipt) =>
          receipt.resolvedModelId === receipt.modelId &&
          receipt.pricingAuthorityDigest ===
            plan.endpointSmokeTargets.find(
              ({ smokeTargetId }) => smokeTargetId === receipt.smokeTargetId
            )?.pricingAuthorityDigest
      )
    ).toBe(true);
    expect(JSON.stringify(journal.commit)).not.toContain('secret-value-canary');

    const replay = await qualifier.qualify({ config, plan });
    expect(replay).toEqual(report);
    expect([...calls.values()]).toEqual([1, 1, 1, 1, 1]);
  });

  it('durably records the complete failure matrix and charges the reserved bound for unknown dispatches', async () => {
    const plan = smokePlan();
    const targets = plan.endpointSmokeTargets;
    const modes = new Map<string, TransportMode>([
      [targets[0]!.smokeTargetId, 'not-dispatched'],
      [targets[1]!.smokeTargetId, 'post-dispatch-unknown'],
      [targets[2]!.smokeTargetId, 'output-invalid'],
      [targets[3]!.smokeTargetId, 'model-drift'],
      [targets[4]!.smokeTargetId, 'usage-unavailable'],
    ]);
    const { config, journal, qualifier } = createHarness(modes);
    const report = await qualifier.qualify({ config, plan });

    expect(report).toMatchObject({
      outcome: 'failed',
      qualifiedTargetCount: 0,
      failureCode: 'endpoint-smoke-qualification-failed',
    });
    expect(
      journal.commit?.endpointSmokeReceipts.map((receipt) =>
        receipt.outcome === 'failed' ? receipt.failureCategory : 'passed'
      )
    ).toEqual([
      'transport-not-dispatched',
      'transport-post-dispatch-unknown',
      'provider-response-invalid',
      'model-identity-drift',
      'usage-unavailable',
    ]);
    expect(journal.commit?.settlement.requiresReconciliation).toBe(true);
    expect(journal.commit?.settlement.reconciliationReason).toBe(
      'usage-unknown'
    );
    expect(
      sameCanonicalJson(
        journal.commit!.settlement.charged,
        journal.commit!.reservation.demand
      )
    ).toBe(true);
    expect(journal.commit?.settlement.actual.modelInvocations).toBe(4);
    expect(journal.commit?.validationFailureReceipts).toHaveLength(1);
    const responseInvalid = journal.commit?.endpointSmokeReceipts.find(
      (receipt) =>
        receipt.outcome === 'failed' &&
        receipt.failureCategory === 'provider-response-invalid'
    );
    expect(responseInvalid).toMatchObject({
      validationFailureReceiptDigest:
        journal.commit?.validationFailureReceipts[0]?.receiptDigest,
    });
  });

  it.each([
    ['transport-failed', 'transport-failed'],
    ['cost-unavailable', 'cost-unavailable'],
  ] as const)(
    'persists %s as a failed denominator fact',
    async (mode, category) => {
      const plan = smokePlan();
      const modes = new Map<string, TransportMode>([
        [plan.endpointSmokeTargets[0]!.smokeTargetId, mode],
      ]);
      const { config, journal, qualifier } = createHarness(modes);
      const report = await qualifier.qualify({ config, plan });
      expect(report.outcome).toBe('failed');
      expect(
        journal.commit?.endpointSmokeReceipts.find(
          ({ smokeTargetId }) =>
            smokeTargetId === plan.endpointSmokeTargets[0]!.smokeTargetId
        )
      ).toMatchObject({ outcome: 'failed', failureCategory: category });
    }
  );

  it('seals an intent-only crash as post-dispatch unknown and never calls that endpoint again', async () => {
    const harness = createHarness();
    const firstTargetId = harness.plan.endpointSmokeTargets[0]!.smokeTargetId;
    harness.journal.failCloseBeforeStoreTarget = firstTargetId;

    await expect(
      harness.qualifier.qualify({ config: harness.config, plan: harness.plan })
    ).rejects.toThrow('simulated close before store');
    expect(harness.calls.get(firstTargetId)).toBe(1);

    const report = await harness.qualifier.qualify({
      config: harness.config,
      plan: harness.plan,
    });
    expect(report.outcome).toBe('failed');
    expect(harness.calls.get(firstTargetId)).toBe(1);
    expect(
      harness.journal.commit?.endpointSmokeReceipts.find(
        ({ smokeTargetId }) => smokeTargetId === firstTargetId
      )
    ).toMatchObject({
      outcome: 'failed',
      failureCategory: 'transport-post-dispatch-unknown',
    });
  });

  it('recovers close and final-commit ACK loss from the encrypted spool without another model call', async () => {
    const harness = createHarness();
    const firstTargetId = harness.plan.endpointSmokeTargets[0]!.smokeTargetId;
    harness.journal.failCloseAfterStoreTarget = firstTargetId;

    await expect(
      harness.qualifier.qualify({ config: harness.config, plan: harness.plan })
    ).rejects.toThrow('simulated close ACK loss');
    expect(harness.calls.get(firstTargetId)).toBe(1);

    harness.journal.failCommitAfterStore = true;
    await expect(
      harness.qualifier.qualify({ config: harness.config, plan: harness.plan })
    ).rejects.toThrow('simulated commit ACK loss');
    const callsAfterCommit = new Map(harness.calls);

    const report = await harness.qualifier.qualify({
      config: harness.config,
      plan: harness.plan,
    });
    expect(report.outcome).toBe('completed');
    expect(harness.calls).toEqual(callsAfterCommit);
  });

  it('fails closed on a drifted dispatch-intent acknowledgement before network execution', async () => {
    const harness = createHarness();
    harness.journal.driftIntentAcknowledgement = true;
    await expect(
      harness.qualifier.qualify({ config: harness.config, plan: harness.plan })
    ).rejects.toThrow(/journal turn|acknowledgement/u);
    expect(harness.calls.size).toBe(0);
  });

  it('enforces the frozen per-target deadline and persists timeout as post-dispatch unknown', async () => {
    const plan = smokePlan();
    const targetId = plan.endpointSmokeTargets[0]!.smokeTargetId;
    const harness = createHarness(new Map([[targetId, 'hang' as const]]), 10);
    const report = await harness.qualifier.qualify({
      config: harness.config,
      plan: harness.plan,
    });
    expect(report.outcome).toBe('failed');
    expect(harness.calls.get(targetId)).toBe(1);
    expect(
      harness.journal.commit?.endpointSmokeReceipts.find(
        ({ smokeTargetId }) => smokeTargetId === targetId
      )
    ).toMatchObject({
      outcome: 'failed',
      failureCategory: 'transport-post-dispatch-unknown',
    });
    expect(harness.journal.commit?.settlement.requiresReconciliation).toBe(
      true
    );
  });

  it('rejects a self-consistent replay report that falsely upgrades failed receipts', async () => {
    const plan = smokePlan();
    const modes = new Map<string, TransportMode>(
      plan.endpointSmokeTargets.map(({ smokeTargetId }) => [
        smokeTargetId,
        'post-dispatch-unknown',
      ])
    );
    const harness = createHarness(modes);
    await harness.qualifier.qualify({
      config: harness.config,
      plan: harness.plan,
    });
    const commit = harness.journal.commit!;
    const { reportDigest: _reportDigest, ...prior } = commit.report;
    const falseCompletedBase = Object.freeze({
      ...prior,
      qualifiedTargetCount: 5,
      outcome: 'completed' as const,
      failureCode: null,
    });
    harness.journal.commit = Object.freeze({
      ...commit,
      report: Object.freeze({
        ...falseCompletedBase,
        reportDigest: digestAgentCanonicalValue(falseCompletedBase),
      }),
    });
    await expect(
      harness.qualifier.qualify({
        config: harness.config,
        plan: harness.plan,
      })
    ).rejects.toThrow(/committed evidence drifted/u);
  });

  it('rejects replay with an omitted accounting source even when report roots remain self-consistent', async () => {
    const harness = createHarness();
    await harness.qualifier.qualify({
      config: harness.config,
      plan: harness.plan,
    });
    const commit = harness.journal.commit!;
    harness.journal.commit = Object.freeze({
      ...commit,
      sourceReceipts: Object.freeze(commit.sourceReceipts.slice(1)),
    });
    await expect(
      harness.qualifier.qualify({
        config: harness.config,
        plan: harness.plan,
      })
    ).rejects.toThrow(/committed evidence drifted/u);
  });

  it('rejects different pricing receipt bytes for one plan content authority', async () => {
    const harness = createHarness();
    await harness.qualifier.qualify({
      config: harness.config,
      plan: harness.plan,
    });
    const commit = harness.journal.commit!;
    const pricing = commit.sourceReceipts.find(
      ({ sourceKind }) => sourceKind === 'pricing-snapshot'
    )!;
    const { receiptDigest: _receiptDigest, ...pricingInput } = pricing;
    const conflicting = createAgentEvaluationSourceReceipt({
      ...pricingInput,
      sourceReceiptId: `${pricing.sourceReceiptId}.conflicting`,
      observedAt: after(pricing.observedAt, 1),
    });
    harness.journal.commit = Object.freeze({
      ...commit,
      sourceReceipts: Object.freeze([...commit.sourceReceipts, conflicting]),
    });
    await expect(
      harness.qualifier.qualify({
        config: harness.config,
        plan: harness.plan,
      })
    ).rejects.toThrow(/committed evidence drifted/u);
  });
});

describe('endpoint-smoke encrypted result spool', () => {
  it('round-trips only the smoke AAD family and zeroizes decrypted callback bytes', async () => {
    const profile = resolvedSmokeQualification.responseSpoolEncryption;
    const keyBase64 = Buffer.alloc(32, 7).toString('base64');
    const keys =
      new EnvironmentAgentEvaluationEndpointSmokeResultSpoolKeyResolver({
        profile,
        environment: (name) =>
          name === profile.keyEnvironmentName ? keyBase64 : undefined,
      });
    const cipher = createAgentEvaluationAesGcmEndpointSmokeResultSpoolCipher({
      keys,
      randomBytes: (size) => new Uint8Array(size).fill(3),
    });
    const target = frozenSmokePlan.endpointSmokeTargets[0]!;
    const aad: AgentEvaluationEndpointSmokeResultSpoolAad = Object.freeze({
      format: 'prodivix.agent-evaluation-endpoint-smoke-result-spool-aad',
      version: 1,
      namespaceDigest: profile.namespaceDigest,
      planDigest: frozenSmokePlan.planDigest,
      repositoryCommit: frozenSmokePlan.repositoryCommit,
      smokeTargetId: target.smokeTargetId,
      smokeTargetDigest: target.targetDigest,
      invocationId: 'endpoint-smoke-invocation.cipher-test',
      dispatchIntentDigest: digest('cipher.intent'),
      transportReceiptDigest: digest('cipher.transport'),
      responseBodyDigest: digest('cipher.response-body'),
      normalizedEventSetDigest: digest('cipher.events'),
    });
    const plaintext = new TextEncoder().encode('{"safe":"normalized"}');
    const envelope = await cipher.encrypt({
      profile,
      aad,
      canonicalResultBytes: plaintext,
    });
    let callbackBytes: Uint8Array | undefined;
    const decoded = await cipher.useDecrypted(
      { profile, aad, envelope },
      async (bytes) => {
        callbackBytes = bytes;
        return new TextDecoder().decode(bytes);
      }
    );
    expect(decoded).toBe('{"safe":"normalized"}');
    expect(callbackBytes?.every((value) => value === 0)).toBe(true);
    await expect(
      cipher.useDecrypted(
        {
          profile,
          aad: Object.freeze({
            ...aad,
            responseBodyDigest: digest('cipher.drifted-response-body'),
          }),
          envelope,
        },
        async () => undefined
      )
    ).rejects.toMatchObject({
      code: 'G4_RUNNER_CAPTURE_FAILED',
    });
    expect(
      () =>
        new EnvironmentAgentEvaluationEndpointSmokeResultSpoolKeyResolver({
          profile:
            frozenSmokeConfiguration.responseSpoolEncryption as unknown as AgentEvaluationEndpointSmokeResponseSpoolEncryptionProfile,
          environment: () => keyBase64,
        })
    ).toThrowError(
      expect.objectContaining({ code: 'G4_RUNNER_CONFIGURATION_INVALID' })
    );
  });
});
