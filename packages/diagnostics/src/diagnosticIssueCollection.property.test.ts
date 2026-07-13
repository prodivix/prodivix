import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createDiagnosticIssueCollectionState,
  queryDiagnosticIssues,
  upsertDiagnosticProviderSnapshot,
} from './diagnosticIssueCollection';
import type {
  DiagnosticIssueCollectionState,
  DiagnosticProviderSnapshot,
} from './diagnosticIssue.types';
import type { ProdivixDiagnostic } from './diagnostic.types';

const propertyParameters = Object.freeze({
  numRuns: 300,
  seed: 0x13_07_2026,
});

const identifier = fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/);
type GeneratedDiagnostic = {
  code: 'PIR-1001' | 'WKS-1002' | 'RTE-1001';
  severity: 'info' | 'warning' | 'error' | 'fatal';
  domain: 'pir' | 'workspace' | 'route';
  message: string;
  nodeId: string;
};

const diagnosticArbitrary: fc.Arbitrary<GeneratedDiagnostic> = fc.record({
  code: fc.constantFrom('PIR-1001', 'WKS-1002', 'RTE-1001'),
  severity: fc.constantFrom('info', 'warning', 'error', 'fatal'),
  domain: fc.constantFrom('pir', 'workspace', 'route'),
  message: fc.string({ minLength: 1, maxLength: 40 }),
  nodeId: identifier,
});

const toDiagnostic = (value: GeneratedDiagnostic): ProdivixDiagnostic => ({
  code: value.code,
  severity: value.severity,
  domain: value.domain,
  message: value.message,
  targetRef: {
    kind: 'workspace-node',
    workspaceId: 'workspace-1',
    nodeId: value.nodeId,
  },
});

const upsert = (
  state: DiagnosticIssueCollectionState,
  snapshot: DiagnosticProviderSnapshot
): DiagnosticIssueCollectionState => {
  const result = upsertDiagnosticProviderSnapshot(state, snapshot);
  expect(result.status).toBe('updated');
  return result.state;
};

describe('diagnostic issue collection properties', () => {
  it('is independent of provider insertion order at one revision', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            providerId: identifier,
            diagnostics: fc.array(diagnosticArbitrary, { maxLength: 12 }),
            collectedAt: fc.integer({ min: 1, max: 10_000 }),
          }),
          { minLength: 1, maxLength: 8, selector: (value) => value.providerId }
        ),
        (providers) => {
          const snapshots = providers.map<DiagnosticProviderSnapshot>(
            (provider) => ({
              providerId: provider.providerId,
              workspaceId: 'workspace-1',
              revision: { key: 'revision-1', sequence: 1 },
              collectedAt: provider.collectedAt,
              diagnostics: provider.diagnostics.map(toDiagnostic),
            })
          );
          const collect = (ordered: readonly DiagnosticProviderSnapshot[]) =>
            ordered.reduce(
              upsert,
              createDiagnosticIssueCollectionState('workspace-1')
            );

          expect(collect(snapshots).issues).toEqual(
            collect([...snapshots].reverse()).issues
          );
        }
      ),
      propertyParameters
    );
  });

  it('deduplicates equal locations while preserving provider occurrences', () => {
    fc.assert(
      fc.property(
        diagnosticArbitrary,
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 20 }),
        (value, firstCount, secondCount) => {
          const diagnostic = toDiagnostic(value);
          let state = createDiagnosticIssueCollectionState('workspace-1');
          state = upsert(state, {
            providerId: 'provider-a',
            workspaceId: 'workspace-1',
            revision: { key: 'revision-1', sequence: 1 },
            collectedAt: 1,
            diagnostics: Array.from({ length: firstCount }, () => diagnostic),
          });
          state = upsert(state, {
            providerId: 'provider-b',
            workspaceId: 'workspace-1',
            revision: { key: 'revision-1', sequence: 1 },
            collectedAt: 2,
            diagnostics: Array.from({ length: secondCount }, () => diagnostic),
          });

          const active = queryDiagnosticIssues(state, { statuses: ['active'] });
          expect(active).toHaveLength(1);
          expect(active[0]?.sources).toHaveLength(2);
          expect(active[0]?.occurrenceCount).toBe(firstCount + secondCount);
        }
      ),
      propertyParameters
    );
  });

  it('does not let an older provider result resurrect a resolved issue', () => {
    fc.assert(
      fc.property(diagnosticArbitrary, (value) => {
        const diagnostic = toDiagnostic(value);
        let state = createDiagnosticIssueCollectionState('workspace-1');
        state = upsert(state, {
          providerId: 'workspace-validator',
          workspaceId: 'workspace-1',
          revision: { key: 'revision-1', sequence: 1 },
          collectedAt: 1,
          diagnostics: [diagnostic],
        });
        state = upsert(state, {
          providerId: 'workspace-validator',
          workspaceId: 'workspace-1',
          revision: { key: 'revision-2', sequence: 2 },
          collectedAt: 2,
          diagnostics: [],
        });

        const staleResult = upsertDiagnosticProviderSnapshot(state, {
          providerId: 'workspace-validator',
          workspaceId: 'workspace-1',
          revision: { key: 'revision-1', sequence: 1 },
          collectedAt: 3,
          diagnostics: [diagnostic],
        });

        expect(staleResult.status).toBe('ignored-stale');
        expect(
          queryDiagnosticIssues(staleResult.state, { statuses: ['active'] })
        ).toHaveLength(0);
        expect(
          queryDiagnosticIssues(staleResult.state, { statuses: ['resolved'] })
        ).toHaveLength(1);
      }),
      propertyParameters
    );
  });
});
