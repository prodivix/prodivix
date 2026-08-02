import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import type { AgentManagedAgentAdmission } from './agentHosted.types';
import { assertHostedIdentity } from './agentHostedBoundaryValidation';

export const createAgentManagedAgentAdmission = (
  input: Omit<
    AgentManagedAgentAdmission,
    'outputAuthority' | 'admittedSupportTier' | 'admissionDigest'
  >
): AgentManagedAgentAdmission => {
  assertHostedIdentity(input.providerAgentId, 'Managed Agent id');
  assertHostedIdentity(input.taskId, 'Managed Agent task id');
  assertHostedIdentity(input.runId, 'Managed Agent run id');
  if (
    !['explain', 'plan', 'propose', 'apply'].includes(input.taskMode) ||
    !['read', 'ephemeral-execute', 'proposal', 'external-side-effect'].includes(
      input.requestedEffect
    ) ||
    !['available', 'opaque'].includes(input.perStepReceipts) ||
    !['none', 'provider-managed'].includes(input.delegatedToolSelection) ||
    !['none', 'opaque'].includes(input.providerState)
  ) {
    throw new TypeError('Managed Agent admission enum is invalid.');
  }
  const admitted =
    input.taskMode === 'explain' && input.requestedEffect === 'read';
  const base = {
    providerAgentId: input.providerAgentId,
    taskId: input.taskId,
    runId: input.runId,
    taskMode: input.taskMode,
    requestedEffect: input.requestedEffect,
    perStepReceipts: input.perStepReceipts,
    delegatedToolSelection: input.delegatedToolSelection,
    providerState: input.providerState,
    outputAuthority: 'external-untrusted' as const,
    admittedSupportTier: admitted
      ? ('admission-only' as const)
      : ('disabled' as const),
  } as const;
  return Object.freeze({
    ...base,
    admissionDigest: digestAgentCanonicalValue(base),
  });
};
