import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type {
  AgentJsonValue,
  AgentToolDescriptor,
  AgentToolRegistrySnapshot,
  Instant,
} from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  sameAgentWorkspaceRevision,
} from '../domain/agentCanonical';
import {
  reserveAgentBudget,
  settleAgentBudget,
  type AgentBudgetDemand,
  type AgentBudgetLedgerState,
} from '../usage/agentBudgetLedger';
import { compareAgentDecimals } from '../usage/agentUsage';
import type {
  AgentHostedCapabilityIssue,
  AgentHostedToolAdapter,
  AgentHostedToolExecutionResult,
  AgentToolAdapterResult,
  AgentToolCallAuthorization,
  AgentToolCallPreflightResult,
  AgentToolCallReceipt,
  AgentToolCallRequest,
  AgentToolCleanupReceipt,
} from './agentHosted.types';
import {
  validateAgentToolDescriptor,
  validateAgentToolRegistrySnapshot,
} from './agentToolRegistry';

const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;
const maximumJsonDepth = 32;
const maximumJsonNodes = 50_000;

const issue = (
  code: AgentHostedCapabilityIssue['code'],
  path: string,
  message: string
): AgentHostedCapabilityIssue =>
  Object.freeze({ code, path, message, blocking: true });

const sortIssues = (
  issues: readonly AgentHostedCapabilityIssue[]
): readonly AgentHostedCapabilityIssue[] =>
  Object.freeze(
    [...issues].sort(
      (left, right) =>
        compareUnicodeCodePoints(left.path, right.path) ||
        compareUnicodeCodePoints(left.code, right.code) ||
        compareUnicodeCodePoints(left.message, right.message)
    )
  );

const validInstant = (value: Instant): boolean =>
  Number.isFinite(Date.parse(value));

const targetsAreEqual = (
  left: AgentToolCallRequest['targetScope'],
  right: AgentToolCallRequest['targetScope']
): boolean => sameCanonicalJson(left, right);

const requestTargetsAreWithinGrant = (
  request: AgentToolCallRequest,
  descriptor: AgentToolDescriptor
): boolean => {
  const grantTargets = new Set(
    request.grant.targetScope.targets.map(
      ({ kind, id }) => `${kind}\u0000${id}`
    )
  );
  return (
    (request.targetScope.targets.length > 0 ||
      descriptor.targetScopePolicy.allowEmpty) &&
    request.targetScope.targets.every(
      ({ kind, id }) =>
        descriptor.targetScopePolicy.allowedTargetKinds.includes(kind) &&
        grantTargets.has(`${kind}\u0000${id}`)
    ) &&
    (!descriptor.targetScopePolicy.requireExactGrantMatch ||
      targetsAreEqual(request.targetScope, request.grant.targetScope))
  );
};

const usageAmountMaximum = (
  amount: AgentBudgetDemand['usage']['amounts'][number]
): string | undefined => {
  const known = [
    amount.logicalAmount,
    amount.billableAmount,
    amount.cachedAmount,
  ].filter((value): value is string => value !== undefined);
  return known.reduce<string | undefined>(
    (maximum, value) =>
      maximum === undefined || compareAgentDecimals(value, maximum) > 0
        ? value
        : maximum,
    undefined
  );
};

const demandFitsDescriptor = (
  demand: AgentBudgetDemand,
  descriptor: AgentToolDescriptor
): boolean => {
  if (
    demand.toolCalls !== 1 ||
    demand.modelInvocations !== 0 ||
    demand.repairRounds !== 0 ||
    demand.transactions !== 0 ||
    demand.artifactBytes > descriptor.budgetProfile.maxArtifactBytes ||
    demand.elapsedMs > descriptor.budgetProfile.maxElapsedMs
  ) {
    return false;
  }
  return demand.usage.amounts.every((amount) => {
    const limit = descriptor.budgetProfile.usageLimits.find(
      ({ unit }) => unit === amount.unit
    );
    const maximum = usageAmountMaximum(amount);
    return (
      limit !== undefined &&
      amount.confidence !== 'unknown' &&
      maximum !== undefined &&
      compareAgentDecimals(maximum, limit.maximum) <= 0
    );
  });
};

const findDescriptor = (
  registry: AgentToolRegistrySnapshot,
  digest: string
): AgentToolDescriptor | undefined =>
  registry.descriptors.find(
    ({ descriptorDigest }) => descriptorDigest === digest
  );

