import {
  digestVerificationValue,
  parseVerificationInstant,
  uniqueVerificationText,
} from './verificationCanonical';
import {
  createVerificationAdapterRegistrySnapshot,
  matchVerificationAdapterRegistryEntry,
} from './verificationAdapterRegistry';
import type {
  CreateVerificationPlanInput,
  VerificationAdapterRegistration,
  VerificationCheckDefinition,
  VerificationEvidenceRequirements,
  VerificationPlanCellPreflight,
  VerificationScenarioDescriptor,
} from './verification.types';
import type { VerificationMatrixCoordinate } from './verificationPlannerMatrix';

const intersects = (
  left: readonly string[],
  right: readonly string[]
): boolean => left.some((value) => right.includes(value));

export const relevantVerificationImpactFacts = (
  declared: readonly string[],
  impacted: readonly string[]
): readonly string[] =>
  declared.length === 0
    ? uniqueVerificationText(impacted)
    : uniqueVerificationText(
        declared.filter((value) => impacted.includes(value))
      );

export const hasBoundVerificationDigest = (
  reference: Readonly<{ digest?: string }> | undefined
): boolean => reference === undefined || Boolean(reference.digest?.trim());

export const verificationScenarioMatchesCheck = (
  scenario: VerificationScenarioDescriptor,
  check: VerificationCheckDefinition
): boolean =>
  (check.scenarioIds.length === 0 || check.scenarioIds.includes(scenario.id)) &&
  (check.scenarioTags.length === 0 ||
    intersects(check.scenarioTags, scenario.tags)) &&
  (check.impactedDomains.length === 0 ||
    intersects(check.impactedDomains, scenario.impactedDomains)) &&
  (check.capabilityIds.length === 0 ||
    intersects(check.capabilityIds, scenario.capabilityIds));

export const verificationCheckIsScenarioBound = (
  check: VerificationCheckDefinition
): boolean =>
  check.scenarioIds.length > 0 ||
  check.scenarioTags.length > 0 ||
  ['e2e', 'visual', 'accessibility', 'performance', 'security'].includes(
    check.kind
  );

export const verificationCheckIsImpacted = (
  input: CreateVerificationPlanInput,
  check: VerificationCheckDefinition,
  scenario: VerificationScenarioDescriptor | undefined
): boolean => {
  if (input.impactSet.completeness !== 'complete') return true;
  if (
    input.impactSet.impactedDomains.includes('verification') ||
    input.impactSet.reasons.some((reason) => reason.kind === 'target-change')
  ) {
    return true;
  }
  if (scenario && input.impactSet.impactedScenarioIds.includes(scenario.id)) {
    return true;
  }
  if (
    intersects(check.impactedDomains, input.impactSet.impactedDomains) ||
    intersects(check.capabilityIds, input.impactSet.capabilityIds) ||
    intersects(check.riskFlags, input.impactSet.riskFlags)
  ) {
    return true;
  }
  return (
    !scenario &&
    check.impactedDomains.length === 0 &&
    check.capabilityIds.length === 0 &&
    check.riskFlags.length === 0
  );
};

export const preflightVerificationCell = (
  check: VerificationCheckDefinition,
  coordinate: VerificationMatrixCoordinate,
  registration: VerificationAdapterRegistration | undefined,
  evidenceRequirements: VerificationEvidenceRequirements
): VerificationPlanCellPreflight => {
  if (!registration) {
    return Object.freeze({
      status: 'unsupported',
      reasonCode: 'VER-3002',
      message: `Adapter "${check.adapterId}" is not registered.`,
    });
  }
  const descriptor = registration.descriptor;
  let identityMatches = false;
  try {
    const snapshot = createVerificationAdapterRegistrySnapshot([registration]);
    identityMatches =
      descriptor.id === check.adapterId &&
      matchVerificationAdapterRegistryEntry(snapshot, registration.identity) !==
        undefined;
  } catch {
    identityMatches = false;
  }
  if (!identityMatches) {
    return Object.freeze({
      status: 'blocked',
      reasonCode: 'VER-3003',
      message: `Adapter identity does not match "${check.adapterId}".`,
    });
  }
  if (
    check.estimatedCost.durationMs > descriptor.budgets.maximumDurationMs ||
    check.estimatedCost.artifactBytes > descriptor.budgets.maximumArtifactBytes
  ) {
    return Object.freeze({
      status: 'blocked',
      reasonCode: 'VER-3003',
      message: `Check "${check.id}" exceeds the registered adapter budget.`,
    });
  }
  const unsupported =
    !descriptor.checkKinds.includes(check.kind) ||
    !descriptor.surfaces.includes(coordinate.surface) ||
    !descriptor.targets.includes(coordinate.frameworkTarget) ||
    (coordinate.browserEngine !== undefined &&
      !descriptor.browserEngines.includes(coordinate.browserEngine)) ||
    !check.capabilityIds.every((id) =>
      descriptor.controlCapabilities.includes(id)
    ) ||
    !check.inputKinds.every((kind) => descriptor.inputKinds.includes(kind)) ||
    !check.artifactKinds.every((kind) =>
      descriptor.artifactKinds.includes(kind)
    ) ||
    !evidenceRequirements.acceptedTrust.some((trust) =>
      descriptor.trustInputs.includes(trust)
    );
  return unsupported
    ? Object.freeze({
        status: 'unsupported',
        reasonCode: 'VER-3002',
        message: `Adapter "${check.adapterId}" cannot execute the selected cell contract.`,
      })
    : Object.freeze({ status: 'supported' });
};

