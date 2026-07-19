import { describe, expect, it } from 'vitest';
import {
  SERVER_DATA_SECRET_REFERENCE_CANARY,
  serverDataWorkspace,
} from '@/editor/features/testing/serverDataWorkspace.fixture';
import { createBlueprintProjectRunPlan } from './blueprintProjectRunPlan';

const clientWorkspace = {
  ...serverDataWorkspace,
  id: 'runner-client-data',
  treeById: {
    root: {
      ...serverDataWorkspace.treeById.root!,
      children: ['page-node'],
    },
    'page-node': serverDataWorkspace.treeById['page-node']!,
  },
  docsById: {
    page: serverDataWorkspace.docsById.page!,
  },
};

describe('Blueprint Project Data target planning', () => {
  it('freezes Browser and Remote choices around the same authoring snapshot identity', () => {
    const browser = createBlueprintProjectRunPlan(clientWorkspace, 'browser');
    const remote = createBlueprintProjectRunPlan(clientWorkspace, 'remote');

    expect(browser.status).toBe('ready');
    expect(remote.status).toBe('ready');
    if (browser.status !== 'ready' || remote.status !== 'ready') return;
    expect(browser.composition).toMatchObject({
      mode: 'run',
      provider: 'browser',
      target: 'react-vite',
      runtimeZone: 'client',
      environmentPolicy: 'public-client',
    });
    expect(browser.request.workspace).toEqual(remote.request.workspace);
    expect(browser.snapshot.workspace).toEqual(remote.snapshot.workspace);
    expect(Object.isFrozen(browser.composition.requiredCapabilities)).toBe(
      true
    );
  });

  it('blocks server Data for Browser Preview', () => {
    const plan = createBlueprintProjectRunPlan(serverDataWorkspace, 'browser');

    expect(plan.status).toBe('blocked');
    if (plan.status !== 'blocked') return;
    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'WKS-EXPORT-DATA-SERVER-GATEWAY-REQUIRED',
      })
    );
  });

  it('enables the exact Remote gateway capabilities without projecting Secret identity', () => {
    const plan = createBlueprintProjectRunPlan(serverDataWorkspace, 'remote');

    expect(
      plan.status,
      plan.status === 'blocked' ? JSON.stringify(plan.diagnostics) : ''
    ).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.composition).toEqual({
      mode: 'run',
      provider: 'remote',
      target: 'react-vite',
      runtimeZone: 'client',
      environmentPolicy: 'execution-parent-gateway',
      requiredCapabilities: plan.request.requiredCapabilities,
    });
    expect(Object.isFrozen(plan.composition)).toBe(true);
    expect(plan.request.environment).toBeUndefined();
    expect(plan.snapshot.capabilityRequirements.preview).toEqual(
      expect.arrayContaining(['environment-binding', 'network'])
    );
    expect(plan.request.requiredCapabilities).toEqual(
      expect.arrayContaining(['environment-binding', 'network'])
    );
    expect(JSON.stringify(plan.snapshot)).not.toContain(
      SERVER_DATA_SECRET_REFERENCE_CANARY
    );
    expect(JSON.stringify(plan.request)).not.toContain(
      SERVER_DATA_SECRET_REFERENCE_CANARY
    );
  });

  it('selects the Vue/Vite executable target for Remote Run Mode', () => {
    const plan = createBlueprintProjectRunPlan(
      serverDataWorkspace,
      'remote',
      [],
      'vue-vite'
    );

    expect(
      plan.status,
      plan.status === 'blocked' ? JSON.stringify(plan.diagnostics) : ''
    ).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.snapshot.target).toEqual({
      presetId: 'vue-vite',
      framework: 'vue',
      runtime: 'vite',
    });
    expect(
      plan.snapshot.files.some((file) => file.path === 'src/App.vue')
    ).toBe(true);
    expect(plan.request.requiredCapabilities).toEqual(
      expect.arrayContaining(['environment-binding', 'network'])
    );
    expect(plan.composition).toMatchObject({
      provider: 'remote',
      target: 'vue-vite',
      environmentPolicy: 'execution-parent-gateway',
    });
  });
});
