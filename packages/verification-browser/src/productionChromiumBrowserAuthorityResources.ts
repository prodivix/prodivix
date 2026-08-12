import { realpath } from 'node:fs/promises';
import {
  BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
  createBehaviorDeterministicControlPlan,
  digestBehaviorValue,
  type BehaviorScenarioProgram,
} from '@prodivix/behavior';
import {
  EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_MEDIA_TYPE,
  EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_SCHEMA_DIGEST,
  createExecutableProjectSnapshot,
  encodeExecutableProjectSnapshotArtifact,
  EXECUTABLE_PROJECT_LIMITS,
  normalizeExecutableProjectPath,
  type DeterministicRuntimeControlPlan,
  type ExecutableProjectSnapshot,
  type ExecutionBuildBundle,
} from '@prodivix/runtime-core';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  digestVerificationValue,
  type VerificationAbortSignal,
  type VerificationPlanCell,
} from '@prodivix/verification';
import type { BrowserVerificationRuntimeIdentity } from './browserAdapter.types';
import { assertPlaywrightBrowserImageAuthorityReceipt } from './browserImageAuthority';
import { digestBrowserVerificationBytes } from './browserVerificationCellInput';
import {
  createBrowserRuntimeControlResourceManifest,
  type BrowserRuntimeControlResourceManifest,
} from './browserRuntimeControlPort';
import {
  createBrowserVerificationOriginDigest,
  normalizeBrowserVerificationRuntimeIdentity,
} from './browserRuntimeIdentity';
import { observePlaywrightBrowserImageAuthority } from './internal/playwrightBrowserImageAuthority';
import type {
  ProductionBrowserCanaryScanReceipt,
  ProductionBrowserCanaryScannerPort,
  ProductionBrowserExecutableSnapshotReceipt,
  ProductionBrowserPreviewResource,
  ProductionBrowserRemoteExecutionEvidence,
  ProductionChromiumRuntimeAuthority,
  ProductionChromiumRuntimeAuthorityInput,
} from './productionChromiumBrowserAuthority.types';
import {
  PRODUCTION_BROWSER_CANARY_SCAN_RECEIPT_FORMAT,
  PRODUCTION_BROWSER_CANARY_SCAN_RECEIPT_VERSION,
  PRODUCTION_BROWSER_EXECUTABLE_SNAPSHOT_RECEIPT_FORMAT,
  PRODUCTION_BROWSER_EXECUTABLE_SNAPSHOT_RECEIPT_VERSION,
  PRODUCTION_CHROMIUM_RUNTIME_AUTHORITY_FORMAT,
  PRODUCTION_CHROMIUM_RUNTIME_AUTHORITY_VERSION,
} from './productionChromiumBrowserAuthority.types';

export const PRODUCTION_BROWSER_CONTROL_HOST_PATH =
  '/__prodivix-production-control-host.html' as const;
export const PRODUCTION_BROWSER_CONTROL_HOST_DOCUMENT =
  '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';

const digestPattern = /^sha256-[a-f0-9]{64}$/u;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/u;
const sourceRefPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;

const assertDigest = (value: string, label: string): string => {
  if (!digestPattern.test(value)) {
    throw new TypeError(`${label} must be a canonical SHA-256 digest.`);
  }
  return value;
};

const assertIdentifier = (value: string, label: string): string => {
  if (
    !identifierPattern.test(value) ||
    value !== value.trim() ||
    value !== value.normalize('NFC')
  ) {
    throw new TypeError(`${label} must be a bounded canonical identifier.`);
  }
  return value;
};

const assertSourceRef = (value: string): string => {
  if (
    !sourceRefPattern.test(value) ||
    value !== value.trim() ||
    value !== value.normalize('NFC')
  ) {
    throw new TypeError(
      'Production executable snapshot sourceRef must be a bounded canonical reference.'
    );
  }
  return value;
};

