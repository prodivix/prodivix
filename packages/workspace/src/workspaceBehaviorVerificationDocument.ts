import {
  validateBehaviorDocument,
  type BehaviorControlProfile,
  type BehaviorDecodeIssue,
  type BehaviorDocumentByKind,
  type BehaviorFixtureSet,
  type BehaviorScenario,
} from '@prodivix/behavior';
import {
  validateVerificationDocument,
  type VerificationBaselineSet,
  type VerificationDecodeIssue,
  type VerificationDocumentByKind,
  type VerificationPolicy,
} from '@prodivix/verification';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import type {
  WorkspaceCommandEnvelope,
  WorkspacePatchOperation,
  WorkspaceTransactionEnvelope,
} from './workspaceCommand';
import { createWorkspaceDocumentAtPathCommand } from './workspaceDocumentFactory';
import type { WorkspaceDocument, WorkspaceSnapshot } from './types';

export type WorkspaceBehaviorVerificationDocumentType =
  | 'behavior-scenario'
  | 'behavior-control-profile'
  | 'behavior-fixture-set'
  | 'verification-policy'
  | 'verification-baseline-set';

export type WorkspaceBehaviorVerificationContentByType = Readonly<{
  'behavior-scenario': BehaviorScenario;
  'behavior-control-profile': BehaviorControlProfile;
  'behavior-fixture-set': BehaviorFixtureSet;
  'verification-policy': VerificationPolicy;
  'verification-baseline-set': VerificationBaselineSet;
}>;

export type WorkspaceBehaviorScenarioDocument = WorkspaceDocument &
  Readonly<{
    type: 'behavior-scenario';
    content: BehaviorScenario;
  }>;

export type WorkspaceBehaviorControlProfileDocument = WorkspaceDocument &
  Readonly<{
    type: 'behavior-control-profile';
    content: BehaviorControlProfile;
  }>;

export type WorkspaceBehaviorFixtureSetDocument = WorkspaceDocument &
  Readonly<{
    type: 'behavior-fixture-set';
    content: BehaviorFixtureSet;
  }>;

export type WorkspaceVerificationPolicyDocument = WorkspaceDocument &
  Readonly<{
    type: 'verification-policy';
    content: VerificationPolicy;
  }>;

export type WorkspaceVerificationBaselineSetDocument = WorkspaceDocument &
  Readonly<{
    type: 'verification-baseline-set';
    content: VerificationBaselineSet;
  }>;

export type WorkspaceBehaviorVerificationDocument<
  K extends WorkspaceBehaviorVerificationDocumentType =
    WorkspaceBehaviorVerificationDocumentType,
> = WorkspaceDocument &
  Readonly<{
    type: K;
    content: WorkspaceBehaviorVerificationContentByType[K];
  }>;

export type WorkspaceBehaviorVerificationReadIssue =
  | BehaviorDecodeIssue
  | VerificationDecodeIssue
  | Readonly<{
      code: 'WKS_G3_DOCUMENT_ID_MISMATCH';
      path: '/id';
      message: string;
    }>;

export type WorkspaceBehaviorVerificationReadResult<
  K extends WorkspaceBehaviorVerificationDocumentType =
    WorkspaceBehaviorVerificationDocumentType,
> =
  | Readonly<{
      status: 'unsupported-document-type';
      document: WorkspaceDocument;
    }>
  | Readonly<{
      status: 'invalid';
      document: WorkspaceDocument;
      issues: readonly WorkspaceBehaviorVerificationReadIssue[];
    }>
  | Readonly<{
      status: 'valid';
      document: WorkspaceBehaviorVerificationDocument<K>;
      decodedContent: WorkspaceBehaviorVerificationContentByType[K];
    }>;

export type CreateWorkspaceBehaviorVerificationDocumentInput<
  K extends WorkspaceBehaviorVerificationDocumentType,
> = Readonly<{
  workspace: WorkspaceSnapshot;
  type: K;
  documentId: string;
  name?: string;
  path: string;
  content: WorkspaceBehaviorVerificationContentByType[K];
  commandId: string;
  issuedAt?: string;
  label?: string;
}>;

