import { sameCanonicalJson } from '@prodivix/shared/canonical';
import type {
  AgentCapabilityGrant,
  AgentBudget,
  CanonicalDigest,
} from '../domain/agent.types';
import {
  canonicalizeAgentWorkspaceRevision,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type {
  AgentControlIssue,
  AgentTaskRecord,
} from '../control/agentControl.types';
import { decodeAgentControlFact } from '../control/agentControlCodec';
import {
  canonicalizeAgentTargetScope,
  isAgentTaskRecord,
} from '../control/agentTask';
import {
  cloneAgentControlJson,
  controlIssue,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import { createAgentBudgetLedger } from '../usage/agentBudgetLedger';
import {
  validateAgentEffectivePolicy,
  type AgentEffectivePolicy,
} from './agentPolicyEvaluation';

export type AgentTaskAdmissionChallenge = Readonly<{
  admissionId: string;
  challengeDigest: CanonicalDigest;
  status: 'pending' | 'admitted' | 'blocked';
}>;

export type AgentTaskAdmissionResult = Readonly<{
  admissionId: string;
  challengeDigest: CanonicalDigest;
  task: AgentTaskRecord;
  effectivePolicy?: AgentEffectivePolicy;
  grant?: AgentCapabilityGrant;
  admissionDigest: CanonicalDigest;
  status: 'admitted' | 'blocked';
  diagnosticCodes: readonly string[];
}>;

export type AgentTaskAdmissionState =
  | AgentTaskAdmissionResult
  | Readonly<{
      admissionId: string;
      challengeDigest: CanonicalDigest;
      status: 'pending' | 'blocked';
      diagnosticCodes: readonly string[];
    }>;

type DecodeResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly AgentControlIssue[] }>;
const invalid = (path: string, message: string): DecodeResult<never> => ({
  ok: false,
  issues: [controlIssue('AI-9001', path, message)],
});
const uniqueIdentities = (
  value: unknown,
  allowed?: readonly string[],
  minimum = 0
): value is string[] =>
  Array.isArray(value) &&
  value.length >= minimum &&
  value.length <= 512 &&
  new Set(value).size === value.length &&
  value.every(
    (item) =>
      isAgentControlIdentity(item) && (!allowed || allowed.includes(item))
  );
const positiveCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;

/** Validates current grant facts without resolving Secret references or granting authority. */
export const isAgentCapabilityGrant = (
  value: unknown
): value is AgentCapabilityGrant => {
  try {
    if (
      inspectAgentControlJson(value).length > 0 ||
      !hasExactAgentControlKeys(
        value,
        [
          'grantId',
          'subject',
          'taskId',
          'workspaceId',
          'baseRevision',
          'targetScope',
          'capabilities',
          'toolIds',
          'runtimeZones',
          'secretRefs',
          'limits',
          'policyRef',
          'policyDigest',
          'issuedAt',
          'expiresAt',
          'maxUses',
        ],
        ['runId', 'networkPolicyRef']
      ) ||
      ![value.grantId, value.taskId, value.workspaceId].every(
        isAgentControlIdentity
      ) ||
      (value.runId !== undefined && !isAgentControlIdentity(value.runId)) ||
      (value.networkPolicyRef !== undefined &&
        !isAgentControlIdentity(value.networkPolicyRef)) ||
      !hasExactAgentControlKeys(value.subject, ['kind', 'principalId']) ||
      !['user', 'service'].includes(String(value.subject.kind)) ||
      !isAgentControlIdentity(value.subject.principalId) ||
      !hasExactAgentControlKeys(value.policyRef, ['documentId']) ||
      !isAgentControlIdentity(value.policyRef.documentId) ||
      !isAgentCanonicalDigest(value.policyDigest) ||
      !isAgentControlInstant(value.issuedAt) ||
      !isAgentControlInstant(value.expiresAt) ||
      Date.parse(value.expiresAt) <= Date.parse(value.issuedAt) ||
      !positiveCount(value.maxUses) ||
      !hasExactAgentControlKeys(value.limits, ['budget', 'maxUses']) ||
      !positiveCount(value.limits.maxUses) ||
      value.limits.maxUses !== value.maxUses ||
      !uniqueIdentities(
        value.capabilities,
        ['read', 'execute', 'propose', 'approve', 'commit', 'rollback'],
        1
      ) ||
      !uniqueIdentities(value.toolIds) ||
      !uniqueIdentities(
        value.runtimeZones,
        ['browser', 'server', 'native', 'sandbox'],
        1
      ) ||
      !Array.isArray(value.secretRefs) ||
      value.secretRefs.length > 512 ||
      value.secretRefs.some(
        (ref) =>
          !hasExactAgentControlKeys(ref, ['kind', 'referenceId', 'purpose']) ||
          ![ref.kind, ref.referenceId, ref.purpose].every(
            isAgentControlIdentity
          )
      ) ||
      new Set(
        value.secretRefs.map(
          (ref) => `${ref.kind}\0${ref.referenceId}\0${ref.purpose}`
        )
      ).size !== value.secretRefs.length ||
      !hasExactAgentControlKeys(value.baseRevision, [
        'workspaceRev',
        'routeRev',
        'opSeq',
        'documents',
      ]) ||
      !Array.isArray(value.baseRevision.documents) ||
      value.baseRevision.documents.some(
        (doc) =>
          !hasExactAgentControlKeys(doc, [
            'documentId',
            'contentRev',
            'metaRev',
          ])
      ) ||
      !hasExactAgentControlKeys(value.targetScope, ['targets']) ||
      !Array.isArray(value.targetScope.targets)
    )
      return false;
    return (
      sameCanonicalJson(
        canonicalizeAgentWorkspaceRevision(
          value.baseRevision as AgentCapabilityGrant['baseRevision']
        ),
        value.baseRevision
      ) &&
      sameCanonicalJson(
        canonicalizeAgentTargetScope(value.targetScope.targets),
        value.targetScope.targets
      ) &&
      sameCanonicalJson(
        createAgentBudgetLedger(value.limits.budget as AgentBudget).budget,
        value.limits.budget
      )
    );
  } catch {
    return false;
  }
};

export const digestAgentTaskAdmission = (
  result: Omit<AgentTaskAdmissionResult, 'admissionDigest'>
): CanonicalDigest =>
  digestAgentCanonicalValue({
    admissionId: result.admissionId,
    challengeDigest: result.challengeDigest,
    taskDigest: result.task.taskDigest,
    effectivePolicyDigest:
      result.effectivePolicy?.evaluation.effectivePolicyDigest ?? null,
    grantDigest: result.grant ? digestAgentCanonicalValue(result.grant) : null,
    status: result.status,
    diagnosticCodes: result.diagnosticCodes,
  });

export const decodeAgentTaskAdmissionChallenge = (
  value: unknown
): DecodeResult<AgentTaskAdmissionChallenge> => {
  if (
    inspectAgentControlJson(value).length > 0 ||
    !hasExactAgentControlKeys(value, [
      'admissionId',
      'challengeDigest',
      'status',
    ]) ||
    !isAgentControlIdentity(value.admissionId) ||
    !isAgentCanonicalDigest(value.challengeDigest) ||
    !['pending', 'admitted', 'blocked'].includes(String(value.status))
  )
    return invalid('/', 'Agent admission challenge is malformed.');
  return {
    ok: true,
    value: cloneAgentControlJson(value) as AgentTaskAdmissionChallenge,
  };
};

/** Decodes the server control wire and verifies all immutable Task and grant bindings. */
export const decodeAgentTaskAdmission = (
  value: unknown,
  input: Readonly<{ requestedTask?: AgentTaskRecord }> = {}
): DecodeResult<AgentTaskAdmissionState> => {
  try {
    const issues = inspectAgentControlJson(value);
    if (issues.length) return { ok: false, issues };
    if (
      !hasExactAgentControlKeys(
        value,
        ['admissionId', 'challengeDigest', 'status', 'diagnosticCodes'],
        [
          'task',
          'effectivePolicy',
          'grant',
          'admissionDigest',
          'actorAuthorizationDigest',
          'observedAt',
          'expiresAt',
        ]
      ) ||
      !isAgentControlIdentity(value.admissionId) ||
      !isAgentCanonicalDigest(value.challengeDigest) ||
      !['pending', 'admitted', 'blocked'].includes(String(value.status)) ||
      !Array.isArray(value.diagnosticCodes) ||
      value.diagnosticCodes.length > 64 ||
      new Set(value.diagnosticCodes).size !== value.diagnosticCodes.length ||
      value.diagnosticCodes.some(
        (code) => typeof code !== 'string' || !/^AI-[0-9]{4}$/u.test(code)
      ) ||
      (value.actorAuthorizationDigest !== undefined &&
        !isAgentCanonicalDigest(value.actorAuthorizationDigest)) ||
      (value.observedAt !== undefined &&
        !isAgentControlInstant(value.observedAt)) ||
      (value.expiresAt !== undefined && !isAgentControlInstant(value.expiresAt))
    )
      return invalid('/', 'Agent admission state is malformed.');
    const identity = {
      admissionId: value.admissionId,
      challengeDigest: value.challengeDigest,
      diagnosticCodes: value.diagnosticCodes as string[],
    };
    if (
      value.status === 'pending' ||
      (value.status === 'blocked' && value.task === undefined)
    ) {
      if (
        ['task', 'effectivePolicy', 'grant', 'admissionDigest'].some((key) =>
          Object.hasOwn(value, key)
        ) ||
        (value.status === 'pending'
          ? identity.diagnosticCodes.length !== 0
          : identity.diagnosticCodes.length === 0)
      )
        return invalid(
          '/',
          'Unresolved admission cannot contain created Task or authority facts.'
        );
      return {
        ok: true,
        value: cloneAgentControlJson({ ...identity, status: value.status }),
      };
    }
    const decoded = decodeAgentControlFact(value.task);
    if (!decoded.ok || decoded.value.factType !== 'task-record')
      return invalid(
        '/task',
        'Admission Task must be a strict task-record control wire.'
      );
    const task = decoded.value.value;
    if (
      input.requestedTask &&
      (!isAgentTaskRecord(input.requestedTask) ||
        !sameCanonicalJson(task.lineage, input.requestedTask.lineage) ||
        !sameCanonicalJson(
          {
            ...task.spec,
            initialGrantRef: input.requestedTask.spec.initialGrantRef,
          },
          input.requestedTask.spec
        ))
    )
      return invalid(
        '/task',
        'Admission changed immutable requested Task input.'
      );
    let effectivePolicy: AgentEffectivePolicy | undefined;
    let grant: AgentCapabilityGrant | undefined;
    if (value.effectivePolicy !== undefined) {
      effectivePolicy = value.effectivePolicy as AgentEffectivePolicy;
      if (
        validateAgentEffectivePolicy(effectivePolicy).length ||
        !sameCanonicalJson(
          effectivePolicy.evaluation.projectPolicyRef,
          task.spec.policyRef
        ) ||
        effectivePolicy.evaluation.projectPolicyDigest !==
          task.spec.policyDigest ||
        (value.actorAuthorizationDigest !== undefined &&
          value.actorAuthorizationDigest !==
            effectivePolicy.evaluation.actorAuthorizationDigest)
      )
        return invalid(
          '/effectivePolicy',
          'Admission effective policy has drifted from the requested project policy.'
        );
    }
    if (value.grant !== undefined) {
      if (!isAgentCapabilityGrant(value.grant))
        return invalid('/grant', 'Admission capability grant is malformed.');
      grant = value.grant;
      if (
        grant.runId !== undefined ||
        grant.grantId !== task.spec.initialGrantRef.grantId ||
        grant.taskId !== task.spec.taskId ||
        grant.workspaceId !== task.spec.workspaceId ||
        !sameCanonicalJson(grant.subject, task.spec.actor) ||
        !sameCanonicalJson(grant.baseRevision, task.spec.baseRevision) ||
        !sameCanonicalJson(grant.targetScope, task.spec.targetScope) ||
        !sameCanonicalJson(grant.policyRef, task.spec.policyRef) ||
        grant.policyDigest !== task.spec.policyDigest ||
        !sameCanonicalJson(grant.limits.budget, task.spec.budget)
      )
        return invalid(
          '/grant',
          'Admission grant does not bind the exact immutable Task.'
        );
    }
    if (
      !isAgentCanonicalDigest(value.admissionDigest) ||
      (value.status === 'admitted' &&
        (!effectivePolicy ||
          !grant ||
          identity.diagnosticCodes.length !== 0)) ||
      (value.status === 'blocked' && identity.diagnosticCodes.length === 0)
    )
      return invalid('/', 'Admission terminal facts are incomplete.');
    const result: AgentTaskAdmissionResult = {
      ...identity,
      task,
      ...(effectivePolicy ? { effectivePolicy } : {}),
      ...(grant ? { grant } : {}),
      status: value.status as 'admitted' | 'blocked',
      admissionDigest: value.admissionDigest,
    };
    if (digestAgentTaskAdmission(result) !== result.admissionDigest)
      return invalid(
        '/admissionDigest',
        'Admission result digest does not match its canonical facts.'
      );
    return { ok: true, value: cloneAgentControlJson(result) };
  } catch {
    return invalid('/', 'Agent admission cannot be safely decoded.');
  }
};
