import { ExternalLink, GitBranch, Link2, ShieldAlert } from 'lucide-react';
import type { DiagnosticTargetRef } from '@prodivix/diagnostics';
import type {
  WorkspaceComponentImpactAnalysisResult,
  WorkspaceSemanticIndexIssue,
} from '@prodivix/workspace';

export type ComponentRelationshipItem = Readonly<{
  id: string;
  label: string;
  detail: string;
  ownerRef: DiagnosticTargetRef;
}>;

export type ComponentReferenceItem = ComponentRelationshipItem &
  Readonly<{
    kind: string;
    addressing: 'durable-id' | 'name';
  }>;

export type ComponentRelationshipsPanelProps = Readonly<{
  dependencies: readonly ComponentRelationshipItem[];
  references: readonly ComponentReferenceItem[];
  impactResult: WorkspaceComponentImpactAnalysisResult | null;
  semanticIssues: readonly WorkspaceSemanticIndexIssue[];
  onNavigateOwnerRef: (ownerRef: DiagnosticTargetRef) => void;
}>;

function RelationshipList({
  items,
  emptyLabel,
  onNavigateOwnerRef,
}: Readonly<{
  items: readonly (ComponentRelationshipItem | ComponentReferenceItem)[];
  emptyLabel: string;
  onNavigateOwnerRef: (ownerRef: DiagnosticTargetRef) => void;
}>) {
  if (items.length === 0) {
    return (
      <p className="m-0 rounded-lg bg-(--bg-canvas) px-3 py-3 text-center text-[11px] text-(--text-muted)">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="m-0 list-none space-y-1.5 p-0">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-start gap-2 rounded-lg bg-(--bg-canvas) px-3 py-2.5"
        >
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-xs font-medium">{item.label}</span>
              {'addressing' in item && (
                <span className="shrink-0 rounded-full border border-(--border-subtle) px-1.5 py-0.5 font-mono text-[8px] text-(--text-muted)">
                  {item.addressing === 'durable-id' ? 'stable id' : 'name'}
                </span>
              )}
            </div>
            <p className="m-0 mt-1 truncate font-mono text-[9px] text-(--text-muted)">
              {item.detail}
            </p>
          </div>
          <button
            type="button"
            aria-label={`Open ${item.label}`}
            title="Open owner"
            className="shrink-0 rounded-md border-0 bg-transparent p-1 text-(--text-muted) hover:bg-(--bg-raised) hover:text-(--text-primary)"
            onClick={() => onNavigateOwnerRef(item.ownerRef)}
          >
            <ExternalLink size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ComponentRelationshipsPanel({
  dependencies,
  references,
  impactResult,
  semanticIssues,
  onNavigateOwnerRef,
}: ComponentRelationshipsPanelProps) {
  if (semanticIssues.length > 0) {
    return (
      <aside className="space-y-3 rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4">
        <div className="flex items-center gap-2">
          <ShieldAlert size={15} className="text-(--text-muted)" />
          <h2 className="m-0 text-sm font-semibold">Semantic view blocked</h2>
        </div>
        <p className="m-0 text-[11px] leading-5 text-(--text-muted)">
          References and impact require one complete canonical PIR semantic
          snapshot. No partial result is shown.
        </p>
        <ul className="m-0 list-none space-y-1.5 p-0">
          {semanticIssues.slice(0, 5).map((issue, index) => (
            <li
              key={`${issue.code}:${issue.path}:${index}`}
              className="rounded-lg bg-(--bg-canvas) px-3 py-2"
            >
              <code className="block text-[9px] text-(--text-muted)">
                {issue.code}
              </code>
              <span className="mt-1 block text-[11px] leading-4 text-(--text-secondary)">
                {issue.message}
              </span>
            </li>
          ))}
        </ul>
        {semanticIssues.length > 5 && (
          <p className="m-0 text-[10px] text-(--text-muted)">
            +{semanticIssues.length - 5} more blocking issues
          </p>
        )}
      </aside>
    );
  }

  if (impactResult?.status === 'rejected') {
    return (
      <aside className="space-y-3 rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4">
        <div className="flex items-center gap-2">
          <ShieldAlert size={15} className="text-(--text-muted)" />
          <h2 className="m-0 text-sm font-semibold">Impact unavailable</h2>
        </div>
        {impactResult.issues.map((issue, index) => (
          <div
            key={`${issue.code}:${issue.path}:${index}`}
            className="rounded-lg bg-(--bg-canvas) px-3 py-2 text-[11px] text-(--text-secondary)"
          >
            {issue.message}
          </div>
        ))}
      </aside>
    );
  }

  const impact = impactResult?.status === 'ready' ? impactResult.impact : null;
  const referencedMembers =
    impact?.contractMemberImpacts.filter(
      (member) => member.referenceIds.length > 0
    ) ?? [];

  return (
    <aside className="space-y-4">
      <section className="space-y-3 rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-(--text-muted)" />
          <h2 className="m-0 text-sm font-semibold">Impact</h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['Direct refs', impact?.directReferences.length ?? 0],
            ['Consumer docs', impact?.consumingDocumentIds.length ?? 0],
            [
              'Transitive',
              impact?.transitiveConsumingComponentDocumentIds.length ?? 0,
            ],
            [
              'Affected symbols',
              impact?.semanticImpact.impactedSymbolIds.length ?? 0,
            ],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-lg bg-(--bg-canvas) px-3 py-2.5"
            >
              <span className="block text-lg font-semibold">{value}</span>
              <span className="text-[10px] text-(--text-muted)">{label}</span>
            </div>
          ))}
        </div>
        {impact &&
          (impact.unsupportedReferenceIds.length > 0 ||
            impact.unsupportedDependencyIds.length > 0 ||
            impact.nameAddressedReferenceIds.length > 0) && (
            <div className="rounded-lg border border-(--border-subtle) px-3 py-2 text-[10px] leading-4 text-(--text-secondary)">
              {impact.unsupportedReferenceIds.length} unsupported references ·{' '}
              {impact.unsupportedDependencyIds.length} unsupported dependencies
              {' · '}
              {impact.nameAddressedReferenceIds.length} name-addressed
            </div>
          )}
      </section>

      <section className="space-y-3 rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-(--text-muted)" />
          <h2 className="m-0 text-sm font-semibold">Dependencies</h2>
        </div>
        <RelationshipList
          items={dependencies}
          emptyLabel="This Definition does not instantiate another component."
          onNavigateOwnerRef={onNavigateOwnerRef}
        />
      </section>

      <section className="space-y-3 rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4">
        <div className="flex items-center gap-2">
          <Link2 size={14} className="text-(--text-muted)" />
          <h2 className="m-0 text-sm font-semibold">References</h2>
        </div>
        <RelationshipList
          items={references}
          emptyLabel="No semantic reference consumes this Definition or its contract."
          onNavigateOwnerRef={onNavigateOwnerRef}
        />
      </section>

      {referencedMembers.length > 0 && (
        <section className="space-y-3 rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4">
          <h2 className="m-0 text-sm font-semibold">Referenced members</h2>
          <ul className="m-0 list-none space-y-1 p-0">
            {referencedMembers.map((member) => (
              <li
                key={member.symbolId}
                className="flex items-center justify-between gap-3 rounded-lg bg-(--bg-canvas) px-3 py-2 text-[11px]"
              >
                <span className="min-w-0 truncate">
                  {member.name}
                  <span className="ml-1.5 text-(--text-muted)">
                    {member.kind}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-(--text-muted)">
                  {member.referenceIds.length}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
