import {
  createCodeLanguageSnapshotIdentity,
  createCodeLanguageSnapshotKey,
  createShaderCompileProviderRegistry,
  type CodeArtifact,
  type CodeLanguageSnapshotIdentity,
  type ShaderCompileProfile,
  type ShaderCompileResult,
  type ShaderCompileSession,
} from '@prodivix/authoring';
import type { ProdivixDiagnostic } from '@prodivix/diagnostics';
import { createShaderCompileCapabilityProvider } from '@prodivix/code-language';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { createWorkspaceCodeLanguageEnvironment } from '@/editor/codeLanguage';
import {
  createBrowserWebGl2ShaderCompilerBackend,
  createBrowserWebGpuShaderCompilerBackend,
} from './browserShaderCompilerBackends';

export type WorkspaceShaderCompileArtifactSnapshot = Readonly<{
  artifact: CodeArtifact;
  profile: ShaderCompileProfile;
  result: ShaderCompileResult;
}>;

export type WorkspaceShaderCompileSnapshot = Readonly<{
  snapshotIdentity: CodeLanguageSnapshotIdentity;
  artifacts: readonly WorkspaceShaderCompileArtifactSnapshot[];
  diagnostics: readonly ProdivixDiagnostic[];
}>;

const registry = createShaderCompileProviderRegistry();
registry.register(
  createShaderCompileCapabilityProvider({
    backend: createBrowserWebGl2ShaderCompilerBackend(),
  })
);
registry.register(
  createShaderCompileCapabilityProvider({
    backend: createBrowserWebGpuShaderCompilerBackend(),
  })
);

const MAX_CACHED_SNAPSHOTS = 12;
const snapshotPromiseByKey = new Map<
  string,
  Promise<WorkspaceShaderCompileSnapshot>
>();

const rememberSnapshot = (
  key: string,
  promise: Promise<WorkspaceShaderCompileSnapshot>
): void => {
  snapshotPromiseByKey.delete(key);
  snapshotPromiseByKey.set(key, promise);
  while (snapshotPromiseByKey.size > MAX_CACHED_SNAPSHOTS) {
    const oldest = snapshotPromiseByKey.keys().next().value;
    if (!oldest) break;
    snapshotPromiseByKey.delete(oldest);
  }
};

const compileSnapshot = async (
  workspace: WorkspaceSnapshot
): Promise<WorkspaceShaderCompileSnapshot> => {
  const environment = createWorkspaceCodeLanguageEnvironment(workspace);
  const snapshot = Object.freeze({
    identity: environment.snapshotIdentity,
    artifacts: environment.artifacts,
  });
  const snapshotIdentity = createCodeLanguageSnapshotIdentity(snapshot);
  const configuredArtifacts = environment.artifacts.filter(
    (
      artifact
    ): artifact is CodeArtifact &
      Readonly<{ shaderCompileProfile: ShaderCompileProfile }> =>
      Boolean(artifact.shaderCompileProfile)
  );
  const sessions = new Map<string, Promise<ShaderCompileSession>>();
  const getSession = (artifact: (typeof configuredArtifacts)[number]) => {
    const provider = registry.getProvider(
      artifact.language,
      artifact.shaderCompileProfile.target
    );
    if (!provider) return null;
    let session = sessions.get(provider.descriptor.id);
    if (!session) {
      session = provider.openSession(snapshot);
      sessions.set(provider.descriptor.id, session);
    }
    return session;
  };

  const artifacts = await Promise.all(
    configuredArtifacts.map(async (artifact) => {
      const session = getSession(artifact);
      const result = session
        ? await (
            await session
          ).compile({
            artifactId: artifact.id,
            expectedSnapshotIdentity: snapshotIdentity,
          })
        : Object.freeze({
            status: 'unavailable' as const,
            snapshotIdentity,
            reason: `No compiler is registered for ${artifact.language}/${artifact.shaderCompileProfile.target}.`,
          });
      return Object.freeze({
        artifact,
        profile: artifact.shaderCompileProfile,
        result,
      });
    })
  );
  for (const session of await Promise.all(sessions.values())) session.dispose();
  const orderedArtifacts = Object.freeze(
    artifacts.sort(
      (left, right) =>
        left.artifact.path.localeCompare(right.artifact.path) ||
        left.artifact.id.localeCompare(right.artifact.id)
    )
  );
  return Object.freeze({
    snapshotIdentity,
    artifacts: orderedArtifacts,
    diagnostics: Object.freeze(
      orderedArtifacts.flatMap(({ result }) =>
        result.status === 'resolved' ? result.value.diagnostics : []
      )
    ),
  });
};

/** Compiles canonical shader artifacts once per exact authoring snapshot. */
export const compileWorkspaceShaders = (
  workspace: WorkspaceSnapshot
): Promise<WorkspaceShaderCompileSnapshot> => {
  const environment = createWorkspaceCodeLanguageEnvironment(workspace);
  const identity = createCodeLanguageSnapshotIdentity({
    identity: environment.snapshotIdentity,
    artifacts: environment.artifacts,
  });
  const key = createCodeLanguageSnapshotKey(identity);
  const cached = snapshotPromiseByKey.get(key);
  if (cached) return cached;
  const promise = compileSnapshot(workspace);
  rememberSnapshot(key, promise);
  return promise;
};
