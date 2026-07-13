import { useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { EditorView } from '@codemirror/view';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { Check, FileText, LayoutTemplate, Save } from 'lucide-react';
import { useAuthStore } from '@/auth/useAuthStore';
import { EditorConfirmModal } from '@/editor/components/EditorConfirmModal';
import { useEditorShortcut } from '@/editor/shortcuts';
import { useEditorStore } from '@/editor/store/useEditorStore';
import {
  executeWorkspaceCommandOutboxAndAdopt,
  executeWorkspaceVfsOutboxIntent,
} from '@/editor/workspaceSync/workspaceVfsOutboxExecutor';
import { codeMirrorTypographyTheme } from '@/editor/codeMirrorTypography';
import { ProjectFileTemplatePicker } from './ProjectFileTemplatePicker';
import {
  PROJECT_GITIGNORE_SNIPPETS,
  PROJECT_FILE_TEMPLATES,
  createProjectFileTemplateContent,
  flattenEnabledProjectFiles,
  updateProjectFile,
  type ProjectFile,
  type ProjectFileTemplate,
  type ProjectFileTemplateId,
  type ProjectGitignoreSnippet,
} from './projectFileStore';
import {
  LICENSE_TEMPLATE_PROFILES,
  type LicenseTemplateCategory,
} from './licenseTemplates';
import {
  isLicenseProjectFileTemplate,
  isProjectCopyrightLicenseTemplate,
  mergeLicenseEditableMetadata,
  normalizeLicenseForTemplateMatch,
} from './licenseTemplateUtils';
import {
  buildProjectFilesFromWorkspace,
  createProjectFileDocumentContent,
} from './workspaceProjectFiles';
import {
  createWorkspaceResourceDocumentId,
  createWorkspaceResourceDocumentRequest,
  createWorkspaceResourceValueUpdateCommand,
  findWorkspaceDocumentByPath,
  joinWorkspaceResourcePath,
  RESOURCE_ROOTS,
} from './workspaceResourceDocuments';
import type { WorkspaceSnapshot } from '@prodivix/workspace';

const EMPTY_WORKSPACE_DOCUMENTS: WorkspaceSnapshot['docsById'] = {};

type ProjectFileManagerProps = {
  embedded?: boolean;
};

const getProjectFileSelectionStorageKey = (projectId?: string) =>
  `prodivix.resourceManager.projectFiles.selection.${projectId?.trim() || 'default'}`;

const resolveLanguageExtensionByPath = (path: string) => {
  const lower = path.toLowerCase();
  if (lower.endsWith('.json')) return javascript({ typescript: true });
  if (lower.endsWith('.css') || lower.endsWith('.scss')) return css();
  return javascript({ typescript: true, jsx: true });
};

const formatUpdatedAt = (value: string) => value.replace('T', ' ').slice(0, 16);

const normalizeSnippetBlock = (content: string) => content.trim();

const hasGitignoreSnippet = (value: string, snippet: ProjectGitignoreSnippet) =>
  value.includes(normalizeSnippetBlock(snippet.content));

const appendGitignoreSnippet = (
  value: string,
  snippet: ProjectGitignoreSnippet
) => {
  if (hasGitignoreSnippet(value, snippet)) return value;
  const nextBlock = normalizeSnippetBlock(snippet.content);
  const current = value.trimEnd();
  return `${current}${current ? '\n\n' : ''}${nextBlock}\n`;
};

const removeGitignoreSnippet = (
  value: string,
  snippet: ProjectGitignoreSnippet
) => {
  const next = value
    .replace(normalizeSnippetBlock(snippet.content), '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return next ? `${next}\n` : '';
};

export function ProjectFileManager({
  embedded = false,
}: ProjectFileManagerProps) {
  const { t } = useTranslation('editor');
  const { projectId } = useParams();
  const token = useAuthStore((state) => state.token);
  const workspace = useEditorStore((state) => state.workspace);
  const workspaceId = workspace?.id;
  const workspaceRev = workspace?.workspaceRev;
  const workspaceDocumentsById =
    workspace?.docsById ?? EMPTY_WORKSPACE_DOCUMENTS;
  const project = useEditorStore((state) =>
    projectId ? state.projectsById[projectId] : undefined
  );
  const files = useMemo(
    () => buildProjectFilesFromWorkspace(workspaceDocumentsById),
    [workspaceDocumentsById]
  );
  const [selectedPath, setSelectedPath] = useState(() => {
    const initialFiles = buildProjectFilesFromWorkspace({});
    const storedSelection =
      typeof window === 'undefined'
        ? null
        : window.localStorage.getItem(
            getProjectFileSelectionStorageKey(projectId)
          );
    if (
      storedSelection &&
      initialFiles.some((file) => file.path === storedSelection)
    ) {
      return storedSelection;
    }
    return initialFiles[0]?.path ?? '.gitignore';
  });
  const [editorValue, setEditorValue] = useState('');
  const [selectedTemplateByPath, setSelectedTemplateByPath] = useState<
    Record<string, ProjectFileTemplateId | undefined>
  >({});
  const [pendingTemplate, setPendingTemplate] =
    useState<ProjectFileTemplate | null>(null);
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);

  const selectedFile = useMemo(
    () => files.find((file) => file.path === selectedPath) ?? files[0],
    [files, selectedPath]
  );
  const enabledFiles = useMemo(
    () => flattenEnabledProjectFiles(files),
    [files]
  );
  const templateOptions = useMemo(
    () =>
      PROJECT_FILE_TEMPLATES.filter(
        (template) => template.targetPath === selectedFile?.path
      ),
    [selectedFile?.path]
  );
  const isEditingGitignore = selectedFile?.path === '.gitignore';
  const fileTemplateOptions = useMemo(
    () =>
      templateOptions.filter(
        (template) => template.targetPath !== '.gitignore'
      ),
    [templateOptions]
  );
  const licenseTemplateGroups = useMemo(() => {
    if (selectedFile?.path !== 'LICENSE') return [];
    const grouped = new Map<LicenseTemplateCategory, ProjectFileTemplate[]>();
    fileTemplateOptions.forEach((template) => {
      const profile = LICENSE_TEMPLATE_PROFILES[template.id];
      if (!profile) return;
      const current = grouped.get(profile.category) ?? [];
      current.push(template);
      grouped.set(profile.category, current);
    });
    return Array.from(grouped.entries()).map(([category, templates]) => ({
      category,
      templates,
    }));
  }, [fileTemplateOptions, selectedFile?.path]);
  const selectedTemplateId = selectedFile
    ? selectedTemplateByPath[selectedFile.path]
    : undefined;
  const selectedTemplate = useMemo(
    () =>
      selectedTemplateId
        ? PROJECT_FILE_TEMPLATES.find(
            (template) => template.id === selectedTemplateId
          )
        : undefined,
    [selectedTemplateId]
  );
  const isDirty = Boolean(selectedFile && editorValue !== selectedFile.content);
  const canUseTemplatePicker =
    isEditingGitignore || fileTemplateOptions.length > 0;

  const persistProjectFile = async (file: ProjectFile) => {
    if (!token || !workspace || !workspaceId || !workspaceRev) return;
    const path = joinWorkspaceResourcePath(
      RESOURCE_ROOTS.projectFiles,
      file.path
    );
    const content = createProjectFileDocumentContent(file);
    const existing = findWorkspaceDocumentByPath(
      workspaceDocumentsById,
      path,
      'project-config'
    );
    if (existing) {
      const command = createWorkspaceResourceValueUpdateCommand({
        workspaceId,
        document: existing,
        value: content.value,
        label: `Update ${file.path}`,
      });
      if (!command) return;
      const outcome = await executeWorkspaceCommandOutboxAndAdopt({
        token,
        workspace,
        command,
      });
      if (outcome.status === 'rejected') throw new Error(outcome.message);
      return;
    }
    const outcome = await executeWorkspaceVfsOutboxIntent({
      token,
      workspace,
      request: createWorkspaceResourceDocumentRequest({
        workspaceRev,
        documentId: createWorkspaceResourceDocumentId('project_config', path),
        path,
        type: 'project-config',
        content,
      }),
    });
    if (outcome.status === 'rejected') throw new Error(outcome.message);
  };

  const persistSelectedPatch = async (
    patch: Partial<Pick<ProjectFile, 'content' | 'enabled' | 'templateId'>>
  ) => {
    if (!selectedFile) return;
    const nextFile = updateProjectFile(files, selectedFile.path, patch).find(
      (file) => file.path === selectedFile.path
    );
    if (!nextFile) return;
    await persistProjectFile(nextFile);
  };

  useEffect(() => {
    if (!selectedFile) return;
    setEditorValue(selectedFile.content);
    setSelectedTemplateByPath((current) => {
      if (current[selectedFile.path]) return current;
      if (selectedFile.templateId) {
        return {
          ...current,
          [selectedFile.path]: selectedFile.templateId,
        };
      }
      const matchingTemplate = fileTemplateOptions.find((template) => {
        const templateContent = createProjectFileTemplateContent(template, {
          projectName: project?.name,
          projectDescription: project?.description,
        });
        if (isLicenseProjectFileTemplate(template)) {
          return (
            normalizeLicenseForTemplateMatch(templateContent) ===
            normalizeLicenseForTemplateMatch(selectedFile.content)
          );
        }
        return templateContent.trim() === selectedFile.content.trim();
      });
      return {
        ...current,
        [selectedFile.path]: matchingTemplate?.id,
      };
    });
  }, [fileTemplateOptions, project?.description, project?.name, selectedFile]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!files.some((file) => file.path === selectedPath)) {
      setSelectedPath(files[0]?.path ?? '.gitignore');
      return;
    }
    window.localStorage.setItem(
      getProjectFileSelectionStorageKey(projectId),
      selectedPath
    );
  }, [files, projectId, selectedPath]);

  const handleSave = () => {
    if (!selectedFile) return;
    void persistSelectedPatch({
      content: editorValue,
      templateId: selectedTemplateId,
    });
    setIsTemplatePickerOpen(false);
  };

  const applyTemplateToEditor = (template: ProjectFileTemplate) => {
    const templateContent = createProjectFileTemplateContent(template, {
      projectName: project?.name,
      projectDescription: project?.description,
    });
    const nextContent =
      isProjectCopyrightLicenseTemplate(template) &&
      selectedFile?.path === 'LICENSE'
        ? mergeLicenseEditableMetadata(templateContent, editorValue)
        : templateContent;
    setEditorValue(nextContent);
    setSelectedTemplateByPath((current) => ({
      ...current,
      [template.targetPath]: template.id,
    }));
  };

  const handleApplyTemplate = (template: ProjectFileTemplate) => {
    const currentTemplateId = selectedTemplateByPath[template.targetPath];
    if (currentTemplateId === template.id) return;
    if (currentTemplateId && template.targetPath !== '.gitignore') {
      setPendingTemplate(template);
      return;
    }
    applyTemplateToEditor(template);
    if (template.targetPath !== '.gitignore') setIsTemplatePickerOpen(false);
  };

  const handleConfirmTemplateSwitch = () => {
    if (!pendingTemplate) return;
    applyTemplateToEditor(pendingTemplate);
    setPendingTemplate(null);
    setIsTemplatePickerOpen(false);
  };

  const handleEditorChange = (value: string) => {
    if (selectedFile?.path !== 'LICENSE' || !selectedTemplate) {
      setEditorValue(value);
      return;
    }
    if (!isProjectCopyrightLicenseTemplate(selectedTemplate)) {
      setEditorValue(value);
      return;
    }
    const templateContent = createProjectFileTemplateContent(selectedTemplate, {
      projectName: project?.name,
      projectDescription: project?.description,
    });
    setEditorValue(mergeLicenseEditableMetadata(templateContent, value));
  };

  const handleToggleGitignoreSnippet = (
    snippet: ProjectGitignoreSnippet,
    checked: boolean
  ) => {
    setEditorValue((currentValue) =>
      checked
        ? appendGitignoreSnippet(currentValue, snippet)
        : removeGitignoreSnippet(currentValue, snippet)
    );
  };

  useEffect(() => {
    setIsTemplatePickerOpen(false);
  }, [selectedFile?.path]);

  useEditorShortcut(
    'Mod+S',
    () => {
      handleSave();
    },
    {
      allowInEditable: true,
    }
  );

  const shellClassName = embedded
    ? 'grid gap-4'
    : 'mx-auto grid w-full max-w-7xl gap-4 px-6 py-6';

  return (
    <section className={shellClassName}>
      <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
        <h2 className="text-base font-medium text-(--text-primary)">
          {t('resourceManager.projectFiles.header.title')}
        </h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          {t('resourceManager.projectFiles.header.description')}
        </p>
      </article>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="grid content-start gap-3 rounded-xl border border-black/10 bg-(--bg-canvas) p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium tracking-[0.08em] text-(--text-muted) uppercase">
              {t('resourceManager.projectFiles.labels.rootFiles')}
            </p>
            <span className="rounded-full bg-black/[0.04] px-2 py-1 text-[11px] text-(--text-secondary)">
              {enabledFiles.length}/{files.length}
            </span>
          </div>
          <div className="grid gap-1">
            {files.map((file) => {
              const isActive = file.path === selectedFile?.path;
              return (
                <button
                  key={file.path}
                  type="button"
                  className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs transition-colors ${
                    isActive
                      ? 'border-black/16 bg-black/[0.04]'
                      : 'border-transparent hover:border-black/10 hover:bg-black/[0.02]'
                  }`}
                  onClick={() => setSelectedPath(file.path)}
                >
                  <FileText
                    size={14}
                    className="shrink-0 text-(--text-secondary)"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-(--text-primary)">
                      {file.path}
                    </span>
                    <span className="block truncate text-(--text-muted)">
                      {file.enabled
                        ? t('resourceManager.projectFiles.labels.enabled')
                        : t('resourceManager.projectFiles.labels.disabled')}
                    </span>
                  </span>
                  {file.enabled ? (
                    <Check
                      size={13}
                      className="shrink-0 text-(--text-secondary)"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </aside>

        <article className="relative grid gap-3 rounded-xl border border-black/10 bg-(--bg-canvas) p-4">
          {selectedFile ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] tracking-[0.08em] text-(--text-muted) uppercase">
                    {t('resourceManager.projectFiles.labels.selected')}
                  </p>
                  <h3 className="text-sm font-medium text-(--text-primary)">
                    {selectedFile.path}
                  </h3>
                  <p className="text-xs text-(--text-secondary)">
                    {selectedFile.mime} |{' '}
                    {t('resourceManager.projectFiles.labels.updated')}:{' '}
                    {formatUpdatedAt(selectedFile.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canUseTemplatePicker ? (
                    <button
                      type="button"
                      className={`grid h-8 w-8 place-items-center rounded-lg transition-colors ${
                        isTemplatePickerOpen
                          ? 'bg-black text-white'
                          : 'text-(--text-secondary) hover:bg-black/[0.04] hover:text-(--text-primary)'
                      }`}
                      onClick={() =>
                        setIsTemplatePickerOpen((current) => !current)
                      }
                      aria-label={t(
                        'resourceManager.projectFiles.actions.openTemplates'
                      )}
                      title={t(
                        'resourceManager.projectFiles.actions.openTemplates'
                      )}
                      aria-expanded={isTemplatePickerOpen}
                    >
                      <LayoutTemplate size={15} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      selectedFile.enabled
                        ? 'border-black/14 bg-black text-white'
                        : 'border-black/12 bg-transparent text-(--text-secondary) hover:border-black/20'
                    }`}
                    onClick={() =>
                      void persistSelectedPatch({
                        enabled: !selectedFile.enabled,
                      })
                    }
                  >
                    {selectedFile.enabled
                      ? t('resourceManager.projectFiles.actions.included')
                      : t('resourceManager.projectFiles.actions.include')}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-black/12 bg-black px-2.5 py-1.5 text-xs text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={handleSave}
                    disabled={!isDirty}
                  >
                    <Save size={12} />
                    {t('resourceManager.projectFiles.actions.save')}
                  </button>
                </div>
              </div>

              <ProjectFileTemplatePicker
                open={isTemplatePickerOpen}
                isEditingGitignore={isEditingGitignore}
                fileTemplateOptions={fileTemplateOptions}
                gitignoreSnippets={PROJECT_GITIGNORE_SNIPPETS}
                licenseTemplateGroups={licenseTemplateGroups}
                selectedTemplateId={selectedTemplateId}
                isGitignoreSnippetEnabled={(snippet) =>
                  hasGitignoreSnippet(editorValue, snippet)
                }
                onApplyTemplate={handleApplyTemplate}
                onToggleGitignoreSnippet={handleToggleGitignoreSnippet}
                onClose={() => setIsTemplatePickerOpen(false)}
              />

              <CodeMirror
                data-editor-native-history="true"
                value={editorValue}
                onChange={handleEditorChange}
                extensions={[
                  resolveLanguageExtensionByPath(selectedFile.path),
                  EditorView.lineWrapping,
                  codeMirrorTypographyTheme,
                ]}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: true,
                }}
                className="rounded-lg border border-black/10 bg-black/[0.02] text-[12px] [&_.cm-editor]:min-h-[460px]"
              />
            </>
          ) : (
            <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4 text-sm text-(--text-secondary)">
              {t('resourceManager.projectFiles.empty')}
            </div>
          )}
        </article>
      </div>
      <EditorConfirmModal
        open={Boolean(pendingTemplate)}
        title={t('resourceManager.projectFiles.templateSwitchTitle')}
        message={t('resourceManager.projectFiles.templateSwitchConfirm', {
          template: pendingTemplate?.label,
        })}
        cancelText={t('resourceManager.projectFiles.actions.cancel')}
        confirmText={t('resourceManager.projectFiles.actions.switchTemplate')}
        onCancel={() => setPendingTemplate(null)}
        onConfirm={handleConfirmTemplateSwitch}
      />
    </section>
  );
}
