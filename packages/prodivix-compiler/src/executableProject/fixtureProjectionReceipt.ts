import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  digestBehaviorControlProfile,
  digestBehaviorFixtureSet,
  digestBehaviorValue,
  validateBehaviorDocument,
  type BehaviorControlProfile,
  type BehaviorFixture,
  type BehaviorFixtureSet,
} from '@prodivix/behavior';
import {
  createExecutableProjectSnapshot,
  EXECUTABLE_PROJECT_LIMITS,
  EXECUTABLE_PROJECT_SERVER_RUNTIME_MOCK_PROVISION_PATH,
  EXECUTABLE_PROJECT_SNAPSHOT_FORMAT,
  EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_VERSION,
  EXECUTION_BUILD_BUNDLE_FORMAT,
  normalizeExecutableProjectPath,
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectFile,
  type ExecutableProjectSnapshot,
  type ExecutableProjectSnapshotInput,
  type ExecutableProjectTarget,
  type ExecutionBuildBundle,
  type ExecutionBuildBundleFile,
} from '@prodivix/runtime-core';
import {
  normalizeServerRuntimeTestProvision,
  type ServerRuntimeTestProvision,
} from '@prodivix/server-runtime';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';

export const COMPILER_FIXTURE_PROJECTION_FILE_FORMAT =
  'prodivix.compiler-fixture-projection-file.v1' as const;
export const COMPILER_FIXTURE_PROJECTION_RECEIPT_FORMAT =
  'prodivix.compiler-fixture-projection-receipt.v1' as const;
export const COMPILER_FIXTURE_PROJECTION_SOURCE_PATH =
  'public/.prodivix/fixture-projection-receipt.json' as const;
export const COMPILER_FIXTURE_PROJECTION_BUILD_PATH =
  '.prodivix/fixture-projection-receipt.json' as const;
export const COMPILER_AUTH_SESSION_RUNTIME_CLIENT_SOURCE_PATH =
  'src/prodivix-server-runtime.ts' as const;

const COMPILER_OWNER = '@prodivix/prodivix-compiler' as const;
const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;

export type CompilerFixtureProjectionFileBinding = Readonly<{
  path: string;
  size: number;
  digest: string;
}>;

export type CompilerGeneratedFixtureProjectionFileBinding =
  CompilerFixtureProjectionFileBinding &
    Readonly<{
      sourceTraceDigest: string;
    }>;

export type CompilerAuthSessionProjection = Readonly<{
  provisionDigest: string;
  providerId: string;
  outcome: Readonly<{
    kind: 'result';
    value: Readonly<{
      principalId: string;
      permissionIds: readonly string[];
    }>;
  }>;
}>;

export type CompilerFixtureProjectionBinding = Readonly<{
  fixtureSetId: string;
  fixtureSetDigest: string;
  fixtureId: string;
  targetKind: BehaviorFixture['target']['kind'];
  resourceId: string;
  inputDigest: string;
  attempt?: number;
  page?: string;
  outcomeDigest: string;
  serverRuntimeProjection?: CompilerAuthSessionProjection;
  projectionDigest: string;
}>;

export type CompilerAuthSessionTransportProjection = Readonly<{
  method: 'GET';
  endpointPath: typeof EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH;
  responseMediaType: typeof EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE;
  responseFormat: typeof EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT;
  responseVersion: typeof EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_VERSION;
  fixtureSetId: string;
  fixtureSetDigest: string;
  fixtureId: string;
  resourceId: string;
  inputDigest: string;
  outcomeDigest: string;
  projectionDigest: string;
  providerId: string;
  principalId: string;
  permissionIds: readonly string[];
  responseBindingDigest: string;
}>;

export type CompilerAuthSessionTransportBinding =
  CompilerAuthSessionTransportProjection &
    Readonly<{
      generatedClientFile: CompilerGeneratedFixtureProjectionFileBinding;
    }>;