export type CreateWorkspaceBehaviorVerificationDocumentUpdateCommandInput<
  K extends WorkspaceBehaviorVerificationDocumentType,
> = Readonly<{
  workspace: WorkspaceSnapshot;
  documentId: string;
  type: K;
  after: WorkspaceBehaviorVerificationContentByType[K];
  commandId: string;
  issuedAt?: string;
  mergeKey?: string;
  label?: string;
}>;

const documentTypes = new Set<WorkspaceBehaviorVerificationDocumentType>([
  'behavior-scenario',
  'behavior-control-profile',
  'behavior-fixture-set',
  'verification-policy',
  'verification-baseline-set',
]);

const contentRoots: Readonly<
  Record<WorkspaceBehaviorVerificationDocumentType, readonly string[]>
> = Object.freeze({
  'behavior-scenario': Object.freeze([
    'id',
    'name',
    'description',
    'owner',
    'criticality',
    'tags',
    'entry',
    'steps',
    'fixtureRefs',
    'controlProfileRef',
    'baselineRefs',
    'timeoutPolicy',
  ]),
  'behavior-control-profile': Object.freeze([
    'id',
    'name',
    'clock',
    'timezone',
    'random',
    'identifiers',
    'scheduler',
    'network',
    'storage',
    'rendering',
    'serviceWorker',
    'settle',
    'budgets',
  ]),
  'behavior-fixture-set': Object.freeze(['id', 'name', 'fixtures']),
  'verification-policy': Object.freeze([
    'id',
    'name',
    'defaultRequirement',
    'rules',
    'matrixProfiles',
    'retryPolicies',
    'exemptions',
    'budgets',
    'evidenceRequirements',
    'baselinePolicy',
    'retentionRequest',
  ]),
  'verification-baseline-set': Object.freeze(['id', 'name', 'entries']),
});

const commandOwner = (
  type: WorkspaceBehaviorVerificationDocumentType
): Readonly<{
  namespace: 'core.behavior' | 'core.verification';
  domain: 'behavior' | 'verification';
}> =>
  type.startsWith('behavior-')
    ? { namespace: 'core.behavior', domain: 'behavior' }
    : { namespace: 'core.verification', domain: 'verification' };

const escapePointerSegment = (segment: string): string =>
  segment.replaceAll('~', '~0').replaceAll('/', '~1');

const validateContent = <K extends WorkspaceBehaviorVerificationDocumentType>(
  type: K,
  content: unknown,
  documentId?: string
):
  | Readonly<{
      ok: true;
      value: WorkspaceBehaviorVerificationContentByType[K];
    }>
  | Readonly<{
      ok: false;
      issues: readonly WorkspaceBehaviorVerificationReadIssue[];
    }> => {
  const decoded = type.startsWith('behavior-')
    ? validateBehaviorDocument(type as keyof BehaviorDocumentByKind, content)
    : validateVerificationDocument(
        type as keyof VerificationDocumentByKind,
        content
      );
  if (!decoded.ok) return decoded;
  const value = decoded.value as WorkspaceBehaviorVerificationContentByType[K];
  if (documentId !== undefined && value.id !== documentId) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_G3_DOCUMENT_ID_MISMATCH',
          path: '/id',
          message: `Workspace document id ${documentId} must match authored content id ${value.id}.`,
        },
      ],
    };
  }
  return { ok: true, value };
};

export const isWorkspaceBehaviorVerificationDocumentType = (
  value: unknown
): value is WorkspaceBehaviorVerificationDocumentType =>
  typeof value === 'string' &&
  documentTypes.has(value as WorkspaceBehaviorVerificationDocumentType);

export const isCanonicalWorkspaceBehaviorVerificationDocumentContent = <
  K extends WorkspaceBehaviorVerificationDocumentType,
>(
  type: K,
  content: unknown,
  documentId?: string
): content is WorkspaceBehaviorVerificationContentByType[K] =>
  validateContent(type, content, documentId).ok;

