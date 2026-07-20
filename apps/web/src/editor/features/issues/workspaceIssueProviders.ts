import {
  getWorkspaceOperationId,
  collectWorkspaceCodeArtifactLifecycleDiagnostics,
  createWorkspaceCodeArtifactProvider,
  decodeWorkspaceDataSourceDocument,
  decodeWorkspacePirDocument,
  projectWorkspaceServerRuntimeAuthoring,
  readWorkspaceServerRuntimeAuthConfiguration,
  validateWorkspaceSnapshot,
  type WorkspaceSnapshot,
  type WorkspaceValidationIssue,
} from '@prodivix/workspace';
import { validateRouteManifest } from '@prodivix/router';
import { decodeNodeGraphDocument } from '@prodivix/nodegraph';
import type {
  DiagnosticIssueRevision,
  DiagnosticProviderSnapshot,
  DiagnosticTargetRef,
  ProdivixDiagnostic,
} from '@prodivix/diagnostics';
import type {
  WorkspaceConflictSession,
  WorkspaceOutboxEntry,
  WorkspaceSettingsOutboxEntry,
} from '@prodivix/workspace-sync';
import { compileWorkspaceShaders } from '@/editor/codeCompile';
import { createWorkspaceExecutionSnapshotRef } from '@prodivix/prodivix-compiler';
import type { ExecutionSessionSnapshot } from '@prodivix/runtime-core';
import { collectWorkspaceAnimationDiagnostics } from './workspaceAnimationIssueProvider';
import { collectWorkspaceCodeDiagnostics } from './workspaceCodeIssueProvider';

const DIAGNOSTIC_INDEX_URL = '/reference/diagnostic-codes';

const unescapePointerSegment = (segment: string): string =>
  segment.replaceAll('~1', '/').replaceAll('~0', '~');

const mapWorkspaceCode = (issue: WorkspaceValidationIssue): string => {
  if (issue.code.includes('PATH')) return 'WKS-3010';
  if (
    issue.code.includes('MISSING') ||
    issue.code.includes('ORPHANED') ||
    issue.code.includes('DOC_REF') ||
    issue.code === 'WKS_DOCUMENTS_EMPTY'
  ) {
    return 'WKS-3001';
  }
  if (issue.code.startsWith('WKS_DOCUMENT_')) return 'WKS-3002';
  return 'WKS-1002';
};

const mapWorkspaceTarget = (
  workspaceId: string,
  issue: WorkspaceValidationIssue
): DiagnosticTargetRef => {
  if (issue.nodeId) {
    return { kind: 'workspace-node', workspaceId, nodeId: issue.nodeId };
  }
  if (issue.documentId) {
    return { kind: 'document', workspaceId, documentId: issue.documentId };
  }
  return { kind: 'workspace', workspaceId };
};

const collectWorkspaceDiagnostics = (
  workspace: WorkspaceSnapshot
): ProdivixDiagnostic[] =>
  validateWorkspaceSnapshot(workspace).issues.map((issue) => ({
    code: mapWorkspaceCode(issue),
    severity: 'error',
    domain: 'workspace',
    message: issue.message,
    docsUrl: `${DIAGNOSTIC_INDEX_URL}#workspace`,
    targetRef: mapWorkspaceTarget(workspace.id, issue),
    meta: { path: issue.path, upstreamCode: issue.code },
  }));

const collectRouteDiagnostics = (
  workspace: WorkspaceSnapshot
): ProdivixDiagnostic[] => {
  const codeArtifacts = createWorkspaceCodeArtifactProvider(workspace);

  return validateRouteManifest({
    manifest: workspace.routeManifest,
    documentExists: (documentId) => Boolean(workspace.docsById[documentId]),
    codeArtifactExists: (artifactId) =>
      Boolean(codeArtifacts.getArtifact(artifactId)),
  }).map((issue) => ({
    code: issue.code,
    severity: 'error',
    domain: 'route',
    message: issue.message,
    docsUrl: `${DIAGNOSTIC_INDEX_URL}#route`,
    targetRef: { kind: 'route', routeId: issue.routeNodeId },
    meta: {
      routeNodeId: issue.routeNodeId,
      ...(issue.artifactId ? { artifactId: issue.artifactId } : {}),
    },
  }));
};

