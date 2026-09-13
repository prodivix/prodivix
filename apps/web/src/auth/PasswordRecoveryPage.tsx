import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  PdxButton,
  PdxInput,
  PdxMessage,
  PdxPanel,
  PdxParagraph,
} from '@prodivix/ui';
import { ApiError, authApi } from '@/auth/authApi';
import { useAuthStore } from '@/auth/useAuthStore';

export const PasswordRecoveryPage = () => {
  const { t } = useTranslation('auth');
  const location = useLocation();
  const navigate = useNavigate();
  const clearSession = useAuthStore((state) => state.clearSession);
  const resetting = location.pathname === '/auth/reset-password';
  const [token] = useState(
    () => new URLSearchParams(location.hash.slice(1)).get('token') ?? ''
  );
  const [email, setEmail] = useState(() => {
    const state: unknown = location.state;
    return state &&
      typeof state === 'object' &&
      'email' in state &&
      typeof state.email === 'string'
      ? state.email
      : '';
  });
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validToken = /^[0-9a-f]{64}$/.test(token);

  useEffect(() => {
    if (location.hash) {
      void navigate(
        { pathname: location.pathname, search: '', hash: '' },
        { replace: true, state: location.state }
      );
    }
  }, [location.hash, location.pathname, location.state, navigate]);

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (resetting && password.length < 8) {
      setError(t('recovery.passwordBounds'));
      return;
    }
    if (resetting && new TextEncoder().encode(password).length > 72) {
      setError(t('recovery.passwordTooLong'));
      return;
    }
    if (resetting && password !== confirmation) {
      setError(t('recovery.passwordMismatch'));
      return;
    }
    setBusy(true);
    try {
      if (resetting) {
        await authApi.resetPassword(token, password);
        clearSession();
        setPassword('');
        setConfirmation('');
      } else {
        await authApi.forgotPassword(email.trim());
      }
      setComplete(true);
    } catch (caught) {
      setError(
        t(
          caught instanceof ApiError && caught.code === 'API-2004'
            ? 'recovery.invalidLink'
            : caught instanceof ApiError && caught.code === 'API-4290'
              ? 'recovery.tooManyAttempts'
              : 'recovery.unavailable'
        )
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-(--bg-canvas) px-6 py-10 text-(--text-primary)">
      <PdxPanel
        title={t(resetting ? 'recovery.resetTitle' : 'recovery.forgotTitle')}
        padding="Large"
        className="grid w-full max-w-md gap-4"
      >
        <PdxParagraph color="Muted">
          {t(
            resetting
              ? 'recovery.resetDescription'
              : 'recovery.forgotDescription'
          )}
        </PdxParagraph>
        {error && <PdxMessage type="Danger" text={error} />}
        {complete ? (
          <PdxMessage
            type="Success"
            text={t(
              resetting ? 'recovery.resetComplete' : 'recovery.requestAccepted'
            )}
          />
        ) : resetting && !validToken ? (
          <PdxMessage type="Danger" text={t('recovery.invalidLink')} />
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {resetting ? (
              <>
                <label className="grid gap-2 text-sm">
                  <span>{t('recovery.newPassword')}</span>
                  <PdxInput
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onValueChange={setPassword}
                    disabled={busy}
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span>{t('recovery.confirmPassword')}</span>
                  <PdxInput
                    type="password"
                    autoComplete="new-password"
                    value={confirmation}
                    onValueChange={setConfirmation}
                    disabled={busy}
                  />
                </label>
                <PdxParagraph color="Muted">
                  {t('recovery.passwordBounds')}
                </PdxParagraph>
              </>
            ) : (
              <label className="grid gap-2 text-sm">
                <span>{t('fields.email')}</span>
                <PdxInput
                  type="email"
                  autoComplete="email"
                  value={email}
                  onValueChange={setEmail}
                  disabled={busy}
                />
              </label>
            )}
            <PdxButton
              type="submit"
              variant="Primary"
              text={t(
                resetting ? 'recovery.savePassword' : 'recovery.sendLink'
              )}
              disabled={
                busy || (resetting ? !password || !confirmation : !email.trim())
              }
            />
          </form>
        )}
        {resetting && !complete && (
          <PdxButton
            text={t('recovery.requestNewLink')}
            variant="Ghost"
            onClick={() => navigate('/auth/forgot-password')}
          />
        )}
        <PdxButton
          text={t('recovery.backToLogin')}
          variant="Ghost"
          onClick={() => navigate('/auth')}
        />
      </PdxPanel>
    </main>
  );
};
