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
  createExecutionNetworkTrace,
  createExecutionFilesystemDiff,
  createExecutionJobController,
  createExecutionProviderDescriptor,
  createExecutionRequest,
  toExecutionNetworkTraceValue,
  type ExecutionProviderCapability,
} from '@prodivix/runtime-core';
import {
  RemoteExecutionArtifactResolutionError,
  type RemoteExecutionTerminalClient,
} from '@prodivix/runtime-remote';
import {
  createServerFunctionInvocationTrace,
  EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
  SERVER_FUNCTION_INVOCATION_TRACE_NAME,
  toExecutionServerFunctionBridgeSuccess,
  toServerFunctionInvocationTraceValue,
} from '@prodivix/server-runtime';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { ExecutionCenter } from './ExecutionCenter';
import { useExecutionCenterNavigationStore } from './executionCenterNavigation';
import { executionSessionCoordinator } from './executionSessionEnvironment';
import { createWorkspaceExecutionSnapshotId } from './workspaceExecutionIdentity';

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
const executionCenterHeightStorageKey =
  'prodivix.editor.execution-center.height';
const localStorageValues = new Map<string, string>();
const localStorageStub: Storage = {
  clear: vi.fn(() => localStorageValues.clear()),
  getItem: vi.fn((key) => localStorageValues.get(key) ?? null),
  key: vi.fn((index) => [...localStorageValues.keys()][index] ?? null),
  get length() {
    return localStorageValues.size;
  },
  removeItem: vi.fn((key) => localStorageValues.delete(key)),
  setItem: vi.fn((key, value) => localStorageValues.set(key, value)),
};

beforeEach(() => {
  uploadRuntimeAssets.mockResolvedValue([]);
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: localStorageStub,
  });
  window.localStorage.removeItem(executionCenterHeightStorageKey);
});

const activateSession = (
  sessionId: string,
  capabilities: readonly ExecutionProviderCapability[],
  snapshotId = 'snapshot'
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
      workspace: { workspaceId: 'workspace', snapshotId },
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

const createTerminalClient = (
  suffix = 'connected'
): RemoteExecutionTerminalClient => {
  const snapshot = Object.freeze({
    terminalSessionId: `terminal-${suffix}`,
    executionId: `job-terminal-${suffix}`,
    jobId: `job-terminal-${suffix}`,
    providerId: `provider-terminal-${suffix}`,
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
  useExecutionCenterNavigationStore.getState().clear();
});

describe('ExecutionCenter panel layout', () => {
  it('resizes with the keyboard, persists the preference, and resets', () => {
    render(<ExecutionCenter sessionId="resizable-panel" />);

    const separator = screen.getByRole('separator', {
      name: 'execution.resizePanel',
    });
    expect(separator.getAttribute('aria-valuenow')).toBe('210');

    fireEvent.keyDown(separator, { key: 'ArrowUp' });
    expect(separator.getAttribute('aria-valuenow')).toBe('226');
    expect(window.localStorage.getItem(executionCenterHeightStorageKey)).toBe(
      '226'
    );

    fireEvent.doubleClick(separator);
    expect(separator.getAttribute('aria-valuenow')).toBe('210');
  });

  it('maximizes and restores without replacing the saved manual height', () => {
    render(<ExecutionCenter sessionId="maximized-panel" />);

    fireEvent.click(
      screen.getByRole('button', { name: 'execution.maximizePanel' })
    );
    expect(
      screen.getByRole('button', { name: 'execution.restorePanel' })
    ).toBeTruthy();
    expect(
      Number(
        screen
          .getByRole('separator', { name: 'execution.resizePanel' })
          .getAttribute('aria-valuenow')
      )
    ).toBeGreaterThan(210);
    expect(window.localStorage.getItem(executionCenterHeightStorageKey)).toBe(
      '210'
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'execution.restorePanel' })
    );
    expect(
      screen
        .getByRole('separator', { name: 'execution.resizePanel' })
        .getAttribute('aria-valuenow')
    ).toBe('210');
  });
});