const collectServerRuntimeAuthoringDiagnostics = (
  workspace: WorkspaceSnapshot
): ProdivixDiagnostic[] => {
  const routeDiagnostics = projectWorkspaceServerRuntimeAuthoring(
    workspace
  ).issues.map((issue): ProdivixDiagnostic => ({
    code: issue.code,
    severity: 'error',
    domain: 'route',
    message: issue.message,
    hint: 'Open Auth & Server Runtime Resources or the route Code inspector.',
    docsUrl: '/reference/diagnostics/server-runtime-diagnostic-codes',
    targetRef: { kind: 'route', routeId: issue.routeNodeId },
    meta: {
      path: issue.path,
      routeNodeId: issue.routeNodeId,
      slot: issue.slot,
      artifactId: issue.artifactId,
      ...(issue.exportName ? { exportName: issue.exportName } : {}),
    },
  }));
  const configurationRead =
    readWorkspaceServerRuntimeAuthConfiguration(workspace);
  const configurationDiagnostics =
    configurationRead.status === 'invalid'
      ? configurationRead.issues.map((issue): ProdivixDiagnostic => ({
          code: 'WKS-EXPORT-SERVER-AUTH-CONFIG-INVALID',
          severity: 'error',
          domain: 'workspace',
          message: issue.message,
          hint: 'Repair the reference-only Auth configuration before running or exporting protected Server Functions.',
          docsUrl: '/reference/diagnostics/server-runtime-diagnostic-codes',
          targetRef: issue.documentId
            ? {
                kind: 'document',
                workspaceId: workspace.id,
                documentId: issue.documentId,
              }
            : { kind: 'workspace', workspaceId: workspace.id },
          meta: {
            path: issue.path,
            ...(issue.documentId ? { documentId: issue.documentId } : {}),
          },
        }))
      : [];
  return [...routeDiagnostics, ...configurationDiagnostics];
};

const mapPirTarget = (
  workspaceId: string,
  documentId: string,
  path: string
): DiagnosticTargetRef => {
  const nodeMatch = /^\/ui\/graph\/nodesById\/([^/]+)/.exec(path);
  if (nodeMatch?.[1]) {
    return {
      kind: 'pir-node',
      documentId,
      nodeId: unescapePointerSegment(nodeMatch[1]),
    };
  }
  return { kind: 'document', workspaceId, documentId };
};

const collectPirDiagnostics = (
  workspace: WorkspaceSnapshot
): ProdivixDiagnostic[] =>
  Object.values(workspace.docsById).flatMap((document) => {
    if (
      document.type !== 'pir-page' &&
      document.type !== 'pir-layout' &&
      document.type !== 'pir-component'
    ) {
      return [];
    }

    const read = decodeWorkspacePirDocument(document, {
      workspaceId: workspace.id,
    });
    if (read.status === 'valid') return [];
    if (
      read.status !== 'decode-invalid' &&
      read.status !== 'semantic-invalid'
    ) {
      return [];
    }
    return read.issues.map((issue): ProdivixDiagnostic => ({
      code: issue.code ?? 'PIR-1001',
      severity: 'error',
      domain: 'pir',
      message: issue.message,
      docsUrl: `${DIAGNOSTIC_INDEX_URL}#pir`,
      targetRef: mapPirTarget(workspace.id, document.id, issue.path),
      meta: {
        path: issue.path,
        documentId: document.id,
        stage: issue.stage,
      },
    }));
  });

