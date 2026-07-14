import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PdxButton, PdxInput, PdxTextarea } from '@prodivix/ui';
import { Box, Layers, Workflow } from 'lucide-react';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { createEmptyPirDocument } from '@prodivix/pir';
import { useAuthStore } from '@/auth/useAuthStore';
import { editorApi, type ProjectSummary } from '@/editor/editorApi';
import {
  createLocalProject,
  type LocalProjectRecord,
} from '@/editor/localProjectStore';

export type ResourceType = 'project' | 'component' | 'nodegraph';

interface NewResourceModalProps {
  open: boolean;
  onClose: () => void;
  defaultType?: ResourceType;
  onCreated?: (project: ProjectSummary | LocalProjectRecord) => void;
}

function NewResourceModal({
  open,
  onClose,
  defaultType = 'project',
  onCreated,
}: NewResourceModalProps) {
  const { t } = useTranslation('editor');
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  const setProject = useEditorStore((state) => state.setProject);

  // State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const [type, setType] = useState<ResourceType>(defaultType);

  if (!open) return null;

  const handleCreate = async () => {
    setSubmitting(true);
    setError(null);
    const finalName = name.trim() || 'Untitled';
    const initialPir = createEmptyPirDocument();

    try {
      if (!isAuthenticated || !token) {
        const project = await createLocalProject({
          name: finalName,
          description: description.trim() || undefined,
          resourceType: type,
          pir: initialPir,
        });
        setProject({
          id: project.id,
          name: project.name,
          description: project.description,
          type: project.resourceType,
          isPublic: project.isPublic,
          starsCount: project.starsCount,
        });
        onCreated?.(project);

        onClose();
        if (type === 'project') {
          navigate(`/editor/project/${project.id}/blueprint`);
        } else if (type === 'component') {
          navigate(`/editor/project/${project.id}/component`);
        } else {
          navigate(`/editor/project/${project.id}/nodegraph`);
        }
        return;
      }

      const { project } = await editorApi.createProject(token, {
        name: finalName,
        description: description.trim() || undefined,
        resourceType: type,
        isPublic,
        initialPir,
      });
      setProject({
        id: project.id,
        name: project.name,
        description: project.description,
        type: project.resourceType,
        isPublic: project.isPublic,
        starsCount: project.starsCount,
      });
      onCreated?.(project);

      onClose();
      if (type === 'project') {
        navigate(`/editor/project/${project.id}/blueprint`);
      } else if (type === 'component') {
        navigate(`/editor/project/${project.id}/component`);
      } else {
        navigate(`/editor/project/${project.id}/nodegraph`);
      }
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Create failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[rgba(8,8,8,0.5)] backdrop-blur-[6px]"
      onClick={onClose}
    >
      <div
        className="flex w-[min(720px,92vw)] flex-col overflow-hidden rounded-[18px] border border-(--border-subtle) bg-(--bg-canvas) text-(--text-primary) shadow-[0_18px_44px_rgba(0,0,0,0.16)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-b-(--border-subtle) bg-[linear-gradient(120deg,var(--bg-panel),var(--bg-canvas))] px-[22px] py-[18px]">
          <div>
            <h2 className="m-0 text-[18px] font-bold">
              {t('modals.newResource.title', 'Create New')}
            </h2>
            <p className="mt-[6px] text-(length:--font-size-xs) text-(--text-muted)">
              {t(
                'modals.newResource.subtitle',
                'Select a type and start building'
              )}
            </p>
          </div>
          <button
            className="flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-(length:--font-size-2xl) text-(--text-muted) transition-all duration-[300ms] ease-[ease] hover:bg-(--bg-raised) hover:text-(--text-primary)"
            onClick={onClose}
            aria-label={t('modals.close')}
          >
            ✕
          </button>
        </header>

        <div className="flex flex-col gap-[22px] p-[28px]">
          {error && (
            <p className="m-0 rounded-[10px] border border-(--border-default) bg-(--bg-panel) p-[10px] text-(length:--font-size-xs) text-(--text-secondary)">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-[10px]">
            <label className="flex items-center gap-[4px] text-(length:--font-size-sm) font-medium text-(--text-primary)">
              {t('modals.newResource.typeLabel', 'Type')}
            </label>
            <div className="mb-[8px] grid grid-cols-3 gap-[16px]">
              <button
                type="button"
                className={`flex cursor-pointer flex-col items-center justify-center gap-[8px] rounded-[var(--radius-lg)] border p-[16px] transition-all duration-[150ms] ease-[ease] ${
                  type === 'project'
                    ? 'border-(--accent-color) bg-(--bg-canvas) text-(--text-primary)'
                    : 'border-(--border-default) bg-(--bg-panel) text-(--text-muted) hover:bg-(--bg-raised) hover:text-(--text-primary)'
                }`}
                onClick={() => setType('project')}
              >
                <Box size={24} />
                <span className="text-(length:--font-size-xs) font-medium">
                  {t('modals.newProject.title', 'Project')
                    .replace('Create ', '')
                    .replace('新建', '')}
                </span>
              </button>
              <button
                type="button"
                className={`flex cursor-pointer flex-col items-center justify-center gap-[8px] rounded-[var(--radius-lg)] border p-[16px] transition-all duration-[150ms] ease-[ease] ${
                  type === 'component'
                    ? 'border-(--accent-color) bg-(--bg-canvas) text-(--text-primary)'
                    : 'border-(--border-default) bg-(--bg-panel) text-(--text-muted) hover:bg-(--bg-raised) hover:text-(--text-primary)'
                }`}
                onClick={() => setType('component')}
              >
                <Layers size={24} />
                <span className="text-(length:--font-size-xs) font-medium">
                  {t('modals.newComponent.title', 'Component')
                    .replace('Create ', '')
                    .replace('新建', '')}
                </span>
              </button>
              <button
                type="button"
                className={`flex cursor-pointer flex-col items-center justify-center gap-[8px] rounded-[var(--radius-lg)] border p-[16px] transition-all duration-[150ms] ease-[ease] ${
                  type === 'nodegraph'
                    ? 'border-(--accent-color) bg-(--bg-canvas) text-(--text-primary)'
                    : 'border-(--border-default) bg-(--bg-panel) text-(--text-muted) hover:bg-(--bg-raised) hover:text-(--text-primary)'
                }`}
                onClick={() => setType('nodegraph')}
              >
                <Workflow size={24} />
                <span className="text-(length:--font-size-xs) font-medium">
                  {t('modals.newNodeGraph.title', 'Node Graph')
                    .replace('Create ', '')
                    .replace('新建', '')}
                </span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-[10px]">
            <label
              className="flex items-center gap-[4px] text-(length:--font-size-sm) font-medium text-(--text-primary)"
              htmlFor="new-resource-name"
            >
              <span>{t('modals.newResource.nameLabel', 'Name')}</span>
            </label>
            <PdxInput
              id="new-resource-name"
              placeholder="项目名称？（默认：'Untitled'）"
              value={name}
              onValueChange={setName}
            />
          </div>

          <div className="flex flex-col gap-[10px]">
            <label className="flex items-center gap-[4px] text-(length:--font-size-sm) font-medium text-(--text-primary)">
              {t('modals.newProject.descriptionLabel', 'Description')}
            </label>
            <PdxTextarea
              placeholder={t(
                'modals.newProject.descriptionPlaceholder',
                'Optional description'
              )}
              value={description}
              onValueChange={setDescription}
            />
          </div>

          <label className="inline-flex cursor-pointer items-center justify-between rounded-[12px] border border-(--border-default) bg-(--bg-panel) px-[12px] py-[10px]">
            <span className="text-(length:--font-size-sm) font-medium text-(--text-primary)">
              {t(
                'modals.newResource.publicLabel',
                'Publish to community after creation'
              )}
            </span>
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
              className="h-[16px] w-[16px] cursor-pointer accent-(--accent-color)"
            />
          </label>
        </div>

        <footer className="flex items-center justify-end gap-[12px] border-t border-t-(--border-subtle) bg-(--bg-panel) px-[22px] py-[18px]">
          <PdxButton
            text={t('modals.actions.cancel')}
            variant="Ghost"
            onClick={onClose}
          />
          <PdxButton
            text={t('modals.actions.create', 'Create')}
            variant="Primary"
            onClick={handleCreate}
            disabled={isSubmitting}
          />
        </footer>
      </div>
    </div>
  );
}

export default NewResourceModal;
