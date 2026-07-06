import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExternalLibraryProfile } from '@/editor/features/blueprint/external/runtime/types';

const runtimeMocks = vi.hoisted(() => ({
  loadExternalEsmModule: vi.fn(async () => ({ Button: {} })),
  scanExternalModulePaths: vi.fn(() => ['Button']),
  enrichCanonicalPropOptionsFromDts: vi.fn(
    async (
      _descriptor: unknown,
      components: Record<string, unknown>[]
    ): Promise<Record<string, unknown>[]> => components
  ),
  applyManifestToCanonicalComponents: vi.fn(
    (components: unknown[]) => components
  ),
  applyManifestToGroups: vi.fn(
    (_components: unknown[], groups: unknown[]) => groups
  ),
  registerExternalRuntimeComponents: vi.fn(),
  registerExternalGroups: vi.fn(),
}));

vi.mock('../loader', () => ({
  loadExternalEsmModule: runtimeMocks.loadExternalEsmModule,
}));

vi.mock('../scanner', () => ({
  scanExternalModulePaths: runtimeMocks.scanExternalModulePaths,
}));

vi.mock('../dtsPropOptions', () => ({
  enrichCanonicalPropOptionsFromDts:
    runtimeMocks.enrichCanonicalPropOptionsFromDts,
}));

vi.mock('../manifest', () => ({
  applyManifestToCanonicalComponents:
    runtimeMocks.applyManifestToCanonicalComponents,
  applyManifestToGroups: runtimeMocks.applyManifestToGroups,
}));

vi.mock('../registry', () => ({
  registerExternalRuntimeComponents:
    runtimeMocks.registerExternalRuntimeComponents,
  registerExternalGroups: runtimeMocks.registerExternalGroups,
}));

const createProfile = (): ExternalLibraryProfile => ({
  descriptor: () => ({
    libraryId: 'antd',
    packageName: 'antd',
    version: '5.28.0',
    source: 'esm.sh',
    entryCandidates: ['https://esm.sh/antd@5.28.0'],
  }),
  scanMode: 'include-only',
  toCanonicalComponents: () => [
    {
      libraryId: 'antd',
      componentName: 'Button',
      component: 'button',
      runtimeType: 'antd.Button',
      itemId: 'antd-button',
      path: 'Button',
      adapter: { kind: 'custom' },
      preview: null,
      defaultProps: {},
      propOptions: {},
      propsSchema: {},
      slots: [],
      behaviorTags: [],
      codegenHints: {},
    },
  ],
  toGroups: (components) => [
    {
      id: 'external-antd-basic',
      title: 'Ant Design',
      source: 'external',
      items: components,
    },
  ],
});

describe('ensureExternalLibrary', () => {
  beforeEach(() => {
    vi.resetModules();
    runtimeMocks.loadExternalEsmModule.mockClear();
    runtimeMocks.scanExternalModulePaths.mockClear();
    runtimeMocks.enrichCanonicalPropOptionsFromDts.mockClear();
    runtimeMocks.applyManifestToCanonicalComponents.mockClear();
    runtimeMocks.applyManifestToGroups.mockClear();
    runtimeMocks.registerExternalRuntimeComponents.mockClear();
    runtimeMocks.registerExternalGroups.mockClear();
  });

  it('dedupes concurrent ensure calls for the same library', async () => {
    const { ensureExternalLibrary } =
      await import('@/editor/features/blueprint/external/runtime/engine');
    const profile = createProfile();

    await Promise.all([
      ensureExternalLibrary(profile),
      ensureExternalLibrary(profile),
    ]);

    expect(runtimeMocks.loadExternalEsmModule).toHaveBeenCalledTimes(1);
    expect(
      runtimeMocks.registerExternalRuntimeComponents
    ).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.registerExternalGroups).toHaveBeenCalledTimes(1);
  });

  it('re-registers runtime groups after a completed ensure cycle', async () => {
    const { ensureExternalLibrary } =
      await import('@/editor/features/blueprint/external/runtime/engine');
    const profile = createProfile();

    await ensureExternalLibrary(profile);
    await ensureExternalLibrary(profile);

    expect(runtimeMocks.loadExternalEsmModule).toHaveBeenCalledTimes(2);
    expect(
      runtimeMocks.registerExternalRuntimeComponents
    ).toHaveBeenCalledTimes(2);
    expect(runtimeMocks.registerExternalGroups).toHaveBeenCalledTimes(2);
  });
});
