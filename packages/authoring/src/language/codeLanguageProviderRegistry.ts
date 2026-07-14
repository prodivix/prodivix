import type { CodeArtifactLanguage } from '../authoring.types';
import { CODE_LANGUAGE_CAPABILITIES } from './codeLanguage.types';
import type {
  CodeLanguageCapability,
  CodeLanguageCapabilityProvider,
} from './codeLanguage.types';

export type CodeLanguageProviderRegistry = Readonly<{
  register(provider: CodeLanguageCapabilityProvider): void;
  unregister(providerId: string): void;
  listProviders(): readonly CodeLanguageCapabilityProvider[];
  getProvider(
    languageId: CodeArtifactLanguage,
    capability: CodeLanguageCapability
  ): CodeLanguageCapabilityProvider | null;
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const capabilityKey = (
  languageId: CodeArtifactLanguage,
  capability: CodeLanguageCapability
): string => JSON.stringify([languageId, capability]);

const assertUniqueValues = (
  providerId: string,
  field: string,
  values: readonly string[]
): void => {
  if (!values.length) {
    throw new Error(
      `Code language provider "${providerId}" must declare at least one ${field}.`
    );
  }
  const seen = new Set<string>();
  for (const value of values) {
    if (!value.trim()) {
      throw new Error(
        `Code language provider "${providerId}" has an empty ${field} entry.`
      );
    }
    if (seen.has(value)) {
      throw new Error(
        `Code language provider "${providerId}" declares duplicate ${field} "${value}".`
      );
    }
    seen.add(value);
  }
};

const validateProvider = (provider: CodeLanguageCapabilityProvider): void => {
  const { descriptor } = provider;
  if (!descriptor.id.trim()) {
    throw new Error('Code language provider id must not be empty.');
  }
  if (!descriptor.semanticVersion.trim()) {
    throw new Error(
      `Code language provider "${descriptor.id}" semanticVersion must not be empty.`
    );
  }
  assertUniqueValues(descriptor.id, 'language id', descriptor.languageIds);
  assertUniqueValues(descriptor.id, 'capability', descriptor.capabilities);

  const supportedCapabilities = new Set<string>(CODE_LANGUAGE_CAPABILITIES);
  for (const capability of descriptor.capabilities) {
    if (!supportedCapabilities.has(capability)) {
      throw new Error(
        `Code language provider "${descriptor.id}" declares unsupported capability "${capability}".`
      );
    }
  }
};

/**
 * Owns deterministic primary-provider selection. A language/capability pair
 * has exactly one primary provider, so registration order can never change
 * which language engine answers a query.
 */
export const createCodeLanguageProviderRegistry =
  (): CodeLanguageProviderRegistry => {
    const providers = new Map<string, CodeLanguageCapabilityProvider>();
    const providersByCapability = new Map<
      string,
      CodeLanguageCapabilityProvider
    >();
    const capabilityKeysByProviderId = new Map<string, readonly string[]>();

    return Object.freeze({
      register(provider) {
        validateProvider(provider);
        const providerId = provider.descriptor.id;
        if (providers.has(providerId)) {
          throw new Error(
            `Code language provider "${providerId}" is already registered.`
          );
        }

        const keys = provider.descriptor.languageIds.flatMap((languageId) =>
          provider.descriptor.capabilities.map((capability) =>
            capabilityKey(languageId, capability)
          )
        );
        for (const key of keys) {
          const current = providersByCapability.get(key);
          if (!current) continue;
          const [languageId, capability] = JSON.parse(key) as [
            CodeArtifactLanguage,
            CodeLanguageCapability,
          ];
          throw new Error(
            `Code language capability "${languageId}/${capability}" is already owned by primary provider "${current.descriptor.id}".`
          );
        }

        providers.set(providerId, provider);
        capabilityKeysByProviderId.set(providerId, Object.freeze(keys));
        for (const key of keys) providersByCapability.set(key, provider);
      },
      unregister(providerId) {
        const provider = providers.get(providerId);
        if (!provider) return;
        providers.delete(providerId);
        for (const key of capabilityKeysByProviderId.get(providerId) ?? []) {
          if (providersByCapability.get(key) === provider) {
            providersByCapability.delete(key);
          }
        }
        capabilityKeysByProviderId.delete(providerId);
      },
      listProviders() {
        return Object.freeze(
          Array.from(providers.values()).sort((left, right) =>
            compareText(left.descriptor.id, right.descriptor.id)
          )
        );
      },
      getProvider(languageId, capability) {
        return (
          providersByCapability.get(capabilityKey(languageId, capability)) ??
          null
        );
      },
    });
  };
