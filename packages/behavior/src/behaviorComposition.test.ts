import { describe, expect, it } from 'vitest';
import {
  createBehaviorRuntimeCapabilityRegistry,
  executeBehaviorScenarioProgram,
  readBehaviorJsonValue,
  type BehaviorRuntimeCapabilityAdapter,
  type BehaviorScenarioProgram,
} from './index';

const DIGEST = `sha256-${'a'.repeat(64)}`;

const program = (expected: string = 'ready'): BehaviorScenarioProgram => {
  const instructions: BehaviorScenarioProgram['instructions'] = Object.freeze([
    Object.freeze({
      id: 'instruction:000000:entry',
      stepId: 'entry',
      dependencyInstructionIds: Object.freeze([]),
      operation: 'trigger:scenario.manual',
      capabilityId: 'scenario.manual',
    }),
    Object.freeze({
      id: 'instruction:000001:alpha',
      stepId: 'alpha',
      dependencyInstructionIds: Object.freeze(['instruction:000000:entry']),
      operation: 'fixture-alpha',
      capabilityId: 'fixture.alpha',
      targetId: 'target',
    }),
    Object.freeze({
      id: 'instruction:000002:beta',
      stepId: 'beta',
      dependencyInstructionIds: Object.freeze(['instruction:000000:entry']),
      operation: 'fixture-beta',
      capabilityId: 'fixture.beta',
      targetId: 'target',
    }),
    Object.freeze({
      id: 'instruction:000003:join',
      stepId: 'join',
      dependencyInstructionIds: Object.freeze([
        'instruction:000001:alpha',
        'instruction:000002:beta',
      ]),
      operation: 'barrier',
    }),
    Object.freeze({
      id: 'instruction:000004:observe',
      stepId: 'observe',
      dependencyInstructionIds: Object.freeze(['instruction:000003:join']),
      operation: 'observe:fixture.observe',
      capabilityId: 'fixture.observe',
      targetId: 'target',
    }),
  ]);
  const source = Object.freeze({
    workspaceDocumentId: 'scenario',
    path: '/',
  });
  const withoutDigest = {
    scenarioId: 'scenario',
    scenarioDigest: DIGEST,
    workspaceRevision: 4,
    semanticSnapshotDigest: DIGEST,
    executableSnapshotDigest: DIGEST,
    compilerDigest: DIGEST,
    registryDigest: DIGEST,
    controlProfileDigest: DIGEST,
    fixtureSetDigests: Object.freeze([]),
    baselineSetDigests: Object.freeze([]),
    requiredCapabilities: Object.freeze([
      'fixture.alpha',
      'fixture.beta',
      'fixture.observe',
      'scenario.manual',
    ]),
    capabilityManifest: Object.freeze([
      Object.freeze({
        capabilityId: 'fixture.alpha',
        descriptorKind: 'fixture.alpha',
        targetCapability: 'fixture:alpha',
        owner: 'fixture',
        runtimeZones: Object.freeze(['test'] as const),
        effect: 'write' as const,
        cancellation: 'cooperative' as const,
      }),
      Object.freeze({
        capabilityId: 'fixture.beta',
        descriptorKind: 'fixture.beta',
        targetCapability: 'fixture:beta',
        owner: 'fixture',
        runtimeZones: Object.freeze(['test'] as const),
        effect: 'write' as const,
        cancellation: 'cooperative' as const,
      }),
      Object.freeze({
        capabilityId: 'fixture.observe',
        descriptorKind: 'fixture.observe',
        targetCapability: 'fixture:observe',
        owner: 'fixture',
        runtimeZones: Object.freeze(['test'] as const),
        effect: 'read' as const,
        cancellation: 'none' as const,
      }),
      Object.freeze({
        capabilityId: 'scenario.manual',
        descriptorKind: 'scenario.manual',
        targetCapability: 'behavior:scenario:manual',
        owner: 'behavior',
        runtimeZones: Object.freeze(['client', 'test'] as const),
        effect: 'none' as const,
        cancellation: 'none' as const,
      }),
    ]),
    targetManifest: Object.freeze([
      Object.freeze({
        targetId: 'target',
        semanticSymbolId: 'symbol:target',
        capability: 'fixture:alpha',
        source,
      }),
      Object.freeze({
        targetId: 'target',
        semanticSymbolId: 'symbol:target',
        capability: 'fixture:beta',
        source,
      }),
      Object.freeze({
        targetId: 'target',
        semanticSymbolId: 'symbol:target',
        capability: 'fixture:observe',
        source,
      }),
    ]),
    instructions,
    observations: Object.freeze([
      Object.freeze({
        stepId: 'observe',
        kind: 'value' as const,
        targetId: 'target',
        expected,
        assertionIds: Object.freeze(['observe-value']),
        assertions: Object.freeze([
          Object.freeze({
            id: 'observe-value',
            operator: 'equals' as const,
            expected,
          }),
        ]),
        automatonDigest: DIGEST,
      }),
    ]),
    sourceTrace: Object.freeze(
      instructions.map(({ id }) => Object.freeze({ instructionId: id, source }))
    ),
    budgets: Object.freeze({
      totalMs: 10_000,
      stepMs: 1_000,
      settleMs: 100,
    }),
  };
  return Object.freeze({ ...withoutDigest, programDigest: DIGEST });
};

