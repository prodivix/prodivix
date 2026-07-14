import { describe, expect, it } from 'vitest';
import type { PIRDocument } from '@prodivix/pir';
import { GOLDEN_IDS } from './goldenApp.fixture';
import { GOLDEN_G1_IDS, runGoldenG1Conformance } from './goldenG1Scenario';

describe('Prodivix Golden G1 Component and Collection conformance', () => {
  it('keeps extraction, reuse, nested Collection, History and export in one replayable journey', () => {
    const report = runGoldenG1Conformance();
    const extractedPage = report.authoring.extractedWorkspace.docsById[
      GOLDEN_IDS.checkoutPage
    ]!.content as PIRDocument;
    const finalPage = report.authoring.workspace.docsById[
      GOLDEN_IDS.checkoutPage
    ]!.content as PIRDocument;

    expect(
      extractedPage.ui.graph.nodesById[GOLDEN_G1_IDS.extractedInstance]
    ).toMatchObject({
      kind: 'component-instance',
      componentDocumentId: GOLDEN_G1_IDS.checkoutSectionComponent,
    });
    expect(
      report.authoring.extractedWorkspace.docsById[
        GOLDEN_G1_IDS.checkoutSectionComponent
      ]?.type
    ).toBe('pir-component');
    expect(report.authoring.evidence.extractionCommandCount).toBeGreaterThan(1);
    expect(report.authoring.operations).toHaveLength(6);
    expect(report.authoring.evidence.instanceNodeIds).toEqual([
      GOLDEN_G1_IDS.extractedInstance,
      GOLDEN_G1_IDS.directInstance,
      GOLDEN_G1_IDS.nestedInstance,
    ]);
    expect(
      finalPage.ui.graph.regionsById?.[GOLDEN_G1_IDS.outerCollection]?.item
    ).toEqual([GOLDEN_G1_IDS.innerCollection]);
    expect(
      finalPage.ui.graph.regionsById?.[GOLDEN_G1_IDS.innerCollection]?.item
    ).toEqual([GOLDEN_G1_IDS.nestedInstance]);

    expect(report.authoring.evidence).toMatchObject({
      projectionConsumerCount: 3,
      projectionDefinitionUpdated: true,
      undoRestoredPreviousDefinition: true,
      redoRestoredEditedDefinition: true,
      saveReloadPreservedWorkspace: true,
      replayPreservedWorkspace: true,
    });
    expect(
      report.authoring.projection.afterDefinitionEdit.dependencyFirstDocumentIds
    ).toEqual([
      GOLDEN_G1_IDS.checkoutSectionComponent,
      GOLDEN_IDS.checkoutPage,
    ]);

    expect(
      report.program.diagnostics.filter(({ severity }) => severity === 'error')
    ).toEqual([]);
    expect(report.compiler).toMatchObject({
      definitionModuleChanged: true,
      definitionModuleContainsEditedText: true,
      definitionModuleCount: 1,
      consumerImportsDefinitionOnce: true,
      consumerInstanceCallCount: 3,
      sourceTraceStableAcrossReloadAndReplay: true,
    });
    expect(report.compiler.tracedNodeIds).toEqual(
      expect.arrayContaining([
        GOLDEN_G1_IDS.extractedInstance,
        GOLDEN_G1_IDS.directInstance,
        GOLDEN_G1_IDS.nestedInstance,
        GOLDEN_G1_IDS.innerCollection,
        GOLDEN_G1_IDS.outerCollection,
        GOLDEN_G1_IDS.definitionEditedNode,
      ])
    );
  });
});
