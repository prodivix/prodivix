import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  compareVerificationText,
  digestVerificationValue,
  parseVerificationInstant,
  uniqueVerificationText,
} from './verificationCanonical';
import { normalizeVerificationCiIdentity } from './verificationCiIdentity';
import { validateVerificationPlan } from './verificationPlanCodec';
import type {
  VerificationAttemptOutcome,
  VerificationPlan,
  VerificationPlanCell,
} from './verification.types';
import type {
  VerificationRunCellState,
  VerificationRunCellStatus,
  VerificationRunEvent,
  VerificationRunEventInput,
  VerificationRunSnapshot,
  VerificationRunStatus,
  VerificationRunSummary,
  VerificationRunTransitionResult,
} from './verificationRun.types';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const DIAGNOSTIC_PATTERN = /^(?:BHV|VER)-[0-9]{4}$/u;
const MAXIMUM_REASON_LENGTH = 1_024;

const terminalCellStatuses = new Set<VerificationRunCellStatus>([
  'passed',
  'failed',
  'blocked',
  'unsupported',
  'unstable',
  'not-applicable',
  'cancelled',
  'interrupted',
]);

const terminalRunStatuses = new Set<VerificationRunStatus>([
  'completed',
  'failed',
  'blocked',
  'cancelled',
  'interrupted',
]);

const validIdentifier = (value: string): boolean =>
  IDENTIFIER_PATTERN.test(value);

const validInstant = (value: string): boolean =>
  parseVerificationInstant(value) !== undefined;

const eventWithoutDigest = (
  event: VerificationRunEventInput | VerificationRunEvent
): Omit<VerificationRunEvent, 'eventDigest'> => {
  const { eventDigest: _eventDigest, ...withoutDigest } =
    event as VerificationRunEvent;
  return withoutDigest;
};

const snapshotWithoutDigest = (
  snapshot:
    Omit<VerificationRunSnapshot, 'snapshotDigest'> | VerificationRunSnapshot
): Omit<VerificationRunSnapshot, 'snapshotDigest'> => {
  const { snapshotDigest: _snapshotDigest, ...withoutDigest } =
    snapshot as VerificationRunSnapshot;
  return withoutDigest;
};

const freezeCell = (cell: VerificationRunCellState): VerificationRunCellState =>
  Object.freeze({ ...cell });

const freezeSnapshot = (
  snapshot: Omit<VerificationRunSnapshot, 'snapshotDigest'>
): VerificationRunSnapshot => {
  const normalized = {
    ...snapshot,
    selectedCellIds: Object.freeze([...snapshot.selectedCellIds]),
    cells: Object.freeze(
      [...snapshot.cells]
        .map(freezeCell)
        .sort((left, right) =>
          compareVerificationText(left.cellId, right.cellId)
        )
    ),
  } as Omit<VerificationRunSnapshot, 'snapshotDigest'>;
  return Object.freeze({
    ...normalized,
    snapshotDigest: digestVerificationValue(normalized),
  }) as VerificationRunSnapshot;
};

const initialCellStatus = (
  cell: VerificationPlanCell
): VerificationRunCellStatus => {
  switch (cell.preflight.status) {
    case 'supported':
      return 'queued';
    case 'blocked':
      return 'blocked';
    case 'unsupported':
      return 'unsupported';
    case 'not-applicable':
      return 'not-applicable';
  }
};

const initialRunStatus = (
  cells: readonly VerificationRunCellState[]
): VerificationRunStatus =>
  cells.some(({ status }) => status === 'queued') ? 'queued' : 'blocked';

const reject = (message: string): VerificationRunTransitionResult =>
  Object.freeze({ status: 'rejected', code: 'VER-4002', message });

const cellForEvent = (
  snapshot: VerificationRunSnapshot,
  event: Extract<
    VerificationRunEvent,
    { kind: 'cell-started' | 'cell-reported' | 'cell-promoted' }
  >
): VerificationRunCellState | undefined =>
  snapshot.cells.find(
    ({ cellId, attemptId }) =>
      cellId === event.cellId && attemptId === event.attemptId
  );

const replaceCell = (
  snapshot: VerificationRunSnapshot,
  next: VerificationRunCellState
): readonly VerificationRunCellState[] =>
  Object.freeze(
    snapshot.cells.map((cell) =>
      cell.cellId === next.cellId ? freezeCell(next) : cell
    )
  );

