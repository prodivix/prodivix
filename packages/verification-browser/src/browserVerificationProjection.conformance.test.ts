import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import type { VerificationPlanCell } from '@prodivix/verification';
import { describe, expect, it, vi } from 'vitest';
import type {
  BrowserVerificationCellInput,
  BrowserVerificationCellPolicy,
} from './browserAdapter.types';
import type { BrowserToolSession } from './browserVerificationPort';
import { projectBrowserVerificationAttempt } from './browserVerificationProjection';

const sha = (character: string): string => `sha256-${character.repeat(64)}`;

describe('browser verification projection preflight', () => {
  it('rejects a test Fixture-carrying security attempt before executing its Scenario', async () => {
    const program = {
      scenarioId: 'scenario.production-security',
      programDigest: sha('1'),
      executableSnapshotDigest: sha('2'),
      controlProfileDigest: sha('3'),
      fixtureSetDigests: Object.freeze([sha('4')]),
    } as BehaviorScenarioProgram;
    const cell = {
      id: 'cell.production-security',
      checkKind: 'security',
      scenarioId: program.scenarioId,
    } as VerificationPlanCell;
    const profile = {
      cellId: cell.id,
      checkKind: 'security',
      scenarioId: program.scenarioId,
      fixtureSetDigests: program.fixtureSetDigests,
      profile: { kind: 'security' },
    } as unknown as BrowserVerificationCellInput;
    const policy = {
      kind: 'security',
      program,
    } as unknown as BrowserVerificationCellPolicy;
    const executeBehavior = vi.fn(async () => {
      throw new Error('Fixture-carrying security Scenario must not execute.');
    });
    const session = {
      executeBehavior,
    } as unknown as BrowserToolSession;

    await expect(
      projectBrowserVerificationAttempt({
        cell,
        profile,
        policy,
        session,
      })
    ).rejects.toThrow(/cannot carry test Fixture Sets/u);
    expect(executeBehavior).not.toHaveBeenCalled();
  });
});
