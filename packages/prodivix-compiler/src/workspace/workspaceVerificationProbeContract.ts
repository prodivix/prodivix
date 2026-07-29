export const WORKSPACE_VERIFICATION_PROBE_MODULE_ID =
  'workspace:verification-probe:v1';
export const WORKSPACE_VERIFICATION_PROBE_MODULE_PATH =
  'src/prodivix-verification-probe.ts';
export const WORKSPACE_VERIFICATION_PROBE_ENDPOINT =
  '__PRODIVIX_VERIFICATION_PROBE_V1__';
export const WORKSPACE_VERIFICATION_PROBE_CANARY =
  '__PRODIVIX_VERIFY_ONLY_CANARY_V1__';

export type WorkspaceVerificationProbeReadiness =
  'document-ready' | 'mounted' | 'visible' | 'enabled';

export type WorkspaceVerificationProbeSourceRef = Readonly<{
  workspaceDocumentId: string;
  path: string;
}>;

/**
 * Instance scopes are semantic identities, not DOM selectors. G3 currently
 * supports the collection key identity emitted by both framework compilers;
 * other Behavior scopes fail closed until their projection encoding is owned.
 */
export type WorkspaceVerificationProbeInstanceScope = Readonly<{
  kind: 'collection-item';
  id: string;
}>;

/**
 * Probe targets intentionally contain no selector, source text, component
 * identity, callback, or runtime handle. A browser adapter may correlate this
 * opaque id with accessible black-box observations, while SourceTrace remains
 * revision-bound compiler data.
 */
export type WorkspaceVerificationProbeTarget = Readonly<{
  targetId: string;
  readiness: readonly WorkspaceVerificationProbeReadiness[];
  sourceRef: WorkspaceVerificationProbeSourceRef;
  instanceScope?: WorkspaceVerificationProbeInstanceScope;
}>;

export type WorkspaceVerificationCompileProfile =
  | Readonly<{ kind: 'production' }>
  | Readonly<{
      kind: 'verification';
      workspaceRevision: number;
      profileDigest: string;
      scenarioProgramDigest: string;
      semanticSnapshotDigest: string;
      targets: readonly WorkspaceVerificationProbeTarget[];
    }>;

export const PRODUCTION_WORKSPACE_VERIFICATION_COMPILE_PROFILE: WorkspaceVerificationCompileProfile =
  Object.freeze({ kind: 'production' });

export type WorkspaceVerificationProbeMetadata = Readonly<{
  format: 'prodivix.workspace-verification-probe.v1';
  workspaceRevision: number;
  profileDigest: string;
  scenarioProgramDigest: string;
  semanticSnapshotDigest: string;
  manifestDigest: string;
  targetCount: number;
}>;

export class WorkspaceVerificationCompileProfileError extends TypeError {
  readonly code = 'VER-COMPILER-PROBE-PROFILE';
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`${reason} (${path})`);
    this.name = 'WorkspaceVerificationCompileProfileError';
    this.path = path;
  }
}

export type NormalizedWorkspaceVerificationCompileProfile = Extract<
  WorkspaceVerificationCompileProfile,
  { kind: 'verification' }
>;
