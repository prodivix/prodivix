import {
  compareOptionalVerificationText,
  compareVerificationText,
  uniqueVerificationText,
} from './verificationCanonical';
import type {
  VerificationCheckDefinition,
  VerificationCheckKind,
  VerificationPlanBudgetSummary,
  VerificationPlanBudgets,
  VerificationPlanCell,
  VerificationPlanSelectionExplanation,
} from './verification.types';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export type MutableVerificationPlanCell = Omit<
  Mutable<VerificationPlanCell>,
  'dependencyCellIds'
> & {
  dependencyCellIds: string[];
};

const CHECK_KINDS: readonly VerificationCheckKind[] = Object.freeze([
  'diagnostics',
  'build',
  'unit',
  'integration',
  'e2e',
  'visual',
  'accessibility',
  'performance',
  'security',
]);

export const MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS = 1_000;

export const compareVerificationPlanCell = (
  left: Pick<
    VerificationPlanCell,
    | 'id'
    | 'checkId'
    | 'scenarioId'
    | 'targetId'
    | 'frameworkTarget'
    | 'surface'
    | 'browserEngine'
    | 'viewport'
    | 'colorScheme'
    | 'motion'
    | 'locale'
  >,
  right: Pick<
    VerificationPlanCell,
    | 'id'
    | 'checkId'
    | 'scenarioId'
    | 'targetId'
    | 'frameworkTarget'
    | 'surface'
    | 'browserEngine'
    | 'viewport'
    | 'colorScheme'
    | 'motion'
    | 'locale'
  >
): number =>
  compareVerificationText(left.checkId, right.checkId) ||
  compareOptionalVerificationText(left.scenarioId, right.scenarioId) ||
  compareVerificationText(left.targetId, right.targetId) ||
  compareVerificationText(left.frameworkTarget, right.frameworkTarget) ||
  compareVerificationText(left.surface, right.surface) ||
  compareOptionalVerificationText(left.browserEngine, right.browserEngine) ||
  compareVerificationText(left.viewport.id, right.viewport.id) ||
  compareVerificationText(left.colorScheme, right.colorScheme) ||
  compareVerificationText(left.motion, right.motion) ||
  compareVerificationText(left.locale, right.locale) ||
  compareVerificationText(left.id, right.id);

export const compareVerificationPlanExplanation = (
  left: VerificationPlanSelectionExplanation,
  right: VerificationPlanSelectionExplanation
): number =>
  compareOptionalVerificationText(left.cellId, right.cellId) ||
  compareVerificationText(left.checkId, right.checkId) ||
  compareOptionalVerificationText(left.scenarioId, right.scenarioId) ||
  compareVerificationText(left.targetId, right.targetId) ||
  compareVerificationText(left.status, right.status);

const emptyCounts = (): Record<VerificationCheckKind, number> =>
  Object.fromEntries(CHECK_KINDS.map((kind) => [kind, 0])) as Record<
    VerificationCheckKind,
    number
  >;

