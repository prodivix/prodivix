import { describe, expect, it } from 'vitest';
import {
  createGoldenG3CompositionReactBundle,
  createGoldenG3CompositionVueBundle,
} from './goldenG3BehaviorCompositionFixture';
import { verifyGoldenG3CompositionBrowserTarget } from './goldenG3CompositionBrowserHarness';

describe.runIf(process.env.PRODIVIX_VERIFY_G3_V3_GOLDEN === '1')(
  'Golden G3 V3 React/Vue deterministic browser replay',
  () => {
    it('recreates full/reduced browser state three times per controlled target', async () => {
      const [react, vue] = await Promise.all([
        verifyGoldenG3CompositionBrowserTarget(
          'react',
          createGoldenG3CompositionReactBundle(),
          3
        ),
        verifyGoldenG3CompositionBrowserTarget(
          'vue',
          createGoldenG3CompositionVueBundle(),
          3
        ),
      ]);
      for (const target of [react, vue]) {
        for (const motion of ['full', 'reduced'] as const) {
          expect(target.repeatDigests[motion]).toHaveLength(3);
          expect(new Set(target.repeatDigests[motion]).size).toBe(1);
        }
        expect(target.evidence.completedCommands).toContain('browser-smoke');
      }
      expect(react.visualSignatures).toEqual(vue.visualSignatures);
      expect(react.accessibilitySnapshots).toEqual(vue.accessibilitySnapshots);
      expect(react.semanticDigests).toEqual(vue.semanticDigests);
    }, 900_000);
  }
);
