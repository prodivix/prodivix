import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { authorGoldenG1Workspace } from './goldenG1Scenario';

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
          .filter((text) => text !== 'Save for later'),
        (definitionText) => {
          const result = authorGoldenG1Workspace(definitionText);
          expect(result.evidence).toMatchObject({
            projectionConsumerCount: 3,
            projectionDefinitionUpdated: true,
            undoRestoredPreviousDefinition: true,
            redoRestoredEditedDefinition: true,
            saveReloadPreservedWorkspace: true,
            replayPreservedWorkspace: true,
          });
        }
      ),
      propertyParameters
    );
  });
});
