import { act, render, screen } from '@testing-library/react';
import type { i18n } from 'i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { createRoutes } from './App';

const routeLoads = vi.hoisted(() => ({
  auth: 0,
  community: 0,
  communityDetail: 0,
  profile: 0,
}));

const loadAppNamespaces = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('./i18n', () => ({ loadAppNamespaces }));
vi.mock('./home/Home', () => ({
  default: () => <h1>Home route</h1>,
}));
vi.mock('./auth/AuthPage', () => {
  routeLoads.auth += 1;
  return { AuthPage: () => <h1>Auth route</h1> };
});
vi.mock('./auth/ProfilePage', () => {
  routeLoads.profile += 1;
  return { ProfilePage: () => <h1>Profile route</h1> };
});
vi.mock('./community/CommunityPage', () => {
  routeLoads.community += 1;
  return { CommunityPage: () => <h1>Community route</h1> };
});
vi.mock('./community/CommunityDetailPage', () => {
  routeLoads.communityDetail += 1;
  return { CommunityDetailPage: () => <h1>Community detail route</h1> };
});

describe('createRoutes', () => {
  it('loads only the matched public route and its namespace', async () => {
    const instance = {
      t: (key: string) => key,
    } as unknown as i18n;
    const router = createMemoryRouter(createRoutes(instance), {
      initialEntries: ['/'],
    });

    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole('heading', { name: 'Home route' })
    ).toBeTruthy();
    expect(routeLoads).toEqual({
      auth: 0,
      community: 0,
      communityDetail: 0,
      profile: 0,
    });
    expect(loadAppNamespaces).not.toHaveBeenCalled();

    await act(async () => {
      await router.navigate('/auth');
    });

    expect(
      await screen.findByRole('heading', { name: 'Auth route' })
    ).toBeTruthy();
    expect(routeLoads).toEqual({
      auth: 1,
      community: 0,
      communityDetail: 0,
      profile: 0,
    });
    expect(loadAppNamespaces).toHaveBeenCalledWith(instance, ['auth']);

    router.dispose();
  });
});
