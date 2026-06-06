import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PdxButton, PdxHeading, PdxParagraph } from '@prodivix/ui';
import { GlobalSettingsContent } from './GlobalSettingsContent';

export const EditorSettingsPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('editor');

  return (
    <div className="mx-auto flex min-h-screen max-w-350 flex-col px-6 text-(--text-primary)">
      <header className="flex items-center justify-between gap-4 border-b border-b-[rgba(0,0,0,0.06)] px-6 py-4 backdrop-blur-[10px] in-data-[theme='dark']:border-b-[rgba(255,255,255,0.08)]">
        <div>
          <PdxHeading level={2}>{t('settings.editorPage.title')}</PdxHeading>
          <PdxParagraph size="Small" color="Muted">
            {t('settings.editorPage.subtitle')}
          </PdxParagraph>
        </div>
        <div className="flex gap-2.5">
          <PdxButton
            text={t('settings.actions.exit')}
            size="Small"
            category="Secondary"
            onClick={() => navigate('/editor')}
          />
        </div>
      </header>
      <main className="flex flex-col gap-4.5 px-6 pt-4 pb-8 max-[1100px]:px-4.5 max-[1100px]:pt-3.5 max-[1100px]:pb-6">
        <GlobalSettingsContent mode="global" />
      </main>
    </div>
  );
};
