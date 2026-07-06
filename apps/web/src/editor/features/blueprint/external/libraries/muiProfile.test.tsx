import { describe, expect, it } from 'vitest';
import type { ComponentNode } from '@prodivix/shared/types/pir';
import { muiExternalLibraryProfile } from './muiProfile';

describe('muiExternalLibraryProfile', () => {
  it('injects safe fallback children for Accordion when node has no children', () => {
    const module = {
      Accordion: () => null,
    };

    const components = muiExternalLibraryProfile.toCanonicalComponents(module, [
      'Accordion',
    ]);
    const accordion = components.find((item) => item.path === 'Accordion');
    expect(accordion).toBeTruthy();
    expect(accordion?.adapter.mapProps).toBeTypeOf('function');

    const node: ComponentNode = {
      id: 'node-accordion-1',
      type: 'MuiAccordion',
      text: 'Accordion',
    };

    const mapped = accordion?.adapter.mapProps?.({
      node,
      resolvedProps: {},
      resolvedStyle: {},
      resolvedText: 'Accordion',
    });

    const injectedChildren = mapped?.children as React.ReactElement<{
      id?: string;
      'aria-controls'?: string;
    }>[];
    expect(Array.isArray(injectedChildren)).toBe(true);
    expect(injectedChildren).toHaveLength(2);
    expect(injectedChildren[0]?.props?.id).toBe('node-accordion-1-summary');
    expect(injectedChildren[0]?.props?.['aria-controls']).toBe(
      'node-accordion-1-region'
    );
  });

  it('does not inject fallback children when Accordion already has child nodes', () => {
    const module = {
      Accordion: () => null,
    };

    const components = muiExternalLibraryProfile.toCanonicalComponents(module, [
      'Accordion',
    ]);
    const accordion = components.find((item) => item.path === 'Accordion');
    expect(accordion).toBeTruthy();

    const node: ComponentNode = {
      id: 'node-accordion-2',
      type: 'MuiAccordion',
      children: [
        {
          id: 'child-summary',
          type: 'div',
        },
      ],
    };

    const mapped = accordion?.adapter.mapProps?.({
      node,
      resolvedProps: {},
      resolvedStyle: {},
      resolvedText: undefined,
    });

    expect(mapped?.children).toBeUndefined();
  });
});