const mapNodeGraphTarget = (
  workspaceId: string,
  documentId: string,
  content: unknown,
  path: string
): DiagnosticTargetRef => {
  const match = /^\/nodes\/(\d+)/.exec(path);
  if (!match) return { kind: 'document', workspaceId, documentId };
  const nodes =
    content && typeof content === 'object' && 'nodes' in content
      ? (content as { nodes?: unknown }).nodes
      : undefined;
  const node = Array.isArray(nodes) ? nodes[Number(match[1])] : undefined;
  const nodeId =
    node && typeof node === 'object' && 'id' in node
      ? (node as { id?: unknown }).id
      : undefined;
  return nodeId
    ? { kind: 'nodegraph-node', documentId, nodeId: String(nodeId) }
    : { kind: 'document', workspaceId, documentId };
};

const collectNodeGraphDiagnostics = (
  workspace: WorkspaceSnapshot
): ProdivixDiagnostic[] =>
  Object.values(workspace.docsById).flatMap((document) => {
    if (document.type !== 'pir-graph') return [];
    const result = decodeNodeGraphDocument(document.content);
    if (result.ok !== false) return [];

    return result.issues.map((issue) => ({
      code: issue.message.startsWith('Duplicate edge id:')
        ? 'NGR-3010'
        : 'NGR-1001',
      severity: 'error',
      domain: 'nodegraph',
      message: issue.message,
      docsUrl: `${DIAGNOSTIC_INDEX_URL}#nodegraph`,
      targetRef: mapNodeGraphTarget(
        workspace.id,
        document.id,
        document.content,
        issue.path
      ),
      meta: { path: issue.path, documentId: document.id },
    }));
  });

const collectDataDiagnostics = (
  workspace: WorkspaceSnapshot
): ProdivixDiagnostic[] =>
  Object.values(workspace.docsById).flatMap((document) => {
    if (document.type !== 'data-source') return [];
    const read = decodeWorkspaceDataSourceDocument(document);
    if (read.status !== 'invalid') return [];
    return read.issues.map((issue): ProdivixDiagnostic => {
      const operationMatch = /^\/operationsById\/([^/]+)/u.exec(issue.path);
      const operationId = operationMatch?.[1]
        ? unescapePointerSegment(operationMatch[1])
        : undefined;
      return {
        code: issue.code,
        severity: 'error',
        domain: 'data',
        message: issue.message,
        hint: 'Open Data Resources to inspect the canonical source or reimport proposal.',
        docsUrl: '/reference/diagnostics/data-diagnostic-codes',
        targetRef: operationId
          ? {
              kind: 'data-operation',
              documentId: document.id,
              operationId,
            }
          : { kind: 'data-source', documentId: document.id },
        meta: { path: issue.path, documentId: document.id },
      };
    });
  });

export const collectWorkspaceModelIssueSnapshots = (input: {
  workspace: WorkspaceSnapshot;
  revision: DiagnosticIssueRevision;
  collectedAt: number;
}): readonly DiagnosticProviderSnapshot[] => {
  const createSnapshot = (
    providerId: string,
    diagnostics: readonly ProdivixDiagnostic[]
  ): DiagnosticProviderSnapshot => ({
    providerId,
    workspaceId: input.workspace.id,
    revision: input.revision,
    collectedAt: input.collectedAt,
    diagnostics,
  });

  return [
    createSnapshot(
      'workspace-vfs-validator',
      collectWorkspaceDiagnostics(input.workspace)
    ),
    createSnapshot(
      'route-manifest-validator',
      collectRouteDiagnostics(input.workspace)
    ),
    createSnapshot(
      'workspace-server-runtime-authoring',
      collectServerRuntimeAuthoringDiagnostics(input.workspace)
    ),
    createSnapshot('pir-validator', collectPirDiagnostics(input.workspace)),
    createSnapshot(
      'nodegraph-codec',
      collectNodeGraphDiagnostics(input.workspace)
    ),
    createSnapshot(
      'workspace-data-contract',
      collectDataDiagnostics(input.workspace)
    ),
    createSnapshot(
      'workspace-code-language',
      collectWorkspaceCodeDiagnostics(input.workspace)
    ),
    createSnapshot(
      'workspace-code-artifact-lifecycle',
      collectWorkspaceCodeArtifactLifecycleDiagnostics(input.workspace)
    ),
    createSnapshot(
      'animation-validator',
      collectWorkspaceAnimationDiagnostics(input.workspace)
    ),
  ];
};

