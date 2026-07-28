import { describe, expect, it } from 'vitest';
import {
  createGoldenG3CompositionReactBundle,
  createGoldenG3CompositionVueBundle,
  runGoldenG3OptimisticConflictJourney,
} from './goldenG3BehaviorCompositionFixture';
import { verifyGoldenG3CompositionBrowserTarget } from './goldenG3CompositionBrowserHarness';

describe.runIf(process.env.PRODIVIX_VERIFY_G3_V2_GOLDEN === '1')(
  'Golden G3 V2 React/Vue full/reduced browser closure',
  () => {
    it('keeps behavior, visual output, focus, and operability compatible across targets', async () => {
      const [react, vue, optimistic] = await Promise.all([
        verifyGoldenG3CompositionBrowserTarget(
          'react',
          createGoldenG3CompositionReactBundle()
        ),
        verifyGoldenG3CompositionBrowserTarget(
          'vue',
          createGoldenG3CompositionVueBundle()
        ),
        runGoldenG3OptimisticConflictJourney(),
      ]);
      expect(react.evidence.completedCommands).toContain('browser-smoke');
      expect(vue.evidence.completedCommands).toContain('browser-smoke');
      expect(react.visualSignatures).toEqual(vue.visualSignatures);
      expect(react.accessibilitySnapshots).toEqual(vue.accessibilitySnapshots);
      expect(react.screenshotHashes.full).toBe(react.screenshotHashes.reduced);
      expect(vue.screenshotHashes.full).toBe(vue.screenshotHashes.reduced);
      expect(react.screenshotHashes.full).toMatch(/^sha256-[a-f0-9]{64}$/u);
      expect(vue.screenshotHashes.full).toMatch(/^sha256-[a-f0-9]{64}$/u);
      expect(react.semanticDigests.full).not.toBe(
        react.semanticDigests.reduced
      );
      expect(vue.semanticDigests).toEqual(react.semanticDigests);
      expect(optimistic).toMatchObject({
        staleRollback: 'rollback-skipped',
        rollback: 'rolled-back',
        retry: 'committed',
        conflictCode: 'DATA_OPTIMISTIC_CONFLICT',
      });
    }, 900_000);
  }
);
