import { describe, expect, it } from 'vitest';
import {
  decodeVerificationPlan,
  digestVerificationValue,
  encodeVerificationPlan,
  projectVerificationPlanExplanation,
  serializeVerificationValue,
  verificationPlanWireSchema,
} from '@prodivix/verification';
import { GOLDEN_G2_VUE_CATALOG_IDS } from './goldenG2VueCatalogFixture';
import { GOLDEN_G3_COMPOSITION_IDS } from './goldenG3BehaviorCompositionFixture';
import {
  GOLDEN_G3_V4_ADAPTER,
  GOLDEN_G3_V4_CHECKS,
  GOLDEN_G3_V4_EXPLANATION,
  GOLDEN_G3_V4_IDS,
  GOLDEN_G3_V4_IMPACT,
  GOLDEN_G3_V4_PLAN,
  GOLDEN_G3_V4_SCENARIOS,
  createGoldenG3V4ConservativeImpact,
  createGoldenG3V4IsolatedImpact,
  createGoldenG3V4Plan,
  type GoldenG3V4ChangeKind,
} from './goldenG3VerificationPlanFixture';

const EXPECTED_PLAN_DIGEST =
  'sha256-be24ff531ef1a8d388b2cd59cb00b0eba0cc3fe80749103bedb26e3c5b5c17cc';

