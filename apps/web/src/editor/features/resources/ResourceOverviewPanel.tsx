import { type ComponentType } from 'react';
import {
  ArrowRight,
  FileArchive,
  FileCode2,
  FileCog,
  Palette,
  Globe2,
  Library,
  Plus,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  formatUpdatedAt,
  type OverviewSnapshot,
} from './projectResourceOverview';
import type { SectionId } from './projectResourceOverview';

type CodeResourceFolder = 'scripts' | 'styles' | 'shaders';

type ResourceOverviewPanelProps = {
  overviewSnapshot: OverviewSnapshot | null;
  onOpenSection: (section: SectionId) => void;
  onOpenCodeResources: (folder?: CodeResourceFolder) => void;
};

const ResourceTile = ({
  icon: Icon,
  title,
  description,
  metrics,
  status,
  actionLabel,
  onAction,
}: {
  icon: ComponentType<{ size?: number }>;
  title: string;
  description: string;
  metrics: Array<{ label: string; value: string }>;
  status: 'default' | 'warning';
  actionLabel: string;
  onAction: () => void;
}) => {
  const { t } = useTranslation('editor');

  return (
    <article className="relative overflow-hidden rounded-2xl border border-black/8 bg-(--bg-canvas) p-5 shadow-[0_10px_28px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-xs font-medium tracking-[0.12em] text-(--text-muted) uppercase">
            <Icon size={14} />
            {title}
          </p>
          <p className="mt-2 text-sm text-(--text-secondary)">{description}</p>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-(--text-secondary) hover:border-black/20 hover:bg-black/[0.02]"
          onClick={onAction}
        >
          {actionLabel}
          <ArrowRight size={12} />
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div
            key={`${title}-${metric.label}`}
            className="rounded-xl border border-black/8 bg-black/[0.015] px-3 py-2"
          >
            <p className="text-[11px] tracking-[0.08em] text-(--text-muted) uppercase">
              {metric.label}
            </p>
            <p className="mt-1 text-sm font-medium text-(--text-primary)">
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 text-xs text-(--text-secondary)">
        <span className="inline-flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
          />
          {status === 'warning'
            ? t('resourceManager.overview.tile.needsAttention')
            : t('resourceManager.overview.tile.lookingGood')}
        </span>
        <span className="text-(--text-muted)">
          {t('resourceManager.overview.tile.overview')}
        </span>
      </div>
    </article>
  );
};

