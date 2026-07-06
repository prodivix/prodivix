import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_META_RESOLUTION_POLICY,
  compareBuiltInMetaSourcePriority,
  pickPreferredBuiltInMeta,
} from '@/editor/features/blueprint/editor/inspector/meta/builtInMetaPolicy';
import type { BuiltInComponentMeta } from '@/editor/features/blueprint/editor/inspector/meta/builtInMeta.types';

const createMeta = (
  source: BuiltInComponentMeta['source'],
  id: string
): BuiltInComponentMeta => ({
  runtimeType: 'PdxDiv',
  source,
  version: '1',
  fields: [
    {
      id,
      label: id,
      source: 'props',
      path: `props.${id}`,
      control: 'text',
    },
  ],
});

describe('built in meta resolution policy', () => {
  it('keeps source priority order frozen', () => {
    expect(BUILT_IN_META_RESOLUTION_POLICY.sourcePriority).toEqual([
      'override',
      'generated',
      'inferred',
    ]);
  });

  it('compares sources by policy order', () => {
    expect(
      compareBuiltInMetaSourcePriority('override', 'generated')
    ).toBeLessThan(0);
    expect(
      compareBuiltInMetaSourcePriority('generated', 'inferred')
    ).toBeLessThan(0);
    expect(
      compareBuiltInMetaSourcePriority('inferred', 'override')
    ).toBeGreaterThan(0);
  });

  it('picks the highest-priority candidate', () => {
    const inferred = createMeta('inferred', 'inferred-field');
    const generated = createMeta('generated', 'generated-field');
    const override = createMeta('override', 'override-field');

    expect(
      pickPreferredBuiltInMeta([inferred, generated, override])?.source
    ).toBe('override');
    expect(pickPreferredBuiltInMeta([inferred, generated])?.source).toBe(
      'generated'
    );
    expect(pickPreferredBuiltInMeta([])).toBeUndefined();
  });
});
