import { readFileSync } from 'node:fs';
import {
  createAgentBudgetLedger,
  createAgentUsageVector,
  digestAgentCanonicalValue,
  planAgentModelEvaluationAttempts,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_COORDINATOR_ERROR_CODES,
  AgentEvaluationCoordinator,
  assertAgentEvaluationFinalizationReport,
  createAgentEvaluationStatusReport,
  type AgentEvaluationCoordinatorDependencies,
  type AgentEvaluationCoordinatorFilePort,
  type AgentEvaluationCoordinatorLedger,
  type AgentEvaluationCoordinatorShardRunner,
  type AgentEvaluationDurableSnapshot,
  type AgentEvaluationPartition,
} from './coordinator';

const vector = JSON.parse(
  readFileSync(
    new URL(
      '../../../apps/backend/internal/platform/agentcontract/testdata/agent-evaluation-vector.json',
      import.meta.url
    ),
    'utf8'
  )
) as {
  facts: { plan: { value: AgentModelEvaluationPlan } };
};
const plan = vector.facts.plan.value;
const now = '2026-01-15T00:00:00.000Z';

class MemoryFiles implements AgentEvaluationCoordinatorFilePort {
  readonly values = new Map<string, unknown>();
  readonly writes = new Map<string, unknown>();
  readonly creates = new Map<string, unknown>();

  async readJson(path: string): Promise<unknown> {
    if (!this.values.has(path)) throw new Error('missing test input');
    return this.values.get(path);
  }

  async writeCanonicalJson(path: string, value: unknown): Promise<void> {
    this.writes.set(path, value);
  }

  async createCanonicalJson(path: string, value: unknown): Promise<void> {
    if (this.creates.has(path)) throw new Error('exclusive create conflict');
    this.creates.set(path, value);
  }
}

const emptySnapshot = (): AgentEvaluationDurableSnapshot =>
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
  });

class MemoryLedger implements AgentEvaluationCoordinatorLedger {
  snapshotValue = emptySnapshot();
  readonly putPlan = vi.fn(async () => undefined);
  readonly reserveBudget = vi.fn(async ({ reservationId }) => ({
    reservationId,
    revision: 1,
  }));
  readonly settleBudget = vi.fn(async () => undefined);
  readonly reconcileBudget = vi.fn(async () => undefined);
  readonly putEndpointSmokeReceipt = vi.fn(async () => undefined);
  readonly putSourceReceipt = vi.fn(async () => undefined);
  readonly putHumanReviewReport = vi.fn(async () => undefined);
  readonly putValidatedHumanReview = vi.fn(async () => undefined);
  readonly putHoldoutExecutionReceipt = vi.fn(async () => undefined);
  readonly putFinalization = vi.fn(async () => undefined);

  async snapshot(): Promise<AgentEvaluationDurableSnapshot> {
    return this.snapshotValue;
  }
}

