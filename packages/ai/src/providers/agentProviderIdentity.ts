import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type { AgentUsageLimit } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type {
  AgentCapabilityProfile,
  AgentInferenceConfiguration,
  AgentModelLineage,
  AgentProviderAdapterIdentity,
  AgentProviderConfigurationIdentity,
  AgentProviderDataPolicy,
} from './agentProvider.types';

const decimalPattern = /^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u;

const assertNonEmpty = (value: string, label: string): void => {
  if (!value.trim()) throw new TypeError(`${label} must not be empty.`);
};

const assertDigest = (value: string, label: string): void => {
  if (!isAgentCanonicalDigest(value)) {
    throw new TypeError(`${label} must be a canonical SHA-256 digest.`);
  }
};

const uniqueSorted = <T extends string>(
  values: readonly T[],
  label: string
): readonly T[] => {
  if (new Set(values).size !== values.length) {
    throw new TypeError(`${label} must not contain duplicates.`);
  }
  return Object.freeze([...values].sort(compareUnicodeCodePoints));
};

const normalizeUsageLimits = (
  limits: readonly AgentUsageLimit[]
): readonly AgentUsageLimit[] => {
  if (new Set(limits.map(({ unit }) => unit)).size !== limits.length) {
    throw new TypeError('Agent usage limits must contain unique units.');
  }
  return Object.freeze(
    [...limits]
      .sort((left, right) => compareUnicodeCodePoints(left.unit, right.unit))
      .map((limit) => {
        if (!decimalPattern.test(limit.maximum)) {
          throw new TypeError('Agent usage limits require canonical decimals.');
        }
        return Object.freeze({ ...limit });
      })
  );
};

