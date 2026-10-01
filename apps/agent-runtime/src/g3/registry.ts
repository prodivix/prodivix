import { FIRST_PARTY_STATIC_VERIFICATION_ADAPTER_REGISTRATIONS } from '@prodivix/verification-adapters';
import { FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION } from '@prodivix/verification-browser';
import {
  createVerificationAdapterRegistrySnapshot,
  matchVerificationAdapterRegistryEntry,
  type VerificationPlan,
} from '@prodivix/verification';
import type { G3DriverConfiguration } from '#src/g3/config.js';

export const createDriverRegistry = (config: G3DriverConfiguration) => {
  const available = [
    ...FIRST_PARTY_STATIC_VERIFICATION_ADAPTER_REGISTRATIONS,
    ...(config.chromium
      ? [FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION]
      : []),
  ];
  if (
    config.adapterIds?.some(
      (id) => !available.some((entry) => entry.descriptor.id === id)
    )
  )
    throw new Error('G3 configured adapter is unavailable.');
  return createVerificationAdapterRegistrySnapshot(
    available.filter(
      (entry) =>
        !config.adapterIds || config.adapterIds.includes(entry.descriptor.id)
    )
  );
};
export const assertDriverPlan = (
  config: G3DriverConfiguration,
  plan: VerificationPlan
): void => {
  const registry = createDriverRegistry(config);
  const selected = plan.cells.filter((cell) => cell.requirement === 'required');
  if (
    plan.status !== 'ready' ||
    plan.adapterRegistryDigest !== registry.snapshotDigest ||
    selected.length < 1 ||
    selected.some(
      (cell) =>
        !matchVerificationAdapterRegistryEntry(registry, cell.adapter) ||
        !['react-vite', 'vue-vite'].includes(cell.frameworkTarget) ||
        cell.retryPolicy.maximumAttempts !== 1 ||
        cell.retryPolicy.stabilitySamples !== 1
    )
  )
    throw new Error(
      'G3 Plan has no exact adopted production adapter registry.'
    );
};
