import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FilePlus2,
  Bug,
  ListChecks,
  Play,
  Redo2,
  Save,
  Trash2,
  Undo2,
} from 'lucide-react';
import { PdxSelect } from '@prodivix/ui';
import {
  createBehaviorRecorderDraft,
  type BehaviorRecorderDraft,
  type BehaviorRecorderRawEvent,
  type BehaviorStep,
} from '@prodivix/behavior';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  createWorkspaceBehaviorScenario,
  createWorkspaceBehaviorScenarioAuthoringPlan,
  createWorkspaceBehaviorScenarioCreatePlan,
  createWorkspaceSemanticIndexFromSnapshot,
  createWorkspaceVfsIntentPlan,
  deleteWorkspaceDocumentIntentRequest,
  selectRedoWorkspaceHistoryEntry,
  selectUndoWorkspaceHistoryEntry,
  type WorkspaceBehaviorScenarioMutation,
  type WorkspaceHistoryScope,
  type WorkspaceOperation,
} from '@prodivix/workspace';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { dispatchWorkspaceAuthoringOperation } from '@/editor/workspaceSync/workspaceAuthoringOperationDispatcher';
import { dispatchWorkspaceHistoryOperation } from '@/editor/workspaceSync/workspaceHistoryOperationDispatcher';
import { createWorkspaceClientOperationId } from '@/editor/workspaceSync/workspaceOperationIdentity';
import {
  buildBehaviorScenarioResourceModel,
  type BehaviorScenarioResourceDocument,
  type BehaviorScenarioTargetCandidate,
} from './behaviorScenarioResourceModel';
import {
  BehaviorScenarioImpactPreview,
  BehaviorScenarioOutlinePanel,
  BehaviorScenarioRecorderPanel,
  BehaviorScenarioTargetPanel,
  type BehaviorScenarioImpactPreviewModel,
} from './BehaviorScenarioResourcePanels';

export const BEHAVIOR_RECORDER_EVENT =
  'prodivix:behavior-recorder-event' as const;

const CONTROL_PROFILE_DIGEST =
  'sha256-c93c2b6ae570b032a2dd1d33c1650cd5f3cdf0efddc3d57647b966099a32dbda';
const MANUAL_ENTRY_VALUE = 'behavior-entry:manual';
const UNAVAILABLE_ENTRY_VALUE = 'behavior-entry:unavailable';

type PendingChange = BehaviorScenarioImpactPreviewModel &
  Readonly<{
    workspaceRevision: number;
    operation: WorkspaceOperation;
    documentIdAfterApply?: string;
  }>;

const readyDocument = (
  documents: readonly BehaviorScenarioResourceDocument[],
  documentId: string | undefined
) =>
  documents.find(
    (
      document
    ): document is Extract<
      BehaviorScenarioResourceDocument,
      { status: 'ready' }
    > => document.status === 'ready' && document.documentId === documentId
  ) ??
  documents.find(
    (
      document
    ): document is Extract<
      BehaviorScenarioResourceDocument,
      { status: 'ready' }
    > => document.status === 'ready'
  );

const recorderEventDetail = (event: Event): BehaviorRecorderRawEvent | null => {
  if (!(event instanceof CustomEvent) || !event.detail) return null;
  return event.detail as BehaviorRecorderRawEvent;
};

const createStepFromTarget = (
  target: BehaviorScenarioTargetCandidate,
  input: string,
  expected: string
): BehaviorStep | null => {
  const id = `step-${createWorkspaceClientOperationId('behavior-step')}`;
  if (target.action) {
    return {
      id,
      kind: 'action',
      failureMode: 'stop',
      action: {
        ...target.action,
        target: target.target,
        ...(target.action.kind === 'semantic-input'
          ? { input }
          : target.action.kind === 'dispatch-data-operation' && input
            ? { input }
            : target.action.kind === 'navigate' && input
              ? { input }
              : {}),
      },
    };
  }
  if (target.observation) {
    const expectedValue =
      target.observation === 'visible'
        ? true
        : expected.trim()
          ? expected
          : undefined;
    return {
      id,
      kind: 'observation',
      failureMode: 'stop',
      observation: {
        kind: target.observation,
        target: target.target,
        ...(expectedValue !== undefined ? { expected: expectedValue } : {}),
      },
      assertions: [
        {
          id: `assertion-${id}`,
          operator: 'equals',
          ...(expectedValue !== undefined ? { expected: expectedValue } : {}),
        },
      ],
    };
  }
  return null;
};

