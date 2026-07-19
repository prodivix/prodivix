import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  decodeRemoteExecutableProjectSnapshot,
  encodeRemoteExecutableProjectSnapshot,
} from '@prodivix/runtime-remote';
import { normalizeServerRuntimeTestProvision } from '@prodivix/server-runtime';
import { createGoldenG2VueCatalogTestSnapshot } from '../src/goldenG2VueCatalogFixture';

const outputPath = process.env.PRODIVIX_GOLDEN_CATALOG_SNAPSHOT_PATH?.trim();
if (!outputPath) {
  throw new TypeError('PRODIVIX_GOLDEN_CATALOG_SNAPSHOT_PATH is required.');
}

const snapshot = createGoldenG2VueCatalogTestSnapshot();
const wire = encodeRemoteExecutableProjectSnapshot(snapshot);
const decoded = decodeRemoteExecutableProjectSnapshot(wire);
const serverProvision = normalizeServerRuntimeTestProvision(
  decoded.serverRuntimeMockProvision
);
if (
  decoded.contentDigest !== snapshot.contentDigest ||
  decoded.target.presetId !== 'vue-vite' ||
  decoded.dataMockProvision?.fixtureSetId !== 'golden-g2-vue-catalog-crud' ||
  serverProvision.fixtureSetId !== 'golden-g2-vue-catalog-authenticated'
) {
  throw new Error(
    'Golden Vue Catalog Remote snapshot wire round-trip changed its identity.'
  );
}

await writeFile(resolve(outputPath), `${JSON.stringify(wire)}\n`, {
  encoding: 'utf8',
  flag: 'wx',
});
process.stdout.write(`${snapshot.contentDigest}\n`);
