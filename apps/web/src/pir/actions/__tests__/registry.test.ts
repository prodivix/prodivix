import { describe, expect, it } from 'vitest';
import { getNavigateLinkKind, isSafeNavigateTo } from '@prodivix/shared/safety';
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

  it('classifies only safe navigation URLs as navigable', () => {
    expect(getNavigateLinkKind('https://example.com')).toBe('external');
    expect(getNavigateLinkKind('http://localhost:5173')).toBe('external');
    expect(getNavigateLinkKind('/docs')).toBe('internal');
    expect(getNavigateLinkKind('#section')).toBe('internal');
    expect(getNavigateLinkKind('?tab=preview')).toBe('internal');
    expect(isSafeNavigateTo('javascript:alert(1)')).toBe(false);
    expect(isSafeNavigateTo('data:text/html,<script></script>')).toBe(false);
  });
});
