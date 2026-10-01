import { open } from 'node:fs/promises';
import { isPlainObject } from '@prodivix/shared/safety';
import type {
  AgentBudgetDemand,
  AgentCapabilityGrant,
  AgentCapabilityQualification,
  AgentEffectivePolicy,
  AgentInferenceConfiguration,
  AgentPricingSnapshot,
  AgentProviderCatalogEntry,
} from '@prodivix/ai';
import type { CreateVerificationPlanInput } from '@prodivix/verification';

export type AgentRuntimeBinding = Readonly<{
  taskId: string;
  catalog: AgentProviderCatalogEntry;
  qualification: AgentCapabilityQualification;
  inference: AgentInferenceConfiguration;
  policy: AgentEffectivePolicy;
  grant: AgentCapabilityGrant;
  reservation: AgentBudgetDemand;
  pricing?: AgentPricingSnapshot;
  transport: Readonly<{
    endpoint: string;
    endpointProfile: Readonly<{
      endpoint: string;
      method: 'POST';
      redirectPolicy: 'deny';
    }>;
    credentialEnvironmentVariable: string;
  }>;
  verification?: Omit<CreateVerificationPlanInput, 'impactSet'>;
  verificationDriver?: Readonly<{
    endpoint: string;
    providerId: string;
    credentialEnvironmentVariable: string;
    adapterRegistryDigest: string;
    maximumRuntimeMs: number;
  }>;
}>;

export type AgentRuntimeConfiguration = Readonly<{
  backendURL: string;
  workerId: string;
  bearerEnvironmentVariable: string;
  pollIntervalMs: number;
  leaseMs: number;
  bindings: readonly AgentRuntimeBinding[];
  stateDirectory?: string;
}>;

/** Secret values stay in server environment; the file contains identities and opaque env names. */
export const readAgentRuntimeConfiguration = async (
  path: string
): Promise<AgentRuntimeConfiguration> => {
  const handle = await open(path, 'r');
  let source: string;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 4_194_304)
      throw new Error('Agent runtime configuration exceeds its limit.');
    const chunks: Buffer[] = [];
    let bytes = 0;
    for (;;) {
      const chunk = Buffer.allocUnsafe(65_536);
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (!bytesRead) break;
      bytes += bytesRead;
      if (bytes > 4_194_304)
        throw new Error('Agent runtime configuration exceeds its limit.');
      chunks.push(chunk.subarray(0, bytesRead));
    }
    source = new TextDecoder('utf8', { fatal: true }).decode(
      Buffer.concat(chunks, bytes)
    );
  } finally {
    await handle.close();
  }
  const value: unknown = JSON.parse(source);
  if (
    !isPlainObject(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          'backendURL',
          'workerId',
          'bearerEnvironmentVariable',
          'pollIntervalMs',
          'leaseMs',
          'bindings',
          'stateDirectory',
        ].includes(key)
    ) ||
    typeof value.backendURL !== 'string' ||
    typeof value.workerId !== 'string' ||
    !value.workerId.trim() ||
    typeof value.bearerEnvironmentVariable !== 'string' ||
    !/^[A-Z][A-Z0-9_]{0,127}$/u.test(value.bearerEnvironmentVariable) ||
    !Number.isSafeInteger(value.pollIntervalMs) ||
    Number(value.pollIntervalMs) < 100 ||
    Number(value.pollIntervalMs) > 60_000 ||
    !Number.isSafeInteger(value.leaseMs) ||
    Number(value.leaseMs) < 5_000 ||
    Number(value.leaseMs) > 600_000 ||
    !Array.isArray(value.bindings) ||
    value.bindings.length > 128 ||
    value.bindings.some(
      (binding) => !isPlainObject(binding) || typeof binding.taskId !== 'string'
    ) ||
    new Set(value.bindings.map((binding) => binding.taskId)).size !==
      value.bindings.length ||
    (value.stateDirectory !== undefined &&
      (typeof value.stateDirectory !== 'string' ||
        !value.stateDirectory.trim()))
  )
    throw new Error('Agent runtime configuration is invalid.');
  const url = new URL(value.backendURL);
  if (
    (url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['', '/api', '/api/'].includes(url.pathname === '/' ? '' : url.pathname)
  )
    throw new Error('Agent runtime backend URL is invalid.');
  return Object.freeze(value as unknown as AgentRuntimeConfiguration);
};
