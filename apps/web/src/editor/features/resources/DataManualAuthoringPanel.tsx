import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Braces, FilePenLine, ShieldCheck, TriangleAlert } from 'lucide-react';
import {
  createDataManualAuthoringProposal,
  type DataJsonSchema202012,
  type DataManualAuthoringChange,
  type DataManualAuthoringImpact,
  type DataManualAuthoringProposal,
  type DataOperationPolicies,
} from '@prodivix/data';
import {
  createWorkspaceDataSourceDocumentUpdateCommand,
  decodeWorkspaceDataSourceDocument,
} from '@prodivix/workspace';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { useFocusGuardedDraft } from '@/editor/drafts/useFocusGuardedDraft';
import { dispatchWorkspaceAuthoringOperation } from '@/editor/workspaceSync/workspaceAuthoringOperationDispatcher';
import { createWorkspaceClientOperationId } from '@/editor/workspaceSync/workspaceOperationIdentity';

type DataManualAuthoringPanelProps = Readonly<{
  documentId?: string;
  operationId?: string;
  onApplied?(documentId: string): void;
}>;

type AuthoringMode = 'schema' | 'policy';
type Preview = Readonly<{
  proposal: DataManualAuthoringProposal;
  change: DataManualAuthoringChange;
  expectedContentRev: number;
}>;

type AuthoringSeed =
  | Readonly<{ kind: 'no-target' }>
  | Readonly<{ kind: 'policy'; operationTarget: string; draft: string }>
  | Readonly<{
      kind: 'schema';
      operationTarget: string;
      schemaTarget: string;
      schemaId: string;
      draft: string;
    }>;

const NEW_SCHEMA = '@new';

const NO_TARGET_SEED: AuthoringSeed = Object.freeze({ kind: 'no-target' });

const NEW_SCHEMA_TEMPLATE = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {},
});

const pretty = (value: unknown): string => JSON.stringify(value, null, 2);

