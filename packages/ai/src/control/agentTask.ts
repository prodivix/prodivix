import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import type {
  AgentBudget,
  AgentTaskSpec,
  AgentTargetRef,
} from '../domain/agent.types';
import {
  canonicalizeAgentWorkspaceRevision,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import { createAgentBudgetLedger } from '../usage/agentBudgetLedger';
import type {
  AgentControlIssue,
  AgentTaskLineage,
  AgentTaskRecord,
} from './agentControl.types';
import {
  containsAgentControlCredentialLikeText,
  controlIssue,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from './agentControlValidation';

export type AgentTaskCreateResolution =
  | Readonly<{
      accepted: true;
      replayed: boolean;
      record: AgentTaskRecord;
    }>
  | Readonly<{
      accepted: false;
      issues: readonly AgentControlIssue[];
    }>;

const taskModes = new Set(['explain', 'plan', 'propose', 'apply']);
const targetKinds = new Set(['workspace', 'document', 'semantic-target']);
const maximumIntentCharacters = 16_384;
const maximumIntentBytes = 65_536;
const wildcardPattern = /[*?[\]{}]/u;

const canonicalTargetScope = (
  targets: readonly AgentTargetRef[]
): readonly AgentTargetRef[] => {
  if (targets.length === 0 || targets.length > 512) {
    throw new TypeError('AgentTask target scope must contain 1-512 targets.');
  }
  const canonical = targets.map((target) => {
    if (
      !hasExactAgentControlKeys(target, ['kind', 'id']) ||
      !targetKinds.has(String(target.kind)) ||
      !isAgentControlIdentity(target.id) ||
      wildcardPattern.test(target.id)
    ) {
      throw new TypeError('AgentTask target scope contains an invalid target.');
    }
    return Object.freeze({
      kind: target.kind as AgentTargetRef['kind'],
      id: target.id,
    });
  });
  canonical.sort((left, right) =>
    compareUnicodeCodePoints(
      `${left.kind}\u0000${left.id}`,
      `${right.kind}\u0000${right.id}`
    )
  );
  const identities = canonical.map(({ kind, id }) => `${kind}\u0000${id}`);
  if (new Set(identities).size !== identities.length) {
    throw new TypeError('AgentTask target scope contains duplicate targets.');
  }
  return Object.freeze(canonical);
};

const canonicalBudget = (budget: AgentBudget): AgentBudget =>
  createAgentBudgetLedger(budget).budget;

const canonicalTaskSpec = (
  spec: AgentTaskSpec,
  secretCanaries: readonly string[]
): AgentTaskSpec => {
  const inspection = inspectAgentControlJson(spec, 262_144);
  if (inspection.length > 0) {
    throw new TypeError(inspection.map(({ message }) => message).join('; '));
  }
  if (
    !hasExactAgentControlKeys(spec, [
      'taskId',
      'projectId',
      'workspaceId',
      'actor',
      'mode',
      'baseRevision',
      'intent',
      'intentDigest',
      'targetScope',
      'policyRef',
      'policyDigest',
      'initialGrantRef',
      'budget',
      'verificationRequirement',
      'createdAt',
      'idempotencyKey',
    ]) ||
    !isAgentControlIdentity(spec.taskId) ||
    !isAgentControlIdentity(spec.projectId) ||
    !isAgentControlIdentity(spec.workspaceId) ||
    !taskModes.has(String(spec.mode)) ||
    !isAgentControlInstant(spec.createdAt) ||
    !isAgentControlIdentity(spec.idempotencyKey) ||
    !isAgentCanonicalDigest(spec.intentDigest) ||
    !isAgentCanonicalDigest(spec.policyDigest)
  ) {
    throw new TypeError('AgentTask identity or top-level contract is invalid.');
  }
  if (
    !hasExactAgentControlKeys(spec.actor, ['kind', 'principalId']) ||
    (spec.actor.kind !== 'user' && spec.actor.kind !== 'service') ||
    !isAgentControlIdentity(spec.actor.principalId)
  ) {
    throw new TypeError('AgentTask actor identity is invalid.');
  }
  if (
    typeof spec.intent !== 'string' ||
    spec.intent.trim().length === 0 ||
    [...spec.intent].length > maximumIntentCharacters ||
    new TextEncoder().encode(spec.intent).byteLength > maximumIntentBytes ||
    containsAgentControlCredentialLikeText(spec.intent) ||
    secretCanaries.some(
      (canary) => canary.length > 0 && spec.intent.includes(canary)
    ) ||
    digestAgentCanonicalValue(spec.intent) !== spec.intentDigest
  ) {
    throw new TypeError(
      'AgentTask intent is empty, oversized, contains Secret material, or has digest drift.'
    );
  }
  if (
    !hasExactAgentControlKeys(spec.policyRef, ['documentId']) ||
    !isAgentControlIdentity(spec.policyRef.documentId) ||
    !hasExactAgentControlKeys(spec.initialGrantRef, ['grantId']) ||
    !isAgentControlIdentity(spec.initialGrantRef.grantId)
  ) {
    throw new TypeError(
      'AgentTask policy or initial grant reference is invalid.'
    );
  }
  if (
    !hasExactAgentControlKeys(spec.targetScope, ['targets']) ||
    !Array.isArray(spec.targetScope.targets) ||
    !hasExactAgentControlKeys(spec.verificationRequirement, [
      'policyRef',
      'requiredCheckKinds',
    ]) ||
    !isAgentControlIdentity(spec.verificationRequirement.policyRef) ||
    !Array.isArray(spec.verificationRequirement.requiredCheckKinds) ||
    spec.verificationRequirement.requiredCheckKinds.length > 512 ||
    spec.verificationRequirement.requiredCheckKinds.some(
      (kind) => !isAgentControlIdentity(kind)
    )
  ) {
    throw new TypeError(
      'AgentTask target or verification requirement is invalid.'
    );
  }
  const requiredCheckKinds = [
    ...spec.verificationRequirement.requiredCheckKinds,
  ].sort(compareUnicodeCodePoints);
  if (new Set(requiredCheckKinds).size !== requiredCheckKinds.length) {
    throw new TypeError('AgentTask verification check kinds must be unique.');
  }
  return Object.freeze({
    taskId: spec.taskId,
    projectId: spec.projectId,
    workspaceId: spec.workspaceId,
    actor: Object.freeze({ ...spec.actor }),
    mode: spec.mode,
    baseRevision: canonicalizeAgentWorkspaceRevision(spec.baseRevision),
    intent: spec.intent,
    intentDigest: spec.intentDigest,
    targetScope: Object.freeze({
      targets: canonicalTargetScope(spec.targetScope.targets),
    }),
    policyRef: Object.freeze({ ...spec.policyRef }),
    policyDigest: spec.policyDigest,
    initialGrantRef: Object.freeze({ ...spec.initialGrantRef }),
    budget: canonicalBudget(spec.budget),
    verificationRequirement: Object.freeze({
      policyRef: spec.verificationRequirement.policyRef,
      requiredCheckKinds: Object.freeze(requiredCheckKinds),
    }),
    createdAt: spec.createdAt,
    idempotencyKey: spec.idempotencyKey,
  });
};

export const createAgentTaskRecord = (
  spec: AgentTaskSpec,
  input: Readonly<{
    lineage?: AgentTaskLineage;
    secretCanaries?: readonly string[];
  }> = {}
): AgentTaskRecord => {
  const canonicalSpec = canonicalTaskSpec(spec, input.secretCanaries ?? []);
  const lineage: AgentTaskLineage =
    input.lineage ?? Object.freeze({ reason: 'initial' as const });
  if (
    !hasExactAgentControlKeys(lineage, ['reason'], ['parentTaskId']) ||
    !new Set([
      'initial',
      'intent-changed',
      'scope-changed',
      'policy-changed',
    ]).has(String(lineage.reason)) ||
    (lineage.parentTaskId !== undefined &&
      !isAgentControlIdentity(lineage.parentTaskId)) ||
    (lineage.reason === 'initial' && lineage.parentTaskId !== undefined) ||
    (lineage.reason !== 'initial' && lineage.parentTaskId === undefined)
  ) {
    throw new TypeError('AgentTask lineage is invalid.');
  }
  const canonicalLineage = Object.freeze({ ...lineage });
  const base = { spec: canonicalSpec, lineage: canonicalLineage } as const;
  return Object.freeze({
    ...base,
    taskDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentTaskRecord = (value: unknown): value is AgentTaskRecord => {
  try {
    if (
      !hasExactAgentControlKeys(value, ['spec', 'lineage', 'taskDigest']) ||
      !isAgentCanonicalDigest(value.taskDigest)
    ) {
      return false;
    }
    const rebuilt = createAgentTaskRecord(value.spec as AgentTaskSpec, {
      lineage: value.lineage as AgentTaskLineage,
    });
    return sameCanonicalJson(rebuilt, value);
  } catch {
    return false;
  }
};

/** Implements actor/workspace/idempotency-key strong create semantics. */
export const resolveAgentTaskCreate = (
  existing: AgentTaskRecord | undefined,
  requested: AgentTaskRecord
): AgentTaskCreateResolution => {
  if (!existing) {
    return Object.freeze({
      accepted: true,
      replayed: false,
      record: requested,
    });
  }
  const sameIdempotencyScope =
    existing.spec.workspaceId === requested.spec.workspaceId &&
    existing.spec.actor.kind === requested.spec.actor.kind &&
    existing.spec.actor.principalId === requested.spec.actor.principalId &&
    existing.spec.idempotencyKey === requested.spec.idempotencyKey;
  if (sameIdempotencyScope && existing.taskDigest === requested.taskDigest) {
    return Object.freeze({ accepted: true, replayed: true, record: existing });
  }
  return Object.freeze({
    accepted: false,
    issues: Object.freeze([
      controlIssue(
        'AI-9001',
        '/idempotencyKey',
        'AgentTask idempotency identity was reused with different immutable input.'
      ),
    ]),
  });
};
