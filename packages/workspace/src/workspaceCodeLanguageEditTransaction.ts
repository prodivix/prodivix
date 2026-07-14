import {
  resolveCodeSourceSpanOffsets,
  type CodeLanguageTextEdit,
} from '@prodivix/authoring';
import {
  createWorkspaceCodeSourceUpdateCommand,
  type WorkspaceCommandEnvelope,
  type WorkspaceTransactionEnvelope,
} from './workspaceCommand';
import { isWorkspaceCodeDocumentContent } from './workspaceCodeDocument';
import type { WorkspaceDocument, WorkspaceSnapshot } from './types';

export const WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES = Object.freeze({
  inputInvalid: 'WKS_CODE_LANGUAGE_EDIT_INPUT_INVALID',
  editsEmpty: 'WKS_CODE_LANGUAGE_EDIT_EDITS_EMPTY',
  artifactMissing: 'WKS_CODE_LANGUAGE_EDIT_ARTIFACT_MISSING',
  artifactTypeInvalid: 'WKS_CODE_LANGUAGE_EDIT_ARTIFACT_TYPE_INVALID',
  artifactRevisionMismatch: 'WKS_CODE_LANGUAGE_EDIT_ARTIFACT_REVISION_MISMATCH',
  spanArtifactMismatch: 'WKS_CODE_LANGUAGE_EDIT_SPAN_ARTIFACT_MISMATCH',
  spanInvalid: 'WKS_CODE_LANGUAGE_EDIT_SPAN_INVALID',
  spanOverlap: 'WKS_CODE_LANGUAGE_EDIT_SPAN_OVERLAP',
  unchanged: 'WKS_CODE_LANGUAGE_EDIT_UNCHANGED',
} as const);

export type WorkspaceCodeLanguageEditPlanIssueCode =
  (typeof WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES)[keyof typeof WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES];

export type WorkspaceCodeLanguageEditPlanIssue = Readonly<{
  code: WorkspaceCodeLanguageEditPlanIssueCode;
  path: string;
  message: string;
  artifactId?: string;
}>;

export type CreateWorkspaceCodeLanguageEditTransactionInput = Readonly<{
  workspace: WorkspaceSnapshot;
  transactionId: string;
  issuedAt: string;
  edits: readonly CodeLanguageTextEdit[];
  label?: string;
}>;

export type WorkspaceCodeLanguageEditTransactionPlan = Readonly<{
  documentIds: readonly string[];
  nextSources: Readonly<Record<string, string>>;
  transaction: WorkspaceTransactionEnvelope;
}>;

export type WorkspaceCodeLanguageEditTransactionPlanResult =
  | Readonly<{
      status: 'ready';
      plan: WorkspaceCodeLanguageEditTransactionPlan;
    }>
  | Readonly<{
      status: 'rejected';
      issues: readonly WorkspaceCodeLanguageEditPlanIssue[];
    }>;

