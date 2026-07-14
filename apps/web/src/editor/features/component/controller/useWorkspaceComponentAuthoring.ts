import { useCallback, useMemo } from 'react';
import {
  createEmptyPirComponentContract,
  type PIRCollectionNode,
  type PIRCollectionRegions,
  type PIRComponentContract,
  type PIRComponentInstanceBindings,
  type PIRComponentInstanceNode,
  type PIRGraphPlacementTarget,
} from '@prodivix/pir';
import {
  createWorkspaceComponentContractUpdateTransactionPlan,
  createWorkspaceComponentDefinitionTransactionPlan,
  createWorkspaceComponentExtractionTransactionPlan,
  createWorkspaceCollectionInsertTransactionPlan,
  createWorkspaceCollectionUpdateTransactionPlan,
  createWorkspaceComponentInstanceBindingsUpdateTransactionPlan,
  createWorkspaceComponentInstanceTransactionPlan,
  selectWorkspacePirDocument,
  type WorkspaceCommandEnvelope,
  type WorkspaceComponentExtractionTransactionPlanResult,
  type WorkspaceTransactionEnvelope,
} from '@prodivix/workspace';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { createWorkspaceClientOperationId } from '@/editor/workspaceSync/workspaceOperationIdentity';
import { dispatchWorkspaceAuthoringOperation } from '@/editor/workspaceSync/workspaceAuthoringOperationDispatcher';
import { createWorkspaceComponentAuthoringModel } from '@/editor/features/component/model/workspaceComponentAuthoringModel';

export type WorkspaceComponentAuthoringOutcome =
  | Readonly<{ status: 'applied'; operationId: string }>
  | Readonly<{ status: 'rejected'; message: string }>;

const slugify = (value: string): string => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'component';
};

const firstIssueMessage = (
  result: Readonly<{
    status: 'rejected';
    issues: readonly Readonly<{ message: string }>[];
  }>
): string => result.issues[0]?.message || 'The authoring plan was rejected.';

/**
 * Owns the Component plan-to-outbox boundary. UI surfaces retain only drafts and the
 * exact preview plan; every accepted domain change is dispatched as a
 * reversible Workspace Command or the planner's immutable Transaction.
 */
