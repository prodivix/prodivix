import { useCallback, useEffect, useRef } from 'react';

export type FocusGuardedDraft = Readonly<{
  beginEditing: () => void;
  endEditing: () => void;
}>;

/**
 * Single owner for "re-seed a local draft from the Workspace, unless the author
 * is typing in it right now". Every adopted Workspace mutation replaces the
 * snapshot object, so an unguarded reset effect discards uncommitted input the
 * moment an outbox ack or a background mutation lands. Call sites mark the
 * control focused and pass a `source` that compares by value, so equal data
 * never re-seeds at all.
 */
export const useFocusGuardedDraft = <TSource>(
  source: TSource,
  adoptSource: (source: TSource) => void
): FocusGuardedDraft => {
  const editingRef = useRef(false);
  const adoptRef = useRef(adoptSource);

  // Declared before the reset effect so the same commit always adopts through
  // the latest callback without making it a reset trigger itself.
  useEffect(() => {
    adoptRef.current = adoptSource;
  });

  useEffect(() => {
    if (editingRef.current) return;
    adoptRef.current(source);
  }, [source]);

  return {
    beginEditing: useCallback(() => {
      editingRef.current = true;
    }, []),
    endEditing: useCallback(() => {
      editingRef.current = false;
    }, []),
  };
};
