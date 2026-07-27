import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import {
  createExecutionFilesystemDiff,
  createExecutionSecretLeakGuard,
  encodeExecutionFilesystemDiff,
  EXECUTION_BUILD_BUNDLE_FORMAT,
  EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
  EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE,
  EXECUTION_TEST_REPORT_MEDIA_TYPE,
  inspectExecutionArtifactContents,
} from '..';

const secret = 'prodivix-secret-canary-value';
const snapshotDigest = `sha256-${'a'.repeat(64)}`;
const workspace = Object.freeze({
  workspaceId: 'workspace-1',
  snapshotId: 'snapshot-1',
  partitionRevisions: Object.freeze({ 'document:code-1:content': 'rev-1' }),
});

const guard = () => createExecutionSecretLeakGuard({ secretValues: [secret] });

const filesystemDiffArtifact = (fileText: string) =>
  encodeExecutionFilesystemDiff(
    createExecutionFilesystemDiff({
      snapshotDigest,
      workspace,
      capturedAt: 42,
      complete: true,
      changes: [
        {
          kind: 'added',
          path: 'debug.log',
          runtime: { contents: new TextEncoder().encode(fileText) },
        },
      ],
    })
  );

const buildBundleArtifact = (fileText: string) => {
  const contents = Buffer.from(fileText, 'utf8');
  return new TextEncoder().encode(
    JSON.stringify({
      format: EXECUTION_BUILD_BUNDLE_FORMAT,
      snapshotDigest,
      target: { presetId: 'react-vite', framework: 'react', runtime: 'vite' },
      files: [
        {
          path: 'assets/app.js',
          size: contents.byteLength,
          digest: `sha256-${bytesToHex(sha256(contents))}`,
          encoding: 'base64',
          contents: contents.toString('base64'),
        },
      ],
    })
  );
};

describe('inspectExecutionArtifactContents', () => {
  it('detects a protected value that a filesystem diff stores base64-encoded', () => {
    const contents = filesystemDiffArtifact(`token=${secret}\n`);
    expect(guard().inspectBytes('artifact-content', contents).safe).toBe(true);
    expect(
      inspectExecutionArtifactContents(
        guard(),
        'artifact-content',
        EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE,
        contents
      )
    ).toEqual({
      safe: false,
      surface: 'artifact-content',
      reason: 'secret-canary',
    });
  });

  it('detects a protected value that a build bundle stores base64-encoded', () => {
    const contents = buildBundleArtifact(`const token = '${secret}';`);
    expect(guard().inspectBytes('artifact-content', contents).safe).toBe(true);
    expect(
      inspectExecutionArtifactContents(
        guard(),
        'artifact-content',
        EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
        contents
      ).safe
    ).toBe(false);
  });

  it('accepts encoded artifacts that carry no protected value', () => {
    expect(
      inspectExecutionArtifactContents(
        guard(),
        'artifact-content',
        EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE,
        filesystemDiffArtifact('token=public\n')
      ).safe
    ).toBe(true);
  });

  it('reports an undecodable encoded envelope as uninspectable instead of accepting it', () => {
    expect(
      inspectExecutionArtifactContents(
        guard(),
        'artifact-content',
        EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE,
        new TextEncoder().encode('{"format":"broken"}')
      )
    ).toEqual({
      safe: false,
      surface: 'artifact-content',
      reason: 'uninspectable',
    });
  });

  it('still scans raw bytes for media types that store their payload verbatim', () => {
    const report = new TextEncoder().encode(`{"stdout":"${secret}"}`);
    expect(
      inspectExecutionArtifactContents(
        guard(),
        'test-report',
        EXECUTION_TEST_REPORT_MEDIA_TYPE,
        report
      ).safe
    ).toBe(false);
  });
});
