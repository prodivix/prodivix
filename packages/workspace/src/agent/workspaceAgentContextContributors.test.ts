import { describe, expect, it } from 'vitest';
import type { BehaviorScenario } from '@prodivix/behavior';
import { digestAgentCanonicalValue } from '@prodivix/ai';
import { createWorkspaceSemanticIndexFromSnapshot } from '../authoring/createWorkspaceSemanticIndexFromSnapshot';
import type { WorkspaceSnapshot } from '../types';
import {
  createAgentWorkspaceRevisionFromSnapshot,
  createWorkspaceAgentContextContributors,
} from './workspaceAgentContextContributors';

const digest = `sha256-${'c'.repeat(64)}`;

const scenario: BehaviorScenario = {
  id: 'scenario.catalog',
  name: 'Catalog journey',
  criticality: 'critical',
  tags: ['catalog'],
  entry: { id: 'trigger.ready', domain: 'route', event: 'ready' },
  steps: [
    {
      id: 'step.observe',
      kind: 'observation',
      failureMode: 'stop',
      observation: {
        kind: 'visible',
        target: {
          kind: 'public-contract',
          id: 'catalog.list',
          workspaceDocumentId: 'code.catalog',
          capability: 'ui.visible',
        },
      },
      assertions: [
        { id: 'assert.visible', operator: 'equals', expected: true },
      ],
    },
  ],
  fixtureRefs: [{ documentId: 'fixture.catalog', digest }],
  controlProfileRef: {
    kind: 'workspace',
    documentId: 'control.catalog',
    digest,
  },
  baselineRefs: [{ documentId: 'baseline.catalog', digest }],
  timeoutPolicy: { totalMs: 30_000, stepMs: 5_000, settleMs: 2_000 },
};

const workspace = (): WorkspaceSnapshot => ({
  id: 'workspace.catalog',
  workspaceRev: 5,
  routeRev: 2,
  opSeq: 9,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['node.code', 'node.scenario'],
    },
    'node.code': {
      id: 'node.code',
      kind: 'doc',
      name: 'catalog.ts',
      parentId: 'root',
      docId: 'code.catalog',
    },
    'node.scenario': {
      id: 'node.scenario',
      kind: 'doc',
      name: 'scenario.catalog.json',
      parentId: 'root',
      docId: scenario.id,
    },
  },
  docsById: {
    'code.catalog': {
      id: 'code.catalog',
      type: 'code',
      path: '/catalog.ts',
      contentRev: 2,
      metaRev: 1,
      content: {
        language: 'ts',
        source: 'export const catalog = "authenticated";',
      },
    },
    [scenario.id]: {
      id: scenario.id,
      type: 'behavior-scenario',
      path: '/scenario.catalog.json',
      contentRev: 1,
      metaRev: 1,
      content: scenario,
    },
  },
  routeManifest: { version: '1', root: { id: 'route.root' } },
});

describe('G4 V1 Workspace Context contribution surface', () => {
  it('contributes Semantic, Code, SourceTrace, Issues, Scenario, and Verification from exact public state', async () => {
    const snapshot = workspace();
    const semantic = createWorkspaceSemanticIndexFromSnapshot(snapshot);
    expect(semantic.status).toBe('ready');
    if (semantic.status !== 'ready') return;
    const contributors = createWorkspaceAgentContextContributors({
      snapshot,
      semanticIndex: semantic.index,
      sourceTraces: [
        {
          traceId: 'trace.catalog',
          targetId: 'code.catalog',
          value: { artifactId: 'code.catalog', line: 1 },
        },
      ],
      issues: [
        {
          code: 'WKS-TEST',
          severity: 'warning',
          domain: 'workspace',
          message: 'Catalog issue',
          targetRef: { kind: 'document', documentId: 'code.catalog' },
        },
      ],
      verification: [
        {
          ref: 'verification.plan.catalog',
          kind: 'verification-plan',
          digest: digestAgentCanonicalValue('verification-plan'),
          summary: { requiredChecks: ['behavior'] },
          sourceTraceRef: 'trace.catalog',
        },
      ],
    });
    expect(contributors.map(({ descriptor }) => descriptor.kind)).toEqual([
      'semantic-index',
      'code',
      'source-trace',
      'issues',
      'scenario',
      'verification',
    ]);
    const results = await Promise.all(
      contributors.map((contributor) =>
        contributor.contribute({
          workspaceRevision: createAgentWorkspaceRevisionFromSnapshot(snapshot),
          targetScope: {
            targets: [{ kind: 'workspace', id: snapshot.id }],
          },
        })
      )
    );
    expect(results.every(({ status }) => status === 'ready')).toBe(true);
    const candidates = results.flatMap((result) =>
      result.status === 'ready' ? result.candidates : []
    );
    expect(candidates.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining([
        'semantic-symbol',
        'code-reference',
        'source-trace',
        'issue',
        'behavior-scenario',
        'verification-plan',
      ])
    );
    expect(
      candidates.every(
        ({ instructionBoundary }) => instructionBoundary === 'data-only'
      )
    ).toBe(true);
    expect(
      candidates.every(({ revision }) => revision.workspaceRev === 5)
    ).toBe(true);
  });
});