const inspectJson = (value: unknown): boolean => {
  const ancestors = new Set<object>();
  let nodes = 0;
  const visit = (candidate: unknown, depth: number): boolean => {
    nodes += 1;
    if (nodes > maximumJsonNodes || depth > maximumJsonDepth) return false;
    if (
      candidate === null ||
      typeof candidate === 'string' ||
      typeof candidate === 'boolean'
    ) {
      return true;
    }
    if (typeof candidate === 'number') return Number.isFinite(candidate);
    if (typeof candidate !== 'object' || ancestors.has(candidate)) return false;
    ancestors.add(candidate);
    try {
      if (Array.isArray(candidate)) {
        const descriptors = Object.getOwnPropertyDescriptors(candidate);
        const keys = Object.getOwnPropertyNames(candidate).filter(
          (key) => key !== 'length'
        );
        return (
          keys.length === candidate.length &&
          keys.every((key, index) => key === String(index)) &&
          Object.getOwnPropertySymbols(candidate).length === 0 &&
          keys.every((key) => {
            const descriptor = descriptors[key];
            return (
              descriptor?.enumerable === true &&
              'value' in descriptor &&
              visit(descriptor.value, depth + 1)
            );
          })
        );
      }
      if (
        !isPlainObject(candidate) ||
        Object.getOwnPropertySymbols(candidate).length > 0
      ) {
        return false;
      }
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      return Object.getOwnPropertyNames(candidate).every((key) => {
        const descriptor = descriptors[key];
        return (
          !isUnsafeObjectKey(key) &&
          descriptor?.enumerable === true &&
          'value' in descriptor &&
          visit(descriptor.value, depth + 1)
        );
      });
    } finally {
      ancestors.delete(candidate);
    }
  };
  return visit(value, 0);
};

const normalizeJson = (
  value: AgentJsonValue,
  maximumBytes: number
): Readonly<{ value: AgentJsonValue; byteLength: number }> => {
  if (!inspectJson(value)) {
    throw new TypeError('Tool payload must be acyclic safe JSON.');
  }
  const text = canonicalJsonText(value);
  const byteLength = new TextEncoder().encode(text).byteLength;
  if (byteLength > maximumBytes) {
    throw new RangeError('Tool payload exceeds its descriptor byte limit.');
  }
  return Object.freeze({
    value: JSON.parse(text) as AgentJsonValue,
    byteLength,
  });
};

const validateRequestIdentity = (request: AgentToolCallRequest): boolean =>
  [
    request.identity.callId,
    request.identity.invocationId,
    request.identity.taskId,
    request.identity.runId,
  ].every((value) => identityPattern.test(value)) &&
  (!request.identity.parentCallId ||
    identityPattern.test(request.identity.parentCallId)) &&
  Number.isSafeInteger(request.identity.generation) &&
  request.identity.generation >= 0 &&
  Number.isSafeInteger(request.identity.depth) &&
  request.identity.depth >= 0;

