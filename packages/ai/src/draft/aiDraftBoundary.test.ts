import { describe, expect, it } from 'vitest';
import { AiDraftContextBuilder } from './aiDraftContextBuilder';
import { AiDraftGateway } from './aiDraftGateway';
import { AiDraftToolRegistry } from './aiDraftToolRegistry';
import { createAiDraftRequest } from './createAiDraftRequest';
import { MockAiDraftProvider } from './mockAiDraftProvider';
import { validateAiDraftPlan } from './validateAiDraftPlan';

const plan = {
  goal: 'Explain the requested change',
  assumptions: [],
  milestones: [{ id: 'inspect', title: 'Inspect canonical context' }],
} as const;

describe('AI draft admission boundary', () => {
  it('admits a plan without creating authoring authority', async () => {
    const context = new AiDraftContextBuilder()
      .add({
        id: 'workspace.selection',
        title: 'Selection',
        authority: 'canonical',
        instructionBoundary: 'data-only',
        value: { documentId: 'page.catalog' },
      })
      .build();
    const gateway = new AiDraftGateway({
      provider: new MockAiDraftProvider(plan),
      tools: new AiDraftToolRegistry(),
      createId: () => 'trace.ephemeral',
    });
    await expect(
      gateway.run(
        createAiDraftRequest({
          id: 'draft.plan',
          intent: 'Explain the catalog change',
          context,
        })
      )
    ).resolves.toEqual({
      requestId: 'draft.plan',
      status: 'planned',
      output: plan,
      rawResponse: undefined,
      diagnostics: [],
      traceId: 'trace.ephemeral',
    });
  });

  it.each([
    'workspace.apply',
    'proposal.approval.request',
    'transaction.commit',
    'transaction.rollback',
    'workspace.patch',
    'json/patch',
    'file-write',
  ])('rejects model-callable authoring tool %s', (name) => {
    const registry = new AiDraftToolRegistry();
    expect(() =>
      registry.register({
        name,
        description: 'Forbidden mutation authority',
        effect: 'read',
        execute: () => null,
      })
    ).toThrow(/authoring authority/u);
  });

  it('turns an unknown tool into a fail-closed result', async () => {
    const gateway = new AiDraftGateway({
      provider: new MockAiDraftProvider(plan),
      tools: new AiDraftToolRegistry(),
      createId: () => 'trace.failure',
    });
    const result = await gateway.run({
      id: 'draft.unknown-tool',
      intent: 'Plan',
      context: { entries: [] },
      allowedTools: ['missing.tool'],
    });
    expect(result).toMatchObject({
      status: 'failed',
      diagnostics: [{ code: 'AI-9001', severity: 'error' }],
    });
  });

  it.each(['actions', 'command', 'approval', 'workspaceOperation'])(
    'rejects mutation-shaped output field %s',
    (field) => {
      expect(validateAiDraftPlan({ ...plan, [field]: {} })).toMatchObject({
        diagnostics: [{ code: 'AI-4002' }],
      });
    }
  );

  it('rejects accessor and symbol output without evaluating provider code', () => {
    let getterCalls = 0;
    const outputWithAccessor = { ...plan };
    Object.defineProperty(outputWithAccessor, 'goal', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        throw new Error('must not execute');
      },
    });
    expect(validateAiDraftPlan(outputWithAccessor)).toMatchObject({
      diagnostics: [{ code: 'AI-4002' }],
    });
    expect(
      validateAiDraftPlan({ ...plan, [Symbol('hidden')]: 'not-json' })
    ).toMatchObject({ diagnostics: [{ code: 'AI-4002' }] });
    expect(getterCalls).toBe(0);
  });
});
