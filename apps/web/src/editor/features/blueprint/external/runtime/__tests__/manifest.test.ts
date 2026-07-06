import { describe, expect, it } from 'vitest';
import {
  applyManifestToCanonicalComponents,
  applyManifestToGroups,
} from '@/editor/features/blueprint/external/runtime/manifest';
import type {
  CanonicalExternalComponent,
  ExternalCanonicalGroup,
} from '@/editor/features/blueprint/external/runtime/types';

const createComponent = (
  path: string,
  libraryId = 'demo'
): CanonicalExternalComponent => ({
  libraryId,
  componentName: path,
  component: 'div',
  runtimeType: `${libraryId}-${path}`,
  itemId: `${libraryId}-${path}`,
  path,
  adapter: { kind: 'custom' },
  preview: null,
  defaultProps: {},
  behaviorTags: [],
  codegenHints: {},
  slots: [],
  propsSchema: {},
});

describe('manifest overlay', () => {
  it('applies component-level overrides to canonical component fields', () => {
    const components = [createComponent('Button')];
    const next = applyManifestToCanonicalComponents(components, {
      componentOverrides: {
        Button: {
          displayName: 'Primary Button',
          defaultProps: { variant: 'contained' },
          behaviorTags: ['clickable'],
          codegenHints: { importFrom: '@mui/material' },
        },
      },
    });

    expect(next[0]?.componentName).toBe('Primary Button');
    expect(next[0]?.defaultProps).toMatchObject({ variant: 'contained' });
    expect(next[0]?.behaviorTags).toEqual(['clickable']);
    expect(next[0]?.codegenHints).toMatchObject({
      importFrom: '@mui/material',
    });
  });

  it('keeps groups usable without manifest and supports group remap when provided', () => {
    const button = createComponent('Button');
    const dialog = createComponent('Dialog');
    const groups: ExternalCanonicalGroup[] = [
      {
        id: 'demo-general',
        title: 'General',
        source: 'external',
        items: [button, dialog],
      },
    ];

    const fallback = applyManifestToGroups([button, dialog], groups);
    expect(fallback).toEqual(groups);

    const remapped = applyManifestToGroups([button, dialog], groups, {
      componentOverrides: {
        Dialog: {
          groupId: 'demo-feedback',
          groupTitle: 'Feedback',
        },
      },
    });

    expect(remapped.some((group) => group.id === 'demo-feedback')).toBe(true);
    expect(
      remapped.find((group) => group.id === 'demo-feedback')?.items[0]?.path
    ).toBe('Dialog');
  });
});
