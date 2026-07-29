import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { verifyRootlessPodmanEngine } from '../src/rootlessPodmanSandbox';
import { runControlledStaticRootlessPodmanStage } from './controlledStaticRootlessPodmanStageController';
import {
  CONTROLLED_STATIC_ROOTLESS_RESULT_FORMAT as RESULT_FORMAT,
  controlledStaticRootlessDigestBytes as digestBytes,
  decodeControlledStaticRootlessRequest as decodeRequest,
  readControlledStaticRootlessStdin as readStdin,
  type ControlledStaticRootlessEncodedFile as EncodedFile,
} from './controlledStaticRootlessRequestProtocol';
import {
  createControlledStaticRootlessPackageImportAuthority,
  decodeControlledStaticRootlessStageResult as decodeStageSandboxResult,
  type ControlledStaticRootlessPackageImportAuthority as PackageImportAuthority,
  type DecodedControlledStaticRootlessStage as DecodedInnerStage,
} from './controlledStaticRootlessStageResult';
import {
  assertControlledStaticRootlessStageAuthoritySequence,
  CONTROLLED_STATIC_ROOTLESS_NODE_VERSION as CONTROLLED_NODE_VERSION,
  CONTROLLED_STATIC_ROOTLESS_STAGE_ORDER,
  createControlledStaticRootlessAggregateAuthority,
  createControlledStaticRootlessStageAuthority,
  type ControlledStaticRootlessStage,
  type ControlledStaticRootlessStageAuthority,
} from './controlledStaticRootlessStageAuthority';

const execFileAsync = promisify(execFile);
const OCI_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const OCI_BARE_DIGEST_PATTERN = /^[a-f0-9]{64}$/u;

type CompletedStage = Readonly<{
  stage: ControlledStaticRootlessStage;
  ordinal: number;
  decoded: DecodedInnerStage;
  authority: ControlledStaticRootlessStageAuthority;
}>;

const podmanEnvironment = (): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of [
    'PATH',
    'HOME',
    'XDG_RUNTIME_DIR',
    'DBUS_SESSION_BUS_ADDRESS',
    'CONTAINERS_CONF',
    'CONTAINERS_STORAGE_CONF',
  ] as const) {
    const value = process.env[key];
    if (value) environment[key] = value;
  }
  return environment;
};

const providerImageReference = (): string => {
  const value = process.env.PRODIVIX_CONTROLLED_STATIC_SANDBOX_IMAGE;
  if (!value || !OCI_DIGEST_PATTERN.test(value)) {
    throw new Error(
      'Controlled static rootless sandbox image authority is unavailable.'
    );
  }
  return value;
};

const inspectImage = async (
  imageReference: string,
  environment: NodeJS.ProcessEnv
): Promise<string> => {
  const { stdout } = await execFileAsync(
    'podman',
    ['image', 'inspect', '--format', '{{.Id}}', imageReference],
    { env: environment }
  );
  const inspectedImageId = stdout.trim();
  const imageId = OCI_BARE_DIGEST_PATTERN.test(inspectedImageId)
    ? `sha256:${inspectedImageId}`
    : inspectedImageId;
  if (imageId !== imageReference) {
    throw new Error(
      'Controlled static rootless sandbox image identity drifted.'
    );
  }
  return imageId;
};

const readToolchainScript = async (
  repoRoot: string,
  name: string
): Promise<EncodedFile> => {
  const sourcePath = resolve(
    repoRoot,
    'packages/verification-adapters/scripts/toolchains',
    name
  );
  const contents = new Uint8Array(await readFile(sourcePath));
  return Object.freeze({
    path: `.prodivix/${name
      .replace('controlledStaticSandbox', 'controlled-static-sandbox-')
      .replace(
        /^controlled-static-sandbox-Runtime/u,
        'controlled-static-sandbox-runtime'
      )
      .replace(
        /^controlled-static-sandbox-Install/u,
        'controlled-static-sandbox-install'
      )
      .replace(
        /^controlled-static-sandbox-Execute/u,
        'controlled-static-sandbox-execute'
      )}`,
    size: contents.byteLength,
    digest: digestBytes(contents),
    encoding: 'base64',
    contents: Buffer.from(contents).toString('base64'),
  });
};

