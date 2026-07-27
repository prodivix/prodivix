import { describe, expect, it } from 'vitest';
import {
  BEHAVIOR_CORE_REGISTRY_CONTRIBUTION,
  BEHAVIOR_EMPTY_SCHEMA_DIGEST,
  adoptBehaviorRecorderDraft,
  compileBehaviorScenario,
  createBehaviorRecorderDraft,
  createBehaviorRegistry,
  resolveBehaviorSemanticTarget,
  type BehaviorRegistryContribution,
  type BehaviorScenario,
  type BehaviorSemanticIndexView,
  type BehaviorSemanticSymbolView,
  type BehaviorSemanticTargetRef,
  type BehaviorStep,
} from './index';

const DIGEST = `sha256-${'1'.repeat(64)}`;
const BUTTON_TARGET: BehaviorSemanticTargetRef = Object.freeze({
  kind: 'semantic-symbol',
  id: 'symbol:add-button',
  workspaceDocumentId: 'catalog-page',
  capability: 'behavior:pir:click',
});
const RESULT_TARGET: BehaviorSemanticTargetRef = Object.freeze({
  kind: 'semantic-symbol',
  id: 'symbol:result',
  workspaceDocumentId: 'catalog-page',
  capability: 'behavior:pir:visible',
});
const ROUTE_TARGET: BehaviorSemanticTargetRef = Object.freeze({
  kind: 'semantic-symbol',
  id: 'symbol:catalog-route',
  workspaceDocumentId: 'workspace',
  capability: 'behavior:route:lifecycle',
});

const index = (
  workspaceRev = 7,
  symbols: readonly BehaviorSemanticSymbolView[] = [
    {
      id: 'symbol:add-button',
      name: 'add-button',
      qualifiedName: 'catalog-page#add-button',
      capabilityIds: ['behavior:pir:click'],
      ownerRef: {
        kind: 'pir-node' as const,
        documentId: 'catalog-page',
        nodeId: 'add-button',
      },
    },
    {
      id: 'symbol:result',
      name: 'result',
      qualifiedName: 'catalog-page#result',
      capabilityIds: ['behavior:pir:visible'],
      ownerRef: {
        kind: 'pir-node' as const,
        documentId: 'catalog-page',
        nodeId: 'result',
      },
    },
    {
      id: 'symbol:catalog-route',
      name: 'catalog-route',
      qualifiedName: 'workspace#catalog-route',
      capabilityIds: ['behavior:route:lifecycle'],
      ownerRef: {
        kind: 'route' as const,
        routeId: 'catalog-route',
      },
    },
  ]
): BehaviorSemanticIndexView => ({
  snapshotIdentity: {
    providerSetDigest: DIGEST,
    schemaVersion: 'prodivix-semantic-v4',
    workspaceRevisions: {
      workspaceId: 'workspace',
      workspaceRev,
    },
  },
  getSymbol(id) {
    return symbols.find((symbol) => symbol.id === id) ?? null;
  },
  getSymbols() {
    return symbols;
  },
});

const descriptor = (
  kind: string,
  targetCapability: string,
  effect: 'none' | 'read' | 'write'
) => ({
  kind,
  owner: 'fixture',
  inputSchemaDigest: BEHAVIOR_EMPTY_SCHEMA_DIGEST,
  outputSchemaDigest: BEHAVIOR_EMPTY_SCHEMA_DIGEST,
  targetCapability,
  runtimeZones: ['client', 'test'] as const,
  effect,
  cancellation: 'none' as const,
  determinism: 'controlled' as const,
  sourceTraceResolverId: 'fixture.source',
  redactionPolicyId: 'fixture.redaction',
});

const contribution: BehaviorRegistryContribution = {
  contributorId: 'fixture.pir',
  triggers: [descriptor('route.entered', 'behavior:route:lifecycle', 'read')],
  actions: [descriptor('pir.click', 'behavior:pir:click', 'none')],
  observations: [descriptor('pir.visible', 'behavior:pir:visible', 'read')],
};

