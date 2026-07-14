import {
  validateAnimationDefinition,
  type AnimationDefinition,
  type AnimationValidationIssue,
} from '@prodivix/animation';
import type {
  WorkspaceCommandEnvelope,
  WorkspacePatchOperation,
} from './workspaceCommand';
import { isWorkspacePirDocumentType } from './component/workspacePirDocument';
import type {
  WorkspaceDocument,
  WorkspaceSnapshot,
  WorkspaceValidationIssue,
} from './types';

export type WorkspaceAnimationDocument = WorkspaceDocument &
  Readonly<{
    type: 'pir-animation';
    content: AnimationDefinition;
  }>;

export type WorkspaceAnimationReadIssue = Readonly<{
  stage: 'decode' | 'target';
  code: string;
  path: string;
  message: string;
}>;

export type WorkspaceAnimationReadResult =
  | Readonly<{
      status: 'unsupported-document-type';
      document: WorkspaceDocument;
    }>
  | Readonly<{
      status: 'invalid';
      document: WorkspaceDocument;
      issues: readonly WorkspaceAnimationReadIssue[];
    }>
  | Readonly<{
      status: 'valid';
      document: WorkspaceAnimationDocument;
      decodedContent: AnimationDefinition;
    }>;

export type CreateWorkspaceAnimationDocumentUpdateCommandInput = Readonly<{
  workspace: WorkspaceSnapshot;
  documentId: string;
  after: AnimationDefinition;
  commandId: string;
  issuedAt?: string;
  mergeKey?: string;
  label?: string;
}>;

const escapePointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const mapAnimationIssue = (
  issue: AnimationValidationIssue
): WorkspaceAnimationReadIssue => ({
  stage: 'decode',
  code: issue.code,
  path: issue.path,
  message: issue.message,
});

const validateTarget = (
  snapshot: WorkspaceSnapshot,
  definition: AnimationDefinition
): WorkspaceAnimationReadIssue[] => {
  const targetDocumentId = definition.target.documentId;
  const target = snapshot.docsById[targetDocumentId];
  if (target && isWorkspacePirDocumentType(target.type)) return [];
  return [
    {
      stage: 'target',
      code: 'WKS_ANIMATION_TARGET_INVALID',
      path: '/target/documentId',
      message: `Animation target "${targetDocumentId}" must reference a canonical PIR document.`,
    },
  ];
};

export const isCanonicalWorkspaceAnimationDocumentContent = (
  content: unknown
): content is AnimationDefinition => validateAnimationDefinition(content).valid;

export const decodeWorkspaceAnimationDocument = (
  document: WorkspaceDocument,
  snapshot?: WorkspaceSnapshot
): WorkspaceAnimationReadResult => {
  if (document.type !== 'pir-animation') {
    return { status: 'unsupported-document-type', document };
  }
  const validation = validateAnimationDefinition(document.content);
  if (!validation.valid) {
    return {
      status: 'invalid',
      document,
      issues: validation.issues.map(mapAnimationIssue),
    };
  }
  const targetIssues = snapshot
    ? validateTarget(snapshot, validation.definition)
    : [];
  if (targetIssues.length > 0) {
    return { status: 'invalid', document, issues: targetIssues };
  }
  const typedDocument = Object.freeze({
    ...document,
    content: validation.definition,
  }) as WorkspaceAnimationDocument;
  return {
    status: 'valid',
    document: typedDocument,
    decodedContent: validation.definition,
  };
};

export const isWorkspaceAnimationDocument = (
  document: WorkspaceDocument
): document is WorkspaceAnimationDocument =>
  decodeWorkspaceAnimationDocument(document).status === 'valid';

export const selectWorkspaceAnimationDocument = (
  snapshot: WorkspaceSnapshot | undefined,
  documentId: string | undefined
): WorkspaceAnimationReadResult | undefined => {
  if (!snapshot || !documentId) return undefined;
  const document = snapshot.docsById[documentId];
  return document
    ? decodeWorkspaceAnimationDocument(document, snapshot)
    : undefined;
};