const readProviderScript = async (
  repoRoot: string,
  name: string,
  outputPath: string
): Promise<EncodedFile> => {
  const contents = new Uint8Array(
    await readFile(resolve(repoRoot, 'apps/remote-runner-worker/scripts', name))
  );
  return Object.freeze({
    path: outputPath,
    size: contents.byteLength,
    digest: digestBytes(contents),
    encoding: 'base64',
    contents: Buffer.from(contents).toString('base64'),
  });
};

const providerEnvironmentAuthority = (
  environment: NodeJS.ProcessEnv
): Readonly<{ keys: readonly string[]; digest: string }> => {
  const keys = Object.freeze(
    Object.keys(environment).sort(compareUnicodeCodePoints)
  );
  return Object.freeze({
    keys,
    digest: digestBytes(
      canonicalJsonText(
        Object.fromEntries(keys.map((key) => [key, environment[key] ?? '']))
      )
    ),
  });
};

const encodedFileSetDigest = (files: readonly EncodedFile[]): string =>
  digestBytes(
    canonicalJsonText(
      [...files]
        .map(({ path, size, digest }) => ({ path, size, digest }))
        .sort((left, right) => compareUnicodeCodePoints(left.path, right.path))
    )
  );

const aggregateEnvironment = (
  stages: readonly CompletedStage[],
  phase: 'install' | 'execution'
): Readonly<{ keys: readonly string[]; digest: string }> => {
  const selected = phase === 'install' ? stages.slice(0, 2) : stages.slice(2);
  const keys = selected[0]?.decoded.environment.keys;
  if (
    !keys ||
    selected.some(
      ({ decoded }) => !sameCanonicalJson(decoded.environment.keys, keys)
    )
  ) {
    throw new TypeError(
      `Controlled rootless ${phase} environment keys drifted.`
    );
  }
  return Object.freeze({
    keys,
    digest: digestBytes(
      canonicalJsonText({
        phase,
        stages: selected.map(({ stage, decoded }) => ({
          stage,
          digest: decoded.environment.digest,
        })),
      })
    ),
  });
};