const outcomeStatus = (
  outcome: VerificationAttemptOutcome
): VerificationRunCellStatus => {
  switch (outcome) {
    case 'passed':
      return 'passed';
    case 'failed':
    case 'infrastructure-error':
      return 'failed';
    case 'blocked':
      return 'blocked';
    case 'cancelled':
      return 'cancelled';
  }
};

const derivedTerminalRunStatus = (
  cells: readonly VerificationRunCellState[]
): VerificationRunStatus => {
  if (cells.some(({ status }) => status === 'interrupted'))
    return 'interrupted';
  if (
    cells.some(({ status }) => status === 'failed' || status === 'unstable')
  ) {
    return 'failed';
  }
  if (
    cells.some(({ status }) => status === 'blocked' || status === 'unsupported')
  ) {
    return 'blocked';
  }
  if (cells.some(({ status }) => status === 'cancelled')) {
    return 'cancelled';
  }
  return 'completed';
};

const eventShapeIsValid = (event: VerificationRunEvent): boolean => {
  if (
    !validIdentifier(event.eventId) ||
    !validIdentifier(event.runId) ||
    !Number.isSafeInteger(event.cursor) ||
    event.cursor < 1 ||
    !validInstant(event.occurredAt) ||
    !DIGEST_PATTERN.test(event.eventDigest) ||
    digestVerificationValue(eventWithoutDigest(event)) !== event.eventDigest
  ) {
    return false;
  }
  switch (event.kind) {
    case 'run-started':
    case 'run-completed':
      return true;
    case 'cell-started':
      return validIdentifier(event.cellId) && validIdentifier(event.attemptId);
    case 'cell-reported':
      return (
        validIdentifier(event.cellId) &&
        validIdentifier(event.attemptId) &&
        DIGEST_PATTERN.test(event.candidateDigest) &&
        (event.diagnosticCode === undefined ||
          DIAGNOSTIC_PATTERN.test(event.diagnosticCode))
      );
    case 'cell-promoted':
      return (
        validIdentifier(event.cellId) &&
        validIdentifier(event.attemptId) &&
        DIGEST_PATTERN.test(event.candidateDigest) &&
        validIdentifier(event.evidenceId)
      );
    case 'run-cancel-requested':
      return (
        event.reason.length > 0 &&
        event.reason.length <= MAXIMUM_REASON_LENGTH &&
        event.reason === event.reason.trim()
      );
    case 'run-interrupted':
      return DIAGNOSTIC_PATTERN.test(event.reasonCode);
    case 'closure-evaluated':
      return DIGEST_PATTERN.test(event.closureDigest);
  }
};

export const createVerificationRunEvent = (
  input: VerificationRunEventInput
): VerificationRunEvent => {
  const event = Object.freeze({
    ...input,
    eventDigest: digestVerificationValue(input),
  }) as VerificationRunEvent;
  if (!eventShapeIsValid(event)) {
    throw new TypeError('Verification run event is invalid.');
  }
  return event;
};

