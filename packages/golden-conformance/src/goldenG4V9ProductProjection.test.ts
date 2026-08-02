import { createAgentProductView } from '@prodivix/ai';
import { createWorkspaceAgentProductSupplement } from '@prodivix/workspace-sync';
import { describe, expect, it } from 'vitest';
import { GOLDEN_G4_V6_REPAIRED_SUCCESS_PROOF } from './goldenG4V6VerificationRepairFixture';
import { GOLDEN_G4_V5_TASK } from './goldenG4V5ProposalApprovalFixture';
import {
  GOLDEN_G4_V7_CONTEXT,
  GOLDEN_G4_V7_SUPPLEMENT,
} from './goldenG4V7ProductFixture';
import {
  GOLDEN_G4_V9_TIME,
  createGoldenG4V9TerminalRun,
} from './goldenG4V9ClosureFixture';

describe('G4 V9 terminal product projection', () => {
  it('retains the exact Context binding through terminal success', () => {
    const terminal = createGoldenG4V9TerminalRun(
      GOLDEN_G4_V6_REPAIRED_SUCCESS_PROOF
    );
    expect(terminal.run.run.contextPackDigest).toBe(
      GOLDEN_G4_V7_CONTEXT.manifestDigest
    );
    const supplement = createWorkspaceAgentProductSupplement({
      supplementId: 'supplement.golden.g4-v9.product-regression',
      task: GOLDEN_G4_V5_TASK,
      run: terminal.run,
      context: GOLDEN_G4_V7_CONTEXT,
      runtime: Object.freeze({
        ...GOLDEN_G4_V7_SUPPLEMENT.runtime,
        budgetLedgerDigest: terminal.run.budgetLedger.ledgerDigest,
      }),
      diagnostics: Object.freeze([]),
      producerId: 'service.golden.g4-v9.product-projector',
      projectedAt: GOLDEN_G4_V9_TIME.projected,
    });
    const view = createAgentProductView({
      task: GOLDEN_G4_V5_TASK,
      run: terminal.run,
      events: terminal.events,
      mutations: Object.freeze([]),
      verificationBindings: Object.freeze([]),
      verificationClosures: Object.freeze([]),
      repairRounds: Object.freeze([]),
      supplement,
      commands: Object.freeze([]),
      currentRevision: GOLDEN_G4_V5_TASK.spec.baseRevision,
      actorAuthorized: true,
    });
    expect(view.run).toMatchObject({ phase: 'terminal', outcome: 'succeeded' });
    expect(view.context?.manifestDigest).toBe(
      GOLDEN_G4_V7_CONTEXT.manifestDigest
    );
  });
});
