import { describe, expect, it } from 'vitest';
import {
  GOLDEN_G4_V8_EVALUATION_MATRIX,
  createGoldenG4V8NativeNormalization,
  createGoldenG4V8SecurityMatrix,
} from './goldenG4V8SecurityModelEvalFixture';

describe('G4 V8 security and model-evaluation Golden', () => {
  it('freezes the 128-case, 52-family, holdout, sentinel, and native profile matrix', () => {
    const matrix = GOLDEN_G4_V8_EVALUATION_MATRIX;
    expect(matrix.cases).toHaveLength(128);
    expect(new Set(matrix.cases.map(({ familyId }) => familyId)).size).toBe(52);
    expect(matrix.contextSentinelCaseIds).toHaveLength(24);
    expect(matrix.mediaSentinelCaseIds).toHaveLength(16);
    expect(matrix.minimumJourneyCount).toBe(11_640);
    expect(
      new Set(matrix.configurations.map(({ protocolFamily }) => protocolFamily))
        .size
    ).toBe(3);
    expect(
      new Set(
        matrix.configurations.map(
          ({ providerOperatorId }) => providerOperatorId
        )
      ).size
    ).toBe(3);
    expect(
      new Set(
        matrix.configurations.map(
          ({ modelFamilyOwnerId }) => modelFamilyOwnerId
        )
      ).size
    ).toBe(3);
    expect(matrix.profiles).toEqual([
      'g4-core-text-tools',
      'g4-document-input',
      'g4-visual-input',
    ]);
    for (const bucket of [
      'positive-cross-domain',
      'adversarial-security',
      'recovery-repair-reconciliation',
      'capability-differential',
    ] as const) {
      const cases = matrix.cases.filter(
        ({ primaryBucket }) => primaryBucket === bucket
      );
      expect(
        cases.filter(({ access }) => access === 'protected-holdout').length
      ).toBeGreaterThanOrEqual(Math.ceil(cases.length / 4));
    }
  });

  it('normalizes all native families plus compatibility without remote calls', () => {
    const normalized = createGoldenG4V8NativeNormalization();
    for (const facts of Object.values(normalized)) {
      expect(
        facts.filter(({ factType }) => factType === 'usage-vector')
      ).toHaveLength(1);
      expect(
        facts.some(
          (fact) =>
            fact.factType === 'provider-event' &&
            fact.value.type === 'completed'
        )
      ).toBe(true);
    }
  });

  it('fails closed on private DNS and public Secret/holdout leakage', () => {
    const matrix = createGoldenG4V8SecurityMatrix();
    expect(matrix.authorizedEgress.allowed).toBe(true);
    expect(matrix.privateTargetEgress.allowed).toBe(false);
    expect(matrix.injectionSignals.every(({ blocking }) => !blocking)).toBe(
      true
    );
    expect(matrix.cleanArtifactFindings).toEqual([]);
    expect(
      matrix.leakedArtifactFindings.map(({ category }) => category)
    ).toEqual(['holdout-leak', 'secret-canary']);
  });
});
