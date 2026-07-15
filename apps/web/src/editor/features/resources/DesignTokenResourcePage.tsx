import { useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import {
  CircleAlert,
  FileJson2,
  Layers3,
  Palette,
  Plus,
  Save,
  Workflow,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { codeMirrorTypographyTheme } from '@/editor/codeMirrorTypography';
import { dispatchWorkspaceAuthoringOperation } from '@/editor/workspaceSync/workspaceAuthoringOperationDispatcher';
import {
  createWorkspaceDesignTokenDocumentUpdateCommand,
  createWorkspaceDesignTokenResolverDocumentUpdateCommand,
  createWorkspaceDesignTokenSystemTransactionPlan,
  createWorkspaceDocumentAtPathCommand,
  type WorkspaceDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  createAvailableDesignSystemSlug,
  listDesignTokenResourceDocuments,
  validateDesignTokenResourceSource,
} from './designTokenResourceModel';

const EMPTY_WORKSPACE_DOCUMENTS: WorkspaceSnapshot['docsById'] = {};
const jsonLanguage = javascript();

const createId = (prefix: string): string => {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${suffix}`;
};

const getDocumentLabel = (document: WorkspaceDocument): string =>
  document.name ?? document.path.split('/').at(-1) ?? document.path;

export function DesignTokenResourcePage() {
  const { t } = useTranslation('editor');
  const workspace = useEditorStore((state) => state.workspace);
  const workspaceReadonly = useEditorStore((state) => state.workspaceReadonly);
  const setActiveDocumentId = useEditorStore(
    (state) => state.setActiveDocumentId
  );
  const documentsById = workspace?.docsById ?? EMPTY_WORKSPACE_DOCUMENTS;
  const documents = useMemo(
    () => listDesignTokenResourceDocuments(documentsById),
    [documentsById]
  );
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('');
  const [source, setSource] = useState('');
  const [baseline, setBaseline] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [newSystemName, setNewSystemName] = useState(
    t('resourceManager.tokens.create.defaultName')
  );
  const [newSystemSlug, setNewSystemSlug] = useState(() =>
    createAvailableDesignSystemSlug([])
  );

  const selectedDocument = selectedDocumentId
    ? documentsById[selectedDocumentId]
    : undefined;
  const selectedType =
    selectedDocument?.type === 'design-tokens' ||
    selectedDocument?.type === 'design-token-resolver'
      ? selectedDocument.type
      : undefined;

  useEffect(() => {
    if (
      selectedDocumentId &&
      documents.some((document) => document.id === selectedDocumentId)
    ) {
      return;
    }
    const preferred =
      documents.find((document) => document.type === 'design-token-resolver') ??
      documents[0];
    setSelectedDocumentId(preferred?.id ?? '');
  }, [documents, selectedDocumentId]);

  useEffect(() => {
    if (!selectedDocument) {
      setSource('');
      setBaseline('');
      return;
    }
    const next = JSON.stringify(selectedDocument.content, null, 2);
    setSource(next);
    setBaseline(next);
    setMessage('');
  }, [
    selectedDocument?.content,
    selectedDocument?.contentRev,
    selectedDocument?.id,
  ]);

  useEffect(() => {
    const active = workspace?.activeDocumentId
      ? documentsById[workspace.activeDocumentId]
      : undefined;
    if (
      active?.type === 'design-tokens' ||
      active?.type === 'design-token-resolver'
    ) {
      setSelectedDocumentId(active.id);
    }
  }, [documentsById, workspace?.activeDocumentId]);

  const validation = useMemo(
    () =>
      selectedType
        ? validateDesignTokenResourceSource(selectedType, source)
        : null,
    [selectedType, source]
  );
  const dirty = Boolean(selectedDocument && source !== baseline);

  const selectDocument = (documentId: string) => {
    setSelectedDocumentId(documentId);
    setActiveDocumentId(documentId);
  };

  const save = async () => {
    if (
      !workspace ||
      !selectedDocument ||
      !selectedType ||
      validation?.status !== 'valid'
    ) {
      return;
    }
    const command =
      selectedType === 'design-tokens'
        ? createWorkspaceDesignTokenDocumentUpdateCommand({
            workspace,
            documentId: selectedDocument.id,
            after: validation.content,
            commandId: createId('token-update'),
            label: `Update ${selectedDocument.path}`,
          })
        : createWorkspaceDesignTokenResolverDocumentUpdateCommand({
            workspace,
            documentId: selectedDocument.id,
            after: validation.content,
            commandId: createId('token-resolver-update'),
            label: `Update ${selectedDocument.path}`,
          });
    if (!command) {
      setMessage(t('resourceManager.tokens.feedback.noChanges'));
      return;
    }
    setSaving(true);
    setMessage('');
    const outcome = await dispatchWorkspaceAuthoringOperation({
      operation: { kind: 'command', command },
      readonly: workspaceReadonly,
      workspace,
    });
    setSaving(false);
    if (outcome.status === 'rejected') {
      setMessage(outcome.message);
      return;
    }
    setBaseline(source);
    setMessage(t('resourceManager.tokens.feedback.saved'));
  };

  const createDesignSystem = async () => {
    if (!workspace) return;
    const transactionId = createId('design-system-create');
    const result = createWorkspaceDesignTokenSystemTransactionPlan({
      workspace,
      transactionId,
      issuedAt: new Date().toISOString(),
      slug: newSystemSlug,
      displayName: newSystemName,
      documentIdFactory: (role) => `${transactionId}-${role}`,
    });
    if (result.status === 'rejected') {
      setMessage(result.message);
      return;
    }
    setSaving(true);
    setMessage('');
    const outcome = await dispatchWorkspaceAuthoringOperation({
      operation: {
        kind: 'transaction',
        transaction: result.plan.transaction,
      },
      readonly: workspaceReadonly,
      workspace,
    });
    setSaving(false);
    if (outcome.status === 'rejected') {
      setMessage(outcome.message);
      return;
    }
    setSelectedDocumentId(result.plan.resolverDocumentId);
    setActiveDocumentId(result.plan.resolverDocumentId);
    const nextSlug = createAvailableDesignSystemSlug(documents, 'product');
    setNewSystemSlug(
      nextSlug === newSystemSlug ? `${newSystemSlug}-2` : nextSlug
    );
    setMessage(t('resourceManager.tokens.feedback.created'));
  };

  const createTokenFile = async () => {
    if (!workspace) return;
    const id = createId('token-document');
    const suffix = id.split('-').at(-1) ?? Date.now().toString(36);
    const document: WorkspaceDocument = {
      id,
      type: 'design-tokens',
      name: t('resourceManager.tokens.create.tokenFileName'),
      path: `/tokens/custom-${suffix}.tokens.json`,
      contentRev: 1,
      metaRev: 1,
      content: {
        scale: {
          $type: 'number',
          base: { $value: 1 },
        },
      },
    };
    let command;
    try {
      command = createWorkspaceDocumentAtPathCommand({
        workspace,
        document,
        commandId: createId('token-document-create'),
        issuedAt: new Date().toISOString(),
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t('resourceManager.tokens.feedback.createFailed')
      );
      return;
    }
    setSaving(true);
    const outcome = await dispatchWorkspaceAuthoringOperation({
      operation: { kind: 'command', command },
      readonly: workspaceReadonly,
      workspace,
    });
    setSaving(false);
    if (outcome.status === 'rejected') {
      setMessage(outcome.message);
      return;
    }
    setSelectedDocumentId(id);
    setActiveDocumentId(id);
    setMessage(t('resourceManager.tokens.feedback.tokenCreated'));
  };

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-medium tracking-[0.12em] text-(--text-muted) uppercase">
              <Palette size={14} />
              {t('resourceManager.tokens.header.badge')}
            </p>
            <h2 className="mt-2 text-base font-medium text-(--text-primary)">
              {t('resourceManager.tokens.header.title')}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-(--text-secondary)">
              {t('resourceManager.tokens.header.description')}
            </p>
          </div>
          <button
            type="button"
            disabled={workspaceReadonly || saving}
            onClick={() => void createTokenFile()}
            className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-(--text-secondary) hover:border-black/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={14} />
            {t('resourceManager.tokens.actions.newTokenFile')}
          </button>
        </div>
      </article>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="grid content-start gap-3 rounded-2xl border border-black/8 bg-(--bg-canvas) p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium tracking-[0.1em] text-(--text-muted) uppercase">
              {t('resourceManager.tokens.documents.title')}
            </p>
            <span className="rounded-full border border-black/10 px-2 py-0.5 text-[11px] text-(--text-secondary)">
              {documents.length}
            </span>
          </div>
          <div className="grid gap-1">
            {documents.map((document) => {
              const selected = document.id === selectedDocumentId;
              const Icon =
                document.type === 'design-token-resolver'
                  ? Workflow
                  : FileJson2;
              return (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => selectDocument(document.id)}
                  className={`grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-xl border px-3 py-2 text-left ${
                    selected
                      ? 'border-black/20 bg-black text-white'
                      : 'border-transparent text-(--text-secondary) hover:border-black/10 hover:bg-black/[0.02]'
                  }`}
                >
                  <Icon size={14} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">
                      {getDocumentLabel(document)}
                    </span>
                    <span
                      className={`block truncate text-[11px] ${selected ? 'text-white/65' : 'text-(--text-muted)'}`}
                    >
                      {document.path}
                    </span>
                  </span>
                </button>
              );
            })}
            {documents.length === 0 ? (
              <p className="rounded-xl border border-dashed border-black/10 px-3 py-4 text-xs text-(--text-muted)">
                {t('resourceManager.tokens.documents.empty')}
              </p>
            ) : null}
          </div>
        </aside>

        <article className="min-w-0 overflow-hidden rounded-2xl border border-black/8 bg-(--bg-canvas)">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/8 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-(--text-primary)">
                {selectedDocument
                  ? getDocumentLabel(selectedDocument)
                  : t('resourceManager.tokens.editor.emptyTitle')}
              </p>
              <p className="truncate text-xs text-(--text-muted)">
                {selectedDocument?.path ??
                  t('resourceManager.tokens.editor.emptyDescription')}
              </p>
            </div>
            <button
              type="button"
              disabled={
                workspaceReadonly ||
                saving ||
                !dirty ||
                validation?.status !== 'valid'
              }
              onClick={() => void save()}
              className="inline-flex items-center gap-2 rounded-xl bg-black px-3 py-2 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save size={14} />
              {saving
                ? t('resourceManager.tokens.actions.saving')
                : t('resourceManager.tokens.actions.save')}
            </button>
          </div>
          {selectedDocument ? (
            <CodeMirror
              value={source}
              height="620px"
              extensions={[jsonLanguage, codeMirrorTypographyTheme]}
              onChange={setSource}
              basicSetup={{
                foldGutter: true,
                lineNumbers: true,
                highlightActiveLine: true,
              }}
            />
          ) : (
            <div className="grid min-h-96 place-items-center px-6 text-center text-sm text-(--text-muted)">
              {t('resourceManager.tokens.editor.emptyDescription')}
            </div>
          )}
          {validation?.status === 'invalid' ? (
            <div className="flex items-start gap-2 border-t border-red-200 bg-red-50 px-4 py-3 text-xs whitespace-pre-wrap text-red-800">
              <CircleAlert size={14} className="mt-0.5 shrink-0" />
              {validation.message}
            </div>
          ) : message ? (
            <div className="border-t border-black/8 bg-black/[0.02] px-4 py-3 text-xs text-(--text-secondary)">
              {message}
            </div>
          ) : null}
        </article>

        <aside className="grid content-start gap-4">
          <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-4">
            <p className="inline-flex items-center gap-2 text-xs font-medium tracking-[0.1em] text-(--text-muted) uppercase">
              <Layers3 size={14} />
              {t('resourceManager.tokens.summary.title')}
            </p>
            {validation?.status === 'valid' ? (
              validation.summary.kind === 'tokens' ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    [
                      t('resourceManager.tokens.summary.groups'),
                      validation.summary.groups,
                    ],
                    [
                      t('resourceManager.tokens.summary.tokens'),
                      validation.summary.tokens,
                    ],
                    [
                      t('resourceManager.tokens.summary.aliases'),
                      validation.summary.aliases,
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={String(label)}
                      className="rounded-xl border border-black/8 bg-black/[0.015] px-3 py-2"
                    >
                      <p className="text-[10px] text-(--text-muted) uppercase">
                        {label}
                      </p>
                      <p className="mt-1 text-sm font-medium text-(--text-primary)">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 grid gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      [
                        t('resourceManager.tokens.summary.sets'),
                        validation.summary.sets,
                      ],
                      [
                        t('resourceManager.tokens.summary.modifiers'),
                        validation.summary.modifiers,
                      ],
                      [
                        t('resourceManager.tokens.summary.contexts'),
                        validation.summary.contexts,
                      ],
                      [
                        t('resourceManager.tokens.summary.permutations'),
                        validation.summary.permutations,
                      ],
                    ].map(([label, value]) => (
                      <div
                        key={String(label)}
                        className="rounded-xl border border-black/8 bg-black/[0.015] px-3 py-2"
                      >
                        <p className="text-[10px] text-(--text-muted) uppercase">
                          {label}
                        </p>
                        <p className="mt-1 text-sm font-medium text-(--text-primary)">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                  {validation.summary.resolver.modifiers.map((modifier) => (
                    <div
                      key={modifier.name}
                      className="rounded-xl border border-black/8 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs font-medium text-(--text-primary)">
                        <span>{modifier.name}</span>
                        <span className="text-[10px] text-(--text-muted)">
                          {modifier.contexts.length}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {modifier.contexts.map((context) => (
                          <span
                            key={context.name}
                            className={`rounded-full border px-2 py-0.5 text-[10px] ${
                              context.name === modifier.defaultContext
                                ? 'border-black bg-black text-white'
                                : 'border-black/10 text-(--text-secondary)'
                            }`}
                          >
                            {context.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <p className="mt-3 text-xs text-(--text-muted)">
                {t('resourceManager.tokens.summary.unavailable')}
              </p>
            )}
          </article>

          <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-4">
            <p className="text-xs font-medium tracking-[0.1em] text-(--text-muted) uppercase">
              {t('resourceManager.tokens.create.title')}
            </p>
            <p className="mt-2 text-xs text-(--text-secondary)">
              {t('resourceManager.tokens.create.description')}
            </p>
            <label className="mt-3 grid gap-1 text-xs text-(--text-secondary)">
              {t('resourceManager.tokens.create.name')}
              <input
                value={newSystemName}
                onChange={(event) => setNewSystemName(event.target.value)}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-(--text-primary) outline-none focus:border-black/30"
              />
            </label>
            <label className="mt-2 grid gap-1 text-xs text-(--text-secondary)">
              {t('resourceManager.tokens.create.slug')}
              <input
                value={newSystemSlug}
                onChange={(event) => setNewSystemSlug(event.target.value)}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 font-mono text-xs text-(--text-primary) outline-none focus:border-black/30"
              />
            </label>
            <button
              type="button"
              disabled={workspaceReadonly || saving}
              onClick={() => void createDesignSystem()}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-black px-3 py-2 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={14} />
              {t('resourceManager.tokens.actions.createSystem')}
            </button>
          </article>
        </aside>
      </div>
    </section>
  );
}
