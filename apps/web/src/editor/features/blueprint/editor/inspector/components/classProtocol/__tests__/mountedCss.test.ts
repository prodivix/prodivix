import { describe, expect, it } from 'vitest';
import type { ComponentNode } from '@prodivix/shared/types/pir';
import {
  createMountedCssDocumentId,
  createMountedCssPath,
  createMountedCssSlotId,
  resolveMountedCssEntries,
  resolveMountedCssBindings,
  upsertMountedCssBinding,
} from '../mountedCss';

const createNode = (): ComponentNode => ({
  id: 'button-1',
  type: 'PdxButton',
  props: {
    className: 'primaryButton',
  },
  children: [],
});

describe('mounted CSS VFS bindings', () => {
  it('stores mounted CSS as a CodeReference binding without CSS source', () => {
    const nextNode = upsertMountedCssBinding(createNode(), {
      slotId: createMountedCssSlotId('button-1'),
      reference: { artifactId: createMountedCssDocumentId('button-1') },
    });

    expect(nextNode.props).toMatchObject({
      codeBindings: {
        mountedCss: [
          {
            slotId: 'blueprint.node.button-1.mountedCss',
            reference: {
              artifactId: 'code_mounted_css_button-1',
            },
          },
        ],
      },
    });
    expect(JSON.stringify(nextNode.props)).not.toContain('primaryButton {');
  });

  it('resolves mounted CSS entries from workspace code documents', () => {
    const node = upsertMountedCssBinding(createNode(), {
      slotId: createMountedCssSlotId('button-1'),
      reference: { artifactId: createMountedCssDocumentId('button-1') },
    });

    const entries = resolveMountedCssEntries(node, {
      [createMountedCssDocumentId('button-1')]: {
        id: createMountedCssDocumentId('button-1'),
        type: 'code',
        path: createMountedCssPath('button-1'),
        contentRev: 2,
        metaRev: 1,
        content: {
          language: 'css',
          source: '.primaryButton {\n  color: red;\n}\n',
        },
      },
    });

    expect(entries).toEqual([
      expect.objectContaining({
        id: 'code_mounted_css_button-1',
        path: '/styles/mounted/button-1.css',
        content: '.primaryButton {\n  color: red;\n}\n',
        classes: ['primaryButton'],
        binding: {
          slotId: 'blueprint.node.button-1.mountedCss',
          reference: { artifactId: 'code_mounted_css_button-1' },
        },
      }),
    ]);
    expect(resolveMountedCssBindings(node)).toHaveLength(1);
  });
});
