import { describe, expect, it } from 'vitest';
import {
  createDiagnosticIssueCollectionState,
  upsertDiagnosticProviderSnapshot,
} from './diagnosticIssueCollection';
import type {
  DiagnosticIssueCollectionState,
  DiagnosticProviderSnapshot,
} from './diagnosticIssue.types';
import type { ProdivixDiagnostic } from './diagnostic.types';

/**
 * Issue collation is an order-independent projection of a diagnostic set: the
 * same providers must yield the same list head, the same representative
 * diagnostic and the same source order in a browser, a Node CI runner and a
 * remote runner. Every tiebreak key below is a machine identifier, so the
 * expected order is Unicode code-point order — `Z` (0x5A) before `a` (0x61) —
 * not the host's ICU collation, which sorts `alpha` before `Zulu`.
 */

const revision = { key: 'revision-1', sequence: 1 } as const;

const upsert = (
  state: DiagnosticIssueCollectionState,
  snapshot: DiagnosticProviderSnapshot
): DiagnosticIssueCollectionState => {
  const result = upsertDiagnosticProviderSnapshot(state, snapshot);
  expect(result.status).toBe('updated');
  return result.state;
};

const snapshot = (
  providerId: string,
  diagnostics: readonly ProdivixDiagnostic[],
  collectedAt = 1
): DiagnosticProviderSnapshot => ({
  providerId,
  workspaceId: 'workspace-1',
  revision,
  collectedAt,
  diagnostics,
});

const nodeDiagnostic = (
  code: string,
  nodeId: string,
  message: string
): ProdivixDiagnostic => ({
  code,
  severity: 'error',
  domain: 'pir',
  message,
  targetRef: { kind: 'workspace-node', workspaceId: 'workspace-1', nodeId },
});

describe('diagnostic issue collation', () => {
  it('breaks equal severity ties on diagnostic code in code-point order', () => {
    const state = upsert(
      createDiagnosticIssueCollectionState('workspace-1'),
      snapshot('workspace-validator', [
        nodeDiagnostic('PIR-alpha', 'node-1', 'first'),
        nodeDiagnostic('PIR-Zulu', 'node-2', 'second'),
      ])
    );

    expect(state.issues.map((issue) => issue.diagnostic.code)).toEqual([
      'PIR-Zulu',
      'PIR-alpha',
    ]);
  });

  it('breaks equal code ties on fingerprint in code-point order', () => {
    const state = upsert(
      createDiagnosticIssueCollectionState('workspace-1'),
      snapshot('workspace-validator', [
        nodeDiagnostic('PIR-1001', 'alphaNode', 'first'),
        nodeDiagnostic('PIR-1001', 'ZuluNode', 'second'),
      ])
    );

    expect(
      state.issues.map((issue) =>
        issue.diagnostic.targetRef?.kind === 'workspace-node'
          ? issue.diagnostic.targetRef.nodeId
          : undefined
      )
    ).toEqual(['ZuluNode', 'alphaNode']);
  });

  it('orders provider snapshots and issue sources in code-point order', () => {
    const diagnostic = nodeDiagnostic('PIR-1001', 'node-1', 'shared');
    let state = upsert(
      createDiagnosticIssueCollectionState('workspace-1'),
      snapshot('alpha-provider', [diagnostic])
    );
    state = upsert(state, snapshot('Zulu-provider', [diagnostic], 2));

    expect(state.providerSnapshots.map(({ providerId }) => providerId)).toEqual(
      ['Zulu-provider', 'alpha-provider']
    );
    expect(state.issues).toHaveLength(1);
    expect(
      state.issues[0]?.sources.map(({ providerId }) => providerId)
    ).toEqual(['Zulu-provider', 'alpha-provider']);
  });

  it('selects the representative diagnostic of one issue in code-point order', () => {
    const state = upsert(
      createDiagnosticIssueCollectionState('workspace-1'),
      snapshot('workspace-validator', [
        nodeDiagnostic('PIR-1001', 'node-1', 'alpha message'),
        nodeDiagnostic('PIR-1001', 'node-1', 'Zulu message'),
      ])
    );

    expect(state.issues).toHaveLength(1);
    expect(state.issues[0]?.occurrenceCount).toBe(2);
    expect(state.issues[0]?.diagnostic.message).toBe('Zulu message');
  });
});
