import type { Page } from 'playwright-core';
import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import { describe, expect, it } from 'vitest';
import {
  collectionItemPathSuffix,
  readProbeTarget,
  semanticLocator,
} from './playwrightBehaviorProbe';

class ScopedProbePage {
  readonly locatorResult = Object.freeze({ kind: 'locator' });
  instancePathSuffix?: string;
  instanceScope: unknown = { kind: 'collection-item', id: 'p2' };

  async evaluate(
    _pageFunction: (...values: never[]) => unknown,
    input: Readonly<Record<string, unknown>>
  ): Promise<unknown> {
    if ('requestedTargetId' in input) {
      return {
        targetId: input.requestedTargetId,
        ready: true,
        match: 'single',
        sourceTrace: {
          workspaceDocumentId: 'page-catalog',
          path: '/nodesById/product-card',
        },
        instanceScope: this.instanceScope,
      };
    }
    const value = input.value as
      | Readonly<{
          action?: unknown;
          target?: Readonly<{ instancePathSuffix?: unknown }>;
        }>
      | undefined;
    this.instancePathSuffix = value?.target?.instancePathSuffix as
      string | undefined;
    return this.instancePathSuffix ===
      collectionItemPathSuffix((this.instanceScope as { id: string }).id)
      ? { status: 'single', index: 1 }
      : { status: 'none', index: -1 };
  }

  locator(): Readonly<{ nth(index: number): object }> {
    return {
      nth: (index) => (index === 1 ? this.locatorResult : {}),
    };
  }
}

describe('Playwright semantic probe collection scope', () => {
  it('uses the compiler-owned collection key suffix to select one repeated PIR node', async () => {
    const page = new ScopedProbePage();
    const targetManifest = Object.freeze([
      Object.freeze({
        targetId: 'target-product-p2',
        semanticSymbolId: 'symbol-product-card',
        capability: 'interaction' as const,
        source: Object.freeze({
          workspaceDocumentId: 'page-catalog',
          path: '/nodesById/product-card',
        }),
        instanceScope: Object.freeze({
          kind: 'collection-item' as const,
          id: 'p2',
        }),
      }),
    ]) satisfies BehaviorScenarioProgram['targetManifest'];
    const target = await semanticLocator(
      page as unknown as Page,
      'target-product-p2',
      targetManifest,
      {
        propertyKey: 'trusted',
        capability: 'capability',
      }
    );
    expect(collectionItemPathSuffix('p2')).toBe('/17:key/6:string/2:p2');
    expect(page.instancePathSuffix).toBe('/17:key/6:string/2:p2');
    expect(target).toMatchObject({
      targetId: 'target-product-p2',
      nodeId: 'product-card',
      instanceScope: {
        kind: 'collection-item',
        id: 'p2',
      },
      locator: page.locatorResult,
    });
  });

  it('rejects an unsupported or extended instance scope fail closed', async () => {
    const page = new ScopedProbePage();
    page.instanceScope = { kind: 'component-instance', id: 'p2' };
    await expect(
      readProbeTarget(page as unknown as Page, 'target-product-p2')
    ).resolves.toBeUndefined();

    page.instanceScope = {
      kind: 'collection-item',
      id: 'p2',
      selector: '[data-private]',
    };
    await expect(
      readProbeTarget(page as unknown as Page, 'target-product-p2')
    ).resolves.toBeUndefined();
  });
});
