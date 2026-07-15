import {
  createCodeArtifactLifecycleManifest,
  createSemanticId,
  getCodeReferenceSemanticRole,
  writeCodeArtifactLifecycleManifest,
  type CodeReference,
  type CodeSlotBinding,
  type CodeSlotProvider,
} from '@prodivix/authoring';
import {
  createWorkspaceCodeContentUpdateCommand,
  type WorkspaceCommandEnvelope,
  type WorkspaceTransactionEnvelope,
} from '../workspaceCommand';
import { createWorkspaceDocumentAtPathCommand } from '../workspaceDocumentFactory';
import {
  createWorkspaceProjectConfigValueUpdateCommand,
  isWorkspaceProjectConfigDocumentContent,
} from '../workspaceResourceDocument';
import type { WorkspaceDocument, WorkspaceSnapshot } from '../types';
import { isWorkspaceCodeDocumentContent } from '../workspaceCodeDocument';

export const WORKSPACE_EXTERNAL_LIBRARIES_CONFIG_PATH =
  '/config/external-libraries.json' as const;

export type WorkspaceExternalAdapterEntry = Readonly<{
  libraryId: string;
  slotId: string;
  binding?: CodeSlotBinding;
}>;

export type WorkspaceExternalAdapterConfigIssue = Readonly<{
  path: string;
  message: string;
  documentId?: string;
}>;

export type WorkspaceExternalAdapterConfigReadResult =
  | Readonly<{
      status: 'ready';
      document: WorkspaceDocument | null;
      entries: readonly WorkspaceExternalAdapterEntry[];
    }>
  | Readonly<{
      status: 'invalid';
      issues: readonly WorkspaceExternalAdapterConfigIssue[];
    }>;

export type WorkspaceExternalAdapterBindingPlanIssueCode =
  | 'WKS_EXTERNAL_ADAPTER_CONFIG_MISSING'
  | 'WKS_EXTERNAL_ADAPTER_CONFIG_INVALID'
  | 'WKS_EXTERNAL_ADAPTER_LIBRARY_MISSING'
  | 'WKS_EXTERNAL_ADAPTER_ARTIFACT_MISSING'
  | 'WKS_EXTERNAL_ADAPTER_ARTIFACT_UNSUPPORTED';

export type WorkspaceExternalAdapterBindingPlanIssue = Readonly<{
  code: WorkspaceExternalAdapterBindingPlanIssueCode;
  path: string;
  message: string;
}>;

export type WorkspaceExternalAdapterBindingTransactionPlanResult =
  | Readonly<{ status: 'ready'; transaction: WorkspaceTransactionEnvelope }>
  | Readonly<{ status: 'unchanged' }>
  | Readonly<{
      status: 'rejected';
      issues: readonly WorkspaceExternalAdapterBindingPlanIssue[];
    }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizePath = (path: string): string =>
  `/${path.trim().replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+/g, '/')}`.replace(
    /\/$/,
    ''
  );

const escapePointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const isPositivePosition = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

const decodeSourceSpan = (
  value: unknown
): NonNullable<CodeReference['sourceSpan']> | undefined => {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.artifactId !== 'string' ||
    !value.artifactId.trim() ||
    !isPositivePosition(value.startLine) ||
    !isPositivePosition(value.startColumn) ||
    !isPositivePosition(value.endLine) ||
    !isPositivePosition(value.endColumn)
  ) {
    return undefined;
  }
  return {
    artifactId: value.artifactId,
    startLine: value.startLine,
    startColumn: value.startColumn,
    endLine: value.endLine,
    endColumn: value.endColumn,
  };
};

export const decodeWorkspaceExternalAdapterBinding = (
  libraryId: string,
  value: unknown
): CodeSlotBinding | null => {
  if (!isRecord(value)) return null;
  const slotId = createWorkspaceExternalAdapterCodeSlotId(
    libraryId.trim().toLowerCase()
  );
  const reference = decodeCodeReference(value.reference);
  return value.slotId === slotId && reference
    ? Object.freeze({ slotId, reference: Object.freeze(reference) })
    : null;
};

