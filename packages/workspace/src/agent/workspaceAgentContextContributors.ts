import type {
  AgentContextCandidate,
  AgentContextContributor,
  AgentContextItemKind,
  AgentJsonValue,
  AgentSensitivity,
  AgentTargetScope,
  AgentWorkspaceRevisionVector,
} from '@prodivix/ai';
import {
  createAgentContextContributorDescriptor,
  digestAgentCanonicalValue,
} from '@prodivix/ai';
import type { WorkspaceSemanticIndex } from '@prodivix/authoring';
import type { ProdivixDiagnostic } from '@prodivix/diagnostics';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import type {
  WorkspaceCodeDocumentContent,
  WorkspaceDocument,
  WorkspaceSnapshot,
} from '../types';
import { isWorkspaceCodeDocumentContent } from '../workspaceCodeDocument';
import { decodeWorkspaceBehaviorVerificationDocument } from '../workspaceBehaviorVerificationDocument';

export type WorkspaceAgentSourceTraceContext = Readonly<{
  traceId: string;
  targetId: string;
  value: AgentJsonValue;
  sensitivity?: AgentSensitivity;
}>;

export type WorkspaceAgentVerificationContext = Readonly<{
  ref: string;
  kind: Extract<
    AgentContextItemKind,
    'verification-plan' | 'verification-evidence' | 'verification-closure'
  >;
  digest: string;
  summary: AgentJsonValue;
  sourceTraceRef: string;
  sensitivity?: AgentSensitivity;
}>;

export type WorkspaceAgentContextContributorInput = Readonly<{
  snapshot: WorkspaceSnapshot;
  semanticIndex: WorkspaceSemanticIndex;
  sourceTraces?: readonly WorkspaceAgentSourceTraceContext[];
  issues?: readonly ProdivixDiagnostic[];
  verification?: readonly WorkspaceAgentVerificationContext[];
}>;

type WorkspaceAgentCodeDocument = WorkspaceDocument &
  Readonly<{ content: WorkspaceCodeDocumentContent }>;

const implementationDigest = (name: string): string =>
  digestAgentCanonicalValue({ contract: 'g4-v1-workspace-context', name });

export const createAgentWorkspaceRevisionFromSnapshot = (
  snapshot: WorkspaceSnapshot
): AgentWorkspaceRevisionVector =>
  Object.freeze({
    workspaceRev: snapshot.workspaceRev,
    routeRev: snapshot.routeRev,
    opSeq: snapshot.opSeq,
    documents: Object.freeze(
      Object.values(snapshot.docsById)
        .sort((left, right) => compareUnicodeCodePoints(left.id, right.id))
        .map(({ id, contentRev, metaRev }) =>
          Object.freeze({ documentId: id, contentRev, metaRev })
        )
    ),
  });

const scopeIncludesWorkspace = (
  scope: AgentTargetScope,
  workspaceId: string
): boolean =>
  scope.targets.some(
    (target) => target.kind === 'workspace' && target.id === workspaceId
  );

const scopeIncludesDocument = (
  scope: AgentTargetScope,
  workspaceId: string,
  documentId: string
): boolean =>
  scopeIncludesWorkspace(scope, workspaceId) ||
  scope.targets.some(
    (target) => target.kind === 'document' && target.id === documentId
  );

const scopeIncludesSemanticTarget = (
  scope: AgentTargetScope,
  workspaceId: string,
  symbolId: string
): boolean =>
  scopeIncludesWorkspace(scope, workspaceId) ||
  scope.targets.some(
    (target) => target.kind === 'semantic-target' && target.id === symbolId
  );

const diagnosticDocumentId = (
  diagnostic: ProdivixDiagnostic
): string | undefined => {
  const target = diagnostic.targetRef;
  if (!target) return undefined;
  if ('documentId' in target) return target.documentId;
  if (target.kind === 'code-artifact') return target.artifactId;
  return undefined;
};

