import { utf8ToBytes } from '@noble/hashes/utils.js';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type {
  AgentContextItem,
  AgentContextOmission,
  AgentGroundingReference,
  AgentSensitivity,
} from '../domain/agent.types';
import {
  canonicalizeAgentWorkspaceRevision,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type {
  AgentContextBuildIssue,
  AgentContextBuildRequest,
  AgentContextCandidate,
  AgentContextContributorDescriptor,
  AgentContextContributorKind,
  AgentContextMaterial,
} from './agentContext.types';

export const DEFAULT_REQUIRED_CONTRIBUTORS = Object.freeze([
  'semantic-index',
  'code',
  'source-trace',
  'issues',
  'scenario',
  'verification',
] as const satisfies readonly AgentContextContributorKind[]);

export const sensitivityOrder: Readonly<Record<AgentSensitivity, number>> =
  Object.freeze({
    public: 0,
    internal: 1,
    confidential: 2,
    restricted: 3,
  });

export const issue = (
  code: AgentContextBuildIssue['code'],
  path: string,
  message: string,
  blocking = true
): AgentContextBuildIssue => Object.freeze({ code, path, message, blocking });

export const compareIssues = (
  left: AgentContextBuildIssue,
  right: AgentContextBuildIssue
): number =>
  compareUnicodeCodePoints(left.path, right.path) ||
  compareUnicodeCodePoints(left.code, right.code) ||
  compareUnicodeCodePoints(left.message, right.message);

export const compareSources = (
  left: AgentGroundingReference,
  right: AgentGroundingReference
): number =>
  compareUnicodeCodePoints(left.kind, right.kind) ||
  compareUnicodeCodePoints(left.id, right.id);

export const compareCandidates = (
  left: AgentContextCandidate,
  right: AgentContextCandidate
): number =>
  compareSources(left.source, right.source) ||
  compareUnicodeCodePoints(left.kind, right.kind) ||
  compareUnicodeCodePoints(left.mediaType, right.mediaType) ||
  compareUnicodeCodePoints(left.content, right.content);

export const contextSourcePath = (source: AgentGroundingReference): string =>
  `/context/${source.kind}/${encodeURIComponent(source.id)}`;

const descriptorBase = (
  descriptor: Omit<AgentContextContributorDescriptor, 'descriptorDigest'>
) => ({
  configurationDigest: descriptor.configurationDigest,
  contributorId: descriptor.contributorId,
  implementationDigest: descriptor.implementationDigest,
  kind: descriptor.kind,
  ...(descriptor.semanticSnapshotRef
    ? { semanticSnapshotRef: descriptor.semanticSnapshotRef }
    : {}),
  ...(descriptor.semanticProviderSetDigest
    ? { semanticProviderSetDigest: descriptor.semanticProviderSetDigest }
    : {}),
});

export const createAgentContextContributorDescriptor = (
  descriptor: Omit<AgentContextContributorDescriptor, 'descriptorDigest'>
): AgentContextContributorDescriptor =>
  Object.freeze({
    ...descriptorBase(descriptor),
    descriptorDigest: digestAgentCanonicalValue(descriptorBase(descriptor)),
  });

export const descriptorIsValid = (
  descriptor: AgentContextContributorDescriptor
): boolean =>
  descriptor.contributorId.trim().length > 0 &&
  isAgentCanonicalDigest(descriptor.implementationDigest) &&
  isAgentCanonicalDigest(descriptor.configurationDigest) &&
  descriptor.descriptorDigest ===
    digestAgentCanonicalValue(descriptorBase(descriptor)) &&
  (descriptor.kind === 'semantic-index'
    ? Boolean(descriptor.semanticSnapshotRef?.trim()) &&
      isAgentCanonicalDigest(descriptor.semanticProviderSetDigest)
    : descriptor.semanticSnapshotRef === undefined &&
      descriptor.semanticProviderSetDigest === undefined);

export const contentContainsSecret = (
  content: string,
  secretCanaries: readonly string[]
): boolean => {
  if (
    secretCanaries.some(
      (canary) => canary.length > 0 && content.includes(canary)
    )
  ) {
    return true;
  }
  return [
    /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/iu,
    /\bauthorization\s*[:=]\s*(?:basic|bearer)\s+[a-z0-9._~+/-]{12,}/iu,
    /\b(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*["']?[a-z0-9_+./=-]{16,}/iu,
    /[?&](?:x-amz-signature|signature|sig)=[a-z0-9%_-]{16,}/iu,
    /\bsk-[a-z0-9_-]{16,}\b/iu,
  ].some((pattern) => pattern.test(content));
};

export const contentContainsInstructionInjection = (content: string): boolean =>
  [
    /\bignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|system|developer)\s+instructions?\b/iu,
    /\breveal\s+(?:the\s+)?system\s+prompt\b/iu,
    /\byou\s+are\s+now\s+(?:the\s+)?(?:system|developer|administrator)\b/iu,
    /\b(?:approve|commit|grant|elevate)\b.{0,80}\b(?:permission|transaction|workspace|access)\b/iu,
  ].some((pattern) => pattern.test(content));

export const candidateBoundaryIsValid = (
  candidate: AgentContextCandidate
): boolean => {
  if (candidate.authority === 'external-untrusted') {
    return candidate.instructionBoundary === 'data-only';
  }
  if (candidate.kind === 'user-intent') {
    return (
      candidate.authority === 'user-provided' &&
      candidate.instructionBoundary === 'user-intent'
    );
  }
  if (candidate.kind === 'agent-policy') {
    return (
      candidate.authority === 'canonical' &&
      candidate.instructionBoundary === 'developer-policy'
    );
  }
  return candidate.instructionBoundary === 'data-only';
};

export const providerSetDigest = (request: AgentContextBuildRequest): string =>
  digestAgentCanonicalValue(
    [...request.providerSet]
      .sort((left, right) =>
        compareUnicodeCodePoints(
          left.provider.providerConfigurationId,
          right.provider.providerConfigurationId
        )
      )
      .map(({ dataPolicy, provider }) => ({ dataPolicy, provider }))
  );

export const validateProviderDisclosure = (
  request: AgentContextBuildRequest,
  candidate: AgentContextCandidate,
  path: string
): readonly AgentContextBuildIssue[] => {
  const issues: AgentContextBuildIssue[] = [];
  for (const [index, binding] of request.providerSet.entries()) {
    const providerPath = `${path}/providers/${index}`;
    if (binding.provider.dataPolicyDigest !== binding.dataPolicy.policyDigest) {
      issues.push(
        issue(
          'AI-6011',
          `${providerPath}/dataPolicyDigest`,
          'Context provider data-policy identity is inconsistent.'
        )
      );
    }
    const region = binding.dataPolicy.region ?? binding.provider.providerRegion;
    const regionlessLocal =
      binding.provider.endpointClass === 'local' && region === undefined;
    if (
      !regionlessLocal &&
      (!region || !request.policy.privacy.allowedRegions.includes(region))
    ) {
      issues.push(
        issue(
          'AI-6011',
          `${providerPath}/region`,
          'Context item cannot satisfy the effective data-residency policy.'
        )
      );
    }
    if (
      sensitivityOrder[candidate.sensitivity] >
      sensitivityOrder[binding.dataPolicy.maximumSensitivity]
    ) {
      issues.push(
        issue(
          'AI-6011',
          `${providerPath}/maximumSensitivity`,
          'Context item sensitivity exceeds the provider data policy.'
        )
      );
    }
    if (
      request.policy.privacy.providerTraining === 'deny' &&
      binding.dataPolicy.training !== 'disabled'
    ) {
      issues.push(
        issue(
          'AI-6011',
          `${providerPath}/training`,
          'Context provider training is not disabled.'
        )
      );
    }
    if (
      request.policy.privacy.providerTelemetry === 'deny' &&
      binding.dataPolicy.telemetry !== 'disabled'
    ) {
      issues.push(
        issue(
          'AI-6011',
          `${providerPath}/telemetry`,
          'Context provider telemetry is not disabled.'
        )
      );
    }
    if (
      binding.dataPolicy.retentionDays >
      request.policy.retentionRules.providerStateDays
    ) {
      issues.push(
        issue(
          'AI-6011',
          `${providerPath}/retentionDays`,
          'Context provider retention exceeds the effective ceiling.'
        )
      );
    }
  }
  return Object.freeze(issues);
};

export const omission = (
  source: AgentGroundingReference,
  reason: AgentContextOmission['reason'],
  diagnosticCode: string
): AgentContextOmission => Object.freeze({ source, reason, diagnosticCode });

export const materializeCandidate = (
  candidate: AgentContextCandidate,
  contributorId: string
): AgentContextMaterial => {
  const contentDigest = digestAgentCanonicalValue(candidate.content);
  const itemIdentity = digestAgentCanonicalValue({
    contentDigest,
    contributorId,
    kind: candidate.kind,
    source: candidate.source,
  });
  const item: AgentContextItem = Object.freeze({
    itemId: `context-item:${itemIdentity.slice('sha256-'.length)}`,
    kind: candidate.kind,
    authority: candidate.authority,
    source: Object.freeze({ ...candidate.source }),
    revision: canonicalizeAgentWorkspaceRevision(candidate.revision),
    contentDigest,
    mediaType: candidate.mediaType,
    byteLength: utf8ToBytes(candidate.content).byteLength,
    sensitivity: candidate.sensitivity,
    instructionBoundary: candidate.instructionBoundary,
    ...(candidate.sourceTraceRef
      ? { sourceTraceRef: candidate.sourceTraceRef }
      : {}),
  });
  return Object.freeze({ item, content: candidate.content });
};

/**
 * Builds only from registered public contributors. The API has no DOM, app
 * store, build-output, credential, or raw Workspace-dump input surface.
 */
