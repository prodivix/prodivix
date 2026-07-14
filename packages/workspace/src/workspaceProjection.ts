import type {
  WorkspaceDocument,
  WorkspaceSnapshot,
  WorkspaceCodeDocumentContent,
  WorkspaceDocumentId,
  WorkspaceValidationIssue,
} from './types';
import { validateWorkspaceSnapshot } from './validateWorkspaceVfs';
import { isWorkspaceCodeDocumentContent } from './workspaceCodeDocument';
import {
  decodeWorkspaceDocument,
  encodeWorkspaceDocument,
} from './workspaceCodec';

export type WorkspaceSourceFileRole =
  | 'workspace-manifest'
  | 'route-manifest'
  | 'document'
  | 'asset'
  | 'generated-index';

export type WorkspaceSourceFile = {
  path: string;
  content: string;
  mime: string;
  role: WorkspaceSourceFileRole;
  documentId?: WorkspaceDocumentId;
};

export type WorkspaceProjectionIssueCode =
  | 'WKS_PROJECTION_INVALID_WORKSPACE'
  | 'WKS_PROJECTION_FILE_MISSING'
  | 'WKS_PROJECTION_JSON_INVALID'
  | 'WKS_PROJECTION_MANIFEST_INVALID'
  | 'WKS_PROJECTION_DOCUMENT_MISSING';

export type WorkspaceProjectionIssue = {
  code: WorkspaceProjectionIssueCode;
  path: string;
  message: string;
  documentId?: WorkspaceDocumentId;
  cause?: unknown;
  validationIssues?: WorkspaceValidationIssue[];
};

export type WorkspaceProjectionWriteResult =
  | {
      ok: true;
      files: WorkspaceSourceFile[];
    }
  | {
      ok: false;
      issues: WorkspaceProjectionIssue[];
    };

export type WorkspaceProjectionReadResult =
  | {
      ok: true;
      snapshot: WorkspaceSnapshot;
    }
  | {
      ok: false;
      issues: WorkspaceProjectionIssue[];
    };

type WorkspaceDocumentManifestEntry = Omit<WorkspaceDocument, 'content'> & {
  contentPath: string;
  codeContent?: Omit<WorkspaceCodeDocumentContent, 'source'>;
};

type WorkspaceManifest = {
  version: '1';
  workspace: {
    id: WorkspaceSnapshot['id'];
    name?: WorkspaceSnapshot['name'];
    workspaceRev: WorkspaceSnapshot['workspaceRev'];
    routeRev: WorkspaceSnapshot['routeRev'];
    opSeq: WorkspaceSnapshot['opSeq'];
  };
  treeRootId: WorkspaceSnapshot['treeRootId'];
  treeById: WorkspaceSnapshot['treeById'];
  documents: Record<WorkspaceDocumentId, WorkspaceDocumentManifestEntry>;
  activeDocumentId?: WorkspaceSnapshot['activeDocumentId'];
  activeRouteNodeId?: WorkspaceSnapshot['activeRouteNodeId'];
};

const WORKSPACE_MANIFEST_PATH = '.prodivix/workspace.json';
const ROUTE_MANIFEST_PATH = '.prodivix/route-manifest.json';
const DOCUMENT_ROOT_PATH = '.prodivix/documents';

const normalizeSourcePath = (path: string): string =>
  path.replaceAll('\\', '/').replace(/^\/+/, '');

const toProdivixSourcePath = (path: string): string => {
  const normalized = normalizeSourcePath(path);
  return normalized.startsWith('.prodivix/')
    ? normalized
    : `.prodivix/${normalized}`;
};

const createSourceFileMap = (
  files: WorkspaceSourceFile[]
): Map<string, WorkspaceSourceFile> => {
  const filesByPath = new Map<string, WorkspaceSourceFile>();
  files.forEach((file) => {
    const normalized = normalizeSourcePath(file.path);
    filesByPath.set(normalized, file);
    filesByPath.set(toProdivixSourcePath(normalized), file);
  });
  return filesByPath;
};

const documentContentPath = (document: WorkspaceDocument): string => {
  if (
    document.type === 'code' &&
    isWorkspaceCodeDocumentContent(document.content)
  ) {
    return normalizeSourcePath(document.path);
  }

  const normalizedDocumentPath = normalizeSourcePath(document.path);
  return `${DOCUMENT_ROOT_PATH}/${normalizedDocumentPath}`;
};

