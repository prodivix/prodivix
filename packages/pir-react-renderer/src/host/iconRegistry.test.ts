import { describe, expect, it } from 'vitest';
import {
  ensureIconProviderReady,
  getIconProviderState,
  listIconNamesByProvider,
  resolveIconRef,
} from './iconRegistry';

/**
 * The Font Awesome and Heroicons runtimes are bundled workspace dependencies, so
 * every provider becomes ready without reaching a third-party origin. These
 * tests run in a Node/jsdom environment that cannot import an `https://` module
 * specifier at all, which is what makes them a regression guard: a registry that
 * loads icon runtimes from a CDN fails here instead of quietly shipping a remote
 * script into the editor origin.
 */
describe('icon registry bundled runtimes', () => {
  it('makes Font Awesome ready and resolves its icons offline', async () => {
    await ensureIconProviderReady('fontawesome');

    expect(getIconProviderState('fontawesome')).toEqual({
      status: 'ready',
      error: null,
    });

    const iconNames = listIconNamesByProvider('fontawesome');
    expect(iconNames).toContain('User');
    expect(iconNames).toContain('Star');

    expect(
      resolveIconRef({ provider: 'fontawesome', name: 'user' })
    ).not.toBeNull();
    expect(
      resolveIconRef({ provider: 'fontawesome', name: 'faUser' })
    ).not.toBeNull();
    expect(
      resolveIconRef({ provider: 'fontawesome', name: 'arrow-right' })
    ).not.toBeNull();
  });

  it('makes Heroicons ready and resolves both variants offline', async () => {
    await ensureIconProviderReady('heroicons');

    expect(getIconProviderState('heroicons')).toEqual({
      status: 'ready',
      error: null,
    });

    const iconNames = listIconNamesByProvider('heroicons');
    expect(iconNames).toContain('AcademicCap');

    const outline = resolveIconRef({
      provider: 'heroicons',
      name: 'AcademicCap',
    });
    const solid = resolveIconRef({
      provider: 'heroicons',
      name: 'AcademicCap',
      variant: 'solid',
    });
    expect(outline).not.toBeNull();
    expect(solid).not.toBeNull();
    expect(solid).not.toBe(outline);

    expect(
      resolveIconRef({ provider: 'heroicons', name: 'academic-cap' })
    ).toBe(outline);
  });

  it('resolves Lucide icons without any provider preparation', () => {
    expect(
      resolveIconRef({ provider: 'lucide', name: 'circle' })
    ).not.toBeNull();
  });

  it('returns null for names no provider knows', async () => {
    await ensureIconProviderReady('fontawesome');
    await ensureIconProviderReady('heroicons');

    expect(
      resolveIconRef({
        provider: 'fontawesome',
        name: 'definitely-not-an-icon',
      })
    ).toBeNull();
    expect(
      resolveIconRef({ provider: 'heroicons', name: 'definitely-not-an-icon' })
    ).toBeNull();
    expect(
      resolveIconRef({ provider: 'lucide', name: 'definitely-not-an-icon' })
    ).toBeNull();
  });
});
