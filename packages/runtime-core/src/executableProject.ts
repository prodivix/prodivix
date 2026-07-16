import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type {
  ExecutionProviderCapability,
  ExecutionWorkspaceSnapshotRef,
} from './execution.types';
import {
  assertExecutableProjectExactKeys,
  cloneExecutableProjectSourceTrace,
  normalizeExecutableProjectCacheHints,
  normalizeExecutableProjectBuildPlan,
  normalizeExecutableProjectCapabilityRequirements,
  normalizeExecutableProjectCommands,
  normalizeExecutableProjectDataMockProvision,
  normalizeExecutableProjectEntrypoints,
  normalizeExecutableProjectPath,
  normalizeExecutableProjectPreviewPlan,
  normalizeExecutableProjectPublicBuildConfiguration,
  normalizeExecutableProjectResourceHints,
  normalizeExecutableProjectTarget,
  normalizeExecutableProjectTestPlan,
  normalizeExecutableProjectWorkspaceRef,
} from './executableProjectNormalization';
import {
  EXECUTABLE_PROJECT_DATA_MOCK_PROVISION_PATH,
  EXECUTABLE_PROJECT_LIMITS,
  EXECUTABLE_PROJECT_SNAPSHOT_FORMAT,
  type ExecutableProjectCacheHints,
  type ExecutableProjectBuildPlan,
  type ExecutableProjectCapabilityRequirements,
  type ExecutableProjectCommand,
  type ExecutableProjectDependencyPlan,
  type ExecutableProjectDataMockProvision,
  type ExecutableProjectEntrypoint,
  type ExecutableProjectEntrypointKind,
  type ExecutableProjectFile,
  type ExecutableProjectPublicBuildConfigurationEntry,
  type ExecutableProjectPreviewPlan,
  type ExecutableProjectResourceHints,
  type ExecutableProjectSnapshot,
  type ExecutableProjectSnapshotInput,
  type ExecutableProjectTarget,
  type ExecutableProjectTestPlan,
} from './executableProject.types';

export {
  DEFAULT_EXECUTABLE_PROJECT_BUILD_OUTPUT_DIRECTORY,
  DEFAULT_EXECUTABLE_PROJECT_PREVIEW_ENTRY_FILE,
  DEFAULT_EXECUTABLE_PROJECT_TEST_REPORT_PATH,
  EXECUTABLE_PROJECT_COMMANDS,
  EXECUTABLE_PROJECT_DATA_MOCK_PROVISION_PATH,
  EXECUTABLE_PROJECT_LIMITS,
  EXECUTABLE_PROJECT_SNAPSHOT_FORMAT,
} from './executableProject.types';
export type {
  ExecutableProjectBuildPlan,
  ExecutableProjectBuildPlanInput,
  ExecutableProjectCacheHints,
  ExecutableProjectCapabilityRequirements,
  ExecutableProjectCommand,
  ExecutableProjectCommandName,
  ExecutableProjectDependencyPlan,
  ExecutableProjectDependencyPlanInput,
  ExecutableProjectDataMockFixture,
  ExecutableProjectDataMockFixtureBehavior,
  ExecutableProjectDataMockCollection,
  ExecutableProjectDataMockPage,
  ExecutableProjectDataMockProvision,
  ExecutableProjectEntrypoint,
  ExecutableProjectEntrypointKind,
  ExecutableProjectFile,
  ExecutableProjectPublicBuildConfigurationEntry,
  ExecutableProjectPreviewPlan,
  ExecutableProjectPreviewPlanInput,
  ExecutableProjectResourceHints,
  ExecutableProjectSnapshot,
  ExecutableProjectSnapshotInput,
  ExecutableProjectTarget,
  ExecutableProjectTestPlan,
  ExecutableProjectTestPlanInput,
} from './executableProject.types';
export { normalizeExecutableProjectPath } from './executableProjectNormalization';

const fileByteLength = (contents: string | Uint8Array): number =>
  typeof contents === 'string'
    ? utf8ToBytes(contents).byteLength
    : contents.byteLength;

