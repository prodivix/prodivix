import { describe, expect, it } from 'vitest';
import { decodeWorkspaceRevisionConflict } from '..';

const envelope = (
  code: 'WKS-4001' | 'WKS-4002' | 'WKS-4003',
  conflictType: 'WORKSPACE_CONFLICT' | 'ROUTE_CONFLICT' | 'DOCUMENT_CONFLICT'
) => ({
  error: {
    code,
    message: 'Revision conflict.',
    severity: 'warning',
    domain: 'workspace',
    retryable: true,
    requestId: 'request-1',
    details: {
      conflictType,
      workspaceId: 'workspace-1',
      expected:
        conflictType === 'DOCUMENT_CONFLICT'
          ? { document: { id: 'document-1', contentRev: 3 } }
          : conflictType === 'ROUTE_CONFLICT'
            ? { workspaceRev: 4, routeRev: 2 }
            : { workspaceRev: 4 },
      current: {
        workspaceRev: 5,
        routeRev: 3,
        opSeq: 9,
        ...(conflictType === 'DOCUMENT_CONFLICT'
          ? {
              document: {
                id: 'document-1',
                type: 'pir-page',
                path: '/page.pir.json',
                contentRev: 4,
                metaRev: 1,
                updatedAt: '2026-07-12T00:00:00Z',
              },
            }
          : {}),
      },
    },
  },
});

describe('workspace revision conflict decoder', () => {
  it.each([
    ['WKS-4001', 'WORKSPACE_CONFLICT'],
    ['WKS-4002', 'ROUTE_CONFLICT'],
    ['WKS-4003', 'DOCUMENT_CONFLICT'],
  ] as const)('decodes canonical %s envelopes', (code, conflictType) => {
    const result = decodeWorkspaceRevisionConflict(
      envelope(code, conflictType)
    );

    expect(result).toMatchObject({
      ok: true,
      conflict: { code, conflictType, workspaceId: 'workspace-1' },
    });
  });

  it('rejects non-canonical conflict types, unknown details, and leaked content', () => {
    const hybrid = envelope('WKS-4001', 'WORKSPACE_CONFLICT');
    hybrid.error.details.conflictType =
      'HYBRID_CONFLICT' as 'WORKSPACE_CONFLICT';
    expect(decodeWorkspaceRevisionConflict(hybrid)).toMatchObject({
      ok: false,
      issues: [{ path: '/error/details/conflictType' }],
    });

    const leaked = envelope('WKS-4003', 'DOCUMENT_CONFLICT');
    const currentDocument = leaked.error.details.current.document!;
    Object.assign(currentDocument, { content: { secret: true } });
    expect(decodeWorkspaceRevisionConflict(leaked)).toMatchObject({
      ok: false,
      issues: [{ path: '/error/details/current' }],
    });
  });

  it('requires the expected revision for each partition and matching document ids', () => {
    const route = envelope('WKS-4002', 'ROUTE_CONFLICT');
    delete route.error.details.expected.routeRev;
    expect(decodeWorkspaceRevisionConflict(route)).toMatchObject({
      ok: false,
      issues: [{ path: '/error/details/expected' }],
    });

    const routeWithoutWorkspace = envelope('WKS-4002', 'ROUTE_CONFLICT');
    delete routeWithoutWorkspace.error.details.expected.workspaceRev;
    expect(
      decodeWorkspaceRevisionConflict(routeWithoutWorkspace)
    ).toMatchObject({
      ok: false,
      issues: [{ path: '/error/details/expected' }],
    });

    const document = envelope('WKS-4003', 'DOCUMENT_CONFLICT');
    document.error.details.current.document!.id = 'other-document';
    expect(decodeWorkspaceRevisionConflict(document)).toMatchObject({
      ok: false,
      issues: [{ path: '/error/details/current/document/id' }],
    });
  });

  it('requires the claimed conflict partition to have a revision mismatch', () => {
    const workspace = envelope('WKS-4001', 'WORKSPACE_CONFLICT');
    workspace.error.details.expected.workspaceRev =
      workspace.error.details.current.workspaceRev;
    expect(decodeWorkspaceRevisionConflict(workspace)).toMatchObject({
      ok: false,
      issues: [{ path: '/error/details/current/workspaceRev' }],
    });

    const route = envelope('WKS-4002', 'ROUTE_CONFLICT');
    route.error.details.expected.routeRev =
      route.error.details.current.routeRev;
    expect(decodeWorkspaceRevisionConflict(route)).toMatchObject({
      ok: false,
      issues: [{ path: '/error/details/current/routeRev' }],
    });

    const document = envelope('WKS-4003', 'DOCUMENT_CONFLICT');
    document.error.details.expected.document!.contentRev =
      document.error.details.current.document!.contentRev;
    expect(decodeWorkspaceRevisionConflict(document)).toMatchObject({
      ok: false,
      issues: [{ path: '/error/details/current/document' }],
    });
  });

  it('decodes document metadata revision conflicts without requiring contentRev', () => {
    const metadata = envelope('WKS-4003', 'DOCUMENT_CONFLICT');
    const expected = metadata.error.details.expected as {
      document?: { id: string; contentRev?: number; metaRev?: number };
    };
    expected.document = {
      id: 'document-1',
      metaRev: 2,
    };

    expect(decodeWorkspaceRevisionConflict(metadata)).toMatchObject({
      ok: true,
      conflict: {
        expectedRevisions: {
          document: { id: 'document-1', metaRev: 2 },
        },
      },
    });
  });

  it('decodes document presence conflicts in both directions', () => {
    const deleted = envelope('WKS-4003', 'DOCUMENT_CONFLICT');
    const deletedCurrent = deleted.error.details.current as {
      document?: {
        id: string;
        type: string;
        path: string;
        contentRev: number;
        metaRev: number;
        updatedAt: string;
      } | null;
    };
    deletedCurrent.document = null;
    expect(decodeWorkspaceRevisionConflict(deleted)).toMatchObject({
      ok: true,
      conflict: { serverRevisions: { document: null } },
    });

    const unexpectedlyPresent = envelope('WKS-4003', 'DOCUMENT_CONFLICT');
    const expected = unexpectedlyPresent.error.details.expected as {
      document?: {
        id: string;
        contentRev?: number | null;
        metaRev?: number | null;
      };
    };
    expected.document = {
      id: 'document-1',
      contentRev: null,
      metaRev: null,
    };
    expect(decodeWorkspaceRevisionConflict(unexpectedlyPresent)).toMatchObject({
      ok: true,
      conflict: {
        expectedRevisions: {
          document: {
            id: 'document-1',
            contentRev: null,
            metaRev: null,
          },
        },
      },
    });
  });

  it('rejects code/type mismatch and invalid RFC3339 timestamps', () => {
    expect(
      decodeWorkspaceRevisionConflict(envelope('WKS-4001', 'ROUTE_CONFLICT'))
    ).toMatchObject({ ok: false });

    const document = envelope('WKS-4003', 'DOCUMENT_CONFLICT');
    document.error.details.current.document!.updatedAt = 'yesterday';
    expect(decodeWorkspaceRevisionConflict(document)).toMatchObject({
      ok: false,
      issues: [{ path: '/error/details/current' }],
    });
  });
});
