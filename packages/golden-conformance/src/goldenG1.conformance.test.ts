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
    expect(report.authoring.operations).toHaveLength(14);
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
    expect(
      finalPage.ui.graph.regionsById?.[GOLDEN_G1_IDS.directInstance]?.[
        GOLDEN_G1_IDS.contentSlot
      ]
    ).toEqual([GOLDEN_G1_IDS.projectedSlotNode]);
    expect(
      finalPage.ui.graph.regionsById?.[GOLDEN_G1_IDS.nestedInstance]?.[
        GOLDEN_G1_IDS.contentSlot
      ]
    ).toEqual([]);

    expect(report.authoring.evidence).toMatchObject({
      projectionConsumerCount: 3,
      projectionDefinitionUpdated: true,
      contractBindingKinds: ['props', 'events', 'slots', 'variants'],
      contractBoundInstanceCount: 3,
      projectedSlotNodeIds: [GOLDEN_G1_IDS.projectedSlotNode],
      definitionUsesPublicContract: true,
      contractRoundTripPreserved: true,
      controlledProjectionCount: 2,
      jsxCodeEditApplied: true,
      cssCodeEditApplied: true,
      visualSyncUpdatedBoth: true,
      unmanagedSourcePreserved: true,
      undoRestoredPreviousDefinition: true,
      redoRestoredEditedDefinition: true,
      undoRestoredControlledSources: true,
      redoRestoredControlledSources: true,
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
      consumerContainsContractBindings: true,
    });
    expect(report.compiler.controlledCodeDocumentIds).toEqual([
      GOLDEN_G1_IDS.controlledJsxDocument,
      GOLDEN_G1_IDS.controlledCssDocument,
    ]);
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
    expect(report.compiler.tracedContractPaths).toEqual(
      expect.arrayContaining([
        `/componentContract/propsById/${GOLDEN_G1_IDS.labelProp}`,
        `/componentContract/eventsById/${GOLDEN_G1_IDS.activateEvent}`,
        `/componentContract/slotsById/${GOLDEN_G1_IDS.contentSlot}`,
        `/componentContract/variantAxesById/${GOLDEN_G1_IDS.toneVariant}`,
      ])
    );
  });
});
