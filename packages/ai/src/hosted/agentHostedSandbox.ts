import { sameCanonicalJson } from '@prodivix/shared/canonical';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import type {
  AgentHostedCapabilityIssue,
  AgentHostedSandboxDescriptor,
  AgentHostedSandboxReceipt,
  AgentToolCleanupReceipt,
} from './agentHosted.types';
import { createAgentToolCleanupReceipt } from './agentToolLifecycle';
import {
  assertHostedCount,
  assertHostedDigest,
  assertHostedIdentity,
  assertHostedInstant,
  createHostedBlockedResult,
} from './agentHostedBoundaryValidation';

export const createAgentHostedSandboxDescriptor = (
  input: Omit<AgentHostedSandboxDescriptor, 'descriptorDigest'>
): AgentHostedSandboxDescriptor => {
  assertHostedIdentity(input.sandboxId, 'Sandbox id');
  assertHostedIdentity(input.runtimeId, 'Sandbox runtime id');
  assertHostedDigest(input.runtimeImageDigest, 'Sandbox runtime image digest');
  assertHostedDigest(
    input.packageManifestDigest,
    'Sandbox package manifest digest'
  );
  if (
    !['none', 'read-only-snapshot'].includes(input.workspaceMount) ||
    !['none', 'policy-bound'].includes(input.network) ||
    !['none', 'callback-bound-purpose-only'].includes(input.secretInjection) ||
    input.ambientEnvironment !== 'disabled' ||
    input.cleanupRequired !== true ||
    (input.network === 'policy-bound') !==
      (input.networkPolicyDigest !== undefined) ||
    (input.workspaceMount === 'read-only-snapshot' &&
      input.secretInjection !== 'none')
  ) {
    throw new TypeError(
      'Sandbox network, Workspace, or Secret boundary is invalid.'
    );
  }
  if (input.networkPolicyDigest) {
    assertHostedDigest(
      input.networkPolicyDigest,
      'Sandbox network policy digest'
    );
  }
  const base = {
    sandboxId: input.sandboxId,
    runtimeId: input.runtimeId,
    runtimeImageDigest: input.runtimeImageDigest,
    packageManifestDigest: input.packageManifestDigest,
    workspaceMount: input.workspaceMount,
    network: input.network,
    ...(input.networkPolicyDigest
      ? { networkPolicyDigest: input.networkPolicyDigest }
      : {}),
    secretInjection: input.secretInjection,
    ambientEnvironment: 'disabled' as const,
    maxInputBytes: assertHostedCount(
      input.maxInputBytes,
      'Sandbox input bytes',
      1
    ),
    maxOutputBytes: assertHostedCount(
      input.maxOutputBytes,
      'Sandbox output bytes',
      1
    ),
    maxFiles: assertHostedCount(input.maxFiles, 'Sandbox file count'),
    maxFileBytes: assertHostedCount(input.maxFileBytes, 'Sandbox file bytes'),
    maxElapsedMs: assertHostedCount(
      input.maxElapsedMs,
      'Sandbox elapsed time',
      1
    ),
    maxComputeSeconds: assertHostedCount(
      input.maxComputeSeconds,
      'Sandbox compute seconds',
      1
    ),
    cleanupRequired: true as const,
  } as const;
  return Object.freeze({
    ...base,
    descriptorDigest: digestAgentCanonicalValue(base),
  });
};

export const validateAgentHostedSandboxDescriptor = (
  descriptor: AgentHostedSandboxDescriptor
): boolean => {
  try {
    const { descriptorDigest: _digest, ...base } = descriptor;
    return sameCanonicalJson(
      createAgentHostedSandboxDescriptor(base),
      descriptor
    );
  } catch {
    return false;
  }
};

