import { describe, expect, it } from 'vitest';
import { resolveNavigateTarget } from '@/pir/actions/registry';

describe('resolveNavigateTarget', () => {
  it('defaults to _blank when target is missing', () => {
    expect(resolveNavigateTarget(undefined)).toEqual({
      configuredTarget: '_blank',
      effectiveTarget: '_blank',
      openedAsBlankForSafety: false,
    });
  });

  it('forces _blank and marks override when safety mode is enabled', () => {
    expect(
      resolveNavigateTarget('_self', {
        forceBlankForExternalSafety: true,
      })
    ).toEqual({
      configuredTarget: '_self',
      effectiveTarget: '_blank',
      openedAsBlankForSafety: true,
    });
  });
});
