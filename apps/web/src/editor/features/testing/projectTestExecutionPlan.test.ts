import { describe, expect, it } from 'vitest';
import { projectExecutableProjectRuntimeFiles } from '@prodivix/runtime-core';
import {
  SERVER_DATA_SECRET_REFERENCE_CANARY,
  serverDataWorkspace,
} from './serverDataWorkspace.fixture';
import { createProjectTestExecutionPlan } from './projectTestExecutionPlan';

describe('Project Test Data target planning', () => {
  it('keeps server Data in provider-forced mock mode without live capabilities', () => {
    const plan = createProjectTestExecutionPlan(serverDataWorkspace);

    expect(
      plan.status,
      plan.status === 'blocked' ? JSON.stringify(plan.diagnostics) : ''
    ).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.request.requiredCapabilities).not.toContain(
      'environment-binding'
    );
    expect(plan.request.requiredCapabilities).not.toContain('network');
    expect(
      projectExecutableProjectRuntimeFiles(plan.snapshot, 'test').find(
        (file) => file.path === 'public/.prodivix/data-runtime.json'
      )?.contents
    ).toContain('"mode":"mock"');
    expect(JSON.stringify(plan.snapshot)).not.toContain(
      SERVER_DATA_SECRET_REFERENCE_CANARY
    );
  });
});
