import { useTranslation } from 'react-i18next';
import { ArrowRight, Github, Languages, Moon, Sun } from 'lucide-react';
import { PdxAvatar, PdxButtonLink, PdxLink, PdxNav } from '@prodivix/ui';
import { useSettingsStore } from '@/editor/store/useSettingsStore';
import { useAuthStore } from '@/auth/useAuthStore';

const docsSiteUrl = 'https://mdr-tutorials.github.io/prodivix/';
const githubUrl = 'https://github.com/Mdr-Tutorials/prodivix';

const heroPoints = ['visual', 'code', 'deploy'] as const;
const explanationItems = ['state', 'authoring', 'output'] as const;
const workflowSteps = ['shape', 'connect', 'refine', 'ship'] as const;
const capabilityCards = ['interface', 'logic', 'output'] as const;
const developerNotes = ['inspectable', 'portable', 'extensible'] as const;
const audienceItems = ['builder', 'team', 'developer'] as const;
const footerGroups = [
  'product',
  'resources',
  'community',
  'developers',
] as const;
const footerLinks = {
  product: [
    { key: 'editor', to: '/editor' },
    { key: 'community', to: '/community' },
    { key: 'account', to: '/auth' },
  ],
  resources: [
    { key: 'docs', to: `${docsSiteUrl}guide/introduction` },
    { key: 'tutorials', to: `${docsSiteUrl}guide/getting-started` },
    { key: 'projectStructure', to: `${docsSiteUrl}guide/project-structure` },
  ],
  community: [
    { key: 'github', to: githubUrl },
    { key: 'contributing', to: `${docsSiteUrl}community/contributing` },
    { key: 'changelog', to: `${docsSiteUrl}community/changelog` },
  ],
  developers: [
    { key: 'pir', to: `${docsSiteUrl}reference/pir-spec` },
    {
      key: 'diagnostics',
      to: `${docsSiteUrl}reference/diagnostic-codes`,
    },
    { key: 'components', to: `${docsSiteUrl}api/components` },
  ],
} as const;

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
  const brandLockupClassName = 'inline-flex items-baseline gap-2.5';
  const footerBrandLinkClassName =
    'inline-flex items-center no-underline transition-opacity duration-200 hover:opacity-70';
  const brandIconClassName =
    'h-8 w-8 shrink-0 translate-y-[1.5px] bg-(--home-logo) [mask:url("/prodivix.svg")_center/contain_no-repeat]';
  const brandNameClassName =
    'font-mono text-[26px] leading-none font-black text-(--home-logo)';
  const heroWordmarkClassName =
    'pointer-events-none absolute top-[44%] left-1/2 h-[132px] w-[140vw] min-w-[760px] -translate-x-1/2 -translate-y-1/2 bg-(--home-logo) opacity-[0.055] [mask:url("/prodivix-wordmark.svg")_center/contain_no-repeat] sm:h-[176px] sm:w-[132vw] lg:h-[220px] lg:w-[1280px]';
  const footerWordmarkClassName =
    'h-[28px] w-[166px] bg-(--home-logo) [mask:url("/prodivix-wordmark.svg")_center/contain_no-repeat]';
  const navIconClassName =
    'inline-flex h-[36px] w-[36px] translate-y-[3.5px] cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-(--home-nav-icon) no-underline transition-colors duration-200 ease-[ease] hover:bg-(--home-nav-icon-hover-bg) hover:text-(--home-nav-icon-hover-text)';
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
    <div className="mx-auto flex min-h-screen w-full max-w-[1480px] flex-col items-center justify-start overflow-x-clip bg-(--bg-canvas) px-4 text-(--text-primary) sm:px-6 lg:px-10">
      <PdxNav align="Baseline">
        <PdxNav.Left>
          <div className={brandLockupClassName} title={t('brand.name')}>
            <span className={brandIconClassName} aria-hidden="true" />
            <span className={brandNameClassName}>{t('brand.name')}</span>
          </div>
        </PdxNav.Left>
        <PdxNav.Right>
          <div className="flex items-baseline gap-2">
            <div className="hidden items-baseline gap-8 pr-4 md:flex">
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
              href={githubUrl}
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
                themeMode === 'dark'
                  ? t('nav.themeSwitchLight')
                  : t('nav.themeSwitchDark')
              }
              title={
                themeMode === 'dark'
                  ? t('nav.themeSwitchLight')
                  : t('nav.themeSwitchDark')
              }
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

      <main className="flex w-full flex-1 flex-col items-center px-2">
        <section className="relative isolate flex min-h-[calc(100vh-128px)] w-full max-w-[1120px] flex-col items-center justify-center py-14 text-center md:py-18">
          <div
            className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden"
            aria-hidden="true"
          >
            <div className={heroWordmarkClassName} />
          </div>
          <div className="relative z-10 text-(length:--font-size-xs) font-medium tracking-[0.16em] text-(--text-muted) uppercase">
            {t('hero.eyebrow')}
          </div>
          <h1 className="relative z-10 mt-6 max-w-[780px] text-[44px] leading-[1.04] font-semibold text-(--home-hero-text) sm:text-[60px] lg:text-[76px]">
            {t('hero.title')}
          </h1>
          <p className="relative z-10 mt-6 max-w-[680px] text-(length:--font-size-xl) leading-[1.6] text-(--home-subtitle)">
            {t('hero.subtitle')}
          </p>
          <div className="relative z-10 mt-8 flex flex-col items-center gap-3 sm:flex-row">
            <PdxButtonLink
              text={t('actions.enterEditor')}
              size="Big"
              category="Primary"
              to="/editor"
              icon={<ArrowRight size={18} />}
            />
            <PdxButtonLink
              text={t('actions.viewDocs')}
              size="Big"
              category="Secondary"
              to={docsSiteUrl}
            />
          </div>
          <div className="relative z-10 mt-12 grid w-full max-w-[720px] gap-px overflow-hidden rounded-lg border border-(--border-subtle) bg-(--border-subtle) sm:grid-cols-3">
            {heroPoints.map((key) => (
              <div
                key={key}
                className="bg-(--bg-panel) px-4 py-3 text-(length:--font-size-sm) font-medium text-(--text-secondary)"
              >
                {t(`hero.points.${key}`)}
              </div>
            ))}
          </div>
        </section>

        <section className="grid w-full max-w-[1120px] gap-10 border-t border-(--border-subtle) py-20 md:grid-cols-[0.72fr_1fr] md:py-24">
          <div>
            <p className="text-(length:--font-size-xs) font-medium tracking-[0.16em] text-(--text-muted) uppercase">
              {t('why.eyebrow')}
            </p>
            <h2 className="mt-4 max-w-[520px] text-[32px] leading-[1.12] font-medium text-(--text-primary) sm:text-[42px]">
              {t('why.title')}
            </h2>
          </div>
          <div className="grid gap-5 text-(length:--font-size-lg) leading-[1.75] text-(--text-secondary)">
            <p>{t('why.body.p1')}</p>
            <p>{t('why.body.p2')}</p>
          </div>
        </section>

        <section className="w-full max-w-[1120px] border-t border-(--border-subtle) py-20 md:py-24">
          <div className="grid gap-10 md:grid-cols-[0.8fr_1fr]">
            <div>
              <p className="text-(length:--font-size-xs) font-medium tracking-[0.16em] text-(--text-muted) uppercase">
                {t('explanation.eyebrow')}
              </p>
              <h2 className="mt-4 max-w-[560px] text-[32px] leading-[1.12] font-medium text-(--text-primary) sm:text-[42px]">
                {t('explanation.title')}
              </h2>
            </div>
            <p className="text-(length:--font-size-lg) leading-[1.75] text-(--text-secondary)">
              {t('explanation.subtitle')}
            </p>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-(--border-subtle) bg-(--border-subtle) md:grid-cols-3">
            {explanationItems.map((key) => (
              <article key={key} className="bg-(--bg-panel) p-6">
                <p className="text-(length:--font-size-xs) font-medium tracking-[0.14em] text-(--text-muted) uppercase">
                  {t(`explanation.items.${key}.label`)}
                </p>
                <h3 className="mt-6 text-(length:--font-size-xl) font-medium text-(--text-primary)">
                  {t(`explanation.items.${key}.title`)}
                </h3>
                <p className="mt-3 text-(length:--font-size-sm) leading-[1.7] text-(--text-secondary)">
                  {t(`explanation.items.${key}.body`)}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="w-full max-w-[1120px] border-t border-(--border-subtle) py-20 md:py-24">
          <div className="max-w-[700px]">
            <p className="text-(length:--font-size-xs) font-medium tracking-[0.16em] text-(--text-muted) uppercase">
              {t('workflow.eyebrow')}
            </p>
            <h2 className="mt-4 text-[32px] leading-[1.12] font-medium text-(--text-primary) sm:text-[42px]">
              {t('workflow.title')}
            </h2>
            <p className="mt-5 text-(length:--font-size-lg) leading-[1.7] text-(--text-secondary)">
              {t('workflow.subtitle')}
            </p>
          </div>
          <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-(--border-subtle) bg-(--border-subtle) md:grid-cols-4">
            {workflowSteps.map((key, index) => (
              <article
                key={key}
                className="relative overflow-hidden bg-(--bg-panel) p-6"
              >
                <div
                  className="pointer-events-none absolute top-4 left-5 text-[92px] leading-none font-black text-(--home-logo) italic opacity-[0.075] sm:text-[108px]"
                  aria-hidden="true"
                >
                  {String(index + 1).padStart(2, '0')}
                </div>
                <h3 className="relative z-10 mt-14 text-(length:--font-size-xl) font-medium text-(--text-primary)">
                  {t(`workflow.steps.${key}.title`)}
                </h3>
                <p className="relative z-10 mt-3 text-(length:--font-size-sm) leading-[1.65] text-(--text-secondary)">
                  {t(`workflow.steps.${key}.body`)}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="w-full max-w-[1120px] border-t border-(--border-subtle) py-20 md:py-24">
          <div className="mx-auto max-w-[760px] text-center">
            <p className="text-(length:--font-size-xs) font-medium tracking-[0.16em] text-(--text-muted) uppercase">
              {t('capabilities.eyebrow')}
            </p>
            <h2 className="mt-4 text-[32px] leading-[1.12] font-medium text-(--text-primary) sm:text-[42px]">
              {t('capabilities.title')}
            </h2>
            <p className="mt-5 text-(length:--font-size-lg) leading-[1.7] text-(--text-secondary)">
              {t('capabilities.subtitle')}
            </p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {capabilityCards.map((key) => (
              <article
                key={key}
                className="rounded-lg border border-(--border-subtle) bg-(--bg-panel) p-6"
              >
                <h3 className="text-(length:--font-size-xl) font-medium text-(--text-primary)">
                  {t(`capabilities.cards.${key}.title`)}
                </h3>
                <p className="mt-4 text-(length:--font-size-sm) leading-[1.7] text-(--text-secondary)">
                  {t(`capabilities.cards.${key}.body`)}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="w-full max-w-[1120px] border-t border-(--border-subtle) py-20 md:py-24">
          <div className="grid gap-10 md:grid-cols-[0.95fr_1fr]">
            <div>
              <p className="text-(length:--font-size-xs) font-medium tracking-[0.16em] text-(--text-muted) uppercase">
                {t('audience.eyebrow')}
              </p>
              <h2 className="mt-4 text-[32px] leading-[1.12] font-medium text-(--text-primary) sm:text-[42px]">
                {t('audience.title')}
              </h2>
              <p className="mt-5 text-(length:--font-size-lg) leading-[1.7] text-(--text-secondary)">
                {t('audience.subtitle')}
              </p>
            </div>
            <div className="grid gap-4">
              {audienceItems.map((key, index) => (
                <article
                  key={key}
                  className="relative overflow-hidden rounded-lg border border-(--border-subtle) bg-(--bg-panel) p-5"
                >
                  <div
                    className="pointer-events-none absolute top-3 left-4 text-[72px] leading-none font-black text-(--home-logo) italic opacity-[0.075]"
                    aria-hidden="true"
                  >
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <h3 className="relative z-10 mt-10 text-(length:--font-size-md) font-medium text-(--text-primary)">
                    {t(`audience.items.${key}.title`)}
                  </h3>
                  <p className="relative z-10 mt-2 text-(length:--font-size-sm) leading-[1.65] text-(--text-secondary)">
                    {t(`audience.items.${key}.body`)}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="grid w-full max-w-[1120px] gap-10 border-t border-(--border-subtle) py-20 md:grid-cols-[1fr_0.92fr] md:py-24">
          <div>
            <p className="text-(length:--font-size-xs) font-medium tracking-[0.16em] text-(--text-muted) uppercase">
              {t('developer.eyebrow')}
            </p>
            <h2 className="mt-4 text-[32px] leading-[1.12] font-medium text-(--text-primary) sm:text-[42px]">
              {t('developer.title')}
            </h2>
            <p className="mt-5 max-w-[620px] text-(length:--font-size-lg) leading-[1.7] text-(--text-secondary)">
              {t('developer.subtitle')}
            </p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-lg border border-(--border-subtle) bg-(--border-subtle)">
            {developerNotes.map((key, index) => (
              <article
                key={key}
                className="relative overflow-hidden bg-(--bg-panel) p-5"
              >
                <div
                  className="pointer-events-none absolute top-3 left-4 text-[72px] leading-none font-black text-(--home-logo) italic opacity-[0.075]"
                  aria-hidden="true"
                >
                  {String(index + 1).padStart(2, '0')}
                </div>
                <h3 className="relative z-10 mt-10 text-(length:--font-size-md) font-medium text-(--text-primary)">
                  {t(`developer.notes.${key}.title`)}
                </h3>
                <p className="relative z-10 mt-2 text-(length:--font-size-sm) leading-[1.65] text-(--text-secondary)">
                  {t(`developer.notes.${key}.body`)}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="w-full max-w-[1120px] border-t border-(--border-subtle) py-20 text-center md:py-24">
          <p className="text-(length:--font-size-xs) font-medium tracking-[0.16em] text-(--text-muted) uppercase">
            {t('finalCta.eyebrow')}
          </p>
          <h2 className="mx-auto mt-4 max-w-[720px] text-[34px] leading-[1.12] font-medium text-(--text-primary) sm:text-[48px]">
            {t('finalCta.title')}
          </h2>
          <p className="mx-auto mt-5 max-w-[620px] text-(length:--font-size-lg) leading-[1.7] text-(--text-secondary)">
            {t('finalCta.subtitle')}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PdxButtonLink
              text={t('actions.enterEditor')}
              size="Big"
              category="Primary"
              to="/editor"
              icon={<ArrowRight size={18} />}
            />
            <PdxButtonLink
              text={t('actions.viewDocs')}
              size="Big"
              category="Secondary"
              to={docsSiteUrl}
            />
          </div>
        </section>
      </main>

      <footer className="mt-auto w-full px-2 pb-6">
        <div className="grid w-full border-t border-(--border-subtle) pt-12 pb-6 md:grid-cols-[1.05fr_2fr] md:gap-12 lg:pt-14">
          <div className="max-w-[360px]">
            <PdxLink
              to="/"
              className={footerBrandLinkClassName}
              title={t('brand.name')}
            >
              <span className={footerWordmarkClassName} aria-hidden="true" />
              <span className="sr-only">{t('brand.name')}</span>
            </PdxLink>
            <p className="mt-5 text-(length:--font-size-sm) leading-[1.7] text-(--text-secondary)">
              {t('footer.description')}
            </p>
          </div>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 md:mt-0 lg:grid-cols-4">
            {footerGroups.map((group) => (
              <div key={group}>
                <h2 className="text-(length:--font-size-xs) font-medium tracking-[0.14em] text-(--text-muted) uppercase">
                  {t(`footer.groups.${group}.title`)}
                </h2>
                <ul className="mt-4 grid gap-3">
                  {footerLinks[group].map((link) => (
                    <li key={link.key}>
                      <PdxLink
                        to={link.to}
                        className="text-(length:--font-size-sm) text-(--text-secondary) no-underline transition-colors duration-200 hover:text-(--text-primary)"
                      >
                        {t(`footer.groups.${group}.links.${link.key}`)}
                      </PdxLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-(--border-subtle) pt-5 text-(length:--font-size-xs) text-(--home-footer-text) sm:flex-row sm:items-center sm:justify-between">
          <span>{t('footer.copy')}</span>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <PdxLink
              to={`${docsSiteUrl}community/contributing`}
              className="text-(--home-footer-text) no-underline transition-colors duration-200 hover:text-(--text-primary)"
            >
              {t('footer.legal.contributing')}
            </PdxLink>
            <PdxLink
              to={`${githubUrl}/blob/main/LICENSE`}
              className="text-(--home-footer-text) no-underline transition-colors duration-200 hover:text-(--text-primary)"
            >
              {t('footer.legal.license')}
            </PdxLink>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Home;
