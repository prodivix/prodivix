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
});