export const createProductionBrowserExecutableSnapshotReceipt = (
  input: Readonly<{
    snapshot: ExecutableProjectSnapshot;
    sourceRef: string;
    compilerProjectionReceiptDigest: string;
  }>
): ProductionBrowserExecutableSnapshotReceipt => {
  const artifact = encodeExecutableProjectSnapshotArtifact(input.snapshot);
  const identity = Object.freeze({
    format: PRODUCTION_BROWSER_EXECUTABLE_SNAPSHOT_RECEIPT_FORMAT,
    version: PRODUCTION_BROWSER_EXECUTABLE_SNAPSHOT_RECEIPT_VERSION,
    digest: assertDigest(
      input.snapshot.contentDigest,
      'Production executable snapshot'
    ),
    artifactDigest: artifact.artifactDigest,
    size: artifact.size,
    mediaType: EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_MEDIA_TYPE,
    codecSchemaDigest: EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_SCHEMA_DIGEST,
    sourceRef: assertSourceRef(input.sourceRef),
    compilerProjectionReceiptDigest: assertDigest(
      input.compilerProjectionReceiptDigest,
      'Compiler projection receipt'
    ),
  });
  return Object.freeze({
    ...identity,
    receiptDigest: digestVerificationValue(identity),
  });
};

export const assertProductionBrowserExecutableSnapshotReceipt = (
  value: ProductionBrowserExecutableSnapshotReceipt,
  input: Readonly<{
    snapshot: ExecutableProjectSnapshot;
    compilerProjectionReceiptDigest: string;
  }>
): ProductionBrowserExecutableSnapshotReceipt => {
  const expected = createProductionBrowserExecutableSnapshotReceipt({
    snapshot: input.snapshot,
    sourceRef: value.sourceRef,
    compilerProjectionReceiptDigest: input.compilerProjectionReceiptDigest,
  });
  if (!sameCanonicalJson(value, expected)) {
    throw new TypeError(
      'Production executable snapshot receipt drifted from snapshot bytes or compiler projection.'
    );
  }
  return expected;
};

export const createProductionBrowserBuildBundleDigest = (
  bundle: ExecutionBuildBundle
): string =>
  digestVerificationValue({
    format: bundle.format,
    snapshotDigest: bundle.snapshotDigest,
    target: bundle.target,
    files: bundle.files.map(({ path, size, digest }) => ({
      path,
      size,
      digest,
    })),
  });

export const createProductionBrowserCanaryScanReceipt = (
  input: Readonly<{
    contents: Uint8Array;
    scannerAuthorityDigest: string;
  }>
): ProductionBrowserCanaryScanReceipt => {
  const identity = Object.freeze({
    format: PRODUCTION_BROWSER_CANARY_SCAN_RECEIPT_FORMAT,
    version: PRODUCTION_BROWSER_CANARY_SCAN_RECEIPT_VERSION,
    contentDigest: digestBrowserVerificationBytes(input.contents),
    byteLength: input.contents.byteLength,
    scannerAuthorityDigest: assertDigest(
      input.scannerAuthorityDigest,
      'Canary scanner authority'
    ),
    verdict: 'clean' as const,
  });
  return Object.freeze({
    ...identity,
    receiptDigest: digestVerificationValue(identity),
  });
};

const assertCanaryScanReceipt = (
  value: ProductionBrowserCanaryScanReceipt,
  input: Parameters<typeof createProductionBrowserCanaryScanReceipt>[0]
): ProductionBrowserCanaryScanReceipt => {
  const expected = createProductionBrowserCanaryScanReceipt(input);
  if (!sameCanonicalJson(value, expected)) {
    throw new TypeError(
      'Production browser canary scanner returned a drifted or non-clean receipt.'
    );
  }
  return expected;
};

const snapshotKeys = Object.freeze(
  [
    'buildCommand',
    'buildPlan',
    'cacheHints',
    'capabilityRequirements',
    'contentDigest',
    'dataMockProvision',
    'dependencyPlan',
    'entrypoints',
    'files',
    'format',
    'installCommand',
    'previewCommand',
    'previewPlan',
    'publicBuildConfiguration',
    'resourceHints',
    'serverFunctionPlan',
    'serverRuntimeMockProvision',
    'target',
    'testPlan',
    'workspace',
  ].sort(compareUnicodeCodePoints)
);

