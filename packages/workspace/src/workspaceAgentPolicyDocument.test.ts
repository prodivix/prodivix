import { describe, expect, it } from 'vitest';
import { createDefaultAgentPolicy, type AgentPolicy } from '@prodivix/ai';
import {
  WORKSPACE_COMMAND_DOMAINS,
  WORKSPACE_COMMAND_NAMESPACE_DOMAIN_RULES,
  WORKSPACE_DOCUMENT_TYPES,
  applyWorkspaceCommand,
  createWorkspaceAgentPolicyDocumentCommand,
  createWorkspaceAgentPolicyUpdateCommand,
  createWorkspaceCommandOperation,
  createWorkspaceHistoryState,
  decodeWorkspaceSnapshot,
  encodeWorkspaceSnapshot,
  recordWorkspaceOperation,
  redoWorkspaceHistory,
  resolveWorkspaceCommandScope,
  selectWorkspaceAgentPolicyDocument,
  undoWorkspaceHistory,
  validateWorkspaceSnapshot,
  type WorkspaceSnapshot,
} from './index';

const issuedAt = '2026-07-31T00:00:00.000Z';

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-agent',
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
      children: ['existing-node'],
    },
    'existing-node': {
      id: 'existing-node',
      kind: 'doc',
      name: 'existing.ts',
      parentId: 'root',
      docId: 'existing',
    },
  },
  docsById: {
    existing: {
      id: 'existing',
      type: 'code',
      path: '/existing.ts',
      contentRev: 1,
      metaRev: 1,
      content: {
        language: 'ts',
        source: 'export const existing = true;',
      },
    },
  },
  routeManifest: { version: '1', root: { id: 'root' } },
  activeRouteNodeId: 'root',
});

const createPolicy = (id = 'agent.policy.default'): AgentPolicy =>
  createDefaultAgentPolicy(id, 'Default Agent policy');

const applyPolicyCreate = (
  workspace: WorkspaceSnapshot,
  policy = createPolicy()
) => {
  const command = createWorkspaceAgentPolicyDocumentCommand({
    workspace,
    documentId: policy.id,
    name: policy.name,
    path: '/agent/policy.default.json',
    content: policy,
    commandId: 'create-agent-policy',
    issuedAt,
  });
  expect(command).not.toBeNull();
  if (!command) throw new Error('Expected AgentPolicy create command.');
  const applied = applyWorkspaceCommand(workspace, command);
  expect(applied.ok).toBe(true);
  if (!applied.ok) throw new Error('Expected AgentPolicy create to apply.');
  return { command, snapshot: applied.snapshot };
};

describe('G4 V0 AgentPolicy Workspace ownership', () => {
  it('registers the singleton document and core.agent namespace', () => {
    expect(WORKSPACE_DOCUMENT_TYPES).toContain('agent-policy');
    expect(WORKSPACE_COMMAND_DOMAINS).toContain('agent');
    expect(WORKSPACE_COMMAND_NAMESPACE_DOMAIN_RULES).toContainEqual({
      prefix: 'core.agent',
      domain: 'agent',
    });
  });

  it('creates and round-trips wire v1 without leaking a version into current state', () => {
    const { snapshot } = applyPolicyCreate(createWorkspace());
    expect(validateWorkspaceSnapshot(snapshot).valid).toBe(true);
    expect(selectWorkspaceAgentPolicyDocument(snapshot)?.status).toBe('valid');
    expect(
      snapshot.docsById['agent.policy.default'].content
    ).not.toHaveProperty('wireVersion');

    const wire = encodeWorkspaceSnapshot(snapshot, {});
    const policyWire = wire.documents.find(
      ({ type }) => type === 'agent-policy'
    );
    expect(policyWire?.content).toMatchObject({ wireVersion: 1 });
    const decoded = decodeWorkspaceSnapshot(wire);
    expect(
      decoded.workspace.docsById['agent.policy.default'].content
    ).not.toHaveProperty('wireVersion');
    expect(
      encodeWorkspaceSnapshot(decoded.workspace, decoded.settings)
    ).toEqual(wire);
  });

  it('updates, undoes, and redoes through one reversible core.agent command', () => {
    const { snapshot } = applyPolicyCreate(createWorkspace());
    const policy = createPolicy();
    const update = createWorkspaceAgentPolicyUpdateCommand({
      workspace: snapshot,
      documentId: policy.id,
      after: { ...policy, name: 'Updated Agent policy' },
      commandId: 'update-agent-policy',
      issuedAt,
    });
    expect(update).toMatchObject({
      namespace: 'core.agent',
      domainHint: 'agent',
      target: { documentId: policy.id },
      forwardOps: [{ op: 'replace', path: '/name' }],
      reverseOps: [{ op: 'replace', path: '/name' }],
    });
    if (!update) return;

    const applied = applyWorkspaceCommand(snapshot, update);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.snapshot.docsById[policy.id].content).toMatchObject({
      name: 'Updated Agent policy',
    });
    const history = recordWorkspaceOperation(
      createWorkspaceHistoryState(),
      createWorkspaceCommandOperation(update)
    );
    const scope = resolveWorkspaceCommandScope(update);
    const undone = undoWorkspaceHistory(applied.snapshot, history, scope);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.snapshot.docsById[policy.id].content).toMatchObject({
      name: policy.name,
    });
    const redone = redoWorkspaceHistory(undone.snapshot, undone.history, scope);
    expect(redone.ok).toBe(true);
    if (!redone.ok) return;
    expect(redone.snapshot.docsById[policy.id].content).toMatchObject({
      name: 'Updated Agent policy',
    });
  });

  it('fails closed on duplicate singleton, identity mismatch, and non-canonical policy', () => {
    const { snapshot } = applyPolicyCreate(createWorkspace());
    const second = createPolicy('agent.policy.second');
    const duplicateCommand = createWorkspaceAgentPolicyDocumentCommand({
      workspace: snapshot,
      documentId: second.id,
      path: '/agent/policy.second.json',
      content: second,
      commandId: 'create-second-agent-policy',
      issuedAt,
    });
    expect(duplicateCommand).not.toBeNull();
    if (duplicateCommand) {
      expect(applyWorkspaceCommand(snapshot, duplicateCommand).ok).toBe(false);
    }
    expect(
      createWorkspaceAgentPolicyDocumentCommand({
        workspace: createWorkspace(),
        documentId: 'agent.policy.wrong',
        path: '/agent/policy.invalid.json',
        content: createPolicy(),
        commandId: 'identity-mismatch',
        issuedAt,
      })
    ).toBeNull();
    const policy = createPolicy();
    expect(
      createWorkspaceAgentPolicyDocumentCommand({
        workspace: createWorkspace(),
        documentId: policy.id,
        path: '/agent/policy.invalid.json',
        content: {
          ...policy,
          contextRules: {
            ...policy.contextRules,
            allowedAuthorities: ['derived', 'canonical'],
          },
        },
        commandId: 'non-canonical',
        issuedAt,
      })
    ).toBeNull();
  });
});
