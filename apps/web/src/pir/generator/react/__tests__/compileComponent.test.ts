import { describe, expect, it } from 'vitest';
import type { PIRDocument } from '@/core/types/engine.types';
import { compilePirToReactComponent } from '@/pir/generator/react/compileComponent';

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
});