/**
 * Publishes only diagnostics produced by the exact current Workspace snapshot.
 * Provider-private metadata and causes are intentionally replaced with bounded
 * execution correlation so Issues cannot widen the durable/runtime boundary.
 */
export const collectExecutionSessionIssueSnapshot = (input: {
  workspace: WorkspaceSnapshot;
  revision: DiagnosticIssueRevision;
  collectedAt: number;
  sessions: readonly ExecutionSessionSnapshot[];
}): DiagnosticProviderSnapshot => {
  const expectedSnapshotId = createWorkspaceExecutionSnapshotRef(
    input.workspace
  ).snapshotId;
  const diagnostics = input.sessions.flatMap((session) =>
    session.events.flatMap((record): readonly ProdivixDiagnostic[] => {
      const event = record.event;
      if (
        record.workspaceId !== input.workspace.id ||
        record.snapshotId !== expectedSnapshotId ||
        event.kind !== 'diagnostic'
      )
        return [];
      const diagnostic = event.diagnostic;
      return [
        Object.freeze({
          code: diagnostic.code,
          severity: diagnostic.severity,
          domain: diagnostic.domain,
          message: diagnostic.message,
          ...(diagnostic.hint ? { hint: diagnostic.hint } : {}),
          ...(diagnostic.docsUrl ? { docsUrl: diagnostic.docsUrl } : {}),
          ...(diagnostic.retryable === undefined
            ? {}
            : { retryable: diagnostic.retryable }),
          ...(diagnostic.targetRef
            ? { targetRef: Object.freeze({ ...diagnostic.targetRef }) }
            : {}),
          ...(diagnostic.sourceSpan
            ? { sourceSpan: Object.freeze({ ...diagnostic.sourceSpan }) }
            : {}),
          meta: Object.freeze({
            executionSessionId: session.sessionId,
            executionJobId: record.jobId,
            executionProviderId: record.providerId,
            executionSnapshotId: record.snapshotId,
            executionSequence: event.sequence,
          }),
        }),
      ];
    })
  );
  return Object.freeze({
    providerId: 'execution-session-diagnostics',
    workspaceId: input.workspace.id,
    revision: input.revision,
    collectedAt: input.collectedAt,
    diagnostics: Object.freeze(diagnostics),
  });
};

export const collectWorkspaceShaderCompileIssueSnapshot = async (input: {
  workspace: WorkspaceSnapshot;
  revision: DiagnosticIssueRevision;
  collectedAt: number;
}): Promise<DiagnosticProviderSnapshot> => {
  let diagnostics: readonly ProdivixDiagnostic[];
  try {
    diagnostics = (await compileWorkspaceShaders(input.workspace)).diagnostics;
  } catch {
    diagnostics = Object.freeze([
      Object.freeze({
        code: 'COD-9001',
        severity: 'error' as const,
        domain: 'code' as const,
        message: 'The shader compile environment could not be evaluated.',
        hint: 'Retry after reopening the Workspace.',
        retryable: true,
        docsUrl: '/reference/diagnostics/cod-9001',
        targetRef: Object.freeze({
          kind: 'workspace' as const,
          workspaceId: input.workspace.id,
        }),
        meta: { stage: 'environment', capability: 'shader-compile' },
      }),
    ]);
  }
  return Object.freeze({
    providerId: 'workspace-shader-compile',
    workspaceId: input.workspace.id,
    revision: input.revision,
    collectedAt: input.collectedAt,
    diagnostics,
  });
};

