import {
  decodeExecutionBuildBundle,
  decodeExecutionFilesystemDiff,
  EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
  EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE,
} from '@prodivix/runtime-core';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  CONTROLLED_STATIC_ROOTLESS_DIGEST_PATTERN,
  controlledStaticRootlessDigestBytes,
  controlledStaticRootlessExactRecord,
  decodeControlledStaticRootlessCanonicalBase64,
  type ControlledStaticRootlessRequest,
} from './controlledStaticRootlessRequestProtocol';
import {
  CONTROLLED_STATIC_ROOTLESS_NODE_VERSION,
  controlledStaticRootlessResultAllowlist,
  type ControlledStaticRootlessCommandReceipt,
  type ControlledStaticRootlessProcessOutput,
  type ControlledStaticRootlessStage,
  type ControlledStaticRootlessStageAuthority,
} from './controlledStaticRootlessStageAuthority';

export type ControlledStaticRootlessPackageImportAuthority = Readonly<{
  format: 'prodivix.controlled-static-rootless-package-import-authority.v1';
  producerStage: 'install';
  requestDigest: string;
  snapshotDigest: string;
  projectManifestDigest: string;
  lockDigest: string;
  toolchainFileSetDigest: string;
  rollupVersion: '4.62.3';
  rollupImplementation: '@rollup/wasm-node';
  rollupAliasSpec: 'npm:@rollup/wasm-node@4.62.3';
  esbuildVersion: '0.27.7';
  esbuildImplementation: 'esbuild-wasm';
  esbuildAliasSpec: 'npm:esbuild-wasm@0.27.7';
  archivePath: '.prodivix/package-import.json.gz';
  archiveDigest: string;
  archiveByteLength: number;
  contentDigest: string;
  manifestDigest: string;
  fileSetDigest: string;
  entryCount: number;
  totalFileBytes: number;
  maximumDepth: number;
  installStageAuthorityDigest: string;
  authorityDigest: string;
  bytes: Buffer;
}>;

export type DecodedControlledStaticRootlessStage = Readonly<{
  environment: Readonly<{ keys: readonly string[]; digest: string }>;
  command: ControlledStaticRootlessCommandReceipt;
  nodeBinaryDigest: string;
  inputFileSetDigest: string;
  inputFileCount: number;
  resultSetDigest: string;
  innerAuthorityDigest: string;
  innerCleanupClaim: ControlledStaticRootlessStageAuthority['innerCleanupClaim'];
  packageImportResult: Readonly<{
    path: 'results/package-import.json.gz';
    digest: string;
    size: number;
    contentDigest: string;
    manifestDigest: string;
    fileSetDigest: string;
    entryCount: number;
    totalFileBytes: number;
    maximumDepth: number;
  }> | null;
  isolationResult: Readonly<Record<string, unknown>> | null;
  outputFiles: ReadonlyMap<
    string,
    ReturnType<typeof decodeExecutionBuildBundle>['files'][number]
  >;
}>;