const scenario = Object.freeze({
  id: 'catalog-journey',
  name: 'Catalog journey',
  criticality: 'smoke',
  tags: Object.freeze(['catalog']),
  entry: Object.freeze({
    id: 'entry',
    domain: 'scenario',
    event: 'manual',
  }),
  steps: Object.freeze([
    Object.freeze({
      id: 'click-add',
      kind: 'action',
      failureMode: 'stop',
      source: {
        workspaceDocumentId: 'catalog-page',
        path: '/nodesById/old-button-location',
      },
      action: {
        kind: 'semantic-click' as const,
        target: BUTTON_TARGET,
        capabilityId: 'pir.click',
        runtimeZone: 'client' as const,
        effect: 'none' as const,
        cancellation: 'none' as const,
      },
    }),
    Object.freeze({
      id: 'see-result',
      kind: 'observation',
      failureMode: 'stop',
      observation: {
        kind: 'visible' as const,
        target: RESULT_TARGET,
        expected: true,
      },
      assertions: Object.freeze([
        Object.freeze({
          id: 'result-visible',
          operator: 'equals' as const,
          expected: true,
        }),
      ]),
    }),
  ]),
  fixtureRefs: Object.freeze([]),
  controlProfileRef: Object.freeze({
    kind: 'preset',
    presetId: 'deterministic-default',
    digest: DIGEST,
  }),
  baselineRefs: Object.freeze([]),
  timeoutPolicy: Object.freeze({
    totalMs: 10_000,
    stepMs: 2_000,
    settleMs: 500,
  }),
}) satisfies BehaviorScenario;

