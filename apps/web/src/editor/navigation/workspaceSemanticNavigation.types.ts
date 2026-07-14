import type {
  SemanticSnapshotIdentity,
  WorkspaceSemanticIndex,
} from '@prodivix/authoring';
import type { DiagnosticTargetRef, SourceSpan } from '@prodivix/diagnostics';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import type { NavigateFunction } from 'react-router';

export type WorkspaceNavigationSurface =
  'animation' | 'blueprint' | 'component' | 'nodegraph' | 'resources';

export type WorkspaceSemanticNavigationTarget =
  | Readonly<{
      kind: 'diagnostic-target';
      targetRef: DiagnosticTargetRef;
    }>
  | Readonly<{
      kind: 'semantic-symbol';
      symbolId: string;
      destination?:
        | Readonly<{ kind: 'definition' }>
        | Readonly<{
            kind: 'reference';
            referenceId?: string;
            preferSourceSpan?: boolean;
          }>;
      expectedSnapshotIdentity?: SemanticSnapshotIdentity;
    }>
  | Readonly<{
      kind: 'semantic-reference';
      referenceId: string;
      destination?: 'definition' | 'source';
      expectedSnapshotIdentity?: SemanticSnapshotIdentity;
    }>
  | Readonly<{
      kind: 'source-span';
      sourceSpan: SourceSpan;
    }>;

export type WorkspaceResolvedNavigationLocation =
  | Readonly<{
      kind: 'diagnostic-target';
      targetRef: DiagnosticTargetRef;
    }>
  | Readonly<{
      kind: 'source-span';
      sourceSpan: SourceSpan;
    }>;

export type WorkspaceSemanticNavigationUnavailableReason =
  | 'workspace-unavailable'
  | 'semantic-index-unavailable'
  | 'semantic-index-stale'
  | 'semantic-symbol-missing'
  | 'semantic-reference-missing'
  | 'semantic-reference-unresolved'
  | 'semantic-reference-not-owned-by-symbol'
  | 'target-unavailable'
  | 'source-unavailable';

export type WorkspaceSemanticNavigationResolution =
  | Readonly<{
      status: 'resolved';
      location: WorkspaceResolvedNavigationLocation;
    }>
  | Readonly<{
      status: 'unavailable';
      reason: WorkspaceSemanticNavigationUnavailableReason;
    }>;

export type WorkspaceSemanticIndexResolver = (
  workspace: WorkspaceSnapshot
) => WorkspaceSemanticIndex | null;

export type NavigateToWorkspaceSemanticTargetInput = Readonly<{
  projectId: string;
  target: WorkspaceSemanticNavigationTarget;
  navigate: NavigateFunction;
  preferredSurface?: WorkspaceNavigationSurface;
  resolveSemanticIndex?: WorkspaceSemanticIndexResolver;
}>;

export type WorkspaceSemanticNavigationResult =
  | Readonly<{
      status: 'navigated';
      location: WorkspaceResolvedNavigationLocation;
      route: string;
    }>
  | Readonly<{
      status: 'unavailable';
      reason: WorkspaceSemanticNavigationUnavailableReason;
    }>;

export type WorkspaceSurfaceNavigationRequestInput = Readonly<{
  projectId: string;
  workspaceId: string;
  location: WorkspaceResolvedNavigationLocation;
}>;

export type WorkspaceSurfaceNavigationRequest =
  WorkspaceSurfaceNavigationRequestInput & Readonly<{ id: number }>;
