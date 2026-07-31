import {
  validateAgentPolicy,
  type AgentPolicy,
  type AgentPolicyDecodeIssue,
} from '@prodivix/ai';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import type {
  WorkspaceCommandEnvelope,
  WorkspacePatchOperation,
  WorkspaceTransactionEnvelope,
} from './workspaceCommand';
import { createWorkspaceDocumentAtPathCommand } from './workspaceDocumentFactory';
import type { WorkspaceDocument, WorkspaceSnapshot } from './types';

export type WorkspaceAgentPolicyDocument = WorkspaceDocument &
  Readonly<{
    type: 'agent-policy';
    content: AgentPolicy;
  }>;

export type WorkspaceAgentPolicyReadIssue =
  | AgentPolicyDecodeIssue
  | Readonly<{
      code: 'WKS_AGENT_POLICY_ID_MISMATCH';
      path: '/id';
      message: string;
    }>;

export type WorkspaceAgentPolicyReadResult =
  | Readonly<{
      status: 'unsupported-document-type';
      document: WorkspaceDocument;
    }>
  | Readonly<{
      status: 'invalid';
      document: WorkspaceDocument;
      issues: readonly WorkspaceAgentPolicyReadIssue[];
    }>
  | Readonly<{
      status: 'valid';
      document: WorkspaceAgentPolicyDocument;
      decodedContent: AgentPolicy;
    }>;

export type CreateWorkspaceAgentPolicyDocumentInput = Readonly<{
  workspace: WorkspaceSnapshot;
  documentId: string;
  name?: string;
  path: string;
  content: AgentPolicy;
  commandId: string;
  issuedAt?: string;
  label?: string;
}>;

export type CreateWorkspaceAgentPolicyUpdateCommandInput = Readonly<{
  workspace: WorkspaceSnapshot;
  documentId: string;
  after: AgentPolicy;
  commandId: string;
  issuedAt?: string;
  mergeKey?: string;
  label?: string;
}>;

const contentRoots = Object.freeze([
  'id',
  'name',
  'providerRules',
  'modelRules',
  'contextRules',
  'capabilityRules',
  'approvalRules',
  'networkRules',
  'secretRules',
  'budgetCeiling',
  'verificationRules',
  'retentionRules',
  'privacy',
] as const);

const escapePointerSegment = (segment: string): string =>
  segment.replaceAll('~', '~0').replaceAll('/', '~1');

const validateContent = (
  content: unknown,
  documentId?: string
):
  | Readonly<{ ok: true; value: AgentPolicy }>
  | Readonly<{
      ok: false;
      issues: readonly WorkspaceAgentPolicyReadIssue[];
    }> => {
  const decoded = validateAgentPolicy(content);
  if (!decoded.ok) return decoded;
  if (documentId !== undefined && decoded.value.id !== documentId) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_AGENT_POLICY_ID_MISMATCH',
          path: '/id',
          message: `Workspace document id ${documentId} must match AgentPolicy id ${decoded.value.id}.`,
        },
      ],
    };
  }
  return decoded;
};

export const isCanonicalWorkspaceAgentPolicyContent = (
  content: unknown,
  documentId?: string
): content is AgentPolicy => validateContent(content, documentId).ok;

export const decodeWorkspaceAgentPolicyDocument = (
  document: WorkspaceDocument
): WorkspaceAgentPolicyReadResult => {
  if (document.type !== 'agent-policy') {
    return { status: 'unsupported-document-type', document };
  }
  const validation = validateContent(document.content, document.id);
  if (!validation.ok) {
    return {
      status: 'invalid',
      document,
      issues: validation.issues,
    };
  }
  const typedDocument = Object.freeze({
    ...document,
    content: validation.value,
  }) as WorkspaceAgentPolicyDocument;
  return Object.freeze({
    status: 'valid',
    document: typedDocument,
    decodedContent: validation.value,
  });
};

export const selectWorkspaceAgentPolicyDocument = (
  snapshot: WorkspaceSnapshot | undefined,
  documentId?: string
): WorkspaceAgentPolicyReadResult | undefined => {
  if (!snapshot) return undefined;
  const document = documentId
    ? snapshot.docsById[documentId]
    : Object.values(snapshot.docsById).find(
        (candidate) => candidate.type === 'agent-policy'
      );
  return document ? decodeWorkspaceAgentPolicyDocument(document) : undefined;
};

/** Creates the singleton policy through the canonical Workspace VFS factory. */
export const createWorkspaceAgentPolicyDocumentCommand = (
  input: CreateWorkspaceAgentPolicyDocumentInput
): WorkspaceCommandEnvelope | null => {
  const validation = validateContent(input.content, input.documentId);
  if (!validation.ok) return null;
  return createWorkspaceDocumentAtPathCommand({
    workspace: input.workspace,
    document: {
      id: input.documentId,
      type: 'agent-policy',
      ...(input.name ? { name: input.name } : {}),
      path: input.path,
      contentRev: 1,
      metaRev: 1,
      content: validation.value,
      updatedAt: input.issuedAt,
    },
    commandId: input.commandId,
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    label: input.label,
  });
};

const appendRootPatch = (
  forwardOps: WorkspacePatchOperation[],
  reverseOps: WorkspacePatchOperation[],
  root: string,
  before: unknown,
  after: unknown
): void => {
  if (sameCanonicalJson(before, after)) return;
  const path = `/${escapePointerSegment(root)}`;
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

/** Builds one reversible `core.agent` update over owner-approved roots. */
export const createWorkspaceAgentPolicyUpdateCommand = (
  input: CreateWorkspaceAgentPolicyUpdateCommandInput
): WorkspaceCommandEnvelope | null => {
  const current = selectWorkspaceAgentPolicyDocument(
    input.workspace,
    input.documentId
  );
  if (current?.status !== 'valid') return null;
  const afterValidation = validateContent(input.after, input.documentId);
  if (!afterValidation.ok) return null;
  const before = current.decodedContent as unknown as Record<string, unknown>;
  const after = afterValidation.value as unknown as Record<string, unknown>;
  const forwardOps: WorkspacePatchOperation[] = [];
  const reverseOps: WorkspacePatchOperation[] = [];
  contentRoots.forEach((root) =>
    appendRootPatch(forwardOps, reverseOps, root, before[root], after[root])
  );
  if (forwardOps.length === 0) return null;
  return {
    id: input.commandId,
    namespace: 'core.agent',
    type: 'document.update',
    version: '1.0',
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    target: {
      workspaceId: input.workspace.id,
      documentId: input.documentId,
    },
    domainHint: 'agent',
    forwardOps,
    reverseOps,
    ...(input.mergeKey ? { mergeKey: input.mergeKey } : {}),
    ...(input.label ? { label: input.label } : {}),
  };
};

export const createWorkspaceAgentPolicyTransaction = (
  workspaceId: string,
  transactionId: string,
  issuedAt: string,
  commands: readonly WorkspaceCommandEnvelope[],
  label?: string
): WorkspaceTransactionEnvelope | null => {
  if (
    commands.length === 0 ||
    commands.some((command) => command.target.workspaceId !== workspaceId)
  ) {
    return null;
  }
  return {
    id: transactionId,
    workspaceId,
    issuedAt,
    commands: [...commands],
    ...(label ? { label } : {}),
  };
};