const semanticOwnerDocumentId = (
  ownerRef: ReturnType<WorkspaceSemanticIndex['getSymbols']>[number]['ownerRef']
): string | undefined => {
  if ('documentId' in ownerRef) return ownerRef.documentId;
  if (ownerRef.kind === 'code-artifact') return ownerRef.artifactId;
  return undefined;
};

const descriptor = (
  contributorId: string,
  kind: AgentContextContributor['descriptor']['kind'],
  configuration: unknown,
  semanticBinding?: Readonly<{
    semanticSnapshotRef: string;
    semanticProviderSetDigest: string;
  }>
) =>
  createAgentContextContributorDescriptor({
    contributorId,
    kind,
    implementationDigest: implementationDigest(contributorId),
    configurationDigest: digestAgentCanonicalValue(configuration),
    ...(semanticBinding ?? {}),
  });

export const createWorkspaceSemanticAgentContextContributor = (
  snapshot: WorkspaceSnapshot,
  semanticIndex: WorkspaceSemanticIndex
): AgentContextContributor => {
  const revision = createAgentWorkspaceRevisionFromSnapshot(snapshot);
  return Object.freeze({
    descriptor: descriptor(
      'workspace.semantic-index',
      'semantic-index',
      semanticIndex.snapshotIdentity,
      {
        semanticSnapshotRef: digestAgentCanonicalValue(
          semanticIndex.snapshotIdentity
        ),
        semanticProviderSetDigest: digestAgentCanonicalValue({
          semanticProviderSetDigest:
            semanticIndex.snapshotIdentity.providerSetDigest,
        }),
      }
    ),
    contribute({ targetScope }) {
      const candidates = semanticIndex
        .getSymbols()
        .filter((symbol) => {
          const documentId = semanticOwnerDocumentId(symbol.ownerRef);
          return (
            scopeIncludesSemanticTarget(targetScope, snapshot.id, symbol.id) ||
            (documentId !== undefined &&
              scopeIncludesDocument(targetScope, snapshot.id, documentId))
          );
        })
        .sort((left, right) => compareUnicodeCodePoints(left.id, right.id))
        .map((symbol): AgentContextCandidate =>
          Object.freeze({
            kind: 'semantic-symbol',
            authority: 'derived',
            source: Object.freeze({ kind: 'semantic-symbol', id: symbol.id }),
            revision,
            mediaType: 'application/json',
            content: canonicalJsonText({
              capabilityIds: symbol.capabilityIds ?? [],
              displayName: symbol.displayName ?? null,
              id: symbol.id,
              kind: symbol.kind,
              name: symbol.name,
              ownerRef: symbol.ownerRef,
              providerId: symbol.providerId,
              qualifiedName: symbol.qualifiedName ?? null,
              scopeId: symbol.scopeId,
              stability: symbol.stability,
              typeRef: symbol.typeRef ?? null,
            }),
            sensitivity: 'internal',
            instructionBoundary: 'data-only',
            sourceTraceRef: `semantic-owner:${digestAgentCanonicalValue(
              symbol.ownerRef
            )}`,
          })
        );
      return Object.freeze({
        status: 'ready',
        candidates: Object.freeze(candidates),
      });
    },
  });
};

export const createWorkspaceCodeAgentContextContributor = (
  snapshot: WorkspaceSnapshot
): AgentContextContributor => {
  const revision = createAgentWorkspaceRevisionFromSnapshot(snapshot);
  const documents = Object.values(snapshot.docsById)
    .filter(
      (document): document is WorkspaceAgentCodeDocument =>
        document.type === 'code' &&
        isWorkspaceCodeDocumentContent(document.content)
    )
    .sort((left, right) => compareUnicodeCodePoints(left.id, right.id));
  return Object.freeze({
    descriptor: descriptor(
      'workspace.code-authoring',
      'code',
      documents.map(({ id, contentRev, metaRev }) => ({
        id,
        contentRev,
        metaRev,
      }))
    ),
    contribute({ targetScope }) {
      const candidates = documents
        .filter((document) =>
          scopeIncludesDocument(targetScope, snapshot.id, document.id)
        )
        .map((document): AgentContextCandidate =>
          Object.freeze({
            kind: 'code-reference',
            authority: 'canonical',
            source: Object.freeze({ kind: 'code-artifact', id: document.id }),
            revision,
            mediaType: 'application/json',
            content: canonicalJsonText({
              artifactId: document.id,
              language: document.content.language,
              path: document.path,
              revision: String(document.contentRev),
              source: document.content.source,
            }),
            sensitivity: 'internal',
            instructionBoundary: 'data-only',
            sourceTraceRef: `workspace-code:${document.id}@${document.contentRev}`,
          })
        );
      return Object.freeze({
        status: 'ready',
        candidates: Object.freeze(candidates),
      });
    },
  });
};