const validateExecutableSnapshot = (
  snapshot: ExecutableProjectSnapshot
): ExecutableProjectSnapshot => {
  const actualKeys = Object.keys(snapshot).sort(compareUnicodeCodePoints);
  const allowedKeys = snapshotKeys.filter((key) =>
    key === 'dataMockProvision' ||
    key === 'serverFunctionPlan' ||
    key === 'serverRuntimeMockProvision'
      ? Object.hasOwn(snapshot, key)
      : true
  );
  if (!sameCanonicalJson(actualKeys, allowedKeys)) {
    throw new TypeError(
      'Executable snapshot fields drifted from current model.'
    );
  }
  const reconstructed = createExecutableProjectSnapshot({
    workspace: snapshot.workspace,
    target: snapshot.target,
    files: snapshot.files,
    dependencyPlan: Object.freeze({
      manifestFilePath: snapshot.dependencyPlan.manifestFilePath,
      ...(snapshot.dependencyPlan.lockFilePath
        ? { lockFilePath: snapshot.dependencyPlan.lockFilePath }
        : {}),
    }),
    entrypoints: snapshot.entrypoints,
    capabilityRequirements: snapshot.capabilityRequirements,
    publicBuildConfiguration: snapshot.publicBuildConfiguration,
    resourceHints: snapshot.resourceHints,
    cacheHints: snapshot.cacheHints,
    ...(snapshot.dataMockProvision
      ? { dataMockProvision: snapshot.dataMockProvision }
      : {}),
    ...(snapshot.serverRuntimeMockProvision
      ? { serverRuntimeMockProvision: snapshot.serverRuntimeMockProvision }
      : {}),
    installCommand: snapshot.installCommand,
    previewCommand: snapshot.previewCommand,
    buildCommand: snapshot.buildCommand,
    previewPlan: snapshot.previewPlan,
    buildPlan: snapshot.buildPlan,
    testPlan: snapshot.testPlan,
    ...(snapshot.serverFunctionPlan
      ? { serverFunctionPlan: snapshot.serverFunctionPlan }
      : {}),
  });
  if (!sameCanonicalJson(reconstructed, snapshot)) {
    throw new TypeError(
      'Executable snapshot content address or normalized current model drifted.'
    );
  }
  if (
    reconstructed.dataMockProvision !== undefined ||
    reconstructed.serverRuntimeMockProvision !== undefined
  ) {
    throw new TypeError(
      'Production browser authority requires a no-fixture executable snapshot.'
    );
  }
  return reconstructed;
};

const validateBuildBundle = (
  snapshot: ExecutableProjectSnapshot,
  bundle: ExecutionBuildBundle
): ExecutionBuildBundle['files'][number] => {
  if (
    bundle.format !== 'prodivix.execution-build-bundle.v1' ||
    bundle.snapshotDigest !== snapshot.contentDigest ||
    !sameCanonicalJson(bundle.target, snapshot.target) ||
    bundle.files.length < 1 ||
    bundle.files.length > EXECUTABLE_PROJECT_LIMITS.maxFiles
  ) {
    throw new TypeError(
      'Production build bundle drifted from its executable snapshot.'
    );
  }
  let previousPath = '';
  let totalBytes = 0;
  for (const file of bundle.files) {
    if (!(file.contents instanceof Uint8Array)) {
      throw new TypeError(
        'Production build bundle file contents must be exact bytes.'
      );
    }
    const path = normalizeExecutableProjectPath(file.path);
    totalBytes += file.contents.byteLength;
    if (
      path !== file.path ||
      (previousPath && compareUnicodeCodePoints(previousPath, path) >= 0) ||
      file.size !== file.contents.byteLength ||
      file.digest !== digestBrowserVerificationBytes(file.contents) ||
      file.contents.byteLength > EXECUTABLE_PROJECT_LIMITS.maxFileBytes ||
      totalBytes > EXECUTABLE_PROJECT_LIMITS.maxTotalFileBytes
    ) {
      throw new TypeError(
        'Production build bundle paths, sizes, order, or content addresses are invalid.'
      );
    }
    previousPath = path;
  }
  const entry = bundle.files.find(
    ({ path }) => path === snapshot.previewPlan.entryFilePath
  );
  if (!entry) {
    throw new TypeError(
      'Production build bundle is missing the exact preview entry file.'
    );
  }
  return entry;
};

