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

  it('uses locale-independent Unicode code-point order', () => {
    const wire = bundle();
    wire.files = [
      file('assets/\uE000.js', 'export const bmp = true'),
      file('assets/\u{10000}.js', 'export const astral = true'),
    ];
    const original = String.prototype.localeCompare;
    Object.defineProperty(String.prototype, 'localeCompare', {
      configurable: true,
      value: () => {
        throw new Error('canonical decoding must not consult the host locale');
      },
    });

    try {
      const result = decodeExecutionBuildBundle(JSON.stringify(wire));
      expect(result.files.map(({ path }) => path)).toEqual([
        'assets/\uE000.js',
        'assets/\u{10000}.js',
      ]);
    } finally {
      Object.defineProperty(String.prototype, 'localeCompare', {
        configurable: true,
        value: original,
      });
    }
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

  it('decodes a file above the Node 22 base64-regexp stack threshold', () => {
    const contents = Buffer.alloc(6 * 1024 * 1024);
    const wire = bundle();
    wire.files = [
      {
        path: 'assets/large.bin',
        size: contents.byteLength,
        digest: `sha256-${bytesToHex(sha256(contents))}`,
        encoding: 'base64',
        contents: contents.toString('base64'),
      },
    ];

    const result = decodeExecutionBuildBundle(JSON.stringify(wire));

    expect(result.files[0]?.contents.byteLength).toBe(contents.byteLength);
    expect(result.files[0]?.contents.at(-1)).toBe(0);
  });
});
