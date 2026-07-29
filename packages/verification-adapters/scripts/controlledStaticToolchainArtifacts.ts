import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  EXECUTION_BUILD_BUNDLE_FORMAT,
  type ExecutableProjectSnapshot,
  type ExecutionBuildBundle,
} from '@prodivix/runtime-core';
import { parseVitestExecutionTestReport } from '@prodivix/runtime-vitest';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { projectVerificationBuildSummary } from '../src/buildLogProjection';
import { projectVerificationCoverageSummary } from '../src/coverageSummaryProjection';
import {
  containsPrivateAbsolutePathOrUrl,
  createVerificationArtifactProjectionSourceResolver,
} from '../src/verificationArtifactProjectionSource';
import {
  resolveControlledOutputPath,
  type ControlledStaticToolchainExecution,
} from './controlledStaticToolchainProcess';
import {
  CONTROLLED_STATIC_TOOLCHAIN_PROJECTION_AUTHORITY_FORMAT,
  CONTROLLED_STATIC_TOOLCHAIN_PROJECTION_RECEIPT_FORMAT,
  CONTROLLED_STATIC_TOOLCHAIN_RESULT_FORMAT,
  type ControlledStaticToolchainProjectionAuthority,
  type ControlledStaticToolchainRawEnvelope,
  type ControlledStaticToolchainResult,
} from './controlledStaticToolchainProtocol';

type BuildBundleWire = Readonly<{
  format: typeof EXECUTION_BUILD_BUNDLE_FORMAT;
  snapshotDigest: string;
  target: ExecutionBuildBundle['target'];
  files: readonly Readonly<{
    path: string;
    size: number;
    digest: string;
    encoding: 'base64';
    contents: string;
  }>[];
}>;

type ResultWire = Readonly<{
  format: typeof CONTROLLED_STATIC_TOOLCHAIN_RESULT_FORMAT;
  buildBundle: BuildBundleWire;
  buildSummary: Readonly<{ encoding: 'base64'; contents: string }>;
  coverageSummary: Readonly<{ encoding: 'base64'; contents: string }>;
  testReport: ControlledStaticToolchainResult['testReport'];
  authorityReceipt: ControlledStaticToolchainResult['authorityReceipt'];
  projectionAuthority: ControlledStaticToolchainProjectionAuthority;
}>;

const fileDigest = (contents: Uint8Array): string =>
  `sha256-${createHash('sha256').update(contents).digest('hex')}`;

const base64 = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('base64');

const rawEnvelope = (bytes: Uint8Array): ControlledStaticToolchainRawEnvelope =>
  Object.freeze({
    encoding: 'base64',
    byteLength: bytes.byteLength,
    digest: fileDigest(bytes),
    contents: base64(bytes),
  });

const buildBundleWire = (bundle: ExecutionBuildBundle): BuildBundleWire =>
  Object.freeze({
    format: bundle.format,
    snapshotDigest: bundle.snapshotDigest,
    target: bundle.target,
    files: bundle.files.map((file) =>
      Object.freeze({
        path: file.path,
        size: file.size,
        digest: file.digest,
        encoding: 'base64' as const,
        contents: base64(file.contents),
      })
    ),
  });

const collectBuildFiles = async (
  outputRoot: string,
  relativeRoot = ''
): Promise<ExecutionBuildBundle['files']> => {
  const entries = await readdir(resolve(outputRoot, relativeRoot), {
    withFileTypes: true,
  });
  const files = (
    await Promise.all(
      entries
        .sort((left, right) => compareUnicodeCodePoints(left.name, right.name))
        .map(async (entry) => {
          const path = relativeRoot
            ? `${relativeRoot}/${entry.name}`
            : entry.name;
          if (entry.isDirectory()) return collectBuildFiles(outputRoot, path);
          if (!entry.isFile()) return Object.freeze([]);
          const contents = new Uint8Array(
            await readFile(resolve(outputRoot, path))
          );
          return Object.freeze([
            Object.freeze({
              path,
              size: contents.byteLength,
              digest: fileDigest(contents),
              contents,
            }),
          ]);
        })
    )
  ).flat();
  return Object.freeze(
    [...files].sort((left, right) =>
      compareUnicodeCodePoints(left.path, right.path)
    )
  );
};

