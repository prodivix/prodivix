import type { DiagnosticTargetRef, SourceSpan } from '@prodivix/diagnostics';
import type { AuthoringSurface } from './authoring.types';

export const CODE_AUTHORING_CAPABILITIES = [
  'edit-source',
  'save-source',
  'semantic-navigation',
  'refactor-symbol',
  'relocate-artifact',
  'configure-compile',
  'manage-artifacts',
  'inspect-bindings',
] as const;

export type CodeAuthoringCapability =
  (typeof CODE_AUTHORING_CAPABILITIES)[number];

export type CodeAuthoringPresentation =
  'compact' | 'maximized' | 'workspace' | 'embedded';

export type CodeAuthoringOriginSurface =
  AuthoringSurface | 'code-workspace' | 'execution-center' | 'resources';

export type CodeAuthoringOrigin = Readonly<{
  surface: CodeAuthoringOriginSurface;
  targetRef?: DiagnosticTargetRef;
}>;

export type CodeAuthoringRequest = Readonly<{
  requestId: string;
  workspaceId: string;
  presentation: CodeAuthoringPresentation;
  artifactId?: string;
  sourceSpan?: SourceSpan;
  slotId?: string;
  origin: CodeAuthoringOrigin;
  capabilityIds: readonly CodeAuthoringCapability[];
}>;

export type CodeAuthoringRequestInput = Omit<
  CodeAuthoringRequest,
  'artifactId' | 'capabilityIds' | 'sourceSpan'
> &
  Readonly<{
    artifactId?: string;
    sourceSpan?: SourceSpan;
    capabilityIds?: readonly CodeAuthoringCapability[];
  }>;

const FULL_CODE_AUTHORING_CAPABILITIES = Object.freeze([
  ...CODE_AUTHORING_CAPABILITIES,
]);

const COMPACT_CODE_AUTHORING_CAPABILITIES = Object.freeze<
  CodeAuthoringCapability[]
>(['edit-source', 'save-source', 'semantic-navigation']);

export const getDefaultCodeAuthoringCapabilities = (
  presentation: CodeAuthoringPresentation
): readonly CodeAuthoringCapability[] =>
  presentation === 'compact'
    ? COMPACT_CODE_AUTHORING_CAPABILITIES
    : FULL_CODE_AUTHORING_CAPABILITIES;

const normalizeCapabilities = (
  capabilityIds: readonly CodeAuthoringCapability[]
): readonly CodeAuthoringCapability[] => {
  const selected = new Set(capabilityIds);
  return Object.freeze(
    CODE_AUTHORING_CAPABILITIES.filter((capabilityId) =>
      selected.has(capabilityId)
    )
  );
};

/** Creates the immutable context shared by every Code Authoring surface. */
export const createCodeAuthoringRequest = (
  input: CodeAuthoringRequestInput
): CodeAuthoringRequest => {
  const requestId = input.requestId.trim();
  const workspaceId = input.workspaceId.trim();
  const artifactId = input.artifactId?.trim() || input.sourceSpan?.artifactId;
  if (!requestId)
    throw new Error('CodeAuthoringRequest.requestId is required.');
  if (!workspaceId) {
    throw new Error('CodeAuthoringRequest.workspaceId is required.');
  }
  if (
    input.sourceSpan &&
    artifactId &&
    input.sourceSpan.artifactId !== artifactId
  ) {
    throw new Error(
      'CodeAuthoringRequest.sourceSpan must target the requested artifact.'
    );
  }
  if (
    (input.presentation === 'compact' || input.presentation === 'maximized') &&
    !artifactId
  ) {
    throw new Error(
      `CodeAuthoringRequest.${input.presentation} requires an artifact.`
    );
  }
  if (input.slotId && !artifactId) {
    throw new Error('A CodeSlot request requires a resolved artifact.');
  }

  return Object.freeze({
    requestId,
    workspaceId,
    presentation: input.presentation,
    ...(artifactId ? { artifactId } : {}),
    ...(input.sourceSpan
      ? { sourceSpan: Object.freeze({ ...input.sourceSpan }) }
      : {}),
    ...(input.slotId ? { slotId: input.slotId } : {}),
    origin: Object.freeze({
      ...input.origin,
      ...(input.origin.targetRef
        ? { targetRef: Object.freeze({ ...input.origin.targetRef }) }
        : {}),
    }),
    capabilityIds: normalizeCapabilities(
      input.capabilityIds ??
        getDefaultCodeAuthoringCapabilities(input.presentation)
    ),
  });
};