describe('ExecutionCenter Remote recovery', () => {
  it('presents quota and exhausted-worker recovery as explicit new-request policies', async () => {
    const controller = activateSession('worker-recovery', []);
    controller.fail({
      code: 'REMOTE_WORKER_RECOVERY_EXHAUSTED',
      message: 'worker recovery exhausted',
      retryable: true,
    });
    await controller.job.completion;
    const view = render(<ExecutionCenter sessionId="worker-recovery" />);
    expect(screen.getByText('execution.recovery.workerExhausted')).toBeTruthy();

    view.rerender(
      <ExecutionCenter
        sessionId="quota-recovery"
        status="failed"
        diagnostics={[
          { code: 'EXE-4291', severity: 'error', message: 'quota exceeded' },
        ]}
      />
    );
    expect(screen.getByText('execution.recovery.quota')).toBeTruthy();
    expect(screen.getByRole('status', { name: 'failed' })).toBeTruthy();
  });

  it('presents authorization, permission, network, cancellation, and timeout repair paths', async () => {
    const authorization = activateSession('authorization-recovery', []);
    authorization.fail({
      code: 'REMOTE_AUTHORIZATION_REQUIRED',
      message: 'authorization required',
      retryable: false,
    });
    await authorization.job.completion;
    const view = render(<ExecutionCenter sessionId="authorization-recovery" />);
    expect(
      screen.getByText('execution.recovery.authorizationRequired')
    ).toBeTruthy();

    const permission = activateSession('permission-recovery', []);
    permission.fail({
      code: 'REMOTE_PERMISSION_DENIED',
      message: 'permission denied',
      retryable: false,
    });
    await permission.job.completion;
    view.rerender(<ExecutionCenter sessionId="permission-recovery" />);
    expect(
      screen.getByText('execution.recovery.permissionDenied')
    ).toBeTruthy();

    const network = activateSession('network-recovery', []);
    network.fail({
      code: 'REMOTE_NETWORK_POLICY_DENIED',
      message: 'network denied',
      retryable: false,
    });
    await network.job.completion;
    view.rerender(<ExecutionCenter sessionId="network-recovery" />);
    expect(
      screen.getByText('execution.recovery.networkPolicyDenied')
    ).toBeTruthy();

    const cancelled = activateSession('cancelled-recovery', []);
    cancelled.finishCancelled('requested');
    await cancelled.job.completion;
    view.rerender(<ExecutionCenter sessionId="cancelled-recovery" />);
    expect(screen.getByText('execution.recovery.cancelled')).toBeTruthy();

    const timedOut = activateSession('timeout-recovery', []);
    timedOut.finishTimedOut(1_000);
    await timedOut.job.completion;
    view.rerender(<ExecutionCenter sessionId="timeout-recovery" />);
    expect(screen.getByText('execution.recovery.timedOut')).toBeTruthy();
  });

  it('requires a new request when a runtime filesystem artifact is unavailable', async () => {
    render(
      <ExecutionCenter
        sessionId="artifact-recovery"
        filesystemArtifact={{
          executionId: 'execution-1',
          jobId: 'job-execution-1',
          providerId: 'provider-execution-1',
          artifactId: 'artifact-1',
          snapshotDigest: `sha256-${'a'.repeat(64)}`,
          workspaceSnapshotId: 'snapshot-1',
          resolve: async () => {
            throw new RemoteExecutionArtifactResolutionError(
              'Remote artifact is unavailable.'
            );
          },
        }}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'execution.surface.files' })
    );
    expect(
      await screen.findByText('execution.recovery.artifactUnavailable')
    ).toBeTruthy();
  });
});

