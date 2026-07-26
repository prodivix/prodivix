import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TriggerEntry } from '@/editor/features/blueprint/editor/inspector/InspectorContext.types';
import {
  createNewTriggerDraft,
  getTriggerDraftIssue,
  type TriggerAuthoringIssue,
} from './triggerAuthoring';

type UseTriggerDraftAuthoringInput = Readonly<{
  ownerKey?: string;
  readOnly: boolean;
  canonicalEntries: readonly TriggerEntry[];
  onCommit: (draft: TriggerEntry) => Promise<boolean>;
  onIssue?: (issue: TriggerAuthoringIssue) => void;
}>;

/**
 * Keeps incomplete Trigger edits outside Canonical Workspace until the user
 * explicitly saves a valid draft.
 */
export const useTriggerDraftAuthoring = ({
  ownerKey,
  readOnly,
  canonicalEntries,
  onCommit,
  onIssue,
}: UseTriggerDraftAuthoringInput) => {
  const [draft, setDraft] = useState<TriggerEntry | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(null);
    setSaving(false);
  }, [ownerKey]);

  const entries = useMemo<TriggerEntry[]>(() => {
    if (!draft) return [...canonicalEntries];
    const pendingDraft = { ...draft, saving };
    const lockedCanonicalEntries = canonicalEntries.map((entry) =>
      entry.key === draft.sourceKey ? pendingDraft : { ...entry, locked: true }
    );
    if (
      !draft.sourceKey ||
      !canonicalEntries.some((entry) => entry.key === draft.sourceKey)
    ) {
      lockedCanonicalEntries.push(pendingDraft);
    }
    return lockedCanonicalEntries;
  }, [canonicalEntries, draft, saving]);

  const add = useCallback(() => {
    if (readOnly || draft || saving) return;
    const nextDraft = createNewTriggerDraft(canonicalEntries);
    if (!nextDraft) {
      onIssue?.('all-events-used');
      return;
    }
    setDraft(nextDraft);
  }, [canonicalEntries, draft, onIssue, readOnly, saving]);

  const update = useCallback(
    (triggerKey: string, updater: (event: TriggerEntry) => TriggerEntry) => {
      if (readOnly || saving) return;
      setDraft((currentDraft) => {
        if (currentDraft) {
          if (currentDraft.key !== triggerKey) return currentDraft;
          const next = updater(currentDraft);
          return {
            ...next,
            key: currentDraft.key,
            editable: true,
            draft: true,
            ...(currentDraft.sourceKey
              ? { sourceKey: currentDraft.sourceKey }
              : {}),
          };
        }
        const source = canonicalEntries.find(
          (entry) => entry.key === triggerKey
        );
        if (!source || source.editable === false) return currentDraft;
        const next = updater(source);
        return {
          ...next,
          key: source.key,
          editable: true,
          draft: true,
          sourceKey: source.key,
        };
      });
    },
    [canonicalEntries, readOnly, saving]
  );

  const cancel = useCallback(
    (triggerKey: string) => {
      if (saving) return;
      setDraft((currentDraft) =>
        currentDraft?.key === triggerKey ? null : currentDraft
      );
    },
    [saving]
  );

  const save = useCallback(
    (triggerKey: string) => {
      if (readOnly || saving || !draft || draft.key !== triggerKey) {
        return;
      }
      const issue = getTriggerDraftIssue(draft, canonicalEntries);
      if (issue) {
        onIssue?.(issue);
        return;
      }
      const candidate = draft;
      setSaving(true);
      void (async () => {
        try {
          const applied = await onCommit(candidate);
          if (applied) {
            setDraft((currentDraft) =>
              currentDraft === candidate ? null : currentDraft
            );
          }
        } catch {
          onIssue?.('save-failed');
        } finally {
          setSaving(false);
        }
      })();
    },
    [canonicalEntries, draft, onCommit, onIssue, readOnly, saving]
  );

  return {
    entries,
    hasDraft: Boolean(draft),
    add,
    update,
    cancel,
    save,
  };
};
