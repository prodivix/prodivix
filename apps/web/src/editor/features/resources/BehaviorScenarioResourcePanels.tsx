import { CircleDot, MoveDown, MoveUp, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  BehaviorRecorderDraft,
  BehaviorScenario,
} from '@prodivix/behavior';
import type { WorkspaceBehaviorScenarioMutation } from '@prodivix/workspace';
import type { BehaviorScenarioTargetCandidate } from './behaviorScenarioResourceModel';

export type BehaviorScenarioImpactPreviewModel = Readonly<{
  title: string;
  addedStepIds: readonly string[];
  updatedStepIds: readonly string[];
  removedStepIds: readonly string[];
  targetStatuses: readonly Readonly<{ stepId: string; status: string }>[];
}>;

export function BehaviorScenarioOutlinePanel({
  scenario,
  stepLabel,
  onStepLabelChange,
  onStageMutation,
}: Readonly<{
  scenario: BehaviorScenario;
  stepLabel: string;
  onStepLabelChange(value: string): void;
  onStageMutation(mutation: WorkspaceBehaviorScenarioMutation): void;
}>) {
  const { t } = useTranslation('editor');
  return (
    <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-4">
      <h3 className="text-sm font-medium text-(--text-primary)">
        {t('resourceManager.behavior.outline.title')}
      </h3>
      <div className="mt-3 grid gap-2">
        {scenario.steps.map((step, index) => (
          <div
            key={step.id}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-black/10 px-3 py-2"
          >
            <span className="min-w-0 flex-1 text-sm text-(--text-primary)">
              {step.label || step.id}
              <span className="ml-2 text-xs text-(--text-muted)">
                {step.kind}
              </span>
            </span>
            <button
              type="button"
              disabled={index === 0}
              onClick={() =>
                onStageMutation({
                  kind: 'move-step',
                  stepId: step.id,
                  index: index - 1,
                })
              }
              aria-label={t('resourceManager.behavior.actions.moveUp')}
              title={t('resourceManager.behavior.actions.moveUp')}
              className="rounded-md border border-black/10 p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-30"
            >
              <MoveUp size={14} />
            </button>
            <button
              type="button"
              disabled={index === scenario.steps.length - 1}
              onClick={() =>
                onStageMutation({
                  kind: 'move-step',
                  stepId: step.id,
                  index: index + 1,
                })
              }
              aria-label={t('resourceManager.behavior.actions.moveDown')}
              title={t('resourceManager.behavior.actions.moveDown')}
              className="rounded-md border border-black/10 p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-30"
            >
              <MoveDown size={14} />
            </button>
            <button
              type="button"
              onClick={() => {
                const label = stepLabel.trim();
                if (!label) return;
                onStageMutation({
                  kind: 'update-step',
                  stepId: step.id,
                  step: { ...step, label },
                });
                onStepLabelChange('');
              }}
              className="rounded-md border border-black/10 px-2 py-1 text-xs"
            >
              {t('resourceManager.behavior.actions.applyLabel')}
            </button>
            <button
              type="button"
              onClick={() =>
                onStageMutation({
                  kind: 'remove-step',
                  stepId: step.id,
                })
              }
              aria-label={t('resourceManager.behavior.actions.removeStep')}
              title={t('resourceManager.behavior.actions.removeStep')}
              className="rounded-md border border-red-200 p-1.5 text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {!scenario.steps.length ? (
          <p className="text-sm text-(--text-muted)">
            {t('resourceManager.behavior.outline.empty')}
          </p>
        ) : null}
      </div>
      <label className="mt-3 grid gap-1 text-xs text-(--text-secondary)">
        {t('resourceManager.behavior.editor.stepLabel')}
        <input
          value={stepLabel}
          onChange={(event) => onStepLabelChange(event.target.value)}
          className="rounded-lg border border-black/12 bg-white px-3 py-2 text-sm text-(--text-primary)"
        />
      </label>
    </article>
  );
}

export function BehaviorScenarioTargetPanel({
  targets,
  actionInput,
  observationExpected,
  onActionInputChange,
  onObservationExpectedChange,
  onInsertTarget,
}: Readonly<{
  targets: readonly BehaviorScenarioTargetCandidate[];
  actionInput: string;
  observationExpected: string;
  onActionInputChange(value: string): void;
  onObservationExpectedChange(value: string): void;
  onInsertTarget(target: BehaviorScenarioTargetCandidate): void;
}>) {
  const { t } = useTranslation('editor');
  return (
    <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-4">
      <h3 className="text-sm font-medium text-(--text-primary)">
        {t('resourceManager.behavior.targets.title')}
      </h3>
      <p className="mt-1 text-xs text-(--text-muted)">
        {t('resourceManager.behavior.targets.description')}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-(--text-secondary)">
          {t('resourceManager.behavior.editor.actionInput')}
          <input
            value={actionInput}
            onChange={(event) => onActionInputChange(event.target.value)}
            className="rounded-lg border border-black/12 bg-white px-3 py-2 text-sm text-(--text-primary)"
          />
        </label>
        <label className="grid gap-1 text-xs text-(--text-secondary)">
          {t('resourceManager.behavior.editor.expected')}
          <input
            value={observationExpected}
            onChange={(event) =>
              onObservationExpectedChange(event.target.value)
            }
            className="rounded-lg border border-black/12 bg-white px-3 py-2 text-sm text-(--text-primary)"
          />
        </label>
      </div>
      <div className="mt-3 grid max-h-72 gap-2 overflow-auto">
        {targets.map((target) => (
          <button
            key={target.id}
            type="button"
            onClick={() => onInsertTarget(target)}
            className="flex items-center justify-between gap-3 rounded-xl border border-black/10 px-3 py-2 text-left text-sm"
          >
            <span className="min-w-0 truncate text-(--text-primary)">
              {target.label}
            </span>
            <span className="shrink-0 text-xs text-(--text-muted)">
              {target.action?.kind || target.observation}
            </span>
          </button>
        ))}
        {!targets.length ? (
          <p className="text-sm text-(--text-muted)">
            {t('resourceManager.behavior.targets.empty')}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function BehaviorScenarioRecorderPanel({
  recording,
  recordedEventCount,
  draft,
  selectedEventIds,
  onStart,
  onStop,
  onSelectionChange,
  onAdopt,
  onCancel,
}: Readonly<{
  recording: boolean;
  recordedEventCount: number;
  draft: BehaviorRecorderDraft | null;
  selectedEventIds: readonly string[];
  onStart(): void;
  onStop(): void;
  onSelectionChange(ids: readonly string[]): void;
  onAdopt(): void;
  onCancel(): void;
}>) {
  const { t } = useTranslation('editor');
  return (
    <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-(--text-primary)">
            {t('resourceManager.behavior.recorder.title')}
          </h3>
          <p className="mt-1 text-xs text-(--text-muted)">
            {t('resourceManager.behavior.recorder.description')}
          </p>
        </div>
        {!recording ? (
          <button
            type="button"
            onClick={onStart}
            className="inline-flex items-center gap-2 rounded-lg bg-black px-3 py-2 text-sm text-white"
          >
            <CircleDot size={14} />
            {t('resourceManager.behavior.actions.record')}
          </button>
        ) : (
          <button
            type="button"
            onClick={onStop}
            className="rounded-lg border border-black/12 px-3 py-2 text-sm"
          >
            {t('resourceManager.behavior.actions.stop')}
          </button>
        )}
      </div>
      {recording ? (
        <p
          role="status"
          className="mt-3 rounded-lg bg-black px-3 py-2 text-sm text-white"
        >
          {t('resourceManager.behavior.recorder.recording', {
            count: recordedEventCount,
          })}
        </p>
      ) : null}
      {draft ? (
        <div className="mt-3 grid gap-2">
          <p className="text-xs text-(--text-muted)">
            {t('resourceManager.behavior.recorder.summary', {
              count: draft.events.length,
              truncated: draft.truncatedEventCount,
            })}
          </p>
          {draft.events.map((event) => (
            <label
              key={event.id}
              className="flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={selectedEventIds.includes(event.id)}
                disabled={event.resolution !== 'resolved'}
                onChange={(change) =>
                  onSelectionChange(
                    change.target.checked
                      ? [...selectedEventIds, event.id]
                      : selectedEventIds.filter((id) => id !== event.id)
                  )
                }
              />
              <span className="flex-1">{event.id}</span>
              <span className="text-xs text-(--text-muted)">
                {event.resolution}
              </span>
            </label>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onAdopt}
              className="rounded-lg bg-black px-3 py-2 text-sm text-white"
            >
              {t('resourceManager.behavior.actions.adopt')}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-black/12 px-3 py-2 text-sm"
            >
              {t('resourceManager.behavior.actions.cancel')}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function BehaviorScenarioImpactPreview({
  preview,
  onConfirm,
  onCancel,
}: Readonly<{
  preview: BehaviorScenarioImpactPreviewModel;
  onConfirm(): void;
  onCancel(): void;
}>) {
  const { t } = useTranslation('editor');
  return (
    <article
      aria-label={t('resourceManager.behavior.preview.title')}
      className="rounded-2xl border border-black/16 bg-white p-5 shadow-[0_16px_40px_rgba(0,0,0,0.08)]"
    >
      <h3 className="text-sm font-medium text-(--text-primary)">
        {t('resourceManager.behavior.preview.title')}: {preview.title}
      </h3>
      <div className="mt-3 grid gap-1 text-sm text-(--text-secondary)">
        <p>
          {t('resourceManager.behavior.preview.added', {
            value: preview.addedStepIds.join(', ') || '—',
          })}
        </p>
        <p>
          {t('resourceManager.behavior.preview.updated', {
            value: preview.updatedStepIds.join(', ') || '—',
          })}
        </p>
        <p>
          {t('resourceManager.behavior.preview.removed', {
            value: preview.removedStepIds.join(', ') || '—',
          })}
        </p>
        {preview.targetStatuses.map((target) => (
          <p key={target.stepId}>
            {target.stepId}: {target.status}
          </p>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-lg bg-black px-3 py-2 text-sm text-white"
        >
          {t('resourceManager.behavior.actions.confirm')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-black/12 px-3 py-2 text-sm"
        >
          {t('resourceManager.behavior.actions.cancel')}
        </button>
      </div>
    </article>
  );
}
