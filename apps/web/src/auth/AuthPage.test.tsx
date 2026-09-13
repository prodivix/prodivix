import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthPage } from '@/auth/AuthPage';
import { ApiError, authApi } from '@/auth/authApi';

const { setSession } = vi.hoisted(() => ({ setSession: vi.fn() }));

vi.mock('@/auth/useAuthStore', () => ({
  useAuthStore: (
    selector: (state: { setSession: typeof setSession }) => unknown
  ) => selector({ setSession }),
}));

describe('AuthPage', () => {
  beforeEach(() => {
    setSession.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('submits valid login credentials and opens the profile', async () => {
    const login = vi.spyOn(authApi, 'login').mockResolvedValue({
      token: 'token',
      expiresAt: '2099-01-01T00:00:00.000Z',
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        createdAt: '2026-07-10T00:00:00.000Z',
      },
    });

    render(
      <MemoryRouter initialEntries={['/auth']}>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/profile" element={<div>Profile</div>} />
        </Routes>
      </MemoryRouter>
    );

    const loginPanel = screen.getByRole('tabpanel');
    fireEvent.change(within(loginPanel).getByLabelText('fields.email'), {
      target: { value: ' user@example.com ' },
    });
    fireEvent.change(within(loginPanel).getByLabelText(/^fields\.password/), {
      target: { value: 'password' },
    });
    fireEvent.click(
      within(loginPanel).getByRole('button', { name: 'actions.login' })
    );

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'password',
      });
    });
    expect(await screen.findByText('Profile')).toBeTruthy();
  });

  it('confirms a created account and opens login with an empty password', async () => {
    const register = vi
      .spyOn(authApi, 'register')
      .mockResolvedValue({ created: true });
    render(
      <MemoryRouter initialEntries={['/auth']}>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/profile" element={<div>Profile</div>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(
      within(screen.getByRole('tabpanel')).getByLabelText(/^fields\.password/),
      {
        target: { value: 'previous-failed-password' },
      }
    );
    fireEvent.click(screen.getByRole('tab', { name: 'tabs.register' }));
    const registerPanel = screen.getByRole('tabpanel');
    fireEvent.change(within(registerPanel).getByLabelText('fields.name'), {
      target: { value: ' User ' },
    });
    fireEvent.change(within(registerPanel).getByLabelText('fields.email'), {
      target: { value: ' user@example.com ' },
    });
    fireEvent.change(
      within(registerPanel).getByPlaceholderText('placeholders.password'),
      { target: { value: 'password' } }
    );
    fireEvent.click(
      within(registerPanel).getByRole('button', { name: 'actions.register' })
    );

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({
        name: 'User',
        email: 'user@example.com',
        password: 'password',
        description: '',
      })
    );
    expect(await screen.findByText('registration.created')).toBeTruthy();
    expect(
      screen.getByRole('tab', { name: 'tabs.login', selected: true })
    ).toBeTruthy();
    expect(
      (
        within(screen.getByRole('tabpanel')).getByLabelText(
          'fields.email'
        ) as HTMLInputElement
      ).value
    ).toBe('user@example.com');
    expect(
      (
        within(screen.getByRole('tabpanel')).getByLabelText(
          /^fields\.password/
        ) as HTMLInputElement
      ).value
    ).toBe('');
    expect(setSession).not.toHaveBeenCalled();
    expect(screen.queryByText('Profile')).toBeNull();
  });

  const renderRegistration = () => {
    render(
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>
    );
    fireEvent.change(
      within(screen.getByRole('tabpanel')).getByLabelText(/^fields\.password/),
      {
        target: { value: 'previous-failed-password' },
      }
    );
    fireEvent.click(screen.getByRole('tab', { name: 'tabs.register' }));
    fireEvent.change(
      within(screen.getByRole('tabpanel')).getByLabelText('fields.name'),
      { target: { value: 'User' } }
    );
    fireEvent.change(
      within(screen.getByRole('tabpanel')).getByLabelText('fields.email'),
      { target: { value: ' user@example.com ' } }
    );
    fireEvent.change(
      within(screen.getByRole('tabpanel')).getByLabelText(/^fields\.password/),
      { target: { value: 'replacement-password' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'actions.register' }));
  };

  it('explains an existing email and offers login without reusing either password', async () => {
    vi.spyOn(authApi, 'register').mockRejectedValue(
      new ApiError('Server fallback', 409, 'API-4009')
    );
    renderRegistration();

    expect(await screen.findByText('errors.emailRegistered')).toBeTruthy();
    expect(screen.queryByText('registration.created')).toBeNull();
    expect(
      screen.getByRole('tab', { name: 'tabs.register', selected: true })
    ).toBeTruthy();
    expect(
      (
        within(screen.getByRole('tabpanel')).getByLabelText(
          /^fields\.password/
        ) as HTMLInputElement
      ).value
    ).toBe('');
    expect(setSession).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'actions.signInExisting' })
    );

    expect(
      screen.getByRole('tab', { name: 'tabs.login', selected: true })
    ).toBeTruthy();
    expect(
      (
        within(screen.getByRole('tabpanel')).getByLabelText(
          'fields.email'
        ) as HTMLInputElement
      ).value
    ).toBe('user@example.com');
    expect(
      (
        within(screen.getByRole('tabpanel')).getByLabelText(
          /^fields\.password/
        ) as HTMLInputElement
      ).value
    ).toBe('');
    expect(screen.queryByText('errors.emailRegistered')).toBeNull();
    expect(screen.queryByText('registration.created')).toBeNull();
  });

  it('clears the existing-account guidance when the registration email changes', async () => {
    vi.spyOn(authApi, 'register').mockRejectedValue(
      new ApiError('Server fallback', 409, 'API-4009')
    );
    renderRegistration();
    await screen.findByText('errors.emailRegistered');

    fireEvent.change(
      within(screen.getByRole('tabpanel')).getByLabelText('fields.email'),
      { target: { value: 'another@example.com' } }
    );

    expect(screen.queryByText('errors.emailRegistered')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'actions.signInExisting' })
    ).toBeNull();
  });

  it.each([
    [
      new ApiError('Server fallback', 429, 'API-4290'),
      'errors.tooManyRegistrationAttempts',
    ],
    [
      new ApiError('Could not create user.', 500, 'API-5001'),
      'Could not create user.',
    ],
  ])(
    'keeps registration failures separate from account creation',
    async (error, message) => {
      vi.spyOn(authApi, 'register').mockRejectedValue(error);
      renderRegistration();

      expect(await screen.findByText(message)).toBeTruthy();
      expect(
        screen.getByRole('tab', { name: 'tabs.register', selected: true })
      ).toBeTruthy();
      expect(screen.queryByText('registration.created')).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'actions.signInExisting' })
      ).toBeNull();
      expect(setSession).not.toHaveBeenCalled();
    }
  );

  it.each([
    [
      new ApiError('Invalid email or password.', 401, 'API-2001'),
      'errors.invalidCredentials',
    ],
    [
      new ApiError('Too many login attempts.', 429, 'API-4290'),
      'errors.tooManyLoginAttempts',
    ],
  ])(
    'localizes login rejection without creating a session',
    async (error, message) => {
      vi.spyOn(authApi, 'login').mockRejectedValue(error);
      render(
        <MemoryRouter>
          <AuthPage />
        </MemoryRouter>
      );
      fireEvent.change(
        within(screen.getByRole('tabpanel')).getByLabelText('fields.email'),
        { target: { value: 'user@example.com' } }
      );
      fireEvent.change(
        within(screen.getByRole('tabpanel')).getByLabelText(
          /^fields\.password/
        ),
        { target: { value: 'password' } }
      );
      fireEvent.click(screen.getByRole('button', { name: 'actions.login' }));

      expect(await screen.findByText(message)).toBeTruthy();
      expect(setSession).not.toHaveBeenCalled();
    }
  );
});
