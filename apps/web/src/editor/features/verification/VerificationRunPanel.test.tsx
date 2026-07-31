import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { VerificationPlan } from '@prodivix/verification';
import { useEditorStore } from '@/editor/store/useEditorStore';
import {
  createPlanFixture,
  createWorkspaceFixture,
} from './__tests__/verificationEvidence.fixture';
import {
  selectVerificationRunCellIds,
  VerificationRunPanel,
} from './VerificationRunPanel';

afterEach(() => {
  act(() => {
    useEditorStore.setState({ verificationRunByWorkspaceId: {} });
  });
});

describe('VerificationRunPanel', () => {
  it('includes transitive dependencies for a requested Scenario cell', () => {
    const base = createPlanFixture();
    const plan = {
      ...base,
      cells: Object.freeze([
        Object.freeze({
          ...base.cells[0]!,
          id: 'cell-a-dependency',
          scenarioId: 'scenario-setup',
          dependencyCellIds: Object.freeze([]),
        }),
        Object.freeze({
          ...base.cells[0]!,
          id: 'cell-b-checkout',
          scenarioId: 'scenario-checkout',
          dependencyCellIds: Object.freeze(['cell-a-dependency']),
        }),
      ]),
    } satisfies VerificationPlan;

    expect(
      selectVerificationRunCellIds(plan, 'cell', 'scenario-checkout')
    ).toEqual({
      surface: 'ci',
      cellIds: ['cell-a-dependency', 'cell-b-checkout'],
    });
    expect(
      selectVerificationRunCellIds(plan, 'cell', 'scenario-missing')
    ).toBeNull();
  });

  it('starts a local revision-bound run and projects it into the shared store', async () => {
    const workspace = createWorkspaceFixture();
    const plan = createPlanFixture();
    render(<VerificationRunPanel workspace={workspace} plan={plan} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.verification.runs.runImpacted',
      })
    );

    await waitFor(() =>
      expect(
        useEditorStore.getState().verificationRunByWorkspaceId[workspace.id]
      ).toMatchObject({
        workspaceId: workspace.id,
        workspaceRevision: plan.targetRevision,
        planDigest: plan.planDigest,
        surface: 'ci',
        scope: 'impacted',
        origin: 'web',
        status: 'running',
        cursor: 1,
        selectedCellIds: ['cell-a'],
      })
    );
    expect(
      screen.getByText('resourceManager.verification.runs.started')
    ).toBeTruthy();
  });
});
