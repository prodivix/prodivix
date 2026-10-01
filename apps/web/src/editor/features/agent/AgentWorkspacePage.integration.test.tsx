import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AgentProductView,
  AgentTaskRecord,
  AgentTaskOutput,
} from '@prodivix/ai';
import {
  createEditorWorkspace,
  resetEditorStore,
} from '@/test-utils/editorStore';
import { AgentWorkspacePage } from './AgentWorkspacePage';

const host = vi.hoisted(() => ({
  find: vi.fn(),
  load: vi.fn(),
  outputs: vi.fn(),
  repair: vi.fn(),
}));
vi.mock('@/auth/useAuthStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ token: 'session', user: { id: 'owner' } }),
}));
vi.mock('./agentProductClient', () => ({
  findAgentTaskRun: host.find,
  loadAgentProduct: host.load,
  loadAgentTaskOutputs: host.outputs,
  downloadAgentAudit: vi.fn(),
  submitAgentApproval: vi.fn(),
  submitAgentRunCommand: vi.fn(),
  submitAgentRepairTask: host.repair,
}));
vi.mock('./AgentTaskComposer', () => ({
  AgentTaskComposer: ({
    onCreated,
  }: {
    onCreated(task: AgentTaskRecord): void;
  }) => (
    <button
      onClick={() =>
        onCreated({ spec: { taskId: 'task-created' } } as AgentTaskRecord)
      }
    >
      Create Task
    </button>
  ),
}));
vi.mock('./AgentApprovalDialog', () => ({ AgentApprovalDialog: () => null }));
vi.mock('./AgentRunView', () => ({
  AgentRunView: ({
    view,
    outputs,
    onRepair,
  }: {
    view: AgentProductView;
    outputs: readonly AgentTaskOutput[];
    onRepair(): void;
  }) => (
    <>
      <h2>Durable Run {view.identity.runId}</h2>
      <button onClick={onRepair}>Create bounded repair proposal</button>
      {outputs.map((output) => (
        <p key={output.outputId}>{output.text}</p>
      ))}
    </>
  ),
}));

const workspace = createEditorWorkspace();
const view = (runId: string) =>
  ({
    identity: { runId },
    run: { phase: 'planning' },
  }) as unknown as AgentProductView;
function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="Current URL">
        {location.pathname}
        {location.search}
      </output>
      <button
        onClick={() => {
          resetEditorStore({ workspace: { ...workspace, id: 'next-project' } });
          navigate('/editor/project/next-project/agent?taskId=next-task');
        }}
      >
        Open next project Task
      </button>
      <button
        onClick={() => {
          resetEditorStore({ workspace: { ...workspace, id: 'next-project' } });
          navigate('/editor/project/next-project/agent?runId=next-run');
        }}
      >
        Open next project Run
      </button>
    </>
  );
}
const openPage = (search = '') =>
  render(
    <MemoryRouter
      initialEntries={[`/editor/project/${workspace.id}/agent${search}`]}
    >
      <Navigation />
      <Routes>
        <Route
          path="/editor/project/:projectId/agent"
          element={<AgentWorkspacePage />}
        />
      </Routes>
    </MemoryRouter>
  );

