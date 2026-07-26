import { describe, expect, it } from 'vitest';
import {
  validateCodegenPolicyContribution,
  validateExternalLibraryContribution,
  validateIconProviderContribution,
  validateRenderPolicyContribution,
  validateRenderPolicyContributionV1,
  type CodegenPolicyContributionV1,
  type ExternalLibraryContributionV1,
  type IconProviderContributionV1,
  type RenderPolicyContributionV1,
  type RenderPolicyContributionV2,
} from '#contracts/index';

const externalLibrary = (): ExternalLibraryContributionV1 => ({
  schemaVersion: '1.0',
  libraryId: 'neutral-ui',
  displayName: 'Neutral UI',
  package: { name: '@neutral-ui/components', version: '1.2.3', license: 'MIT' },
  hostImplementationId: 'neutral.components',
  exportDiscovery: { strategy: 'declared', include: ['Button'] },
  components: [
    {
      exportName: 'Button',
      componentName: 'Button',
      runtimeType: 'NeutralButton',
      props: [{ name: 'label', valueType: 'string' }],
      behaviorTags: ['input.action'],
    },
  ],
  dependencies: [
    {
      name: '@neutral-ui/icons',
      version: '1.2.3',
      kind: 'dependency',
      license: 'MIT',
    },
  ],
});

const renderPolicy = (): RenderPolicyContributionV2 => ({
  schemaVersion: '2.0',
  libraryId: 'neutral-ui',
  surface: {
    compatibility: 'container-native',
    viewport: 'container',
    browserMetrics: 'none',
    styles: 'inherited',
    focusKeyboard: 'host-native',
    intrinsicSize: 'parent-constrained',
  },
  rules: [
    {
      id: 'neutral.button',
      runtimeType: 'NeutralButton',
      componentExport: 'Button',
      props: { rename: [{ from: 'text', to: 'label' }] },
      children: { mode: 'text-prop', prop: 'label' },
      portal: { mode: 'inline' },
      fallback: { behavior: 'placeholder', message: 'Button unavailable.' },
    },
  ],
});

const renderPolicyV1 = (): RenderPolicyContributionV1 => ({
  schemaVersion: '1.0',
  libraryId: 'neutral-ui',
  rules: [
    {
      id: 'neutral.button',
      runtimeType: 'NeutralButton',
      componentExport: 'Button',
      children: { mode: 'text-only' },
      portal: { mode: 'inline' },
      fallback: { behavior: 'placeholder', message: 'Button unavailable.' },
    },
  ],
});

const codegenPolicy = (): CodegenPolicyContributionV1 => ({
  schemaVersion: '1.0',
  targetPreset: 'react-vite',
  libraryId: 'neutral-ui',
  dependencies: [
    {
      name: '@neutral-ui/components',
      version: '1.2.3',
      kind: 'dependency',
      license: 'MIT',
    },
  ],
  rules: [
    {
      id: 'neutral.button',
      runtimeType: 'NeutralButton',
      elementPath: ['Button'],
      import: {
        packageName: '@neutral-ui/components',
        kind: 'named',
        imported: 'Button',
      },
      children: { mode: 'text-prop', prop: 'label' },
    },
  ],
  unsupported: { behavior: 'warning', message: 'Unsupported component.' },
});

const iconProvider = (): IconProviderContributionV1 => ({
  schemaVersion: '1.0',
  providerId: 'neutral-icons',
  libraryId: 'neutral-ui',
  displayName: 'Neutral Icons',
  package: { name: '@neutral-ui/icons', version: '1.2.3', license: 'MIT' },
  hostImplementationId: 'neutral.icons',
  exports: { strategy: 'named-exports', exportSuffix: 'Icon' },
  normalization: { inputCase: 'preserve', exportCase: 'pascal' },
  render: { size: { mode: 'prop', prop: 'size' }, colorProp: 'color' },
  codegen: { importKind: 'named', sourceMode: 'package' },
  limits: {
    maxIcons: 1000,
    maxNameLength: 120,
    maxResponseBytes: 262144,
    maxCacheEntries: 256,
  },
});