export const selectWorkspaceAnimationDocumentResults = (
  snapshot: WorkspaceSnapshot
): readonly WorkspaceAnimationReadResult[] =>
  Object.values(snapshot.docsById)
    .filter((document) => document.type === 'pir-animation')
    .sort((left, right) =>
      left.path === right.path
        ? left.id.localeCompare(right.id)
        : left.path.localeCompare(right.path)
    )
    .map((document) => decodeWorkspaceAnimationDocument(document, snapshot));

const valuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const appendPatch = (
  forwardOps: WorkspacePatchOperation[],
  reverseOps: WorkspacePatchOperation[],
  path: string,
  before: unknown,
  after: unknown
): void => {
  if (valuesEqual(before, after)) return;
  if (before === undefined) {
    forwardOps.push({ op: 'add', path, value: after });
    reverseOps.unshift({ op: 'remove', path });
    return;
  }
  if (after === undefined) {
    forwardOps.push({ op: 'remove', path });
    reverseOps.unshift({ op: 'add', path, value: before });
    return;
  }
  forwardOps.push({ op: 'replace', path, value: after });
  reverseOps.unshift({ op: 'replace', path, value: before });
};

/** Builds a reversible command for one canonical standalone Animation document. */
export const createWorkspaceAnimationDocumentUpdateCommand = (
  input: CreateWorkspaceAnimationDocumentUpdateCommandInput
): WorkspaceCommandEnvelope | null => {
  const current = selectWorkspaceAnimationDocument(
    input.workspace,
    input.documentId
  );
  if (current?.status !== 'valid') return null;
  const afterValidation = validateAnimationDefinition(input.after);
  if (!afterValidation.valid) return null;
  if (validateTarget(input.workspace, afterValidation.definition).length > 0) {
    return null;
  }

  const before = current.decodedContent;
  const after = afterValidation.definition;
  const forwardOps: WorkspacePatchOperation[] = [];
  const reverseOps: WorkspacePatchOperation[] = [];
  appendPatch(forwardOps, reverseOps, '/target', before.target, after.target);
  appendPatch(
    forwardOps,
    reverseOps,
    '/timelines',
    before.timelines,
    after.timelines
  );
  appendPatch(
    forwardOps,
    reverseOps,
    '/svgFilters',
    before.svgFilters,
    after.svgFilters
  );
  appendPatch(
    forwardOps,
    reverseOps,
    '/x-animationEditor',
    before['x-animationEditor'],
    after['x-animationEditor']
  );
  if (forwardOps.length === 0) return null;

  return {
    id: input.commandId,
    namespace: 'core.animation',
    type: 'definition.update',
    version: '1.0',
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    target: {
      workspaceId: input.workspace.id,
      documentId: current.document.id,
    },
    domainHint: 'animation',
    forwardOps,
    reverseOps,
    ...(input.mergeKey ? { mergeKey: input.mergeKey } : {}),
    ...(input.label ? { label: input.label } : {}),
  };
};

export const validateWorkspaceAnimationTargets = (
  snapshot: Pick<WorkspaceSnapshot, 'docsById'>
): WorkspaceValidationIssue[] =>
  Object.values(snapshot.docsById).flatMap((document) => {
    if (document.type !== 'pir-animation') return [];
    const validation = validateAnimationDefinition(document.content);
    if (!validation.valid) return [];
    const targetDocumentId = validation.definition.target.documentId;
    const target = snapshot.docsById[targetDocumentId];
    if (target && isWorkspacePirDocumentType(target.type)) return [];
    return [
      {
        code: 'WKS_DOCUMENT_CONTENT_INVALID' as const,
        path: `/docsById/${escapePointerSegment(document.id)}/content/target/documentId`,
        message: `Animation target "${targetDocumentId}" must reference a canonical PIR document.`,
        documentId: document.id,
      },
    ];
  });