export const preflightAgentToolCall = (
  request: AgentToolCallRequest,
  input: Readonly<{
    registry: AgentToolRegistrySnapshot;
    ledger: AgentBudgetLedgerState;
    currentGeneration: number;
    at: Instant;
  }>
): AgentToolCallPreflightResult => {
  const issues: AgentHostedCapabilityIssue[] = [];
  if (!validateAgentToolRegistrySnapshot(input.registry)) {
    issues.push(
      issue(
        'AI-7012',
        '/registry',
        'Tool registry snapshot is invalid or drifted.'
      )
    );
  }
  if (!validateRequestIdentity(request)) {
    issues.push(
      issue('AI-9001', '/identity', 'Tool call identity is invalid.')
    );
  }
  if (
    !['browser', 'server', 'native', 'sandbox'].includes(request.runtimeZone) ||
    !['per-call', 'opaque-chain'].includes(request.observability)
  ) {
    issues.push(
      issue('AI-9001', '/execution', 'Tool execution boundary enum is invalid.')
    );
  }
  const descriptor = findDescriptor(input.registry, request.descriptorDigest);
  if (
    request.registryDigest !== input.registry.registryDigest ||
    !descriptor ||
    !validateAgentToolDescriptor(descriptor)
  ) {
    issues.push(
      issue(
        'AI-7012',
        '/descriptorDigest',
        'Tool call is outside the exact registry snapshot.'
      )
    );
  }
  if (
    !validInstant(input.at) ||
    !validInstant(request.requestedAt) ||
    Date.parse(input.at) < Date.parse(request.requestedAt)
  ) {
    issues.push(issue('AI-9001', '/requestedAt', 'Tool call time is invalid.'));
  }
  if (request.identity.generation !== input.currentGeneration) {
    issues.push(
      issue(
        'AI-6003',
        '/identity/generation',
        'Tool call generation lost authority.'
      )
    );
  }
  const grant = request.grant;
  if (
    grant.taskId !== request.identity.taskId ||
    (grant.runId !== undefined && grant.runId !== request.identity.runId) ||
    grant.policyDigest !== request.effectivePolicyDigest ||
    !sameAgentWorkspaceRevision(grant.baseRevision, request.workspaceRevision)
  ) {
    issues.push(
      issue(
        'AI-7001',
        '/grant',
        'Tool grant does not bind the exact call slice.'
      )
    );
  }
  if (
    !validInstant(grant.issuedAt) ||
    !validInstant(grant.expiresAt) ||
    Date.parse(input.at) < Date.parse(grant.issuedAt) ||
    Date.parse(input.at) >= Date.parse(grant.expiresAt)
  ) {
    issues.push(
      issue('AI-7001', '/grant/expiresAt', 'Tool grant is not active.')
    );
  }
  if (descriptor) {
    if (
      !grant.toolIds.includes(descriptor.toolId) ||
      descriptor.requiredCapabilities.some(
        (capability) => !grant.capabilities.includes(capability)
      ) ||
      !grant.runtimeZones.includes(request.runtimeZone)
    ) {
      issues.push(
        issue(
          'AI-7001',
          '/grant/capabilities',
          'Tool id, capability, or runtime zone is not granted.'
        )
      );
    }
    if (!requestTargetsAreWithinGrant(request, descriptor)) {
      issues.push(
        issue(
          'AI-7001',
          '/targetScope',
          'Tool target is outside its exact grant.'
        )
      );
    }
    if (
      descriptor.networkPolicyRef &&
      descriptor.networkPolicyRef !== grant.networkPolicyRef
    ) {
      issues.push(
        issue(
          'AI-7004',
          '/networkPolicyRef',
          'Tool network policy is not granted.'
        )
      );
    }
    if (
      descriptor.secretPurposeRefs.some(
        (purpose) =>
          !grant.secretRefs.some((reference) => reference.purpose === purpose)
      ) ||
      (descriptor.secretPurposeRefs.length > 0 &&
        request.runtimeZone === 'browser')
    ) {
      issues.push(
        issue(
          'AI-7003',
          '/secretPurposeRefs',
          'Tool Secret purpose is not granted.'
        )
      );
    }
    if (
      request.observability === 'opaque-chain' &&
      (descriptor.effect !== 'read' ||
        descriptor.networkPolicyRef !== undefined ||
        descriptor.secretPurposeRefs.length > 0)
    ) {
      issues.push(
        issue(
          'AI-7012',
          '/observability',
          'Opaque nested chains are limited to side-effect-free bounded reads.'
        )
      );
    }
    if (
      request.identity.depth > descriptor.concurrencyPolicy.maxDepth ||
      (request.identity.depth > 0 &&
        descriptor.budgetProfile.maxNestedCalls === 0)
    ) {
      issues.push(
        issue(
          'AI-7015',
          '/identity/depth',
          'Tool nested depth exceeds its bound.'
        )
      );
    }
    if (
      request.inputByteLength < 0 ||
      request.inputByteLength > descriptor.budgetProfile.maxInputBytes ||
      !isAgentCanonicalDigest(request.inputDigest)
    ) {
      issues.push(
        issue(
          'AI-7012',
          '/inputDigest',
          'Tool input identity or size is invalid.'
        )
      );
    }
    if (!demandFitsDescriptor(request.budgetDemand, descriptor)) {
      issues.push(
        issue(
          'AI-6002',
          '/budgetDemand',
          'Tool demand exceeds its descriptor budget.'
        )
      );
    }
  }
  for (const [path, digest] of [
    ['/effectivePolicyDigest', request.effectivePolicyDigest],
    ['/contextPackDigest', request.contextPackDigest],
    ['/capabilityQualificationDigest', request.capabilityQualificationDigest],
  ] as const) {
    if (!isAgentCanonicalDigest(digest)) {
      issues.push(
        issue('AI-9001', path, 'Tool call binding digest is invalid.')
      );
    }
  }
  if (issues.length > 0 || !descriptor) {
    return Object.freeze({
      ok: false,
      issues: sortIssues(issues),
      ledger: input.ledger,
    });
  }
  const reservationId = `tool-call:${request.identity.callId}`;
  const reserved = reserveAgentBudget(input.ledger, {
    reservationId,
    expectedRevision: input.ledger.revision,
    demand: request.budgetDemand,
    reservedAt: input.at,
  });
  if (!reserved.ok) {
    return Object.freeze({
      ok: false,
      issues: sortIssues(
        reserved.issues.map((entry) =>
          issue(entry.code, `/budget${entry.path}`, entry.message)
        )
      ),
      ledger: reserved.state,
    });
  }
  const expiresAt = new Date(
    Math.min(
      Date.parse(grant.expiresAt),
      Date.parse(input.at) + descriptor.budgetProfile.maxElapsedMs
    )
  ).toISOString();
  const fenceBase = {
    callId: request.identity.callId,
    generation: request.identity.generation,
    registryDigest: request.registryDigest,
    descriptorDigest: request.descriptorDigest,
    policyDigest: request.effectivePolicyDigest,
    contextPackDigest: request.contextPackDigest,
    grantId: grant.grantId,
  } as const;
  const authorizationBase = {
    identity: Object.freeze({ ...request.identity }),
    registryDigest: request.registryDigest,
    descriptorDigest: request.descriptorDigest,
    grantId: grant.grantId,
    reservationId,
    effectivePolicyDigest: request.effectivePolicyDigest,
    contextPackDigest: request.contextPackDigest,
    capabilityQualificationDigest: request.capabilityQualificationDigest,
    inputDigest: request.inputDigest,
    targetScopeDigest: digestAgentCanonicalValue(request.targetScope),
    callFenceDigest: digestAgentCanonicalValue(fenceBase),
    authorizedAt: input.at,
    expiresAt,
  } as const;
  return Object.freeze({
    ok: true,
    authorization: Object.freeze({
      ...authorizationBase,
      authorizationDigest: digestAgentCanonicalValue(authorizationBase),
    }),
    ledger: reserved.state,
  });
};