export const hasCodeAuthoringCapability = (
  request: CodeAuthoringRequest,
  capabilityId: CodeAuthoringCapability
): boolean => request.capabilityIds.includes(capabilityId);

export type CodeAuthoringArtifactSnapshot = Readonly<{
  artifactId: string;
  revision: string;
  source: string;
}>;

export type CodeAuthoringDraft = Readonly<{
  baseline: CodeAuthoringArtifactSnapshot;
  canonical: CodeAuthoringArtifactSnapshot;
  source: string;
}>;

export type CodeAuthoringSessionError = Readonly<{
  message: string;
  artifactId?: string;
}>;

/**
 * Framework-neutral session state. Drafts are keyed by stable artifact identity
 * so switching files never discards local source, while canonical changes remain
 * explicit until the draft is saved or discarded.
 */
export type CodeAuthoringSession = Readonly<{
  request: CodeAuthoringRequest;
  activeArtifactId?: string;
  draftsByArtifactId: Readonly<Record<string, CodeAuthoringDraft>>;
  savingArtifactId?: string;
  error?: CodeAuthoringSessionError;
}>;

const freezeArtifactSnapshot = (
  artifact: CodeAuthoringArtifactSnapshot
): CodeAuthoringArtifactSnapshot => Object.freeze({ ...artifact });

const freezeDraft = (draft: CodeAuthoringDraft): CodeAuthoringDraft =>
  Object.freeze({
    baseline: freezeArtifactSnapshot(draft.baseline),
    canonical: freezeArtifactSnapshot(draft.canonical),
    source: draft.source,
  });

export const createCodeAuthoringSession = (
  request: CodeAuthoringRequest
): CodeAuthoringSession =>
  Object.freeze({
    request,
    draftsByArtifactId: Object.freeze({}),
  });

export const synchronizeCodeAuthoringSessionRequest = (
  session: CodeAuthoringSession,
  request: CodeAuthoringRequest
): CodeAuthoringSession => {
  if (session.request === request) return session;
  if (session.request.requestId !== request.requestId) {
    return createCodeAuthoringSession(request);
  }
  return Object.freeze({ ...session, request });
};

export const getActiveCodeAuthoringDraft = (
  session: CodeAuthoringSession
): CodeAuthoringDraft | null =>
  session.activeArtifactId
    ? (getOwnDraft(session, session.activeArtifactId) ?? null)
    : null;

const getOwnDraft = (session: CodeAuthoringSession, artifactId: string) =>
  Object.hasOwn(session.draftsByArtifactId, artifactId)
    ? session.draftsByArtifactId[artifactId]
    : undefined;

export const isCodeAuthoringDraftDirty = (draft: CodeAuthoringDraft): boolean =>
  draft.source !== draft.baseline.source;

export const isCodeAuthoringDraftStale = (draft: CodeAuthoringDraft): boolean =>
  draft.canonical.source !== draft.baseline.source;

export const isCodeAuthoringSessionDirty = (
  session: CodeAuthoringSession,
  artifactId?: string
): boolean => {
  if (artifactId) {
    const draft = getOwnDraft(session, artifactId);
    return draft ? isCodeAuthoringDraftDirty(draft) : false;
  }
  return Object.values(session.draftsByArtifactId).some(
    isCodeAuthoringDraftDirty
  );
};

