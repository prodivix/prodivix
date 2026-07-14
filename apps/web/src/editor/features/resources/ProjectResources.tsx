import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { CodeResourcePage } from './CodeResourcePage';
import { ExternalLibraryManager } from './ExternalLibraryManager';
import { I18nResourcePage } from './I18nResourcePage';
import { ProjectFileManager } from './ProjectFileManager';
import { ResourceOverviewPanel } from './ResourceOverviewPanel';
import { PublicResourcePage } from './PublicResourcePage';
import { ComponentResourcePage } from './ComponentResourcePage';
import {
  buildOverviewSnapshot,
  getResourceManagerViewStorageKey,
  sectionMetas,
  type SectionId,
} from './projectResourceOverview';
import { useEditorStore } from '@/editor/store/useEditorStore';
import type { WorkspaceSnapshot } from '@prodivix/workspace';

const EMPTY_WORKSPACE_DOCUMENTS: WorkspaceSnapshot['docsById'] = {};
const EMPTY_WORKSPACE_TREE: WorkspaceSnapshot['treeById'] = {};

export function ProjectResources() {
  const { t } = useTranslation('editor');
  const { projectId } = useParams();
  const workspace = useEditorStore((state) => state.workspace);
  const workspaceDocumentsById =
    workspace?.docsById ?? EMPTY_WORKSPACE_DOCUMENTS;
  const activeDocumentId = workspace?.activeDocumentId;
  const activeDocumentType = activeDocumentId
    ? workspaceDocumentsById[activeDocumentId]?.type
    : undefined;
  const treeRootId = workspace?.treeRootId;
  const treeById = workspace?.treeById ?? EMPTY_WORKSPACE_TREE;
  const [activeSection, setActiveSection] = useState<SectionId>(() => {
    if (typeof window === 'undefined') return 'overview';
    const raw = window.localStorage.getItem(
      getResourceManagerViewStorageKey(projectId)
    );
    if (
      raw === 'overview' ||
      raw === 'components' ||
      raw === 'public' ||
      raw === 'code' ||
      raw === 'i18n' ||
      raw === 'external' ||
      raw === 'projectFiles'
    ) {
      return raw;
    }
    return 'overview';
  });
  const [pendingCodeFolder, setPendingCodeFolder] = useState<
    'scripts' | 'styles' | 'shaders' | null
  >(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      getResourceManagerViewStorageKey(projectId),
      activeSection
    );
  }, [activeSection, projectId]);

  useEffect(() => {
    if (activeDocumentType === 'code') setActiveSection('code');
  }, [activeDocumentId, activeDocumentType]);

  const overviewSnapshot = useMemo(() => {
    if (activeSection !== 'overview') return null;
    return buildOverviewSnapshot(
      projectId,
      workspaceDocumentsById,
      treeRootId,
      treeById
    );
  }, [activeSection, projectId, treeById, treeRootId, workspaceDocumentsById]);

  const createCodeAssetAndOpen = (folder: 'scripts' | 'styles' | 'shaders') => {
    setPendingCodeFolder(folder);
    setActiveSection('code');
  };

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
      <header className="rounded-2xl border border-black/8 bg-white/92 p-5 shadow-[0_10px_28px_rgba(0,0,0,0.06)]">
        <p className="mb-2 text-xs font-medium tracking-[0.12em] text-(--text-muted) uppercase">
          {t('resourceManager.header.badge')}
        </p>
        <h1 className="text-2xl font-semibold text-(--text-primary)">
          {t('resourceManager.header.title')}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-(--text-secondary)">
          {t('resourceManager.header.description')}
        </p>
      </header>

      <nav className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-2">
        <div className="flex flex-wrap gap-2">
          {sectionMetas.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'border border-black/16 bg-black text-white'
                    : 'border border-transparent bg-transparent text-(--text-secondary) hover:border-black/10 hover:text-(--text-primary)'
                }`}
              >
                <Icon size={14} />
                {t(`resourceManager.tabs.${section.id}`)}
              </button>
            );
          })}
        </div>
      </nav>

      {activeSection === 'overview' ? (
        <ResourceOverviewPanel
          overviewSnapshot={overviewSnapshot}
          onOpenSection={setActiveSection}
          onCreateCodeAsset={createCodeAssetAndOpen}
        />
      ) : null}

      {activeSection === 'components' ? <ComponentResourcePage /> : null}

      {activeSection === 'public' ? <PublicResourcePage embedded /> : null}

      {activeSection === 'code' ? (
        <CodeResourcePage
          embedded
          requestedCreateFolder={pendingCodeFolder}
          onCreateRequestConsumed={() => setPendingCodeFolder(null)}
        />
      ) : null}

      {activeSection === 'i18n' ? <I18nResourcePage embedded /> : null}

      {activeSection === 'external' ? <ExternalLibraryManager /> : null}

      {activeSection === 'projectFiles' ? (
        <ProjectFileManager embedded />
      ) : null}
    </section>
  );
}