const expectedCommand = (
  request: ControlledStaticRootlessRequest,
  stage: ControlledStaticRootlessStage
): Readonly<{
  application: string;
  args: readonly string[];
  tool: ControlledStaticRootlessCommandReceipt['tool'];
}> => {
  const nodeTool = (
    subjectBinary: string,
    subjectVersion: string
  ): ControlledStaticRootlessCommandReceipt['tool'] =>
    Object.freeze({
      binary: 'node',
      version: CONTROLLED_STATIC_ROOTLESS_NODE_VERSION,
      subjectBinary,
      subjectVersion,
    });
  if (stage === 'version') {
    return Object.freeze({
      application: 'pnpm',
      args: Object.freeze(['--version']),
      tool: Object.freeze({
        binary: 'pnpm',
        version: request.toolchain.pnpmVersion,
      }),
    });
  }
  if (stage === 'install') {
    return Object.freeze({
      application: 'pnpm',
      args: Object.freeze([
        'install',
        '--frozen-lockfile',
        '--offline',
        '--ignore-scripts',
        '--store-dir=/opt/prodivix/pnpm-store',
      ]),
      tool: Object.freeze({
        binary: 'pnpm',
        version: request.toolchain.pnpmVersion,
      }),
    });
  }
  if (stage === 'isolation') {
    return Object.freeze({
      application: 'node',
      args: Object.freeze(['.prodivix/isolation-probe.mjs']),
      tool: nodeTool(
        '.prodivix/isolation-probe.mjs',
        request.toolchain.isolationProbeDigest
      ),
    });
  }
  if (stage === 'typecheck') {
    const isVue =
      (request.target as { presetId?: unknown }).presetId === 'vue-vite';
    const subject = isVue
      ? 'node_modules/vue-tsc/bin/vue-tsc.js'
      : 'node_modules/typescript/bin/tsc';
    return Object.freeze({
      application: 'node',
      args: Object.freeze([subject, ...(isVue ? ['--noEmit'] : ['-b'])]),
      tool: nodeTool(subject, request.toolchain.typescriptVersion),
    });
  }
  if (stage === 'build') {
    const subject = 'node_modules/vite/bin/vite.js';
    return Object.freeze({
      application: 'node',
      args: Object.freeze([
        subject,
        'build',
        '--config=.prodivix/controlled-vite.config.mjs',
      ]),
      tool: nodeTool(subject, request.toolchain.viteVersion),
    });
  }
  const subject = 'node_modules/vitest/vitest.mjs';
  return Object.freeze({
    application: 'node',
    args: Object.freeze([
      subject,
      'run',
      '--config=.prodivix/controlled-vite.config.mjs',
      '--reporter=default',
      '--reporter=json',
      '--no-file-parallelism',
      '--pool=threads',
      `--outputFile.json=${request.testReportFilePath}`,
      '--coverage',
      '--coverage.provider=v8',
      '--coverage.reporter=json-summary',
      '--coverage.reportsDirectory=.prodivix/coverage',
    ]),
    tool: nodeTool(subject, request.toolchain.vitestVersion),
  });
};

const decodeProcessOutput = (
  value: unknown,
  label: string
): ControlledStaticRootlessProcessOutput => {
  const output = controlledStaticRootlessExactRecord(
    value,
    ['digest', 'byteLength', 'capturedByteLength', 'truncated'],
    label
  );
  if (
    typeof output.digest !== 'string' ||
    !CONTROLLED_STATIC_ROOTLESS_DIGEST_PATTERN.test(output.digest) ||
    !Number.isSafeInteger(output.byteLength) ||
    (output.byteLength as number) < 0 ||
    output.capturedByteLength !== output.byteLength ||
    output.truncated !== false
  ) {
    throw new TypeError(`${label} drifted.`);
  }
  return Object.freeze({
    digest: output.digest,
    byteLength: output.byteLength as number,
    capturedByteLength: output.byteLength as number,
    truncated: false,
  });
};

const decodeInnerCommand = (
  value: unknown,
  request: ControlledStaticRootlessRequest,
  stage: ControlledStaticRootlessStage
): ControlledStaticRootlessCommandReceipt => {
  const command = controlledStaticRootlessExactRecord(
    value,
    [
      'stage',
      'application',
      'args',
      'cwd',
      'executionBoundary',
      'environmentDigest',
      'tool',
      'startedAtEpochMs',
      'completedAtEpochMs',
      'exitCode',
      'signal',
      'timedOut',
      'stdout',
      'stderr',
    ],
    `Controlled rootless ${stage} command`
  );
  const expected = expectedCommand(request, stage);
  const tool = controlledStaticRootlessExactRecord(
    command.tool,
    stage === 'version' || stage === 'install'
      ? ['binary', 'version']
      : ['binary', 'version', 'subjectBinary', 'subjectVersion'],
    `Controlled rootless ${stage} tool`
  );
  if (
    command.stage !== stage ||
    command.application !== expected.application ||
    !sameCanonicalJson(command.args, expected.args) ||
    command.cwd !== 'workspace:/' ||
    command.executionBoundary !== 'sandbox' ||
    typeof command.environmentDigest !== 'string' ||
    !CONTROLLED_STATIC_ROOTLESS_DIGEST_PATTERN.test(
      command.environmentDigest
    ) ||
    !sameCanonicalJson(tool, expected.tool) ||
    !Number.isSafeInteger(command.startedAtEpochMs) ||
    !Number.isSafeInteger(command.completedAtEpochMs) ||
    (command.completedAtEpochMs as number) <
      (command.startedAtEpochMs as number) ||
    command.exitCode !== 0 ||
    command.signal !== null ||
    command.timedOut !== false
  ) {
    throw new TypeError(
      `Controlled rootless ${stage} command authority drifted.`
    );
  }
  return Object.freeze({
    stage,
    application: expected.application,
    args: expected.args,
    cwd: 'workspace:/',
    executionBoundary: 'sandbox',
    environmentDigest: command.environmentDigest,
    tool: expected.tool,
    startedAtEpochMs: command.startedAtEpochMs as number,
    completedAtEpochMs: command.completedAtEpochMs as number,
    exitCode: 0,
    signal: null,
    timedOut: false,
    stdout: decodeProcessOutput(
      command.stdout,
      `Controlled rootless ${stage} stdout`
    ),
    stderr: decodeProcessOutput(
      command.stderr,
      `Controlled rootless ${stage} stderr`
    ),
  });
};