const getFailureCode = (failure: { code: string; status?: number }): string =>
  failure.status === 422 || /PATCH|VALIDATION/.test(failure.code)
    ? 'WKS-5002'
    : 'WKS-9001';

export const collectWorkspaceOutboxIssueSnapshot = (input: {
  workspaceId: string;
  revision: DiagnosticIssueRevision;
  collectedAt: number;
  operationEntries: readonly WorkspaceOutboxEntry[];
  settingsEntries: readonly WorkspaceSettingsOutboxEntry[];
}): DiagnosticProviderSnapshot => {
  const diagnostics = [
    ...input.operationEntries,
    ...input.settingsEntries,
  ].flatMap<ProdivixDiagnostic>((entry) => {
    if (entry.state.kind === 'failed') {
      const code = getFailureCode(entry.state.failure);
      const manuallyRetryable =
        entry.entryKind === 'operation' && code === 'WKS-5002';
      return [
        {
          code,
          severity: 'error',
          domain: 'workspace',
          message: entry.state.failure.message,
          hint:
            entry.state.failure.retryable || manuallyRetryable
              ? 'Retry the operation after checking the connection and workspace state.'
              : 'Review the operation and the current workspace state before trying again.',
          retryable: entry.state.failure.retryable || manuallyRetryable,
          docsUrl: `${DIAGNOSTIC_INDEX_URL}#workspace`,
          targetRef: { kind: 'operation', operation: entry.id },
          meta: {
            upstreamCode: entry.state.failure.code,
            status: entry.state.failure.status,
            entryKind: entry.entryKind,
            attemptCount: entry.attemptCount,
          },
        },
      ];
    }
    if (entry.state.kind !== 'conflict') return [];
    const conflict = entry.state.session.serverConflict;
    return [
      {
        code: conflict?.code ?? 'WKS-4001',
        severity: 'warning',
        domain: 'workspace',
        message:
          conflict?.message ??
          'The workspace changed remotely while this operation was pending.',
        hint: 'Review the local and remote revisions before applying a resolution.',
        retryable: true,
        docsUrl: `${DIAGNOSTIC_INDEX_URL}#workspace`,
        targetRef: { kind: 'operation', operation: entry.id },
        meta: {
          conflictSessionId: entry.state.session.id,
          unresolvedConflictCount:
            entry.state.session.unresolvedConflictIds.length,
          entryKind: entry.entryKind,
        },
      },
    ];
  });

  return {
    providerId: 'workspace-outbox',
    workspaceId: input.workspaceId,
    revision: input.revision,
    collectedAt: input.collectedAt,
    diagnostics,
  };
};

export const collectRevisionConflictIssueSnapshot = (input: {
  workspaceId: string;
  revision: DiagnosticIssueRevision;
  collectedAt: number;
  session: WorkspaceConflictSession | null;
}): DiagnosticProviderSnapshot => {
  const operationId = input.session?.sourceOperation
    ? getWorkspaceOperationId(input.session.sourceOperation)
    : undefined;
  const conflict = input.session?.serverConflict;
  const diagnostics: ProdivixDiagnostic[] =
    input.session?.status === 'open' &&
    input.session.unresolvedConflictIds.length > 0
      ? [
          {
            code: conflict?.code ?? 'WKS-4001',
            severity: 'warning',
            domain: 'workspace',
            message:
              conflict?.message ??
              'The workspace contains unresolved local and remote changes.',
            hint: 'Open the revision conflict review and resolve every conflict.',
            retryable: true,
            docsUrl: `${DIAGNOSTIC_INDEX_URL}#workspace`,
            targetRef: {
              kind: 'operation',
              operation: operationId ?? input.session.id,
            },
            meta: {
              conflictSessionId: input.session.id,
              unresolvedConflictCount:
                input.session.unresolvedConflictIds.length,
            },
          },
        ]
      : [];

  return {
    providerId: 'revision-conflict',
    workspaceId: input.workspaceId,
    revision: input.revision,
    collectedAt: input.collectedAt,
    diagnostics,
  };
};
