import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  createExecutableProjectSnapshot,
  EXECUTABLE_PROJECT_SNAPSHOT_FORMAT,
  type ExecutableProjectSnapshot,
  type ExecutableProjectSnapshotInput,
} from '@prodivix/runtime-core';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';

export const digestCompilerBytes = (value: Uint8Array): string =>
  `sha256-${bytesToHex(sha256(value))}`;

export const compilerBytes = (value: string | Uint8Array): Uint8Array =>
  typeof value === 'string' ? utf8ToBytes(value) : new Uint8Array(value);

export const digestCompilerValue = (value: unknown): string =>
  digestCompilerBytes(utf8ToBytes(canonicalJsonText(value)));

export const executableProjectSnapshotInput = (
  snapshot: ExecutableProjectSnapshot,
  files = snapshot.files,
  entrypoints = snapshot.entrypoints
): ExecutableProjectSnapshotInput => ({
  workspace: snapshot.workspace,
  target: snapshot.target,
  files,
  dependencyPlan: {
    manifestFilePath: snapshot.dependencyPlan.manifestFilePath,
    ...(snapshot.dependencyPlan.lockFilePath === undefined
      ? {}
      : { lockFilePath: snapshot.dependencyPlan.lockFilePath }),
  },
  entrypoints,
  capabilityRequirements: snapshot.capabilityRequirements,
  publicBuildConfiguration: snapshot.publicBuildConfiguration,
  resourceHints: snapshot.resourceHints,
  cacheHints: snapshot.cacheHints,
  ...(snapshot.dataMockProvision === undefined
    ? {}
    : { dataMockProvision: snapshot.dataMockProvision }),
  ...(snapshot.serverRuntimeMockProvision === undefined
    ? {}
    : { serverRuntimeMockProvision: snapshot.serverRuntimeMockProvision }),
  ...(snapshot.serverFunctionPlan === undefined
    ? {}
    : { serverFunctionPlan: snapshot.serverFunctionPlan }),
  installCommand: snapshot.installCommand,
  previewCommand: snapshot.previewCommand,
  buildCommand: snapshot.buildCommand,
  previewPlan: snapshot.previewPlan,
  buildPlan: snapshot.buildPlan,
  testPlan: snapshot.testPlan,
});

export const canonicalExecutableProjectSnapshot = (
  snapshot: ExecutableProjectSnapshot,
  label: string
): ExecutableProjectSnapshot => {
  if (snapshot.format !== EXECUTABLE_PROJECT_SNAPSHOT_FORMAT) {
    throw new TypeError(`${label} must be an executable project snapshot.`);
  }
  const rebuilt = createExecutableProjectSnapshot(
    executableProjectSnapshotInput(snapshot)
  );
  if (
    rebuilt.contentDigest !== snapshot.contentDigest ||
    !sameCanonicalJson(rebuilt, snapshot)
  ) {
    throw new TypeError(`${label} content digest does not match its contents.`);
  }
  return rebuilt;
};

export const assertSameExecutableProjectSnapshot = (
  actual: ExecutableProjectSnapshot,
  expected: ExecutableProjectSnapshot,
  label: string
): void => {
  if (
    actual.contentDigest !== expected.contentDigest ||
    !sameCanonicalJson(actual, expected)
  ) {
    throw new TypeError(`${label} does not match the exact snapshot.`);
  }
};
