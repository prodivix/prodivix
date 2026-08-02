import {
  digestAgentCanonicalValue,
  sameAgentWorkspaceRevision,
} from '../domain/agentCanonical';
import { createAgentVisualObservation } from './agentMediaIdentity';
import type {
  AgentVisualObservation,
  AgentVisualTargetResolution,
  AgentVisualTargetResolver,
} from './agentMultimodal.types';
import type { AgentWorkspaceRevisionVector } from '../domain/agent.types';

const unresolved = (
  observationDigest: string,
  reason: Extract<
    AgentVisualTargetResolution,
    { status: 'unresolved' }
  >['reason']
): AgentVisualTargetResolution => {
  const base = Object.freeze({
    status: 'unresolved' as const,
    observationDigest,
    reason,
  });
  return Object.freeze({
    ...base,
    resolutionDigest: digestAgentCanonicalValue(base),
  });
};

/**
 * Coordinates remain observations only. Resolution succeeds exclusively when
 * a revision-bound resolver returns a typed owner target and SourceTrace.
 */
export const resolveAgentVisualObservation = (
  input: Readonly<{
    observation: AgentVisualObservation;
    workspaceRevision: AgentWorkspaceRevisionVector;
    resolver: AgentVisualTargetResolver;
  }>
): AgentVisualTargetResolution => {
  let observation: AgentVisualObservation;
  try {
    observation = createAgentVisualObservation(input.observation);
  } catch {
    return unresolved(input.observation.observationDigest, 'no-typed-target');
  }
  if (
    observation.observationDigest !== input.observation.observationDigest ||
    !sameAgentWorkspaceRevision(
      observation.workspaceRevision,
      input.workspaceRevision
    )
  ) {
    return unresolved(observation.observationDigest, 'revision-drift');
  }
  if (!observation.sourceTraceRef) {
    return unresolved(observation.observationDigest, 'missing-source-trace');
  }
  const candidate = input.resolver.resolve({
    observation,
    workspaceRevision: input.workspaceRevision,
  });
  if (
    !candidate ||
    !candidate.target.id.trim() ||
    !['workspace', 'document', 'semantic-target'].includes(
      candidate.target.kind
    ) ||
    candidate.sourceTraceRef !== observation.sourceTraceRef
  ) {
    return unresolved(observation.observationDigest, 'no-typed-target');
  }
  const base = Object.freeze({
    status: 'resolved' as const,
    observationDigest: observation.observationDigest,
    target: Object.freeze({ ...candidate.target }),
    sourceTraceRef: candidate.sourceTraceRef,
  });
  return Object.freeze({
    ...base,
    resolutionDigest: digestAgentCanonicalValue(base),
  });
};

export const createScriptedAgentVisualTargetResolver = (
  resolve: AgentVisualTargetResolver['resolve']
): AgentVisualTargetResolver => Object.freeze({ resolve });
