import { createHash } from 'node:crypto';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';

export const CONTROLLED_STATIC_ROOTLESS_REQUEST_FORMAT =
  'prodivix.controlled-static-rootless-sandbox-request.v1';
export const CONTROLLED_STATIC_ROOTLESS_RESULT_FORMAT =
  'prodivix.controlled-static-toolchain-sandbox-result.v1';
export const CONTROLLED_STATIC_ROOTLESS_MAXIMUM_INPUT_BYTES = 384 * 1024 * 1024;
export const CONTROLLED_STATIC_ROOTLESS_MAXIMUM_OUTPUT_BYTES =
  384 * 1024 * 1024;
export const CONTROLLED_STATIC_ROOTLESS_MAXIMUM_FILES = 20_000;
export const CONTROLLED_STATIC_ROOTLESS_DIGEST_PATTERN =
  /^sha256-[a-f0-9]{64}$/u;

export type ControlledStaticRootlessEncodedFile = Readonly<{
  path: string;
  size: number;
  digest: string;
  encoding: 'base64';
  contents: string;
}>;

export type ControlledStaticRootlessRequest = Readonly<{
  format: typeof CONTROLLED_STATIC_ROOTLESS_REQUEST_FORMAT;
  requestDigest: string;
  snapshotDigest: string;
  workspace: unknown;
  target: unknown;
  files: readonly ControlledStaticRootlessEncodedFile[];
  toolchain: Readonly<{
    pnpmVersion: string;
    typescriptVersion: string;
    vitestVersion: string;
    viteVersion: string;
    rollupVersion: '4.62.3';
    rollupImplementation: '@rollup/wasm-node';
    rollupAliasSpec: 'npm:@rollup/wasm-node@4.62.3';
    esbuildVersion: '0.27.7';
    esbuildImplementation: 'esbuild-wasm';
    esbuildAliasSpec: 'npm:esbuild-wasm@0.27.7';
    manifestDigest: string;
    lockDigest: string;
    toolchainFileSetDigest: string;
    isolationProbeDigest: string;
  }>;
  testReportFilePath: string;
  coverageSummaryFilePath: string;
  buildOutputDirectoryPath: string;
}>;

export const controlledStaticRootlessDigestBytes = (
  contents: Uint8Array | string
): string => `sha256-${createHash('sha256').update(contents).digest('hex')}`;

export const controlledStaticRootlessExactRecord = (
  value: unknown,
  required: readonly string[],
  label: string
): Record<string, unknown> => {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const keys = Object.keys(value);
  if (
    required.some((key) => !keys.includes(key)) ||
    keys.some((key) => isUnsafeObjectKey(key) || !required.includes(key))
  ) {
    throw new TypeError(`${label} fields drifted.`);
  }
  return value;
};

export const controlledStaticRootlessRelativePath = (
  value: unknown,
  label: string
): string => {
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.trim() ||
    value !== value.normalize('NFC') ||
    value.includes('\\') ||
    value.startsWith('/') ||
    value
      .split('/')
      .some(
        (segment) =>
          !segment ||
          segment === '.' ||
          segment === '..' ||
          segment.includes(':')
      )
  ) {
    throw new TypeError(`${label} must be a canonical relative path.`);
  }
  return value;
};

export const decodeControlledStaticRootlessCanonicalBase64 = (
  value: unknown,
  label: string
): Uint8Array => {
  if (
    typeof value !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value
    )
  ) {
    throw new TypeError(`${label} must be canonical base64.`);
  }
  return new Uint8Array(Buffer.from(value, 'base64'));
};

const exactVersion = (value: unknown, label: string): string => {
  if (
    typeof value !== 'string' ||
    !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(value)
  ) {
    throw new TypeError(`${label} must be an exact version.`);
  }
  return value;
};

