import { describe, expect, it } from 'vitest';
import {
  BEHAVIOR_DIAGNOSTIC_REGISTRY,
  decodeBehaviorControlProfile,
  decodeBehaviorFixtureSet,
  decodeBehaviorScenario,
  encodeBehaviorControlProfile,
  encodeBehaviorFixtureSet,
  encodeBehaviorScenario,
  validateBehaviorDocument,
  type BehaviorControlProfile,
  type BehaviorFixtureSet,
  type BehaviorScenario,
} from './index';

const digest = `sha256-${'a'.repeat(64)}`;

export const behaviorScenarioFixture: BehaviorScenario = {
  id: 'scenario.catalog.create',
  name: 'Create a catalog item',
  criticality: 'critical',
  tags: ['catalog', 'crud'],
  entry: {
    id: 'trigger.route-ready',
    domain: 'route',
    event: 'ready',
    target: {
      kind: 'public-contract',
      id: 'route.catalog',
      workspaceDocumentId: 'route.catalog',
      capability: 'route.ready',
    },
  },
  steps: [
    {
      id: 'step.navigate',
      kind: 'action',
      failureMode: 'stop',
      action: {
        kind: 'navigate',
        target: {
          kind: 'public-contract',
          id: 'route.catalog',
          workspaceDocumentId: 'route.catalog',
          capability: 'route.navigate',
        },
        capabilityId: 'route.navigate',
        runtimeZone: 'client',
        effect: 'none',
        cancellation: 'cooperative',
      },
    },
    {
      id: 'step.observe',
      kind: 'observation',
      failureMode: 'stop',
      observation: {
        kind: 'visible',
        target: {
          kind: 'public-contract',
          id: 'catalog.create-button',
          workspaceDocumentId: 'page.catalog',
          capability: 'ui.visible',
        },
      },
      assertions: [
        {
          id: 'assert.visible',
          operator: 'equals',
          expected: true,
        },
      ],
    },
  ],
  fixtureRefs: [{ documentId: 'fixture.catalog', digest }],
  controlProfileRef: {
    kind: 'workspace',
    documentId: 'control.hermetic',
    digest,
  },
  baselineRefs: [],
  timeoutPolicy: {
    totalMs: 30_000,
    stepMs: 5_000,
    settleMs: 2_000,
  },
};

export const behaviorControlProfileFixture: BehaviorControlProfile = {
  id: 'control.hermetic',
  name: 'Hermetic browser controls',
  clock: {
    mode: 'virtual',
    epoch: '2026-01-01T00:00:00Z',
    tickMs: 1,
  },
  timezone: 'UTC',
  random: {
    algorithm: 'xoshiro256ss',
    seed: 'random-seed',
  },
  identifiers: {
    seed: 'id-seed',
    namespaces: ['action', 'attempt', 'operation', 'step'],
  },
  scheduler: {
    strategy: 'deterministic',
    seed: 'scheduler-seed',
    maximumTurns: 10_000,
  },
  network: {
    mode: 'fixture-only',
    undeclaredRequest: 'reject',
  },
  storage: {
    bootstrapFixtureIds: ['storage.empty'],
    cleanup: 'required',
  },
  rendering: {
    devicePixelRatio: 1,
    animationClock: 'virtual',
    fontReadiness: 'required',
  },
  serviceWorker: {
    mode: 'disabled',
    cache: 'empty',
  },
  settle: {
    conditions: ['declared-effects-complete', 'font-ready', 'render-stable'],
    maximumFrames: 120,
  },
  budgets: {
    totalMs: 30_000,
    stepMs: 5_000,
    settleMs: 2_000,
    networkMs: 3_000,
    animationMs: 3_000,
  },
};

export const behaviorFixtureSetFixture: BehaviorFixtureSet = {
  id: 'fixture.catalog',
  name: 'Catalog fixtures',
  fixtures: [
    {
      id: 'catalog.list.empty',
      target: {
        kind: 'data-operation',
        resourceId: 'catalog.list',
      },
      inputDigest: digest,
      outcome: {
        kind: 'result',
        value: [],
      },
    },
  ],
};

describe('Behavior document codecs', () => {
  it('round-trips all V0 Behavior documents without leaking wireVersion into current models', () => {
    const scenario = decodeBehaviorScenario(
      encodeBehaviorScenario(behaviorScenarioFixture)
    );
    const profile = decodeBehaviorControlProfile(
      encodeBehaviorControlProfile(behaviorControlProfileFixture)
    );
    const fixtures = decodeBehaviorFixtureSet(
      encodeBehaviorFixtureSet(behaviorFixtureSetFixture)
    );

    expect(scenario).toEqual({ ok: true, value: behaviorScenarioFixture });
    expect(profile).toEqual({
      ok: true,
      value: behaviorControlProfileFixture,
    });
    expect(fixtures).toEqual({ ok: true, value: behaviorFixtureSetFixture });
    expect(
      Object.hasOwn(scenario.ok ? scenario.value : {}, 'wireVersion')
    ).toBe(false);
  });

  it('fails closed for unknown wire versions and duplicate stable identities', () => {
    expect(
      decodeBehaviorScenario({
        ...encodeBehaviorScenario(behaviorScenarioFixture),
        wireVersion: 2,
      })
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'BHV-1001', path: '/wireVersion' }],
    });

    const duplicate = {
      ...behaviorScenarioFixture,
      steps: [
        behaviorScenarioFixture.steps[0],
        behaviorScenarioFixture.steps[0],
      ],
    };
    expect(validateBehaviorDocument('behavior-scenario', duplicate).ok).toBe(
      false
    );
  });

  it('keeps the seven verification matrix axes out of control profiles', () => {
    expect(
      validateBehaviorDocument('behavior-control-profile', {
        ...behaviorControlProfileFixture,
        viewport: { width: 1280, height: 720 },
      }).ok
    ).toBe(false);

    const withoutIdentifierControl = Object.fromEntries(
      Object.entries(behaviorControlProfileFixture).filter(
        ([key]) => key !== 'identifiers'
      )
    );
    expect(
      validateBehaviorDocument(
        'behavior-control-profile',
        withoutIdentifierControl
      ).ok
    ).toBe(false);
  });

  it('exports the complete BHV registry under the Behavior domain', () => {
    expect(Object.keys(BEHAVIOR_DIAGNOSTIC_REGISTRY)).toHaveLength(14);
    expect(BEHAVIOR_DIAGNOSTIC_REGISTRY['BHV-4004']).toMatchObject({
      domain: 'behavior',
      severity: 'fatal',
      stage: 'execute',
    });
  });
});
