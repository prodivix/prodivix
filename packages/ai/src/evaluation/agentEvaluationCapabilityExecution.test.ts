import { describe, expect, it } from 'vitest';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import type { CanonicalDigest } from '../domain/agent.types';
import {
  canonicalAgentEvaluationCapabilityExecutionReceiptOrder,
  createAgentEvaluationCapabilityExecutionReceipt,
  digestAgentEvaluationCapabilityDescriptor,
  digestAgentEvaluationCapabilityExecutionReceiptSet,
  isAgentEvaluationCapabilityExecutionReceipt,
  type AgentEvaluationCapabilityExecutionReceipt,
  type AgentEvaluationCapabilitySpecificReceiptDigest,
  type AgentEvaluationCapabilitySupportExpectation,
  type AgentEvaluationCapabilityToolBinding,
  type CreateAgentEvaluationCapabilityExecutionReceiptInput,
} from './agentEvaluationCapabilityExecution';

const digest = (label: string): CanonicalDigest =>
  digestAgentCanonicalValue(label);

const inputFor = (
  overrides: Partial<CreateAgentEvaluationCapabilityExecutionReceiptInput> = {}
): CreateAgentEvaluationCapabilityExecutionReceiptInput => {
  const supportExpectation: AgentEvaluationCapabilitySupportExpectation =
    overrides.supportExpectation ?? 'required';
  const capabilityId = overrides.capabilityId ?? 'provider.parallel-tool';
  const expectedToolIds = overrides.expectedToolIds ?? [
    'workspace.inspect',
    'workspace.semantic.find',
  ];
  const expectedReceiptKinds = overrides.expectedReceiptKinds ?? [
    'parallel-call-set-receipt',
    'tool-execution-receipt',
  ];
  return {
    capabilityExecutionReceiptId:
      overrides.capabilityExecutionReceiptId ??
      'capability-execution.attempt.1.turn.0',
    planDigest: overrides.planDigest ?? digest('plan'),
    repositoryCommit:
      overrides.repositoryCommit ?? '0123456789abcdef0123456789abcdef01234567',
    attemptId: overrides.attemptId ?? 'attempt.g4-evaluation.1',
    descriptorDigest:
      overrides.descriptorDigest ?? digest('attempt-descriptor'),
    turnIndex: overrides.turnIndex ?? 0,
    invocationId: overrides.invocationId ?? 'invocation.g4-evaluation.1.turn.0',
    caseId: overrides.caseId ?? 'case.parallel-tool.1',
    caseDigest: overrides.caseDigest ?? digest('case'),
    targetId: overrides.targetId ?? 'target.openai.gpt-5',
    targetDigest: overrides.targetDigest ?? digest('target'),
    capabilityProfileId:
      overrides.capabilityProfileId ?? 'g4-parallel-tool-capability',
    capabilityId,
    supportExpectation,
    expectedToolIds,
    expectedReceiptKinds,
    capabilityDescriptorDigest:
      overrides.capabilityDescriptorDigest ??
      digestAgentEvaluationCapabilityDescriptor({
        capabilityId,
        supportExpectation,
        expectedToolIds: [...expectedToolIds].sort(compareUnicodeCodePoints),
        expectedReceiptKinds: [...expectedReceiptKinds].sort(
          compareUnicodeCodePoints
        ),
      }),
    toolBindings: overrides.toolBindings ?? [
      {
        toolId: 'workspace.inspect',
        definitionDigest: digest('workspace.inspect'),
      },
      {
        toolId: 'workspace.semantic.find',
        definitionDigest: digest('workspace.semantic.find'),
      },
    ],
    outcome: overrides.outcome ?? 'supported',
    verdict: overrides.verdict ?? 'passed',
    specificReceiptDigests: overrides.specificReceiptDigests ?? [
      {
        receiptKind: 'parallel-call-set-receipt',
        receiptDigest: digest('parallel-call-set'),
      },
      {
        receiptKind: 'tool-execution-receipt',
        receiptDigest: digest('tool-execution'),
      },
    ],
    attemptAuthorityOwnerReceiptDigests:
      overrides.attemptAuthorityOwnerReceiptDigests ?? [
        digest('attempt-authority-owner'),
      ],
    policyDigest: overrides.policyDigest ?? digest('capability-policy'),
    toolRegistryDigest:
      overrides.toolRegistryDigest ?? digest('frozen-tool-registry'),
    observedAt: overrides.observedAt ?? '2026-08-08T08:00:00.000Z',
  };
};

const withReceiptDigest = (
  receipt: AgentEvaluationCapabilityExecutionReceipt,
  changes: Record<string, unknown>
): unknown => {
  const { receiptDigest: _receiptDigest, ...base } = receipt;
  const changed = { ...base, ...changes };
  return { ...changed, receiptDigest: digestAgentCanonicalValue(changed) };
};

