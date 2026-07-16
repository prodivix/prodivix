import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decodeExecutionPreviewBundle,
  EXECUTION_PREVIEW_BUNDLE_FORMAT,
} from '../executionPreviewBundle';

const preview = (entryFilePath = 'index.html') => {
  const contents = Buffer.from('<main>ready</main>');
  return JSON.stringify({
    format: EXECUTION_PREVIEW_BUNDLE_FORMAT,
    entryFilePath,
    bundle: {
      format: 'prodivix.execution-build-bundle.v1',
      snapshotDigest: `sha256-${'a'.repeat(64)}`,
      target: {
        presetId: 'react-vite',
        framework: 'react',
        runtime: 'browser',
      },
      files: [
        {
          path: 'index.html',
          size: contents.byteLength,
          digest: `sha256-${createHash('sha256').update(contents).digest('hex')}`,
          encoding: 'base64',
          contents: contents.toString('base64'),
        },
      ],
    },
  });
};

describe('ExecutionPreviewBundle', () => {
  it('accepts a verified static bundle with an HTML entrypoint', () => {
    expect(decodeExecutionPreviewBundle(preview())).toMatchObject({
      format: EXECUTION_PREVIEW_BUNDLE_FORMAT,
      entryFilePath: 'index.html',
      files: [{ path: 'index.html' }],
    });
  });

  it('fails closed when the declared entrypoint is absent', () => {
    expect(() => decodeExecutionPreviewBundle(preview('missing.html'))).toThrow(
      'entrypoint is missing'
    );
  });
});