export function DataManualAuthoringPanel({
  documentId,
  operationId,
  onApplied,
}: DataManualAuthoringPanelProps) {
  const { t } = useTranslation('editor');
  const workspace = useEditorStore((state) => state.workspace);
  const workspaceReadonly = useEditorStore((state) => state.workspaceReadonly);
  const [mode, setMode] = useState<AuthoringMode>('schema');
  const [schemaTarget, setSchemaTarget] = useState(NEW_SCHEMA);
  const [schemaId, setSchemaId] = useState('schema');
  const [operationTarget, setOperationTarget] = useState('');
  const [draft, setDraft] = useState('{}');
  const [preview, setPreview] = useState<Preview>();
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  // Keyed on the Data document itself, not the snapshot: every adopted mutation
  // hands out a new snapshot object while untouched documents keep identity.
  const workspaceDocument =
    workspace && documentId ? workspace.docsById[documentId] : undefined;
  const selected = useMemo(() => {
    if (!workspaceDocument || workspaceDocument.type !== 'data-source')
      return undefined;
    const read = decodeWorkspaceDataSourceDocument(workspaceDocument);
    return read.status === 'valid'
      ? Object.freeze({
          workspaceDocument,
          document: read.decodedContent,
        })
      : undefined;
  }, [workspaceDocument]);

  const schemaIds = useMemo(
    () => Object.keys(selected?.document.schemasById ?? {}).sort(),
    [selected]
  );
  const operationIds = useMemo(
    () => Object.keys(selected?.document.operationsById ?? {}).sort(),
    [selected]
  );

  const seed = useMemo<AuthoringSeed>(() => {
    if (!selected) return NO_TARGET_SEED;
    const operationTarget =
      (operationId && selected.document.operationsById[operationId]
        ? operationId
        : operationIds[0]) ?? '';
    if (mode === 'policy' && operationTarget) {
      return Object.freeze({
        kind: 'policy',
        operationTarget,
        draft: pretty(
          selected.document.operationsById[operationTarget]?.policies ?? {}
        ),
      });
    }
    const storedSchemaId = schemaIds[0];
    return Object.freeze({
      kind: 'schema',
      operationTarget,
      schemaTarget: storedSchemaId ?? NEW_SCHEMA,
      schemaId: storedSchemaId ?? 'schema',
      draft: pretty(
        storedSchemaId
          ? (selected.document.schemasById[storedSchemaId]?.schema ?? {})
          : NEW_SCHEMA_TEMPLATE
      ),
    });
  }, [mode, operationId, operationIds, schemaIds, selected]);

  const draftEditing = useFocusGuardedDraft(seed, (nextSeed) => {
    setPreview(undefined);
    if (nextSeed.kind === 'no-target') {
      setSchemaTarget(NEW_SCHEMA);
      setOperationTarget('');
      setDraft('{}');
      return;
    }
    setOperationTarget(nextSeed.operationTarget);
    if (nextSeed.kind === 'schema') {
      setSchemaTarget(nextSeed.schemaTarget);
      setSchemaId(nextSeed.schemaId);
    }
    setDraft(nextSeed.draft);
    setMessage('');
  });

  const selectSchema = (value: string) => {
    setSchemaTarget(value);
    setPreview(undefined);
    setMessage('');
    if (value === NEW_SCHEMA) {
      setSchemaId('schema');
      setDraft(pretty(NEW_SCHEMA_TEMPLATE));
      return;
    }
    setSchemaId(value);
    setDraft(pretty(selected?.document.schemasById[value]?.schema ?? {}));
  };

  const selectOperation = (value: string) => {
    setOperationTarget(value);
    setPreview(undefined);
    setMessage('');
    setDraft(pretty(selected?.document.operationsById[value]?.policies ?? {}));
  };

  const buildPreview = (impactApproval?: DataManualAuthoringImpact) => {
    if (!selected || !documentId) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft) as unknown;
    } catch {
      setPreview(undefined);
      setMessage(t('resourceManager.data.authoring.feedback.invalidJson'));
      return;
    }
    const change: DataManualAuthoringChange =
      mode === 'schema'
        ? Object.freeze({
            kind: 'upsert-schema',
            schema: Object.freeze({
              id: schemaId,
              schema: parsed as DataJsonSchema202012,
            }),
          })
        : Object.freeze({
            kind: 'replace-operation-policies',
            operationId: operationTarget,
            policies: parsed as DataOperationPolicies,
          });
    setPreview(
      Object.freeze({
        proposal: createDataManualAuthoringProposal({
          documentId,
          document: selected.document,
          change,
          ...(impactApproval ? { impactApproval } : {}),
        }),
        change,
        expectedContentRev: selected.workspaceDocument.contentRev,
      })
    );
    setMessage('');
  };

  const apply = async () => {
    if (
      !preview ||
      preview.proposal.status !== 'ready' ||
      !documentId ||
      !workspace
    )
      return;
    const editor = useEditorStore.getState();
    const currentWorkspace = editor.workspace;
    const current = currentWorkspace?.docsById[documentId];
    if (
      !currentWorkspace ||
      !current ||
      current.type !== 'data-source' ||
      current.contentRev !== preview.expectedContentRev
    ) {
      setMessage(t('resourceManager.data.authoring.feedback.revisionDrift'));
      return;
    }
    const command = createWorkspaceDataSourceDocumentUpdateCommand({
      workspace: currentWorkspace,
      documentId,
      after: preview.proposal.document,
      commandId: createWorkspaceClientOperationId('data-manual-authoring'),
      issuedAt: new Date().toISOString(),
      label:
        preview.change.kind === 'upsert-schema'
          ? 'Author Data Schema'
          : 'Author Data operation policies',
    });
    if (!command) {
      setMessage(t('resourceManager.data.authoring.feedback.noChange'));
      return;
    }
    setSaving(true);
    const outcome = await dispatchWorkspaceAuthoringOperation({
      workspace: currentWorkspace,
      readonly: editor.workspaceReadonly,
      operation: { kind: 'command', command },
    });
    setSaving(false);
    if (outcome.status !== 'applied') {
      setMessage(outcome.message);
      return;
    }
    setPreview(undefined);
    setMessage(t('resourceManager.data.authoring.feedback.applied'));
    onApplied?.(documentId);
  };

  return (
    <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-medium tracking-[0.1em] text-(--text-muted) uppercase">
            <FilePenLine size={14} />
            {t('resourceManager.data.authoring.badge')}
          </p>
          <h3 className="mt-2 text-sm font-medium text-(--text-primary)">
            {t('resourceManager.data.authoring.title')}
          </h3>
          <p className="mt-1 max-w-3xl text-xs text-(--text-secondary)">
            {t('resourceManager.data.authoring.description')}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-black/10 px-2.5 py-1 text-[11px] text-(--text-secondary)">
          <ShieldCheck size={12} />
          {t('resourceManager.data.authoring.canonical')}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(['schema', 'policy'] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={`rounded-xl border px-3 py-2 text-xs ${mode === candidate ? 'border-black bg-black text-white' : 'border-black/10 text-(--text-secondary)'}`}
            onClick={() => setMode(candidate)}
          >
            {t(`resourceManager.data.authoring.mode.${candidate}`)}
          </button>
        ))}
      </div>

      {!selected ? (
        <p className="mt-4 rounded-xl border border-dashed border-black/10 p-4 text-sm text-(--text-secondary)">
          {t('resourceManager.data.authoring.noTarget')}
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          {mode === 'schema' ? (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs text-(--text-secondary)">
                {t('resourceManager.data.authoring.schemaTarget')}
                <select
                  aria-label={t('resourceManager.data.authoring.schemaTarget')}
                  value={schemaTarget}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                  onChange={(event) => selectSchema(event.target.value)}
                >
                  <option value={NEW_SCHEMA}>
                    {t('resourceManager.data.authoring.newSchema')}
                  </option>
                  {schemaIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-(--text-secondary)">
                {t('resourceManager.data.authoring.schemaId')}
                <input
                  aria-label={t('resourceManager.data.authoring.schemaId')}
                  value={schemaId}
                  disabled={schemaTarget !== NEW_SCHEMA}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm disabled:bg-black/[0.03]"
                  onChange={(event) => {
                    setSchemaId(event.target.value);
                    setPreview(undefined);
                  }}
                />
              </label>
            </div>
          ) : (
            <label className="grid gap-1 text-xs text-(--text-secondary)">
              {t('resourceManager.data.authoring.operationTarget')}
              <select
                aria-label={t('resourceManager.data.authoring.operationTarget')}
                value={operationTarget}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                onChange={(event) => selectOperation(event.target.value)}
              >
                {operationIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="grid gap-1 text-xs text-(--text-secondary)">
            <span className="inline-flex items-center gap-2">
              <Braces size={13} />
              {t(`resourceManager.data.authoring.${mode}Json`)}
            </span>
            <textarea
              aria-label={t(`resourceManager.data.authoring.${mode}Json`)}
              rows={10}
              value={draft}
              spellCheck={false}
              className="resize-y rounded-xl border border-black/10 bg-black/[0.015] px-3 py-2 font-mono text-xs"
              onChange={(event) => {
                setDraft(event.target.value);
                setPreview(undefined);
                setMessage('');
              }}
              onFocus={draftEditing.beginEditing}
              onBlur={draftEditing.endEditing}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl border border-black/12 bg-black px-3 py-2 text-xs font-medium text-white"
              onClick={() => buildPreview()}
            >
              {t('resourceManager.data.authoring.preview')}
            </button>
            {preview?.proposal.status === 'impact-required' ? (
              <button
                type="button"
                className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                onClick={() => buildPreview(preview.proposal.impact)}
              >
                {t('resourceManager.data.authoring.approveImpact')}
              </button>
            ) : null}
            {preview?.proposal.status === 'ready' ? (
              <button
                type="button"
                disabled={workspaceReadonly || saving}
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 disabled:opacity-50"
                onClick={() => void apply()}
              >
                {saving
                  ? t('resourceManager.data.authoring.saving')
                  : t('resourceManager.data.authoring.apply')}
              </button>
            ) : null}
          </div>
          {preview ? (
            <div className="rounded-xl border border-black/8 p-3 text-xs">
              <strong>
                {t(
                  `resourceManager.data.authoring.status.${preview.proposal.status}`
                )}
              </strong>
              <p className="mt-1 text-(--text-secondary)">
                {t('resourceManager.data.authoring.impact', {
                  schemas: preview.proposal.impact.schemaIds.join(', ') || '-',
                  operations:
                    preview.proposal.impact.operationIds.join(', ') || '-',
                })}
              </p>
              {preview.proposal.issues.map((entry, index) => (
                <p
                  key={`${entry.code}:${entry.path}:${index}`}
                  className="mt-2 flex items-start gap-2 text-red-800"
                >
                  <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                  <span>
                    <strong>{entry.code}</strong> · {entry.path} ·{' '}
                    {entry.message}
                  </span>
                </p>
              ))}
            </div>
          ) : null}
        </div>
      )}
      {message ? (
        <p role="status" className="mt-3 text-xs text-(--text-secondary)">
          {message}
        </p>
      ) : null}
    </article>
  );
}
