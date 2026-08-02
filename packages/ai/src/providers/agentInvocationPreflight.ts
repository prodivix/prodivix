import type { AgentProviderSupportTier, Instant } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type {
  AgentInferenceConfiguration,
  AgentInvocationPlan,
} from './agentProvider.types';
import { compareAgentDecimals } from '../usage/agentUsage';
import {
  compareAgentInvocationIssues as compareIssues,
  createAgentInvocationIssue as issue,
  type AgentInvocationIssue,
  type AgentInvocationPreflightResult,
} from './agentInvocationValidation';

const tierOrder: Readonly<Record<AgentProviderSupportTier, number>> =
  Object.freeze({ disabled: 0, 'admission-only': 1, 'release-evaluated': 2 });

const validInstant = (value: Instant): boolean =>
  Number.isFinite(Date.parse(value));

const qualificationBase = (
  plan: AgentInvocationPlan
): Omit<typeof plan.qualification, 'qualificationDigest'> => {
  const { qualificationDigest: _digest, ...base } = plan.qualification;
  return base;
};

const inferenceBase = (
  configuration: AgentInferenceConfiguration
): Omit<AgentInferenceConfiguration, 'configurationDigest'> => {
  const { configurationDigest: _digest, ...base } = configuration;
  return base;
};

const contextManifestBase = (plan: AgentInvocationPlan) => {
  const {
    contextPackId: _contextPackId,
    manifestDigest: _manifestDigest,
    ...base
  } = plan.contextPack;
  return base;
};