export const createVerificationRunSnapshot = (input: {
  runId: string;
  plan: VerificationPlan;
  surface: VerificationRunSnapshot['surface'];
  scope: VerificationRunSnapshot['scope'];
  providerId: string;
  origin: VerificationRunSnapshot['origin'];
  ci?: VerificationRunSnapshot['ci'];
  selectedCellIds: readonly string[];
  attemptIdByCellId: Readonly<Record<string, string>>;
  createdAt: string;
}): VerificationRunSnapshot => {
  const validatedPlan = validateVerificationPlan(input.plan);
  if (!validatedPlan.ok || validatedPlan.value.status !== 'ready') {
    throw new TypeError('Verification run requires a ready canonical Plan.');
  }
  if (
    !validIdentifier(input.runId) ||
    !validIdentifier(input.providerId) ||
    !validInstant(input.createdAt)
  ) {
    throw new TypeError('Verification run identity is invalid.');
  }
  const selectedCellIds = uniqueVerificationText(input.selectedCellIds);
  if (
    selectedCellIds.length === 0 ||
    selectedCellIds.length !== input.selectedCellIds.length
  ) {
    throw new TypeError(
      'Verification run cell selection is empty or duplicated.'
    );
  }
  const selectedSet = new Set(selectedCellIds);
  const cellsById = new Map(
    validatedPlan.value.cells.map((cell) => [cell.id, cell] as const)
  );
  const selectedPlanCells = selectedCellIds.map((cellId) => {
    const cell = cellsById.get(cellId);
    if (!cell || cell.surface !== input.surface) {
      throw new TypeError(
        'Verification run cells must exist on one exact surface.'
      );
    }
    if (
      cell.dependencyCellIds.some(
        (dependencyCellId) => !selectedSet.has(dependencyCellId)
      )
    ) {
      throw new TypeError(
        'Verification run selection must include every Plan dependency.'
      );
    }
    return cell;
  });
  const attemptKeys = Object.keys(input.attemptIdByCellId).sort(
    compareVerificationText
  );
  if (
    !sameCanonicalJson(attemptKeys, selectedCellIds) ||
    attemptKeys.some(
      (cellId) => !validIdentifier(input.attemptIdByCellId[cellId] ?? '')
    ) ||
    new Set(Object.values(input.attemptIdByCellId)).size !==
      selectedCellIds.length
  ) {
    throw new TypeError(
      'Verification run attempt identities must map one-to-one to selected cells.'
    );
  }
  const ci =
    input.origin === 'ci'
      ? normalizeVerificationCiIdentity(input.ci)
      : undefined;
  if ((input.origin === 'ci') !== Boolean(ci)) {
    throw new TypeError(
      'Verification CI runs require one canonical CI identity.'
    );
  }
  const cells = Object.freeze(
    selectedPlanCells.map((cell) =>
      Object.freeze({
        cellId: cell.id,
        attemptId: input.attemptIdByCellId[cell.id]!,
        status: initialCellStatus(cell),
        lastEventCursor: 0,
      })
    )
  );
  return freezeSnapshot({
    runId: input.runId,
    workspaceId: validatedPlan.value.workspaceId,
    workspaceRevision: validatedPlan.value.targetRevision,
    planDigest: validatedPlan.value.planDigest,
    surface: input.surface,
    scope: input.scope,
    providerId: input.providerId,
    origin: input.origin,
    ...(ci ? { ci } : {}),
    status: initialRunStatus(cells),
    cursor: 0,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    selectedCellIds,
    cells,
  } as Omit<VerificationRunSnapshot, 'snapshotDigest'>);
};