export type CompilerFixtureProjectionReceipt = Readonly<{
  format: typeof COMPILER_FIXTURE_PROJECTION_RECEIPT_FORMAT;
  owner: typeof COMPILER_OWNER;
  snapshotDigest: string;
  target: ExecutableProjectTarget;
  controlProfile: Readonly<{
    id: string;
    digest: string;
  }>;
  fixtureSets: readonly Readonly<{ id: string; digest: string }>[];
  fixtureBindings: readonly CompilerFixtureProjectionBinding[];
  authSessionTransport: CompilerAuthSessionTransportBinding | null;
  network: Readonly<{
    mode: 'fixture-only';
    undeclaredRequest: 'reject';
    fixtureIds: readonly string[];
    projectionDigest: string;
  }>;
  storage: Readonly<{
    bootstrapFixtureIds: readonly string[];
    projectionDigest: string;
  }>;
  serverRuntime: Readonly<{
    provisionDigest: string;
    fixtureSetId: string;
    providerId?: string;
    principalId?: string;
    allowedPermissionIds: readonly string[];
    generatedProvisionFile: CompilerFixtureProjectionFileBinding;
  }> | null;
  projectionFile: Readonly<{
    sourcePath: typeof COMPILER_FIXTURE_PROJECTION_SOURCE_PATH;
    buildPath: typeof COMPILER_FIXTURE_PROJECTION_BUILD_PATH;
    size: number;
    digest: string;
  }>;
  generatedFiles: Readonly<{
    manifestDigest: string;
    files: readonly CompilerGeneratedFixtureProjectionFileBinding[];
  }>;
  buildBundle: Readonly<{
    bundleDigest: string;
    files: readonly CompilerFixtureProjectionFileBinding[];
  }>;
  receiptDigest: string;
}>;

export type CreateCompilerFixtureProjectionSnapshotInput = Readonly<{
  snapshot: ExecutableProjectSnapshot;
  fixtureSets: readonly BehaviorFixtureSet[];
  controlProfile: BehaviorControlProfile;
}>;

export type IssueCompilerFixtureProjectionReceiptInput =
  CreateCompilerFixtureProjectionSnapshotInput &
    Readonly<{
      generatedFiles: readonly ExecutableProjectFile[];
      buildBundle: ExecutionBuildBundle;
    }>;

type ProjectionDocument = Readonly<{
  format: typeof COMPILER_FIXTURE_PROJECTION_FILE_FORMAT;
  owner: typeof COMPILER_OWNER;
  workspace: ExecutableProjectSnapshot['workspace'];
  target: ExecutableProjectTarget;
  controlProfile: Readonly<{
    id: string;
    digest: string;
  }>;
  fixtureSets: readonly Readonly<{ id: string; digest: string }>[];
  fixtureBindings: readonly CompilerFixtureProjectionBinding[];
  authSessionTransport: CompilerAuthSessionTransportProjection | null;
  network: CompilerFixtureProjectionReceipt['network'];
  storage: CompilerFixtureProjectionReceipt['storage'];
  serverRuntime: CompilerFixtureProjectionReceipt['serverRuntime'];
}>;

type ProjectionState = Readonly<{
  document: ProjectionDocument;
  text: string;
}>;

const digestBytes = (value: Uint8Array): string =>
  `sha256-${bytesToHex(sha256(value))}`;

const toBytes = (value: string | Uint8Array): Uint8Array =>
  typeof value === 'string' ? utf8ToBytes(value) : new Uint8Array(value);

const fileBinding = (
  path: string,
  contents: string | Uint8Array
): CompilerFixtureProjectionFileBinding => {
  const bytes = toBytes(contents);
  return Object.freeze({
    path,
    size: bytes.byteLength,
    digest: digestBytes(bytes),
  });
};

const generatedFileBinding = (
  file: ExecutableProjectFile
): CompilerGeneratedFixtureProjectionFileBinding =>
  Object.freeze({
    ...fileBinding(file.path, file.contents),
    sourceTraceDigest: digestBehaviorValue(file.sourceTrace ?? []),
  });