const jsonStringifyStable = (value: unknown): string => {
  const sortValue = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sortValue);
    if (!input || typeof input !== 'object') return input;
    return Object.keys(input)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortValue((input as Record<string, unknown>)[key]);
        return result;
      }, {});
  };

  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
};

const serializeDocumentContent = (
  document: WorkspaceDocument
): Pick<WorkspaceSourceFile, 'content' | 'mime'> => {
  const wireDocument = encodeWorkspaceDocument(document);
  if (
    document.type === 'code' &&
    isWorkspaceCodeDocumentContent(document.content)
  ) {
    return {
      content: document.content.source,
      mime: 'text/plain',
    };
  }

  if (typeof wireDocument.content === 'string') {
    return {
      content: wireDocument.content.endsWith('\n')
        ? wireDocument.content
        : `${wireDocument.content}\n`,
      mime: 'text/plain',
    };
  }

  return {
    content: jsonStringifyStable(wireDocument.content),
    mime: 'application/json',
  };
};

const parseJsonFile = <T>(
  file: WorkspaceSourceFile | undefined,
  path: string,
  issues: WorkspaceProjectionIssue[]
): T | undefined => {
  if (!file) {
    issues.push({
      code: 'WKS_PROJECTION_FILE_MISSING',
      path,
      message: 'Required workspace source file is missing.',
    });
    return undefined;
  }

  try {
    return JSON.parse(file.content) as T;
  } catch (cause) {
    issues.push({
      code: 'WKS_PROJECTION_JSON_INVALID',
      path,
      message: 'Workspace source file must contain valid JSON.',
      cause,
    });
    return undefined;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const createManifest = (snapshot: WorkspaceSnapshot): WorkspaceManifest => {
  const documents = Object.entries(snapshot.docsById).reduce<
    Record<WorkspaceDocumentId, WorkspaceDocumentManifestEntry>
  >((result, [documentId, document]) => {
    const { content: _content, ...metadata } = document;
    result[documentId] = {
      ...metadata,
      contentPath: documentContentPath(document),
      ...(document.type === 'code' &&
      isWorkspaceCodeDocumentContent(document.content)
        ? {
            codeContent: {
              language: document.content.language,
              ...(document.content.metadata
                ? { metadata: document.content.metadata }
                : {}),
            },
          }
        : {}),
    };
    return result;
  }, {});

  return {
    version: '1',
    workspace: {
      id: snapshot.id,
      ...(snapshot.name ? { name: snapshot.name } : {}),
      workspaceRev: snapshot.workspaceRev,
      routeRev: snapshot.routeRev,
      opSeq: snapshot.opSeq,
    },
    treeRootId: snapshot.treeRootId,
    treeById: snapshot.treeById,
    documents,
    ...(snapshot.activeDocumentId
      ? { activeDocumentId: snapshot.activeDocumentId }
      : {}),
    ...(snapshot.activeRouteNodeId
      ? { activeRouteNodeId: snapshot.activeRouteNodeId }
      : {}),
  };
};

export const projectWorkspaceToProdivixFiles = (
  snapshot: WorkspaceSnapshot
): WorkspaceProjectionWriteResult => {
  const validation = validateWorkspaceSnapshot(snapshot);
  if (!validation.valid) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_PROJECTION_INVALID_WORKSPACE',
          path: '/',
          message: 'Workspace snapshot must be valid before projection.',
          validationIssues: validation.issues,
        },
      ],
    };
  }

  const files: WorkspaceSourceFile[] = [
    {
      path: WORKSPACE_MANIFEST_PATH,
      content: jsonStringifyStable(createManifest(snapshot)),
      mime: 'application/json',
      role: 'workspace-manifest',
    },
    {
      path: ROUTE_MANIFEST_PATH,
      content: jsonStringifyStable(snapshot.routeManifest),
      mime: 'application/json',
      role: 'route-manifest',
    },
  ];

  Object.values(snapshot.docsById).forEach((document) => {
    files.push({
      path: documentContentPath(document),
      ...serializeDocumentContent(document),
      role: 'document',
      documentId: document.id,
    });
  });

  return {
    ok: true,
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
  };
};

