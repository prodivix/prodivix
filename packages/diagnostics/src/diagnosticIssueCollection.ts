import type {
  DiagnosticIssue,
  DiagnosticIssueCollectionState,
  DiagnosticIssueQuery,
  DiagnosticIssueRevision,
  DiagnosticIssueSource,
  DiagnosticIssueSummary,
  DiagnosticIssueUpdateResult,
  DiagnosticProviderSnapshot,
} from './diagnosticIssue.types';
import type {
  ProdivixDiagnostic,
  ProdivixDiagnosticSeverity,
} from './diagnostic.types';

const MAX_RESOLVED_ISSUES = 128;

const SEVERITY_RANK: Record<ProdivixDiagnosticSeverity, number> = {
  fatal: 4,
  error: 3,
  warning: 2,
  info: 1,
};

const stableSerialize = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
    .join(',')}}`;
};

const readProtocolPath = (
  diagnostic: ProdivixDiagnostic
): string | undefined =>
  typeof diagnostic.meta?.path === 'string' ? diagnostic.meta.path : undefined;

export const createDiagnosticIssueFingerprint = (
  diagnostic: ProdivixDiagnostic
): string => {
  const protocolPath = readProtocolPath(diagnostic);
  const hasLocation = Boolean(
    diagnostic.targetRef || diagnostic.sourceSpan || protocolPath
  );

  return stableSerialize({
    code: diagnostic.code,
    domain: diagnostic.domain,
    message: hasLocation ? undefined : diagnostic.message,
    protocolPath,
    sourceSpan: diagnostic.sourceSpan,
    targetRef: diagnostic.targetRef,
  });
};

const compareRevision = (
  left: DiagnosticIssueRevision,
  right: DiagnosticIssueRevision
): number => left.sequence - right.sequence;

const sameRevision = (
  left: DiagnosticIssueRevision,
  right: DiagnosticIssueRevision
): boolean => left.sequence === right.sequence && left.key === right.key;

const compareDiagnostic = (
  left: ProdivixDiagnostic,
  right: ProdivixDiagnostic
): number => {
  const severity = SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];
  if (severity !== 0) return severity;

  const comparable = (diagnostic: ProdivixDiagnostic) => ({
    code: diagnostic.code,
    domain: diagnostic.domain,
    hint: diagnostic.hint,
    message: diagnostic.message,
    protocolPath: readProtocolPath(diagnostic),
    sourceSpan: diagnostic.sourceSpan,
    targetRef: diagnostic.targetRef,
  });

  return stableSerialize(comparable(left)).localeCompare(
    stableSerialize(comparable(right))
  );
};

const compareIssue = (
  left: DiagnosticIssue,
  right: DiagnosticIssue
): number => {
  const statusOrder = { active: 0, stale: 1, resolved: 2 } as const;
  const status = statusOrder[left.status] - statusOrder[right.status];
  if (status !== 0) return status;

  const severity =
    SEVERITY_RANK[right.diagnostic.severity] -
    SEVERITY_RANK[left.diagnostic.severity];
  if (severity !== 0) return severity;

  const domain = left.diagnostic.domain.localeCompare(right.diagnostic.domain);
  if (domain !== 0) return domain;

  const code = left.diagnostic.code.localeCompare(right.diagnostic.code);
  if (code !== 0) return code;

  return left.fingerprint.localeCompare(right.fingerprint);
};

type MutableIssue = {
  diagnostics: ProdivixDiagnostic[];
  sources: DiagnosticIssueSource[];
};

const rebuildIssues = (
  state: DiagnosticIssueCollectionState,
  providerSnapshots: readonly DiagnosticProviderSnapshot[],
  revision: DiagnosticIssueRevision,
  changedAt: number
): readonly DiagnosticIssue[] => {
  const grouped = new Map<string, MutableIssue>();

  for (const snapshot of providerSnapshots) {
    const sourceStatus = sameRevision(snapshot.revision, revision)
      ? 'active'
      : 'stale';
    const providerOccurrences = new Map<
      string,
      { diagnostic: ProdivixDiagnostic; occurrenceCount: number }
    >();

    for (const diagnostic of snapshot.diagnostics) {
      const fingerprint = createDiagnosticIssueFingerprint(diagnostic);
      const existing = providerOccurrences.get(fingerprint);
      if (!existing) {
        providerOccurrences.set(fingerprint, {
          diagnostic,
          occurrenceCount: 1,
        });
        continue;
      }

      existing.occurrenceCount += 1;
      if (compareDiagnostic(diagnostic, existing.diagnostic) < 0) {
        existing.diagnostic = diagnostic;
      }
    }

    for (const [fingerprint, occurrence] of providerOccurrences) {
      const issue = grouped.get(fingerprint) ?? {
        diagnostics: [],
        sources: [],
      };
      issue.diagnostics.push(occurrence.diagnostic);
      issue.sources.push({
        providerId: snapshot.providerId,
        revision: snapshot.revision,
        collectedAt: snapshot.collectedAt,
        occurrenceCount: occurrence.occurrenceCount,
        status: sourceStatus,
      });
      grouped.set(fingerprint, issue);
    }
  }

  const previousByFingerprint = new Map(
    state.issues.map((issue) => [issue.fingerprint, issue])
  );
  const nextIssues: DiagnosticIssue[] = [];

  for (const [fingerprint, groupedIssue] of grouped) {
    groupedIssue.sources.sort((left, right) =>
      left.providerId.localeCompare(right.providerId)
    );
    groupedIssue.diagnostics.sort(compareDiagnostic);
    const previous = previousByFingerprint.get(fingerprint);
    const collectedAt = groupedIssue.sources.map(
      (source) => source.collectedAt
    );
    const lastSeenAt = Math.max(...collectedAt);
    const diagnostic = groupedIssue.diagnostics[0];
    if (!diagnostic) continue;

    nextIssues.push({
      id: `${state.workspaceId}:${fingerprint}`,
      fingerprint,
      workspaceId: state.workspaceId,
      status: groupedIssue.sources.some((source) => source.status === 'active')
        ? 'active'
        : 'stale',
      diagnostic,
      sources: groupedIssue.sources,
      occurrenceCount: groupedIssue.sources.reduce(
        (total, source) => total + source.occurrenceCount,
        0
      ),
      firstSeenAt: Math.min(
        previous?.firstSeenAt ?? lastSeenAt,
        ...collectedAt
      ),
      lastSeenAt,
    });
    previousByFingerprint.delete(fingerprint);
  }

  const resolved = [...previousByFingerprint.values()]
    .map((issue) =>
      issue.status === 'resolved'
        ? issue
        : {
            ...issue,
            status: 'resolved' as const,
            resolvedAt: changedAt,
          }
    )
    .sort(
      (left, right) =>
        (right.resolvedAt ?? right.lastSeenAt) -
        (left.resolvedAt ?? left.lastSeenAt)
    )
    .slice(0, MAX_RESOLVED_ISSUES);

  return [...nextIssues, ...resolved].sort(compareIssue);
};

export const createDiagnosticIssueCollectionState = (
  workspaceId: string
): DiagnosticIssueCollectionState => ({
  workspaceId,
  revision: null,
  providerSnapshots: [],
  issues: [],
});

export const upsertDiagnosticProviderSnapshot = (
  state: DiagnosticIssueCollectionState,
  snapshot: DiagnosticProviderSnapshot
): DiagnosticIssueUpdateResult => {
  if (snapshot.workspaceId !== state.workspaceId) {
    return { status: 'rejected', reason: 'workspace-mismatch', state };
  }
  if (!snapshot.providerId.trim()) {
    return { status: 'rejected', reason: 'invalid-provider', state };
  }
  if (
    !snapshot.revision.key.trim() ||
    !Number.isSafeInteger(snapshot.revision.sequence) ||
    snapshot.revision.sequence < 0 ||
    !Number.isFinite(snapshot.collectedAt)
  ) {
    return { status: 'rejected', reason: 'invalid-revision', state };
  }

  const currentRevision = state.revision;
  if (currentRevision) {
    const comparison = compareRevision(snapshot.revision, currentRevision);
    if (comparison < 0) {
      return { status: 'ignored-stale', state };
    }
    if (comparison === 0 && snapshot.revision.key !== currentRevision.key) {
      return { status: 'rejected', reason: 'revision-collision', state };
    }
  }

  const existingProviderSnapshot = state.providerSnapshots.find(
    (candidate) => candidate.providerId === snapshot.providerId
  );
  if (
    existingProviderSnapshot &&
    sameRevision(existingProviderSnapshot.revision, snapshot.revision) &&
    existingProviderSnapshot.collectedAt > snapshot.collectedAt
  ) {
    return { status: 'ignored-stale', state };
  }

  const revision =
    !currentRevision || compareRevision(snapshot.revision, currentRevision) > 0
      ? snapshot.revision
      : currentRevision;
  const providerSnapshots = [
    ...state.providerSnapshots.filter(
      (candidate) => candidate.providerId !== snapshot.providerId
    ),
    snapshot,
  ].sort((left, right) => left.providerId.localeCompare(right.providerId));
  const nextState: DiagnosticIssueCollectionState = {
    ...state,
    revision,
    providerSnapshots,
    issues: [],
  };
  nextState.issues = rebuildIssues(
    state,
    providerSnapshots,
    revision,
    snapshot.collectedAt
  );

  return { status: 'updated', state: nextState };
};

export const removeDiagnosticProviderSnapshot = (
  state: DiagnosticIssueCollectionState,
  providerId: string,
  removedAt: number
): DiagnosticIssueCollectionState => {
  if (!state.revision) return state;
  const providerSnapshots = state.providerSnapshots.filter(
    (snapshot) => snapshot.providerId !== providerId
  );
  if (providerSnapshots.length === state.providerSnapshots.length) return state;

  const nextState: DiagnosticIssueCollectionState = {
    ...state,
    providerSnapshots,
    issues: [],
  };
  nextState.issues = rebuildIssues(
    state,
    providerSnapshots,
    state.revision,
    removedAt
  );
  return nextState;
};

export const queryDiagnosticIssues = (
  state: DiagnosticIssueCollectionState,
  query: DiagnosticIssueQuery = {}
): readonly DiagnosticIssue[] => {
  const text = query.text?.trim().toLocaleLowerCase();

  return state.issues.filter((issue) => {
    if (query.statuses && !query.statuses.includes(issue.status)) return false;
    if (
      query.severities &&
      !query.severities.includes(issue.diagnostic.severity)
    )
      return false;
    if (query.domains && !query.domains.includes(issue.diagnostic.domain))
      return false;
    if (
      query.providerIds &&
      !issue.sources.some((source) =>
        query.providerIds?.includes(source.providerId)
      )
    )
      return false;
    if (!text) return true;

    return [
      issue.diagnostic.code,
      issue.diagnostic.domain,
      issue.diagnostic.message,
      issue.diagnostic.hint,
      stableSerialize(issue.diagnostic.targetRef),
      ...issue.sources.map((source) => source.providerId),
    ]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(text));
  });
};

export const summarizeDiagnosticIssues = (
  issues: readonly DiagnosticIssue[]
): DiagnosticIssueSummary =>
  issues.reduce<DiagnosticIssueSummary>(
    (summary, issue) => {
      summary.total += 1;
      summary.byStatus[issue.status] += 1;
      summary.bySeverity[issue.diagnostic.severity] += 1;
      return summary;
    },
    {
      total: 0,
      byStatus: { active: 0, stale: 0, resolved: 0 },
      bySeverity: { info: 0, warning: 0, error: 0, fatal: 0 },
    }
  );
