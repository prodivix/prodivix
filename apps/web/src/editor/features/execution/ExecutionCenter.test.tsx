import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBinaryAssetBlobReference } from '@prodivix/assets';
import type {
  RuntimeFilesystemAssetUploadReceipt,
  RuntimeFilesystemAssetUploadRequest,
} from '@prodivix/prodivix-compiler';
import {
  createExecutionFilesystemDiff,
  createExecutionJobController,
  createExecutionProviderDescriptor,
  createExecutionRequest,
  type ExecutionProviderCapability,
} from '@prodivix/runtime-core';
import type { RemoteExecutionTerminalClient } from '@prodivix/runtime-remote';
import {
  createServerFunctionInvocationTrace,
  EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
  SERVER_FUNCTION_INVOCATION_TRACE_NAME,
  toExecutionServerFunctionBridgeSuccess,
  toServerFunctionInvocationTraceValue,
} from '@prodivix/server-runtime';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { ExecutionCenter } from './ExecutionCenter';
import { executionSessionCoordinator } from './executionSessionEnvironment';

const dispatchWorkspaceOperation = vi.hoisted(() => vi.fn());
const uploadRuntimeAssets = vi.hoisted(() =>
  vi.fn<
    (input: {
      workspaceId: string;
      token: string | null | undefined;
      uploads: readonly RuntimeFilesystemAssetUploadRequest[];
    }) => Promise<readonly RuntimeFilesystemAssetUploadReceipt[]>
  >(async () => [])
);
vi.mock('@/editor/workspaceSync/workspaceAuthoringOperationDispatcher', () => ({
  dispatchWorkspaceAuthoringOperation: dispatchWorkspaceOperation,
}));
vi.mock('./runtimeFilesystemAssetUpload', () => ({
  uploadRuntimeFilesystemAssets: uploadRuntimeAssets,
}));

const sessionIds = new Set<string>();

beforeEach(() => {
  uploadRuntimeAssets.mockResolvedValue([]);
});

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
  return controller;
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
  uploadRuntimeAssets.mockReset();
});