const normalizeFiles = (value: unknown): readonly ExecutableProjectFile[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('Executable project snapshots must contain files.');
  }
  if (value.length > EXECUTABLE_PROJECT_LIMITS.maxFiles) {
    throw new TypeError('Executable project snapshot contains too many files.');
  }
  const seenPaths = new Set<string>();
  let totalBytes = 0;
  const files = value.map((entry, index) => {
    const record = assertExecutableProjectExactKeys(
      entry,
      ['path', 'contents', 'sourceTrace'],
      `Executable project file ${index}`
    );
    const path = normalizeExecutableProjectPath(record.path);
    if (seenPaths.has(path)) {
      throw new TypeError(
        `Executable project contains a duplicate file: ${path}`
      );
    }
    seenPaths.add(path);
    const contents = record.contents;
    if (typeof contents !== 'string' && !(contents instanceof Uint8Array)) {
      throw new TypeError(
        `Executable project file ${path} has invalid contents.`
      );
    }
    const clonedContents =
      typeof contents === 'string' ? contents : new Uint8Array(contents);
    const bytes = fileByteLength(clonedContents);
    if (bytes > EXECUTABLE_PROJECT_LIMITS.maxFileBytes) {
      throw new TypeError(
        `Executable project file exceeds the size limit: ${path}`
      );
    }
    totalBytes += bytes;
    if (totalBytes > EXECUTABLE_PROJECT_LIMITS.maxTotalFileBytes) {
      throw new TypeError(
        'Executable project snapshot exceeds the total size limit.'
      );
    }
    const sourceTraceValue = record.sourceTrace;
    if (sourceTraceValue !== undefined && !Array.isArray(sourceTraceValue)) {
      throw new TypeError(
        `Executable project file ${path} sourceTrace must be an array.`
      );
    }
    if (
      sourceTraceValue &&
      sourceTraceValue.length > EXECUTABLE_PROJECT_LIMITS.maxSourceTracesPerFile
    ) {
      throw new TypeError(
        `Executable project file ${path} has too many source traces.`
      );
    }
    const sourceTrace = sourceTraceValue
      ? Object.freeze(
          sourceTraceValue.map((trace, traceIndex) =>
            cloneExecutableProjectSourceTrace(
              trace,
              `Executable project file ${path} sourceTrace ${traceIndex}`
            )
          )
        )
      : undefined;
    return Object.freeze({
      path,
      contents: clonedContents,
      ...(sourceTrace ? { sourceTrace } : {}),
    });
  });
  files.sort((left, right) => left.path.localeCompare(right.path));
  const paths = new Set(files.map((file) => file.path));
  files.forEach((file) => {
    const segments = file.path.split('/');
    for (let index = 1; index < segments.length; index += 1) {
      const parentPath = segments.slice(0, index).join('/');
      if (paths.has(parentPath)) {
        throw new TypeError(
          `Executable project path is both a file and a directory: ${parentPath}`
        );
      }
    }
  });
  return Object.freeze(files);
};

const canonicalJson = (value: unknown): string => JSON.stringify(value);

const createLengthPrefixedSha256 = (
  write: (writer: (value: string | Uint8Array) => void) => void
): string => {
  const hash = sha256.create();
  const writer = (value: string | Uint8Array): void => {
    const bytes = typeof value === 'string' ? utf8ToBytes(value) : value;
    hash.update(utf8ToBytes(`${bytes.length}:`));
    hash.update(bytes);
  };
  write(writer);
  return `sha256-${bytesToHex(hash.digest())}`;
};