type NormalizedCodeLanguageTextEdit = Readonly<{
  artifactId: string;
  document: WorkspaceDocument;
  from: number;
  to: number;
  newText: string;
  path: string;
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const escapeJsonPointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const isCanonicalRequiredText = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value === value.trim();

const compareIssues = (
  left: WorkspaceCodeLanguageEditPlanIssue,
  right: WorkspaceCodeLanguageEditPlanIssue
): number =>
  compareText(left.path, right.path) ||
  compareText(left.code, right.code) ||
  compareText(left.artifactId ?? '', right.artifactId ?? '') ||
  compareText(left.message, right.message);

const reject = (
  issues: readonly WorkspaceCodeLanguageEditPlanIssue[]
): WorkspaceCodeLanguageEditTransactionPlanResult => ({
  status: 'rejected',
  issues: [...issues].sort(compareIssues),
});

const editPath = (edit: CodeLanguageTextEdit): string => {
  const { sourceSpan } = edit;
  return `/edits/by-artifact/${escapeJsonPointerSegment(edit.artifactId)}/${sourceSpan.startLine}:${sourceSpan.startColumn}-${sourceSpan.endLine}:${sourceSpan.endColumn}`;
};

const compareNormalizedEdits = (
  left: NormalizedCodeLanguageTextEdit,
  right: NormalizedCodeLanguageTextEdit
): number =>
  compareText(left.artifactId, right.artifactId) ||
  left.from - right.from ||
  left.to - right.to ||
  compareText(left.newText, right.newText);

const normalizeEdits = (
  workspace: WorkspaceSnapshot,
  edits: readonly CodeLanguageTextEdit[]
):
  | Readonly<{ ok: true; edits: readonly NormalizedCodeLanguageTextEdit[] }>
  | Readonly<{
      ok: false;
      issues: readonly WorkspaceCodeLanguageEditPlanIssue[];
    }> => {
  const issues: WorkspaceCodeLanguageEditPlanIssue[] = [];
  const normalized: NormalizedCodeLanguageTextEdit[] = [];

  for (const edit of edits) {
    const path = editPath(edit);
    const artifactId = edit.artifactId;
    if (!isCanonicalRequiredText(artifactId)) {
      issues.push({
        code: WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES.inputInvalid,
        path: `${path}/artifactId`,
        message: 'Code language edit artifactId must be non-empty and trimmed.',
      });
      continue;
    }
    if (edit.sourceSpan.artifactId !== artifactId) {
      issues.push({
        code: WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES.spanArtifactMismatch,
        path: `${path}/sourceSpan/artifactId`,
        message:
          'Code language edit and SourceSpan must address the same artifact.',
        artifactId,
      });
      continue;
    }

    const document = workspace.docsById[artifactId];
    if (!document) {
      issues.push({
        code: WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES.artifactMissing,
        path,
        message: `Code artifact "${artifactId}" does not exist in the Workspace snapshot.`,
        artifactId,
      });
      continue;
    }
    if (
      document.type !== 'code' ||
      !isWorkspaceCodeDocumentContent(document.content)
    ) {
      issues.push({
        code: WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES.artifactTypeInvalid,
        path,
        message: `Workspace document "${artifactId}" is not a canonical code artifact.`,
        artifactId,
      });
      continue;
    }
    if (edit.expectedRevision !== String(document.contentRev)) {
      issues.push({
        code: WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES.artifactRevisionMismatch,
        path: `${path}/expectedRevision`,
        message: `Code language edit revision "${edit.expectedRevision}" does not match canonical artifact revision "${document.contentRev}".`,
        artifactId,
      });
      continue;
    }

    const offsets = resolveCodeSourceSpanOffsets(
      document.content.source,
      edit.sourceSpan
    );
    if (!offsets) {
      issues.push({
        code: WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES.spanInvalid,
        path: `${path}/sourceSpan`,
        message:
          'Code language edit SourceSpan must be an in-bounds one-based range.',
        artifactId,
      });
      continue;
    }
    if (
      document.content.source.slice(offsets.from, offsets.to) === edit.newText
    ) {
      issues.push({
        code: WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES.unchanged,
        path,
        message: 'Code language edit must change the canonical source.',
        artifactId,
      });
      continue;
    }

    normalized.push({
      artifactId,
      document,
      from: offsets.from,
      to: offsets.to,
      newText: edit.newText,
      path,
    });
  }

  if (issues.length > 0) return { ok: false, issues };

  normalized.sort(compareNormalizedEdits);
  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1]!;
    const current = normalized[index]!;
    if (previous.artifactId !== current.artifactId) continue;
    if (current.from >= previous.to && current.from !== previous.from) {
      continue;
    }
    issues.push({
      code: WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES.spanOverlap,
      path: current.path,
      message: `Code language edits for artifact "${current.artifactId}" must not overlap.`,
      artifactId: current.artifactId,
    });
  }

  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, edits: normalized };
};

