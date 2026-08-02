import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type {
  AgentRealtimeMediaSession,
  AgentRealtimeTurn,
} from './agentMultimodal.types';

const opaqueAuthorizationRef = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;
const decimalPattern = /^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u;

const sessionBase = (
  input: Omit<AgentRealtimeMediaSession, 'sessionDigest'>
) => ({
  ...input,
  deviceKinds: Object.freeze(
    [...input.deviceKinds].sort(compareUnicodeCodePoints)
  ),
  maxCost: Object.freeze({ ...input.maxCost }),
});

export const createAgentRealtimeMediaSession = (
  input: Omit<AgentRealtimeMediaSession, 'sessionDigest'>
): AgentRealtimeMediaSession => {
  const { sessionDigest: _sessionDigest, ...cleanInput } =
    input as AgentRealtimeMediaSession;
  if (
    !input.sessionId.trim() ||
    !input.taskId.trim() ||
    !input.runId.trim() ||
    !Number.isSafeInteger(input.generation) ||
    input.generation < 1 ||
    !Number.isSafeInteger(input.transportGeneration) ||
    input.transportGeneration < 1 ||
    !isAgentCanonicalDigest(input.capabilityQualificationDigest) ||
    !isAgentCanonicalDigest(input.mediaPolicyDigest) ||
    !isAgentCanonicalDigest(input.deviceGrantDigest) ||
    !opaqueAuthorizationRef.test(input.authorizationRef) ||
    !Number.isFinite(Date.parse(input.startedAt)) ||
    !Number.isFinite(Date.parse(input.authorizationExpiresAt)) ||
    Date.parse(input.authorizationExpiresAt) <= Date.parse(input.startedAt) ||
    !Number.isSafeInteger(input.maxDurationMs) ||
    input.maxDurationMs < 1 ||
    !/^[A-Z]{3}$/u.test(input.maxCost.currency) ||
    !decimalPattern.test(input.maxCost.maximum) ||
    input.deviceKinds.length < 1 ||
    new Set(input.deviceKinds).size !== input.deviceKinds.length ||
    input.deviceKinds.some(
      (kind) => kind !== 'microphone' && kind !== 'camera'
    ) ||
    !['active', 'fenced', 'terminal'].includes(input.state)
  ) {
    throw new TypeError(
      'Realtime media session identity or budget is invalid.'
    );
  }
  const base = Object.freeze(sessionBase(cleanInput));
  return Object.freeze({
    ...base,
    sessionDigest: digestAgentCanonicalValue(base),
  });
};

export const fenceAgentRealtimeMediaSession = (
  session: AgentRealtimeMediaSession
): AgentRealtimeMediaSession => {
  const current = createAgentRealtimeMediaSession(session);
  if (current.sessionDigest !== session.sessionDigest) {
    throw new TypeError('Realtime media session digest drifted.');
  }
  return createAgentRealtimeMediaSession({
    ...current,
    state: 'fenced',
  });
};

export const reconnectAgentRealtimeMediaSession = (
  session: AgentRealtimeMediaSession,
  input: Readonly<{
    authorizationRef: string;
    authorizationExpiresAt: string;
  }>
): Readonly<{
  previous: AgentRealtimeMediaSession;
  next: AgentRealtimeMediaSession;
}> => {
  const current = createAgentRealtimeMediaSession(session);
  if (
    current.sessionDigest !== session.sessionDigest ||
    current.state === 'terminal'
  ) {
    throw new TypeError(
      'Terminal or drifted realtime session cannot reconnect.'
    );
  }
  const previous = fenceAgentRealtimeMediaSession(session);
  const next = createAgentRealtimeMediaSession({
    ...current,
    transportGeneration: current.transportGeneration + 1,
    authorizationRef: input.authorizationRef,
    authorizationExpiresAt: input.authorizationExpiresAt,
    state: 'active',
  });
  return Object.freeze({ previous, next });
};

export const createAgentRealtimeTurn = (
  input: Omit<AgentRealtimeTurn, 'turnDigest'>
): AgentRealtimeTurn => {
  const { turnDigest: _turnDigest, ...cleanInput } = input as AgentRealtimeTurn;
  if (
    !input.turnId.trim() ||
    !input.sessionId.trim() ||
    !Number.isSafeInteger(input.transportGeneration) ||
    input.transportGeneration < 1 ||
    !isAgentCanonicalDigest(input.contentDigest) ||
    !['partial', 'final', 'interrupted'].includes(input.state) ||
    input.instructionBoundary !== 'data-only' ||
    input.proposalAuthority !== 'none'
  ) {
    throw new TypeError('Realtime media turn is invalid.');
  }
  const base = Object.freeze({ ...cleanInput });
  return Object.freeze({
    ...base,
    turnDigest: digestAgentCanonicalValue(base),
  });
};

/** Only an exact final turn from the active transport may enter Context. */
export const admitFinalAgentRealtimeTurn = (
  session: AgentRealtimeMediaSession,
  turn: AgentRealtimeTurn,
  evaluatedAt: string
): Readonly<{
  admitted: boolean;
  reason?: 'partial' | 'fenced' | 'identity-drift' | 'expired';
}> => {
  let currentSession: AgentRealtimeMediaSession;
  let currentTurn: AgentRealtimeTurn;
  try {
    currentSession = createAgentRealtimeMediaSession(session);
    currentTurn = createAgentRealtimeTurn(turn);
  } catch {
    return Object.freeze({ admitted: false, reason: 'identity-drift' });
  }
  if (
    currentSession.sessionDigest !== session.sessionDigest ||
    currentTurn.turnDigest !== turn.turnDigest ||
    turn.sessionId !== session.sessionId
  ) {
    return Object.freeze({ admitted: false, reason: 'identity-drift' });
  }
  if (
    session.state !== 'active' ||
    turn.transportGeneration !== session.transportGeneration
  ) {
    return Object.freeze({ admitted: false, reason: 'fenced' });
  }
  if (
    !Number.isFinite(Date.parse(evaluatedAt)) ||
    Date.parse(evaluatedAt) < Date.parse(session.startedAt) ||
    Date.parse(session.authorizationExpiresAt) <= Date.parse(evaluatedAt) ||
    Date.parse(evaluatedAt) - Date.parse(session.startedAt) >
      session.maxDurationMs
  ) {
    return Object.freeze({ admitted: false, reason: 'expired' });
  }
  if (turn.state !== 'final') {
    return Object.freeze({ admitted: false, reason: 'partial' });
  }
  return Object.freeze({ admitted: true });
};
