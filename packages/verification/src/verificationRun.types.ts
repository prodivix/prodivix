import type { VerificationCiIdentity } from './verificationCiIdentity';
import type {
  VerificationAttemptOutcome,
  VerificationClosureVerdict,
  VerificationSurface,
} from './verification.types';

export type VerificationRunOrigin = 'web' | 'cli' | 'ci';

export type VerificationRunScope = 'impacted' | 'required' | 'all' | 'cell';

export type VerificationRunStatus =
  | 'queued'
  | 'running'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'cancelled'
  | 'interrupted';

export type VerificationRunCellStatus =
  | 'queued'
  | 'running'
  | 'passed'
  | 'failed'
  | 'blocked'
  | 'unsupported'
  | 'unstable'
  | 'not-applicable'
  | 'cancelled'
  | 'interrupted';

export type VerificationRunCellState = Readonly<{
  cellId: string;
  attemptId: string;
  status: VerificationRunCellStatus;
  lastEventCursor: number;
  startedAt?: string;
  completedAt?: string;
  candidateDigest?: string;
  evidenceId?: string;
  diagnosticCode?: string;
}>;

type VerificationRunOriginIdentity =
  | Readonly<{
      origin: Exclude<VerificationRunOrigin, 'ci'>;
      ci?: never;
    }>
  | Readonly<{
      origin: 'ci';
      ci: VerificationCiIdentity;
    }>;

export type VerificationRunSnapshot = Readonly<{
  runId: string;
  workspaceId: string;
  workspaceRevision: number;
  planDigest: string;
  surface: VerificationSurface;
  scope: VerificationRunScope;
  providerId: string;
  status: VerificationRunStatus;
  cursor: number;
  createdAt: string;
  updatedAt: string;
  selectedCellIds: readonly string[];
  cells: readonly VerificationRunCellState[];
  closureDigest?: string;
  closureVerdict?: VerificationClosureVerdict;
  snapshotDigest: string;
}> &
  VerificationRunOriginIdentity;

type VerificationRunEventBase = Readonly<{
  eventId: string;
  runId: string;
  cursor: number;
  occurredAt: string;
  eventDigest: string;
}>;

export type VerificationRunStartedEvent = VerificationRunEventBase &
  Readonly<{
    kind: 'run-started';
  }>;

export type VerificationRunCellStartedEvent = VerificationRunEventBase &
  Readonly<{
    kind: 'cell-started';
    cellId: string;
    attemptId: string;
  }>;

export type VerificationRunCellReportedEvent = VerificationRunEventBase &
  Readonly<{
    kind: 'cell-reported';
    cellId: string;
    attemptId: string;
    outcome: VerificationAttemptOutcome;
    candidateDigest: string;
    diagnosticCode?: string;
  }>;

export type VerificationRunCellPromotedEvent = VerificationRunEventBase &
  Readonly<{
    kind: 'cell-promoted';
    cellId: string;
    attemptId: string;
    candidateDigest: string;
    evidenceId: string;
  }>;

export type VerificationRunCancelRequestedEvent = VerificationRunEventBase &
  Readonly<{
    kind: 'run-cancel-requested';
    reason: string;
  }>;

export type VerificationRunInterruptedEvent = VerificationRunEventBase &
  Readonly<{
    kind: 'run-interrupted';
    reasonCode: string;
  }>;

export type VerificationRunCompletedEvent = VerificationRunEventBase &
  Readonly<{
    kind: 'run-completed';
  }>;

export type VerificationRunClosureEvaluatedEvent = VerificationRunEventBase &
  Readonly<{
    kind: 'closure-evaluated';
    closureDigest: string;
    verdict: VerificationClosureVerdict;
  }>;

export type VerificationRunEvent =
  | VerificationRunStartedEvent
  | VerificationRunCellStartedEvent
  | VerificationRunCellReportedEvent
  | VerificationRunCellPromotedEvent
  | VerificationRunCancelRequestedEvent
  | VerificationRunInterruptedEvent
  | VerificationRunCompletedEvent
  | VerificationRunClosureEvaluatedEvent;

export type VerificationRunEventInput =
  VerificationRunEvent extends infer TEvent
    ? TEvent extends VerificationRunEvent
      ? Omit<TEvent, 'eventDigest'>
      : never
    : never;

export type VerificationRunTransitionResult =
  | Readonly<{
      status: 'applied';
      snapshot: VerificationRunSnapshot;
      event: VerificationRunEvent;
    }>
  | Readonly<{
      status: 'rejected';
      code: 'VER-4002';
      message: string;
    }>;

export type VerificationRunSummary = Readonly<{
  runId: string;
  planDigest: string;
  surface: VerificationSurface;
  status: VerificationRunStatus;
  cursor: number;
  total: number;
  queued: number;
  running: number;
  passed: number;
  failed: number;
  blocked: number;
  unsupported: number;
  unstable: number;
  cancelled: number;
  interrupted: number;
  promoted: number;
  closureDigest?: string;
  closureVerdict?: VerificationClosureVerdict;
  snapshotDigest: string;
}>;