const bytesEqual = (
  left: string | Uint8Array,
  right: string | Uint8Array
): boolean => {
  const leftBytes = toBytes(left);
  const rightBytes = toBytes(right);
  return (
    leftBytes.byteLength === rightBytes.byteLength &&
    leftBytes.every((value, index) => value === rightBytes[index])
  );
};

const snapshotInput = (
  snapshot: ExecutableProjectSnapshot,
  files = snapshot.files
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
  entrypoints: snapshot.entrypoints,
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

const canonicalSnapshot = (
  snapshot: ExecutableProjectSnapshot
): ExecutableProjectSnapshot => {
  if (snapshot.format !== EXECUTABLE_PROJECT_SNAPSHOT_FORMAT) {
    throw new TypeError('Fixture projection requires an executable snapshot.');
  }
  const rebuilt = createExecutableProjectSnapshot(snapshotInput(snapshot));
  if (rebuilt.contentDigest !== snapshot.contentDigest) {
    throw new TypeError(
      'Fixture projection snapshot content digest does not match its contents.'
    );
  }
  return rebuilt;
};

const canonicalFixtureSets = (
  fixtureSets: readonly BehaviorFixtureSet[]
): readonly BehaviorFixtureSet[] => {
  if (!Array.isArray(fixtureSets) || fixtureSets.length === 0) {
    throw new TypeError(
      'Fixture projection requires at least one fixture set.'
    );
  }
  const normalized = fixtureSets.map((fixtureSet, index) => {
    const validation = validateBehaviorDocument(
      'behavior-fixture-set',
      fixtureSet
    );
    if (!validation.ok) {
      throw new TypeError(
        `Fixture projection fixture set ${index} is invalid: ${validation.issues
          .map((issue) => issue.message)
          .join('; ')}`
      );
    }
    return validation.value;
  });
  normalized.sort((left, right) => compareUnicodeCodePoints(left.id, right.id));
  if (new Set(normalized.map(({ id }) => id)).size !== normalized.length) {
    throw new TypeError('Fixture projection fixture set ids must be unique.');
  }
  return Object.freeze(normalized);
};

const canonicalControlProfile = (
  profile: BehaviorControlProfile
): BehaviorControlProfile => {
  const validation = validateBehaviorDocument(
    'behavior-control-profile',
    profile
  );
  if (!validation.ok) {
    throw new TypeError(
      `Fixture projection control profile is invalid: ${validation.issues
        .map((issue) => issue.message)
        .join('; ')}`
    );
  }
  if (
    validation.value.network.mode !== 'fixture-only' ||
    validation.value.network.undeclaredRequest !== 'reject'
  ) {
    throw new TypeError(
      'Fixture projection requires fixture-only network with undeclared requests rejected.'
    );
  }
  return validation.value;
};

const normalizedServerProvision = (
  snapshot: ExecutableProjectSnapshot
): ServerRuntimeTestProvision | undefined =>
  snapshot.serverRuntimeMockProvision === undefined
    ? undefined
    : normalizeServerRuntimeTestProvision(snapshot.serverRuntimeMockProvision);

const exactAuthSessionOutcome = (
  fixture: BehaviorFixture,
  provision: ServerRuntimeTestProvision | undefined,
  provisionDigest: string | undefined
): CompilerAuthSessionProjection => {
  if (!provision || !provisionDigest || !provision.principal) {
    throw new TypeError(
      `Auth-session fixture ${fixture.id} requires a Server Runtime test principal.`
    );
  }
  if (fixture.target.resourceId !== provision.principal.providerId) {
    throw new TypeError(
      `Auth-session fixture ${fixture.id} resourceId does not match the Server Runtime provider.`
    );
  }
  if (
    fixture.outcome.kind !== 'result' ||
    !isPlainObject(fixture.outcome.value) ||
    Object.keys(fixture.outcome.value).length !== 2 ||
    !Object.hasOwn(fixture.outcome.value, 'principalId') ||
    !Object.hasOwn(fixture.outcome.value, 'permissionIds')
  ) {
    throw new TypeError(
      `Auth-session fixture ${fixture.id} must project the exact principalId and permissionIds result.`
    );
  }
  const principalId = fixture.outcome.value.principalId;
  const permissionIds = fixture.outcome.value.permissionIds;
  if (
    typeof principalId !== 'string' ||
    !Array.isArray(permissionIds) ||
    permissionIds.some((permissionId) => typeof permissionId !== 'string') ||
    new Set(permissionIds).size !== permissionIds.length
  ) {
    throw new TypeError(
      `Auth-session fixture ${fixture.id} result identity is invalid.`
    );
  }
  const allowedPermissionIds = provision.permissions
    .filter(({ allowed }) => allowed)
    .map(({ permissionId }) => permissionId);
  if (
    principalId !== provision.principal.principalId ||
    permissionIds.length !== allowedPermissionIds.length ||
    permissionIds.some(
      (permissionId, index) => permissionId !== allowedPermissionIds[index]
    )
  ) {
    throw new TypeError(
      `Auth-session fixture ${fixture.id} result does not match the Server Runtime principal and allowed permissions.`
    );
  }
  return Object.freeze({
    provisionDigest,
    providerId: provision.principal.providerId,
    outcome: Object.freeze({
      kind: 'result' as const,
      value: Object.freeze({
        principalId,
        permissionIds: Object.freeze([...permissionIds]),
      }),
    }),
  });
};

const createProjectionState = (
  snapshot: ExecutableProjectSnapshot,
  fixtureSetsInput: readonly BehaviorFixtureSet[],
  controlProfileInput: BehaviorControlProfile
): ProjectionState => {
  const fixtureSets = canonicalFixtureSets(fixtureSetsInput);
  const controlProfile = canonicalControlProfile(controlProfileInput);
  const fixtureSetBindings = Object.freeze(
    fixtureSets.map((fixtureSet) =>
      Object.freeze({
        id: fixtureSet.id,
        digest: digestBehaviorFixtureSet(fixtureSet),
      })
    )
  );
  const serverProvision = normalizedServerProvision(snapshot);
  const serverProvisionDigest =
    serverProvision === undefined
      ? undefined
      : digestBehaviorValue(serverProvision);
  const seenFixtureIds = new Set<string>();
  const fixtureBindings: CompilerFixtureProjectionBinding[] = [];
  fixtureSets.forEach((fixtureSet, fixtureSetIndex) => {
    const fixtureSetDigest = fixtureSetBindings[fixtureSetIndex]!.digest;
    fixtureSet.fixtures.forEach((fixture) => {
      if (seenFixtureIds.has(fixture.id)) {
        throw new TypeError(
          `Fixture projection fixture id is not globally unique: ${fixture.id}.`
        );
      }
      seenFixtureIds.add(fixture.id);
      const outcomeDigest = digestBehaviorValue(fixture.outcome);
      const serverRuntimeProjection =
        fixture.target.kind === 'auth-session'
          ? exactAuthSessionOutcome(
              fixture,
              serverProvision,
              serverProvisionDigest
            )
          : undefined;
      const withoutDigest = Object.freeze({
        fixtureSetId: fixtureSet.id,
        fixtureSetDigest,
        fixtureId: fixture.id,
        targetKind: fixture.target.kind,
        resourceId: fixture.target.resourceId,
        inputDigest: fixture.inputDigest,
        ...(fixture.attempt === undefined ? {} : { attempt: fixture.attempt }),
        ...(fixture.page === undefined ? {} : { page: fixture.page }),
        outcomeDigest,
        ...(serverRuntimeProjection === undefined
          ? {}
          : { serverRuntimeProjection }),
      });
      fixtureBindings.push(
        Object.freeze({
          ...withoutDigest,
          projectionDigest: digestBehaviorValue(withoutDigest),
        })
      );
    });
  });
  fixtureBindings.sort((left, right) =>
    compareUnicodeCodePoints(left.fixtureId, right.fixtureId)
  );
  const frozenFixtureBindings = Object.freeze(fixtureBindings);
  const authSessionBindings = frozenFixtureBindings.filter(
    (
      binding
    ): binding is CompilerFixtureProjectionBinding &
      Readonly<{ serverRuntimeProjection: CompilerAuthSessionProjection }> =>
      binding.targetKind === 'auth-session' &&
      binding.serverRuntimeProjection !== undefined
  );
  if (authSessionBindings.length > 1) {
    throw new TypeError(
      'Fixture projection supports exactly one Browser Auth Session endpoint binding.'
    );
  }
  const authSessionBinding = authSessionBindings[0];
  if (
    authSessionBinding &&
    authSessionBinding.serverRuntimeProjection.outcome.value.permissionIds.some(
      (permissionId, index, permissionIds) =>
        index > 0 &&
        compareUnicodeCodePoints(permissionIds[index - 1]!, permissionId) >= 0
    )
  ) {
    throw new TypeError(
      'Auth-session fixture permissionIds must be uniquely sorted for transport.'
    );
  }
  const authSessionTransportWithoutDigest = authSessionBinding
    ? Object.freeze({
        method: 'GET' as const,
        endpointPath: EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
        responseMediaType: EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE,
        responseFormat: EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT,
        responseVersion: EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_VERSION,
        fixtureSetId: authSessionBinding.fixtureSetId,
        fixtureSetDigest: authSessionBinding.fixtureSetDigest,
        fixtureId: authSessionBinding.fixtureId,
        resourceId: authSessionBinding.resourceId,
        inputDigest: authSessionBinding.inputDigest,
        outcomeDigest: authSessionBinding.outcomeDigest,
        projectionDigest: authSessionBinding.projectionDigest,
        providerId: authSessionBinding.serverRuntimeProjection.providerId,
        principalId:
          authSessionBinding.serverRuntimeProjection.outcome.value.principalId,
        permissionIds: Object.freeze([
          ...authSessionBinding.serverRuntimeProjection.outcome.value
            .permissionIds,
        ]),
      })
    : undefined;
  const authSessionTransport = authSessionTransportWithoutDigest
    ? Object.freeze({
        ...authSessionTransportWithoutDigest,
        responseBindingDigest: digestBehaviorValue(
          authSessionTransportWithoutDigest
        ),
      })
    : null;

  const bootstrapFixtureIds = Object.freeze([
    ...controlProfile.storage.bootstrapFixtureIds,
  ]);
  if (new Set(bootstrapFixtureIds).size !== bootstrapFixtureIds.length) {
    throw new TypeError(
      'Fixture projection storage bootstrap ids must be unique.'
    );
  }
  const fixturesById = new Map(
    frozenFixtureBindings.map((fixture) => [fixture.fixtureId, fixture])
  );
  const storageBindings = bootstrapFixtureIds.map((fixtureId) => {
    const fixture = fixturesById.get(fixtureId);
    if (!fixture || fixture.targetKind !== 'storage') {
      throw new TypeError(
        `Storage bootstrap fixture ${fixtureId} must resolve to a storage fixture.`
      );
    }
    return fixture;
  });
  const network = Object.freeze({
    mode: 'fixture-only' as const,
    undeclaredRequest: 'reject' as const,
    fixtureIds: Object.freeze(
      frozenFixtureBindings.map(({ fixtureId }) => fixtureId)
    ),
    projectionDigest: digestBehaviorValue({
      mode: controlProfile.network.mode,
      undeclaredRequest: controlProfile.network.undeclaredRequest,
      fixtures: frozenFixtureBindings,
    }),
  });
  const storage = Object.freeze({
    bootstrapFixtureIds,
    projectionDigest: digestBehaviorValue({
      cleanup: controlProfile.storage.cleanup,
      fixtures: storageBindings,
    }),
  });

  const projectedRuntimeFiles = projectExecutableProjectRuntimeFiles(
    snapshot,
    'test'
  );
  const generatedProvisionFile = projectedRuntimeFiles.find(
    ({ path }) => path === EXECUTABLE_PROJECT_SERVER_RUNTIME_MOCK_PROVISION_PATH
  );
  if (Boolean(serverProvision) !== Boolean(generatedProvisionFile)) {
    throw new TypeError(
      'Server Runtime provision and generated provision file are inconsistent.'
    );
  }
  const serverRuntime =
    serverProvision && serverProvisionDigest && generatedProvisionFile
      ? Object.freeze({
          provisionDigest: serverProvisionDigest,
          fixtureSetId: serverProvision.fixtureSetId,
          ...(serverProvision.principal === undefined
            ? {}
            : {
                providerId: serverProvision.principal.providerId,
                principalId: serverProvision.principal.principalId,
              }),
          allowedPermissionIds: Object.freeze(
            serverProvision.permissions
              .filter(({ allowed }) => allowed)
              .map(({ permissionId }) => permissionId)
          ),
          generatedProvisionFile: fileBinding(
            generatedProvisionFile.path,
            generatedProvisionFile.contents
          ),
        })
      : null;
  const document = Object.freeze({
    format: COMPILER_FIXTURE_PROJECTION_FILE_FORMAT,
    owner: COMPILER_OWNER,
    workspace: snapshot.workspace,
    target: snapshot.target,
    controlProfile: Object.freeze({
      id: controlProfile.id,
      digest: digestBehaviorControlProfile(controlProfile),
    }),
    fixtureSets: fixtureSetBindings,
    fixtureBindings: frozenFixtureBindings,
    authSessionTransport,
    network,
    storage,
    serverRuntime,
  });
  return Object.freeze({
    document,
    text: `${canonicalJsonText(document, 2)}\n`,
  });
};

const projectionSourceTrace = Object.freeze([
  Object.freeze({
    sourceRef: Object.freeze({
      kind: 'operation' as const,
      operation: 'compiler-fixture-projection',
    }),
    label: 'Compiler fixture projection',
  }),
]);

const assertProjectionSourceFile = (
  snapshot: ExecutableProjectSnapshot,
  state: ProjectionState
): ExecutableProjectFile => {
  const file = snapshot.files.find(
    ({ path }) => path === COMPILER_FIXTURE_PROJECTION_SOURCE_PATH
  );
  if (
    !file ||
    !bytesEqual(file.contents, state.text) ||
    !sameCanonicalJson(file.sourceTrace ?? [], projectionSourceTrace)
  ) {
    throw new TypeError(
      'Compiler fixture projection file is missing or drifted from its canonical inputs.'
    );
  }
  return file;
};

const assertGeneratedFiles = (
  expectedFiles: readonly ExecutableProjectFile[],
  actualFiles: readonly ExecutableProjectFile[]
): readonly CompilerGeneratedFixtureProjectionFileBinding[] => {
  if (
    !Array.isArray(actualFiles) ||
    actualFiles.length !== expectedFiles.length
  ) {
    throw new TypeError(
      'Generated fixture projection file set does not match the Runtime Core projection.'
    );
  }
  const actualByPath = new Map<string, ExecutableProjectFile>();
  actualFiles.forEach((file) => {
    const path = normalizeExecutableProjectPath(file.path);
    if (path !== file.path || actualByPath.has(path)) {
      throw new TypeError(
        'Generated fixture projection files must have unique canonical paths.'
      );
    }
    actualByPath.set(path, file);
  });
  const bindings = expectedFiles.map((expected) => {
    const actual = actualByPath.get(expected.path);
    if (
      !actual ||
      !bytesEqual(actual.contents, expected.contents) ||
      !sameCanonicalJson(actual.sourceTrace ?? [], expected.sourceTrace ?? [])
    ) {
      throw new TypeError(
        `Generated fixture projection file drifted: ${expected.path}.`
      );
    }
    return generatedFileBinding(actual);
  });
  bindings.sort((left, right) =>
    compareUnicodeCodePoints(left.path, right.path)
  );
  return Object.freeze(bindings);
};

const assertBuildBundle = (
  snapshot: ExecutableProjectSnapshot,
  bundle: ExecutionBuildBundle,
  expectedProjectionContents: string
): readonly CompilerFixtureProjectionFileBinding[] => {
  if (
    bundle.format !== EXECUTION_BUILD_BUNDLE_FORMAT ||
    bundle.snapshotDigest !== snapshot.contentDigest ||
    !sameCanonicalJson(bundle.target, snapshot.target) ||
    !Array.isArray(bundle.files) ||
    bundle.files.length === 0 ||
    bundle.files.length > EXECUTABLE_PROJECT_LIMITS.maxFiles
  ) {
    throw new TypeError(
      'Fixture projection build bundle does not match the executable snapshot.'
    );
  }
  let previousPath = '';
  let totalBytes = 0;
  const bindings = bundle.files.map((file) => {
    const path = normalizeExecutableProjectPath(file.path);
    const bytes = toBytes(file.contents);
    totalBytes += bytes.byteLength;
    const digest = digestBytes(bytes);
    if (
      path !== file.path ||
      (previousPath && compareUnicodeCodePoints(previousPath, path) >= 0) ||
      file.size !== bytes.byteLength ||
      file.digest !== digest ||
      !DIGEST_PATTERN.test(file.digest) ||
      bytes.byteLength > EXECUTABLE_PROJECT_LIMITS.maxFileBytes ||
      totalBytes > EXECUTABLE_PROJECT_LIMITS.maxTotalFileBytes
    ) {
      throw new TypeError(
        `Fixture projection build bundle file is invalid: ${file.path}.`
      );
    }
    previousPath = path;
    return Object.freeze({ path, size: bytes.byteLength, digest });
  });
  const projectionFileIndex = bundle.files.findIndex(
    ({ path }) => path === COMPILER_FIXTURE_PROJECTION_BUILD_PATH
  );
  const projectionFile = bundle.files[projectionFileIndex];
  if (
    !projectionFile ||
    !bytesEqual(projectionFile.contents, expectedProjectionContents)
  ) {
    throw new TypeError(
      'Fixture projection build bundle is missing the exact Compiler projection bytes.'
    );
  }
  return Object.freeze(bindings);
};

const bindAuthSessionRuntimeClient = (
  projection: CompilerAuthSessionTransportProjection | null,
  files: readonly ExecutableProjectFile[],
  bindings: readonly CompilerGeneratedFixtureProjectionFileBinding[]
): CompilerAuthSessionTransportBinding | null => {
  if (!projection) return null;
  const file = files.find(
    ({ path }) => path === COMPILER_AUTH_SESSION_RUNTIME_CLIENT_SOURCE_PATH
  );
  const binding = bindings.find(
    ({ path }) => path === COMPILER_AUTH_SESSION_RUNTIME_CLIENT_SOURCE_PATH
  );
  if (
    !file ||
    !binding ||
    typeof file.contents !== 'string' ||
    !file.contents.includes(EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH) ||
    !file.contents.includes(EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT) ||
    !file.contents.includes(
      EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE
    ) ||
    file.contents.includes('globalThis.crypto')
  ) {
    throw new TypeError(
      'Auth Session fixture projection is missing its exact generated async runtime client.'
    );
  }
  return Object.freeze({
    ...projection,
    generatedClientFile: binding,
  });
};

/** Adds the Compiler-owned, test-only projection file to a canonical snapshot. */
export const createCompilerFixtureProjectionSnapshot = (
  input: CreateCompilerFixtureProjectionSnapshotInput
): ExecutableProjectSnapshot => {
  const snapshot = canonicalSnapshot(input.snapshot);
  if (
    snapshot.files.some(
      ({ path }) => path === COMPILER_FIXTURE_PROJECTION_SOURCE_PATH
    )
  ) {
    throw new TypeError(
      'Executable snapshot already contains a Compiler fixture projection file.'
    );
  }
  const state = createProjectionState(
    snapshot,
    input.fixtureSets,
    input.controlProfile
  );
  return createExecutableProjectSnapshot(
    snapshotInput(snapshot, [
      ...snapshot.files,
      Object.freeze({
        path: COMPILER_FIXTURE_PROJECTION_SOURCE_PATH,
        contents: state.text,
        sourceTrace: projectionSourceTrace,
      }),
    ])
  );
};

/**
 * Issues a content-addressed receipt only after real Runtime Core generated
 * files and build bytes match the fixture/profile/server semantic projection.
 */
export const issueCompilerFixtureProjectionReceipt = (
  input: IssueCompilerFixtureProjectionReceiptInput
): CompilerFixtureProjectionReceipt => {
  const snapshot = canonicalSnapshot(input.snapshot);
  const state = createProjectionState(
    snapshot,
    input.fixtureSets,
    input.controlProfile
  );
  const projectionSourceFile = assertProjectionSourceFile(snapshot, state);
  const generatedFiles = assertGeneratedFiles(
    projectExecutableProjectRuntimeFiles(snapshot, 'test'),
    input.generatedFiles
  );
  const buildFiles = assertBuildBundle(snapshot, input.buildBundle, state.text);
  const projectionBinding = fileBinding(
    projectionSourceFile.path,
    projectionSourceFile.contents
  );
  const authSessionTransport = bindAuthSessionRuntimeClient(
    state.document.authSessionTransport,
    input.generatedFiles,
    generatedFiles
  );
  const withoutDigest = Object.freeze({
    format: COMPILER_FIXTURE_PROJECTION_RECEIPT_FORMAT,
    owner: COMPILER_OWNER,
    snapshotDigest: snapshot.contentDigest,
    target: snapshot.target,
    controlProfile: state.document.controlProfile,
    fixtureSets: state.document.fixtureSets,
    fixtureBindings: state.document.fixtureBindings,
    authSessionTransport,
    network: state.document.network,
    storage: state.document.storage,
    serverRuntime: state.document.serverRuntime,
    projectionFile: Object.freeze({
      sourcePath: COMPILER_FIXTURE_PROJECTION_SOURCE_PATH,
      buildPath: COMPILER_FIXTURE_PROJECTION_BUILD_PATH,
      size: projectionBinding.size,
      digest: projectionBinding.digest,
    }),
    generatedFiles: Object.freeze({
      manifestDigest: digestBehaviorValue(generatedFiles),
      files: generatedFiles,
    }),
    buildBundle: Object.freeze({
      bundleDigest: digestBehaviorValue({
        format: input.buildBundle.format,
        snapshotDigest: input.buildBundle.snapshotDigest,
        target: input.buildBundle.target,
        files: buildFiles,
      }),
      files: buildFiles,
    }),
  });
  return Object.freeze({
    ...withoutDigest,
    receiptDigest: digestBehaviorValue(withoutDigest),
  });
};

/** Re-derives every semantic and byte binding and rejects any receipt drift. */
export const assertCompilerFixtureProjectionReceipt = (
  receipt: CompilerFixtureProjectionReceipt,
  input: IssueCompilerFixtureProjectionReceiptInput
): void => {
  const expected = issueCompilerFixtureProjectionReceipt(input);
  if (!sameCanonicalJson(receipt, expected)) {
    throw new TypeError(
      'Compiler fixture projection receipt does not match its canonical inputs.'
    );
  }
};

/** Verifies one actual build file against the receipt's bundle manifest. */
export const assertCompilerFixtureProjectionBuildFile = (
  receipt: CompilerFixtureProjectionReceipt,
  file: ExecutionBuildBundleFile
): void => {
  const { receiptDigest, ...withoutDigest } = receipt;
  if (
    !DIGEST_PATTERN.test(receiptDigest) ||
    digestBehaviorValue(withoutDigest) !== receiptDigest
  ) {
    throw new TypeError(
      'Compiler fixture projection receipt digest does not match.'
    );
  }
  const path = normalizeExecutableProjectPath(file.path);
  const expected = receipt.buildBundle.files.find(
    (binding) => binding.path === path
  );
  const bytes = toBytes(file.contents);
  if (
    path !== file.path ||
    !expected ||
    file.size !== bytes.byteLength ||
    file.digest !== digestBytes(bytes) ||
    expected.size !== bytes.byteLength ||
    expected.digest !== file.digest
  ) {
    throw new TypeError(
      `Build file does not match the Compiler fixture projection receipt: ${file.path}.`
    );
  }
};