export const decodeWorkspaceBehaviorVerificationDocument = <
  K extends WorkspaceBehaviorVerificationDocumentType,
>(
  document: WorkspaceDocument,
  expectedType?: K
): WorkspaceBehaviorVerificationReadResult<K> => {
  if (
    !isWorkspaceBehaviorVerificationDocumentType(document.type) ||
    (expectedType !== undefined && document.type !== expectedType)
  ) {
    return { status: 'unsupported-document-type', document };
  }
  const validation = validateContent(
    document.type,
    document.content,
    document.id
  );
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
  }) as WorkspaceBehaviorVerificationDocument<K>;
  return Object.freeze({
    status: 'valid',
    document: typedDocument,
    decodedContent:
      validation.value as WorkspaceBehaviorVerificationContentByType[K],
  });
};

export const selectWorkspaceBehaviorVerificationDocument = <
  K extends WorkspaceBehaviorVerificationDocumentType,
>(
  snapshot: WorkspaceSnapshot | undefined,
  documentId: string | undefined,
  expectedType?: K
): WorkspaceBehaviorVerificationReadResult<K> | undefined => {
  if (!snapshot || !documentId) return undefined;
  const document = snapshot.docsById[documentId];
  return document
    ? decodeWorkspaceBehaviorVerificationDocument(document, expectedType)
    : undefined;
};

/**
 * Creates one typed G3 authoring document through the canonical Workspace VFS
 * factory. Mounting remains a Workspace-domain operation; subsequent content
 * edits use the owning Behavior or Verification namespace.
 */
export const createWorkspaceBehaviorVerificationDocumentCommand = <
  K extends WorkspaceBehaviorVerificationDocumentType,
>(
  input: CreateWorkspaceBehaviorVerificationDocumentInput<K>
): WorkspaceCommandEnvelope | null => {
  const validation = validateContent(
    input.type,
    input.content,
    input.documentId
  );
  if (!validation.ok) return null;
  return createWorkspaceDocumentAtPathCommand({
    workspace: input.workspace,
    document: {
      id: input.documentId,
      type: input.type,
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

/** Builds one reversible content update using only owner-approved roots. */
export const createWorkspaceBehaviorVerificationDocumentUpdateCommand = <
  K extends WorkspaceBehaviorVerificationDocumentType,
>(
  input: CreateWorkspaceBehaviorVerificationDocumentUpdateCommandInput<K>
): WorkspaceCommandEnvelope | null => {
  const current = selectWorkspaceBehaviorVerificationDocument(
    input.workspace,
    input.documentId,
    input.type
  );
  if (current?.status !== 'valid') return null;
  const afterValidation = validateContent(
    input.type,
    input.after,
    input.documentId
  );
  if (!afterValidation.ok) return null;

  const before = current.decodedContent as unknown as Record<string, unknown>;
  const after = afterValidation.value as unknown as Record<string, unknown>;
  const forwardOps: WorkspacePatchOperation[] = [];
  const reverseOps: WorkspacePatchOperation[] = [];
  contentRoots[input.type].forEach((root) =>
    appendRootPatch(forwardOps, reverseOps, root, before[root], after[root])
  );
  if (forwardOps.length === 0) return null;

  const owner = commandOwner(input.type);
  return {
    id: input.commandId,
    namespace: owner.namespace,
    type: 'document.update',
    version: '1.0',
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    target: {
      workspaceId: input.workspace.id,
      documentId: input.documentId,
    },
    domainHint: owner.domain,
    forwardOps,
    reverseOps,
    ...(input.mergeKey ? { mergeKey: input.mergeKey } : {}),
    ...(input.label ? { label: input.label } : {}),
  };
};

/** Groups G3 authoring commands into one Atomic Commit/history unit. */
export const createWorkspaceBehaviorVerificationTransaction = (
  workspaceId: string,
  transactionId: string,
  issuedAt: string,
  commands: readonly WorkspaceCommandEnvelope[],
  label?: string
): WorkspaceTransactionEnvelope | null => {
  if (
    !commands.length ||
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
