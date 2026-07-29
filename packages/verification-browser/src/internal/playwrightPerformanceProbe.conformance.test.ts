import { runInNewContext } from 'node:vm';
import type { Page } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import { installPlaywrightPerformanceProbe } from './playwrightPerformanceProbe';

class InitScriptPage {
  pageFunction?: (binding: { propertyKey: string; capability: string }) => void;
  binding?: Readonly<{ propertyKey: string; capability: string }>;

  async addInitScript(
    pageFunction: (binding: {
      propertyKey: string;
      capability: string;
    }) => void,
    binding: Readonly<{ propertyKey: string; capability: string }>
  ): Promise<void> {
    this.pageFunction = pageFunction;
    this.binding = binding;
  }
}

describe('Playwright trusted performance probe', () => {
  it('keeps native observations behind an immutable random capability after author monkeypatching', async () => {
    const page = new InitScriptPage();
    const binding = await installPlaywrightPerformanceProbe(
      page as unknown as Page
    );
    const frameCallbacks: Array<(time: number) => void> = [];
    const entriesByType: Readonly<Record<string, readonly object[]>> = {
      navigation: [{ duration: 999 }],
      resource: [{ transferSize: 4_096 }],
      longtask: [{ duration: 175 }],
      'largest-contentful-paint': [{ startTime: 450 }],
      'layout-shift': [{ value: 0.25, hadRecentInput: false }],
      event: [{ duration: 80 }],
    };
    const sandbox = {
      PerformanceObserverEntryList: class {
        getEntries(): readonly object[] {
          return [];
        }
      },
      PerformanceObserver: class {
        type = '';

        constructor(_callback: (list: object) => void) {}

        observe(options: Readonly<{ type: string }>): void {
          this.type = options.type;
        }

        takeRecords(): readonly object[] {
          return entriesByType[this.type] ?? [];
        }
      },
      requestAnimationFrame(callback: (time: number) => void): number {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      },
      performance: {
        getEntriesByType: () => [{ duration: 999 }],
      },
    };
    runInNewContext(
      `(${String(page.pageFunction)})(${JSON.stringify(page.binding)})`,
      sandbox
    );
    runInNewContext(
      `performance.getEntriesByType = () => [{ duration: 0 }];
       requestAnimationFrame = (callback) => { callback(0); return 1; };
       globalThis[${JSON.stringify(binding.propertyKey)}] = () => ({
         status: 'complete',
         navigationDuration: 0
       });`,
      sandbox
    );

    const wrongCapability = runInNewContext(
      `globalThis[${JSON.stringify(binding.propertyKey)}](
         'forged-capability',
         'snapshot'
       )`,
      sandbox
    );
    expect(wrongCapability).toBeUndefined();

    const startedPromise = runInNewContext(
      `globalThis[${JSON.stringify(binding.propertyKey)}](
         ${JSON.stringify(binding.capability)},
         'start-frame-sample'
       )`,
      sandbox
    ) as Promise<{ status: string }>;
    frameCallbacks.shift()!(0);
    const started = await startedPromise;
    expect(started.status).toBe('started');
    frameCallbacks.shift()!(16);
    frameCallbacks.shift()!(300);

    const stoppedPromise = runInNewContext(
      `globalThis[${JSON.stringify(binding.propertyKey)}](
         ${JSON.stringify(binding.capability)},
         'stop-frame-sample'
       )`,
      sandbox
    ) as Promise<{ status: string }>;
    frameCallbacks.shift()!(316);
    frameCallbacks.shift()!(316);
    expect((await stoppedPromise).status).toBe('stopped');

    const snapshot = runInNewContext(
      `globalThis[${JSON.stringify(binding.propertyKey)}](
         ${JSON.stringify(binding.capability)},
         'snapshot'
       )`,
      sandbox
    ) as Readonly<Record<string, unknown>>;
    expect(snapshot).toMatchObject({
      status: 'complete',
      integrity: 'pre-author-native-capture-v1',
      navigationDuration: 999,
      resourceBytes: 4_096,
      totalBlockingTime: 125,
      lcp: 450,
      lcpEntryCount: 1,
      cls: 0.25,
      inp: 80,
      frameCount: 3,
    });
    expect(snapshot.navigationDuration).not.toBe(0);
    expect(
      runInNewContext(
        `Object.getOwnPropertyDescriptor(
           globalThis,
           ${JSON.stringify(binding.propertyKey)}
         )`,
        sandbox
      )
    ).toMatchObject({
      configurable: false,
      enumerable: false,
      writable: false,
    });
  });
});
