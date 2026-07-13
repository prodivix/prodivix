import type { PIRDocument } from '@prodivix/shared/types/pir';
import {
  applyWorkspaceCommand,
  applyWorkspaceTransaction,
  createWorkspaceCodeSourceUpdateCommand,
  createWorkspaceDocumentAtPathCommand,
  createWorkspaceHistoryState,
  createWorkspacePirDocumentUpdateCommand,
  createWorkspaceRouteIntentPlan,
  getWorkspaceOperationCommands,
  recordWorkspaceOperation,
  redoWorkspaceHistory,
  undoWorkspaceHistory,
  validateWorkspaceSnapshot,
  type WorkspaceCommandEnvelope,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  GOLDEN_EDITED_HANDLER_SOURCE,
  GOLDEN_IDS,
  GOLDEN_INITIAL_HANDLER_SOURCE,
  createGoldenBaseWorkspace,
  createGoldenCheckoutPir,
  createGoldenDocuments,
} from './goldenApp.fixture';

export const GOLDEN_CREATED_AT = '2026-07-13T08:00:00.000Z';
export const GOLDEN_EDITED_AT = '2026-07-13T08:01:00.000Z';

export type GoldenAuthoringResult = Readonly<{
  baseWorkspace: WorkspaceSnapshot;
  createdWorkspace: WorkspaceSnapshot;
  editedWorkspace: WorkspaceSnapshot;
  createCommands: readonly WorkspaceCommandEnvelope[];
  editOperation: WorkspaceOperation;
  history: Readonly<{
    undoRestoredCreatedState: boolean;
    redoRestoredEditedState: boolean;
  }>;
}>;

export const getGoldenCodeSource = (
  workspace: WorkspaceSnapshot,
  documentId = GOLDEN_IDS.checkoutHandler
): string => {
  const content = workspace.docsById[documentId]?.content;
  if (
    !content ||
    typeof content !== 'object' ||
    !('source' in content) ||
    typeof content.source !== 'string'
  ) {
    throw new Error(`Golden code document is missing: ${documentId}`);
  }
  return content.source;
};

export const requireValidGoldenWorkspace = (
  workspace: WorkspaceSnapshot,
  stage: string
): WorkspaceSnapshot => {
  const validation = validateWorkspaceSnapshot(workspace);
  if (!validation.valid) {
    throw new Error(`${stage}: ${JSON.stringify(validation.issues)}`);
  }
  return workspace;
};

export const applyGoldenOperation = (
  workspace: WorkspaceSnapshot,
  operation: WorkspaceOperation,
  stage: string
): WorkspaceSnapshot => {
  const result =
    operation.kind === 'command'
      ? applyWorkspaceCommand(workspace, operation.command)
      : applyWorkspaceTransaction(workspace, operation.transaction);
  if (!result.ok) {
    throw new Error(`${stage}: ${JSON.stringify(result.issues)}`);
  }
  return result.snapshot;
};

const requireRoutePlan = (
  workspace: WorkspaceSnapshot,
  intent: Parameters<typeof createWorkspaceRouteIntentPlan>[1],
  id: string,
  issuedAt: string
): WorkspaceOperation => {
  const plan = createWorkspaceRouteIntentPlan(workspace, intent, {
    id,
    issuedAt,
  });
  if (!plan) throw new Error(`Could not plan Golden route operation: ${id}`);
  return plan;
};