describe('Behavior Scenario semantic authoring', () => {
  it('reports exact, relocated, missing, incompatible, and ambiguous targets', () => {
    expect(
      resolveBehaviorSemanticTarget({
        target: BUTTON_TARGET,
        index: index(),
      }).status
    ).toBe('exact');
    expect(
      resolveBehaviorSemanticTarget({
        target: BUTTON_TARGET,
        index: index(),
        authoredSource: {
          workspaceDocumentId: 'catalog-page',
          path: '/nodesById/old-button-location',
        },
      }).status
    ).toBe('relocated');
    expect(
      resolveBehaviorSemanticTarget({
        target: { ...BUTTON_TARGET, id: 'symbol:missing' },
        index: index(),
      }).status
    ).toBe('missing');
    expect(
      resolveBehaviorSemanticTarget({
        target: { ...BUTTON_TARGET, workspaceDocumentId: 'other-workspace' },
        index: index(),
      }).status
    ).toBe('missing');
    expect(
      resolveBehaviorSemanticTarget({
        target: { ...BUTTON_TARGET, capability: 'behavior:pir:input' },
        index: index(),
      }).status
    ).toBe('incompatible');
    expect(
      resolveBehaviorSemanticTarget({
        target: {
          ...BUTTON_TARGET,
          kind: 'public-contract',
          id: 'add-button',
        },
        index: index(7, [
          ...index().getSymbols(),
          {
            ...index().getSymbols()[0]!,
            id: 'symbol:add-button-copy',
          },
        ]),
      }).status
    ).toBe('ambiguous');
  });

  it('compiles byte-stable Programs with manifests and complete SourceTrace', () => {
    const registryResult = createBehaviorRegistry([
      contribution,
      BEHAVIOR_CORE_REGISTRY_CONTRIBUTION,
    ]);
    expect(registryResult.ok).toBe(true);
    if (!registryResult.ok) return;
    const compile = () =>
      compileBehaviorScenario({
        scenario,
        scenarioDocumentId: scenario.id,
        workspaceRevision: 7,
        semanticIndex: index(),
        executableSnapshotDigest: DIGEST,
        compilerDigest: DIGEST,
        registry: registryResult.registry,
      });
    const first = compile();
    const second = compile();
    expect(first.status).toBe('ready');
    expect(second.status).toBe('ready');
    if (first.status !== 'ready' || second.status !== 'ready') return;
    expect(first.program).toEqual(second.program);
    expect(first.program.programDigest).toMatch(/^sha256-[a-f0-9]{64}$/);
    expect(first.program.sourceTrace).toHaveLength(
      first.program.instructions.length
    );
    expect(
      first.program.capabilityManifest.map(({ capabilityId }) => capabilityId)
    ).toEqual(['pir.click', 'pir.visible', 'scenario.manual']);
    expect(first.program.targetManifest).toHaveLength(2);
    expect(first.relocations).toEqual([
      {
        stepId: 'click-add',
        source: {
          workspaceDocumentId: 'catalog-page',
          path: '/nodesById/add-button',
        },
      },
    ]);
  });

  it('resolves domain trigger targets into the Program and rejects a missing target', () => {
    const registryResult = createBehaviorRegistry([
      contribution,
      BEHAVIOR_CORE_REGISTRY_CONTRIBUTION,
    ]);
    expect(registryResult.ok).toBe(true);
    if (!registryResult.ok) return;
    const routeScenario: BehaviorScenario = {
      ...scenario,
      entry: {
        id: 'route-entry',
        domain: 'route',
        event: 'entered',
        target: ROUTE_TARGET,
      },
    };
    const compile = (authoredScenario: BehaviorScenario) =>
      compileBehaviorScenario({
        scenario: authoredScenario,
        scenarioDocumentId: authoredScenario.id,
        workspaceRevision: 7,
        semanticIndex: index(),
        executableSnapshotDigest: DIGEST,
        compilerDigest: DIGEST,
        registry: registryResult.registry,
      });
    const compiled = compile(routeScenario);
    expect(compiled.status).toBe('ready');
    if (compiled.status !== 'ready') return;
    expect(compiled.program.instructions[0]).toMatchObject({
      operation: 'trigger:route.entered',
      targetId: ROUTE_TARGET.id,
    });
    expect(compiled.program.targetManifest).toContainEqual(
      expect.objectContaining({
        semanticSymbolId: ROUTE_TARGET.id,
        capability: ROUTE_TARGET.capability,
      })
    );
    expect(compiled.program.sourceTrace[0]).toEqual({
      instructionId: 'instruction:000000:route-entry',
      source: {
        workspaceDocumentId: 'workspace',
        path: '/routes/catalog-route',
      },
    });
    expect(
      compile({
        ...routeScenario,
        entry: {
          id: 'route-entry',
          domain: 'route',
          event: 'entered',
        },
      })
    ).toMatchObject({
      status: 'blocked',
      issues: [
        expect.objectContaining({
          code: 'target-missing',
          path: '/entry/target',
        }),
      ],
    });
  });

  it('fails closed on revision or capability drift', () => {
    const registryResult = createBehaviorRegistry([
      BEHAVIOR_CORE_REGISTRY_CONTRIBUTION,
      contribution,
    ]);
    expect(registryResult.ok).toBe(true);
    if (!registryResult.ok) return;
    expect(
      compileBehaviorScenario({
        scenario,
        scenarioDocumentId: scenario.id,
        workspaceRevision: 8,
        semanticIndex: index(7),
        executableSnapshotDigest: DIGEST,
        compilerDigest: DIGEST,
        registry: registryResult.registry,
      })
    ).toMatchObject({
      status: 'blocked',
      issues: [expect.objectContaining({ code: 'invalid-revision' })],
    });
    const withoutClick = index(7, [
      {
        ...index().getSymbols()[0]!,
        capabilityIds: ['behavior:pir:visible'],
      },
      index().getSymbols()[1]!,
    ]);
    expect(
      compileBehaviorScenario({
        scenario,
        scenarioDocumentId: scenario.id,
        workspaceRevision: 7,
        semanticIndex: withoutClick,
        executableSnapshotDigest: DIGEST,
        compilerDigest: DIGEST,
        registry: registryResult.registry,
      })
    ).toMatchObject({
      status: 'blocked',
      issues: [expect.objectContaining({ code: 'target-incompatible' })],
    });
  });

  it('lowers parallel branches and explicit barriers into a stable instruction DAG', () => {
    const registryResult = createBehaviorRegistry([
      BEHAVIOR_CORE_REGISTRY_CONTRIBUTION,
      contribution,
    ]);
    expect(registryResult.ok).toBe(true);
    if (!registryResult.ok) return;
    const parallel: BehaviorStep = {
      id: 'parallel-step',
      kind: 'parallel',
      failureMode: 'stop',
      steps: [
        scenario.steps[0]!,
        {
          ...scenario.steps[0]!,
          id: 'click-add-copy',
        },
      ],
    };
    const barrier: BehaviorStep = {
      id: 'barrier-step',
      kind: 'barrier',
      failureMode: 'stop',
      participantStepIds: ['click-add', 'click-add-copy'],
    };
    const compiled = compileBehaviorScenario({
      scenario: { ...scenario, steps: [parallel, barrier] },
      scenarioDocumentId: scenario.id,
      workspaceRevision: 7,
      semanticIndex: index(),
      executableSnapshotDigest: DIGEST,
      compilerDigest: DIGEST,
      registry: registryResult.registry,
    });
    expect(compiled.status).toBe('ready');
    if (compiled.status !== 'ready') return;
    const [entry, left, right, joined] = compiled.program.instructions;
    expect(left?.dependencyInstructionIds).toEqual([entry?.id]);
    expect(right?.dependencyInstructionIds).toEqual([entry?.id]);
    expect(joined).toMatchObject({
      stepId: 'barrier-step',
      operation: 'barrier',
      dependencyInstructionIds: [left?.id, right?.id],
    });
    expect(compiled.program.sourceTrace).toHaveLength(4);
  });

  it('fails closed when a barrier references an unavailable prior step', () => {
    const registryResult = createBehaviorRegistry([
      BEHAVIOR_CORE_REGISTRY_CONTRIBUTION,
      contribution,
    ]);
    expect(registryResult.ok).toBe(true);
    if (!registryResult.ok) return;
    const invalidSteps: readonly BehaviorStep[] = [
      {
        id: 'barrier-step',
        kind: 'barrier',
        failureMode: 'stop',
        participantStepIds: ['future-step'],
      },
    ];
    invalidSteps.forEach((step) => {
      expect(
        compileBehaviorScenario({
          scenario: { ...scenario, steps: [step] },
          scenarioDocumentId: scenario.id,
          workspaceRevision: 7,
          semanticIndex: index(),
          executableSnapshotDigest: DIGEST,
          compilerDigest: DIGEST,
          registry: registryResult.registry,
        })
      ).toMatchObject({
        status: 'blocked',
        issues: [
          expect.objectContaining({
            code: 'invalid-control-flow',
            stepId: step.id,
          }),
        ],
      });
    });
  });

  it('bounds, coalesces, and redacts recorder events before review', () => {
    const draft = createBehaviorRecorderDraft({
      id: 'draft',
      workspaceRevision: 7,
      maximumEvents: 4,
      events: [
        {
          id: 'input-1',
          kind: 'input',
          value: 'a',
          targetCandidates: [
            { ...BUTTON_TARGET, capability: 'behavior:pir:input' },
          ],
        },
        {
          id: 'input-2',
          kind: 'input',
          value: 'ab',
          targetCandidates: [
            { ...BUTTON_TARGET, capability: 'behavior:pir:input' },
          ],
        },
        {
          id: 'password',
          kind: 'input',
          fieldName: 'password',
          value: 'never-store-me',
          targetCandidates: [BUTTON_TARGET],
        },
        {
          id: 'secret-canary',
          kind: 'input',
          value: 'Bearer ultra-secret-token',
          targetCandidates: [BUTTON_TARGET],
        },
        {
          id: 'overflow',
          kind: 'click',
          targetCandidates: [BUTTON_TARGET],
        },
      ],
    });
    expect(draft.truncatedEventCount).toBe(1);
    expect(draft.events).toHaveLength(3);
    expect(draft.events[0]).toMatchObject({
      id: 'input-2',
      resolution: 'resolved',
      suggestedAction: { input: 'ab' },
    });
    expect(draft.events.slice(1)).toEqual([
      { id: 'password', resolution: 'sensitive' },
      { id: 'secret-canary', resolution: 'sensitive' },
    ]);
    expect(JSON.stringify(draft)).not.toContain('never-store-me');
    expect(JSON.stringify(draft)).not.toContain('ultra-secret-token');
  });

  it('redacts nested and adapter-suggested Secret input before draft creation', () => {
    const draft = createBehaviorRecorderDraft({
      id: 'secret-draft',
      workspaceRevision: 7,
      maximumEvents: 10,
      events: [
        {
          id: 'nested-secret',
          kind: 'input',
          value: { profile: { apiKey: 'never-store-nested' } },
          targetCandidates: [BUTTON_TARGET],
        },
        {
          id: 'suggested-secret',
          kind: 'click',
          targetCandidates: [BUTTON_TARGET],
          suggestedAction: {
            kind: 'semantic-click',
            target: BUTTON_TARGET,
            input: { authorization: 'never-store-suggested' },
            capabilityId: 'pir.click',
            runtimeZone: 'client',
            effect: 'none',
            cancellation: 'none',
          },
        },
      ],
    });
    expect(draft.events).toEqual([
      { id: 'nested-secret', resolution: 'sensitive' },
      { id: 'suggested-secret', resolution: 'sensitive' },
    ]);
    expect(JSON.stringify(draft)).not.toContain('never-store');
  });

  it('requires review and exact revision before adoption', () => {
    const draft = createBehaviorRecorderDraft({
      id: 'draft',
      workspaceRevision: 7,
      maximumEvents: 10,
      events: [
        {
          id: 'click',
          kind: 'click',
          targetCandidates: [BUTTON_TARGET],
        },
      ],
    });
    expect(
      adoptBehaviorRecorderDraft({
        draft,
        scenario,
        workspaceRevision: 8,
        selectedEventIds: ['click'],
      })
    ).toMatchObject({ status: 'blocked', reason: 'revision-drift' });
    expect(
      adoptBehaviorRecorderDraft({
        draft,
        scenario,
        workspaceRevision: 7,
        selectedEventIds: ['click'],
        cancel: true,
      })
    ).toEqual({ status: 'cancelled' });
    expect(
      adoptBehaviorRecorderDraft({
        draft,
        scenario,
        workspaceRevision: 7,
        selectedEventIds: ['click'],
      })
    ).toMatchObject({
      status: 'ready',
      scenario: {
        steps: expect.arrayContaining([
          expect.objectContaining({ id: 'recorded:click' }),
        ]),
      },
    });
    expect(
      adoptBehaviorRecorderDraft({
        draft,
        scenario,
        workspaceRevision: 7,
        selectedEventIds: ['unknown-event'],
      })
    ).toEqual({
      status: 'blocked',
      reason: 'unresolved-event',
      eventIds: ['unknown-event'],
    });
    expect(
      adoptBehaviorRecorderDraft({
        draft: {
          ...draft,
          events: [draft.events[0]!, draft.events[0]!],
        },
        scenario,
        workspaceRevision: 7,
        selectedEventIds: ['click'],
      })
    ).toEqual({
      status: 'blocked',
      reason: 'unresolved-event',
      eventIds: ['click'],
    });
  });
});
