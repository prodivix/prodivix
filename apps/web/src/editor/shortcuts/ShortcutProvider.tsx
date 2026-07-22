import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { isEditableEvent } from '@/shortcuts';
import { matchShortcut } from './matchShortcut';
import { getEditorShortcuts } from './shortcutRegistry';
import type { EditorShortcutScope } from './shortcutTypes';

type EditorShortcutScopeContextValue = {
  activeScopes: EditorShortcutScope[];
};

const EditorShortcutScopeContext =
  createContext<EditorShortcutScopeContextValue>({
    activeScopes: ['global'],
  });

type EditorShortcutProviderProps = {
  children: ReactNode;
};

export function EditorShortcutProvider({
  children,
}: EditorShortcutProviderProps) {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const registrations = getEditorShortcuts()
        .filter((item) => item.enabled)
        .sort((a, b) => {
          if (a.priority !== b.priority) {
            return b.priority - a.priority;
          }
          return b.scopeDepth - a.scopeDepth;
        });

      for (const registration of registrations) {
        if (!registration.allowRepeat && event.repeat) continue;
        if (!registration.allowInEditable && isEditableEvent(event)) {
          continue;
        }
        if (!matchShortcut(registration.parsed, event)) continue;
        if (registration.preventDefault) {
          event.preventDefault();
        }
        registration.handler(event);
        break;
      }
    };

    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const contextValue = useMemo<EditorShortcutScopeContextValue>(
    () => ({
      activeScopes: ['global'],
    }),
    []
  );

  return (
    <EditorShortcutScopeContext.Provider value={contextValue}>
      {children}
    </EditorShortcutScopeContext.Provider>
  );
}

type EditorShortcutScopeBoundaryProps = {
  scope: EditorShortcutScope;
  children: ReactNode;
};

export function EditorShortcutScopeBoundary({
  scope,
  children,
}: EditorShortcutScopeBoundaryProps) {
  const { activeScopes } = useContext(EditorShortcutScopeContext);
  const contextValue = useMemo<EditorShortcutScopeContextValue>(
    () => ({
      activeScopes: [...activeScopes, scope],
    }),
    [activeScopes, scope]
  );

  return (
    <EditorShortcutScopeContext.Provider value={contextValue}>
      {children}
    </EditorShortcutScopeContext.Provider>
  );
}

export const useEditorShortcutScope = () =>
  useContext(EditorShortcutScopeContext);