const harness = (
  runnerResult: Awaited<
    ReturnType<AgentEvaluationCoordinatorShardRunner['run']>
  > = Object.freeze({ ok: false, reason: 'executor-failed' })
) => {
  const files = new MemoryFiles();
  files.values.set('/plan.json', plan);
  files.values.set('/config.json', Object.freeze({ frozen: true }));
  const ledger = new MemoryLedger();
  let openedPartition: AgentEvaluationPartition | undefined;
  const dependencies: AgentEvaluationCoordinatorDependencies = {
    files,
    planFactory: { create: vi.fn(async () => plan) },
    ledgerFactory: {
      open: (partition) => {
        openedPartition = partition;
        return ledger;
      },
    },
    shardRunnerFactory: {
      create: () => ({ run: vi.fn(async () => runnerResult) }),
    },
    holdoutSealer: { sealIfComplete: vi.fn(async () => 'pending' as const) },
    smokeQualifier: {
      qualify: vi.fn(async () => {
        const base = Object.freeze({
          format: 'prodivix.g4-model-evaluation-smoke-qualification' as const,
          version: 2 as const,
          planDigest: plan.planDigest,
          repositoryCommit: plan.repositoryCommit,
          endpointSmokeDispatchIntentSetDigest: digestAgentCanonicalValue({
            smoke: 'intents',
          }),
          endpointSmokeTransportReceiptSetDigest: digestAgentCanonicalValue({
            smoke: 'transports',
          }),
          endpointSmokeResultSpoolReceiptSetDigest: digestAgentCanonicalValue({
            smoke: 'spools',
          }),
          endpointSmokeResultSpoolDispositionReceiptSetDigest:
            digestAgentCanonicalValue({ smoke: 'dispositions' }),
          endpointSmokeReceiptSetDigest: digestAgentCanonicalValue({
            smoke: 'receipts',
          }),
          qualifiedTargetCount: 0,
          budgetReservationId: 'evaluation-smoke-budget:test',
          outcome: 'failed' as const,
          failureCode: 'transport-unavailable',
          completedAt: now,
        });
        return Object.freeze({
          ...base,
          reportDigest: digestAgentCanonicalValue(base),
        });
      }),
    },
    statusSource: {
      load: vi.fn(async ({ shardId, observedAt }) =>
        createAgentEvaluationStatusReport(
          ledger.snapshotValue,
          shardId,
          observedAt
        )
      ),
    },
    reviewLeaseSource: {
      open: vi.fn(async () => {
        throw new Error('review leases are not opened in these tests');
      }),
    },
    finalizationService: {
      resolveIntent: vi.fn(async ({ proposedCompletedAt }) => {
        const base = Object.freeze({
          format: 'prodivix.g4-model-evaluation-finalization-intent' as const,
          version: 1 as const,
          planDigest: plan.planDigest,
          repositoryCommit: plan.repositoryCommit,
          completedAt: proposedCompletedAt,
        });
        return Object.freeze({
          planDigest: base.planDigest,
          repositoryCommit: base.repositoryCommit,
          completedAt: base.completedAt,
          intentDigest: digestAgentCanonicalValue(base),
          replayed: false,
        });
      }),
      inspect: vi.fn(async () => {
        const base = Object.freeze({
          format:
            'prodivix.g4-model-evaluation-finalization-inspection' as const,
          version: 1 as const,
          planDigest: plan.planDigest,
          repositoryCommit: plan.repositoryCommit,
          missingFacts: Object.freeze([
            'attempt-set',
            'completed-checkpoints',
            'endpoint-smoke-receipts',
            'holdout-execution-receipt',
            'human-review-report',
          ]),
          reviewedAttempts: Object.freeze([]),
          validatedHumanReviewArtifacts: Object.freeze([]),
          validatedHumanMetricObservations: Object.freeze([]),
        });
        return Object.freeze({
          ...base,
          inspectionDigest: digestAgentCanonicalValue(base),
        });
      }),
      finalize: vi.fn(async () => {
        throw new Error('finalization is incomplete in these tests');
      }),
    },
    reviewArtifactSource: {
      load: vi.fn(async () => {
        throw new Error('review artifacts are not loaded in these tests');
      }),
    },
    reviewRubrics: {
      load: vi.fn(async () => {
        throw new Error('review rubrics are not loaded in these tests');
      }),
    },
    blindReviewMappings: {
      getOrCreate: vi.fn(async () => {
        throw new Error('review mappings are not loaded in these tests');
      }),
      load: vi.fn(async () => {
        throw new Error('review mappings are not loaded in these tests');
      }),
    },
    reviewImportVerifier: {
      verify: vi.fn(async () => undefined),
    },
    evidenceArchiveExporter: {
      export: vi.fn(async () => Object.freeze({ rootDigest: 'test-root' })),
    },
    canaries: {
      secretCanaries: () => Object.freeze(['secret-canary-123']),
      protectedHoldoutCanaries: () => Object.freeze(['holdout-canary-123']),
    },
    repositoryCommit: () => plan.repositoryCommit,
    now: () => now,
  };
  return {
    coordinator: new AgentEvaluationCoordinator(dependencies),
    dependencies,
    files,
    ledger,
    openedPartition: () => openedPartition,
  };
};