const applyNormalizedEdits = (
  source: string,
  edits: readonly NormalizedCodeLanguageTextEdit[]
): string =>
  [...edits]
    .sort((left, right) => right.from - left.from || right.to - left.to)
    .reduce(
      (current, edit) =>
        `${current.slice(0, edit.from)}${edit.newText}${current.slice(edit.to)}`,
      source
    );

/**
 * Converts revision-bound Language Provider text edits into one canonical,
 * reversible Workspace transaction. SourceSpan validation happens before any
 * command is created, so consumers can submit the resulting transaction to
 * History, Durable Outbox, and Atomic Commit without a second edit path.
 */
export const createWorkspaceCodeLanguageEditTransactionPlan = (
  input: CreateWorkspaceCodeLanguageEditTransactionInput
): WorkspaceCodeLanguageEditTransactionPlanResult => {
  const envelopeIssues: WorkspaceCodeLanguageEditPlanIssue[] = [];
  for (const [path, value, label] of [
    ['/transactionId', input.transactionId, 'Transaction id'],
    ['/issuedAt', input.issuedAt, 'Issued-at value'],
  ] as const) {
    if (isCanonicalRequiredText(value)) continue;
    envelopeIssues.push({
      code: WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES.inputInvalid,
      path,
      message: `${label} must be non-empty and trimmed.`,
    });
  }
  if (input.label !== undefined && !isCanonicalRequiredText(input.label)) {
    envelopeIssues.push({
      code: WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES.inputInvalid,
      path: '/label',
      message: 'Transaction label must be non-empty and trimmed when present.',
    });
  }
  if (input.edits.length === 0) {
    envelopeIssues.push({
      code: WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES.editsEmpty,
      path: '/edits',
      message: 'A code language edit transaction requires at least one edit.',
    });
  }
  if (envelopeIssues.length > 0) return reject(envelopeIssues);

  const normalized = normalizeEdits(input.workspace, input.edits);
  if (!normalized.ok) return reject(normalized.issues);

  const editsByArtifact = new Map<string, NormalizedCodeLanguageTextEdit[]>();
  for (const edit of normalized.edits) {
    const artifactEdits = editsByArtifact.get(edit.artifactId) ?? [];
    artifactEdits.push(edit);
    editsByArtifact.set(edit.artifactId, artifactEdits);
  }

  const documentIds = [...editsByArtifact.keys()].sort(compareText);
  const nextSources: Record<string, string> = {};
  const commands: WorkspaceCommandEnvelope[] = [];
  const unchangedIssues: WorkspaceCodeLanguageEditPlanIssue[] = [];

  documentIds.forEach((documentId, index) => {
    const artifactEdits = editsByArtifact.get(documentId)!;
    const document = artifactEdits[0]!.document;
    const content = document.content;
    if (!isWorkspaceCodeDocumentContent(content)) return;
    const nextSource = applyNormalizedEdits(content.source, artifactEdits);
    const command = createWorkspaceCodeSourceUpdateCommand({
      workspaceId: input.workspace.id,
      document,
      source: nextSource,
      commandId: `${input.transactionId}:code-edit:${index}`,
      issuedAt: input.issuedAt,
      label: `Apply language edits to ${document.path}`,
    });
    if (!command) {
      unchangedIssues.push({
        code: WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES.unchanged,
        path: `/docsById/${escapeJsonPointerSegment(documentId)}/content/source`,
        message: `Combined code language edits must change artifact "${documentId}".`,
        artifactId: documentId,
      });
      return;
    }
    nextSources[documentId] = nextSource;
    commands.push(command);
  });

  if (unchangedIssues.length > 0) return reject(unchangedIssues);

  const label =
    input.label ??
    (documentIds.length === 1
      ? 'Apply code language edits'
      : `Apply code language edits to ${documentIds.length} artifacts`);
  return {
    status: 'ready',
    plan: {
      documentIds,
      nextSources,
      transaction: {
        id: input.transactionId,
        workspaceId: input.workspace.id,
        issuedAt: input.issuedAt,
        label,
        commands,
      },
    },
  };
};