describe('Agent evaluation capability execution receipt', () => {
  it('binds a supported required capability to the exact tool and specific receipt sets', () => {
    const receipt = createAgentEvaluationCapabilityExecutionReceipt(
      inputFor({
        expectedToolIds: ['workspace.semantic.find', 'workspace.inspect'],
        expectedReceiptKinds: [
          'tool-execution-receipt',
          'parallel-call-set-receipt',
        ],
        toolBindings: [
          {
            toolId: 'workspace.semantic.find',
            definitionDigest: digest('workspace.semantic.find'),
          },
          {
            toolId: 'workspace.inspect',
            definitionDigest: digest('workspace.inspect'),
          },
        ],
        specificReceiptDigests: [
          {
            receiptKind: 'tool-execution-receipt',
            receiptDigest: digest('tool-execution'),
          },
          {
            receiptKind: 'parallel-call-set-receipt',
            receiptDigest: digest('parallel-call-set'),
          },
        ],
      })
    );

    expect(receipt.expectedToolIds).toEqual([
      'workspace.inspect',
      'workspace.semantic.find',
    ]);
    expect(receipt.toolBindings.map(({ toolId }) => toolId)).toEqual(
      receipt.expectedToolIds
    );
    expect(
      receipt.specificReceiptDigests.map(({ receiptKind }) => receiptKind)
    ).toEqual(receipt.expectedReceiptKinds);
    expect(receipt.verdict).toBe('passed');
    expect(isAgentEvaluationCapabilityExecutionReceipt(receipt)).toBe(true);
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.expectedToolIds)).toBe(true);
    expect(Object.isFrozen(receipt.toolBindings)).toBe(true);
    expect(Object.isFrozen(receipt.toolBindings[0])).toBe(true);
    expect(Object.isFrozen(receipt.specificReceiptDigests[0])).toBe(true);
  });

  it('passes an explicit expected-blocked unsupported capability with exact denial evidence', () => {
    const expectedReceiptKinds = ['authority-denial-receipt'];
    const receipt = createAgentEvaluationCapabilityExecutionReceipt(
      inputFor({
        capabilityId: 'blocked.external-effect',
        supportExpectation: 'expected-blocked',
        expectedToolIds: [],
        expectedReceiptKinds,
        capabilityDescriptorDigest: digestAgentEvaluationCapabilityDescriptor({
          capabilityId: 'blocked.external-effect',
          supportExpectation: 'expected-blocked',
          expectedToolIds: [],
          expectedReceiptKinds,
        }),
        toolBindings: [],
        outcome: 'unsupported',
        verdict: 'passed',
        specificReceiptDigests: [
          {
            receiptKind: 'authority-denial-receipt',
            receiptDigest: digest('authority-denial'),
          },
        ],
      })
    );

    expect(receipt.supportExpectation).toBe('expected-blocked');
    expect(receipt.outcome).toBe('unsupported');
    expect(receipt.verdict).toBe('passed');
    expect(isAgentEvaluationCapabilityExecutionReceipt(receipt)).toBe(true);
  });

  it('rejects an expected-blocked pass without exact denial or unavailable evidence', () => {
    expect(() =>
      createAgentEvaluationCapabilityExecutionReceipt(
        inputFor({
          capabilityId: 'blocked.missing-denial',
          supportExpectation: 'expected-blocked',
          expectedToolIds: [],
          expectedReceiptKinds: [],
          capabilityDescriptorDigest: digestAgentEvaluationCapabilityDescriptor(
            {
              capabilityId: 'blocked.missing-denial',
              supportExpectation: 'expected-blocked',
              expectedToolIds: [],
              expectedReceiptKinds: [],
            }
          ),
          toolBindings: [],
          outcome: 'unsupported',
          verdict: 'passed',
          specificReceiptDigests: [],
        })
      )
    ).toThrow(/execution receipt is invalid/u);
  });

  it('records required unsupported and execution failure outcomes as failed', () => {
    const unsupported = createAgentEvaluationCapabilityExecutionReceipt(
      inputFor({
        toolBindings: [],
        specificReceiptDigests: [],
        outcome: 'unsupported',
        verdict: 'failed',
      })
    );
    const executionFailure = createAgentEvaluationCapabilityExecutionReceipt(
      inputFor({
        toolBindings: [
          {
            toolId: 'workspace.inspect',
            definitionDigest: digest('workspace.inspect'),
          },
        ],
        specificReceiptDigests: [
          {
            receiptKind: 'tool-execution-receipt',
            receiptDigest: digest('failed-tool-execution'),
          },
        ],
        outcome: 'failed',
        verdict: 'failed',
      })
    );

    expect(unsupported.verdict).toBe('failed');
    expect(executionFailure.verdict).toBe('failed');
    expect(isAgentEvaluationCapabilityExecutionReceipt(unsupported)).toBe(true);
    expect(isAgentEvaluationCapabilityExecutionReceipt(executionFailure)).toBe(
      true
    );
  });

  it('rejects inferred verdict drift and generic success without exact evidence', () => {
    const supported =
      createAgentEvaluationCapabilityExecutionReceipt(inputFor());
    expect(
      isAgentEvaluationCapabilityExecutionReceipt(
        withReceiptDigest(supported, { verdict: 'failed' })
      )
    ).toBe(false);
    expect(
      isAgentEvaluationCapabilityExecutionReceipt(
        withReceiptDigest(supported, {
          specificReceiptDigests: supported.specificReceiptDigests.slice(0, 1),
        })
      )
    ).toBe(false);
    expect(
      isAgentEvaluationCapabilityExecutionReceipt(
        withReceiptDigest(supported, {
          toolBindings: supported.toolBindings.slice(0, 1),
        })
      )
    ).toBe(false);

    const blocked = createAgentEvaluationCapabilityExecutionReceipt(
      inputFor({
        capabilityId: 'blocked.self-approval',
        supportExpectation: 'expected-blocked',
        expectedToolIds: [],
        expectedReceiptKinds: ['authority-denial-receipt'],
        capabilityDescriptorDigest: digestAgentEvaluationCapabilityDescriptor({
          capabilityId: 'blocked.self-approval',
          supportExpectation: 'expected-blocked',
          expectedToolIds: [],
          expectedReceiptKinds: ['authority-denial-receipt'],
        }),
        toolBindings: [],
        outcome: 'unsupported',
        verdict: 'passed',
        specificReceiptDigests: [
          {
            receiptKind: 'authority-denial-receipt',
            receiptDigest: digest('self-approval-denial'),
          },
        ],
      })
    );
    expect(
      isAgentEvaluationCapabilityExecutionReceipt(
        withReceiptDigest(blocked, { specificReceiptDigests: [] })
      )
    ).toBe(false);
    expect(
      isAgentEvaluationCapabilityExecutionReceipt(
        withReceiptDigest(blocked, {
          supportExpectation: 'required',
          capabilityDescriptorDigest: digestAgentEvaluationCapabilityDescriptor(
            {
              capabilityId: blocked.capabilityId,
              supportExpectation: 'required',
              expectedToolIds: blocked.expectedToolIds,
              expectedReceiptKinds: blocked.expectedReceiptKinds,
            }
          ),
        })
      )
    ).toBe(false);
  });

  it('rejects descriptor drift, unexpected identities, duplicates, and invalid digests', () => {
    const receipt = createAgentEvaluationCapabilityExecutionReceipt(inputFor());
    expect(
      isAgentEvaluationCapabilityExecutionReceipt(
        withReceiptDigest(receipt, {
          capabilityDescriptorDigest: digest('different-capability'),
        })
      )
    ).toBe(false);

    const unexpectedBinding: AgentEvaluationCapabilityToolBinding = {
      toolId: 'workspace.write-directly',
      definitionDigest: digest('unexpected'),
    };
    expect(
      isAgentEvaluationCapabilityExecutionReceipt(
        withReceiptDigest(receipt, {
          toolBindings: [...receipt.toolBindings, unexpectedBinding].sort(
            (left, right) => compareUnicodeCodePoints(left.toolId, right.toolId)
          ),
        })
      )
    ).toBe(false);

    const duplicateReceipt: AgentEvaluationCapabilitySpecificReceiptDigest = {
      receiptKind: receipt.specificReceiptDigests[0]!.receiptKind,
      receiptDigest: digest('duplicate'),
    };
    expect(
      isAgentEvaluationCapabilityExecutionReceipt(
        withReceiptDigest(receipt, {
          specificReceiptDigests: [
            receipt.specificReceiptDigests[0],
            duplicateReceipt,
            receipt.specificReceiptDigests[1],
          ],
        })
      )
    ).toBe(false);
    expect(
      isAgentEvaluationCapabilityExecutionReceipt(
        withReceiptDigest(receipt, {
          specificReceiptDigests: [
            ...receipt.specificReceiptDigests,
            {
              receiptKind: 'usage-receipt',
              receiptDigest: digest('third-distinct-specific'),
            },
          ].sort((left, right) =>
            compareUnicodeCodePoints(left.receiptKind, right.receiptKind)
          ),
        })
      )
    ).toBe(false);
    expect(
      isAgentEvaluationCapabilityExecutionReceipt(
        withReceiptDigest(receipt, {
          toolBindings: [
            {
              ...receipt.toolBindings[0],
              definitionDigest: 'sha256-not-a-digest',
            },
            receipt.toolBindings[1],
          ],
        })
      )
    ).toBe(false);
    expect(
      isAgentEvaluationCapabilityExecutionReceipt(
        withReceiptDigest(receipt, {
          attemptAuthorityOwnerReceiptDigests: Array.from(
            { length: 7 },
            (_, index) => digest(`owner.${index}`)
          ).sort(compareUnicodeCodePoints),
        })
      )
    ).toBe(false);
  });

  it('requires canonical order, exact keys, bounded identities, and a digest-bound commit', () => {
    const receipt = createAgentEvaluationCapabilityExecutionReceipt(inputFor());
    expect(
      isAgentEvaluationCapabilityExecutionReceipt(
        withReceiptDigest(receipt, {
          expectedToolIds: [...receipt.expectedToolIds].reverse(),
        })
      )
    ).toBe(false);
    expect(
      isAgentEvaluationCapabilityExecutionReceipt({
        ...receipt,
        tags: ['passed'],
      })
    ).toBe(false);
    expect(
      isAgentEvaluationCapabilityExecutionReceipt(
        withReceiptDigest(receipt, { turnIndex: 65 })
      )
    ).toBe(false);
    expect(
      isAgentEvaluationCapabilityExecutionReceipt(
        withReceiptDigest(receipt, { repositoryCommit: 'main' })
      )
    ).toBe(false);
    expect(
      isAgentEvaluationCapabilityExecutionReceipt(
        withReceiptDigest(receipt, {
          expectedToolIds: Array.from(
            { length: 33 },
            (_, index) => `tool.${String(index).padStart(2, '0')}`
          ),
        })
      )
    ).toBe(false);

    const unsafe = Object.assign(Object.create(null), receipt) as Record<
      string,
      unknown
    >;
    Object.defineProperty(unsafe, '__proto__', {
      value: 'unsafe',
      enumerable: true,
    });
    expect(isAgentEvaluationCapabilityExecutionReceipt(unsafe)).toBe(false);
  });

  it('fails closed at creation for extra fields and mismatched frozen expectations', () => {
    expect(() =>
      createAgentEvaluationCapabilityExecutionReceipt({
        ...inputFor(),
        tags: ['generic-success'],
      } as CreateAgentEvaluationCapabilityExecutionReceiptInput)
    ).toThrow(/input is invalid/u);
    expect(() =>
      createAgentEvaluationCapabilityExecutionReceipt(
        inputFor({
          supportExpectation: 'expected-blocked',
          capabilityDescriptorDigest: digestAgentEvaluationCapabilityDescriptor(
            {
              capabilityId: 'provider.parallel-tool',
              supportExpectation: 'required',
              expectedToolIds: ['workspace.inspect', 'workspace.semantic.find'],
              expectedReceiptKinds: [
                'parallel-call-set-receipt',
                'tool-execution-receipt',
              ],
            }
          ),
          toolBindings: [],
          outcome: 'unsupported',
          verdict: 'passed',
          specificReceiptDigests: [
            {
              receiptKind: 'parallel-call-set-receipt',
              receiptDigest: digest('parallel-call-set'),
            },
            {
              receiptKind: 'tool-execution-receipt',
              receiptDigest: digest('tool-execution'),
            },
          ],
        })
      )
    ).toThrow(/receipt is invalid/u);
  });

  it('commits the canonical attempt, turn, and receipt identity order', () => {
    const laterAttempt = createAgentEvaluationCapabilityExecutionReceipt(
      inputFor({
        attemptId: 'attempt.g4-evaluation.2',
        capabilityExecutionReceiptId: 'capability-execution.attempt.2.turn.0',
        invocationId: 'invocation.g4-evaluation.2.turn.0',
      })
    );
    const laterTurn = createAgentEvaluationCapabilityExecutionReceipt(
      inputFor({
        turnIndex: 1,
        capabilityExecutionReceiptId: 'capability-execution.attempt.1.turn.1',
        invocationId: 'invocation.g4-evaluation.1.turn.1',
      })
    );
    const first = createAgentEvaluationCapabilityExecutionReceipt(inputFor());
    const canonical = canonicalAgentEvaluationCapabilityExecutionReceiptOrder([
      laterAttempt,
      laterTurn,
      first,
    ]);

    expect(canonical).toEqual([first, laterTurn, laterAttempt]);
    expect(digestAgentEvaluationCapabilityExecutionReceiptSet(canonical)).toBe(
      digestAgentCanonicalValue(
        canonical.map(({ receiptDigest }) => receiptDigest)
      )
    );
  });
});
