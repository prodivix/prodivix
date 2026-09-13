import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PasswordRecoveryPage } from '@/auth/PasswordRecoveryPage';
import { ApiError, authApi } from '@/auth/authApi';

const { clearSession } = vi.hoisted(() => ({ clearSession: vi.fn() }));
vi.mock('@/auth/useAuthStore', () => ({
  useAuthStore: (
    select: (state: { clearSession: typeof clearSession }) => unknown
  ) => select({ clearSession }),
}));

const Location = () => {
  const location = useLocation();
  return (
    <output aria-label="Current address">
      {location.pathname + location.hash}
    </output>
  );
};
const token = 'a'.repeat(64);
const renderRecovery = (resetting = false, hash = `#token=${token}`) =>
  render(
    <MemoryRouter
      initialEntries={[
        resetting ? `/auth/reset-password${hash}` : '/auth/forgot-password',
      ]}
    >
      <Location />
      <Routes>
        <Route
          path="/auth/forgot-password"
          element={<PasswordRecoveryPage key="forgot" />}
        />
        <Route
          path="/auth/reset-password"
          element={<PasswordRecoveryPage key="reset" />}
        />
        <Route path="/auth" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>
  );

afterEach(() => {
  vi.restoreAllMocks();
  clearSession.mockClear();
});

describe('PasswordRecoveryPage', () => {
  it('accepts a reset request without revealing whether the email exists', async () => {
    const request = vi
      .spyOn(authApi, 'forgotPassword')
      .mockResolvedValue({ accepted: true });
    renderRecovery();
    fireEvent.change(screen.getByLabelText('fields.email'), {
      target: { value: ' user@example.test ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'recovery.sendLink' }));
    expect(await screen.findByText('recovery.requestAccepted')).toBeTruthy();
    expect(request).toHaveBeenCalledWith('user@example.test');
    expect(clearSession).not.toHaveBeenCalled();
  });

  it('removes the link token from the address and resets without logging in', async () => {
    const reset = vi
      .spyOn(authApi, 'resetPassword')
      .mockResolvedValue(undefined);
    renderRecovery(true);
    await waitFor(() =>
      expect(screen.getByLabelText('Current address').textContent).toBe(
        '/auth/reset-password'
      )
    );
    fireEvent.change(screen.getByLabelText('recovery.newPassword'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(screen.getByLabelText('recovery.confirmPassword'), {
      target: { value: 'new-password' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'recovery.savePassword' })
    );
    expect(await screen.findByText('recovery.resetComplete')).toBeTruthy();
    expect(reset).toHaveBeenCalledWith(token, 'new-password');
    expect(clearSession).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText('recovery.newPassword')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'recovery.backToLogin' })
    );
    expect(await screen.findByText('Login page')).toBeTruthy();
  });

  it('rejects mismatched passwords before sending a reset', async () => {
    const reset = vi.spyOn(authApi, 'resetPassword');
    renderRecovery(true);
    fireEvent.change(screen.getByLabelText('recovery.newPassword'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(screen.getByLabelText('recovery.confirmPassword'), {
      target: { value: 'different-password' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'recovery.savePassword' })
    );
    expect(await screen.findByText('recovery.passwordMismatch')).toBeTruthy();
    expect(reset).not.toHaveBeenCalled();
  });

  it('provides a new request for an expired or already-used reset link', async () => {
    vi.spyOn(authApi, 'resetPassword').mockRejectedValue(
      new ApiError('Expired', 400, 'API-2004')
    );
    renderRecovery(true);
    fireEvent.change(screen.getByLabelText('recovery.newPassword'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(screen.getByLabelText('recovery.confirmPassword'), {
      target: { value: 'new-password' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'recovery.savePassword' })
    );
    expect(await screen.findByText('recovery.invalidLink')).toBeTruthy();
    expect(clearSession).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'recovery.requestNewLink' })
    );
    expect(
      await screen.findByRole('button', { name: 'recovery.sendLink' })
    ).toBeTruthy();
  });

  it.each(['', '#token=invalid'])(
    'rejects an absent or malformed link locally',
    async (hash) => {
      const reset = vi.spyOn(authApi, 'resetPassword');
      renderRecovery(true, hash);
      expect(screen.getByText('recovery.invalidLink')).toBeTruthy();
      expect(
        screen.queryByRole('button', { name: 'recovery.savePassword' })
      ).toBeNull();
      expect(reset).not.toHaveBeenCalled();
    }
  );

  it.each([
    [new ApiError('Limited', 429, 'API-4290'), 'recovery.tooManyAttempts'],
    [new ApiError('Unavailable', 503, 'API-6001'), 'recovery.unavailable'],
  ])(
    'shows actionable mail failure without reporting successful delivery',
    async (error, message) => {
      vi.spyOn(authApi, 'forgotPassword').mockRejectedValue(error);
      renderRecovery();
      fireEvent.change(screen.getByLabelText('fields.email'), {
        target: { value: 'user@example.test' },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'recovery.sendLink' })
      );
      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.queryByText('recovery.requestAccepted')).toBeNull();
    }
  );
});