const adapters = (
  observed = 'ready'
): readonly BehaviorRuntimeCapabilityAdapter[] =>
  Object.freeze([
    Object.freeze({
      capabilityId: 'fixture.alpha',
      owner: 'fixture',
      invoke: async () =>
        Object.freeze({ status: 'succeeded' as const, output: 'alpha' }),
    }),
    Object.freeze({
      capabilityId: 'fixture.beta',
      owner: 'fixture',
      invoke: async () =>
        Object.freeze({ status: 'succeeded' as const, output: 'beta' }),
    }),
    Object.freeze({
      capabilityId: 'fixture.observe',
      owner: 'fixture',
      invoke: () =>
        Object.freeze({
          status: 'succeeded' as const,
          output: observed,
        }),
    }),
  ]);

describe('Behavior cross-domain runtime composition', () => {
  it('executes parallel dependency waves with deterministic semantic trace', async () => {
    const registry = createBehaviorRuntimeCapabilityRegistry(adapters());
    expect(registry.ok).toBe(true);
    if (!registry.ok) return;
    const first = await executeBehaviorScenarioProgram({
      program: program(),
      attemptId: 'attempt-1',
      runtimeZone: 'test',
      registry: registry.registry,
    });
    const second = await executeBehaviorScenarioProgram({
      program: program(),
      attemptId: 'attempt-1',
      runtimeZone: 'test',
      registry: registry.registry,
    });
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: 'completed',
      outputsByStepId: {
        alpha: 'alpha',
        beta: 'beta',
        observe: 'ready',
      },
    });
    expect(first.trace.map(({ kind, stepId }) => `${kind}:${stepId}`)).toEqual([
      'instruction-started:entry',
      'instruction-completed:entry',
      'instruction-started:alpha',
      'instruction-started:beta',
      'instruction-completed:alpha',
      'instruction-completed:beta',
      'instruction-started:join',
      'instruction-completed:join',
      'instruction-started:observe',
      'instruction-completed:observe',
    ]);
    expect(
      first.trace.every(({ source }) => source === first.trace[0]!.source)
    ).toBe(true);
  });

  it('binds shared semantic identities to the instruction target capability', async () => {
    const seen: string[] = [];
    const registry = createBehaviorRuntimeCapabilityRegistry(
      adapters().map((adapter) =>
        Object.freeze({
          ...adapter,
          invoke: async (
            invocation: Parameters<
              BehaviorRuntimeCapabilityAdapter['invoke']
            >[0]
          ) => {
            seen.push(
              `${invocation.capabilityId}:${invocation.target?.capability ?? 'missing'}`
            );
            return adapter.invoke(invocation);
          },
        })
      )
    );
    expect(registry.ok).toBe(true);
    if (!registry.ok) return;
    await expect(
      executeBehaviorScenarioProgram({
        program: program(),
        attemptId: 'attempt-target-capability',
        runtimeZone: 'test',
        registry: registry.registry,
      })
    ).resolves.toMatchObject({ status: 'completed' });
    expect(seen).toEqual([
      'fixture.alpha:fixture:alpha',
      'fixture.beta:fixture:beta',
      'fixture.observe:fixture:observe',
    ]);
  });

  it('fails closed for a missing adapter, owner mismatch, and assertion drift', async () => {
    const missing = createBehaviorRuntimeCapabilityRegistry(
      adapters().filter(({ capabilityId }) => capabilityId !== 'fixture.beta')
    );
    expect(missing.ok).toBe(true);
    if (!missing.ok) return;
    await expect(
      executeBehaviorScenarioProgram({
        program: program(),
        attemptId: 'attempt-missing',
        runtimeZone: 'test',
        registry: missing.registry,
      })
    ).resolves.toMatchObject({
      status: 'blocked',
      issue: {
        code: 'missing-capability',
        capabilityId: 'fixture.beta',
      },
    });

    const wrongOwner = createBehaviorRuntimeCapabilityRegistry(
      adapters().map((adapter) =>
        adapter.capabilityId === 'fixture.alpha'
          ? { ...adapter, owner: 'other-owner' }
          : adapter
      )
    );
    expect(wrongOwner.ok).toBe(true);
    if (!wrongOwner.ok) return;
    await expect(
      executeBehaviorScenarioProgram({
        program: program(),
        attemptId: 'attempt-owner',
        runtimeZone: 'test',
        registry: wrongOwner.registry,
      })
    ).resolves.toMatchObject({
      status: 'blocked',
      issue: {
        code: 'capability-owner-mismatch',
        capabilityId: 'fixture.alpha',
      },
    });

    const drifted = createBehaviorRuntimeCapabilityRegistry(adapters('stale'));
    expect(drifted.ok).toBe(true);
    if (!drifted.ok) return;
    await expect(
      executeBehaviorScenarioProgram({
        program: program(),
        attemptId: 'attempt-assertion',
        runtimeZone: 'test',
        registry: drifted.registry,
      })
    ).resolves.toMatchObject({
      status: 'failed',
      issue: { code: 'assertion-failed', stepId: 'observe' },
    });

    const throwing = createBehaviorRuntimeCapabilityRegistry(
      adapters().map((adapter) =>
        adapter.capabilityId === 'fixture.alpha'
          ? {
              ...adapter,
              invoke: () => {
                throw new Error('Bearer never-expose-provider-error');
              },
            }
          : adapter
      )
    );
    expect(throwing.ok).toBe(true);
    if (!throwing.ok) return;
    const thrown = await executeBehaviorScenarioProgram({
      program: program(),
      attemptId: 'attempt-throw',
      runtimeZone: 'test',
      registry: throwing.registry,
    });
    expect(thrown).toMatchObject({
      status: 'failed',
      issue: {
        code: 'capability-failed',
        message:
          'Behavior capability invocation failed before producing a safe result.',
      },
    });
    expect(JSON.stringify(thrown)).not.toContain('never-expose-provider-error');
  });

  it('rejects unsafe, non-finite, and oversized runtime values', () => {
    expect(readBehaviorJsonValue(Number.NaN)).toBeUndefined();
    expect(
      readBehaviorJsonValue({ __proto__: { polluted: true } })
    ).toBeUndefined();
    expect(
      readBehaviorJsonValue('toolong', { maximumStringLength: 3 })
    ).toBeUndefined();
    expect(
      readBehaviorJsonValue(['1234', '5678'], { maximumUtf8Bytes: 10 })
    ).toBeUndefined();
    expect(
      readBehaviorJsonValue(
        Object.defineProperty({}, 'secret', {
          enumerable: true,
          get: () => 'unsafe-accessor',
        })
      )
    ).toBeUndefined();
    expect(readBehaviorJsonValue(new Array(100))).toBeUndefined();
    expect(readBehaviorJsonValue({ z: 1, A: [true, null] })).toEqual({
      A: [true, null],
      z: 1,
    });
  });
});
