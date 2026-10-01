import {
  createAgentTaskOutput,
  encodeAgentTaskOutput,
  digestAgentCanonicalValue,
} from '../packages/ai/src/index.ts';

/** Public owner factory supplies one shared positive TypeScript/Go wire identity. */
export const createG4AgentTaskOutputCanonicalVector = () =>
  encodeAgentTaskOutput(
    createAgentTaskOutput({
      outputId: 'invocation.runtime.output',
      taskId: 'task.runtime',
      runId: 'run.runtime',
      generation: 1,
      modelInvocationId: 'invocation.runtime',
      contextPackDigest: digestAgentCanonicalValue('context'),
      projectPolicyDigest: digestAgentCanonicalValue('project-policy'),
      effectivePolicyDigest: digestAgentCanonicalValue('effective-policy'),
      kind: 'answer',
      text: 'The current count is 1. 计数为一。😀',
      recordedAt: '2026-10-01T00:00:01.000Z',
    })
  );