export type AgentToolFenceState = Readonly<{
  taskId: string;
  runId: string;
  generation: number;
  registryDigest: string;
  descriptorDigest: string;
  effectivePolicyDigest: string;
  contextPackDigest: string;
  grantId: string;
  revoked: boolean;
  at: Instant;
}>;

export const isAgentToolCallAuthorizationCurrent = (
  authorization: AgentToolCallAuthorization,
  state: AgentToolFenceState
): boolean => {
  const { authorizationDigest: _digest, ...base } = authorization;
  return (
    digestAgentCanonicalValue(base) === authorization.authorizationDigest &&
    !state.revoked &&
    validInstant(state.at) &&
    Date.parse(state.at) < Date.parse(authorization.expiresAt) &&
    authorization.identity.taskId === state.taskId &&
    authorization.identity.runId === state.runId &&
    authorization.identity.generation === state.generation &&
    authorization.registryDigest === state.registryDigest &&
    authorization.descriptorDigest === state.descriptorDigest &&
    authorization.effectivePolicyDigest === state.effectivePolicyDigest &&
    authorization.contextPackDigest === state.contextPackDigest &&
    authorization.grantId === state.grantId &&
    digestAgentCanonicalValue({
      callId: authorization.identity.callId,
      generation: state.generation,
      registryDigest: state.registryDigest,
      descriptorDigest: state.descriptorDigest,
      policyDigest: state.effectivePolicyDigest,
      contextPackDigest: state.contextPackDigest,
      grantId: state.grantId,
    }) === authorization.callFenceDigest
  );
};

