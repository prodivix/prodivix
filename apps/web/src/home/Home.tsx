import { useTranslation } from 'react-i18next';
import { Github, Languages, Moon, Sun } from 'lucide-react';
import { PdxAvatar, PdxButtonLink, PdxLink, PdxNav } from '@prodivix/ui';
import { IconProdivix } from '@/components/icons/IconProdivix';
import { useSettingsStore } from '@/editor/store/useSettingsStore';
import { useAuthStore } from '@/auth/useAuthStore';

const docsSiteUrl = 'https://prodivix-tutorials.github.io/prodivix/';

function Home() {
  const { t, i18n } = useTranslation('home');

  // Theme is now managed by Policy/GlobalStore
  const themeMode = useSettingsStore((state) => state.global.theme);
  const setGlobalValue = useSettingsStore((state) => state.setGlobalValue);

  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  const toggleLanguage = () => {
    const nextLanguage = i18n.language?.startsWith('zh') ? 'en' : 'zh-CN';
    i18n.changeLanguage(nextLanguage);
    setGlobalValue('language', nextLanguage);
  };
  const toggleTheme = () => {
    const nextTheme = themeMode === 'dark' ? 'light' : 'dark';
    setGlobalValue('theme', nextTheme); // ThemeSync will handle DOM update
  };
  const heroTextStyle = {
    fontSize: 'var(--font-size-hero)',
    fontWeight: 'var(--font-weight-medium)',
  };
  const heroHighlightStyle = {
    fontWeight: 'var(--font-weight-extrabold)',
  };
  const secondaryHeadingClassName =
    'mt-[15px] text-(length:--font-size-2xl) font-normal text-(--home-subtitle)';
  const navIconClassName =
    'inline-flex h-[36px] w-[36px] cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-(--home-nav-icon) no-underline transition-colors duration-200 ease-[ease] hover:bg-(--home-nav-icon-hover-bg) hover:text-(--home-nav-icon-hover-text)';
  const profileLinkClassName =
    'inline-flex h-[36px] w-[36px] items-center justify-center rounded-full bg-(--home-profile-bg) no-underline transition-[box-shadow,transform] duration-200 ease-[ease] hover:-translate-y-px hover:shadow-(--home-profile-hover-shadow)';

  const initials =
    user?.name
      ?.split(' ')
      .map((item) => item.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase() ||
    user?.email?.charAt(0).toUpperCase() ||
    undefined;

  return (
    <div className="mx-auto flex min-h-screen w-[calc(100vw-80px)] flex-col items-center justify-start">
      <PdxNav>
        <PdxNav.Left>
          <IconProdivix size={30} className="text-(--home-logo)" />
          <PdxNav.Heading heading={t('brand.name')} />
        </PdxNav.Left>
        <PdxNav.Right>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-8 pr-4">
              <PdxLink to="/community">{t('nav.community')}</PdxLink>
              <PdxLink to={`${docsSiteUrl}guide/getting-started`}>
                {t('nav.tutorials')}
              </PdxLink>
              <PdxLink to={`${docsSiteUrl}guide/introduction`}>
                {t('nav.docs')}
              </PdxLink>
            </div>
            <a
              className={navIconClassName}
              href="https://github.com/Prodivix/prodivix"
              target="_blank"
              rel="noreferrer"
              aria-label={t('nav.github')}
              title={t('nav.github')}
            >
              <Github size={18} />
            </a>
            <button
              type="button"
              className={navIconClassName}
              onClick={toggleLanguage}
              aria-label={t('nav.languageSwitch')}
              title={t('nav.languageSwitch')}
            >
              <Languages size={18} />
            </button>
            <button
              type="button"
              className={navIconClassName}
              onClick={toggleTheme}
              aria-label={
                themeMode === 'dark' ? '切换到浅色主题' : '切换到深色主题'
              }
              title={themeMode === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
            >
              {themeMode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {isAuthenticated && user ? (
              <PdxLink to="/profile" className={profileLinkClassName}>
                <PdxAvatar size="Small" initials={initials} />
              </PdxLink>
            ) : (
              <PdxButtonLink
                text={t('nav.signIn')}
                size="Small"
                category="Ghost"
                to="/auth"
              />
            )}
          </div>
        </PdxNav.Right>
      </PdxNav>
      <div className="w-[85vw] flex-1">
        <div className="mt-25 flex flex-col text-(--home-hero-text)">
          <h1 style={heroTextStyle}>
            <span
              className="text-(--home-hero-highlight) underline decoration-wavy decoration-4 underline-offset-[7px]"
              style={heroHighlightStyle}
            >
              {t('hero.line1.highlight')}
            </span>
          </h1>
          <h1 style={heroTextStyle}>
            {t('hero.line2.before')}{' '}
            <span
              className="text-(--home-hero-highlight) underline decoration-wavy decoration-4 underline-offset-[7px]"
              style={heroHighlightStyle}
            >
              {t('hero.line2.highlight')}
            </span>
          </h1>
          <h1 style={heroTextStyle}>
            {t('hero.line3.before')}{' '}
            <span
              className="text-(--home-hero-highlight) underline decoration-wavy decoration-4 underline-offset-[7px]"
              style={heroHighlightStyle}
            >
              {t('hero.line3.highlight')}
            </span>
          </h1>
        </div>
        <h2 className={secondaryHeadingClassName}>{t('hero.subtitle')}</h2>
        <div className="mt-20 flex flex-row gap-6">
          <PdxButtonLink
            text={t('actions.enterEditor')}
            size="Big"
            category="Primary"
            to="/editor"
          />
          <PdxButtonLink
            text={t('actions.viewDocs')}
            size="Big"
            category="Secondary"
            to={docsSiteUrl}
          />
        </div>
      </div>

      <footer className="mt-auto w-full px-2 pt-14 pb-5">
        <div className="flex items-center justify-center px-6 py-4 text-(length:--font-size-sm) text-(--home-footer-text) sm:px-7">
          <div className="flex items-center gap-2">
            <IconProdivix size={16} className="text-(--home-footer-text)" />
            <span>{t('footer.copy')}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Home;