const createRuntimePlan = (input: {
  cell: VerificationPlanCell;
  program: BehaviorScenarioProgram;
  snapshot: ExecutableProjectSnapshot;
}): DeterministicRuntimeControlPlan => {
  const { programDigest, ...programIdentity } = input.program;
  if (
    input.cell.browserEngine !== 'chromium' ||
    input.cell.frameworkTarget !== input.snapshot.target.presetId ||
    input.cell.scenarioId !== input.program.scenarioId ||
    input.cell.controlProfileRef.digest !==
      input.program.controlProfileDigest ||
    input.program.executableSnapshotDigest !== input.snapshot.contentDigest ||
    programDigest !== digestBehaviorValue(programIdentity) ||
    input.program.fixtureSetDigests.length !== 0
  ) {
    throw new TypeError(
      'Production browser registration requires exact Chromium, target, snapshot, and no-fixture Program coordinates.'
    );
  }
  const planned = createBehaviorDeterministicControlPlan({
    program: input.program,
    profile: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
    fixtureSets: Object.freeze([]),
    cell: Object.freeze({
      id: `${input.cell.id}:remote`,
      frameworkTarget: input.cell.frameworkTarget,
      surface: 'remote',
      browserEngine: 'chromium',
      viewport: input.cell.viewport,
      colorScheme: input.cell.colorScheme,
      motion: input.cell.motion,
      locale: input.cell.locale,
    }),
    maximumConcurrency: 1,
  });
  if (
    planned.status !== 'ready' ||
    planned.plan.network.fixtures.length !== 0 ||
    planned.plan.storage.bootstrapFixtureIds.length !== 0
  ) {
    throw new TypeError(
      'Production browser deterministic controls require an exact no-fixture ready Plan.'
    );
  }
  return planned.plan;
};

const entryRoutes = (program: BehaviorScenarioProgram): readonly string[] => {
  const routes = new Set(['/']);
  for (const instruction of program.instructions) {
    if (instruction.operation !== 'navigate') continue;
    if (
      instruction.input !== undefined &&
      typeof instruction.input !== 'string'
    ) {
      throw new TypeError(
        'Production browser navigation input must be an exact string.'
      );
    }
    const parsed = new URL(instruction.input ?? '/', 'http://127.0.0.1');
    if (
      parsed.origin !== 'http://127.0.0.1' ||
      parsed.username ||
      parsed.password ||
      parsed.hash
    ) {
      throw new TypeError(
        'Production browser navigation must remain on one loopback origin.'
      );
    }
    routes.add(`${parsed.pathname}${parsed.search}`);
  }
  return Object.freeze([...routes].sort(compareUnicodeCodePoints));
};

