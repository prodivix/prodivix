import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createExecutionFilesystemDiff,
  createExecutionJobController,
  createExecutionProviderDescriptor,
  createExecutionRequest,
  type ExecutionProviderCapability,
} from '@prodivix/runtime-core';
import type { RemoteExecutionTerminalClient } from '@prodivix/runtime-remote';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { ExecutionCenter } from './ExecutionCenter';
import { executionSessionCoordinator } from './executionSessionEnvironment';

const dispatchWorkspaceOperation = vi.hoisted(() => vi.fn());
vi.mock('@/editor/workspaceSync/workspaceAuthoringOperationDispatcher', () => ({
  dispatchWorkspaceAuthoringOperation: dispatchWorkspaceOperation,
}));

const sessionIds = new Set<string>();

const activateSession = (
  sessionId: string,
  capabilities: readonly ExecutionProviderCapability[]
) => {
  sessionIds.add(sessionId);
  const provider = createExecutionProviderDescriptor({
    id: `provider-${sessionId}`,
    version: '1',
    isolation: 'remote-isolated',
    profiles: ['preview'],
    runtimeZones: ['client'],
    invocationKinds: ['workspace'],
    capabilities,
  });
  const controller = createExecutionJobController({
    jobId: `job-${sessionId}`,
    provider,
    request: createExecutionRequest({
      requestId: `request-${sessionId}`,
      profile: 'preview',
      runtimeZone: 'client',
      workspace: { workspaceId: 'workspace', snapshotId: 'snapshot' },
      invocation: {
        kind: 'workspace',
        targetRef: { kind: 'workspace', workspaceId: 'workspace' },
      },
    }),
  });
  executionSessionCoordinator.activate({ sessionId, job: controller.job });
  controller.markRunning();
};

const createTerminalClient = (): RemoteExecutionTerminalClient => {
  const snapshot = Object.freeze({
    terminalSessionId: 'terminal-connected',
    executionId: 'job-terminal-connected',
    jobId: 'job-terminal-connected',
    providerId: 'provider-terminal-connected',
    providerVersion: '1',
    capability: 'shell' as const,
    status: 'open' as const,
    revision: 1,
    size: Object.freeze({ columns: 100, rows: 30 }),
    openedAt: 1,
    updatedAt: 1,
    leaseExpiresAt: Date.now() + 60_000,
    latestOutputCursor: 0,
    earliestRetainedOutputCursor: 0,
    retainedOutputBytes: 0,
    droppedOutputRecords: 0,
    droppedOutputBytes: 0,
    latestClientSequence: 0,
  });
  return Object.freeze({
    open: vi.fn(async () => ({
      protocol: 'prodivix.remote-terminal' as const,
      version: 1 as const,
      snapshot,
      access: { token: 'short-terminal-token', expiresAt: Date.now() + 60_000 },
    })),
    resume: vi.fn(async () => ({
      protocol: 'prodivix.remote-terminal' as const,
      version: 1 as const,
      snapshot,
      access: {
        token: 'rotated-terminal-token',
        expiresAt: Date.now() + 60_000,
      },
    })),
    read: vi.fn(async (input) => ({
      terminalSessionId: snapshot.terminalSessionId,
      executionId: snapshot.executionId,
      jobId: snapshot.jobId,
      status: 'open' as const,
      afterCursor: input.afterCursor,
      nextCursor: 1,
      latestCursor: 1,
      earliestAvailableCursor: 1,
      gap: false,
      hasMore: false,
      records:
        input.afterCursor === 0
          ? [
              {
                terminalSessionId: snapshot.terminalSessionId,
                executionId: snapshot.executionId,
                jobId: snapshot.jobId,
                cursor: 1,
                emittedAt: 2,
                stream: 'stdout' as const,
                data: 'remote-ready\n',
                byteLength: 13,
                redacted: false,
                truncated: false,
              },
            ]
          : [],
    })),
    write: vi.fn(async (input) => ({
      status: 'accepted' as const,
      clientSequence: input.clientSequence,
    })),
    resize: vi.fn(async (input) => ({
      status: 'accepted' as const,
      size: input.size,
    })),
    signal: vi.fn(async (input) => ({
      status: 'accepted' as const,
      signal: input.signal,
    })),
    close: vi.fn(async () => ({ status: 'closed' as const })),
  });
};

