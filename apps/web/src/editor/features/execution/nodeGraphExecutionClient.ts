import {
  compileNodeGraphProgram,
  createFirstPartyNodeGraphDescriptorRegistry,
  createNodeGraphDebugController,
  createNodeGraphExecutionInvocationInput,
  createNodeGraphExecutionProvider,
  createNodeGraphProgramDebugExecutor,
  type NodeGraphDebugCommand,
  type NodeGraphDebugCommandResult,
  type NodeGraphDebugSnapshot,
  type NodeGraphDocument,
} from '@prodivix/nodegraph';
import {
  createExecutionRequest,
  type ExecutionJob,
} from '@prodivix/runtime-core';
import {
  selectWorkspaceNodeGraphDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { executionSessionCoordinator } from './executionSessionEnvironment';
import { nodeGraphDebugSessionEnvironment } from './nodeGraphDebugSession';
import {
  createClientExecutionRequestId,
  createWorkspaceExecutionSnapshotRef,
} from './workspaceExecutionIdentity';

export type StartWorkspaceNodeGraphExecutionInput = Readonly<{
  workspace: WorkspaceSnapshot;
  documentId: string;
  input?: unknown;
  params?: Readonly<Record<string, unknown>>;
  source?: Readonly<{
    ownerId: string;
    trigger: string;
    eventKey: string;
  }>;
}>;

export type WorkspaceNodeGraphExecution = Readonly<{
  sessionId: string;
  job: ExecutionJob;
}>;

export type WorkspaceNodeGraphDebugExecution = Readonly<{
  sessionId: string;
  snapshot: NodeGraphDebugSnapshot;
}>;

const documentsByRequestId = new Map<string, NodeGraphDocument>();

const provider = createNodeGraphExecutionProvider({
  resolveDocument: (request) => {
    const document = documentsByRequestId.get(request.requestId);
    if (!document) {
      throw new Error(
        `The NodeGraph snapshot for request ${request.requestId} is unavailable.`
      );
    }
    return document;
  },
});

const createDebugController = (
  documentId: string,
  documentRevision: number,
  requestId: string,
  graph: NodeGraphDocument
) => {
  const descriptors = createFirstPartyNodeGraphDescriptorRegistry();
  const availableCapabilities = ['observation:wait'];
  const compiled = compileNodeGraphProgram({
    documentId,
    documentRevision,
    graph,
    registry: descriptors,
    runtimeZone: 'client',
    availableCapabilities,
  });
  if (!compiled.ok) {
    throw new Error(
      `NodeGraph debug Program is blocked: ${compiled.issues[0]?.message ?? 'unknown planning issue'}`
    );
  }
  const controller = createNodeGraphDebugController({
    program: compiled.program,
    jobId: `nodegraph-debug:${requestId}`,
    attemptId: `nodegraph-debug-attempt:${requestId}`,
    leaseId: `nodegraph-debug-lease:${requestId}`,
    executor: createNodeGraphProgramDebugExecutor({
      program: compiled.program,
      grantedCapabilities: availableCapabilities,
    }),
  });
  if (!controller.ok) {
    throw new Error(controller.issue.safeMessage);
  }
  return controller.controller;
};

const cancelNodeGraphDebugSession = async (
  sessionId: string
): Promise<void> => {
  const debug = nodeGraphDebugSessionEnvironment.getSnapshot(sessionId);
  if (debug && (debug.status === 'paused' || debug.status === 'running')) {
    try {
      await nodeGraphDebugSessionEnvironment.command(sessionId, {
        ...debug.identity,
        expectedCommandSequence: debug.commandSequence + 1,
        kind: 'cancel',
      });
    } catch {
      // Replacing the local debug projection must still dispose stale state.
    }
  }
  nodeGraphDebugSessionEnvironment.dispose(sessionId);
};

export const getWorkspaceNodeGraphExecutionSessionId = (
  workspaceId: string,
  documentId: string
): string => `workspace:${workspaceId}:nodegraph:${documentId}`;

export const startWorkspaceNodeGraphExecution = async (
  input: StartWorkspaceNodeGraphExecutionInput
): Promise<WorkspaceNodeGraphExecution> => {
  const read = selectWorkspaceNodeGraphDocument(
    input.workspace,
    input.documentId
  );
  if (!read || read.status !== 'valid') {
    throw new Error(
      `NodeGraph document ${input.documentId} is unavailable or invalid.`
    );
  }

  const requestId = createClientExecutionRequestId('nodegraph-run');
  const sessionId = getWorkspaceNodeGraphExecutionSessionId(
    input.workspace.id,
    input.documentId
  );
  await executionSessionCoordinator.cancel(sessionId, {
    reason: 'Superseded by a newer NodeGraph execution.',
  });
  await cancelNodeGraphDebugSession(sessionId);
  const request = createExecutionRequest({
    requestId,
    profile: 'preview',
    runtimeZone: 'client',
    workspace: createWorkspaceExecutionSnapshotRef(input.workspace),
    invocation: {
      kind: 'nodegraph',
      targetRef: {
        kind: 'document',
        workspaceId: input.workspace.id,
        documentId: input.documentId,
      },
      input: createNodeGraphExecutionInvocationInput({
        input: input.input,
        params: input.params,
      }),
    },
    requiredCapabilities: [
      'cancellation',
      'diagnostics',
      'source-trace',
      'streaming-logs',
    ],
    timeoutMs: 10_000,
    metadata: {
      sourceOwnerId: input.source?.ownerId ?? input.documentId,
      trigger: input.source?.trigger ?? 'manual',
      eventKey: input.source?.eventKey ?? 'run',
    },
  });
  documentsByRequestId.set(requestId, read.decodedContent);

  try {
    const job = await provider.start(request);
    executionSessionCoordinator.activate({
      sessionId,
      label: read.document.name?.trim() || 'NodeGraph',
      job,
    });
    void job.completion.finally(() => documentsByRequestId.delete(requestId));
    return Object.freeze({ sessionId, job });
  } catch (error) {
    documentsByRequestId.delete(requestId);
    nodeGraphDebugSessionEnvironment.dispose(sessionId);
    throw error;
  }
};

export const startWorkspaceNodeGraphDebugExecution = async (
  input: StartWorkspaceNodeGraphExecutionInput
): Promise<WorkspaceNodeGraphDebugExecution> => {
  const read = selectWorkspaceNodeGraphDocument(
    input.workspace,
    input.documentId
  );
  if (!read || read.status !== 'valid') {
    throw new Error(
      `NodeGraph document ${input.documentId} is unavailable or invalid.`
    );
  }
  const sessionId = getWorkspaceNodeGraphExecutionSessionId(
    input.workspace.id,
    input.documentId
  );
  await executionSessionCoordinator.cancel(sessionId, {
    reason: 'Superseded by a fresh NodeGraph debug attempt.',
  });
  await cancelNodeGraphDebugSession(sessionId);
  const requestId = createClientExecutionRequestId('nodegraph-debug');
  const controller = createDebugController(
    input.documentId,
    input.workspace.workspaceRev,
    requestId,
    read.decodedContent
  );
  nodeGraphDebugSessionEnvironment.activate(sessionId, controller);
  return Object.freeze({
    sessionId,
    snapshot: controller.snapshot(),
  });
};

export const commandWorkspaceNodeGraphDebug = (
  workspaceId: string,
  documentId: string,
  command: NodeGraphDebugCommand
): Promise<NodeGraphDebugCommandResult> =>
  nodeGraphDebugSessionEnvironment.command(
    getWorkspaceNodeGraphExecutionSessionId(workspaceId, documentId),
    command
  );

export const stopWorkspaceNodeGraphExecution = (
  workspaceId: string,
  documentId: string,
  reason = 'NodeGraph execution stopped by the user.'
) => {
  const sessionId = getWorkspaceNodeGraphExecutionSessionId(
    workspaceId,
    documentId
  );
  void cancelNodeGraphDebugSession(sessionId);
  return executionSessionCoordinator.cancel(sessionId, { reason });
};
