import type { CodeArtifact } from '@prodivix/authoring';
import {
  createTypeScriptCodeProject,
  type TypeScriptCodeProject,
} from './typescriptProject';

const DEFAULT_MAX_CACHED_WORKSPACES = 8;
const typeScriptCodeProjectHostBrand: unique symbol = Symbol(
  'TypeScriptCodeProjectHost'
);

/** Opaque composition token; concrete TypeScript project objects stay package-private. */
export type TypeScriptCodeProjectHost = Readonly<{
  [typeScriptCodeProjectHostBrand]: true;
}>;

export type TypeScriptCodeProjectLease = Readonly<{
  project: TypeScriptCodeProject;
  generation: number;
  isCurrent(): boolean;
  release(): void;
}>;

type TypeScriptCodeProjectHostImplementation = Readonly<{
  acquire(
    workspaceId: string,
    artifacts: readonly CodeArtifact[]
  ): TypeScriptCodeProjectLease;
  dispose(): void;
}>;

type ProjectEntry = {
  activeLeaseCount: number;
  generation: number;
  project: TypeScriptCodeProject;
};

const implementationByHost = new WeakMap<
  TypeScriptCodeProjectHost,
  TypeScriptCodeProjectHostImplementation
>();

const getImplementation = (
  host: TypeScriptCodeProjectHost
): TypeScriptCodeProjectHostImplementation => {
  const implementation = implementationByHost.get(host);
  if (!implementation) {
    throw new Error('The TypeScript code project host is invalid.');
  }
  return implementation;
};

/** Keeps a bounded set of incremental TypeScript engines alive across sessions. */
export const createTypeScriptCodeProjectHost = (options?: {
  maxCachedWorkspaces?: number;
}): TypeScriptCodeProjectHost => {
  const requestedMaximum = options?.maxCachedWorkspaces;
  const maxCachedWorkspaces = Math.max(
    1,
    Math.floor(
      typeof requestedMaximum === 'number' && Number.isFinite(requestedMaximum)
        ? requestedMaximum
        : DEFAULT_MAX_CACHED_WORKSPACES
    )
  );
  const entries = new Map<string, ProjectEntry>();
  let disposed = false;

  const prune = (): void => {
    while (entries.size > maxCachedWorkspaces) {
      const disposable = [...entries.entries()].find(
        ([, entry]) => entry.activeLeaseCount === 0
      );
      if (!disposable) return;
      const [workspaceId, entry] = disposable;
      entries.delete(workspaceId);
      entry.project.dispose();
    }
  };

  const implementation: TypeScriptCodeProjectHostImplementation = Object.freeze(
    {
      acquire(workspaceId, artifacts) {
        if (disposed) {
          throw new Error(
            'The TypeScript code project host has been disposed.'
          );
        }
        const normalizedWorkspaceId = workspaceId.trim();
        if (!normalizedWorkspaceId) {
          throw new Error(
            'A Workspace id is required for a TypeScript project.'
          );
        }

        let entry = entries.get(normalizedWorkspaceId);
        if (!entry) {
          entry = {
            activeLeaseCount: 0,
            generation: 1,
            project: createTypeScriptCodeProject(artifacts),
          };
        } else if (entry.project.updateArtifacts(artifacts)) {
          entry.generation += 1;
        }
        entries.delete(normalizedWorkspaceId);
        entries.set(normalizedWorkspaceId, entry);
        entry.activeLeaseCount += 1;
        prune();

        const capturedEntry = entry;
        const capturedGeneration = entry.generation;
        let released = false;
        return Object.freeze({
          project: entry.project,
          generation: capturedGeneration,
          isCurrent: () =>
            !disposed &&
            !released &&
            entries.get(normalizedWorkspaceId) === capturedEntry &&
            capturedEntry.generation === capturedGeneration,
          release() {
            if (released) return;
            released = true;
            capturedEntry.activeLeaseCount = Math.max(
              0,
              capturedEntry.activeLeaseCount - 1
            );
            prune();
          },
        });
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const entry of entries.values()) entry.project.dispose();
        entries.clear();
      },
    }
  );
  const host = Object.freeze({
    [typeScriptCodeProjectHostBrand]: true as const,
  });
  implementationByHost.set(host, implementation);
  return host;
};

export const defaultTypeScriptCodeProjectHost =
  createTypeScriptCodeProjectHost();

export const acquireTypeScriptCodeProject = (
  host: TypeScriptCodeProjectHost,
  workspaceId: string,
  artifacts: readonly CodeArtifact[]
): TypeScriptCodeProjectLease =>
  getImplementation(host).acquire(workspaceId, artifacts);

export const disposeTypeScriptCodeProjectHost = (
  host: TypeScriptCodeProjectHost
): void => getImplementation(host).dispose();
