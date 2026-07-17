import { describe, expect, it } from 'vitest';
import {
  SERVER_DATA_SECRET_REFERENCE_CANARY,
  serverDataWorkspace,
} from '@/editor/features/testing/serverDataWorkspace.fixture';
import { createBlueprintProjectRunPlan } from './blueprintProjectRunPlan';

describe('Blueprint Project Data target planning', () => {
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
});