describe('AgentEvaluationCoordinator', () => {
  it('freezes and persists the production plan with a stable shard manifest', async () => {
    const subject = harness();

    await expect(
      subject.coordinator.plan({
        configPath: '/config.json',
        outputPath: '/out/plan.json',
        shardsOutputPath: '/out/shards.json',
      })
    ).resolves.toBe(plan);

    expect(subject.ledger.putPlan).toHaveBeenCalledWith(plan);
    expect(subject.openedPartition()).toEqual({
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
    });
    expect(subject.files.writes.get('/out/plan.json')).toBe(plan);
    const shards = subject.files.writes.get('/out/shards.json') as {
      plannedAttemptCount: number;
      shards: readonly { shardId: string; descriptorCount: number }[];
      manifestDigest: string;
    };
    expect(shards.plannedAttemptCount).toBe(14_040);
    expect(
      shards.shards.reduce((total, shard) => total + shard.descriptorCount, 0)
    ).toBe(14_040);
    expect(shards.shards.map(({ shardId }) => shardId)).toEqual(
      [...shards.shards.map(({ shardId }) => shardId)].sort()
    );
    expect(shards.manifestDigest).toMatch(/^sha256-[0-9a-f]{64}$/u);
  });

  it('reports an exact incomplete denominator without exporting attempt ids', async () => {
    const subject = harness();
    const report = await subject.coordinator.status({
      planPath: '/plan.json',
      outputPath: '/out/status.json',
    });

    expect(report).toMatchObject({
      plannedAttemptCount: 14_040,
      recordedAttemptCount: 0,
      missingAttemptCount: 14_040,
      readyForFinalization: false,
    });
    expect(report.missingAttemptSetDigest).toMatch(/^sha256-[0-9a-f]{64}$/u);
    expect(JSON.stringify(report)).not.toContain('attempt.release.');
  }, 20_000);

  it('uses the durable shard runner and fails the command when it reports failure', async () => {
    const subject = harness(
      Object.freeze({ ok: false, reason: 'budget-exhausted' })
    );
    const shardId = planAgentModelEvaluationAttempts(plan)[0]!.shardId;

    await expect(
      subject.coordinator.runShard({ planPath: '/plan.json', shardId })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_COORDINATOR_ERROR_CODES.runnerFailed,
    });
  }, 20_000);

  it('publishes the bounded durable smoke qualification report and preserves a failed denominator', async () => {
    const subject = harness();

    await expect(
      subject.coordinator.smoke({
        configPath: '/config.json',
        planPath: '/plan.json',
        outputPath: '/out/smoke.json',
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_COORDINATOR_ERROR_CODES.runnerFailed,
    });

    expect(subject.dependencies.smokeQualifier.qualify).toHaveBeenCalledWith({
      config: { frozen: true },
      plan,
    });
    expect(subject.files.writes.get('/out/smoke.json')).toMatchObject({
      format: 'prodivix.g4-model-evaluation-smoke-qualification',
      version: 2,
      qualifiedTargetCount: 0,
      outcome: 'failed',
      failureCode: 'transport-unavailable',
    });
    expect(subject.ledger.reserveBudget).not.toHaveBeenCalled();
  });
  it('writes an incomplete finalization report and never persists green artifacts', async () => {
    const subject = harness();
    const report = await subject.coordinator.finalize({
      planPath: '/plan.json',
      outputPath: '/out/finalization.json',
    });

    expect(report.outcome).toBe('incomplete');
    expect(report.missingFacts).toEqual(
      expect.arrayContaining([
        'attempt-set',
        'completed-checkpoints',
        'endpoint-smoke-receipts',
        'human-review-report',
        'holdout-execution-receipt',
      ])
    );
    expect(subject.ledger.putFinalization).not.toHaveBeenCalled();
  });

  it('accepts a canonical incomplete report returned by a finalization race', () => {
    const base = Object.freeze({
      format: 'prodivix.g4-model-evaluation-finalization' as const,
      version: 1 as const,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      outcome: 'incomplete' as const,
      missingFacts: Object.freeze(['attempt-set']),
      completedAt: now,
    });
    const report = Object.freeze({
      ...base,
      reportDigest: digestAgentCanonicalValue(base),
    });

    expect(assertAgentEvaluationFinalizationReport(report, plan, now)).toEqual(
      report
    );
  });

  it('refuses evidence export from an incomplete finalization before signing or writing', async () => {
    const subject = harness();
    const finalization = await subject.coordinator.finalize({
      planPath: '/plan.json',
      outputPath: '/out/finalization.json',
    });
    subject.files.values.set('/out/finalization.json', finalization);

    await expect(
      subject.coordinator.exportEvidence({
        planPath: '/plan.json',
        manifestPath: '/out/finalization.json',
        archiveOutputPath: '/out/evidence-archive',
        rootOutputPath: '/out/evidence-root.json',
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_COORDINATOR_ERROR_CODES.incomplete,
    });
    expect(subject.files.creates.has('/out/evidence-archive')).toBe(false);
    expect(subject.files.creates.has('/out/evidence-root.json')).toBe(false);
    expect(
      subject.dependencies.evidenceArchiveExporter.export
    ).not.toHaveBeenCalled();
  });

  it('rejects a plan file from another exact repository commit', async () => {
    const subject = harness();
    const dependencies = {
      ...subject.dependencies,
      repositoryCommit: () => 'f'.repeat(40),
    };
    const coordinator = new AgentEvaluationCoordinator(dependencies);

    await expect(
      coordinator.status({
        planPath: '/plan.json',
        outputPath: '/out/status.json',
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_COORDINATOR_ERROR_CODES.partitionMismatch,
    });
  });

  it('delegates a satisfied manifest to the streamed archive exporter without loading a snapshot', async () => {
    const subject = harness();
    const manifestBase = Object.freeze({
      manifestId: 'evaluation-manifest:test',
      planDigest: plan.planDigest,
      attemptRefs: Object.freeze([]),
      attemptCountByRisk: Object.freeze({
        ordinary: 0,
        critical: 0,
        'high-assurance': 0,
      }),
      missingOrInfrastructureAttemptRefs: Object.freeze([]),
      usage: createAgentUsageVector([]),
      cost: Object.freeze([]),
      metricReportRef: 'evaluation-metrics:test',
      metricReportDigest: digestAgentCanonicalValue({ metric: true }),
      graderReportRef: 'evaluation-graders:test',
      graderReportDigest: digestAgentCanonicalValue({ grader: true }),
      holdoutExecutionReceiptRef: 'evaluation-holdout:test',
      holdoutExecutionReceiptDigest: digestAgentCanonicalValue({
        holdout: true,
      }),
      qualificationTargetDigests: Object.freeze([]),
      outcome: 'satisfied',
      completedAt: now,
      expiresAt: plan.expiresAt,
    } as const);
    const manifest = Object.freeze({
      ...manifestBase,
      manifestDigest: digestAgentCanonicalValue(manifestBase),
    });
    const base = Object.freeze({
      format: 'prodivix.g4-model-evaluation-finalization',
      version: 1,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      outcome: 'satisfied',
      missingFacts: Object.freeze([]),
      manifest,
      completedAt: now,
    });
    subject.files.values.set(
      '/out/finalization.json',
      Object.freeze({
        ...base,
        reportDigest: digestAgentCanonicalValue(base),
      })
    );

    await expect(
      subject.coordinator.exportEvidence({
        planPath: '/plan.json',
        manifestPath: '/out/finalization.json',
        archiveOutputPath: '/out/evidence-archive',
        rootOutputPath: '/out/evidence-root.json',
      })
    ).resolves.toEqual({ rootDigest: 'test-root' });

    expect(
      subject.dependencies.evidenceArchiveExporter.export
    ).toHaveBeenCalledWith({
      plan,
      manifest,
      archiveOutputPath: '/out/evidence-archive',
      rootOutputPath: '/out/evidence-root.json',
    });
  });
});
