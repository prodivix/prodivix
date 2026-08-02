import { describe, expect, it } from 'vitest';
import { createV1Policy, testDigest } from '../__tests__/agentV1Fixtures';
import {
  createAgentBudgetLedger,
  reserveAgentBudget,
  selectAgentBudgetUtilization,
  settleAgentBudget,
  type AgentBudgetDemand,
} from './agentBudgetLedger';
import {
  createAgentPricingSnapshot,
  createAgentUsageVector,
  createUnknownAgentUsageVector,
  measureDeterministicMockAgentUsage,
  priceAgentUsage,
} from './agentUsage';

const demand = (inputTokens = '500'): AgentBudgetDemand => ({
  usage: createAgentUsageVector([
    {
      unit: 'text-token-input',
      logicalAmount: inputTokens,
      billableAmount: inputTokens,
      confidence: 'measured',
    },
    {
      unit: 'image',
      logicalAmount: '2',
      billableAmount: '2',
      confidence: 'measured',
    },
  ]),
  cost: [{ currency: 'USD', amount: '0.5', confidence: 'estimated' }],
  modelInvocations: 1,
  toolCalls: 0,
  repairRounds: 0,
  transactions: 0,
  artifactBytes: 0,
  elapsedMs: 1_000,
});

describe('G4 V1 usage, pricing, and hard budget', () => {
  it('keeps logical, billable, cached, unknown, and non-token units distinct', () => {
    const usage = createAgentUsageVector([
      {
        unit: 'text-token-input',
        logicalAmount: '100',
        billableAmount: '20',
        cachedAmount: '80',
        confidence: 'reported',
      },
      {
        unit: 'image-pixel',
        logicalAmount: '1048576',
        billableAmount: '1048576',
        confidence: 'measured',
      },
      { unit: 'hosted-search-query', confidence: 'unknown' },
    ]);
    expect(usage.amounts).toEqual([
      {
        unit: 'hosted-search-query',
        confidence: 'unknown',
      },
      {
        unit: 'image-pixel',
        logicalAmount: '1048576',
        billableAmount: '1048576',
        confidence: 'measured',
      },
      {
        unit: 'text-token-input',
        logicalAmount: '100',
        billableAmount: '20',
        cachedAmount: '80',
        confidence: 'reported',
      },
    ]);
    expect(usage.vectorDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
    expect(createUnknownAgentUsageVector(['document-page'])).toMatchObject({
      amounts: [{ unit: 'document-page', confidence: 'unknown' }],
    });
  });

  it('uses deterministic mock text/media measurement and pricing snapshots', () => {
    const usage = measureDeterministicMockAgentUsage({
      inputText: '12345678',
      outputText: 'abcd',
      images: 2,
      imagePixels: 2_000_000,
      documentPages: 3,
      audioSeconds: '1.5',
    });
    expect(usage.amounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          unit: 'text-token-input',
          logicalAmount: '2',
        }),
        expect.objectContaining({ unit: 'image', logicalAmount: '2' }),
        expect.objectContaining({
          unit: 'document-page',
          logicalAmount: '3',
        }),
        expect.objectContaining({
          unit: 'audio-second',
          logicalAmount: '1.5',
        }),
      ])
    );
    const pricing = createAgentPricingSnapshot({
      pricingSnapshotId: 'pricing.test',
      providerConfigurationId: 'provider.openai.test',
      effectiveAt: '2026-08-01T00:00:00.000Z',
      rates: [
        { unit: 'audio-second', currency: 'USD', unitPrice: '0' },
        { unit: 'document-page', currency: 'USD', unitPrice: '0' },
        { unit: 'image', currency: 'USD', unitPrice: '0.25' },
        { unit: 'image-pixel', currency: 'USD', unitPrice: '0' },
        { unit: 'text-token-input', currency: 'USD', unitPrice: '0.001' },
        { unit: 'text-token-output', currency: 'USD', unitPrice: '0' },
      ],
      sourceDigest: testDigest('pricing-source'),
    });
    expect(priceAgentUsage(usage, pricing)).toEqual([
      expect.objectContaining({
        currency: 'USD',
        amount: '0.502',
        sourceDigest: pricing.snapshotDigest,
      }),
    ]);
  });

  it('never treats missing pricing as zero cost', () => {
    const usage = createAgentUsageVector([
      {
        unit: 'hosted-search-query',
        logicalAmount: '1',
        billableAmount: '1',
        confidence: 'reported',
      },
    ]);
    const pricing = createAgentPricingSnapshot({
      pricingSnapshotId: 'pricing.missing',
      providerConfigurationId: 'provider.openai.test',
      effectiveAt: '2026-08-01T00:00:00.000Z',
      rates: [],
      sourceDigest: testDigest('pricing-missing-source'),
    });
    expect(() => priceAgentUsage(usage, pricing)).toThrow(/unknown, not zero/u);
  });

  it('atomically reserves and settles token and non-token demand', () => {
    const initial = createAgentBudgetLedger(
      createV1Policy('policy.budget').budgetCeiling
    );
    const reserved = reserveAgentBudget(initial, {
      reservationId: 'reservation.1',
      expectedRevision: 0,
      demand: demand(),
      reservedAt: '2026-08-01T00:00:00.000Z',
    });
    expect(reserved).toMatchObject({ ok: true, state: { revision: 1 } });
    if (!reserved.ok) return;
    expect(
      reserveAgentBudget(reserved.state, {
        reservationId: 'reservation.1',
        expectedRevision: 0,
        demand: demand(),
        reservedAt: '2026-08-01T00:00:00.000Z',
      })
    ).toMatchObject({ ok: true, state: { revision: 1 } });

    const actual = demand('400');
    expect(
      settleAgentBudget(reserved.state, {
        reservationId: 'reservation.1',
        expectedRevision: 0,
        actual,
        settledAt: '2026-08-01T00:01:00.000Z',
      })
    ).toMatchObject({
      ok: false,
      state: { revision: 1 },
      issues: [{ path: '/expectedRevision' }],
    });
    const settled = settleAgentBudget(reserved.state, {
      reservationId: 'reservation.1',
      expectedRevision: 1,
      actual,
      settledAt: '2026-08-01T00:01:00.000Z',
    });
    expect(settled).toMatchObject({
      ok: true,
      state: { revision: 2 },
      reservation: {
        status: 'settled',
        settlement: { requiresReconciliation: false },
      },
    });
    if (settled.ok) {
      expect(selectAgentBudgetUtilization(settled.state)).toEqual(actual);
      expect(
        settleAgentBudget(settled.state, {
          reservationId: 'reservation.1',
          expectedRevision: 1,
          actual,
          settledAt: '2026-08-01T00:01:00.000Z',
        })
      ).toMatchObject({ ok: true, state: { revision: 2 } });
    }
  });

  it('rejects unknown reservation and conservatively charges unknown settlement', () => {
    const initial = createAgentBudgetLedger(
      createV1Policy('policy.unknown-budget').budgetCeiling
    );
    const unknownDemand: AgentBudgetDemand = {
      ...demand(),
      usage: createUnknownAgentUsageVector(['text-token-input']),
    };
    expect(
      reserveAgentBudget(initial, {
        reservationId: 'reservation.unknown',
        expectedRevision: 0,
        demand: unknownDemand,
        reservedAt: '2026-08-01T00:00:00.000Z',
      })
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'AI-6013' }],
    });

    const reserved = reserveAgentBudget(initial, {
      reservationId: 'reservation.reconcile',
      expectedRevision: 0,
      demand: demand(),
      reservedAt: '2026-08-01T00:00:00.000Z',
    });
    if (!reserved.ok) return;
    const reconciled = settleAgentBudget(reserved.state, {
      reservationId: 'reservation.reconcile',
      expectedRevision: 1,
      actual: unknownDemand,
      settledAt: '2026-08-01T00:01:00.000Z',
    });
    expect(reconciled).toMatchObject({
      ok: true,
      reservation: {
        settlement: {
          requiresReconciliation: true,
          charged: demand(),
        },
      },
    });
  });

  it('fails closed when a reservation exceeds any hard ceiling', () => {
    const initial = createAgentBudgetLedger(
      createV1Policy('policy.exhaustion').budgetCeiling
    );
    const exhausted = reserveAgentBudget(initial, {
      reservationId: 'reservation.too-large',
      expectedRevision: 0,
      demand: demand('10001'),
      reservedAt: '2026-08-01T00:00:00.000Z',
    });
    expect(exhausted).toMatchObject({
      ok: false,
      issues: [{ code: 'AI-6002' }],
    });
  });

  it('rejects unbudgeted dimensions and tampered ledger state', () => {
    const initial = createAgentBudgetLedger(
      createV1Policy('policy.unbudgeted').budgetCeiling
    );
    const unbudgeted: AgentBudgetDemand = {
      ...demand(),
      usage: createAgentUsageVector([
        {
          unit: 'hosted-search-query',
          logicalAmount: '1',
          billableAmount: '1',
          confidence: 'measured',
        },
      ]),
    };
    expect(
      reserveAgentBudget(initial, {
        reservationId: 'reservation.unbudgeted',
        expectedRevision: 0,
        demand: unbudgeted,
        reservedAt: '2026-08-01T00:00:00.000Z',
      })
    ).toMatchObject({ ok: false, issues: [{ code: 'AI-6002' }] });

    expect(
      reserveAgentBudget(
        { ...initial, revision: 1 },
        {
          reservationId: 'reservation.tampered',
          expectedRevision: 1,
          demand: demand(),
          reservedAt: '2026-08-01T00:00:00.000Z',
        }
      )
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'AI-9001', path: '/ledgerDigest' }],
    });

    const reserved = reserveAgentBudget(initial, {
      reservationId: 'reservation.deep-tamper',
      expectedRevision: 0,
      demand: demand(),
      reservedAt: '2026-08-01T00:00:00.000Z',
    });
    if (!reserved.ok) return;
    const reservations = reserved.state.reservations.map((entry) => ({
      ...entry,
      demandDigest: testDigest('forged-demand'),
    }));
    const deepTampered = {
      ...reserved.state,
      reservations,
      ledgerDigest: testDigest({
        budget: reserved.state.budget,
        revision: reserved.state.revision,
        reservations,
      }),
    };
    expect(
      reserveAgentBudget(deepTampered, {
        reservationId: 'reservation.after-tamper',
        expectedRevision: 1,
        demand: demand(),
        reservedAt: '2026-08-01T00:00:01.000Z',
      })
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'AI-9001', path: '/ledgerDigest' }],
    });
  });
});
