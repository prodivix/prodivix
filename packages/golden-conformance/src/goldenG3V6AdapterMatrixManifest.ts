import {
  compareVerificationText,
  digestVerificationValue,
  type VerificationBrowserEngine,
  type VerificationCheckKind,
  type VerificationMotion,
  type VerificationPlan,
  type VerificationPlanCell,
  type VerificationSurface,
} from '@prodivix/verification';
import {
  GOLDEN_G3_V6_ADAPTER_FACTORY_SLOTS,
  type GoldenG3V6AdapterFactorySlotId,
} from './goldenG3V6AdapterRegistryFixture';
import {
  GOLDEN_G3_V6_AGGREGATE_ROW_COUNT,
  GOLDEN_G3_V6_CHECKS,
  GOLDEN_G3_V6_MATRIX_GROUPS,
  GOLDEN_G3_V6_REQUIRED_CELL_COUNT,
  type GoldenG3V6MatrixGroupId,
} from './goldenG3V6AdapterMatrixFixture';
import { GOLDEN_G3_V6_BROWSER_IDENTITY_REGISTRY_DIGEST } from './goldenG3V6BrowserIdentityFixture';

export type GoldenG3V6AttemptProvider = Readonly<{
  providerId: string;
  mode: 'browser' | 'remote' | 'standalone-export' | 'ci';
  origin: 'local' | 'remote' | 'ci';
}>;

export type GoldenG3V6MatrixCellManifest = Readonly<{
  cellId: string;
  checkId: string;
  checkKind: VerificationCheckKind;
  frameworkTarget: string;
  surface: VerificationSurface;
  browserEngine?: VerificationBrowserEngine;
  motion: VerificationMotion;
  adapterId: string;
  adapterFactorySlotId: GoldenG3V6AdapterFactorySlotId;
  expectedResultKinds: readonly ['candidate', 'blocked', 'unsupported'];
}>;

export type GoldenG3V6MatrixRowManifest = Readonly<{
  id:
    | 'preview-react'
    | 'preview-vue'
    | 'export-react'
    | 'export-vue'
    | 'ci-react'
    | 'ci-vue'
    | 'ci-firefox-critical'
    | 'ci-webkit-critical';
  groupId: GoldenG3V6MatrixGroupId;
  surface: VerificationSurface;
  frameworkTargets: readonly string[];
  browserEngine: VerificationBrowserEngine;
  motions: readonly VerificationMotion[];
  requiredFamilies: readonly VerificationCheckKind[];
  attemptProviderDimension: Readonly<{
    expandsPlanCells: false;
    providers: readonly GoldenG3V6AttemptProvider[];
  }>;
  adapterFactorySlotIds: readonly GoldenG3V6AdapterFactorySlotId[];
  requiredCellCount: number;
  cells: readonly GoldenG3V6MatrixCellManifest[];
}>;

export type GoldenG3V6ControlledMatrixManifest = Readonly<{
  format: 'prodivix.golden-g3-v6-controlled-matrix.v1';
  planDigest: string;
  adapterRegistryDigest: string;
  browserIdentityRegistryDigest: string;
  requiredCellCount: 66;
  aggregateRowCount: 8;
  rows: readonly GoldenG3V6MatrixRowManifest[];
  manifestDigest: string;
}>;

type RowSpec = Readonly<{
  id: GoldenG3V6MatrixRowManifest['id'];
  groupId: GoldenG3V6MatrixGroupId;
  frameworkTargets: readonly string[];
  providers: readonly GoldenG3V6AttemptProvider[];
}>;

const previewProviders = Object.freeze([
  Object.freeze({
    providerId: 'provider:g3-v6:preview-browser',
    mode: 'browser' as const,
    origin: 'local' as const,
  }),
  Object.freeze({
    providerId: 'provider:g3-v6:preview-remote',
    mode: 'remote' as const,
    origin: 'remote' as const,
  }),
]);

const exportProviders = Object.freeze([
  Object.freeze({
    providerId: 'provider:g3-v6:standalone-export',
    mode: 'standalone-export' as const,
    origin: 'local' as const,
  }),
]);

const ciProviders = Object.freeze([
  Object.freeze({
    providerId: 'provider:g3-v6:ci',
    mode: 'ci' as const,
    origin: 'ci' as const,
  }),
]);

const ROW_SPECS: readonly RowSpec[] = Object.freeze([
  Object.freeze({
    id: 'preview-react',
    groupId: 'preview-primary',
    frameworkTargets: Object.freeze(['react-vite']),
    providers: previewProviders,
  }),
  Object.freeze({
    id: 'preview-vue',
    groupId: 'preview-primary',
    frameworkTargets: Object.freeze(['vue-vite']),
    providers: previewProviders,
  }),
  Object.freeze({
    id: 'export-react',
    groupId: 'export-primary',
    frameworkTargets: Object.freeze(['react-vite']),
    providers: exportProviders,
  }),
  Object.freeze({
    id: 'export-vue',
    groupId: 'export-primary',
    frameworkTargets: Object.freeze(['vue-vite']),
    providers: exportProviders,
  }),
  Object.freeze({
    id: 'ci-react',
    groupId: 'ci-primary',
    frameworkTargets: Object.freeze(['react-vite']),
    providers: ciProviders,
  }),
  Object.freeze({
    id: 'ci-vue',
    groupId: 'ci-primary',
    frameworkTargets: Object.freeze(['vue-vite']),
    providers: ciProviders,
  }),
  Object.freeze({
    id: 'ci-firefox-critical',
    groupId: 'ci-firefox-critical',
    frameworkTargets: Object.freeze(['react-vite', 'vue-vite']),
    providers: ciProviders,
  }),
  Object.freeze({
    id: 'ci-webkit-critical',
    groupId: 'ci-webkit-critical',
    frameworkTargets: Object.freeze(['react-vite', 'vue-vite']),
    providers: ciProviders,
  }),
]);

