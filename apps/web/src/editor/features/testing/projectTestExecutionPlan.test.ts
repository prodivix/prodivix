import { describe, expect, it } from 'vitest';
import { projectExecutableProjectRuntimeFiles } from '@prodivix/runtime-core';
import {
  SERVER_DATA_SECRET_REFERENCE_CANARY,
  serverDataWorkspace,
} from './serverDataWorkspace.fixture';
import { createProjectTestExecutionPlan } from './projectTestExecutionPlan';
import { createServerRuntimeTestWorkspace } from './serverRuntimeWorkspace.fixture';

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

  it('adds deterministic built-in Auth fixtures without a live gateway capability', () => {
    const plan = createProjectTestExecutionPlan(
      createServerRuntimeTestWorkspace('route-loader')
    );
    expect(
      plan.status,
      plan.status === 'blocked' ? JSON.stringify(plan.diagnostics) : ''
    ).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.request.requiredCapabilities).not.toContain('server-function');
    expect(plan.snapshot.serverRuntimeMockProvision).toMatchObject({
      format: 'prodivix.server-runtime-test-provision.v1',
      fixtureSetId: 'workspace-auth-default',
      principal: {
        providerId: 'prodivix-test-fixture',
        principalId: 'test-principal',
      },
      fixtures: [
        expect.objectContaining({
          functionRef: {
            artifactId: 'code-auth',
            exportName: 'loadPrincipal',
          },
        }),
      ],
    });
    const testProvision = projectExecutableProjectRuntimeFiles(
      plan.snapshot,
      'test'
    ).find(
      ({ path }) => path === 'src/.prodivix/server-runtime-test-provision.ts'
    );
    const previewProvision = projectExecutableProjectRuntimeFiles(
      plan.snapshot,
      'preview'
    ).find(
      ({ path }) => path === 'src/.prodivix/server-runtime-test-provision.ts'
    );
    expect(testProvision?.contents).toContain('"mode":"deterministic-test"');
    expect(previewProvision?.contents).toContain('"mode":"disabled"');
    expect(previewProvision?.contents).not.toContain('test-principal');
  });

  it('requires explicit mutation fixtures and projects them into the Test snapshot', () => {
    const workspace = createServerRuntimeTestWorkspace('route-action');
    const missing = createProjectTestExecutionPlan(workspace);
    expect(missing.status).toBe('blocked');
    if (missing.status === 'blocked') {
      expect(missing.diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'WKS-EXPORT-SERVER-TEST-FIXTURE-MISSING',
        })
      );
    }

    const plan = createProjectTestExecutionPlan(workspace, {
      serverRuntimeMockProvision: {
        format: 'prodivix.server-runtime-test-provision.v1',
        fixtureSetId: 'profile-action-test',
        principal: {
          providerId: 'prodivix-test-fixture',
          principalId: 'test-principal',
        },
        permissions: [],
        fixtures: [
          {
            id: 'update-profile',
            functionRef: {
              artifactId: 'code-auth',
              exportName: 'updateProfile',
            },
            behavior: {
              kind: 'outcome',
              outcome: { kind: 'value', value: { updated: true } },
            },
          },
        ],
      },
    });
    expect(
      plan.status,
      plan.status === 'blocked' ? JSON.stringify(plan.diagnostics) : ''
    ).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.snapshot.serverRuntimeMockProvision).toMatchObject({
      fixtureSetId: 'profile-action-test',
    });
    expect(
      projectExecutableProjectRuntimeFiles(plan.snapshot, 'test').find(
        ({ path }) => path === 'src/.prodivix/server-runtime-test-provision.ts'
      )?.contents
    ).toContain('update-profile');
  });
});