export const reconcileCodeAuthoringSessionArtifact = (
  session: CodeAuthoringSession,
  artifact: CodeAuthoringArtifactSnapshot | null
): CodeAuthoringSession => {
  if (!artifact) {
    return session.activeArtifactId
      ? Object.freeze({
          ...session,
          activeArtifactId: undefined,
          error: undefined,
        })
      : session;
  }
  const canonical = freezeArtifactSnapshot(artifact);
  const current = getOwnDraft(session, artifact.artifactId);
  let nextDraft: CodeAuthoringDraft;
  if (!current) {
    nextDraft = freezeDraft({
      baseline: canonical,
      canonical,
      source: canonical.source,
    });
  } else if (
    current.canonical.revision === canonical.revision &&
    current.canonical.source === canonical.source
  ) {
    nextDraft = current;
  } else if (
    !isCodeAuthoringDraftDirty(current) ||
    current.source === canonical.source
  ) {
    nextDraft = freezeDraft({
      baseline: canonical,
      canonical,
      source: canonical.source,
    });
  } else if (current.canonical.source === canonical.source) {
    nextDraft = freezeDraft({
      baseline: Object.freeze({
        ...canonical,
        source: current.baseline.source,
      }),
      canonical,
      source: current.source,
    });
  } else {
    nextDraft = freezeDraft({
      baseline: current.baseline,
      canonical,
      source: current.source,
    });
  }

  if (
    session.activeArtifactId === artifact.artifactId &&
    nextDraft === current
  ) {
    return session;
  }
  return Object.freeze({
    ...session,
    activeArtifactId: artifact.artifactId,
    error:
      session.error?.artifactId &&
      session.error.artifactId !== artifact.artifactId
        ? undefined
        : session.error,
    draftsByArtifactId: Object.freeze({
      ...session.draftsByArtifactId,
      [artifact.artifactId]: nextDraft,
    }),
  });
};

export const updateCodeAuthoringSessionDraft = (
  session: CodeAuthoringSession,
  source: string
): CodeAuthoringSession => {
  const artifactId = session.activeArtifactId;
  const current = artifactId ? getOwnDraft(session, artifactId) : undefined;
  if (!artifactId || !current || current.source === source) return session;
  return Object.freeze({
    ...session,
    error: undefined,
    draftsByArtifactId: Object.freeze({
      ...session.draftsByArtifactId,
      [artifactId]: freezeDraft({ ...current, source }),
    }),
  });
};

export const discardCodeAuthoringSessionDraft = (
  session: CodeAuthoringSession,
  artifactId = session.activeArtifactId
): CodeAuthoringSession => {
  const current = artifactId ? getOwnDraft(session, artifactId) : undefined;
  if (!artifactId || !current) return session;
  return Object.freeze({
    ...session,
    error: undefined,
    draftsByArtifactId: Object.freeze({
      ...session.draftsByArtifactId,
      [artifactId]: freezeDraft({
        baseline: current.canonical,
        canonical: current.canonical,
        source: current.canonical.source,
      }),
    }),
  });
};

export const beginCodeAuthoringSessionSave = (
  session: CodeAuthoringSession,
  artifactId = session.activeArtifactId
): CodeAuthoringSession =>
  artifactId &&
  (!session.savingArtifactId || session.savingArtifactId === artifactId)
    ? Object.freeze({
        ...session,
        savingArtifactId: artifactId,
        error: undefined,
      })
    : session;

export const completeCodeAuthoringSessionSave = (
  session: CodeAuthoringSession,
  saved: CodeAuthoringArtifactSnapshot
): CodeAuthoringSession => {
  const current = getOwnDraft(session, saved.artifactId);
  if (!current) return session;
  const canonical = freezeArtifactSnapshot(saved);
  return Object.freeze({
    ...session,
    ...(session.savingArtifactId === saved.artifactId
      ? { savingArtifactId: undefined, error: undefined }
      : {}),
    draftsByArtifactId: Object.freeze({
      ...session.draftsByArtifactId,
      [saved.artifactId]: freezeDraft({
        baseline: canonical,
        canonical,
        source: current.source,
      }),
    }),
  });
};

export const setCodeAuthoringSessionError = (
  session: CodeAuthoringSession,
  message: string,
  artifactId = session.activeArtifactId
): CodeAuthoringSession =>
  Object.freeze({
    ...session,
    savingArtifactId:
      message && artifactId === session.savingArtifactId
        ? undefined
        : session.savingArtifactId,
    error: message
      ? Object.freeze({ message, ...(artifactId ? { artifactId } : {}) })
      : undefined,
  });
