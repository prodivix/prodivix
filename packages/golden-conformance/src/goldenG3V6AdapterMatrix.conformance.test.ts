import {
  digestVerificationValue,
  validateVerificationDocument,
  type VerificationCheckKind,
  type VerificationPlan,
  type VerificationPlanCell,
} from '@prodivix/verification';
import { describe, expect, it } from 'vitest';
import {
  GOLDEN_G3_V6_ADAPTER_FACTORY_SLOTS,
  GOLDEN_G3_V6_ADAPTERS,
} from './goldenG3V6AdapterRegistryFixture';
import {
  createGoldenG3V6Plan,
  GOLDEN_G3_V6_CHECKS,
  GOLDEN_G3_V6_POLICY,
  GOLDEN_G3_V6_REQUIRED_CELL_COUNT,
} from './goldenG3V6AdapterMatrixFixture';
import { createGoldenG3V6ControlledMatrixManifest } from './goldenG3V6AdapterMatrixManifest';
import {
  createGoldenG3ProductionSecurityProgram,
  GOLDEN_G3_CATALOG_SCENARIO,
  GOLDEN_G3_PRODUCTION_SECURITY_SCENARIO,
  GOLDEN_G3_SCENARIO_IDS,
} from './goldenG3ScenarioFixture';
import { resolveGoldenBrowserLaunchConfiguration } from './generatedProjectHarness';

const readyPlan = (): VerificationPlan => {
  const result = createGoldenG3V6Plan();
  const policyValidation = validateVerificationDocument(
    'verification-policy',
    GOLDEN_G3_V6_POLICY
  );
  expect(
    result.status,
    JSON.stringify({
      planIssues: result.plan.issues,
      policyIssues: policyValidation.ok ? [] : policyValidation.issues,
    })
  ).toBe('ready');
  return result.plan;
};

const countBy = <T extends string>(
  cells: readonly VerificationPlanCell[],
  select: (cell: VerificationPlanCell) => T
): Readonly<Record<T, number>> =>
  cells.reduce<Record<T, number>>(
    (counts, cell) => {
      const value = select(cell);
      counts[value] = (counts[value] ?? 0) + 1;
      return counts;
    },
    {} as Record<T, number>
  );