const createGoldenWorkspace = (): {
  baseWorkspace: WorkspaceSnapshot;
  createdWorkspace: WorkspaceSnapshot;
  createCommands: WorkspaceCommandEnvelope[];
} => {
  const baseWorkspace = createGoldenBaseWorkspace();
  let workspace = baseWorkspace;
  const operations: WorkspaceOperation[] = [];

  const checkoutRoute = requireRoutePlan(
    workspace,
    {
      type: 'create-child-route',
      parentRouteNodeId: 'root',
      segment: 'checkout',
      routeNodeId: GOLDEN_IDS.checkoutRoute,
      pageDocId: GOLDEN_IDS.checkoutPage,
    },
    'golden-create-checkout-route',
    GOLDEN_CREATED_AT
  );
  workspace = applyGoldenOperation(
    workspace,
    checkoutRoute,
    'create checkout route'
  );
  operations.push(checkoutRoute);

  createGoldenDocuments().forEach((document, index) => {
    const command = createWorkspaceDocumentAtPathCommand({
      workspace,
      document,
      commandId: `golden-create-document-${index + 1}`,
      issuedAt: GOLDEN_CREATED_AT,
    });
    const operation: WorkspaceOperation = { kind: 'command', command };
    workspace = applyGoldenOperation(
      workspace,
      operation,
      `create ${document.path}`
    );
    operations.push(operation);
  });

  [
    {
      routeNodeId: GOLDEN_IDS.orderSummaryRoute,
      segment: 'order-summary',
    },
    {
      routeNodeId: GOLDEN_IDS.orderSummaryPreviewRoute,
      segment: 'order-summary-preview',
    },
  ].forEach(({ routeNodeId, segment }) => {
    const route = requireRoutePlan(
      workspace,
      {
        type: 'create-child-route',
        parentRouteNodeId: 'root',
        segment,
        routeNodeId,
        pageDocId: GOLDEN_IDS.orderSummaryComponent,
      },
      `golden-create-${routeNodeId}`,
      GOLDEN_CREATED_AT
    );
    workspace = applyGoldenOperation(
      workspace,
      route,
      `reuse order summary at ${segment}`
    );
    operations.push(route);
  });

  const runtimeReference = requireRoutePlan(
    workspace,
    {
      type: 'set-runtime-ref',
      routeNodeId: GOLDEN_IDS.checkoutRoute,
      kind: 'action',
      reference: {
        artifactId: GOLDEN_IDS.checkoutHandler,
        exportName: 'submitCheckout',
      },
    },
    'golden-bind-checkout-action',
    GOLDEN_CREATED_AT
  );
  workspace = applyGoldenOperation(
    workspace,
    runtimeReference,
    'bind checkout action'
  );
  operations.push(runtimeReference);

  return {
    baseWorkspace,
    createdWorkspace: requireValidGoldenWorkspace(
      workspace,
      'created workspace'
    ),
    createCommands: operations.flatMap((operation) => [
      ...getWorkspaceOperationCommands(operation),
    ]),
  };
};

const editGoldenWorkspace = (createdWorkspace: WorkspaceSnapshot) => {
  const checkoutDocument = createdWorkspace.docsById[GOLDEN_IDS.checkoutPage];
  const handlerDocument = createdWorkspace.docsById[GOLDEN_IDS.checkoutHandler];
  if (!checkoutDocument || !handlerDocument) {
    throw new Error('Golden edit targets were not created.');
  }
  const pirCommand = createWorkspacePirDocumentUpdateCommand({
    workspace: {
      ...createdWorkspace,
      activeDocumentId: GOLDEN_IDS.checkoutPage,
    },
    before: checkoutDocument.content as PIRDocument,
    after: createGoldenCheckoutPir(),
    commandId: 'golden-edit-checkout-pir',
    issuedAt: GOLDEN_EDITED_AT,
    label: 'Author Golden checkout',
  });
  const codeCommand = createWorkspaceCodeSourceUpdateCommand({
    workspaceId: createdWorkspace.id,
    document: handlerDocument,
    source: GOLDEN_EDITED_HANDLER_SOURCE,
    commandId: 'golden-edit-checkout-handler',
    issuedAt: GOLDEN_EDITED_AT,
    label: 'Author Golden checkout action',
  });
  if (!pirCommand || !codeCommand) {
    throw new Error('Golden edit commands were empty.');
  }
  const editOperation: WorkspaceOperation = {
    kind: 'transaction',
    transaction: {
      id: 'golden-edit-checkout',
      workspaceId: createdWorkspace.id,
      issuedAt: GOLDEN_EDITED_AT,
      label: 'Edit Golden checkout',
      commands: [pirCommand, codeCommand],
    },
  };
  const editedWorkspace = requireValidGoldenWorkspace(
    applyGoldenOperation(
      createdWorkspace,
      editOperation,
      'edit Golden workspace'
    ),
    'edited workspace'
  );
  const history = recordWorkspaceOperation(
    createWorkspaceHistoryState(),
    editOperation,
    { appliedAt: GOLDEN_EDITED_AT }
  );
  const scope = {
    kind: 'workspace',
    workspaceId: createdWorkspace.id,
  } as const;
  const undone = undoWorkspaceHistory(editedWorkspace, history, scope, {
    clock: () => GOLDEN_EDITED_AT,
  });
  if (!undone.ok) throw new Error(JSON.stringify(undone.issues));
  const redone = redoWorkspaceHistory(undone.snapshot, undone.history, scope, {
    clock: () => GOLDEN_EDITED_AT,
  });
  if (!redone.ok) throw new Error(JSON.stringify(redone.issues));
  return {
    editOperation,
    editedWorkspace,
    history: {
      undoRestoredCreatedState:
        getGoldenCodeSource(undone.snapshot) === GOLDEN_INITIAL_HANDLER_SOURCE,
      redoRestoredEditedState:
        getGoldenCodeSource(redone.snapshot) === GOLDEN_EDITED_HANDLER_SOURCE,
    },
  };
};

/** Authors the Golden fixture exclusively through public Command and History APIs. */
export const authorGoldenWorkspace = (): GoldenAuthoringResult => {
  const created = createGoldenWorkspace();
  const edited = editGoldenWorkspace(created.createdWorkspace);
  return {
    ...created,
    ...edited,
  };
};
