import { describe, expect, it } from 'vitest';
import {
  CURRENT_PIR_VERSION,
  type PIRDocument,
} from '@prodivix/shared/types/pir';
import { generateReactBundle, generateReactCode } from '#src/pirToReact';
import type { CodegenPolicySnapshot } from '#src/core/codegenPolicy';

const snapshot: CodegenPolicySnapshot = {
  schemaVersion: '1.0',
  registryRevision: 7,
  targetPreset: 'react-vite',
  libraries: [
    {
      source: {
        pluginId: '@prodivix/plugin-neutral',
        contributionId: 'neutral.codegen',
        generation: 1,
      },
      libraryId: 'neutral-ui',
      runtimeTypes: ['NeutralButton'],
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
          props: {
            defaults: { tone: 'default' },
            rename: [{ from: 'disabledState', to: 'disabled' }],
          },
          children: { mode: 'text-prop', prop: 'label' },
        },
      ],
      unsupported: {
        behavior: 'warning',
        message: 'Neutral component is unsupported.',
      },
    },
  ],
  iconProviders: [
    {
      source: {
        pluginId: '@prodivix/plugin-neutral',
        contributionId: 'neutral.icons',
        generation: 1,
      },
      providerId: 'neutral-icons',
      package: {
        name: '@neutral-ui/icons',
        version: '1.2.3',
        license: 'MIT',
      },
      exports: { strategy: 'named-exports', exportSuffix: 'Icon' },
      normalization: { inputCase: 'preserve', exportCase: 'pascal' },
      render: { size: { mode: 'prop', prop: 'size' } },
      codegen: { importKind: 'named', sourceMode: 'package' },
      limits: {
        maxIcons: 1000,
        maxNameLength: 120,
        maxResponseBytes: 262144,
        maxCacheEntries: 256,
      },
    },
  ],
};

const createDocument = (type: string, props: Record<string, unknown> = {}) =>
  ({
    version: CURRENT_PIR_VERSION,
    metadata: { name: 'PolicyExample' },
    ui: {
      graph: {
        version: 1,
        rootId: 'root',
        nodesById: {
          root: { id: 'root', type, text: 'Launch', props },
        },
        childIdsById: { root: [] },
      },
    },
  }) satisfies PIRDocument;

