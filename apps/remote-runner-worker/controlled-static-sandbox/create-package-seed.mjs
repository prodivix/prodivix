import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

import { createControlledStaticRootlessPackageImport } from './controlledStaticRootlessPackageImport.mjs';

const PACKAGE_SEED_FORMAT =
  'prodivix.controlled-static-rootless-package-seed.v1';
const PACKAGE_IMPORT_SOURCE =
  '/workspace/.prodivix/controlled-output/results/package-import.json.gz';
const PRESET_IDS = Object.freeze(['react-vite', 'vue-vite']);

const sha256 = (contents) =>
  `sha256-${createHash('sha256').update(contents).digest('hex')}`;

const presetId = process.argv[2];
if (
  process.argv.length !== 3 ||
  typeof presetId !== 'string' ||
  !PRESET_IDS.includes(presetId)
) {
  throw new TypeError('Controlled package seed preset is invalid.');
}

const packageImport = await createControlledStaticRootlessPackageImport();
const outputRoot = `/opt/prodivix/package-seeds/${presetId}`;
await mkdir(outputRoot, { recursive: false, mode: 0o755 });
await rename(PACKAGE_IMPORT_SOURCE, `${outputRoot}/package-import.json.gz`);

const authority = {
  format: PACKAGE_SEED_FORMAT,
  lockDigest: sha256(await readFile('/workspace/pnpm-lock.yaml')),
  packageImport: {
    byteLength: packageImport.size,
    contentDigest: packageImport.contentDigest,
    digest: packageImport.digest,
    entryCount: packageImport.entryCount,
    fileSetDigest: packageImport.fileSetDigest,
    manifestDigest: packageImport.manifestDigest,
    maximumDepth: packageImport.maximumDepth,
    totalFileBytes: packageImport.totalFileBytes,
  },
  presetId,
};
await writeFile(
  `${outputRoot}/authority.json`,
  Buffer.from(JSON.stringify(authority), 'utf8'),
  { flag: 'wx', mode: 0o644 }
);
