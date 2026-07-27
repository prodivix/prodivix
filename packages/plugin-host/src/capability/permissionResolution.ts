import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  type CapabilityRequest,
} from '@prodivix/plugin-contracts';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  capabilityIdentityFromRequest,
  capabilityIdentityKey,
  compareCapabilityIdentity,
} from '#host/capability/capabilityIdentity';
import {
  createImmutablePermissionSnapshot,
  type CapabilityDecision,
  type CapabilityDecisionSource,
  type PermissionDecision,
  type PermissionSnapshot,
} from '#host/capability/permissionSnapshot';
import type { PluginOwnerRef } from '#host/identity';
import {
  pluginHostFailure,
  pluginHostSuccess,
  type PluginHostResult,
} from '#host/result';

export type PermissionResolutionInput = Readonly<{
  owner: PluginOwnerRef;
  pluginVersion: string;
  requests: readonly CapabilityRequest[];
  decisions: readonly CapabilityDecision[];
  permissionRevision: number;
  policyRevision: string;
  policySource: string;
}>;

const decisionSourcePriority: Record<CapabilityDecisionSource, number> = {
  'host-safety': 0,
  administrator: 1,
  user: 2,
  'trust-default': 3,
};

const compareDecision = (
  left: CapabilityDecision,
  right: CapabilityDecision
): number => {
  if (left.decision !== right.decision) {
    return left.decision === 'deny' ? -1 : 1;
  }
  return (
    decisionSourcePriority[left.source] -
      decisionSourcePriority[right.source] ||
    compareUnicodeCodePoints(left.reasonCode, right.reasonCode)
  );
};

const policyFailure = (
  input: PermissionResolutionInput,
  message: string,
  capability?: CapabilityDecision['capability']
): PluginHostResult<PermissionSnapshot> =>
  pluginHostFailure([
    createPluginDiagnostic(
      PLUGIN_DIAGNOSTIC_CODES.CAPABILITY_POLICY_FAILED,
      message,
      {
        pluginId: input.owner.pluginId,
        pluginVersion: input.pluginVersion,
        installationId: input.owner.installationId,
        generation: input.owner.generation,
        permissionRevision: input.permissionRevision,
        capabilityId: capability?.id,
        capabilityScope: capability?.scope,
      }
    ),
  ]);

export const resolvePermissionSnapshot = (
  input: PermissionResolutionInput
): PluginHostResult<PermissionSnapshot> => {
  if (
    !Number.isSafeInteger(input.permissionRevision) ||
    input.permissionRevision < 1
  ) {
    return policyFailure(
      input,
      'Permission revision must be a positive safe integer.'
    );
  }
  if (!input.policyRevision.trim() || !input.policySource.trim()) {
    return policyFailure(
      input,
      'Permission policy revision and source must be non-empty.'
    );
  }

  const requests = new Map<string, CapabilityRequest>();
  for (const request of input.requests) {
    const key = capabilityIdentityKey(capabilityIdentityFromRequest(request));
    if (requests.has(key)) {
      return policyFailure(
        input,
        'Permission resolution received duplicate capability requests.',
        capabilityIdentityFromRequest(request)
      );
    }
    requests.set(key, request);
  }

  const candidates = new Map<string, CapabilityDecision[]>();
  for (const decision of input.decisions) {
    const key = capabilityIdentityKey(decision.capability);
    if (!requests.has(key)) {
      return policyFailure(
        input,
        'Capability policy attempted to decide an unrequested capability.',
        decision.capability
      );
    }
    if (!decision.reasonCode.trim()) {
      return policyFailure(
        input,
        'Capability policy decisions require a non-empty reason code.',
        decision.capability
      );
    }
    const grouped = candidates.get(key) ?? [];
    grouped.push(decision);
    candidates.set(key, grouped);
  }

  const effective: PermissionDecision[] = [];
  for (const [key, request] of requests) {
    const capability = capabilityIdentityFromRequest(request);
    const decision = [...(candidates.get(key) ?? [])].sort(
      compareDecision
    )[0] ?? {
      capability,
      decision: 'deny' as const,
      source: 'trust-default' as const,
      reasonCode: 'not-granted',
    };
    effective.push({
      capability,
      decision: decision.decision,
      source: decision.source,
      reasonCode: decision.reasonCode,
      optional: request.optional === true,
    });
  }
  effective.sort((left, right) =>
    compareCapabilityIdentity(left.capability, right.capability)
  );

  return pluginHostSuccess(
    createImmutablePermissionSnapshot({
      owner: input.owner,
      pluginVersion: input.pluginVersion,
      permissionRevision: input.permissionRevision,
      policyRevision: input.policyRevision,
      policySource: input.policySource,
      decisions: effective,
    })
  );
};
