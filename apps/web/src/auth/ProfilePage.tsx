import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  PdxButton,
  PdxHeading,
  PdxIcon,
  PdxInput,
  PdxMessage,
  PdxModal,
  PdxParagraph,
  PdxTextarea,
} from '@prodivix/ui';
import { Calendar, Copy, Mail, Pencil, UserRound } from 'lucide-react';
import { authApi, ApiError } from './authApi';
import { useAuthStore } from './useAuthStore';

type Flash = { type: 'Info' | 'Success' | 'Warning' | 'Danger'; text: string };

const formatError = (error: unknown) => {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
};

const formatDate = (value?: string | null) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const hexToBits = (value: string) => {
  const parsed = Number.parseInt(value, 16);
  if (Number.isNaN(parsed)) return [0, 0, 0, 0];
  return [8, 4, 2, 1].map((bit) => (parsed & bit ? 1 : 0));
};

const buildUuidMatrix = (value?: string | null) => {
  if (!value) return [];
  const clean = value.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  return clean.split('').map((char) => hexToBits(char));
};

export const ProfilePage = () => {
  const { t } = useTranslation('profile');
  const navigate = useNavigate();
  const { token, user, setUser, clearSession } = useAuthStore();
  const hasAuthHydrated = useAuthStore((state) => state.hasHydrated);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());

  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const flashTimer = useRef<number | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState({ name: '', description: '' });

  const uuidMatrix = useMemo(() => buildUuidMatrix(user?.id), [user?.id]);
  const displayName = user?.name?.trim() || user?.email || t('empty.title');
  const displayBio = user?.description?.trim() || t('description.empty');

  const showFlash = useCallback((next: Flash) => {
    setFlash(next);
    if (typeof window === 'undefined') return;
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => {
      setFlash(null);
      flashTimer.current = null;
    }, 1800);
  }, []);

  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') return;
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    };
  }, []);

  const copyText = useCallback(
    async (value: string | undefined, message: string) => {
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        showFlash({ type: 'Success', text: message });
      } catch {
        showFlash({ type: 'Warning', text: t('messages.copyFailed') });
      }
    },
    [showFlash, t]
  );

  const openEdit = () => {
    setError(null);
    setDraft({
      name: user?.name ?? '',
      description: user?.description ?? '',
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!isAuthenticated || !token) return;
    setError(null);
    setLoading(true);
    try {
      const response = await authApi.updateProfile(token, {
        name: draft.name.trim(),
        description: draft.description.trim(),
      });
      setUser(response.user);
      setEditOpen(false);
      showFlash({ type: 'Success', text: t('messages.saved') });
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  };

  if (!hasAuthHydrated || !isAuthenticated || !token) {
    return (
      <div className="min-h-screen bg-(--bg-canvas) text-(--text-primary)">
        <header className="flex items-center justify-between gap-4 bg-(--bg-canvas) px-5 py-4 md:px-7 md:py-[18px]">
          <PdxButton
            text={t('actions.backHome')}
            size="Small"
            category="Ghost"
            onClick={() => navigate('/')}
          />
          <PdxButton
            text={t('actions.login')}
            size="Small"
            category="Primary"
            onClick={() => navigate('/auth')}
          />
        </header>
        <main className="mx-auto grid max-w-[980px] gap-[18px] px-5 pb-10 md:px-7 md:pb-12">
          <div className="grid min-h-[calc(100vh-140px)] place-content-center gap-2.5 text-center text-(--text-secondary)">
            <PdxIcon icon={<UserRound />} size={34} />
            <PdxHeading level={2} className="m-0 text-[88px]">
              {t('empty.title')}
            </PdxHeading>
            <PdxParagraph color="Muted">{t('empty.subtitle')}</PdxParagraph>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-(--bg-canvas) text-(--text-primary)">
      <header className="flex items-center justify-between gap-4 bg-(--bg-canvas) px-5 py-4 md:px-7 md:py-[18px]">
        <PdxButton
          text={t('actions.backHome')}
          size="Small"
          category="Ghost"
          onClick={() => navigate('/')}
        />
        <div className="flex flex-wrap gap-2.5">
          <PdxButton
            text={t('actions.edit')}
            size="Small"
            category="Secondary"
            iconPosition="Left"
            icon={<Pencil size={16} />}
            disabled={isLoading}
            onClick={openEdit}
          />
          <PdxButton
            text={t('actions.logout')}
            size="Small"
            category="Primary"
            disabled={isLoading}
            onClick={async () => {
              if (token) {
                try {
                  await authApi.logout(token);
                } catch (err) {
                  setError(formatError(err));
                }
              }
              clearSession();
              navigate('/auth');
            }}
          />
        </div>
      </header>

      <main className="mx-auto grid max-w-[980px] gap-[18px] px-5 pb-10 md:px-7 md:pb-12">
        {flash && (
          <div className="max-w-[620px]">
            <PdxMessage type={flash.type} text={flash.text} />
          </div>
        )}
        {error && (
          <div className="max-w-[620px]">
            <PdxMessage
              type="Danger"
              text={error}
              closable
              onClose={() => setError(null)}
            />
          </div>
        )}

        <section className="mt-2 grid items-start gap-[18px] md:grid-cols-[auto_1fr]">
          <div className="grid min-w-0 gap-2.5">
            <PdxHeading
              level={1}
              className="m-0 [font-family:'JetBrains_Mono','SFMono-Regular','Menlo',monospace] text-[56px] md:text-[96px] lg:text-[108px]"
            >
              {displayName}
            </PdxHeading>
            <PdxParagraph className="m-0 max-w-[58ch] text-[13px] leading-[1.5] text-(--text-secondary)">
              {displayBio}
            </PdxParagraph>
            <button
              type="button"
              className="inline-flex max-w-full -translate-x-2.5 cursor-pointer items-center gap-3 rounded-2xl border-0 bg-(--bg-canvas) px-3 py-2.5 transition-colors duration-150 hover:bg-(--bg-panel)"
              onClick={() => copyText(user?.id, t('messages.copiedId'))}
              aria-label={t('actions.copyId')}
              title={t('actions.copyId')}
            >
              {uuidMatrix.length > 0 ? (
                <div
                  className="flex flex-wrap items-start gap-1"
                  aria-hidden="true"
                >
                  {uuidMatrix.map((bits, columnIndex) => (
                    <div
                      key={`${columnIndex}-${bits.join('')}`}
                      className="grid gap-px"
                    >
                      {bits.map((bit, bitIndex) => (
                        <span
                          key={`${columnIndex}-${bitIndex}`}
                          className={`h-0.5 w-0.5 rounded-full ${bit ? 'bg-(--text-primary)' : 'invisible'}`}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <span className="[font-family:'JetBrains_Mono','SFMono-Regular','Menlo',monospace] text-xs tracking-[0.12em] break-all text-(--text-primary)">
                  {user?.id}
                </span>
              )}
              <span className="inline-flex opacity-60 transition-opacity hover:opacity-100">
                <PdxIcon icon={<Copy />} size={14} />
              </span>
            </button>
          </div>
        </section>

        <section className="mt-0.5 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border-0 bg-(--bg-panel) px-3 py-2 text-xs text-(--text-primary) transition-colors duration-150 hover:bg-(--bg-raised)"
            onClick={() => copyText(user?.email, t('messages.copiedEmail'))}
          >
            <PdxIcon icon={<Mail />} size={16} />
            <span>{user?.email}</span>
            <span className="ml-0.5 inline-flex opacity-60 transition-opacity hover:opacity-100">
              <PdxIcon icon={<Copy />} size={14} />
            </span>
          </button>
          <div className="inline-flex cursor-default items-center gap-2 rounded-full border-0 bg-(--bg-panel) px-3 py-2 text-xs text-(--text-primary)">
            <PdxIcon icon={<Calendar />} size={16} />
            <span>{formatDate(user?.createdAt)}</span>
          </div>
        </section>
      </main>

      <PdxModal
        open={editOpen}
        title={t('edit.title')}
        onClose={() => setEditOpen(false)}
        closeOnOverlayClick={!isLoading}
        footer={
          <div className="flex justify-end gap-2.5">
            <PdxButton
              text={t('actions.cancel')}
              size="Small"
              category="Secondary"
              disabled={isLoading}
              onClick={() => setEditOpen(false)}
            />
            <PdxButton
              text={t('actions.save')}
              size="Small"
              category="Primary"
              disabled={isLoading || !draft.name.trim()}
              onClick={saveEdit}
            />
          </div>
        }
      >
        {error && (
          <PdxMessage
            type="Danger"
            text={error}
            closable
            onClose={() => setError(null)}
          />
        )}
        <div className="grid gap-3.5">
          <label className="grid gap-1.5 text-xs text-(--text-secondary)">
            <span>{t('labels.name')}</span>
            <PdxInput
              size="Small"
              value={draft.name}
              onChange={(value) => setDraft((p) => ({ ...p, name: value }))}
            />
          </label>
          <label className="grid gap-1.5 text-xs text-(--text-secondary)">
            <span>{t('labels.description')}</span>
            <PdxTextarea
              size="Small"
              rows={3}
              value={draft.description}
              onChange={(value) =>
                setDraft((p) => ({ ...p, description: value }))
              }
            />
          </label>
        </div>
      </PdxModal>
    </div>
  );
};