const assertStageOutputAllowlist = (
  stage: ControlledStaticRootlessStage,
  paths: readonly string[]
): void => {
  const sorted = [...paths].sort(compareUnicodeCodePoints);
  const exact =
    stage === 'version' || stage === 'typecheck'
      ? ['authority.json']
      : stage === 'install'
        ? ['authority.json', 'results/package-import.json.gz']
        : stage === 'isolation'
          ? ['authority.json', 'results/isolation.json']
          : stage === 'test'
            ? [
                'authority.json',
                'results/coverage-summary.json',
                'results/test-report.json',
              ]
            : undefined;
  if (
    (exact && !sameCanonicalJson(sorted, exact)) ||
    (stage === 'build' &&
      (!sorted.includes('authority.json') ||
        !sorted.includes('results/build-log.txt') ||
        !sorted.some((path) => path.startsWith('results/build/')) ||
        sorted.some(
          (path) =>
            path !== 'authority.json' &&
            path !== 'results/build-log.txt' &&
            !path.startsWith('results/build/')
        )))
  ) {
    throw new TypeError(
      `Controlled rootless ${stage} result allowlist drifted.`
    );
  }
};

export const decodeControlledStaticRootlessStageResult = (
  source: Buffer,
  request: ControlledStaticRootlessRequest,
  stage: ControlledStaticRootlessStage,
  ordinal: number,
  providerFileSetDigest: string,
  providerFileCount: number,
  expectedPackageImport:
    ControlledStaticRootlessPackageImportAuthority | undefined
): DecodedControlledStaticRootlessStage => {
  let sandboxResult: unknown;
  try {
    sandboxResult = JSON.parse(source.toString('utf8')) as unknown;
  } catch {
    throw new TypeError(
      `Controlled rootless ${stage} sandbox result is invalid.`
    );
  }
  const result = controlledStaticRootlessExactRecord(
    sandboxResult,
    [
      'protocol',
      'exitCode',
      'stdout',
      'stderr',
      'outputTruncated',
      'artifacts',
    ],
    `Controlled rootless ${stage} sandbox result`
  );
  if (
    result.protocol !== 'prodivix.sandbox-result.v1' ||
    result.exitCode !== 0 ||
    result.outputTruncated !== false ||
    !Array.isArray(result.artifacts) ||
    result.artifacts.length !== 2 ||
    decodeControlledStaticRootlessCanonicalBase64(
      result.stdout,
      'Sandbox stdout'
    ).byteLength !== 0 ||
    decodeControlledStaticRootlessCanonicalBase64(
      result.stderr,
      'Sandbox stderr'
    ).byteLength !== 0
  ) {
    throw new TypeError(`Controlled rootless ${stage} sandbox failed closed.`);
  }
  const artifacts = result.artifacts.map((artifact, index) =>
    controlledStaticRootlessExactRecord(
      artifact,
      ['artifactId', 'kind', 'label', 'mediaType', 'metadata', 'contents'],
      `Controlled rootless ${stage} artifact ${index}`
    )
  );
  const primary = artifacts.find(
    ({ mediaType }) => mediaType === EXECUTION_BUILD_BUNDLE_MEDIA_TYPE
  );
  const filesystem = artifacts.find(
    ({ mediaType }) => mediaType === EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE
  );
  if (
    !primary ||
    !filesystem ||
    typeof primary.contents !== 'string' ||
    typeof filesystem.contents !== 'string'
  ) {
    throw new TypeError(`Controlled rootless ${stage} artifact set drifted.`);
  }
  const filesystemDiff = decodeExecutionFilesystemDiff(
    decodeControlledStaticRootlessCanonicalBase64(
      filesystem.contents,
      `Controlled rootless ${stage} filesystem diff`
    )
  );
  if (
    filesystemDiff.snapshotDigest !== request.snapshotDigest ||
    filesystemDiff.complete !== true ||
    filesystemDiff.changes.length !== 0
  ) {
    throw new TypeError(
      `Controlled rootless ${stage} stage leaked filesystem results.`
    );
  }
  const buildBundle = decodeExecutionBuildBundle(
    decodeControlledStaticRootlessCanonicalBase64(
      primary.contents,
      `Controlled rootless ${stage} output bundle`
    )
  );
  if (
    buildBundle.snapshotDigest !== request.snapshotDigest ||
    !sameCanonicalJson(buildBundle.target, request.target)
  ) {
    throw new TypeError(
      `Controlled rootless ${stage} output identity drifted.`
    );
  }
  assertStageOutputAllowlist(
    stage,
    buildBundle.files.map(({ path }) => path)
  );
  const outputFiles = new Map(
    buildBundle.files.map((file) => [file.path, file] as const)
  );
  const authorityFile = outputFiles.get('authority.json');
  if (!authorityFile) {
    throw new TypeError(
      `Controlled rootless ${stage} inner authority is missing.`
    );
  }
  let authorityValue: unknown;
  try {
    authorityValue = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(authorityFile.contents)
    ) as unknown;
  } catch {
    throw new TypeError(
      `Controlled rootless ${stage} inner authority is invalid.`
    );
  }
  const authority = controlledStaticRootlessExactRecord(
    authorityValue,
    [
      'format',
      'stage',
      'ordinal',
      'requestDigest',
      'snapshotDigest',
      'input',
      'environment',
      'command',
      'nodeBinaryDigest',
      'results',
      'innerProcessObservation',
    ],
    `Controlled rootless ${stage} inner authority`
  );
  const input = controlledStaticRootlessExactRecord(
    authority.input,
    [
      'fileSetDigest',
      'fileCount',
      'freshBaseline',
      'packageImport',
      'toolchainBinding',
    ],
    `Controlled rootless ${stage} input authority`
  );
  const toolchainBinding = controlledStaticRootlessExactRecord(
    input.toolchainBinding,
    [
      'manifestDigest',
      'lockDigest',
      'toolchainFileSetDigest',
      'rollupVersion',
      'rollupImplementation',
      'rollupAliasSpec',
      'esbuildVersion',
      'esbuildImplementation',
      'esbuildAliasSpec',
    ],
    `Controlled rootless ${stage} toolchain binding`
  );
  const fresh = controlledStaticRootlessExactRecord(
    input.freshBaseline,
    [
      'nodeModulesAbsent',
      'buildOutputAbsent',
      'testOutputAbsent',
      'coverageOutputAbsent',
      'controlledOutputAbsent',
      'priorStageResultCount',
      'forbiddenPaths',
    ],
    `Controlled rootless ${stage} fresh baseline`
  );
  if (
    authority.format !==
      'prodivix.controlled-static-rootless-inner-stage-authority.v1' ||
    authority.stage !== stage ||
    authority.ordinal !== ordinal ||
    authority.requestDigest !== request.requestDigest ||
    authority.snapshotDigest !== request.snapshotDigest ||
    input.fileSetDigest !== providerFileSetDigest ||
    input.fileCount !== providerFileCount ||
    fresh.nodeModulesAbsent !== true ||
    fresh.buildOutputAbsent !== true ||
    fresh.testOutputAbsent !== true ||
    fresh.coverageOutputAbsent !== true ||
    fresh.controlledOutputAbsent !== true ||
    fresh.priorStageResultCount !== 0 ||
    !Array.isArray(fresh.forbiddenPaths) ||
    fresh.forbiddenPaths.length !== 0 ||
    toolchainBinding.manifestDigest !== request.toolchain.manifestDigest ||
    toolchainBinding.lockDigest !== request.toolchain.lockDigest ||
    toolchainBinding.toolchainFileSetDigest !==
      request.toolchain.toolchainFileSetDigest ||
    toolchainBinding.rollupVersion !== request.toolchain.rollupVersion ||
    toolchainBinding.rollupImplementation !==
      request.toolchain.rollupImplementation ||
    toolchainBinding.rollupAliasSpec !== request.toolchain.rollupAliasSpec ||
    toolchainBinding.esbuildVersion !== request.toolchain.esbuildVersion ||
    toolchainBinding.esbuildImplementation !==
      request.toolchain.esbuildImplementation ||
    toolchainBinding.esbuildAliasSpec !== request.toolchain.esbuildAliasSpec
  ) {
    throw new TypeError(
      `Controlled rootless ${stage} fresh baseline authority drifted.`
    );
  }
  const expectedPackageImportValue = expectedPackageImport
    ? {
        path: expectedPackageImport.archivePath,
        digest: expectedPackageImport.archiveDigest,
        byteLength: expectedPackageImport.archiveByteLength,
        contentDigest: expectedPackageImport.contentDigest,
        manifestDigest: expectedPackageImport.manifestDigest,
        fileSetDigest: expectedPackageImport.fileSetDigest,
        entryCount: expectedPackageImport.entryCount,
        totalFileBytes: expectedPackageImport.totalFileBytes,
        maximumDepth: expectedPackageImport.maximumDepth,
      }
    : null;
  if (!sameCanonicalJson(input.packageImport, expectedPackageImportValue)) {
    throw new TypeError(
      `Controlled rootless ${stage} package import authority drifted.`
    );
  }
  const environment = controlledStaticRootlessExactRecord(
    authority.environment,
    ['keys', 'digest'],
    `Controlled rootless ${stage} environment`
  );
  const expectedEnvironmentKeys =
    ordinal < 2
      ? [
          'BUN_INSTALL_CACHE_DIR',
          'HOME',
          'PATH',
          'YARN_CACHE_FOLDER',
          'npm_config_cache',
          'npm_config_store_dir',
        ]
      : ['HOME', 'PATH'];
  if (
    !sameCanonicalJson(environment.keys, expectedEnvironmentKeys) ||
    typeof environment.digest !== 'string' ||
    !CONTROLLED_STATIC_ROOTLESS_DIGEST_PATTERN.test(environment.digest)
  ) {
    throw new TypeError(`Controlled rootless ${stage} environment drifted.`);
  }
  const command = decodeInnerCommand(authority.command, request, stage);
  if (command.environmentDigest !== environment.digest) {
    throw new TypeError(
      `Controlled rootless ${stage} command environment drifted.`
    );
  }
  const results = controlledStaticRootlessExactRecord(
    authority.results,
    ['allowlist', 'files', 'resultSetDigest', 'packageImport', 'isolation'],
    `Controlled rootless ${stage} results`
  );
  if (
    !sameCanonicalJson(
      results.allowlist,
      controlledStaticRootlessResultAllowlist(stage)
    ) ||
    !Array.isArray(results.files)
  ) {
    throw new TypeError(
      `Controlled rootless ${stage} semantic result allowlist drifted.`
    );
  }
  const actualResultFacts = buildBundle.files
    .filter(({ path }) => path !== 'authority.json')
    .map(({ path, size, digest }) => ({ path, size, digest }))
    .sort((left, right) => compareUnicodeCodePoints(left.path, right.path));
  if (
    !sameCanonicalJson(results.files, actualResultFacts) ||
    results.resultSetDigest !==
      controlledStaticRootlessDigestBytes(canonicalJsonText(actualResultFacts))
  ) {
    throw new TypeError(
      `Controlled rootless ${stage} result file authority drifted.`
    );
  }
  const innerProcess = controlledStaticRootlessExactRecord(
    authority.innerProcessObservation,
    ['source', 'directCommandCount', 'residualProcessCount', 'cleanupVerified'],
    `Controlled rootless ${stage} inner cleanup claim`
  );
  if (
    innerProcess.source !== 'sandbox-self-report' ||
    innerProcess.directCommandCount !== 1 ||
    innerProcess.residualProcessCount !== 0 ||
    innerProcess.cleanupVerified !== true
  ) {
    throw new TypeError(
      `Controlled rootless ${stage} inner cleanup observation drifted.`
    );
  }
  if (
    typeof authority.nodeBinaryDigest !== 'string' ||
    !CONTROLLED_STATIC_ROOTLESS_DIGEST_PATTERN.test(authority.nodeBinaryDigest)
  ) {
    throw new TypeError(
      `Controlled rootless ${stage} Node binary authority drifted.`
    );
  }
  const packageImportResult =
    results.packageImport === null
      ? null
      : controlledStaticRootlessExactRecord(
          results.packageImport,
          [
            'path',
            'digest',
            'size',
            'contentDigest',
            'manifestDigest',
            'fileSetDigest',
            'entryCount',
            'totalFileBytes',
            'maximumDepth',
          ],
          'Controlled rootless package import result'
        );
  if (
    (stage === 'install') !== (packageImportResult !== null) ||
    (stage !== 'isolation') !== (results.isolation === null)
  ) {
    throw new TypeError(
      `Controlled rootless ${stage} stage-specific result drifted.`
    );
  }
  return Object.freeze({
    environment: Object.freeze({
      keys: Object.freeze([...(environment.keys as string[])]),
      digest: environment.digest,
    }),
    command,
    nodeBinaryDigest: authority.nodeBinaryDigest,
    inputFileSetDigest: input.fileSetDigest as string,
    inputFileCount: input.fileCount as number,
    resultSetDigest: results.resultSetDigest as string,
    innerAuthorityDigest: controlledStaticRootlessDigestBytes(
      authorityFile.contents
    ),
    innerCleanupClaim: Object.freeze({
      source: 'sandbox-self-report',
      directCommandCount: 1,
      residualProcessCount: 0,
      cleanupVerified: true,
    }),
    packageImportResult:
      packageImportResult === null
        ? null
        : Object.freeze({
            path: packageImportResult.path as 'results/package-import.json.gz',
            digest: packageImportResult.digest as string,
            size: packageImportResult.size as number,
            contentDigest: packageImportResult.contentDigest as string,
            manifestDigest: packageImportResult.manifestDigest as string,
            fileSetDigest: packageImportResult.fileSetDigest as string,
            entryCount: packageImportResult.entryCount as number,
            totalFileBytes: packageImportResult.totalFileBytes as number,
            maximumDepth: packageImportResult.maximumDepth as number,
          }),
    isolationResult:
      results.isolation === null
        ? null
        : Object.freeze({
            ...(results.isolation as Record<string, unknown>),
          }),
    outputFiles,
  });
};

