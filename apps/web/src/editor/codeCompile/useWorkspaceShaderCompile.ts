import { useEffect, useMemo, useState } from 'react';
import type {
  ShaderCompileOutput,
  ShaderCompileProfile,
} from '@prodivix/authoring';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { createWorkspaceCodeLanguageEnvironment } from '@/editor/codeLanguage';
import { compileWorkspaceShaders } from './workspaceShaderCompileEnvironment';

export type WorkspaceShaderCompileState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'not-configured' }>
  | Readonly<{
      status: 'loading';
      profile: ShaderCompileProfile;
    }>
  | Readonly<{
      status: 'resolved';
      profile: ShaderCompileProfile;
      output: ShaderCompileOutput;
    }>
  | Readonly<{
      status: 'unavailable';
      profile: ShaderCompileProfile;
      reason?: string;
    }>;

const IDLE_STATE = Object.freeze({ status: 'idle' as const });
const NOT_CONFIGURED_STATE = Object.freeze({
  status: 'not-configured' as const,
});

export const useWorkspaceShaderCompile = (input: {
  workspace: WorkspaceSnapshot | null;
  artifactId?: string;
}): WorkspaceShaderCompileState => {
  const artifact = useMemo(() => {
    if (!input.workspace || !input.artifactId) return null;
    return (
      createWorkspaceCodeLanguageEnvironment(input.workspace).artifacts.find(
        (candidate) => candidate.id === input.artifactId
      ) ?? null
    );
  }, [input.artifactId, input.workspace]);
  const [state, setState] = useState<WorkspaceShaderCompileState>(IDLE_STATE);

  useEffect(() => {
    if (!input.workspace || !artifact) {
      setState(IDLE_STATE);
      return;
    }
    const profile = artifact.shaderCompileProfile;
    if (!profile) {
      setState(
        artifact.language === 'glsl' || artifact.language === 'wgsl'
          ? NOT_CONFIGURED_STATE
          : IDLE_STATE
      );
      return;
    }
    let cancelled = false;
    setState(Object.freeze({ status: 'loading', profile }));
    void compileWorkspaceShaders(input.workspace)
      .then((snapshot) => {
        if (cancelled) return;
        const artifactSnapshot = snapshot.artifacts.find(
          (candidate) => candidate.artifact.id === artifact.id
        );
        const result = artifactSnapshot?.result;
        if (!result || result.status === 'missing') {
          setState(NOT_CONFIGURED_STATE);
          return;
        }
        if (result.status !== 'resolved') {
          setState(
            Object.freeze({
              status: 'unavailable',
              profile,
              ...(result.status === 'unavailable' && result.reason
                ? { reason: result.reason }
                : {}),
            })
          );
          return;
        }
        setState(
          Object.freeze({ status: 'resolved', profile, output: result.value })
        );
      })
      .catch(() => {
        if (cancelled) return;
        setState(
          Object.freeze({
            status: 'unavailable',
            profile,
            reason: 'The shader compile environment could not be evaluated.',
          })
        );
      });
    return () => {
      cancelled = true;
    };
  }, [artifact, input.workspace]);

  return state;
};
