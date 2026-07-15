import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type {
  CodeArtifactLanguage,
  ShaderCompileCapabilityProvider,
  ShaderCompileProfile,
} from '..';
import {
  createShaderCompileProviderRegistry,
  decodeShaderCompileProfile,
  writeShaderCompileProfile,
} from '..';

const profileArbitrary: fc.Arbitrary<
  Readonly<{ language: CodeArtifactLanguage; profile: ShaderCompileProfile }>
> = fc.oneof(
  fc.constantFrom(
    {
      language: 'glsl' as const,
      profile: {
        schemaVersion: '1.0' as const,
        target: 'webgl2' as const,
        stage: 'vertex' as const,
      },
    },
    {
      language: 'glsl' as const,
      profile: {
        schemaVersion: '1.0' as const,
        target: 'webgl2' as const,
        stage: 'fragment' as const,
      },
    }
  ),
  fc
    .record({
      stage: fc.option(
        fc.constantFrom(
          'vertex' as const,
          'fragment' as const,
          'compute' as const
        ),
        { nil: undefined }
      ),
      entryPoint: fc.option(
        fc
          .tuple(
            fc.constantFrom('main', 'entry', 'shader'),
            fc.integer({ min: 0, max: 100 })
          )
          .map(([prefix, suffix]) => `${prefix}_${suffix}`),
        { nil: undefined }
      ),
    })
    .map(({ stage, entryPoint }) => ({
      language: 'wgsl' as const,
      profile: {
        schemaVersion: '1.0' as const,
        target: 'webgpu' as const,
        ...(stage ? { stage } : {}),
        ...(entryPoint ? { entryPoint } : {}),
      },
    }))
);

const createProvider = (
  id: string,
  language: CodeArtifactLanguage,
  target: ShaderCompileProfile['target']
): ShaderCompileCapabilityProvider => ({
  descriptor: {
    id,
    version: '1.0.0',
    languageIds: [language],
    targets: [target],
  },
  async openSession() {
    throw new Error('The registry property does not open sessions.');
  },
});

describe('shader compile contract properties', () => {
  it('round-trips every canonical profile without changing unrelated metadata', () => {
    fc.assert(
      fc.property(profileArbitrary, ({ language, profile }) => {
        const metadata = writeShaderCompileProfile(
          { 'plugin.example': { enabled: true } },
          profile
        );
        expect(decodeShaderCompileProfile(metadata, language)).toEqual({
          status: 'valid',
          profile,
        });
        expect(metadata?.['plugin.example']).toEqual({ enabled: true });
        expect(writeShaderCompileProfile(metadata, null)).toEqual({
          'plugin.example': { enabled: true },
        });
      })
    );
  });

  it('rejects target/language mismatches at the persisted boundary', () => {
    expect(
      decodeShaderCompileProfile(
        writeShaderCompileProfile(undefined, {
          schemaVersion: '1.0',
          target: 'webgl2',
          stage: 'vertex',
        }),
        'wgsl'
      )
    ).toMatchObject({ status: 'invalid' });
    expect(
      decodeShaderCompileProfile(
        writeShaderCompileProfile(undefined, {
          schemaVersion: '1.0',
          target: 'webgpu',
        }),
        'glsl'
      )
    ).toMatchObject({ status: 'invalid' });
  });

  it('keeps primary provider ownership deterministic', () => {
    const registry = createShaderCompileProviderRegistry();
    const webGpu = createProvider('provider-webgpu', 'wgsl', 'webgpu');
    const webGl = createProvider('provider-webgl', 'glsl', 'webgl2');
    registry.register(webGpu);
    registry.register(webGl);
    expect(registry.listProviders()).toEqual([webGl, webGpu]);
    expect(registry.getProvider('wgsl', 'webgpu')).toBe(webGpu);
    expect(() =>
      registry.register(createProvider('duplicate', 'wgsl', 'webgpu'))
    ).toThrow('already owned');
  });
});