afterEach(() => {
  act(() => {
    sessionIds.forEach((sessionId) =>
      executionSessionCoordinator.remove(sessionId)
    );
  });
  sessionIds.clear();
  dispatchWorkspaceOperation.mockReset();
});

describe('ExecutionCenter Terminal availability', () => {
  it('shows an explicit unsupported state instead of a fallback shell', () => {
    activateSession('terminal-unsupported', ['console']);
    render(<ExecutionCenter sessionId="terminal-unsupported" />);

    fireEvent.click(
      screen.getByRole('button', { name: 'execution.surface.terminal' })
    );

    expect(screen.getByText('execution.terminal.unsupported')).toBeTruthy();
    expect(
      screen.getByText('execution.terminal.status.unsupported')
    ).toBeTruthy();
  });

  it('distinguishes unresolved permission from an allowed terminal provider', () => {
    activateSession('terminal-permission', ['terminal']);
    const { rerender } = render(
      <ExecutionCenter sessionId="terminal-permission" />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'execution.surface.terminal' })
    );
    expect(
      screen.getByText('execution.terminal.permissionRequired')
    ).toBeTruthy();

    rerender(
      <ExecutionCenter
        sessionId="terminal-permission"
        terminalPermission="allowed"
      />
    );
    expect(screen.getByText('execution.terminal.available')).toBeTruthy();
  });

  it('opens the Remote session, polls output, and acknowledges ordered input', async () => {
    activateSession('terminal-connected', ['terminal']);
    const terminalClient = createTerminalClient();
    render(
      <ExecutionCenter
        sessionId="terminal-connected"
        terminalPermission="allowed"
        terminalClient={terminalClient}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'execution.surface.terminal' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'execution.terminal.open' })
    );

    await screen.findByText(/remote-ready/);
    const input = screen.getByRole('textbox', {
      name: 'execution.terminal.inputPlaceholder',
    });
    fireEvent.change(input, { target: { value: 'pwd' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'execution.terminal.send' })
    );

    await waitFor(() =>
      expect(terminalClient.write).toHaveBeenCalledWith(
        expect.objectContaining({
          executionId: 'job-terminal-connected',
          terminalSessionId: 'terminal-connected',
          data: 'pwd\n',
          clientSequence: 1,
        })
      )
    );
    expect((input as HTMLInputElement).value).toBe('');
  });
});

