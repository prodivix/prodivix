import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type {
  AgentComputerUseAction,
  AgentComputerUseActionAuthorization,
  AgentComputerUseSession,
  AgentComputerUseStepReceipt,
  AgentHostedCapabilityIssue,
} from './agentHosted.types';
import type { AgentToolFenceState } from './agentToolLifecycle';
import {
  HOSTED_IDENTITY_PATTERN,
  assertHostedCount,
  assertHostedDigest,
  assertHostedIdentity,
  assertHostedInstant,
  createHostedBlockedResult,
} from './agentHostedBoundaryValidation';

const dangerousTarget =
  /(?:^|[._:/-])(?:editor|approval|approve|permission|secret|credential|billing|deploy|deployment|publish|production|admin)(?:$|[._:/-])/iu;

export const createAgentComputerUseSession = (
  input: Omit<AgentComputerUseSession, 'sessionDigest'>
): AgentComputerUseSession => {
  for (const [label, value] of [
    ['Computer-use session id', input.sessionId],
    ['Computer-use task id', input.taskId],
    ['Computer-use run id', input.runId],
  ] as const) {
    assertHostedIdentity(value, label);
  }
  assertHostedDigest(
    input.networkPolicyDigest,
    'Computer-use network policy digest'
  );
  assertHostedDigest(input.viewportDigest, 'Computer-use viewport digest');
  assertHostedDigest(
    input.browserIdentityDigest,
    'Computer-use browser identity digest'
  );
  assertHostedInstant(input.createdAt, 'Computer-use creation instant');
  assertHostedInstant(input.expiresAt, 'Computer-use expiry instant');
  if (
    Date.parse(input.expiresAt) <= Date.parse(input.createdAt) ||
    !Number.isSafeInteger(input.generation) ||
    input.generation < 0 ||
    input.purpose !== 'verification-read-only' ||
    input.environment !== 'disposable-evaluation' ||
    input.browserProfile !== 'fresh-disposable' ||
    !['none', 'read-only-snapshot'].includes(input.workspaceAccess) ||
    input.productionSessionAccess !== 'none'
  ) {
    throw new TypeError(
      'Computer-use session is not disposable and read-only.'
    );
  }
  const targets = [...input.targetAllowlist].map((target) => {
    assertHostedIdentity(target, 'Computer-use target');
    if (dangerousTarget.test(target)) {
      throw new TypeError(
        'Computer-use target crosses an authoring or production boundary.'
      );
    }
    return target;
  });
  if (targets.length === 0 || new Set(targets).size !== targets.length) {
    throw new TypeError('Computer-use allowlist must be non-empty and unique.');
  }
  const base = {
    sessionId: input.sessionId,
    taskId: input.taskId,
    runId: input.runId,
    generation: input.generation,
    purpose: 'verification-read-only' as const,
    environment: 'disposable-evaluation' as const,
    browserProfile: 'fresh-disposable' as const,
    workspaceAccess: input.workspaceAccess,
    productionSessionAccess: 'none' as const,
    targetAllowlist: Object.freeze(targets.sort(compareUnicodeCodePoints)),
    networkPolicyDigest: input.networkPolicyDigest,
    maxSteps: assertHostedCount(input.maxSteps, 'Computer-use step limit', 1),
    maxElapsedMs: assertHostedCount(
      input.maxElapsedMs,
      'Computer-use time limit',
      1
    ),
    viewportDigest: input.viewportDigest,
    browserIdentityDigest: input.browserIdentityDigest,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
  } as const;
  return Object.freeze({
    ...base,
    sessionDigest: digestAgentCanonicalValue(base),
  });
};

export const validateAgentComputerUseSession = (
  session: AgentComputerUseSession
): boolean => {
  try {
    const { sessionDigest: _digest, ...base } = session;
    return sameCanonicalJson(createAgentComputerUseSession(base), session);
  } catch {
    return false;
  }
};

