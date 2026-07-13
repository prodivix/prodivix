import type {
  ProdivixDiagnostic,
  ProdivixDiagnosticDomain,
  ProdivixDiagnosticSeverity,
} from './diagnostic.types';

export type DiagnosticIssueRevision = {
  key: string;
  sequence: number;
};

export type DiagnosticProviderSnapshot = {
  providerId: string;
  workspaceId: string;
  revision: DiagnosticIssueRevision;
  collectedAt: number;
  diagnostics: readonly ProdivixDiagnostic[];
};

export type DiagnosticIssueStatus = 'active' | 'stale' | 'resolved';

export type DiagnosticIssueSource = {
  providerId: string;
  revision: DiagnosticIssueRevision;
  collectedAt: number;
  occurrenceCount: number;
  status: 'active' | 'stale';
};

export type DiagnosticIssue = {
  id: string;
  fingerprint: string;
  workspaceId: string;
  status: DiagnosticIssueStatus;
  diagnostic: ProdivixDiagnostic;
  sources: readonly DiagnosticIssueSource[];
  occurrenceCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  resolvedAt?: number;
};

export type DiagnosticIssueCollectionState = {
  workspaceId: string;
  revision: DiagnosticIssueRevision | null;
  providerSnapshots: readonly DiagnosticProviderSnapshot[];
  issues: readonly DiagnosticIssue[];
};

export type DiagnosticIssueUpdateResult =
  | {
      status: 'updated';
      state: DiagnosticIssueCollectionState;
    }
  | {
      status: 'ignored-stale';
      state: DiagnosticIssueCollectionState;
    }
  | {
      status: 'rejected';
      reason:
        | 'workspace-mismatch'
        | 'invalid-provider'
        | 'invalid-revision'
        | 'revision-collision';
      state: DiagnosticIssueCollectionState;
    };

export type DiagnosticIssueQuery = {
  statuses?: readonly DiagnosticIssueStatus[];
  severities?: readonly ProdivixDiagnosticSeverity[];
  domains?: readonly ProdivixDiagnosticDomain[];
  providerIds?: readonly string[];
  text?: string;
};

export type DiagnosticIssueSummary = {
  total: number;
  byStatus: Record<DiagnosticIssueStatus, number>;
  bySeverity: Record<ProdivixDiagnosticSeverity, number>;
};
