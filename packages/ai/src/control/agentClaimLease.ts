import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import type {
  AgentClaimLease,
  AgentControlIssue,
  AgentRunSnapshot,
} from './agentControl.types';
import {
  controlIssue,
  hasExactAgentControlKeys,
  isAgentControlIdentity,
  isAgentControlInstant,
} from './agentControlValidation';

export type AgentClaimLeaseResult =
  | Readonly<{ claimed: true; replayed: boolean; lease: AgentClaimLease }>
  | Readonly<{ claimed: false; issues: readonly AgentControlIssue[] }>;

export const createAgentClaimLease = (
  input: Omit<AgentClaimLease, 'leaseDigest'>
): AgentClaimLease => {
  if (
    !isAgentControlIdentity(input.leaseId) ||
    !isAgentControlIdentity(input.holderId) ||
    !isAgentControlIdentity(input.runId) ||
    !Number.isSafeInteger(input.generation) ||
    input.generation < 1 ||
    !isAgentControlInstant(input.acquiredAt) ||
    !isAgentControlInstant(input.expiresAt) ||
    Date.parse(input.expiresAt) <= Date.parse(input.acquiredAt)
  ) {
    throw new TypeError('AgentRun claim lease is invalid.');
  }
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    leaseDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentClaimLease = (value: unknown): value is AgentClaimLease => {
  try {
    if (
      !hasExactAgentControlKeys(value, [
        'leaseId',
        'holderId',
        'runId',
        'generation',
        'acquiredAt',
        'expiresAt',
        'leaseDigest',
      ])
    ) {
      return false;
    }
    const { leaseDigest, ...base } = value;
    return (
      createAgentClaimLease(base as Omit<AgentClaimLease, 'leaseDigest'>)
        .leaseDigest === leaseDigest
    );
  } catch {
    return false;
  }
};

export const isAgentClaimLeaseCurrent = (
  lease: AgentClaimLease,
  state: AgentRunSnapshot,
  input: Readonly<{ holderId: string; leaseId: string; checkedAt: string }>
): boolean =>
  isAgentClaimLease(lease) &&
  lease.runId === state.run.runId &&
  lease.generation === state.run.generation &&
  lease.holderId === input.holderId &&
  lease.leaseId === input.leaseId &&
  isAgentControlInstant(input.checkedAt) &&
  Date.parse(input.checkedAt) >= Date.parse(lease.acquiredAt) &&
  Date.parse(input.checkedAt) < Date.parse(lease.expiresAt) &&
  state.run.phase !== 'terminal' &&
  state.callbackAuthority === 'active';

export const claimAgentRunLease = (
  existing: AgentClaimLease | undefined,
  state: AgentRunSnapshot,
  input: Readonly<{
    leaseId: string;
    holderId: string;
    acquiredAt: string;
    expiresAt: string;
  }>
): AgentClaimLeaseResult => {
  if (
    state.run.phase === 'terminal' ||
    state.callbackAuthority !== 'active' ||
    state.run.generation < 1
  ) {
    return Object.freeze({
      claimed: false,
      issues: Object.freeze([
        controlIssue(
          'AI-6003',
          '/run',
          'AgentRun does not expose active callback authority to a worker.'
        ),
      ]),
    });
  }
  let requested: AgentClaimLease;
  try {
    requested = createAgentClaimLease({
      ...input,
      runId: state.run.runId,
      generation: state.run.generation,
    });
  } catch (error) {
    return Object.freeze({
      claimed: false,
      issues: Object.freeze([
        controlIssue(
          'AI-6004',
          '/lease',
          error instanceof Error ? error.message : 'Claim lease is invalid.'
        ),
      ]),
    });
  }
  if (!existing) {
    return Object.freeze({ claimed: true, replayed: false, lease: requested });
  }
  if (existing.leaseDigest === requested.leaseDigest) {
    return Object.freeze({ claimed: true, replayed: true, lease: existing });
  }
  if (Date.parse(input.acquiredAt) < Date.parse(existing.expiresAt)) {
    return Object.freeze({
      claimed: false,
      issues: Object.freeze([
        controlIssue(
          'AI-6004',
          '/lease',
          'AgentRun is held by another unexpired claim lease.'
        ),
      ]),
    });
  }
  return Object.freeze({ claimed: true, replayed: false, lease: requested });
};