export const validateVerificationPlanningInput = (
  input: CreateVerificationPlanInput,
  policyIsValid: boolean
): string | undefined => {
  if (
    !Number.isSafeInteger(input.impactSet.targetRevision) ||
    input.impactSet.targetRevision < 0 ||
    input.impactSet.workspaceId.length === 0 ||
    !Number.isSafeInteger(input.policyRevision) ||
    input.policyRevision < 0
  ) {
    return 'Plan identities are invalid.';
  }
  if (!policyIsValid) {
    return 'VerificationPolicy does not satisfy its current model contract.';
  }
  if (digestVerificationValue(input.policy) !== input.policyDigest) {
    return 'policyDigest does not match the canonical VerificationPolicy.';
  }
  const { impactDigest: _impactDigest, ...impactWithoutDigest } =
    input.impactSet;
  if (
    digestVerificationValue(impactWithoutDigest) !==
    input.impactSet.impactDigest
  ) {
    return 'impactDigest does not match the canonical VerificationImpactSet.';
  }
  if (parseVerificationInstant(input.policyEvaluationInstant) === undefined) {
    return 'policyEvaluationInstant must be an explicit UTC RFC 3339 instant.';
  }
  for (const values of [input.scenarios, input.checks, input.adapters]) {
    const ids = values.map((value) =>
      'identity' in value ? value.identity.adapterId : value.id
    );
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
      return 'Scenario, check, and adapter ids must each be non-empty and unique.';
    }
  }
  if (
    [
      input.policyDigest,
      input.scenarioRegistryDigest,
      input.adapterRegistryDigest,
      input.compilerDigest,
      input.plannerDigest,
    ].some((digest) => !digest.trim())
  ) {
    return 'Plan digests must be non-empty.';
  }
  for (const scenario of input.scenarios) {
    if (
      !scenario.documentId.trim() ||
      !scenario.controlProfileRef ||
      scenario.targetIds.some((id) => !id.trim()) ||
      scenario.frameworkTargets.some((id) => !id.trim())
    ) {
      return `Scenario "${scenario.id}" has invalid planning metadata.`;
    }
  }
  for (const check of input.checks) {
    const resourceModes = new Map<string, string>();
    for (const resource of check.resources) {
      const previous = resourceModes.get(resource.key);
      if (!resource.key.trim() || previous !== undefined) {
        return `Check "${check.id}" has duplicate or conflicting resource declarations.`;
      }
      resourceModes.set(resource.key, resource.mode);
    }
    if (
      !check.ownerId.trim() ||
      !check.adapterId.trim() ||
      [
        check.estimatedCost.durationMs,
        check.estimatedCost.artifactBytes,
        check.estimatedCost.computeUnits,
      ].some((value) => !Number.isFinite(value) || value < 0) ||
      new Set(check.matrixAxes).size !== check.matrixAxes.length
    ) {
      return `Check "${check.id}" has invalid owner, adapter, cost, or matrix metadata.`;
    }
  }
  for (const registration of input.adapters) {
    if (
      !registration.identity.toolchainDigest.trim() ||
      !registration.identity.capabilityDigest.trim() ||
      !Number.isFinite(registration.descriptor.budgets.maximumDurationMs) ||
      registration.descriptor.budgets.maximumDurationMs < 0 ||
      !Number.isFinite(registration.descriptor.budgets.maximumArtifactBytes) ||
      registration.descriptor.budgets.maximumArtifactBytes < 0
    ) {
      return `Adapter "${registration.identity.adapterId}" has invalid identity or budgets.`;
    }
  }
  try {
    const registry = createVerificationAdapterRegistrySnapshot(input.adapters);
    if (registry.snapshotDigest !== input.adapterRegistryDigest) {
      return 'adapterRegistryDigest does not match the canonical adapter registry snapshot.';
    }
  } catch (error) {
    return error instanceof Error
      ? error.message
      : 'Verification adapter registry is invalid.';
  }
  return undefined;
};
