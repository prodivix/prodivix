import { describe, expect, it } from 'vitest';
import { createDefaultAgentPolicy } from '@prodivix/ai';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import {
  createAgentTaskComposerFact,
  createAgentTaskComposerPath,
} from './agentTaskComposerModel';

const workspace = (withPolicy = true): WorkspaceSnapshot => ({
  id: 'workspace.catalog',
  workspaceRev: 7,
  routeRev: 3,
  opSeq: 19,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: withPolicy ? ['policy-node'] : [],
    },
    ...(withPolicy
      ? {
          'policy-node': {
            id: 'policy-node',
            kind: 'doc' as const,
            name: 'agent-policy.json',
            parentId: 'root',
            docId: 'policy.agent',
          },
        }
      : {}),
  },
  docsById: withPolicy
    ? {
        'policy.agent': {
          id: 'policy.agent',
          type: 'agent-policy',
          path: '/agent-policy.json',
          contentRev: 1,
          metaRev: 1,
          content: createDefaultAgentPolicy(
            'policy.agent',
            'Catalog Agent Policy'
          ),
        },
      }
    : {},
  routeManifest: { version: 1, routes: [] } as never,
});

describe('Agent Task composer', () => {
  it('uses the same target-scoped route for component, route, and issue entries', () => {
    expect(
      createAgentTaskComposerPath('project.catalog', {
        kind: 'component',
        id: 'component.card',
      })
    ).toBe(
      '/editor/project/project.catalog/agent?targetKind=component&targetId=component.card'
    );
    expect(
      createAgentTaskComposerPath('project.catalog', {
        kind: 'route',
        id: '/catalog',
      })
    ).toContain('targetKind=route&targetId=%2Fcatalog');
    expect(
      createAgentTaskComposerPath('project.catalog', {
        kind: 'issue',
        id: 'issue.7',
      })
    ).toContain('targetKind=issue&targetId=issue.7');
  });

  it('binds the current Workspace revision, policy, budget, actor, and target', () => {
    const result = createAgentTaskComposerFact({
      projectId: 'project.catalog',
      workspace: workspace(),
      actorId: 'user.test',
      mode: 'apply',
      intent: 'Update the Catalog card and verify the authenticated route.',
      target: { kind: 'component', id: 'component.card' },
      identity: 'test.identity',
      now: '2026-08-02T08:00:00.000Z',
    });

    expect(result.policyName).toBe('Catalog Agent Policy');
    expect(result.task.spec).toMatchObject({
      taskId: 'task.test.identity',
      projectId: 'project.catalog',
      workspaceId: 'workspace.catalog',
      mode: 'apply',
      actor: { kind: 'user', principalId: 'user.test' },
      initialGrantRef: { grantId: 'grant.task.test.identity' },
      targetScope: {
        targets: [{ kind: 'document', id: 'component.card' }],
      },
    });
    expect(result.task.spec.baseRevision.documents).toEqual([
      { documentId: 'policy.agent', contentRev: 1, metaRev: 1 },
    ]);
    expect(result.wire).toMatchObject({
      wireVersion: 1,
      factType: 'task-record',
    });
  });

  it('fails closed without a canonical AgentPolicy', () => {
    expect(() =>
      createAgentTaskComposerFact({
        projectId: 'project.catalog',
        workspace: workspace(false),
        actorId: 'user.test',
        mode: 'explain',
        intent: 'Inspect the current target.',
        target: { kind: 'workspace', id: 'workspace.catalog' },
      })
    ).toThrow(/AgentPolicy/u);
  });
});