export function ResourceOverviewPanel({
  overviewSnapshot,
  onOpenSection,
  onOpenCodeResources,
}: ResourceOverviewPanelProps) {
  const { t } = useTranslation('editor');

  return (
    <div className="grid gap-4">
      {overviewSnapshot ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <ResourceTile
            icon={FileArchive}
            title={t('resourceManager.tabs.public')}
            description={t('resourceManager.overview.cards.public.description')}
            metrics={[
              {
                label: t('resourceManager.overview.metrics.files'),
                value: String(overviewSnapshot.public.files),
              },
              {
                label: t('resourceManager.overview.metrics.warnings'),
                value: String(overviewSnapshot.public.warnings),
              },
              {
                label: t('resourceManager.overview.metrics.updated'),
                value: formatUpdatedAt(overviewSnapshot.public.updatedAt),
              },
            ]}
            status={
              overviewSnapshot.public.warnings > 0 ? 'warning' : 'default'
            }
            actionLabel={t('resourceManager.overview.actions.open')}
            onAction={() => onOpenSection('public')}
          />
          <ResourceTile
            icon={FileCode2}
            title={t('resourceManager.tabs.code')}
            description={t('resourceManager.overview.cards.code.description')}
            metrics={[
              {
                label: t('resourceManager.overview.metrics.files'),
                value: String(overviewSnapshot.code.files),
              },
              {
                label: t('resourceManager.overview.metrics.scriptsStyles'),
                value: `${overviewSnapshot.code.scripts}/${overviewSnapshot.code.styles}`,
              },
              {
                label: t('resourceManager.overview.metrics.updated'),
                value: formatUpdatedAt(overviewSnapshot.code.updatedAt),
              },
            ]}
            status={overviewSnapshot.code.files === 0 ? 'warning' : 'default'}
            actionLabel={t('resourceManager.overview.actions.open')}
            onAction={() => onOpenCodeResources()}
          />
          <ResourceTile
            icon={Palette}
            title={t('resourceManager.tabs.tokens')}
            description={t('resourceManager.overview.cards.tokens.description')}
            metrics={[
              {
                label: t('resourceManager.overview.metrics.files'),
                value: String(overviewSnapshot.tokens.documents),
              },
              {
                label: t('resourceManager.overview.metrics.tokens'),
                value: String(overviewSnapshot.tokens.tokens),
              },
              {
                label: t('resourceManager.overview.metrics.contexts'),
                value: String(overviewSnapshot.tokens.contexts),
              },
            ]}
            status={
              overviewSnapshot.tokens.resolvers === 0 ? 'warning' : 'default'
            }
            actionLabel={t('resourceManager.overview.actions.open')}
            onAction={() => onOpenSection('tokens')}
          />
          <ResourceTile
            icon={Globe2}
            title={t('resourceManager.tabs.i18n')}
            description={t('resourceManager.overview.cards.i18n.description')}
            metrics={[
              {
                label: t('resourceManager.overview.metrics.locales'),
                value: String(overviewSnapshot.i18n.locales),
              },
              {
                label: t('resourceManager.overview.metrics.namespaces'),
                value: String(overviewSnapshot.i18n.namespaces),
              },
              {
                label: t('resourceManager.overview.metrics.missingValues'),
                value: String(overviewSnapshot.i18n.missingValues),
              },
            ]}
            status={
              overviewSnapshot.i18n.missingValues > 0 ? 'warning' : 'default'
            }
            actionLabel={t('resourceManager.overview.actions.open')}
            onAction={() => onOpenSection('i18n')}
          />
          <ResourceTile
            icon={Library}
            title={t('resourceManager.tabs.external')}
            description={t(
              'resourceManager.overview.cards.external.description'
            )}
            metrics={[
              {
                label: t('resourceManager.overview.metrics.components'),
                value: String(overviewSnapshot.external.componentLibraries),
              },
              {
                label: t('resourceManager.overview.metrics.icons'),
                value: String(overviewSnapshot.external.iconLibraries),
              },
              {
                label: t('resourceManager.overview.metrics.status'),
                value:
                  overviewSnapshot.external.componentLibraries +
                    overviewSnapshot.external.iconLibraries >
                  0
                    ? t('resourceManager.overview.metrics.configured')
                    : t('resourceManager.overview.metrics.none'),
              },
            ]}
            status={
              overviewSnapshot.external.componentLibraries +
                overviewSnapshot.external.iconLibraries ===
              0
                ? 'warning'
                : 'default'
            }
            actionLabel={t('resourceManager.overview.actions.open')}
            onAction={() => onOpenSection('external')}
          />
          <ResourceTile
            icon={FileCog}
            title={t('resourceManager.tabs.projectFiles')}
            description={t(
              'resourceManager.overview.cards.projectFiles.description'
            )}
            metrics={[
              {
                label: t('resourceManager.overview.metrics.files'),
                value: String(overviewSnapshot.projectFiles.files),
              },
              {
                label: t('resourceManager.overview.metrics.included'),
                value: String(overviewSnapshot.projectFiles.enabled),
              },
              {
                label: t('resourceManager.overview.metrics.updated'),
                value: formatUpdatedAt(overviewSnapshot.projectFiles.updatedAt),
              },
            ]}
            status={
              overviewSnapshot.projectFiles.hasLicense ? 'default' : 'warning'
            }
            actionLabel={t('resourceManager.overview.actions.open')}
            onAction={() => onOpenSection('projectFiles')}
          />
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium tracking-[0.12em] text-(--text-muted) uppercase">
                {t('resourceManager.overview.quickActions.badgeTitle')}
              </p>
              <h2 className="mt-2 text-base font-medium text-(--text-primary)">
                {t('resourceManager.overview.quickActions.title')}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-(--text-secondary)">
                {t('resourceManager.overview.quickActions.description')}
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl border border-black/8 bg-black/[0.015] px-3 py-2 text-xs text-(--text-secondary)">
              <Sparkles size={14} className="text-(--text-secondary)" />
              {t('resourceManager.overview.quickActions.badge')}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <button
              type="button"
              className="group grid gap-1 rounded-2xl border border-black/8 bg-white p-4 text-left hover:border-black/16 hover:bg-black/[0.01]"
              onClick={() => onOpenCodeResources('scripts')}
            >
              <p className="inline-flex items-center gap-2 text-xs font-medium tracking-[0.12em] text-(--text-muted) uppercase">
                <Plus size={14} />
                {t('resourceManager.overview.quickActions.newScript')}
              </p>
              <p className="text-sm font-medium text-(--text-primary)">
                {t('resourceManager.overview.quickActions.scriptPath')}
              </p>
              <p className="text-xs text-(--text-secondary)">
                {t('resourceManager.overview.quickActions.scriptHint')}
              </p>
            </button>

            <button
              type="button"
              className="group grid gap-1 rounded-2xl border border-black/8 bg-white p-4 text-left hover:border-black/16 hover:bg-black/[0.01]"
              onClick={() => onOpenCodeResources('styles')}
            >
              <p className="inline-flex items-center gap-2 text-xs font-medium tracking-[0.12em] text-(--text-muted) uppercase">
                <Plus size={14} />
                {t('resourceManager.overview.quickActions.newStyle')}
              </p>
              <p className="text-sm font-medium text-(--text-primary)">
                {t('resourceManager.overview.quickActions.stylePath')}
              </p>
              <p className="text-xs text-(--text-secondary)">
                {t('resourceManager.overview.quickActions.styleHint')}
              </p>
            </button>

            <button
              type="button"
              className="group grid gap-1 rounded-2xl border border-black/8 bg-white p-4 text-left hover:border-black/16 hover:bg-black/[0.01]"
              onClick={() => onOpenCodeResources('shaders')}
            >
              <p className="inline-flex items-center gap-2 text-xs font-medium tracking-[0.12em] text-(--text-muted) uppercase">
                <Plus size={14} />
                {t('resourceManager.overview.quickActions.newShader')}
              </p>
              <p className="text-sm font-medium text-(--text-primary)">
                {t('resourceManager.overview.quickActions.shaderPath')}
              </p>
              <p className="text-xs text-(--text-secondary)">
                {t('resourceManager.overview.quickActions.shaderHint')}
              </p>
            </button>
          </div>
        </article>

        <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
          <p className="text-xs font-medium tracking-[0.12em] text-(--text-muted) uppercase">
            {t('resourceManager.overview.healthCheck.badge')}
          </p>
          <h2 className="mt-2 text-base font-medium text-(--text-primary)">
            {t('resourceManager.overview.healthCheck.title')}
          </h2>
          <div className="mt-4 grid gap-2 text-sm text-(--text-secondary)">
            {overviewSnapshot?.public.warnings ? (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">
                <TriangleAlert size={16} className="mt-0.5 text-amber-700" />
                <div>
                  {t('resourceManager.overview.healthCheck.publicWarnings', {
                    count: overviewSnapshot.public.warnings,
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-black/8 bg-black/[0.015] px-3 py-2 text-xs">
                {t('resourceManager.overview.healthCheck.publicClean')}
              </div>
            )}

            {overviewSnapshot?.i18n.missingValues ? (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">
                <TriangleAlert size={16} className="mt-0.5 text-amber-700" />
                <div>
                  {t('resourceManager.overview.healthCheck.i18nMissing', {
                    count: overviewSnapshot.i18n.missingValues,
                    baseLocale: overviewSnapshot.i18n.baseLocale,
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-black/8 bg-black/[0.015] px-3 py-2 text-xs">
                {t('resourceManager.overview.healthCheck.i18nGood')}
              </div>
            )}

            {overviewSnapshot?.external.componentLibraries === 0 ? (
              <div className="rounded-2xl border border-black/8 bg-black/[0.015] px-3 py-2 text-xs">
                {t('resourceManager.overview.healthCheck.noComponentLib')}
              </div>
            ) : null}

            {overviewSnapshot?.i18n.worstLocale ? (
              <div className="rounded-2xl border border-black/8 bg-black/[0.015] px-3 py-2 text-xs">
                {t('resourceManager.overview.healthCheck.worstLocale', {
                  locale: overviewSnapshot.i18n.worstLocale.locale,
                  count: overviewSnapshot.i18n.worstLocale.missing,
                })}
              </div>
            ) : null}
          </div>
        </article>
      </div>
    </div>
  );
}
