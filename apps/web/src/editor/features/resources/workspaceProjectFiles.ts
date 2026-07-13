import {
  isWorkspaceProjectConfigDocumentContent,
  type WorkspaceDocument,
} from '@prodivix/workspace';
import {
  normalizeWorkspaceResourcePath,
  RESOURCE_ROOTS,
} from './workspaceResourceDocuments';
import {
  createDefaultProjectFiles,
  type ProjectFile,
  type ProjectFileKind,
  type ProjectFileTemplateId,
} from './projectFileStore';

type ProjectFileDocumentValue = {
  path: string;
  kind: ProjectFileKind;
  mime: string;
  content: string;
  templateId?: ProjectFileTemplateId;
  enabled: boolean;
};

const inferProjectFileKind = (path: string): ProjectFileKind => {
  if (path === '.gitignore') return 'gitignore';
  if (path === 'LICENSE') return 'license';
  if (path.toLowerCase().startsWith('readme')) return 'readme';
  return 'env';
};

const normalizeProjectFile = (
  value: unknown,
  document: WorkspaceDocument
): ProjectFile | null => {
  if (
    !isWorkspaceProjectConfigDocumentContent<ProjectFileDocumentValue>(value)
  ) {
    return null;
  }
  const file = value.value;
  if (
    !file ||
    typeof file.path !== 'string' ||
    typeof file.content !== 'string' ||
    typeof file.enabled !== 'boolean'
  ) {
    return null;
  }
  return {
    id: document.id,
    path: file.path,
    kind: file.kind ?? inferProjectFileKind(file.path),
    mime: file.mime || 'text/plain',
    content: file.content,
    templateId: file.templateId,
    enabled: file.enabled,
    updatedAt: document.updatedAt,
  };
};

export const createProjectFileDocumentContent = (file: ProjectFile) => ({
  kind: 'config',
  value: {
    path: file.path,
    kind: file.kind,
    mime: file.mime,
    content: file.content,
    templateId: file.templateId,
    enabled: file.enabled,
  },
});

export const buildProjectFilesFromWorkspace = (
  documentsById: Record<string, WorkspaceDocument>
): ProjectFile[] => {
  const files = Object.values(documentsById)
    .filter(
      (document) =>
        document.type === 'project-config' &&
        normalizeWorkspaceResourcePath(document.path).startsWith(
          `${RESOURCE_ROOTS.projectFiles}/`
        )
    )
    .map((document) => normalizeProjectFile(document.content, document))
    .filter((file): file is ProjectFile => Boolean(file));
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  createDefaultProjectFiles().forEach((file) => {
    if (!filesByPath.has(file.path)) filesByPath.set(file.path, file);
  });
  return Array.from(filesByPath.values());
};
