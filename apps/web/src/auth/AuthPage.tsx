import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  PdxButton,
  PdxHeading,
  PdxInput,
  PdxMessage,
  PdxPanel,
  PdxParagraph,
  PdxTabs,
} from '@prodivix/ui';
import { authApi, ApiError } from './authApi';
import { useAuthStore } from './useAuthStore';

type AuthMode = 'login' | 'register';

const formatError = (error: unknown) => {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
};

export const AuthPage = () => {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [mode, setMode] = useState<AuthMode>('login');
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({
    name: '',
    email: '',
    password: '',
    description: '',
  });

  const loginDisabled =
    isLoading || !loginForm.email.trim() || !loginForm.password.trim();
  const registerDisabled =
    isLoading ||
    !registerForm.name.trim() ||
    !registerForm.email.trim() ||
    registerForm.password.trim().length < 8;

  const submitLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const response = await authApi.login({
        email: loginForm.email.trim(),
        password: loginForm.password,
      });
      setSession(response.token, response.user, response.expiresAt);
      navigate('/profile');
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  };

  const submitRegister = async () => {
    setError(null);
    setLoading(true);
    try {
      const response = await authApi.register({
        name: registerForm.name.trim(),
        email: registerForm.email.trim(),
        password: registerForm.password,
        description: registerForm.description.trim(),
      });
      setSession(response.token, response.user, response.expiresAt);
      navigate('/profile');
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  };

  const tabs = useMemo(
    () => [
      {
        key: 'login',
        label: t('tabs.login'),
        content: (
          <form
            className="mt-2.5 grid gap-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              if (loginDisabled) return;
              void submitLogin();
            }}
          >
            <label className="grid gap-1.5 text-xs text-(--text-secondary)">
              <span>{t('fields.email')}</span>
              <PdxInput
                size="Small"
                type="Email"
                autoComplete="email"
                value={loginForm.email}
                placeholder={t('placeholders.email')}
                onChange={(value) =>
                  setLoginForm((prev) => ({
                    ...prev,
                    email: value,
                  }))
                }
              />
            </label>
            <label className="grid gap-1.5 text-xs text-(--text-secondary)">
              <span>{t('fields.password')}</span>
              <PdxInput
                size="Small"
                type="Password"
                autoComplete="current-password"
                value={loginForm.password}
                placeholder={t('placeholders.password')}
                onChange={(value) =>
                  setLoginForm((prev) => ({
                    ...prev,
                    password: value,
                  }))
                }
              />
            </label>
            <PdxButton
              text={t('actions.login')}
              size="Small"
              category="Primary"
              disabled={loginDisabled}
            />
          </form>
        ),
      },
      {
        key: 'register',
        label: t('tabs.register'),
        content: (
          <form
            className="mt-2.5 grid gap-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              if (registerDisabled) return;
              void submitRegister();
            }}
          >
            <label className="grid gap-1.5 text-xs text-(--text-secondary)">
              <span>{t('fields.name')}</span>
              <PdxInput
                size="Small"
                autoComplete="name"
                value={registerForm.name}
                placeholder={t('placeholders.name')}
                onChange={(value) =>
                  setRegisterForm((prev) => ({
                    ...prev,
                    name: value,
                  }))
                }
              />
            </label>
            <label className="grid gap-1.5 text-xs text-(--text-secondary)">
              <span>{t('fields.description')}</span>
              <PdxInput
                size="Small"
                value={registerForm.description}
                placeholder={t('placeholders.description')}
                onChange={(value) =>
                  setRegisterForm((prev) => ({
                    ...prev,
                    description: value,
                  }))
                }
              />
            </label>
            <label className="grid gap-1.5 text-xs text-(--text-secondary)">
              <span>{t('fields.email')}</span>
              <PdxInput
                size="Small"
                type="Email"
                autoComplete="email"
                value={registerForm.email}
                placeholder={t('placeholders.email')}
                onChange={(value) =>
                  setRegisterForm((prev) => ({
                    ...prev,
                    email: value,
                  }))
                }
              />
            </label>
            <label className="grid gap-1.5 text-xs text-(--text-secondary)">
              <span>{t('fields.password')}</span>
              <PdxInput
                size="Small"
                type="Password"
                autoComplete="new-password"
                value={registerForm.password}
                placeholder={t('placeholders.password')}
                onChange={(value) =>
                  setRegisterForm((prev) => ({
                    ...prev,
                    password: value,
                  }))
                }
              />
              <em className="text-[11px] text-(--text-muted) not-italic">
                {t('hints.password')}
              </em>
            </label>
            <PdxButton
              text={t('actions.register')}
              size="Small"
              category="Primary"
              disabled={registerDisabled}
            />
          </form>
        ),
      },
    ],
    [
      loginDisabled,
      registerDisabled,
      loginForm,
      registerForm,
      navigate,
      setSession,
      t,
    ]
  );

  return (
    <div className="grid min-h-screen items-center gap-8 bg-(--bg-canvas) px-6 py-6 text-(--text-primary) md:px-8 lg:grid-cols-[minmax(260px,1fr)_minmax(320px,460px)] lg:gap-12 lg:px-12 dark:bg-[radial-gradient(circle_at_top_left,rgba(110,140,255,0.15),transparent_60%),radial-gradient(circle_at_bottom_right,rgba(84,190,142,0.15),transparent_55%),var(--bg-canvas)]">
      <section className="grid max-w-[520px] gap-3.5">
        <PdxHeading level={2} className="m-0">
          {t('title')}
        </PdxHeading>
        <PdxParagraph color="Muted">{t('subtitle')}</PdxParagraph>
        <div className="grid gap-3">
          <div className="rounded-2xl border border-(--bg-raised) bg-(--bg-panel) px-4 py-3.5 shadow-(--shadow-md) dark:border-(--border-default) dark:shadow-[0_18px_38px_rgba(0,0,0,0.45)]">
            <span className="text-xs font-semibold text-(--text-primary) dark:text-(--text-primary)">
              {t('highlights.speedTitle')}
            </span>
            <p className="mt-1.5 text-[13px] text-(--text-muted) dark:text-(--text-secondary)">
              {t('highlights.speedBody')}
            </p>
          </div>
          <div className="rounded-2xl border border-(--bg-raised) bg-(--bg-panel) px-4 py-3.5 shadow-(--shadow-md) dark:border-(--border-default) dark:shadow-[0_18px_38px_rgba(0,0,0,0.45)]">
            <span className="text-xs font-semibold text-(--text-primary) dark:text-(--text-primary)">
              {t('highlights.workspaceTitle')}
            </span>
            <p className="mt-1.5 text-[13px] text-(--text-muted) dark:text-(--text-secondary)">
              {t('highlights.workspaceBody')}
            </p>
          </div>
        </div>
      </section>
      <section className="w-full max-w-[520px] lg:max-w-none">
        <PdxPanel
          title={t('panel.title')}
          padding="Large"
          className="grid gap-3.5 rounded-[18px] border border-black/8 bg-(--bg-canvas) shadow-[0_18px_36px_rgba(0,0,0,0.12)] dark:border-(--border-default) dark:bg-(--bg-panel) dark:shadow-[0_24px_44px_rgba(0,0,0,0.55)]"
        >
          {error && <PdxMessage type="Danger" text={error} />}
          <PdxTabs
            items={tabs}
            activeKey={mode}
            onChange={(key) => {
              setMode(key as AuthMode);
              setError(null);
            }}
          />
          <div className="mt-1 flex items-center justify-between gap-3 text-xs text-(--text-muted)">
            <span>{t('footer.hint')}</span>
            <PdxButton
              text={t('footer.backHome')}
              size="Small"
              category="Ghost"
              onClick={() => navigate('/')}
            />
          </div>
        </PdxPanel>
      </section>
    </div>
  );
};