describe('ExecutionCenter Server Function surface', () => {
  it('shows exact sanitized invocation metadata after a finite Job is terminal', () => {
    const sessionId = 'server-function-observation';
    const controller = activateSession(sessionId, ['server-function']);
    controller.succeed();
    const inputCanary = 'server-input-credential-canary';
    const request = Object.freeze({
      type: EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
      requestId: 'server-observation:1',
      invocationId: 'server-observation',
      attempt: 1,
      functionRef: Object.freeze({
        artifactId: 'code-auth',
        exportName: 'loadPrincipal',
      }),
      input: Object.freeze({ bearer: inputCanary }),
    });
    const trace = createServerFunctionInvocationTrace({
      request,
      response: toExecutionServerFunctionBridgeSuccess(request.requestId, {
        kind: 'allow',
      }),
      startedAt: 100,
      completedAt: 112,
    });
    executionSessionCoordinator.publishTrace({
      sessionId,
      jobId: controller.job.id,
      observedAt: 112,
      trace: {
        traceId: `server-function:${controller.job.id}`,
        spanId: request.requestId,
        name: SERVER_FUNCTION_INVOCATION_TRACE_NAME,
        phase: 'event',
        detail: toServerFunctionInvocationTraceValue(trace),
        sourceTrace: [
          {
            sourceRef: {
              kind: 'code-artifact',
              artifactId: request.functionRef.artifactId,
            },
            label: 'code-auth#loadPrincipal',
          },
        ],
      },
    });

    const openSourceTrace = vi.fn(() => ({ status: 'opened' as const }));
    const { container, rerender } = render(
      <ExecutionCenter
        sessionId={sessionId}
        onOpenSourceTrace={openSourceTrace}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'execution.surface.server' })
    );

    expect(screen.getByText('code-auth#loadPrincipal')).toBeTruthy();
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByText('allow')).toBeTruthy();
    expect(screen.getByText('12 ms')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'execution.openSource' })
    );
    expect(openSourceTrace).toHaveBeenCalledWith({
      jobId: controller.job.id,
      providerId: controller.job.provider.id,
      snapshotId: controller.job.request.workspace.snapshotId,
      sourceTrace: {
        sourceRef: {
          kind: 'code-artifact',
          artifactId: request.functionRef.artifactId,
        },
        label: 'code-auth#loadPrincipal',
      },
    });
    expect(container.textContent).not.toMatch(
      new RegExp(`${inputCanary}|bearer|token`, 'iu')
    );
    expect(
      (
        screen.getByRole('button', {
          name: 'execution.copy',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);

    rerender(
      <ExecutionCenter
        sessionId={sessionId}
        onOpenSourceTrace={() => ({
          status: 'unavailable',
          reason: 'snapshot-stale',
        })}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'execution.openSource' })
    );
    expect(
      screen.getByText('execution.sourceNavigation.snapshotStale')
    ).toBeTruthy();
  });
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

  it('uploads selected Asset bytes before dispatching one import/replace transaction', async () => {
    const baseline = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    const replacement = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    const imported = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 2]);
    const baselineReference = createBinaryAssetBlobReference({
      contents: baseline,
      mediaType: 'image/png',
    });
    const workspace: WorkspaceSnapshot = {
      id: 'local-workspace-assets',
      workspaceRev: 3,
      routeRev: 1,
      opSeq: 2,
      treeRootId: 'root',
      treeById: {
        root: {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: ['public-dir'],
        },
        'public-dir': {
          id: 'public-dir',
          kind: 'dir',
          name: 'public',
          parentId: 'root',
          children: ['asset-node'],
        },
        'asset-node': {
          id: 'asset-node',
          kind: 'doc',
          name: 'logo.png',
          parentId: 'public-dir',
          docId: 'asset-logo',
        },
      },
      docsById: {
        'asset-logo': {
          id: 'asset-logo',
          type: 'asset',
          path: '/public/logo.png',
          contentRev: 2,
          metaRev: 1,
          content: {
            kind: 'asset',
            mime: 'image/png',
            size: baselineReference.byteLength,
            blob: baselineReference,
          },
        },
      },
      routeManifest: {
        version: '1',
        root: { id: 'route-root', pageDocId: 'asset-logo' },
      },
    };
    const snapshotDigest = `sha256-${'c'.repeat(64)}`;
    const diff = createExecutionFilesystemDiff({
      snapshotDigest,
      workspace: {
        workspaceId: workspace.id,
        snapshotId: 'snapshot-assets',
        partitionRevisions: {
          workspace: '3',
          route: '1',
          'document:asset-logo:content': '2',
          'document:asset-logo:meta': '1',
        },
      },
      capturedAt: 3,
      complete: true,
      changes: [
        {
          kind: 'added',
          path: 'public/generated.png',
          runtime: { contents: imported },
        },
        {
          kind: 'modified',
          path: 'public/logo.png',
          baseline: { contents: baseline },
          runtime: { contents: replacement },
          sourceTrace: [
            { sourceRef: { kind: 'document', documentId: 'asset-logo' } },
          ],
        },
      ],
    });
    uploadRuntimeAssets.mockImplementation(async (input) =>
      input.uploads.map((upload) => ({
        changeId: upload.changeId,
        upload: {
          kind: 'stored' as const,
          reference: upload.expectedReference,
        },
      }))
    );
    dispatchWorkspaceOperation.mockResolvedValue({
      status: 'applied',
      operationId: 'operation-assets',
    });
    render(
      <ExecutionCenter
        sessionId="filesystem-asset-proposal"
        workspace={workspace}
        workspaceReadonly={false}
        filesystemArtifact={{
          executionId: 'execution-assets',
          artifactId: `filesystem-diff:${snapshotDigest}`,
          snapshotDigest,
          workspaceSnapshotId: 'snapshot-assets',
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
    expect(uploadRuntimeAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: workspace.id,
        uploads: [
          expect.objectContaining({ contents: imported }),
          expect.objectContaining({ contents: replacement }),
        ],
      })
    );
    expect(uploadRuntimeAssets.mock.invocationCallOrder[0]).toBeLessThan(
      dispatchWorkspaceOperation.mock.invocationCallOrder[0]!
    );
    const operation = dispatchWorkspaceOperation.mock.calls[0]?.[0]
      ?.operation as {
      transaction?: { commands?: readonly { type: string }[] };
    };
    expect(operation.transaction?.commands?.map(({ type }) => type)).toEqual([
      'document.create',
      'asset.content.replace',
    ]);
  });
});
