import {
  BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
  type BehaviorFixtureSet,
  type BehaviorScenarioProgram,
} from '@prodivix/behavior';
import {
  COMPILER_FIXTURE_PROJECTION_BUILD_PATH,
  COMPILER_FIXTURE_PROJECTION_SOURCE_PATH,
  assertCompilerFixtureProjectionBuildFile,
  assertCompilerFixtureProjectionReceipt,
  type CompilerAuthSessionTransportBinding,
  type CompilerFixtureProjectionReceipt,
} from '@prodivix/prodivix-compiler';
import {
  projectExecutableProjectRuntimeFiles,
  type DeterministicRuntimeControlPlan,
  type ExecutableProjectSnapshot,
  type ExecutionBuildBundle,
} from '@prodivix/runtime-core';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { digestVerificationValue } from '@prodivix/verification';
import {
  createBrowserRuntimeControlFixtureBinding,
  createBrowserRuntimeControlResourceManifest,
  createBrowserVerificationOriginDigest,
  digestBrowserVerificationBytes,
  type BrowserRuntimeControlFixtureBinding,
  type BrowserRuntimeControlProviderKind,
  type BrowserRuntimeControlRemoteBinding,
  type BrowserRuntimeControlResource,
  type BrowserRuntimeControlResourceManifest,
  type BrowserVerificationTargetLease,
} from '@prodivix/verification-browser';
import {
  digestGoldenG3V6RemotePreviewBytes,
  encodeGoldenG3V6RemotePreviewBundle,
} from './goldenG3V6RemotePreviewBundle';
import type { GoldenG3V6RemotePreviewEvidence } from './goldenG3V6RemotePreviewHarness';
import {
  assertGoldenG3V6ProductionSecurityAuthorityClean,
  digestGoldenG3V6ProductionBuildBundle,
  type GoldenG3V6ProductionSecurityAuthority,
} from './goldenG3V6ProductionSecurityAuthority';

const CONTROL_HOST_PATH = '/__prodivix-golden-host.html';

export const GOLDEN_G3_V6_RUNTIME_CONTROL_HOST_DOCUMENT =
  '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';

const sha256Pattern = /^sha256-[a-f0-9]{64}$/u;

const exactDigest = (value: string, label: string): string => {
  if (!sha256Pattern.test(value)) {
    throw new TypeError(`${label} must be a canonical SHA-256 digest.`);
  }
  return value;
};

const exactOrigin = (value: string): string => {
  const parsed = new URL(value);
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== '/'
  ) {
    throw new TypeError(
      'Golden V6 runtime controls require an exact HTTP origin.'
    );
  }
  return parsed.origin;
};

const exactString = (value: string, label: string): string => {
  if (!value || value !== value.trim() || value.length > 1_024) {
    throw new TypeError(`${label} must be a bounded canonical string.`);
  }
  return value;
};

const encodedBundleUrl = (origin: string, path: string): string =>
  new URL(
    path
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/'),
    `${origin}/`
  ).href;

const assertBuildBundle = (
  snapshot: ExecutableProjectSnapshot,
  buildBundle: ExecutionBuildBundle
): ExecutionBuildBundle['files'][number] => {
  if (
    buildBundle.snapshotDigest !== snapshot.contentDigest ||
    !sameCanonicalJson(buildBundle.target, snapshot.target)
  ) {
    throw new TypeError(
      'Golden V6 runtime control build bundle drifted from its executable snapshot.'
    );
  }
  const entry = buildBundle.files.find(
    ({ path }) => path === snapshot.previewPlan.entryFilePath
  );
  if (!entry) {
    throw new TypeError(
      'Golden V6 runtime control build bundle is missing its exact entrypoint.'
    );
  }
  for (const file of buildBundle.files) {
    if (
      file.size !== file.contents.byteLength ||
      digestBrowserVerificationBytes(file.contents) !== file.digest
    ) {
      throw new TypeError(
        `Golden V6 runtime control bundle file "${file.path}" failed its content address.`
      );
    }
  }
  return entry;
};

