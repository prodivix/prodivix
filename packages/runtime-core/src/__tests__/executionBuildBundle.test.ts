import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import {
  decodeExecutionBuildBundle,
  EXECUTION_BUILD_BUNDLE_FORMAT,
} from '../executionBuildBundle';

const file = (path: string, source: string) => {
  const contents = Buffer.from(source, 'utf8');
  return {
    path,
    size: contents.byteLength,
    digest: `sha256-${bytesToHex(sha256(contents))}`,
    encoding: 'base64',
    contents: contents.toString('base64'),
  };
};

const bundle = () => ({
  format: EXECUTION_BUILD_BUNDLE_FORMAT,
  snapshotDigest: `sha256-${'a'.repeat(64)}`,
  target: { presetId: 'react-vite', framework: 'react', runtime: 'vite' },
  files: [file('assets/app.js', 'export{}'), file('index.html', '<main/>')],
});

describe('ExecutionBuildBundle', () => {
  it('decodes verified, sorted build files', () => {
    const result = decodeExecutionBuildBundle(JSON.stringify(bundle()));
    expect(result.files.map(({ path }) => path)).toEqual([
      'assets/app.js',
      'index.html',
    ]);
    expect(new TextDecoder().decode(result.files[1]?.contents)).toBe('<main/>');
  });

  it('rejects path order, unknown fields, and digest drift', () => {
    const reversed = bundle();
    reversed.files.reverse();
    expect(() => decodeExecutionBuildBundle(JSON.stringify(reversed))).toThrow(
      /uniquely sorted/u
    );
    expect(() =>
      decodeExecutionBuildBundle(
        JSON.stringify({ ...bundle(), unexpected: true })
      )
    ).toThrow(/unsupported field/u);
    const drifted = bundle();
    drifted.files[0] = {
      ...drifted.files[0]!,
      digest: `sha256-${'0'.repeat(64)}`,
    };
    expect(() => decodeExecutionBuildBundle(JSON.stringify(drifted))).toThrow(
      /digest does not match/u
    );
  });
});