export const createAgentToolCleanupReceipt = (
  input: Omit<AgentToolCleanupReceipt, 'receiptDigest'>
): AgentToolCleanupReceipt => {
  if (
    !identityPattern.test(input.cleanupId) ||
    !validInstant(input.completedAt) ||
    !['none', 'detected', 'unknown'].includes(input.residualState) ||
    typeof input.providerStateDeleted !== 'boolean' ||
    (input.providerStateDeleted && input.deletionReceiptRef === undefined) ||
    (!input.providerStateDeleted && input.deletionReceiptRef !== undefined)
  ) {
    throw new TypeError('Tool cleanup receipt is invalid.');
  }
  const base = {
    cleanupId: input.cleanupId,
    residualState: input.residualState,
    providerStateDeleted: input.providerStateDeleted,
    ...(input.deletionReceiptRef
      ? { deletionReceiptRef: input.deletionReceiptRef }
      : {}),
    completedAt: input.completedAt,
  } as const;
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

const cleanupIsSafe = (cleanup: AgentToolCleanupReceipt): boolean => {
  try {
    const { receiptDigest: _digest, ...base } = cleanup;
    return (
      sameCanonicalJson(createAgentToolCleanupReceipt(base), cleanup) &&
      cleanup.residualState === 'none'
    );
  } catch {
    return false;
  }
};

const resultDisposition = (
  descriptor: AgentToolDescriptor,
  result: AgentToolAdapterResult,
  current: boolean
): AgentToolCallReceipt['resultDisposition'] => {
  if (!current) return 'audit-only';
  if (result.status !== 'succeeded') return 'discarded';
  return descriptor.effect === 'proposal'
    ? 'staged-proposal-only'
    : 'context-data-only';
};

export const executeAgentHostedToolCall = async (
  input: Readonly<{
    request: AgentToolCallRequest;
    registry: AgentToolRegistrySnapshot;
    ledger: AgentBudgetLedgerState;
    payload: AgentJsonValue;
    adapter: AgentHostedToolAdapter;
    currentGeneration: number;
    preflightAt: Instant;
    readFence: () => AgentToolFenceState;
  }>
): Promise<AgentHostedToolExecutionResult> => {
  let normalizedInput: Readonly<{ value: AgentJsonValue; byteLength: number }>;
  const descriptor = findDescriptor(
    input.registry,
    input.request.descriptorDigest
  );
  try {
    normalizedInput = normalizeJson(
      input.payload,
      descriptor?.budgetProfile.maxInputBytes ?? 0
    );
  } catch (error) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze([
        issue('AI-7012', '/payload', (error as Error).message),
      ]),
      ledger: input.ledger,
    });
  }
  if (
    normalizedInput.byteLength !== input.request.inputByteLength ||
    digestAgentCanonicalValue(normalizedInput.value) !==
      input.request.inputDigest
  ) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze([
        issue(
          'AI-7012',
          '/payload',
          'Tool payload does not match its authorized identity.'
        ),
      ]),
      ledger: input.ledger,
    });
  }
  const preflight = preflightAgentToolCall(input.request, {
    registry: input.registry,
    ledger: input.ledger,
    currentGeneration: input.currentGeneration,
    at: input.preflightAt,
  });
  if (!preflight.ok) {
    return Object.freeze({
      status: 'blocked',
      issues: preflight.issues,
      ledger: preflight.ledger,
    });
  }
  if (!descriptor) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze([
        issue('AI-7012', '/descriptorDigest', 'Tool descriptor is missing.'),
      ]),
      ledger: preflight.ledger,
    });
  }
  if (
    input.adapter.descriptorDigest !== descriptor.descriptorDigest ||
    !isAgentToolCallAuthorizationCurrent(
      preflight.authorization,
      input.readFence()
    )
  ) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze([
        issue(
          'AI-6003',
          '/adapter',
          'Tool adapter or pre-execution fence drifted.'
        ),
      ]),
      ledger: preflight.ledger,
    });
  }
  let candidate: AgentToolAdapterResult;
  try {
    candidate = await input.adapter.execute({
      authorization: preflight.authorization,
      payload: normalizedInput.value,
    });
  } catch {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze([
        issue(
          'AI-7012',
          '/adapter',
          'Tool adapter failed without a terminal receipt.'
        ),
      ]),
      ledger: preflight.ledger,
    });
  }
  if (
    !['succeeded', 'failed', 'cancelled'].includes(candidate.status) ||
    !validInstant(candidate.completedAt) ||
    Date.parse(candidate.completedAt) < Date.parse(input.preflightAt) ||
    !cleanupIsSafe(candidate.cleanup) ||
    !demandFitsDescriptor(candidate.actualDemand, descriptor)
  ) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze([
        issue(
          'AI-7012',
          '/adapter/result',
          'Tool terminal, usage, or cleanup receipt is invalid.'
        ),
      ]),
      ledger: preflight.ledger,
    });
  }
  let normalizedOutput: AgentJsonValue | undefined;
  let outputByteLength = 0;
  try {
    if (candidate.output !== undefined) {
      const output = normalizeJson(
        candidate.output,
        descriptor.budgetProfile.maxOutputBytes
      );
      normalizedOutput = output.value;
      outputByteLength = output.byteLength;
    }
  } catch (error) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze([
        issue('AI-7012', '/adapter/output', (error as Error).message),
      ]),
      ledger: preflight.ledger,
    });
  }
  if (
    (candidate.status === 'succeeded') !== (normalizedOutput !== undefined) ||
    new Set(candidate.artifactRefs).size !== candidate.artifactRefs.length ||
    candidate.artifactRefs.some((reference) => !identityPattern.test(reference))
  ) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze([
        issue(
          'AI-7012',
          '/adapter/output',
          'Tool result shape is inconsistent.'
        ),
      ]),
      ledger: preflight.ledger,
    });
  }
  const settled = settleAgentBudget(preflight.ledger, {
    reservationId: preflight.authorization.reservationId,
    expectedRevision: preflight.ledger.revision,
    actual: candidate.actualDemand,
    settledAt: candidate.completedAt,
  });
  if (!settled.ok) {
    return Object.freeze({
      status: 'blocked',
      issues: sortIssues(
        settled.issues.map((entry) =>
          issue(entry.code, `/budget${entry.path}`, entry.message)
        )
      ),
      ledger: settled.state,
    });
  }
  const current =
    isAgentToolCallAuthorizationCurrent(
      preflight.authorization,
      input.readFence()
    ) &&
    Date.parse(candidate.completedAt) <
      Date.parse(preflight.authorization.expiresAt);
  const terminalStatus: AgentToolCallReceipt['terminalStatus'] = current
    ? candidate.status
    : 'fenced';
  const disposition = resultDisposition(descriptor, candidate, current);
  const artifactRefs = Object.freeze(
    [...candidate.artifactRefs].sort(compareUnicodeCodePoints)
  );
  const includeOutput =
    normalizedOutput !== undefined &&
    candidate.status === 'succeeded' &&
    current;
  const receiptBase = {
    identity: Object.freeze({ ...input.request.identity }),
    registryDigest: input.registry.registryDigest,
    descriptorDigest: descriptor.descriptorDigest,
    executionLocus: descriptor.executionLocus,
    effect: descriptor.effect,
    authorizationDigest: preflight.authorization.authorizationDigest,
    reservationId: preflight.authorization.reservationId,
    lifecycle: Object.freeze([
      'decoded',
      'preflighted',
      'authorized',
      'budget-reserved',
      'executed',
      ...(includeOutput
        ? (['normalized', 'redacted', 'staged', 'finalized'] as const)
        : []),
      'cleaned',
    ] as const),
    terminalStatus,
    resultDisposition: disposition,
    ...(includeOutput
      ? { normalizedOutputDigest: digestAgentCanonicalValue(normalizedOutput) }
      : {}),
    outputByteLength: includeOutput ? outputByteLength : 0,
    artifactRefs: current ? artifactRefs : Object.freeze([]),
    usage: candidate.actualDemand.usage,
    cleanupReceiptDigest: candidate.cleanup.receiptDigest,
    completedAt: candidate.completedAt,
  } as const;
  const receipt = Object.freeze({
    ...receiptBase,
    receiptDigest: digestAgentCanonicalValue(receiptBase),
  });
  return Object.freeze({
    status: 'completed',
    receipt,
    ...(includeOutput ? { normalizedOutput } : {}),
    ledger: settled.state,
  });
};

export const createScriptedAgentHostedToolAdapter = (
  input: AgentHostedToolAdapter
): AgentHostedToolAdapter =>
  Object.freeze({
    descriptorDigest: input.descriptorDigest,
    execute: input.execute,
  });