const readServedResourceDigest = async (
  resource: BrowserRuntimeControlResource
): Promise<string> => {
  const response = await fetch(resource.url, {
    method: 'GET',
    redirect: 'error',
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!response.ok) {
    throw new Error(
      `Golden V6 runtime control resource "${resource.url}" was not served.`
    );
  }
  return digestBrowserVerificationBytes(bytes);
};

const declaredNavigationEntryUrls = (
  origin: string,
  program: BehaviorScenarioProgram
): readonly string[] => {
  const urls = new Set([new URL('/', `${origin}/`).href]);
  for (const instruction of program.instructions) {
    if (instruction.operation !== 'navigate') continue;
    if (
      instruction.input !== undefined &&
      typeof instruction.input !== 'string'
    ) {
      throw new TypeError(
        'Golden V6 browser navigation requires an exact string destination.'
      );
    }
    const destination = new URL(instruction.input ?? '/', `${origin}/`);
    if (
      destination.origin !== origin ||
      destination.username ||
      destination.password ||
      destination.hash
    ) {
      throw new TypeError(
        'Golden V6 browser navigation must stay on one exact HTTP origin without credentials or fragments.'
      );
    }
    urls.add(destination.href);
  }
  return Object.freeze([...urls].sort(compareUnicodeCodePoints));
};

const createVerifiedResourceManifest = async (input: {
  origin: string;
  program: BehaviorScenarioProgram;
  snapshot: ExecutableProjectSnapshot;
  buildBundle: ExecutionBuildBundle;
}): Promise<
  Readonly<{
    controlHostUrl: string;
    manifest: BrowserRuntimeControlResourceManifest;
  }>
> => {
  const entry = assertBuildBundle(input.snapshot, input.buildBundle);
  if (input.program.executableSnapshotDigest !== input.snapshot.contentDigest) {
    throw new TypeError(
      'Golden V6 browser navigation manifest drifted from its executable snapshot.'
    );
  }
  const controlHostUrl = new URL(CONTROL_HOST_PATH, `${input.origin}/`).href;
  const resources: BrowserRuntimeControlResource[] =
    declaredNavigationEntryUrls(input.origin, input.program).map((url) =>
      Object.freeze({
        url,
        kind: 'entry' as const,
        contentDigest: entry.digest,
        byteLength: entry.contents.byteLength,
      })
    );
  resources.push(
    Object.freeze({
      url: controlHostUrl,
      kind: 'control-host',
      contentDigest: digestBrowserVerificationBytes(
        new TextEncoder().encode(GOLDEN_G3_V6_RUNTIME_CONTROL_HOST_DOCUMENT)
      ),
      byteLength: new TextEncoder().encode(
        GOLDEN_G3_V6_RUNTIME_CONTROL_HOST_DOCUMENT
      ).byteLength,
    })
  );
  for (const file of input.buildBundle.files) {
    const url = encodedBundleUrl(input.origin, file.path);
    const existing = resources.find((candidate) => candidate.url === url);
    if (existing) {
      if (existing.contentDigest !== file.digest) {
        throw new TypeError(
          `Golden V6 runtime control resource "${url}" has conflicting bytes.`
        );
      }
      continue;
    }
    resources.push(
      Object.freeze({
        url,
        kind: 'bundle',
        contentDigest: file.digest,
        byteLength: file.contents.byteLength,
      })
    );
  }
  const actualDigests = await Promise.all(
    resources.map(readServedResourceDigest)
  );
  const drifted = resources.find(
    (resource, index) => resource.contentDigest !== actualDigests[index]
  );
  if (drifted) {
    throw new TypeError(
      `Golden V6 served resource "${drifted.url}" drifted from its exact bytes.`
    );
  }
  return Object.freeze({
    controlHostUrl,
    manifest: createBrowserRuntimeControlResourceManifest({
      executableSnapshotDigest: input.snapshot.contentDigest,
      resources,
    }),
  });
};

export type GoldenG3V6AuthFixtureProjectionBinding = Readonly<{
  receiptDigest: string;
  fixtureId: string;
  targetKind: 'auth-session';
  resourceId: string;
  inputDigest: string;
  outcomeDigest: string;
  projectionDigest: string;
  authSessionTransport: CompilerAuthSessionTransportBinding;
}>;

const exactAuthFixtureProjection = (input: {
  snapshot: ExecutableProjectSnapshot;
  buildBundle: ExecutionBuildBundle;
  plan: DeterministicRuntimeControlPlan;
  receipt: CompilerFixtureProjectionReceipt;
  authFixtureSet: BehaviorFixtureSet;
}): GoldenG3V6AuthFixtureProjectionBinding => {
  assertCompilerFixtureProjectionReceipt(input.receipt, {
    snapshot: input.snapshot,
    fixtureSets: Object.freeze([input.authFixtureSet]),
    controlProfile: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
    generatedFiles: projectExecutableProjectRuntimeFiles(
      input.snapshot,
      'test'
    ),
    buildBundle: input.buildBundle,
  });
  input.buildBundle.files.forEach((file) => {
    assertCompilerFixtureProjectionBuildFile(input.receipt, file);
  });
  const planFixture = input.plan.network.fixtures.find(
    ({ target }) => target.kind === 'auth-session'
  );
  const receiptFixture = input.receipt.fixtureBindings.find(
    ({ targetKind }) => targetKind === 'auth-session'
  );
  const serverProjection = receiptFixture?.serverRuntimeProjection;
  const authSessionTransport = input.receipt.authSessionTransport;
  const authSessionTransportWithoutDigest = authSessionTransport
    ? {
        method: authSessionTransport.method,
        endpointPath: authSessionTransport.endpointPath,
        responseMediaType: authSessionTransport.responseMediaType,
        responseFormat: authSessionTransport.responseFormat,
        responseVersion: authSessionTransport.responseVersion,
        fixtureSetId: authSessionTransport.fixtureSetId,
        fixtureSetDigest: authSessionTransport.fixtureSetDigest,
        fixtureId: authSessionTransport.fixtureId,
        resourceId: authSessionTransport.resourceId,
        inputDigest: authSessionTransport.inputDigest,
        outcomeDigest: authSessionTransport.outcomeDigest,
        projectionDigest: authSessionTransport.projectionDigest,
        providerId: authSessionTransport.providerId,
        principalId: authSessionTransport.principalId,
        permissionIds: authSessionTransport.permissionIds,
      }
    : undefined;
  if (
    input.plan.network.fixtures.length !== 1 ||
    !planFixture ||
    planFixture.outcome.kind !== 'result' ||
    input.receipt.fixtureBindings.length !== 1 ||
    !receiptFixture ||
    receiptFixture.fixtureSetId !== input.authFixtureSet.id ||
    receiptFixture.fixtureSetDigest !== input.plan.fixtureSetDigests[0] ||
    receiptFixture.fixtureId !== planFixture.id ||
    receiptFixture.targetKind !== planFixture.target.kind ||
    receiptFixture.resourceId !== planFixture.target.resourceId ||
    receiptFixture.inputDigest !== planFixture.inputDigest ||
    receiptFixture.attempt !== planFixture.attempt ||
    receiptFixture.page !== planFixture.page ||
    receiptFixture.outcomeDigest !==
      digestVerificationValue(planFixture.outcome) ||
    !serverProjection ||
    serverProjection.providerId !== planFixture.target.resourceId ||
    serverProjection.outcome.kind !== 'result' ||
    !sameCanonicalJson(
      serverProjection.outcome.value,
      planFixture.outcome.value
    ) ||
    !authSessionTransport ||
    !authSessionTransportWithoutDigest ||
    authSessionTransport.fixtureSetId !== receiptFixture.fixtureSetId ||
    authSessionTransport.fixtureSetDigest !== receiptFixture.fixtureSetDigest ||
    authSessionTransport.fixtureId !== receiptFixture.fixtureId ||
    authSessionTransport.resourceId !== receiptFixture.resourceId ||
    authSessionTransport.inputDigest !== receiptFixture.inputDigest ||
    authSessionTransport.outcomeDigest !== receiptFixture.outcomeDigest ||
    authSessionTransport.projectionDigest !== receiptFixture.projectionDigest ||
    authSessionTransport.providerId !== serverProjection.providerId ||
    !sameCanonicalJson(
      Object.freeze({
        principalId: authSessionTransport.principalId,
        permissionIds: authSessionTransport.permissionIds,
      }),
      planFixture.outcome.value
    ) ||
    authSessionTransport.responseBindingDigest !==
      digestVerificationValue(authSessionTransportWithoutDigest) ||
    input.receipt.controlProfile.id !== input.plan.profileId ||
    input.receipt.controlProfile.digest !== input.plan.profileDigest ||
    !sameCanonicalJson(
      input.receipt.fixtureSets.map(({ digest }) => digest),
      input.plan.fixtureSetDigests
    ) ||
    input.receipt.network.mode !== input.plan.network.mode ||
    input.receipt.network.undeclaredRequest !==
      input.plan.network.undeclaredRequest ||
    !sameCanonicalJson(
      input.receipt.network.fixtureIds,
      input.plan.network.fixtures.map(({ id }) => id)
    )
  ) {
    throw new TypeError(
      'Golden V6 Compiler auth fixture projection drifted from its exact Core Plan.'
    );
  }
  return Object.freeze({
    receiptDigest: input.receipt.receiptDigest,
    fixtureId: receiptFixture.fixtureId,
    targetKind: 'auth-session',
    resourceId: receiptFixture.resourceId,
    inputDigest: receiptFixture.inputDigest,
    outcomeDigest: receiptFixture.outcomeDigest,
    projectionDigest: receiptFixture.projectionDigest,
    authSessionTransport: Object.freeze({
      ...authSessionTransport,
      permissionIds: Object.freeze([...authSessionTransport.permissionIds]),
    }),
  });
};

export type GoldenG3V6ProductionNoFixtureProjectionBinding = Readonly<{
  authorityDigest: string;
  productionSnapshotDigest: string;
  productionBundleDigest: string;
  targetBindingDigest: string;
}>;

const exactProductionNoFixtureProjection = (input: {
  attemptId: string;
  plan: DeterministicRuntimeControlPlan;
  targetLease: BrowserVerificationTargetLease;
  snapshot: ExecutableProjectSnapshot;
  buildBundle: ExecutionBuildBundle;
  authority: GoldenG3V6ProductionSecurityAuthority;
}): GoldenG3V6ProductionNoFixtureProjectionBinding => {
  assertGoldenG3V6ProductionSecurityAuthorityClean(input.authority);
  const evidence = input.authority.evidence;
  const { staticEvidenceDigest, ...evidenceBase } = evidence;
  const expectedStaticEvidenceDigest = digestVerificationValue({
    format: 'prodivix.golden-g3-v6-production-security-static-evidence',
    version: 1,
    ...evidenceBase,
  });
  const observation = input.authority.observationSet;
  const binding = observation.binding;
  const productionBundleDigest = digestGoldenG3V6ProductionBuildBundle(
    input.buildBundle
  );
  if (
    input.plan.fixtureSetDigests.length !== 0 ||
    input.plan.network.fixtures.length !== 0 ||
    input.plan.storage.bootstrapFixtureIds.length !== 0 ||
    input.snapshot.dataMockProvision !== undefined ||
    input.snapshot.serverRuntimeMockProvision !== undefined ||
    input.snapshot.files.some(
      ({ path }) => path === COMPILER_FIXTURE_PROJECTION_SOURCE_PATH
    ) ||
    input.buildBundle.files.some(
      ({ path }) => path === COMPILER_FIXTURE_PROJECTION_BUILD_PATH
    ) ||
    observation.complete !== true ||
    binding.attemptId !== input.attemptId ||
    binding.generation !== input.targetLease.binding.generation ||
    binding.executableSnapshotDigest !== input.snapshot.contentDigest ||
    binding.controlProfileDigest !== input.plan.profileDigest ||
    evidence.productionSnapshotDigest !== input.snapshot.contentDigest ||
    evidence.productionSnapshotDigest === evidence.canarySourceSnapshotDigest ||
    evidence.servedBundleDigest !== productionBundleDigest ||
    evidence.scannedBundleDigest !== productionBundleDigest ||
    evidence.materializedBundleDigest !== productionBundleDigest ||
    evidence.targetBindingDigest !== input.targetLease.bindingDigest ||
    evidence.originDigest !== input.targetLease.binding.originDigest ||
    !evidence.exactBundleBinding ||
    staticEvidenceDigest !== expectedStaticEvidenceDigest
  ) {
    throw new TypeError(
      'Golden V6 production no-fixture authority drifted from its exact snapshot, bundle, target, or security evidence.'
    );
  }
  return Object.freeze({
    authorityDigest: staticEvidenceDigest,
    productionSnapshotDigest: evidence.productionSnapshotDigest,
    productionBundleDigest,
    targetBindingDigest: evidence.targetBindingDigest,
  });
};

const createRemoteBinding = (input: {
  providerKind: BrowserRuntimeControlProviderKind;
  attemptId: string;
  snapshot: ExecutableProjectSnapshot;
  buildBundle: ExecutionBuildBundle;
  targetLease: BrowserVerificationTargetLease;
  remoteEvidence?: GoldenG3V6RemotePreviewEvidence;
}): BrowserRuntimeControlRemoteBinding | undefined => {
  if (input.providerKind !== 'remote') {
    if (input.remoteEvidence) {
      throw new TypeError(
        'Only a Golden V6 Remote provider may bind Remote Preview evidence.'
      );
    }
    return undefined;
  }
  const evidence = input.remoteEvidence;
  const materializedEntryUrl = evidence
    ? new URL(evidence.materializedEntryUrl)
    : undefined;
  const expectedEntryUrl = evidence
    ? encodedBundleUrl(
        exactOrigin(evidence.materializedOrigin),
        input.snapshot.previewPlan.entryFilePath
      )
    : undefined;
  const entry = input.buildBundle.files.find(
    ({ path }) => path === input.snapshot.previewPlan.entryFilePath
  );
  const expectedMaterializedBundleDigest = digestGoldenG3V6RemotePreviewBytes(
    encodeGoldenG3V6RemotePreviewBundle(input.snapshot, input.buildBundle)
  );
  if (
    !evidence ||
    !materializedEntryUrl ||
    !entry ||
    evidence.attemptId !== input.attemptId ||
    evidence.snapshotDigest !== input.snapshot.contentDigest ||
    evidence.materializedBundleDigest !== expectedMaterializedBundleDigest ||
    evidence.artifactDigest !== expectedMaterializedBundleDigest ||
    evidence.materializedEntryDigest !== entry.digest ||
    evidence.materializedEntryFilePath !==
      input.snapshot.previewPlan.entryFilePath ||
    evidence.materializedFileCount !== input.buildBundle.files.length ||
    exactOrigin(evidence.materializedOrigin) !==
      exactOrigin(input.targetLease.origin) ||
    createBrowserVerificationOriginDigest(evidence.materializedOrigin) !==
      input.targetLease.binding.originDigest ||
    materializedEntryUrl.origin !== exactOrigin(evidence.materializedOrigin) ||
    materializedEntryUrl.username ||
    materializedEntryUrl.password ||
    materializedEntryUrl.search ||
    materializedEntryUrl.hash ||
    materializedEntryUrl.href !== expectedEntryUrl
  ) {
    throw new TypeError(
      'Golden V6 Remote runtime controls require exact execution, snapshot, materialized origin, and entry evidence.'
    );
  }
  const identity = Object.freeze({
    attemptId: exactString(evidence.attemptId, 'Remote attempt id'),
    requestId: exactString(evidence.requestId, 'Remote request id'),
    executionId: exactString(evidence.executionId, 'Remote execution id'),
    snapshotDigest: exactDigest(evidence.snapshotDigest, 'Remote snapshot'),
    materializedBundleDigest: exactDigest(
      evidence.materializedBundleDigest,
      'Remote materialized bundle'
    ),
    materializedOriginDigest: createBrowserVerificationOriginDigest(
      evidence.materializedOrigin
    ),
    materializedEntryDigest: exactDigest(
      evidence.materializedEntryDigest,
      'Remote materialized entry'
    ),
  });
  return Object.freeze({
    ...identity,
    bindingDigest: digestVerificationValue(identity),
  });
};

export type GoldenG3V6RuntimeControlBindings = Readonly<{
  controlHostUrl: string;
  resourceManifest: BrowserRuntimeControlResourceManifest;
  fixtureBinding: BrowserRuntimeControlFixtureBinding;
  authFixtureProjection?: GoldenG3V6AuthFixtureProjectionBinding;
  productionNoFixtureProjection?: GoldenG3V6ProductionNoFixtureProjectionBinding;
  remoteBinding?: BrowserRuntimeControlRemoteBinding;
}>;

/** Verifies every allowed served byte before issuing an attempt lease. */
export const createGoldenG3V6RuntimeControlBindings = async (input: {
  providerKind: BrowserRuntimeControlProviderKind;
  attemptId: string;
  program: BehaviorScenarioProgram;
  plan: DeterministicRuntimeControlPlan;
  targetLease: BrowserVerificationTargetLease;
  snapshot: ExecutableProjectSnapshot;
  buildBundle: ExecutionBuildBundle;
  authFixtureSet: BehaviorFixtureSet;
  fixtureProjectionReceipt?: CompilerFixtureProjectionReceipt;
  productionSecurityAuthority?: GoldenG3V6ProductionSecurityAuthority;
  remoteEvidence?: GoldenG3V6RemotePreviewEvidence;
}): Promise<GoldenG3V6RuntimeControlBindings> => {
  const origin = exactOrigin(input.targetLease.origin);
  const resources = await createVerifiedResourceManifest({
    origin,
    program: input.program,
    snapshot: input.snapshot,
    buildBundle: input.buildBundle,
  });
  const authFixtureProjection =
    input.plan.network.fixtures.length === 0
      ? undefined
      : input.fixtureProjectionReceipt && !input.productionSecurityAuthority
        ? exactAuthFixtureProjection({
            snapshot: input.snapshot,
            buildBundle: input.buildBundle,
            plan: input.plan,
            receipt: input.fixtureProjectionReceipt,
            authFixtureSet: input.authFixtureSet,
          })
        : undefined;
  const productionNoFixtureProjection =
    input.plan.network.fixtures.length === 0 &&
    input.productionSecurityAuthority &&
    !input.fixtureProjectionReceipt
      ? exactProductionNoFixtureProjection({
          attemptId: input.attemptId,
          plan: input.plan,
          targetLease: input.targetLease,
          snapshot: input.snapshot,
          buildBundle: input.buildBundle,
          authority: input.productionSecurityAuthority,
        })
      : undefined;
  if (!authFixtureProjection && !productionNoFixtureProjection) {
    throw new TypeError(
      'Golden V6 runtime controls require exactly one matching fixture projection authority.'
    );
  }
  const fixtureBinding = createBrowserRuntimeControlFixtureBinding({
    plan: input.plan,
    executableSnapshotDigest: input.snapshot.contentDigest,
    projectionAuthorityDigest:
      authFixtureProjection?.receiptDigest ??
      productionNoFixtureProjection!.authorityDigest,
    expectedRuntimeDispatchCount: authFixtureProjection ? 1 : 0,
  });
  const remoteBinding = createRemoteBinding({
    providerKind: input.providerKind,
    attemptId: input.attemptId,
    snapshot: input.snapshot,
    buildBundle: input.buildBundle,
    targetLease: input.targetLease,
    ...(input.remoteEvidence ? { remoteEvidence: input.remoteEvidence } : {}),
  });
  return Object.freeze({
    controlHostUrl: resources.controlHostUrl,
    resourceManifest: resources.manifest,
    fixtureBinding,
    ...(authFixtureProjection ? { authFixtureProjection } : {}),
    ...(productionNoFixtureProjection ? { productionNoFixtureProjection } : {}),
    ...(remoteBinding ? { remoteBinding } : {}),
  });
};