describe('ExecutionCenter Server Function surface', () => {
  it('shows exact sanitized invocation metadata after a finite Job is terminal', async () => {
    const sessionId = 'server-function-observation';
    const controller = activateSession(sessionId, ['server-function']);
    controller.succeed();
    await controller.job.completion;
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

describe('ExecutionCenter local view controls', () => {
  it('pauses and clears Console presentation without deleting Session history', async () => {
    const sessionId = 'console-view-checkpoint';
    const controller = activateSession(sessionId, ['diagnostics']);
    act(() => {
      controller.emitLog({
        stream: 'console',
        level: 'info',
        category: 'application',
        message: 'before-pause',
      });
    });
    render(<ExecutionCenter sessionId={sessionId} />);
    expect(screen.getByText('before-pause')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'execution.pause' }));
    act(() => {
      controller.emitLog({
        stream: 'console',
        level: 'info',
        category: 'application',
        message: 'while-paused',
      });
    });
    expect(screen.queryByText('while-paused')).toBeNull();
    expect(screen.getByText('execution.paused', { exact: false })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'execution.resume' }));
    expect(await screen.findByText('while-paused')).toBeTruthy();
    const retainedBeforeClear =
      executionSessionCoordinator.getSnapshot(sessionId)!.events.length;

    fireEvent.click(screen.getByRole('button', { name: 'execution.clear' }));
    expect(screen.queryByText('before-pause')).toBeNull();
    expect(screen.queryByText('while-paused')).toBeNull();
    expect(
      executionSessionCoordinator.getSnapshot(sessionId)!.events.length
    ).toBe(retainedBeforeClear);

    act(() => {
      controller.emitLog({
        stream: 'console',
        level: 'info',
        category: 'application',
        message: 'after-clear',
      });
    });
    expect(await screen.findByText('after-clear')).toBeTruthy();
    expect(
      executionSessionCoordinator.getSnapshot(sessionId)!.events.length
    ).toBeGreaterThan(retainedBeforeClear);
  });

  it('marks a diagnostic without exact SourceTrace as explicitly unavailable', () => {
    const sessionId = 'diagnostic-without-source';
    activateSession(sessionId, ['diagnostics']);
    render(
      <ExecutionCenter
        sessionId={sessionId}
        diagnostics={[
          {
            code: 'RUN-5001',
            severity: 'error',
            message: 'Compilation failed before a stable source was emitted.',
          },
        ]}
      />
    );

    expect(
      screen.getByText('Compilation failed before a stable source was emitted.')
    ).toBeTruthy();
    expect(
      screen.getByLabelText('execution.sourceNavigation.sourceUnavailable')
    ).toBeTruthy();
  });

  it('marks a retained NodeGraph or Animation session when the Workspace revision changes', () => {
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
          children: [],
        },
      },
      docsById: {},
      routeManifest: { version: '1', root: { id: 'route-root' } },
    };
    const sessionId = 'revision-aware-session';
    activateSession(
      sessionId,
      ['source-trace'],
      createWorkspaceExecutionSnapshotId(workspace)
    );
    const view = render(
      <ExecutionCenter sessionId={sessionId} workspace={workspace} />
    );
    expect(screen.queryByLabelText('execution.status.stale')).toBeNull();

    view.rerender(
      <ExecutionCenter
        sessionId={sessionId}
        workspace={{ ...workspace, workspaceRev: 2 }}
      />
    );
    expect(screen.getByLabelText('execution.status.stale')).toBeTruthy();
  });
});