export const authorizeAgentComputerUseAction = (
  input: Readonly<{
    session: AgentComputerUseSession;
    action: AgentComputerUseAction;
    currentGeneration: number;
    step: number;
    adapterId: string;
    at: string;
  }>
):
  | Readonly<{ ok: true; authorization: AgentComputerUseActionAuthorization }>
  | Readonly<{ ok: false; issues: readonly AgentHostedCapabilityIssue[] }> => {
  if (!validateAgentComputerUseSession(input.session)) {
    return createHostedBlockedResult(
      'AI-7014',
      '/session',
      'Computer-use session is invalid or drifted.'
    );
  }
  if (
    input.currentGeneration !== input.session.generation ||
    input.step < 1 ||
    input.step > input.session.maxSteps ||
    !Number.isSafeInteger(input.step) ||
    !Number.isFinite(Date.parse(input.at)) ||
    Date.parse(input.at) < Date.parse(input.session.createdAt) ||
    Date.parse(input.at) >= Date.parse(input.session.expiresAt)
  ) {
    return createHostedBlockedResult(
      'AI-6003',
      '/step',
      'Computer-use action lost its session fence.'
    );
  }
  if (
    !HOSTED_IDENTITY_PATTERN.test(input.action.actionId) ||
    !['observe', 'scroll', 'pointer', 'keyboard', 'navigate'].includes(
      input.action.kind
    ) ||
    !isAgentCanonicalDigest(input.action.parametersDigest) ||
    !isAgentCanonicalDigest(input.action.screenshotDigest) ||
    input.action.viewportDigest !== input.session.viewportDigest ||
    input.action.browserIdentityDigest !==
      input.session.browserIdentityDigest ||
    !HOSTED_IDENTITY_PATTERN.test(input.action.suggestedByInvocationId) ||
    !input.session.targetAllowlist.includes(input.action.target) ||
    dangerousTarget.test(input.action.target)
  ) {
    return createHostedBlockedResult(
      'AI-7014',
      '/action',
      'Computer-use action is outside the verification allowlist.'
    );
  }
  assertHostedIdentity(input.adapterId, 'Computer-use adapter id');
  const actionDigest = digestAgentCanonicalValue(input.action);
  const expiresAt = new Date(
    Math.min(
      Date.parse(input.session.expiresAt),
      Date.parse(input.at) + input.session.maxElapsedMs
    )
  ).toISOString();
  const base = {
    sessionId: input.session.sessionId,
    sessionDigest: input.session.sessionDigest,
    generation: input.session.generation,
    step: input.step,
    actionDigest,
    adapterId: input.adapterId,
    authorizedAt: input.at,
    expiresAt,
  } as const;
  return Object.freeze({
    ok: true,
    authorization: Object.freeze({
      ...base,
      authorizationDigest: digestAgentCanonicalValue(base),
    }),
  });
};

export const createAgentComputerUseStepReceipt = (
  input: Readonly<{
    session: AgentComputerUseSession;
    action: AgentComputerUseAction;
    authorization: AgentComputerUseActionAuthorization;
    currentGeneration: number;
    resultDigest: string;
    usage: AgentComputerUseStepReceipt['usage'];
    completedAt: string;
  }>
): AgentComputerUseStepReceipt => {
  assertHostedDigest(input.resultDigest, 'Computer-use result digest');
  assertHostedInstant(input.completedAt, 'Computer-use completion instant');
  const { authorizationDigest: _digest, ...authorizationBase } =
    input.authorization;
  if (
    !validateAgentComputerUseSession(input.session) ||
    digestAgentCanonicalValue(authorizationBase) !==
      input.authorization.authorizationDigest ||
    input.authorization.sessionDigest !== input.session.sessionDigest ||
    input.authorization.generation !== input.currentGeneration ||
    input.authorization.actionDigest !==
      digestAgentCanonicalValue(input.action) ||
    Date.parse(input.completedAt) <
      Date.parse(input.authorization.authorizedAt) ||
    Date.parse(input.completedAt) >= Date.parse(input.authorization.expiresAt)
  ) {
    throw new TypeError('Computer-use step receipt crossed its adapter fence.');
  }
  const base = {
    sessionId: input.session.sessionId,
    sessionDigest: input.session.sessionDigest,
    generation: input.currentGeneration,
    step: input.authorization.step,
    action: Object.freeze({ ...input.action }),
    adapterAuthorizationDigest: input.authorization.authorizationDigest,
    resultDigest: input.resultDigest,
    usage: input.usage,
    completedAt: input.completedAt,
  } as const;
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentComputerUseFenceCurrent = (
  authorization: AgentComputerUseActionAuthorization,
  state: AgentToolFenceState
): boolean =>
  !state.revoked &&
  authorization.generation === state.generation &&
  Date.parse(state.at) < Date.parse(authorization.expiresAt);
