import { describe, expect, it } from 'vitest';
import type {
  WorkspaceCommandEnvelope,
  WorkspaceOperation,
} from '@prodivix/workspace';
import { normalizeWorkspaceOperationWire } from '../workspaceOperationCommitWire';
import { codeCommand, issuedAt } from './workspaceOperationCommit.fixture';

type CommandOperation = Extract<WorkspaceOperation, { kind: 'command' }>;
type TransactionOperation = Extract<
  WorkspaceOperation,
  { kind: 'transaction' }
>;

const createCommand = (): WorkspaceCommandEnvelope =>
  codeCommand('operation-wire', 'before', 'after');

const createCommandOperation = (): CommandOperation => ({
  kind: 'command',
  command: createCommand(),
});

const createTransactionOperation = (): TransactionOperation => ({
  kind: 'transaction',
  transaction: {
    id: 'transaction-wire',
    workspaceId: 'workspace-1',
    issuedAt,
    commands: [createCommand()],
    label: 'Wire transaction',
    mergeKey: 'wire-transaction',
  },
});

describe('normalizeWorkspaceOperationWire', () => {
  it('rebuilds a closed canonical operation while preserving legal wire data', () => {
    const operation: WorkspaceOperation = {
      ...createCommandOperation(),
      undoOf: '   ',
      sourceOperationIds: [' source-one ', 'source-one', 'source-two'],
    };
    if (operation.kind !== 'command') {
      throw new Error('Expected a command operation.');
    }
    operation.command.label = '';
    operation.command.mergeKey = 'wire';
    operation.command.forwardOps[0] = {
      op: 'replace',
      path: '/source',
      value: null,
    };

    expect(normalizeWorkspaceOperationWire(operation)).toEqual({
      ok: true,
      operation: {
        kind: 'command',
        command: operation.command,
        sourceOperationIds: ['source-one', 'source-two'],
      },
    });
  });

  it.each([
    {
      layer: 'operation',
      operation: () => ({ ...createCommandOperation(), unexpected: true }),
      path: '/operation/unexpected',
    },
    {
      layer: 'operation branch',
      operation: () => ({
        ...createCommandOperation(),
        transaction: createTransactionOperation().transaction,
      }),
      path: '/operation/transaction',
    },
    {
      layer: 'transaction',
      operation: () => {
        const operation = createTransactionOperation();
        return {
          ...operation,
          transaction: { ...operation.transaction, unexpected: true },
        };
      },
      path: '/operation/transaction/unexpected',
    },
    {
      layer: 'command',
      operation: () => ({
        kind: 'command',
        command: { ...createCommand(), unexpected: true },
      }),
      path: '/operation/command/unexpected',
    },
    {
      layer: 'target',
      operation: () => {
        const command = createCommand();
        return {
          kind: 'command',
          command: {
            ...command,
            target: { ...command.target, unexpected: true },
          },
        };
      },
      path: '/operation/command/target/unexpected',
    },
    {
      layer: 'patch',
      operation: () => {
        const command = createCommand();
        return {
          kind: 'command',
          command: {
            ...command,
            forwardOps: [{ ...command.forwardOps[0]!, unexpected: true }],
          },
        };
      },
      path: '/operation/command/forwardOps/0/unexpected',
    },
  ])('rejects unknown fields at the $layer layer', ({ operation, path }) => {
    expect(normalizeWorkspaceOperationWire(operation())).toMatchObject({
      ok: false,
      issue: {
        code: 'WKS_SYNC_COMMIT_OPERATION_INVALID',
        path,
      },
    });
  });

  it.each([
    {
      label: 'null operation',
      operation: null,
      path: '/operation',
    },
    {
      label: 'null command',
      operation: { kind: 'command', command: null },
      path: '/operation/command',
    },
    {
      label: 'null command id',
      operation: {
        kind: 'command',
        command: { ...createCommand(), id: null },
      },
      path: '/operation/command/id',
    },
    {
      label: 'null command target',
      operation: {
        kind: 'command',
        command: { ...createCommand(), target: null },
      },
      path: '/operation/command/target',
    },
    {
      label: 'null optional target id',
      operation: {
        kind: 'command',
        command: {
          ...createCommand(),
          target: { workspaceId: 'workspace-1', documentId: null },
        },
      },
      path: '/operation/command/target/documentId',
    },
    {
      label: 'null patch array',
      operation: {
        kind: 'command',
        command: { ...createCommand(), forwardOps: null },
      },
      path: '/operation/command/forwardOps',
    },
    {
      label: 'null patch',
      operation: {
        kind: 'command',
        command: { ...createCommand(), forwardOps: [null] },
      },
      path: '/operation/command/forwardOps/0',
    },
    {
      label: 'null patch op',
      operation: {
        kind: 'command',
        command: {
          ...createCommand(),
          forwardOps: [{ op: null, path: '/source', value: 'after' }],
        },
      },
      path: '/operation/command/forwardOps/0/op',
    },
    {
      label: 'null patch path',
      operation: {
        kind: 'command',
        command: {
          ...createCommand(),
          forwardOps: [{ op: 'replace', path: null, value: 'after' }],
        },
      },
      path: '/operation/command/forwardOps/0/path',
    },
    {
      label: 'null patch from',
      operation: {
        kind: 'command',
        command: {
          ...createCommand(),
          forwardOps: [
            { op: 'replace', path: '/source', from: null, value: 'after' },
          ],
        },
      },
      path: '/operation/command/forwardOps/0/from',
    },
    {
      label: 'null optional command label',
      operation: {
        kind: 'command',
        command: { ...createCommand(), label: null },
      },
      path: '/operation/command/label',
    },
    {
      label: 'null domain hint',
      operation: {
        kind: 'command',
        command: { ...createCommand(), domainHint: null },
      },
      path: '/operation/command/domainHint',
    },
    {
      label: 'null causal id',
      operation: { ...createCommandOperation(), undoOf: null },
      path: '/operation/undoOf',
    },
    {
      label: 'null source ids',
      operation: { ...createCommandOperation(), sourceOperationIds: null },
      path: '/operation/sourceOperationIds',
    },
    {
      label: 'null source id',
      operation: { ...createCommandOperation(), sourceOperationIds: [null] },
      path: '/operation/sourceOperationIds/0',
    },
    {
      label: 'null transaction',
      operation: { kind: 'transaction', transaction: null },
      path: '/operation/transaction',
    },
    {
      label: 'empty transaction commands',
      operation: {
        kind: 'transaction',
        transaction: {
          id: 'transaction-wire',
          workspaceId: 'workspace-1',
          issuedAt,
          commands: [],
        },
      },
      path: '/operation/transaction/commands',
    },
    {
      label: 'null transaction label',
      operation: {
        kind: 'transaction',
        transaction: {
          id: 'transaction-wire',
          workspaceId: 'workspace-1',
          issuedAt,
          commands: [createCommand()],
          label: null,
        },
      },
      path: '/operation/transaction/label',
    },
  ])('rejects $label without throwing', ({ operation, path }) => {
    expect(() => normalizeWorkspaceOperationWire(operation)).not.toThrow();
    expect(normalizeWorkspaceOperationWire(operation)).toMatchObject({
      ok: false,
      issue: {
        code: 'WKS_SYNC_COMMIT_OPERATION_INVALID',
        path,
      },
    });
  });

  it('rejects non-atomic patch ops and missing or non-JSON values', () => {
    const command = createCommand();
    const sparseValue: unknown[] = [];
    sparseValue.length = 1;
    const cyclicValue: Record<string, unknown> = {};
    cyclicValue.self = cyclicValue;
    const invalidPatches: Array<{ patch: unknown; path: string }> = [
      {
        patch: { op: 'move', path: '/source', from: '/previous' },
        path: '/operation/command/forwardOps/0/op',
      },
      {
        patch: { op: 'replace', path: '/source' },
        path: '/operation/command/forwardOps/0/value',
      },
      {
        patch: { op: 'replace', path: '/source', value: undefined },
        path: '/operation/command/forwardOps/0/value',
      },
      {
        patch: {
          op: 'replace',
          path: '/source',
          value: { nested: undefined },
        },
        path: '/operation/command/forwardOps/0/value',
      },
      {
        patch: { op: 'replace', path: '/source', value: sparseValue },
        path: '/operation/command/forwardOps/0/value',
      },
      {
        patch: { op: 'replace', path: '/source', value: cyclicValue },
        path: '/operation/command/forwardOps/0/value',
      },
    ];

    invalidPatches.forEach(({ patch, path }) => {
      const normalize = () =>
        normalizeWorkspaceOperationWire({
          kind: 'command',
          command: { ...command, forwardOps: [patch] },
        });
      expect(normalize).not.toThrow();
      expect(normalize()).toMatchObject({ ok: false, issue: { path } });
    });
  });

  it('accepts a closed transaction and rejects duplicate command ids', () => {
    expect(
      normalizeWorkspaceOperationWire(createTransactionOperation())
    ).toEqual({
      ok: true,
      operation: createTransactionOperation(),
    });

    const operation = createTransactionOperation();
    operation.transaction.commands.push(createCommand());
    expect(normalizeWorkspaceOperationWire(operation)).toMatchObject({
      ok: false,
      issue: {
        path: '/operation/transaction/commands/1/id',
        commandId: 'operation-wire',
      },
    });
  });
});