const normalizeDependencyPlan = (
  value: unknown,
  files: readonly ExecutableProjectFile[],
  target: ExecutableProjectTarget,
  installCommand: ExecutableProjectCommand
): ExecutableProjectDependencyPlan => {
  const record = assertExecutableProjectExactKeys(
    value,
    ['manifestFilePath', 'lockFilePath'],
    'Executable project dependency plan'
  );
  const manifestFilePath = normalizeExecutableProjectPath(
    record.manifestFilePath
  );
  const lockFilePath =
    record.lockFilePath === undefined
      ? undefined
      : normalizeExecutableProjectPath(record.lockFilePath);
  if (manifestFilePath === lockFilePath) {
    throw new TypeError(
      'Dependency manifest and lock file must be different files.'
    );
  }
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const manifest = filesByPath.get(manifestFilePath);
  if (!manifest) {
    throw new TypeError(
      `Dependency manifest does not exist: ${manifestFilePath}`
    );
  }
  const lockFile = lockFilePath ? filesByPath.get(lockFilePath) : undefined;
  if (lockFilePath && !lockFile) {
    throw new TypeError(`Dependency lock file does not exist: ${lockFilePath}`);
  }
  const installFingerprint = createLengthPrefixedSha256((write) => {
    write(canonicalJson(target));
    write(canonicalJson(installCommand));
    write(manifestFilePath);
    write(manifest.contents);
    if (lockFilePath && lockFile) {
      write(lockFilePath);
      write(lockFile.contents);
    }
  });
  return Object.freeze({
    manifestFilePath,
    ...(lockFilePath ? { lockFilePath } : {}),
    installFingerprint,
  });
};

type ExecutableProjectDigestInput = Readonly<{
  workspace: ExecutionWorkspaceSnapshotRef;
  target: ExecutableProjectTarget;
  files: readonly ExecutableProjectFile[];
  dependencyPlan: ExecutableProjectDependencyPlan;
  entrypoints: readonly ExecutableProjectEntrypoint[];
  capabilityRequirements: ExecutableProjectCapabilityRequirements;
  publicBuildConfiguration: readonly ExecutableProjectPublicBuildConfigurationEntry[];
  resourceHints: ExecutableProjectResourceHints;
  cacheHints: ExecutableProjectCacheHints;
  dataMockProvision?: ExecutableProjectDataMockProvision;
  installCommand: ExecutableProjectCommand;
  previewCommand: ExecutableProjectCommand;
  buildCommand: ExecutableProjectCommand;
  previewPlan: ExecutableProjectPreviewPlan;
  buildPlan: ExecutableProjectBuildPlan;
  testPlan: ExecutableProjectTestPlan;
}>;

const createContentDigest = (input: ExecutableProjectDigestInput): string =>
  createLengthPrefixedSha256((write) => {
    write(EXECUTABLE_PROJECT_SNAPSHOT_FORMAT);
    write(canonicalJson(input.workspace));
    write(canonicalJson(input.target));
    write(canonicalJson(input.dependencyPlan));
    write(canonicalJson(input.entrypoints));
    write(canonicalJson(input.capabilityRequirements));
    write(canonicalJson(input.publicBuildConfiguration));
    write(canonicalJson(input.resourceHints));
    write(canonicalJson(input.cacheHints));
    write(canonicalJson(input.dataMockProvision ?? null));
    write(canonicalJson(input.installCommand));
    write(canonicalJson(input.previewCommand));
    write(canonicalJson(input.buildCommand));
    write(canonicalJson(input.previewPlan));
    write(canonicalJson(input.buildPlan));
    write(canonicalJson(input.testPlan));
    input.files.forEach((file) => {
      write(file.path);
      write(canonicalJson(file.sourceTrace ?? []));
      write(file.contents);
    });
  });

