import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAgentTaskOutput,
  digestAgentCanonicalValue,
  encodeAgentTaskOutput,
  type AgentProductView,
} from '@prodivix/ai';

const request = vi.hoisted(() => vi.fn());
vi.mock('@/infra/api', () => ({
  apiRequest: request,
  apiBinaryRequest: vi.fn(),
}));
import { loadAgentTaskOutputs } from './agentProductClient';
import { AgentRunView } from './AgentRunView';

const output = (
  change: Partial<Parameters<typeof createAgentTaskOutput>[0]> = {}
) =>
  createAgentTaskOutput({
    outputId: 'output.answer',
    taskId: 'task.answer',
    runId: 'run.answer',
    generation: 1,
    modelInvocationId: 'invocation.answer',
    contextPackDigest: digestAgentCanonicalValue('context'),
    projectPolicyDigest: digestAgentCanonicalValue('project-policy'),
    effectivePolicyDigest: digestAgentCanonicalValue('effective-policy'),
    kind: 'answer',
    text: 'The current count is 1. 计数为一。😀\n<script>shown as text</script>',
    recordedAt: '2026-10-01T00:00:01.000Z',
    ...change,
  });
const view = {
  identity: {
    projectId: 'project',
    workspaceId: 'workspace',
    taskId: 'task.answer',
    runId: 'run.answer',
    generation: 1,
    attempt: 1,
  },
  task: {
    mode: 'explain',
    policyDigest: digestAgentCanonicalValue('project-policy'),
  },
  run: { phase: 'terminal' },
  cleanupState: 'clean',
  availableActions: [],
  diagnostics: [],
  timeline: [],
  verificationBindings: [],
  verificationClosures: [],
  repairRounds: [],
  runtime: { models: [], tools: [], usage: [], costs: [] },
} as unknown as AgentProductView;
const input = {
  token: 'session',
  projectId: 'project',
  workspaceId: 'workspace',
  view,
};

describe('bounded Agent Task user output', () => {
  beforeEach(() => request.mockReset());
  it('loads exact owner-decoded user output and renders final text accessibly', async () => {
    const value = output();
    const controller = new AbortController();
    request.mockResolvedValue({ items: [encodeAgentTaskOutput(value)] });
    const outputs = await loadAgentTaskOutputs({
      ...input,
      signal: controller.signal,
    });
    expect(outputs).toEqual([value]);
    expect(request).toHaveBeenCalledWith(
      '/projects/project/workspaces/workspace/agent/runs/run.answer/task-outputs',
      expect.objectContaining({ token: 'session', signal: controller.signal })
    );
    render(
      <AgentRunView
        view={view}
        outputs={outputs}
        busy={false}
        onReload={vi.fn()}
        onCommand={vi.fn()}
        onOpenApproval={vi.fn()}
        onAudit={vi.fn()}
        onRepair={vi.fn()}
      />
    );
    expect(screen.getByRole('region', { name: 'Agent answer' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Answer' })).toBeTruthy();
    expect(
      screen.getByText(value.text, { exact: true, normalizer: (text) => text })
    ).toBeTruthy();
  });
  it.each([
    { runId: 'foreign-run' },
    { taskId: 'foreign-task' },
    { generation: 2 },
    { projectPolicyDigest: digestAgentCanonicalValue('foreign-policy') },
    { kind: 'plan' as const },
  ])('rejects a valid output for a different authority %#', async (change) => {
    request.mockResolvedValue({
      items: [encodeAgentTaskOutput(output(change))],
    });
    await expect(loadAgentTaskOutputs(input)).rejects.toThrow('does not bind');
  });
  it('rejects duplicate, excessive, malformed and digest-changed output before presentation', async () => {
    const valid = encodeAgentTaskOutput(output());
    for (const response of [
      { items: [valid, valid] },
      { items: Array.from({ length: 33 }, () => valid) },
      { items: [{ ...valid, value: { ...valid.value, text: 'changed' } }] },
      { items: [], rawStream: 'hidden' },
      null,
    ]) {
      request.mockResolvedValue(response);
      await expect(loadAgentTaskOutputs(input)).rejects.toThrow();
    }
    await expect(
      loadAgentTaskOutputs({ ...input, projectId: 'foreign' })
    ).rejects.toThrow('scope');
  });
});
