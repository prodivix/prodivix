import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type { AgentContextOmission } from '../domain/agent.types';
import {
  canonicalizeAgentWorkspaceRevision,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentWorkspaceRevisionVector,
  sameAgentWorkspaceRevision,
} from '../domain/agentCanonical';
import { validateAgentEffectivePolicy } from '../policy/agentPolicyEvaluation';
import type {
  AgentContextBuildIssue,
  AgentContextBuildRequest,
  AgentContextBuildResult,
  AgentContextCandidate,
  AgentContextContributorKind,
  AgentContextMaterial,
} from './agentContext.types';
import {
  DEFAULT_REQUIRED_CONTRIBUTORS,
  candidateBoundaryIsValid,
  compareCandidates,
  compareIssues,
  compareSources,
  contentContainsInstructionInjection,
  contentContainsSecret,
  contextSourcePath,
  descriptorIsValid,
  issue,
  materializeCandidate,
  omission,
  providerSetDigest,
  sensitivityOrder,
  validateProviderDisclosure,
} from './agentContextValidation';

export { createAgentContextContributorDescriptor } from './agentContextValidation';

/**
 * Builds only from registered public contributors. The API has no DOM, app
 * store, build-output, credential, or raw Workspace-dump input surface.
 */
export const buildAgentContextPack = async (
  request: AgentContextBuildRequest
): Promise<AgentContextBuildResult> => {
  const issues: AgentContextBuildIssue[] = [];
  const omissions: AgentContextOmission[] = [];
  issues.push(
    ...validateAgentEffectivePolicy(request.policy).map((entry) =>
      issue(
        entry.code === 'AI-9001' ? 'AI-9001' : 'AI-6011',
        entry.path,
        entry.message
      )
    )
  );
  if (!request.taskId.trim() || !request.runId.trim()) {
    issues.push(
      issue(
        'AI-9001',
        '/identity',
        'Context Pack requires non-empty Task and Run identities.'
      )
    );
  }
  if (
    request.budget &&
    (!Number.isSafeInteger(request.budget.maxItems) ||
      request.budget.maxItems < 0 ||
      !Number.isSafeInteger(request.budget.maxBytes) ||
      request.budget.maxBytes < 0)
  ) {
    issues.push(
      issue(
        'AI-9001',
        '/budget',
        'Context budget must use non-negative safe-integer ceilings.'
      )
    );
  }
  if (request.providerSet.length === 0) {
    issues.push(
      issue(
        'AI-6011',
        '/providerSet',
        'Context Pack requires an exact non-empty provider set.'
      )
    );
  }
  const providerConfigurationIds = new Set<string>();
  for (const [index, binding] of request.providerSet.entries()) {
    const providerPath = `/providerSet/${index}`;
    const { policyDigest: _policyDigest, ...dataPolicyBase } =
      binding.dataPolicy;
    const { adapterDigest: _adapterDigest, ...adapterBase } =
      binding.provider.adapter;
    if (
      !binding.provider.providerConfigurationId.trim() ||
      providerConfigurationIds.has(binding.provider.providerConfigurationId)
    ) {
      issues.push(
        issue(
          'AI-6011',
          `${providerPath}/providerConfigurationId`,
          'Context provider configuration identity is empty or duplicated.'
        )
      );
    }
    providerConfigurationIds.add(binding.provider.providerConfigurationId);
    if (
      digestAgentCanonicalValue(dataPolicyBase) !==
        binding.dataPolicy.policyDigest ||
      binding.provider.dataPolicyDigest !== binding.dataPolicy.policyDigest
    ) {
      issues.push(
        issue(
          'AI-6011',
          `${providerPath}/dataPolicyDigest`,
          'Context provider data-policy digest has drifted.'
        )
      );
    }
    if (
      digestAgentCanonicalValue(adapterBase) !==
      binding.provider.adapter.adapterDigest
    ) {
      issues.push(
        issue(
          'AI-6010',
          `${providerPath}/adapterDigest`,
          'Context provider adapter identity has drifted.'
        )
      );
    }
    if (binding.dataPolicy.ambientMemory !== 'disabled') {
      issues.push(
        issue(
          'AI-6011',
          `${providerPath}/ambientMemory`,
          'Context disclosure requires provider ambient memory to be disabled.'
        )
      );
    }
    if (
      binding.dataPolicy.cacheIsolation === 'cross-tenant' ||
      binding.dataPolicy.cacheIsolation === 'unknown'
    ) {
      issues.push(
        issue(
          'AI-6011',
          `${providerPath}/cacheIsolation`,
          'Context disclosure requires a proven tenant-safe cache boundary.'
        )
      );
    }
  }
  if (!isAgentWorkspaceRevisionVector(request.workspaceRevision)) {
    issues.push(
      issue(
        'AI-6011',
        '/workspaceRevision',
        'Context Pack requires a valid exact Workspace revision vector.'
      )
    );
  }
  if (
    !isAgentCanonicalDigest(request.semanticProviderSetDigest) ||
    !request.semanticSnapshotRef.trim()
  ) {
    issues.push(
      issue(
        'AI-3001',
        '/semanticSnapshot',
        'Context Pack requires an exact Semantic Index snapshot and provider set.'
      )
    );
  }

  const contributorIds = new Set<string>();
  const contributorKinds = new Set<AgentContextContributorKind>();
  for (const [index, contributor] of request.contributors.entries()) {
    if (!descriptorIsValid(contributor.descriptor)) {
      issues.push(
        issue(
          'AI-9001',
          `/contributors/${index}/descriptor`,
          'Context contributor descriptor is invalid or has drifted.'
        )
      );
    }
    if (contributorIds.has(contributor.descriptor.contributorId)) {
      issues.push(
        issue(
          'AI-9001',
          `/contributors/${index}/contributorId`,
          'Context contributor identity is duplicated.'
        )
      );
    }
    contributorIds.add(contributor.descriptor.contributorId);
    contributorKinds.add(contributor.descriptor.kind);
  }
  const requiredKinds =
    request.requiredContributorKinds ?? DEFAULT_REQUIRED_CONTRIBUTORS;
  if (
    new Set(requiredKinds).size !== requiredKinds.length ||
    requiredKinds.some((kind) => !DEFAULT_REQUIRED_CONTRIBUTORS.includes(kind))
  ) {
    issues.push(
      issue(
        'AI-9001',
        '/requiredContributorKinds',
        'Required Context contributor kinds must be unique and registered.'
      )
    );
  }
  for (const kind of requiredKinds) {
    if (!contributorKinds.has(kind)) {
      issues.push(
        issue(
          'AI-3001',
          `/contributors/${kind}`,
          `Required Context contributor ${kind} is missing.`
        )
      );
    }
  }
  const semanticContributors = request.contributors.filter(
    ({ descriptor }) => descriptor.kind === 'semantic-index'
  );
  if (
    semanticContributors.length !== 1 ||
    semanticContributors[0]?.descriptor.semanticSnapshotRef !==
      request.semanticSnapshotRef ||
    semanticContributors[0]?.descriptor.semanticProviderSetDigest !==
      request.semanticProviderSetDigest
  ) {
    issues.push(
      issue(
        'AI-3001',
        '/semanticSnapshot',
        'Semantic contributor identity does not bind the requested snapshot/provider set.'
      )
    );
  }
  if (issues.some(({ blocking }) => blocking)) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze(issues.sort(compareIssues)),
      omitted: Object.freeze(omissions),
    });
  }

  const contributions = await Promise.all(
    request.contributors.map(async (contributor) => {
      try {
        return {
          contributor,
          result: await contributor.contribute({
            workspaceRevision: request.workspaceRevision,
            targetScope: request.targetScope,
          }),
        };
      } catch {
        return {
          contributor,
          result: {
            status: 'blocked' as const,
            issues: Object.freeze([
              issue(
                'AI-3001',
                `/contributors/${encodeURIComponent(
                  contributor.descriptor.contributorId
                )}`,
                'Context contributor failed before producing bounded material.'
              ),
            ]),
          },
        };
      }
    })
  );

  const acceptedCandidates: Array<{
    candidate: AgentContextCandidate;
    contributorId: string;
  }> = [];
  const sourceDigests = new Map<string, string>();
  for (const { contributor, result } of contributions) {
    if (result.status === 'blocked') {
      issues.push(...result.issues);
      continue;
    }
    for (const candidate of [...result.candidates].sort(compareCandidates)) {
      const path = contextSourcePath(candidate.source);
      if (!candidate.source.id.trim() || !candidate.content.length) {
        issues.push(
          issue(
            'AI-9001',
            path,
            'Context candidate source or content is empty.'
          )
        );
        omissions.push(omission(candidate.source, 'invalid', 'AI-9001'));
        continue;
      }
      if (!Object.hasOwn(sensitivityOrder, candidate.sensitivity)) {
        issues.push(
          issue(
            'AI-9001',
            path,
            'Context candidate sensitivity is not a current-model value.'
          )
        );
        omissions.push(omission(candidate.source, 'invalid', 'AI-9001'));
        continue;
      }
      if (
        !sameAgentWorkspaceRevision(
          candidate.revision,
          request.workspaceRevision
        )
      ) {
        issues.push(
          issue(
            'AI-6011',
            path,
            'Context candidate does not bind the requested Workspace revision.'
          )
        );
        omissions.push(omission(candidate.source, 'stale', 'AI-6011'));
        continue;
      }
      if (
        !candidate.mediaType.startsWith('text/') &&
        candidate.mediaType !== 'application/json'
      ) {
        issues.push(
          issue(
            'AI-6011',
            path,
            'V1 Context accepts text and canonical JSON only; media belongs to V2.'
          )
        );
        omissions.push(omission(candidate.source, 'unsupported', 'AI-6011'));
        continue;
      }
      if (!candidateBoundaryIsValid(candidate)) {
        issues.push(
          issue(
            'AI-7002',
            path,
            'Context candidate attempted to cross its instruction boundary.'
          )
        );
        omissions.push(omission(candidate.source, 'instruction', 'AI-7002'));
        continue;
      }
      if (
        candidate.authority === 'external-untrusted' &&
        contentContainsInstructionInjection(candidate.content)
      ) {
        issues.push(
          issue(
            'AI-7002',
            path,
            'Untrusted Context content contains an instruction-escalation signal.'
          )
        );
        omissions.push(omission(candidate.source, 'instruction', 'AI-7002'));
        continue;
      }
      if (
        contentContainsSecret(candidate.content, request.secretCanaries ?? [])
      ) {
        issues.push(
          issue(
            'AI-7003',
            path,
            'Context candidate contains credential-like or Secret canary material.'
          )
        );
        omissions.push(omission(candidate.source, 'secret', 'AI-7003'));
        continue;
      }
      if (
        !request.policy.contextRules.allowedAuthorities.includes(
          candidate.authority
        )
      ) {
        issues.push(
          issue(
            'AI-6011',
            path,
            'Context authority is denied by effective policy.'
          )
        );
        omissions.push(omission(candidate.source, 'policy', 'AI-6011'));
        continue;
      }
      if (
        !request.policy.contextRules.allowedItemKinds.includes(candidate.kind)
      ) {
        issues.push(
          issue(
            'AI-6011',
            path,
            'Context item kind is denied by effective policy.'
          )
        );
        omissions.push(omission(candidate.source, 'policy', 'AI-6011'));
        continue;
      }
      if (
        sensitivityOrder[candidate.sensitivity] >
          sensitivityOrder[request.policy.contextRules.maximumSensitivity] ||
        sensitivityOrder[candidate.sensitivity] >
          sensitivityOrder[request.policy.privacy.maximumSensitivity]
      ) {
        issues.push(
          issue(
            'AI-6011',
            path,
            'Context sensitivity exceeds effective policy.'
          )
        );
        omissions.push(omission(candidate.source, 'sensitivity', 'AI-6011'));
        continue;
      }
      if (
        request.policy.contextRules.requireSourceTrace &&
        !candidate.sourceTraceRef &&
        candidate.source.kind !== 'source-trace'
      ) {
        issues.push(
          issue(
            'AI-6011',
            path,
            'Context item is missing required SourceTrace.'
          )
        );
        omissions.push(omission(candidate.source, 'policy', 'AI-6011'));
        continue;
      }
      const disclosureIssues = validateProviderDisclosure(
        request,
        candidate,
        path
      );
      if (disclosureIssues.length > 0) {
        issues.push(...disclosureIssues);
        omissions.push(omission(candidate.source, 'residency', 'AI-6011'));
        continue;
      }

      const sourceIdentity = `${candidate.kind}\u0000${candidate.source.kind}\u0000${candidate.source.id}`;
      const contentDigest = digestAgentCanonicalValue(candidate.content);
      const priorDigest = sourceDigests.get(sourceIdentity);
      if (priorDigest && priorDigest !== contentDigest) {
        issues.push(
          issue(
            'AI-6011',
            path,
            'Two contributors returned conflicting content for one grounded source.'
          )
        );
        omissions.push(omission(candidate.source, 'invalid', 'AI-6011'));
        continue;
      }
      if (priorDigest === contentDigest) continue;
      sourceDigests.set(sourceIdentity, contentDigest);
      acceptedCandidates.push({
        candidate,
        contributorId: contributor.descriptor.contributorId,
      });
    }
  }

  if (issues.some(({ blocking }) => blocking)) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze(issues.sort(compareIssues)),
      omitted: Object.freeze(
        [...omissions].sort((left, right) =>
          compareSources(left.source, right.source)
        )
      ),
    });
  }

  const requestedBudget = request.budget ?? {
    maxItems: request.policy.contextRules.maxItems,
    maxBytes: request.policy.contextRules.maxBytes,
  };
  const budget = Object.freeze({
    maxItems: Math.min(
      requestedBudget.maxItems,
      request.policy.contextRules.maxItems
    ),
    maxBytes: Math.min(
      requestedBudget.maxBytes,
      request.policy.contextRules.maxBytes
    ),
  });
  const materials: AgentContextMaterial[] = [];
  let usedBytes = 0;
  for (const entry of acceptedCandidates.sort((left, right) =>
    compareCandidates(left.candidate, right.candidate)
  )) {
    const material = materializeCandidate(entry.candidate, entry.contributorId);
    if (
      materials.length >= budget.maxItems ||
      usedBytes + material.item.byteLength > budget.maxBytes
    ) {
      omissions.push(omission(entry.candidate.source, 'budget', 'AI-3001'));
      issues.push(
        issue(
          'AI-3001',
          contextSourcePath(entry.candidate.source),
          'Context item was deterministically omitted by the Context budget.',
          false
        )
      );
      continue;
    }
    materials.push(material);
    usedBytes += material.item.byteLength;
  }

  const descriptors = request.contributors
    .map(({ descriptor }) => descriptor)
    .sort((left, right) =>
      compareUnicodeCodePoints(left.contributorId, right.contributorId)
    );
  const contextContributorSetDigest = digestAgentCanonicalValue(descriptors);
  const exactProviderSetDigest = providerSetDigest(request);
  const canonicalRevision = canonicalizeAgentWorkspaceRevision(
    request.workspaceRevision
  );
  const canonicalOmissions = Object.freeze(
    [...omissions].sort(
      (left, right) =>
        compareSources(left.source, right.source) ||
        compareUnicodeCodePoints(left.reason, right.reason)
    )
  );
  const manifestBase = {
    budget,
    contextContributorSetDigest,
    items: materials.map(({ item }) => item),
    omitted: canonicalOmissions,
    policyDigest: request.policy.evaluation.effectivePolicyDigest,
    providerSetDigest: exactProviderSetDigest,
    runId: request.runId,
    semanticProviderSetDigest: request.semanticProviderSetDigest,
    semanticSnapshotRef: request.semanticSnapshotRef,
    taskId: request.taskId,
    workspaceRevision: canonicalRevision,
  };
  const manifestDigest = digestAgentCanonicalValue(manifestBase);
  return Object.freeze({
    status: 'ready',
    pack: Object.freeze({
      contextPackId: `context-pack:${manifestDigest.slice('sha256-'.length)}`,
      ...manifestBase,
      manifestDigest,
    }),
    materials: Object.freeze(materials),
    issues: Object.freeze(issues.sort(compareIssues)),
  });
};
