import { useEffect, useMemo, useRef, useState } from 'react';
import type { CodeArtifact, CodeLanguageSession } from '@prodivix/authoring';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { createWorkspaceCodeLanguageEnvironment } from './workspaceCodeLanguageEnvironment';

export type WorkspaceCodeLanguageSessionState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'loading'; artifact: CodeArtifact }>
  | Readonly<{
      status: 'ready';
      artifact: CodeArtifact;
      source: string;
      session: CodeLanguageSession;
    }>
  | Readonly<{
      status: 'unsupported';
      artifact: CodeArtifact;
      reason: string;
    }>
  | Readonly<{
      status: 'unavailable';
      artifact: CodeArtifact;
      reason: string;
    }>;

const hashDraftSource = (source: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const createWorkspaceCodeDraftRevision = (
  canonicalRevision: string,
  source: string
): string => `${canonicalRevision}:draft:${hashDraftSource(source)}`;

/** Atomically replaces immutable views while the provider keeps its engine alive. */
export const useWorkspaceCodeLanguageSession = (input: {
  workspace: WorkspaceSnapshot | null;
  artifactId?: string;
  source: string;
}): WorkspaceCodeLanguageSessionState => {
  const environment = useMemo(
    () =>
      input.workspace
        ? createWorkspaceCodeLanguageEnvironment(input.workspace)
        : null,
    [input.workspace]
  );
  const artifact = useMemo(
    () =>
      environment?.artifacts.find(({ id }) => id === input.artifactId) ?? null,
    [environment, input.artifactId]
  );
  const [state, setState] = useState<WorkspaceCodeLanguageSessionState>({
    status: 'idle',
  });
  const activeSessionRef = useRef<{
    targetKey: string;
    session: CodeLanguageSession;
  } | null>(null);

  useEffect(() => {
    if (!environment || !artifact) {
      activeSessionRef.current?.session.dispose();
      activeSessionRef.current = null;
      setState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    const targetKey = `${input.workspace?.id ?? ''}\u0000${artifact.id}`;
    if (activeSessionRef.current?.targetKey !== targetKey) {
      activeSessionRef.current?.session.dispose();
      activeSessionRef.current = null;
      setState({ status: 'loading', artifact });
    }
    const source = input.source;
    const isDraft = source !== artifact.source;
    const timer = window.setTimeout(
      () => {
        void environment
          .openSession({
            language: artifact.language,
            capability: 'completion',
            ...(isDraft
              ? {
                  draft: {
                    artifactId: artifact.id,
                    source,
                    revision: createWorkspaceCodeDraftRevision(
                      artifact.revision,
                      source
                    ),
                  },
                }
              : {}),
          })
          .then((result) => {
            if (cancelled) {
              if (result.status === 'ready') result.session.dispose();
              return;
            }
            if (result.status === 'ready') {
              const previousSession = activeSessionRef.current?.session;
              activeSessionRef.current = {
                targetKey,
                session: result.session,
              };
              setState({
                status: 'ready',
                artifact,
                source,
                session: result.session,
              });
              if (previousSession !== result.session) {
                previousSession?.dispose();
              }
              return;
            }
            activeSessionRef.current?.session.dispose();
            activeSessionRef.current = null;
            if (result.status === 'unsupported') {
              setState({
                status: 'unsupported',
                artifact,
                reason: `No ${result.language} provider supports ${result.capability}.`,
              });
              return;
            }
            setState({
              status: 'unavailable',
              artifact,
              reason: result.reason,
            });
          });
      },
      isDraft ? 120 : 0
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [artifact, environment, input.source, input.workspace?.id]);

  useEffect(
    () => () => {
      activeSessionRef.current?.session.dispose();
      activeSessionRef.current = null;
    },
    []
  );

  return state;
};