const decodeCodeReference = (value: unknown): CodeReference | null => {
  if (
    !isRecord(value) ||
    typeof value.artifactId !== 'string' ||
    !value.artifactId.trim()
  ) {
    return null;
  }
  if (
    (value.exportName !== undefined && typeof value.exportName !== 'string') ||
    (value.symbolId !== undefined && typeof value.symbolId !== 'string')
  ) {
    return null;
  }
  const sourceSpan =
    value.sourceSpan === undefined
      ? undefined
      : decodeSourceSpan(value.sourceSpan);
  if (value.sourceSpan !== undefined && !sourceSpan) return null;
  return {
    artifactId: value.artifactId,
    ...(typeof value.exportName === 'string'
      ? { exportName: value.exportName }
      : {}),
    ...(typeof value.symbolId === 'string' ? { symbolId: value.symbolId } : {}),
    ...(sourceSpan ? { sourceSpan } : {}),
  };
};

export const createWorkspaceExternalAdapterCodeSlotId = (
  libraryId: string
): string => createSemanticId('external-library-adapter-slot', libraryId);

export const createWorkspaceExternalAdapterCodeReferenceId = (
  workspaceId: string,
  libraryId: string,
  reference: CodeReference
): string =>
  createSemanticId(
    'external-library-adapter-reference',
    workspaceId,
    libraryId,
    getCodeReferenceSemanticRole(reference)
  );

const findConfigDocument = (
  snapshot: WorkspaceSnapshot
): WorkspaceDocument | null =>
  Object.values(snapshot.docsById).find(
    (document) =>
      document.type === 'project-config' &&
      normalizePath(document.path) === WORKSPACE_EXTERNAL_LIBRARIES_CONFIG_PATH
  ) ?? null;

export const readWorkspaceExternalAdapterConfig = (
  snapshot: WorkspaceSnapshot
): WorkspaceExternalAdapterConfigReadResult => {
  const document = findConfigDocument(snapshot);
  if (!document) {
    return Object.freeze({
      status: 'ready',
      document: null,
      entries: Object.freeze([]),
    });
  }
  if (!isWorkspaceProjectConfigDocumentContent(document.content)) {
    return Object.freeze({
      status: 'invalid',
      issues: Object.freeze([
        Object.freeze({
          path: `/docsById/${escapePointerSegment(document.id)}/content`,
          message: 'External library config must be a project-config document.',
          documentId: document.id,
        }),
      ]),
    });
  }
  const value = document.content.value;
  if (!isRecord(value) || !Array.isArray(value.activeLibraries)) {
    return Object.freeze({
      status: 'ready',
      document,
      entries: Object.freeze([]),
    });
  }
  const entries: WorkspaceExternalAdapterEntry[] = [];
  const issues: WorkspaceExternalAdapterConfigIssue[] = [];
  const seen = new Set<string>();
  value.activeLibraries.forEach((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.id !== 'string') return;
    const libraryId = candidate.id.trim().toLowerCase();
    if (!libraryId) return;
    const basePath = `/docsById/${escapePointerSegment(document.id)}/content/value/activeLibraries/${index}`;
    if (seen.has(libraryId)) {
      issues.push({
        path: `${basePath}/id`,
        message: `External library id is duplicated: ${libraryId}`,
        documentId: document.id,
      });
      return;
    }
    seen.add(libraryId);
    const slotId = createWorkspaceExternalAdapterCodeSlotId(libraryId);
    let binding: CodeSlotBinding | undefined;
    if (candidate.adapter !== undefined) {
      if (!isRecord(candidate.adapter)) {
        issues.push({
          path: `${basePath}/adapter`,
          message: 'External adapter binding must be an object.',
          documentId: document.id,
        });
      } else {
        const decodedBinding = decodeWorkspaceExternalAdapterBinding(
          libraryId,
          candidate.adapter
        );
        if (!decodedBinding) {
          issues.push({
            path: `${basePath}/adapter`,
            message:
              'External adapter binding must use the canonical slot id and a valid CodeReference.',
            documentId: document.id,
          });
        } else {
          binding = decodedBinding;
        }
      }
    }
    entries.push(
      Object.freeze({
        libraryId,
        slotId,
        ...(binding ? { binding } : {}),
      })
    );
  });
  if (issues.length > 0) {
    return Object.freeze({
      status: 'invalid',
      issues: Object.freeze(issues.map((issue) => Object.freeze(issue))),
    });
  }
  return Object.freeze({
    status: 'ready',
    document,
    entries: Object.freeze(entries),
  });
};

