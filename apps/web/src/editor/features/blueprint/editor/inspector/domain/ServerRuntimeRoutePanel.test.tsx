import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceServerRuntimeAuthoringCandidate } from '@prodivix/workspace';
import { InspectorContext } from '../InspectorContext';
import type { InspectorContextValue } from '../InspectorContext.types';
import {
  formatServerRuntimeCandidateLabel,
  ServerRuntimeRoutePanel,
} from './ServerRuntimeRoutePanel';

const candidate: WorkspaceServerRuntimeAuthoringCandidate = Object.freeze({
  key: 'code-auth#requireOwner',
  slot: 'guard',
  reference: Object.freeze({
    artifactId: 'code-auth',
    exportName: 'requireOwner',
  }),
  documentPath: '/server/auth.server.ts',
  definition: Object.freeze({
    reference: Object.freeze({
      artifactId: 'code-auth',
      exportName: 'requireOwner',
    }),
    kind: 'route-guard',
    runtimeZone: 'server',
    adapterId: 'core.auth.require-workspace-owner',
    effect: 'read',
    auth: Object.freeze({
      kind: 'permission',
      permissionId: 'workspace.owner',
    }),
    inputSchema: true,
    outputSchema: true,
  }),
});

const createContext = (input: {
  writeAvailable?: boolean;
  setBinding: ReturnType<typeof vi.fn>;
  createGuard: ReturnType<typeof vi.fn>;
  openArtifact: ReturnType<typeof vi.fn>;
}): InspectorContextValue =>
  ({
    t: (key: string, options?: Record<string, unknown>) =>
      String(options?.defaultValue ?? key),
    activeRouteDetails: {
      id: 'route-home',
      path: '/',
      label: 'Home',
      segment: '',
      depth: 1,
      treeIndex: 0,
      isIndexRoute: true,
      outletBindings: [],
      runtimeRefs: [
        {
          kind: 'guard',
          artifactId: 'code-auth',
          exportName: 'requireOwner',
        },
      ],
      issues: [],
    },
    serverRuntimeCandidates: [candidate],
    serverRuntimeIssues: [
      {
        code: 'WKS-EXPORT-SERVER-SLOT-MISMATCH',
        message: 'The route slot does not match.',
        path: '/routeManifest/runtime/route-home/guard',
        routeNodeId: 'route-home',
        slot: 'guard',
        artifactId: 'code-auth',
        exportName: 'requireOwner',
      },
    ],
    serverRuntimeWriteAvailable: input.writeAvailable ?? true,
    setServerRuntimeBinding: input.setBinding,
    createWorkspaceOwnerGuard: input.createGuard,
    openServerRuntimeArtifact: input.openArtifact,
  }) as unknown as InspectorContextValue;

describe('ServerRuntimeRoutePanel', () => {
  it('binds, unbinds, creates target presets, and opens canonical source', () => {
    const setBinding = vi.fn();
    const createGuard = vi.fn();
    const openArtifact = vi.fn();
    render(
      <InspectorContext.Provider
        value={createContext({ setBinding, createGuard, openArtifact })}
      >
        <ServerRuntimeRoutePanel />
      </InspectorContext.Provider>
    );

    expect(screen.getByText('Auth & Server Runtime')).toBeTruthy();
    expect(
      screen.getByText('[WKS-EXPORT-SERVER-SLOT-MISMATCH]', { exact: false })
    ).toBeTruthy();
    expect(
      screen.getByRole('option', {
        name: formatServerRuntimeCandidateLabel(candidate),
      })
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Guard Server Function'), {
      target: { value: '' },
    });
    expect(setBinding).toHaveBeenCalledWith('guard', undefined);
    fireEvent.change(screen.getByLabelText('Guard Server Function'), {
      target: { value: candidate.key },
    });
    expect(setBinding).toHaveBeenCalledWith('guard', candidate.key);

    fireEvent.click(screen.getByRole('button', { name: 'Edit code' }));
    expect(openArtifact).toHaveBeenCalledWith('code-auth');
    fireEvent.click(
      screen.getByRole('button', { name: 'Create Remote owner guard' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Create isolated owner guard' })
    );
    expect(createGuard).toHaveBeenNthCalledWith(1, 'remote-live');
    expect(createGuard).toHaveBeenNthCalledWith(2, 'isolated-production');
  });

  it('disables authoring for read-only or mounted-module routes', () => {
    render(
      <InspectorContext.Provider
        value={createContext({
          writeAvailable: false,
          setBinding: vi.fn(),
          createGuard: vi.fn(),
          openArtifact: vi.fn(),
        })}
      >
        <ServerRuntimeRoutePanel />
      </InspectorContext.Provider>
    );
    expect(
      (screen.getByLabelText('Guard Server Function') as HTMLSelectElement)
        .disabled
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Create Remote owner guard',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(
      screen.getByText(
        'This route is read-only or owned by a mounted Route module.'
      )
    ).toBeTruthy();
  });
});
