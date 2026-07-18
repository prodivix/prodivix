import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { generateWorkspaceReactViteBundle } from '@prodivix/prodivix-compiler';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import {
  GOLDEN_ASSET_MATERIALIZATIONS,
  GOLDEN_CODEGEN_POLICY,
  GOLDEN_IDS,
} from './goldenApp.fixture';
import { authorGoldenWorkspace } from './goldenScenario';

const propertyParameters = Object.freeze({
  numRuns: 20,
  seed: 0x06_07_2026,
});

const reorderRecord = <T>(
  record: Record<string, T>,
  offset: number,
  reverse: boolean
): Record<string, T> => {
  const entries = Object.entries(record).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  const rotated = entries.length
    ? [
        ...entries.slice(offset % entries.length),
        ...entries.slice(0, offset % entries.length),
      ]
    : entries;
  return Object.fromEntries(reverse ? rotated.reverse() : rotated);
};

const bundleSignature = (
  bundle: ReturnType<typeof generateWorkspaceReactViteBundle>
): string =>
  JSON.stringify({
    files: bundle.files.map((file) => ({
      path: file.path,
      contents:
        typeof file.contents === 'string'
          ? file.contents
          : Array.from(file.contents),
    })),
    dependencies: bundle.dependencies,
    diagnostics: bundle.diagnostics,
  });

describe('Golden Workspace export properties', () => {
  it('is independent of selection and record insertion order', () => {
    const authored = authorGoldenWorkspace();
    const baseline = bundleSignature(
      generateWorkspaceReactViteBundle(authored.editedWorkspace, {
        codegenPolicySnapshot: GOLDEN_CODEGEN_POLICY,
        assetMaterializations: GOLDEN_ASSET_MATERIALIZATIONS,
      })
    );
    fc.assert(
      fc.property(
        fc.nat({ max: 100 }),
        fc.nat({ max: 100 }),
        fc.boolean(),
        fc.constantFrom(
          {
            documentId: GOLDEN_IDS.homePage,
            routeNodeId: 'route-home',
          },
          {
            documentId: GOLDEN_IDS.checkoutPage,
            routeNodeId: GOLDEN_IDS.checkoutRoute,
          },
          {
            documentId: GOLDEN_IDS.orderSummaryComponent,
            routeNodeId: GOLDEN_IDS.orderSummaryRoute,
          }
        ),
        (documentOffset, treeOffset, reverse, selection) => {
          const candidate: WorkspaceSnapshot = {
            ...authored.editedWorkspace,
            activeDocumentId: selection.documentId,
            activeRouteNodeId: selection.routeNodeId,
            docsById: reorderRecord(
              authored.editedWorkspace.docsById,
              documentOffset,
              reverse
            ),
            treeById: reorderRecord(
              authored.editedWorkspace.treeById,
              treeOffset,
              !reverse
            ),
          };
          expect(
            bundleSignature(
              generateWorkspaceReactViteBundle(candidate, {
                codegenPolicySnapshot: GOLDEN_CODEGEN_POLICY,
                assetMaterializations: GOLDEN_ASSET_MATERIALIZATIONS,
              })
            )
          ).toBe(baseline);
        }
      ),
      propertyParameters
    );
  });
});
