import { describe, expect, it } from 'vitest';
import {
  BEHAVIOR_CORE_REGISTRY_CONTRIBUTION,
  createBehaviorRegistry,
  digestBehaviorValue,
} from '@prodivix/behavior';
import { DATA_BEHAVIOR_REGISTRY_CONTRIBUTION } from '@prodivix/data';
import { PIR_BEHAVIOR_REGISTRY_CONTRIBUTION } from '@prodivix/pir';
import { ROUTE_BEHAVIOR_REGISTRY_CONTRIBUTION } from '@prodivix/router';
import { projectExecutableProjectRuntimeFiles } from '@prodivix/runtime-core';
import { validateWorkspaceSnapshot } from '@prodivix/workspace';
import {
  createGoldenG3CatalogProgram,
  createGoldenG3ReactCatalogSnapshot,
  createGoldenG3VueCatalogSnapshot,
  GOLDEN_G3_CATALOG_WORKSPACE,
  GOLDEN_G3_LOGIN_FIXTURE_DIGEST,
  GOLDEN_G3_LOGIN_FIXTURE_SET,
} from './goldenG3ScenarioFixture';

const textSource = (
  files: readonly Readonly<{ contents: string | Uint8Array }>[]
): string =>
  files
    .flatMap(({ contents }) => (typeof contents === 'string' ? [contents] : []))
    .join('\n');

describe('Golden G3 framework-neutral Behavior Scenario', () => {
  it('composes the complete manual, Route, PIR, and Data first-set registry', () => {
    const result = createBehaviorRegistry([
      DATA_BEHAVIOR_REGISTRY_CONTRIBUTION,
      PIR_BEHAVIOR_REGISTRY_CONTRIBUTION,
      ROUTE_BEHAVIOR_REGISTRY_CONTRIBUTION,
      BEHAVIOR_CORE_REGISTRY_CONTRIBUTION,
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const [category, kind] of [
      ['trigger', 'scenario.manual'],
      ['trigger', 'route.entered'],
      ['trigger', 'pir.event'],
      ['trigger', 'data.lifecycle'],
      ['action', 'route.navigate'],
      ['action', 'pir.click'],
      ['action', 'pir.input'],
      ['action', 'data.dispatch'],
      ['observation', 'route.location'],
      ['observation', 'pir.visible'],
      ['observation', 'pir.value'],
      ['observation', 'data.data-lifecycle'],
    ] as const) {
      expect(
        result.registry.get(category, kind),
        `${category}:${kind}`
      ).not.toBeNull();
    }
  });

  it('keeps the authored Catalog Scenario and login fixture in the valid canonical Workspace', () => {
    expect(validateWorkspaceSnapshot(GOLDEN_G3_CATALOG_WORKSPACE)).toEqual(
      expect.objectContaining({ valid: true, issues: [] })
    );
    expect(GOLDEN_G3_LOGIN_FIXTURE_SET.fixtures[0]).toMatchObject({
      target: {
        kind: 'auth-session',
        resourceId: 'prodivix-product-session',
      },
      outcome: {
        kind: 'result',
        value: {
          principalId: 'golden-catalog-owner',
          permissionIds: ['workspace.owner'],
        },
      },
    });
    expect(digestBehaviorValue(GOLDEN_G3_LOGIN_FIXTURE_SET)).toBe(
      GOLDEN_G3_LOGIN_FIXTURE_DIGEST
    );
  });

  it('compiles one deterministic Program with complete source trace and no persisted runtime selector', () => {
    const first = createGoldenG3CatalogProgram();
    const second = createGoldenG3CatalogProgram();
    expect(second).toEqual(first);
    expect(first.programDigest).toBe(second.programDigest);
    expect(first.sourceTrace.map(({ instructionId }) => instructionId)).toEqual(
      first.instructions.map(({ id }) => id)
    );
    expect(first.requiredCapabilities).toEqual(
      expect.arrayContaining([
        'scenario.manual',
        'route.navigate',
        'pir.click',
        'pir.visible',
      ])
    );
    expect(first.targetManifest).toContainEqual(
      expect.objectContaining({
        semanticSymbolId: expect.stringContaining('product-card'),
        capability: 'behavior:pir:visible',
        instanceScope: {
          kind: 'collection-item',
          id: 'p2',
        },
      })
    );

    const persistedProgram = JSON.stringify(first).toLowerCase();
    [
      'queryselector',
      'data-testid',
      '"selector"',
      '"xpath"',
      '"framework"',
      '"react"',
      '"vue"',
      '"domhandle"',
    ].forEach((canary) => expect(persistedProgram).not.toContain(canary));
  });

  it('uses the same Program for React and Vue while each adapter emits private semantic identity hooks', () => {
    const program = createGoldenG3CatalogProgram();
    const react = createGoldenG3ReactCatalogSnapshot();
    const vue = createGoldenG3VueCatalogSnapshot();
    expect(react.target).toEqual({
      presetId: 'react-vite',
      framework: 'react',
      runtime: 'vite',
    });
    expect(vue.target).toEqual({
      presetId: 'vue-vite',
      framework: 'vue',
      runtime: 'vite',
    });
    expect(program.workspaceRevision).toBe(
      GOLDEN_G3_CATALOG_WORKSPACE.workspaceRev
    );

    for (const source of [
      textSource(projectExecutableProjectRuntimeFiles(react, 'test')),
      textSource(projectExecutableProjectRuntimeFiles(vue, 'test')),
    ]) {
      expect(source).toContain('data-pir-document-id');
      expect(source).toContain('data-pir-node-id');
      expect(source).toContain('data-pir-instance-path');
      expect(source).toContain('create-product');
      expect(source).toContain('product-card');
    }
  });
});