export const summarizeVerificationPlanBudget = (
  cells: readonly VerificationPlanCell[],
  budgets: VerificationPlanBudgets
): VerificationPlanBudgetSummary => {
  const cellsByCheckKind = emptyCounts();
  let totalMs = 0;
  let artifactBytes = 0;
  let estimatedComputeUnits = 0;
  let closureEvidenceRecords = 0;
  for (const cell of cells) {
    cellsByCheckKind[cell.checkKind] += 1;
    totalMs += cell.estimatedCost.durationMs;
    artifactBytes += cell.estimatedCost.artifactBytes;
    estimatedComputeUnits += cell.estimatedCost.computeUnits;
    closureEvidenceRecords += cell.retryPolicy.maximumAttempts;
  }
  const targetExpansions = new Set(
    cells.map((cell) => `${cell.targetId}\u0000${cell.frameworkTarget}`)
  ).size;
  const browserExpansions = new Set(
    cells.flatMap((cell) => (cell.browserEngine ? [cell.browserEngine] : []))
  ).size;
  const overBudgetDimensions: string[] = [];
  if (cells.length > budgets.maximumCells) {
    overBudgetDimensions.push('maximumCells');
  }
  if (
    Object.values(cellsByCheckKind).some(
      (count) => count > budgets.maximumCellsPerCheckKind
    )
  ) {
    overBudgetDimensions.push('maximumCellsPerCheckKind');
  }
  if (targetExpansions > budgets.maximumTargetExpansions) {
    overBudgetDimensions.push('maximumTargetExpansions');
  }
  if (browserExpansions > budgets.maximumBrowserExpansions) {
    overBudgetDimensions.push('maximumBrowserExpansions');
  }
  if (
    closureEvidenceRecords > budgets.maximumClosureEvidenceRecords ||
    closureEvidenceRecords > MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS
  ) {
    overBudgetDimensions.push('maximumClosureEvidenceRecords');
  }
  if (totalMs > budgets.totalMs) overBudgetDimensions.push('totalMs');
  if (artifactBytes > budgets.artifactBytes) {
    overBudgetDimensions.push('artifactBytes');
  }
  if (estimatedComputeUnits > budgets.estimatedComputeUnits) {
    overBudgetDimensions.push('estimatedComputeUnits');
  }
  return Object.freeze({
    cells: cells.length,
    cellsByCheckKind: Object.freeze(cellsByCheckKind),
    targetExpansions,
    browserExpansions,
    closureEvidenceRecords,
    totalMs,
    artifactBytes,
    estimatedComputeUnits,
    maximumParallelism: budgets.parallelism,
    overBudgetDimensions: uniqueVerificationText(overBudgetDimensions),
  });
};

export const verificationDependencyMatches = (
  dependent: MutableVerificationPlanCell,
  dependency: MutableVerificationPlanCell,
  dependencyDefinition: VerificationCheckDefinition
): boolean =>
  dependent.targetId === dependency.targetId &&
  dependent.frameworkTarget === dependency.frameworkTarget &&
  (!dependencyDefinition.matrixAxes.includes('surface') ||
    dependent.surface === dependency.surface) &&
  (!dependencyDefinition.matrixAxes.includes('browserEngine') ||
    dependent.browserEngine === dependency.browserEngine) &&
  (!dependencyDefinition.matrixAxes.includes('viewport') ||
    dependent.viewport.id === dependency.viewport.id) &&
  (!dependencyDefinition.matrixAxes.includes('colorScheme') ||
    dependent.colorScheme === dependency.colorScheme) &&
  (!dependencyDefinition.matrixAxes.includes('motion') ||
    dependent.motion === dependency.motion) &&
  (!dependencyDefinition.matrixAxes.includes('locale') ||
    dependent.locale === dependency.locale) &&
  (dependency.scenarioId === undefined ||
    dependent.scenarioId === dependency.scenarioId);

export const hasVerificationDependencyCycle = (
  cells: readonly MutableVerificationPlanCell[]
): boolean => {
  const byId = new Map(cells.map((cell) => [cell.id, cell]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependencyId of byId.get(id)?.dependencyCellIds ?? []) {
      if (visit(dependencyId)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return cells.some((cell) => visit(cell.id));
};

export const verificationDependencyClosure = (
  roots: readonly MutableVerificationPlanCell[],
  cellsById: ReadonlyMap<string, MutableVerificationPlanCell>
): readonly MutableVerificationPlanCell[] => {
  const selected = new Map<string, MutableVerificationPlanCell>();
  const queue = [...roots].sort(compareVerificationPlanCell);
  for (let offset = 0; offset < queue.length; offset += 1) {
    const cell = queue[offset]!;
    if (selected.has(cell.id)) continue;
    selected.set(cell.id, cell);
    for (const dependencyId of cell.dependencyCellIds) {
      const dependency = cellsById.get(dependencyId);
      if (dependency && !selected.has(dependency.id)) queue.push(dependency);
    }
  }
  return Object.freeze(
    [...selected.values()].sort(compareVerificationPlanCell)
  );
};
