import { describe, expect, it } from 'vitest';
import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import type { VerificationPlanCell } from '@prodivix/verification';
import type { Page } from 'playwright-core';
import type {
  BrowserVerificationRuntimeIdentity,
  BrowserVisualCellProfile,
} from '../browserAdapter.types';
import { decodeRgbaPng, encodeRgbaPng } from '../rgbaPng';
import { createRgbaRasterDigest } from '../visualComparison';
import { capturePlaywrightVisual } from './playwrightVisualCollector';

const sha = (character: string): string => `sha256-${character.repeat(64)}`;

describe('Playwright visual collector', () => {
  it('derives the current profile from the Plan and observed runtime and hashes RGBA bytes', async () => {
    const runtimeIdentity: BrowserVerificationRuntimeIdentity = {
      machineClass: 'actual.machine',
      operatingSystemImageDigest: sha('1'),
      browserImageDigest: sha('2'),
      browserEngine: 'chromium',
      browserVersion: 'actual.browser',
      fontSetDigest: sha('3'),
      viewport: {
        widthCssPixels: 2,
        heightCssPixels: 2,
        devicePixelRatio: 1,
      },
      colorScheme: 'dark',
      motionPreference: 'reduced',
      locale: 'en-US',
      cacheClass: 'warm',
      rendererGeneration: 'actual.renderer',
      normalizer: { id: 'actual.normalizer', version: '2' },
    };
    const cell = {
      id: 'cell.visual',
      scenarioId: 'scenario.actual',
      targetId: 'target.actual',
      frameworkTarget: 'react-vite',
      surface: 'ci',
      browserEngine: 'chromium',
    } as VerificationPlanCell;
    const profile = {
      kind: 'visual',
      observationId: 'visual.one',
      stepId: 'step.actual',
      targetId: 'target.actual',
      captureTargetId: 'semantic.sentinel',
      baseline: {
        rasterDigest: sha('4'),
        profile: {
          scenarioId: 'scenario.baseline',
          stepId: 'step.baseline',
          targetId: 'target.baseline',
          frameworkTarget: 'vue-vite',
        },
      },
      threshold: {},
      masks: [],
    } as unknown as BrowserVisualCellProfile;
    const rgba = Uint8Array.from([
      1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255,
    ]);
    const locator = {
      scrollIntoViewIfNeeded: async () => undefined,
      boundingBox: async () => ({
        x: 0,
        y: 0,
        width: 2,
        height: 2,
      }),
    };
    const page = {
      evaluate: async () => ({ status: 'single', index: 0 }),
      locator: () => ({
        nth: () => locator,
      }),
      screenshot: async () =>
        encodeRgbaPng({ width: 2, height: 2, data: rgba }),
    } as unknown as Page;
    const targetManifest = Object.freeze([
      Object.freeze({
        targetId: 'semantic.sentinel',
        semanticSymbolId: 'pir-node:sentinel',
        capability: 'behavior:pir:visible',
        source: Object.freeze({
          workspaceDocumentId: 'document.sentinel',
          path: '/nodesById/sentinel',
        }),
      }),
    ]) satisfies BehaviorScenarioProgram['targetManifest'];

    const capture = await capturePlaywrightVisual({
      page,
      cell,
      profile,
      targetManifest,
      runtimeIdentity,
      trustedPageProbe: Object.freeze({
        propertyKey: 'trusted-probe',
        capability: 'trusted-capability',
      }),
    });

    expect(capture.profile).toMatchObject({
      scenarioId: 'scenario.actual',
      stepId: 'step.actual',
      targetId: 'target.actual',
      frameworkTarget: 'react-vite',
      browserImageDigest: sha('2'),
      rendererGeneration: 'actual.renderer',
      captureRegion: {
        widthCssPixels: 2,
        heightCssPixels: 2,
      },
    });
    expect(capture.profile.scenarioId).not.toBe(
      profile.baseline.profile.scenarioId
    );
    expect(capture.digest).toBe(
      createRgbaRasterDigest({ width: 2, height: 2, data: rgba })
    );
    expect(decodeRgbaPng(capture.pngBytes)).toEqual({
      width: 2,
      height: 2,
      data: rgba,
    });
    await expect(
      capturePlaywrightVisual({
        page,
        cell,
        profile: {
          ...profile,
          sourceTraceDigest: sha('9'),
        },
        targetManifest,
        runtimeIdentity,
        trustedPageProbe: Object.freeze({
          propertyKey: 'trusted-probe',
          capability: 'trusted-capability',
        }),
      })
    ).rejects.toThrow(/SourceTrace drifted/u);
    await expect(
      capturePlaywrightVisual({
        page,
        cell,
        profile: {
          ...profile,
          captureTargetId: 'semantic.missing',
        },
        targetManifest,
        runtimeIdentity,
        trustedPageProbe: Object.freeze({
          propertyKey: 'trusted-probe',
          capability: 'trusted-capability',
        }),
      })
    ).rejects.toThrow(/absent, ambiguous, or not bound/u);
  });
});
