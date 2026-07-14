import { describe, expect, it } from 'vitest';
import type {
  CodeArtifactLanguage,
  CodeLanguageCapability,
  CodeLanguageCapabilityProvider,
} from '..';
import { createCodeLanguageProviderRegistry } from '..';

const createProvider = (input: {
  id: string;
  languageIds: readonly CodeArtifactLanguage[];
  capabilities: readonly CodeLanguageCapability[];
}): CodeLanguageCapabilityProvider => ({
  descriptor: {
    id: input.id,
    semanticVersion: '1',
    languageIds: input.languageIds,
    capabilities: input.capabilities,
  },
  openSession: async () => {
    throw new Error('The registry test does not open language sessions.');
  },
});

describe('code language provider registry', () => {
  it('selects one provider by language and capability in stable id order', () => {
    const registry = createCodeLanguageProviderRegistry();
    const css = createProvider({
      id: 'provider-css',
      languageIds: ['css'],
      capabilities: ['completion'],
    });
    const typescript = createProvider({
      id: 'provider-typescript',
      languageIds: ['ts', 'js'],
      capabilities: ['definition', 'references'],
    });

    registry.register(typescript);
    registry.register(css);

    expect(registry.listProviders()).toEqual([css, typescript]);
    expect(registry.getProvider('ts', 'definition')).toBe(typescript);
    expect(registry.getProvider('js', 'references')).toBe(typescript);
    expect(registry.getProvider('css', 'completion')).toBe(css);
    expect(registry.getProvider('css', 'rename')).toBeNull();
  });

  it('rejects duplicate ids and primary language-capability ownership', () => {
    const registry = createCodeLanguageProviderRegistry();
    const primary = createProvider({
      id: 'provider-primary',
      languageIds: ['ts'],
      capabilities: ['definition'],
    });
    registry.register(primary);

    expect(() => registry.register(primary)).toThrow(
      'Code language provider "provider-primary" is already registered.'
    );
    expect(() =>
      registry.register(
        createProvider({
          id: 'provider-conflict',
          languageIds: ['ts'],
          capabilities: ['definition', 'hover'],
        })
      )
    ).toThrow('Code language capability "ts/definition" is already owned');
    expect(registry.getProvider('ts', 'hover')).toBeNull();
  });

  it('releases capability ownership when a provider is unregistered', () => {
    const registry = createCodeLanguageProviderRegistry();
    const first = createProvider({
      id: 'provider-first',
      languageIds: ['wgsl'],
      capabilities: ['hover'],
    });
    const replacement = createProvider({
      id: 'provider-replacement',
      languageIds: ['wgsl'],
      capabilities: ['hover'],
    });

    registry.register(first);
    registry.unregister(first.descriptor.id);
    registry.register(replacement);

    expect(registry.getProvider('wgsl', 'hover')).toBe(replacement);
  });
});
