import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  PdxButton,
  PdxAvatar,
  PdxHeading,
  PdxIcon,
  PdxInput,
  PdxMessage,
  PdxModal,
  PdxParagraph,
  PdxTextarea,
} from '@prodivix/ui';
import {
  Calendar,
  Check,
  Copy,
  Mail,
  Pencil,
  Upload,
  UserRound,
} from 'lucide-react';
import { authApi, ApiError, resolveUserAvatarUrl } from './authApi';
import { useAuthStore } from './useAuthStore';

type CopiedTarget = 'id' | 'email';

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
  const [isAvatarUploading, setAvatarUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedTarget, setCopiedTarget] = useState<CopiedTarget | null>(null);
  const [avatarJustSaved, setAvatarJustSaved] = useState(false);
  const [profileJustSaved, setProfileJustSaved] = useState(false);
  const copiedTimer = useRef<number | null>(null);
  const avatarSavedTimer = useRef<number | null>(null);
  const profileSavedTimer = useRef<number | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState({ name: '', description: '' });

  const uuidMatrix = useMemo(() => buildUuidMatrix(user?.id), [user?.id]);
  const displayName = user?.name?.trim() || user?.email || t('empty.title');
  const displayBio = user?.description?.trim() || t('description.empty');
  const avatarSrc = resolveUserAvatarUrl(user?.avatarUrl);
  const initials =
    user?.name
      ?.split(' ')
      .map((item) => item.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase() ||
    user?.email?.charAt(0).toUpperCase() ||
    undefined;

  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') return;
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
      if (avatarSavedTimer.current)
        window.clearTimeout(avatarSavedTimer.current);
      if (profileSavedTimer.current) {
        window.clearTimeout(profileSavedTimer.current);
      }
    };
  }, []);

  const copyText = useCallback(
    async (value: string | undefined, target: CopiedTarget) => {
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        setCopiedTarget(target);
        if (typeof window !== 'undefined') {
          if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
          copiedTimer.current = window.setTimeout(() => {
            setCopiedTarget(null);
            copiedTimer.current = null;
          }, 1100);
        }
      } catch {
        setError(t('messages.copyFailed'));
      }
    },
    [t]
  );

  const openEdit = () => {
    setError(null);
    setDraft({
      name: user?.name ?? '',
      description: user?.description ?? '',
    });
    setEditOpen(true);
  };

  const uploadAvatar = async (file: File | undefined) => {
    if (!file || !isAuthenticated || !token) return;
    setError(null);
    setAvatarUploading(true);
    try {
      const response = await authApi.uploadAvatar(token, file);
      setUser(response.user);
      setAvatarJustSaved(true);
      if (typeof window !== 'undefined') {
        if (avatarSavedTimer.current) {
          window.clearTimeout(avatarSavedTimer.current);
        }
        avatarSavedTimer.current = window.setTimeout(() => {
          setAvatarJustSaved(false);
          avatarSavedTimer.current = null;
        }, 1100);
      }
    } catch (err) {
      setError(formatError(err));
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
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
      setProfileJustSaved(true);
      if (typeof window !== 'undefined') {
        if (profileSavedTimer.current) {
          window.clearTimeout(profileSavedTimer.current);
        }
        profileSavedTimer.current = window.setTimeout(() => {
          setProfileJustSaved(false);
          setEditOpen(false);
          profileSavedTimer.current = null;
        }, 650);
      } else {
        setEditOpen(false);
      }
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
            size="Small"
            category="Secondary"
            onlyIcon
            icon={<Pencil size={16} />}
            disabled={isLoading}
            onClick={openEdit}
          />
          <input
            ref={avatarInputRef}
            type="file"
            className="sr-only"
            accept="image/png,image/jpeg,image/webp,image/avif"
            onChange={(event) => uploadAvatar(event.currentTarget.files?.[0])}
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
          <div className="flex items-start md:pt-2">
            <div className="group/avatar relative h-24 w-24 rounded-full">
              <PdxAvatar
                size="ExtraLarge"
                src={avatarSrc}
                initials={initials}
                alt={displayName}
                className="shadow-(--shadow-sm)"
              />
              <button
                type="button"
                className="absolute inset-0 inline-flex cursor-pointer items-center justify-center rounded-full border-0 bg-black/45 p-0 text-white opacity-0 backdrop-blur-[1px] transition-[opacity,transform] duration-150 group-hover/avatar:opacity-100 hover:scale-[1.02] hover:opacity-100 focus-visible:scale-[1.02] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--text-primary)"
                disabled={isAvatarUploading}
                onClick={() => avatarInputRef.current?.click()}
                aria-label={t('actions.uploadAvatar')}
                title={t('actions.uploadAvatar')}
              >
                {avatarJustSaved ? <Check size={22} /> : <Upload size={22} />}
              </button>
            </div>
          </div>
          <div className="grid min-w-0 gap-2.5">
            <PdxHeading
              level={1}
              className="m-0 [font-family:var(--font-family-mono)] text-[56px] md:text-[96px] lg:text-[108px]"
            >
              {displayName}
            </PdxHeading>
            <PdxParagraph className="m-0 max-w-[58ch] text-[13px] leading-[1.5] text-(--text-secondary)">
              {displayBio}
            </PdxParagraph>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                className="group relative inline-flex w-fit max-w-full -translate-x-2.5 cursor-pointer items-center gap-3 justify-self-start rounded-2xl border-0 bg-(--bg-canvas) px-3 py-2.5 transition-colors duration-150 hover:bg-(--bg-panel)"
                onClick={() => copyText(user?.id, 'id')}
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
                  <span className="[font-family:var(--font-family-mono)] text-xs tracking-[0.12em] break-all text-(--text-primary)">
                    {user?.id}
                  </span>
                )}
                <span
                  className={`inline-flex transition-[opacity,transform] duration-150 ${
                    copiedTarget === 'id'
                      ? 'scale-105 text-(--success-color) opacity-100'
                      : 'opacity-60 group-hover:opacity-100'
                  }`}
                >
                  <PdxIcon
                    icon={copiedTarget === 'id' ? <Check /> : <Copy />}
                    size={14}
                  />
                </span>
              </button>
              <div className="inline-flex cursor-default items-center gap-2 rounded-full border-0 bg-(--bg-panel) px-3 py-2 text-xs text-(--text-primary)">
                <PdxIcon icon={<Calendar />} size={16} />
                <span>{formatDate(user?.createdAt)}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-0.5 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            className="group relative inline-flex cursor-pointer items-center gap-2 rounded-full border-0 bg-(--bg-panel) px-3 py-2 text-xs text-(--text-primary) transition-colors duration-150 hover:bg-(--bg-raised)"
            onClick={() => copyText(user?.email, 'email')}
          >
            <PdxIcon icon={<Mail />} size={16} />
            <span>{user?.email}</span>
            <span
              className={`ml-0.5 inline-flex transition-[opacity,transform] duration-150 ${
                copiedTarget === 'email'
                  ? 'scale-105 text-(--success-color) opacity-100'
                  : 'opacity-60 group-hover:opacity-100'
              }`}
            >
              <PdxIcon
                icon={copiedTarget === 'email' ? <Check /> : <Copy />}
                size={14}
              />
            </span>
          </button>
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
              text={profileJustSaved ? t('messages.saved') : t('actions.save')}
              size="Small"
              category="Primary"
              icon={profileJustSaved ? <Check size={16} /> : undefined}
              iconPosition="Left"
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