export function BehaviorScenarioResourcePage({
  onOpenVerification,
}: Readonly<{
  onOpenVerification?(scenarioId: string, mode: 'run' | 'debug'): void;
}> = {}) {
  const { t } = useTranslation('editor');
  const workspace = useEditorStore((state) => state.workspace);
  const workspaceReadonly = useEditorStore((state) => state.workspaceReadonly);
  const workspaceHistory = useEditorStore((state) => state.workspaceHistory);
  const setActiveDocumentId = useEditorStore(
    (state) => state.setActiveDocumentId
  );
  const model = useMemo(
    () => buildBehaviorScenarioResourceModel(workspace),
    [workspace]
  );
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>();
  const selected = readyDocument(model.documents, selectedDocumentId);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [newScenarioTargetId, setNewScenarioTargetId] = useState('');
  const [scenarioName, setScenarioName] = useState('');
  const [stepLabel, setStepLabel] = useState('');
  const [actionInput, setActionInput] = useState('');
  const [observationExpected, setObservationExpected] = useState('');
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [feedback, setFeedback] = useState('');
  const [recording, setRecording] = useState(false);
  const [recorderRevision, setRecorderRevision] = useState<number>();
  const [recorderEvents, setRecorderEvents] = useState<
    readonly BehaviorRecorderRawEvent[]
  >([]);
  const [recorderDraft, setRecorderDraft] =
    useState<BehaviorRecorderDraft | null>(null);
  const [selectedRecorderEventIds, setSelectedRecorderEventIds] = useState<
    readonly string[]
  >([]);
  const stepTargets = useMemo(
    () =>
      model.targets.filter(({ action, observation }) => action || observation),
    [model.targets]
  );
  const triggerTargets = useMemo(
    () => model.targets.filter(({ trigger }) => trigger),
    [model.targets]
  );
  const selectedEntryTarget = useMemo(() => {
    if (!selected?.scenario.entry.target) return undefined;
    return triggerTargets.find(
      ({ target, trigger }) =>
        trigger?.domain === selected.scenario.entry.domain &&
        trigger.event === selected.scenario.entry.event &&
        sameCanonicalJson(target, selected.scenario.entry.target)
    );
  }, [selected?.scenario.entry, triggerTargets]);
  const selectedEntryValue =
    selected?.scenario.entry.domain === 'scenario' &&
    selected.scenario.entry.event === 'manual' &&
    !selected.scenario.entry.target
      ? MANUAL_ENTRY_VALUE
      : (selectedEntryTarget?.id ?? UNAVAILABLE_ENTRY_VALUE);

  useEffect(() => {
    if (!selected && model.documents.length) {
      const first = model.documents.find(({ status }) => status === 'ready');
      if (first) setSelectedDocumentId(first.documentId);
    }
  }, [model.documents, selected]);

  useEffect(() => {
    setScenarioName(selected?.scenario.name ?? '');
  }, [selected?.documentId, selected?.scenario.name]);

  useEffect(() => {
    if (stepTargets.some(({ id }) => id === newScenarioTargetId)) return;
    setNewScenarioTargetId(
      stepTargets.find(({ action }) => action)?.id ?? stepTargets[0]?.id ?? ''
    );
  }, [newScenarioTargetId, stepTargets]);

  useEffect(() => {
    if (!recording) return;
    const capture = (event: Event) => {
      const detail = recorderEventDetail(event);
      if (!detail) return;
      setRecorderEvents((current) =>
        current.length >= 100 ? current : Object.freeze([...current, detail])
      );
    };
    window.addEventListener(BEHAVIOR_RECORDER_EVENT, capture);
    return () => window.removeEventListener(BEHAVIOR_RECORDER_EVENT, capture);
  }, [recording]);

  const scope: WorkspaceHistoryScope | null =
    workspace && selected
      ? {
          kind: 'document',
          workspaceId: workspace.id,
          documentId: selected.documentId,
          domain: 'behavior',
        }
      : null;
  const canUndo = Boolean(
    scope && selectUndoWorkspaceHistoryEntry(workspaceHistory, scope)
  );
  const canRedo = Boolean(
    scope && selectRedoWorkspaceHistoryEntry(workspaceHistory, scope)
  );

  const stageMutation = (mutation: WorkspaceBehaviorScenarioMutation) => {
    if (!workspace || !selected) return;
    const semantic = createWorkspaceSemanticIndexFromSnapshot(workspace);
    const plan = createWorkspaceBehaviorScenarioAuthoringPlan({
      workspace,
      expectedWorkspaceRevision: workspace.workspaceRev,
      documentId: selected.documentId,
      mutation,
      commandId: createWorkspaceClientOperationId('behavior-command'),
      transactionId: createWorkspaceClientOperationId('behavior-transaction'),
      issuedAt: new Date().toISOString(),
      ...(semantic.status === 'ready' ? { semanticIndex: semantic.index } : {}),
    });
    if (plan.status !== 'ready') {
      setFeedback(t(`resourceManager.behavior.feedback.${plan.reason}`));
      return;
    }
    setPending({
      workspaceRevision: workspace.workspaceRev,
      operation: plan.plan.operation,
      title: t(
        `resourceManager.behavior.preview.${mutation.kind.replaceAll('-', '_')}`
      ),
      addedStepIds: plan.plan.impact.addedStepIds,
      updatedStepIds: plan.plan.impact.updatedStepIds,
      removedStepIds: plan.plan.impact.removedStepIds,
      targetStatuses: plan.plan.impact.targetResolutions,
    });
    setFeedback('');
  };

  const stageCreate = () => {
    if (!workspace) return;
    const initialTarget = stepTargets.find(
      ({ id }) => id === newScenarioTargetId
    );
    const initialStep = initialTarget
      ? createStepFromTarget(initialTarget, '', '')
      : null;
    if (!initialStep) {
      setFeedback(t('resourceManager.behavior.feedback.invalid-mutation'));
      return;
    }
    const documentId = createWorkspaceClientOperationId('behavior-scenario');
    const scenario = createWorkspaceBehaviorScenario(
      documentId,
      newScenarioName,
      CONTROL_PROFILE_DIGEST,
      initialStep
    );
    const operation = createWorkspaceBehaviorScenarioCreatePlan({
      workspace,
      scenario,
      path: `/${documentId}.behavior.json`,
      commandId: createWorkspaceClientOperationId('behavior-create'),
      issuedAt: new Date().toISOString(),
    });
    if (!operation) {
      setFeedback(t('resourceManager.behavior.feedback.invalid-mutation'));
      return;
    }
    setPending({
      workspaceRevision: workspace.workspaceRev,
      operation,
      documentIdAfterApply: documentId,
      title: t('resourceManager.behavior.preview.create'),
      addedStepIds: [],
      updatedStepIds: [],
      removedStepIds: [],
      targetStatuses: [],
    });
  };

  const stageDelete = () => {
    if (!workspace || !selected) return;
    const intent = deleteWorkspaceDocumentIntentRequest({
      workspaceRev: workspace.workspaceRev,
      intentId: createWorkspaceClientOperationId('behavior-delete'),
      issuedAt: new Date().toISOString(),
      documentId: selected.documentId,
      type: 'behavior-scenario',
    });
    const plan = createWorkspaceVfsIntentPlan(workspace, intent);
    if (!plan) {
      setFeedback(t('resourceManager.behavior.feedback.invalid-mutation'));
      return;
    }
    setPending({
      workspaceRevision: workspace.workspaceRev,
      operation: { kind: 'command', command: plan.command },
      title: t('resourceManager.behavior.preview.delete'),
      addedStepIds: [],
      updatedStepIds: [],
      removedStepIds: selected.scenario.steps.map(({ id }) => id),
      targetStatuses: [],
    });
  };

  const applyPending = async () => {
    if (!workspace || !pending) return;
    if (workspace.workspaceRev !== pending.workspaceRevision) {
      setPending(null);
      setFeedback(t('resourceManager.behavior.feedback.revision-conflict'));
      return;
    }
    const outcome = await dispatchWorkspaceAuthoringOperation({
      operation: pending.operation,
      readonly: workspaceReadonly,
      workspace,
    });
    setFeedback(
      outcome.status === 'applied'
        ? t('resourceManager.behavior.feedback.applied')
        : outcome.message
    );
    if (outcome.status === 'applied') {
      if (pending.documentIdAfterApply) {
        setSelectedDocumentId(pending.documentIdAfterApply);
        setActiveDocumentId(pending.documentIdAfterApply);
        setNewScenarioName('');
      }
      setRecorderDraft(null);
      setSelectedRecorderEventIds([]);
    }
    setPending(null);
  };

  const stopRecorder = () => {
    setRecording(false);
    const draft = createBehaviorRecorderDraft({
      id: createWorkspaceClientOperationId('behavior-recorder-draft'),
      workspaceRevision: recorderRevision ?? workspace?.workspaceRev ?? 0,
      maximumEvents: 100,
      events: recorderEvents,
    });
    setRecorderDraft(draft);
    setSelectedRecorderEventIds(
      draft.events
        .filter(({ resolution }) => resolution === 'resolved')
        .map(({ id }) => id)
    );
  };

  const history = async (direction: 'undo' | 'redo') => {
    if (!scope) return;
    const outcome = await dispatchWorkspaceHistoryOperation({
      direction,
      scopes: scope,
    });
    setFeedback(
      outcome.status === 'applied'
        ? t(`resourceManager.behavior.feedback.${direction}`)
        : outcome.message
    );
  };

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
        <p className="inline-flex items-center gap-2 text-xs font-medium tracking-[0.12em] text-(--text-muted) uppercase">
          <ListChecks size={14} />
          {t('resourceManager.behavior.header.badge')}
        </p>
        <h2 className="mt-2 text-base font-medium text-(--text-primary)">
          {t('resourceManager.behavior.header.title')}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-(--text-secondary)">
          {t('resourceManager.behavior.header.description')}
        </p>
      </article>

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-4">
          <h3 className="text-sm font-medium text-(--text-primary)">
            {t('resourceManager.behavior.documents.title')}
          </h3>
          <div className="mt-3 grid gap-2">
            {model.documents.map((document) => (
              <button
                key={document.documentId}
                type="button"
                onClick={() => {
                  setSelectedDocumentId(document.documentId);
                  setActiveDocumentId(document.documentId);
                }}
                className={`rounded-xl border px-3 py-2 text-left text-sm ${
                  document.documentId === selected?.documentId
                    ? 'border-black bg-black text-white'
                    : 'border-black/10 text-(--text-secondary)'
                }`}
              >
                {document.status === 'ready'
                  ? document.scenario.name
                  : `${document.path} (${document.issueCount})`}
              </button>
            ))}
            {!model.documents.length ? (
              <p className="text-sm text-(--text-muted)">
                {t('resourceManager.behavior.documents.empty')}
              </p>
            ) : null}
          </div>
          <label className="mt-4 grid gap-1 text-xs text-(--text-secondary)">
            {t('resourceManager.behavior.create.name')}
            <input
              value={newScenarioName}
              onChange={(event) => setNewScenarioName(event.target.value)}
              className="rounded-lg border border-black/12 bg-white px-3 py-2 text-sm text-(--text-primary)"
            />
          </label>
          <PdxSelect
            className="mt-2"
            disabled={!stepTargets.length}
            label={t('resourceManager.behavior.create.initialTarget')}
            onValueChange={setNewScenarioTargetId}
            options={stepTargets.map((target) => ({
              value: target.id,
              label: `${target.label} — ${
                target.action?.kind || target.observation
              }`,
            }))}
            placeholder={t('resourceManager.behavior.create.initialTarget')}
            size="Small"
            value={newScenarioTargetId}
          />
          <button
            type="button"
            disabled={!workspace || workspaceReadonly || !newScenarioTargetId}
            onClick={stageCreate}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-40"
          >
            <FilePlus2 size={14} />
            {t('resourceManager.behavior.actions.create')}
          </button>
        </aside>

        <div className="grid gap-4">
          {selected ? (
            <>
              <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-4">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="grid min-w-60 flex-1 gap-1 text-xs text-(--text-secondary)">
                    {t('resourceManager.behavior.editor.name')}
                    <input
                      value={scenarioName}
                      onChange={(event) => setScenarioName(event.target.value)}
                      className="rounded-lg border border-black/12 bg-white px-3 py-2 text-sm text-(--text-primary)"
                    />
                  </label>
                  <PdxSelect
                    className="min-w-60 flex-1"
                    disabled={workspaceReadonly}
                    label={t('resourceManager.behavior.editor.entryTrigger')}
                    onValueChange={(value) => {
                      if (value === MANUAL_ENTRY_VALUE) {
                        stageMutation({
                          kind: 'set-entry',
                          entry: {
                            id: selected.scenario.entry.id,
                            domain: 'scenario',
                            event: 'manual',
                          },
                        });
                        return;
                      }
                      const candidate = triggerTargets.find(
                        ({ id }) => id === value
                      );
                      if (!candidate?.trigger) return;
                      stageMutation({
                        kind: 'set-entry',
                        entry: {
                          id: selected.scenario.entry.id,
                          ...candidate.trigger,
                          target: candidate.target,
                        },
                      });
                    }}
                    options={[
                      {
                        value: MANUAL_ENTRY_VALUE,
                        label: t(
                          'resourceManager.behavior.targets.manualTrigger'
                        ),
                      },
                      ...triggerTargets.map((target) => ({
                        value: target.id,
                        label: `${target.label} — ${target.trigger?.domain}.${target.trigger?.event}`,
                      })),
                      ...(selectedEntryValue === UNAVAILABLE_ENTRY_VALUE
                        ? [
                            {
                              value: UNAVAILABLE_ENTRY_VALUE,
                              label: t(
                                'resourceManager.behavior.targets.unavailableTarget'
                              ),
                              disabled: true,
                            },
                          ]
                        : []),
                    ]}
                    placeholder={t(
                      'resourceManager.behavior.editor.entryTrigger'
                    )}
                    size="Small"
                    value={selectedEntryValue}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onOpenVerification?.(selected.scenario.id, 'run')
                    }
                    className="inline-flex items-center gap-2 rounded-lg bg-black px-3 py-2 text-sm text-white"
                  >
                    <Play size={14} />
                    {t('resourceManager.behavior.actions.run')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenVerification?.(selected.scenario.id, 'debug')
                    }
                    className="inline-flex items-center gap-2 rounded-lg border border-black/12 px-3 py-2 text-sm"
                  >
                    <Bug size={14} />
                    {t('resourceManager.behavior.actions.debug')}
                  </button>
                  <button
                    type="button"
                    disabled={workspaceReadonly || !scenarioName.trim()}
                    onClick={() =>
                      stageMutation({ kind: 'rename', name: scenarioName })
                    }
                    className="inline-flex items-center gap-2 rounded-lg border border-black/12 px-3 py-2 text-sm"
                  >
                    <Save size={14} />
                    {t('resourceManager.behavior.actions.stage')}
                  </button>
                  <button
                    type="button"
                    disabled={!canUndo}
                    onClick={() => void history('undo')}
                    aria-label={t('resourceManager.behavior.actions.undo')}
                    className="rounded-lg border border-black/12 p-2 disabled:opacity-40"
                  >
                    <Undo2 size={16} />
                  </button>
                  <button
                    type="button"
                    disabled={!canRedo}
                    onClick={() => void history('redo')}
                    aria-label={t('resourceManager.behavior.actions.redo')}
                    className="rounded-lg border border-black/12 p-2 disabled:opacity-40"
                  >
                    <Redo2 size={16} />
                  </button>
                  <button
                    type="button"
                    disabled={workspaceReadonly}
                    onClick={stageDelete}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700"
                  >
                    <Trash2 size={14} />
                    {t('resourceManager.behavior.actions.delete')}
                  </button>
                </div>
              </article>

              <BehaviorScenarioOutlinePanel
                scenario={selected.scenario}
                stepLabel={stepLabel}
                onStepLabelChange={setStepLabel}
                onStageMutation={stageMutation}
              />

              <BehaviorScenarioTargetPanel
                targets={stepTargets}
                actionInput={actionInput}
                observationExpected={observationExpected}
                onActionInputChange={setActionInput}
                onObservationExpectedChange={setObservationExpected}
                onInsertTarget={(target) => {
                  const step = createStepFromTarget(
                    target,
                    actionInput,
                    observationExpected
                  );
                  if (!step) return;
                  stageMutation({
                    kind: 'insert-step',
                    index: selected.scenario.steps.length,
                    step,
                  });
                }}
              />

              <BehaviorScenarioRecorderPanel
                recording={recording}
                recordedEventCount={recorderEvents.length}
                draft={recorderDraft}
                selectedEventIds={selectedRecorderEventIds}
                onStart={() => {
                  setRecorderRevision(workspace?.workspaceRev);
                  setRecorderEvents([]);
                  setRecorderDraft(null);
                  setRecording(true);
                }}
                onStop={stopRecorder}
                onSelectionChange={setSelectedRecorderEventIds}
                onAdopt={() => {
                  if (!recorderDraft) return;
                  stageMutation({
                    kind: 'adopt-recorder',
                    draft: recorderDraft,
                    selectedEventIds: selectedRecorderEventIds,
                  });
                }}
                onCancel={() => {
                  setRecorderDraft(null);
                  setSelectedRecorderEventIds([]);
                }}
              />
            </>
          ) : (
            <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5 text-sm text-(--text-muted)">
              {t('resourceManager.behavior.editor.empty')}
            </article>
          )}
        </div>
      </div>

      {pending ? (
        <BehaviorScenarioImpactPreview
          preview={pending}
          onConfirm={() => void applyPending()}
          onCancel={() => setPending(null)}
        />
      ) : null}

      {feedback ? (
        <p role="status" className="text-sm text-(--text-secondary)">
          {feedback}
        </p>
      ) : null}
    </section>
  );
}