const bundlePath = (path: string): string =>
  `/${path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;

const createPreviewResources = (input: {
  program: BehaviorScenarioProgram;
  snapshot: ExecutableProjectSnapshot;
  bundle: ExecutionBuildBundle;
  entry: ExecutionBuildBundle['files'][number];
}): Readonly<{
  routes: readonly string[];
  resources: readonly ProductionBrowserPreviewResource[];
}> => {
  const resources = new Map<string, ProductionBrowserPreviewResource>();
  const put = (resource: ProductionBrowserPreviewResource): void => {
    const existing = resources.get(resource.path);
    if (existing && existing.contentDigest !== resource.contentDigest) {
      throw new TypeError(
        `Production browser resource ${resource.path} has conflicting bytes.`
      );
    }
    if (!existing || resource.kind === 'entry')
      resources.set(resource.path, resource);
  };
  const routes = entryRoutes(input.program);
  for (const path of routes) {
    put(
      Object.freeze({
        path,
        kind: 'entry',
        contentDigest: input.entry.digest,
        contents: input.entry.contents,
      })
    );
  }
  const controlBytes = new TextEncoder().encode(
    PRODUCTION_BROWSER_CONTROL_HOST_DOCUMENT
  );
  put(
    Object.freeze({
      path: PRODUCTION_BROWSER_CONTROL_HOST_PATH,
      kind: 'control-host',
      contentDigest: digestBrowserVerificationBytes(controlBytes),
      contents: controlBytes,
    })
  );
  for (const file of input.bundle.files) {
    put(
      Object.freeze({
        path: bundlePath(file.path),
        kind: 'bundle',
        contentDigest: file.digest,
        contents: file.contents,
      })
    );
  }
  return Object.freeze({
    routes,
    resources: Object.freeze(
      [...resources.values()].sort((left, right) =>
        compareUnicodeCodePoints(left.path, right.path)
      )
    ),
  });
};

export type ValidatedProductionBrowserInputs = Readonly<{
  snapshot: ExecutableProjectSnapshot;
  entry: ExecutionBuildBundle['files'][number];
  buildBundleDigest: string;
  plan: DeterministicRuntimeControlPlan;
  entryRoutes: readonly string[];
  resources: readonly ProductionBrowserPreviewResource[];
}>;

export const validateProductionBrowserInputs = (input: {
  cell: VerificationPlanCell;
  program: BehaviorScenarioProgram;
  snapshot: ExecutableProjectSnapshot;
  buildBundle: ExecutionBuildBundle;
}): ValidatedProductionBrowserInputs => {
  const snapshot = validateExecutableSnapshot(input.snapshot);
  const entry = validateBuildBundle(snapshot, input.buildBundle);
  const plan = createRuntimePlan({
    cell: input.cell,
    program: input.program,
    snapshot,
  });
  const preview = createPreviewResources({
    program: input.program,
    snapshot,
    bundle: input.buildBundle,
    entry,
  });
  return Object.freeze({
    snapshot,
    entry,
    buildBundleDigest: createProductionBrowserBuildBundleDigest(
      input.buildBundle
    ),
    plan,
    entryRoutes: preview.routes,
    resources: preview.resources,
  });
};

const asBytes = (value: string | Uint8Array): Uint8Array =>
  typeof value === 'string' ? new TextEncoder().encode(value) : value;

export const scanProductionBrowserInputs = async (input: {
  scanner: ProductionBrowserCanaryScannerPort;
  snapshot: ExecutableProjectSnapshot;
  buildBundle: ExecutionBuildBundle;
  program: BehaviorScenarioProgram;
  securityObservationBytes?: Uint8Array;
  signal: VerificationAbortSignal;
}): Promise<string> => {
  assertDigest(input.scanner.authorityDigest, 'Canary scanner authority');
  const sources = [
    ...input.snapshot.files.map((file) => ({
      sourceKind: 'executable-source' as const,
      sourceId: file.path,
      contents: asBytes(file.contents),
    })),
    {
      sourceKind: 'behavior-program' as const,
      sourceId: input.program.scenarioId,
      contents: new TextEncoder().encode(canonicalJsonText(input.program)),
    },
    ...input.buildBundle.files.map((file) => ({
      sourceKind: 'production-bundle' as const,
      sourceId: file.path,
      contents: file.contents,
    })),
    ...(input.securityObservationBytes
      ? [
          {
            sourceKind: 'security-observation-set' as const,
            sourceId: 'security-observation-set',
            contents: input.securityObservationBytes,
          },
        ]
      : []),
  ];
  const maximumAggregateBytes = 512 * 1024 * 1024 + 256 * 1024;
  const aggregateBytes = sources.reduce(
    (total, { contents }) => total + contents.byteLength,
    0
  );
  const sourceKeys = sources.map(
    ({ sourceKind, sourceId }) => `${sourceKind}:${sourceId}`
  );
  if (
    !Number.isSafeInteger(aggregateBytes) ||
    aggregateBytes > maximumAggregateBytes ||
    new Set(sourceKeys).size !== sourceKeys.length
  ) {
    throw new TypeError(
      'Production browser canary scan sources exceed their aggregate budget or contain duplicate identities.'
    );
  }
  const contentGroups = new Map<string, (typeof sources)[number]>();
  for (const source of sources) {
    const key = `${digestBrowserVerificationBytes(source.contents)}:${source.contents.byteLength}`;
    if (!contentGroups.has(key)) contentGroups.set(key, source);
  }
  const pending = [...contentGroups.entries()];
  const receiptByContent = new Map<
    string,
    ProductionBrowserCanaryScanReceipt
  >();
  const workers = Array.from(
    { length: Math.min(4, Math.max(1, pending.length)) },
    async () => {
      while (pending.length > 0) {
        const next = pending.shift();
        if (!next) return;
        const [contentKey, source] = next;
        if (input.signal.aborted) {
          throw new Error('Production browser canary scan was aborted.');
        }
        const receipt = await input.scanner.scan(source, input.signal);
        receiptByContent.set(
          contentKey,
          assertCanaryScanReceipt(receipt, {
            contents: source.contents,
            scannerAuthorityDigest: input.scanner.authorityDigest,
          })
        );
      }
    }
  );
  await Promise.all(workers);
  const bindings = sources.map((source) => {
    const contentDigest = digestBrowserVerificationBytes(source.contents);
    const contentKey = `${contentDigest}:${source.contents.byteLength}`;
    const receipt = receiptByContent.get(contentKey);
    if (!receipt) {
      throw new Error('Production browser canary scan receipt is missing.');
    }
    return Object.freeze({
      sourceKind: source.sourceKind,
      sourceIdDigest: digestVerificationValue({ sourceId: source.sourceId }),
      contentDigest,
      byteLength: source.contents.byteLength,
      receiptDigest: receipt.receiptDigest,
    });
  });
  return digestVerificationValue(
    bindings.sort((left, right) => {
      const kind = compareUnicodeCodePoints(left.sourceKind, right.sourceKind);
      return kind !== 0
        ? kind
        : compareUnicodeCodePoints(left.sourceIdDigest, right.sourceIdDigest);
    })
  );
};

const exactLoopbackOrigin = (value: string): string => {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    url.origin !== value
  ) {
    throw new TypeError(
      'Production browser preview must use one exact 127.0.0.1 HTTP origin.'
    );
  }
  return url.origin;
};

export const createProductionBrowserRemoteExecutionEvidence = (
  value: Omit<ProductionBrowserRemoteExecutionEvidence, 'evidenceDigest'>
): ProductionBrowserRemoteExecutionEvidence => {
  const origin = exactLoopbackOrigin(value.materializedOrigin);
  const materializedEntryFilePath = normalizeExecutableProjectPath(
    value.materializedEntryFilePath
  );
  const expectedEntryUrl = new URL(
    bundlePath(materializedEntryFilePath),
    `${origin}/`
  ).href;
  if (
    !Number.isSafeInteger(value.generation) ||
    value.generation < 1 ||
    !Number.isSafeInteger(value.materializedFileCount) ||
    value.materializedFileCount < 1 ||
    value.materializedEntryUrl !== expectedEntryUrl
  ) {
    throw new TypeError(
      'Remote preview evidence generation, file count, or entry URL is invalid.'
    );
  }
  const identity = Object.freeze({
    attemptId: assertIdentifier(value.attemptId, 'Remote attempt id'),
    generation: value.generation,
    requestId: assertIdentifier(value.requestId, 'Remote request id'),
    executionId: assertIdentifier(value.executionId, 'Remote execution id'),
    snapshotDigest: assertDigest(value.snapshotDigest, 'Remote snapshot'),
    materializedBundleDigest: assertDigest(
      value.materializedBundleDigest,
      'Remote materialized bundle'
    ),
    materializedOrigin: origin,
    materializedEntryUrl: expectedEntryUrl,
    materializedEntryFilePath,
    materializedEntryDigest: assertDigest(
      value.materializedEntryDigest,
      'Remote materialized entry'
    ),
    materializedFileCount: value.materializedFileCount,
  });
  return Object.freeze({
    ...identity,
    evidenceDigest: digestVerificationValue(identity),
  });
};

export const normalizeProductionBrowserRemoteExecution = (
  value: ProductionBrowserRemoteExecutionEvidence,
  input: Readonly<{
    attemptId: string;
    generation: number;
    snapshotDigest: string;
    buildBundleDigest: string;
    entryFilePath: string;
    entryDigest: string;
    fileCount: number;
    origin: string;
  }>
): ProductionBrowserRemoteExecutionEvidence => {
  const normalized = createProductionBrowserRemoteExecutionEvidence(value);
  if (
    normalized.evidenceDigest !== value.evidenceDigest ||
    normalized.attemptId !== input.attemptId ||
    normalized.generation !== input.generation ||
    normalized.snapshotDigest !== input.snapshotDigest ||
    normalized.materializedBundleDigest !== input.buildBundleDigest ||
    normalized.materializedOrigin !== exactLoopbackOrigin(input.origin) ||
    normalized.materializedEntryFilePath !== input.entryFilePath ||
    normalized.materializedEntryDigest !== input.entryDigest ||
    normalized.materializedFileCount !== input.fileCount
  ) {
    throw new TypeError(
      'Remote preview evidence drifted from attempt, generation, snapshot, bundle, origin, or entry.'
    );
  }
  return normalized;
};

const fetchResource = async (
  url: string,
  expectedDigest: string,
  expectedByteLength: number,
  timeoutMs: number,
  signal: VerificationAbortSignal
): Promise<void> => {
  const controller = new AbortController();
  const unsubscribe = signal.subscribe(() => controller.abort());
  if (signal.aborted) controller.abort();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal,
    });
    const contentLength = response.headers.get('content-length');
    const contentEncoding = response.headers.get('content-encoding');
    if (
      (contentLength !== null &&
        (!/^(?:0|[1-9][0-9]*)$/u.test(contentLength) ||
          Number(contentLength) !== expectedByteLength)) ||
      (contentEncoding !== null && contentEncoding !== 'identity') ||
      !response.body
    ) {
      throw new TypeError(
        'Loopback preview response length or encoding drifted from its exact resource.'
      );
    }
    const bytes = new Uint8Array(expectedByteLength);
    const reader = response.body.getReader();
    let offset = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > expectedByteLength) {
        await reader.cancel();
        throw new TypeError(
          'Loopback preview response exceeded its exact byte budget.'
        );
      }
      bytes.set(value, offset);
      offset += value.byteLength;
    }
    if (
      !response.ok ||
      response.url !== url ||
      offset !== expectedByteLength ||
      digestBrowserVerificationBytes(bytes) !== expectedDigest
    ) {
      throw new TypeError(
        'Loopback preview resource drifted from its exact content address.'
      );
    }
  } finally {
    clearTimeout(timeout);
    unsubscribe();
  }
};

export const verifyProductionBrowserResources = async (input: {
  origin: string;
  snapshotDigest: string;
  resources: readonly ProductionBrowserPreviewResource[];
  timeoutMs: number;
  signal: VerificationAbortSignal;
}): Promise<BrowserRuntimeControlResourceManifest> => {
  const origin = exactLoopbackOrigin(input.origin);
  if (
    !Number.isSafeInteger(input.timeoutMs) ||
    input.timeoutMs < 100 ||
    input.timeoutMs > 30_000
  ) {
    throw new TypeError(
      'Production browser resource verification timeout must be 100..30000ms.'
    );
  }
  const resources = input.resources.map((resource) => {
    const url = new URL(resource.path, `${origin}/`).href;
    if (new URL(url).origin !== origin) {
      throw new TypeError(
        'Production browser resource escaped loopback origin.'
      );
    }
    return Object.freeze({
      url,
      kind: resource.kind,
      contentDigest: resource.contentDigest,
      byteLength: resource.contents.byteLength,
    });
  });
  const pending = [...resources];
  await Promise.all(
    Array.from(
      { length: Math.min(4, Math.max(1, pending.length)) },
      async () => {
        while (pending.length > 0) {
          const resource = pending.shift();
          if (!resource) return;
          await fetchResource(
            resource.url,
            resource.contentDigest,
            resource.byteLength,
            input.timeoutMs,
            input.signal
          );
        }
      }
    )
  );
  return createBrowserRuntimeControlResourceManifest({
    executableSnapshotDigest: input.snapshotDigest,
    resources,
  });
};

export const createProductionChromiumRuntimeAuthority = async (
  input: ProductionChromiumRuntimeAuthorityInput
): Promise<
  Readonly<{
    authority: ProductionChromiumRuntimeAuthority;
    executablePath: string;
  }>
> => {
  const executablePath = await realpath(input.executablePath);
  const expectedImage = assertPlaywrightBrowserImageAuthorityReceipt(
    input.browserImageAuthority
  );
  if (expectedImage.engine !== 'chromium') {
    throw new TypeError(
      'Production Chromium authority requires a Chromium image receipt.'
    );
  }
  const observedImage = await observePlaywrightBrowserImageAuthority({
    engine: 'chromium',
    executablePath,
  });
  assertPlaywrightBrowserImageAuthorityReceipt(
    observedImage,
    expectedImage.imageDigest
  );
  const baseIdentity = normalizeBrowserVerificationRuntimeIdentity({
    machineClass: input.machineClass,
    operatingSystemImageDigest: input.operatingSystemImageDigest,
    browserImageDigest: expectedImage.imageDigest,
    browserEngine: 'chromium',
    browserVersion: input.browserVersion,
    fontSetDigest: input.fontSetDigest,
    viewport: Object.freeze({
      widthCssPixels: 1,
      heightCssPixels: 1,
      devicePixelRatio: input.devicePixelRatio,
    }),
    colorScheme: 'light',
    motionPreference: 'full',
    locale: 'en-US',
    cacheClass: input.cacheClass,
    rendererGeneration: input.rendererGeneration,
    normalizer: input.normalizer,
  });
  const executablePathBindingDigest = digestVerificationValue({
    executablePath,
  });
  const identity = Object.freeze({
    format: PRODUCTION_CHROMIUM_RUNTIME_AUTHORITY_FORMAT,
    version: PRODUCTION_CHROMIUM_RUNTIME_AUTHORITY_VERSION,
    browserEngine: 'chromium' as const,
    machineClass: baseIdentity.machineClass,
    operatingSystemImageDigest: baseIdentity.operatingSystemImageDigest,
    browserVersion: baseIdentity.browserVersion,
    fontSetDigest: baseIdentity.fontSetDigest,
    devicePixelRatio: baseIdentity.viewport.devicePixelRatio,
    cacheClass: baseIdentity.cacheClass,
    rendererGeneration: baseIdentity.rendererGeneration,
    normalizer: baseIdentity.normalizer,
    browserImageAuthority: expectedImage,
    executablePathBindingDigest,
  });
  return Object.freeze({
    executablePath,
    authority: Object.freeze({
      ...identity,
      authorityDigest: digestVerificationValue(identity),
    }),
  });
};

export const createProductionBrowserRuntimeIdentity = (
  authority: ProductionChromiumRuntimeAuthority,
  cell: VerificationPlanCell
): BrowserVerificationRuntimeIdentity =>
  normalizeBrowserVerificationRuntimeIdentity({
    machineClass: authority.machineClass,
    operatingSystemImageDigest: authority.operatingSystemImageDigest,
    browserImageDigest: authority.browserImageAuthority.imageDigest,
    browserEngine: 'chromium',
    browserVersion: authority.browserVersion,
    fontSetDigest: authority.fontSetDigest,
    viewport: Object.freeze({
      widthCssPixels: cell.viewport.width,
      heightCssPixels: cell.viewport.height,
      devicePixelRatio: authority.devicePixelRatio,
    }),
    colorScheme: cell.colorScheme,
    motionPreference: cell.motion,
    locale: cell.locale,
    cacheClass: authority.cacheClass,
    rendererGeneration: authority.rendererGeneration,
    normalizer: authority.normalizer,
  });

export const sameProductionChromiumRuntimeAuthority = (
  left: ProductionChromiumRuntimeAuthority,
  right: ProductionChromiumRuntimeAuthority
): boolean => sameCanonicalJson(left, right);

export const createRemoteRuntimeControlBinding = (
  evidence: ProductionBrowserRemoteExecutionEvidence
): import('./browserRuntimeControlPort').BrowserRuntimeControlRemoteBinding => {
  const identity = Object.freeze({
    attemptId: evidence.attemptId,
    requestId: evidence.requestId,
    executionId: evidence.executionId,
    snapshotDigest: evidence.snapshotDigest,
    materializedBundleDigest: evidence.materializedBundleDigest,
    materializedOriginDigest: createBrowserVerificationOriginDigest(
      evidence.materializedOrigin
    ),
    materializedEntryDigest: evidence.materializedEntryDigest,
  });
  return Object.freeze({
    ...identity,
    bindingDigest: digestVerificationValue(identity),
  });
};