describe('Codegen Policy snapshot', () => {
  it('constructs a composite React adapter from immutable policy data', () => {
    const bundle = generateReactBundle(
      createDocument('NeutralButton', { disabledState: true }),
      { codegenPolicySnapshot: snapshot }
    );
    const app = bundle.files.find((file) => file.path === 'src/App.tsx');

    expect(app?.contents).toContain(
      "import { Button } from '@neutral-ui/components';"
    );
    expect(app?.contents).toContain(
      '<Button tone="default" disabled={true} label="Launch" />'
    );
    expect(bundle.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: '@neutral-ui/components',
          version: '1.2.3',
          origin: expect.objectContaining({ license: 'MIT' }),
        }),
      ])
    );
  });

  it('carries the complete exact dependency closure only for used policies', () => {
    const dependencySnapshot: CodegenPolicySnapshot = {
      ...snapshot,
      libraries: [
        {
          ...snapshot.libraries[0]!,
          dependencies: [
            ...snapshot.libraries[0]!.dependencies,
            {
              name: '@neutral-ui/runtime-peer',
              version: '4.5.6',
              kind: 'dependency',
              license: 'Apache-2.0',
            },
          ],
        },
      ],
    };
    const componentBundle = generateReactBundle(
      createDocument('NeutralButton'),
      { codegenPolicySnapshot: dependencySnapshot }
    );
    const iconBundle = generateReactBundle(
      createDocument('PdxIcon', {
        iconRef: { provider: 'neutral-icons', name: 'Spark' },
      }),
      { codegenPolicySnapshot: dependencySnapshot }
    );
    const unusedBundle = generateReactBundle(createDocument('container'), {
      codegenPolicySnapshot: dependencySnapshot,
    });
    const packageJson = JSON.parse(
      componentBundle.files.find((file) => file.path === 'package.json')
        ?.contents ?? '{}'
    ) as { dependencies?: Record<string, string> };

    expect(packageJson.dependencies?.['@neutral-ui/runtime-peer']).toBe(
      '4.5.6'
    );
    expect(
      componentBundle.dependencies.find(
        (dependency) => dependency.name === '@neutral-ui/runtime-peer'
      )?.origin
    ).toMatchObject({
      license: 'Apache-2.0',
      updatePolicy: 'pin',
    });
    expect(
      iconBundle.dependencies.some(
        (dependency) => dependency.name === '@neutral-ui/runtime-peer'
      )
    ).toBe(true);
    expect(
      unusedBundle.dependencies.some(
        (dependency) => dependency.name === '@neutral-ui/runtime-peer'
      )
    ).toBe(false);
  });

  it('treats React children as structural output instead of a duplicated prop', () => {
    const structuralSnapshot: CodegenPolicySnapshot = {
      ...snapshot,
      libraries: [
        {
          ...snapshot.libraries[0]!,
          rules: [
            {
              ...snapshot.libraries[0]!.rules[0]!,
              children: { mode: 'preserve' },
            },
          ],
        },
      ],
    };

    const code = generateReactCode(
      createDocument('NeutralButton', { children: 'Legacy child prop' }),
      { resourceType: 'component', codegenPolicySnapshot: structuralSnapshot }
    );

    expect(code).toMatch(/<Button tone="default">\s+Launch\s+<\/Button>/);
    expect(code).not.toContain('children=');
    expect(code).not.toContain('Legacy child prop');
  });

  it('resolves icon imports without provider-id branches in the React adapter', () => {
    const code = generateReactCode(
      createDocument('PdxIcon', {
        iconRef: { provider: 'neutral-icons', name: 'Spark' },
        size: 20,
      }),
      { resourceType: 'component', codegenPolicySnapshot: snapshot }
    );

    expect(code).toContain("import { SparkIcon } from '@neutral-ui/icons';");
    expect(code).toContain('<SparkIcon size={20} />');
    expect(code).not.toContain('iconRef');
  });

  it('emits the policy-owned unsupported diagnostic for an unmapped runtime type', () => {
    const unsupportedSnapshot: CodegenPolicySnapshot = {
      ...snapshot,
      libraries: [
        {
          ...snapshot.libraries[0]!,
          runtimeTypes: ['NeutralButton', 'NeutralDialog'],
        },
      ],
    };

    const bundle = generateReactBundle(createDocument('NeutralDialog'), {
      codegenPolicySnapshot: unsupportedSnapshot,
    });

    expect(bundle.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CODEGEN_POLICY_UNSUPPORTED_RUNTIME_TYPE',
          severity: 'warning',
          message: 'Neutral component is unsupported.',
        }),
      ])
    );
  });

  it('resolves icon aliases transitively', () => {
    const aliasedSnapshot: CodegenPolicySnapshot = {
      ...snapshot,
      iconProviders: [
        {
          ...snapshot.iconProviders[0]!,
          normalization: {
            ...snapshot.iconProviders[0]!.normalization,
            aliases: [
              { from: 'Spark', to: 'Shine' },
              { from: 'Shine', to: 'Glow' },
            ],
          },
        },
      ],
    };

    const code = generateReactCode(
      createDocument('PdxIcon', {
        iconRef: { provider: 'neutral-icons', name: 'Spark' },
      }),
      { resourceType: 'component', codegenPolicySnapshot: aliasedSnapshot }
    );

    expect(code).toContain("import { GlowIcon } from '@neutral-ui/icons';");
  });

  it('blocks icon names that cannot become safe JavaScript exports', () => {
    const unsafeSnapshot: CodegenPolicySnapshot = {
      ...snapshot,
      iconProviders: [
        {
          ...snapshot.iconProviders[0]!,
          exports: { strategy: 'named-exports' },
          normalization: {
            inputCase: 'preserve',
            exportCase: 'preserve',
          },
        },
      ],
    };

    const bundle = generateReactBundle(
      createDocument('PdxIcon', {
        iconRef: { provider: 'neutral-icons', name: '../../Unsafe' },
      }),
      { codegenPolicySnapshot: unsafeSnapshot }
    );

    expect(bundle.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CODEGEN_POLICY_INVALID_ICON_EXPORT',
          severity: 'error',
        }),
      ])
    );
    expect(bundle.dependencies).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: '@neutral-ui/icons' }),
      ])
    );
  });

  it('blocks conflicting exact package coordinates across policies', () => {
    const conflictingSnapshot: CodegenPolicySnapshot = {
      ...snapshot,
      libraries: [
        ...snapshot.libraries,
        {
          source: {
            pluginId: '@prodivix/plugin-conflict',
            contributionId: 'conflict.codegen',
            generation: 1,
          },
          libraryId: 'conflict-ui',
          runtimeTypes: ['ConflictButton'],
          dependencies: [
            {
              name: '@neutral-ui/components',
              version: '9.9.9',
              kind: 'dependency',
              license: 'Apache-2.0',
            },
          ],
          rules: [
            {
              id: 'conflict.button',
              runtimeType: 'ConflictButton',
              elementPath: ['Button'],
              import: {
                packageName: '@neutral-ui/components',
                kind: 'named',
                imported: 'Button',
              },
              children: { mode: 'preserve' },
            },
          ],
          unsupported: { behavior: 'error' },
        },
      ],
    };

    const bundle = generateReactBundle(createDocument('NeutralButton'), {
      codegenPolicySnapshot: conflictingSnapshot,
    });

    expect(bundle.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CODEGEN_POLICY_PACKAGE_CONFLICT',
          severity: 'error',
        }),
      ])
    );
    expect(
      bundle.dependencies.find(
        (dependency) => dependency.name === '@neutral-ui/components'
      )?.version
    ).toBe('1.2.3');
  });

  it('aliases colliding namespace imports from package identity alone', () => {
    const namespaceSnapshot: CodegenPolicySnapshot = {
      schemaVersion: '1.0',
      registryRevision: 9,
      targetPreset: 'react-vite',
      libraries: ['one', 'two'].map((suffix) => ({
        source: {
          pluginId: `@prodivix/plugin-neutral-${suffix}`,
          contributionId: `neutral-${suffix}.codegen`,
          generation: 1,
        },
        libraryId: `neutral-${suffix}`,
        runtimeTypes: [`Neutral${suffix}Tabs`],
        dependencies: [
          {
            name: `@neutral-${suffix}/tabs`,
            version: '1.0.0',
            kind: 'dependency' as const,
            license: 'MIT',
          },
        ],
        rules: [
          {
            id: `neutral-${suffix}.tabs`,
            runtimeType: `Neutral${suffix}Tabs`,
            elementPath: ['Tabs', 'Root'],
            import: {
              packageName: `@neutral-${suffix}/tabs`,
              kind: 'namespace' as const,
              imported: 'Tabs',
            },
            children: { mode: 'preserve' as const },
          },
        ],
        unsupported: { behavior: 'error' as const },
      })),
      iconProviders: [],
    };
    const document: PIRDocument = {
      version: CURRENT_PIR_VERSION,
      metadata: { name: 'NamespaceAliases' },
      ui: {
        graph: {
          version: 1,
          rootId: 'root',
          nodesById: {
            root: { id: 'root', type: 'container' },
            one: { id: 'one', type: 'NeutraloneTabs', text: 'One' },
            two: { id: 'two', type: 'NeutraltwoTabs', text: 'Two' },
          },
          childIdsById: { root: ['one', 'two'], one: [], two: [] },
        },
      },
    };

    const code = generateReactCode(document, {
      resourceType: 'component',
      codegenPolicySnapshot: namespaceSnapshot,
    });

    expect(code).toContain(
      "import * as NeutralOneTabsTabs from '@neutral-one/tabs';"
    );
    expect(code).toContain(
      "import * as NeutralTwoTabsTabs from '@neutral-two/tabs';"
    );
    expect(code).toContain('<NeutralOneTabsTabs.Root>');
    expect(code).toContain('<NeutralTwoTabsTabs.Root>');
  });
});