export const readWorkspaceFromProdivixFiles = (
  files: WorkspaceSourceFile[]
): WorkspaceProjectionReadResult => {
  const issues: WorkspaceProjectionIssue[] = [];
  const filesByPath = createSourceFileMap(files);

  const manifest = parseJsonFile<WorkspaceManifest>(
    filesByPath.get(WORKSPACE_MANIFEST_PATH),
    WORKSPACE_MANIFEST_PATH,
    issues
  );
  const routeManifest = parseJsonFile<WorkspaceSnapshot['routeManifest']>(
    filesByPath.get(ROUTE_MANIFEST_PATH),
    ROUTE_MANIFEST_PATH,
    issues
  );

  if (!manifest || !routeManifest) return { ok: false, issues };

  if (
    manifest.version !== '1' ||
    !isRecord(manifest.workspace) ||
    !isRecord(manifest.documents)
  ) {
    return {
      ok: false,
      issues: [
        ...issues,
        {
          code: 'WKS_PROJECTION_MANIFEST_INVALID',
          path: WORKSPACE_MANIFEST_PATH,
          message: 'Workspace manifest does not match the projection format.',
        },
      ],
    };
  }

  const docsById = Object.entries(manifest.documents).reduce<
    WorkspaceSnapshot['docsById']
  >((result, [documentId, documentManifest]) => {
    const contentFile = filesByPath.get(documentManifest.contentPath);
    if (!contentFile) {
      issues.push({
        code: 'WKS_PROJECTION_DOCUMENT_MISSING',
        path: documentManifest.contentPath,
        message: 'Workspace document content file is missing.',
        documentId,
      });
      return result;
    }

    let content: unknown = contentFile.content;
    if (documentManifest.type === 'code') {
      if (!documentManifest.codeContent) {
        issues.push({
          code: 'WKS_PROJECTION_MANIFEST_INVALID',
          path: WORKSPACE_MANIFEST_PATH,
          message: 'Code document manifest entry must declare codeContent.',
          documentId,
        });
        return result;
      }
      content = {
        ...documentManifest.codeContent,
        source: contentFile.content,
      } satisfies WorkspaceCodeDocumentContent;
    } else if (contentFile.mime === 'application/json') {
      try {
        content = JSON.parse(contentFile.content);
      } catch (cause) {
        issues.push({
          code: 'WKS_PROJECTION_JSON_INVALID',
          path: contentFile.path,
          message: 'Workspace document content must contain valid JSON.',
          documentId,
          cause,
        });
        return result;
      }
    }

    const {
      contentPath: _contentPath,
      codeContent: _codeContent,
      ...metadata
    } = documentManifest;
    try {
      result[documentId] = decodeWorkspaceDocument(
        {
          ...metadata,
          id: documentId,
          content,
        },
        `/projection/documents/${documentId}`
      );
    } catch (cause) {
      issues.push({
        code: 'WKS_PROJECTION_INVALID_WORKSPACE',
        path: contentFile.path,
        message: 'Workspace document failed persistence decoding.',
        documentId,
        cause,
      });
    }
    return result;
  }, {});

  if (issues.length) return { ok: false, issues };

  const snapshot: WorkspaceSnapshot = {
    id: manifest.workspace.id,
    ...(manifest.workspace.name ? { name: manifest.workspace.name } : {}),
    workspaceRev: manifest.workspace.workspaceRev,
    routeRev: manifest.workspace.routeRev,
    opSeq: manifest.workspace.opSeq,
    treeRootId: manifest.treeRootId,
    treeById: manifest.treeById,
    docsById,
    routeManifest,
    ...(manifest.activeDocumentId
      ? { activeDocumentId: manifest.activeDocumentId }
      : {}),
    ...(manifest.activeRouteNodeId
      ? { activeRouteNodeId: manifest.activeRouteNodeId }
      : {}),
  };

  const validation = validateWorkspaceSnapshot(snapshot);
  if (!validation.valid) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_PROJECTION_INVALID_WORKSPACE',
          path: WORKSPACE_MANIFEST_PATH,
          message: 'Projected workspace snapshot failed VFS validation.',
          validationIssues: validation.issues,
        },
      ],
    };
  }

  return { ok: true, snapshot };
};