/** Creates one provider per library so the registry retains domain ownership. */
export const createWorkspaceExternalAdapterCodeSlotProvider = (input: {
  workspaceId: string;
  configDocumentId: string;
  entry: WorkspaceExternalAdapterEntry;
}): CodeSlotProvider => {
  const ownerRef = Object.freeze({
    kind: 'document' as const,
    workspaceId: input.workspaceId,
    documentId: input.configDocumentId,
  });
  const slot = Object.freeze({
    id: input.entry.slotId,
    ownerRef,
    kind: 'external-adapter' as const,
    inputTypeRef: 'ExternalLibraryAdapterContext',
    outputTypeRef: 'ExternalLibraryAdapter',
    capabilityIds: [
      'external-library-adapter',
      `external-library:${input.entry.libraryId}`,
    ],
    defaultPlacement: [
      'inspector' as const,
      'code-editor' as const,
      'issues-panel' as const,
    ],
  });
  const projection = input.entry.binding
    ? Object.freeze({
        binding: input.entry.binding,
        ownerRef,
        semanticReferenceId: createWorkspaceExternalAdapterCodeReferenceId(
          input.workspaceId,
          input.entry.libraryId,
          input.entry.binding.reference
        ),
      })
    : null;
  return Object.freeze({
    id: `core.external-library.code-slots.${input.entry.libraryId}`,
    source: Object.freeze({
      kind: 'external-library' as const,
      libraryId: input.entry.libraryId,
    }),
    listSlots(context) {
      return !context.targetRef ||
        (context.targetRef.kind === 'document' &&
          context.targetRef.documentId === input.configDocumentId)
        ? [slot]
        : [];
    },
    getSlot(id) {
      return id === slot.id ? slot : null;
    },
    listBindingProjections(context) {
      if (!projection) return [];
      return !context.artifactId ||
        context.artifactId === projection.binding.reference.artifactId
        ? [projection]
        : [];
    },
    getBindingProjection(id) {
      return projection?.binding.slotId === id ? projection : null;
    },
  });
};

const updateBindingValue = (input: {
  value: unknown;
  libraryId: string;
  reference: CodeReference | null;
}):
  | { status: 'ready'; value: Record<string, unknown> }
  | { status: 'missing' } => {
  if (!isRecord(input.value) || !Array.isArray(input.value.activeLibraries)) {
    return { status: 'missing' };
  }
  let found = false;
  const activeLibraries = input.value.activeLibraries.map((candidate) => {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== 'string' ||
      candidate.id.trim().toLowerCase() !== input.libraryId
    ) {
      return candidate;
    }
    found = true;
    const next = { ...candidate };
    if (input.reference) {
      next.adapter = {
        slotId: createWorkspaceExternalAdapterCodeSlotId(input.libraryId),
        reference: { ...input.reference },
      };
    } else {
      delete next.adapter;
    }
    return next;
  });
  return found
    ? { status: 'ready', value: { ...input.value, activeLibraries } }
    : { status: 'missing' };
};

const rejected = (
  issue: WorkspaceExternalAdapterBindingPlanIssue
): WorkspaceExternalAdapterBindingTransactionPlanResult =>
  Object.freeze({ status: 'rejected', issues: Object.freeze([issue]) });