/** Creates the immutable execution input shared by Browser and Remote providers. */
export const createExecutableProjectSnapshot = (
  input: ExecutableProjectSnapshotInput
): ExecutableProjectSnapshot => {
  const record = assertExecutableProjectExactKeys(
    input,
    [
      'workspace',
      'target',
      'files',
      'dependencyPlan',
      'entrypoints',
      'capabilityRequirements',
      'publicBuildConfiguration',
      'resourceHints',
      'cacheHints',
      'dataMockProvision',
      'installCommand',
      'previewCommand',
      'buildCommand',
      'previewPlan',
      'buildPlan',
      'testPlan',
    ],
    'Executable project snapshot input'
  );
  const workspace = normalizeExecutableProjectWorkspaceRef(record.workspace);
  const target = normalizeExecutableProjectTarget(record.target);
  const files = normalizeFiles(record.files);
  const { installCommand, previewCommand, buildCommand } =
    normalizeExecutableProjectCommands(record);
  const dependencyPlan = normalizeDependencyPlan(
    record.dependencyPlan,
    files,
    target,
    installCommand
  );
  const entrypoints = normalizeExecutableProjectEntrypoints(
    record.entrypoints,
    files
  );
  const capabilityRequirements =
    normalizeExecutableProjectCapabilityRequirements(
      record.capabilityRequirements
    );
  const publicBuildConfiguration =
    normalizeExecutableProjectPublicBuildConfiguration(
      record.publicBuildConfiguration ?? []
    );
  const resourceHints = normalizeExecutableProjectResourceHints(
    record.resourceHints
  );
  const cacheHints = normalizeExecutableProjectCacheHints(record.cacheHints);
  const dataMockProvision = normalizeExecutableProjectDataMockProvision(
    record.dataMockProvision
  );
  const buildPlan = normalizeExecutableProjectBuildPlan(record.buildPlan);
  const previewPlan = normalizeExecutableProjectPreviewPlan(
    record.previewPlan,
    buildCommand,
    buildPlan
  );
  const testPlan = normalizeExecutableProjectTestPlan(record.testPlan);
  if (
    files.some(
      (file) =>
        file.path === buildPlan.outputDirectoryPath ||
        file.path.startsWith(`${buildPlan.outputDirectoryPath}/`)
    )
  ) {
    throw new TypeError(
      `Executable project build output directory conflicts with a project file: ${buildPlan.outputDirectoryPath}`
    );
  }
  if (
    files.some(
      (file) =>
        file.path === previewPlan.outputDirectoryPath ||
        file.path.startsWith(`${previewPlan.outputDirectoryPath}/`)
    )
  ) {
    throw new TypeError(
      `Executable project preview output directory conflicts with a project file: ${previewPlan.outputDirectoryPath}`
    );
  }
  if (files.some((file) => file.path === testPlan.reportFilePath)) {
    throw new TypeError(
      `Executable project test report path conflicts with a project file: ${testPlan.reportFilePath}`
    );
  }
  if (
    dataMockProvision &&
    files.some(
      (file) => file.path === EXECUTABLE_PROJECT_DATA_MOCK_PROVISION_PATH
    )
  )
    throw new TypeError(
      'Executable project Data mock provision path is reserved for runtime projection.'
    );
  const normalized = {
    workspace,
    target,
    files,
    dependencyPlan,
    entrypoints,
    capabilityRequirements,
    publicBuildConfiguration,
    resourceHints,
    cacheHints,
    ...(dataMockProvision ? { dataMockProvision } : {}),
    installCommand,
    previewCommand,
    buildCommand,
    previewPlan,
    buildPlan,
    testPlan,
  };
  return Object.freeze({
    format: EXECUTABLE_PROJECT_SNAPSHOT_FORMAT,
    ...normalized,
    contentDigest: createContentDigest(normalized),
  });
};

/** Projects non-authoring runtime assets from the immutable snapshot for every provider filesystem. */
export const projectExecutableProjectRuntimeFiles = (
  snapshot: ExecutableProjectSnapshot,
  operation?: ExecutableProjectEntrypointKind
): readonly ExecutableProjectFile[] =>
  Object.freeze([
    ...snapshot.files,
    ...(snapshot.dataMockProvision && operation !== 'build'
      ? [
          Object.freeze({
            path: EXECUTABLE_PROJECT_DATA_MOCK_PROVISION_PATH,
            contents: `${JSON.stringify(snapshot.dataMockProvision)}\n`,
          }),
        ]
      : []),
  ]);

/** Fails closed when an execution adapter cannot satisfy the selected project plan. */
export const assertExecutableProjectCapabilitySupport = (
  snapshot: ExecutableProjectSnapshot,
  operation: ExecutableProjectEntrypointKind,
  providedCapabilities: readonly ExecutionProviderCapability[]
): void => {
  const provided = new Set(providedCapabilities);
  const missing = snapshot.capabilityRequirements[operation].filter(
    (capability) => !provided.has(capability)
  );
  if (missing.length) {
    throw new TypeError(
      `Executable project ${operation} requires unsupported capabilities: ${missing.join(', ')}.`
    );
  }
};
