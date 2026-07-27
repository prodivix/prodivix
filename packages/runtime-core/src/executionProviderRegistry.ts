import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type {
  ExecutionJob,
  ExecutionProvider,
  ExecutionProviderDescriptor,
  ExecutionProviderIncompatibility,
  ExecutionRequest,
} from './execution.types';
import { getExecutionProviderCompatibility } from './executionRequest';

export class ExecutionProviderNotFoundError extends Error {
  readonly providerId: string;

  constructor(providerId: string) {
    super(`Execution provider is not registered: ${providerId}`);
    this.name = 'ExecutionProviderNotFoundError';
    this.providerId = providerId;
  }
}

export class ExecutionProviderUnsupportedRequestError extends Error {
  readonly providerId: string;
  readonly reasons: readonly ExecutionProviderIncompatibility[];

  constructor(
    providerId: string,
    reasons: readonly ExecutionProviderIncompatibility[]
  ) {
    super(`Execution provider cannot satisfy the request: ${providerId}`);
    this.name = 'ExecutionProviderUnsupportedRequestError';
    this.providerId = providerId;
    this.reasons = reasons;
  }
}

export class ExecutionProviderContractError extends Error {
  readonly providerId: string;

  constructor(providerId: string, message: string) {
    super(`Execution provider contract violation (${providerId}): ${message}`);
    this.name = 'ExecutionProviderContractError';
    this.providerId = providerId;
  }
}

export type ExecutionProviderRegistry = Readonly<{
  register(provider: ExecutionProvider): () => void;
  resolve(providerId: string): ExecutionProvider | undefined;
  listDescriptors(): readonly ExecutionProviderDescriptor[];
  listCompatibleDescriptors(
    request: ExecutionRequest
  ): readonly ExecutionProviderDescriptor[];
  start(providerId: string, request: ExecutionRequest): Promise<ExecutionJob>;
}>;

const normalizeProviderId = (providerId: string): string => {
  const normalized = providerId.trim();
  if (!normalized) {
    throw new TypeError('Execution provider id must not be empty.');
  }
  return normalized;
};

/** Instance-owned provider composition; selection policy stays with the host. */
export const createExecutionProviderRegistry =
  (): ExecutionProviderRegistry => {
    const providers = new Map<string, ExecutionProvider>();

    const resolve = (providerId: string): ExecutionProvider | undefined =>
      providers.get(normalizeProviderId(providerId));

    return Object.freeze({
      register: (provider) => {
        const providerId = normalizeProviderId(provider.descriptor.id);
        if (provider.descriptor.id !== providerId) {
          throw new TypeError('Execution provider id must be normalized.');
        }
        if (providers.has(providerId)) {
          throw new Error(
            `Execution provider is already registered: ${providerId}`
          );
        }
        providers.set(providerId, provider);
        return () => {
          if (providers.get(providerId) === provider)
            providers.delete(providerId);
        };
      },
      resolve,
      listDescriptors: () =>
        Object.freeze(
          [...providers.values()]
            .map((provider) => provider.descriptor)
            .sort((left, right) => compareUnicodeCodePoints(left.id, right.id))
        ),
      listCompatibleDescriptors: (request) =>
        Object.freeze(
          [...providers.values()]
            .map((provider) => provider.descriptor)
            .filter(
              (descriptor) =>
                getExecutionProviderCompatibility(descriptor, request)
                  .compatible
            )
            .sort((left, right) => compareUnicodeCodePoints(left.id, right.id))
        ),
      start: async (providerId, request) => {
        const normalized = normalizeProviderId(providerId);
        const provider = providers.get(normalized);
        if (!provider) throw new ExecutionProviderNotFoundError(normalized);

        const compatibility = getExecutionProviderCompatibility(
          provider.descriptor,
          request
        );
        if (!compatibility.compatible) {
          throw new ExecutionProviderUnsupportedRequestError(
            normalized,
            compatibility.reasons
          );
        }

        const job = await provider.start(request);
        try {
          if (!job.id.trim()) {
            throw new ExecutionProviderContractError(
              normalized,
              'job id must not be empty'
            );
          }
          if (job.provider.id !== normalized) {
            throw new ExecutionProviderContractError(
              normalized,
              `job declared provider ${job.provider.id}`
            );
          }
          if (job.provider.version !== provider.descriptor.version) {
            throw new ExecutionProviderContractError(
              normalized,
              `job declared provider version ${job.provider.version} instead of ${provider.descriptor.version}`
            );
          }
          if (job.request !== request) {
            throw new ExecutionProviderContractError(
              normalized,
              'job must retain the exact canonical execution request object'
            );
          }
        } catch (error) {
          try {
            await job.cancel({
              reason: 'Execution provider contract validation failed.',
            });
          } catch {
            // Contract validation remains primary; cancellation is best-effort.
          }
          throw error;
        }
        return job;
      },
    });
  };
