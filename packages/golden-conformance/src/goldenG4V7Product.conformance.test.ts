import {
  createAgentProductView,
  decodeAgentProductLedgerBundle,
  decodeAgentProductView,
  encodeAgentControlFact,
  encodeAgentProductFact,
  encodeAgentProductView,
  encodeAgentProposalFact,
} from '@prodivix/ai';
import { WORKSPACE_AGENT_ACTION_REGISTRY } from '@prodivix/workspace';
import { describe, expect, it } from 'vitest';
import {
  GOLDEN_G4_V5_PROJECTION,
  GOLDEN_G4_V7_APPROVAL,
  GOLDEN_G4_V7_AUDIT,
  GOLDEN_G4_V7_CURRENT_REVISION,
  GOLDEN_G4_V7_EVENTS,
  GOLDEN_G4_V7_RUN,
  GOLDEN_G4_V7_SUPPLEMENT,
} from './goldenG4V7ProductFixture';
import {
  GOLDEN_G4_V5_PROPOSAL,
  GOLDEN_G4_V5_TASK,
} from './goldenG4V5ProposalApprovalFixture';

const ledger = (approved = false) => ({
  task: GOLDEN_G4_V5_TASK,
  run: GOLDEN_G4_V7_RUN,
  events: GOLDEN_G4_V7_EVENTS,
  proposal: GOLDEN_G4_V5_PROPOSAL,
  planning: GOLDEN_G4_V5_PROJECTION.planning,
  preview: GOLDEN_G4_V5_PROJECTION.preview,
  ...(approved ? { approval: GOLDEN_G4_V7_APPROVAL } : {}),
  mutations: Object.freeze([]),
  verificationBindings: Object.freeze([]),
  verificationClosures: Object.freeze([]),
  repairRounds: Object.freeze([]),
  supplement: GOLDEN_G4_V7_SUPPLEMENT,
  commands: Object.freeze([]),
  audit: GOLDEN_G4_V7_AUDIT,
  currentRevision: GOLDEN_G4_V7_CURRENT_REVISION,
  actorAuthorized: true,
});

const bundle = (approved = false) => ({
  ledger: {
    task: encodeAgentControlFact({
      factType: 'task-record',
      value: GOLDEN_G4_V5_TASK,
    }),
    run: encodeAgentControlFact({
      factType: 'run-snapshot',
      value: GOLDEN_G4_V7_RUN,
    }),
    events: GOLDEN_G4_V7_EVENTS.map((value) =>
      encodeAgentControlFact({ factType: 'run-event', value })
    ),
    proposal: encodeAgentProposalFact(WORKSPACE_AGENT_ACTION_REGISTRY, {
      factType: 'proposal',
      value: GOLDEN_G4_V5_PROPOSAL,
    }),
    planning: encodeAgentProposalFact(WORKSPACE_AGENT_ACTION_REGISTRY, {
      factType: 'planning',
      value: GOLDEN_G4_V5_PROJECTION.planning,
    }),
    preview: encodeAgentProposalFact(WORKSPACE_AGENT_ACTION_REGISTRY, {
      factType: 'preview',
      value: GOLDEN_G4_V5_PROJECTION.preview,
    }),
    ...(approved
      ? {
          approval: encodeAgentProposalFact(WORKSPACE_AGENT_ACTION_REGISTRY, {
            factType: 'approval',
            value: GOLDEN_G4_V7_APPROVAL,
          }),
        }
      : {}),
    mutations: [],
    verificationBindings: [],
    verificationClosures: [],
    repairRounds: [],
    supplement: encodeAgentProductFact({
      factType: 'product-supplement',
      value: GOLDEN_G4_V7_SUPPLEMENT,
    }),
    commands: [],
    audit: encodeAgentControlFact({
      factType: 'audit-export',
      value: GOLDEN_G4_V7_AUDIT,
    }),
    currentRevision: GOLDEN_G4_V7_CURRENT_REVISION,
    actorAuthorized: true,
  },
});

describe('G4 V7 authenticated Catalog product loop Golden', () => {
  it('exposes exact Context, proposal review, runtime, cost, timeline, and human actions', () => {
    const view = createAgentProductView(ledger());
    expect(view.run.phase).toBe('awaiting-approval');
    expect(view.availableActions).toEqual([
      'approve',
      'reject',
      'cancel',
      'export-audit',
    ]);
    expect(view.context?.items[0]).not.toHaveProperty('content');
    expect(view.context?.omitted).toContainEqual(
      expect.objectContaining({ reason: 'secret', diagnosticCode: 'AI-7003' })
    );
    expect(view.proposalReview).toMatchObject({
      semanticDiffDigest: GOLDEN_G4_V5_PROJECTION.planning.semanticDiffDigest,
      impactDigest: GOLDEN_G4_V5_PROJECTION.planning.impactDigest,
      verificationPlanDigest:
        GOLDEN_G4_V5_PROJECTION.planning.verificationPlanDigest,
      rollback: { authorization: 'on-unsatisfied-closure' },
    });
    expect(view.runtime).toMatchObject({
      models: [{ modelId: 'model.golden.g4-v7' }],
      tools: [{ toolId: 'tool.golden.g4-v7.workspace-read' }],
      costs: [{ currency: 'USD', amount: '0.04' }],
    });
    expect(view.timeline).toHaveLength(GOLDEN_G4_V7_RUN.cursor);
    expect(view.audit?.chainHeadDigest).toBe(view.identity.latestEventDigest);
  });

  it('gives Web and CLI the same strict projection across refresh', () => {
    const first = decodeAgentProductLedgerBundle(
      WORKSPACE_AGENT_ACTION_REGISTRY,
      bundle()
    );
    const second = decodeAgentProductLedgerBundle(
      WORKSPACE_AGENT_ACTION_REGISTRY,
      structuredClone(bundle())
    );
    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    if (!first.ok) return;
    expect(decodeAgentProductView(encodeAgentProductView(first.value))).toEqual(
      {
        ok: true,
        value: first.value,
      }
    );
  });

  it('removes approval actions only after an exact independent human decision', () => {
    const decoded = decodeAgentProductLedgerBundle(
      WORKSPACE_AGENT_ACTION_REGISTRY,
      bundle(true)
    );
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.approval?.decision).toBe('approved');
    expect(decoded.value.availableActions).not.toContain('approve');
    expect(decoded.value.availableActions).not.toContain('reject');
    expect(decoded.value.preview?.previewDigest).toBe(
      GOLDEN_G4_V7_APPROVAL.previewDigest
    );
  });

  it('rejects hidden authority and cross-surface projection drift', () => {
    expect(
      decodeAgentProductLedgerBundle(WORKSPACE_AGENT_ACTION_REGISTRY, {
        ledger: { ...bundle().ledger, skipApproval: true },
      })
    ).toMatchObject({ ok: false });
    const view = createAgentProductView(ledger());
    const tampered = structuredClone(
      encodeAgentProductView(view)
    ) as unknown as {
      value: { availableActions: string[] };
    };
    tampered.value.availableActions = ['cancel'];
    expect(decodeAgentProductView(tampered)).toMatchObject({ ok: false });
  });
});
