import type {
  DiagnosticQuickFixReference,
  ProdivixDiagnostic,
} from '@prodivix/diagnostics';
import type {
  WorkspaceCommandEnvelope,
  WorkspaceSnapshot,
  WorkspaceTransactionEnvelope,
} from '@prodivix/workspace';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { dispatchWorkspaceAuthoringOperation } from '@/editor/workspaceSync/workspaceAuthoringOperationDispatcher';

type QuickFixContext = Readonly<{
  workspace: WorkspaceSnapshot;
  diagnostic: ProdivixDiagnostic;
}>;

type CommandQuickFixFactory = (
  context: QuickFixContext
) => WorkspaceCommandEnvelope | null;
type TransactionQuickFixFactory = (
  context: QuickFixContext
) => WorkspaceTransactionEnvelope | null;

const commandFactories = new Map<string, CommandQuickFixFactory>();
const transactionFactories = new Map<string, TransactionQuickFixFactory>();

const registerFactory = <TFactory>(
  registry: Map<string, TFactory>,
  id: string,
  factory: TFactory
): (() => void) => {
  const normalizedId = id.trim();
  if (!normalizedId) throw new Error('Quick Fix ids must be non-empty.');
  if (registry.has(normalizedId)) {
    throw new Error(`Quick Fix ${normalizedId} is already registered.`);
  }
  registry.set(normalizedId, factory);
  return () => {
    if (registry.get(normalizedId) === factory) registry.delete(normalizedId);
  };
};

export const registerWorkspaceCommandQuickFix = (
  commandId: string,
  factory: CommandQuickFixFactory
): (() => void) => registerFactory(commandFactories, commandId, factory);

export const registerWorkspaceTransactionQuickFix = (
  transactionId: string,
  factory: TransactionQuickFixFactory
): (() => void) =>
  registerFactory(transactionFactories, transactionId, factory);

export type WorkspaceQuickFixExecutionResult =
  { status: 'applied' } | { status: 'unavailable' } | { status: 'rejected' };

/** Resolves descriptors through trusted factories; diagnostics never execute code. */
export const executeWorkspaceIssueQuickFix = async (
  reference: DiagnosticQuickFixReference,
  diagnostic: ProdivixDiagnostic
): Promise<WorkspaceQuickFixExecutionResult> => {
  const editor = useEditorStore.getState();
  const workspace = editor.workspace;
  if (!workspace || editor.workspaceReadonly) return { status: 'unavailable' };
  const context = { workspace, diagnostic };

  if (reference.operation.kind === 'workspace-command') {
    const factory = commandFactories.get(reference.operation.commandId);
    const command = factory?.(context);
    if (!command) return { status: 'unavailable' };
    const outcome = await dispatchWorkspaceAuthoringOperation({
      workspace,
      readonly: editor.workspaceReadonly,
      operation: { kind: 'command', command },
    });
    return { status: outcome.status };
  }

  const factory = transactionFactories.get(reference.operation.transactionId);
  const transaction = factory?.(context);
  if (!transaction) return { status: 'unavailable' };
  const outcome = await dispatchWorkspaceAuthoringOperation({
    workspace,
    readonly: editor.workspaceReadonly,
    operation: { kind: 'transaction', transaction },
  });
  return { status: outcome.status };
};
