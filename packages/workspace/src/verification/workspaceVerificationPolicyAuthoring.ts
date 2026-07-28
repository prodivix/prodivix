import {
  validateVerificationDocument,
  type VerificationExemption,
  type VerificationMatrixProfile,
  type VerificationPlanBudgets,
  type VerificationPolicy,
  type VerificationPolicyRule,
  type VerificationRetryPolicy,
} from '@prodivix/verification';
import type { WorkspaceCommandEnvelope } from '../workspaceCommand';
import type { WorkspaceSnapshot } from '../types';
import {
  createWorkspaceBehaviorVerificationDocumentUpdateCommand,
  selectWorkspaceBehaviorVerificationDocument,
} from '../workspaceBehaviorVerificationDocument';

export type WorkspaceVerificationPolicyMutation =
  | Readonly<{ kind: 'rename-policy'; name: string }>
  | Readonly<{ kind: 'add-rule'; rule: VerificationPolicyRule }>
  | Readonly<{ kind: 'update-rule'; rule: VerificationPolicyRule }>
  | Readonly<{ kind: 'remove-rule'; ruleId: string }>
  | Readonly<{
      kind: 'set-matrix-profile';
      profile: VerificationMatrixProfile;
    }>
  | Readonly<{ kind: 'set-budgets'; budgets: VerificationPlanBudgets }>
  | Readonly<{
      kind: 'set-retry-policy';
      retryPolicy: VerificationRetryPolicy;
    }>
  | Readonly<{ kind: 'add-exemption'; exemption: VerificationExemption }>
  | Readonly<{ kind: 'revoke-exemption'; exemptionId: string }>
  | Readonly<{ kind: 'replace-policy'; policy: VerificationPolicy }>;

export type CreateWorkspaceVerificationPolicyMutationCommandInput = Readonly<{
  workspace: WorkspaceSnapshot;
  documentId: string;
  mutation: WorkspaceVerificationPolicyMutation;
  commandId: string;
  issuedAt: string;
  mergeKey?: string;
  label?: string;
}>;

const upsertById = <T extends Readonly<{ id: string }>>(
  values: readonly T[],
  value: T
): readonly T[] => {
  const index = values.findIndex((candidate) => candidate.id === value.id);
  return index < 0
    ? Object.freeze([...values, value])
    : Object.freeze([
        ...values.slice(0, index),
        value,
        ...values.slice(index + 1),
      ]);
};

const mutatePolicy = (
  policy: VerificationPolicy,
  mutation: WorkspaceVerificationPolicyMutation
): VerificationPolicy | null => {
  switch (mutation.kind) {
    case 'rename-policy':
      return { ...policy, name: mutation.name.trim() };
    case 'add-rule': {
      if (policy.rules.some((rule) => rule.id === mutation.rule.id)) {
        return null;
      }
      return {
        ...policy,
        rules: [...policy.rules, mutation.rule],
      };
    }
    case 'update-rule':
      return policy.rules.some((rule) => rule.id === mutation.rule.id)
        ? {
            ...policy,
            rules: policy.rules.map((rule) =>
              rule.id === mutation.rule.id ? mutation.rule : rule
            ),
          }
        : null;
    case 'remove-rule':
      return policy.rules.some((rule) => rule.id === mutation.ruleId)
        ? {
            ...policy,
            rules: policy.rules.filter((rule) => rule.id !== mutation.ruleId),
          }
        : null;
    case 'set-matrix-profile':
      return {
        ...policy,
        matrixProfiles: upsertById(policy.matrixProfiles, mutation.profile),
      };
    case 'set-budgets':
      return { ...policy, budgets: mutation.budgets };
    case 'set-retry-policy':
      return {
        ...policy,
        retryPolicies: upsertById(policy.retryPolicies, mutation.retryPolicy),
      };
    case 'add-exemption':
      return policy.exemptions.some(
        (exemption) => exemption.id === mutation.exemption.id
      )
        ? null
        : {
            ...policy,
            exemptions: [...policy.exemptions, mutation.exemption],
          };
    case 'revoke-exemption':
      return policy.exemptions.some(
        (exemption) => exemption.id === mutation.exemptionId
      )
        ? {
            ...policy,
            exemptions: policy.exemptions.filter(
              (exemption) => exemption.id !== mutation.exemptionId
            ),
          }
        : null;
    case 'replace-policy':
      return mutation.policy.id === policy.id ? mutation.policy : null;
  }
};

/**
 * Turns a typed Policy mutation into the existing reversible owner Command.
 * Invalid references/conflicts fail before any Workspace operation is emitted.
 */
export const createWorkspaceVerificationPolicyMutationCommand = (
  input: CreateWorkspaceVerificationPolicyMutationCommandInput
): WorkspaceCommandEnvelope | null => {
  const current = selectWorkspaceBehaviorVerificationDocument(
    input.workspace,
    input.documentId,
    'verification-policy'
  );
  if (current?.status !== 'valid') return null;
  const after = mutatePolicy(current.decodedContent, input.mutation);
  if (
    !after ||
    !validateVerificationDocument('verification-policy', after).ok
  ) {
    return null;
  }
  return createWorkspaceBehaviorVerificationDocumentUpdateCommand({
    workspace: input.workspace,
    documentId: input.documentId,
    type: 'verification-policy',
    after,
    commandId: input.commandId,
    issuedAt: input.issuedAt,
    mergeKey: input.mergeKey,
    label: input.label ?? `Verification policy: ${input.mutation.kind}`,
  });
};
