import {
  projectExecutableProjectRuntimeFiles,
  EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE,
} from '@prodivix/runtime-core';
import { REMOTE_PREVIEW_EXECUTION_PROVIDER_ID } from '@prodivix/runtime-remote';
import { describe, expect, it } from 'vitest';
import { prepareGoldenBrowserProject } from './generatedProjectHarness';
import { createGoldenG3V6ExecutableSnapshot } from './goldenG3V6ExecutableSnapshot';
import { startGoldenG3V6RemotePreviewSession } from './goldenG3V6RemotePreviewHarness';
import { createGoldenG3ReactCatalogSnapshot } from './goldenG3ScenarioFixture';

describe('Golden G3 V6 Remote Preview harness', () => {
  it('uploads, claims, resumes, resolves, and materializes an actual generated bundle', async () => {
    const snapshot = createGoldenG3V6ExecutableSnapshot(
      createGoldenG3ReactCatalogSnapshot()
    );
    const project = await prepareGoldenBrowserProject(
      {
        files: projectExecutableProjectRuntimeFiles(snapshot, 'test'),
      },
      { executableSnapshot: snapshot }
    );
    let session:
      | Awaited<ReturnType<typeof startGoldenG3V6RemotePreviewSession>>
      | undefined;
    try {
      if (!project.toolchain) {
        throw new Error(
          'Golden G3 V6 Remote Preview test requires actual build output.'
        );
      }
      session = await startGoldenG3V6RemotePreviewSession({
        attemptId: 'attempt:g3-v6:preview:react-vite:remote',
        snapshot,
        buildBundle: project.toolchain.buildBundle,
        excludedOrigins: Object.freeze([project.origin]),
      });

      expect(session.isActive()).toBe(true);
      expect(session.origin).not.toBe(project.origin);
      expect(new URL(session.origin).origin).toBe(session.origin);
      expect(session.evidence).toMatchObject({
        attemptId: 'attempt:g3-v6:preview:react-vite:remote',
        providerId: REMOTE_PREVIEW_EXECUTION_PROVIDER_ID,
        workerAttempt: 1,
        snapshotId: snapshot.workspace.snapshotId,
        snapshotDigest: snapshot.contentDigest,
        snapshotUploadVerified: true,
        resumeCheckpoint: {
          confirmedAfterCursor: 2,
          generation: 1,
        },
        terminalCheckpoint: {
          confirmedAfterCursor: 5,
          generation: 2,
        },
        terminalStatus: 'succeeded',
        readiness: 'ready',
        health: 'healthy',
        materializedOrigin: session.origin,
        materializedEntryFilePath: snapshot.previewPlan.entryFilePath,
        materializedFileCount: project.toolchain.buildBundle.files.length,
      });
      expect(session.evidence.executionId).toMatch(
        /^golden-v6-remote-preview:[a-f0-9]{23}$/u
      );
      expect(session.evidence.artifactId).toMatch(
        /^preview-bundle:[a-f0-9]{23}$/u
      );
      expect(session.evidence.artifactDigest).toBe(
        session.evidence.materializedBundleDigest
      );
      expect(session.evidence.artifactDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
      expect(session.evidence.materializedEntryDigest).toMatch(
        /^sha256-[a-f0-9]{64}$/u
      );
      expect(session.evidence.artifactSize).toBeGreaterThan(0);

      const response = await fetch(new URL('/catalog', `${session.origin}/`));
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(response.headers.get('content-security-policy')).toBeTruthy();
      expect(response.headers.get('permissions-policy')).toBeTruthy();
      expect(EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE).toBe(
        'application/vnd.prodivix.execution-preview-bundle+json'
      );

      const cleanup = await session.cleanup();
      expect(cleanup).toEqual({
        status: 'clean',
        materializedOriginClosed: true,
        retiredArtifactCount: 1,
        artifactUnavailableAfterRetirement: true,
      });
      expect(session.isActive()).toBe(false);
      await expect(session.cleanup()).resolves.toEqual(cleanup);
    } finally {
      await session?.cleanup();
      await project.dispose();
    }
  }, 90_000);
});
