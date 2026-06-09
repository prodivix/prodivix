import { describe, expect, it } from 'vitest';
import type { PIRDocument } from '@/core/types/engine.types';
import { compilePirToReactComponent } from '@/pir/generator/react/compileComponent';
import { generateReactBundle } from '@/pir/generator/pirToReact';
import {
  REACT_PRODIVIX_PACKAGE_VERSIONS,
  REACT_PROJECT_SCAFFOLD_PRESET,
  createProjectReactBundle,
} from '@/pir/generator/react/projectScaffold';

describe('compilePirToReactComponent', () => {
  it('exports mounted CSS from code slot artifacts without leaking bindings as props', () => {
    const pirDoc: PIRDocument = {
      version: '1.3',
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

    expect(compiled.mountedCssFiles).toEqual([
      {
        path: 'styles/mounted/root.css',
        content: '.hero { color: red; }\n',
      },
    ]);
    expect(compiled.code).toContain("import './styles/mounted/root.css';");
    expect(compiled.code).not.toContain('codeBindings');
    expect(compiled.code).toContain('className="hero"');
  });

  it('omits inline navigation handlers for unsafe static URLs', () => {
    const pirDoc: PIRDocument = {
      version: '1.3',
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
      version: '1.3',
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
      version: '1.3',
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

  it('scaffolds a pnpm-installable Vite React project', () => {
    const pirDoc: PIRDocument = {
      version: '1.3',
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
      bundle.files.find((file) => file.path === 'package.json')?.content ?? '{}'
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
    expect(pnpmWorkspace?.content).toContain('onlyBuiltDependencies:');
    expect(pnpmWorkspace?.content).toContain('esbuild');
    expect(bundle.files.some((file) => file.path === 'src/vite-env.d.ts')).toBe(
      true
    );
  });

  it('declares the current Prodivix UI package version in project exports', () => {
    const pirDoc: PIRDocument = {
      version: '1.3',
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
      bundle.files.find((file) => file.path === 'package.json')?.content ?? '{}'
    ) as { dependencies?: Record<string, string> };

    expect(packageJson.dependencies?.['@prodivix/ui']).toBe(
      REACT_PRODIVIX_PACKAGE_VERSIONS['@prodivix/ui']
    );
  });
});
