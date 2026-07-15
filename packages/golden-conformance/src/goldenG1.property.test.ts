import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  authorGoldenG1Workspace,
  GOLDEN_G1_CODE_EDIT_TEXT,
} from './goldenG1Scenario';

const propertyParameters = Object.freeze({
  numRuns: 12,
  seed: 0x14_07_2026,
});

describe('Golden G1 authoring properties', () => {
  it('preserves any changed Definition text through undo, redo, reload and replay', () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 32 })
          .filter(
            (text) =>
              text !== 'Save for later' && text !== GOLDEN_G1_CODE_EDIT_TEXT
          ),
        (definitionText) => {
          const result = authorGoldenG1Workspace(definitionText);
          expect(result.evidence).toMatchObject({
            projectionConsumerCount: 3,
            projectionDefinitionUpdated: true,
            contractBindingKinds: ['props', 'events', 'slots', 'variants'],
            contractBoundInstanceCount: 3,
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
        }
      ),
      propertyParameters
    );
  });
});