export const decodeControlledStaticRootlessRequest = (
  source: Uint8Array
): ControlledStaticRootlessRequest => {
  if (
    !source.byteLength ||
    source.byteLength > CONTROLLED_STATIC_ROOTLESS_MAXIMUM_INPUT_BYTES
  ) {
    throw new TypeError('Rootless sandbox request exceeds its budget.');
  }
  let value: unknown;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(source);
    value = JSON.parse(text) as unknown;
  } catch {
    throw new TypeError('Rootless sandbox request must be strict JSON.');
  }
  if (canonicalJsonText(value) !== text) {
    throw new TypeError('Rootless sandbox request must be canonical JSON.');
  }
  const record = controlledStaticRootlessExactRecord(
    value,
    [
      'format',
      'requestDigest',
      'snapshotDigest',
      'workspace',
      'target',
      'files',
      'toolchain',
      'testReportFilePath',
      'coverageSummaryFilePath',
      'buildOutputDirectoryPath',
    ],
    'Rootless sandbox request'
  );
  const toolchain = controlledStaticRootlessExactRecord(
    record.toolchain,
    [
      'pnpmVersion',
      'typescriptVersion',
      'vitestVersion',
      'viteVersion',
      'rollupVersion',
      'rollupImplementation',
      'rollupAliasSpec',
      'esbuildVersion',
      'esbuildImplementation',
      'esbuildAliasSpec',
      'manifestDigest',
      'lockDigest',
      'toolchainFileSetDigest',
      'isolationProbeDigest',
    ],
    'Rootless sandbox toolchain'
  );
  if (
    record.format !== CONTROLLED_STATIC_ROOTLESS_REQUEST_FORMAT ||
    typeof record.requestDigest !== 'string' ||
    !CONTROLLED_STATIC_ROOTLESS_DIGEST_PATTERN.test(record.requestDigest) ||
    typeof record.snapshotDigest !== 'string' ||
    !CONTROLLED_STATIC_ROOTLESS_DIGEST_PATTERN.test(record.snapshotDigest) ||
    !Array.isArray(record.files) ||
    !record.files.length ||
    record.files.length > CONTROLLED_STATIC_ROOTLESS_MAXIMUM_FILES
  ) {
    throw new TypeError('Rootless sandbox request identity is invalid.');
  }
  const files = record.files.map(
    (entry, index): ControlledStaticRootlessEncodedFile => {
      const file = controlledStaticRootlessExactRecord(
        entry,
        ['path', 'size', 'digest', 'encoding', 'contents'],
        `Rootless sandbox file ${index}`
      );
      const contents = decodeControlledStaticRootlessCanonicalBase64(
        file.contents,
        `Rootless sandbox file ${index} contents`
      );
      if (
        file.encoding !== 'base64' ||
        !Number.isSafeInteger(file.size) ||
        (file.size as number) < 0 ||
        contents.byteLength !== file.size ||
        typeof file.digest !== 'string' ||
        file.digest !== controlledStaticRootlessDigestBytes(contents)
      ) {
        throw new TypeError(`Rootless sandbox file ${index} drifted.`);
      }
      return Object.freeze({
        path: controlledStaticRootlessRelativePath(
          file.path,
          `Rootless sandbox file ${index} path`
        ),
        size: file.size as number,
        digest: file.digest,
        encoding: 'base64',
        contents: file.contents as string,
      });
    }
  );
  if (new Set(files.map(({ path }) => path)).size !== files.length) {
    throw new TypeError('Rootless sandbox file paths are duplicated.');
  }
  const digestField = (key: string): string => {
    const digest = toolchain[key];
    if (
      typeof digest !== 'string' ||
      !CONTROLLED_STATIC_ROOTLESS_DIGEST_PATTERN.test(digest)
    ) {
      throw new TypeError(`Rootless sandbox ${key} is invalid.`);
    }
    return digest;
  };
  const pnpmVersion = exactVersion(
    toolchain.pnpmVersion,
    'Rootless sandbox pnpm version'
  );
  if (pnpmVersion !== '11.9.0') {
    throw new TypeError('Rootless sandbox pnpm authority drifted.');
  }
  const rollupVersion = exactVersion(
    toolchain.rollupVersion,
    'Rootless sandbox Rollup version'
  );
  if (
    rollupVersion !== '4.62.3' ||
    toolchain.rollupImplementation !== '@rollup/wasm-node' ||
    toolchain.rollupAliasSpec !== 'npm:@rollup/wasm-node@4.62.3'
  ) {
    throw new TypeError('Rootless sandbox Rollup authority drifted.');
  }
  const esbuildVersion = exactVersion(
    toolchain.esbuildVersion,
    'Rootless sandbox esbuild version'
  );
  if (
    esbuildVersion !== '0.27.7' ||
    toolchain.esbuildImplementation !== 'esbuild-wasm' ||
    toolchain.esbuildAliasSpec !== 'npm:esbuild-wasm@0.27.7'
  ) {
    throw new TypeError('Rootless sandbox esbuild authority drifted.');
  }
  return Object.freeze({
    format: CONTROLLED_STATIC_ROOTLESS_REQUEST_FORMAT,
    requestDigest: record.requestDigest,
    snapshotDigest: record.snapshotDigest,
    workspace: record.workspace,
    target: record.target,
    files: Object.freeze(files),
    toolchain: Object.freeze({
      pnpmVersion,
      typescriptVersion: exactVersion(
        toolchain.typescriptVersion,
        'Rootless sandbox TypeScript version'
      ),
      vitestVersion: exactVersion(
        toolchain.vitestVersion,
        'Rootless sandbox Vitest version'
      ),
      viteVersion: exactVersion(
        toolchain.viteVersion,
        'Rootless sandbox Vite version'
      ),
      rollupVersion: '4.62.3',
      rollupImplementation: '@rollup/wasm-node',
      rollupAliasSpec: 'npm:@rollup/wasm-node@4.62.3',
      esbuildVersion: '0.27.7',
      esbuildImplementation: 'esbuild-wasm',
      esbuildAliasSpec: 'npm:esbuild-wasm@0.27.7',
      manifestDigest: digestField('manifestDigest'),
      lockDigest: digestField('lockDigest'),
      toolchainFileSetDigest: digestField('toolchainFileSetDigest'),
      isolationProbeDigest: digestField('isolationProbeDigest'),
    }),
    testReportFilePath: controlledStaticRootlessRelativePath(
      record.testReportFilePath,
      'Rootless sandbox Test report path'
    ),
    coverageSummaryFilePath: controlledStaticRootlessRelativePath(
      record.coverageSummaryFilePath,
      'Rootless sandbox Coverage summary path'
    ),
    buildOutputDirectoryPath: controlledStaticRootlessRelativePath(
      record.buildOutputDirectoryPath,
      'Rootless sandbox build output path'
    ),
  });
};

export const readControlledStaticRootlessStdin =
  async (): Promise<Uint8Array> => {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.byteLength;
      if (size > CONTROLLED_STATIC_ROOTLESS_MAXIMUM_INPUT_BYTES) {
        throw new TypeError('Rootless sandbox request exceeds its budget.');
      }
      chunks.push(bytes);
    }
    return new Uint8Array(Buffer.concat(chunks));
  };
