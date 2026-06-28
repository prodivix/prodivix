import { describe, expect, it } from 'vitest';
import type { PIRDocument } from '@prodivix/shared/types/pir';
import { CURRENT_PIR_VERSION } from '@prodivix/shared/types/pir';
import { compilePirToReactComponent } from '#src/react/compileComponent';
import { generateReactBundle } from '#src/pirToReact';
import {
  REACT_PRODIVIX_PACKAGE_VERSIONS,
  REACT_PROJECT_SCAFFOLD_PRESET,
  createProjectReactBundle,
} from '#src/react/projectScaffold';

describe('compilePirToReactComponent', () => {
  it('exports mounted CSS as style contributions without leaking bindings as props', () => {
    const pirDoc: PIRDocument = {
      version: CURRENT_PIR_VERSION,
      metadata: { name: 'MountedCssExample' },
      ui: {
        graph: {
          version: 1,
          rootId: 'root',
          nodesById: {
            root: {
              id: 'root',
              type: 'container',
              props: {
                className: 'hero',
                codeBindings: {
                  mountedCss: [
                    {
                      slotId: 'blueprint.node.root.mountedCss',
                      reference: {
                        artifactId: 'code_mounted_css_root',
                      },
                    },
                  ],
                },
              },
            },
          },
          childIdsById: {
            root: [],
          },
        },
      },
    };

    const compiled = compilePirToReactComponent(pirDoc, {
      codeArtifacts: [
        {
          id: 'code_mounted_css_root',
          path: '/styles/mounted/root.css',
          language: 'css',
          source: '.hero { color: red; }',
        },
      ],
    });

    expect(compiled.styles).toEqual([]);
    expect(compiled.artifacts).toEqual([
      expect.objectContaining({
        id: 'mounted-css:code_mounted_css_root',
        kind: 'style',
        ownerRootId: 'app',
        contents: '.hero { color: red; }',
        placement: expect.objectContaining({
          styleScope: 'component',
        }),
        origin: expect.objectContaining({
          kind: 'workspace-document',
          owner: 'workspace',
        }),
      }),
    ]);
    expect(compiled.code).not.toContain("import './styles/mounted/root.css';");
    expect(compiled.code).not.toContain('codeBindings');
    expect(compiled.code).toContain('className="hero"');
  });

  it('omits inline navigation handlers for unsafe static URLs', () => {
    const pirDoc: PIRDocument = {
      version: CURRENT_PIR_VERSION,
      metadata: { name: 'UnsafeNavigateExample' },
      ui: {
        graph: {
          version: 1,
          rootId: 'root',
          nodesById: {
            root: {
              id: 'root',
              type: 'button',
              text: 'Open',
              events: {
                click: {
                  trigger: 'click',
                  action: 'navigate',
                  params: {
                    to: 'javascript:alert(1)',
                    target: '_self',
                  },
                },
              },
            },
          },
          childIdsById: {
            root: [],
          },
        },
      },
    };

    const compiled = compilePirToReactComponent(pirDoc);

    expect(compiled.code).toContain('onClick={() => {}}');
    expect(compiled.code).not.toContain('javascript:alert');
    expect(compiled.code).not.toContain('window.location.assign');
    expect(compiled.code).not.toContain('window.open');
  });

  it('keeps safe static navigation URLs executable in generated code', () => {
    const pirDoc: PIRDocument = {
      version: CURRENT_PIR_VERSION,
      metadata: { name: 'SafeNavigateExample' },
      ui: {
        graph: {
          version: 1,
          rootId: 'root',
          nodesById: {
            root: {
              id: 'root',
              type: 'button',
              text: 'Open',
              events: {
                click: {
                  trigger: 'click',
                  action: 'navigate',
                  params: {
                    to: 'https://example.com/docs',
                    target: '_blank',
                  },
                },
              },
            },
          },
          childIdsById: {
            root: [],
          },
        },
      },
    };

    const compiled = compilePirToReactComponent(pirDoc);

    expect(compiled.code).toContain(
      "window.open(\"https://example.com/docs\", '_blank', 'noopener,noreferrer')"
    );
  });

  it('exports Prodivix button text and package styles', () => {
    const pirDoc: PIRDocument = {
      version: CURRENT_PIR_VERSION,
      metadata: { name: 'StyledButtonExample' },
      ui: {
        graph: {
          version: 1,
          rootId: 'root',
          nodesById: {
            root: {
              id: 'root',
              type: 'PdxButton',
              text: 'Button',
              props: {
                size: 'Big',
                category: 'Primary',
              },
            },
          },
          childIdsById: {
            root: [],
          },
        },
      },
    };

    const compiled = compilePirToReactComponent(pirDoc);

    expect(compiled.code).toContain(
      "import { PdxButton } from '@prodivix/ui';"
    );
    expect(compiled.code).toContain("import '@prodivix/ui/style.css';");
    expect(compiled.code).toContain(
      '<PdxButton size="Big" category="Primary" text="Button" />'
    );
    expect(compiled.code).not.toContain('>\n      Button\n    </PdxButton>');
  });

  it('omits empty exported props while preserving meaningful falsy values', () => {
    const pirDoc: PIRDocument = {
      version: CURRENT_PIR_VERSION,
      metadata: { name: 'EmptyPropsExample' },
      ui: {
        graph: {
          version: 1,
          rootId: 'root',
          nodesById: {
            root: {
              id: 'root',
              type: 'PdxHeading',
              text: 'Heading',
              props: {
                className: '',
                id: '',
                title: '',
                tokens: [],
                metadata: {},
                disabled: false,
                tabIndex: 0,
                dataAttributes: {
                  'data-empty': '',
                  'data-count': 0,
                  'data-label': 'heading',
                },
              },
            },
          },
          childIdsById: {
            root: [],
          },
        },
      },
    };

    const compiled = compilePirToReactComponent(pirDoc);

    expect(compiled.code).toContain('<PdxHeading');
    expect(compiled.code).not.toContain('className=""');
    expect(compiled.code).not.toContain('id=""');
    expect(compiled.code).not.toContain('title=""');
    expect(compiled.code).not.toContain('tokens={[]}');
    expect(compiled.code).not.toContain('metadata={{}}');
    expect(compiled.code).not.toContain('"data-empty"');
    expect(compiled.code).toContain('disabled={false}');
    expect(compiled.code).toContain('tabIndex={0}');
    expect(compiled.code).toContain(
      'dataAttributes={{"data-count":"0","data-label":"heading"}}'
    );
  });

  it('scaffolds a pnpm-installable Vite React project', () => {
    const pirDoc: PIRDocument = {
      version: CURRENT_PIR_VERSION,
      metadata: { name: 'RunnableProjectExample' },
      ui: {
        graph: {
          version: 1,
          rootId: 'root',
          nodesById: {
            root: {
              id: 'root',
              type: 'container',
              text: 'Hello',
            },
          },
          childIdsById: {
            root: [],
          },
        },
      },
    };

    const bundle = createProjectReactBundle(compilePirToReactComponent(pirDoc));
    const packageJson = JSON.parse(
      bundle.files.find((file) => file.path === 'package.json')?.contents ??
        '{}'
    ) as {
      packageManager?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const pnpmWorkspace = bundle.files.find(
      (file) => file.path === 'pnpm-workspace.yaml'
    );

    expect(packageJson.packageManager).toBe(
      REACT_PROJECT_SCAFFOLD_PRESET.packageManager
    );
    expect(packageJson.scripts?.build).toBe('tsc -b && vite build');
    expect(packageJson.dependencies?.react).toBe(
      REACT_PROJECT_SCAFFOLD_PRESET.dependencies.react
    );
    expect(packageJson.dependencies?.['react-dom']).toBe(
      REACT_PROJECT_SCAFFOLD_PRESET.dependencies['react-dom']
    );
    expect(packageJson.devDependencies?.['@types/react']).toBe(
      REACT_PROJECT_SCAFFOLD_PRESET.devDependencies['@types/react']
    );
    expect(packageJson.devDependencies?.['@types/react-dom']).toBe(
      REACT_PROJECT_SCAFFOLD_PRESET.devDependencies['@types/react-dom']
    );
    expect(pnpmWorkspace?.language).toBe('yaml');
    expect(pnpmWorkspace?.contents).toContain('onlyBuiltDependencies:');
    expect(pnpmWorkspace?.contents).toContain('esbuild');
    expect(bundle.files.some((file) => file.path === 'src/vite-env.d.ts')).toBe(
      true
    );
    expect(bundle.files.find((file) => file.path === 'src/App.tsx')?.kind).toBe(
      'source-module'
    );
  });

  it('declares the current Prodivix UI package version in project exports', () => {
    const pirDoc: PIRDocument = {
      version: CURRENT_PIR_VERSION,
      metadata: { name: 'CurrentUiVersionExample' },
      ui: {
        graph: {
          version: 1,
          rootId: 'root',
          nodesById: {
            root: {
              id: 'root',
              type: 'PdxButton',
              text: 'Button',
            },
          },
          childIdsById: {
            root: [],
          },
        },
      },
    };

    const bundle = generateReactBundle(pirDoc);
    const packageJson = JSON.parse(
      bundle.files.find((file) => file.path === 'package.json')?.contents ??
        '{}'
    ) as { dependencies?: Record<string, string> };

    expect(packageJson.dependencies?.['@prodivix/ui']).toBe(
      REACT_PRODIVIX_PACKAGE_VERSIONS['@prodivix/ui']
    );
  });

  it('plans mounted CSS into a production stylesheet bundle', () => {
    const pirDoc: PIRDocument = {
      version: CURRENT_PIR_VERSION,
      metadata: { name: 'MountedCssBundleExample' },
      ui: {
        graph: {
          version: 1,
          rootId: 'root',
          nodesById: {
            root: {
              id: 'root',
              type: 'container',
              props: {
                className: 'hero',
                codeBindings: {
                  mountedCss: {
                    slotId: 'blueprint.node.root.mountedCss',
                    reference: {
                      artifactId: 'code_mounted_css_root',
                    },
                  },
                },
              },
            },
          },
          childIdsById: {
            root: [],
          },
        },
      },
    };

    const bundle = generateReactBundle(pirDoc, {
      codeArtifacts: [
        {
          id: 'code_mounted_css_root',
          path: '/styles/mounted/root.css',
          language: 'css',
          source: '.hero { color: red; }',
        },
      ],
    });
    const appFile = bundle.files.find((file) => file.path === 'src/App.tsx');
    const cssFile = bundle.files.find((file) => file.path === 'src/App.css');

    expect(appFile?.contents).toContain("import './App.css';");
    expect(appFile?.contents).not.toContain('styles/mounted');
    expect(cssFile).toMatchObject({
      path: 'src/App.css',
      kind: 'stylesheet',
      language: 'css',
      importMode: 'side-effect',
    });
    expect(cssFile?.contents).toBe('.hero { color: red; }\n');
  });
});