describe('Golden G3 V6 controlled adapter matrix', () => {
  it('keeps Chromium-only GPU arguments out of Firefox and WebKit launches', () => {
    const chromium = resolveGoldenBrowserLaunchConfiguration({
      browserEngine: 'chromium',
      browserChannel: 'chromium',
    });
    const firefox = resolveGoldenBrowserLaunchConfiguration({
      browserEngine: 'firefox',
    });
    const webkit = resolveGoldenBrowserLaunchConfiguration({
      browserEngine: 'webkit',
    });

    expect(chromium).toMatchObject({
      browserEngine: 'chromium',
      browserChannel: 'chromium',
      chromiumArgs: [
        '--enable-unsafe-webgpu',
        '--use-webgpu-adapter=swiftshader',
        '--use-gpu-in-tests',
      ],
    });
    expect('chromiumArgs' in firefox).toBe(false);
    expect('chromiumArgs' in webkit).toBe(false);
    expect(() =>
      resolveGoldenBrowserLaunchConfiguration({
        browserEngine: 'firefox',
        browserChannel: 'chrome',
      })
    ).toThrow(
      'Golden browserChannel is only supported by the Chromium engine.'
    );
  });

  it('plans exactly 66 supported required cells without a skipped state', () => {
    const plan = readyPlan();

    expect(plan.cells).toHaveLength(GOLDEN_G3_V6_REQUIRED_CELL_COUNT);
    expect(new Set(plan.cells.map((cell) => cell.id)).size).toBe(66);
    expect(plan.cells.every((cell) => cell.requirement === 'required')).toBe(
      true
    );
    expect(
      plan.cells.every((cell) => cell.preflight.status === 'supported')
    ).toBe(true);
    expect(JSON.stringify(plan)).not.toContain('"skipped"');

    expect(countBy(plan.cells, (cell) => cell.checkKind)).toEqual({
      accessibility: 16,
      build: 2,
      diagnostics: 2,
      e2e: 16,
      integration: 2,
      performance: 8,
      security: 6,
      unit: 2,
      visual: 12,
    });
    expect(countBy(plan.cells, (cell) => cell.surface)).toEqual({
      ci: 32,
      export: 20,
      preview: 14,
    });
    expect(countBy(plan.cells, (cell) => cell.browserEngine ?? 'none')).toEqual(
      {
        chromium: 50,
        firefox: 4,
        none: 8,
        webkit: 4,
      }
    );
    expect(countBy(plan.cells, (cell) => cell.motion)).toEqual({
      full: 44,
      reduced: 22,
    });
  });

  it('keeps non-browser and non-motion families on canonical defaults', () => {
    const plan = readyPlan();
    const browserFamilies: readonly VerificationCheckKind[] = [
      'e2e',
      'visual',
      'accessibility',
      'performance',
      'security',
    ];
    const motionFamilies: readonly VerificationCheckKind[] = [
      'e2e',
      'visual',
      'accessibility',
      'performance',
    ];

    for (const cell of plan.cells) {
      if (!browserFamilies.includes(cell.checkKind)) {
        expect(cell.browserEngine, cell.id).toBeUndefined();
      }
      if (!motionFamilies.includes(cell.checkKind)) {
        expect(cell.motion, cell.id).toBe('full');
      }
    }
  });

  it('binds every Scenario cell to its canonical authored control profile', () => {
    const plan = readyPlan();

    for (const cell of plan.cells.filter(({ scenarioId }) => scenarioId)) {
      const scenario =
        cell.scenarioId === GOLDEN_G3_SCENARIO_IDS.productionSecurityScenario
          ? GOLDEN_G3_PRODUCTION_SECURITY_SCENARIO
          : GOLDEN_G3_CATALOG_SCENARIO;
      expect(cell.controlProfileRef, cell.id).toEqual(
        scenario.controlProfileRef
      );
    }
  });

  it('keeps production security cells on the exact no-fixture hard cut', () => {
    const plan = readyPlan();
    const securityCells = plan.cells.filter(
      ({ checkKind }) => checkKind === 'security'
    );
    expect(securityCells).toHaveLength(6);
    expect(
      securityCells.every(({ fixtureSetRef }) => fixtureSetRef === undefined)
    ).toBe(true);
    expect(
      securityCells.every(
        ({ scenarioId }) =>
          scenarioId === GOLDEN_G3_SCENARIO_IDS.productionSecurityScenario
      )
    ).toBe(true);
    expect(
      plan.cells
        .filter(
          ({ checkKind }) =>
            checkKind === 'e2e' ||
            checkKind === 'visual' ||
            checkKind === 'accessibility' ||
            checkKind === 'performance'
        )
        .every(({ fixtureSetRef }) => fixtureSetRef !== undefined)
    ).toBe(true);

    const program = createGoldenG3ProductionSecurityProgram(
      'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    );
    expect(GOLDEN_G3_PRODUCTION_SECURITY_SCENARIO.fixtureRefs).toEqual([]);
    expect(
      GOLDEN_G3_PRODUCTION_SECURITY_SCENARIO.steps.map(({ id }) => id)
    ).toEqual([
      'open-catalog',
      'catalog-root-visible',
      'catalog-image-visible',
    ]);
    expect(program.scenarioId).toBe(
      GOLDEN_G3_SCENARIO_IDS.productionSecurityScenario
    );
    expect(program.fixtureSetDigests).toEqual([]);
  });

  it('aggregates the Plan into the exact eight controlled rows', () => {
    const plan = readyPlan();
    const manifest = createGoldenG3V6ControlledMatrixManifest(plan);

    expect(manifest.rows.map((row) => row.id)).toEqual([
      'preview-react',
      'preview-vue',
      'export-react',
      'export-vue',
      'ci-react',
      'ci-vue',
      'ci-firefox-critical',
      'ci-webkit-critical',
    ]);
    expect(manifest.rows.map((row) => row.requiredCellCount)).toEqual([
      7, 7, 10, 10, 12, 12, 4, 4,
    ]);
    expect(
      manifest.rows.flatMap((row) => row.cells).map((cell) => cell.cellId)
    ).toHaveLength(66);
    expect(
      new Set(
        manifest.rows.flatMap((row) => row.cells.map((cell) => cell.cellId))
      ).size
    ).toBe(66);

    const { manifestDigest: _manifestDigest, ...withoutDigest } = manifest;
    expect(manifest.manifestDigest).toBe(
      digestVerificationValue(withoutDigest)
    );
    expect(JSON.stringify(manifest)).not.toContain('"skipped"');
  });

  it('models Browser and Remote as Preview attempt providers, not cells', () => {
    const manifest = createGoldenG3V6ControlledMatrixManifest(readyPlan());
    const previewRows = manifest.rows.filter(
      (row) => row.surface === 'preview'
    );
    const nonPreviewRows = manifest.rows.filter(
      (row) => row.surface !== 'preview'
    );

    expect(previewRows).toHaveLength(2);
    for (const row of previewRows) {
      expect(row.attemptProviderDimension).toEqual({
        expandsPlanCells: false,
        providers: [
          {
            providerId: 'provider:g3-v6:preview-browser',
            mode: 'browser',
            origin: 'local',
          },
          {
            providerId: 'provider:g3-v6:preview-remote',
            mode: 'remote',
            origin: 'remote',
          },
        ],
      });
      expect(row.requiredCellCount).toBe(7);
    }
    expect(
      nonPreviewRows.every(
        (row) => row.attemptProviderDimension.providers.length === 1
      )
    ).toBe(true);
  });

  it('pins Firefox and WebKit to the critical full-motion subset', () => {
    const manifest = createGoldenG3V6ControlledMatrixManifest(readyPlan());
    for (const engine of ['firefox', 'webkit'] as const) {
      const row = manifest.rows.find(
        (candidate) => candidate.browserEngine === engine
      );
      expect(row).toBeDefined();
      expect(row!.frameworkTargets).toEqual(['react-vite', 'vue-vite']);
      expect(row!.requiredFamilies).toEqual(['e2e', 'accessibility']);
      expect(row!.motions).toEqual(['full']);
      expect(row!.cells).toHaveLength(4);
      expect(
        row!.cells.every(
          (cell) =>
            cell.browserEngine === engine &&
            cell.motion === 'full' &&
            ['e2e', 'accessibility'].includes(cell.checkKind)
        )
      ).toBe(true);
    }
  });

  it('binds every cell to an explicit future adapter factory slot', () => {
    const manifest = createGoldenG3V6ControlledMatrixManifest(readyPlan());
    const slotByKind = new Map(
      GOLDEN_G3_V6_ADAPTER_FACTORY_SLOTS.flatMap((slot) =>
        slot.checkKinds.map((kind) => [kind, slot] as const)
      )
    );

    expect(GOLDEN_G3_V6_ADAPTER_FACTORY_SLOTS.map((slot) => slot.id)).toEqual([
      'diagnostics',
      'build',
      'unit',
      'integration',
      'browser',
    ]);
    for (const cell of manifest.rows.flatMap((row) => row.cells)) {
      const slot = slotByKind.get(cell.checkKind);
      expect(slot, cell.cellId).toBeDefined();
      expect(cell.adapterFactorySlotId, cell.cellId).toBe(slot!.id);
      expect(cell.adapterId, cell.cellId).toBe(slot!.adapterId);
      expect(cell.expectedResultKinds).toEqual([
        'candidate',
        'blocked',
        'unsupported',
      ]);
    }
  });

  it('is deterministic under check and adapter input reordering', () => {
    const canonical = readyPlan();
    const reordered = createGoldenG3V6Plan({
      checks: [...GOLDEN_G3_V6_CHECKS].reverse(),
      adapters: [...GOLDEN_G3_V6_ADAPTERS].reverse(),
    });

    expect(reordered.status).toBe('ready');
    expect(reordered.plan.adapterRegistryDigest).toBe(
      canonical.adapterRegistryDigest
    );
    expect(reordered.plan.planDigest).toBe(canonical.planDigest);
    expect(
      createGoldenG3V6ControlledMatrixManifest(reordered.plan).manifestDigest
    ).toBe(createGoldenG3V6ControlledMatrixManifest(canonical).manifestDigest);
  });

  it('fails closed as unsupported when the browser factory is absent', () => {
    const result = createGoldenG3V6Plan({
      adapters: GOLDEN_G3_V6_ADAPTERS.filter(
        (adapter) => adapter.identity.adapterId !== 'adapter:g3-v6:browser'
      ),
    });

    expect(result.status).toBe('blocked');
    expect(result.plan.cells).toHaveLength(66);
    const unsupported = result.plan.cells.filter(
      (cell) => cell.preflight.status === 'unsupported'
    );
    expect(unsupported).toHaveLength(58);
    expect(
      unsupported.every(
        (cell) =>
          cell.preflight.status === 'unsupported' &&
          cell.preflight.reasonCode === 'VER-3002'
      )
    ).toBe(true);
    expect(JSON.stringify(result.plan)).not.toContain('"skipped"');
  });
});
