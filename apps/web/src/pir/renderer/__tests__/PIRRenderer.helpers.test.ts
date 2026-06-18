import { describe, expect, it } from 'vitest';
import type { ComponentNode } from '@prodivix/shared/types/pir';
import {
  collectMountedCssBlocks,
  collectMountedCssFromNode,
  stripInternalProps,
} from '@/pir/renderer/PIRRenderer.helpers';
import type { RendererCodeArtifact } from '@/pir/renderer/PIRRenderer.types';

describe('PIRRenderer helpers', () => {
  it('collects mounted CSS from CodeReference artifacts', () => {
    const node: ComponentNode = {
      id: 'PdxText-1',
      type: 'PdxText',
      props: {
        codeBindings: {
          mountedCss: [
            {
              slotId: 'blueprint.node.PdxText-1.mountedCss',
              reference: {
                artifactId: 'code_mounted_css_PdxText-1',
              },
            },
          ],
        },
      },
    };
    const artifactsById = new Map<string, RendererCodeArtifact>([
      [
        'code_mounted_css_PdxText-1',
        {
          id: 'code_mounted_css_PdxText-1',
          path: '/styles/mounted/PdxText-1.css',
          language: 'css',
          source: '.my { color: red; }',
        },
      ],
    ]);

    expect(collectMountedCssFromNode(node, [], artifactsById)).toEqual([
      {
        key: 'PdxText-1-code-code_mounted_css_PdxText-1-0',
        content: '.my { color: red; }',
      },
    ]);
  });

  it('does not pass code bindings through as rendered props', () => {
    expect(
      stripInternalProps({
        className: 'my',
        codeBindings: {
          mountedCss: [],
        },
      })
    ).toEqual({ className: 'my' });
  });

  it('collects mounted CSS from outlet content nodes', () => {
    const rootNode: ComponentNode = {
      id: 'layout-root',
      type: 'PdxDiv',
      children: [{ id: 'outlet-1', type: 'PdxOutlet' }],
    };
    const outletContentNode: ComponentNode = {
      id: 'PdxText-1',
      type: 'PdxText',
      props: {
        className: 'my',
        codeBindings: {
          mountedCss: [
            {
              slotId: 'blueprint.node.PdxText-1.mountedCss',
              reference: {
                artifactId: 'code_mounted_css_PdxText-1',
              },
            },
          ],
        },
      },
    };
    const artifacts: RendererCodeArtifact[] = [
      {
        id: 'code_mounted_css_PdxText-1',
        path: '/styles/mounted/PdxText-1.css',
        language: 'css',
        source: '.my { color: red; }',
      },
    ];

    expect(
      collectMountedCssBlocks(rootNode, artifacts, [outletContentNode])
    ).toEqual([
      {
        key: 'PdxText-1-code-code_mounted_css_PdxText-1-0',
        content: '.my { color: red; }',
      },
    ]);
  });
});