describe('ExecutionCenter Console SourceTrace navigation', () => {
  it('consumes an exact Issues diagnostic focus and opens the error-filtered Console', async () => {
    const sessionId = 'issues-diagnostic-focus';
    const controller = activateSession(sessionId, ['diagnostics']);
    controller.emitLog({
      stream: 'console',
      level: 'info',
      category: 'application',
      message: 'non-error application noise',
    });
    controller.emitDiagnostic({
      code: 'TST-5001',
      severity: 'error',
      domain: 'code',
      message: 'Generated test failed.',
      targetRef: { kind: 'code-artifact', artifactId: 'code-test' },
    });
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
          children: [],
        },
      },
      docsById: {},
      routeManifest: { version: '1', root: { id: 'route-root' } },
    };
    useExecutionCenterNavigationStore.getState().openExecutionDiagnostic({
      workspaceId: workspace.id,
      sessionId,
      diagnosticCode: 'TST-5001',
    });

    render(<ExecutionCenter sessionId={sessionId} workspace={workspace} />);

    await waitFor(() =>
      expect(useExecutionCenterNavigationStore.getState().request).toBeNull()
    );
    expect(screen.getByText('Generated test failed.')).toBeTruthy();
    expect(screen.queryByText('non-error application noise')).toBeNull();
  });

  it('opens a correlated artifact owner and preserves exact snapshot failures', async () => {
    const sessionId = 'console-artifact-source';
    const controller = activateSession(sessionId, ['artifacts']);
    controller.emitArtifact({
      artifactId: 'coverage-report',
      kind: 'coverage',
      label: 'Coverage report',
      sourceTrace: [
        {
          sourceRef: { kind: 'code-artifact', artifactId: 'code-test' },
        },
      ],
    });
    controller.succeed();
    await controller.job.completion;
    const openSourceTrace = vi.fn(() => ({ status: 'opened' as const }));
    const view = render(
      <ExecutionCenter
        sessionId={sessionId}
        onOpenSourceTrace={openSourceTrace}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'execution.openSource' })
    );
    expect(openSourceTrace).toHaveBeenCalledWith({
      jobId: controller.job.id,
      providerId: controller.job.provider.id,
      snapshotId: controller.job.request.workspace.snapshotId,
      sourceTrace: {
        sourceRef: { kind: 'code-artifact', artifactId: 'code-test' },
      },
    });

    view.rerender(
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

describe('ExecutionCenter Data Network navigation', () => {
  it('opens a requested exact-operation filter and links the trace back to Inspector', async () => {
    const sessionId = 'data-network-navigation';
    const controller = activateSession(sessionId, ['console']);
    const publishNetwork = (
      requestId: string,
      operationId: string,
      sanitizedUrl: string,
      observedAt: number
    ) => {
      const trace = createExecutionNetworkTrace({
        requestId,
        phase: 'runtime',
        runtimeZone: 'server',
        mode: 'live',
        adapter: 'core.http',
        method: 'GET',
        sanitizedUrl,
        protocol: 'https',
        startedAt: observedAt - 10,
        completedAt: observedAt,
        outcome: 'allowed',
        status: 200,
        correlation: {
          kind: 'data-operation',
          documentId: 'data-catalog',
          operationId,
          invocationId: `invocation-${operationId}`,
          sequence: 1,
          attempt: 1,
        },
        sourceTrace: [
          {
            sourceRef: {
              kind: 'data-operation',
              documentId: 'data-catalog',
              operationId,
            },
            label: 'Data operation',
          },
        ],
      });
      executionSessionCoordinator.publishTrace({
        sessionId,
        jobId: controller.job.id,
        observedAt,
        trace: {
          traceId: `network:${controller.job.id}`,
          spanId: requestId,
          name: 'network.request',
          phase: 'event',
          detail: toExecutionNetworkTraceValue(trace),
        },
      });
    };
    publishNetwork(
      'listproducts:1',
      'listproducts',
      'https://catalog.example.test/',
      110
    );
    publishNetwork(
      'createproduct:1',
      'createproduct',
      'https://create.catalog.example.test/',
      120
    );
    useExecutionCenterNavigationStore.getState().openNetworkOperation({
      workspaceId: 'workspace',
      documentId: 'data-catalog',
      operationId: 'listproducts',
    });
    const openDataOperation = vi.fn();
    const openSourceTrace = vi.fn(() => ({ status: 'opened' as const }));
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
          children: [],
        },
      },
      docsById: {},
      routeManifest: { version: '1', root: { id: 'route-root' } },
    };

    render(
      <ExecutionCenter
        sessionId={sessionId}
        workspace={workspace}
        onOpenDataOperation={openDataOperation}
        onOpenSourceTrace={openSourceTrace}
      />
    );

    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'execution.surface.network' })
          .getAttribute('aria-pressed')
      ).toBe('true')
    );
    expect(screen.getByText('listproducts ×')).toBeTruthy();
    expect(screen.getByText('https://catalog.example.test/')).toBeTruthy();
    expect(
      screen.queryByText('https://create.catalog.example.test/')
    ).toBeNull();
    expect(useExecutionCenterNavigationStore.getState().request).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'execution.openDataInspector' })
    );
    expect(openDataOperation).toHaveBeenCalledWith({
      documentId: 'data-catalog',
      operationId: 'listproducts',
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'execution.openSource' })
    );
    expect(openSourceTrace).toHaveBeenCalledWith({
      jobId: controller.job.id,
      providerId: controller.job.provider.id,
      snapshotId: controller.job.request.workspace.snapshotId,
      sourceTrace: {
        sourceRef: {
          kind: 'data-operation',
          documentId: 'data-catalog',
          operationId: 'listproducts',
        },
        label: 'Data operation',
      },
    });
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

    expect(await screen.findAllByText(/remote-ready/)).toHaveLength(2);
    const input = screen.getByRole('textbox', {
      name: 'execution.terminal.inputLabel',
    });
    fireEvent.paste(input, {
      clipboardData: { getData: () => 'pwd\n' },
    });

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
    expect((input as HTMLTextAreaElement).value).toBe('');
    expect(screen.getByTestId('execution-terminal-emulator')).toBeTruthy();
  });

  it('renders ANSI state and drains rapid keyboard input in exact sequence', async () => {
    activateSession('terminal-emulator', ['terminal']);
    const terminalClient = createTerminalClient('emulator');
    const data = '\u001b[?1h\u001b[31mansi-ready\u001b[0m\r\n';
    vi.mocked(terminalClient.read).mockImplementation(async (input) => ({
      terminalSessionId: 'terminal-emulator',
      executionId: 'job-terminal-emulator',
      jobId: 'job-terminal-emulator',
      status: 'open',
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
                terminalSessionId: 'terminal-emulator',
                executionId: 'job-terminal-emulator',
                jobId: 'job-terminal-emulator',
                cursor: 1,
                emittedAt: 2,
                stream: 'stdout',
                data,
                byteLength: Buffer.byteLength(data),
                redacted: false,
                truncated: false,
              },
            ]
          : [],
    }));
    render(
      <ExecutionCenter
        sessionId="terminal-emulator"
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

    const rendered = (await screen.findAllByText('ansi-ready')).find(
      (element) => element.getAttribute('aria-live') === null
    );
    expect(rendered?.style.color).toBe('rgb(239, 68, 68)');
    const input = screen.getByRole('textbox', {
      name: 'execution.terminal.inputLabel',
    });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'p' });
    fireEvent.keyDown(input, { key: 'w' });
    fireEvent.keyDown(input, { key: 'd' });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'c', ctrlKey: true });

    await waitFor(() => expect(terminalClient.write).toHaveBeenCalledTimes(5));
    expect(
      vi.mocked(terminalClient.write).mock.calls.map(([call]) => ({
        data: call.data,
        clientSequence: call.clientSequence,
      }))
    ).toEqual([
      { data: '\u001bOA', clientSequence: 1 },
      { data: 'p', clientSequence: 2 },
      { data: 'w', clientSequence: 3 },
      { data: 'd', clientSequence: 4 },
      { data: '\r', clientSequence: 5 },
    ]);
    expect(terminalClient.signal).toHaveBeenCalledWith(
      expect.objectContaining({ signal: 'interrupt' })
    );
  });

  it('retries only the exact unacknowledged input after cursor reconnect', async () => {
    activateSession('terminal-retry', ['terminal']);
    const terminalClient = createTerminalClient('retry');
    vi.mocked(terminalClient.write)
      .mockRejectedValueOnce(new Error('transport lost after write'))
      .mockImplementationOnce(async (input) => ({
        status: 'duplicate',
        clientSequence: input.clientSequence,
      }));
    render(
      <ExecutionCenter
        sessionId="terminal-retry"
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
    await screen.findAllByText(/remote-ready/);
    fireEvent.paste(
      screen.getByRole('textbox', {
        name: 'execution.terminal.inputLabel',
      }),
      { clipboardData: { getData: () => 'id\n' } }
    );

    await waitFor(() => expect(terminalClient.write).toHaveBeenCalledTimes(2), {
      timeout: 2_000,
    });
    expect(terminalClient.resume).toHaveBeenCalled();
    const writes = vi.mocked(terminalClient.write).mock.calls;
    expect(writes[0]?.[0]).toMatchObject({ data: 'id\n', clientSequence: 1 });
    expect(writes[1]?.[0]).toMatchObject({ data: 'id\n', clientSequence: 1 });
  });

  it('fails closed before rendering output with invalid byte identity', async () => {
    activateSession('terminal-invalid-output', ['terminal']);
    const terminalClient = createTerminalClient('invalid-output');
    vi.mocked(terminalClient.read).mockImplementation(async (input) => ({
      terminalSessionId: 'terminal-invalid-output',
      executionId: 'job-terminal-invalid-output',
      jobId: 'job-terminal-invalid-output',
      status: 'open',
      afterCursor: input.afterCursor,
      nextCursor: 1,
      latestCursor: 1,
      earliestAvailableCursor: 1,
      gap: false,
      hasMore: false,
      records: [
        {
          terminalSessionId: 'terminal-invalid-output',
          executionId: 'job-terminal-invalid-output',
          jobId: 'job-terminal-invalid-output',
          cursor: 1,
          emittedAt: 2,
          stream: 'stdout',
          data: 'must-not-render',
          byteLength: 1,
          redacted: false,
          truncated: false,
        },
      ],
    }));
    render(
      <ExecutionCenter
        sessionId="terminal-invalid-output"
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

    expect(
      await screen.findByText('execution.terminal.error.output-invalid')
    ).toBeTruthy();
    expect(screen.queryByText('must-not-render')).toBeNull();
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
    const openSourceTrace = vi.fn(() => ({ status: 'opened' as const }));
    render(
      <ExecutionCenter
        sessionId="filesystem-proposal"
        workspace={workspace}
        workspaceReadonly={false}
        filesystemArtifact={{
          executionId: 'execution-1',
          jobId: 'job-execution-1',
          providerId: 'provider-execution-1',
          artifactId: `filesystem-diff:${snapshotDigest}`,
          snapshotDigest,
          workspaceSnapshotId: 'snapshot',
          resolve: vi.fn(async () => diff),
        }}
        onOpenSourceTrace={openSourceTrace}
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
    fireEvent.click(
      screen.getByRole('button', { name: 'execution.openSource' })
    );
    expect(openSourceTrace).toHaveBeenCalledWith({
      jobId: 'job-execution-1',
      providerId: 'provider-execution-1',
      snapshotId: 'snapshot',
      sourceTrace: {
        sourceRef: { kind: 'code-artifact', artifactId: 'code-1' },
      },
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
          jobId: 'job-execution-vfs',
          providerId: 'provider-execution-vfs',
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
          jobId: 'job-execution-assets',
          providerId: 'provider-execution-assets',
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