/** Atomically updates the domain-owned adapter binding and artifact lifecycle. */
export const createWorkspaceExternalAdapterBindingTransactionPlan = (input: {
  workspace: WorkspaceSnapshot;
  libraryId: string;
  reference: CodeReference | null;
  transactionId: string;
  issuedAt: string;
}): WorkspaceExternalAdapterBindingTransactionPlanResult => {
  const libraryId = input.libraryId.trim().toLowerCase();
  const config = readWorkspaceExternalAdapterConfig(input.workspace);
  if (config.status === 'invalid') {
    return rejected({
      code: 'WKS_EXTERNAL_ADAPTER_CONFIG_INVALID',
      path: config.issues[0]?.path ?? '/config/external-libraries',
      message:
        config.issues[0]?.message ?? 'External library config is invalid.',
    });
  }
  if (
    !config.document ||
    !isWorkspaceProjectConfigDocumentContent(config.document.content)
  ) {
    return rejected({
      code: 'WKS_EXTERNAL_ADAPTER_CONFIG_MISSING',
      path: WORKSPACE_EXTERNAL_LIBRARIES_CONFIG_PATH,
      message: 'External library config does not exist.',
    });
  }
  if (!config.entries.some((entry) => entry.libraryId === libraryId)) {
    return rejected({
      code: 'WKS_EXTERNAL_ADAPTER_LIBRARY_MISSING',
      path: WORKSPACE_EXTERNAL_LIBRARIES_CONFIG_PATH,
      message: `External library is not active: ${libraryId}`,
    });
  }
  const commands: WorkspaceCommandEnvelope[] = [];
  const updated = updateBindingValue({
    value: config.document.content.value,
    libraryId,
    reference: input.reference,
  });
  if (updated.status === 'missing') {
    return rejected({
      code: 'WKS_EXTERNAL_ADAPTER_LIBRARY_MISSING',
      path: WORKSPACE_EXTERNAL_LIBRARIES_CONFIG_PATH,
      message: `External library is not active: ${libraryId}`,
    });
  }
  const configCommand = createWorkspaceProjectConfigValueUpdateCommand({
    commandId: `${input.transactionId}:config`,
    document: config.document,
    issuedAt: input.issuedAt,
    label: `Update ${libraryId} adapter binding`,
    value: updated.value,
    workspaceId: input.workspace.id,
  });
  if (configCommand) commands.push(configCommand);

  if (input.reference) {
    const artifact = input.workspace.docsById[input.reference.artifactId];
    if (
      !artifact ||
      artifact.type !== 'code' ||
      !isWorkspaceCodeDocumentContent(artifact.content)
    ) {
      return rejected({
        code: 'WKS_EXTERNAL_ADAPTER_ARTIFACT_MISSING',
        path: `/docsById/${escapePointerSegment(input.reference.artifactId)}`,
        message: 'External adapter CodeArtifact does not exist.',
      });
    }
    if (
      artifact.content.language !== 'ts' &&
      artifact.content.language !== 'js'
    ) {
      return rejected({
        code: 'WKS_EXTERNAL_ADAPTER_ARTIFACT_UNSUPPORTED',
        path: `/docsById/${escapePointerSegment(artifact.id)}/content/language`,
        message:
          'External adapter artifacts must use TypeScript or JavaScript.',
      });
    }
    const slotId = createWorkspaceExternalAdapterCodeSlotId(libraryId);
    const metadata = writeCodeArtifactLifecycleManifest(
      artifact.content.metadata,
      createCodeArtifactLifecycleManifest({
        slotId,
        slotKind: 'external-adapter',
      })
    );
    const artifactCommand = createWorkspaceCodeContentUpdateCommand({
      workspaceId: input.workspace.id,
      document: artifact,
      content: {
        ...artifact.content,
        ...(metadata ? { metadata } : { metadata: undefined }),
      },
      commandId: `${input.transactionId}:artifact`,
      issuedAt: input.issuedAt,
      label: `Bind ${artifact.path} to ${libraryId}`,
    });
    if (artifactCommand) commands.push(artifactCommand);
  }
  if (commands.length === 0) return Object.freeze({ status: 'unchanged' });
  return Object.freeze({
    status: 'ready',
    transaction: Object.freeze({
      id: input.transactionId,
      workspaceId: input.workspace.id,
      issuedAt: input.issuedAt,
      label: input.reference
        ? `Bind external adapter for ${libraryId}`
        : `Detach external adapter for ${libraryId}`,
      commands,
    }),
  });
};