const run = async (): Promise<string> => {
  if (
    process.platform !== 'linux' ||
    !process.getuid ||
    !process.getgid ||
    process.getuid() === 0
  ) {
    throw new Error(
      'Controlled static rootless sandbox requires non-root Linux.'
    );
  }
  const uid = process.getuid();
  const gid = process.getgid();
  const source = await readStdin();
  const request = decodeRequest(source);
  const imageReference = providerImageReference();
  const environment = podmanEnvironment();
  const providerEnvironment = providerEnvironmentAuthority(environment);
  await verifyRootlessPodmanEngine('podman');
  const [{ stdout: podmanVersionSource }, imageDigest] = await Promise.all([
    execFileAsync('podman', ['version', '--format', '{{.Client.Version}}'], {
      env: environment,
    }),
    inspectImage(imageReference, environment),
  ]);
  const podmanVersion = podmanVersionSource.trim();
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/u.test(podmanVersion)) {
    throw new Error('Rootless Podman returned an invalid version.');
  }
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const [runtimeScript, stageWorker, packageImportWorker] = await Promise.all([
    readToolchainScript(repoRoot, 'controlledStaticSandboxRuntime.mjs'),
    readProviderScript(
      repoRoot,
      'controlledStaticRootlessStageWorker.mjs',
      '.prodivix/controlled-static-rootless-stage-worker.mjs'
    ),
    readProviderScript(
      repoRoot,
      'controlledStaticRootlessPackageImport.mjs',
      '.prodivix/controlledStaticRootlessPackageImport.mjs'
    ),
  ]);
  const baseFiles = [
    ...request.files,
    runtimeScript,
    stageWorker,
    packageImportWorker,
  ];
  const isolationProbe = baseFiles.find(
    ({ path }) => path === '.prodivix/isolation-probe.mjs'
  );
  if (
    !isolationProbe ||
    isolationProbe.digest !== request.toolchain.isolationProbeDigest
  ) {
    throw new TypeError('Rootless sandbox isolation probe authority drifted.');
  }
  const sourceBaselineDigest = encodedFileSetDigest(baseFiles);
  const completed: CompletedStage[] = [];
  let packageImport: PackageImportAuthority | undefined;
  for (const [
    ordinal,
    stage,
  ] of CONTROLLED_STATIC_ROOTLESS_STAGE_ORDER.entries()) {
    const execution = await runControlledStaticRootlessPodmanStage({
      request,
      stage,
      ordinal,
      baseFiles,
      packageImport,
      imageReference,
      imageDigest,
      uid,
      gid,
      environment,
      environmentDigest: providerEnvironment.digest,
    });
    const decoded = decodeStageSandboxResult(
      execution.sandboxResult,
      request,
      stage,
      ordinal,
      execution.providerFileSetDigest,
      execution.providerFileCount,
      packageImport
    );
    const authority = createControlledStaticRootlessStageAuthority({
      stage,
      ordinal,
      requestDigest: request.requestDigest,
      snapshotDigest: request.snapshotDigest,
      projectManifestDigest: request.toolchain.manifestDigest,
      lockDigest: request.toolchain.lockDigest,
      toolchainFileSetDigest: request.toolchain.toolchainFileSetDigest,
      rollupVersion: request.toolchain.rollupVersion,
      rollupImplementation: request.toolchain.rollupImplementation,
      rollupAliasSpec: request.toolchain.rollupAliasSpec,
      esbuildVersion: request.toolchain.esbuildVersion,
      esbuildImplementation: request.toolchain.esbuildImplementation,
      esbuildAliasSpec: request.toolchain.esbuildAliasSpec,
      sourceBaselineDigest,
      providerFileSetDigest: execution.providerFileSetDigest,
      observedInputFileSetDigest: decoded.inputFileSetDigest,
      observedInputFileCount: decoded.inputFileCount,
      packageImportDigest: packageImport?.authorityDigest ?? null,
      resultSetDigest: decoded.resultSetDigest,
      innerAuthorityDigest: decoded.innerAuthorityDigest,
      innerCleanupClaim: decoded.innerCleanupClaim,
      command: decoded.command,
      providerProcess: execution.providerProcess,
      cleanup: execution.cleanup,
    });
    const stageResult = Object.freeze({
      stage,
      ordinal,
      decoded,
      authority,
    });
    completed.push(stageResult);
    if (stage === 'install') {
      packageImport = createControlledStaticRootlessPackageImportAuthority({
        request,
        decoded,
        installStageAuthorityDigest: authority.authorityDigest,
      });
    }
  }
  assertControlledStaticRootlessStageAuthoritySequence(
    completed.map(({ authority }) => authority)
  );
  const aggregateStageAuthority =
    createControlledStaticRootlessAggregateAuthority(
      completed.map(({ authority }) => authority)
    );
  if (!packageImport) {
    throw new TypeError(
      'Controlled rootless package import authority is missing.'
    );
  }
  const stage = (name: ControlledStaticRootlessStage): CompletedStage => {
    const matches = completed.filter(({ stage }) => stage === name);
    if (matches.length !== 1) {
      throw new TypeError(`Controlled rootless ${name} stage is ambiguous.`);
    }
    return matches[0]!;
  };
  const isolationResult = stage('isolation').decoded.isolationResult;
  if (
    !isolationResult ||
    isolationResult.format !==
      'prodivix.controlled-static-isolation-probe.v1' ||
    isolationResult.egressAttemptCount !== 5 ||
    isolationResult.egressSuccessCount !== 0 ||
    isolationResult.rootFilesystemWriteDenied !== true ||
    isolationResult.hostMountAbsent !== true ||
    isolationResult.containerSocketAbsent !== true ||
    isolationResult.inheritedCredentialKeyCount !== 0
  ) {
    throw new TypeError('Controlled rootless isolation evidence drifted.');
  }
  const buildStage = stage('build');
  const testStage = stage('test');
  const buildLogFile = buildStage.decoded.outputFiles.get(
    'results/build-log.txt'
  );
  const testReportFile = testStage.decoded.outputFiles.get(
    'results/test-report.json'
  );
  const coverageFile = testStage.decoded.outputFiles.get(
    'results/coverage-summary.json'
  );
  const buildFiles = [...buildStage.decoded.outputFiles.values()]
    .filter(({ path }) => path.startsWith('results/build/'))
    .map((file) =>
      Object.freeze({
        path: file.path.slice('results/build/'.length),
        size: file.size,
        digest: file.digest,
        encoding: 'base64' as const,
        contents: Buffer.from(file.contents).toString('base64'),
      })
    )
    .sort((left, right) => compareUnicodeCodePoints(left.path, right.path));
  if (!buildLogFile || !testReportFile || !coverageFile || !buildFiles.length) {
    throw new TypeError(
      'Controlled rootless final artifact set is incomplete.'
    );
  }
  const buildFileSetFacts = buildFiles.map(({ path, size, digest }) => ({
    path,
    size,
    digest,
  }));
  const artifactAuthority = Object.freeze({
    testReportDigest: digestBytes(testReportFile.contents),
    coverageSummaryDigest: digestBytes(coverageFile.contents),
    buildLogDigest: digestBytes(buildLogFile.contents),
    buildFileSetDigest: digestBytes(canonicalJsonText(buildFileSetFacts)),
    buildFileCount: buildFiles.length,
  });
  const nodeBinaryDigests = new Set(
    completed.map(({ decoded }) => decoded.nodeBinaryDigest)
  );
  if (nodeBinaryDigests.size !== 1) {
    throw new TypeError(
      'Controlled rootless Node binary changed between stages.'
    );
  }
  const stageAuthorities = Object.freeze(
    completed.map(({ authority }) => authority)
  );
  const providerProcessBase = Object.freeze({
    format: 'prodivix.controlled-static-rootless-provider-stage-authority.v1',
    tool: Object.freeze({
      binary: 'podman',
      version: podmanVersion,
    }),
    providerEnvironment,
    stageOrder: CONTROLLED_STATIC_ROOTLESS_STAGE_ORDER,
    sourceBaselineDigest,
    packageImportAuthority: Object.freeze({
      format: packageImport.format,
      producerStage: packageImport.producerStage,
      requestDigest: packageImport.requestDigest,
      snapshotDigest: packageImport.snapshotDigest,
      projectManifestDigest: packageImport.projectManifestDigest,
      lockDigest: packageImport.lockDigest,
      toolchainFileSetDigest: packageImport.toolchainFileSetDigest,
      rollupVersion: packageImport.rollupVersion,
      rollupImplementation: packageImport.rollupImplementation,
      rollupAliasSpec: packageImport.rollupAliasSpec,
      esbuildVersion: packageImport.esbuildVersion,
      esbuildImplementation: packageImport.esbuildImplementation,
      esbuildAliasSpec: packageImport.esbuildAliasSpec,
      archivePath: packageImport.archivePath,
      archiveDigest: packageImport.archiveDigest,
      archiveByteLength: packageImport.archiveByteLength,
      contentDigest: packageImport.contentDigest,
      manifestDigest: packageImport.manifestDigest,
      fileSetDigest: packageImport.fileSetDigest,
      entryCount: packageImport.entryCount,
      totalFileBytes: packageImport.totalFileBytes,
      maximumDepth: packageImport.maximumDepth,
      installStageAuthorityDigest: packageImport.installStageAuthorityDigest,
      authorityDigest: packageImport.authorityDigest,
    }),
    aggregateStageAuthority,
    stages: stageAuthorities,
  });
  const providerProcess = Object.freeze({
    ...providerProcessBase,
    authorityDigest: digestBytes(canonicalJsonText(providerProcessBase)),
  });
  const cleanupStages = Object.freeze(
    completed.map(({ authority }) => authority.cleanup)
  );
  const processTreeBase = Object.freeze({
    format: 'prodivix.controlled-static-rootless-process-cleanup-authority.v1',
    provider: 'linux-rootless-podman',
    stageOrder: CONTROLLED_STATIC_ROOTLESS_STAGE_ORDER,
    directCommandCount: completed.length,
    activeContainerCount: 0,
    activeProcessCount: 0,
    activeWorkspaceCount: 0,
    killOnContainerExit: true,
    stages: cleanupStages,
    cleanupVerified: true,
  });
  const processTree = Object.freeze({
    ...processTreeBase,
    authorityDigest: digestBytes(canonicalJsonText(processTreeBase)),
  });
  const aggregateProviderFileSetDigest = digestBytes(
    canonicalJsonText(
      completed.map(({ stage, authority }) => ({
        stage,
        digest: authority.providerFileSetDigest,
      }))
    )
  );
  const toolchain = Object.freeze({
    pnpmVersion: request.toolchain.pnpmVersion,
    nodeVersion: CONTROLLED_NODE_VERSION,
    nodeBinaryDigest: [...nodeBinaryDigests][0]!,
    typescriptVersion: request.toolchain.typescriptVersion,
    vitestVersion: request.toolchain.vitestVersion,
    viteVersion: request.toolchain.viteVersion,
    manifestDigest: request.toolchain.manifestDigest,
    lockDigest: request.toolchain.lockDigest,
    toolchainFileSetDigest: request.toolchain.toolchainFileSetDigest,
    rollupVersion: request.toolchain.rollupVersion,
    rollupImplementation: request.toolchain.rollupImplementation,
    rollupAliasSpec: request.toolchain.rollupAliasSpec,
    esbuildVersion: request.toolchain.esbuildVersion,
    esbuildImplementation: request.toolchain.esbuildImplementation,
    esbuildAliasSpec: request.toolchain.esbuildAliasSpec,
  });
  const resultBase = Object.freeze({
    format: RESULT_FORMAT,
    provider: 'linux-rootless-podman',
    requestDigest: request.requestDigest,
    snapshotDigest: request.snapshotDigest,
    environment: Object.freeze({
      install: aggregateEnvironment(completed, 'install'),
      execution: aggregateEnvironment(completed, 'execution'),
    }),
    commands: Object.freeze(completed.map(({ decoded }) => decoded.command)),
    isolation: Object.freeze({
      provider: 'linux-rootless-podman',
      imageDigest,
      rootFilesystem: 'read-only',
      network: 'none',
      hostMountCount: 0,
      writableMounts: Object.freeze([
        Object.freeze({
          path: 'workspace:/',
          kind: 'tmpfs',
          maximumBytes: 1024 * 1024 * 1024,
        }),
        Object.freeze({
          path: 'tmp:/',
          kind: 'tmpfs',
          maximumBytes: 1024 * 1024 * 1024,
        }),
      ]),
      cgroup: Object.freeze({
        maximumCpuCores: 2,
        maximumMemoryBytes: 2_048 * 1024 * 1024,
        maximumPids: 256,
        maximumOpenFiles: 4_096,
      }),
      containerEnvironmentKeys: Object.freeze(['HOME', 'PATH']),
      providerFileSetDigest: aggregateProviderFileSetDigest,
      probe: isolationResult,
      providerProcess,
    }),
    processTree,
    toolchain,
    artifactAuthority,
    artifacts: Object.freeze({
      testReport: Object.freeze({
        encoding: 'base64',
        contents: Buffer.from(testReportFile.contents).toString('base64'),
      }),
      coverageSummary: Object.freeze({
        encoding: 'base64',
        contents: Buffer.from(coverageFile.contents).toString('base64'),
      }),
      buildLog: Object.freeze({
        encoding: 'base64',
        contents: Buffer.from(buildLogFile.contents).toString('base64'),
      }),
      buildFiles: Object.freeze(buildFiles),
    }),
  });
  return canonicalJsonText({
    ...resultBase,
    resultDigest: digestBytes(canonicalJsonText(resultBase)),
  });
};

try {
  process.stdout.write(await run());
} catch {
  process.stderr.write(
    'Controlled static rootless sandbox execution failed.\n'
  );
  process.exitCode = 1;
}