describe('Agent Task to durable Run product journey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEditorStore({ workspace });
    host.find.mockResolvedValue('created-run');
    host.outputs.mockResolvedValue([]);
    host.load.mockImplementation(async ({ runId }: { runId: string }) =>
      view(runId)
    );
  });

  it('ignores output from an aborted previous Run after changing project', async () => {
    let resolveOld!: (outputs: readonly AgentTaskOutput[]) => void;
    let oldSignal!: AbortSignal;
    host.outputs.mockImplementation(
      ({
        view: current,
        signal,
      }: {
        view: AgentProductView;
        signal: AbortSignal;
      }) => {
        if (current.identity.runId !== 'old-run') return Promise.resolve([]);
        oldSignal = signal;
        return new Promise((resolve) => {
          resolveOld = resolve;
        });
      }
    );
    openPage('?runId=old-run');
    await waitFor(() => expect(host.outputs).toHaveBeenCalledOnce());
    await userEvent.click(
      screen.getByRole('button', { name: 'Open next project Run' })
    );
    expect(
      await screen.findByRole('heading', { name: 'Durable Run next-run' })
    ).toBeTruthy();
    expect(oldSignal.aborted).toBe(true);
    await act(async () =>
      resolveOld([
        { outputId: 'old', text: 'Previous project answer' } as AgentTaskOutput,
      ])
    );
    expect(screen.queryByText('Previous project answer')).toBeNull();
  });

  it('refreshes a live Run until its terminal state without manual input', async () => {
    host.load
      .mockResolvedValueOnce(view('live-run'))
      .mockResolvedValue({ ...view('live-run'), run: { phase: 'terminal' } });
    openPage('?runId=live-run');
    expect(
      await screen.findByRole('heading', { name: 'Durable Run live-run' })
    ).toBeTruthy();
    await waitFor(() => expect(host.load).toHaveBeenCalledTimes(2), {
      timeout: 4000,
    });
    expect(host.outputs).toHaveBeenCalledTimes(2);
  });

  it('opens the discovered Run after Create Task without asking for a Run ID', async () => {
    openPage();
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(
      await screen.findByRole('heading', { name: 'Durable Run created-run' })
    ).toBeTruthy();
    expect(host.find).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: workspace.id,
        workspaceId: workspace.id,
        taskId: 'task-created',
      })
    );
    expect(
      (screen.getByRole('textbox', { name: 'Run ID' }) as HTMLInputElement)
        .value
    ).toBe('created-run');
    expect(screen.getByLabelText('Current URL').textContent).toContain(
      'taskId=task-created'
    );
    expect(screen.getByLabelText('Current URL').textContent).toContain(
      'runId=created-run'
    );
  });

  it('restores a taskId URL after refresh and polls until the worker creates a Run', async () => {
    host.find
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('recovered-run');
    openPage('?taskId=task-recovered');
    expect(
      await screen.findByText(/Waiting for the runtime worker/)
    ).toBeTruthy();
    expect(
      await screen.findByRole(
        'heading',
        { name: 'Durable Run recovered-run' },
        { timeout: 4000 }
      )
    ).toBeTruthy();
    expect(host.find).toHaveBeenCalledTimes(2);
    expect(host.load).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'recovered-run' })
    );
    expect(screen.getByLabelText('Current URL').textContent).toContain(
      'taskId=task-recovered'
    );
  });

  it('ignores discovery from an aborted previous project', async () => {
    let resolveOld!: (run: string) => void;
    let oldSignal!: AbortSignal;
    host.find.mockImplementation(
      ({ taskId, signal }: { taskId: string; signal: AbortSignal }) => {
        if (taskId !== 'old-task') return Promise.resolve('next-run');
        oldSignal = signal;
        return new Promise((resolve) => {
          resolveOld = resolve;
        });
      }
    );
    openPage('?taskId=old-task');
    await waitFor(() => expect(host.find).toHaveBeenCalledOnce());
    await userEvent.click(
      screen.getByRole('button', { name: 'Open next project Task' })
    );
    expect(
      await screen.findByRole('heading', { name: 'Durable Run next-run' })
    ).toBeTruthy();
    expect(oldSignal.aborted).toBe(true);
    await act(async () => resolveOld('old-run'));
    expect(
      screen.queryByRole('heading', { name: 'Durable Run old-run' })
    ).toBeNull();
    expect(screen.getByLabelText('Current URL').textContent).toContain(
      'runId=next-run'
    );
    expect(host.load).not.toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'old-run' })
    );
  });

  it('ignores ordinary transport errors from an aborted previous Run', async () => {
    let rejectOld!: (cause: Error) => void;
    let oldSignal!: AbortSignal;
    host.load.mockImplementation(
      ({ runId, signal }: { runId: string; signal: AbortSignal }) => {
        if (runId !== 'old-run') return Promise.resolve(view(runId));
        oldSignal = signal;
        return new Promise((_, reject) => {
          rejectOld = reject;
        });
      }
    );
    openPage('?runId=old-run');
    await waitFor(() => expect(host.load).toHaveBeenCalledOnce());
    await userEvent.click(
      screen.getByRole('button', { name: 'Open next project Run' })
    );
    expect(
      await screen.findByRole('heading', { name: 'Durable Run next-run' })
    ).toBeTruthy();
    expect(oldSignal.aborted).toBe(true);
    await act(async () => rejectOld(new Error('Old project network failed')));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      (screen.getByRole('textbox', { name: 'Run ID' }) as HTMLInputElement)
        .value
    ).toBe('next-run');
    expect(
      screen.getByRole('heading', { name: 'Durable Run next-run' })
    ).toBeTruthy();
  });

  it('opens the derived repair Task and discovers its new Run after one user action', async () => {
    host.repair.mockResolvedValue({
      spec: { taskId: 'task-repair' },
    } as AgentTaskRecord);
    host.find.mockResolvedValue('repair-run');
    openPage('?runId=failed-run');
    await screen.findByRole('heading', { name: 'Durable Run failed-run' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Create bounded repair proposal' })
    );
    await screen.findByRole('heading', { name: 'Durable Run repair-run' });
    expect(host.repair).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'owner',
        projectId: workspace.id,
        workspaceId: workspace.id,
        view: expect.objectContaining({ identity: { runId: 'failed-run' } }),
      })
    );
    expect(host.find).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-repair' })
    );
    expect(screen.getByLabelText('Current URL').textContent).toContain(
      'taskId=task-repair'
    );
    expect(screen.getByLabelText('Current URL').textContent).toContain(
      'runId=repair-run'
    );
  });

  it('aborts repair creation when project changes and ignores a late child Task', async () => {
    let resolveOld!: (task: AgentTaskRecord) => void;
    let oldSignal!: AbortSignal;
    host.repair.mockImplementation(({ signal }: { signal: AbortSignal }) => {
      oldSignal = signal;
      return new Promise((resolve) => {
        resolveOld = resolve;
      });
    });
    openPage('?runId=failed-run');
    await screen.findByRole('heading', { name: 'Durable Run failed-run' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Create bounded repair proposal' })
    );
    await waitFor(() => expect(host.repair).toHaveBeenCalledOnce());
    await userEvent.click(
      screen.getByRole('button', { name: 'Open next project Run' })
    );
    await screen.findByRole('heading', { name: 'Durable Run next-run' });
    expect(oldSignal.aborted).toBe(true);
    await act(async () =>
      resolveOld({ spec: { taskId: 'late-repair' } } as AgentTaskRecord)
    );
    expect(screen.getByLabelText('Current URL').textContent).not.toContain(
      'late-repair'
    );
    expect(host.find).not.toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'late-repair' })
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
