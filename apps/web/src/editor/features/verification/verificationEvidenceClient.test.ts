import { createBinaryAssetBlobReference } from '@prodivix/assets';
import { describe, expect, it, vi } from 'vitest';
import { createVerificationEvidenceClient } from './verificationEvidenceClient';
import {
  createEvidenceRecordPayload,
  createVerifiedEvidenceViewPayload,
  decodeEvidenceRecordFixture,
  evidenceDigest,
} from './__tests__/verificationEvidence.fixture';

describe('Verification Evidence client', () => {
  it('reads the verified Evidence view from its current route', async () => {
    const record = decodeEvidenceRecordFixture();
    const payload = createVerifiedEvidenceViewPayload([record]);
    const request = vi.fn(
      async (_path: string, _options: RequestInit & { token: string }) => ({
        verifiedEvidenceView: payload.verifiedEvidenceView,
      })
    );
    const client = createVerificationEvidenceClient({
      accessToken: 'token-a',
      request: request as never,
    });

    const view = await client.getVerifiedEvidenceView({
      workspaceId: 'workspace-a',
      workspaceRevision: 7,
      planDigest: record.evidence.planDigest,
    });

    expect(view.records).toHaveLength(1);
    expect(request.mock.calls[0]?.[0]).toContain(
      '/workspaces/workspace-a/verification/closure?'
    );
  });

  it('binds list filters and mutation intent headers to the frozen routes', async () => {
    const request = vi.fn(
      async (path: string, options: RequestInit & { token: string }) => {
        if (path.endsWith('/compare')) {
          return {
            comparison: {
              compatibility: 'exact-compatible',
              leftEvidenceId: 'evidence-a',
              rightEvidenceId: 'evidence-b',
              mismatchFields: [],
              policyId: 'policy-a',
              policyDigest: evidenceDigest('f'),
              comparisonDigest: evidenceDigest('1'),
            },
          };
        }
        if (path.endsWith('/retention')) {
          return {
            protection: {
              id: 'protection-a',
              evidenceId: 'evidence-a',
              kind: 'change',
              externalRef: 'change:7',
              active: true,
              version: 1,
            },
          };
        }
        if (options.method === 'DELETE') return undefined;
        return { records: [createEvidenceRecordPayload()] };
      }
    );
    const client = createVerificationEvidenceClient({
      accessToken: 'token-a',
      request: request as never,
    });

    await client.listEvidence({
      workspaceId: 'workspace-a',
      workspaceRevision: 7,
      planDigest: evidenceDigest('e'),
      cellId: 'cell-a',
      trust: 'ci-attested',
      outcome: 'passed',
      limit: 25,
    });
    await client.compareEvidence({
      workspaceId: 'workspace-a',
      evidenceId: 'evidence-a',
      otherEvidenceId: 'evidence-b',
    });
    await client.updateRetention({
      workspaceId: 'workspace-a',
      evidenceId: 'evidence-a',
      action: 'protect',
      kind: 'change',
      externalRef: 'change:7',
      operationId: 'operation-retain-0001',
    });
    await client.tombstoneEvidence({
      workspaceId: 'workspace-a',
      evidenceId: 'evidence-a',
      reason: 'superseded by reviewed evidence',
      operationId: 'operation-delete-0001',
    });

    expect(request.mock.calls[0]?.[0]).toContain(
      '/workspaces/workspace-a/verification/evidence?'
    );
    expect(request.mock.calls[0]?.[0]).toContain('workspaceRevision=7');
    expect(request.mock.calls[0]?.[0]).toContain('cellId=cell-a');
    expect(request.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        'X-Prodivix-Verification-Intent': 'compare',
      },
    });
    expect(JSON.parse(String(request.mock.calls[1]?.[1].body))).toEqual({
      otherEvidenceId: 'evidence-b',
    });
    expect(request.mock.calls[2]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        'X-Prodivix-Verification-Intent': 'retention',
        'Idempotency-Key': 'operation-retain-0001',
      },
    });
    expect(JSON.parse(String(request.mock.calls[2]?.[1].body))).toEqual({
      action: 'protect',
      kind: 'change',
      externalRef: 'change:7',
      expectedEvidenceState: 'active',
      expectedProtectionState: 'absent',
    });
    expect(request.mock.calls[3]?.[1]).toMatchObject({
      method: 'DELETE',
      headers: {
        'X-Prodivix-Verification-Intent': 'delete',
        'Idempotency-Key': 'operation-delete-0001',
      },
    });
    expect(request.mock.calls[3]?.[0]).not.toContain('?');
    expect(JSON.parse(String(request.mock.calls[3]?.[1].body))).toEqual({
      reason: 'superseded by reviewed evidence',
      expectedEvidenceState: 'active',
    });
  });

  it('cannot grant comparison mismatches from a caller policy', async () => {
    const request = vi.fn(
      async (_path: string, _options: RequestInit & { token: string }) => ({
        comparison: {
          compatibility: 'exact-compatible',
          leftEvidenceId: 'evidence-a',
          rightEvidenceId: 'evidence-b',
          mismatchFields: [],
          policyId: 'policy-a',
          policyDigest: evidenceDigest('f'),
          comparisonDigest: evidenceDigest('1'),
        },
      })
    );
    const client = createVerificationEvidenceClient({
      accessToken: 'token-a',
      request: request as never,
    });

    await client.compareEvidence({
      workspaceId: 'workspace-a',
      evidenceId: 'evidence-a',
      otherEvidenceId: 'evidence-b',
      // @ts-expect-error Comparison policy is Backend-resolved authority.
      policy: {
        id: 'caller-policy',
        digest: evidenceDigest('0'),
        allowedMismatchFields: ['project-id'],
      },
    });

    expect(JSON.parse(String(request.mock.calls[0]?.[1].body))).toEqual({
      otherEvidenceId: 'evidence-b',
    });
  });

  it('binds release to an active protection version and stable operation id', async () => {
    const request = vi.fn(
      async (
        _path: string,
        _options: RequestInit & { token: string }
      ): Promise<void> => undefined
    );
    const client = createVerificationEvidenceClient({
      accessToken: 'token-a',
      request: request as never,
    });

    const released = await client.updateRetention({
      workspaceId: 'workspace-a',
      evidenceId: 'evidence-a',
      action: 'release',
      kind: 'release',
      externalRef: 'release:9',
      protectionId: 'protection-a',
      expectedVersion: 3,
      operationId: 'operation-release-0001',
    });

    expect(released).toBeUndefined();
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        'Idempotency-Key': 'operation-release-0001',
      },
    });
    expect(JSON.parse(String(request.mock.calls[0]?.[1].body))).toEqual({
      action: 'release',
      kind: 'release',
      externalRef: 'release:9',
      protectionId: 'protection-a',
      expectedProtectionState: 'active',
      expectedVersion: 3,
    });
  });

  it('binds supersession to active source/target state and no existing edge', async () => {
    const request = vi.fn(
      async (
        _path: string,
        _options: RequestInit & { token: string }
      ): Promise<void> => undefined
    );
    const client = createVerificationEvidenceClient({
      accessToken: 'token-a',
      request: request as never,
    });

    await client.supersedeEvidence({
      workspaceId: 'workspace-a',
      evidenceId: 'evidence-failed',
      newEvidenceId: 'evidence-passed',
      reason: 'reviewed correction',
      operationId: 'operation-supersede-0001',
    });

    expect(request.mock.calls[0]?.[0]).toContain(
      '/evidence/evidence-failed/supersede'
    );
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        'X-Prodivix-Verification-Intent': 'supersede',
        'Idempotency-Key': 'operation-supersede-0001',
      },
    });
    expect(JSON.parse(String(request.mock.calls[0]?.[1].body))).toEqual({
      newEvidenceId: 'evidence-passed',
      reason: 'reviewed correction',
      expectedOldEvidenceState: 'active',
      expectedNewEvidenceState: 'active',
      expectedSupersessionState: 'none',
    });
  });

  it('downloads only attachment-safe bytes that match the Evidence descriptor', async () => {
    const contents = new Uint8Array([1, 2, 3, 4]);
    const reference = createBinaryAssetBlobReference({
      contents,
      mediaType: 'text/plain',
    });
    const artifact = decodeEvidenceRecordFixture({
      artifactDigest: reference.digest,
      artifactSize: contents.byteLength,
    }).artifacts[0]!;
    const fetchPort = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(contents, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain',
            'Content-Disposition': 'attachment; filename="build.log"',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "sandbox; default-src 'none'",
            'Cache-Control': 'private, no-store',
            ETag: `"${reference.digest}"`,
            'Content-Length': String(contents.byteLength),
          },
        })
    );
    const client = createVerificationEvidenceClient({
      accessToken: 'token-a',
      request: vi.fn() as never,
      fetch: fetchPort,
    });

    const downloaded = await client.downloadArtifact({
      workspaceId: 'workspace-a',
      evidenceId: 'evidence-a',
      artifact,
    });

    expect([...downloaded.contents]).toEqual([...contents]);
    expect(downloaded.fileName).toBe('artifact-a');
    expect(fetchPort.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      headers: { Authorization: 'Bearer token-a' },
    });
  });

  it('fails closed when an artifact response can be rendered inline', async () => {
    const artifact = decodeEvidenceRecordFixture().artifacts[0]!;
    const client = createVerificationEvidenceClient({
      accessToken: 'token-a',
      request: vi.fn() as never,
      fetch: vi.fn(
        async () =>
          new Response(new Uint8Array(artifact.size), {
            status: 200,
            headers: {
              'Content-Type': artifact.mediaType,
              'Content-Disposition': 'inline',
              'X-Content-Type-Options': 'nosniff',
              'Content-Security-Policy': "sandbox; default-src 'none'",
              'Cache-Control': 'private, no-store',
              ETag: `"${artifact.digest}"`,
            },
          })
      ),
    });

    await expect(
      client.downloadArtifact({
        workspaceId: 'workspace-a',
        evidenceId: 'evidence-a',
        artifact,
      })
    ).rejects.toThrow(/attachment security contract/u);
  });
});
