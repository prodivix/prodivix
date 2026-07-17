import { createHash } from 'node:crypto';
import {
  createExecutionFilesystemDiff,
  encodeExecutionFilesystemDiff,
} from '@prodivix/runtime-core';
import type { RemoteExecutionClient } from './remoteExecutionProtocol.types';
import { describe, expect, it } from 'vitest';
import { createRemoteExecutionArtifactResolver } from './remoteExecutionArtifactResolver';

const snapshotDigest = `sha256-${'a'.repeat(64)}`;

const previewContents = (): Uint8Array => {
  const entry = Buffer.from('<main>ready</main>');
  return Buffer.from(
    JSON.stringify({
      format: 'prodivix.execution-preview-bundle.v1',
      entryFilePath: 'index.html',
      bundle: {
        format: 'prodivix.execution-build-bundle.v1',
        snapshotDigest,
        target: {
          presetId: 'react-vite',
          framework: 'react',
          runtime: 'vite',
        },
        files: [
          {
            path: 'index.html',
            size: entry.byteLength,
            digest: `sha256-${createHash('sha256').update(entry).digest('hex')}`,
            encoding: 'base64',
            contents: entry.toString('base64'),
          },
        ],
      },
    })
  );
};

const client = (
  contents: Uint8Array,
  overrides: Record<string, unknown> = {}
): Pick<RemoteExecutionClient, 'resolveArtifact'> => ({
  resolveArtifact: async () => ({
    executionId: 'execution-1',
    providerId: 'prodivix.remote.preview',
    artifact: {
      artifactId: 'preview-1',
      kind: 'bundle' as const,
      mediaType: 'application/vnd.prodivix.execution-preview-bundle+json',
      size: contents.byteLength,
      digest: `sha256-${createHash('sha256').update(contents).digest('hex')}`,
      expiresAt: 2_000,
      authorizationScope: 'execution:execution-1',
      sourceTrace: [
        {
          sourceRef: {
            kind: 'workspace' as const,
            workspaceId: 'workspace-1',
          },
        },
      ],
      metadata: {
        snapshotDigest,
        readiness: 'ready',
        health: 'healthy',
        entryFilePath: 'index.html',
      },
      ...overrides,
    },
  }),
});

describe('Remote execution artifact resolver', () => {
  it('verifies descriptor, bytes, and Preview bundle before returning content', async () => {
    const contents = previewContents();
    const resolver = createRemoteExecutionArtifactResolver({
      client: client(contents),
      contentTransport: { download: async () => contents },
      now: () => 1_000,
    });

    const resolved = await resolver.resolvePreviewBundle({
      executionId: 'execution-1',
      artifactId: 'preview-1',
      snapshotDigest,
    });
    expect(resolved).toMatchObject({
      artifact: {
        artifactId: 'preview-1',
        metadata: { readiness: 'ready', health: 'healthy' },
      },
      bundle: { entryFilePath: 'index.html' },
    });
    expect(resolved.artifact).not.toHaveProperty('authorizationScope');
    expect(resolved.artifact).not.toHaveProperty('expiresAt');
  });

  it('fails closed for expired grants or content digest drift', async () => {
    const contents = previewContents();
    const expired = createRemoteExecutionArtifactResolver({
      client: client(contents, { expiresAt: 999 }),
      contentTransport: { download: async () => contents },
      now: () => 1_000,
    });
    await expect(
      expired.resolvePreviewBundle({
        executionId: 'execution-1',
        artifactId: 'preview-1',
        snapshotDigest,
      })
    ).rejects.toThrow('unavailable or invalid');

    const drifted = createRemoteExecutionArtifactResolver({
      client: client(contents),
      contentTransport: {
        download: async () => new Uint8Array([...contents, 0]),
      },
      now: () => 1_000,
    });
    await expect(
      drifted.resolvePreviewBundle({
        executionId: 'execution-1',
        artifactId: 'preview-1',
        snapshotDigest,
      })
    ).rejects.toThrow('do not match');
  });

  it('resolves an execution-scoped filesystem diff without materializing it as Preview', async () => {
    const contents = encodeExecutionFilesystemDiff(
      createExecutionFilesystemDiff({
        snapshotDigest,
        workspace: {
          workspaceId: 'workspace-1',
          snapshotId: 'snapshot-1',
        },
        capturedAt: 1_000,
        complete: true,
        changes: [
          {
            kind: 'added',
            path: 'runtime-note.txt',
            runtime: { contents: Buffer.from('runtime') },
          },
        ],
      })
    );
    const artifactId = `filesystem-diff:${snapshotDigest}`;
    const resolver = createRemoteExecutionArtifactResolver({
      client: {
        resolveArtifact: async () => ({
          executionId: 'execution-1',
          providerId: 'prodivix.remote.preview',
          artifact: {
            artifactId,
            kind: 'report',
            mediaType:
              'application/vnd.prodivix.execution-filesystem-diff+json',
            size: contents.byteLength,
            digest: `sha256-${createHash('sha256').update(contents).digest('hex')}`,
            expiresAt: 2_000,
            authorizationScope: 'execution:execution-1',
            metadata: {
              format: 'prodivix.execution-filesystem-diff.v1',
              snapshotDigest,
              workspaceSnapshotId: 'snapshot-1',
              changeCount: '1',
              complete: 'true',
            },
          },
        }),
      },
      contentTransport: { download: async () => contents },
      now: () => 1_000,
    });

    await expect(
      resolver.resolveFilesystemDiff({
        executionId: 'execution-1',
        artifactId,
        snapshotDigest,
        workspaceSnapshotId: 'snapshot-1',
      })
    ).resolves.toMatchObject({
      artifact: { artifactId },
      diff: {
        complete: true,
        changes: [{ kind: 'added', path: 'runtime-note.txt' }],
      },
    });
  });
});
