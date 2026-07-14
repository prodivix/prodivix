import type { ProdivixDiagnostic } from '@prodivix/diagnostics';
import type {
  SemanticSnapshotIdentity,
  WorkspaceReferenceEdge,
} from './semantic.types';

export const SEMANTIC_RESOLUTION_DIAGNOSTIC_PROVIDER_ID =
  'core.semantic-resolution';
export const SEMANTIC_SNAPSHOT_DIAGNOSTIC_PROVIDER_ID =
  'core.semantic-snapshot';

const resolutionDefinition = Object.freeze({
  missing: {
    code: 'SEM-2001',
    message: 'Semantic reference target does not exist.',
  },
  'not-visible': {
    code: 'SEM-2002',
    message: 'Semantic reference target is not visible from this scope.',
  },
  ambiguous: {
    code: 'SEM-2003',
    message: 'Semantic reference resolves to more than one target.',
  },
  'type-incompatible': {
    code: 'SEM-2004',
    message:
      'Semantic reference target does not satisfy its type or capability contract.',
  },
} as const);

export const createSemanticResolutionDiagnostics = (
  references: readonly WorkspaceReferenceEdge[]
): readonly ProdivixDiagnostic[] =>
  Object.freeze(
    references.flatMap((reference): ProdivixDiagnostic[] => {
      if (
        reference.status === 'resolved' ||
        reference.diagnosticPolicy === 'defer'
      ) {
        return [];
      }
      const definition = resolutionDefinition[reference.status];
      return [
        Object.freeze({
          code: definition.code,
          severity: 'warning' as const,
          domain: 'semantic' as const,
          message: definition.message,
          retryable: false,
          targetRef: reference.sourceRef,
          ...(reference.sourceSpan ? { sourceSpan: reference.sourceSpan } : {}),
          meta: Object.freeze({
            referenceId: reference.id,
            resolutionStatus: reference.status,
            target: reference.target,
            candidateSymbolIds: reference.candidateSymbolIds ?? [],
          }),
        }),
      ];
    })
  );

export const createSemanticStaleDiagnostic = (
  expected: SemanticSnapshotIdentity,
  actual: SemanticSnapshotIdentity
): ProdivixDiagnostic =>
  Object.freeze({
    code: 'SEM-2005',
    severity: 'warning',
    domain: 'semantic',
    message: 'Semantic query expected a different Workspace snapshot.',
    retryable: false,
    targetRef: {
      kind: 'workspace' as const,
      workspaceId: actual.workspaceRevisions.workspaceId,
    },
    meta: Object.freeze({
      expectedSnapshotIdentity: expected,
      actualSnapshotIdentity: actual,
    }),
  });