describe('ExecutionCenter runtime filesystem proposal', () => {
  it('loads verified changes and requires explicit selection before one atomic apply', async () => {
    const workspace: WorkspaceSnapshot = {
      id: 'workspace',
      workspaceRev: 1,
      routeRev: 1,
      opSeq: 1,
      treeRootId: 'root',
      treeById: {
        root: {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: ['code-node'],
        },
        'code-node': {
          id: 'code-node',
          kind: 'doc',
          name: 'main.ts',
          parentId: 'root',
          docId: 'code-1',
        },
      },
      docsById: {
        'code-1': {
          id: 'code-1',
          type: 'code',
          path: '/main.ts',
          contentRev: 2,
          metaRev: 3,
          content: { language: 'ts', source: 'export const value = 1;\n' },
        },
      },
      routeManifest: {
        version: '1',
        root: { id: 'route-root', pageDocId: 'code-1' },
      },
    };
    const snapshotDigest = `sha256-${'a'.repeat(64)}`;
    const diff = createExecutionFilesystemDiff({
      snapshotDigest,
      workspace: {
        workspaceId: workspace.id,
        snapshotId: 'snapshot',
        partitionRevisions: {
          workspace: '1',
          route: '1',
          'document:code-1:content': '2',
          'document:code-1:meta': '3',
        },
      },
      capturedAt: 1,
      complete: true,
      changes: [
        {
          kind: 'modified',
          path: 'src/main.ts',
          baseline: { contents: Buffer.from('export const value = 1;\n') },
          runtime: { contents: Buffer.from('export const value = 2;\n') },
          sourceTrace: [
            { sourceRef: { kind: 'code-artifact', artifactId: 'code-1' } },
          ],
        },
      ],
    });
    dispatchWorkspaceOperation.mockResolvedValue({
      status: 'applied',
      operationId: 'operation-1',
    });
    render(
      <ExecutionCenter
        sessionId="filesystem-proposal"
        workspace={workspace}
        workspaceReadonly={false}
        filesystemArtifact={{
          executionId: 'execution-1',
          artifactId: `filesystem-diff:${snapshotDigest}`,
          snapshotDigest,
          workspaceSnapshotId: 'snapshot',
          resolve: vi.fn(async () => diff),
        }}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'execution.surface.files' })
    );
    const checkbox = await screen.findByRole('checkbox', {
      name: 'execution.files.select',
    });
    const apply = screen.getByRole('button', {
      name: 'execution.files.apply',
    });
    expect((apply as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(checkbox);
    expect((apply as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(apply);

    await waitFor(() => expect(dispatchWorkspaceOperation).toHaveBeenCalled());
    expect(dispatchWorkspaceOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace,
        readonly: false,
        operation: expect.objectContaining({
          kind: 'transaction',
          transaction: expect.objectContaining({
            commands: [
              expect.objectContaining({
                type: 'source.update',
                forwardOps: [
                  {
                    op: 'replace',
                    path: '/source',
                    value: 'export const value = 2;\n',
                  },
                ],
              }),
            ],
          }),
        }),
      })
    );
  });

  it('submits selected add and delete observations as canonical VFS commands', async () => {
    const workspace: WorkspaceSnapshot = {
      id: 'workspace',
      workspaceRev: 1,
      routeRev: 1,
      opSeq: 1,
      treeRootId: 'root',
      treeById: {
        root: {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: ['code-node', 'old-node'],
        },
        'code-node': {
          id: 'code-node',
          kind: 'doc',
          name: 'main.ts',
          parentId: 'root',
          docId: 'code-1',
        },
        'old-node': {
          id: 'old-node',
          kind: 'doc',
          name: 'old.ts',
          parentId: 'root',
          docId: 'code-2',
        },
      },
      docsById: {
        'code-1': {
          id: 'code-1',
          type: 'code',
          path: '/main.ts',
          contentRev: 2,
          metaRev: 3,
          content: { language: 'ts', source: 'export const value = 1;\n' },
        },
        'code-2': {
          id: 'code-2',
          type: 'code',
          path: '/old.ts',
          contentRev: 4,
          metaRev: 2,
          content: { language: 'ts', source: 'export const old = true;\n' },
        },
      },
      routeManifest: {
        version: '1',
        root: { id: 'route-root', pageDocId: 'code-1' },
      },
    };
    const snapshotDigest = `sha256-${'b'.repeat(64)}`;
    const diff = createExecutionFilesystemDiff({
      snapshotDigest,
      workspace: {
        workspaceId: workspace.id,
        snapshotId: 'snapshot-vfs',
        partitionRevisions: {
          workspace: '1',
          route: '1',
          'document:code-2:content': '4',
          'document:code-2:meta': '2',
        },
      },
      capturedAt: 2,
      complete: true,
      changes: [
        {
          kind: 'added',
          path: 'runtime/new.ts',
          runtime: { contents: Buffer.from('export const added = true;\n') },
        },
        {
          kind: 'deleted',
          path: 'src/old.ts',
          baseline: { contents: Buffer.from('export const old = true;\n') },
          sourceTrace: [
            { sourceRef: { kind: 'code-artifact', artifactId: 'code-2' } },
          ],
        },
      ],
    });
    dispatchWorkspaceOperation.mockResolvedValue({
      status: 'applied',
      operationId: 'operation-vfs',
    });
    render(
      <ExecutionCenter
        sessionId="filesystem-vfs-proposal"
        workspace={workspace}
        workspaceReadonly={false}
        filesystemArtifact={{
          executionId: 'execution-vfs',
          artifactId: `filesystem-diff:${snapshotDigest}`,
          snapshotDigest,
          workspaceSnapshotId: 'snapshot-vfs',
          resolve: vi.fn(async () => diff),
        }}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'execution.surface.files' })
    );
    const checkboxes = await screen.findAllByRole('checkbox', {
      name: 'execution.files.select',
    });
    expect(checkboxes).toHaveLength(2);
    checkboxes.forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(
      screen.getByRole('button', { name: 'execution.files.apply' })
    );

    await waitFor(() => expect(dispatchWorkspaceOperation).toHaveBeenCalled());
    const operation = dispatchWorkspaceOperation.mock.calls[0]?.[0]
      ?.operation as {
      transaction?: { commands?: readonly { type: string }[] };
    };
    expect(operation.transaction?.commands?.map(({ type }) => type)).toEqual([
      'code-document.create',
      'code-document.delete',
    ]);
  });
});