export const projectControlledStaticToolchainResult = async (
  snapshot: ExecutableProjectSnapshot,
  execution: ControlledStaticToolchainExecution
): Promise<ControlledStaticToolchainResult> => {
  const fallback = Object.freeze([
    Object.freeze({
      sourceRef: Object.freeze({
        kind: 'workspace' as const,
        workspaceId: snapshot.workspace.workspaceId,
      }),
      label: 'Controlled static toolchain source',
    }),
  ]);
  const sources = execution.runtimeFiles.map((file) => ({
    path: file.path,
    sourceTrace: file.sourceTrace?.length
      ? file.sourceTrace.slice(0, 16).map((trace) =>
          Object.freeze({
            sourceRef: trace.sourceRef,
            ...(trace.sourceSpan ? { sourceSpan: trace.sourceSpan } : {}),
            ...(trace.label && !containsPrivateAbsolutePathOrUrl(trace.label)
              ? { label: trace.label }
              : {}),
          })
        )
      : fallback,
  }));
  const sourceResolver = createVerificationArtifactProjectionSourceResolver(
    execution.testProviderRoot,
    sources
  );
  const rawTestReport = new Uint8Array(
    await readFile(
      resolveControlledOutputPath(
        execution.root,
        snapshot.testPlan.reportFilePath
      )
    )
  );
  const rawCoverageSummary = new Uint8Array(
    await readFile(
      resolveControlledOutputPath(
        execution.root,
        '.prodivix/coverage/coverage-summary.json'
      )
    )
  );
  const rawBuildLog = new TextEncoder().encode(execution.buildLog);
  const testReport = parseVitestExecutionTestReport({
    source: rawTestReport,
    reportId: `report:controlled:${snapshot.target.presetId}`,
    completedAt: Date.now(),
    exitCode: execution.testExitCode,
    toolVersion: execution.vitestVersion,
    resolveFileIdentity: (reportedPath) => sourceResolver.resolve(reportedPath),
  });
  const coverageSummary = projectVerificationCoverageSummary({
    source: rawCoverageSummary,
    subjectDigest: snapshot.contentDigest,
    sourceResolver,
  }).bytes;
  const buildSummary = projectVerificationBuildSummary({
    source: execution.buildLog,
    providerRoot: execution.buildProviderRoot,
    subjectDigest: snapshot.contentDigest,
    sourceTrace: sources[0]!.sourceTrace,
  }).bytes;
  const buildBundle: ExecutionBuildBundle = Object.freeze({
    format: EXECUTION_BUILD_BUNDLE_FORMAT,
    snapshotDigest: snapshot.contentDigest,
    target: snapshot.target,
    files: await collectBuildFiles(
      resolveControlledOutputPath(
        execution.root,
        snapshot.buildPlan.outputDirectoryPath
      )
    ),
  });
  const rawBuildBundle = new TextEncoder().encode(
    canonicalJsonText(buildBundleWire(buildBundle))
  );
  const buildFileSetDigest = fileDigest(
    new TextEncoder().encode(
      canonicalJsonText(
        buildBundle.files.map(({ path, size, digest }) => ({
          digest,
          path,
          size,
        }))
      )
    )
  );
  const artifactAuthority = execution.authorityReceipt.artifacts;
  if (
    fileDigest(rawTestReport) !== artifactAuthority.testReportDigest ||
    fileDigest(rawCoverageSummary) !==
      artifactAuthority.coverageSummaryDigest ||
    fileDigest(rawBuildLog) !== artifactAuthority.buildLogDigest ||
    buildFileSetDigest !== artifactAuthority.buildFileSetDigest ||
    buildBundle.files.length !== artifactAuthority.buildFileCount
  ) {
    throw new TypeError(
      'Controlled static raw projection inputs drifted from their sandbox authority.'
    );
  }
  const projectionReceiptBase = Object.freeze({
    format: CONTROLLED_STATIC_TOOLCHAIN_PROJECTION_RECEIPT_FORMAT,
    snapshotDigest: snapshot.contentDigest,
    target: snapshot.target,
    toolchainAuthorityReceiptDigest: execution.authorityReceipt.receiptDigest,
    rawBuildBundleDigest: fileDigest(rawBuildBundle),
    rawTestReportDigest: fileDigest(rawTestReport),
    rawCoverageSummaryDigest: fileDigest(rawCoverageSummary),
    rawBuildLogDigest: fileDigest(rawBuildLog),
    projectedBuildBundleDigest: fileDigest(rawBuildBundle),
    projectedBuildSummaryDigest: fileDigest(buildSummary),
    projectedCoverageSummaryDigest: fileDigest(coverageSummary),
    projectedTestReportDigest: fileDigest(
      new TextEncoder().encode(canonicalJsonText(testReport))
    ),
    buildFileSetDigest,
    buildFileCount: buildBundle.files.length,
  });
  const projectionAuthority: ControlledStaticToolchainProjectionAuthority =
    Object.freeze({
      format: CONTROLLED_STATIC_TOOLCHAIN_PROJECTION_AUTHORITY_FORMAT,
      raw: Object.freeze({
        buildBundle: rawEnvelope(rawBuildBundle),
        testReport: rawEnvelope(rawTestReport),
        coverageSummary: rawEnvelope(rawCoverageSummary),
        buildLog: rawEnvelope(rawBuildLog),
      }),
      receipt: Object.freeze({
        ...projectionReceiptBase,
        receiptDigest: fileDigest(
          new TextEncoder().encode(canonicalJsonText(projectionReceiptBase))
        ),
      }),
    });
  return Object.freeze({
    format: CONTROLLED_STATIC_TOOLCHAIN_RESULT_FORMAT,
    buildBundle,
    buildSummary,
    coverageSummary,
    testReport,
    authorityReceipt: execution.authorityReceipt,
    projectionAuthority,
  });
};

export const encodeControlledStaticToolchainResult = (
  result: ControlledStaticToolchainResult
): string => {
  const wire: ResultWire = Object.freeze({
    format: CONTROLLED_STATIC_TOOLCHAIN_RESULT_FORMAT,
    buildBundle: buildBundleWire(result.buildBundle),
    buildSummary: Object.freeze({
      encoding: 'base64',
      contents: base64(result.buildSummary),
    }),
    coverageSummary: Object.freeze({
      encoding: 'base64',
      contents: base64(result.coverageSummary),
    }),
    testReport: result.testReport,
    authorityReceipt: result.authorityReceipt,
    projectionAuthority: result.projectionAuthority,
  });
  return canonicalJsonText(wire);
};
