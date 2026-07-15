import type {
  CodeArtifactLanguage,
  ShaderCompileTarget,
} from '../authoring.types';
import type {
  ShaderCompileCapabilityProvider,
  ShaderCompileProviderDescriptor,
} from './shaderCompile.types';

export type ShaderCompileProviderRegistry = Readonly<{
  register(provider: ShaderCompileCapabilityProvider): void;
  unregister(providerId: string): void;
  listProviders(): readonly ShaderCompileCapabilityProvider[];
  getProvider(
    language: CodeArtifactLanguage,
    target: ShaderCompileTarget
  ): ShaderCompileCapabilityProvider | null;
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const providerKey = (
  language: CodeArtifactLanguage,
  target: ShaderCompileTarget
): string => JSON.stringify([language, target]);

const assertDescriptor = (
  descriptor: ShaderCompileProviderDescriptor
): void => {
  if (!descriptor.id.trim() || !descriptor.version.trim()) {
    throw new Error(
      'Shader compile provider id and version must not be empty.'
    );
  }
  if (!descriptor.languageIds.length || !descriptor.targets.length) {
    throw new Error(
      `Shader compile provider "${descriptor.id}" must declare languages and targets.`
    );
  }
  if (new Set(descriptor.languageIds).size !== descriptor.languageIds.length) {
    throw new Error(
      `Shader compile provider "${descriptor.id}" declares duplicate languages.`
    );
  }
  if (new Set(descriptor.targets).size !== descriptor.targets.length) {
    throw new Error(
      `Shader compile provider "${descriptor.id}" declares duplicate targets.`
    );
  }
};

/** Selects exactly one compile backend for each language/target pair. */
export const createShaderCompileProviderRegistry =
  (): ShaderCompileProviderRegistry => {
    const providers = new Map<string, ShaderCompileCapabilityProvider>();
    const providerByKey = new Map<string, ShaderCompileCapabilityProvider>();
    const keysByProvider = new Map<string, readonly string[]>();

    return Object.freeze({
      register(provider) {
        const { descriptor } = provider;
        assertDescriptor(descriptor);
        if (providers.has(descriptor.id)) {
          throw new Error(
            `Shader compile provider "${descriptor.id}" is already registered.`
          );
        }
        const keys = descriptor.languageIds.flatMap((language) =>
          descriptor.targets.map((target) => providerKey(language, target))
        );
        for (const key of keys) {
          const current = providerByKey.get(key);
          if (!current) continue;
          const [language, target] = JSON.parse(key) as [
            CodeArtifactLanguage,
            ShaderCompileTarget,
          ];
          throw new Error(
            `Shader compile target "${language}/${target}" is already owned by primary provider "${current.descriptor.id}".`
          );
        }
        providers.set(descriptor.id, provider);
        keysByProvider.set(descriptor.id, Object.freeze(keys));
        for (const key of keys) providerByKey.set(key, provider);
      },
      unregister(providerId) {
        const provider = providers.get(providerId);
        if (!provider) return;
        providers.delete(providerId);
        for (const key of keysByProvider.get(providerId) ?? []) {
          if (providerByKey.get(key) === provider) providerByKey.delete(key);
        }
        keysByProvider.delete(providerId);
      },
      listProviders() {
        return Object.freeze(
          [...providers.values()].sort((left, right) =>
            compareText(left.descriptor.id, right.descriptor.id)
          )
        );
      },
      getProvider(language, target) {
        return providerByKey.get(providerKey(language, target)) ?? null;
      },
    });
  };