export const createWorkspaceSourceTraceAgentContextContributor = (
  snapshot: WorkspaceSnapshot,
  sourceTraces: readonly WorkspaceAgentSourceTraceContext[] = []
): AgentContextContributor => {
  const revision = createAgentWorkspaceRevisionFromSnapshot(snapshot);
  const traces = [...sourceTraces].sort((left, right) =>
    compareUnicodeCodePoints(left.traceId, right.traceId)
  );
  return Object.freeze({
    descriptor: descriptor('workspace.source-trace', 'source-trace', traces),
    contribute({ targetScope }) {
      const candidates = traces
        .filter(
          (trace) =>
            scopeIncludesWorkspace(targetScope, snapshot.id) ||
            targetScope.targets.some(({ id }) => id === trace.targetId)
        )
        .map((trace): AgentContextCandidate =>
          Object.freeze({
            kind: 'source-trace',
            authority: 'derived',
            source: Object.freeze({ kind: 'source-trace', id: trace.traceId }),
            revision,
            mediaType: 'application/json',
            content: canonicalJsonText({
              targetId: trace.targetId,
              traceId: trace.traceId,
              value: trace.value,
            }),
            sensitivity: trace.sensitivity ?? 'internal',
            instructionBoundary: 'data-only',
          })
        );
      return Object.freeze({
        status: 'ready',
        candidates: Object.freeze(candidates),
      });
    },
  });
};

export const createWorkspaceIssuesAgentContextContributor = (
  snapshot: WorkspaceSnapshot,
  diagnostics: readonly ProdivixDiagnostic[] = []
): AgentContextContributor => {
  const revision = createAgentWorkspaceRevisionFromSnapshot(snapshot);
  const sanitized = diagnostics
    .map((diagnostic) => ({
      code: diagnostic.code,
      domain: diagnostic.domain,
      message: diagnostic.message,
      severity: diagnostic.severity,
      sourceSpan: diagnostic.sourceSpan ?? null,
      targetRef: diagnostic.targetRef ?? null,
    }))
    .sort(
      (left, right) =>
        compareUnicodeCodePoints(left.code, right.code) ||
        compareUnicodeCodePoints(left.message, right.message)
    );
  return Object.freeze({
    descriptor: descriptor('workspace.issues', 'issues', sanitized),
    contribute({ targetScope }) {
      const candidates = sanitized
        .filter((diagnostic) => {
          const documentId = diagnosticDocumentId(
            diagnostic as ProdivixDiagnostic
          );
          return (
            scopeIncludesWorkspace(targetScope, snapshot.id) ||
            (documentId !== undefined &&
              scopeIncludesDocument(targetScope, snapshot.id, documentId))
          );
        })
        .map((diagnostic, index): AgentContextCandidate => {
          const id = `${diagnostic.code}:${index}:${digestAgentCanonicalValue(
            diagnostic
          )}`;
          return Object.freeze({
            kind: 'issue',
            authority: 'derived',
            source: Object.freeze({ kind: 'issue', id }),
            revision,
            mediaType: 'application/json',
            content: canonicalJsonText(diagnostic),
            sensitivity: 'internal',
            instructionBoundary: 'data-only',
            sourceTraceRef: `issue-source:${digestAgentCanonicalValue({
              sourceSpan: diagnostic.sourceSpan,
              targetRef: diagnostic.targetRef,
            })}`,
          });
        });
      return Object.freeze({
        status: 'ready',
        candidates: Object.freeze(candidates),
      });
    },
  });
};

