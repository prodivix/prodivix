import type { CanonicalDigest, Instant } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type {
  AgentProviderJob,
  AgentProviderJobOutcome,
  AgentProviderJobReceipt,
} from './agentProvider.types';

export type AgentProviderJobEvent = Readonly<{
  eventId: string;
  providerJobId: string;
  taskId: string;
  runId: string;
  generation: number;
  invocationId: string;
  type:
    | 'accepted'
    | 'running'
    | 'cancel-requested'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'expired'
    | 'reconciliation-required';
  source: 'submit' | 'poll' | 'stream' | 'webhook' | 'coordinator';
  signatureVerified?: boolean;
  replayWindowValid?: boolean;
  payloadDigest: CanonicalDigest;
  occurredAt: Instant;
  eventDigest: CanonicalDigest;
}>;

export type AgentProviderJobIssue = Readonly<{
  code: 'AI-6012' | 'AI-9001';
  path: string;
  message: string;
  blocking: true;
}>;

export type AgentProviderJobTransition =
  | Readonly<{
      accepted: true;
      state: AgentProviderJob;
      receipt: AgentProviderJobReceipt;
    }>
  | Readonly<{
      accepted: false;
      auditOnly: boolean;
      state: AgentProviderJob;
      issues: readonly AgentProviderJobIssue[];
    }>;

const issue = (path: string, message: string): AgentProviderJobIssue =>
  Object.freeze({ code: 'AI-6012', path, message, blocking: true });

const eventBase = (
  event: Omit<AgentProviderJobEvent, 'eventDigest'>
): Omit<AgentProviderJobEvent, 'eventDigest'> => Object.freeze({ ...event });

export const createAgentProviderJobEvent = (
  event: Omit<AgentProviderJobEvent, 'eventDigest'>
): AgentProviderJobEvent => {
  if (!event.eventId.trim() || !Number.isFinite(Date.parse(event.occurredAt))) {
    throw new TypeError('Provider job event identity is invalid.');
  }
  if (!isAgentCanonicalDigest(event.payloadDigest)) {
    throw new TypeError('Provider job event payload digest is invalid.');
  }
  const base = eventBase(event);
  return Object.freeze({
    ...base,
    eventDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentProviderJob = (
  input: Readonly<{
    providerJobId: string;
    taskId: string;
    runId: string;
    generation: number;
    invocationId: string;
    requestDigest: CanonicalDigest;
  }>
): AgentProviderJob => {
  if (
    !input.providerJobId.trim() ||
    !input.taskId.trim() ||
    !input.runId.trim() ||
    !input.invocationId.trim() ||
    !Number.isSafeInteger(input.generation) ||
    input.generation < 0 ||
    !isAgentCanonicalDigest(input.requestDigest)
  ) {
    throw new TypeError('Provider job identity is invalid.');
  }
  const latestEventDigest = digestAgentCanonicalValue({
    ...input,
    phase: 'submitting',
  });
  return Object.freeze({
    ...input,
    phase: 'submitting',
    callbackAuthority: 'active',
    latestEventDigest,
  });
};

const eventOutcome = (
  type: AgentProviderJobEvent['type']
): AgentProviderJobOutcome | undefined => {
  switch (type) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    case 'reconciliation-required':
      return 'reconciliation-required';
    default:
      return undefined;
  }
};

const createReceipt = (state: AgentProviderJob): AgentProviderJobReceipt => {
  const base = {
    providerJobId: state.providerJobId,
    taskId: state.taskId,
    runId: state.runId,
    generation: state.generation,
    invocationId: state.invocationId,
    phase: state.phase,
    ...(state.outcome ? { outcome: state.outcome } : {}),
    callbackAuthority: state.callbackAuthority,
  } as const;
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

const nextJobPhase = (
  event: AgentProviderJobEvent,
  outcome: AgentProviderJobOutcome | undefined
): AgentProviderJob['phase'] => {
  if (event.type === 'cancel-requested') return 'cancelling';
  if (outcome) return 'terminal';
  return event.type === 'accepted' ? 'accepted' : 'running';
};

/** Applies webhook/poll events only while their exact Run generation owns the callback. */
export const reduceAgentProviderJob = (
  state: AgentProviderJob,
  event: AgentProviderJobEvent,
  currentGeneration: number
): AgentProviderJobTransition => {
  const { eventDigest: _eventDigest, ...base } = event;
  if (digestAgentCanonicalValue(base) !== event.eventDigest) {
    return Object.freeze({
      accepted: false,
      auditOnly: false,
      state,
      issues: Object.freeze([
        Object.freeze({
          code: 'AI-9001',
          path: '/eventDigest',
          message: 'Provider job event digest has drifted.',
          blocking: true,
        }),
      ]),
    });
  }
  const exactIdentity =
    event.providerJobId === state.providerJobId &&
    event.taskId === state.taskId &&
    event.runId === state.runId &&
    event.generation === state.generation &&
    event.invocationId === state.invocationId;
  if (!exactIdentity || event.generation !== currentGeneration) {
    return Object.freeze({
      accepted: false,
      auditOnly: true,
      state,
      issues: Object.freeze([
        issue(
          '/generation',
          'Provider job callback lost generation authority.'
        ),
      ]),
    });
  }
  if (event.eventDigest === state.latestEventDigest) {
    return Object.freeze({
      accepted: false,
      auditOnly: true,
      state,
      issues: Object.freeze([
        issue(
          '/eventDigest',
          'Duplicate provider job event was already applied.'
        ),
      ]),
    });
  }
  if (
    event.source === 'webhook' &&
    (event.signatureVerified !== true || event.replayWindowValid !== true)
  ) {
    return Object.freeze({
      accepted: false,
      auditOnly: true,
      state,
      issues: Object.freeze([
        issue(
          '/webhook',
          'Provider webhook signature or replay window is invalid.'
        ),
      ]),
    });
  }
  if (state.phase === 'terminal') {
    return Object.freeze({
      accepted: false,
      auditOnly: true,
      state,
      issues: Object.freeze([
        issue('/phase', 'Provider job is already terminal.'),
      ]),
    });
  }
  if (
    state.callbackAuthority === 'revoked' &&
    event.type !== 'cancelled' &&
    event.type !== 'reconciliation-required'
  ) {
    return Object.freeze({
      accepted: false,
      auditOnly: true,
      state,
      issues: Object.freeze([
        issue(
          '/callbackAuthority',
          'Late provider completion has no callback authority.'
        ),
      ]),
    });
  }

  const outcome = eventOutcome(event.type);
  const next: AgentProviderJob = Object.freeze({
    ...state,
    phase: nextJobPhase(event, outcome),
    ...(outcome ? { outcome } : {}),
    callbackAuthority:
      event.type === 'cancel-requested' || outcome
        ? 'revoked'
        : state.callbackAuthority,
    latestEventDigest: event.eventDigest,
  });
  return Object.freeze({
    accepted: true,
    state: next,
    receipt: createReceipt(next),
  });
};

export const createAgentProviderJobReceipt = createReceipt;