describe('official component contribution validators', () => {
  it('accepts the four closed Phase 4.5 contracts', () => {
    expect(validateExternalLibraryContribution(externalLibrary()).ok).toBe(
      true
    );
    expect(validateRenderPolicyContribution(renderPolicy()).ok).toBe(true);
    expect(validateCodegenPolicyContribution(codegenPolicy()).ok).toBe(true);
    expect(validateIconProviderContribution(iconProvider()).ok).toBe(true);
  });

  it('keeps v1 validation explicit while decoding v2 into one current model', () => {
    expect(validateRenderPolicyContributionV1(renderPolicyV1()).ok).toBe(true);

    const descriptor = renderPolicy();
    descriptor.rules[0]!.surface = {
      compatibility: 'host-adapted',
      viewport: 'container-projected',
      browserMetrics: 'none',
      styles: 'inherited',
      focusKeyboard: 'host-native',
      intrinsicSize: 'parent-constrained',
    };
    const result = validateRenderPolicyContribution(descriptor);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.descriptor).not.toHaveProperty('schemaVersion');
    expect(result.descriptor.rules[0]?.surface.compatibility).toBe(
      'host-adapted'
    );
  });

  it('rejects incoherent or undeclared surface requirements fail closed', () => {
    const missing = renderPolicy() as unknown as Record<string, unknown>;
    delete missing.surface;
    const missingResult = validateRenderPolicyContribution(missing);
    expect(missingResult.ok).toBe(false);
    expect(missingResult.diagnostics[0]?.meta.documentPath).toBe('/surface');

    const incompatible = renderPolicy();
    incompatible.surface = {
      ...incompatible.surface,
      compatibility: 'container-native',
      browserMetrics: 'browser-native',
    };
    const incompatibleResult = validateRenderPolicyContribution(incompatible);
    expect(incompatibleResult.ok).toBe(false);
    expect(incompatibleResult.diagnostics[0]?.meta.contractVersion).toBe('2.0');
    expect(
      incompatibleResult.diagnostics.some(
        (item) => item.meta.documentPath === '/surface/browserMetrics'
      )
    ).toBe(true);
  });

  it('requires host-overlay rules to resolve as host-adapted', () => {
    const descriptor = renderPolicy();
    descriptor.rules[0]!.portal = { mode: 'host-overlay' };
    descriptor.rules[0]!.hostImplementationId = 'neutral.overlay';

    const result = validateRenderPolicyContribution(descriptor);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some(
        (item) => item.meta.documentPath === '/rules/0/portal/mode'
      )
    ).toBe(true);
  });

  it('rejects executable or URL-shaped descriptor escape hatches', () => {
    const descriptor = externalLibrary() as unknown as Record<string, unknown>;
    descriptor.entryCandidates = ['https://example.com/runtime.js'];
    descriptor.load = () => undefined;

    const result = validateExternalLibraryContribution(descriptor);

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('PLG-1003');
  });

  it('rejects chained or cyclic prop rename policies', () => {
    const descriptor = renderPolicy();
    descriptor.rules[0]!.props = {
      rename: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    };

    const result = validateRenderPolicyContribution(descriptor);

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.meta.documentPath).toContain(
      '/rules/0/props'
    );

    const chained = codegenPolicy();
    chained.rules[0]!.props = {
      rename: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
    };
    expect(validateCodegenPolicyContribution(chained).ok).toBe(false);
  });

  it('restricts generated prop names while accepting one-segment subpaths', () => {
    const descriptor = codegenPolicy();
    descriptor.rules[0]!.import.subpath = 'x';
    descriptor.rules[0]!.props = {
      defaults: { 'invalid prop': true },
    };

    const invalid = validateCodegenPolicyContribution(descriptor);
    expect(invalid.ok).toBe(false);
    expect(invalid.diagnostics[0]?.meta.documentPath).toContain(
      '/rules/0/props/defaults'
    );

    delete descriptor.rules[0]!.props;
    expect(validateCodegenPolicyContribution(descriptor).ok).toBe(true);
  });

  it('requires codegen imports to use an exact declared dependency', () => {
    const descriptor = codegenPolicy();
    descriptor.rules[0]!.import.packageName = '@undeclared/components';

    const result = validateCodegenPolicyContribution(descriptor);

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.meta.documentPath).toBe(
      '/rules/0/import/packageName'
    );
  });

  it('keeps icon export and import strategies coherent', () => {
    const descriptor = iconProvider();
    descriptor.codegen = {
      importKind: 'default',
      sourceMode: 'icon-subpath',
    };

    const result = validateIconProviderContribution(descriptor);

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.meta.documentPath).toBe('/codegen');
  });
});