const checkGroupIds = new Map(
  GOLDEN_G3_V6_CHECKS.map((check) => {
    const group = GOLDEN_G3_V6_MATRIX_GROUPS.find((candidate) =>
      check.riskFlags.includes(candidate.riskFlag)
    );
    if (!group) {
      throw new Error(`Golden V6 check "${check.id}" has no matrix group.`);
    }
    return [check.id, group.id] as const;
  })
);

const factorySlotIdForCell = (
  cell: VerificationPlanCell
): GoldenG3V6AdapterFactorySlotId => {
  const slot = GOLDEN_G3_V6_ADAPTER_FACTORY_SLOTS.find(
    (candidate) => candidate.adapterId === cell.adapter.adapterId
  );
  if (!slot) {
    throw new Error(`Golden V6 cell "${cell.id}" has no adapter factory slot.`);
  }
  return slot.id;
};

const rowContainsCell = (row: RowSpec, cell: VerificationPlanCell): boolean =>
  checkGroupIds.get(cell.checkId) === row.groupId &&
  row.frameworkTargets.includes(cell.frameworkTarget);

const cellManifest = (
  cell: VerificationPlanCell
): GoldenG3V6MatrixCellManifest =>
  Object.freeze({
    cellId: cell.id,
    checkId: cell.checkId,
    checkKind: cell.checkKind,
    frameworkTarget: cell.frameworkTarget,
    surface: cell.surface,
    ...(cell.browserEngine ? { browserEngine: cell.browserEngine } : {}),
    motion: cell.motion,
    adapterId: cell.adapter.adapterId,
    adapterFactorySlotId: factorySlotIdForCell(cell),
    expectedResultKinds: Object.freeze([
      'candidate',
      'blocked',
      'unsupported',
    ] as const),
  });

/**
 * Aggregates canonical Plan cells without adding provider attempts as a matrix
 * axis. Browser and Remote are alternative Preview attempt providers for the
 * same required cells.
 */
export const createGoldenG3V6ControlledMatrixManifest = (
  plan: VerificationPlan
): GoldenG3V6ControlledMatrixManifest => {
  if (plan.status !== 'ready') {
    throw new Error('Golden V6 controlled matrix requires a ready Plan.');
  }
  const requiredCells = plan.cells.filter(
    (cell) => cell.requirement === 'required'
  );
  if (requiredCells.length !== GOLDEN_G3_V6_REQUIRED_CELL_COUNT) {
    throw new Error(
      `Golden V6 requires ${GOLDEN_G3_V6_REQUIRED_CELL_COUNT} cells, received ${requiredCells.length}.`
    );
  }

  const rows = ROW_SPECS.map((rowSpec) => {
    const group = GOLDEN_G3_V6_MATRIX_GROUPS.find(
      (candidate) => candidate.id === rowSpec.groupId
    );
    if (!group) {
      throw new Error(`Golden V6 row "${rowSpec.id}" has no matrix group.`);
    }
    const cells = requiredCells
      .filter((cell) => rowContainsCell(rowSpec, cell))
      .sort((left, right) => compareVerificationText(left.id, right.id))
      .map(cellManifest);
    return Object.freeze({
      id: rowSpec.id,
      groupId: rowSpec.groupId,
      surface: group.surface,
      frameworkTargets: rowSpec.frameworkTargets,
      browserEngine: group.browserEngine,
      motions: group.motions,
      requiredFamilies: group.checkKinds,
      attemptProviderDimension: Object.freeze({
        expandsPlanCells: false as const,
        providers: rowSpec.providers,
      }),
      adapterFactorySlotIds: Object.freeze(
        [...new Set(cells.map((cell) => cell.adapterFactorySlotId))].sort(
          compareVerificationText
        )
      ),
      requiredCellCount: cells.length,
      cells: Object.freeze(cells),
    });
  });

  if (rows.length !== GOLDEN_G3_V6_AGGREGATE_ROW_COUNT) {
    throw new Error(
      `Golden V6 requires ${GOLDEN_G3_V6_AGGREGATE_ROW_COUNT} aggregate rows.`
    );
  }
  const coveredCellIds = rows.flatMap((row) =>
    row.cells.map((cell) => cell.cellId)
  );
  if (
    coveredCellIds.length !== requiredCells.length ||
    new Set(coveredCellIds).size !== requiredCells.length
  ) {
    throw new Error(
      'Golden V6 aggregate rows must cover every required cell exactly once.'
    );
  }

  const manifestWithoutDigest = Object.freeze({
    format: 'prodivix.golden-g3-v6-controlled-matrix.v1' as const,
    planDigest: plan.planDigest,
    adapterRegistryDigest: plan.adapterRegistryDigest,
    browserIdentityRegistryDigest:
      GOLDEN_G3_V6_BROWSER_IDENTITY_REGISTRY_DIGEST,
    requiredCellCount: GOLDEN_G3_V6_REQUIRED_CELL_COUNT,
    aggregateRowCount: GOLDEN_G3_V6_AGGREGATE_ROW_COUNT,
    rows: Object.freeze(rows),
  });
  return Object.freeze({
    ...manifestWithoutDigest,
    manifestDigest: digestVerificationValue(manifestWithoutDigest),
  });
};