/** Creates and binds a new adapter artifact as one atomic Workspace transaction. */
export const createWorkspaceExternalAdapterArtifactTransactionPlan = (input: {
  workspace: WorkspaceSnapshot;
  libraryId: string;
  artifactId: string;
  path: string;
  language: 'ts' | 'js';
  source: string;
  transactionId: string;
  issuedAt: string;
}): WorkspaceExternalAdapterBindingTransactionPlanResult => {
  const libraryId = input.libraryId.trim().toLowerCase();
  const config = readWorkspaceExternalAdapterConfig(input.workspace);
  if (config.status === 'invalid') {
    return rejected({
      code: 'WKS_EXTERNAL_ADAPTER_CONFIG_INVALID',
      path: config.issues[0]?.path ?? '/config/external-libraries',
      message:
        config.issues[0]?.message ?? 'External library config is invalid.',
    });
  }
  if (
    !config.document ||
    !isWorkspaceProjectConfigDocumentContent(config.document.content)
  ) {
    return rejected({
      code: 'WKS_EXTERNAL_ADAPTER_CONFIG_MISSING',
      path: WORKSPACE_EXTERNAL_LIBRARIES_CONFIG_PATH,
      message: 'External library config does not exist.',
    });
  }
  if (!config.entries.some((entry) => entry.libraryId === libraryId)) {
    return rejected({
      code: 'WKS_EXTERNAL_ADAPTER_LIBRARY_MISSING',
      path: WORKSPACE_EXTERNAL_LIBRARIES_CONFIG_PATH,
      message: `External library is not active: ${libraryId}`,
    });
  }
  const slotId = createWorkspaceExternalAdapterCodeSlotId(libraryId);
  const reference: CodeReference = {
    artifactId: input.artifactId,
    exportName: 'default',
  };
  const updated = updateBindingValue({
    value: config.document.content.value,
    libraryId,
    reference,
  });
  if (updated.status === 'missing') {
    return rejected({
      code: 'WKS_EXTERNAL_ADAPTER_LIBRARY_MISSING',
      path: WORKSPACE_EXTERNAL_LIBRARIES_CONFIG_PATH,
      message: `External library is not active: ${libraryId}`,
    });
  }
  let createCommand: WorkspaceCommandEnvelope;
  try {
    createCommand = createWorkspaceDocumentAtPathCommand({
      workspace: input.workspace,
      document: {
        id: input.artifactId,
        type: 'code',
        name: input.path.split('/').at(-1),
        path: input.path,
        contentRev: 1,
        metaRev: 1,
        content: {
          language: input.language,
          source: input.source,
          metadata: writeCodeArtifactLifecycleManifest(
            undefined,
            createCodeArtifactLifecycleManifest({
              slotId,
              slotKind: 'external-adapter',
            })
          ),
        },
      },
      commandId: `${input.transactionId}:artifact-create`,
      issuedAt: input.issuedAt,
      label: `Create ${libraryId} adapter`,
    });
  } catch (error) {
    return rejected({
      code: 'WKS_EXTERNAL_ADAPTER_ARTIFACT_UNSUPPORTED',
      path: '/artifact',
      message:
        error instanceof Error
          ? error.message
          : 'External adapter artifact could not be created.',
    });
  }
  const configCommand = createWorkspaceProjectConfigValueUpdateCommand({
    commandId: `${input.transactionId}:config`,
    document: config.document,
    issuedAt: input.issuedAt,
    label: `Bind ${libraryId} adapter`,
    value: updated.value,
    workspaceId: input.workspace.id,
  });
  if (!configCommand) {
    return rejected({
      code: 'WKS_EXTERNAL_ADAPTER_CONFIG_INVALID',
      path: WORKSPACE_EXTERNAL_LIBRARIES_CONFIG_PATH,
      message: 'External library config could not be updated.',
    });
  }
  return Object.freeze({
    status: 'ready',
    transaction: Object.freeze({
      id: input.transactionId,
      workspaceId: input.workspace.id,
      issuedAt: input.issuedAt,
      label: `Create external adapter for ${libraryId}`,
      commands: [createCommand, configCommand],
    }),
  });
};