export const createWorkspaceScenarioAgentContextContributor = (
  snapshot: WorkspaceSnapshot
): AgentContextContributor => {
  const revision = createAgentWorkspaceRevisionFromSnapshot(snapshot);
  const scenarios = Object.values(snapshot.docsById)
    .filter((document) => document.type === 'behavior-scenario')
    .sort((left, right) => compareUnicodeCodePoints(left.id, right.id))
    .flatMap((document) => {
      const decoded = decodeWorkspaceBehaviorVerificationDocument(
        document,
        'behavior-scenario'
      );
      return decoded.status === 'valid'
        ? [{ document, scenario: decoded.decodedContent }]
        : [];
    });
  return Object.freeze({
    descriptor: descriptor(
      'workspace.behavior-scenarios',
      'scenario',
      scenarios.map(({ document }) => ({
        id: document.id,
        contentRev: document.contentRev,
        metaRev: document.metaRev,
      }))
    ),
    contribute({ targetScope }) {
      const candidates = scenarios
        .filter(({ document }) =>
          scopeIncludesDocument(targetScope, snapshot.id, document.id)
        )
        .map(({ document, scenario }): AgentContextCandidate =>
          Object.freeze({
            kind: 'behavior-scenario',
            authority: 'canonical',
            source: Object.freeze({
              kind: 'behavior-scenario',
              id: document.id,
            }),
            revision,
            mediaType: 'application/json',
            content: canonicalJsonText(scenario),
            sensitivity: 'internal',
            instructionBoundary: 'data-only',
            sourceTraceRef: `behavior-scenario:${document.id}@${document.contentRev}`,
          })
        );
      return Object.freeze({
        status: 'ready',
        candidates: Object.freeze(candidates),
      });
    },
  });
};

export const createWorkspaceVerificationAgentContextContributor = (
  snapshot: WorkspaceSnapshot,
  verification: readonly WorkspaceAgentVerificationContext[] = []
): AgentContextContributor => {
  const revision = createAgentWorkspaceRevisionFromSnapshot(snapshot);
  const entries = [...verification].sort((left, right) =>
    compareUnicodeCodePoints(left.ref, right.ref)
  );
  return Object.freeze({
    descriptor: descriptor('workspace.verification', 'verification', entries),
    contribute({ targetScope }) {
      const candidates = entries
        .filter(
          (entry) =>
            scopeIncludesWorkspace(targetScope, snapshot.id) ||
            targetScope.targets.some(({ id }) => id === entry.ref)
        )
        .map((entry): AgentContextCandidate =>
          Object.freeze({
            kind: entry.kind,
            authority: 'derived',
            source: Object.freeze({ kind: 'verification', id: entry.ref }),
            revision,
            mediaType: 'application/json',
            content: canonicalJsonText({
              digest: entry.digest,
              ref: entry.ref,
              summary: entry.summary,
            }),
            sensitivity: entry.sensitivity ?? 'internal',
            instructionBoundary: 'data-only',
            sourceTraceRef: entry.sourceTraceRef,
          })
        );
      return Object.freeze({
        status: 'ready',
        candidates: Object.freeze(candidates),
      });
    },
  });
};

/** Creates the six public V1 contribution surfaces from one exact Workspace snapshot. */
export const createWorkspaceAgentContextContributors = (
  input: WorkspaceAgentContextContributorInput
): readonly AgentContextContributor[] =>
  Object.freeze([
    createWorkspaceSemanticAgentContextContributor(
      input.snapshot,
      input.semanticIndex
    ),
    createWorkspaceCodeAgentContextContributor(input.snapshot),
    createWorkspaceSourceTraceAgentContextContributor(
      input.snapshot,
      input.sourceTraces
    ),
    createWorkspaceIssuesAgentContextContributor(input.snapshot, input.issues),
    createWorkspaceScenarioAgentContextContributor(input.snapshot),
    createWorkspaceVerificationAgentContextContributor(
      input.snapshot,
      input.verification
    ),
  ]);