export const preflightAgentInvocation = (
  plan: AgentInvocationPlan,
  options: Readonly<{
    at: Instant;
    minimumSupportTier?: Exclude<AgentProviderSupportTier, 'disabled'>;
  }>
): AgentInvocationPreflightResult => {
  const issues: AgentInvocationIssue[] = [];
  const minimumTier = options.minimumSupportTier ?? 'admission-only';
  if (
    !plan.invocationId.trim() ||
    !plan.taskId.trim() ||
    !plan.runId.trim() ||
    !Number.isSafeInteger(plan.generation) ||
    plan.generation < 0 ||
    !Number.isSafeInteger(plan.attempt) ||
    plan.attempt < 1 ||
    !validInstant(plan.startedAt)
  ) {
    issues.push(
      issue(
        'AI-9001',
        '/identity',
        'Invocation identity or attempt is invalid.'
      )
    );
  }
  if (
    !validInstant(options.at) ||
    !validInstant(plan.startedAt) ||
    Date.parse(options.at) < Date.parse(plan.startedAt)
  ) {
    issues.push(
      issue('AI-9001', '/at', 'Invocation preflight instant is invalid.')
    );
  }
  if (
    digestAgentCanonicalValue(qualificationBase(plan)) !==
    plan.qualification.qualificationDigest
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/qualification',
        'Capability qualification digest has drifted.'
      )
    );
  }
  if (
    plan.qualification.provider.providerConfigurationId !==
      plan.provider.providerConfigurationId ||
    digestAgentCanonicalValue(plan.qualification.provider) !==
      digestAgentCanonicalValue(plan.provider) ||
    plan.qualification.model.lineageDigest !== plan.model.lineageDigest ||
    plan.qualification.capabilityProfileDigest !==
      plan.capabilityProfile.profileDigest ||
    plan.qualification.policyProfileDigest !== plan.policyDigest
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/qualification',
        'Capability qualification does not bind the invocation slice.'
      )
    );
  }
  const { lineageDigest: _lineageDigest, ...modelLineageBase } = plan.model;
  if (
    digestAgentCanonicalValue(modelLineageBase) !== plan.model.lineageDigest
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/model',
        'Model, fine-tune, tokenizer, template, quantization, or runtime lineage has drifted.'
      )
    );
  }
  const { profileDigest: _profileDigest, ...profileBase } =
    plan.capabilityProfile;
  if (
    digestAgentCanonicalValue(profileBase) !==
    plan.capabilityProfile.profileDigest
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/capabilityProfile',
        'Capability profile digest has drifted.'
      )
    );
  }
  const { adapterDigest: _adapterDigest, ...adapterBase } =
    plan.provider.adapter;
  const { policyDigest: _dataPolicyDigest, ...dataPolicyBase } =
    plan.providerDataPolicy;
  if (
    digestAgentCanonicalValue(adapterBase) !==
      plan.provider.adapter.adapterDigest ||
    digestAgentCanonicalValue(dataPolicyBase) !==
      plan.providerDataPolicy.policyDigest
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/provider',
        'Provider adapter or data-policy identity has drifted.'
      )
    );
  }
  if (
    Date.parse(options.at) >= Date.parse(plan.qualification.expiresAt) ||
    tierOrder[plan.qualification.supportTier] < tierOrder[minimumTier]
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/qualification/expiresAt',
        'Capability qualification is expired or below the required support tier.'
      )
    );
  }
  if (
    digestAgentCanonicalValue(inferenceBase(plan.inferenceConfiguration)) !==
    plan.inferenceConfiguration.configurationDigest
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/inferenceConfiguration',
        'Inference configuration digest has drifted.'
      )
    );
  }
  if (
    digestAgentCanonicalValue(contextManifestBase(plan)) !==
      plan.contextPack.manifestDigest ||
    plan.contextPack.contextPackId !==
      `context-pack:${plan.contextPack.manifestDigest.slice('sha256-'.length)}` ||
    plan.contextPack.policyDigest !== plan.policyDigest ||
    !isAgentCanonicalDigest(plan.policyDigest) ||
    !isAgentCanonicalDigest(plan.contextPack.providerSetDigest)
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/contextPack',
        'Context Pack does not bind the invocation policy/provider set.'
      )
    );
  }
  if (plan.provider.dataPolicyDigest !== plan.providerDataPolicy.policyDigest) {
    issues.push(
      issue(
        'AI-6011',
        '/providerDataPolicy',
        'Provider data-policy digest has drifted.'
      )
    );
  }
  for (const capability of ['execute', 'read'] as const) {
    if (!plan.grantCapabilities.includes(capability)) {
      issues.push(
        issue(
          'AI-7001',
          '/grantCapabilities',
          `Invocation grant is missing ${capability} capability.`
        )
      );
    }
  }
  if (plan.providerDataPolicy.ambientMemory !== 'disabled') {
    issues.push(
      issue(
        'AI-6011',
        '/providerDataPolicy/ambientMemory',
        'Provider ambient memory must be disabled.'
      )
    );
  }
  if (
    plan.inferenceConfiguration.providerStateMode === 'stateless' &&
    plan.providerDataPolicy.storage !== 'disabled'
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/providerDataPolicy/storage',
        'Stateless invocation requires provider storage to be disabled.'
      )
    );
  }
  if (
    plan.inferenceConfiguration.providerStateMode !== 'stateless' &&
    plan.providerDataPolicy.storage !== 'task-scoped' &&
    plan.providerDataPolicy.storage !== 'workspace-scoped'
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/providerDataPolicy/storage',
        'Provider-side state requires explicit task/workspace-scoped storage.'
      )
    );
  }
  if (
    (plan.inferenceConfiguration.deliveryMode === 'background') !==
    (plan.inferenceConfiguration.providerStateMode ===
      'provider-background-job')
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/inferenceConfiguration/deliveryMode',
        'Background delivery and provider background-job state must be selected together.'
      )
    );
  }
  if (
    (plan.inferenceConfiguration.deliveryMode === 'realtime-session') !==
    (plan.inferenceConfiguration.providerStateMode === 'realtime-session')
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/inferenceConfiguration/deliveryMode',
        'Realtime delivery and realtime-session state must be selected together.'
      )
    );
  }
  if (
    !plan.capabilityProfile.providerStateModes.includes(
      plan.inferenceConfiguration.providerStateMode
    ) ||
    !plan.capabilityProfile.cacheModes.includes(
      plan.inferenceConfiguration.cacheMode
    ) ||
    !plan.capabilityProfile.contextMutationModes.includes(
      plan.inferenceConfiguration.contextMutationMode
    ) ||
    !plan.capabilityProfile.deliveryModes.includes(
      plan.inferenceConfiguration.deliveryMode
    ) ||
    !plan.capabilityProfile.reasoningModes.includes(
      plan.inferenceConfiguration.reasoningMode
    )
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/inferenceConfiguration',
        'Inference configuration requests a capability outside its exact profile.'
      )
    );
  }
  const outputLimit = plan.capabilityProfile.hardLimits.maxOutputUnits.find(
    ({ unit }) => unit === plan.inferenceConfiguration.maxOutputUnits.unit
  );
  let outputLimitExceeded = !outputLimit;
  if (outputLimit) {
    try {
      outputLimitExceeded =
        compareAgentDecimals(
          plan.inferenceConfiguration.maxOutputUnits.maximum,
          outputLimit.maximum
        ) > 0;
    } catch {
      outputLimitExceeded = true;
    }
  }
  if (outputLimitExceeded) {
    issues.push(
      issue(
        'AI-6010',
        '/inferenceConfiguration/maxOutputUnits',
        'Inference output limit exceeds the exact capability profile.'
      )
    );
  }
  if (
    plan.inferenceConfiguration.parallelToolPolicy === 'bounded' &&
    (!plan.capabilityProfile.featureFlags.includes('parallel-tool-calling') ||
      plan.capabilityProfile.hardLimits.maxParallelToolCalls < 2)
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/inferenceConfiguration/parallelToolPolicy',
        'Parallel tool calls are outside the exact capability profile.'
      )
    );
  }
  if (
    plan.inferenceConfiguration.deliveryMode === 'background' &&
    plan.capabilityProfile.hardLimits.maxBackgroundRuntimeMs === 0
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/inferenceConfiguration/deliveryMode',
        'Background delivery has no qualified runtime allowance.'
      )
    );
  }
  if (
    plan.contextPack.items.reduce((total, item) => total + item.byteLength, 0) >
    plan.capabilityProfile.hardLimits.maxInputBytes
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/contextPack/items',
        'Context Pack exceeds the exact capability input limit.'
      )
    );
  }
  if (
    plan.inferenceConfiguration.cacheMode !== 'disabled' &&
    (plan.providerDataPolicy.cacheIsolation === 'cross-tenant' ||
      plan.providerDataPolicy.cacheIsolation === 'unknown')
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/providerDataPolicy/cacheIsolation',
        'Provider cache isolation is unsafe or unknown.'
      )
    );
  }
  if (
    (plan.multimodalContextManifestDigest === undefined) !==
      (plan.providerMediaBlockManifestDigest === undefined) ||
    (plan.multimodalContextManifestDigest !== undefined &&
      (!isAgentCanonicalDigest(plan.multimodalContextManifestDigest) ||
        !isAgentCanonicalDigest(plan.providerMediaBlockManifestDigest)))
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/multimodalContext',
        'Invocation media Context and Provider block manifests must be exact and paired.'
      )
    );
  }

  if (issues.length > 0) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze(issues.sort(compareIssues)),
    });
  }
  const requestDigest = digestAgentCanonicalValue({
    attempt: plan.attempt,
    capabilityQualificationDigest: plan.qualification.qualificationDigest,
    contextPackDigest: plan.contextPack.manifestDigest,
    ...(plan.multimodalContextManifestDigest
      ? {
          multimodalContextManifestDigest: plan.multimodalContextManifestDigest,
          providerMediaBlockManifestDigest:
            plan.providerMediaBlockManifestDigest,
        }
      : {}),
    generation: plan.generation,
    inferenceConfigurationDigest:
      plan.inferenceConfiguration.configurationDigest,
    invocationId: plan.invocationId,
    modelLineageDigest: plan.model.lineageDigest,
    policyDigest: plan.policyDigest,
    providerConfigurationDigest: digestAgentCanonicalValue(plan.provider),
    runId: plan.runId,
    taskId: plan.taskId,
  });
  return Object.freeze({ ok: true, requestDigest });
};
