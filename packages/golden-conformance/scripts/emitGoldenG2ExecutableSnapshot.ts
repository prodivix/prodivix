import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  decodeRemoteExecutableProjectSnapshot,
  encodeRemoteExecutableProjectSnapshot,
} from '@prodivix/runtime-remote';
import { createGoldenG2ExecutableSnapshot } from '../src/goldenG2ExecutionFixture';

const outputPath = process.env.PRODIVIX_GOLDEN_SNAPSHOT_PATH?.trim();
if (!outputPath)
  throw new TypeError('PRODIVIX_GOLDEN_SNAPSHOT_PATH is required.');

const snapshot = createGoldenG2ExecutableSnapshot();
const wire = encodeRemoteExecutableProjectSnapshot(snapshot);
const decoded = decodeRemoteExecutableProjectSnapshot(wire);
if (decoded.contentDigest !== snapshot.contentDigest)
  throw new Error('Golden Remote snapshot wire round-trip changed its digest.');

await writeFile(resolve(outputPath), `${JSON.stringify(wire)}\n`, {
  encoding: 'utf8',
  flag: 'wx',
});
process.stdout.write(`${snapshot.contentDigest}\n`);
