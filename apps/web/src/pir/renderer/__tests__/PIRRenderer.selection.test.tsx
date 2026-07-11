import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_PIR_VERSION,
  type PIRDocument,
} from '@prodivix/shared/types/pir';
import { PIRRenderer } from '@/pir/renderer/PIRRenderer';
import { createComponentRegistry } from '@/pir/renderer/registry';

const document: PIRDocument = {
  version: CURRENT_PIR_VERSION,
  metadata: { name: 'Selection Context' },
  ui: {
    graph: {
      version: 1,
      rootId: 'parent',
      nodesById: {
        parent: { id: 'parent', type: 'SelectionParent' },
        child: { id: 'child', type: 'SelectionChild', text: 'Child' },
      },
      childIdsById: { parent: ['child'] },
    },
  },
};

describe('PIR renderer selection context', () => {
  it('distinguishes exact selection from a selected descendant', () => {
    const registry = createComponentRegistry();
    registry.register('SelectionParent', 'section', {
      kind: 'custom',
      supportsChildren: true,
      mapProps: ({ isSelected, hasSelectedDescendant }) => ({
        props: {
          'aria-label': isSelected
            ? 'Parent selected'
            : hasSelectedDescendant
              ? 'Parent contains selection'
              : 'Parent idle',
        },
        supportsChildren: true,
        renderNodeChildren: true,
      }),
    });
    registry.register('SelectionChild', 'button', {
      kind: 'custom',
      supportsChildren: true,
    });
    const rendered = render(
      <PIRRenderer pirDoc={document} registry={registry} selectedId="child" />
    );

    expect(
      screen.getByRole('region', { name: 'Parent contains selection' })
    ).toBeTruthy();
    rendered.rerender(
      <PIRRenderer pirDoc={document} registry={registry} selectedId="parent" />
    );
    expect(
      screen.getByRole('region', { name: 'Parent selected' })
    ).toBeTruthy();
  });
});
