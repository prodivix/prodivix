import { beforeEach, describe, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => vi.fn());
vi.mock('@/infra/api', () => ({
  apiRequest: request,
  apiBinaryRequest: vi.fn(),
}));
import { findAgentTaskRun } from './agentProductClient';

const input = {
  token: 'session',
  projectId: 'project/a',
  workspaceId: 'workspace/b',
  taskId: 'task/c',
};
describe('Agent Task Run discovery public client', () => {
  beforeEach(() => request.mockReset());
  it('returns a bounded Run identity or the explicit pending empty identity and forwards cancellation', async () => {
    const controller = new AbortController();
    request
      .mockResolvedValueOnce({ runId: 'durable-run' })
      .mockResolvedValueOnce({ runId: '' });
    await expect(
      findAgentTaskRun({ ...input, signal: controller.signal })
    ).resolves.toBe('durable-run');
    expect(request).toHaveBeenCalledWith(
      '/projects/project%2Fa/workspaces/workspace%2Fb/agent/tasks/task%2Fc/run',
      { token: 'session', signal: controller.signal }
    );
    await expect(findAgentTaskRun(input)).resolves.toBeNull();
  });
  it.each([
    null,
    [],
    {},
    { runId: null },
    { runId: 7 },
    { runId: ' spaced ' },
    { runId: 'x'.repeat(257) },
  ])('rejects malformed Run discovery response %#', async (value) => {
    request.mockResolvedValue(value);
    await expect(findAgentTaskRun(input)).rejects.toThrow('malformed');
  });
});