export const admitAgentHostedSandbox = (
  input: Readonly<{
    descriptor: AgentHostedSandboxDescriptor;
    requestedInputBytes: number;
    requestedOutputBytes: number;
    requestedFiles: number;
    requestedFileBytes: number;
    requestedElapsedMs: number;
    requestedComputeSeconds: number;
    requestsWorkspaceWrite: boolean;
    requestsAmbientEnvironment: boolean;
    requestsUnrestrictedNetwork: boolean;
    requestsProductionCredential: boolean;
  }>
):
  | Readonly<{ ok: true; descriptorDigest: string }>
  | Readonly<{ ok: false; issues: readonly AgentHostedCapabilityIssue[] }> => {
  if (!validateAgentHostedSandboxDescriptor(input.descriptor)) {
    return createHostedBlockedResult(
      'AI-7012',
      '/descriptor',
      'Sandbox descriptor is invalid or drifted.'
    );
  }
  if (
    input.requestsWorkspaceWrite ||
    input.requestsAmbientEnvironment ||
    input.requestsUnrestrictedNetwork ||
    input.requestsProductionCredential
  ) {
    return createHostedBlockedResult(
      'AI-7012',
      '/authority',
      'Hosted sandbox requested ambient, production, network, or Workspace authority.'
    );
  }
  if (
    !Number.isSafeInteger(input.requestedInputBytes) ||
    !Number.isSafeInteger(input.requestedOutputBytes) ||
    !Number.isSafeInteger(input.requestedFiles) ||
    !Number.isSafeInteger(input.requestedFileBytes) ||
    !Number.isSafeInteger(input.requestedElapsedMs) ||
    !Number.isSafeInteger(input.requestedComputeSeconds) ||
    input.requestedInputBytes < 0 ||
    input.requestedOutputBytes < 0 ||
    input.requestedFiles < 0 ||
    input.requestedFileBytes < 0 ||
    input.requestedElapsedMs < 0 ||
    input.requestedComputeSeconds < 0 ||
    input.requestedInputBytes > input.descriptor.maxInputBytes ||
    input.requestedOutputBytes > input.descriptor.maxOutputBytes ||
    input.requestedFiles > input.descriptor.maxFiles ||
    input.requestedFileBytes > input.descriptor.maxFileBytes ||
    input.requestedElapsedMs > input.descriptor.maxElapsedMs ||
    input.requestedComputeSeconds > input.descriptor.maxComputeSeconds
  ) {
    return createHostedBlockedResult(
      'AI-6002',
      '/limits',
      'Hosted sandbox request is unbounded.'
    );
  }
  return Object.freeze({
    ok: true,
    descriptorDigest: input.descriptor.descriptorDigest,
  });
};

export const createAgentHostedSandboxReceipt = (
  input: Omit<AgentHostedSandboxReceipt, 'receiptDigest'> &
    Readonly<{ cleanup: AgentToolCleanupReceipt }>
): AgentHostedSandboxReceipt => {
  assertHostedIdentity(input.sandboxId, 'Sandbox id');
  assertHostedIdentity(input.callId, 'Sandbox Tool call id');
  for (const [label, digest] of [
    ['Sandbox descriptor digest', input.descriptorDigest],
    ['Runtime image digest', input.runtimeImageDigest],
    ['Package manifest digest', input.packageManifestDigest],
    ['Sandbox input digest', input.inputDigest],
    ['Cleanup receipt digest', input.cleanupReceiptDigest],
  ] as const) {
    assertHostedDigest(digest, label);
  }
  if (input.outputDigest) {
    assertHostedDigest(input.outputDigest, 'Sandbox output digest');
  }
  if (input.filesystemDiffDigest) {
    assertHostedDigest(
      input.filesystemDiffDigest,
      'Sandbox filesystem diff digest'
    );
  }
  if (input.networkPolicyDigest) {
    assertHostedDigest(
      input.networkPolicyDigest,
      'Sandbox network policy digest'
    );
  }
  assertHostedInstant(input.completedAt, 'Sandbox completion instant');
  const { receiptDigest: _cleanupDigest, ...cleanupBase } = input.cleanup;
  const recreatedCleanup = createAgentToolCleanupReceipt(cleanupBase);
  if (
    !sameCanonicalJson(recreatedCleanup, input.cleanup) ||
    input.cleanup.residualState !== 'none' ||
    input.cleanupReceiptDigest !== input.cleanup.receiptDigest ||
    !Number.isSafeInteger(input.outputByteLength) ||
    input.outputByteLength < 0 ||
    input.outputByteLength > 0 !== (input.outputDigest !== undefined)
  ) {
    throw new TypeError('Sandbox output or cleanup receipt is invalid.');
  }
  const base = {
    sandboxId: input.sandboxId,
    descriptorDigest: input.descriptorDigest,
    callId: input.callId,
    runtimeImageDigest: input.runtimeImageDigest,
    packageManifestDigest: input.packageManifestDigest,
    ...(input.networkPolicyDigest
      ? { networkPolicyDigest: input.networkPolicyDigest }
      : {}),
    inputDigest: input.inputDigest,
    ...(input.outputDigest ? { outputDigest: input.outputDigest } : {}),
    outputByteLength: input.outputByteLength,
    ...(input.filesystemDiffDigest
      ? { filesystemDiffDigest: input.filesystemDiffDigest }
      : {}),
    usage: input.usage,
    cleanupReceiptDigest: input.cleanupReceiptDigest,
    completedAt: input.completedAt,
  } as const;
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};