export const applyVerificationRunEvent = (
  snapshot: VerificationRunSnapshot,
  event: VerificationRunEvent
): VerificationRunTransitionResult => {
  if (
    digestVerificationValue(snapshotWithoutDigest(snapshot)) !==
      snapshot.snapshotDigest ||
    !eventShapeIsValid(event) ||
    event.runId !== snapshot.runId ||
    event.cursor !== snapshot.cursor + 1 ||
    parseVerificationInstant(event.occurredAt)! <
      parseVerificationInstant(snapshot.updatedAt)!
  ) {
    return reject('Verification run event identity or cursor is invalid.');
  }

  let nextStatus = snapshot.status;
  let nextCells = snapshot.cells;
  let closureDigest = snapshot.closureDigest;
  let closureVerdict = snapshot.closureVerdict;

  switch (event.kind) {
    case 'run-started': {
      if (
        snapshot.status !== 'queued' ||
        !snapshot.cells.some(({ status }) => status === 'queued')
      ) {
        return reject('Verification run cannot start from its current state.');
      }
      nextStatus = 'running';
      break;
    }
    case 'cell-started': {
      const cell = cellForEvent(snapshot, event);
      if (snapshot.status !== 'running' || !cell || cell.status !== 'queued') {
        return reject(
          'Verification run cell cannot start from its current state.'
        );
      }
      nextCells = replaceCell(snapshot, {
        ...cell,
        status: 'running',
        startedAt: event.occurredAt,
        lastEventCursor: event.cursor,
      });
      break;
    }
    case 'cell-reported': {
      const cell = cellForEvent(snapshot, event);
      if (
        (snapshot.status !== 'running' && snapshot.status !== 'cancelling') ||
        !cell ||
        cell.status !== 'running'
      ) {
        return reject('Verification run cell report is out of sequence.');
      }
      nextCells = replaceCell(snapshot, {
        ...cell,
        status: outcomeStatus(event.outcome),
        completedAt: event.occurredAt,
        candidateDigest: event.candidateDigest,
        ...(event.diagnosticCode
          ? { diagnosticCode: event.diagnosticCode }
          : {}),
        lastEventCursor: event.cursor,
      });
      break;
    }
    case 'cell-promoted': {
      const cell = cellForEvent(snapshot, event);
      if (
        !cell ||
        !terminalCellStatuses.has(cell.status) ||
        !cell.candidateDigest ||
        cell.candidateDigest !== event.candidateDigest ||
        cell.evidenceId
      ) {
        return reject(
          'Verification run promotion does not match the cell result.'
        );
      }
      nextCells = replaceCell(snapshot, {
        ...cell,
        evidenceId: event.evidenceId,
        lastEventCursor: event.cursor,
      });
      break;
    }
    case 'run-cancel-requested': {
      if (snapshot.status !== 'queued' && snapshot.status !== 'running') {
        return reject(
          'Verification run cannot be cancelled from its current state.'
        );
      }
      nextStatus = 'cancelling';
      nextCells = Object.freeze(
        snapshot.cells.map((cell) =>
          cell.status === 'queued'
            ? freezeCell({
                ...cell,
                status: 'cancelled',
                completedAt: event.occurredAt,
                lastEventCursor: event.cursor,
              })
            : cell
        )
      );
      break;
    }
    case 'run-interrupted': {
      if (terminalRunStatuses.has(snapshot.status)) {
        return reject('Terminal Verification runs cannot be interrupted.');
      }
      nextStatus = 'interrupted';
      nextCells = Object.freeze(
        snapshot.cells.map((cell) =>
          cell.status === 'queued' || cell.status === 'running'
            ? freezeCell({
                ...cell,
                status: 'interrupted',
                completedAt: event.occurredAt,
                diagnosticCode: event.reasonCode,
                lastEventCursor: event.cursor,
              })
            : cell
        )
      );
      break;
    }
    case 'run-completed': {
      if (
        (snapshot.status !== 'running' && snapshot.status !== 'cancelling') ||
        snapshot.cells.some(({ status }) => !terminalCellStatuses.has(status))
      ) {
        return reject('Verification run cannot complete with active cells.');
      }
      nextStatus = derivedTerminalRunStatus(snapshot.cells);
      break;
    }
    case 'closure-evaluated': {
      if (
        !terminalRunStatuses.has(snapshot.status) ||
        snapshot.closureDigest ||
        snapshot.closureVerdict
      ) {
        return reject('Verification Closure cannot attach to this run.');
      }
      closureDigest = event.closureDigest;
      closureVerdict = event.verdict;
      break;
    }
  }

  const next = freezeSnapshot({
    ...snapshotWithoutDigest(snapshot),
    status: nextStatus,
    cursor: event.cursor,
    updatedAt: event.occurredAt,
    cells: nextCells,
    ...(closureDigest ? { closureDigest } : {}),
    ...(closureVerdict ? { closureVerdict } : {}),
  } as Omit<VerificationRunSnapshot, 'snapshotDigest'>);
  return Object.freeze({ status: 'applied', snapshot: next, event });
};

export const projectVerificationRunSummary = (
  snapshot: VerificationRunSnapshot
): VerificationRunSummary => {
  const count = (status: VerificationRunCellStatus): number =>
    snapshot.cells.filter((cell) => cell.status === status).length;
  return Object.freeze({
    runId: snapshot.runId,
    planDigest: snapshot.planDigest,
    surface: snapshot.surface,
    status: snapshot.status,
    cursor: snapshot.cursor,
    total: snapshot.cells.length,
    queued: count('queued'),
    running: count('running'),
    passed: count('passed'),
    failed: count('failed'),
    blocked: count('blocked') + count('not-applicable'),
    unsupported: count('unsupported'),
    unstable: count('unstable'),
    cancelled: count('cancelled'),
    interrupted: count('interrupted'),
    promoted: snapshot.cells.filter(({ evidenceId }) => Boolean(evidenceId))
      .length,
    ...(snapshot.closureDigest
      ? { closureDigest: snapshot.closureDigest }
      : {}),
    ...(snapshot.closureVerdict
      ? { closureVerdict: snapshot.closureVerdict }
      : {}),
    snapshotDigest: snapshot.snapshotDigest,
  });
};

export const isVerificationRunTerminal = (
  snapshot: VerificationRunSnapshot
): boolean => terminalRunStatuses.has(snapshot.status);