export const useWorkspaceComponentAuthoring = () => {
  const workspace = useEditorStore((state) => state.workspace);
  const readonly = useEditorStore((state) => state.workspaceReadonly);
  const setActiveDocumentId = useEditorStore(
    (state) => state.setActiveDocumentId
  );
  const model = useMemo(
    () =>
      workspace ? createWorkspaceComponentAuthoringModel(workspace) : null,
    [workspace]
  );

  const applyCommand = useCallback(
    async (
      command: WorkspaceCommandEnvelope
    ): Promise<WorkspaceComponentAuthoringOutcome> => {
      if (!workspace || readonly) {
        return {
          status: 'rejected',
          message: readonly
            ? 'This Workspace is read-only.'
            : 'No Workspace is loaded.',
        };
      }
      const result = await dispatchWorkspaceAuthoringOperation({
        workspace,
        readonly,
        operation: { kind: 'command', command },
      });
      return result;
    },
    [readonly, workspace]
  );

  const applyTransaction = useCallback(
    async (
      transaction: WorkspaceTransactionEnvelope
    ): Promise<WorkspaceComponentAuthoringOutcome> => {
      if (!workspace || readonly) {
        return {
          status: 'rejected',
          message: readonly
            ? 'This Workspace is read-only.'
            : 'No Workspace is loaded.',
        };
      }
      const result = await dispatchWorkspaceAuthoringOperation({
        workspace,
        readonly,
        operation: { kind: 'transaction', transaction },
      });
      return result;
    },
    [readonly, workspace]
  );

  const createDefinition = useCallback(
    async (input: {
      name: string;
      rootType?: string;
    }): Promise<WorkspaceComponentAuthoringOutcome> => {
      if (!workspace) {
        return { status: 'rejected', message: 'No Workspace is loaded.' };
      }
      const name = input.name.trim();
      if (!name) {
        return { status: 'rejected', message: 'Component name is required.' };
      }
      const suffix = createWorkspaceClientOperationId('component')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(-8)
        .toLowerCase();
      const documentId = `component-${slugify(name)}-${suffix}`;
      const transactionId = createWorkspaceClientOperationId(
        'component-definition'
      );
      const root = workspace.treeById[workspace.treeRootId];
      const plan = createWorkspaceComponentDefinitionTransactionPlan({
        workspace,
        baseRevision: workspace.workspaceRev,
        transactionId,
        issuedAt: new Date().toISOString(),
        documentId,
        path: `/${documentId}.pir.json`,
        name,
        rootId: 'root',
        rootType: input.rootType?.trim() || 'div',
        componentContract: createEmptyPirComponentContract(),
        parentDirectoryId: workspace.treeRootId,
        index: root?.kind === 'dir' ? root.children.length : 0,
      });
      if (plan.status === 'rejected') {
        return { status: 'rejected', message: firstIssueMessage(plan) };
      }
      const outcome = await applyTransaction(plan.plan.transaction);
      if (outcome.status === 'applied') setActiveDocumentId(documentId);
      return outcome;
    },
    [applyTransaction, setActiveDocumentId, workspace]
  );

  const insertInstance = useCallback(
    async (input: {
      sourceDocumentId: string;
      componentDocumentId: string;
      placement: PIRGraphPlacementTarget;
    }): Promise<WorkspaceComponentAuthoringOutcome> => {
      if (!workspace) {
        return { status: 'rejected', message: 'No Workspace is loaded.' };
      }
      const target = selectWorkspacePirDocument(
        workspace,
        input.componentDocumentId
      );
      if (
        target?.status !== 'valid' ||
        !target.decodedContent.componentContract
      ) {
        return {
          status: 'rejected',
          message: 'The selected Component Definition is unavailable.',
        };
      }
      const contract = target.decodedContent.componentContract;
      const instanceId = `instance-${slugify(
        target.decodedContent.metadata?.name ||
          target.document.name ||
          'component'
      )}-${createWorkspaceClientOperationId('instance')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(-8)
        .toLowerCase()}`;
      const instance: PIRComponentInstanceNode = {
        id: instanceId,
        kind: 'component-instance',
        componentDocumentId: input.componentDocumentId,
        bindings: {
          props: Object.fromEntries(
            Object.values(contract.propsById)
              .filter((member) => member.defaultValue !== undefined)
              .map((member) => [
                member.id,
                { kind: 'literal' as const, value: member.defaultValue! },
              ])
          ),
          events: {},
          variants: Object.fromEntries(
            Object.values(contract.variantAxesById)
              .filter((axis) => axis.defaultOptionId)
              .map((axis) => [axis.id, axis.defaultOptionId!])
          ),
        },
      };
      const plan = createWorkspaceComponentInstanceTransactionPlan({
        workspace,
        baseRevision: workspace.workspaceRev,
        transactionId: createWorkspaceClientOperationId('component-instance'),
        issuedAt: new Date().toISOString(),
        sourceDocumentId: input.sourceDocumentId,
        instance,
        placement: input.placement,
      });
      if (plan.status === 'rejected') {
        return { status: 'rejected', message: firstIssueMessage(plan) };
      }
      return applyTransaction(plan.plan.transaction);
    },
    [applyTransaction, workspace]
  );

  const updateContract = useCallback(
    async (
      componentDocumentId: string,
      componentContract: PIRComponentContract
    ): Promise<WorkspaceComponentAuthoringOutcome> => {
      if (!workspace) {
        return { status: 'rejected', message: 'No Workspace is loaded.' };
      }
      const plan = createWorkspaceComponentContractUpdateTransactionPlan({
        workspace,
        baseRevision: workspace.workspaceRev,
        transactionId: createWorkspaceClientOperationId('component-contract'),
        issuedAt: new Date().toISOString(),
        componentDocumentId,
        componentContract,
      });
      if (plan.status === 'rejected') {
        return { status: 'rejected', message: firstIssueMessage(plan) };
      }
      return applyTransaction(plan.plan.transaction);
    },
    [applyTransaction, workspace]
  );

  const updateInstanceBindings = useCallback(
    async (input: {
      documentId: string;
      instanceNodeId: string;
      bindings: PIRComponentInstanceBindings;
    }): Promise<WorkspaceComponentAuthoringOutcome> => {
      if (!workspace) {
        return { status: 'rejected', message: 'No Workspace is loaded.' };
      }
      const plan =
        createWorkspaceComponentInstanceBindingsUpdateTransactionPlan({
          workspace,
          baseRevision: workspace.workspaceRev,
          transactionId: createWorkspaceClientOperationId(
            'component-instance-bindings'
          ),
          issuedAt: new Date().toISOString(),
          ...input,
        });
      if (plan.status === 'rejected') {
        return { status: 'rejected', message: firstIssueMessage(plan) };
      }
      return applyTransaction(plan.plan.transaction);
    },
    [applyTransaction, workspace]
  );

  const insertCollection = useCallback(
    async (input: {
      documentId: string;
      placement: PIRGraphPlacementTarget;
    }): Promise<WorkspaceComponentAuthoringOutcome> => {
      if (!workspace) {
        return { status: 'rejected', message: 'No Workspace is loaded.' };
      }
      const suffix = createWorkspaceClientOperationId('collection')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(-8)
        .toLowerCase();
      const collection: PIRCollectionNode = {
        id: `collection-${suffix}`,
        kind: 'collection',
        source: { kind: 'literal', value: [] },
        key: { kind: 'index' },
        symbols: {
          itemId: `collection-item-${suffix}`,
          itemName: 'item',
          indexId: `collection-index-${suffix}`,
          indexName: 'index',
          errorId: `collection-error-${suffix}`,
        },
      };
      const plan = createWorkspaceCollectionInsertTransactionPlan({
        workspace,
        baseRevision: workspace.workspaceRev,
        transactionId: createWorkspaceClientOperationId('collection-insert'),
        issuedAt: new Date().toISOString(),
        documentId: input.documentId,
        collection,
        placement: input.placement,
        regions: { item: [] },
      });
      if (plan.status === 'rejected') {
        return { status: 'rejected', message: firstIssueMessage(plan) };
      }
      return applyTransaction(plan.plan.transaction);
    },
    [applyTransaction, workspace]
  );

  const updateCollection = useCallback(
    async (input: {
      documentId: string;
      collection: PIRCollectionNode;
      regions: PIRCollectionRegions;
    }): Promise<WorkspaceComponentAuthoringOutcome> => {
      if (!workspace) {
        return { status: 'rejected', message: 'No Workspace is loaded.' };
      }
      const plan = createWorkspaceCollectionUpdateTransactionPlan({
        workspace,
        baseRevision: workspace.workspaceRev,
        transactionId: createWorkspaceClientOperationId('collection-update'),
        issuedAt: new Date().toISOString(),
        ...input,
      });
      if (plan.status === 'rejected') {
        return { status: 'rejected', message: firstIssueMessage(plan) };
      }
      return applyTransaction(plan.plan.transaction);
    },
    [applyTransaction, workspace]
  );

  const planExtraction = useCallback(
    (input: {
      sourceDocumentId: string;
      subtreeRootId: string;
      componentName: string;
    }): WorkspaceComponentExtractionTransactionPlanResult => {
      if (!workspace) {
        return {
          status: 'rejected',
          issues: [
            {
              code: 'WKS_COMPONENT_EXTRACTION_INPUT_INVALID',
              path: '/workspace',
              message: 'No Workspace is loaded.',
            },
          ],
        } as WorkspaceComponentExtractionTransactionPlanResult;
      }
      const componentName = input.componentName.trim();
      const slug = slugify(componentName);
      const suffix = createWorkspaceClientOperationId('extraction')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(-8)
        .toLowerCase();
      const componentDocumentId = `component-${slug}-${suffix}`;
      return createWorkspaceComponentExtractionTransactionPlan({
        workspace,
        baseRevision: workspace.workspaceRev,
        transactionId: createWorkspaceClientOperationId('component-extraction'),
        issuedAt: new Date().toISOString(),
        sourceDocumentId: input.sourceDocumentId,
        subtreeRootId: input.subtreeRootId,
        componentDocumentId,
        componentPath: `/components/${componentDocumentId}.pir.json`,
        componentName,
        instanceNodeId: `instance-${slug}-${suffix}`,
      });
    },
    [workspace]
  );

  return {
    workspace,
    readonly,
    model,
    applyCommand,
    applyTransaction,
    createDefinition,
    insertInstance,
    updateContract,
    updateInstanceBindings,
    insertCollection,
    updateCollection,
    planExtraction,
    setActiveDocumentId,
  };
};