export const createAgentProviderAdapterIdentity = (
  input: Omit<AgentProviderAdapterIdentity, 'adapterDigest'>
): AgentProviderAdapterIdentity => {
  assertNonEmpty(input.adapterId, 'Provider adapter id');
  assertNonEmpty(input.adapterVersion, 'Provider adapter version');
  assertDigest(input.transportSchemaDigest, 'Provider transport schema digest');
  assertDigest(
    input.eventNormalizationDigest,
    'Provider event normalization digest'
  );
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    adapterDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentProviderConfigurationIdentity = (
  input: AgentProviderConfigurationIdentity
): AgentProviderConfigurationIdentity => {
  assertNonEmpty(input.providerConfigurationId, 'Provider configuration id');
  assertNonEmpty(input.providerOperatorId, 'Provider operator id');
  assertDigest(input.endpointProfileDigest, 'Provider endpoint profile digest');
  assertDigest(input.dataPolicyDigest, 'Provider data-policy digest');
  if (
    input.adapter.adapterDigest !==
    digestAgentCanonicalValue({
      adapterId: input.adapter.adapterId,
      adapterVersion: input.adapter.adapterVersion,
      eventNormalizationDigest: input.adapter.eventNormalizationDigest,
      protocolFamily: input.adapter.protocolFamily,
      transportSchemaDigest: input.adapter.transportSchemaDigest,
    })
  ) {
    throw new TypeError('Provider adapter identity digest has drifted.');
  }
  return Object.freeze({
    ...input,
    adapter: Object.freeze({ ...input.adapter }),
  });
};

export const createAgentProviderDataPolicy = (
  input: Omit<AgentProviderDataPolicy, 'policyDigest'>
): AgentProviderDataPolicy => {
  if (!Number.isSafeInteger(input.retentionDays) || input.retentionDays < 0) {
    throw new TypeError('Provider retention days must be non-negative.');
  }
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    policyDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentModelLineage = (
  input: Omit<AgentModelLineage, 'lineageDigest'>
): AgentModelLineage => {
  assertNonEmpty(input.modelId, 'Model id');
  assertNonEmpty(input.modelFamilyId, 'Model family id');
  assertNonEmpty(input.modelFamilyOwnerId, 'Model family owner id');
  for (const [label, value] of [
    ['Tokenizer digest', input.tokenizerDigest],
    ['Chat-template digest', input.chatTemplateDigest],
    ['Quantization digest', input.quantizationDigest],
    ['Runtime-backend digest', input.runtimeBackendDigest],
  ] as const) {
    if (value !== undefined) assertDigest(value, label);
  }
  if (input.baseModelRef) {
    assertDigest(input.baseModelRef.lineageDigest, 'Base-model lineage digest');
  }
  if (input.fineTuneRef) {
    for (const [label, value] of [
      ['Fine-tune base-model digest', input.fineTuneRef.baseModelLineageDigest],
      [
        'Fine-tune training-policy digest',
        input.fineTuneRef.trainingPolicyDigest,
      ],
      [
        'Fine-tune disclosed-data lineage digest',
        input.fineTuneRef.disclosedDataLineageDigest,
      ],
    ] as const) {
      assertDigest(value, label);
    }
  }
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    lineageDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentCapabilityProfile = (
  input: Omit<AgentCapabilityProfile, 'profileDigest'>
): AgentCapabilityProfile => {
  assertNonEmpty(input.profileId, 'Capability profile id');
  const hardLimits = Object.freeze({
    ...input.hardLimits,
    maxOutputUnits: normalizeUsageLimits(input.hardLimits.maxOutputUnits),
  });
  for (const [label, value] of [
    ['maxInputBytes', hardLimits.maxInputBytes],
    ['maxToolCalls', hardLimits.maxToolCalls],
    ['maxParallelToolCalls', hardLimits.maxParallelToolCalls],
    ['maxBackgroundRuntimeMs', hardLimits.maxBackgroundRuntimeMs],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(
        `Capability ${label} must be a non-negative integer.`
      );
    }
  }
  const base = Object.freeze({
    profileId: input.profileId,
    inputModalityRefs: uniqueSorted(
      input.inputModalityRefs,
      'Input modality references'
    ),
    outputModalityRefs: uniqueSorted(
      input.outputModalityRefs,
      'Output modality references'
    ),
    outputContracts: uniqueSorted(input.outputContracts, 'Output contracts'),
    toolExecutionLoci: uniqueSorted(
      input.toolExecutionLoci,
      'Tool execution loci'
    ),
    deliveryModes: uniqueSorted(input.deliveryModes, 'Delivery modes'),
    providerStateModes: uniqueSorted(
      input.providerStateModes,
      'Provider state modes'
    ),
    cacheModes: uniqueSorted(input.cacheModes, 'Provider cache modes'),
    contextMutationModes: uniqueSorted(
      input.contextMutationModes,
      'Context mutation modes'
    ),
    reasoningModes: uniqueSorted(input.reasoningModes, 'Reasoning modes'),
    featureFlags: uniqueSorted(input.featureFlags, 'Capability feature flags'),
    hardLimits,
  });
  return Object.freeze({
    ...base,
    profileDigest: digestAgentCanonicalValue(base),
  });
};

export const validateAgentCoreCapabilityProfile = (
  profile: AgentCapabilityProfile
): readonly string[] => {
  const missing: string[] = [];
  for (const modality of ['code', 'text']) {
    if (!profile.inputModalityRefs.includes(modality)) {
      missing.push(`input:${modality}`);
    }
  }
  for (const contract of ['structured', 'tool-call'] as const) {
    if (!profile.outputContracts.includes(contract)) {
      missing.push(`output:${contract}`);
    }
  }
  if (!profile.toolExecutionLoci.includes('client-hosted')) {
    missing.push('tool-locus:client-hosted');
  }
  if (!profile.deliveryModes.includes('stream')) {
    missing.push('delivery:stream');
  }
  if (!profile.providerStateModes.includes('stateless')) {
    missing.push('state:stateless');
  }
  if (!profile.cacheModes.includes('disabled')) {
    missing.push('cache:disabled');
  }
  for (const feature of [
    'bounded-text-input',
    'bounded-code-input',
    'structured-output',
    'client-hosted-tool-calling',
    'streaming',
    'refusal-normalization',
    'truncation-normalization',
  ] as const) {
    if (!profile.featureFlags.includes(feature))
      missing.push(`feature:${feature}`);
  }
  return Object.freeze(missing.sort(compareUnicodeCodePoints));
};

export const createAgentInferenceConfiguration = (
  input: Omit<AgentInferenceConfiguration, 'configurationDigest'>
): AgentInferenceConfiguration => {
  if (
    input.temperature !== undefined &&
    (!Number.isFinite(input.temperature) ||
      input.temperature < 0 ||
      input.temperature > 2)
  ) {
    throw new TypeError('Inference temperature must be between 0 and 2.');
  }
  if (
    input.topP !== undefined &&
    (!Number.isFinite(input.topP) || input.topP < 0 || input.topP > 1)
  ) {
    throw new TypeError('Inference topP must be between 0 and 1.');
  }
  if (input.seed !== undefined && !Number.isSafeInteger(input.seed)) {
    throw new TypeError('Inference seed must be a safe integer.');
  }
  for (const [label, value] of [
    ['Output schema digest', input.outputSchemaDigest],
    ['Prompt-policy digest', input.promptPolicyDigest],
    ['Tool-registry digest', input.toolRegistryDigest],
  ] as const) {
    assertDigest(value, label);
  }
  if (input.safetyPolicyDigest) {
    assertDigest(input.safetyPolicyDigest, 'Safety-policy digest');
  }
  const [maxOutputUnits] = normalizeUsageLimits([input.maxOutputUnits]);
  const reasoningBudget = input.reasoningBudget
    ? normalizeUsageLimits([input.reasoningBudget])[0]
    : undefined;
  if (input.reasoningMode === 'none' && reasoningBudget) {
    throw new TypeError('Reasoning budget requires an enabled reasoning mode.');
  }
  const base = Object.freeze({
    ...input,
    maxOutputUnits: maxOutputUnits!,
    ...(reasoningBudget ? { reasoningBudget } : {}),
  });
  return Object.freeze({
    ...base,
    configurationDigest: digestAgentCanonicalValue(base),
  });
};