export const createControlledStaticRootlessPackageImportAuthority = (input: {
  request: ControlledStaticRootlessRequest;
  decoded: DecodedControlledStaticRootlessStage;
  installStageAuthorityDigest: string;
}): ControlledStaticRootlessPackageImportAuthority => {
  const result = input.decoded.packageImportResult;
  const file = result ? input.decoded.outputFiles.get(result.path) : undefined;
  if (
    !result ||
    !file ||
    file.digest !== result.digest ||
    file.size !== result.size ||
    result.path !== 'results/package-import.json.gz' ||
    !CONTROLLED_STATIC_ROOTLESS_DIGEST_PATTERN.test(result.contentDigest) ||
    !CONTROLLED_STATIC_ROOTLESS_DIGEST_PATTERN.test(result.manifestDigest) ||
    !CONTROLLED_STATIC_ROOTLESS_DIGEST_PATTERN.test(result.fileSetDigest) ||
    !CONTROLLED_STATIC_ROOTLESS_DIGEST_PATTERN.test(
      input.installStageAuthorityDigest
    ) ||
    !Number.isSafeInteger(result.entryCount) ||
    result.entryCount < 1 ||
    !Number.isSafeInteger(result.totalFileBytes) ||
    result.totalFileBytes < 1 ||
    !Number.isSafeInteger(result.maximumDepth) ||
    result.maximumDepth < 1
  ) {
    throw new TypeError('Controlled rootless package import result drifted.');
  }
  const base = Object.freeze({
    format:
      'prodivix.controlled-static-rootless-package-import-authority.v1' as const,
    producerStage: 'install' as const,
    requestDigest: input.request.requestDigest,
    snapshotDigest: input.request.snapshotDigest,
    projectManifestDigest: input.request.toolchain.manifestDigest,
    lockDigest: input.request.toolchain.lockDigest,
    toolchainFileSetDigest: input.request.toolchain.toolchainFileSetDigest,
    rollupVersion: input.request.toolchain.rollupVersion,
    rollupImplementation: input.request.toolchain.rollupImplementation,
    rollupAliasSpec: input.request.toolchain.rollupAliasSpec,
    esbuildVersion: input.request.toolchain.esbuildVersion,
    esbuildImplementation: input.request.toolchain.esbuildImplementation,
    esbuildAliasSpec: input.request.toolchain.esbuildAliasSpec,
    archivePath: '.prodivix/package-import.json.gz' as const,
    archiveDigest: result.digest,
    archiveByteLength: result.size,
    contentDigest: result.contentDigest,
    manifestDigest: result.manifestDigest,
    fileSetDigest: result.fileSetDigest,
    entryCount: result.entryCount,
    totalFileBytes: result.totalFileBytes,
    maximumDepth: result.maximumDepth,
    installStageAuthorityDigest: input.installStageAuthorityDigest,
  });
  return Object.freeze({
    ...base,
    authorityDigest: controlledStaticRootlessDigestBytes(
      canonicalJsonText(base)
    ),
    bytes: Buffer.from(file.contents),
  });
};