describe('G3 V4 Impact, Policy, and Plan Golden', () => {
  it('explains PIR, Data, Route guard, NodeGraph, Animation, and shared CodeSlot impact', () => {
    expect(GOLDEN_G3_V4_IMPACT.completeness).toBe('complete');
    expect(GOLDEN_G3_V4_IMPACT.changedDocumentIds).toEqual([
      GOLDEN_G3_COMPOSITION_IDS.animation,
      GOLDEN_G3_V4_IDS.sharedCode,
      GOLDEN_G2_VUE_CATALOG_IDS.data,
      GOLDEN_G3_COMPOSITION_IDS.graph,
      GOLDEN_G2_VUE_CATALOG_IDS.page,
    ]);
    expect(GOLDEN_G3_V4_IMPACT.impactedDomains).toEqual(
      expect.arrayContaining([
        'pir',
        'data',
        'route',
        'nodegraph',
        'animation',
        'code',
        'behavior',
      ])
    );
    expect(GOLDEN_G3_V4_IMPACT.impactedScenarioIds).toEqual([
      GOLDEN_G3_V4_IDS.catalogScenario,
      GOLDEN_G3_V4_IDS.compositionScenario,
    ]);
    expect(GOLDEN_G3_V4_IMPACT.riskFlags).toEqual([
      'route-guard',
      'shared-code',
    ]);

    const scenarioPaths = GOLDEN_G3_V4_IMPACT.impactPaths.filter((path) =>
      GOLDEN_G3_V4_IMPACT.impactedScenarioIds.includes(path.toId)
    );
    for (const semanticRoot of [
      'pir-node-symbol',
      'data-operation-symbol',
      'route-symbol',
      'nodegraph-symbol',
      'animation-composition-symbol',
      'code-artifact-symbol',
    ]) {
      expect(
        scenarioPaths.some((path) => path.fromId.includes(semanticRoot)),
        `missing ${semanticRoot} → Scenario path`
      ).toBe(true);
    }
    expect(
      scenarioPaths.every(
        (path) =>
          path.nodes[0] === path.fromId &&
          path.nodes[path.nodes.length - 1] === path.toId
      )
    ).toBe(true);
  });

  it.each<
    readonly [
      GoldenG3V4ChangeKind,
      string,
      readonly string[],
      readonly string[],
    ]
  >([
    [
      'pir',
      'pir-node-symbol',
      [GOLDEN_G3_V4_IDS.catalogScenario, GOLDEN_G3_V4_IDS.compositionScenario],
      [
        GOLDEN_G3_V4_IDS.buildCheck,
        GOLDEN_G3_V4_IDS.catalogCheck,
        GOLDEN_G3_V4_IDS.compositionCheck,
        GOLDEN_G3_V4_IDS.securityCheck,
        GOLDEN_G3_V4_IDS.visualCheck,
      ],
    ],
    [
      'data',
      'data-operation-symbol',
      [GOLDEN_G3_V4_IDS.catalogScenario, GOLDEN_G3_V4_IDS.compositionScenario],
      [
        GOLDEN_G3_V4_IDS.buildCheck,
        GOLDEN_G3_V4_IDS.catalogCheck,
        GOLDEN_G3_V4_IDS.compositionCheck,
        GOLDEN_G3_V4_IDS.visualCheck,
      ],
    ],
    [
      'route',
      'route-symbol',
      [GOLDEN_G3_V4_IDS.catalogScenario, GOLDEN_G3_V4_IDS.compositionScenario],
      [
        GOLDEN_G3_V4_IDS.buildCheck,
        GOLDEN_G3_V4_IDS.catalogCheck,
        GOLDEN_G3_V4_IDS.compositionCheck,
        GOLDEN_G3_V4_IDS.securityCheck,
        GOLDEN_G3_V4_IDS.visualCheck,
      ],
    ],
    [
      'nodegraph',
      'nodegraph-symbol',
      [GOLDEN_G3_V4_IDS.compositionScenario],
      [GOLDEN_G3_V4_IDS.buildCheck, GOLDEN_G3_V4_IDS.compositionCheck],
    ],
    [
      'animation',
      'animation-composition-symbol',
      [GOLDEN_G3_V4_IDS.compositionScenario],
      [
        GOLDEN_G3_V4_IDS.buildCheck,
        GOLDEN_G3_V4_IDS.compositionCheck,
        GOLDEN_G3_V4_IDS.visualCheck,
      ],
    ],
    [
      'shared-code',
      'code-artifact-symbol',
      [GOLDEN_G3_V4_IDS.catalogScenario, GOLDEN_G3_V4_IDS.compositionScenario],
      [
        GOLDEN_G3_V4_IDS.buildCheck,
        GOLDEN_G3_V4_IDS.catalogCheck,
        GOLDEN_G3_V4_IDS.compositionCheck,
        GOLDEN_G3_V4_IDS.securityCheck,
        GOLDEN_G3_V4_IDS.visualCheck,
      ],
    ],
  ])(
    'plans the isolated %s change without borrowing another change root',
    (change, semanticRoot, expectedScenarios, expectedChecks) => {
      const result = createGoldenG3V4IsolatedImpact(change);
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') return;
      expect(result.impactSet.completeness).toBe('complete');
      expect(result.impactSet.impactedScenarioIds).toEqual(expectedScenarios);
      expect(
        result.impactSet.impactPaths.some(
          (path) =>
            path.fromId.includes(semanticRoot) &&
            expectedScenarios.includes(path.toId)
        )
      ).toBe(true);

      const plan = createGoldenG3V4Plan({
        impactSet: result.impactSet,
      }).plan;
      expect(plan.status).toBe('ready');
      expect(new Set(plan.cells.map((cell) => cell.checkId))).toEqual(
        new Set(expectedChecks)
      );
      expect(
        new Set(
          plan.cells.flatMap((cell) =>
            cell.scenarioId ? [cell.scenarioId] : []
          )
        )
      ).toEqual(
        new Set(
          change === 'animation'
            ? [
                GOLDEN_G3_V4_IDS.catalogScenario,
                GOLDEN_G3_V4_IDS.compositionScenario,
              ]
            : expectedScenarios
        )
      );
    }
  );

  it('selects the exact Scenario/check matrix and builds shared dependencies', () => {
    expect(GOLDEN_G3_V4_PLAN.status).toBe('ready');
    expect(GOLDEN_G3_V4_PLAN.issues).toEqual([]);
    expect(GOLDEN_G3_V4_PLAN.cells).toHaveLength(24);
    expect(
      new Set(GOLDEN_G3_V4_PLAN.cells.map((cell) => cell.checkId))
    ).toEqual(
      new Set([
        GOLDEN_G3_V4_IDS.buildCheck,
        GOLDEN_G3_V4_IDS.catalogCheck,
        GOLDEN_G3_V4_IDS.compositionCheck,
        GOLDEN_G3_V4_IDS.securityCheck,
        GOLDEN_G3_V4_IDS.visualCheck,
      ])
    );
    expect(
      new Set(
        GOLDEN_G3_V4_PLAN.cells.flatMap((cell) =>
          cell.scenarioId ? [cell.scenarioId] : []
        )
      )
    ).toEqual(
      new Set([
        GOLDEN_G3_V4_IDS.catalogScenario,
        GOLDEN_G3_V4_IDS.compositionScenario,
      ])
    );
    expect(
      new Set(GOLDEN_G3_V4_PLAN.cells.map((cell) => cell.frameworkTarget))
    ).toEqual(new Set(['react-vite', 'vue-vite']));
    expect(
      new Set(
        GOLDEN_G3_V4_PLAN.cells
          .filter((cell) => cell.checkKind === 'e2e')
          .map((cell) => cell.browserEngine)
      )
    ).toEqual(new Set(['chromium', 'firefox']));
    expect(
      new Set(
        GOLDEN_G3_V4_PLAN.cells
          .filter((cell) => cell.checkKind === 'e2e')
          .map((cell) => cell.motion)
      )
    ).toEqual(new Set(['full', 'reduced']));
    expect(
      GOLDEN_G3_V4_PLAN.cells
        .filter((cell) => cell.checkKind !== 'build')
        .every((cell) => cell.dependencyCellIds.length === 1)
    ).toBe(true);
    expect(
      GOLDEN_G3_V4_PLAN.explanations
        .filter((explanation) => explanation.status === 'selected')
        .filter((explanation) => explanation.scenarioId)
        .every((explanation) => explanation.impactPathIds.length > 0)
    ).toBe(true);
  });

  it('is byte-stable across registry insertion order and pins the Golden digest', () => {
    const reversed = createGoldenG3V4Plan({
      scenarios: [...GOLDEN_G3_V4_SCENARIOS].reverse(),
      checks: [...GOLDEN_G3_V4_CHECKS].reverse(),
      adapters: [GOLDEN_G3_V4_ADAPTER].reverse(),
    });
    expect(reversed.plan).toEqual(GOLDEN_G3_V4_PLAN);
    expect(serializeVerificationValue(reversed.plan)).toBe(
      serializeVerificationValue(GOLDEN_G3_V4_PLAN)
    );
    expect(GOLDEN_G3_V4_PLAN.planDigest).toBe(EXPECTED_PLAN_DIGEST);
  });

  it('round-trips the immutable Plan wire and rejects drift, excess budget, unknown fields, and malformed Unicode', () => {
    const wire = encodeVerificationPlan(GOLDEN_G3_V4_PLAN);
    expect(decodeVerificationPlan(wire)).toEqual({
      ok: true,
      value: GOLDEN_G3_V4_PLAN,
    });

    const reordered = structuredClone(wire) as unknown as {
      cells: unknown[];
    };
    reordered.cells.reverse();
    expect(decodeVerificationPlan(reordered).ok).toBe(false);

    const drifted = structuredClone(wire) as unknown as {
      cells: { targetId: string }[];
    };
    drifted.cells[0]!.targetId = 'target:forged';
    expect(decodeVerificationPlan(drifted).ok).toBe(false);

    const oversized = structuredClone(wire) as unknown as {
      budget: { closureEvidenceRecords: number };
    };
    oversized.budget.closureEvidenceRecords = 1_001;
    expect(decodeVerificationPlan(oversized).ok).toBe(false);

    const unknown = structuredClone(wire) as typeof wire & {
      producerHint?: string;
    };
    unknown.producerHint = 'untrusted';
    expect(decodeVerificationPlan(unknown).ok).toBe(false);

    const malformedUnicode = structuredClone(wire) as unknown as {
      workspaceId: string;
    };
    malformedUnicode.workspaceId = '\ud800';
    expect(decodeVerificationPlan(malformedUnicode).ok).toBe(false);

    expect(digestVerificationValue(verificationPlanWireSchema)).toBe(
      'sha256-e29a613f2f8319a1d79be228b4f15520df03bfea7c1b9041ac4d7e7d0f045231'
    );
  });

  it('broadens missing provider scope and never creates a skipped escape hatch', () => {
    const conservative = createGoldenG3V4ConservativeImpact();
    expect(conservative.status).toBe('ready');
    if (conservative.status !== 'ready') return;
    expect(conservative.impactSet.completeness).toBe('unknown');
    expect(conservative.impactSet.impactedScenarioIds).toEqual([
      GOLDEN_G3_V4_IDS.catalogScenario,
      GOLDEN_G3_V4_IDS.compositionScenario,
    ]);
    expect(conservative.impactSet.capabilityIds).toContain(
      'verification:project'
    );
    expect(conservative.impactSet.riskFlags).toContain('unknown-impact');
    expect(serializeVerificationValue(GOLDEN_G3_V4_PLAN)).not.toContain(
      'skipped'
    );
  });

  it('uses one canonical explanation projection for Web, CLI, and CI adapters', () => {
    const projected = projectVerificationPlanExplanation(GOLDEN_G3_V4_PLAN);
    expect(projected).toEqual(GOLDEN_G3_V4_EXPLANATION);
    expect(projected.planDigest).toBe(GOLDEN_G3_V4_PLAN.planDigest);
    expect(projected.cells).toHaveLength(GOLDEN_G3_V4_PLAN.cells.length);
    expect(projected.cells.every((cell) => cell.impactPathIds.length > 0)).toBe(
      false
    );
    expect(
      projected.cells
        .filter((cell) => cell.scenarioId)
        .every((cell) => cell.impactPathIds.length > 0)
    ).toBe(true);
  });
});
